#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include "../src/Headsets/VrlinkCapabilities.h"

// The flat header's enums are global; isolate them from openvr_driver.h.
// Its legacy __WIN32 C branch typedefs bool; C++ must use native bool.
#pragma push_macro("__WIN32")
#undef __WIN32
namespace pinned {
#include "openvr_capi.h"
}
#pragma pop_macro("__WIN32")

#define ABI_FIELD(type, field) static_assert(offsetof(gxrpaths::type, field) == offsetof(pinned::type, field), #type "." #field)
static_assert(sizeof(gxrpaths::PathRead_t) == sizeof(pinned::PathRead_t));
static_assert(sizeof(gxrpaths::PathWrite_t) == sizeof(pinned::PathWrite_t));
static_assert(alignof(gxrpaths::PathRead_t) == alignof(pinned::PathRead_t));
static_assert(alignof(gxrpaths::PathWrite_t) == alignof(pinned::PathWrite_t));
ABI_FIELD(PathRead_t, ulPath);
ABI_FIELD(PathRead_t, pvBuffer);
ABI_FIELD(PathRead_t, unBufferSize);
ABI_FIELD(PathRead_t, unTag);
ABI_FIELD(PathRead_t, unRequiredBufferSize);
ABI_FIELD(PathRead_t, eError);
ABI_FIELD(PathRead_t, pszPath);
ABI_FIELD(PathWrite_t, ulPath);
ABI_FIELD(PathWrite_t, writeType);
ABI_FIELD(PathWrite_t, eSetError);
ABI_FIELD(PathWrite_t, pvBuffer);
ABI_FIELD(PathWrite_t, unBufferSize);
ABI_FIELD(PathWrite_t, unTag);
ABI_FIELD(PathWrite_t, eError);
ABI_FIELD(PathWrite_t, pszPath);
ABI_FIELD(PathWrite_t, bPostEvents);
ABI_FIELD(PathWrite_t, bValueChanged);
static_assert(static_cast<int>(vr::PropertyWrite_Set) == pinned::EPropertyWriteType_PropertyWrite_Set);
static_assert(static_cast<int>(vr::PropertyWrite_Erase) == pinned::EPropertyWriteType_PropertyWrite_Erase);

#define CHECK(expression) do { if(!(expression)) { std::fprintf(stderr, "FAIL line %d: %s\n", __LINE__, #expression); std::exit(1); } } while(false)
using Error = vr::ETrackedPropertyError;
constexpr Error ok = vr::TrackedProp_Success;

struct FakePaths final : gxrpaths::IVRPaths {
    struct ReadReply { Error batch = ok, entry = ok; bool wrongTag = false, wrongSize = false; };
    struct WriteReply { Error batch = ok, entry = ok; bool apply = true; };
    struct Entry {
        bool present = false, value = false;
        std::deque<ReadReply> reads;
        std::deque<WriteReply> writes;
        unsigned readCount = 0, writeCount = 0, resolveCount = 0;
        Error resolveError = ok;
        bool zeroHandle = false;
    } entries[2];

