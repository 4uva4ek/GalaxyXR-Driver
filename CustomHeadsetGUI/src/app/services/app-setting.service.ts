import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AppSetting } from './JsonFileDefines';
import { PathsService } from './paths.service';
import { JsonSettingServiceBase } from './JsonSettingServiceBase';
import { AppSettingHolder } from './AppSettingAccessor';

const appDefaults: AppSetting = {
  colorScheme: 'dark',
  updateMode: 'rewrite',
  advanceMode: false
};

@Injectable({
  providedIn: 'root'
})
export class AppSettingService extends JsonSettingServiceBase<AppSetting> {
  // Uninstall removes gui-settings.json too. Keep app controls available in
  // memory without recreating the removed directory or changing driver readiness.
  public override values = computed(() => this._values() ?? { ...appDefaults });
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
    super(paths.guiSettingPath, paths.appDataDirPath, signal({ ...appDefaults }), true, true)
    const appSettingHolder = inject(AppSettingHolder)
    effect(() => {
      const values = this.values() ?? {} as AppSetting;
      appSettingHolder.settings = values;
    });
  }
}
