#include "DeviceProvider.h"
#include "DriverLog.h"
#include "DriverLockout.h"
#include "DeviceShim.h"
#include "EyeTrackingTap.h"
#include "CompositorPlugin.h"
#include "HidModifier.h"
#include "FrameProcessor.h"

#include "Hooking/InterfaceHookInjector.h"

#include "../Headsets/GalaxyXR.h"
#include "../Headsets/GenericHeadset.h"
#include "../Headsets/FakeHeadset.h"
#include "../Helpers/EyeTrackingOutput.h"

#include "../Config/ConfigLoader.h"

#include <chrono>
#include <cmath>
#include <cstring>
#include <filesystem>
#ifdef _WIN32
#include <Windows.h>
#else
#include <unistd.h>
#endif

// set when this vendor-specific driver detected that the vendor-neutral
// CustomHeadsetOpenVR driver is enabled. all driver activity is skipped.
bool lockedOut = false;

// general driver functions
vr::EVRInitError GalaxyXRDeviceProvider::Init(vr::IVRDriverContext *pDriverContext){
	// initialise this driver
	VR_INIT_SERVER_DRIVER_CONTEXT(pDriverContext);
	
	// discover the name this driver is registered under (CustomHeadsetOpenVR or GalaxyXRNative)
	// so resource paths and settings sections work in both neutral and vendor builds
	vr::DriverHandle_t driverHandle = vr::VRDriverHandle();
	std::string driverName;
	uint32_t driverCount = vr::VRDriverManager()->GetDriverCount();
	for(uint32_t i = 0; i < driverCount; i++){
		char name[128];
		vr::VRDriverManager()->GetDriverName(i, name, sizeof(name));
		if(vr::VRDriverManager()->GetDriverHandle(name) == driverHandle){
			driverName = name;
			break;
		}
	}
	if(driverName.empty()){
		driverName = driverConfigLoader.info.driverName;
		DriverLog("Could not discover driver name from handle, falling back to %s", driverName.c_str());
	}
	driverConfigLoader.info.driverName = driverName;
#ifdef _WIN32
	driverConfigLoader.info.runtimeProcessId = static_cast<uint32_t>(GetCurrentProcessId());
#else
	driverConfigLoader.info.runtimeProcessId = static_cast<uint32_t>(getpid());
#endif
	driverConfigLoader.info.runtimeInitialized = false;
	driverConfigLoader.info.runtimeLockedOut = false;
	lockedOut = false;
	
	char driverPath[2048];
	vr::VRResources()->GetResourceFullPath("", "", driverPath, sizeof(driverPath));
	driverConfigLoader.info.steamvrResources = driverPath;
	vr::VRResources()->GetResourceFullPath(("{" + driverName + "}").c_str(), "", driverPath, sizeof(driverPath));
	driverConfigLoader.info.driverResources = driverPath;
	
	DriverLog("Initializing %s", driverName.c_str());
	
	// Driver lockout: When this is a vendor-specific driver (not vendor-neutral),
	// check if the vendor-neutral driver (CustomHeadsetOpenVR) is enabled.
	// If the neutral driver is enabled, this vendor driver is locked out.
	#ifndef VENDOR_NEUTRAL
	DriverLog("Running in vendor-specific driver mode");
	if(IsNeutralDriverEnabled()){
		DriverLog("Vendor-specific driver locked out because the vendor-neutral driver (CustomHeadsetOpenVR) is enabled.");
		lockedOut = true;
		driverConfigLoader.info.runtimeLockedOut = true;
		// still write info.json so the GUI can see this driver and offer the one-click switch
		try{
			std::filesystem::create_directories(driverConfigLoader.GetConfigFolder());
		}catch(const std::exception& e){
			DriverLog("Failed to create config folder while locked out: %s", e.what());
		}
		driverConfigLoader.WriteInfo();
		return vr::VRInitError_None;
	}
	#endif
	
	// write a setting so that the section of this driver is always defined in the settings file for other drivers to detect
	WriteHasBeenRunSetting(driverName.c_str());
	
	driverConfigLoader.Start();
	{
		// 2026-09-25: publish saved/default encoder options before installing
		// hooks. The first encoder can initialize before any scene is submitted.
		std::lock_guard<std::mutex> lock(driverConfigLock);
		FrameProcessSettings settings;
		settings.config = driverConfig.streamFrame;
		settings.policy = gxr::ResolveSdr10Policy(driverConfig);
		FrameProcessor::UpdateEncoderSettings(settings);
	}
	// vrlink reads its stream/profile keys from steamvr.vrsettings during
	// its own init, before any HMD Activate; write ours now so the FIRST
	// connect of a session already runs the current config (09-03 race)
	#ifdef VENDOR_GALAXYXR
	GalaxyXR_EarlyApplyVrlinkSettings(); // Settings routing is independent of the identity override.
	#else
	if(driverConfig.galaxyXr.nativeIdentity){ GalaxyXR_EarlyApplyVrlinkSettings(); }
	#endif
	// inject hooks into functions
	InjectHooks(this, pDriverContext);
	hidModifier.InjectHooks();
	
	// arm the host hooks. the TrackedDeviceAdded/PoseUpdated hooks are only installed when a
	// driver requests IVRServerDriverHost through the hooked GetGenericInterface. drivers fetch
	// their host interface eagerly during their own init (VR_INIT_SERVER_DRIVER_CONTEXT ->
	// InitServer), so any driver that loaded before this one (e.g. vrlink) never triggers the
	// detour, and if no driver loads after this one the host hooks are never installed and no
	// devices get wrapped. requesting the interface here goes through the now hooked vtable and
	// installs the host hooks immediately, independent of driver load order.
	vr::EVRInitError hostHookError = vr::VRInitError_None;
	pDriverContext->GetGenericInterface(vr::IVRServerDriverHost_Version, &hostHookError);
	
	// arm the eye tracking tap hooks the same way. drivers that loaded before
	// this one (vrlink) may already hold a cached IVRDriverInput pointer, but
	// the hook patches the interface object's shared vtable, so requesting it
	// once here installs the CreateEyeTrackingComponent /
	// UpdateEyeTrackingComponent detours for every caller regardless of load
	// order.
	pDriverContext->GetGenericInterface(vr::IVRDriverInput_Version, &hostHookError);
	
	// the shim classes can be used to implement entirely new headsets, not just shim existing ones
	if(driverConfig.fakeHeadset.enable){
		FakeHeadset* fakeHeadsetImplementation = new FakeHeadset();
		fakeHeadsetImplementation->deviceProvider = this;
		shims.insert(fakeHeadsetImplementation);
		vr::ITrackedDeviceServerDriver* driver = new ShimTrackedDeviceDriver(fakeHeadsetImplementation, nullptr);
		vr::VRServerDriverHost()->TrackedDeviceAdded("FakeCustomHMD", vr::TrackedDeviceClass_HMD, driver);
	}
	
	driverConfigLoader.info.runtimeInitialized = true;
	try { driverConfigLoader.WriteInfo(); } // Publish only after initialization completed.
	catch(const std::exception& e) { DriverLog("Runtime status could not be published: %s", e.what()); }
	return vr::VRInitError_None;
}
const char *const *GalaxyXRDeviceProvider::GetInterfaceVersions(){
	return vr::k_InterfaceVersions;
}
bool GalaxyXRDeviceProvider::ShouldBlockStandbyMode(){
	return false;
}
void GalaxyXRDeviceProvider::Cleanup(){
	driverConfigLoader.info.runtimeInitialized = false;
}
void GalaxyXRDeviceProvider::EnterStandby(){}
void GalaxyXRDeviceProvider::LeaveStandby(){}

void DebugEventLog(const vr::VREvent_t& vrevent){
	DriverLog("Event type: %d", vrevent.eventType);
	switch(vrevent.eventType){
		case vr::VREvent_PropertyChanged:
			DriverLog("Property changed: %i", vrevent.data.property.prop);
			break;
		case vr::VREvent_Compositor_DisplayReconnected:
			DriverLog("Compositor display reconnected");
			break;
		case vr::VREvent_ProcessConnected:
			DriverLog("Process connected %i", vrevent.data.process.pid);
			break;
	}
}

void GalaxyXRDeviceProvider::RefreshPoseDiagnosticSession(){
	if(poseDiagnosticGeneration == driverConfig.debugGeneration){ return; }
	poseDiagnosticGeneration = driverConfig.debugGeneration;
	poseLogStates.clear();
	lastReleaseLogTime = 0;
	lastEdgeLogTime = 0;
}

