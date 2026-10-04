#pragma once
#include <string>
#include <vector>
#include <map>
#include <mutex>
#include <tuple>

// vendor build selection
// build.js passes /DVENDOR_GALAXYXR through ExternalCompilerOptions for the GalaxyXRNative vendor build.
// when no vendor define is set this is the vendor-neutral build (driver name CustomHeadsetOpenVR).
// this mirrors the vendor mechanism in upstream CustomHeadsetOpenVR so the two drivers can coexist.
#if !defined(VENDOR_GALAXYXR)
#define VENDOR_NEUTRAL
#endif

struct ConfigColor{
	double r = 1.0;
	double g = 1.0;
	double b = 1.0;
};

struct HiddenAreaMeshConfig {
	bool enable = false;
	bool testMode = false;
	int detailLevel = 8;
	double radiusTopOuter = 0.25;
	double radiusTopInner = 0.25;
	double radiusBottomInner = 0.25;
	double radiusBottomOuter = 0.25;

	constexpr bool operator==(const HiddenAreaMeshConfig& other) const {
		return std::tie(this->enable, this->testMode, this->detailLevel, this->radiusTopOuter, this->radiusTopInner, this->radiusBottomInner, this->radiusBottomOuter) ==
		       std::tie(other.enable, other.testMode, other.detailLevel, other.radiusTopOuter, other.radiusTopInner, other.radiusBottomInner, other.radiusBottomOuter);
	}
	constexpr bool operator!=(const HiddenAreaMeshConfig& other) const {
		return !(this->operator==(other));
	}
};

struct StationaryDimmingConfig{
	// if the display should be dimmed when the headset is stationary
	bool enable = true;
	// the angle that the headset has to rotate for it to be considered as moved
	double movementThreshold = 0.4;
	// the time in seconds that the headset has to be stationary for it to be dimmed
	double movementTime = 15.0;
	// the amount to dim the display to when stationary
	double dimBrightnessPercent = 2;
	// the amount per second to dim the display when stationary
	double dimSeconds = 10;
	// the amount per second to brighten the display when moving
	double brightenSeconds = 5;
};


// one control point of the spline distortion curve
struct StreamFrameDistortionPoint{
	// radius, 0 at the optical center, roughly 0.5 at the edge midpoints
	double r = 0;
	// radial scale multiplier at that radius, 1.0 = no change
	double scale = 1;
};

// diagnostic band that limits the distortion correction to a radius range so
// one region of the curve can be tuned against untouched surroundings
struct StreamFrameAnnulusConfig{
	bool enable = false;
	double rMin = 0.0;
	double rMax = 0.75;
	// width of the smooth ramp at both edges of the band
	double feather = 0.05;
};

// interactive in-headset distortion tuner: the human eye as the null
// detector. while enabled the driver takes over the distortion curves with a
// per-band working copy edited live from the controllers (joystick y adjusts
// the highlighted band's scale, a/b step bands outward/inward, x cycles
// linked/left/right eye editing, y resets the band, holding either grip
// saves an importable profile). the tuner forces the angular grid and warped
// overlays on so the nulling task is ready the moment the toggle flips.
struct StreamFrameDistortionTuneConfig{
	bool enable = false;
	// scale units per second at full stick deflection (response is squared,
	// so half deflection moves at a quarter rate for fine work)
	double rate = 0.08;
	// band radii, in the same aspect-corrected radius space as the spline r
	std::vector<double> bands = {0.15, 0.22, 0.30, 0.38, 0.46, 0.55, 0.65};
	// stepped adjustment: when > 0, the stick applies exactly this scale
	// step every 100ms while deflected past halfway, instead of the analog
	// rate. deterministic fine nulling ("one click at a time").
	double stepSize = 0.0;
	// opacity of the band highlight ring (0 hides it entirely)
	double ringOpacity = 0.55;
	// force the angular grid + warped overlays on while tuning. off = the
	// tuner leaves the overlays to the user's own toggles (e.g. tuning
	// against real game content, or the world-locked grid variant).
	bool forceGrid = true;
	// band segments for the tuner session: 1 = radial editing as before,
	// 4 or 8 adds a segment walk (joystick click) so each band can be
	// nudged per angular sector. the ALL position (walk start) still
	// edits the whole band; segments carry deltas on top of it.
	// tune segments last: center first, radial bands second — a wrong
	// center masquerades as exactly the asymmetry segments would absorb.
	int segments = 1;
	// per-band segment counts, one entry per band (inner to outer). outer
	// bands cover far more circumference, so they can carry far more
	// segments than inner ones (e.g. 4,4,8,8,12,16,16). empty = uniform
	// `segments` everywhere; shorter than the band list = last entry
	// repeats; entries clamp to 1..32. the tuner flattens whatever layout
	// into uniform max-count segment curves on save, so profiles and the
	// baked lut are unchanged in shape.
	std::vector<int> segmentLayout = {};
};

// center-offset tuning mode: distinct from the band tuner and used
// independently. while enabled the distortion is replaced by a small
// "breathing" radial pulse (sinusoidal k1) whose stationary point makes the
// currently configured optical center directly visible; the sticks then
// drag it onto the lens's true center (the fringe-free sharpest point of
// the fine grid). results are the centerOffset values, saved independently.
struct StreamFrameCenterTuneConfig{
	bool enable = false;
	// amplitude of the breathing pulse (k1 peak). 0.05 = +-1.25% scale at r=0.5
	double breatheAmp = 0.05;
};

// dense per-eye displacement map: the primary (camera-measured) distortion
// correction representation. a regular cols x rows lattice of control
// points over the eye's bounds-normalized uv square (row major, v major:
// index = (row * cols + col) * 2, +0 = du, +1 = dv), each holding the
// SOURCE SAMPLE OFFSET in uv units at that output position: the output
// pixel at uv samples the content at uv + disp(uv), i.e. content appears
// moved by -disp. bicubic (Catmull-Rom) upsampled at bake, sampled with
// one bilinear tap per pixel, applied after (composed with) the radial
// path so radial curves stay valid as a smooth prior or legacy profile.
// scaled by distortion.gain like the curves. an empty or malformed map
// (wrong length) is identity. produced by tools/gxr_sweep.py (Gray-code
// camera fit) or tools/gxr_overlay.py (manual editing against the camera).
struct StreamFrameDisplacementMap{
	bool enable = true;
	int cols = 0;
	int rows = 0;
	std::vector<double> left = {};
	std::vector<double> right = {};
	// provenance, informational only ("graycode", "manual", ...)
	std::string source = "";
};

// camera calibration support: everything the tools/ python scripts drive
// through settings.json (hot reloaded) while a camera sits in front of one
// lens. see Docs/CameraCalibration.md.
struct StreamFrameCalibConfig{
	// force the output of both eyes to opaque black regardless of every
	// other setting: panel protection while the camera rig stays assembled
	// between sessions. checked last in the shader, nothing overrides it.
	bool blackout = false;
	// which eye the calibration outputs (pattern, capture-mode grid) target:
	// -1 both, 0 left, 1 right. the other eye is black while a pattern is
	// showing so it never leaks into the camera. eye-by-eye workflow.
	int eye = -1;
	// grey level (sRGB code fraction, 0..1) of the calibration pattern's
	// white and of the sboys grid lines. independent of the general
	// brightness so the camera exposure can be pinned once.
	double patternBrightness = 1.0;
	// manual editing preset: sboys hue grid drawn in CONTENT space (so the
	// map warps it exactly like game content), scene behind it desaturated
	// and dimmed so the grid reads clearly against whatever world the user
	// is standing in (no opaque grey: keeps the world as an extra visual
	// reference). does not touch the correction gain.
	bool captureMode = false;
	// gray-code sweep pattern index, -1 off. rendered in OUTPUT space
	// (encodes exactly which output uv the panel shows) at patternBrightness,
	// opaque, bypassing the warp/color chain. sequence: 0 black, 1 white,
	// then for axis u then v, for bit 0..bits-1 (MSB first): pattern,
	// inverse. so 2 + 4 * bits patterns; the driver echoes the shown index
	// and a frame count into diagnostic.json for the capture handshake.
	int pattern = -1;
	// bits per axis of the sweep code, 1..12
	int patternBits = 10;
};

