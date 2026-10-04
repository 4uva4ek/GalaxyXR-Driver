#pragma once
#include "Config.h"

namespace gxr {
// 2026-10-04: the Game Link layout places and identifies the streamed
// controllers the way Samsung's own PC driver (Game Link / XR Link,
// driver_SamsungVST.dll 1.22) does. it is the only layout: applied to the
// runtime copy on every load, after all persisted migrations.
//   pose      vrlink's raw as it comes, no grip convention shift. Samsung's
//             driver builds its raw from the headset's grip pose (rotate X
//             -20deg, then 11cm along -Z); vrlink already delivers that
//             Touch-style raw (field 2026-10-04: the controllers sit right
//             with no offset, bar a slight rotation). the controller
//             offsets (ControllersConfig: shared and per-hand) correct that
//             residual and carry the user's trim on top of it.
//   model     Samsung's shell at its authored size, its pose components as
//             authored (no rebase, no aim trim, no mesh shift, no hand_anchor)
//   identity  Samsung's input profile and controller type (samsung_touch),
//             chosen in GalaxyXRControllerShim::ApplyIdentity
//   motion    the stream's velocities, reported the way Samsung's driver
//             reports its own (Driver/GameLinkMotion.h)
// with controllerBypass the layout still applies, bare: Samsung's identity,
// model and pose components on vrlink's untouched pose, with none of the
// driver's own corrections (the offsets, the skeleton offset, the grip touch
// synthesis). the runtime copy drops the bypass flag so the shim and the
// pose path run; everything the bypass stands for is zeroed here.
inline void ApplyGameLinkLayoutPolicy(Config& config) {
    auto& g = config.galaxyXr;
    auto& c = config.controllers;
    if (g.controllerBypass) {
        g.controllerBypass = false;
        g.synthesizeGripTouch = false;
        g.skeletonOffsetXCm = g.skeletonOffsetYCm = g.skeletonOffsetZCm = 0.0;
        for (int i = 0; i < 3; i++) {
            c.rotationOffsetDeg[i] = c.positionOffsetCm[i] = 0.0;
            c.leftRotationOffsetDeg[i] = c.leftPositionOffsetCm[i] = 0.0;
            c.rightRotationOffsetDeg[i] = c.rightPositionOffsetCm[i] = 0.0;
        }
    }
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
}
}
