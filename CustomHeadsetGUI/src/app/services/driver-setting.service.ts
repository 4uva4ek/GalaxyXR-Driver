import { computed, Injectable } from '@angular/core';
import { exists, writeTextFile } from '@tauri-apps/plugin-fs';
import { Settings } from './JsonFileDefines';
import { PathsService } from './paths.service';
import { JsonSettingServiceBase } from './JsonSettingServiceBase';
import { deepCopy, deepMerge } from '../helpers';
import { DriverInfoService } from './driver-info.service';
import { driverDefaults } from './driver-defaults';
import { vendor } from '../../environment';

@Injectable({ providedIn: 'root' })
export class DriverSettingService extends JsonSettingServiceBase<Settings> {
  constructor(private pathService: PathsService, driverInfoService: DriverInfoService) {
    super(pathService.settingPath, pathService.appDataDirPath, computed(() => {
      const defaults = deepMerge(deepCopy(driverDefaults), driverInfoService.values()?.defaultSettings ?? {});
      if (vendor === 'galaxyxr' && defaults.galaxyXr) defaults.galaxyXr.nativeIdentity = true;
      return defaults;
    }), false, true);
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
  // next natural save writes a clean settings.json. Prune-on-save
  // incident 2026-08-11: the round-trip writer preserved a legacy
  // "velocityFix" bool for months; the default-diff serializer then
  // pruned the explicit velocityFixMode the moment it matched the new
  // published default, and the fossil took over mode selection.
  private static readonly retiredStreamFrameKeys = ['velocityFix', 'kalmanDupSkip', 'kalmanAdaptiveBoost'];
  protected override migrateLoadedValues(values: Settings): Settings {
    const sf = (values as any)?.streamFrame;
    if (sf) {
      for (const key of DriverSettingService.retiredStreamFrameKeys) {
        if (key in sf) {
          delete sf[key];
        }
      }
    }
    return values;
  }
}