// one distortion curve: k1/k2 polynomial coefficients and/or spline points,
// which of the two is evaluated follows the global distortion mode
struct StreamFrameCurve{
	double k1 = 0;
	double k2 = 0;
	std::vector<StreamFrameDistortionPoint> points = {};
};

struct StreamFrameDistortionConfig{
	// "k1k2" evaluates 1 + k1 r^2 + k2 r^4, "spline" interpolates the points
	std::string mode = "k1k2";
	// spline control points of the base curve, sorted by r internally. flat
	// outside the range. the base k1/k2 live at the streamFrame top level.
	std::vector<StreamFrameDistortionPoint> points = {};
	// global multiplier on the correction: baked scale becomes
	// 1 + gain * (scale - 1). gain 1 = the curve as authored, 0 = off,
	// -1 = the exact inverse. one knob for the perceptual 1d search:
	// sweep gain while watching the warped angular grid during a slow
	// head rotation and keep whatever swims least (settles curve sign
	// AND amplitude in one pass, scaling out any measurement bias).
	double gain = 1.0;
	// separate curves per eye and/or per axis. per axis blends a horizontal and
	// a vertical curve around the ring, capturing elliptic/astigmatic error.
	bool perEye = false;
	bool perAxis = false;
	// named curves used when the toggles are active. expected keys:
	// perEye: "left", "right". perAxis: "horizontal", "vertical".
	// both: "leftHorizontal", "leftVertical", "rightHorizontal", "rightVertical".
	// a missing key falls back to the base curve.
	std::map<std::string, StreamFrameCurve> curves = {};
	// angular band segments: 1 = purely radial curves (default). 2..32
	// splits every band into that many angular segments with their own
	// scale, interpolated periodically around the ring — positional
	// correction for top/bottom/nasal/temporal asymmetry that radial
	// bands cannot express. segment curves live in `curves` under keys
	// "left#0".."left#N-1" / "right#0".. and fall back to the plain
	// per-eye curve when missing. segments > 1 takes precedence over
	// perAxis (it is a superset of the elliptic blend).
	int segments = 1;
	StreamFrameAnnulusConfig annulus = {};
	StreamFrameDistortionTuneConfig tune = {};
	StreamFrameCenterTuneConfig centerTune = {};
	// dense displacement map, composed after the radial curves
	StreamFrameDisplacementMap map = {};
};

// 2026-09-05 post-pack processing on the packed transport frame (see
// NvencPostPack.h): per-tile CAS and the limited-range remap run on the
// 9.4 MP NV12/P010 frame right before the encoder reads it, instead of on
// the 109 MP eye textures. requires the NVENC tap.
struct StreamFramePostPackConfig{
	bool enable = true; // v4 default: post-pack CAS is the sharpening path on NVIDIA
	bool casEnable = true;
	double foveaStrength = 0.6;     // 0..1, the 1:1 gaze cut-out tile
	double peripheryStrength = 0.3; // 0..1, the downscaled whole-view tile (sharpened after its downscale)
	bool foveaTop = true;           // fovea tile is the upper of each eye's pair (from vrlink's shader); flip if the overlay says otherwise
	double edgeFalloff = 0.12;      // fraction of the fovea tile over which sharpening ramps down to the periphery strength (seam softening)
	bool limitedRange = true;       // Y 16..235 / C 16..240 + VUI full-range flag cleared. 09-06: FIXES the black floor with the xrvst2ue-identity APK
};

struct StreamFrameCASConfig{
	// contrast adaptive sharpening applied before encoding
	bool enable = false;
	// 0 to 1
	double strength = 0.5;
	// per-eye override: when enabled, strengthLeft/strengthRight replace the
	// shared strength. lets one eye be sharpened harder (e.g. masking mild
	// off-axis lens blur from facial asymmetry) without over-sharpening the
	// good eye.
	bool perEye = false;
	double strengthLeft = 0.5;
	double strengthRight = 0.5;
};

// fade the streamed frames to black when the headset has not moved for a
// while, e.g. left on a desk with SteamVR running. uniform full fade, so no
// uneven oled wear. brightness returns quickly once movement is detected.
struct StreamFrameDimmingConfig{
	bool enable = false;
	// the angle in degrees that the headset has to rotate to count as moved
	double movementThreshold = 0.4;
	// seconds of stillness before dimming starts
	double movementTime = 15.0;
	// seconds to fade fully to black
	double dimSeconds = 10.0;
	// seconds to fade back to full brightness on movement
	double brightenSeconds = 1.0;
};

