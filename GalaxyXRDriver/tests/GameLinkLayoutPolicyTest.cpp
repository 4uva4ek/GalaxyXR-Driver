// Offline checks for the Game Link layout toggle: the runtime preset
// (Config/GameLinkLayoutPolicy.h), the velocity cutoff and the rest smoothing
// (Driver/GameLinkMotion.h), Velocity Only's angular rebase
// (Driver/VelocityOnly.h). no driver, no SteamVR.
#include "../src/Config/GameLinkLayoutPolicy.h"
#include "../src/Driver/GameLinkMotion.h"
#include "../src/Driver/VelocityOnly.h"
#include <cmath>
#include <iostream>
#include <string>

namespace {
int checks = 0;
int failures = 0;
void Check(bool condition, const std::string& description) {
    ++checks;
    if (!condition) {
        ++failures;
        std::cerr << "FAIL: " << description << '\n';
    }
}
} // namespace

int main() {
    {
        // the preset touches nothing while the toggle is off
        Config c;
        c.streamFrame.velocityFixMode = 6;
        c.galaxyXr.gripConvention = true;
        c.galaxyXr.renderModelScale = 1.15;
        c.controllers.positionOffsetCm[0] = 0.5;
        gxr::ApplyGameLinkLayoutPolicy(c);
        Check(!gxr::GameLinkLayoutMode(c), "the Game Link layout is off by default");
        Check(c.galaxyXr.gripConvention && c.galaxyXr.renderModelScale == 1.15 && c.controllers.positionOffsetCm[0] == 0.5, "toggle off: the controller settings are kept");
    }
    {
        Config c;
        c.galaxyXr.gameLinkLayout = true;
        c.galaxyXr.gripConvention = true;
        c.galaxyXr.officialComponents = false;
        c.galaxyXr.nativeIdentity = false;
        c.galaxyXr.nativeInputProfile = false;
        c.galaxyXr.renderModelScale = 1.15;
        c.galaxyXr.aimTrimYCm = -1.0;
        c.galaxyXr.meshOffsetZCm = 2.0;
        c.galaxyXr.handAnchorPitchDeg = 5.0;
        c.controllers.rotationOffsetDeg[1] = 5.0;
        c.controllers.positionOffsetCm[0] = 0.5;
        c.controllers.leftPositionOffsetCm[2] = -2.0;
        c.controllers.rightRotationOffsetDeg[0] = 3.0;
        const double jerk = c.streamFrame.kalmanCaJerk;
        gxr::ApplyGameLinkLayoutPolicy(c);
        const auto& g = c.galaxyXr;
        Check(gxr::GameLinkLayoutMode(c), "the toggle turns the Game Link layout on");
        Check(!g.gripConvention, "Game Link layout: no grip convention shift");
        Check(g.officialComponents && !g.componentRebaseIncludeTrim, "Game Link layout: Samsung's pose components as authored");
        Check(g.nativeIdentity && g.nativeInputProfile, "Game Link layout: model and input profile are applied");
        Check(g.renderModelScale == 1.0, "Game Link layout: model at its authored size");
        Check(g.aimTrimXCm == 0 && g.aimTrimYCm == 0 && g.aimTrimZCm == 0, "Game Link layout: no aim trim");
        Check(g.meshOffsetXCm == 0 && g.meshOffsetYCm == 0 && g.meshOffsetZCm == 0, "Game Link layout: no mesh offset");
        Check(g.handAnchorPitchDeg == 0, "Game Link layout: no hand anchor");
        const Config d;
        bool zero = true;
        for (int i = 0; i < 3; i++) {
            zero = zero && c.controllers.rotationOffsetDeg[i] == d.controllers.gameLinkRotationOffsetDeg[i]
                && c.controllers.positionOffsetCm[i] == d.controllers.gameLinkPositionOffsetCm[i]
                && c.controllers.leftRotationOffsetDeg[i] == 0 && c.controllers.leftPositionOffsetCm[i] == 0
                && c.controllers.rightRotationOffsetDeg[i] == 0 && c.controllers.rightPositionOffsetCm[i] == 0;
        }
        Check(zero, "Game Link layout: its default trim replaces the shared offsets, no per-hand trims");
        Check(c.controllers.mirrorOffsetsForRightHand, "Game Link layout: its trim is mirrored for the right hand");
        Check(c.streamFrame.kalmanCaJerk == jerk && c.streamFrame.velocityFixMode == 6, "Game Link layout: the Kalman CA tuning and the mode are untouched");
    }
    {
        // the layout's own trim replaces the shared offsets, mirrored
        Config c;
        c.galaxyXr.gameLinkLayout = true;
        c.controllers.mirrorOffsetsForRightHand = false;
        c.controllers.rotationOffsetDeg[1] = 5.0;
        c.controllers.positionOffsetCm[0] = 0.5;
        c.controllers.leftRotationOffsetDeg[1] = 2.0;
        for (int i = 0; i < 3; i++) {
            c.controllers.gameLinkRotationOffsetDeg[i] = 0.0;
            c.controllers.gameLinkPositionOffsetCm[i] = 0.0;
        }
        c.controllers.gameLinkRotationOffsetDeg[1] = -3.0;
        c.controllers.gameLinkPositionOffsetCm[2] = 1.0;
        gxr::ApplyGameLinkLayoutPolicy(c);
        const auto& k = c.controllers;
        Check(k.rotationOffsetDeg[0] == 0 && k.rotationOffsetDeg[1] == -3.0 && k.rotationOffsetDeg[2] == 0, "Game Link layout: its rotation trim is the shared rotation offset");
        Check(k.positionOffsetCm[0] == 0 && k.positionOffsetCm[1] == 0 && k.positionOffsetCm[2] == 1.0, "Game Link layout: its position trim is the shared position offset");
        Check(k.mirrorOffsetsForRightHand && k.leftRotationOffsetDeg[1] == 0, "Game Link layout: its trim is mirrored and the per-hand trims stay out");
    }
    {
        // controller bypass: the layout still applies, without the driver's own corrections
        Config c;
        c.galaxyXr.gameLinkLayout = true;
        c.galaxyXr.controllerBypass = true;
        c.galaxyXr.gripConvention = true;
        c.galaxyXr.nativeIdentity = false;
        c.galaxyXr.synthesizeGripTouch = true;
        c.galaxyXr.skeletonOffsetZCm = 1.0;
        c.controllers.gameLinkRotationOffsetDeg[1] = -3.0;
        c.controllers.gameLinkPositionOffsetCm[2] = 1.0;
        gxr::ApplyGameLinkLayoutPolicy(c);
        const auto& g = c.galaxyXr;
        Check(!g.controllerBypass && g.nativeIdentity && g.nativeInputProfile && !g.gripConvention, "bypass + Game Link layout: the layout is applied");
        Check(!g.synthesizeGripTouch && g.skeletonOffsetZCm == 0, "bypass + Game Link layout: no grip touch synthesis, no skeleton offset");
        Check(c.controllers.rotationOffsetDeg[1] == -3.0 && c.controllers.positionOffsetCm[2] == 1.0, "bypass + Game Link layout: the layout trim still applies");
    }
    {
        // bypass alone is left as chosen
        Config c;
        c.galaxyXr.controllerBypass = true;
        gxr::ApplyGameLinkLayoutPolicy(c);
        Check(c.galaxyXr.controllerBypass, "toggle off: controller bypass is left as chosen");
    }
    {
        // cutoff: at or below the threshold is zero, above is untouched
        double still[3] = {0.03, 0.0, 0.04};
        Check(gxr::GameLinkVelocityCutoff(still, 0.05), "a velocity of exactly the cutoff is zeroed");
        Check(still[0] == 0 && still[1] == 0 && still[2] == 0, "zeroed velocity is all zero");
        double moving[3] = {0.03, 0.0, 0.041};
        Check(!gxr::GameLinkVelocityCutoff(moving, 0.05), "a velocity above the cutoff is kept");
        Check(moving[0] == 0.03 && moving[2] == 0.041, "kept velocity is untouched");
        Config c;
        Check(c.streamFrame.gameLinkLinearVelocityCutoff == 0.05 && c.streamFrame.gameLinkAngularVelocityCutoffDeg == 10.0, "cutoff defaults are Samsung's values");
    }
    {
        // Velocity Only: a controller-local angular velocity keeps its world
        // rotation rate when the pose carries another orientation
        const double h = std::sqrt(0.5);
        const double qEst[4] = {1, 0, 0, 0};          // estimator: identity
        const double qStream[4] = {h, 0, h, 0};       // stream: 90deg about +Y
        double w[3] = {2.0, 0.0, 0.0};                // world +X rate
        gxr::VelocityOnlyRebaseAngular(qEst, qStream, w);
        // local +Z of the stream orientation points along world +X
        Check(std::fabs(w[0]) < 1e-9 && std::fabs(w[1]) < 1e-9 && std::fabs(w[2] - 2.0) < 1e-9, "Velocity Only: angular velocity is re-expressed in the stream's orientation");
        double same[3] = {0.3, -1.0, 2.0};
        gxr::VelocityOnlyRebaseAngular(qStream, qStream, same);
        Check(std::fabs(same[0] - 0.3) < 1e-9 && std::fabs(same[1] + 1.0) < 1e-9 && std::fabs(same[2] - 2.0) < 1e-9, "Velocity Only: equal orientations leave it unchanged");
    }
    {
        // rest smoothing: a still controller's jitter is damped, motion passes
        gxr::GameLinkSmoother s;
        const double zero[3] = {0, 0, 0};
        double p0[3] = {0, 0, 0};
        double q0[4] = {1, 0, 0, 0};
        gxr::GameLinkSmooth(s, 0.0, 6.0, zero, zero, p0, q0);
        double p1[3] = {0.002, 0, 0};                 // 2 mm jitter, 11 ms later
        double q1[4] = {1, 0, 0, 0};
        gxr::GameLinkSmooth(s, 0.011, 6.0, zero, zero, p1, q1);
        Check(p1[0] > 0 && p1[0] < 0.001, "rest smoothing: jitter at rest is damped");
        gxr::GameLinkSmoother m;
        double a0[3] = {0, 0, 0};
        gxr::GameLinkSmooth(m, 0.0, 6.0, zero, zero, a0, q0);
        const double fast[3] = {2.0, 0, 0};           // 2 m/s
        double a1[3] = {0.022, 0, 0};
        double qa[4] = {1, 0, 0, 0};
        gxr::GameLinkSmooth(m, 0.011, 6.0, fast, zero, a1, qa);
        Check(a1[0] > 0.02, "rest smoothing: fast motion passes almost unchanged");
        gxr::GameLinkSmoother off;
        double o0[3] = {0, 0, 0};
        gxr::GameLinkSmooth(off, 0.0, 0.0, zero, zero, o0, q0);
        double o1[3] = {0.002, 0, 0};
        double qo[4] = {1, 0, 0, 0};
        gxr::GameLinkSmooth(off, 0.011, 0.0, zero, zero, o1, qo);
        Check(o1[0] == 0.002, "rest smoothing: 0 Hz is off");
        Config c;
        Check(c.streamFrame.controllerSmoothingHz == 6.0, "rest smoothing default is 6 Hz");
    }
    std::cout << checks << " checks, " << failures << " failures\n";
    return failures == 0 ? 0 : 1;
}
