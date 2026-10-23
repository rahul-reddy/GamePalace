# Proves the deploy bundle is exactly the committed tree: builds it in a throwaway
# repository that has local edits and untracked files, and compares file by file.
$ErrorActionPreference = 'Stop'
$deploy = Join-Path $PSScriptRoot 'deploy.ps1'
$repo = Join-Path ([IO.Path]::GetTempPath()) ("deploy-selftest-" + [guid]::NewGuid())
$out = Join-Path ([IO.Path]::GetTempPath()) ("deploy-selftest-out-" + [guid]::NewGuid())
try {
    New-Item -ItemType Directory -Path "$repo/the-syndicate/apps" -Force | Out-Null
    Push-Location $repo
    try {
        git init --quiet
        git config user.email 'selftest@example.invalid'
        git config user.name 'selftest'
        Set-Content -Path 'the-syndicate/package.json' -Value '{"name":"committed"}' -NoNewline
        Set-Content -Path 'the-syndicate/apps/a.txt' -Value 'committed' -NoNewline
        Set-Content -Path 'outside.txt' -Value 'not part of the game' -NoNewline
        git add -A
        git commit --quiet -m 'base'
        $sha = (git rev-parse HEAD).Trim()
        # Local edits and untracked files that must NOT reach the bundle.
        Set-Content -Path 'the-syndicate/apps/a.txt' -Value 'EDITED' -NoNewline
        Set-Content -Path 'the-syndicate/apps/secret.env' -Value 'TOKEN=leak' -NoNewline
        # Run from a subdirectory on purpose: bundling must still use the repository root.
        Push-Location 'the-syndicate/apps'
        try {
            & pwsh -NoProfile -File $deploy -Sha $sha -Environment staging -AcceptedMonthlyBudgetUsd 0 -BundleOnly -BundleDestination $out
            if ($LASTEXITCODE -ne 0) { throw 'bundle step failed' }
        }
        finally { Pop-Location }
    }
    finally { Pop-Location }
    $files = Get-ChildItem -Recurse -File $out | ForEach-Object { $_.FullName.Substring($out.Length + 1).Replace('\', '/') } | Sort-Object
    $expected = @('the-syndicate/apps/a.txt', 'the-syndicate/package.json')
    if (($files -join ',') -ne ($expected -join ',')) { throw "Bundle files: $($files -join ', ')" }
    $content = Get-Content -Raw "$out/the-syndicate/apps/a.txt"
    if ($content -ne 'committed') { throw "Bundle carried a local edit: '$content'" }
    Write-Host 'Deploy bundle self-test passed.'
}
finally {
    Remove-Item -LiteralPath $repo -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $out -Recurse -Force -ErrorAction SilentlyContinue
}