// Galaxy XR native-identity options (acted on only in the GalaxyXRNative
// vendor build; the fields always exist so config parsing is uniform)
struct GalaxyXrConfig{
	// rewrite the streamed HMD's visible model/manufacturer to Samsung
	// Galaxy XR, set device icons, and replace the controllers' dangling
	// render model references with converted Galaxy XR controller models.
	// backup/restore semantics; does not touch tracking-system, serial,
	// controller type, or input profile. requires a SteamVR restart.
	#if defined(VENDOR_GALAXYXR)
	bool nativeIdentity = true;
	#else
	bool nativeIdentity = false;
	#endif
	// live render-model tuning: when non-empty, the controller shim points
	// RenderModelName at {driver}/rendermodels/<variant>_left|_right instead
	// of the default galaxy_xr_controller_*. changing this value in
	// settings.json swaps the model live (SteamVR reloads on name change).
	// used by tools/convert_rendermodels.py --live; cleared when the tuned
	// transform is baked into the shipped assets.
	std::string renderModelVariant = "";
	// override the controllers' InputProfilePath to the shipped official
	// samsung_input_profile.json (controller type stays oculus_touch, so
	// existing Touch bindings keep working; adds official legacy bindings,
	// per-app bindings and grip/aim/tip pose components). replaces the
	// dangling {vrlink}/input/samsung_input_profile.json reference that
	// currently makes SteamVR fall back to generic Touch handling.
	// requires a SteamVR restart.
	bool nativeInputProfile = false;
	// 2026-09-06: create /input/grip/touch from grip/value (vrlink does not
	// send a grip capacitive state for these controllers). native profile only.
	bool synthesizeGripTouch = true;
	double gripTouchThreshold = 0.03; // grip value that counts as "touched" (release at half of it)
	// write driver_vrlink.overrideRenderWidth/Height = 3552x3840 (the Galaxy
	// XR native per-eye panel geometry) into steamvr.vrsettings. the APK's
	// spoofed identity makes vrlink cap the render target at the spoofed
	// model's geometry (e.g. 2160x2160); the global override replaces the
	// capped value after model matching (validated by the community
	// Apply-Settings tool, exp17 diagnostics). default ON: this is a
	// correctness fix, not cosmetic. when turned OFF the keys are removed
	// (only if they hold our value), returning vrlink to its own defaults.
	// takes effect at SteamVR start.
	bool nativeResolution = true;
	// stream quality preset. "default" leaves vrlink's built-in encode/
	// bandwidth defaults (and removes any tier keys we previously wrote).
	// the other tiers write encodeWidth AND streamFormatWidth to the same
	// width, plus recommendedBandwidthMbit+targetBandwidth, and disable the
	// automatic width/bandwidth pickers:
	//   stable  2048/250   quality 2560/300   high 3072/300
	//   highest 3072/350   ultra   3584/350 (needs Wi-Fi 7 6GHz; watch
	//           driver_vrlink.txt for NVENC Invalid Level / buffer
	//           starvation and fall back to high)
	// 2026-08-26: the community tool pinned streamFormatWidth at 1536 and
	// only varied encodeWidth, but streamFormatWidth is the width vrlink
	// actually encodes at (m_nTargetEncodeWidth tracks it) and encodeWidth
	// alone does nothing observable, so those tiers all encoded at 1536.
	// effective at the next SteamVR start / headset connect.
	std::string streamQuality = "balanced"; // v3: efficient|balanced|sharp|max|custom (legacy names migrate)
	// streamQuality == "custom": customEncodeWidth is written to both width
	// keys; bandwidth is targetBandwidth/recommendedBandwidthMbit.
	// customStreamFormatWidth is legacy, parsed only so old settings load
	// and so the value can be cleaned out of steamvr.vrsettings.
	int customEncodeWidth = 3072;
	int customStreamFormatWidth = 1536; // v3: the tile width in custom mode (1536 or 2048; hard max 2048)
	int customBandwidthMbit = 350;
	// 2026-08-30 DEBUG (settings.json only, no GUI): 0 = streamFormatWidth
	// tracks customEncodeWidth (normal). nonzero = write THIS value to
	// streamFormatWidth while encodeWidth keeps customEncodeWidth: the
	// discriminator for what encodeWidth actually is. hypothesis H1:
	// encodeWidth = pre-foveation source sampling width, streamFormatWidth
	// = packed transport frame width (what NVENC sees). if H1 holds, at a
	// small fixed streamFormatWidth a higher encodeWidth sharpens the
	// foveal box only; the tap's RegisterResource dims tell which key the
	// registered input texture follows.
	int customStreamFormatWidthOverride = 0;
	// 2026-08-27 DLL archaeology (driver_vrlink.dll strings + driver_vrlink.txt):
	// vrlink looks an unknown HMD up in a settings section named
	// "vrlink_<modelNumber>" (Galaxy XR: vrlink_xrvst2ue) and reads
	// recommendedRenderWidth/Height, supports10bit and the stream-format
	// bounds (min/maxStreamFormatWidth, min/maxNonFoveatedStreamFormatWidth,
	// nonFoveatedStreamFormatWidth) from it. with no section the log says
	// "Using defaults as unknown headset: 1" and "Warning: HMD does not
	// support 10bit." -> "Using 10bit mode: 0": the stream is 8-bit HEVC.
	// 2026-09-23 routing correction: tuning always reaches driver_vrlink.
	// On additionally mirrors tuning/profile requests to vrlink_xrvst2ue,
	// vrlink_Oculus Quest Pro and vrlink_PICO 4 Pro before connection.
	// Known Quest/PICO models bypass per-model capability loading in the
	// inspected VRLink build; those requests do not override built-in profiles.
	// Each section keeps its own recovery journal originals. Off preserves
	// tuning in driver_vrlink and capabilities in vrlink_<original model>
	// (xrvst2ue fallback); an active SDR10 baseline still requests capabilities.
	// Only unchanged journal-owned values are restored. Requires a SteamVR
	// restart/reconnect; verify actual negotiation in driver_vrlink.txt.
	bool vrlinkHeadsetProfile = true;
	// profile contents. maxStreamFormatWidth is the "foveated transport
	// maximum" the community measured as 1536; we raise it so the tiers
	// above 1536 are not clamped. 3584 = next 256-multiple above the panel.
	int profileMaxStreamFormatWidth = 0; // v3: unused, the profile max tracks the tile width (kept so old files parse)
	bool profileSupports10bit = true; // Legacy compatibility value; SDR10 baseline now owns the request (2026-09-25).
	// also write the global driver_vrlink.force10bit ("Warning: Driver
	// forcing 10bit mode via 'force10bit' setting."), the belt to the
	// profile's braces. the community tool used to set it, then removed it.
	bool force10bit = false;
	// vrlink in-headset diagnostics: driver_vrlink.debugRegionColoring tints
	// the foveated transport regions, showAdvancedGraphs adds the stats
	// overlay (RFOV %, MAX mbit, encode times). tells us whether foveated
	// encoding is active for this HMD at all. off removes the keys if true.
	bool vrlinkDebugOverlay = false;
	// 2026-09-04 generic vrlink key writer (settings.json only). driver_vrlink
	// .dll string archaeology found settings keys the GUI has no field for:
	//   maxVideoQueueLatencyUs, backoffRecoveryCoefficient (read next to the
	//   stream-format keys: the allocator's lateness tolerance and its
	//   recovery rate), qualitySharpeningThresholdMbit (next to
	//   targetBandwidth), foveationMode, asyncStartEncode, usePool,
	//   enableTimedRetry, forceBaselineVideoFEC, gLimitMBPS, dbgSyncOff,
	//   logFirstFrames, errorsAsFatal, watchForShaderChanges.
	// each entry: name -> {"i":int} | {"f":float} | {"b":bool} | null
	// (null removes the key). written into [driver_vrlink] at provider
	// Init and on hot reload; defaults/semantics are unknown, so the
	// driver logs each write and vrlink's own log is the oracle.
	//   "vrlinkExtraKeys": { "maxVideoQueueLatencyUs": {"i": 20000},
	//                        "backoffRecoveryCoefficient": {"f": 2.0} }
	std::vector<std::tuple<std::string, char, double>> vrlinkExtraKeys; // (name, 'i'|'f'|'b'|'x'(remove), value)
	// GUI-exposed pair of the above (the allocator's two lateness knobs).
	// 0 = don't write (vrlink default). nonzero = written to [driver_vrlink]
	// maxVideoQueueLatencyUs / backoffRecoveryCoefficient.
	int vrlinkMaxVideoQueueLatencyUs = 0;
	double vrlinkBackoffRecoveryCoefficient = 0.0;
	// uniform scale for the controller render models. the official assets
	// measure ~124x63mm while the physical controller tapes ~145x70mm.
	// 2026-08-25 default 1.15 (was 1.16 on 08-24): SteamVR Home mesh overlays the shell
	// in passthrough. scales the MESH system only: geometry, mesh-bearing
	// component origins, motion pivots/centers and translation vectors.
	// pose anchors (tip, grip family, base, hand_anchor) are real-metre
	// physical points and are never scaled; the skeleton and game hand
	// meshes never see this value. the driver generates a variant folder
	// and swaps to it live via the render-model name-change reload.
	double renderModelScale = 1.15;
	// apply the fixed raw->grip convention shift to the controller poses
	// (rotate X +22deg, translate +5cm local Z). what it actually is, per
	// the 2026-08-24 audit against Game Link's profile: vrlink's raw is
	// Oculus Touch RING convention (Samsung ships the Touch component set
	// verbatim; grip sits 9.7cm down the handle). the shift moves raw to
	// a Valve Index-style origin, and with the knuckles remap (the game is
	// told it talks to an Index) Index-correct titles line up on raw with
	// no per-game work: SteamVR Home mesh, Blade & Sorcery, A Fisherman's
	// Tale. the identity experiment "be a Touch instead" (gripConvention
	// off + simulateTouch, Samsung's own frame) was worse in every title
	// tested (2026-08-24 test B). named pose components are written by the
	// generator from the official values rebased through the inverse of
	// this shift (see officialComponents). the GUI pose offsets are
	// personal trim on top. escape hatch only; leave on.
	bool gripConvention = true;
	// hand_anchor pose component: a driver-tunable pose used ONLY by our
	// per-app default bindings (UE4 titles whose hand mesh is authored
	// for a different controller's raw frame, e.g. The Wizards - Dark
	// Times). raw/handgrip/openxr_grip stay identity for everything else.
	// authored for the LEFT hand in the render model frame (cm, and deg in
	// SteamVR's component rotate_xyz convention); X, yaw and roll
	// are mirrored for the right hand. live: changing a value regenerates
	// the render model variant and SteamVR reloads it on the name change.
	double handAnchorXCm = 0.0;
	double handAnchorYCm = 0.0;
	double handAnchorZCm = 0.0;
	double handAnchorPitchDeg = 0.0;
	double handAnchorYawDeg = 0.0;
	double handAnchorRollDeg = 0.0;
	// controller mesh counter-translation (cm, left-hand authored, X
	// mirrored). the shell mesh was authored on vrlink's tracking origin,
	// so any raw-pose trim that fixes in-game hands (e.g. -2cm Z, 2026-08-24)
	// drags the SteamVR Home mesh off the physical controller. this shifts
	// every mesh-bearing render model component the other way (unscaled,
	// real cm) without touching any pose. live: regenerates the variant.
	// official pose components (2026-08-24 audit against Game Link's
	// vst_controller_*.json): Samsung ships the Oculus Touch component set
	// verbatim (openxr_grip z=0.098/20.6deg, handgrip=grip z=0.097/5.0deg,
	// tip -37.4deg, openxr_aim -39.4deg, base z=0.149). those are physical
	// points measured against vrlink's raw. our raw is vrlink raw with
	// gripConvention applied, so the generator writes the official values
	// REBASED through the inverse convention: every named pose path
	// (dashboard laser via tip, OpenXR grip/aim, handgrip bindings) lands
	// on the same physical point it does under Game Link. the shared /
	// per-hand trims are treated as vrlink error correction and are NOT
	// folded in. false = use the base json values as authored.
	bool officialComponents = true;
	// 2026-08-26: leave the streamed controllers exactly as vrlink presents
	// them: no identity/models/icons, no input profile, no pose components,
	// no grip convention, no offsets. for A/B against stock and for people
	// who only want the image processing. the Game Link layout
	// (Config/GameLinkLayoutPolicy.h) still applies, without the driver's
	// own corrections.
	bool controllerBypass = false;
	// controller identity experiment (2026-08-24): when true the driver
	// adds an oculus_touch layout (priority 95, above knuckles) to the
	// shipped remapping json at startup so Touch-authored game bindings
	// auto-remap with Touch simulation; when false the layout is removed
	// and knuckles remains the fallback. the remapping file is read by
	// SteamVR at startup: changing this needs a SteamVR restart.
	bool simulateTouch = false;
	// aim-family measured correction. 2026-08-24 test A: with the official
	// tip rebased, the dashboard pointer emanated ~1cm forward and ~1cm
	// above the physical tip (Samsung's tip is the Touch ring-front value
	// on a ringless shell). Y -1 / Z +1 field-ratified the same day.
	// applied to tip and openxr_aim together (same physical feature)
	// after the rebase, in our raw frame, cm, X mirrored for the right.
	double aimTrimXCm = 0.0;
	double aimTrimYCm = -1.0;
	double aimTrimZCm = 1.0;
	// fold the shared (mirrored) and per-hand pose trims into the official
	// component rebase, so trimming where the HAND sits does not drag the
	// physical points (tip, base, grip) along with raw. translation is
	// folded exactly; rotation is folded as yaw only (small, and exact
	// folding would need SteamVR's rotate_xyz euler order).
	bool componentRebaseIncludeTrim = true;
	double meshOffsetXCm = 0.0;
	double meshOffsetYCm = 0.0;
	double meshOffsetZCm = 0.0;
	// skeletal-hand offset (cm), applied in the driver-input tap to the
	// wrist bone of vrlink's skeleton: moves the skeletal hand relative to
	// its anchor WITHOUT touching the device pose, render model, or the
	// grip pivot games rotate around. hot-applied per skeleton update -
	// tune live from settings.json. x is mirrored for the right hand when
	// skeletonOffsetMirror is true.
	double skeletonOffsetXCm = 0.0;
	double skeletonOffsetYCm = 0.0;
	double skeletonOffsetZCm = 0.0;
	bool skeletonOffsetMirror = true;
	// 2026-09-19 SDR10 baseline: opt-in VD-like neutral baseline (see
	// SdrColorPolicy.h). effective (not stored): while on, the vrlink
	// headset profile is requested with supports10bit and the host color
	// pipeline runs neutral unless enhancements are explicitly allowed
	// (saturation 50 / vibrance 0 / contrast 50 / gamma
	// 2.2 / tint 1 / no matrix / dither off / black-floor off / post-pack
	// bypassed / VUI left to Valve's original pair). stored controls are
	// untouched and resume when this goes off; the 10-bit request is disabled.
	// force10bit stays retired regardless.
	bool sdr10Baseline = false;
	// Keep the pre-migration sentinel so schema 2 survives default-diff saves.
	int sdr10SettingsVersion = 1;
	// 2026-09-25: explicit warning consent permits image enhancements while
	// retaining the SDR10 capability request. Old files remain neutral.
	bool sdr10AllowEnhancements = false;
};

