// Dialog service, ported from src/app/services/dialog.service.ts + the
// Angular Material confirm/message components. Same public API:
//   confirm(title, message, yesText?, yesClass?): Promise<true | undefined>
//     resolves `true` on Yes, `undefined` on Cancel/Escape
//   message(title, message): Promise<void>
//     resolves on Ok/Escape
// Implemented with the native <dialog> element (focus trap, Escape ->
// cancel, backdrop) styled with Fluent tokens; the pinned Fluent v3 dialog
// wraps HTMLDialogElement internally anyway, so behavior is equivalent.
import { t } from '../locale/i18n';

interface Pending {
  resolve: (value: unknown) => void;
}

export class DialogService {
  private host: HTMLElement | null = null;
  private pending: Pending | null = null;

  private ensureHost(): HTMLElement {
    if (this.host && document.body.contains(this.host)) return this.host;
    const host = document.createElement('div');
    host.id = 'app-dialog-host';
    document.body.appendChild(host);
    this.host = host;
    return host;
  }

  private openDialog(title: string, message: string, actions: { label: string; value: unknown; primary?: boolean; danger?: boolean }[]): Promise<unknown> {
    return new Promise<unknown>(resolve => {
      const host = this.ensureHost();
      const dialog = document.createElement('dialog');
      dialog.className = 'app-dialog';
      const h2 = document.createElement('h2');
      h2.textContent = title;
      const p = document.createElement('p');
      p.textContent = message;
      p.className = 'app-dialog-message';
      const actionsEl = document.createElement('div');
      actionsEl.className = 'app-dialog-actions';
      for (const action of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = action.label;
        if (action.primary) button.className = 'app-dialog-btn primary';
        if (action.danger) button.className = 'app-dialog-btn danger';
        if (!action.primary && !action.danger) button.className = 'app-dialog-btn';
        button.addEventListener('click', () => this.finish(dialog, resolve, action.value));
        actionsEl.appendChild(button);
      }
      dialog.append(h2, p, actionsEl);
      host.appendChild(dialog);
      this.pending = { resolve };
      dialog.showModal();
      dialog.addEventListener('cancel', event => { event.preventDefault(); this.finish(dialog, resolve, undefined); });
      dialog.addEventListener('close', () => {
        if (this.pending) {
          // closed without a button (e.g. external close): resolve like cancel
          this.finish(dialog, resolve, undefined);
        }
      });
      // Messages focus OK; confirmations focus Cancel, not the destructive action.
      ((actionsEl.querySelector('.primary') as HTMLElement | null) ?? (actionsEl.firstElementChild as HTMLElement | null))?.focus();
    });
  }

  private finish(dialog: HTMLDialogElement, resolve: (v: unknown) => void, value: unknown) {
    if (this.pending && this.pending.resolve === resolve) {
      this.pending = null;
    }
    resolve(value);
    if (dialog.open) dialog.close();
    dialog.remove();
  }

  async confirm(title: string, message: string, yesText?: string, yesClass?: string): Promise<true | undefined> {
    const yes = yesText ?? t('Yes');
    const danger = yesClass === 'danger';
    const result = await this.openDialog(title, message, [
      { label: t('Cancel'), value: undefined },
      { label: yes, value: true, danger },
    ]);
    return result === true ? true : undefined;
  }

  async message(title: string, message: string): Promise<void> {
    await this.openDialog(title, message, [
      { label: t('Ok'), value: undefined, primary: true },
    ]);
  }
}
