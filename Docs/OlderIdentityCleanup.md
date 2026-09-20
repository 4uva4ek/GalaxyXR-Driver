# Clean older Galaxy XR identity settings

Open **About → Clean Older Identity Settings** with SteamVR completely closed. This button is available even when the driver is uninstalled.

It removes recognized older identity values from `vrlink_xrvst2ue`, `vrlink_xrvst2`, and `vrlink_Galaxy XR`, including stale `GalaxyXRNative` resource references. Matching requires driver-specific resource references or the Samsung/Galaxy XR/serial identity together. Each removed key must match a known value; custom values, other headset sections, and render/stream profile settings remain untouched. Recognized empty sections are removed too.

Before changing anything, the action saves an exact-byte backup beside `steamvr.vrsettings`, named `steamvr.vrsettings.galaxyxr-identity-backup-<id>-<timestamp>.json`. The result dialog reports the backup path and removal counts. A no-op does not create a backup. Keep the backup if you may need to restore the previous configuration.

Values tracked by the current installation's recovery journal are preserved with a warning. Uninstall first if those values need restoration. Cleanup does not remove driver packages, alter registrations, or recreate deleted driver configuration. It does not recover unknown historical values; it removes only the recognized legacy overrides.

The button uses the same operation gate and backend settings mutex as installation/uninstallation, rejects a running SteamVR session, validates paths and JSON, and writes settings atomically. Tests use temporary files and mocked host services; development validation does not run cleanup against the user's live SteamVR file.

## Build and cleanup record — 2026-09-16

Regenerate the test bundle with `tools/Build-Portable.ps1`. No obsolete source files or alternate source trees were introduced. The existing About boilerplate test was replaced with actual rendered-button tests. Current package/ZIP and compact evidence are retained for testing. Existing generated compiler/cache cleanup remains deferred after the prior automatic approval review rejected deletion as blocked by policy; no alternate deletion retry was attempted. Previous user test bundles were already absent from `output` when this task began.
