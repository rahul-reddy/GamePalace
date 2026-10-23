<#
  Loads selected keys from a .env file into the process environment without ever
  printing values. Only the keys asked for are read; lines may be KEY=VALUE,
  KEY="VALUE" or KEY='VALUE'; blank lines and # comments are ignored. Existing
  environment variables win, so an operator can override the file.
  Returns the names of the keys that are now set (never their values).
#>
function Import-DotEnvKeys {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string[]]$Keys
    )
    $loaded = @()
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in Get-Content -LiteralPath $Path) {
            $trimmed = $line.Trim()
            if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
            $match = [regex]::Match($trimmed, '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$')
            if (-not $match.Success) { continue }
            $key = $match.Groups[1].Value
            if ($Keys -notcontains $key) { continue }
            $value = $match.Groups[2].Value.Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            if (-not [Environment]::GetEnvironmentVariable($key) -and $value) {
                [Environment]::SetEnvironmentVariable($key, $value)
            }
        }
    }
    foreach ($key in $Keys) {
        if ([Environment]::GetEnvironmentVariable($key)) { $loaded += $key }
    }
    return $loaded
}
