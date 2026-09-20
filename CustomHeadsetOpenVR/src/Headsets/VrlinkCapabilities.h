#pragma once

#include "openvr_driver.h"
#include <cstddef>
#include <cstdint>

// The pinned OpenVR SDK exposes these in openvr_capi.h, but not in
// openvr_driver.h. Keep the C++ vtable and structs matched to IVRPaths_002:
// ValveSoftware/openvr@0924064316de3effbcd1acf1e309182a2deb1c05.
// In particular _002 adds bPostEvents/bValueChanged; never cast _001 to it.
namespace gxrpaths {
#pragma pack(push, 8)
using PathHandle_t = uint64_t;
struct PathRead_t {
    PathHandle_t ulPath;
    void* pvBuffer;
    uint32_t unBufferSize;
    vr::PropertyTypeTag_t unTag;
    uint32_t unRequiredBufferSize;
    vr::ETrackedPropertyError eError;
    const char* pszPath;
};
struct PathWrite_t {
    PathHandle_t ulPath;
    vr::EPropertyWriteType writeType;
    vr::ETrackedPropertyError eSetError;
    void* pvBuffer;
    uint32_t unBufferSize;
    vr::PropertyTypeTag_t unTag;
    vr::ETrackedPropertyError eError;
    const char* pszPath;
    bool bPostEvents;
    bool bValueChanged;
};
#pragma pack(pop)
static_assert(sizeof(PathRead_t) == (sizeof(void*) == 8 ? 40 : 32), "IVRPaths read ABI");
static_assert(sizeof(PathWrite_t) == (sizeof(void*) == 8 ? 56 : 40), "IVRPaths_002 write ABI");
static_assert(offsetof(PathWrite_t, bPostEvents) == (sizeof(void*) == 8 ? 48 : 36), "IVRPaths_002 event ABI");

class IVRPaths {
public:
    virtual vr::ETrackedPropertyError ReadPathBatch(vr::PropertyContainerHandle_t root, PathRead_t* batch, uint32_t count) = 0;
    virtual vr::ETrackedPropertyError WritePathBatch(vr::PropertyContainerHandle_t root, PathWrite_t* batch, uint32_t count) = 0;
    virtual vr::ETrackedPropertyError StringToHandle(PathHandle_t* handle, char* path) = 0;
    virtual vr::ETrackedPropertyError HandleToString(PathHandle_t handle, char* buffer, uint32_t size, uint32_t* used) = 0;
};
inline constexpr const char* IVRPaths_Version = "IVRPaths_002";
// Root used by Valve's VRLink Read/WritePathBatch calls, verified in SteamVR
// build 25216780 (driver_vrlink RVA 0x9EC767). This is NOT a device container
// or a path handle. Invalid-root/interface errors fail closed and are logged.
inline constexpr vr::PropertyContainerHandle_t kRoot = 0x600000000ULL;

inline constexpr const char* kCapabilities[] = {
    "/driver_vrlink/supports_hand_tracking",
    "/driver_vrlink/supports_eye_and_face_tracking",
};

// Own only the changes made while this Galaxy HMD is connected. These flags
// expose Steam Link controls; they do not opt the user into data sharing or
// synthesize hand/gaze/face samples. VRLink remains the data publisher.
class VrlinkCapabilities {
public:
    struct Result { unsigned changed = 0, ready = 0, failed = 0; };

    bool HasPendingRestore() const { return states[0].changed || states[1].changed; }

    Result Publish(IVRPaths& paths) {
        Result result;
        for(unsigned i = 0; i < 2; ++i) {
            auto& state = states[i];
            bool present = false, value = false;
            if(!Resolve(paths, i) || !Read(paths, state.handle, present, value)) {
                result.failed |= 1u << i;
                continue;
            }
            if(!state.captured) {
                state.originalPresent = present;
                state.originalValue = value;
                state.captured = true;
            }
            if(present && value) {
                result.ready |= 1u << i;
                continue;
            }
            if(!Write(paths, state.handle, true, true)) {
                result.failed |= 1u << i;
                continue;
            }
            // Retain ownership even if read-back fails: a write can succeed
            // before a transient read failure and must still be restored.
            state.changed = true;
            if(Read(paths, state.handle, present, value) && present && value) {
                result.changed |= 1u << i;
                result.ready |= 1u << i;
            } else {
                result.failed |= 1u << i;
            }
        }
        return result;
    }

    unsigned Restore(IVRPaths& paths) {
        unsigned failed = 0;
        for(unsigned i = 0; i < 2; ++i) {
            auto& state = states[i];
            if(state.changed) {
                bool present = false, value = false;
                if(!Read(paths, state.handle, present, value)) {
                    failed |= 1u << i;
                    continue;
                }
                // Do not overwrite a different value written by another owner.
                if(present && value) {
                    if(!Write(paths, state.handle, state.originalPresent, state.originalValue)
                        || !Read(paths, state.handle, present, value)
                        || present != state.originalPresent
                        || (present && value != state.originalValue)) {
                        failed |= 1u << i;
                        continue;
                    }
                }
            }
            state = {};
        }
        return failed;
    }

private:
    struct State {
        PathHandle_t handle = 0;
        bool captured = false, originalPresent = false, originalValue = false, changed = false;
    } states[2];

    bool Resolve(IVRPaths& paths, unsigned i) {
        if(states[i].handle) return true;
        // The interface takes char*, although the path is an input string.
        char path[64] = {};
        for(unsigned j = 0; kCapabilities[i][j]; ++j) path[j] = kCapabilities[i][j];
        PathHandle_t handle = 0;
        if(paths.StringToHandle(&handle, path) != vr::TrackedProp_Success || !handle) return false;
        states[i].handle = handle;
        return true;
    }

    static bool Read(IVRPaths& paths, PathHandle_t handle, bool& present, bool& value) {
        PathRead_t read{};
        read.ulPath = handle;
        read.pvBuffer = &value;
        read.unBufferSize = sizeof(value);
        read.unTag = vr::k_unBoolPropertyTag;
        const auto error = paths.ReadPathBatch(kRoot, &read, 1);
        if(error != vr::TrackedProp_Success) return false;
        present = read.eError != vr::TrackedProp_UnknownProperty;
        return !present || (read.eError == vr::TrackedProp_Success
            && read.unTag == vr::k_unBoolPropertyTag && read.unRequiredBufferSize == sizeof(value));
    }

    static bool Write(IVRPaths& paths, PathHandle_t handle, bool present, bool value) {
        PathWrite_t write{};
        write.ulPath = handle;
        write.writeType = present ? vr::PropertyWrite_Set : vr::PropertyWrite_Erase;
        write.pvBuffer = present ? &value : nullptr;
        write.unBufferSize = present ? sizeof(value) : 0;
        write.unTag = vr::k_unBoolPropertyTag;
        write.bPostEvents = true;
        return paths.WritePathBatch(kRoot, &write, 1) == vr::TrackedProp_Success
            && write.eError == vr::TrackedProp_Success;
    }
};
} // namespace gxrpaths
