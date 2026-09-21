// Page base + shared field layout for the Lit frontend (2026-09-20 migration).
// Every page subscribes once to the application signals it renders and asks
// Lit to re-render on change — the same coarse change-detection the Angular
// templates had, without per-binding subscriptions. Services live for the
// application (composition root in main.ts); pages only borrow them.
import { LitElement, html, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { css } from 'lit';
import type { AppContext } from '../app-context';
import { t } from '../locale/i18n';
import { interactiveStyles } from '../ui/shared-styles';

/**
 * Shared .field grid + color helpers, ported from src/simple-form.scss.
 * Lit pages render in shadow DOM, so this css is included in each page's
 * `static styles` to reach its shadow root (a plain stylesheet cannot pierce
 * it). Section headers and notes span both columns, as before.
 */
export const fieldStyles = css`
  ${interactiveStyles}
  .field {
    position: relative;
    display: grid;
    flex-shrink: 0;
    grid-template-columns: minmax(13rem, 22rem) minmax(0, 1fr);
    gap: 0 0.5rem; padding: 0.5rem 0;
    min-height: 3rem;
    border-bottom: 1px solid var(--colorNeutralStroke1, rgba(0, 0, 0, 0.15));
  }
  .field:last-child { border-bottom: none; }
  .field .title {
    display: flex;
    align-items: center;
    position: relative;
    user-select: none;
    padding-right: 1rem;
    gap: 0.25rem;
  }
  .field .title::after {
    content: '';
    top: 10%;
    height: 80%;
    border-right: 1px solid var(--colorNeutralStroke1, rgba(0, 0, 0, 0.15));
    position: absolute;
    right: 0.5rem;
  }
  .field .section-title {
    display: flex;
    align-items: center;
    justify-content: center;
    grid-column: span 2;
    position: relative;
    user-select: none;
    background: linear-gradient(90deg, transparent, var(--colorNeutralBackground3, rgba(0, 0, 0, 0.06)) 30% 70%, transparent);
    padding-right: 1rem;
  }
  .field .section-title.collapsible { cursor: pointer; }
  .field .note { grid-column: span 2; padding: 0.5rem 1rem; font-size: 95%; opacity: 0.85; }
  .field .note p { margin: 0.5rem; }
  .field .value { width: 10%; }
  .field .control { min-width: 0; display: flex; align-items: center; flex: 1 1 auto; gap: 0.5rem; flex-wrap: wrap; }
  .field .control .wide { flex: 1 1 auto; min-width: 0; }
  .field .control > * { max-width: 100%; }
  .chevron { display: inline-block; margin-left: 8px; }
  .chevron.closed { transform: rotate(-90deg); }
  @media (max-width: 700px) {
    .field { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .field .title::after { display: none; }
    .field .section-title, .field .note { grid-column: 1; }
  }
  .primary-color { color: var(--colorBrandForeground1, #1a73e8); }
  .warn-color { color: var(--colorPaletteDarkOrangeForeground1, #a85000); }
`;

export class BasePage extends LitElement {
  // NOTE: subclasses declare `static styles = [fieldStyles, ...]`. BasePage
  // itself keeps LitElement's `styles` type (CSSResult | CSSResult[]) so the
  // array form in every page is accepted.
  @property({ attribute: false }) ctx!: AppContext;

  private _unsubs: Array<() => void> = [];

  connectedCallback(): void {
    super.connectedCallback();
    const notify = () => this.requestUpdate();
    const c = this.ctx;
    if (!c) return;
    this._unsubs.push(
      c.dss.values.subscribe(notify),
      c.dss.readFileError.subscribe(notify),
      c.appSetting.readFileError.subscribe(notify),
      c.dss.writeFileError.subscribe(notify),
      c.appSetting.writeFileError.subscribe(notify),
      c.sds.driverState.subscribe(notify),
      c.sds.driverCheckError.subscribe(notify),
      c.sds.steamVRsettingsError.subscribe(notify),
      c.checks.checking.subscribe(notify),
      c.checks.report.subscribe(notify),
      c.dis.values.subscribe(notify),
      c.appSetting.values.subscribe(notify),
      c.sds.systemReady.subscribe(notify),
      c.sds.steamVrConfig.subscribe(notify),
      c.sds.installingDriver.subscribe(notify),
      c.sds.driverInstalled.subscribe(notify),
      c.sds.steamVRinstalled.subscribe(notify),
      c.sds.driverVersionMismatch.subscribe(notify),
      c.aus.updateInfo.subscribe(notify),
      c.galaxy.revision.subscribe(notify),
      c.galaxy.sections.subscribe(notify),
      c.galaxy.matrixText.subscribe(notify),
      c.galaxy.matrixError.subscribe(notify),
      c.galaxy.shareText.subscribe(notify),
      c.galaxy.shareStatus.subscribe(notify),
    );
  }

  disconnectedCallback(): void {
    for (const unsub of this._unsubs) unsub();
    this._unsubs = [];
    super.disconnectedCallback();
  }

  protected section(name: string): boolean {
    const sections = this.ctx.galaxy.sections() as Record<string, boolean>;
    return !!sections[name];
  }

  protected toggleSection(name: string): void {
    const current = this.ctx.galaxy.sections();
    const next = { ...(current as unknown as Record<string, boolean>) };
    next[name] = !next[name];
    this.ctx.galaxy.sections.set(next as unknown as typeof current);
  }
}

export interface FieldReset {
  can: boolean;
  on: () => void;
}

/**
 * One settings row, matching the old .field grid (22rem title | control).
 * Section headers and notes span both columns, as before.
 */
export function fieldRow(
  title: string | TemplateResult,
  control: TemplateResult,
  opts?: { tip?: string; reset?: FieldReset; wide?: boolean }
): TemplateResult {
  return html`<div class="field">
    <div class="title">
      <span>${title}</span>
      ${opts?.tip ? html`<app-field-tip .info=${opts.tip} .label=${typeof title === 'string' ? title : ''}></app-field-tip>` : html``}
      ${opts?.reset ? html`<app-reset .canReset=${opts.reset.can} @resetClick=${opts.reset.on}></app-reset>` : html``}
    </div>
    <div class="control ${opts?.wide ? 'wide' : ''}">${control}</div>
  </div>`;
}

export function noteRow(text: string | TemplateResult): TemplateResult {
  return html`<div class="field"><div class="note">${text}</div></div>`;
}

export function sectionRow(title: string, open: boolean, level: number, onToggle: () => void): TemplateResult {
  return html`<div class="field">
    <div class="section-title collapsible level-${level}" role="button" tabindex="0" aria-expanded=${String(open)}
      @click=${onToggle}
      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}>
      <span>${title}</span><span class="chevron ${open ? '' : 'closed'}">▾</span>
    </div>
  </div>`;
}
