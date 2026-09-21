#pragma once
#include "openvr_driver.h"

// Original supplied assets, not the application's square taskbar icon.
// Keep the matching _2x files beside these resources for high-DPI SteamVR UI.
namespace gxr {
struct StatusIcon { vr::ETrackedDeviceProperty property; const char* file; };
inline constexpr StatusIcon kHeadsetStatusIcons[] = {
    {vr::Prop_NamedIconPathDeviceOff_String, "headset_galaxy_xr_off.png"},
    {vr::Prop_NamedIconPathDeviceSearching_String, "headset_galaxy_xr_searching.gif"},
    {vr::Prop_NamedIconPathDeviceSearchingAlert_String, "headset_galaxy_xr_alert_searching.gif"},
    {vr::Prop_NamedIconPathDeviceReady_String, "headset_galaxy_xr_ready.png"},
    {vr::Prop_NamedIconPathDeviceReadyAlert_String, "headset_galaxy_xr_ready_alert.png"},
    {vr::Prop_NamedIconPathDeviceNotReady_String, "headset_galaxy_xr_error.png"},
    {vr::Prop_NamedIconPathDeviceStandby_String, "headset_galaxy_xr_standby.png"},
    // The supplied set has no distinct standby-alert or low-battery image.
    {vr::Prop_NamedIconPathDeviceStandbyAlert_String, "headset_galaxy_xr_standby.png"},
    {vr::Prop_NamedIconPathDeviceAlertLow_String, "headset_galaxy_xr_ready_alert.png"},
};
} // namespace gxr
