// Offline checks for the Game Link layout: the runtime preset
// (Config/GameLinkLayoutPolicy.h) and the controller motion
// (Driver/GameLinkMotion.h). no driver, no SteamVR.
#include "../src/Config/GameLinkLayoutPolicy.h"
#include "../src/Driver/GameLinkMotion.h"
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
        Config c;
        c.galaxyXr.gripConvention = true;
        c.galaxyXr.officialComponents = false;
        c.galaxyXr.nativeIdentity = false;
        c.galaxyXr.nativeInputProfile = false;
        c.galaxyXr.renderModelScale = 1.15;
        c.galaxyXr.aimTrimYCm = -1.0;
        c.galaxyXr.meshOffsetZCm = 2.0;
        c.galaxyXr.handAnchorPitchDeg = 5.0;
        gxr::ApplyGameLinkLayoutPolicy(c);
        const auto& g = c.galaxyXr;
        Check(!g.gripConvention, "Game Link layout: no grip convention shift");
        Check(g.officialComponents && !g.componentRebaseIncludeTrim, "Game Link layout: Samsung's pose components as authored");
        Check(g.nativeIdentity && g.nativeInputProfile, "Game Link layout: model and input profile are applied");
        Check(g.renderModelScale == 1.0, "Game Link layout: model at its authored size");
        Check(g.aimTrimXCm == 0 && g.aimTrimYCm == 0 && g.aimTrimZCm == 0, "Game Link layout: no aim trim");
        Check(g.meshOffsetXCm == 0 && g.meshOffsetYCm == 0 && g.meshOffsetZCm == 0, "Game Link layout: no mesh offset");
        Check(g.handAnchorPitchDeg == 0, "Game Link layout: no hand anchor");
    }
    {
        // the shipped offsets pass through the policy untouched; no per-hand trim
        Config c;
        const ControllersConfig shipped;
        gxr::ApplyGameLinkLayoutPolicy(c);
        bool kept = true, zero = true;
        for (int i = 0; i < 3; i++) {
            kept = kept && c.controllers.rotationOffsetDeg[i] == shipped.rotationOffsetDeg[i] && c.controllers.positionOffsetCm[i] == shipped.positionOffsetCm[i];
            zero = zero && c.controllers.leftRotationOffsetDeg[i] == 0 && c.controllers.leftPositionOffsetCm[i] == 0
                && c.controllers.rightRotationOffsetDeg[i] == 0 && c.controllers.rightPositionOffsetCm[i] == 0;
        }
        Check(kept, "Game Link layout: the shipped shared offsets are kept");
        Check(zero, "Game Link layout: the per-hand offsets are zero by default");
        Check(c.streamFrame.gameLinkLinearVelocityCutoff == 0.05 && c.streamFrame.gameLinkAngularVelocityCutoffDeg == 10.0, "cutoff defaults are Samsung's values");
    }
    {
        // the user's offsets work on top of the layout
        Config c;
        c.controllers.mirrorOffsetsForRightHand = false;
        c.controllers.rotationOffsetDeg[1] = 5.0;
        c.controllers.positionOffsetCm[0] = 0.5;
        c.controllers.leftPositionOffsetCm[2] = -2.0;
        c.controllers.rightRotationOffsetDeg[0] = 3.0;
        gxr::ApplyGameLinkLayoutPolicy(c);
        const auto& k = c.controllers;
        Check(k.rotationOffsetDeg[1] == 5.0 && k.positionOffsetCm[0] == 0.5, "Game Link layout: the shared offsets are kept");
        Check(k.leftPositionOffsetCm[2] == -2.0 && k.rightRotationOffsetDeg[0] == 3.0, "Game Link layout: the per-hand offsets are kept");
        Check(!k.mirrorOffsetsForRightHand, "Game Link layout: the mirror choice is kept");
    }
    {
        // controller bypass: the layout still applies, without the driver's own corrections
        Config c;
        c.galaxyXr.controllerBypass = true;
        c.galaxyXr.gripConvention = true;
        c.galaxyXr.nativeIdentity = false;
        c.galaxyXr.synthesizeGripTouch = true;
        c.galaxyXr.skeletonOffsetZCm = 1.0;
        c.controllers.rotationOffsetDeg[1] = 5.0;
        c.controllers.leftPositionOffsetCm[2] = -2.0;
        c.controllers.rightRotationOffsetDeg[0] = 3.0;
        gxr::ApplyGameLinkLayoutPolicy(c);
        const auto& g = c.galaxyXr;
        Check(!g.controllerBypass && g.nativeIdentity && g.nativeInputProfile && !g.gripConvention, "bypass: the layout is applied");
        Check(!g.synthesizeGripTouch && g.skeletonOffsetZCm == 0, "bypass: no grip touch synthesis, no skeleton offset");
        Check(c.controllers.rotationOffsetDeg[1] == 0 && c.controllers.leftPositionOffsetCm[2] == 0 && c.controllers.rightRotationOffsetDeg[0] == 0, "bypass: no controller offsets");
    }
    {
        // cutoff: at or below the threshold is zero, above is untouched
        double still[3] = {0.03, 0.0, 0.04};
        Check(gxr::GameLinkVelocityCutoff(still, 0.05), "a velocity of exactly the cutoff is zeroed");
        Check(still[0] == 0 && still[1] == 0 && still[2] == 0, "zeroed velocity is all zero");
        double moving[3] = {0.03, 0.0, 0.041};
        Check(!gxr::GameLinkVelocityCutoff(moving, 0.05), "a velocity above the cutoff is kept");
        Check(moving[0] == 0.03 && moving[2] == 0.041, "kept velocity is untouched");
    }
    {
        // offsets: a controller-local angular velocity keeps its world
        // rotation rate when the pose carries another orientation
        const double h = std::sqrt(0.5);
        const double qStream[4] = {1, 0, 0, 0};       // stream: identity
        const double qOut[4] = {h, 0, h, 0};          // offset: 90deg about +Y
        const double p[3] = {1, 2, 3};
        double v[3] = {0.5, 0, 0};
        double w[3] = {2.0, 0.0, 0.0};                // world +X rate
        gxr::GameLinkOffsetVelocities(qStream, p, qOut, p, v, w);
        // local +Z of the offset orientation points along world +X
        Check(std::fabs(w[0]) < 1e-9 && std::fabs(w[1]) < 1e-9 && std::fabs(w[2] - 2.0) < 1e-9, "offsets: angular velocity is re-expressed in the offset orientation");
        Check(v[0] == 0.5 && v[1] == 0 && v[2] == 0, "offsets: a pure rotation offset leaves the linear velocity alone");
    }
    {
        // offsets: the moved origin rides the lever arm. spinning about
        // world +Y at 2 rad/s, origin moved 10cm along +X: v += w x d = -Z
        const double q[4] = {1, 0, 0, 0};
        const double p[3] = {0, 0, 0};
        const double pOut[3] = {0.1, 0, 0};
        double v[3] = {0, 0, 0};
        double w[3] = {0, 2.0, 0};
        gxr::GameLinkOffsetVelocities(q, p, q, pOut, v, w);
        Check(std::fabs(v[0]) < 1e-9 && std::fabs(v[1]) < 1e-9 && std::fabs(v[2] + 0.2) < 1e-9, "offsets: the moved origin gets the lever arm velocity");
        Check(w[0] == 0 && w[1] == 2.0 && w[2] == 0, "offsets: a pure position offset leaves the angular velocity alone");
    }
    {
        // rest smoothing: a still controller's noise is averaged down
        gxr::GameLinkSmoother s;
        const double still[3] = {0, 0, 0};
        double worst = 0;
        for (int i = 0; i < 400; i++) {
            double p[3] = {1.0 + ((i % 2) ? 0.001 : -0.001), 0, 0};   // 1 mm of alternating noise
            double q[4] = {1, 0, 0, 0};
            gxr::GameLinkSmooth(s, i / 360.0, 6.0, still, still, p, q);
            if (i > 100) worst = std::fmax(worst, std::fabs(p[0] - 1.0));
        }
        Check(worst < 0.0002, "smoothing: 1 mm of rest noise is cut to under 0.2 mm");
    }
    {
        // rest smoothing: a moving controller is not held back
        gxr::GameLinkSmoother s;
        const double v[3] = {2.0, 0, 0};
        const double w[3] = {0, 0, 0};
        double lag = 0;
        for (int i = 0; i < 200; i++) {
            const double t = i / 360.0;
            double p[3] = {2.0 * t, 0, 0};
            double q[4] = {1, 0, 0, 0};
            gxr::GameLinkSmooth(s, t, 6.0, v, w, p, q);
            lag = 2.0 * t - p[0];
        }
        Check(lag < 0.004, "smoothing: at 2 m/s the pose trails by under 4 mm");
    }
    {
        // rest smoothing: off, a gap and a jump all pass the raw pose
        gxr::GameLinkSmoother s;
        const double z[3] = {0, 0, 0};
        double p[3] = {1, 2, 3}; double q[4] = {1, 0, 0, 0};
        gxr::GameLinkSmooth(s, 1.0, 0.0, z, z, p, q);
        Check(!s.have && p[0] == 1, "smoothing: 0 Hz is off");
        gxr::GameLinkSmooth(s, 1.0, 6.0, z, z, p, q);
        double far[3] = {2, 2, 3};
        gxr::GameLinkSmooth(s, 1.003, 6.0, z, z, far, q);
        Check(far[0] == 2, "smoothing: a jump restarts on the raw pose");
        double later[3] = {2.01, 2, 3};
        gxr::GameLinkSmooth(s, 2.0, 6.0, z, z, later, q);
        Check(later[0] == 2.01, "smoothing: a gap restarts on the raw pose");
    }
    std::cout << checks << " checks, " << failures << " failures\n";
    return failures == 0 ? 0 : 1;
}
