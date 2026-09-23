# Clean Galaxy XR settings

Open **Setup → Clean Settings** with SteamVR completely closed. This button is available even when the driver is uninstalled.

The reset restores journal-owned SteamVR overrides independently in every recorded section, including `vrlink_Oculus Quest Pro` and `vrlink_PICO 4 Pro`. Each key returns to its own previous value, or is removed if the driver originally added it. External edits and unrelated settings are preserved.

It also removes recognized older Galaxy XR identity values from `vrlink_xrvst2ue`, `vrlink_xrvst2`, `vrlink_Galaxy XR`, `vrlink_Oculus Quest Pro`, and `vrlink_PICO 4 Pro`, including stale `GalaxyXRNative` resource references. Matching requires driver-specific resource references or the Samsung/Galaxy XR/serial identity together. Native Meta/PICO identity values are not treated as stale Galaxy XR identity. Saved custom overrides without a journal are removed only when their current values exactly match the app's saved overrides; other unrecorded render/stream settings remain untouched. Recognized empty sections are removed too.

Before changing files, the action saves exact originals and a manifest under `%APPDATA%/GalaxyXR/Backups/clean-settings-<timestamp>-<pid>/`. The result dialog reports the backup path and counts. Driver settings return to defaults; app preferences and named distortion profiles are kept. Driver packages, registrations, and enable/block choices are preserved. The identity/custom-override cleanup cannot remove pre-existing values just restored by the journal.

The button uses the same operation gate and backend settings mutex as installation/uninstallation, rejects a running SteamVR session, validates paths and JSON, and writes settings atomically. Tests use temporary files and mocked host services; development validation does not run cleanup against the user's live SteamVR file.

## Build and cleanup record — 2026-09-16

Regenerate the test bundle with `tools/Build-Portable.ps1`. No obsolete source files or alternate source trees were introduced. The existing About boilerplate test was replaced with actual rendered-button tests. Current package/ZIP and compact evidence are retained for testing. Existing generated compiler/cache cleanup remains deferred after the prior automatic approval review rejected deletion as blocked by policy; no alternate deletion retry was attempted. Previous user test bundles were already absent from `output` when this task began.
