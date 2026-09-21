#include "../src/Config/SteamVRSettingsJournal.h"
#include <iostream>
#include <functional>
#include <vector>

using gxrsettings::Json;
static int checks = 0;
static int failures = 0;
static void Check(bool success, const char* message) {
    ++checks;
    if (!success) { ++failures; std::cerr << "FAIL: " << message << '\n'; }
}
static Json Journal() {
    return {{"schema", 1}, {"driver", "GalaxyXRNative"}, {"entries", Json::object()}};
}
static bool Rejects(Json journal, const Json& settings = Json::object()) {
    try { gxrsettings::RecordChange(journal, settings, "driver_vrlink", "test", true, 42); }
    catch (const std::exception&) { return true; }
    return false;
}
int main() {
    auto journal = Journal();
    const Json absent = Json::object();
    gxrsettings::RecordChange(journal, absent, "driver_vrlink", "test", true, 42);
    Check(journal["entries"]["driver_vrlink"]["test"] == Json({{"present", false}, {"lastPresent", true}, {"lastValue", 42}}), "absent original retained as absence");
    Check(journal["sectionPresence"]["driver_vrlink"] == false, "absent section recorded");
    const Json changed = {{"driver_vrlink", {{"test", 42}, {"second", true}}}};
    gxrsettings::RecordChange(journal, changed, "driver_vrlink", "test", true, 99);
    Check(journal["entries"]["driver_vrlink"]["test"]["present"] == false, "repeat mutation preserves original absence");
    Check(journal["entries"]["driver_vrlink"]["test"]["lastValue"] == 99, "repeat mutation tracks latest intent");
    gxrsettings::RecordChange(journal, changed, "driver_vrlink", "second", false, nullptr);
    Check(journal["sectionPresence"]["driver_vrlink"] == false, "later key does not replace original section presence");
    Check(journal["entries"]["driver_vrlink"]["second"] == Json({{"present", true}, {"value", true}, {"lastPresent", false}}), "removal keeps original and omits lastValue");
    for (const auto& value : std::vector<Json>{nullptr, false, 0, 0.5, "original", Json::array({1, 2}), Json::object({{"a", 1}})}) {
        auto rawJournal = Journal();
        const Json raw = {{"driver_vrlink", {{"test", value}}}};
        gxrsettings::RecordChange(rawJournal, raw, "driver_vrlink", "test", true, 123);
        gxrsettings::RecordChange(rawJournal, changed, "driver_vrlink", "test", false, nullptr);
        const auto& entry = rawJournal["entries"]["driver_vrlink"]["test"];
        Check(entry["present"] == true && entry["value"] == value, "raw original survives overwrite then removal");
        Check(entry["lastPresent"] == false && !entry.contains("lastValue"), "removal clears previous latest value");
    }
    auto emptySectionJournal = Journal();
    gxrsettings::RecordChange(emptySectionJournal, {{"driver_vrlink", Json::object()}}, "driver_vrlink", "test", true, 1);
    Check(emptySectionJournal["sectionPresence"]["driver_vrlink"] == true, "original empty section retained");
    Check(Rejects(nullptr), "reject null journal");
    auto bad = Journal(); bad["schema"] = 2; Check(Rejects(bad), "reject unknown schema");
    bad = Journal(); bad["driver"] = "vrlink"; Check(Rejects(bad), "reject other driver journal");
    bad = Journal(); bad["entries"] = nullptr; Check(Rejects(bad), "reject invalid entries");
    bad = Journal(); bad["entries"]["driver_vrlink"] = false; Check(Rejects(bad), "reject invalid journal section");
    bad = Journal(); bad["entries"]["driver_vrlink"]["test"] = false; Check(Rejects(bad), "reject invalid entry");
    bad = Journal(); bad["entries"]["driver_vrlink"]["test"] = {{"present", "yes"}}; Check(Rejects(bad), "reject invalid original presence");
    bad = Journal(); bad["entries"]["driver_vrlink"]["test"] = {{"present", true}}; Check(Rejects(bad), "reject original present without value");
    bad = Journal(); bad["sectionPresence"] = nullptr; Check(Rejects(bad), "reject invalid sectionPresence map");
    bad = Journal(); bad["sectionPresence"]["driver_vrlink"] = "yes"; Check(Rejects(bad), "reject corrupt recorded section presence");
    bad = Journal(); bad["sectionPresence"]["other_section"] = 1; Check(Rejects(bad), "reject corrupt unrelated section presence");
    bad = Journal(); bad["entries"]["other_section"]["other_key"] = {{"present", false}, {"lastPresent", true}}; Check(Rejects(bad), "reject unrelated latest value missing");
    bad = Journal(); bad["entries"]["driver_vrlink"]["test"] = {{"present", false}, {"lastPresent", "yes"}}; Check(Rejects(bad), "reject invalid latest presence");
    bad = Journal(); bad["entries"]["driver_vrlink"]["test"] = {{"present", false}}; Check(Rejects(bad), "reject missing latest presence");
    Check(Rejects(Journal(), {{"driver_vrlink", nullptr}}), "reject raw non-object settings section");
    std::cout << (failures ? "FAIL: " : "PASS: ") << checks << " journal checks; " << failures << " failures.\n";
    return failures ? 1 : 0;
}
