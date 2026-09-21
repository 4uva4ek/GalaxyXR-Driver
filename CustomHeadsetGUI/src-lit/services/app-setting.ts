// gui-settings.json service, ported from src/app/services/app-setting.service.ts.
// Preserves the on-disk keys, including the deliberate `advanceMode` spelling.
import { computed } from '../reactive';
import type { AppSetting } from '../domain/types';
import { PathsService } from './paths';
import { JsonSettingServiceBase } from './settings-base';

const appDefaults: AppSetting = {
  colorScheme: 'dark',
  updateMode: 'rewrite',
  advanceMode: false
};

export class AppSettingService extends JsonSettingServiceBase<AppSetting> {
  // Uninstall removes gui-settings.json too. Keep app controls available in
  // memory without recreating the removed directory or changing driver readiness.
  public readonly values = computed(() => this._values() ?? { ...appDefaults });
  protected override normalizeStoredValues(values: unknown): unknown {
    // Older autoCreate wrote JSON.stringify('{}') into gui-settings.json.
    // Accept only that exact empty sentinel; other non-object JSON is invalid.
    return values === '{}' ? {} : values;
  }
  protected override migrateLoadedValues(values: AppSetting): AppSetting {
    const clean = { ...values } as AppSetting & Record<string, unknown>;
    for (const key of ['defaultSettingsTab', 'showIncompatibleProfiles', 'launchPimaxOnStartup']) delete clean[key];
    return clean;
  }
  constructor(paths: PathsService) {
    super(paths.guiSettingPath, paths.appDataDirPath, () => ({ ...appDefaults }), true, true, () => this.values());
  }
}
