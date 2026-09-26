// Driver enable / lockout banner, ported from
// src/app/utilities/driver-enable-banner/driver-enable-banner.component.{ts,html}.
// Shown on every page so a user migrating from the stock
// CustomHeadsetOpenVR install sees the switch prompt on any tab.
// The vendor lockout swap (disable neutral, enable vendor) keeps going
// through SystemDiagnosticService.updateSteamVRSettings, i.e. the native
// settings journal on Galaxy builds.
import { html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { css } from 'lit';
import { interactiveStyles } from '../ui/shared-styles';
import { signal } from '../reactive';
import { BasePage } from './page-base';
import { galaxyXRDriverName, vendor } from '../environment';
import { t } from '../locale/i18n';
import { statusMessage } from '../ui/presentation';

@customElement('app-driver-enable-banner')
export class DriverEnableBanner extends BasePage {
  static styles = css`
    ${interactiveStyles}
    :host { display: block; }
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
      ? statusMessage('warning', t('Driver status is unknown'), t('Use Check Settings on Setup to try again.'),
        html`<a href="#/setup">${t('Open Setup')}</a>`)
      : html``;
    const neutral = this.isVendor && sds.getNeutralDriverEnabled(settings);
    const blocked = sds.isDriverBlocked(settings, galaxyXRDriverName);
    if (sds.getSteamVRDriverEnableState(settings, galaxyXRDriverName) && !neutral) return html``;
    return statusMessage('warning', neutral ? t('Another driver is active') : t('This driver is disabled'),
      neutral ? t('Switch from CustomHeadsetOpenVR to apply these settings, then restart SteamVR. You can switch back from its app.')
        : t('Enable this driver and restart SteamVR to apply your settings.'), html`
        ${neutral
          ? html`<fluent-button appearance="primary" ?disabled=${this.busy || sds.installingDriver() || this.ctx.checks.checking()} @click=${() => this.enableDriver()}>${t('Switch to the Galaxy XR driver')}</fluent-button>`
          : html`<fluent-button appearance="primary" ?disabled=${this.busy || sds.installingDriver() || this.ctx.checks.checking()} @click=${() => this.enableDriver()}>${t('Enable')}</fluent-button>`}
        ${blocked ? html`<fluent-button appearance="outline" ?disabled=${this.busy || sds.installingDriver() || this.ctx.checks.checking()} @click=${() => this.unblockAllDrivers()}>${t('Unblock All')}</fluent-button>` : html``}
      `);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-driver-enable-banner': DriverEnableBanner;
  }
}
