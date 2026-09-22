// System readiness gate, ported from
// src/app/utilities/system-ready/system-ready.component.{ts,html}
// and driver-troubleshooter.component.{ts,html}.
// Shows the page content only when SteamVR + driver + settings are ready;
// otherwise the troubleshooting checklist with the same actions
// (install SteamVR, enable driver, retry, reset setting). Driver installation
// is linked to Setup so its single button is the only installation entry point.
import { html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { css } from 'lit';
import { interactiveStyles } from '../ui/shared-styles';
import { BasePage, fieldStyles, sectionHeading } from './page-base';
import { galaxyXRDriverName } from '../environment';
import { openUrl } from '@tauri-apps/plugin-opener';
import { t } from '../locale/i18n';

@customElement('app-driver-troubleshooter')
export class DriverTroubleshooter extends BasePage {
  static styles = [fieldStyles, css`
    :host { display: block; padding: 0 1rem 1rem; }
    .warn { color: var(--colorPaletteRedForeground1, #b00020); }
    .ok { color: var(--colorPaletteGreenForeground1, #107c10); }
    button { height: 2rem; }
    .read-error { font-size: 0.85rem; opacity: 0.8; overflow-wrap: anywhere; }
  `];

  @property({ type: Boolean }) wait = false;
  @property({ type: Boolean }) driverEnablePrompt = false;

  connectedCallback(): void {
    super.connectedCallback();
    const sds = this.ctx.sds;
    sds.initTask
      .catch(error => console.error('Readiness check failed', error))
      .then(() => {
        this.wait = true;
        // (2026-09-22) SteamVR detection keeps polling — it has no 'checking'
        // state, so it cannot flicker the driver row. The driver-install check
        // is on-demand only (app start, "Check installation", install flow).
        if (!sds.steamVRinstalled()) sds.pullingSteamVRinstall.start();
        this.requestUpdate();
      });

  }

  private enableDriver = async () => {
    await this.ctx.sds.enableSteamVRDriver(galaxyXRDriverName);
  };
  private installSteamVR = async () => {
    await openUrl('steam://install/250820');
  };

  render() {
    const sds = this.ctx.sds;
    const cfg = sds.steamVrConfig();
    this.driverEnablePrompt = !!cfg && !sds.getSteamVRDriverEnableState(cfg, galaxyXRDriverName);
    if (!this.wait) return html``;
    return this.sectionCardsFor([sectionHeading(t('System not ready')), html`
    ${sds.driverCheckError() ? html`<p class="read-error" role="alert">${sds.driverCheckError()}</p>` : html``}
    <p><a href="#/setup">${t('Open Setup to check installation and settings')}</a></p>

    <div class="field">
      <div class="title">${t('SteamVR installation')}</div>
      <div class="control">
        ${!sds.steamVRinstalled()
          ? html`<span class="warn">⚠</span> ${t('SteamVR not installed')}
            <button type="button" @click=${this.installSteamVR}>${t('Install SteamVR')}</button>`
          : html`<span class="ok">✓</span>`}
      </div>
    </div>

    <div class="field">
      <div class="title">${t('Driver installation')}</div>
      <div class="control">
        ${!sds.driverInstalled()
          ? html`<span class="warn">⚠</span> ${sds.driverState() === 'unknown' ? t('Unable to verify installation') : t('Driver not installed')}`
          : html`<span class="ok">✓</span>`}
      </div>
    </div>

    <div class="field">
      <div class="title">${t('Driver enabled')}</div>
      <div class="control">
        ${!cfg ? html`<span class="warn">${t('Unknown')}</span>` : this.driverEnablePrompt
          ? html`<span class="warn">⚠</span> ${t('Driver not enabled')}
            ${sds.steamVRinstalled() ? html`<button type="button" ?disabled=${sds.installingDriver()} @click=${this.enableDriver}>${t('Enable Driver')}</button>` : html``}`
          : html`<span class="ok">✓</span>`}
      </div>
    </div>

    <div class="field">
      <div class="title">${t('Editable driver settings')}</div>
      <div class="control">
        ${!sds.settingFileInited()
          ? html`<span class="warn">⚠</span> ${t('Driver settings are missing or could not be loaded')}
            ${sds.driverInstalled() ? html`<button type="button" ?disabled=${sds.installingDriver()} @click=${() => sds.checkDriverInstalled()}>${t('Retry')}</button>` : html``}`
          : html`<span class="ok">✓</span>`}
      </div>
    </div>

    <div class="field">
      <div class="title">${t('Driver settings valid')}</div>
      <div class="control">
        ${this.ctx.dss.readFileError()
          ? html`<span class="warn">⚠</span> ${t('Driver settings are not valid')}
            <span class="read-error">${this.ctx.dss.readFileError()?.message}</span>
            ${sds.driverInstalled() ? html`<button type="button" @click=${() => sds.resetDriverSetting()}>${t('Reset Setting')}</button>` : html``}`
          : html`<span class="ok">✓</span>`}
      </div>
    </div>`]);
  }
}

@customElement('app-system-ready')
export class SystemReady extends BasePage {
  static styles = css`
    ${interactiveStyles}
    :host { display: block; }
  `;

  render() {
    const sds = this.ctx.sds;
    if (sds.systemReady()) {
      return html`<slot></slot>`;
    }
    return html`<app-driver-troubleshooter .ctx=${this.ctx}></app-driver-troubleshooter>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-system-ready': SystemReady;
    'app-driver-troubleshooter': DriverTroubleshooter;
  }
}
