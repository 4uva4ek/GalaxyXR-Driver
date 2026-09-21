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
    justify-content: flex-start;
    text-align: start;
    font-weight: 700;
    grid-column: span 2;
    position: relative;
    user-select: none;
    background: linear-gradient(90deg, transparent, var(--colorNeutralBackground3, rgba(0, 0, 0, 0.06)) 30% 70%, transparent);
    padding-right: 1rem;
  }
  .section-field { border-bottom: 0; padding: 0; margin: 1.25rem 0 0.5rem; min-height: 0; }
  .field .section-title {
    margin: 0; min-height: 44px; gap: 10px; padding: 10px 14px;
    width: 100%; border: 1px solid var(--colorNeutralStroke2, #d1d1d1);
    border-inline-start: 4px solid var(--colorBrandStroke1, #0f6cbd);
    border-radius: 6px; background: var(--colorNeutralBackground3, #f5f5f5);
    color: var(--colorNeutralForeground1, #242424); font-size: 1.08rem;
  }
  .section-field.level-1 { margin-inline-start: 20px; margin-top: 0.75rem; }
  .section-field.level-2 { margin-inline-start: 40px; margin-top: 0.65rem; }
  .section-field.level-3 { margin-inline-start: 60px; margin-top: 0.6rem; }
  .field.level-1 .section-title, .field.level-2 .section-title, .field.level-3 .section-title {
    font-size: 1rem; border-inline-start-width: 3px;
    border-inline-start-color: var(--colorNeutralStrokeAccessible, #616161);
    background: var(--colorNeutralBackground2, #fafafa);
  }
  .field .section-title.collapsible { cursor: pointer; }
  .section-label { flex: 1; }
  .mode-notice { padding: 12px 16px; margin: 12px 0; border-inline-start: 4px solid var(--colorBrandStroke1, #0f6cbd); background: var(--colorNeutralBackground3, #f5f5f5); }
  .mode-error { color: var(--colorPaletteRedForeground1, #b00020); }
  .field .note { grid-column: span 2; padding: 0.5rem 1rem; font-size: 95%; opacity: 0.85; }
  .field .note p { margin: 0.5rem; }
  .field .value { width: 10%; }
  .field .control { min-width: 0; display: flex; align-items: center; flex: 1 1 auto; gap: 0.5rem; flex-wrap: wrap; }
  .field .control .wide { flex: 1 1 auto; min-width: 0; }
  .field .control > * { max-width: 100%; }
  .chevron { display: inline-block; width: 1em; flex: 0 0 auto; text-align: center; }
  .chevron.closed { transform: rotate(-90deg); }
  @media (max-width: 700px) {
    .field { grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .field .title::after { display: none; }
    .field .section-title, .field .note { grid-column: 1; }
  }
  .section-card { margin: 1rem 0; border: 1px solid var(--colorNeutralStroke2);
    border-inline-start: 4px solid var(--colorBrandStroke1); border-radius: 8px;
    background: var(--colorNeutralBackground1); min-width: 0; }
  .section-card > .card-heading .section-title { display: flex; align-items: center; gap: 10px;
    width: 100%; min-height: 46px; margin: 0; padding: 12px 16px; border: 0; border-radius: 4px;
    background: var(--colorNeutralBackground3); color: var(--colorNeutralForeground1);
    text-align: start; justify-content: flex-start; font-size: 1.05rem; font-weight: 700; }
  .section-card > .card-heading .collapsible:hover { background: var(--colorNeutralBackground1Hover); }
  .section-card > .card-heading .collapsible:focus-visible { outline: 2px solid var(--colorBrandStroke1); outline-offset: -3px; }
  .section-body { padding: 4px 16px 12px 22px; min-width: 0; }
  .section-body[hidden] { display: none; }
  .section-body > .section-card { margin: 12px 0 8px 12px; border-inline-start-width: 3px;
    border-inline-start-color: var(--colorNeutralStrokeAccessible); }
  .section-body > .section-card > .card-heading .section-title { font-size: 1rem; }
  .section-card .field { grid-template-columns: minmax(12rem, 22rem) minmax(0, 1fr); }
  @media (max-width: 720px) {
    .section-body { padding-inline: 12px; }
    .section-body > .section-card { margin-inline-start: 6px; }
    .section-card .field { grid-template-columns: 1fr; }
    .section-card .field .title::after { display: none; }
    .section-card .field .note { grid-column: 1; }
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
      c.galaxy.imageModeChanging.subscribe(notify),
      c.galaxy.imageModeError.subscribe(notify),
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

/** Section metadata stays with its template: no querying/transplanting DOM nodes,
 * no innerHTML, and no lifecycle changes to nested controls. */
interface SectionSpec { title: string; depth: number; open: boolean; onToggle?: () => void; }
const sectionSpecs = new WeakMap<TemplateResult, SectionSpec>();

export function sectionHeading(title: string, level = 0): TemplateResult {
  const result = html`<h2 class="section-title">${title}</h2>`;
  sectionSpecs.set(result, { title, depth: Math.max(0, Math.min(3, level)), open: true });
  return result;
}

export function sectionRow(title: string, open: boolean, level: number, onToggle: () => void): TemplateResult {
  const result = html`<button type="button" aria-expanded=${String(open)} @click=${onToggle}>${title}</button>`;
  sectionSpecs.set(result, { title, open, onToggle, depth: Math.max(0, Math.min(3, level)) });
  return result;
}

/** Turn the existing ordered rows into nested cards. A heading owns all rows up
 * to the next heading at the same or a shallower depth. Conditional controls
 * remain controlled by their original feature code. Collapsing does not save
 * settings, and reopening uses the same shared state as before. */
export function sectionCards(rows: readonly TemplateResult[]): TemplateResult {
  interface Card { spec: SectionSpec; index: number; children: Array<Card | TemplateResult>; }
  const root: Array<Card | TemplateResult> = [];
  const stack: Card[] = [];
  rows.forEach((row, index) => {
    const spec = sectionSpecs.get(row);
    if (spec) {
      while (stack.length && stack[stack.length - 1].spec.depth >= spec.depth) stack.pop();
      const card: Card = { spec, index, children: [] };
      (stack.length ? stack[stack.length - 1].children : root).push(card);
      stack.push(card);
    } else (stack.length ? stack[stack.length - 1].children : root).push(row);
  });
  const renderItem = (item: Card | TemplateResult): TemplateResult => {
    if (!('spec' in item)) return item;
    const { spec, index } = item;
    const label = `settings-section-${index}`;
    const body = `${label}-body`;
    return html`<section class="section-card level-${spec.depth}" aria-labelledby=${label}>
      <div class="card-heading" role="heading" aria-level=${String(spec.depth + 2)}>
        ${spec.onToggle ? html`<button type="button" class="section-title collapsible" id=${label}
          aria-expanded=${String(spec.open)} aria-controls=${body} @click=${spec.onToggle}>
          <span class="chevron ${spec.open ? '' : 'closed'}" aria-hidden="true">▾</span>
          <span class="section-label">${spec.title}</span>
        </button>` : html`<div class="section-title" id=${label}><span class="section-label">${spec.title}</span></div>`}
      </div>
      <div class="section-body" id=${body} ?hidden=${!spec.open}>${spec.open ? item.children.map(renderItem) : html``}</div>
    </section>`;
  };
  return html`${root.map(renderItem)}`;
}
