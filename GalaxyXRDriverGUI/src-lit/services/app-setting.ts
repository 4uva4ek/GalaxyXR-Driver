// gui-settings.json service, ported from src/app/services/app-setting.service.ts.
// Preserves the on-disk keys, including the deliberate `advanceMode` spelling.
import { computed } from '../reactive';
import type { AppSetting } from '../domain/types';
import { PathsService } from './paths';
import { JsonSettingServiceBase } from './settings-base';

const appDefaults: AppSetting = {
  colorScheme: 'dark',
  updateMode: 'rewrite',
  advanceMode: false,
  // Default Off (2026-09-23): a fresh install — or the one before an
  // uninstall — requires a new SteamVR verification before the Setup check
  // may show green again. gui-settings.json survives uninstall, so the flag
  // is cleared explicitly by the install/uninstall handlers.
  driverVerified: false
};

export class AppSettingService extends JsonSettingServiceBase<AppSetting> {
  // Uninstall preserves gui-settings.json, so app preferences (color scheme
  // etc.) survive driver removal (2026-09-22). The in-memory defaults still
  // keep app controls available before the file exists or if it was removed
  // externally.
  public readonly values = computed(() => this._values() ?? { ...appDefaults });
  protected override normalizeStoredValues(values: unknown): unknown {
    // Older autoCreate wrote JSON.stringify('{}') into gui-settings.json.
    // Accept only that exact empty sentinel; other non-object JSON is invalid.
    return values === '{}' ? {} : values;
  }
  protected override migrateLoadedValues(values: AppSetting): AppSetting {
    const clean = { ...values } as AppSetting & Record<string, unknown>;
    for (const key of ['defaultSettingsTab', 'showIncompatibleProfiles']) delete clean[key];
    return clean;
  }
  constructor(paths: PathsService) {
    super(paths.guiSettingPath, paths.appDataDirPath, () => ({ ...appDefaults }), true, true, () => this.values());
  }
}