struct StreamFrameConfig{
	// process direct mode layer textures before the streaming driver consumes them
	bool enable = false;
	// saturation with 50 being normal, same semantics as customShader.saturation
	double saturation = 50;
	// vibrance from -100 to 100 with 0 being off: saturation change weighted
	// toward the least saturated pixels (positive enriches muted colors while
	// leaving already vivid ones nearly untouched, so it clips much later than
	// raw saturation; negative pushes muted colors toward gray while vivid
	// accents survive). applied after saturation, stacks with it.
	double vibrance = 0;
	// contrast with 50 being normal, same semantics as customShader.contrast
	double contrast = 50;
	// the point from 0-100% of white that the contrast is centered around
	double contrastMidpoint = 50;
	// if the contrast should be done in linear space instead of gamma
	bool contrastLinear = false;
	// gamma of the output, 2.2 is neutral
	double gamma = 2.2;
	// general brightness multiplier on linear rgb, 1 = neutral, applied
	// at all times after the color chain (also while the dashboard is
	// open). the light-sensitive-eyes / dark-room knob.
	double brightness = 1.0;
	// per channel tint multiplier
	ConfigColor colorMultiplier = {};
	// 3x3 linear rgb color matrix, row major. active when exactly 9 values.
	std::vector<double> srgbMatrix = {};
	// FXAA-class single pass AA integrated into the layer shader, applied
	// BEFORE CAS so sharpening acts on resolved edges (off by default:
	// costs up to ~8 extra taps per pixel on edges and softens text
	// slightly; intended for titles with heavy specular/geometry shimmer)
	// 0 off, 1 fast (in-pass, CAS sharpens raw neighbors around the AA
	// resolved center), 2 quality (separate FXAA pre-pass into an fx
	// intermediate; CAS then sees fully resolved neighborhoods, at the
	// cost of one extra full-region pass and one extra scratch texture)
	int fxaaMode = 0;
	StreamFrameCASConfig cas = {};
	StreamFramePostPackConfig postPack = {};
	// add low amplitude noise before encoding to reduce banding in dark scenes
	bool dither = false;
	// ==== black floor diagnostics + fixes (GUI Debug section) ====
	// near-black on the GxR stream crushes/steps. candidate mechanisms:
	// (a) a full-vs-limited range mismatch somewhere in the encode ->
	// decode -> display chain (everything below code ~16 crushed, or
	// blacks grey + whites clipped for the inverse), (b) encoder
	// quantization starving dark low-contrast regions — the foveated-
	// encode boundary square that becomes visible in dark scenes is this
	// mechanism's signature: two QP regions with different effective
	// floors meeting at an edge, (c) the display's own OLED black floor.
	// the ramp bar identifies which; rangeMode and the shadow lift are
	// the fixes. see Docs/BlackFloorProtocol.md for the test protocol.
	struct BlackFloorConfig {
		// draw the near-black diagnostic ramps: 17 patches, sRGB codes
		// 0..32 step 2, one strip across screen center (foveal encode
		// region) and one near the bottom (peripheral region), white
		// ticks marking codes 0/8/16/24/32. the bar is injected BEFORE
		// the fixes + dither so the patches ride the exact pipeline
		// game shadows do.
		bool rampBar = false;
		// 0 off; 1 compress into limited range before encode
		// (g' = (16 + 219 g) / 255) — the fix when the display decodes
		// full-range video as limited; 2 expand as if limited
		// (inverse) — the fix for the opposite mismatch
		int rangeMode = 0;
		// shadow-only lift: linear squeeze below kneeCode raising true
		// black to floorCode, identity above. lifts dark content above
		// the OLED/encoder floor without greying the whole image.
		bool shadowLift = false;
		double floorCode = 2.0;
		double kneeCode = 8.0;
		// adjustable black point (field session 2): remap [bp, 255] ->
		// [0, 255] in sRGB code space. the calibration recipe: ramp bar
		// on, raise bp until the two darkest patches just merge, then
		// back off one notch — maximum contrast the chain can carry
		// without crushing real shadow detail. this supersedes
		// rangeMode "expand" for taste-darkening: expand is a fixed
		// 16-code chop (measured crushing ~15 of 17 ramp patches);
		// the black point is the same operation with a chosen pivot.
		double blackPointCode = 0.0;
	};
	BlackFloorConfig blackFloor = {};
	StreamFrameDimmingConfig stationaryDimming = {};
	// radial distortion pre perturbation, applied to the streamed eye images to
	// compensate an imperfect distortion profile on the standalone headset.
	double k1 = 0;
	double k2 = 0;
	StreamFrameDistortionConfig distortion = {};
	// camera calibration support (blackout, patterns, capture preset)
	StreamFrameCalibConfig calib = {};
	// optical center offset from the texture center, in uv units, per eye
	double centerOffsetXLeft = 0;
	double centerOffsetXRight = 0;
	double centerOffsetY = 0;
	// per-eye whole-image alignment shift (prism correction), in fractions
	// of the eye's image (bounds-normalized uv). corrects the RELATIVE
	// alignment between the two eyes' images when an eye sits off its lens
	// axis (the lens then acts as a weak prism and fusion strains — the
	// vertical direction especially, fusional range there is tiny).
	// positive h moves that eye's image right, positive v moves it up.
	// values are small: 0.002 is already a strong vertical correction.
	struct {
		double leftH = 0;
		double leftV = 0;
		double rightH = 0;
		double rightV = 0;
	} alignment = {};
	// skip the color adjustment while the dashboard is open, in case the
	// compositor shader replacement also applies it to the flattened scene in
	// that state. off by default: the recommended setup is to leave the custom
	// shader disabled or neutral for streamed headsets and let this pass be the
	// single source of truth in every state. does not affect cas/dither.
	bool skipColorWhileDashboardOpen = false;
	// process during SubmitLayer (using the previous frame's sync texture)
	// instead of during Present. try this if Present time processing has no
	// visible effect because the driver already consumes the layer at submit.
	bool processAtSubmitLayer = false;
	// gaze consumption (eye tracking tap must be receiving valid data).
	// debugRing draws a small ring at the mapped gaze point per eye — the
	// live calibration tool for the direction->viewport mapping that the
	// dynamic pupil swim pass will reuse. tanHalfFov are the assumed
	// symmetric projection half-angle tangents used for the mapping; tune
	// until the ring lands where you look (live reload, shader hot reload).
	struct {
		bool debugRing = false;
		// fallback mapping only (used when the HMD display component's real
		// projection frusta are unavailable)
		double tanHalfFovX = 1.19;
		double tanHalfFovY = 1.19;
		// lead the gaze by extrapolating recent gaze motion this many ms
		// forward, compensating capture->link->publish latency. 0 disables.
		double predictionMs = 30;
		// overlay a calibration grid: the straight-line reference for pupil
		// swim calibration. mode "uv" = lines every 0.1 uv; mode "angular"
		// = lines every gridAngularDeg degrees of visual angle computed
		// from the real projection frusta (sboy-style distortion photos:
		// each rendered line has a known angular position, so a photo
		// through the lens directly measures distortion error)
		bool debugGrid = false;
		// "uv": lines every 0.1 uv. "angular": lines every gridAngularDeg
		// of visual angle. "sboys": the camera-calibration pattern from
		// sboys3/camera-calibration — per-axis visual-angle lines every
		// gridAngularDeg, HUE-CODED by their absolute angular index so a
		// calibrated camera (and the fit script) can identify every line
		// without counting from center, plus a bright axis cross. render
		// with overlayWarped ON so the pattern passes through the
		// distortion correction like game content does.
		std::string gridMode = "uv";
		double gridAngularDeg = 2.5;
		// sboys mode only: replace game content with a dim grey
		// background so the camera sees nothing but the pattern
		bool gridOpaque = false;
		// world-locked fixation dot for VOR-based swim probing: latched to
		// the current view direction when enabled (toggle off/on to
		// re-center). the user fixates the dot and slowly rotates their
		// head in place; VOR keeps the eye on target, so any systematic
		// gaze-vs-dot residual measures the optics/tracking chain.
		bool calibDot = false;
		// one-switch probe capture for scoring runs: acts as calibDot +
		// swimProbe + overlayWarped together, so an A/B scoring session is
		// a single toggle in the GUI with no ordering to get wrong
		bool probeCapture = false;
		// draw the angular grid at fixed WORLD azimuth/elevation instead of
		// head-locked lens angles: the grid then stays put while the head
		// rotates, which is exactly the stimulus the swim nulling task
		// wants (angular mode only; needs the head pose, on automatically)
		bool gridWorldLocked = false;
		// while the dot is on, log throttled SwimProbe lines: angular
		// residual (raw + smoothed gaze), head angular velocity, and
		// per-eye lens UVs of dot and gaze — the raw data for empirical
		// static-profile and pupil-swim fitting
		bool swimProbe = false;
		// draw the calibration grid and fixation dot in content space so
		// the distortion profile warps them like scene content. use for
		// profile validation: grid straightness + probe scoring runs.
		bool overlayWarped = false;
	} eyeGaze = {};
	// dynamic pupil swim correction (requires gaze). phase A: the
	// distortion center follows the gaze point by these fractions per
	// axis; 0 = static behavior, correction vanishes at center gaze by
	// construction. tune with the debug grid: fixate an intersection,
	// move gaze around it, raise until nearby lines stop
	// bending/shifting with gaze. shift clamped to +-0.15 uv.
	struct {
		double centerStrengthX = 0;
		double centerStrengthY = 0;
	} pupilSwim = {};
	// keyed mutex acquire timeout for the frame sync texture, in ms. when it
	// expires the frame passes through unprocessed (a visible "flash" of
	// ungraded color), which happens under heavy load (shader compilation,
	// level streaming). after a skip the timeout escalates (3x, min 15ms) to
	// break flash streaks, and resets on the next acquired frame.
	int syncTimeoutMs = 10;
	// passive recon logger: opt-in, off by default. installs observation-only
	// vtable hooks on vrlink's D3D11 context to map its layer-consumption
	// point (zero-copy v3 feasibility), NVENC module, and copy/bind shape.
	// intended for ONE disposable session; never substitutes or alters
	// anything. see ReconLogger.h.
	bool reconLogger = false;
	// render-side hitch instrumentation, the HITCHDIAG analog of KALDIAG:
	// every 2s a summary of the frame-callback cadence (dt mean/max, counts
	// over 16.7/33ms, AcquireSync wait, our own work time, skip/create/evict
	// counters), plus a one-shot HITCH line whenever the gap since the
	// previous frame callback exceeds 25ms, tagged with what the previous
	// frame did (scratch create, lut bake, shader compile, sync skip) so
	// outliers self-attribute. cost is a few clock reads per frame.
	// 2026-09-26: opt-in only; normal streaming skips diagnostic clocks and counters.
	bool hitchDiag = false;
	// scratch LRU evictions are moved to a deferred list and released a few
	// frames later, one per frame, AFTER the keyed mutex is released - so a
	// resolution/layer change never pays release cost inside the same
	// mutex-held frame that already pays the (unavoidable) creation stall.
	// off = legacy synchronous evict-in-frame, kept for A/B.
	bool deferredEviction = true;
	// render the processed frame directly into the layer texture (slice
	// aware RTV) instead of drawing into a scratch target and copying the
	// bounds region back. cuts per-eye traffic from ~6x to ~4x of the
	// texture size (the field stutter in heavy titles at 5000x5400+ per eye
	// was bandwidth, not shader math) and halves scratch VRAM. per-texture
	// automatic fallback to the copy-back path if the layer refuses an RTV.
	bool directRender = true;
	// zero-copy path: instead of warping the layer in place, warp into our
	// own shared shadow textures and hand vrlink the SHADOW handles at
	// SubmitLayer. the whole frame path becomes one draw (sample app,
	// write shadow): ~2x traffic vs 4x for directRender and 6x legacy.
	// costs a triple-buffered shadow ring per layer size (same VRAM as one
	// extra swap set). array-layer (single-pass instanced) apps still copy
	// into scratch first (the shader samples Texture2D, not an array), so
	// they run at ~4x into the shadow. experimental: vrlink accepting
	// handles outside its own swap sets is the one assumption we cannot
	// verify from this side, hence default OFF until field-confirmed; if a
	// session shows black/frozen frames, turn this off.
	bool zeroCopy = false;
	// zero-copy v3: consumption-point source substitution. the frame is
	// warped into a rotating SHARED shadow set and vrlink's per-frame
	// staging copy (the recon-verified single consumption point) is
	// redirected to read the fresh shadow. the layer keeps the app's
	// unprocessed frame, so every failure (stale shadow, open failure,
	// toggle off) degrades to a passthrough flash — never a freeze (v1
	// wall: handle bookkeeping untouched) and never an encoder reset (v2
	// wall: NVENC surfaces untouched). our per-eye traffic 4x -> 2x.
	// EXPERIMENTAL: one dedicated toggle-on test in a disposable session.
	bool zeroCopyV3 = false;
	// NVENC tap (ACTIVE since 2026-08-27, see NvencTap.h). hooks vrlink's
	// encoder init/reconfigure. every override is retried with vrlink's
	// own params on failure, so worst case is stock behaviour + a log line.
	// enable BEFORE launching SteamVR (the hook must precede connect).
	bool nvencTap = true; // v3 master switch: off = stock streamer, tiers write only width + bandwidth
	// level=AUTOSELECT / tier=HIGH: cures "NVENC: Invalid Level" (every
	// bitrate reconfigure rejected at >=3072-wide frames)
	bool nvencFixLevel = true;
	// 0 = leave. else replaces the encoder's average bitrate (Mbit/s) and
	// sets max = 1.15x; lifts vrlink's internal 350 Mbit/s clamp
	int nvencBitrateMbit = 0; // v3: DEBUG "encoder bitrate (separate)": 0 = same as the pacer bandwidth
	// v3 Advanced: 0 = the tier's (or custom) bandwidth drives both the pacer
	// and the encoder; nonzero overrides both at once
	int nvencBandwidthOverrideMbit = 0;
	// v3 settings-schema version. < 3 in a loaded file = pre-v3 encoder
	// settings: ConfigLoader applies the v3 encoder defaults over them
	// (AQ off, CBR on, ...) and logs it. The GUI writes 3.
	int nvencSettingsVersion = 0;
	// 0 = leave. else QP ceiling (1..51): blocks cannot be quantized coarser
	// than this; black-floor / dark-gradient lever. try 30..36.
	int nvencMaxQp = 0;
	// 0 = leave. else spatial AQ strength 1..15
	int nvencAqStrength = 0; // GRAVEYARD: any spatial AQ makes nvEncEncodePicture block 4-6 ms on these frames (X3); migration forces 0
	// 0 = leave. else QP floor: stops reset-IDR frames ballooning past
	// vrlink's ~2 MB send limit (G2: 3.5-5.4 MB at QP 8). try 14-18.
	int nvencMinQp = 0;
	// 0 = same as nvencMinQp. else intra-frame floor (vrlink send limit is
	// exactly 2 MB/frame; IDR at QP 16 = 2.3 MB, at QP 24 = 1.45 MB)
	int nvencMinQpIntra = 0;
	// CBR + low-delay key-frame scale: VBV honoured on key frames
	bool nvencForceCbr = true; // v3 default (X2, 350/450 runs); spatial AQ, not CBR, was the serializer
	// with Force CBR: reset-IDR budget as a multiple of a P frame (1..4).
	// 1 = one frame budget (soft IDR, QP 34-48 in the R runs); 2 = two,
	// still under vbvFrames=2. see NvencTapConfig::lowDelayKfScale
	int nvencLowDelayKfScale = 2;
	// peak/avg headroom percent (vrlink: 15). 0 flattens frames; the
	// 500 Mbit run died on "Packet too big" (one IDR frame over vrlink's
	// send limit)
	int nvencMaxBitrateHeadroomPct = 0; // inert under CBR (max = avg); 0 measured safe under VBR
	// 0 = leave. else vbv = avg/fps * N frames (bounds single-frame size);
	// fps = nvencForceFps or the nominal 90, never vrlink's per-call value
	int nvencVbvFrames = 2; // v3 default: caps vegetation peaks and reset IDRs at ~2 frame budgets
	// 2026-09-03 runs 1/2: vrlink reconfigures before every frame with an
	// instantaneous frameRateNum (90..15) that collapses while hitching;
	// CBR budget and fps-derived VBV are avg/fps, so a hitch ballooned the
	// reset IDR (7 MB at "15 fps") -> Packet too big -> reset -> hitch: a
	// feedback loop. 0 = leave. else force N/1 on init + every reconfigure.
	// 90 is the correct value for this HMD.
	int nvencForceFps = 90;
	// scale vrlink's bitrate request by bitrate/350 instead of replacing
	// it, so its own congestion backoff (30 Mbit during throttle events)
	// survives the override. off = replace outright (pre-09-03 behaviour).
	bool nvencBitrateScale = true;
	// vrlink's own encoder ceiling (reference for the scaling), settings.json only
	int nvencVrlinkClampMbit = 350;
	// 0 = leave. 1..7 = NVENC preset P1..P7 (vrlink: P2 + ultra-low-latency
	// tuning, no AQ, no lookahead). the "VD sets better defaults" lever.
	int nvencPreset = 0; // v3: 0 = AUTO by NVENC engine count (3+ -> P7, 2 -> P5, 1 -> P4), 1..7 override
	// 2026-08-30: with an explicit encodeConfig the presetGUID is advisory
	// (nvEncodeAPI.h: it "will not override the custom config structure"),
	// so the GUID swap alone is a partial preset change. with this on the
	// tap queries nvEncGetEncodePresetConfigEx for the canonical config of
	// the target preset at vrlink's own tuning and adopts multipass,
	// temporal AQ, spatial AQ (only if no manual/tier AQ is set) and the
	// HEVC DPB ref count; the vrlink-vs-preset field diff is logged once.
	// off = old behaviour (GUID swap only), for A/B.
	bool nvencPresetMerge = true;
	// -1 leave, 0/1 force the HEVC VUI full-range flag (black-floor probe)
	int nvencVuiFullRange = -1;
	// -1 leave; else force VUI matrix / primaries / transfer (client honours
	// VUI per run L; stock matrix=0 identity is the black-floor suspect.
	// probes: matrix 1, primaries 1, transfer 1 or 13)
	int nvencVuiMatrix = -1;
	int nvencVuiPrimaries = -1;
	int nvencVuiTransfer = -1;
	// 2026-09-04 split-frame encoding experiment (see NvencTapConfig::
	// splitMode). 0 = leave (driver implicit: P1..P4 only). 1 = force,
	// driver picks strips. 2/3/4 = forced strip count (5090 has 3 NVENCs).
	// 15 = disable split (probe). requires passing 12.1-versioned structs
	// into vrlink's 11.1 session; rejection is logged and latched off.
	int nvencSplitMode = 1; // v3 default: driver-chosen strips (RUN6/X2); implies the 12.1 session upgrade
	// 2026-09-05 foveated bit allocation (option, off by default): QP delta
	// for the fovea tile (<= 0) and the periphery tile (>= 0), with the
	// post-pack edge ramp; bits move within the same CBR budget. see
	// NvencTapConfig::qpFovea.
	int nvencQpFovea = 0;
	int nvencQpPeriphery = 0;
	// log every reconfigure + hex dumps
	bool nvencVerbose = false;
	// stored-config schema for the version-gated migration below (see
	// ConfigLoader): absent in files written before 2026-08-15 -> 1.
	// bump when a migration is added; the GUI persists it (stored as a
	// value distinct from the GUI serializer default so the pruner
	// keeps it, making deliberate post-migration choices sticky).
	int streamFrameSchema = 1;
	// diagnostic (settings.json only): write every streamed controller pose
	// as vrlink delivers it, with the stream's own velocities, to
	// stream-pose-trace.csv next to settings.json (Driver/StreamPoseTrace.h)
	bool streamPoseTrace = false;
	// the streamed controllers' velocities go out the way Samsung's driver
	// reports its own (Driver/GameLinkMotion.h): a reported velocity whose
	// length is not above the cutoff is zeroed, so a resting hand is not
	// extrapolated by sensor noise. the values are the ones compiled into
	// Samsung's driver (m/s, deg/s). 0 = report every velocity as it comes.
	double gameLinkLinearVelocityCutoff = 0.05;
	double gameLinkAngularVelocityCutoffDeg = 10.0;
	// 2026-10-04 rest smoothing of the streamed controllers' pose
	// (Driver/GameLinkMotion.h): low-pass cutoff in Hz while the controller
	// is still; it opens with the reported speed, so motion is not delayed.
	// lower = steadier pointers and more lag in very slow motion. 0 = off.
	// field: the raw pose makes pointers tremble slightly at rest.
	double controllerSmoothingHz = 6.0;
	// diagnostic: throttle-log controller/tracker poses from the PoseUpdated
	// hook (position, velocity, tracking result), with a burst mode that
	// captures high-velocity moments (throws). live-reloaded, so it can be
	// toggled mid-session.
	bool poseLogging = false;
	// sub-gate for the HIGH-RATE burst channel of pose logging (up to
	// 100Hz/device during fast motion through DriverLog on the pose hot
	// path). field 2026-08-16: burst storms during hard right-hand
	// throws (10.9k lines/session on one device) correlate with
	// game/stream hitches — synchronous log I/O at exactly the worst
	// moment. steady 2s lines and event diagnostics stay under
	// poseLogging alone; bursts now additionally require this, default
	// OFF so release configs never storm.
	bool poseLogBurst = false;
	// GUI-only fence: retired experimental knobs render in the GUI's
	// Graveyard section only when this is set by hand in settings.json.
	// no GUI knob on purpose. values of archived knobs stay ACTIVE
	// regardless — hiding is not disabling.
	bool graveyardEnable = false;
};

