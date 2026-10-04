#pragma once

#include <set>
#include <map>
#include <vector>
#include <mutex>
#include <string>
#include <atomic>

#include "openvr_driver.h"
#include "GameLinkMotion.h"
#include "StreamPoseTrace.h"

class ShimDefinition;

#define VREvent_VendorSpecific_ContextCollection (vr::EVREventType)(vr::VREvent_VendorSpecific_Reserved_Start + 5872)
#define VREvent_VendorSpecific_ContextCollection_MagicDataNumber 32643216579172981


class GalaxyXRDeviceProvider : public vr::IServerTrackedDeviceProvider
{
public:
	vr::EVRInitError Init(vr::IVRDriverContext *pDriverContext) override;
	const char *const *GetInterfaceVersions() override;
	
	// called by the main loop of the server
	void RunFrame() override;
	// deprecated function, but still must be defined
	bool ShouldBlockStandbyMode() override;
	// SteamVR is entering/leaving standby mode
	void EnterStandby() override;
	void LeaveStandby() override;
	// cleanup on exit
	void Cleanup() override;
	
	// handle hook of TrackedDevicePoseUpdated
	bool HandleDevicePoseUpdated(uint32_t openVRID, vr::DriverPose_t &pose);
	// Strict physical-controller classification shared with pose publication.
	bool IsStreamedController(uint32_t openVRID);
	// handle hook of TrackedDeviceAdded
	bool HandleDeviceAdded(const char* &pchDeviceSerialNumber, vr::ETrackedDeviceClass &eDeviceClass, vr::ITrackedDeviceServerDriver* &pDriver);
	// set of driver conexts collected by the hooking process
	std::set<vr::IVRDriverContext*> driverContexts = {};
	// map of driver contexts by device id
	// this is populated by VREvent_VendorSpecific_ContextCollection events
	std::map<uint32_t, vr::IVRDriverContext*> driverContextsByDeviceId = {};
	// sends out VREvent_VendorSpecific_ContextCollection events for a given device id
	// after some time, the driverContextsByDeviceId map should be contain the context for this device
	void SendContextCollectionEvents(uint32_t id);
	// attempt to send the event if the context is available, returns true if successful.
	// if false was returned the message has queued to be sent if the driver context can be found
	// events must be sent from the context that owns the device, so this is necessary
	bool SendVendorEvent(uint32_t unWhichDevice, vr::EVREventType eventType, const vr::VREvent_Data_t & eventData, double eventTimeOffset);
	// a set of all shim objects to manage
	// this allows them to have RunThread called
	std::set<ShimDefinition*> shims;
private:
	struct QueuedEvent {
		vr::EVREventType eventType;
		vr::VREvent_Data_t eventData;
		double eventTimeOffset;
	};
	// events that are waiting for a context to be found
	std::map<uint32_t, std::vector<QueuedEvent>> queuedEvents = {};
	bool customShaderEnabled = false;
	
	// pose logging diagnostic state (streamFrame.poseLogging), per device.
	// pose updates arrive on the source drivers' own threads, hence the lock.
	struct PoseLogState {
		double lastSteadyLog = 0;
		double lastBurstLog = 0;
		// peak linear speed observed since the last steady log line
		double peakSpeed = 0;
		// serial announced once on first sight (maps openVRID -> device)
		bool announced = false;
		// tracking state transition + post throw window logging
		bool haveTrackState = false;
		bool lastLoggedValid = false;
		int lastLoggedResult = 0;
		double recentFastTime = 0;
		// finite difference velocity from positions, to compare against the
		// velocity the driver reports (suspected ~2 m/s clamp in vrlink)
		bool havePos = false;
		double lastPos[3] = {0, 0, 0};
		double lastSampleTime = 0;
		double fdSpeedEma = 0;
		// quaternion-derived angular speed, same idea as fdSpeed: compare
		// against the driver's reported |w| to see if angular velocity is
		// smoothed the same way linear velocity is
		bool haveQuat = false;
		vr::HmdQuaternion_t lastQuat = {1, 0, 0, 0};
		double fdAngSpeedEma = 0;
	};
	std::map<uint32_t, PoseLogState> poseLogStates = {};
	std::mutex poseLogLock = {};
	uint64_t poseDiagnosticGeneration = 0; // guarded by poseLogLock
	// Caller holds the corresponding state lock; never acquire another lock.
	void RefreshPoseDiagnosticSession();
	// one-shot per-device announcement of a non-identity WorldFromDriver
	// (mixed-space setups); lock free for the pose hot path
	std::atomic<uint64_t> spaceFixLoggedMask{0};
	void LogDevicePose(uint32_t openVRID, const vr::DriverPose_t &pose);
	
