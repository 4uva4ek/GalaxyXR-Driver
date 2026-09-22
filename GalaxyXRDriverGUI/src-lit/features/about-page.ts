// About owns project links, credits, and app version/update information.
// Installation and runtime actions live on the always-visible Setup page.
import { html, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { css } from 'lit';
import { BasePage, fieldRow, sectionHeading, fieldStyles } from './page-base';
import { t } from '../locale/i18n';
import { signal } from '../reactive';
import { delay } from '../domain/pure';
import { openUrl } from '@tauri-apps/plugin-opener';

@customElement('app-about-page')
export class AboutPage extends BasePage {
  static styles = [fieldStyles, css`
    :host { display: block; padding: 0 1rem 2rem 1rem; }
    .warn-color { color: var(--colorPaletteDarkOrangeForeground1, #a85000); vertical-align: middle; margin-left: 0.35rem; }
    .primary-color { color: var(--colorBrandForeground1, #0067c0); }
    .icon-btn { border: none; background: transparent; cursor: pointer; padding: 0.15rem 0.35rem; border-radius: 4px; font-size: 1.05rem; line-height: 1; }
    .icon-btn:disabled { opacity: 0.5; cursor: default; }
    .donation-link { display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none; color: var(--colorBrandForegroundLink, #0067c0); margin: 0.2rem 1rem 0.2rem 0; }
    .donation-logo { height: 1.5rem; }
    .spin { display: inline-block; animation: about-spin 1s linear infinite; }
    @keyframes about-spin { to { transform: rotate(360deg); } }
  `];

  private checking = signal(false);
  private checkingUnsub?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.checkingUnsub = this.checking.subscribe(() => this.requestUpdate());
  }

  disconnectedCallback(): void {
    this.checkingUnsub?.();
    this.checkingUnsub = undefined;
    super.disconnectedCallback();
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

  render() {
    const updateInfo = this.ctx.aus.updateInfo();
    const checking = this.checking();
    const warn = html`<span class="warn-color" role="img" aria-label=${t('Warning')}>⚠</span>`;
    const parts: TemplateResult[] = [sectionHeading(t('Links'))];

    // ---- App Version ----
    if (updateInfo) {
      let control: TemplateResult;
      if (updateInfo.updateAvailable) {
        control = html`<span>${updateInfo.currentVersion}</span>
          <a href=${updateInfo.url} @click=${(e: Event) => this.openExternal(e, updateInfo.url)}>${t('New version available')}${warn}</a>`;
      } else {
        control = html`<span>${updateInfo.currentVersion}</span>
          ${!checking && updateInfo.fetchSuccess ? html`<span>${t('(Up to date)')}</span>` : html``}
          <button class="icon-btn" type="button" aria-label=${t('Check for updates')} title=${t('Check for updates')} ?disabled=${checking} @click=${() => this.checkUpdate()}>
            ${checking ? html`<span class="spin primary-color">↻</span>` : html`<span class="primary-color">↻</span>`}
          </button>`;
      }
      parts.push(fieldRow(t('App Version'), control));
    }

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
        <a href="https://github.com/timkhronos/CustomHeadsetOpenVrGxR" @click=${(e: Event) => this.openExternal(e, 'https://github.com/timkhronos/CustomHeadsetOpenVrGxR')}>
          CustomHeadsetOpenVR by timkhronos
        </a>
        
        <div class="note">Galaxy XR Companion is based on the CustomHeadsetOpenVR project by sboys3, modifications for the Galaxy XR-specific driver by timkhronos and compdoge, configuration, and UI work in this fork.</div>
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

    return this.sectionCardsFor(parts);
  }
}
