# Galaxy XR driver uninstall

## Test the build

1. Extract the complete test ZIP. Keep `GalaxyXRDriverGUI` beside `GalaxyXRNative`.
2. Close SteamVR completely, then open `GalaxyXRDriverGUI/Galaxy XR Companion.exe`.
3. Use **Install** to copy the bundled driver into its managed installation directory. Native Identity is enabled by the same transaction. Use **Uninstall** to remove that installation, then **Install** again from the same bundle to test reinstalling.
4. After installing this build, run SteamVR and change the desired driver settings. Close SteamVR before testing **Uninstall** again.

## What uninstall removes

- Exact GalaxyXRNative registrations and installed copies under `%LOCALAPPDATA%/GalaxyXR/Drivers/GalaxyXRNative-<id>` or SteamVR's driver directory.
- Recognized older installed copies of this Galaxy XR fork using the `CustomHeadsetOpenVR` name. Identity requires the fork's shader files and matching driver DLL; the ordinary vendor-neutral driver is separate.
- Packages retained by an upgrade, including copied packages retired outside SteamVR's driver scan directory.
- `%APPDATA%/GalaxyXR/CustomHeadset`, including driver and GUI settings, distortion profiles, diagnostics, status, installation receipt, and recovery journal after successful cleanup.
- Persistent SteamVR overrides written by this driver and this GUI, restored using the journal described below.

**The bundle's `GalaxyXRNative` directory is preserved.** Installation copies its files before registration; uninstall only removes owned installation locations. Receipt schema 2 distinguishes installed `packages` from preserved `sourcePaths`. Previous schema 1 external bundle registrations are unregistered and preserved, including sources installed with the 2026-09-15 test build. The portable GUI, source bundle, and ZIP remain available for reinstalling. Shared SteamVR files and shared configuration directories are preserved.

## Settings restoration

The native driver and GUI share a named mutex and `%APPDATA%/GalaxyXR/CustomHeadset/steamvr-changes.json`. Before a mutation, they durably record the original raw JSON value or its absence, plus the latest intended value. Repeated changes and upgrades retain the 1st original value. Raw `false`, `0`, and `null` differ from an absent key.

Uninstall restores recorded values and removes keys originally absent. It preserves unrelated settings. If a tracked setting has subsequently changed to a different value, uninstall preserves that later change and reports it. The journal covers driver resolution, transport, refresh rate, headset profiles, arbitrary `vrlinkExtraKeys`, GUI driver enable/block changes, and the driver version marker.

**Older installations have no original-value journal.** Their known Galaxy XR overrides can be removed to return to SteamVR defaults, but historical user values cannot be reconstructed. The result explicitly identifies this legacy reset. Installing this build over an older installation cannot retroactively create the missing history.

Hand, eye-sharing, and OSC preferences are preserved unless explicitly changed through a journaled operation. Tracking capability publication uses runtime paths; closing SteamVR clears that runtime state.

## Failure behavior

Installation/uninstallation require SteamVR to be closed. Registration changes use `vrpathreg` with the exact path, check its exit code, and read registrations back. Cleanup validates package ownership, rejects source trees and reparse points, and stages package removal with same-volume renames. Pre-commit failures restore staged paths and registrations; rollback failures are reported with recovery paths. Partial deletion retains recovery information for retry and never reports success.

The GUI drains and invalidates queued settings writes and readiness checks during uninstall, preventing them from recreating deleted driver configuration or marking an uninstalled driver ready. Launch, restart, and concurrent installation actions are disabled during the operation. Source bundles overlapping the configuration/deletion locations are rejected before changes.

## Validation boundaries

Automated tests use temporary fixtures and fake runtime APIs. The test ZIP is a local x64 build for user testing. A successful compile or fixture test does not establish live SteamVR uninstall, headset tracking, eye sharing, or OSC delivery.

Build commands and tool versions: [PORTABLE_BUILD.md](../tools/PORTABLE_BUILD.md). Tracking investigation: [SteamLinkTrackingCapabilities.md](SteamLinkTrackingCapabilities.md).
