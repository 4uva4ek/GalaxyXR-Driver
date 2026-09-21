#pragma once
#include <string>

// UI profile enablement selects a DESTINATION. It is deliberately independent
// from Sdr10BaselinePolicy::profileEnabled (the baseline can request 10-bit
// capabilities even when the saved profile switch is off).
namespace gxr {
inline constexpr const char* kGalaxyProfileSection = "vrlink_xrvst2ue";
inline const char* VrlinkTuningSection(bool useGalaxyProfile) {
    return useGalaxyProfile ? kGalaxyProfileSection : "driver_vrlink";
}
inline std::string VrlinkCapabilitySection(bool useGalaxyProfile, const std::string& originalModel) {
    // OFF preserves the previous per-model capability/baseline destination.
    return useGalaxyProfile ? kGalaxyProfileSection : "vrlink_" + (originalModel.empty() ? "xrvst2ue" : originalModel);
}
inline bool IsVrlinkCapabilityKey(const std::string& key) {
    return key == "recommendedRenderWidth" || key == "recommendedRenderHeight"
        || key == "supports10bit" || key == "minStreamFormatWidth" || key == "maxStreamFormatWidth"
        || key == "minNonFoveatedStreamFormatWidth" || key == "maxNonFoveatedStreamFormatWidth";
}
inline bool IsVrlinkTuningKey(const std::string& key) {
    return key == "encodeWidth" || key == "streamFormatWidth" || key == "automaticStreamFormatWidth"
        || key == "automaticBandwidth" || key == "recommendedBandwidthMbit" || key == "targetBandwidth"
        || key == "renderWidth" || key == "renderHeight" || key == "overrideRenderWidth"
        || key == "overrideRenderHeight" || key == "displayFrequency" || key == "debugRegionColoring"
        || key == "showAdvancedGraphs" || key == "force10bit" || key == "maxVideoQueueLatencyUs"
        || key == "backoffRecoveryCoefficient";
}
inline bool IsVrlinkReservedKey(const std::string& key) {
    return key == "enable" || key == "blocked_by_safe_mode" || key == "hasBeenRun";
}
inline bool IsVrlinkSettingsSection(const std::string& section) {
    return section == "driver_vrlink" || section.rfind("vrlink_", 0) == 0;
}
// Used ONLY for keys already present in this driver's recovery journal.
// Include historical expert keys even if they are no longer in the current UI.
inline bool ShouldRestoreInactiveVrlinkKey(const std::string& section, const std::string& key,
    bool useGalaxyProfile, const std::string& originalModel) {
    if(!IsVrlinkSettingsSection(section) || IsVrlinkReservedKey(key)) return false;
    if(IsVrlinkCapabilityKey(key)) {
        // Before HMD activation, an OFF route does not yet know the patched
        // model. Do not remove its previous profile using a guessed fallback.
        return (useGalaxyProfile || !originalModel.empty())
            && section != VrlinkCapabilitySection(useGalaxyProfile, originalModel);
    }
    return section != VrlinkTuningSection(useGalaxyProfile);
}
} // namespace gxr