void GalaxyXRDeviceProvider::RunFrame(){
	// when locked out by the vendor-neutral driver nothing was initialized, so do nothing
	if(lockedOut){
		return;
	}
	
	// acquire driverConfig.configLock for the duration of this function
	std::lock_guard<std::mutex> lock(driverConfigLock);
	// 2026-10-01: a disabled interval must not leak into the next diagnostic
	// session. Reset telemetry only; preserve estimates and motion clocks.
	{
		std::lock_guard<std::mutex> diagnosticLock(poseLogLock);
		RefreshPoseDiagnosticSession();
	}
	// Keep reloads and hook retries working while no eye frames are flowing,
	// including disabling the tap/post-pack pass before the next connection.
	FrameProcessSettings settings;
	settings.config = driverConfig.streamFrame;
	settings.policy = gxr::ResolveSdr10Policy(driverConfig);
	FrameProcessor::UpdateEncoderSettings(settings);
	RefreshGripTouch();
	
	hidModifier.RunFrame();
	
	#ifdef HAS_PRIVATE
	if(driverConfig.onlyHandlePrivateFunctionality){
		driverConfig.hasBeenUpdated = false;
		return;
	}
	#endif
		
	// process events that were submitted for this frame.
	vr::VREvent_t vrevent{};
	while(vr::VRServerDriverHost()->PollNextEvent(&vrevent, sizeof(vr::VREvent_t))){
		// DebugEventLog(vrevent);
		if(vrevent.eventType == VREvent_VendorSpecific_ContextCollection){
			// receive and store data from successful context collection events
			vr::VREvent_Reserved_t data = vrevent.data.reserved;
			if(data.reserved0 == VREvent_VendorSpecific_ContextCollection_MagicDataNumber){
				// add context based on the event data.
				uint32_t id = static_cast<uint32_t>(data.reserved1);
				vr::IVRDriverContext* ctx = (vr::IVRDriverContext*)data.reserved2;
				// logging here seems to deadlock on occasion
				// DriverLog("Received context collection event for device with ID: %d, Context: %p", id, ctx);	
				driverContextsByDeviceId[id] = ctx;
				// send any queued events
				if(queuedEvents.find(id) != queuedEvents.end()){
					for(const auto& event : queuedEvents[id]){
						SendVendorEvent(id, event.eventType, event.eventData, event.eventTimeOffset);
					}
					queuedEvents.erase(id);
				}
			}
		}
		if(vrevent.eventType == vr::VREvent_TrackedDeviceActivated){
			// set nonNativeHeadsetFound if a device with a direct mode component is found
			vr::PropertyContainerHandle_t container = vr::VRProperties()->TrackedDeviceToPropertyContainer(vrevent.trackedDeviceIndex);
			if(container){
				// DriverLog("Device %d has driver direct mode component: %s", vrevent.trackedDeviceIndex, vr::VRProperties()->GetBoolProperty(container, vr::Prop_HasDriverDirectModeComponent_Bool) ? "true" : "false");
				if(vr::VRProperties()->GetBoolProperty(container, vr::Prop_HasDriverDirectModeComponent_Bool)){
					driverConfigLoader.info.nonNativeHeadsetFound = true;
					driverConfigLoader.WriteInfo();
				}
			}
		}
		if(vrevent.eventType == vr::VREvent_DashboardActivated){
			if(!driverConfigLoader.info.isDashboardOpen){
				driverConfigLoader.info.isDashboardOpen = true;
				driverConfigLoader.WriteInfo();
			}
		}
		if(vrevent.eventType == vr::VREvent_DashboardDeactivated){
			if(driverConfigLoader.info.isDashboardOpen){
				driverConfigLoader.info.isDashboardOpen = false;
				driverConfigLoader.WriteInfo();
			}
		}
		if(vrevent.eventType == vr::VREvent_ProcessConnected && customShaderEnabled){
			// check new processes and inject if they are the compositor
			InjectCompositorPlugin(vrevent.data.process.pid);
		}
		for(auto shim : shims){
			shim->HandleEvent(vrevent);
		}
	}
	for(auto shim : shims){
		if(shim->shimActive){
			shim->RunFrame();
		}
	}
	if(!customShaderEnabled && IsCustomShaderEnabled()){
		// try to inject when it is first enabled
		InjectCompositorPlugin();
		customShaderEnabled = true;
	}
	eyeTrackingOutput.RunFrame();
	// clear update flag at end of frame
	driverConfig.hasBeenUpdated = false;
}

void GalaxyXRDeviceProvider::SendContextCollectionEvents(uint32_t id){
	for(auto driverContext : driverContexts){
		vr::EVRInitError eError = vr::VRInitError_None;
		vr::IVRServerDriverHost* VRServerDriverHost =  (vr::IVRServerDriverHost *)driverContext->GetGenericInterface(vr::IVRServerDriverHost_Version, &eError);
		// store data in event
		vr::VREvent_Data_t data = {VREvent_VendorSpecific_ContextCollection_MagicDataNumber, (uint64_t)id, (uint64_t)driverContext};
		// this event will only succeed for the driver that owns the id
		VRServerDriverHost->VendorSpecificEvent(id, VREvent_VendorSpecific_ContextCollection, data, 0);
	}
}

bool GalaxyXRDeviceProvider::SendVendorEvent(uint32_t unWhichDevice, vr::EVREventType eventType, const vr::VREvent_Data_t & eventData, double eventTimeOffset){
	if(driverContextsByDeviceId.find(unWhichDevice) != driverContextsByDeviceId.end()){
		vr::EVRInitError eError = vr::VRInitError_None;
		vr::IVRServerDriverHost* VRServerDriverHost =  (vr::IVRServerDriverHost *)driverContextsByDeviceId[unWhichDevice]->GetGenericInterface(vr::IVRServerDriverHost_Version, &eError);
		VRServerDriverHost->VendorSpecificEvent(unWhichDevice, eventType, eventData, eventTimeOffset);
		return true;
	}else{
		// try to find context and queue for later
		SendContextCollectionEvents(unWhichDevice);
		if(queuedEvents.find(unWhichDevice) == queuedEvents.end()){
			queuedEvents[unWhichDevice] = {};
		}
		queuedEvents[unWhichDevice].push_back({eventType, eventData, eventTimeOffset});
		return false;
	}
}

static vr::HmdQuaternion_t QuatMultiply(const vr::HmdQuaternion_t &a, const vr::HmdQuaternion_t &b){
	vr::HmdQuaternion_t r;
	r.w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
	r.x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
	r.y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
	r.z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
	return r;
}

static vr::HmdQuaternion_t QuatFromEulerDeg(const double deg[3]){
	// intrinsic x (pitch), then y (yaw), then z (roll), in the local frame
	double rx = deg[0] * 3.14159265358979323846 / 180.0 / 2.0;
	double ry = deg[1] * 3.14159265358979323846 / 180.0 / 2.0;
	double rz = deg[2] * 3.14159265358979323846 / 180.0 / 2.0;
	vr::HmdQuaternion_t qx = {cos(rx), sin(rx), 0, 0};
	vr::HmdQuaternion_t qy = {cos(ry), 0, sin(ry), 0};
	vr::HmdQuaternion_t qz = {cos(rz), 0, 0, sin(rz)};
	return QuatMultiply(QuatMultiply(qx, qy), qz);
}

static void QuatRotateVector(const vr::HmdQuaternion_t &q, const double v[3], double out[3]){
	// out = q * v * q^-1
	double tx = 2.0 * (q.y * v[2] - q.z * v[1]);
	double ty = 2.0 * (q.z * v[0] - q.x * v[2]);
	double tz = 2.0 * (q.x * v[1] - q.y * v[0]);
	out[0] = v[0] + q.w * tx + (q.y * tz - q.z * ty);
	out[1] = v[1] + q.w * ty + (q.z * tx - q.x * tz);
	out[2] = v[2] + q.w * tz + (q.x * ty - q.y * tx);
}

int GalaxyXRDeviceProvider::GetDeviceClass(uint32_t openVRID){
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = deviceClasses.find(openVRID);
		if(found != deviceClasses.end()){
			return found->second;
		}
	}
	vr::PropertyContainerHandle_t container = vr::VRProperties()->TrackedDeviceToPropertyContainer(openVRID);
	vr::ETrackedPropertyError propError = vr::TrackedProp_Success;
	int deviceClass = vr::VRProperties()->GetInt32Property(container, vr::Prop_DeviceClass_Int32, &propError);
	if(propError != vr::TrackedProp_Success){
		deviceClass = (int)vr::TrackedDeviceClass_Invalid;
	}
	std::lock_guard<std::mutex> guard(poseLogLock);
	deviceClasses[openVRID] = deviceClass;
	return deviceClass;
}

bool GalaxyXRDeviceProvider::GetHmdProjectionRaw(int eye, float &left, float &right, float &top, float &bottom){
	if(!hmdProjectionQueried){
		hmdProjectionQueried = true;
		if(hmdDevice){
			void* component = hmdDevice->GetComponent(vr::IVRDisplayComponent_Version);
			if(component){
				vr::IVRDisplayComponent* display = (vr::IVRDisplayComponent*)component;
				for(int e = 0; e < 2; e++){
					display->GetProjectionRaw((vr::EVREye)e,
						&hmdProjection[e][0], &hmdProjection[e][1],
						&hmdProjection[e][2], &hmdProjection[e][3]);
				}
				hmdProjectionValid = true;
				DriverLog("DeviceProvider: hmd projection raw L(l=%.4f r=%.4f t=%.4f b=%.4f) R(l=%.4f r=%.4f t=%.4f b=%.4f)",
					hmdProjection[0][0], hmdProjection[0][1], hmdProjection[0][2], hmdProjection[0][3],
					hmdProjection[1][0], hmdProjection[1][1], hmdProjection[1][2], hmdProjection[1][3]);
			}else{
				DriverLog("DeviceProvider: hmd has no IVRDisplayComponent, gaze mapping falls back to tangent knobs");
			}
		}
	}
	if(!hmdProjectionValid || eye < 0 || eye > 1){
		return false;
	}
	left = hmdProjection[eye][0];
	right = hmdProjection[eye][1];
	top = hmdProjection[eye][2];
	bottom = hmdProjection[eye][3];
	return true;
}

