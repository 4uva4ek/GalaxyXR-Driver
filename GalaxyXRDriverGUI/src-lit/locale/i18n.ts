// Runtime localization for the Lit frontend (2026-09-20 migration).
// Equivalent to the Angular $localize/i18n pipeline for this app:
// the XLIFF catalog under src/locale remains the source of truth, and
// scripts/xlf-to-locale.mjs converts it to per-locale JSON maps at build time.
//
// Keys are the English source strings (the xlf <source> values), so the
// old-ID -> new-ID mapping is the identity map and no translated unit is
// lost. English (en-US) is the identity lookup. Interpolation uses the
// {name} placeholder form; Angular catalog positional {0} placeholders are
// normalized to named slots by the converter where present.
import { signal } from '../reactive';

type LocaleMap = Record<string, string>;

const locale = signal('en-US');
const map = signal<LocaleMap>({});
const listeners = new Set<() => void>();

export function setLocale(code: string, translations: LocaleMap): void {
  locale.set(code);
  map.set(translations);
  for (const fn of [...listeners]) fn();
}

export function getLocale(): string {
  return locale();
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(source: string, params?: Record<string, string | number>): string {
  let out = map()[source] ?? source;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      out = out.split(`{${key}}`).join(String(value));
    }
  }
  return out;
}

// Like t(), but for catalog units that contain inline HTML (datatype="html").
// The result is rendered with Lit unsafeHTML by the caller; safe because the
// catalog is project-owned content, never user input.
export function tHtml(source: string, params?: Record<string, string | number>): string {
  return t(source, params);
}

// reactive handle for Lit components that display translated text
export const localeCode = locale;
