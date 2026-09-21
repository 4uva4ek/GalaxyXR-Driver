// Driver enable / lockout banner, ported from
// src/app/utilities/driver-enable-banner/driver-enable-banner.component.{ts,html}.
// Shown on every page so a user migrating from the stock
// CustomHeadsetOpenVR install sees the switch prompt on any tab.
// The vendor lockout swap (disable neutral, enable vendor) keeps going
// through SystemDiagnosticService.updateSteamVRSettings, i.e. the native
// settings journal on Galaxy builds.
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { customElement } from 'lit/decorators.js';
import { css } from 'lit';
import { interactiveStyles } from '../ui/shared-styles';
import { signal } from '../reactive';
import { BasePage } from './page-base';
import { galaxyXRDriverName, vendor } from '../environment';
import { t } from '../locale/i18n';

@customElement('app-driver-enable-banner')
export class DriverEnableBanner extends BasePage {
  static styles = css`
    ${interactiveStyles}
    :host { display: block; }
    .driver-banner {
      background: var(--colorPaletteYellowBackground1);
      border: 1px solid var(--colorPaletteYellowBorder2);
      color: var(--colorNeutralForeground1);
      border-radius: 6px;
      padding: 8px 14px;
      margin: 8px 0;
    }
    .driver-banner-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem 0; flex-wrap: wrap; }
    .warn { color: var(--colorPaletteDarkOrangeForeground1); }
    .note { opacity: 0.85; font-size: 0.9rem; }
    button { height: 2rem; }
  `;

  readonly isVendor = !!vendor;
  private busy = false;

  private async runAction(action: () => Promise<unknown>): Promise<void> {
    if (this.busy || this.ctx.sds.installingDriver()) return;
    this.busy = true; this.requestUpdate();
    try {
      await action();
      await this.ctx.sds.refreshSteamVRSettings();
    } catch (error) {
      await this.ctx.dialog.message(t('Driver settings could not be changed'), String(error));
    } finally { this.busy = false; this.requestUpdate(); }
  }

  private async enableDriver(): Promise<void> {
    await this.runAction(() => vendor
      ? this.ctx.sds.enableVendorDriverAndDisableNeutral()
      : this.ctx.sds.enableSteamVRDriver(galaxyXRDriverName));
  }

  private async unblockAllDrivers(): Promise<void> {
    await this.runAction(() => this.ctx.sds.unblockAllDrivers());
  }

  render() {
    const sds = this.ctx.sds;
    const settings = sds.steamVrConfig();
    if (!settings) return sds.steamVRsettingsError()
      ? html`<div class="driver-banner" role="status">${t('Driver enablement is unknown. Run the installation and settings check on the About page.')} ${sds.steamVRsettingsError()}</div>`
      : html``;
    const neutral = this.isVendor && sds.getNeutralDriverEnabled(settings);
    const blocked = sds.isDriverBlocked(settings, galaxyXRDriverName);
    if (sds.getSteamVRDriverEnableState(settings, galaxyXRDriverName) && !neutral) return html``;
    return html`<div class="driver-banner">
      <div class="driver-banner-row">
        <span class="warn">⚠</span>
        ${neutral
          ? html`<span>${unsafeHTML(t('The stock CustomHeadsetOpenVR driver currently has the headset.'))} ${unsafeHTML(t('Both drivers are installed, and SteamVR only lets one of them run. Nothing on this page takes effect until you switch.'))}</span>`
          : this.isVendor
            ? html`<span>${unsafeHTML(t('The Galaxy XR driver is disabled in SteamVR.'))} ${unsafeHTML(t('Nothing on this page takes effect until it is enabled.'))}</span>`
            : html`<span>${t("Galaxy XR Companion's driver is disabled")}</span>`}
      </div>
      <div class="driver-banner-row">
        ${neutral
          ? html`<button type="button" ?disabled=${this.busy || sds.installingDriver() || this.ctx.checks.checking()} class="primary" @click=${() => this.enableDriver()}>${t('Switch to the Galaxy XR driver')}</button>
            <span class="note">${t('Disables CustomHeadsetOpenVR and enables this driver. Restart SteamVR afterwards. You can switch back from the other GUI at any time.')}</span>`
          : html`<button type="button" ?disabled=${this.busy || sds.installingDriver() || this.ctx.checks.checking()} class="primary" @click=${() => this.enableDriver()}>${t('Enable')}</button>`}
        ${blocked ? html`<button type="button" ?disabled=${this.busy || sds.installingDriver() || this.ctx.checks.checking()} @click=${() => this.unblockAllDrivers()}>${t('Unblock All')}</button>` : html``}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-driver-enable-banner': DriverEnableBanner;
  }
}
