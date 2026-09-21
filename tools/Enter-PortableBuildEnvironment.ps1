# Dot-source to configure only the current process. Does not install or deploy.
$portableRepo = Split-Path $PSScriptRoot -Parent
$portableToolRoot = Join-Path $portableRepo 'build/toolchains'
$portableMsvc = Join-Path $portableToolRoot 'msvc'
$portableVc = Join-Path $portableMsvc 'VC/Tools/MSVC/14.44.35207'
$portableSdk = Join-Path $portableMsvc 'Windows Kits/10'
$portableSdkVersion = '10.0.26100.0'
if (-not (Test-Path -LiteralPath (Join-Path $portableVc 'bin/Hostx64/x64/cl.exe'))) { throw 'Portable MSVC is missing from build/toolchains/msvc.' }
$env:PATH = "$portableVc/bin/Hostx64/x64;$portableSdk/bin/$portableSdkVersion/x64;$portableToolRoot/cargo/bin;$env:PATH"
$env:INCLUDE = "$portableVc/include;$portableSdk/Include/$portableSdkVersion/ucrt;$portableSdk/Include/$portableSdkVersion/shared;$portableSdk/Include/$portableSdkVersion/um;$portableSdk/Include/$portableSdkVersion/winrt;$portableSdk/Include/$portableSdkVersion/cppwinrt"
$env:LIB = "$portableVc/lib/x64;$portableSdk/Lib/$portableSdkVersion/ucrt/x64;$portableSdk/Lib/$portableSdkVersion/um/x64"
$env:VCToolsInstallDir = "$portableVc/"
$env:WindowsSdkDir = "$portableSdk/"
$env:WindowsSDKVersion = "$portableSdkVersion\"
$env:RUSTUP_HOME = Join-Path $portableToolRoot 'rustup'
$env:CARGO_HOME = Join-Path $portableToolRoot 'cargo'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = Join-Path $portableVc 'bin/Hostx64/x64/link.exe'
$env:VENDOR = 'galaxyxr'
