# Galaxy XR Companion — cumulative replacement source

This is the current cumulative replacement package. It includes the previous GUI/driver fixes, the completed navigation/picture-mode/menu changes, and **the actual `src-tauri` backend supplied with this request**. It is source code, not a prebuilt Windows executable or driver DLL.

## Apply the ZIP

1. Back up the complete project, the working portable application/driver package, and your saved settings and profiles. Close Companion and SteamVR before replacing deployed files.
2. Extract the archive into the **project root that already contains `build.js`, `CustomHeadsetGUI`, `CustomHeadsetOpenVR`, and `ThirdParty`**. Merge folders and overwrite matching files. Do not extract it inside `CustomHeadsetGUI`, delete the existing project, or delete files that are not in the ZIP.
3. Run the included apply-once source cleanup. It removes retired vendor-specific source/assets that an overlay cannot delete by itself, verifies the active source is clean, and then deletes its own migration script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\APPLY-SOURCE-CLEANUP.ps1
```

4. Keep the existing `ThirdParty` dependencies and Windows build toolchain. They are not redistributed in this replacement archive. `node_modules`, generated frontend output, build products and user configuration are also intentionally absent.
5. Reinstall the pinned frontend dependencies and rebuild **both the GUI and driver**:

```powershell
cd CustomHeadsetGUI
npm ci
cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Build-Portable.ps1
```

Use the full build, without `-GuiOnly` or `-DriverOnly`. The native mode guard and the earlier SteamVR icon/routing fixes require the new driver DLL. The script prints the actual output path. The existing root release commands remain available:

```powershell
node .\build.js --vendor galaxyxr
node .\build.js --vendor neutral
```

`npm run build` still invokes Tauri (including the frontend typecheck/build), not just Vite. The staged Galaxy package retains this structure:

```text
output/<staging-directory>/
├── CustomHeadsetGUI/
│   └── Galaxy XR Companion.exe
└── GalaxyXRNative/
    ├── driver.vrdrivermanifest
    ├── bin/win64/driver_GalaxyXRNative.dll
    └── resources/...