	// pose component tracking (ET hunt: gaze may be published as a pose
	// component; log creates and throttle updates from the HMD container)
	struct PoseComponentInfo {
		vr::PropertyContainerHandle_t container = 0;
		std::string name;
		uint64_t updates = 0;
		double lastLogTime = 0;
	};
	std::map<vr::VRInputComponentHandle_t, PoseComponentInfo> poseComponents = {};
	// cached device classes (Prop_DeviceClass_Int32), resolved on first pose
	std::map<uint32_t, int> deviceClasses = {};
	// Strict vrlink device classification. A VRLINK prefix alone is not
	// enough: native hand devices use VRLINKQ_Hand_* serials and must never
	// enter any physical-controller pose/filter path. Unknown devices pass
	// through untouched. Queried outside locks and cached only after the
	// serial property is readable.
	enum class StreamedDeviceKind : int {
		Other = 0,
		PhysicalController = 1,
		NativeHand = 2,
	};
	std::map<uint32_t, StreamedDeviceKind> streamedDeviceKindCache = {};
	std::mutex streamedIdentityLock;
	// rest smoothing state per streamed controller (GameLinkMotion.h)
	std::map<uint32_t, gxr::GameLinkSmoother> poseSmoothers = {};
	std::mutex poseSmootherLock;
	StreamedDeviceKind GetStreamedDeviceKind(uint32_t openVRID);
	bool IsNativeHand(uint32_t openVRID);
	int GetDeviceClass(uint32_t openVRID);
	
	// ---- release ground truth tap ----
	// vrlink publishes grip/trigger through IVRDriverInput booleans; the
	// injector forwards creates and updates here. on grip/trigger
	// transitions we log a snapshot of the motion state so every release in
	// a session shows exactly what velocity a game could have read and what
	// the tracking state was. this replaces theorizing about WHY a given
	// throw died (snap back? dropout? zero?) with direct evidence.
	struct InputComponentInfo {
		vr::PropertyContainerHandle_t container = 0;
		uint32_t openVRID = vr::k_unTrackedDeviceIndexInvalid;
		std::string name;
		bool lastValue = false;
		bool haveValue = false;
		bool interesting = false; // grip / trigger / squeeze / grab / pinch
		bool isScalar = false;
		float lastScalar = 0;
		bool scalarPressed = false;
		// 2026-09-06 grip capacitive touch synthesis: vrlink only creates
		// /input/grip/value for the Galaxy XR controllers (no grip/touch
		// boolean), so our profile's grip touch never lit. we create the
		// boolean on the same container when grip/value appears and drive
		// it from the value with hysteresis.
		vr::VRInputComponentHandle_t gripTouchHandle = vr::k_ulInvalidInputComponentHandle;
		bool gripTouched = false;
		bool gripTouchSource = false;
		bool gripTouchCreateAttempted = false;
		float gripTouchValue = 0;
		// distortion tuner control role, classified from the path at create:
		// 0 none, 1 joystick y (nudge), 2 a (band out), 3 b (band in),
		// 4 x (eye cycle), 5 y (reset band), 6 grip value (hold to save).
		// tuner values live in their own fields so the tuner never disturbs
		// lastValue/lastScalar, which the release forensics and velocity fix
		// use for edge and gesture detection.
		int tunerRole = 0;
		float tunerScalar = 0;
		bool tunerBool = false;
		// Temporary native-hand diagnostics. These are observational only:
		// the original IVRDriverInput call is made before this tap.
		bool nativeHand = false;
		bool diagnostic = false;
		bool diagHaveBool = false;
		bool diagLastBool = false;
		bool diagHaveScalar = false;
		float diagLastScalar = 0;
		double diagLastLogTime = 0;
	};
	std::map<vr::VRInputComponentHandle_t, InputComponentInfo> inputComponents = {};
	// Serialize synthesized-input IO without holding the reentrant input map lock.
	std::mutex gripTouchLock;
	void UpdateGripTouch(vr::VRInputComponentHandle_t handle);
	void RefreshGripTouch();
	// gate for tuner input capture on the hot component-update path
	std::atomic<bool> tunerInputActive {false};

