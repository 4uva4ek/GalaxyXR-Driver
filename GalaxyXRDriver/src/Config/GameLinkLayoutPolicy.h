#pragma once
#include "Config.h"

namespace gxr {
// 2026-10-04: Controller Fix Mode "kalmanCAGameLink" (velocityFixMode 7,
// shown as "Kalman CA (Game Link layout)") is Kalman CA that places and
// identifies the streamed controllers the way Samsung's own PC driver (Game
// Link / XR Link, driver_SamsungVST.dll 1.22) does. Applied only to the
// runtime copy, after all persisted migrations: the stored choices come back
// the moment another mode is selected.
//   pose      vrlink's raw as it comes: no grip convention shift, no shared
//             or per-hand trims. Samsung's driver builds its raw from the
//             headset's grip pose (rotate X -20deg, then 11cm along -Z);
//             vrlink already delivers that Touch-style raw (field 2026-10-04:
//             the controllers sit right with no offset).
//   model     Samsung's shell at its authored size, its pose components as
//             authored (no rebase, no aim trim, no mesh shift, no hand_anchor)
//   identity  Samsung's input profile and controller type (samsung_touch),
//             chosen in GalaxyXRControllerShim::ApplyIdentity
//   motion    Kalman CA with its tuning (DeviceProvider). Samsung's driver
//             reports its headset's velocities unfiltered; vrlink's, reported
//             the same way, threw sideways in Half-Life: Alyx.
// controllerBypass still wins: with it on the controllers stay vrlink's.
inline bool GameLinkLayoutMode(const Config& config) {
    return config.streamFrame.velocityFixMode == 7;
}
inline void ApplyGameLinkLayoutPolicy(Config& config) {
    if (!GameLinkLayoutMode(config)) return;
    auto& g = config.galaxyXr;
    g.gripConvention = false;
    g.officialComponents = true;
    g.componentRebaseIncludeTrim = false;
    g.nativeIdentity = true;
    g.nativeInputProfile = true;
    g.renderModelScale = 1.0;
    g.aimTrimXCm = g.aimTrimYCm = g.aimTrimZCm = 0.0;
    g.meshOffsetXCm = g.meshOffsetYCm = g.meshOffsetZCm = 0.0;
    g.handAnchorXCm = g.handAnchorYCm = g.handAnchorZCm = 0.0;
    g.handAnchorPitchDeg = g.handAnchorYawDeg = g.handAnchorRollDeg = 0.0;
    auto& c = config.controllers;
    for (int i = 0; i < 3; i++) {
        c.rotationOffsetDeg[i] = c.positionOffsetCm[i] = 0.0;
        c.leftRotationOffsetDeg[i] = c.leftPositionOffsetCm[i] = 0.0;
        c.rightRotationOffsetDeg[i] = c.rightPositionOffsetCm[i] = 0.0;
    }
}
}