uint32_t GalaxyXRDeviceProvider::ResolveContainerId(vr::PropertyContainerHandle_t container){
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = containerToId.find(container);
		if(found != containerToId.end()){
			return found->second;
		}
	}
	// containers are stable per device; probe the first few ids once
	for(uint32_t id = 0; id < 16; id++){
		if(vr::VRProperties()->TrackedDeviceToPropertyContainer(id) == container){
			std::lock_guard<std::mutex> guard(poseLogLock);
			containerToId[container] = id;
			return id;
		}
	}
	std::lock_guard<std::mutex> guard(poseLogLock);
	containerToId[container] = vr::k_unTrackedDeviceIndexInvalid;
	return vr::k_unTrackedDeviceIndexInvalid;
}

static bool InputPathInteresting(const std::string &lower){
	// anything that plausibly marks holding/releasing an object. session 8
	// taught us not to guess narrowly: 20 throws produced zero release
	// edges because the filter (and boolean-only hooking) missed vrlink's
	// actual grab control.
	if(lower.find("touch") != std::string::npos){
		return false;
	}
	return lower.find("grip") != std::string::npos
		|| lower.find("trigger") != std::string::npos
		|| lower.find("squeeze") != std::string::npos
		|| lower.find("grab") != std::string::npos
		|| lower.find("pinch") != std::string::npos;
}

static bool NativeHandSerial(const char* serial){
	if(!serial){ return false; }
	return strcmp(serial, "VRLINKQ_Hand_Left") == 0
		|| strcmp(serial, "VRLINKQ_Hand_Right") == 0;
}

static bool PhysicalGalaxyControllerSerial(const char* serial){
	if(!serial){ return false; }
	std::string value = serial;
	return value.rfind("SamsungVST-Controller", 0) == 0
		|| (value.rfind("VRLINK", 0) == 0
			&& value.find("Controller") != std::string::npos);
}

static bool NativeHandDiagnosticPath(const std::string &lower){
	return lower.find("index_pinch") != std::string::npos
		|| lower.find("/input/grip") != std::string::npos;
}

// classify a component path into a distortion tuner control role. exact
// suffix matches against the confirmed vrlink surface (session log): joystick
// x/y scalars + joystick/a/b/x/y click booleans + grip value scalars.
static int TunerRoleForPath(const std::string &lower, bool isScalar){
	auto endsWith = [&](const char* suffix){
		size_t len = strlen(suffix);
		return lower.size() >= len && lower.compare(lower.size() - len, len, suffix) == 0;
	};
	if(isScalar){
		if(endsWith("/input/joystick/y")){ return 1; }
		if(endsWith("/input/grip/value")){ return 6; }
		if(endsWith("/input/joystick/x")){ return 7; }
		if(endsWith("/input/trigger/value")){ return 8; }
		return 0;
	}
	if(endsWith("/input/a/click")){ return 2; }
	if(endsWith("/input/b/click")){ return 3; }
	if(endsWith("/input/x/click")){ return 4; }
	if(endsWith("/input/y/click")){ return 5; }
	if(endsWith("/input/joystick/click")){ return 9; }
	return 0;
}

void GalaxyXRDeviceProvider::OnInputComponentCreated(vr::PropertyContainerHandle_t container, const char* name, vr::VRInputComponentHandle_t handle, vr::EVRInputError error){
	if(!name || error != vr::VRInputError_None || handle == vr::k_ulInvalidInputComponentHandle){
		if(name && error != vr::VRInputError_None){
			DriverLog("HandInputDiag: boolean create FAILED container=%llu path=%s error=%d",
				(unsigned long long)container, name, (int)error);
		}
		return;
	}
	InputComponentInfo info;
	info.container = container;
	info.openVRID = ResolveContainerId(container);
	info.name = name;
	std::string lower = info.name;
	for(auto &c : lower){ c = (char)tolower(c); }
	info.interesting = InputPathInteresting(lower);
	info.tunerRole = TunerRoleForPath(lower, false);
	info.nativeHand = info.openVRID != vr::k_unTrackedDeviceIndexInvalid && IsNativeHand(info.openVRID);
	info.diagnostic = info.nativeHand && NativeHandDiagnosticPath(lower);
	// hand classification from the quest layout: x/y buttons exist only on
	// the left controller, a/b only on the right. once known, resolve the
	// openVR id too so pose updates can be routed per hand.
	if(info.tunerRole >= 2 && info.tunerRole <= 5){
		int hand = (info.tunerRole == 2 || info.tunerRole == 3) ? 1 : 0;
		// resolve BEFORE taking poseLogLock: ResolveContainerId takes that
		// lock itself, and std::mutex is non-recursive — nesting it here
		// deadlocked vrserver at the first x/click creation and tripped a
		// SteamVR safe-mode block (session 24 regression)
		uint32_t id = info.openVRID;
		std::lock_guard<std::mutex> handGuard(poseLogLock);
		containerHand[container] = hand;
		if(id != vr::k_unTrackedDeviceIndexInvalid){
			openVRIDHand[id] = hand;
		}
	}
	// always log creates: component names are the map of vrlink's input
	// surface, and not having them cost a session
	DriverLog("InputTap: boolean component container=%llu path=%s handle=%llu id=%u%s%s",
		(unsigned long long)container, name, (unsigned long long)handle,
		info.openVRID, info.interesting ? " [watched]" : "",
		info.nativeHand ? " [native-hand passthrough]" : "");
	std::lock_guard<std::mutex> guard(poseLogLock);
	inputComponents[handle] = info;
}

void GalaxyXRDeviceProvider::OnScalarComponentCreated(vr::PropertyContainerHandle_t container, const char* name, vr::VRInputComponentHandle_t handle, vr::EVRInputError error){
	if(!name || error != vr::VRInputError_None || handle == vr::k_ulInvalidInputComponentHandle){
		if(name && error != vr::VRInputError_None){
			DriverLog("HandInputDiag: scalar create FAILED container=%llu path=%s error=%d",
				(unsigned long long)container, name, (int)error);
		}
		return;
	}
	InputComponentInfo info;
	info.container = container;
	info.openVRID = ResolveContainerId(container);
	info.name = name;
	info.isScalar = true;
	std::string lower = info.name;
	for(auto &c : lower){ c = (char)tolower(c); }
	info.interesting = InputPathInteresting(lower);
	info.tunerRole = TunerRoleForPath(lower, true);
	info.nativeHand = info.openVRID != vr::k_unTrackedDeviceIndexInvalid && IsNativeHand(info.openVRID);
	info.diagnostic = info.nativeHand && NativeHandDiagnosticPath(lower);
	DriverLog("InputTap: scalar component container=%llu path=%s handle=%llu id=%u%s%s",
		(unsigned long long)container, name, (unsigned long long)handle,
		info.openVRID, info.interesting ? " [watched]" : "",
		info.nativeHand ? " [native-hand passthrough]" : "");
	// 2026-09-25 toggle audit: remember eligible sources even while OFF so
	// enabling later can create the component without reconnecting.
	info.gripTouchSource = !info.nativeHand
		&& lower.size() >= 17 && lower.compare(lower.size() - 17, 17, "/input/grip/value") == 0;
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		inputComponents[handle] = info;
	}
	UpdateGripTouch(handle);
}

static bool GripTouchSynthesisEnabled(){
	const auto &g = driverConfig.galaxyXr;
	return g.nativeInputProfile && g.synthesizeGripTouch && !g.controllerBypass;
}

void GalaxyXRDeviceProvider::UpdateGripTouch(vr::VRInputComponentHandle_t handle){
	// Creation and updates re-enter the boolean tap: never hold poseLogLock
	// across either API call. This lock only serializes synthetic-input IO.
	std::lock_guard<std::mutex> synthesisGuard(gripTouchLock);
	auto* input = vr::VRDriverInput();
	if(!input){ return; }
	vr::PropertyContainerHandle_t createContainer = 0;
	bool create = false;
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = inputComponents.find(handle);
		if(found == inputComponents.end() || !found->second.gripTouchSource){ return; }
		auto &info = found->second;
		if(!GripTouchSynthesisEnabled()){
			info.gripTouchCreateAttempted = false;
		}else if(info.gripTouchHandle == vr::k_ulInvalidInputComponentHandle && !info.gripTouchCreateAttempted){
			info.gripTouchCreateAttempted = true;
			createContainer = info.container;
			create = true;
		}
	}
	if(create){
		vr::VRInputComponentHandle_t touch = vr::k_ulInvalidInputComponentHandle;
		const auto error = input->CreateBooleanComponent(createContainer, "/input/grip/touch", &touch);
		if(error != vr::VRInputError_None || touch == vr::k_ulInvalidInputComponentHandle){
			DriverLog("InputTap: could not create /input/grip/touch on container %llu (error %d)", (unsigned long long)createContainer, (int)error);
			return;
		}
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = inputComponents.find(handle);
		if(found == inputComponents.end() || found->second.container != createContainer){ return; }
		found->second.gripTouchHandle = touch;
	}
	vr::VRInputComponentHandle_t touch = vr::k_ulInvalidInputComponentHandle;
	bool touched = false;
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = inputComponents.find(handle);
		if(found == inputComponents.end()){ return; }
		auto &info = found->second;
		if(info.gripTouchHandle == vr::k_ulInvalidInputComponentHandle){ return; }
		const float threshold = (std::max)(0.005f, (std::min)(0.5f, (float)driverConfig.galaxyXr.gripTouchThreshold));
		touched = GripTouchSynthesisEnabled() && info.gripTouchValue > (info.gripTouched ? threshold * 0.5f : threshold);
		if(touched == info.gripTouched){ return; }
		touch = info.gripTouchHandle;
	}
	if(input->UpdateBooleanComponent(touch, touched, 0.0) == vr::VRInputError_None){
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = inputComponents.find(handle);
		if(found != inputComponents.end() && found->second.gripTouchHandle == touch){
			found->second.gripTouched = touched;
		}
	}
}