```

The build produces the existing **portable folder**; it does not add an installer or automatic release-ZIP publication. Keep the application beside its driver folder. With SteamVR fully stopped, deploy the rebuilt application and complete driver resources to the **actually registered** driver installation, not an unused copy. Restart SteamVR and reconnect afterwards. Do not erase `steamvr.vrsettings` or your application settings to apply this update.

## Completed changes in this package

### Driver-gated navigation

Until the driver installation is verified, **App Settings is the only top-level tab**. Other pages cannot be reached through their URL hashes either. Installation troubleshooting, driver installation and **Check installation and settings** are available in App Settings, so hiding About cannot lock the user out of installation.

A successful installation check restores the other tabs. A later missing or unreadable installation redirects to App Settings. A driver that is installed but disabled in SteamVR is still installed and retains its tabs. An in-progress recheck may retain previously verified tabs; an initial check without verified installation does not expose them. The check does not install anything, reset settings or treat unreadable values as Off.

### Menu hierarchy

Parent menus have strong, left-aligned bold headings with an accent border. Nested menus are also bold and left-aligned, with indentation, a separate surface and a different border weight. This shared treatment applies to Image Processing → Color / Image Enhancements, Controllers → Controller Fix / Controllers Advanced, calibration, encoder and other existing nested groups. Native header buttons retain keyboard activation, visible focus and `aria-expanded` feedback.

### One 10-bit baseline control

The **Profile: Supports 10-bit** switch has been removed from the editable UI. Its old stored compatibility field is not deleted from existing configuration. SDR 10-bit baseline remains the user-facing baseline action; it requests 10-bit capability but is not proof of an already renegotiated live stream.

### Mutually exclusive baseline and enhancements

- Turn **Image Enhancements Off in App Settings** before enabling SDR 10-bit baseline.
- Enabling the baseline requires confirmation: picture adjustments are reset to defaults and Image Enhancements remains Off.
- While the baseline is On, Image Enhancements is disabled with an explanation and a link to Driver Settings. Enhancement editors cannot be used.
- Turn the baseline Off before enabling Image Enhancements. Turning it Off does **not** automatically enable enhancements or restore old picture adjustments.

The confirmed reset covers color/brightness, sharpening, FXAA, dither, black-floor correction, lens/distortion curves and maps, eye alignment, dimming, calibration overlays and video-color metadata. It also disables the custom-shader target for this headset to avoid a conflicting color path. Controller tuning, tracking, transport, stream quality, bitrate, encoder presets, schema stamps and unrelated/unknown settings are preserved. **Export/back up custom lens and picture settings before confirming the reset.**

The state action drains pending saves, uses one configuration write for the mode change and reset, rejects overlapping mode actions, and restores the last confirmed state on write failure. Settings checks and application startup do not perform a destructive reset. For an older/external file that has both modes enabled, the baseline takes priority in the UI and in the native enhancement-pass guard without rewriting the file. An explicit Off → On baseline action performs the confirmed reset. The native post-pack pass now also respects the enhancement master switch.

### Earlier fixes retained

The package retains Galaxy XR Companion branding, dark/light/system theme handling, control synchronization, top-layer readable help, save/error handling, advanced-only identity/profile switches and recognition warnings, profile-aware SteamVR setting destinations, portable staging, supplied SteamVR status artwork and high-resolution multi-size application icon packaging.

When vrlink Headset Profile is On, applicable capability and tuning settings use `vrlink_xrvst2ue`. When Off, capability requests use the prior original-model profile/fallback and tuning uses the prior `driver_vrlink` destination. SteamVR-wide settings and driver enable/block markers stay in their required sections. Recovery only restores keys whose unchanged values can be attributed to this driver. A restart/reconnect is still required where stated.

## Rust backend and compatibility

`CustomHeadsetGUI/src-tauri` now includes the supplied Rust source, Cargo manifest/lockfile, capabilities, build script, native configuration and icons. All 39 checked uploaded runtime/configuration/icon files are preserved byte-for-byte **except the cosmetic Cargo description**, now “Galaxy XR Companion.” The internal Cargo binary name `custom-headset-gui`, application identifier, settings paths, driver IDs, native command registrations and security permissions are unchanged. Generated Tauri schemas and an old configuration-backup file are not included; the build regenerates schemas.

`configure-tauri.mjs` preserves native settings while maintaining the Companion title, icons and frontend hooks. Its one-time backup is a recovery aid, not a file to copy over the current configuration. No older Rust backend has been substituted.

## Verification and remaining release checks

Fresh results are in **`Docs/Galaxy-XR-Companion/latest/VALIDATION.md`**. They cover service/save/navigation/reset regressions, portable-build script fixtures, asset/help checks and standalone native policy/routing tests. The new mode/navigation suite passes **22/22**; the existing service suite passes **36/36**. Standalone native companion checks pass **132/132 for each vendor configuration**.

**A clean dependency install, complete frontend dependency typecheck/bundle, Windows Tauri/Rust/driver build, browser visual run and SteamVR/headset validation were not completed in this environment.** Dependency download failed because registry DNS access was unavailable; the browser run was blocked by the environment. No prebuilt executable or DLL is included. Historical results elsewhere in `Docs` are not evidence that the latest source passed a new Windows/browser build.

After `npm ci` in your normal build environment, run the included checks from the project root:

```powershell
node tools/Test-FluentFixes.cjs
node tools/Test-CompanionModes.cjs
node tools/Test-FluentBuildHooks.cjs
node tools/Test-SteamVRSettingsDiff.cjs
python tools/Test-CompanionAssets.py
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Test-CompanionSettings.ps1
```

The asset test requires Pillow. The PowerShell native tests use the existing Windows compiler setup. Complete `Docs/Galaxy-XR-Companion/WINDOWS-RELEASE-CHECKLIST.md` before replacing a known-good installation. For rollback, restore the previous complete GUI+driver package and your backed-up picture settings; disabling the baseline cannot reconstruct adjustments deliberately reset by confirmation.

## Portable build stderr handling

`tools/Build-Portable.ps1` no longer pipes `npm.cmd` stderr directly into
PowerShell. Tauri intentionally prints normal status messages such as
`Running beforeBuildCommand` to stderr; Windows PowerShell 5.1 can wrap those
messages as `NativeCommandError` when `$ErrorActionPreference` is `Stop`. The
updated script merges npm/Tauri stderr inside `cmd.exe`, keeps the complete
combined output in the portable GUI build log, and fails only when the actual
GUI build process returns a non-zero exit code.

If the build really fails, the exception now includes the numeric exit code and
the exact log path. Read the lines immediately before the final failure in that
log for the real compiler/Tauri error.

## Legacy vendor cleanup

The replacement source no longer contains the retired non-Galaxy-XR headset
implementations, launcher bridge, vendor-specific eye-tracking bridge, status
artwork, obsolete public image, or their locale/help entries. Their Visual
Studio compilation entries were removed as well. Galaxy XR behavior and the
generic/neutral driver path remain available.

## Portable manifest encoding

`tools/Build-Portable.ps1` writes `driver.vrdrivermanifest` and the rewritten
`default.vrsettings` as UTF-8 **without a BOM**. This is required for reliable
SteamVR/Rust JSON parsing on Windows PowerShell 5.1. The Companion backend also
accepts an older UTF-8-BOM manifest so an already-generated package can be
identified and repaired.

### Repair an already-built portable package

If an older portable build reports `expected value at line 1 column 1` for
`driver.vrdrivermanifest`, run this against the `GalaxyXRNative` directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Repair-PortableJsonEncoding.ps1 `
  -PackageDirectory "D:\path\to\output\CustomHeadset-Test-...\GalaxyXRNative"
