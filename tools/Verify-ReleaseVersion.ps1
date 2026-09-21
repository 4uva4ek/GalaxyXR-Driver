#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ExpectedVersion,
    [string]$Tag,
    [switch]$PassThru
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$verifier = Join-Path $PSScriptRoot 'verify-release-version.cjs'
if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) {
    throw "Missing release verifier: $verifier. Copy both version-checker files from the update."
}
$node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $node) {
    throw 'Node.js is required for release validation. Run actions/setup-node before this step, or install the Node.js version used by the project.'
}

# Node parses the real npm lockfile, including its valid packages[""] key.
# Do not deserialize package-lock.json as PSCustomObject or edit away that key.
# Only the helper's fixed-key result envelope is parsed by PowerShell, so the
# same entry point works with Windows PowerShell 5.1 and GitHub's PowerShell 7.
$arguments = @($verifier, '--repo', $repo, '--json')
if ($ExpectedVersion) { $arguments += @('--expected-version', $ExpectedVersion) }
if ($Tag) { $arguments += @('--tag', $Tag) }
$nodePath = $node.Source
$lines = & $nodePath @arguments
$exitCode = $LASTEXITCODE
if (-not $lines) { throw "Release verifier returned no result (exit code $exitCode)." }
try {
    $result = ($lines -join "`n") | ConvertFrom-Json -ErrorAction Stop
} catch {
    throw "Release verifier returned an invalid result (exit code $exitCode): $($_.Exception.Message)"
}
if ($exitCode -ne 0 -or $result.ok -ne $true) {
    if ($result.error) { throw ([string]$result.error) }
    throw "Release version validation failed (exit code $exitCode)."
}
foreach ($message in $result.messages) { Write-Host $message }
# Keep the original workflow contract: -PassThru emits one version string,
# never diagnostic text, into GITHUB_OUTPUT / GITHUB_ENV.
if ($PassThru) { Write-Output ([string]$result.version) }