void GalaxyXRDeviceProvider::RefreshGripTouch(){
	// Release an asserted touch on OFF/bypass even if pressure sends no more
	// updates; OFF -> ON also works for already-created scalar components.
	std::vector<vr::VRInputComponentHandle_t> sources;
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		for(const auto &entry : inputComponents){
			if(entry.second.gripTouchSource){ sources.push_back(entry.first); }
		}
	}
	for(auto handle : sources){ UpdateGripTouch(handle); }
}

void GalaxyXRDeviceProvider::OnScalarComponentUpdated(vr::VRInputComponentHandle_t handle, float value, double timeOffset, vr::EVRInputError error){
	{
		double now = std::chrono::duration_cast<std::chrono::microseconds>(
			std::chrono::steady_clock::now().time_since_epoch()).count() / 1000000.0;
		bool doLog = false;
		std::string name;
		uint32_t id = vr::k_unTrackedDeviceIndexInvalid;
		{
			std::lock_guard<std::mutex> guard(poseLogLock);
			auto found = inputComponents.find(handle);
			if(found != inputComponents.end() && found->second.diagnostic){
				InputComponentInfo &info = found->second;
				doLog = error != vr::VRInputError_None || !info.diagHaveScalar
					|| std::fabs(value - info.diagLastScalar) >= 0.10f
					|| now - info.diagLastLogTime >= 0.5;
				info.diagHaveScalar = true;
				info.diagLastScalar = value;
				if(doLog){ info.diagLastLogTime = now; }
				name = info.name;
				id = info.openVRID;
			}
		}
		if(doLog){
			DriverLog("HandInputDiag: scalar id=%u path=%s value=%.3f timeOffset=%.4f result=%d",
				id, name.c_str(), value, timeOffset, (int)error);
		}
	}
	// Keep the pressure source separate from release-edge tracking. Failed
	// source updates must not generate a synthetic touch transition.
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = inputComponents.find(handle);
		if(error == vr::VRInputError_None && found != inputComponents.end()){
			found->second.gripTouchValue = value;
		}
	}
	UpdateGripTouch(handle);
	if(error != vr::VRInputError_None){ return; }
	// distortion tuner capture: isolated fields so the tuner never disturbs
	// the release-edge state below, and gated by an
	// atomic so the hot path costs one relaxed load when the tuner is off
	if(tunerInputActive.load(std::memory_order_relaxed)){
		std::lock_guard<std::mutex> tunerGuard(poseLogLock);
		auto found = inputComponents.find(handle);
		if(found != inputComponents.end() && found->second.tunerRole != 0){
			found->second.tunerScalar = value;
		}
	}
	// 2026-09-25: edge state and functional release triggers must remain
	// live with diagnostics OFF, including mid-grip logging/tuning changes.
	vr::PropertyContainerHandle_t container = 0;
	std::string name;
	bool release = false;
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = inputComponents.find(handle);
		if(found == inputComponents.end() || !found->second.interesting){
			return;
		}
		InputComponentInfo &info = found->second;
		info.lastScalar = value;
		// hysteresis so analog grabbing (value based grips) produces clean
		// held/released edges: pressed above 0.6, released below 0.25
		if(!info.scalarPressed && value > 0.6f){
			info.scalarPressed = true;
		}else if(info.scalarPressed && value < 0.25f){
			info.scalarPressed = false;
			release = true;
			container = info.container;
			name = info.name;
		}
	}
	if(release){
		HandleInputRelease(container, name);
	}
}

void GalaxyXRDeviceProvider::OnBooleanComponentUpdated(vr::VRInputComponentHandle_t handle, bool value, double timeOffset, vr::EVRInputError error){
	{
		bool doLog = false;
		std::string name;
		uint32_t id = vr::k_unTrackedDeviceIndexInvalid;
		{
			std::lock_guard<std::mutex> guard(poseLogLock);
			auto found = inputComponents.find(handle);
			if(found != inputComponents.end() && found->second.diagnostic){
				InputComponentInfo &info = found->second;
				doLog = error != vr::VRInputError_None || !info.diagHaveBool || info.diagLastBool != value;
				info.diagHaveBool = true;
				info.diagLastBool = value;
				name = info.name;
				id = info.openVRID;
			}
		}
		if(doLog){
			DriverLog("HandInputDiag: boolean id=%u path=%s value=%d timeOffset=%.4f result=%d",
				id, name.c_str(), (int)value, timeOffset, (int)error);
		}
	}
	if(error != vr::VRInputError_None){ return; }
	if(tunerInputActive.load(std::memory_order_relaxed)){
		std::lock_guard<std::mutex> tunerGuard(poseLogLock);
		auto found = inputComponents.find(handle);
		if(found != inputComponents.end() && found->second.tunerRole != 0){
			found->second.tunerBool = value;
		}
	}
	vr::PropertyContainerHandle_t container = 0;
	std::string name;
	bool release = false;
	bool edge = false;
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = inputComponents.find(handle);
		if(found == inputComponents.end()){
			return;
		}
		InputComponentInfo &info = found->second;
		bool changed = !info.haveValue || info.lastValue != value;
		bool wasHeld = info.haveValue && info.lastValue;
		info.haveValue = true;
		info.lastValue = value;
		if(!changed){
			return;
		}
		container = info.container;
		name = info.name;
		edge = true;
		release = info.interesting && wasHeld && !value;
	}
	if(release){
		HandleInputRelease(container, name);
	}else if(edge && driverConfig.streamFrame.poseLogging){
		// low rate visibility of ALL boolean edges so the actual grab
		// control names itself in the log even if the watch filter misses
		double now = std::chrono::duration_cast<std::chrono::microseconds>(
			std::chrono::steady_clock::now().time_since_epoch()).count() / 1000000.0;
		bool doLog = false;
		{
			std::lock_guard<std::mutex> guard(poseLogLock);
			RefreshPoseDiagnosticSession();
			if(now - lastEdgeLogTime >= 0.2){
				lastEdgeLogTime = now;
				doLog = true;
			}
		}
		if(doLog){
			DriverLog("InputTap: edge %s -> %d (id=%u)", name.c_str(), (int)value, ResolveContainerId(container));
		}
	}
}

void GalaxyXRDeviceProvider::HandleInputRelease(vr::PropertyContainerHandle_t container, const std::string &name){
	// a release only feeds the diagnostics now (the estimators it armed are gone)
	if(driverConfig.streamFrame.poseLogging){ LogReleaseSnapshot(container, name); }
}

void GalaxyXRDeviceProvider::LogReleaseSnapshot(vr::PropertyContainerHandle_t container, const std::string &name){
	if(!driverConfig.streamFrame.poseLogging){ return; }
	{
		double now = std::chrono::duration_cast<std::chrono::microseconds>(
			std::chrono::steady_clock::now().time_since_epoch()).count() / 1000000.0;
		std::lock_guard<std::mutex> guard(poseLogLock);
		RefreshPoseDiagnosticSession();
		if(now - lastReleaseLogTime < 0.05){
			return; // 20Hz cap
		}
		lastReleaseLogTime = now;
	}
	uint32_t id = ResolveContainerId(container);
	MotionSnapshot snap;
	bool haveSnap = false;
	double snapAge = -1;
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = motionSnapshots.find(id);
		if(found != motionSnapshots.end()){
			snap = found->second;
			haveSnap = true;
			double now = std::chrono::duration_cast<std::chrono::microseconds>(
				std::chrono::steady_clock::now().time_since_epoch()).count() / 1000000.0;
			snapAge = (now - snap.time) * 1000.0;
		}
	}
	if(haveSnap){
		DriverLog("ReleaseSnap: id=%u %s released: out=(%.3f, %.3f, %.3f) |out|=%.3f ang=(%.2f, %.2f, %.2f) trackingOk=%d result=%d snapAge=%.1fms",
			id, name.c_str(),
			snap.outVel[0], snap.outVel[1], snap.outVel[2], snap.outSpeed,
			snap.outAng[0], snap.outAng[1], snap.outAng[2],
			(int)snap.trackingOk, snap.result, snapAge);
	}else{
		DriverLog("ReleaseSnap: id=%u %s released: no motion snapshot yet", id, name.c_str());
	}
}

