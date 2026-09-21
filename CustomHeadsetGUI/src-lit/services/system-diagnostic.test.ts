// Startup regression test for SystemDiagnosticService construction.
//
// The computed fields (settingFileInited, driverVersionMismatch) are field
// initializers that read constructor-injected dependencies (this.dss,
// this.dis). Under ES2022 class-field semantics the initializers run BEFORE
// the constructor body assigns the parameter properties, so the first
// evaluation must be lazy — the old eager `computed` crashed app startup
// with: TypeError: Cannot read properties of undefined (reading 'values').
// The Tauri-dependent async init chain is stubbed out; the construction
// order and computed semantics are what is under test.
import { describe, it, expect } from 'vitest';
import { SystemDiagnosticService } from './system-diagnostic';
import { signal } from '../reactive';

const flushMacrotask = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function buildOffline(dss: Record<string, unknown>, dis: Record<string, unknown>) {
  const sds = new (class extends SystemDiagnosticService {
    // keep the init chain off the Tauri bridge (not under test here)
    public async checkDriverInstalled() { return false; }
    public async watchSteamVRSettings() {}
  })(dss as any, dis as any, {} as any, {} as any);
  return sds;
}

describe('SystemDiagnosticService construction (startup regression)', () => {
  it('constructs without crashing, and the computeds evaluate live once dependencies exist', async () => {
    // mirror the real DriverSettingService: `values` is signal-backed
    const dssState = signal<{ ready: boolean } | undefined>(undefined);
    const dss: Record<string, unknown> = {
      initTask: Promise.resolve(),
      values: () => dssState(),
      readFileError: () => undefined,
    };
    const dis: Record<string, unknown> = {
      initTask: Promise.resolve(),
      values: () => undefined,
    };

    // Must not throw (eager computed evaluation used to throw here).
    const sds = buildOffline(dss, dis);

    // dependencies not ready -> computeds resolve to the "not ready" values
    expect(sds.settingFileInited()).toBe(false);
    expect(sds.driverVersionMismatch()).toBe(false);
    expect(sds.systemReady()).toBe(false);

    // simulate settings.json loading: the live computed picks it up
    dssState.set({ ready: true });
    await flushMacrotask();
    expect(sds.settingFileInited()).toBe(true);

    await new Promise<void>(resolve => setTimeout(resolve, 0)); // init IIFE settles
  });

  it('reports no mismatch while the installed version is unknown', async () => {
    const dss: Record<string, unknown> = {
      initTask: Promise.resolve(),
      values: () => ({}),
      readFileError: () => undefined,
    };
    const dis: Record<string, unknown> = {
      initTask: Promise.resolve(),
      values: () => ({ driverVersion: '1.2.3' }),
    };
    const sds = buildOffline(dss, dis);
    // info.json reports a driver version but nothing is installed yet:
    // the mismatch computed must read both sides lazily and report false
    expect(sds.driverVersionMismatch()).toBe(false);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
});
