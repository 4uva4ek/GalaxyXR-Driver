#pragma once

#include <openvr_driver.h>

class GalaxyXRDeviceProvider;

static void DetourTrackedDevicePoseUpdated(vr::IVRServerDriverHost * _this, uint32_t unWhichDevice, const vr::DriverPose_t & newPose, uint32_t unPoseStructSize);

void InjectHooks(GalaxyXRDeviceProvider *driver, vr::IVRDriverContext *pDriverContext);
void DisableHooks();