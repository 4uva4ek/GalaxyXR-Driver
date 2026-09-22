# GitHub Actions release build

The release workflow is `.github/workflows/release.yml`.

## Release version

The workflow verifies that the release version agrees across:

- `GalaxyXRDriver/src/Config/Config.cpp`
- `GalaxyXRDriver/DriverFiles/driver.vrdrivermanifest`
- `GalaxyXRDriverGUI/package.json`
- `GalaxyXRDriverGUI/package-lock.json`
- `GalaxyXRDriverGUI/src-tauri/tauri.conf.json`
- `GalaxyXRDriverGUI/src-tauri/Cargo.toml`
- `GalaxyXRDriverGUI/src-tauri/Cargo.lock`

A tagged release must use exactly `v<version>`.

## Automatic release from main

Run the version command with the next version, update `CHANGELOG.md`, and commit
all seven version files listed above. The command updates both lockfiles without
changing dependency versions. For example:

```powershell
node bump-version.js 1.2.2
node tools/verify-release-version.cjs
```

When that version change reaches `main`, the Windows workflow automatically
creates the matching tag and publishes a release after validation. Other pushes
and pull requests build and test without publishing. The version comparison uses
the commit before the entire push, so a version bump followed by another commit
in the same push is still detected.

The Windows workflow:

1. checks out the full repository and recursive submodules;
2. installs Node.js and Rust and locates MSBuild;
3. verifies all release version fields (and the tag on tag-triggered runs);
4. runs `npm ci` and the frontend test suite;
5. runs `node build.js --vendor neutral` and `node build.js --vendor galaxyxr`, each building the native OpenVR driver and Tauri application, then runs the Rust library tests;
6. validates the staged executable, driver DLL, manifest and default settings;
7. packages the complete Galaxy XR portable pair into `GalaxyXRDriver-v<version>-Windows-x64.zip`;
8. creates a SHA-256 checksum;
9. generates release notes from the version's changelog plus non-merge commits since the previous `v*` tag;
10. uploads the ZIP and metadata as Actions artifacts; and
11. pins `v<version>` to the built commit, uploads the ZIP and checksum to a draft, and publishes after both uploads succeed. Prerelease versions are marked as prereleases.

A manual **Run workflow** invocation builds without publishing by default. To retry
a failed publication, select **main** and enable **publish**. Reruns preserve an
already published release and never move an existing tag to a different commit;
after code changes, bump to a new version. Explicit `v*` tag pushes remain supported.

`build-tools.yml` separately installs the locked frontend dependencies and runs
the service regressions plus build-tool tests under PowerShell 5.1 and 7.

The local full build command is unchanged and never publishes or deploys:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Build-Portable.ps1
```

## Portable ZIP layout

```text
GalaxyXRDriver-v<version>-Windows-x64/
├── GalaxyXRDriverGUI/
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

Keep `GalaxyXRDriverGUI` and `GalaxyXRNative` together after extraction.

## Icon attribution

Galaxy XR icons were made by **Vilkka**.  
Based on original Quest Pro iconpack made by **Lux / Hekky**.