// pose adjustments for streamed controllers, applied in the PoseUpdated hook.
// rotation is a local frame euler offset in degrees (x = pitch: positive
// tilts the top of the controller back toward the user), position is a local
// frame offset in cm. lets the grip/aim angle be matched to what games
// expect from other controller types. live reloaded.
// in-headset controller offset aligner. manual mode: sticks adjust the
// selected axis of the selected group (position/rotation) live. automatic
// mode: plant the controller tip on any solid surface, hold the trigger and
// swirl a cone around the planted tip; a least-squares pivot solve recovers
// the position offset (the drawn tip marker freezing is the confirmation).
struct ControllerAlignerConfig{
	bool enable = false;
};

struct ControllersConfig{
	// mixed-space velocity frame fix for playspace-override setups (e.g.
	// lighthouse controllers aligned into the vrlink space): the openvr
	// header leaves DriverPose_t::vecVelocity's frame unspecified while
	// positions are driver-space + WorldFromDriver. with a large alignment
	// yaw the two conventions diverge and thrown objects fly at the right
	// speed in the WRONG direction. 0 = off, 1 = "world" (rotate reported
	// velocity by qWorldFromDriverRotation), 2 = "driver" (inverse).
	// applied only to devices whose WorldFromDriver rotation deviates from
	// identity by more than ~2 degrees, so vanilla devices are untouched.
	// the field test decides which mode matches vrserver's real convention.
	int spaceVelocityFixMode = 0;
	// when true, the pose offsets below describe the LEFT controller and are
	// mirrored for the right hand (position X negated; rotation Y/Z negated).
	// physical controller pairs are mirror images, so the displacement
	// between the tracked origin and the grip is mirrored too - identical
	// offsets can only ever fit one hand.
	// 2026-10-04: the controllers are placed by the Game Link layout
	// (Config/GameLinkLayoutPolicy.h) on vrlink's raw pose; the offsets
	// work on top of it and the pose components ride along. the defaults
	// are the residual of vrlink's raw against the real controllers,
	// field-tuned in the headset on the LEFT controller (pitch 2, yaw -5,
	// roll -9 deg; 0.5cm X, -1.5cm Y, 0.5cm Z); the right hand gets the mirror image. they
	// replace the 5deg yaw / 0.5cm defaults that were measured against the
	// grip convention frame.
	#ifdef VENDOR_GALAXYXR
	bool mirrorOffsetsForRightHand = true;
	double rotationOffsetDeg[3] = {2, -5, -9};
	double positionOffsetCm[3] = {0.5, -1.5, 0.5};
	#else
	bool mirrorOffsetsForRightHand = false;
	double rotationOffsetDeg[3] = {0, 0, 0};
	double positionOffsetCm[3] = {0, 0, 0};
	#endif
	// per-hand residual trims (2026-08-24): vrlink's left and right raw
	// origins are not exact mirror images (field: left yaw off, left
	// translated slightly right, with only a Z trim active). these are
	// applied UNMIRRORED, per hand, after the shared (mirrored) offsets
	// above. same axis conventions as the shared offsets. live reloaded.
	double leftRotationOffsetDeg[3] = {0, 0, 0};
	double leftPositionOffsetCm[3] = {0, 0, 0};
	double rightRotationOffsetDeg[3] = {0, 0, 0};
	double rightPositionOffsetCm[3] = {0, 0, 0};
	ControllerAlignerConfig aligner = {};
};

