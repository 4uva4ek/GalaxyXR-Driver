// About page, ported from src/app/pages/about/about.component.{html,ts}
// (Angular era). App version / update check, driver install/uninstall,
// identity cleanup, restart compositor, and the project links.
//
// The Angular component's `driverVersionMismatch` signal is already exposed as
// a computed on the SystemDiagnosticService, so it is read from there. The
// `edidVendorIdOverride -> restartCompositor` effect is re-run in the mounted
// lifecycle (connectedCallback), matching the Angular constructor effect.
import { html, nothing, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { css } from 'lit';
import { BasePage, fieldRow, fieldStyles } from './page-base';
import { t } from '../locale/i18n';
import { signal } from '../reactive';
import { delay } from '../domain/pure';
import { openUrl } from '@tauri-apps/plugin-opener';
import '../ui/controls';
import './system-ready';
import './driver-banner';
import { galaxyXRDriverName } from '../environment';

// The only interpolated catalog unit on this page. The XLIFF source/target use
// an inline `<x id="INTERPOLATION">` placeholder at locale-specific positions,
// so the value is looked up verbatim and the tag is substituted with the real
// version (the `t()` `{name}` path cannot see through the `<x>` tag).
const INSTALL_KEY = 'Install <x id="INTERPOLATION" equiv-text="{{updateInfo.currentVersion}}"/>';

@customElement('app-about-page')
export class AboutPage extends BasePage {
  static styles = [fieldStyles, css`
    :host { display: block; padding: 0 1rem 2rem 1rem; }
    .warn-color { color: var(--colorPaletteDarkOrangeForeground1, #a85000); vertical-align: middle; margin-left: 0.35rem; }
    .primary-color { color: var(--colorBrandForeground1, #0067c0); }
    .btn { border: 1px solid var(--colorNeutralStroke1, #888); background: transparent; border-radius: 4px; padding: 0.25rem 0.75rem; margin: 0.15rem 0.25rem 0.15rem 0; cursor: pointer; font-size: 0.92rem; }
    .btn:hover:not(:disabled) { background: rgba(127, 127, 127, 0.12); }
    .btn:disabled { opacity: 0.5; cursor: default; }
    .icon-btn { border: none; background: transparent; cursor: pointer; padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 1.05rem; line-height: 1; }
    .icon-btn:disabled { opacity: 0.5; cursor: default; }
    .donation-link { display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none; color: var(--colorBrandForegroundLink, #0067c0); margin: 0.2rem 1rem 0.2rem 0; }
    .donation-logo { height: 1.5rem; }
    .check-result, .check-details { margin: 12px 0; padding: 12px 16px; border: 1px solid var(--colorNeutralStroke2); border-radius: 6px; background: var(--colorNeutralBackground1); }
    .check-result p { margin: 6px 0; overflow-wrap: anywhere; }
    .check-error { color: var(--colorPaletteRedForeground1); }
    .check-warning { color: var(--colorPaletteDarkOrangeForeground1); }
    .check-table-scroll { overflow: auto; max-height: 26rem; }
    summary { cursor: pointer; padding: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 0.9em; }
    th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--colorNeutralStroke2); }
    th { position: sticky; top: 0; background: var(--colorNeutralBackground2); }
    .setup-card { margin: 16px 0; padding: 16px 20px; border: 1px solid var(--colorNeutralStroke2);
      border-inline-start: 4px solid var(--colorBrandStroke1); border-radius: 8px; background: var(--colorNeutralBackground1); }
    .setup-card h2 { margin: 0 0 10px; font-size: 1.15rem; }
    .setup-card h3 { margin: 14px 0 6px; font-size: 1rem; }
    .setup-card p { margin: 8px 0; }
    .setup-card .complete { color: var(--colorPaletteGreenForeground1); }
    .setup-card .required { color: var(--colorPaletteDarkOrangeForeground1); }
    .setup-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
    .spin { display: inline-block; animation: about-spin 1s linear infinite; }
    @keyframes about-spin { to { transform: rotate(360deg); } }
  `];

  private checking = signal(false);

  private async checkSettings(): Promise<void> {
    await this.ctx.checks.refresh();
    await this.ctx.startup.refresh();
  }

  private renderSetup(): TemplateResult {
    const { sds, startup } = this.ctx;
    const installed = !!sds.driverInstalled();
    const busy = sds.installingDriver() || this.ctx.checks.checking() || startup.launching();
    const status = startup.status();
    const config = sds.steamVrConfig();
    const enabled = config ? sds.getSteamVRDriverEnableState(config, galaxyXRDriverName) : undefined;
    const initialized = installed && enabled !== false && status?.driverInitialized === true;
    return html`<section class="setup-card" aria-labelledby="setup-title">
      <h2 id="setup-title">${t('Set up your headset')}</h2>
      <h3 class=${installed ? 'complete' : 'required'}>${installed ? '✓' : '1.'} ${t('Install the driver')}</h3>
      <p>${installed ? t('Driver files are installed. The next step verifies that SteamVR can actually run them.')
        : t('Install from this page to make the driver settings tabs available. You can use Clean Settings below before installing.')}</p>
      ${!installed ? html`<div class="setup-actions"><button class="btn primary" type="button" ?disabled=${busy}
        @click=${() => this.installDriver()}>${t('Install Driver')}</button>
        <button class="btn" type="button" ?disabled=${busy} @click=${() => this.checkSettings()}>${t('Check installation')}</button></div>` : nothing}
      <h3 class=${initialized ? 'complete' : 'required'}>${initialized ? '✓' : '2.'} ${t('Start SteamVR and verify the driver')}</h3>
      <p>${t('Starting SteamVR initializes the driver and its runtime settings. Connect your Galaxy XR through Steam Link, then wait here for initialization to be confirmed. Having the driver files installed is not enough.')}</p>
      <div role="status" aria-live="polite" class=${initialized ? 'complete' : 'required'}>
        <strong>${!installed ? t('Install the driver first.') : initialized ? t('Driver initialization verified in SteamVR.')
          : status?.steamvrRunning ? t('SteamVR is open — driver verification is not complete.') : t('Required next step: Start SteamVR.')}</strong>
        ${installed && status ? html`<p>${t(status.detail)}</p>` : nothing}
      </div>
      ${startup.error() ? html`<p class="check-error" role="alert">${startup.error()}</p>` : nothing}
      ${installed && enabled === false ? html`<p class="required">${t('This driver is disabled or blocked in SteamVR. Close SteamVR and enable the driver below before starting it again.')}</p>` : nothing}
      ${installed ? html`<div class="setup-actions">
        <button class="btn primary" type="button" ?disabled=${busy || enabled === false || !!status?.steamvrRunning}
          @click=${() => startup.start()}>${startup.launching() ? t('Starting SteamVR…') : t('Start SteamVR')}</button>
        <button class="btn" type="button" ?disabled=${busy} @click=${() => this.checkSettings()}>${t('Check driver now')}</button>
      </div><p class="note">${t('If SteamVR is already open after an install or reset, close it completely and start it again. When initialization is verified, check the picture and controller tracking in the headset; this app cannot verify those visually for you.')}</p>` : nothing}
      ${!sds.steamVRinstalled() || (installed && (!sds.systemReady() || enabled === false))
        ? html`<app-driver-troubleshooter .ctx=${this.ctx}></app-driver-troubleshooter>` : nothing}
      ${installed ? html`<app-driver-enable-banner .ctx=${this.ctx}></app-driver-enable-banner>` : nothing}
    </section>`;
  }

  private renderSettingsCheck(): TemplateResult {
    const report = this.ctx.checks.report();
    const busy = this.ctx.checks.checking() || this.ctx.sds.installingDriver();
    return html`
      ${fieldRow(t('Installation and settings check'), html`
        <button class="btn primary" type="button" ?disabled=${busy} @click=${() => this.checkSettings()}>
          ${this.ctx.checks.checking() ? t('Checking…') : t('Check installation')}
        </button>`)}
      <div class="field"><div class="note">${t('Reads the configuration files again and synchronizes every setting toggle, including hidden advanced controls. It does not reset settings or restart SteamVR. Missing keys use their defaults; unreadable files are reported as unknown.')}</div></div>
      ${report ? html`
        <div class="check-result" role="status" aria-live="polite">
          <p>${t('Last check')}: ${new Date(report.checkedAt).toLocaleString()} · ${report.checks.length} ${t('boolean settings checked')}</p>
          <p>${t('Driver enabled in SteamVR')}: ${report.driverEnabled === undefined ? t('Unknown') : report.driverEnabled ? t('On') : t('Off')}</p>
          ${report.errors.map(error => html`<p class="check-error">${error}</p>`)}
          ${report.warnings.map(warning => html`<p class="check-warning">${warning}</p>`)}
          <p class="note">${t('This verifies saved configuration, not live hardware behavior. Changes that require a SteamVR restart may not be active yet. Runtime telemetry is the last reported state, not proof that SteamVR is currently running.')}</p>
        </div>
        <details class="check-details"><summary>${t('Show all checked settings')}</summary>
          <div class="check-table-scroll"><table>
            <thead><tr><th>${t('File')}</th><th>${t('Setting')}</th><th>${t('State')}</th><th>${t('Value source')}</th></tr></thead>
            <tbody>${report.checks.map(check => html`<tr>
              <td>${check.source}</td><td><code>${check.key}</code></td>
              <td>${check.enabled ? t('On') : t('Off')}</td>
              <td>${check.origin === 'stored' ? t('Saved value') : t('Default value')}</td>
            </tr>`)}</tbody>
          </table></div>
        </details>
      ` : nothing}`;
  }
  private _checkingUnsub?: () => void;
  private runtimeUnsubs: Array<() => void> = [];
  private runtimeTimer?: ReturnType<typeof setTimeout>;
  private pollGeneration = 0;

  private async pollRuntime(generation: number): Promise<void> {
    if (!this.isConnected || generation !== this.pollGeneration) return;
    if (document.visibilityState !== 'hidden') await this.ctx.startup.refresh();
    if (this.isConnected && generation === this.pollGeneration) {
      this.runtimeTimer = setTimeout(() => { void this.pollRuntime(generation); }, 2000);
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._checkingUnsub = this.checking.subscribe(() => this.requestUpdate());
    this.runtimeUnsubs = [this.ctx.startup.status, this.ctx.startup.error, this.ctx.startup.launching]
      .map(state => state.subscribe(() => this.requestUpdate()));
    void this.pollRuntime(++this.pollGeneration);
  }

  disconnectedCallback(): void {
    ++this.pollGeneration;
    if (this.runtimeTimer !== undefined) clearTimeout(this.runtimeTimer);
    for (const unsubscribe of this.runtimeUnsubs) unsubscribe();
    this.runtimeUnsubs = [];
    this._checkingUnsub?.();
    this._checkingUnsub = undefined;
    super.disconnectedCallback();
  }

  private installText(version: string): string {
    return t(INSTALL_KEY).replace(/<x[^>]*>/g, version);
  }

  private openExternal(event: Event, url: string): Promise<void> {
    event.preventDefault();
    return openUrl(url);
  }

  private async checkUpdate(): Promise<void> {
    this.checking.set(true);
    try {
      const start = performance.now();
      await this.ctx.aus.checkUpdate();
      const wait = 2000 - (performance.now() - start);
      if (wait > 0) await delay(wait);
    } finally {
      this.checking.set(false);
    }
  }

  private async installDriver(): Promise<void> {
    if (await this.ctx.sds.installDriver()) {
      this.ctx.startup.invalidate();
      this.ctx.checks.clear();
      await this.ctx.dialog.message(t('Driver files installed'), t('Next, use Start SteamVR on About and connect your headset through Steam Link. Wait for Driver initialization verified in SteamVR before considering setup complete.'));
    }
  }

  private async cleanSettings(): Promise<void> {
    const report = await this.ctx.sds.cleanSettings(this.ctx.appSetting);
    if (!report) return;
    this.ctx.startup.invalidate();
    this.ctx.checks.clear();
    await this.ctx.checks.refresh();
    const details = `${report.resetFiles.length} files reset or refreshed. ${report.restoredSettings} recorded SteamVR settings restored. ${report.removedIdentityKeys.length} older identity settings removed.`;
    await this.ctx.dialog.message(t('Settings cleaned'), details
      + `\nRecovery backup: ${report.backupPath}`
      + '\nSaved profile files, installed drivers, bindings and room setup were kept. Active profile selections and adjustments were reset.'
      + '\nAfter installation, start SteamVR from About to initialize and verify the driver again.'
      + (report.warnings.length ? `\n\n${report.warnings.join('\n')}` : ''));
  }

  private async uninstallDriver(): Promise<void> {
    if (await this.ctx.sds.uninstallDriver()) {
      const report = this.ctx.sds.lastUninstallReport;
      const details = report
        ? `${report.removedPaths.length} locations removed. ${report.restoredSettings} SteamVR settings restored.`
          + (report.legacyReset ? '\nOlder settings without an original-value record were reset; exact historical values were unavailable.' : '')
          + (report.warnings.length ? `\n${report.warnings.join('\n')}` : '')
        : t('Successfully uninstalled the driver');
      this.ctx.dialog.message(t('Uninstall complete'), details);
    }
  }

  render() {
    const aus = this.ctx.aus;
    const sds = this.ctx.sds;
    const dis = this.ctx.dis;
    const updateInfo = aus.updateInfo();
    const driverInstalled = sds.driverInstalled();
    const steamVRinstalled = sds.steamVRinstalled();
    const installing = sds.installingDriver() || this.ctx.checks.checking();
    const mismatch = sds.driverVersionMismatch();
    const info = dis.values();
    const checking = this.checking();

    const warn = html`<span class="warn-color" role="img" aria-label="warning">⚠</span>`;
    const parts: TemplateResult[] = [];

    // ---- Title + description ----
    parts.push(html`<div class="field"><div class="section-title">Galaxy XR Companion</div></div>`);
    parts.push(html`<div class="field"><div class="note">A standalone SteamVR vendor driver for the Samsung Galaxy XR over Steam Link. It gives the headset and its controllers their native identity, models and bindings in SteamVR, corrects controller tracking and throw velocity, and adds the ability to process the streamed image (color, sharpening, distortion correction) before it is encoded.</div></div>`);

    parts.push(this.renderSetup());
    parts.push(this.renderSettingsCheck());

    // ---- App Version ----
    if (updateInfo) {
      let control: TemplateResult;
      if (updateInfo.updateAvailable) {
        control = html`<span>${updateInfo.currentVersion}</span>
          <a href=${updateInfo.url} @click=${(e: Event) => this.openExternal(e, updateInfo.url)}>${t('New version available')}${warn}</a>`;
      } else {
        control = html`<span>${updateInfo.currentVersion}</span>
          ${!checking && updateInfo.fetchSuccess ? html`<span>${t('(Up to date)')}</span>` : html``}
          <button class="icon-btn" type="button" ?disabled=${checking} @click=${() => this.checkUpdate()}>
            ${checking ? html`<span class="spin primary-color">↻</span>` : html`<span class="primary-color">↻</span>`}
          </button>`;
      }
      parts.push(fieldRow(t('App Version'), control));
    }

    // ---- Installed Driver Version ----
    {
      let control: TemplateResult;
      if (driverInstalled) {
        const install = updateInfo?.installAvailable
          ? html`<button class="btn" type="button" ?disabled=${installing} @click=${() => this.installDriver()}>${this.installText(updateInfo.currentVersion)}</button>${warn}`
          : html``;
        const uninstall = steamVRinstalled
          ? html`<button class="btn" type="button" ?disabled=${installing} @click=${() => this.uninstallDriver()}>${t('Uninstall Driver')}</button>`
          : html``;
        control = html`<span>${driverInstalled}</span>${install}${uninstall}`;
      } else {
        control = html`<span>${sds.driverState() === 'unknown' ? t('Unable to verify installation') : sds.driverState() === 'checking' ? t('Checking…') : t('Not installed')}</span>
          <button class="btn" type="button" ?disabled=${installing} @click=${() => this.installDriver()}>${t('Install')}</button>${warn}
          ${steamVRinstalled ? html`<button class="btn" type="button" ?disabled=${installing} @click=${() => this.uninstallDriver()}>${t('Uninstall Driver')}</button>` : html``}`;
      }
      parts.push(fieldRow(t('Installed Driver Version'), control));
      if (sds.driverCheckError()) parts.push(html`<div class="check-error" role="alert">${sds.driverCheckError()}</div>`);
    }

    // Available before installation as well as after uninstall.
    parts.push(
      fieldRow(t('Settings'), html`<button class="btn" type="button" ?disabled=${installing}
        @click=${() => this.cleanSettings()}>${t('Clean Settings')}</button>`),
      html`<div class="field"><div class="note">${t('Close SteamVR first. Resets settings from every tab to the app/driver defaults and cleans recognized old identity settings. Recorded SteamVR overrides are restored safely; unrelated SteamVR preferences, room setup, bindings, driver enable/block choices and saved profile files are kept. A recovery backup is made first. Available even before installing the driver.')}</div></div>`,
    );

    // ---- Last Run Driver Version ----
    {
      let control: TemplateResult;
      if (info) {
        control = html`<span>${info.driverVersion}</span>
          ${mismatch ? html`${warn}<button class="btn" type="button" ?disabled=${installing} @click=${() => sds.launchSteamVR()}>${t('Launch SteamVR')}</button>` : html``}
          ${updateInfo ? html`<button class="btn" type="button" ?disabled=${installing} @click=${() => this.installDriver()}>${t('Re-Install Driver')}</button>` : html``}`;
      } else {
        control = html`<span>${t('No runtime information')}</span>`;
      }
      parts.push(fieldRow(t('Last reported driver version (not live verification)'), control));
    }

    // ---- Restart Compositor ----
    parts.push(
      fieldRow(t('Restart Compositor'), html`<button class="btn" type="button" ?disabled=${installing} @click=${() => sds.restartCompositor()}>${t('Restart Compositor')}</button>`, {
        tip: t("Restart SteamVR's display process to try to fix display problems without closing the game. Your headset view may briefly disappear; save anything important first.\n\nRestarting the compositor can fix some issues and allows changing various settings like refresh rate without restarting SteamVR or the game."),
      }),
    );

    // ---- Links ----
    parts.push(html`<div class="field"><div class="section-title">${t('Links')}</div></div>`);

    const github = 'https://github.com/timkhronos/CustomHeadsetOpenVrGxR';
    parts.push(
      fieldRow(t('Source Code and Releases'), html`
        <a class="donation-link" href=${github} @click=${(e: Event) => this.openExternal(e, github)}>
          <img src="icons/headset_galaxy_xr_ready_2x.png" alt="Galaxy XR Companion" class="donation-logo">
          ${t('Github Page')}
        </a>
        <a href=${github + '/releases'} @click=${(e: Event) => this.openExternal(e, github + '/releases')}>
          ${t('Releases and changelog')}
        </a>
      `),
      fieldRow(t('Documentation'), html`
        <a href=${github + '/blob/GxR/Docs/StreamFrame.md'} @click=${(e: Event) => this.openExternal(e, github + '/blob/GxR/Docs/StreamFrame.md')}>
          ${t('Setup and image processing guide')}
        </a>
        <a href=${github + '/blob/GxR/Docs/TunerUsage.md'} @click=${(e: Event) => this.openExternal(e, github + '/blob/GxR/Docs/TunerUsage.md')}>
          ${t('Distortion tuner guide')}
        </a>
      `),
      fieldRow(t('Report a Problem'), html`
        <a href=${github + '/issues'} @click=${(e: Event) => this.openExternal(e, github + '/issues')}>
          ${t('Open an issue')}
        </a>
        <div class="note">Attach Steam\\logs\\vrserver.txt. Please report here, not on the original sboys3 repository.</div>
      `),
      fieldRow(t('Based On'), html`
        <a href="https://github.com/sboys3/CustomHeadsetOpenVR" @click=${(e: Event) => this.openExternal(e, 'https://github.com/sboys3/CustomHeadsetOpenVR')}>
          CustomHeadsetOpenVR by sboys3
        </a>
        <div class="note">Galaxy XR Companion is based on the CustomHeadsetOpenVR project by sboys3, with Galaxy XR-specific driver, configuration, and UI work in this fork.</div>
      `),
      fieldRow(t('Galaxy XR icons'), html`<span>Galaxy XR icons were made by <strong>Vilkka</strong>.<br>Based on original Quest Pro iconpack made by <strong>Lux / Hekky</strong>.</span>`),
      fieldRow(t('Donation Links'), html`
        <a class="donation-link" href="https://patreon.com/SBoys3" @click=${(e: Event) => this.openExternal(e, 'https://patreon.com/SBoys3')}>
          <img src="patreon-logo.svg" alt="Patreon" class="donation-logo">
          ${t('Patreon')}
        </a>
        <a class="donation-link" href="https://ko-fi.com/sboys3" @click=${(e: Event) => this.openExternal(e, 'https://ko-fi.com/sboys3')}>
          <img src="ko-fi-logo.svg" alt="Ko-fi" class="donation-logo">
          ${t('Ko-fi')}
        </a>
        <div class="note">Consider supporting sboys3, the author of the original project this fork is built on.</div>
      `),
    );

    return html`${parts}`;
  }
}
