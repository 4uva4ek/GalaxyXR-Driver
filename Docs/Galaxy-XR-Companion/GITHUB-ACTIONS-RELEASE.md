# GitHub Actions release build

The release workflow is `.github/workflows/release.yml`.

## Release version

The current release version is **1.2.0**. The workflow verifies that this version agrees across:

- `CustomHeadsetOpenVR/src/Config/Config.cpp`
- `CustomHeadsetOpenVR/DriverFiles/driver.vrdrivermanifest`
- `CustomHeadsetGUI/package.json`
- `CustomHeadsetGUI/package-lock.json`
- `CustomHeadsetGUI/src-tauri/tauri.conf.json`
- `CustomHeadsetGUI/src-tauri/Cargo.toml`
- `CustomHeadsetGUI/src-tauri/Cargo.lock`

A tagged release must use exactly `v<version>`. For 1.2.0, use `v1.2.0`.

## Automatic tagged release

After the versioned source is committed:

```powershell
git tag v1.2.0
git push origin v1.2.0
```

The Windows workflow then:

1. checks out the full repository and recursive submodules;
2. installs Node.js and Rust and locates MSBuild;
3. verifies all release version fields and the tag;
4. runs `npm ci` and the frontend test suite;
5. runs `node build.js --vendor galaxyxr`, which builds both the native OpenVR driver and Tauri application;
6. validates the staged executable, driver DLL, manifest and default settings;
7. packages the complete portable pair into `Galaxy-XR-Companion-v1.2.0-Windows-x64.zip`;
8. creates a SHA-256 checksum;
9. generates release notes from the 1.2.0 changelog plus all non-merge commits since the previous `v*` tag;
10. uploads the ZIP and metadata as Actions artifacts; and
11. publishes the ZIP and checksum to a GitHub Release when the workflow was triggered by a tag.

A manual **Run workflow** invocation performs the same build/package validation but does not publish a GitHub Release.

## Portable ZIP layout

```text
Galaxy-XR-Companion-v1.2.0-Windows-x64/
├── CustomHeadsetGUI/
│   └── Galaxy XR Companion.exe
├── GalaxyXRNative/
│   ├── driver.vrdrivermanifest
│   ├── bin/win64/driver_GalaxyXRNative.dll
│   └── resources/...
├── VERSION.txt
├── CHANGELOG.md
├── CREDITS.md
└── RELEASE-NOTES.md
```

Keep `CustomHeadsetGUI` and `GalaxyXRNative` together after extraction.

## Icon attribution

Galaxy XR icons were made by **Vilkka**.  
Based on original Quest Pro iconpack made by **Lux / Hekky**.