struct CustomShaderConfig{
	// if shaders should be replaced in the compositor
	bool enable = false;
	bool enableForOther = false;
	// contrast with 50 being normal
	double contrast = 50;
	// the point from 0-100% of white that the contrast is centered around
	double contrastMidpoint = 50;
	// if the contrast should be done in linear space instead of gamma
	bool contrastLinear = false;
	// if per eye contrast should be applied
	bool contrastPerEye = false;
	bool contrastPerEyeLinear = false;
	double contrastLeft = 50;
	double contrastMidpointLeft = 50;
	double contrastRight = 50;
	double contrastMidpointRight = 50;
	// increase or decrease the variation of the colors
	double saturation = 50;
	// gamma of the output
	double gamma = 2.2;
	// if the subpixels should be offset
	bool subpixelShift = true;
	// if the mura correction should be skipped
	bool disableMuraCorrection = false;
	// if the black levels should be skipped
	bool disableBlackLevels = false;
	// if the colors should be corrected to display the srgb input as srgb on the display
	bool srgbColorCorrection = false;
	// if the white point correction should be applied to the srgb color correction
	bool srgbWhitePointCorrection = false;
	// a 3x3 matrix to apply to the linear colors
	// if this is an array of 9 flat elements it will override the headset's default matrix
	std::vector<double> srgbColorCorrectionMatrix = {};
	// if a 10 bit input will be dithered down to 8 bit
	bool dither10Bit = false;
	// if the filter should be enabled for overlays (defaults false to avoid performance hit when no overlay is shown)
	bool enableFilterForOverlay = false;
	// if the filter should be enabled when the SteamVR dashboard is open
	bool enableFilterForDashboard = true;
	// filters on the sampling of the texture,  "None", "NearestNeighbor", "FXAA2", "FXAA2CAS", "LumaSharpen", and "CAS"
	std::string samplingFilter = "None";
	// FXAA2 filter parameters
	double samplingFilterFXAA2SharpenStrength = 1.0;
	double samplingFilterFXAA2SharpenClamp = 0.05;
	// FXAA2CAS filter parameters
	double samplingFilterFXAA2CASStrength = 1.0;
	double samplingFilterFXAA2CASContrast = 1.0;
	// luma sharpen filter parameters
	double samplingFilterLumaSharpenStrength = 2.0;
	double samplingFilterLumaSharpenClamp = 0.1;
	int samplingFilterLumaSharpenPattern = 1;
	double samplingFilterLumaSharpenRadius = 1.0;
 	// CAS filter parameters
 	double samplingFilterCASStrength = 1.0;
 	double samplingFilterCASContrast = 1.0;
	// color multiplier for tint adjustments
	ConfigColor colorMultiplier = {1.0, 1.0, 1.0};
};


