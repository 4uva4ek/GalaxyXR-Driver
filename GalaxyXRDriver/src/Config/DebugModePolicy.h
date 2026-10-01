#pragma once
#include "Config.h"

namespace gxr {
inline bool DebugModeChanged(const Config& a, const Config& b) {
    const auto& x = a.streamFrame;
    const auto& y = b.streamFrame;
    return a.debugMode != b.debugMode || a.galaxyXr.vrlinkDebugOverlay != b.galaxyXr.vrlinkDebugOverlay
        || x.blackFloor.rampBar != y.blackFloor.rampBar || x.hitchDiag != y.hitchDiag
        || x.eyeGaze.debugRing != y.eyeGaze.debugRing || x.poseLogging != y.poseLogging
        || x.poseLogBurst != y.poseLogBurst || x.nvencVerbose != y.nvencVerbose;
}
// 2026-10-01: apply only to the runtime copy, after all persisted migrations.
// Normal picture/encoder tuning stays effective while diagnostic work is OFF.
inline void ApplyDebugModePolicy(Config& config) {
    if (config.debugMode) return;
    config.galaxyXr.vrlinkDebugOverlay = false;
    auto& sf = config.streamFrame;
    sf.blackFloor.rampBar = false;
    sf.hitchDiag = false;
    sf.eyeGaze.debugRing = false;
    sf.poseLogging = false;
    sf.poseLogBurst = false;
    sf.nvencVerbose = false;
}
}
