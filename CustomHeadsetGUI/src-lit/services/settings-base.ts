import { effect, signal } from '../reactive';
import { exists, mkdir, readTextFile, watchImmediate, writeTextFile } from '@tauri-apps/plugin-fs';
import { cleanJsonComments, deepCopy, deepMerge } from '../domain/pure';
import { validateBooleanSettings } from '../domain/settings-inspection';
import { type DebouncedFileWriter, debouncedFileWriter, FileWritesSuspendedError } from '../platform/writer';
import { debounceTime, delay, filter, Subject } from 'rxjs';
import type { AppSetting } from '../domain/types';

export enum FileReadErrorReason {
  NotExists = 'File not exists', ParsingFailed = 'Parsing failed', ReadFailed = 'Read failed',
}
export type FileReadError = { reason: FileReadErrorReason; message?: string };

export abstract class JsonSettingServiceBase<T> {
  protected _values = signal<T | undefined>(undefined);
  public readonly values = this._values.asReadonly();
  protected _readFileError = signal<FileReadError | undefined>(undefined);
  public readonly readFileError = this._readFileError.asReadonly();
  private _writeFileError = signal<string | undefined>(undefined);
  public readonly writeFileError = this._writeFileError.asReadonly();
  private _storedValues = signal<unknown>(undefined);
  public readonly storedValues = this._storedValues.asReadonly();
  /** True only during an explicit disk inspection; migrations must not write. */
  public inspecting = false;
  protected readonly debouncedFileWriter: DebouncedFileWriter;
  protected _initTask: Promise<void>;
  public get initTask(): Promise<void> { return this._initTask; }
  protected defaults?: T;
  private verified?: T;
  private saveSequence = 0;
  private stopWatching?: () => void;
  private stopDefaults?: () => void;
  private disposed = false;
  public get filePath(): string { return this._filePath; }
  protected migrateLoadedValues(values: T): T { return values; }
  protected normalizeStoredValues(values: unknown): unknown { return values; }

  constructor(
    private _filePath: string, private _fileDir: string, private defaultValue: () => T | undefined,
    private autoCreate: boolean, private watchFileforAutoReload: boolean,
    updateModeProvider: () => AppSetting | undefined,
  ) {
    if (!_filePath || !_fileDir) throw new Error('Settings service received an uninitialized path');
    this.debouncedFileWriter = debouncedFileWriter(_filePath, _fileDir, () => updateModeProvider()?.updateMode === 'rewrite');
    this.defaults = defaultValue() ?? {} as T;
    let defaultsKey = JSON.stringify(this.defaults);
    this._initTask = this.init();
    this.stopDefaults = effect(() => {
      const defaults = this.defaultValue() ?? {} as T;
      const key = JSON.stringify(defaults);
      this.defaults = defaults;
      if (key === defaultsKey) return;
      defaultsKey = key;
      // Changing runtime telemetry must not reload over an edit still in flight.
      void this._initTask.then(async () => {
        await this.debouncedFileWriter.flush();
        if (!this.disposed) await this.loadSetting();
      }).catch(error => console.warn('Could not refresh settings defaults', error));
    });
  }

  protected async init(): Promise<void> {
    try {
      if (!await exists(this._fileDir)) await mkdir(this._fileDir, { recursive: true });
      if (!await exists(this._filePath) && this.autoCreate) await writeTextFile(this._filePath, '{}');
      await this.refreshWatch();
      await this.loadSetting();
    } catch (error) {
      this._readFileError.set({ reason: FileReadErrorReason.ReadFailed, message: String(error) });
      this._values.set(undefined);
    }
  }

  public async refreshWatch(): Promise<void> {
    this.stopWatching?.();
    this.stopWatching = undefined;
    if (!this.watchFileforAutoReload || this.disposed) return;
    const subject = new Subject<void>();
    const subscription = subject.pipe(
      filter(() => !this.debouncedFileWriter.isSavingFile()), debounceTime(50), delay(50),
    ).subscribe(() => { if (!this.inspecting) void this.loadSetting(); });
    const normalize = (path: string) => path.replaceAll('\\', '/').toLowerCase();
    try {
      const unwatch = await watchImmediate(this._fileDir, event => {
        if (event.paths.some(path => normalize(path) === normalize(this._filePath))) subject.next();
      });
      this.stopWatching = () => { unwatch(); subscription.unsubscribe(); subject.complete(); };
    } catch (error) {
      subscription.unsubscribe(); subject.complete();
      console.warn('Cannot watch settings directory; the About check can reload it manually', error);
    }
  }

  async loadSetting(): Promise<boolean> {
    return navigator.locks.request(`loadfile_${this._filePath}`, async () => {
      try {
        if (!await exists(this._filePath)) {
          this._readFileError.set({ reason: FileReadErrorReason.NotExists });
        } else {
          // Separate I/O failure from malformed JSON; neither represents Off.
          const text = await readTextFile(this._filePath);
          try {
            this.defaults = this.defaultValue() ?? {} as T;
            const parsed = this.normalizeStoredValues(JSON.parse(cleanJsonComments(text)));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Settings must be a JSON object');
            validateBooleanSettings(parsed, this.defaults);
            const values = this.migrateLoadedValues(deepMerge(deepCopy(this.defaults) as any, parsed));
            this._storedValues.set(structuredClone(parsed));
            this.verified = structuredClone(values);
            this._values.set(values);
            this._readFileError.set(undefined);
            return true;
          } catch (error) {
            this._readFileError.set({ reason: FileReadErrorReason.ParsingFailed, message: String(error) });
          }
        }
      } catch (error) {
        this._readFileError.set({ reason: FileReadErrorReason.ReadFailed, message: String(error) });
      }
      this._storedValues.set(undefined);
      this._values.set(undefined);
      return false;
    });
  }

  public flush(): Promise<void> { return this.debouncedFileWriter.flush(); }

  async save(values: T): Promise<boolean> {
    if (this.inspecting || this.disposed) return false;
    const snapshot = structuredClone(values);
    const sequence = ++this.saveSequence;
    await this._initTask;
    if (this.inspecting || this.disposed) return false;
    this._values.set(snapshot);
    try {
      await this.debouncedFileWriter.save(JSON.stringify(deepCopy(snapshot, this.defaults ?? {}), undefined, 4));
      this.verified = structuredClone(snapshot);
      this._writeFileError.set(undefined);
      return true;
    } catch (error) {
      if (!(error instanceof FileWritesSuspendedError)) {
        this._writeFileError.set(String(error));
        if (sequence === this.saveSequence) this._values.set(this.verified === undefined ? undefined : structuredClone(this.verified));
      }
      return false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopWatching?.(); this.stopDefaults?.();
    this.debouncedFileWriter.dispose();
  }
}
