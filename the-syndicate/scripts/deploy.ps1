<#
.SYNOPSIS
  Deploys THE SYNDICATE to Cloudflare. Manual only; never run by CI.

.DESCRIPTION
  - Ships a commit that is already on origin/main, built from `git archive` of that
    commit (never the working tree, so local edits and untracked files cannot leak in).
  - Requires typing `deploy <short-sha>` to confirm.
  - Requires an explicit monthly budget acknowledgement; the script cannot cap
    Cloudflare billing, so the operator states the budget they accept (see
    docs/OPERATIONS.md for the cost model).
  - Records the deployed commit: the Worker gets REVISION=<full sha>, visible at
    /api/health, and the Cloudflare version message names the commit.
  - Rollback = run this script again with an older SHA from origin/main.

.EXAMPLE
  pwsh -NoProfile -File the-syndicate/scripts/deploy.ps1 -Sha 1a2b3c4 -Environment staging -AcceptedMonthlyBudgetUsd 5
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Sha,
    [Parameter(Mandatory = $true)][ValidateSet('staging', 'production')][string]$Environment,
    [Parameter(Mandatory = $true)][ValidateRange(0, 1000)][int]$AcceptedMonthlyBudgetUsd,
    # Only for automated tests of the bundling step.
    [switch]$BundleOnly,
    [string]$BundleDestination
)
$ErrorActionPreference = 'Stop'

function Get-RepositoryRoot {
    $root = (git rev-parse --show-toplevel).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Not inside a git repository' }
    return $root
}

<#
  Writes the exact tree of $Commit into $Destination. `git archive` must run from the
  repository root: run inside a subdirectory with a `<sha>:<subdir>` path it silently
  produces an empty archive.
#>
function New-DeployBundle {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$Commit,
        [Parameter(Mandatory = $true)][string]$Destination
    )
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    # zip + Expand-Archive behave the same on Windows and Linux (GNU tar treats C: as a host).
    $zip = Join-Path ([IO.Path]::GetTempPath()) ("syndicate-bundle-" + [guid]::NewGuid() + '.zip')
    try {
        Push-Location $RepositoryRoot
        try {
            git archive --format=zip --output=$zip $Commit 'the-syndicate'
            if ($LASTEXITCODE -ne 0) { throw "git archive failed for $Commit" }
        }
        finally { Pop-Location }
        Expand-Archive -LiteralPath $zip -DestinationPath $Destination -Force
        if (-not (Test-Path (Join-Path $Destination 'the-syndicate/package.json'))) {
            throw 'Bundle is empty: the-syndicate/package.json missing'
        }
    }
    finally { Remove-Item -LiteralPath $zip -ErrorAction SilentlyContinue }
}

$root = Get-RepositoryRoot
$full = (git -C $root rev-parse --verify "$Sha^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { throw "Unknown commit $Sha" }

if ($BundleOnly) {
    if (-not $BundleDestination) { throw '-BundleOnly needs -BundleDestination' }
    New-DeployBundle -RepositoryRoot $root -Commit $full -Destination $BundleDestination
    return
}

git -C $root fetch --quiet origin main
if ($LASTEXITCODE -ne 0) { throw 'Could not fetch origin/main' }
git -C $root merge-base --is-ancestor $full origin/main
if ($LASTEXITCODE -ne 0) { throw "$full is not on origin/main. Deploys ship merged commits only." }

$short = $full.Substring(0, 7)
$subject = (git -C $root log -1 --format=%s $full).Trim()
Write-Host "Deploying $short ($subject) to $Environment."
Write-Host "Accepted monthly budget: `$$AcceptedMonthlyBudgetUsd. Cloudflare bills by plan and usage; this script does not cap it."
$answer = Read-Host "Type 'deploy $short' to continue"
if ($answer -ne "deploy $short") { throw 'Confirmation did not match; nothing deployed.' }

$work = Join-Path ([IO.Path]::GetTempPath()) ("syndicate-deploy-" + $short + '-' + [guid]::NewGuid())
try {
    New-DeployBundle -RepositoryRoot $root -Commit $full -Destination $work
    $game = Join-Path $work 'the-syndicate'
    Push-Location $game
    try {
        pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
        pnpm --filter '@syndicate/web' build
        if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
        $envArgs = if ($Environment -eq 'staging') { @('--env', 'staging') } else { @() }
        Push-Location 'apps/worker'
        try {
            pnpm exec wrangler deploy @envArgs --var "REVISION:$full" --message "deploy $full"
            if ($LASTEXITCODE -ne 0) { throw 'wrangler deploy failed' }
        }
        finally { Pop-Location }
    }
    finally { Pop-Location }
    Write-Host "Deployed $full to $Environment. Verify: GET /api/health shows revision $full."
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
