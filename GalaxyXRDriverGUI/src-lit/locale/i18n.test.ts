import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, t } from './i18n';

afterEach(() => setLocale('en-US', {}));

describe('catalog whitespace lookup', () => {
  const source = 'Restore defaults?\n\nSaved profiles are kept.';
  const normalized = 'Restore defaults? Saved profiles are kept.';

  it('finds normalized catalog keys for multiline dialog text', () => {
    setLocale('ja', { [normalized]: 'Translated dialog' });
    expect(t(source)).toBe('Translated dialog');
  });

  it('prefers an exact source entry over its normalized fallback', () => {
    setLocale('ja', { [source]: 'Exact translation', [normalized]: 'Normalized translation' });
    expect(t(source)).toBe('Exact translation');
  });

  it('preserves untranslated paragraph formatting, including the English identity map', () => {
    setLocale('ja', {});
    expect(t(source)).toBe(source);
    setLocale('en-US', { [normalized]: normalized });
    expect(t(source)).toBe(source);
  });

  it('applies parameters after normalized lookup', () => {
    setLocale('ja', { 'Saved {count} profiles. Keep them?': '{count} profiles translated' });
    expect(t('Saved {count} profiles.\n\nKeep them?', { count: 3 })).toBe('3 profiles translated');
  });
});
