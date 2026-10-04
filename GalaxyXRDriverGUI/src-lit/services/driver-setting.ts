// settings.json service, ported from src/app/services/driver-setting.service.ts.
import { exists, writeTextFile } from '@tauri-apps/plugin-fs';
import type { AppSetting, Settings } from '../domain/types';
import { PathsService } from './paths';
import { JsonSettingServiceBase } from './settings-base';
import { deepMerge } from '../domain/pure';
import type { DriverInfoService } from './driver-info';
import { getDriverDefaultsForVendor } from '../domain/vendor-driver-defaults';
import { vendor } from '../environment';

export class DriverSettingService extends JsonSettingServiceBase<Settings> {
  private readonly pathService: PathsService;
  constructor(paths: PathsService, driverInfoService: DriverInfoService, appSettingGetter: () => AppSetting | undefined) {
    super(paths.settingPath, paths.appDataDirPath, () => {
      const bundled = getDriverDefaultsForVendor(vendor);
      const defaults = deepMerge(structuredClone(bundled), driverInfoService.values()?.defaultSettings ?? {});
      // 2026-10-01: stale telemetry must not change the master default or prune OFF.
      defaults.debugMode = bundled.debugMode;
      // 2026-09-26: telemetry can outlive an installed package. Encoder toggles
      // and sparse saves must use that package's native defaults, otherwise an
      // explicit Off can be pruned and return as On on the next native load.
      if (defaults.streamFrame) {
        Object.assign(defaults.streamFrame, Object.fromEntries(Object.entries(bundled.streamFrame ?? {})
          .filter(([key]) => key.startsWith('nvenc') || key === 'postPack')));
      }
      if (vendor === 'galaxyxr' && defaults.galaxyXr) {
        defaults.galaxyXr.nativeIdentity = true;
        defaults.galaxyXr.vrlinkHeadsetProfile = true;
      }
      return defaults;
    }, false, true, appSettingGetter);
    this.pathService = paths;
  }
  // Installation is sufficient to edit settings. info.json is runtime telemetry,
  // not an initialization prerequisite; generated defaults work before first run.
  public async ensureEditableSettings() {
    await this.pathService.ensureAllDirCreated();
    if (!await exists(this.filePath)) await writeTextFile(this.filePath, '{}');
    await this.refreshWatch();
    return this.loadSetting();
  }
  // migration: keys the driver has retired are deleted on load so the
  // next natural save writes a clean settings.json.
  private static readonly retiredStreamFrameKeys = ['velocityFix', 'velocityFixMode', 'nativeLinearVelocityCutoff', 'nativeAngularVelocityCutoffDeg'];
  // 2026-10-04: the Controller Fix Mode (Kalman / derive estimators) is gone
  // with every knob it had, and the Game Link layout is no longer a toggle.
  private static readonly retiredStreamFrameKeyPattern = /^(kalman|derive)[A-Z]/;
  protected override migrateLoadedValues(values: Settings): Settings {
    const sf = (values as any)?.streamFrame;
    if (sf) {
      for (const key of Object.keys(sf)) {
        if (DriverSettingService.retiredStreamFrameKeys.includes(key) || DriverSettingService.retiredStreamFrameKeyPattern.test(key)) {
          delete sf[key];
        }
      }
    }
    const galaxyXr = (values as any)?.galaxyXr;
    if (galaxyXr && 'gameLinkLayout' in galaxyXr) delete galaxyXr.gameLinkLayout;
    const controllers = (values as any)?.controllers;
    if (controllers && 'gameLinkLayout' in controllers) delete controllers.gameLinkLayout;
    return values;
  }
}
