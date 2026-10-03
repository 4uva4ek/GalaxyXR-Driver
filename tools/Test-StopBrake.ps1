param([switch]$UseCurrentEnvironment)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $UseCurrentEnvironment) { . (Join-Path $PSScriptRoot 'Enter-PortableBuildEnvironment.ps1') }
$build = Join-Path $repo 'build/stop-brake-test'
New-Item -ItemType Directory -Force -Path $build | Out-Null
$exe = Join-Path $build 'StopBrakeTest.exe'
# Header-only math of the Kalman CA stop brake; never loads SteamVR.
& cl.exe /nologo /std:c++17 /EHsc /O2 /MT (Join-Path $repo 'GalaxyXRDriver/tests/StopBrakeTest.cpp') "/Fo$build/StopBrakeTest.obj" "/Fe$exe"
if ($LASTEXITCODE -ne 0) { throw 'Stop brake test compilation failed.' }
& $exe
if ($LASTEXITCODE -ne 0) { throw 'Stop brake test failed.' }
