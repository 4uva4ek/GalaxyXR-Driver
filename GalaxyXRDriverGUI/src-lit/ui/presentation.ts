import { html, svg, nothing, type TemplateResult } from 'lit';

export type StatusIntent = 'info' | 'success' | 'warning' | 'error';

/** Shared presentation (2026-09-26): status stays readable without color. */
export function pageIntro(title: string, subtitle: string): TemplateResult {
  return html`<header class="page-intro"><h1>${title}</h1><p>${subtitle}</p></header>`;
}

export function statusIcon(intent: StatusIntent): TemplateResult {
  return html`<svg class="status-icon" slot="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    ${intent === 'warning'
      ? svg`<path d="M10 2 19 18H1Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 7v5m0 2v1" stroke="currentColor" stroke-width="1.8"/>`
      : svg`<circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
          ${intent === 'success' ? svg`<path d="m6 10 3 3 5-6" fill="none" stroke="currentColor" stroke-width="1.8"/>`
            : intent === 'error' ? svg`<path d="m7 7 6 6m0-6-6 6" stroke="currentColor" stroke-width="1.8"/>`
            : svg`<path d="M10 9v5m0-8v1" stroke="currentColor" stroke-width="1.8"/>`}`}
  </svg>`;
}

export function statusMessage(intent: StatusIntent, title: string, body?: string | TemplateResult, action?: TemplateResult): TemplateResult {
  return html`<fluent-message-bar class="status-message" intent=${intent} layout="multiline"
    role=${intent === 'error' ? 'alert' : 'status'}>
    ${statusIcon(intent)}<div><strong class="status-title">${title}</strong>
      ${body ? html`<div class="status-body">${body}</div>` : nothing}</div>
    ${action ? html`<div slot="actions" class="status-actions">${action}</div>` : nothing}
  </fluent-message-bar>`;
}