class Config{
public:
	// 2026-10-01: diagnostics require an explicit master opt-in; selections are retained.
	bool debugMode = false;
	// Runtime-only epoch: retain transitions even when no scene/provider frame runs.
	uint64_t debugGeneration = 0;
	enum HeadsetType{
		None = 0,
		Other = 1,
		Vive = 3,
	};
	
	class BaseHeadsetConfig{
	public:
		// if the headset should be shimmed by this driver
		bool enable = true;
		// the type of headset this is
		HeadsetType headsetType = HeadsetType::None;
		// ipd in mm
		double ipd = 63.0;
		// ipd offset from the ipd value in mm
		double ipdOffset = 0.0;
		// horizontal offset in mm to shift both eyes to the right
		double horizontalIPDOffset = 0.0;
		// minimum black levels from 0 to 1
		double blackLevel = 0;
		// tint the display this color
		ConfigColor colorMultiplier = {};
		// distortion profile to use
		std::string distortionProfile = "None";
		// amount to zoom in the distortion profile
		double distortionZoom = 1.0;
		// amount to zoom in the FOV, the fov is divided by this value
		double fovZoom = 1.0;
		// amount to zoom in the FOV using tangent-based scaling for flatter perception
		double flatFovZoom = 1.0;
		// multiplier for the subpixel offsets
		double subpixelShift = 1.0;
		// subpixel offsets in pixel units for each color channel [offsetXRed, offsetYRed, offsetXGreen, offsetYGreen, offsetXBlue, offsetYBlue]
		std::vector<double> subpixelOffsets = {0, 0, 0, 0, 0, 0};
		// width of one eye in pixels
		int resolutionX = 3840;
		// height of one eye in pixels
		int resolutionY = 3552;
		// clockwise rotation of the image on the right display, 0:0, 1:90, 2:180, 3:270
		int displayRotation = 0;
		// max horizontal fov
		double maxFovX = 100.0;
		// max vertical fov
		double maxFovY = 96.0;
		// distortion mesh resolution
		int distortionMeshResolution = 127;
		// if the fov should be slightly adjusted each session to prevent sharp burn in along the edges
		bool fovBurnInPrevention = true;
		// if the distortion profile should clamp the image to the bounds of the display or if it will instead render an image at whatever FOV is set
		bool fovClamping = true;
		// device type used to filter distortion profiles in the GUI
		std::string distortionProfileDeviceType = "";
		// multiply 100% render resolution width
		double renderResolutionMultiplierX = 1.0;
		// multiply 100% render resolution height
		double renderResolutionMultiplierY = 1.0;
		// percent of 1:1 resolution to apply the super sampling downscale filter at, this is really high to allow for subpixel sampling
		double superSamplingFilterPercent = 500;
		// seconds of latency to the display
		double secondsFromVsyncToPhotons = 0.007;
		// seconds from the the first to last line of the display
		double secondsFromPhotonsToVblank = 0.0025;
		// angle in degrees for each eye to be rotated outwards
		double eyeRotation = 0.0;
		// disable eyes as much as possible. 0:both enabled 1:left disabled 2:right disabled 3:both disabled
		int disableEye = 0;
		// if the fov should be decreased for the disabled eye, this causes problems in some apps
		bool disableEyeDecreaseFov = false;
		// if a vive link box should be used for bluetooth
		bool useViveBluetooth = false;
		// if the display is in direct mode or false if it is on the desktop
		bool directMode = true;
		// if the icons in the SteamVR status window should be modified
		bool replaceIcons = true;
		// the edid for the headset
		int edidVendorId = 0;
		// the edid for the headset
		int edidProductId = 0;
		// if non zero, override the edid vendor id
		int edidVendorIdOverride = 0;
		// if non zero, override the edid product id
		int edidProductIdOverride = 0;
		// DSC Version
		int dscVersion = -1;
		// DSC Slice count
		int dscSliceCount = -1;
		// DSC bits per pixel
		int dscBPPx16 = -1;
		// if the driver should be enabled for every hmd
		bool forceEnable = false;
		// if parallel projection should be used for rendering
		bool parallelProjection = true;
		// if eye tracking should be enabled
		bool enableEyeTracking = false;
		// Config struct for the hidden area mesh
		HiddenAreaMeshConfig hiddenArea;
		// config for dimming the display when stationary
		StationaryDimmingConfig stationaryDimming = {};
	};
	
	
	class FakeHeadsetConfig : public BaseHeadsetConfig{
		public:
		FakeHeadsetConfig(){
			enable = false;
			headsetType = HeadsetType::Other;
			distortionProfile = "None";
			displayRotation = 0;
			// use a 1080p monitor
			directMode = false;
			resolutionX = 960;
			resolutionY = 1080;
		}
	};
	// config for the fake headset
	FakeHeadsetConfig fakeHeadset = {};
	
