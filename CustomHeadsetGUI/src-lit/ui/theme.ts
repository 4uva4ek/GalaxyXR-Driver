// Fluent v3 needs a complete token theme, including dimensions and typography.
// A color-scheme hint alone cannot style its Shadow DOM controls.
import { setTheme } from '@fluentui/web-components';
import { webDarkTheme, webLightTheme } from '@fluentui/tokens';
import type { AppSetting } from '../domain/types';

export type ColorScheme = AppSetting['colorScheme'];

export function resolveTheme(preference: ColorScheme | undefined, systemDark: boolean): 'dark' | 'light' {
  return preference === 'dark' || preference === 'light'
    ? preference
    : systemDark ? 'dark' : 'light';
}

export function applyTheme(preference: ColorScheme | undefined): void {
  const mode = resolveTheme(preference, window.matchMedia('(prefers-color-scheme: dark)').matches);
  setTheme(mode === 'dark' ? webDarkTheme : webLightTheme);
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  document.documentElement.style.setProperty('--color-scheme', mode);
}
