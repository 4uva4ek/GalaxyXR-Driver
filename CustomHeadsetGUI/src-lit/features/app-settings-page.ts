// App Settings page, ported from
// src/app/pages/app-settings/app-settings.component.{html,ts} (Angular era).
// gui-settings.json controls: color scheme, the image-enhancements master
// switch (driver-side streamFrame.enable), advanced mode (deliberate
// `advanceMode` spelling), and update mode (replace/rewrite).
//
// The Angular template wrapped the whole block in `@if(settings)`, but the
// Lit AppSettingService.values() is a computed with a defaults fallback and is
// therefore never undefined, so the guard is dropped.
import { html, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { css } from 'lit';
import { BasePage, fieldRow, noteRow, fieldStyles } from './page-base';
import { t } from '../locale/i18n';
import type { AppSetting } from '../domain/types';
import { driverDefaults } from '../domain/driver-defaults';
import '../ui/controls';

@customElement('app-app-settings-page')
export class AppSettingsPage extends BasePage {
  static styles = [fieldStyles, css`
    :host { display: block; padding: 0 1rem 2rem 1rem; }
  `];

  // Mirror of the Angular `get imageEnhancements()` getter: the driver-side
  // streamFrame.enable flag that gates color/sharpening/the Distortion tab.
  private get imageEnhancements(): boolean {
    return !!this.ctx.dss.values()?.streamFrame?.enable;
  }

  // Mirror of the Angular `setImageEnhancements(enabled)`: clone the current
  // settings, ensure a streamFrame section exists (filling from the driver
  // defaults), flip `enable`, and save.
  private setImageEnhancements(enabled: boolean): void {
    const dss = this.ctx.dss;
    const current = dss.values();
    if (!current) return;
    const next = structuredClone(current);
    next.streamFrame ??= structuredClone(driverDefaults.streamFrame!);
    next.streamFrame.enable = enabled;
    void dss.save(next);
    this.requestUpdate();
  }

  render() {
    const appSetting = this.ctx.appSetting;
    // Persist one gui-settings.json patch on top of the latest loaded values.
    const save = (patch: Partial<AppSetting>) => {
      void appSetting.save({ ...appSetting.values(), ...patch });
      this.requestUpdate();
    };

    const body: TemplateResult[] = [
      fieldRow(t('Color Scheme'), html`
        <app-select .value=${appSetting.values().colorScheme} .options=${[
          { value: 'system', label: t('System') },
          { value: 'dark', label: t('Dark') },
          { value: 'light', label: t('Light') },
        ]} @change=${(e: CustomEvent) => save({ colorScheme: e.detail as AppSetting['colorScheme'] })}></app-select>
      `),
      fieldRow('Image Enhancements', html`
        <app-switch .known=${!this.ctx.dss.readFileError()} .checked=${this.imageEnhancements} .disabled=${!this.ctx.dss.values()} @change=${(e: CustomEvent) => this.setImageEnhancements(!!e.detail)}></app-switch>
      `),
      noteRow('Enable color adjustments, sharpening, and the Distortion Profile tab. Your saved adjustments are kept when this is off.'),
      fieldRow(t('Advanced Mode'), html`
        <app-switch .known=${!appSetting.readFileError()} .disabled=${!!appSetting.readFileError()} .checked=${!!appSetting.values().advanceMode} @change=${(e: CustomEvent) => save({ advanceMode: e.detail })}></app-switch>
      `),
      noteRow('Show encoder tuning, detailed controller controls, calibration tools, and diagnostic sections. Hiding these controls keeps their current values.'),
    ];

    if (appSetting.values().advanceMode) {
      body.push(
        fieldRow(t('Update Mode'), html`
          <app-select .value=${appSetting.values().updateMode} .options=${[
            { value: 'replace', label: t('Replace') },
            { value: 'rewrite', label: t('Rewrite') },
          ]} @change=${(e: CustomEvent) => save({ updateMode: e.detail as AppSetting['updateMode'] })}></app-select>
        `),
      );
    }

    return html`${appSetting.readFileError() ? noteRow(t('App preferences could not be verified. Use the About-page settings check after correcting the file or its permissions.')) : html``}${body}`;
  }
}
