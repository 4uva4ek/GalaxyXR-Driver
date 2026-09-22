// System readiness gate, ported from
// src/app/utilities/system-ready/system-ready.component.{ts,html}
// and driver-troubleshooter.component.{ts,html}.
// Shows the page content only when SteamVR + driver + settings are ready;
// otherwise the troubleshooting checklist with the same actions
// (install SteamVR, install/enable driver, retry, reset setting).
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement, property } from 'lit/decorators.js';
import { css } from 'lit';
import { interactiveStyles } from '../ui/shared-styles';
import type { AppContext } from '../app-context';
import { BasePage } from './page-base';
import { galaxyXRDriverName } from '../environment';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getVersion } from '@tauri-apps/api/app';
import { t } from '../locale/i18n';

@customElement('app-driver-troubleshooter')
export class DriverTroubleshooter extends BasePage {
  static styles = css`
    ${interactiveStyles}
    :host { display: block; padding: 1rem; }
    h2 { margin: 0.25rem 0 0.75rem; }
    hr { display: block; height: 1px; background: var(--colorNeutralStroke1, #888); margin: 0.5rem 0; }
    .field { display: grid; grid-template-columns: 22rem 1fr; min-height: 3rem; border-bottom: 1px solid var(--colorNeutralStroke1, rgba(128,128,128,0.4)); align-items: center; }
    .title { padding-right: 1rem; }
    .control { display: flex; align-items: center; gap: 0.5rem; }
    .warn { color: var(--colorPaletteRedForeground1, #b00020); }
    .ok { color: var(--colorPaletteGreenForeground1, #107c10); }
    button { height: 2rem; }
    .read-error { font-size: 0.85rem; opacity: 0.8; }
  `;

  @property({ type: Boolean }) wait = false;
  @property({ type: String }) appVersion = '';
  @property({ type: Boolean }) driverEnablePrompt = false;

  connectedCallback(): void {
    super.connectedCallback();
    getVersion().then(v => this.appVersion = v).catch(() => {});
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
    return html`<h2>${t('System not ready')}</h2>
    <hr>
    ${sds.driverCheckError() ? html`<p class="read-error" role="alert">${sds.driverCheckError()}</p>` : html``}
    <p><a href="#/app-settings">${t('Open App Settings to check installation and settings')}</a></p>

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
          ? html`<span class="warn">⚠</span> ${sds.driverState() === 'unknown' ? t('Unable to verify installation') : t('Driver not installed')}
            ${sds.steamVRinstalled() ? html`<button type="button" ?disabled=${sds.installingDriver()} @click=${() => sds.installDriver()}>${t('Install Driver')}</button>` : html``}`
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
    </div>`;
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
