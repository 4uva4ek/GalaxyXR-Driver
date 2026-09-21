[CmdletBinding()]
param(
    [string]$ProjectRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($ProjectRoot)

foreach ($required in @('build.js', 'CustomHeadsetGUI', 'CustomHeadsetOpenVR')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $required))) {
        throw "This cleanup must run from the complete Galaxy XR project root. Missing: $required"
    }
}

# Construct the retired identifiers rather than carrying them as permanent
# source/catalog strings. This script is an apply-once migration helper.
$legacyHeadsetA = 'Mega' + 'neX'
$legacyVendorB = 'Pi' + 'max'
$legacyHeadsetC = 'Dream' + 'Air'

$legacyPaths = @(
    ('CustomHeadsetGUI/public/' + $legacyHeadsetC + 'HD.png'),
    ('CustomHeadsetGUI/src/app/pages/devices/' + ($legacyHeadsetC -replace '([a-z])([A-Z])','$1-$2').ToLowerInvariant()),
    ('CustomHeadsetGUI/src/app/pages/devices/' + ($legacyHeadsetA + '-x8-k').ToLowerInvariant()),
    ('CustomHeadsetGUI/src/app/pages/devices/' + ($legacyVendorB + '-launcher').ToLowerInvariant()),
    ('CustomHeadsetGUI/src/app/services/' + ($legacyVendorB + '-launcher.service.ts').ToLowerInvariant()),
    ('CustomHeadsetOpenVR/DriverFiles/resources/icons/' + $legacyHeadsetC.ToLowerInvariant()),
    ('CustomHeadsetOpenVR/DriverFiles/resources/icons/' + ($legacyHeadsetA + '8k').ToLowerInvariant()),
    ('CustomHeadsetOpenVR/src/Headsets/' + $legacyHeadsetC + '.cpp'),
    ('CustomHeadsetOpenVR/src/Headsets/' + $legacyHeadsetC + '.h'),
    ('CustomHeadsetOpenVR/src/Headsets/' + $legacyHeadsetA + '8K.cpp'),
    ('CustomHeadsetOpenVR/src/Headsets/' + $legacyHeadsetA + '8K.h'),
    ('CustomHeadsetOpenVR/src/Helpers/' + $legacyVendorB + 'EyeTrackingBridge.cpp'),
    ('CustomHeadsetOpenVR/src/Helpers/' + $legacyVendorB + 'EyeTrackingBridge.h')
)

$removed = 0
foreach ($relative in $legacyPaths) {
    $path = Join-Path $root $relative
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Recurse -Force
        Write-Output "Removed retired source/resource: $relative"
        $removed++
    }
}

# Clean stale generated frontend copies of the retired public artwork. Fresh
# builds no longer emit it, but old dist trees can otherwise make it look as if
# the source cleanup did not take effect.
$dist = Join-Path $root 'CustomHeadsetGUI/dist'
if (Test-Path -LiteralPath $dist -PathType Container) {
    $retiredAsset = $legacyHeadsetC + 'HD.png'
    Get-ChildItem -LiteralPath $dist -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object Name -eq $retiredAsset |
        ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
            Write-Output "Removed stale generated asset: $($_.FullName.Substring($root.Length).TrimStart([char[]]'\/'))"
            $removed++
        }
}

# Source files in this update are already scrubbed. Verify the merged checkout
# has no leftover retired implementation names in the source/resources that can
# participate in a build. Generated output, dependencies and VCS data are not
# scanned here.
$scanRoots = @(
    'CustomHeadsetGUI/src',
    'CustomHeadsetGUI/src-lit',
    'CustomHeadsetGUI/public',
    'CustomHeadsetGUI/scripts',
    'CustomHeadsetGUI/src-tauri',
    'CustomHeadsetOpenVR/src',
    'CustomHeadsetOpenVR/DriverFiles'
) | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path -LiteralPath $_ }

$textExtensions = @('.c','.cc','.cpp','.cxx','.h','.hpp','.ts','.js','.mjs','.cjs','.html','.scss','.css','.json','.xlf','.xml','.md','.txt','.rs','.toml')
$patterns = @($legacyHeadsetA, $legacyVendorB, $legacyHeadsetC, ($legacyHeadsetC -replace '([a-z])([A-Z])','$1 $2'))
$leftovers = @()
foreach ($scanRoot in $scanRoots) {
    Get-ChildItem -LiteralPath $scanRoot -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $textExtensions -contains $_.Extension.ToLowerInvariant() } |
        ForEach-Object {
            $file = $_
            foreach ($pattern in $patterns) {
                if (Select-String -LiteralPath $file.FullName -SimpleMatch -Pattern $pattern -Quiet -ErrorAction SilentlyContinue) {
                    $leftovers += $file.FullName
                    break
                }
            }
        }
}
$leftovers = @($leftovers | Sort-Object -Unique)
if ($leftovers.Count -gt 0) {
    Write-Error ("Retired implementation references remain after cleanup:`n" + ($leftovers -join "`n"))
    exit 1
}

Write-Output "Source cleanup complete. Removed $removed existing retired file(s)/folder(s)."
Write-Output 'No retired implementation references remain in active source/resources.'

# This is an apply-once migration helper; remove it after a successful run so
# the resulting project contains only the permanent source/build tooling.
if ($PSCommandPath -and (Test-Path -LiteralPath $PSCommandPath)) {
    Remove-Item -LiteralPath $PSCommandPath -Force
}