	std::map<vr::PropertyContainerHandle_t, uint32_t> containerToId = {};
	struct MotionSnapshot {
		double time = 0;
		double outVel[3] = {};
		double outAng[3] = {};
		double outSpeed = 0;
		bool trackingOk = false;
		int result = 0;
	};
	std::map<uint32_t, MotionSnapshot> motionSnapshots = {};
	double lastReleaseLogTime = 0;
	double lastEdgeLogTime = 0;
	void HandleInputRelease(vr::PropertyContainerHandle_t container, const std::string &name);
	void LogReleaseSnapshot(vr::PropertyContainerHandle_t container, const std::string &name);
	uint32_t ResolveContainerId(vr::PropertyContainerHandle_t container);
	// the vrlink HMD device, stored at TrackedDeviceAdded so the real
	// per-eye projection frusta can be queried from its display component
	// (used for the gaze -> viewport mapping, same math the runtime uses
	// for GetEyeTrackedFoveationCenter)
	vr::ITrackedDeviceServerDriver* hmdDevice = nullptr;
	bool hmdProjectionQueried = false;
	bool hmdProjectionValid = false;
	float hmdProjection[2][4] = {}; // [eye][left,right,top,bottom]
public:
	// returns false until the display component has been queried successfully
	bool GetHmdProjectionRaw(int eye, float &left, float &right, float &top, float &bottom);
private:
public:
	// ---- distortion tuner input surface ----
	// aggregated latest controller state for the interactive distortion
	// tuner: largest-magnitude joystick y across hands, band/eye/reset
	// click states, and the max grip value. capture only happens while the
	// tuner is armed (cheap atomic gate on the hot update path).
	struct TunerInputState {
		float stickY = 0;
		float stickX = 0;
		bool bandOut = false;   // a click
		bool bandIn = false;    // b click
		bool eyeToggle = false; // x click
		bool resetBand = false; // y click
		bool segToggle = false; // joystick click (either stick). band tuner with
		                        // segments > 1 uses it for the EYE cycle (X walks
		                        // segments there); unused in classic sessions
		float grip = 0;
		float trigger = 0;
	};
	void SetTunerInputActive(bool active){ tunerInputActive.store(active, std::memory_order_relaxed); }
	void GetTunerInput(TunerInputState &out);
	// ---- controller aligner surface ----
	// latest post-offset controller pose + vrlink tip offset per hand
	// (0 = left, 1 = right), for the aligner's tip marker and pivot solve
	struct AlignControllerState {
		bool poseValid = false;
		double pos[3] = {0, 0, 0};
		vr::HmdQuaternion_t rot = {1, 0, 0, 0};
		double poseTime = 0;      // NowSeconds of last update
		bool tipValid = false;
		double tipLocal[3] = {0, 0, 0};
	};
	void GetAlignController(int hand, AlignControllerState &out);
	// while the aligner is active its WORKING offsets replace the configured
	// controller offsets in the pose path, so edits are live
	void SetAlignerOffsets(bool active, const double rotDeg[3], const double posCm[3]);
private:
	// controller aligner state (guarded by poseLogLock): per-hand pose/tip
	// capture, container->hand classification, live offset override
	AlignControllerState alignControllers[2] = {};
	std::map<vr::PropertyContainerHandle_t, int> containerHand;
	// containers whose /pose/tip belongs to left(0)/right(1), resolved from
	// the container's own controller-role property: vrlink publishes tip
	// poses on the paired hand devices, NOT the button controllers, so the
	// button-derived containerHand map cannot associate them (session 25)
	std::map<vr::PropertyContainerHandle_t, int> containerTipHand;
	bool alignerAppliedLogged = false;
	std::map<uint32_t, int> openVRIDHand;
	std::atomic<bool> alignerOverrideActive {false};
	double alignerRotDeg[3] = {0, 0, 0};
	double alignerPosCm[3] = {0, 0, 0};
public:
	void OnInputComponentCreated(vr::PropertyContainerHandle_t container, const char* name, vr::VRInputComponentHandle_t handle, vr::EVRInputError error);
	void OnBooleanComponentUpdated(vr::VRInputComponentHandle_t handle, bool value, double timeOffset, vr::EVRInputError error);
	void OnScalarComponentCreated(vr::PropertyContainerHandle_t container, const char* name, vr::VRInputComponentHandle_t handle, vr::EVRInputError error);
	void OnScalarComponentUpdated(vr::VRInputComponentHandle_t handle, float value, double timeOffset, vr::EVRInputError error);
	void OnPoseComponentCreated(vr::PropertyContainerHandle_t container, const char* name, vr::VRInputComponentHandle_t handle);
	void OnSkeletonComponentCreated(vr::PropertyContainerHandle_t container, const char* name, const char* skeletonPath, vr::VRInputComponentHandle_t handle);
	bool HandleSkeletonUpdate(vr::VRInputComponentHandle_t handle, const vr::VRBoneTransform_t* bones, uint32_t count, vr::VRBoneTransform_t* outBones);
	void OnPoseComponentUpdated(vr::VRInputComponentHandle_t handle, const vr::HmdMatrix34_t* offset, double timeOffset);
private:
};

// defined in HmdDriverFactory.cpp
extern GalaxyXRDeviceProvider deviceProvider;
