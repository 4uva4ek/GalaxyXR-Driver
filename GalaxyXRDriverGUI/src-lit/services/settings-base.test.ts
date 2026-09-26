import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonSettingServiceBase } from './settings-base';

const disk = vi.hoisted(() => ({
  content: '', rejectWrites: false,
  read: undefined as undefined | (() => Promise<string>),
  exists: undefined as undefined | (() => Promise<boolean>),
  write: undefined as undefined | (() => Promise<void>),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (path: string) => path === '/test' ? true : disk.exists ? disk.exists() : true,
  mkdir: async () => {},
  watchImmediate: async () => () => {},
  readTextFile: async () => disk.read ? disk.read() : disk.content,
  writeTextFile: async (_path: string, content: string) => {
    if (disk.write) await disk.write();
    if (disk.rejectWrites) throw new Error('Settings file is read-only');
    disk.content = content;
  },
}));

type Settings = { streamFrame: { nvencTap: boolean; saturation: number } };
class TestSettings extends JsonSettingServiceBase<Settings> {
  constructor() {
    super('/test/settings.json', '/test', () => ({ streamFrame: { nvencTap: true, saturation: 1 } }),
      false, false, () => ({ updateMode: 'rewrite' } as any));
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let service: TestSettings;
async function save(nvencTap: boolean, saturation = 1) {
  const saved = service.save({ streamFrame: { nvencTap, saturation } });
  await vi.advanceTimersByTimeAsync(0);
  await service.flush().catch(() => {});
  return saved;
}

beforeEach(async () => {
  vi.useFakeTimers();
  disk.content = JSON.stringify({ streamFrame: { nvencTap: false } });
  disk.rejectWrites = false;
  disk.read = undefined;
  disk.exists = undefined;
  disk.write = undefined;
  service = new TestSettings();
  await service.initTask;
});
afterEach(() => { service.dispose(); vi.useRealTimers(); });

describe('settings reload ordering', () => {
  it('does not reload the old toggle while a save waits for initialization', async () => {
    service.dispose();
    const old = disk.content, entered = deferred<void>();
    const initialRead = deferred<string>(), laterRead = deferred<string>();
    let reads = 0;
    disk.read = () => {
      if (++reads === 1) { entered.resolve(); return initialRead.promise; }
      return laterRead.promise;
    };
    service = new TestSettings();
    await entered.promise;
    const saving = service.save({ streamFrame: { nvencTap: true, saturation: 1 } });
    // This reload captures the new save sequence, but its writer has not been
    // scheduled yet. An old disk result must not be allowed to publish later.
    const reload = service.loadSetting();
    initialRead.resolve(old);
    await service.initTask;
    await vi.advanceTimersByTimeAsync(0);
    await service.flush();
    expect(await saving).toBe(true);
    laterRead.resolve(old);
    expect(await reload).toBe(false);
    expect(service.values()?.streamFrame.nvencTap).toBe(true);
    expect(service.readFileError()).toBeUndefined();
    expect(JSON.parse(disk.content).streamFrame.nvencTap).toBeUndefined();

    // Skipping initialization's read must not leave the save guard armed.
    disk.read = undefined;
    expect(await service.loadSetting()).toBe(true);
    expect(service.values()?.streamFrame.nvencTap).toBe(true);
  });

  it('keeps a newer NVENC On edit when an older disk read completes afterward', async () => {
    const old = disk.content, entered = deferred<void>(), read = deferred<string>();
    disk.read = () => { entered.resolve(); return read.promise; };
    const reload = service.loadSetting();
    await entered.promise;
    expect(await save(true)).toBe(true);
    read.resolve(old);
    expect(await reload).toBe(false);
    expect(service.values()?.streamFrame.nvencTap).toBe(true);
    expect(service.readFileError()).toBeUndefined();

    // The discarded read must not replace the verified rollback snapshot either.
    disk.rejectWrites = true;
    expect(await save(false)).toBe(false);
    expect(service.values()?.streamFrame).toEqual({ nvencTap: true, saturation: 1 });
    // A subsequent unrelated edit must not write the stale Off value back.
    disk.rejectWrites = false;
    expect(await save(service.values()!.streamFrame.nvencTap, 1.2)).toBe(true);
    expect(JSON.parse(disk.content).streamFrame).toEqual({ saturation: 1.2 });
    expect(service.values()?.streamFrame).toEqual({ nvencTap: true, saturation: 1.2 });
  });

  it.each(['missing', 'unreadable', 'malformed'] as const)(
    'ignores a stale %s result after an edit succeeds', async kind => {
      const entered = deferred<void>(), read = deferred<string>(), exists = deferred<boolean>();
      if (kind === 'missing') disk.exists = () => { entered.resolve(); return exists.promise; };
      else disk.read = () => { entered.resolve(); return read.promise; };
      const reload = service.loadSetting();
      await entered.promise;
      expect(await save(true)).toBe(true);
      if (kind === 'missing') exists.resolve(false);
      else if (kind === 'unreadable') read.reject(new Error('Old read failed'));
      else read.resolve('{ invalid');
      expect(await reload).toBe(false);
      expect(service.values()?.streamFrame.nvencTap).toBe(true);
      expect(service.readFileError()).toBeUndefined();
    },
  );

  it('waits for an already pending edit before reading the backing file', async () => {
    const entered = deferred<void>(), written = deferred<void>();
    disk.write = () => { entered.resolve(); return written.promise; };
    const saving = service.save({ streamFrame: { nvencTap: true, saturation: 1 } });
    await vi.advanceTimersByTimeAsync(50);
    await entered.promise;
    let finished = false;
    const reload = service.loadSetting().then(result => { finished = true; return result; });
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(false);
    written.resolve();
    expect(await saving).toBe(true);
    expect(await reload).toBe(true);
    expect(service.values()?.streamFrame.nvencTap).toBe(true);
  });
});
