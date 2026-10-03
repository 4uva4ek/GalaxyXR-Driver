param([switch]$UseCurrentEnvironment)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $UseCurrentEnvironment) { . (Join-Path $PSScriptRoot 'Enter-PortableBuildEnvironment.ps1') }
$build = Join-Path $repo 'build/ca-kalman-test'
New-Item -ItemType Directory -Force -Path $build | Out-Null
$exe = Join-Path $build 'CaKalmanTest.exe'
# Offline CA filter + adaptive jerk replay; header-only, never loads SteamVR.
& cl.exe /nologo /std:c++17 /EHsc /O2 /MT (Join-Path $repo 'GalaxyXRDriver/tests/CaKalmanTest.cpp') "/Fo$build/CaKalmanTest.obj" "/Fe$exe"
if ($LASTEXITCODE -ne 0) { throw 'CA Kalman regression compilation failed.' }
& $exe
if ($LASTEXITCODE -ne 0) { throw 'CA Kalman regression failed.' }
