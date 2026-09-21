# Changelog

All notable Galaxy XR Companion release changes are recorded here.

## [1.2.0] - 2026-09-21

### Companion UI

- Renamed the desktop application to **Galaxy XR Companion** while preserving existing internal identifiers and settings paths for compatibility.
- Replaced the Angular Material frontend with the Lit + Fluent Web Components frontend and retained the Tauri/Rust native backend.
- Fixed Fluent light/dark/system theming, control contrast, switches/toggles, dropdown synchronization, tab semantics, keyboard behavior, responsive layout, and top-layer help popovers.
- Reworked help text for less technical users while retaining expandable technical detail.
- Added a settings verification action that rereads saved driver/SteamVR settings and synchronizes every toggle with the actual persisted state instead of assuming UI state is authoritative.
- Gated all top-level pages except **App Settings** until driver installation is verified; direct routes are gated as well.
- Made nested sections such as Image Processing → Color/Image Enhancements and Controllers → Controller Fix/Controllers Advanced visually hierarchical.
- Hid **Galaxy XR Native Identity** and **vrlink Headset Profile** unless Advanced mode is enabled. Both remain enabled by default, preserve explicit user choices, and warn that disabling them can cause SteamVR to identify the headset as Unknown or as the patched Steam Link identity.
- Removed the duplicate **Profile: Supports 10-bit** control.
- Made **SDR 10-bit baseline** and **Image Enhancements** mutually exclusive. Enabling SDR baseline requires Image Enhancements to be off and resets picture-processing adjustments to defaults; the UI explains the required off-first workflow in both directions.

### SteamVR settings and driver behavior

- Added profile-aware SteamVR settings routing: with **vrlink Headset Profile** enabled, applicable profile/tuning values target `vrlink_xrvst2ue`; when disabled, the previous destinations are retained.
- Preserved SteamVR-global settings and driver enable/block settings in their required sections.
- Fixed installation detection so valid registered/copied driver packages are recognized without relying only on optional metadata files.
- Added UTF-8 BOM tolerance in the Rust manifest reader and changed portable JSON generation to UTF-8 without BOM.
- Fixed native image-processing guards so disabled Image Enhancements cannot leave encoder-side sharpening active.
- Removed retired non-Galaxy-XR vendor-specific source, assets, and code paths while preserving Galaxy XR and generic/neutral behavior.

### Icons and branding

- Added Galaxy XR SteamVR HMD status icons through OpenVR driver properties, including searching/standby/error/ready states and high-DPI variants.
- Rebuilt Windows/Tauri icon resources with multiple sizes for better taskbar/titlebar scaling.
- Added explicit icon attribution: Galaxy XR icons were made by **Vilkka**, based on original Quest Pro iconpack made by **Lux / Hekky**.

### Build and release

- Fixed native Windows linking by including zlib `zutil.c`; this resolves unresolved `zcalloc`, `zcfree`, and `z_errmsg` symbols in portable and MSBuild releases.
- Fixed Windows PowerShell 5.1 portable builds incorrectly treating Tauri's normal stderr status output as a terminating `NativeCommandError`.
- Fixed portable `driver.vrdrivermanifest` and `default.vrsettings` generation so JSON is written without a UTF-8 BOM.
- Preserved the existing portable layout containing `CustomHeadsetGUI` beside `GalaxyXRNative`.
- Added a Windows GitHub Actions release pipeline that checks version consistency, installs dependencies/toolchains, runs frontend tests, builds the driver and Tauri app, produces a versioned portable ZIP, creates SHA-256 metadata, generates release notes from this changelog plus commits since the previous tag, uploads workflow artifacts, and publishes GitHub Releases for `v*` tags.