    Error StringToHandle(gxrpaths::PathHandle_t* handle, char* path) override {
        for(unsigned i = 0; i < 2; ++i) {
            if(std::strcmp(path, gxrpaths::kCapabilities[i]) != 0) continue;
            auto& entry = entries[i];
            ++entry.resolveCount;
            *handle = entry.zeroHandle ? 0 : i + 1;
            return entry.resolveError;
        }
        CHECK(false);
        return vr::TrackedProp_UnknownProperty;
    }
    Error HandleToString(gxrpaths::PathHandle_t, char*, uint32_t, uint32_t*) override {
        CHECK(false);
        return vr::TrackedProp_InvalidOperation;
    }
    Error ReadPathBatch(vr::PropertyContainerHandle_t root, gxrpaths::PathRead_t* batch, uint32_t count) override {
        // Literal assertion also protects against a changed production constant.
        CHECK(root == 0x600000000ULL);
        CHECK(count == 1 && batch->ulPath >= 1 && batch->ulPath <= 2);
        CHECK(batch->pvBuffer && batch->unBufferSize == sizeof(bool));
        CHECK(batch->unTag == vr::k_unBoolPropertyTag && !batch->pszPath);
        auto& entry = entries[batch->ulPath - 1];
        ++entry.readCount;
        ReadReply reply;
        if(!entry.reads.empty()) { reply = entry.reads.front(); entry.reads.pop_front(); }
        if(reply.batch != ok) return reply.batch;
        batch->eError = reply.entry != ok ? reply.entry : entry.present ? ok : vr::TrackedProp_UnknownProperty;
        batch->unTag = reply.wrongTag ? vr::k_unFloatPropertyTag : vr::k_unBoolPropertyTag;
        batch->unRequiredBufferSize = reply.wrongSize ? 4 : sizeof(bool);
        if(batch->eError == ok) *static_cast<bool*>(batch->pvBuffer) = entry.value;
        return ok;
    }
    Error WritePathBatch(vr::PropertyContainerHandle_t root, gxrpaths::PathWrite_t* batch, uint32_t count) override {
        CHECK(root == 0x600000000ULL);
        CHECK(count == 1 && batch->ulPath >= 1 && batch->ulPath <= 2);
        CHECK(batch->bPostEvents && !batch->pszPath);
        CHECK(batch->unTag == vr::k_unBoolPropertyTag);
        CHECK(batch->writeType == vr::PropertyWrite_Set || batch->writeType == vr::PropertyWrite_Erase);
        const bool set = batch->writeType == vr::PropertyWrite_Set;
        CHECK(set ? batch->pvBuffer && batch->unBufferSize == sizeof(bool) : !batch->pvBuffer && batch->unBufferSize == 0);
        auto& entry = entries[batch->ulPath - 1];
        ++entry.writeCount;
        WriteReply reply;
        if(!entry.writes.empty()) { reply = entry.writes.front(); entry.writes.pop_front(); }
        batch->eError = reply.entry;
        if(reply.batch == ok && reply.entry == ok && reply.apply) {
            entry.present = set;
            entry.value = set && *static_cast<bool*>(batch->pvBuffer);
        }
        return reply.batch;
    }
    unsigned writes() const { return entries[0].writeCount + entries[1].writeCount; }
};

void expect(gxrpaths::VrlinkCapabilities::Result result, unsigned changed, unsigned ready, unsigned failed) {
    CHECK(result.changed == changed && result.ready == ready && result.failed == failed);
}

void originalStates() {
    for(unsigned original = 0; original < 3; ++original) {
        FakePaths paths;
        for(auto& entry : paths.entries) { entry.present = original != 0; entry.value = original == 2; }
        gxrpaths::VrlinkCapabilities capabilities;
        CHECK(!capabilities.HasPendingRestore());
        expect(capabilities.Publish(paths), original == 2 ? 0 : 3, 3, 0);
        CHECK(capabilities.HasPendingRestore() == (original != 2));
        const unsigned writes = paths.writes();
        expect(capabilities.Publish(paths), 0, 3, 0);
        CHECK(paths.writes() == writes);
        CHECK(capabilities.Restore(paths) == 0);
        CHECK(!capabilities.HasPendingRestore());
        for(const auto& entry : paths.entries) {
            CHECK(entry.present == (original != 0));
            CHECK(!entry.present || entry.value == (original == 2));
        }
        const unsigned restoredWrites = paths.writes();
        CHECK(capabilities.Restore(paths) == 0 && paths.writes() == restoredWrites);
        expect(capabilities.Publish(paths), original == 2 ? 0 : 3, 3, 0);
        CHECK(paths.entries[0].resolveCount == 2);
    }
}

void changedValueRecovery() {
    FakePaths paths;
    paths.entries[0].present = paths.entries[1].present = true;
    paths.entries[0].value = paths.entries[1].value = true;
    gxrpaths::VrlinkCapabilities capabilities;
    expect(capabilities.Publish(paths), 0, 3, 0);
    paths.entries[0].value = false;
    expect(capabilities.Publish(paths), 1, 3, 0);
    CHECK(capabilities.Restore(paths) == 0);
    CHECK(paths.entries[0].present && paths.entries[0].value);
    CHECK(paths.entries[1].writeCount == 0);
}

void readAndResolveFailures() {
    const FakePaths::ReadReply failures[] = {
        {vr::TrackedProp_InvalidContainer}, {vr::TrackedProp_PermissionDenied},
        {vr::TrackedProp_IPCReadFailure}, {ok, vr::TrackedProp_PermissionDenied},
        {ok, vr::TrackedProp_WrongDataType}, {ok, ok, true}, {ok, ok, false, true},
    };
    for(const auto failure : failures) {
        FakePaths paths;
        paths.entries[0].present = true;
        paths.entries[0].reads.push_back(failure);
        gxrpaths::VrlinkCapabilities capabilities;
        expect(capabilities.Publish(paths), 2, 2, 1);
        CHECK(paths.entries[0].writeCount == 0);
        expect(capabilities.Publish(paths), 1, 3, 0);
        CHECK(capabilities.Restore(paths) == 0);
        CHECK(paths.entries[0].present && !paths.entries[0].value);
    }
    for(bool zeroHandle : {false, true}) {
        FakePaths paths;
        paths.entries[0].zeroHandle = zeroHandle;
        paths.entries[0].resolveError = zeroHandle ? ok : vr::TrackedProp_PermissionDenied;
        gxrpaths::VrlinkCapabilities capabilities;
        expect(capabilities.Publish(paths), 2, 2, 1);
        CHECK(paths.entries[0].readCount == 0 && paths.entries[0].writeCount == 0);
        paths.entries[0].zeroHandle = false;
        paths.entries[0].resolveError = ok;
        expect(capabilities.Publish(paths), 1, 3, 0);
        CHECK(capabilities.Restore(paths) == 0);
    }
}

