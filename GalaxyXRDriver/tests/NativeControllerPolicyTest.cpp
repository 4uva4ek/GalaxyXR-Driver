// Offline checks for the native controller mode's runtime preset
// (Config/NativeControllerPolicy.h). no driver, no SteamVR.
#include "../src/Config/NativeControllerPolicy.h"
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
        // the preset touches nothing in any other mode
        Config c;
        c.streamFrame.velocityFixMode = 6;
        c.galaxyXr.gripConvention = true;
        c.galaxyXr.renderModelScale = 1.15;
        c.controllers.positionOffsetCm[0] = 0.5;
        gxr::ApplyNativeControllerPolicy(c);
        Check(!gxr::NativeControllerMode(c), "Kalman CA is not the native mode");
        Check(c.galaxyXr.gripConvention && c.galaxyXr.renderModelScale == 1.15 && c.controllers.positionOffsetCm[0] == 0.5, "other modes keep their controller settings");
    }
    {
        Config c;
        c.streamFrame.velocityFixMode = 7;
        c.galaxyXr.gripConvention = true;
        c.galaxyXr.officialComponents = false;
        c.galaxyXr.nativeIdentity = false;
        c.galaxyXr.nativeInputProfile = false;
        c.galaxyXr.renderModelScale = 1.15;
        c.galaxyXr.aimTrimYCm = -1.0;
        c.galaxyXr.meshOffsetZCm = 2.0;
        c.galaxyXr.handAnchorPitchDeg = 5.0;
        c.galaxyXr.controllerBypass = true;
        c.controllers.rotationOffsetDeg[1] = 5.0;
        c.controllers.positionOffsetCm[0] = 0.5;
        c.controllers.leftPositionOffsetCm[2] = -2.0;
        c.controllers.rightRotationOffsetDeg[0] = 3.0;
        const double jerk = c.streamFrame.kalmanCaJerk;
        gxr::ApplyNativeControllerPolicy(c);
        const auto& g = c.galaxyXr;
        Check(gxr::NativeControllerMode(c), "mode 7 is the native mode");
        Check(!g.gripConvention, "native: no grip convention shift");
        Check(g.officialComponents && !g.componentRebaseIncludeTrim, "native: Samsung's pose components as authored");
        Check(g.nativeIdentity && g.nativeInputProfile, "native: model and input profile are applied");
        Check(g.renderModelScale == 1.0, "native: model at its authored size");
        Check(g.aimTrimXCm == 0 && g.aimTrimYCm == 0 && g.aimTrimZCm == 0, "native: no aim trim");
        Check(g.meshOffsetXCm == 0 && g.meshOffsetYCm == 0 && g.meshOffsetZCm == 0, "native: no mesh offset");
        Check(g.handAnchorPitchDeg == 0, "native: no hand anchor");
        bool zero = true;
        for (int i = 0; i < 3; i++) {
            zero = zero && c.controllers.rotationOffsetDeg[i] == 0 && c.controllers.positionOffsetCm[i] == 0
                && c.controllers.leftRotationOffsetDeg[i] == 0 && c.controllers.leftPositionOffsetCm[i] == 0
                && c.controllers.rightRotationOffsetDeg[i] == 0 && c.controllers.rightPositionOffsetCm[i] == 0;
        }
        Check(zero, "native: no shared or per-hand pose trims");
        Check(g.controllerBypass, "native: controller bypass is left as chosen");
        Check(c.streamFrame.kalmanCaJerk == jerk && c.streamFrame.velocityFixMode == 7, "native: the Kalman CA tuning and the stored mode are untouched");
    }
    std::cout << checks << " checks, " << failures << " failures\n";
    return failures == 0 ? 0 : 1;
}