```

Then retry the driver installation/registration. Rebuilding with the updated
`Build-Portable.ps1` is preferred for release artifacts because it also writes
`default.vrsettings` correctly from the start.

## GitHub Actions release automation

`.github/workflows/release.yml` builds the Windows x64 Galaxy XR release on every `v*` tag and can also be run manually from the Actions tab. Before building, it verifies that the driver, OpenVR manifest, npm package/lockfile, Tauri configuration, Cargo manifest/lockfile all contain the same semantic version. A tagged build must use a tag matching that version exactly, for example `v1.2.0`.

The workflow checks out all submodules, installs Node/Rust, exposes MSBuild, runs the frontend test suite, runs the existing `node build.js --vendor galaxyxr` portable build, then creates:

```text
release/Galaxy-XR-Companion-v<version>-Windows-x64.zip
release/Galaxy-XR-Companion-v<version>-Windows-x64.zip.sha256
release/Galaxy-XR-Companion-v<version>-Windows-x64-release-notes.md
```

The ZIP contains the complete portable `CustomHeadsetGUI` + `GalaxyXRNative` pair plus `VERSION.txt`, `CHANGELOG.md`, `CREDITS.md`, and generated release notes. Release notes include the matching changelog section and every non-merge commit since the previous `v*` tag. Pushing a version tag publishes those files to a GitHub Release; a manual run only produces downloadable Actions artifacts.

For this release all embedded versions are **1.2.0**. To publish it after committing the source:

```powershell
git tag v1.2.0
git push origin v1.2.0
```

## Icon credits

Galaxy XR icons were made by **Vilkka**.  
Based on original Quest Pro iconpack made by **Lux / Hekky**.


## Build troubleshooting

If native linking reports unresolved `zcalloc`, `zcfree`, or `z_errmsg`, ensure the updated `CustomHeadsetOpenVR.vcxproj` is present. Version 1.2.0 includes zlib `zutil.c` in the native source list.