void GalaxyXRDeviceProvider::OnPoseComponentCreated(vr::PropertyContainerHandle_t container, const char* name, vr::VRInputComponentHandle_t handle){
	if(!name || handle == vr::k_ulInvalidInputComponentHandle){
		return;
	}
	// always log: gaze published as a pose component would be exactly the
	// "openvr paths" channel DFR tools bind (AngelDark report)
	DriverLog("InputTap: pose component container=%llu path=%s handle=%llu",
		(unsigned long long)container, name, (unsigned long long)handle);
	PoseComponentInfo info;
	info.container = container;
	info.name = name;
	// tip components: resolve which HAND this container's tip belongs to
	// from the container's own controller-role property (vrlink puts tip
	// poses on the paired hand devices, not the button controllers, so
	// button-derived hand maps can't associate them). resolved OUTSIDE
	// poseLogLock: property queries must never run under our lock.
	std::string nameStr = name;
	if(nameStr.size() >= 9 && nameStr.compare(nameStr.size() - 9, 9, "/pose/tip") == 0){
		vr::ETrackedPropertyError propError = vr::TrackedProp_Success;
		int32_t role = vr::VRProperties()->GetInt32Property(container,
			vr::Prop_ControllerRoleHint_Int32, &propError);
		int hand = -1;
		if(propError == vr::TrackedProp_Success){
			if(role == vr::TrackedControllerRole_LeftHand){ hand = 0; }
			if(role == vr::TrackedControllerRole_RightHand){ hand = 1; }
		}
		DriverLog("InputTap: /pose/tip container=%llu role=%d -> hand=%s",
			(unsigned long long)container, (int)role,
			hand == 0 ? "LEFT" : (hand == 1 ? "RIGHT" : "UNKNOWN (aligner tip marker unavailable for it)"));
		if(hand >= 0){
			std::lock_guard<std::mutex> tipGuard(poseLogLock);
			containerTipHand[container] = hand;
		}
	}
	std::lock_guard<std::mutex> guard(poseLogLock);
	poseComponents[handle] = info;
}

// skeleton tap: track vrlink's skeletal components and offset the wrist
// bone (bone 1, root-relative) by the configured amount. this shifts the
// whole skeletal hand relative to its anchor while the device pose, render
// model, components and the grip pivot all stay put - the one degree of
// freedom nothing else reaches. hot: values read per update.
static std::mutex skeletonTapMutex;
static std::map<vr::VRInputComponentHandle_t, int> skeletonTapHands;

void GalaxyXRDeviceProvider::OnSkeletonComponentCreated(vr::PropertyContainerHandle_t container, const char *name, const char *skeletonPath, vr::VRInputComponentHandle_t handle){
	std::string path = skeletonPath ? skeletonPath : "";
	int hand = path.find("right") != std::string::npos ? 1 : 0;
	uint32_t id = ResolveContainerId(container);
	bool physicalController = id != vr::k_unTrackedDeviceIndexInvalid && IsStreamedController(id);
	DriverLog("SkeletonTap: component %s (%s) hand=%s handle=%llu id=%u mode=%s",
		name ? name : "?", path.c_str(), hand ? "right" : "left",
		(unsigned long long)handle, id,
		physicalController ? "physical-controller-adjustable" : "passthrough");
	// Native hands (and anything not positively identified as a physical
	// Galaxy XR controller) keep their original skeleton data unchanged.
	if(!physicalController){
		return;
	}
	{
		std::lock_guard<std::mutex> lock(skeletonTapMutex);
		skeletonTapHands[handle] = hand;
	}
}

bool GalaxyXRDeviceProvider::HandleSkeletonUpdate(vr::VRInputComponentHandle_t handle, const vr::VRBoneTransform_t *bones, uint32_t count, vr::VRBoneTransform_t *outBones){
	if(driverConfig.galaxyXr.controllerBypass){ return false; }
	double x = driverConfig.galaxyXr.skeletonOffsetXCm * 0.01;
	double y = driverConfig.galaxyXr.skeletonOffsetYCm * 0.01;
	double z = driverConfig.galaxyXr.skeletonOffsetZCm * 0.01;
	if(x == 0.0 && y == 0.0 && z == 0.0){
		return false;
	}
	int hand;
	{
		std::lock_guard<std::mutex> lock(skeletonTapMutex);
		auto it = skeletonTapHands.find(handle);
		if(it == skeletonTapHands.end()){
			return false;
		}
		hand = it->second;
	}
	if(hand == 1 && driverConfig.galaxyXr.skeletonOffsetMirror){
		x = -x;
	}
	for(uint32_t i = 0; i < count; i++){
		outBones[i] = bones[i];
	}
	outBones[1].position.v[0] += (float)x;
	outBones[1].position.v[1] += (float)y;
	outBones[1].position.v[2] += (float)z;
	return true;
}

void GalaxyXRDeviceProvider::OnPoseComponentUpdated(vr::VRInputComponentHandle_t handle, const vr::HmdMatrix34_t* offset, double timeOffset){
	double now = std::chrono::duration_cast<std::chrono::microseconds>(
		std::chrono::steady_clock::now().time_since_epoch()).count() / 1000000.0;
	std::string name;
	uint64_t updates = 0;
	bool doLog = false;
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		auto found = poseComponents.find(handle);
		if(found == poseComponents.end()){
			return;
		}
		// tip offset capture for the controller aligner: /pose/tip is the
		// controller-local tip transform vrlink itself publishes
		if(offset && found->second.name.size() >= 9
				&& found->second.name.compare(found->second.name.size() - 9, 9, "/pose/tip") == 0){
			auto handFound = containerTipHand.find(found->second.container);
			if(handFound != containerTipHand.end()){
				AlignControllerState &state = alignControllers[handFound->second];
				state.tipValid = true;
				state.tipLocal[0] = offset->m[0][3];
				state.tipLocal[1] = offset->m[1][3];
				state.tipLocal[2] = offset->m[2][3];
			}
		}
		found->second.updates++;
		// first update always, then 1 per 5s per component
		if(found->second.updates == 1 || now - found->second.lastLogTime >= 5.0){
			found->second.lastLogTime = now;
			name = found->second.name;
			updates = found->second.updates;
			doLog = true;
		}
	}
	if(doLog && offset){
		DriverLog("InputTap: pose component %s update %llu offset=(%.4f, %.4f, %.4f) fwd=(%.4f, %.4f, %.4f) timeOffset=%.4f",
			name.c_str(), (unsigned long long)updates,
			offset->m[0][3], offset->m[1][3], offset->m[2][3],
			-offset->m[0][2], -offset->m[1][2], -offset->m[2][2],
			timeOffset);
	}
}

