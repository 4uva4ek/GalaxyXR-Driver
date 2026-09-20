# Galaxy XR Steam Link tracking controls

## Behavior

With `galaxyXr.nativeIdentity` enabled in a Galaxy vendor build, the HMD shim
publishes these runtime booleans while its HMD is connected and owned by VRLink:

| Runtime path | Steam Link controls it exposes |
|---|---|
| `/driver_vrlink/supports_hand_tracking` | Enable Hand Tracking Passthrough |
| `/driver_vrlink/supports_eye_and_face_tracking` | Share eye tracking data to other apps on this PC; Enable OSC; face sharing over OSC; OSC output port |

The OSC controls require **Advanced Settings**. Face sharing and the OSC output
port also require **Enable OSC** to be on. The existing SteamVR preferences
`driver_vrlink.enableHandTracking`, `shareEyeTrackingData`, `useOSC`, `useOSCFace`,
and `OSCOutPort` remain under the user's control. Publishing capability does not
change those preferences, OS permissions, or stream settings.

These are runtime paths, not keys to add to `steamvr.vrsettings`. Valve's
Quest/Pico identity branches publish them, but its unknown-headset branch skips
them. Changing the visible HMD model after the handshake cannot fix that branch.
The Galaxy shim supplies the 2 declarations without changing the APK identity.

VRLink and the Steam Link client still supply the actual hand, gaze, and face
data. This change does not add an OSC sender, an eye component, or fabricated
tracking samples. Visible controls are not proof of data reaching another app.

## Lifecycle and interface

- Poll once per second; require a connected pose, Galaxy native identity enabled,
  and `Prop_ParentDriver_Uint64` matching VRLink's driver handle.
- Resolve `IVRPaths_002` only. Unsupported versions fail closed with a log message.
- Read before writing. Write boolean values with `bPostEvents=true` so the settings
  UI receives change notifications, then read back each successful write.
- Retry transient errors and reassert declarations if VRLink resets them.
- Back up absent/false/true state. On disconnect, identity-option disable, or
  deactivation, restore only values this publisher changed. Preserve a different
  value another owner has written. Failed restores retry during later frames,
  including after deactivation; shutdown ends further retries.
- Deactivation and frame publication share a mutex so a frame cannot republish
  after the deactivation restore. No writes occur for an unrelated HMD driver.

The local ABI declarations match the pinned SDK's
[`openvr_capi.h`](https://github.com/ValveSoftware/openvr/blob/0924064316de3effbcd1acf1e309182a2deb1c05/headers/openvr_capi.h).
They are separate from the public `openvr_driver.h`, which omits IVRPaths.
The old opt-in resolution probe now uses the same verified structure layout and
root instead of its unverified `_001`/root=1 declaration.

## Evidence and validation — 2026-09-15

Installed SteamVR app build `25216780`; `driver_vrlink.dll` 13,908,632 bytes,
SHA-256 `A4BC1AC8A0739C6DC53EA56A300B6332EC74C9FB850E260A483BAB5EF1A7DA85`.
The installed `drivers/vrlink/resources/settings/settingsschema.vrsettings`,
lines 90–142, binds the controls to the 2 paths above.

The native path object for hand tracking is at RVA `0xD11940`. The Quest Pro
branch writes true at `0x9EC738`; the Pico eye-capable branch at `0x9EC9FD`.
The root passed to `ReadPathBatch`/`WritePathBatch` is `0x600000000`, including
the instruction at `0x9EC767`. This internal root is verified for that installed
build; a changed runtime can reject it, in which case publication reports failure.
No DLL offsets are patched or called by the implementation.

Passed locally:

- Windows x64 executable tests: absent/false/true originals, repeated no-op calls,
  reset recovery, handle/read/type/permission/write failures, read-back failures,
  retained ownership and restore retries, preservation of foreign values, correct
  root, and change notifications.
- Every path-structure field offset, size, and alignment checked against the
  pinned C API header for Windows x64 and x86.
- Actual `GalaxyXR.cpp` translation unit compiled for Windows x64 and x86 with
  `VENDOR_GALAXYXR` and `GXR_VRPATHS_PROBE` enabled using Zig C++.
- Diff whitespace check and independent code review.

The initial check lacked a full compiler toolchain. The 2026-09-15 uninstall
test build subsequently initialized all pinned dependencies and compiled/linked
the complete x64 driver using portable MSVC 19.44 and Windows SDK 10.0.26100.0.
All 42 project sources plus 4 MinHook sources passed; `HmdDriverFactory` is exported.
See `UninstallBuildEvidence-2026-09-15.json` and `DriverUninstall.md`.
No driver deployment, SteamVR restart, live path write, or headset test occurred.
Runtime acceptance of the interface/root and actual hand/gaze/OSC delivery remain
to be checked after an authorized build installation.

Reproduce from the repository root:

```powershell
git submodule update --init --depth 1 ThirdParty/openvr ThirdParty/json
./tools/Test-VrlinkCapabilities.ps1 -CompilerPath '<path-to-zig.exe>'
```

For a normal full MSVC build, initialize all dependency submodules and use the
existing `node build.js --vendor galaxyxr --no-gui` route. Its MSBuild invocation
sets `SkipPostBuild=true`; it stages output without installing into SteamVR.

Runtime logs identify `eligibility=7` when all publication gates pass,
`changed=3 ready=3` when both flags are newly written and read back, or an error
mask (`hand=1`, `eye/face=2`). If a flag was already true, it is ready without a
write and the changed mask is correspondingly smaller.

## Artifact cleanup

Temporary compiler/test outputs are disposable under
`build/vrlink-capabilities-validation` and `build/vrlink-capabilities-test`.
Deletion was deferred: automatic approval review rejected both the validated
allowlist cleanup and literal-path deletion with `blocked by policy`. The 17
files total **33,103,157 bytes (31.6 MiB)** and remain in those 2 directories.
`TrackingCapabilitiesCleanup-2026-09-15.json` records their hashes and sizes;
reclaim them when deletion is permitted. No bytes were reclaimed. Test sources
and runner remain canonical. The pinned OpenVR and JSON dependency checkouts were
initialized for validation and retained as required build inputs; other existing
source, resources, repositories, and unrelated work were preserved.
