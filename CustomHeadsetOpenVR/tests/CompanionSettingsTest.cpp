#include "../src/Config/VrlinkSettingsRouting.h"
#include "../src/Config/SdrColorPolicy.h"
#include "../src/Config/SteamVRSettingsJournal.h"
#include "../src/Headsets/GalaxyXRStatusIcons.h"
#include <iostream>
#include <set>
#include <vector>
using gxrsettings::Json;
static int checks = 0, failures = 0;
static void Check(bool result, const char* description) {
    ++checks;
    if(!result) { ++failures; std::cerr << "FAIL: " << description << '\n'; }
}
int main() {
    const std::vector<std::string> models = {"", "xrvst2ue", "Galaxy XR", "Patched Quest Identity"};
    for(const auto& model : models) {
        Check(gxr::VrlinkCapabilitySection(true, model) == "vrlink_xrvst2ue", "ON always uses exact Galaxy capability section");
        Check(gxr::VrlinkCapabilitySection(false, model) == "vrlink_" + (model.empty() ? "xrvst2ue" : model), "OFF preserves original-model capability destination");
        for(bool baseline : {false, true}) for(bool profile : {false, true}) {
            Config config{}; config.galaxyXr.sdr10Baseline = baseline; config.galaxyXr.vrlinkHeadsetProfile = profile;
            const auto policy = gxr::ResolveSdr10Policy(config);
            Check(std::string(gxr::VrlinkTuningSection(profile)) == (profile ? "vrlink_xrvst2ue" : "driver_vrlink"), "tuning routing is independent of baseline");
            Check(!baseline || policy.profileEnabled, "baseline still requests legacy capabilities when profile is off");
            Check(config.galaxyXr.vrlinkHeadsetProfile == profile, "resolver does not change the saved profile switch");
        }
    }
    // Picture modes are mutually exclusive even for an old/external file
    // containing both flags. Do not mutate stored state during evaluation.
    for(bool baseline : {false, true}) for(bool enhancements : {false, true}) {
        Config config{};
        config.galaxyXr.sdr10Baseline = baseline;
        config.streamFrame.enable = enhancements;
        config.customShader.enableForOther = false;
        const auto policy = gxr::ResolveSdr10Policy(config);
        Check(gxr::ImageEnhancementsEnabled(config.streamFrame, policy) == (enhancements && !baseline), "baseline/master truth table gates all enhancement passes");
        Check(config.streamFrame.enable == enhancements, "runtime mode gate does not rewrite stored master");
        Check(config.galaxyXr.sdr10Baseline == baseline, "runtime mode gate preserves stored baseline");
        Check(!baseline || (policy.active && policy.profileSupports10bit), "baseline still requests 10-bit with enhancements bypassed");
    }
    {
        Config config{};
        config.galaxyXr.sdr10Baseline = true;
        config.streamFrame.enable = true;
        config.customShader.enable = true;
        config.customShader.enableForOther = true;
        const auto policy = gxr::ResolveSdr10Policy(config);
        Check(policy.conflict && !policy.active, "external custom-shader conflict remains detectable");
        Check(!gxr::ImageEnhancementsEnabled(config.streamFrame, policy), "requested baseline still disables normal enhancements in conflict");
    }
    Check(gxr::IsVrlinkCapabilityKey("supports10bit"), "supports10bit is classified as a capability");
    Check(gxr::IsVrlinkTuningKey("overrideRenderHeight"), "render height follows tuning route");
    Check(!gxr::IsVrlinkTuningKey("enable"), "driver enablement is not profile tuning");
    Check(!gxr::IsVrlinkTuningKey("blocked_by_safe_mode"), "safe-mode protection is not moved");
    Check(!gxr::IsVrlinkSettingsSection("steamvr"), "SteamVR global keys remain global");
    Check(!gxr::IsVrlinkSettingsSection("driver_GalaxyXRNative"), "Galaxy driver registration remains separate");
    Check(gxr::IsVrlinkSettingsSection("vrlink_xrvst2ue"), "Galaxy profile is eligible for owned-key restoration");
    Check(gxr::IsVrlinkSettingsSection("driver_vrlink"), "legacy tuning section is eligible");
    Check(gxr::ShouldRestoreInactiveVrlinkKey("driver_vrlink", "customOldExpertKey", true, "Patched"), "historical expert key is restored from inactive global route");
    Check(!gxr::ShouldRestoreInactiveVrlinkKey("driver_vrlink", "enable", true, "Patched"), "driver enablement remains untouched during route cleanup");
    Check(!gxr::ShouldRestoreInactiveVrlinkKey("vrlink_Patched", "supports10bit", false, ""), "early OFF routing does not guess and erase previous patched profile");
    Check(gxr::ShouldRestoreInactiveVrlinkKey("vrlink_Patched", "supports10bit", true, "Patched"), "ON routes old patched capability keys to exact Galaxy section");
    Check(!gxr::ShouldRestoreInactiveVrlinkKey("vrlink_xrvst2ue", "targetBandwidth", true, "Patched"), "selected profile is never cleaned as inactive");
    Check(gxr::ShouldRestoreInactiveVrlinkKey("vrlink_xrvst2ue", "targetBandwidth", false, "Patched"), "OFF releases previously profile-scoped tuning");
    Check(!gxr::ShouldRestoreInactiveVrlinkKey("steamvr", "preferredRefreshRate", true, "Patched"), "global compositor refresh is not relocated");
    bool present = true; Json value;
    const Json saved = {{"present", false}, {"lastPresent", true}, {"lastValue", 42}};
    Check(gxrsettings::PlanOwnedRestore(saved, {{"driver_vrlink", {{"test", 42}}}}, "driver_vrlink", "test", present, value) && !present, "unchanged journal-owned insertion is removed");
    Check(!gxrsettings::PlanOwnedRestore(saved, {{"driver_vrlink", {{"test", 43}}}}, "driver_vrlink", "test", present, value), "external changed value is preserved");
    Check(!gxrsettings::PlanOwnedRestore(saved, Json::object(), "driver_vrlink", "test", present, value), "external key removal is preserved");
    for(const auto& original : std::vector<Json>{false, true, 7, 0.5, "old"}) {
        Json entry = {{"present", true}, {"value", original}, {"lastPresent", true}, {"lastValue", 42}};
        Check(gxrsettings::PlanOwnedRestore(entry, {{"driver_vrlink", {{"test", 42}}}}, "driver_vrlink", "test", present, value)
            && present && value == original, "each supported original scalar is restored exactly");
        entry["lastPresent"] = false; entry.erase("lastValue");
        Check(gxrsettings::PlanOwnedRestore(entry, Json::object(), "driver_vrlink", "test", present, value)
            && present && value == original, "journal-owned deletion restores its original");
    }
    for(const auto& original : std::vector<Json>{nullptr, Json::array({1,2}), Json::object({{"x", 1}}), 99999999999LL}) {
        Json entry = {{"present", true}, {"value", original}, {"lastPresent", true}, {"lastValue", 42}};
        Check(!gxrsettings::PlanOwnedRestore(entry, {{"driver_vrlink", {{"test", 42}}}}, "driver_vrlink", "test", present, value), "unsupported original is preserved for manual recovery");
    }
    const Json restored = {{"present", true}, {"value", 5}, {"lastPresent", true}, {"lastValue", 5}};
    Check(!gxrsettings::PlanOwnedRestore(restored, {{"driver_vrlink", {{"test", 5}}}}, "driver_vrlink", "test", present, value), "already-restored value is not rewritten");
    for(const auto& bad : std::vector<Json>{nullptr, false, Json::object(), Json{{"present", true}, {"lastPresent", true}}}) {
        bool rejected = false;
        try { gxrsettings::PlanOwnedRestore(bad, Json::object(), "driver_vrlink", "test", present, value); }
        catch(const std::exception&) { rejected = true; }
        Check(rejected, "corrupt recovery entries are rejected before mutation");
    }
    std::set<int> properties;
    for(const auto& icon : gxr::kHeadsetStatusIcons) {
        Check(properties.insert(icon.property).second, "each SteamVR icon property is unique");
        Check(std::string(icon.file).rfind("headset_galaxy_xr_", 0) == 0, "driver uses supplied HMD artwork names");
    }
    Check(properties.size() == 9, "all nine SteamVR status-icon properties are covered");
    #ifdef VENDOR_GALAXYXR
    Check(Config{}.galaxyXr.nativeIdentity, "native identity defaults ON for Galaxy vendor");
    #else
    Check(!Config{}.galaxyXr.nativeIdentity, "neutral vendor identity remains unchanged");
    #endif
    Check(Config{}.galaxyXr.vrlinkHeadsetProfile, "headset profile defaults ON");
    std::cout << (failures ? "FAIL: " : "PASS: ") << checks << " companion settings checks, " << failures << " failures.\n";
    return failures ? 1 : 0;
}
