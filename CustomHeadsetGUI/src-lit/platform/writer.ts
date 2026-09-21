// A coalescing, awaitable writer. A settings check must wait for the last edit
// to reach disk; otherwise it can read an older value and undo the user's edit.
import { copyFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export interface DebouncedFileWriter {
  save(content: string): Promise<void>;
  flush(): Promise<void>;
  isSavingFile(): boolean;
  cancelPending(): void;
  dispose(): void;
}
interface Waiter { resolve(): void; reject(error: unknown): void; }
interface PendingWrite { content: string; generation: number; waiters: Waiter[]; }

let suspended = false;
let generation = 0;
const writers = new Set<DebouncedFileWriter>();

export class FileWritesSuspendedError extends Error {
  constructor() { super('Settings writes are suspended during installation changes'); }
}
export function resumeFileWrites(): void { suspended = false; }
export async function flushFileWrites(): Promise<void> {
  const results = await Promise.allSettled([...writers].map(writer => writer.flush()));
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
export async function suspendFileWrites(): Promise<void> {
  suspended = true;
  generation++;
  for (const writer of writers) writer.cancelPending();
  // In-progress writes must finish before an uninstall removes their directory.
  await Promise.allSettled([...writers].map(writer => writer.flush()));
}

export function debouncedFileWriter(
  path: string | Promise<string>, tempFileDir: string | Promise<string>, directWrite?: () => boolean,
): DebouncedFileWriter {
  let pending: PendingWrite | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let lastError: unknown;
  let disposed = false;

  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const pump = (): void => {
    clearTimer();
    if (active || !pending) return;
    const batch = pending;
    pending = undefined;
    active = (async () => {
      const filename = await path;
      if (!filename) throw new Error('The settings path is not initialized');
      await navigator.locks.request(`saving file_${filename}`, async () => {
        if (suspended || disposed || batch.generation !== generation) throw new FileWritesSuspendedError();
        if (directWrite?.()) {
          await writeTextFile(filename, batch.content);
        } else {
          const temp = await join(await tempFileDir, `${self.crypto.randomUUID()}.tmp`);
          try {
            await writeTextFile(temp, batch.content);
            await copyFile(temp, filename);
          } finally {
            // A cleanup failure must not hide the actual save error.
            try { await remove(temp); } catch (error) { console.warn('Could not remove temporary settings file', error); }
          }
        }
      });
    })().then(() => {
      lastError = undefined;
      for (const waiter of batch.waiters) waiter.resolve();
    }, error => {
      lastError = error;
      for (const waiter of batch.waiters) waiter.reject(error);
    }).finally(() => {
      active = undefined;
      if (pending && !disposed) timer = setTimeout(pump, 50);
    });
  };

  const writer: DebouncedFileWriter = {
    save(content) {
      if (suspended || disposed) return Promise.reject(new FileWritesSuspendedError());
      lastError = undefined;
      return new Promise<void>((resolve, reject) => {
        if (pending) { pending.content = content; pending.waiters.push({ resolve, reject }); }
        else pending = { content, generation, waiters: [{ resolve, reject }] };
        if (!active && timer === undefined) timer = setTimeout(pump, 50);
      });
    },
    async flush() {
      while (pending || active) {
        clearTimer();
        if (!active) pump();
        await active;
      }
      if (lastError && !(lastError instanceof FileWritesSuspendedError)) throw lastError;
    },
    isSavingFile: () => !!pending || !!active,
    cancelPending() {
      clearTimer();
      for (const waiter of pending?.waiters ?? []) waiter.reject(new FileWritesSuspendedError());
      pending = undefined;
    },
    dispose() { disposed = true; writer.cancelPending(); writers.delete(writer); },
  };
  writers.add(writer);
  return writer;
}