bool GalaxyXRDeviceProvider::HandleDevicePoseUpdated(uint32_t openVRID, vr::DriverPose_t &pose){
	// Native hand devices are published by vrlink with Controller class but
	// are not physical Galaxy XR controllers. Their pose, tracking state,
	// velocity and timing must reach SteamVR byte-for-byte unchanged.
	if(openVRID != vr::k_unTrackedDeviceIndex_Hmd && IsNativeHand(openVRID)){
		return true;
	}
	// raw tracking status for the pose trace, captured BEFORE forceTracking
	// can launder it.
	const bool rawPoseValid = pose.poseIsValid;
	const int rawResult = (int)pose.result;
	if(driverConfig.forceTracking){
		pose.poseIsValid = true;
		if(pose.result != vr::TrackingResult_Fallback_RotationOnly){
			pose.result = vr::TrackingResult_Running_OK;
		}
	}
	// every controller pose edit below (grip convention, shared offsets,
	// per-hand trims) is for the streamed Galaxy XR controllers only. a
	// native pair (Index, Vive) reports its own correct grip and must never
	// be shifted (field 2026-08-25: knuckles users saw the 22 deg / 5 cm
	// convention shift). cached
	// after the first read, false while the property is not readable yet.
	// property query with no lock held.
	// galaxyXr.controllerBypass: pose left as vrlink sent it.
	const bool streamedController = openVRID != vr::k_unTrackedDeviceIndex_Hmd
		&& !driverConfig.galaxyXr.controllerBypass
		&& GetDeviceClass(openVRID) == (int)vr::TrackedDeviceClass_Controller
		&& IsStreamedController(openVRID);
	#ifdef VENDOR_GALAXYXR
	// fixed raw->grip convention shift for the Galaxy XR controllers (see
	// GalaxyXrConfig::gripConvention): applied before the user's personal
	// trim offsets so those keep meaning small corrections. the grip-family
	// render model components (handgrip/openxr_grip/grip) are identity so
	// every pose path resolves to this same frame - do not re-add a grip
	// offset there.
	if(driverConfig.galaxyXr.gripConvention && streamedController){
		static const double kGripConventionRotDeg[3] = {22, 0, 0};
		double fixLocal[3] = {0, 0, 0.05};
		double fixWorld[3];
		QuatRotateVector(pose.qRotation, fixLocal, fixWorld);
		pose.vecPosition[0] += fixWorld[0];
		pose.vecPosition[1] += fixWorld[1];
		pose.vecPosition[2] += fixWorld[2];
		pose.qRotation = QuatMultiply(pose.qRotation, QuatFromEulerDeg(kGripConventionRotDeg));
	}
	#endif
	// controller pose offsets: local frame rotation and translation. the
	// stream's pose is kept so the velocities can follow the moved origin
	// further down.
	const vr::HmdQuaternion_t streamRotation = pose.qRotation;
	const double streamPosition[3] = {pose.vecPosition[0], pose.vecPosition[1], pose.vecPosition[2]};
	const ControllersConfig &controllersConfig = driverConfig.controllers;
	double rotationOffsetDeg[3];
	double positionOffsetCm[3];
	if(alignerOverrideActive.load(std::memory_order_relaxed)){
		// aligner working offsets replace the configured ones, so stick
		// edits and pivot solves are visible in the very next pose
		std::lock_guard<std::mutex> alignGuard(poseLogLock);
		for(int i = 0; i < 3; i++){
			rotationOffsetDeg[i] = alignerRotDeg[i];
			positionOffsetCm[i] = alignerPosCm[i];
		}
	}else{
		for(int i = 0; i < 3; i++){
			rotationOffsetDeg[i] = controllersConfig.rotationOffsetDeg[i];
			positionOffsetCm[i] = controllersConfig.positionOffsetCm[i];
		}
	}
	bool hasRotationOffset = rotationOffsetDeg[0] != 0
		|| rotationOffsetDeg[1] != 0 || rotationOffsetDeg[2] != 0;
	bool hasPositionOffset = positionOffsetCm[0] != 0
		|| positionOffsetCm[1] != 0 || positionOffsetCm[2] != 0;
	if((hasRotationOffset || hasPositionOffset) && streamedController){
		// mirror the left-hand-authored offsets for the right controller:
		// physical pairs are mirror images, so the tracked-origin-to-grip
		// displacement mirrors too (position X and rotation Y/Z negate)
		if(controllersConfig.mirrorOffsetsForRightHand){
			int hand = -1;
			{
				std::lock_guard<std::mutex> handGuard(poseLogLock);
				auto handFound = openVRIDHand.find(openVRID);
				if(handFound != openVRIDHand.end()){
					hand = handFound->second;
				}
			}
			if(hand == 1){
				positionOffsetCm[0] = -positionOffsetCm[0];
				rotationOffsetDeg[1] = -rotationOffsetDeg[1];
				rotationOffsetDeg[2] = -rotationOffsetDeg[2];
			}
		}
		if(hasPositionOffset){
			double local[3] = {
				positionOffsetCm[0] / 100.0,
				positionOffsetCm[1] / 100.0,
				positionOffsetCm[2] / 100.0,
			};
			double world[3];
			QuatRotateVector(pose.qRotation, local, world);
			pose.vecPosition[0] += world[0];
			pose.vecPosition[1] += world[1];
			pose.vecPosition[2] += world[2];
		}
		if(hasRotationOffset){
			pose.qRotation = QuatMultiply(pose.qRotation, QuatFromEulerDeg(rotationOffsetDeg));
		}
		if(alignerOverrideActive.load(std::memory_order_relaxed)){
			std::lock_guard<std::mutex> logGuard(poseLogLock);
			if(!alignerAppliedLogged){
				alignerAppliedLogged = true;
				DriverLog("Aligner: working offsets APPLYING to device id=%u (rot %.1f,%.1f,%.1f deg pos %.2f,%.2f,%.2f cm)",
					openVRID, rotationOffsetDeg[0], rotationOffsetDeg[1], rotationOffsetDeg[2],
					positionOffsetCm[0], positionOffsetCm[1], positionOffsetCm[2]);
			}
		}
	}
	// per-hand unmirrored trims (ControllersConfig::left*/right*): applied
	// after the shared mirrored offsets, same local-frame convention.
	if(streamedController){
		int hand = -1;
		{
			std::lock_guard<std::mutex> handGuard(poseLogLock);
			auto handFound = openVRIDHand.find(openVRID);
			if(handFound != openVRIDHand.end()){
				hand = handFound->second;
			}
		}
		const double* handRot = nullptr;
		const double* handPos = nullptr;
		if(hand == 0){
			handRot = driverConfig.controllers.leftRotationOffsetDeg;
			handPos = driverConfig.controllers.leftPositionOffsetCm;
		}else if(hand == 1){
			handRot = driverConfig.controllers.rightRotationOffsetDeg;
			handPos = driverConfig.controllers.rightPositionOffsetCm;
		}
		if(handRot && handPos){
			if(handPos[0] != 0 || handPos[1] != 0 || handPos[2] != 0){
				double local[3] = {handPos[0] / 100.0, handPos[1] / 100.0, handPos[2] / 100.0};
				double world[3];
				QuatRotateVector(pose.qRotation, local, world);
				pose.vecPosition[0] += world[0];
				pose.vecPosition[1] += world[1];
				pose.vecPosition[2] += world[2];
			}
			if(handRot[0] != 0 || handRot[1] != 0 || handRot[2] != 0){
				double rot[3] = {handRot[0], handRot[1], handRot[2]};
				pose.qRotation = QuatMultiply(pose.qRotation, QuatFromEulerDeg(rot));
			}
		}
	}
	// capture the post-offset pose per hand for the controller aligner (the
	// drawn tip marker must reflect the live working offsets)
	if(openVRID != vr::k_unTrackedDeviceIndex_Hmd && pose.poseIsValid){
		std::lock_guard<std::mutex> alignGuard(poseLogLock);
		auto handFound = openVRIDHand.find(openVRID);
		if(handFound != openVRIDHand.end()){
			AlignControllerState &state = alignControllers[handFound->second];
			state.poseValid = true;
			state.pos[0] = pose.vecPosition[0];
			state.pos[1] = pose.vecPosition[1];
			state.pos[2] = pose.vecPosition[2];
			state.rot = pose.qRotation;
			state.poseTime = std::chrono::duration_cast<std::chrono::microseconds>(
				std::chrono::steady_clock::now().time_since_epoch()).count() / 1000000.0;
		}
	}
	// diagnostic capture of the stream's own pose and velocities (StreamPoseTrace.h)
	if(driverConfig.streamFrame.streamPoseTrace && openVRID != vr::k_unTrackedDeviceIndex_Hmd && IsStreamedController(openVRID)){
		const double traceQ[4] = {pose.qRotation.w, pose.qRotation.x, pose.qRotation.y, pose.qRotation.z};
		gxr::StreamPoseTrace(std::chrono::duration_cast<std::chrono::microseconds>(
			std::chrono::steady_clock::now().time_since_epoch()).count() / 1000000.0,
			openVRID, rawPoseValid, rawResult, pose.poseTimeOffset,
			pose.vecPosition, traceQ, pose.vecVelocity, pose.vecAngularVelocity);
	}
	// the pose offsets moved the origin away from the point the stream's
	// velocities describe (GameLinkMotion.h)
	if(streamedController){
		const bool moved = pose.qRotation.w != streamRotation.w || pose.qRotation.x != streamRotation.x
			|| pose.qRotation.y != streamRotation.y || pose.qRotation.z != streamRotation.z
			|| pose.vecPosition[0] != streamPosition[0] || pose.vecPosition[1] != streamPosition[1]
			|| pose.vecPosition[2] != streamPosition[2];
		if(moved){
			const double qStream[4] = {streamRotation.w, streamRotation.x, streamRotation.y, streamRotation.z};
			const double qOut[4] = {pose.qRotation.w, pose.qRotation.x, pose.qRotation.y, pose.qRotation.z};
			gxr::GameLinkOffsetVelocities(qStream, streamPosition, qOut, pose.vecPosition, pose.vecVelocity, pose.vecAngularVelocity);
		}
	}
	// the stream's pose, time stamp and velocities go out as they come, the
	// way Samsung's driver reports its own (GameLinkMotion.h): a velocity
	// below the cutoff is zeroed, no accelerations.
	if(openVRID != vr::k_unTrackedDeviceIndex_Hmd && IsStreamedController(openVRID)){
		double linCut = driverConfig.streamFrame.gameLinkLinearVelocityCutoff;
		double angCut = driverConfig.streamFrame.gameLinkAngularVelocityCutoffDeg * 3.14159265358979323846 / 180.0;
		if(linCut > 0){ gxr::GameLinkVelocityCutoff(pose.vecVelocity, linCut); }
		if(angCut > 0){ gxr::GameLinkVelocityCutoff(pose.vecAngularVelocity, angCut); }
		for(int a2 = 0; a2 < 3; a2++){
			pose.vecAcceleration[a2] = 0;
			pose.vecAngularAcceleration[a2] = 0;
		}
	}
	// rest smoothing of the pose (GameLinkMotion.h). a sample without valid
	// tracking passes as it is and restarts the filter.
	if(streamedController){
		const double smoothNow = std::chrono::duration_cast<std::chrono::microseconds>(
			std::chrono::steady_clock::now().time_since_epoch()).count() / 1000000.0;
		const bool trackingOk = rawPoseValid && rawResult == (int)vr::TrackingResult_Running_OK;
		double q[4] = {pose.qRotation.w, pose.qRotation.x, pose.qRotation.y, pose.qRotation.z};
		std::lock_guard<std::mutex> smoothGuard(poseSmootherLock);
		gxr::GameLinkSmoother &smoother = poseSmoothers[openVRID];
		if(!trackingOk){
			smoother.have = false;
		}else{
			gxr::GameLinkSmooth(smoother, smoothNow, driverConfig.streamFrame.controllerSmoothingHz,
				pose.vecVelocity, pose.vecAngularVelocity, pose.vecPosition, q);
			pose.qRotation = {q[0], q[1], q[2], q[3]};
		}
	}
	// mixed-space velocity frame fix (playspace-override setups): the
	// openvr header leaves vecVelocity's frame unspecified while positions
	// are driver-space + WorldFromDriver. an overrider aligning lighthouse
	// space into the vrlink space carries a large WorldFromDriver yaw, and
	// with mismatched conventions thrown objects fly at the right speed in
	// the wrong direction. "world" (1) rotates the reported velocity by
	// qWorldFromDriverRotation, "driver" (2) applies the inverse; the
	// field test decides which matches vrserver's real convention. only
	// devices whose WorldFromDriver rotation deviates >2 deg from identity
	// are touched (and logged once either way, so a log alone shows the
	// alignment angle and whether this fix is even relevant).
	if(openVRID != vr::k_unTrackedDeviceIndex_Hmd && openVRID < 64 && pose.poseIsValid){
		const vr::HmdQuaternion_t &qwd = pose.qWorldFromDriverRotation;
		double wClamped = qwd.w > 1.0 ? 1.0 : (qwd.w < -1.0 ? -1.0 : qwd.w);
		double angleDeg = 2.0 * acos(fabs(wClamped)) * 180.0 / 3.14159265358979323846;
		if(angleDeg > 2.0){
			int spaceFixMode = driverConfig.controllers.spaceVelocityFixMode;
			uint64_t bit = 1ull << openVRID;
			if(!(spaceFixLoggedMask.load(std::memory_order_relaxed) & bit)){
				spaceFixLoggedMask.fetch_or(bit, std::memory_order_relaxed);
				DriverLog("SpaceVelFix: id=%u WorldFromDriver angle=%.1f deg, mode=%s",
					openVRID, angleDeg,
					spaceFixMode == 1 ? "world" : (spaceFixMode == 2 ? "driver" : "off (candidate)"));
			}
			if(spaceFixMode > 0){
				vr::HmdQuaternion_t q = qwd;
				if(spaceFixMode == 2){
					q.x = -q.x; q.y = -q.y; q.z = -q.z;
				}
				double vIn[3] = { pose.vecVelocity[0], pose.vecVelocity[1], pose.vecVelocity[2] };
				double wIn[3] = { pose.vecAngularVelocity[0], pose.vecAngularVelocity[1], pose.vecAngularVelocity[2] };
				double vOut[3], wOut[3];
				QuatRotateVector(q, vIn, vOut);
				QuatRotateVector(q, wIn, wOut);
				pose.vecVelocity[0] = vOut[0]; pose.vecVelocity[1] = vOut[1]; pose.vecVelocity[2] = vOut[2];
				pose.vecAngularVelocity[0] = wOut[0]; pose.vecAngularVelocity[1] = wOut[1]; pose.vecAngularVelocity[2] = wOut[2];
			}
		}
	}

	if(driverConfig.streamFrame.poseLogging && openVRID != vr::k_unTrackedDeviceIndex_Hmd){
		LogDevicePose(openVRID, pose);
	}
	return true;
}

