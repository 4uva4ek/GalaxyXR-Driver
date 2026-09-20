
import { effect, inject, Signal, signal } from '@angular/core';
import { exists, mkdir, readTextFile, watchImmediate, writeTextFile } from '@tauri-apps/plugin-fs';
import { cleanJsonComments, DebouncedFileWriter, debouncedFileWriter, deepCopy, deepMerge } from '../helpers';
import { debounceTime, delay, filter, Subject } from 'rxjs';
import { AppSettingAccessor } from './AppSettingAccessor';
export enum FileReadErrorReason {
    NotExists = 'File not exists',
    ParsingFailed = 'Parsing failed',
    ReadFailed = 'Read failed'
}
export type FileReadError = {
    reason: FileReadErrorReason,
    message?: string
}
export abstract class JsonSettingServiceBase<T> {
    protected _values = signal<T | undefined>(undefined, {});
    // migration hook: subclasses may strip retired keys from freshly
    // loaded values so the next natural save writes a clean file
    protected migrateLoadedValues(values: T): T { return values; }
    protected normalizeStoredValues(values: unknown): unknown { return values; }
    public values = this._values.asReadonly();
    protected readonly debouncedFileWriter: DebouncedFileWriter;
    protected _initTask: Promise<void>;
    public get initTask() {
        return this._initTask;
    }
    protected _readFileError = signal<FileReadError | undefined>(undefined);
    public readFileError = this._readFileError.asReadonly();
    protected defaults?: T;
    private stopWatching?: () => void;
    public get filePath() {
        return this._filePath;
    }
    constructor(
        private _filePath: string,
        private _fileDir: string,
        private defaultValue: Signal<T | undefined>,
        private autoCreate: boolean,
        private watchFileforAutoReload: boolean) {
        const appSettings = inject(AppSettingAccessor)
        this.debouncedFileWriter = debouncedFileWriter(_filePath, _fileDir, () => appSettings.settings.updateMode == 'rewrite');
        this.defaults = this.defaultValue() ?? {} as T;
        this._initTask = this.init();

        effect(() => {
            this.defaults = (this.defaultValue() ?? {} as any)
            this.loadSetting()
        });
    }
    protected async init() {
        if (!await exists(this._fileDir)) {
            await mkdir(this._fileDir, { recursive: true });
        }
        if (!await exists(this._filePath) && this.autoCreate) {
            await writeTextFile(this._filePath, '{}');
        }
        await this.refreshWatch();
        await this.loadSetting();
    }
    // Directory watches are invalidated when uninstall removes the config
    // directory. Rebind them after install recreates it.
    public async refreshWatch() {
        this.stopWatching?.();
        this.stopWatching = undefined;
        if (this.watchFileforAutoReload) {
            const watchSubject = new Subject<void>();
            const subscription = watchSubject.pipe(filter(() => !this.debouncedFileWriter.isSavingFile()), debounceTime(50), delay(50)).subscribe(() => {
                this.loadSetting()
            });
            const normalize = (path: string) => path.replaceAll('\\', '/').toLowerCase();
            try {
                const unwatch = await watchImmediate(this._fileDir, ev => {
                    if (ev.paths.some(p => normalize(p) === normalize(this._filePath))) {
                        watchSubject.next();
                    }
                });
                this.stopWatching = () => { unwatch(); subscription.unsubscribe(); watchSubject.complete(); };
            } catch (error) {
                subscription.unsubscribe();
                watchSubject.complete();
                console.warn('Cannot watch settings directory', error);
            }
        }
    }
    async loadSetting(): Promise<boolean> {
        return await navigator.locks.request(`loadfile_${this._filePath}`, async () => {
            try {
                if (await exists(this._filePath)) {
                    try {
                        const copiedDefaults = deepCopy(this.defaults);
                        const parsed = this.normalizeStoredValues(JSON.parse(cleanJsonComments(await readTextFile(this._filePath))));
                        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Settings must be a JSON object');
                        this._values.set(this.migrateLoadedValues(deepMerge(copiedDefaults as any, parsed)));
                        this._readFileError.set(undefined);
                        return true;
                    } catch (e) {
                        console.error('parsing setting error', this._filePath, e)
                        this._readFileError.set({
                            reason: FileReadErrorReason.ParsingFailed,
                            message: `${e}`
                        });
                        this._values.set(undefined);
                    }
                } else {
                    this._readFileError.set({ reason: FileReadErrorReason.NotExists });
                    this._values.set(undefined)
                }
            } catch (e) {
                console.error('load setting error', this._filePath, e);
                this._readFileError.set({ reason: FileReadErrorReason.ReadFailed, message: `${e}` });
                this._values.set(undefined);
            }
            return false
        });
    }

    async save(values: T) {
        await this._initTask;
        this.debouncedFileWriter.save(JSON.stringify(deepCopy(values, this.defaults ?? {}), undefined, 4));
        this._values.set(Object.assign({}, values))
    }
}