	class GeneralHeadsetConfig{
	public:
		// if a vive link box should be used for bluetooth
		bool useViveBluetooth = false;
	};
	GeneralHeadsetConfig generalHeadset = {};
	
	CustomShaderConfig customShader = {};
	
	// processing of direct mode layer textures before a streaming driver (e.g.
	// vrlink / Steam Link) consumes them. this is the always on path for
	// headsets whose driver composites frames itself, where the compositor
	// shader replacement only runs while the dashboard is open.
	StreamFrameConfig streamFrame = {};
	GalaxyXrConfig galaxyXr = {};
	
	// streamed controller pose adjustments
	ControllersConfig controllers = {};
	
	// if devices should always be reported as tracking
	bool forceTracking = false;
	
	// if the screenshot requests should cause full compositor debug screenshots to be taken
	bool takeCompositorScreenshots = false;
	
	// makes the diver only do things related to closed source functionality if it exits
	// this allows for a driver built from source to run along side the driver with proprietary code
	bool onlyHandlePrivateFunctionality = false;
	
	// reload the config every time a file is changed in the distortions directory
	// this is for manual json editing, utilities should touch the main settings file when done modifying distortions instead
	// this is now enabled by default
	// bool watchDistortionProfiles = false;
	
	// if the config has been changes and should be reloaded
	// this will be set the false at the end of RunFrame
	bool hasBeenUpdated = true;
	
};

// config for a single custom distortion profile
class DistortionProfileConfig{
public:
	// name of distortion profile, this will be it's filename
	std::string name = "None";
	// the headset device this profile is for; leave empty to apply to all devices
	std::string device = "";
	// description to display
	std::string description = "";
	// author of the distortion profile
	std::string author = "";
	// the date when it was created
	double creationDate = 0;
	// last time it was modified, used for reloading if changed
	double modifiedTime = 0;
	// type of distortion, None or RadialBezier
	std::string type = "None";
	// main distortion
	std::vector<double> distortions = {};
	// additional distortion to apply to the red channel
	std::vector<double> distortionsRed = {};
	// additional distortion to apply to the blue channel
	std::vector<double> distortionsBlue = {};
	// offset image outwards on the display using the same 0 to 100 scale 
	float offsetX = 0.0f;
	// offset image upwards on the display using the same 0 to 100 scale
	float offsetY = 0.0f;
	// if legacy smoothing should be used for bezier curves
	bool legacySmoothing = false;
	// amount to smooth the curve from 0 to 1 for legacy smoothing
	double smoothAmount = 0.66;
};

// global config object
extern Config driverConfig;

// config from before the last reload
extern Config driverConfigOld;

// config with default values
extern Config defaultDriverConfig;

// lock for the config to prevent updates while reading
extern std::mutex driverConfigLock;

// version of the application
extern std::string driverVersion;


#if __has_include("../Driver/HidModifierPrivate.cpp")
#define HAS_PRIVATE 1
#endif