GalaxyXRDeviceProvider::StreamedDeviceKind GalaxyXRDeviceProvider::GetStreamedDeviceKind(uint32_t openVRID){
	{
		std::lock_guard<std::mutex> guard(streamedIdentityLock);
		auto found = streamedDeviceKindCache.find(openVRID);
		if(found != streamedDeviceKindCache.end()){
			return found->second;
		}
	}
	// property query with NO lock held (concurrency law: never call out
	// while holding a lock — ResolveContainerId taught us that one)
	vr::PropertyContainerHandle_t container = vr::VRProperties()->TrackedDeviceToPropertyContainer(openVRID);
	vr::ETrackedPropertyError propError = vr::TrackedProp_Success;
	char serial[128] = {};
	vr::VRProperties()->GetStringProperty(container, vr::Prop_SerialNumber_String, serial, sizeof(serial), &propError);
	StreamedDeviceKind kind = StreamedDeviceKind::Other;
	if(propError == vr::TrackedProp_Success){
		if(NativeHandSerial(serial)){
			kind = StreamedDeviceKind::NativeHand;
		}else if(PhysicalGalaxyControllerSerial(serial)){
			kind = StreamedDeviceKind::PhysicalController;
		}
	}else{
		// property not readable yet: do not cache, do not touch
		return StreamedDeviceKind::Other;
	}
	{
		std::lock_guard<std::mutex> guard(streamedIdentityLock);
		streamedDeviceKindCache[openVRID] = kind;
	}
	// 2026-10-04: the hand comes from the serial (VRLINKQ2_Controller_Left /
	// _Right). the x/y vs a/b button creates that used to be the only source
	// did not reach the driver in the field session, so the right hand got
	// the left hand's offsets unmirrored and no per-hand trim applied.
	if(kind == StreamedDeviceKind::PhysicalController){
		const std::string serialText = serial;
		const int hand = serialText.find("Left") != std::string::npos ? 0
			: (serialText.find("Right") != std::string::npos ? 1 : -1);
		if(hand >= 0){
			std::lock_guard<std::mutex> handGuard(poseLogLock);
			openVRIDHand[openVRID] = hand;
		}
	}
	const char* kindName = kind == StreamedDeviceKind::PhysicalController ? "physical-controller"
		: (kind == StreamedDeviceKind::NativeHand ? "native-hand-passthrough" : "other-passthrough");
	DriverLog("DeviceClassifier: id=%u serial=%s kind=%s", openVRID, serial, kindName);
	return kind;
}

bool GalaxyXRDeviceProvider::IsNativeHand(uint32_t openVRID){
	return GetStreamedDeviceKind(openVRID) == StreamedDeviceKind::NativeHand;
}

bool GalaxyXRDeviceProvider::IsStreamedController(uint32_t openVRID){
	return GetStreamedDeviceKind(openVRID) == StreamedDeviceKind::PhysicalController;
}

void GalaxyXRDeviceProvider::LogDevicePose(uint32_t openVRID, const vr::DriverPose_t &pose){
	double now = std::chrono::duration_cast<std::chrono::microseconds>(
		std::chrono::steady_clock::now().time_since_epoch()).count() / 1000000.0;
	double speed = sqrt(pose.vecVelocity[0] * pose.vecVelocity[0]
		+ pose.vecVelocity[1] * pose.vecVelocity[1]
		+ pose.vecVelocity[2] * pose.vecVelocity[2]);
	double angularSpeed = sqrt(pose.vecAngularVelocity[0] * pose.vecAngularVelocity[0]
		+ pose.vecAngularVelocity[1] * pose.vecAngularVelocity[1]
		+ pose.vecAngularVelocity[2] * pose.vecAngularVelocity[2]);
	
	// steady line every 2s per device; burst lines (max 100Hz per device)
	// while linear speed exceeds 2 m/s, which is what captures throw arcs
	// and the velocity reported at the moment of release.
	bool steady = false;
	bool burst = false;
	bool announce = false;
	bool trackChange = false;
	double peakForLog = 0;
	double fdSpeed = 0;
	double fdAngSpeed = 0;
	{
	std::lock_guard<std::mutex> guard(poseLogLock);
	RefreshPoseDiagnosticSession();
		PoseLogState &state = poseLogStates[openVRID];
		if(!state.announced){
			state.announced = true;
			announce = true;
		}
		// velocity derived from position deltas, lightly smoothed. if the
		// reported |v| saturates near 2 m/s while this keeps climbing during
		// a throw, the clamp lives in the driver's reported velocity and can
		// be replaced from poses.
		// min dt guard: vrlink resubmits re-predicted poses fractions of a
		// millisecond apart; dividing mm differences by sub-ms dt produced
		// absurd fd spikes (field data: 90 m/s at rest) and false bursts.
		// teleport-scale instants are dropped instead of averaged in.
		if(state.havePos && now - state.lastSampleTime >= 0.003 && now - state.lastSampleTime < 0.1){
			double dt = now - state.lastSampleTime;
			double dx = pose.vecPosition[0] - state.lastPos[0];
			double dy = pose.vecPosition[1] - state.lastPos[1];
			double dz = pose.vecPosition[2] - state.lastPos[2];
			double instant = sqrt(dx * dx + dy * dy + dz * dz) / dt;
			if(instant < 30.0){
				state.fdSpeedEma = state.fdSpeedEma * 0.7 + instant * 0.3;
			}
			// quaternion derived angular speed for the same comparison on
			// the rotational side: 2 acos(|<q1,q2>|) / dt
			if(state.haveQuat){
				double dot = state.lastQuat.w * pose.qRotation.w + state.lastQuat.x * pose.qRotation.x
					+ state.lastQuat.y * pose.qRotation.y + state.lastQuat.z * pose.qRotation.z;
				if(dot < 0){ dot = -dot; }
				if(dot > 1.0){ dot = 1.0; }
				double angInstant = 2.0 * acos(dot) / dt;
				if(angInstant < 100.0){
					state.fdAngSpeedEma = state.fdAngSpeedEma * 0.7 + angInstant * 0.3;
				}
			}
			state.lastQuat = pose.qRotation;
			state.haveQuat = true;
		}else if(!state.havePos){
			state.lastQuat = pose.qRotation;
			state.haveQuat = true;
		}
		if(now - state.lastSampleTime >= 0.003 || !state.havePos){
			state.lastPos[0] = pose.vecPosition[0];
			state.lastPos[1] = pose.vecPosition[1];
			state.lastPos[2] = pose.vecPosition[2];
			state.lastSampleTime = now;
			state.havePos = true;
		}
		fdSpeed = state.fdSpeedEma;
		fdAngSpeed = state.fdAngSpeedEma;
		// record the pose as the release snapshot for ReleaseSnap lines
		{
			MotionSnapshot &snap = motionSnapshots[openVRID];
			snap.time = now;
			snap.outVel[0] = pose.vecVelocity[0];
			snap.outVel[1] = pose.vecVelocity[1];
			snap.outVel[2] = pose.vecVelocity[2];
			snap.outAng[0] = pose.vecAngularVelocity[0];
			snap.outAng[1] = pose.vecAngularVelocity[1];
			snap.outAng[2] = pose.vecAngularVelocity[2];
			snap.outSpeed = speed;
			snap.trackingOk = pose.poseIsValid && pose.result == vr::TrackingResult_Running_OK;
			snap.result = (int)pose.result;
		}
		if(speed > state.peakSpeed){
			state.peakSpeed = speed;
		}
		// tracking state transitions are logged immediately (dropouts during
		// fast motion zero the speed, so speed-triggered bursts miss them —
		// exactly the "item falls straight down" moments)
		bool nowValid = pose.poseIsValid;
		int nowResult = (int)pose.result;
		if(!state.haveTrackState){
			state.haveTrackState = true;
			state.lastLoggedValid = nowValid;
			state.lastLoggedResult = nowResult;
		}else if((nowValid != state.lastLoggedValid || nowResult != state.lastLoggedResult)
				&& now - state.lastBurstLog >= 0.005){
			state.lastLoggedValid = nowValid;
			state.lastLoggedResult = nowResult;
			state.lastBurstLog = now;
			trackChange = true;
		}
		// keep burst logging alive for 300ms after fast motion so the
		// post release phase (including any dropout / zeroing) is captured.
		// EFFECTIVE speed (|v| + 0.15|w|): pure wrist flicks are w-dominant
		// with little linear motion, and a linear-only trigger made them
		// systematically invisible to the diagnostics (field 2026-08-10:
		// 3 flick samples out of 581)
		double effSpeed = speed + 0.15 * angularSpeed;
		double fdEffSpeed = fdSpeed + 0.15 * fdAngSpeed;
		if(effSpeed > 2.0 || fdEffSpeed > 2.0){
			state.recentFastTime = now;
		}
		bool inPostFastWindow = now - state.recentFastTime < 0.3;
		if(now - state.lastSteadyLog >= 2.0){
			state.lastSteadyLog = now;
			steady = true;
			peakForLog = state.peakSpeed;
			state.peakSpeed = 0;
		}else if((effSpeed > 2.0 || fdEffSpeed > 2.0 || inPostFastWindow)
				&& driverConfig.streamFrame.poseLogBurst
				&& now - state.lastBurstLog >= 0.01){
			state.lastBurstLog = now;
			burst = true;
		}
	}
	if(trackChange){
		DriverLog("PoseLog: TRACKING id=%u valid=%d result=%d |v|=%.3f fd|v|=%.3f pos=(%.3f, %.3f, %.3f)",
			openVRID, (int)pose.poseIsValid, (int)pose.result, speed, fdSpeed,
			pose.vecPosition[0], pose.vecPosition[1], pose.vecPosition[2]);
	}
	if(announce){
		// resolve which physical device this id is, once, so pose lines are
		// attributable without guessing at activation order
		char serial[128] = {};
		vr::PropertyContainerHandle_t container = vr::VRProperties()->TrackedDeviceToPropertyContainer(openVRID);
		vr::ETrackedPropertyError propError = vr::TrackedProp_Success;
		vr::VRProperties()->GetStringProperty(container, vr::Prop_SerialNumber_String, serial, sizeof(serial), &propError);
		DriverLog("PoseLog: id=%u serial=%s", openVRID,
			propError == vr::TrackedProp_Success ? serial : "(unknown)");
	}
	if(steady){
		DriverLog("PoseLog: id=%u pos=(%.3f, %.3f, %.3f) |v|=%.3f fd|v|=%.3f |w|=%.2f fd|w|=%.2f peak|v|=%.3f valid=%d connected=%d result=%d timeOffset=%.4f",
			openVRID, pose.vecPosition[0], pose.vecPosition[1], pose.vecPosition[2],
			speed, fdSpeed, angularSpeed, fdAngSpeed, peakForLog,
			(int)pose.poseIsValid, (int)pose.deviceIsConnected, (int)pose.result,
			pose.poseTimeOffset);
	}else if(burst){
		DriverLog("PoseLog: BURST id=%u v=(%.3f, %.3f, %.3f) |v|=%.3f fd|v|=%.3f |w|=%.2f fd|w|=%.2f valid=%d result=%d timeOffset=%.4f",
			openVRID, pose.vecVelocity[0], pose.vecVelocity[1], pose.vecVelocity[2],
			speed, fdSpeed, angularSpeed, fdAngSpeed, (int)pose.poseIsValid, (int)pose.result,
			pose.poseTimeOffset);
	}
}

