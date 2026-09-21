# Current cumulative update — validation record

These results were produced for this replacement package. This is **not a Windows release certification**.

| Check | Result | Scope |
|---|---|---|
| Release version consistency | Passed | 1.2.0 agrees across driver code/manifest, npm package/lockfile, Tauri config, Cargo.toml and Cargo.lock |
| GitHub Actions release workflow | Static validation passed | Tag/manual triggers, recursive submodules, Node/Rust/MSBuild setup, npm tests, Galaxy XR portable build, versioned ZIP/checksum/notes, artifact upload and tagged release publication are present |
| Icon attribution | Passed | Vilkka attribution and Lux / Hekky source credit present in root credits, icon docs, changelog and release packaging |
| Existing GUI services | 36/36 passed | Actual service source, mocked Tauri filesystem/native APIs |
| New picture modes and navigation | 22/22 passed | Mode guards, effective default reset, failed-save rollback, concurrent actions, queued edits, external reloads, old-key preservation, installed/missing/unreadable routes |
| Portable build hooks | 19/19 passed | Includes BOM-free JSON generation and PowerShell/Tauri stderr handling; fixture/static checks, not a real Windows compiler invocation |
| Icons and help catalog | 56/56 passed | Actual icon bytes/frames, driver mappings and 168 source-matched help entries |
| Retired vendor-specific source/resource scan | Passed; 0 remaining names/content references in packaged source | Repository-wide text/path scan after locale/resource cleanup |
| Native companion checks | 132/132 neutral; 132/132 Galaxy | Linux g++ standalone policy/routing/recovery/icon-map tests |
| Native SDR policy | 62 checks passed | Standalone g++ test |
| Native settings journal | 36 checks passed | Standalone g++ test |
| Native VRLink capabilities | Passed | Standalone g++ ownership/retry/event/root/ABI test |
| SteamVR settings diff | 19/19 passed | Pure frontend diff test |
| TypeScript syntax | 47 files; no errors | Transpilation syntax only; TypeScript 5.8.3 |
| Strict new-domain typecheck | Passed | image-mode.ts and navigation.ts plus their type dependencies, not the entire application |
| Uploaded backend preservation | 39 files checked | Only Cargo description changed; source/config/icons otherwise byte-identical |
| Legacy readiness test entry | 36/36 passed | Compatibility command still executes the service suite |
| Browser visual/component run | **NOT RUN / BLOCKED** | Navigation to local test server rejected by environment: ERR_BLOCKED_BY_ADMINISTRATOR |
| Clean npm installation | **NOT COMPLETED** | Registry name resolution unavailable in this environment |
| Full frontend typecheck and production bundle | **NOT RUN** | Pinned dependency installation unavailable |
| Windows/Tauri/Rust/full native DLL build | **NOT RUN** | Required native build environment not available |
| SteamVR/headset behavior and Windows icon rendering | **NOT RUN** | Requires the built Windows package and actual runtime/hardware |

## Test dependencies and reproducibility

The service suites executed the current TypeScript sources with the available global TypeScript 5.8.3 compiler. Since npm could not download dependencies, the RxJS Subject/filter/debounceTime/delay runtime was recovered from the user-supplied existing compiled frontend bundle. That runtime was used only by the local validation harness; it is **not** redistributed or substituted for production dependencies. The native API layer is an in-memory fixture, not a live Rust backend.

The pinned package.json/package-lock.json remain unchanged. On the normal Windows build machine, use `npm ci`, then the test commands in the root README and the complete portable build. Those runs use the project's installed dependencies. Pure Linux policy tests do not compile the Windows frame processor, shim, Rust application or graphics integration; the added runtime call sites require the full Windows build and a real stream check.

The attempted browser harness never loaded: no screenshot or visual pass is claimed. Old browser results under `../results` refer to an earlier update and must not be reused as evidence for the current changes. No new production theme behavior was inferred from mocked controls.

## Outstanding release checks

Complete `../WINDOWS-RELEASE-CHECKLIST.md` on a backed-up installation. In particular, check missing-driver navigation/installation access; nested-menu clarity at normal and high display scaling; baseline confirmation/cancellation/default reset; both off-first guards; native pre/post-pack bypass; all locales; profile routing; and portable execution without the source tree present. Enabling the baseline intentionally resets custom picture/lens settings, so retain the backup for rollback.
