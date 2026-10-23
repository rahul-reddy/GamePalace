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

    # .env loading: only requested keys, quotes stripped, existing environment wins.
    . "$PSScriptRoot/lib/dotenv.ps1"
    $envFile = Join-Path $out 'test.env'
    Set-Content -Path $envFile -Value @('# comment', 'SELFTEST_A="alpha"', "SELFTEST_B='beta'", 'SELFTEST_C=gamma', 'SELFTEST_IGNORED=x', 'not a pair')
    $env:SELFTEST_C = 'preset'
    try {
        $loaded = Import-DotEnvKeys -Path $envFile -Keys @('SELFTEST_A', 'SELFTEST_B', 'SELFTEST_C', 'SELFTEST_MISSING')
        if (($loaded -join ',') -ne 'SELFTEST_A,SELFTEST_B,SELFTEST_C') { throw "loaded keys: $($loaded -join ',')" }
        if ($env:SELFTEST_A -ne 'alpha' -or $env:SELFTEST_B -ne 'beta') { throw 'quotes not stripped' }
        if ($env:SELFTEST_C -ne 'preset') { throw 'environment did not win over .env' }
        if ($env:SELFTEST_IGNORED) { throw 'unrequested key was loaded' }
    }
    finally {
        foreach ($k in 'SELFTEST_A', 'SELFTEST_B', 'SELFTEST_C') { [Environment]::SetEnvironmentVariable($k, $null) }
    }
    Write-Host '.env loader self-test passed.'
}
finally {
    Remove-Item -LiteralPath $repo -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $out -Recurse -Force -ErrorAction SilentlyContinue
}
