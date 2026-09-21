param(
    [string]$ExpectedVersion,
    [string]$Tag,
    [switch]$PassThru
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent

function Read-Text([string]$RelativePath) {
    return [IO.File]::ReadAllText((Join-Path $repo $RelativePath))
}

function Require-Match([string]$Label, [string]$Actual, [string]$Expected) {
    if ($Actual -ne $Expected) {
        throw "$Label version mismatch: expected '$Expected', found '$Actual'."
    }
    Write-Host "[version] $Label = $Actual"
}

$configText = Read-Text 'CustomHeadsetOpenVR/src/Config/Config.cpp'
$configMatch = [regex]::Match($configText, 'std::string\s+driverVersion\s*=\s*"(?<v>[^\"]+)"')
if (-not $configMatch.Success) { throw 'Could not read driverVersion from CustomHeadsetOpenVR/src/Config/Config.cpp.' }
$version = $configMatch.Groups['v'].Value

if ($ExpectedVersion) { Require-Match 'Requested release' $version $ExpectedVersion }
if ($Tag) {
    $expectedTag = "v$version"
    if ($Tag -ne $expectedTag) { throw "Git tag '$Tag' does not match project version '$version' (expected '$expectedTag')." }
    Write-Host "[version] tag = $Tag"
}

$manifest = Read-Text 'CustomHeadsetOpenVR/DriverFiles/driver.vrdrivermanifest' | ConvertFrom-Json
Require-Match 'OpenVR manifest' ([string]$manifest.version) $version

$package = Read-Text 'CustomHeadsetGUI/package.json' | ConvertFrom-Json
Require-Match 'npm package' ([string]$package.version) $version

$packageLock = Read-Text 'CustomHeadsetGUI/package-lock.json' | ConvertFrom-Json
Require-Match 'npm lockfile root' ([string]$packageLock.version) $version
$lockRootPackage = $packageLock.packages.PSObject.Properties[''].Value
if ($null -eq $lockRootPackage) { throw 'Could not read the root package entry from package-lock.json.' }
Require-Match 'npm lockfile package' ([string]$lockRootPackage.version) $version

$tauri = Read-Text 'CustomHeadsetGUI/src-tauri/tauri.conf.json' | ConvertFrom-Json
Require-Match 'Tauri configuration' ([string]$tauri.version) $version

$cargoToml = Read-Text 'CustomHeadsetGUI/src-tauri/Cargo.toml'
$cargoTomlMatch = [regex]::Match($cargoToml, '(?ms)^\[package\].*?^version\s*=\s*"(?<v>[^\"]+)"')
if (-not $cargoTomlMatch.Success) { throw 'Could not read package version from Cargo.toml.' }
Require-Match 'Cargo.toml' $cargoTomlMatch.Groups['v'].Value $version

$cargoLock = Read-Text 'CustomHeadsetGUI/src-tauri/Cargo.lock'
$cargoLockMatch = [regex]::Match($cargoLock, '(?ms)^\[\[package\]\]\s*\r?\nname\s*=\s*"custom-headset-gui"\s*\r?\nversion\s*=\s*"(?<v>[^\"]+)"')
if (-not $cargoLockMatch.Success) { throw 'Could not read custom-headset-gui version from Cargo.lock.' }
Require-Match 'Cargo.lock' $cargoLockMatch.Groups['v'].Value $version

Write-Host "[version] all release version sources agree on $version"
if ($PassThru) { Write-Output $version }
