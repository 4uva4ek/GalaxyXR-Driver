param([switch]$UseCurrentEnvironment)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $UseCurrentEnvironment) { . (Join-Path $PSScriptRoot 'Enter-PortableBuildEnvironment.ps1') }
$build = Join-Path $repo 'build/native-controller-policy-test'
New-Item -ItemType Directory -Force -Path $build | Out-Null
$exe = Join-Path $build 'NativeControllerPolicyTest.exe'
# Runtime preset of the native controller mode (header-only config types); never loads SteamVR.
& cl.exe /nologo /std:c++17 /EHsc /O2 /MT (Join-Path $repo 'GalaxyXRDriver/tests/NativeControllerPolicyTest.cpp') "/Fo$build/NativeControllerPolicyTest.obj" "/Fe$exe"
if ($LASTEXITCODE -ne 0) { throw 'Native controller policy test compilation failed.' }
& $exe
if ($LASTEXITCODE -ne 0) { throw 'Native controller policy test failed.' }
