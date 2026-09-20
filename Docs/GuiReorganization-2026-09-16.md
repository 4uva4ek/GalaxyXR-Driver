# Galaxy XR GUI and reinstall fixes — 2026-09-16

## Pages

- **Driver Settings:** Headset divider with Galaxy XR Native Identity, Native Render Resolution, and vrlink Headset Profile; Controllers divider with the existing controller options. Native Identity defaults on in the native Galaxy build and installation enables it transactionally.
- **Galaxy XR:** Stream quality, encoder options, color and image enhancements. The moved headset, controller and distortion controls are not duplicated here.
- **Distortion Profile:** Distortion Correction and Share Distortion Profile, including curve editing and JSON/text import/export. Both require **Image Enhancements** in App Settings; turning enhancements off keeps saved profiles and adjustments.
- **App Settings:** Color Scheme, Image Enhancements, Advanced Mode. Advanced Mode reveals encoder, detailed controller, calibration, Advanced and Debug groups. It hides controls without resetting their values. An active-calibration banner retains a Stop calibration action in simple mode.

Driver Settings is the initial page. Old MeganeX/Dream Air/general settings pages, their profile catalog, related controls, Pimax launcher and obsolete app preferences have been removed from the GUI. Native configuration schema fields remain for compatibility with existing files.

## Readiness

Readiness uses the verified SteamVR runtime path, a matching installed driver manifest and DLL, and a valid editable settings object. It does not require a connected headset or an `info.json` emitted by a running driver. Compiled native defaults provide the same configuration before the first SteamVR launch. Missing driver files and malformed settings remain actual errors rather than green checks.

The readiness view shares the main service instance. Initialization, normalized path watches, and watch rebinding survive reinstalling. In-flight checks are invalidated and drained before uninstall, so an old result cannot restore a stale green state or recreate removed configuration.

## Installation

The bundle is an immutable source. Install creates a managed copy, registers it, and saves Native Identity before reporting success. Uninstall removes owned installations and restores journaled SteamVR values; external bundle sources remain available. See [DriverUninstall.md](DriverUninstall.md) for migration and recovery behavior.

## Verification

Native/GUI default parity is checked with `tools/Generate-DriverDefaults.ps1 -Check`. Backend tests use temporary package/config fixtures; readiness tests exercise production services with an in-memory filesystem. Angular page tests use a headless browser and mocked host services, so they exercise actual rendered controls without changing SteamVR.

The packaged build is for live testing by the user; no driver deployment, SteamVR restart, or headset session is performed by these tests.
