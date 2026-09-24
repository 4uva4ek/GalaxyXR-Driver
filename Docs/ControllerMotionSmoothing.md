# Controller motion smoothing — 2026-09-24

Ports the controller motion changes from 4uva4ek/CustomHeadsetOpenVrGxR commit
c29b0d1a27fd6bd2b1e3e5fb6416cf18278eeff9 to GalaxyXRDriver 1.2.8.

In Kalman CA-full mode, with acceleration reporting disabled and fixed-lag
smoothing at zero, both position and rotation receive a 30 ms exponential output
filter. Linear velocity follows the actual smoothed position increment; rotation
uses the shortest quaternion arc and derives angular velocity before conversion
to the configured output frame. This deliberately adds motion latency.
Initialization/reacquisition clears filter history; callback gaps over 100 ms
initialize output from the current pose instead of interpolating stale state.

Fresh measurements indicating slowing schedule continuous linear momentum
braking instead of increasing the position correction gain. Repeated payloads do
not schedule new braking. The angular channel has its own accepted-quaternion
clock and reduces reported prediction velocity by at most 30% while braking,
without directly pulling orientation back. Acceleration-reporting and fixed-lag
paths retain their existing behavior.

The upstream early return for native hands is retained, so their pose, timing and
velocities bypass these controller filters. No settings schema, defaults, version
number, encoder, identity, or installation paths are changed.

## Validation

- Full `powershell -NoProfile -ExecutionPolicy Bypass -File tools/Build-Portable.ps1`
  completed successfully for the Galaxy XR driver and Companion GUI.
- `node tools/Test-ControllerMotion.cjs` in an x64 MSVC developer shell compiles
  production helper/output blocks and checks shortest-arc quaternion behavior,
  normalization, 30 ms response and velocity consistency, gap resets, mode
  exclusions, braking guards/bounds, the angular prediction limit and zero-output
  mode. It also checks that the upstream native-hand early return remains.
- `npm test` in `GalaxyXRDriverGUI`: 116 tests passed.
- `node tools/Test-GuiReadiness.cjs`: 36 tests passed.

These are build/offline checks. This port has not yet been evaluated in a headset;
throw behavior, perceived delay and stopping feel still need a live trial.
