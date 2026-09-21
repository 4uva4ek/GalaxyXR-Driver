> Historical first-overlay notes. Apply and build this cumulative package using **README-GALAXY-XR-COMPANION.md** instead. The actual Rust backend is now included; current picture-mode semantics and validation are documented there.

> **Superseded for this update:** read `README-GALAXY-XR-COMPANION.md` first. This file describes the earlier GUI fixes; its old executable name and test results are historical.

# Fluent GUI fixes — source overlay

## Apply this package

This ZIP contains the changed and added files for the uploaded `GUI.zip`. Merge its contents into the **root of your complete current project**, alongside `build.js`, `CustomHeadsetGUI`, `CustomHeadsetOpenVR`, and `tools`. Overwrite matching files; retain all other files. It is not a standalone application or a prebuilt portable release.

**The uploaded GUI archive did not contain `CustomHeadsetGUI/src-tauri`. Your existing current Rust backend is required.** This overlay supplies executable icons under `src-tauri/icons`, but deliberately does not reconstruct native commands, permissions, Cargo files, or native configuration from the older project archive. Do not delete or replace your existing `src-tauri` directory.

Before applying, commit/back up your source tree and back up your existing settings/profile directory (`%APPDATA%/GalaxyXR/CustomHeadset` for Galaxy XR; `%APPDATA%/CustomHeadset` for neutral). Do not delete those directories or reset settings to install this patch.

The complete changed-file list and original/new SHA-256 hashes are in `Docs/Fluent-GUI-Fixes/CHANGES.json`. No application version is changed. No settings files, driver binaries, prebuilt frontend assets, or fonts are included.

## What changes

- Driver installation detection reuses the initialized application paths, verifies the selected vendor's driver manifest and DLL, handles copied and externally registered drivers, and no longer needs `info.json` to exist. UTF-8 byte-order marks are accepted, including manifests emitted by the existing Windows PowerShell portable-build script. Permission/read failures are distinguished from an absent driver.
- Light, dark, and system appearance apply Fluent v3 theme tokens. Reactive component properties, switch visibility, dropdown initialization, single-event value changes, native button/input contrast, keyboard tabs, and responsive layouts are corrected.
- **About → Check installation and settings** rereads saved driver settings, GUI preferences, and SteamVR driver enablement. It waits for already requested saves, updates the shared application state, and reports every boolean setting, including hidden advanced values. Composite/enum-backed controls are recalculated from the same reloaded settings object rather than guessed from their labels.
- Failed writes show an error and restore the last confirmed state. Unreadable/malformed configuration is not treated as Off. Read-back suppresses migration writes and does not install/uninstall drivers, reset settings, or restart SteamVR.
- The supplied Galaxy XR headset PNG/GIF artwork replaces the corresponding GUI and SteamVR resource icons. Animated searches remain animated. Windows executable/favicons and other existing native icon formats are generated from the supplied ready artwork. Controller and neutral driver artwork is unchanged.
- Both existing portable build entry points remain in place. The PowerShell Galaxy XR build explicitly selects the Galaxy XR GUI. The root release builder still supports Galaxy XR and neutral variants.

## Check and build on Windows

Run these commands from your complete project root, using the same Node/Rust/C++ environment that previously built the application. Run each next step only after the preceding command succeeds.

```powershell
Push-Location .\CustomHeadsetGUI
npm ci
npm test
npm run build:ui
Pop-Location

node .\tools\Test-FluentFixes.cjs
node .\tools\Test-FluentBuildHooks.cjs

# Full native driver + Tauri GUI build; stages a NEW portable test folder.
powershell -NoProfile -ExecutionPolicy Bypass -File tools/Build-Portable.ps1
```

The full test build must finish with `Built test package: ...` and exit code 0. Its output remains:

```text
output/CustomHeadset-Test-<timestamp>/
├── CustomHeadsetGUI/Galaxy XR Companion.exe
└── GalaxyXRNative/
    ├── driver.vrdrivermanifest
    ├── bin/win64/driver_GalaxyXRNative.dll
    └── resources/...
```

For the existing release staging flow, use one of the original commands:

```powershell
node .\build.js --vendor galaxyxr
# Or build the separate neutral variant:
node .\build.js --vendor neutral
```

Those commands still produce the existing `CustomHeadset-STAGING-...-Windows` portable **folders**. This patch ZIP is not a change to the release archive format. Keep the executable and its sibling driver folder together; do not distribute the executable alone. Do not use partial-build switches as evidence that the complete portable package works.

`npm run build` still runs **Tauri build**, not only Vite. Before starting, `scripts/configure-tauri.mjs` updates only the frontend hooks in your existing `src-tauri/tauri.conf.json`: `frontendDist`, `devUrl`, `beforeDevCommand`, and `beforeBuildCommand`. A byte-exact `.before-fluent-fixes.json` backup is created once. Native window/security/bundle/version settings remain intact. Missing native configuration causes an explicit error rather than an older backend being substituted.

The frontend retains all three release entries: `en-US/index.html`, `zh-Hant/index.html`, and `ja/index.html`, each with its own assets, icons, and locale JSON. Existing Japanese/Traditional Chinese translations are unchanged; new or previously uncatalogued English strings fall back to English until translated.

## Use the settings check

Open the rebuilt application and select **About → Check installation and settings**. The report includes the check time, saved boolean values, whether each came from disk or defaults, errors/warnings, and SteamVR driver enablement. Navigate back to a settings page to see the refreshed controls.

The scan is data-driven, not a fixed list of old toggle names. The bundled defaults currently contain 124 driver boolean fields; the GUI advanced-mode preference is also checked. Additional boolean fields in loaded configuration are included automatically. Missing keys use the loaded driver defaults, or bundled defaults when runtime defaults are unavailable. An unreadable file instead produces an error/unknown state; repair its permissions or JSON and run the check again.

**This verifies saved configuration, not whether every feature is currently active in the headset.** Restart-only options may be saved but not yet applied. `info.json` is last-reported telemetry, not proof that the driver is running now. Live hardware confirmation needs the native driver/runtime and is not fabricated from a toggle state.

Existing installed SteamVR resources do not change merely because the source icon files changed. Build the full package, close SteamVR, and use the application's existing reinstall/install flow when ready to deploy the new driver resources. The settings-check button itself never performs that deployment.

## Validation and remaining release gate

Completed here: **36/36 source-level service regressions**, **39/39 browser checks**, **12/12 build-script fixture checks**, and **38/38 asset/catalog checks**. The service suite checked all 124 bundled driver booleans in both states (248 driver-state assertions).

Browser checks used the actual Fluent/Lit/RxJS runtime extracted from the supplied production bundle, with new application source, theme-token fixtures, and mocked Tauri/filesystem APIs. They are not native Windows tests. The service suite likewise uses an in-memory Tauri adapter. See `Docs/Fluent-GUI-Fixes/VALIDATION.md` for exact scope and result files.

**Not run:** clean `npm ci`, the package's normal Vitest suite, a full installed-package TypeScript/Vite build, native Rust/C++/Tauri compilation, packaged Windows execution, actual SteamVR installation, or headset testing. The validation environment has no Windows toolchain, and the submitted archive lacks the native backend. No claim of a successful portable executable build is made. Complete the Windows build and manual release checklist before replacing a working installation.

## Rollback

Restore changed files from your source-control commit or backup, remove files listed as `added` in the manifest when reverting, and restore the Tauri configuration backup if the hook helper ran. Rebuild the previous release. Do not delete the user's runtime configuration to roll back this UI patch. Restore configuration backups only when intentionally reversing settings changes made during your own testing.
