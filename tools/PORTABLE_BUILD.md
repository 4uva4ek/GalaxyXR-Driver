# Portable local x64 build

This fallback uses the Microsoft compiler directly when Visual Studio/MSBuild is unavailable. It reads the native compilation units from `GalaxyXRDriver.vcxproj`, adds the MinHook x64 sources, enables `VENDOR_GALAXYXR`, and stages the same GalaxyXRNative manifest/settings names as `build.js`. It does not deploy or restart SteamVR. Each native build keeps its own compiler log in `build/portable-objects-*`.

Prepared on 2026-09-15 in the ignored `build/toolchains` directory:

- MSVC 14.44.35207 / compiler 19.44.35229, Windows SDK 10.0.26100.0 (Microsoft package hashes verified).
- Rust/cargo 1.98.1, isolated `cargo` and `rustup` homes. Rust bootstrap SHA-256: `6f4bef66261261fcb43131be8720bab817d403a09edec7455c371974b90bdb7e`.
- Existing Node/npm. GUI dependencies installed with `npm install --package-lock=false --no-audit --no-fund`: the existing lock fails `npm ci` because chokidar/readdirp entries are missing. The tracked lock was preserved.

The initial lock-preserving install resolved newer Tauri JS plugins than the Rust lock permits. Align the installed JS packages with the existing lock using this command in `GalaxyXRDriverGUI` (does not edit manifests or lockfiles):

```powershell
npm install --no-save --package-lock=false --no-audit --no-fund @tauri-apps/api@2.5.0 @tauri-apps/plugin-fs@2.2.1 @tauri-apps/plugin-dialog@2.2.1 @tauri-apps/plugin-opener@2.2.6 @tauri-apps/plugin-shell@2.2.1 @tauri-apps/cli@2.5.0
```

From the repository root in PowerShell 5.1 or 7. The GUI build is launched through `cmd.exe`, which merges Tauri/npm stderr before PowerShell sees it; routine Tauri status lines therefore cannot become terminating `NativeCommandError` records. The actual process exit code still controls success/failure:

```powershell
./tools/Build-Portable.ps1 -OutputDirectory "$PWD/output/CustomHeadset-Uninstall-Test-20260915"
```

Use `-DriverOnly` or `-GuiOnly` for a partial rebuild. Output must stay under the repository's `output` directory. The script does not remove existing output; final packaging must select a fresh/stated destination and verify its contents.

For Rust validation:

```powershell
. ./tools/Enter-PortableBuildEnvironment.ps1
Set-Location GalaxyXRDriverGUI
cargo test --manifest-path src-tauri/Cargo.toml --lib driver_installation
```

The environment helper changes only the current PowerShell process. No machine/user PATH entries are added.

Tool acquisition sources: [Microsoft package extraction helper](https://gist.github.com/mmozeiko/7f3162ec2988e81e56d5c4e22cde9977), [Rust official installation instructions](https://rust-lang.github.io/rustup/installation/other.html). The extraction helper was inspected, restricted to its local output for recursive cleanup, and run with `--vs 2022 --target x64`; it downloads the actual compiler and SDK packages from Microsoft and checks their manifest SHA-256 values. Extracted toolchains are retained build dependencies. Download archives and completed compiler intermediates can be removed after recording evidence; retain the testable release package.