bool GalaxyXRDeviceProvider::HandleDeviceAdded(const char *&pchDeviceSerialNumber, vr::ETrackedDeviceClass &eDeviceClass, vr::ITrackedDeviceServerDriver *&pDriver){
	#ifdef HAS_PRIVATE
	if(driverConfig.onlyHandlePrivateFunctionality){
		return true;
	}
	#endif
	DriverLog("HandleDeviceAdded %s\n", pchDeviceSerialNumber);
	if(eDeviceClass == vr::TrackedDeviceClass_HMD){
		// keep the (possibly later wrapped) source device for projection
		// queries; GetComponent forwards through shims either way
		hmdDevice = pDriver;
		
		// add more shims here, they can stack and none of the functions are particularly hot
		// later shims can override earlier shims
		// the PosTrackedDeviceActivate function will likely have enough information that you can decide if it is the device you want and can then set shimActive to false to deactivate the shim
		
		// TODO: validate the interface versions of drivers and make the shims conform to versions to prevent potential crashes
		
		
		GenericHeadsetShim* genericHeadsetShim = new GenericHeadsetShim();
		genericHeadsetShim->deviceProvider = this;
		shims.insert(genericHeadsetShim);
		pDriver = new ShimTrackedDeviceDriver(genericHeadsetShim, pDriver);
		
		#ifdef VENDOR_GALAXYXR
		{ // Keep settings hot reload active even when identity stamping is off.
			GalaxyXRHmdShim* galaxyXrHmdShim = new GalaxyXRHmdShim();
			galaxyXrHmdShim->deviceProvider = this;
			shims.insert(galaxyXrHmdShim);
			pDriver = new ShimTrackedDeviceDriver(galaxyXrHmdShim, pDriver);
		}
		#endif
	}
	#ifdef VENDOR_GALAXYXR
	// the controller shim carries identity (models, icons), the input
	// profile and the official pose components. it is created for every
	// streamed controller whenever any of those is wanted; no identity
	// checks beyond the serial (2026-08-26: APK identities are unreliable,
	// the user picked this driver for a Galaxy XR, stamp on request).
	if(eDeviceClass == vr::TrackedDeviceClass_Controller && !driverConfig.galaxyXr.controllerBypass
			&& (driverConfig.galaxyXr.nativeIdentity || driverConfig.galaxyXr.nativeInputProfile)){
		std::string serial = pchDeviceSerialNumber ? pchDeviceSerialNumber : "";
		// SamsungVST-Controller-* on the patched APK, VRLINKQ2_Controller_* on
		// the stock one. "Controller" excludes the VRLINKQ_Hand_* hand trackers.
		bool streamedController = PhysicalGalaxyControllerSerial(serial.c_str());
		if(streamedController){
			GalaxyXRControllerShim* controllerShim = new GalaxyXRControllerShim(serial);
			shims.insert(controllerShim);
			pDriver = new ShimTrackedDeviceDriver(controllerShim, pDriver);
		}
	}
	#endif
	// you can change eDeviceClass to change what an existing device shows up as
	
	// if false is returned the device will not be added
	return true;
}

void GalaxyXRDeviceProvider::GetTunerInput(TunerInputState &out){
	out = TunerInputState();
	std::lock_guard<std::mutex> guard(poseLogLock);
	for(const auto &pair : inputComponents){
		const InputComponentInfo &info = pair.second;
		switch(info.tunerRole){
			case 1:
				// largest-magnitude joystick y across hands, so either stick
				// nudges and an idle stick cannot cancel a deflected one
				if(fabsf(info.tunerScalar) > fabsf(out.stickY)){ out.stickY = info.tunerScalar; }
				break;
			case 2: out.bandOut = out.bandOut || info.tunerBool; break;
			case 3: out.bandIn = out.bandIn || info.tunerBool; break;
			case 4: out.eyeToggle = out.eyeToggle || info.tunerBool; break;
			case 5: out.resetBand = out.resetBand || info.tunerBool; break;
			case 6: if(info.tunerScalar > out.grip){ out.grip = info.tunerScalar; } break;
			case 7:
				if(fabsf(info.tunerScalar) > fabsf(out.stickX)){ out.stickX = info.tunerScalar; }
				break;
			case 8: if(info.tunerScalar > out.trigger){ out.trigger = info.tunerScalar; } break;
			case 9: out.segToggle = out.segToggle || info.tunerBool; break;
		}
	}
}

void GalaxyXRDeviceProvider::GetAlignController(int hand, AlignControllerState &out){
	std::lock_guard<std::mutex> guard(poseLogLock);
	if(hand == 0 || hand == 1){
		out = alignControllers[hand];
	}else{
		out = AlignControllerState();
	}
}

void GalaxyXRDeviceProvider::SetAlignerOffsets(bool active, const double rotDeg[3], const double posCm[3]){
	{
		std::lock_guard<std::mutex> guard(poseLogLock);
		for(int i = 0; i < 3; i++){
			alignerRotDeg[i] = rotDeg[i];
			alignerPosCm[i] = posCm[i];
		}
		if(!active){
			alignerAppliedLogged = false;
		}
	}
	alignerOverrideActive.store(active, std::memory_order_relaxed);
}