void writeAndReadbackFailures() {
    const FakePaths::WriteReply failures[] = {
        {vr::TrackedProp_InvalidContainer}, {ok, vr::TrackedProp_PermissionDenied}, {ok, ok, false},
    };
    for(const auto failure : failures) {
        FakePaths paths;
        paths.entries[0].writes.push_back(failure);
        gxrpaths::VrlinkCapabilities capabilities;
        expect(capabilities.Publish(paths), 2, 2, 1);
        expect(capabilities.Publish(paths), 1, 3, 0);
        CHECK(capabilities.Restore(paths) == 0 && !paths.entries[0].present);
    }
    for(bool retryBeforeRestore : {false, true}) {
        FakePaths paths;
        paths.entries[0].reads.push_back({});
        paths.entries[0].reads.push_back({vr::TrackedProp_IPCReadFailure});
        gxrpaths::VrlinkCapabilities capabilities;
        expect(capabilities.Publish(paths), 2, 2, 1);
        CHECK(paths.entries[0].present && paths.entries[0].value);
        if(retryBeforeRestore) {
            expect(capabilities.Publish(paths), 0, 3, 0);
            CHECK(paths.entries[0].writeCount == 1);
        }
        CHECK(capabilities.Restore(paths) == 0 && !paths.entries[0].present);
    }
}

void restoreFailuresAndForeignValues() {
    for(bool foreignPresent : {false, true}) {
        FakePaths paths;
        gxrpaths::VrlinkCapabilities capabilities;
        expect(capabilities.Publish(paths), 3, 3, 0);
        paths.entries[0].present = foreignPresent;
        paths.entries[0].value = false;
        CHECK(capabilities.Restore(paths) == 0);
        CHECK(paths.entries[0].present == foreignPresent && !paths.entries[0].value);
        CHECK(paths.entries[0].writeCount == 1);
    }
    for(unsigned failure = 0; failure < 5; ++failure) {
        FakePaths paths;
        gxrpaths::VrlinkCapabilities capabilities;
        expect(capabilities.Publish(paths), 3, 3, 0);
        if(failure == 0) paths.entries[0].reads.push_back({vr::TrackedProp_IPCReadFailure});
        if(failure == 1) paths.entries[0].writes.push_back({vr::TrackedProp_InvalidContainer});
        if(failure == 2) paths.entries[0].writes.push_back({ok, vr::TrackedProp_PermissionDenied});
        if(failure == 3) paths.entries[0].writes.push_back({ok, ok, false});
        if(failure == 4) {
            paths.entries[0].reads.push_back({});
            paths.entries[0].reads.push_back({vr::TrackedProp_IPCReadFailure});
        }
        CHECK(capabilities.Restore(paths) == 1);
        CHECK(capabilities.HasPendingRestore());
        CHECK(!paths.entries[1].present);
        CHECK(capabilities.Restore(paths) == 0 && !paths.entries[0].present);
        CHECK(!capabilities.HasPendingRestore());
        const unsigned writes = paths.writes();
        CHECK(capabilities.Restore(paths) == 0 && paths.writes() == writes);
    }
}

int main() {
    CHECK(std::strcmp(gxrpaths::IVRPaths_Version, pinned::IVRPaths_Version) == 0);
    CHECK(std::strcmp(gxrpaths::kCapabilities[0], "/driver_vrlink/supports_hand_tracking") == 0);
    CHECK(std::strcmp(gxrpaths::kCapabilities[1], "/driver_vrlink/supports_eye_and_face_tracking") == 0);
    originalStates();
    changedValueRecovery();
    readAndResolveFailures();
    writeAndReadbackFailures();
    restoreFailuresAndForeignValues();
    std::printf("PASS: VRLink capability ownership, retries, events, root, and pinned ABI (%zu-bit).\n", sizeof(void*) * 8);
}
