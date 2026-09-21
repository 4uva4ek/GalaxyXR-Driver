// Pure inspection helpers: never coerce "false" or a missing read into a boolean.
export interface BooleanSettingCheck {
  key: string;
  enabled: boolean;
  source: 'settings.json' | 'gui-settings.json';
  origin: 'stored' | 'default';
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateBooleanSettings(stored: unknown, defaults: unknown, prefix = ''): void {
  if (!record(stored) || !record(defaults)) return;
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!Object.hasOwn(stored, key)) continue;
    const value = stored[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof fallback === 'boolean' && typeof value !== 'boolean') {
      throw new Error(`${path} must be a JSON boolean (true or false), not ${JSON.stringify(value)}`);
    }
    // Null/array parents must not hide an entire group of boolean settings.
    if (record(fallback)) {
      if (!record(value)) throw new Error(`${path} must be a JSON object`);
      validateBooleanSettings(value, fallback, path);
    }
  }
}

export function inspectBooleanSettings(
  effective: unknown, stored: unknown, source: BooleanSettingCheck['source'], prefix = '',
): BooleanSettingCheck[] {
  if (!record(effective)) return [];
  const checks: BooleanSettingCheck[] = [];
  for (const [key, value] of Object.entries(effective)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const original = record(stored) ? stored[key] : undefined;
    if (typeof value === 'boolean') {
      checks.push({ key: path, enabled: value, source, origin: typeof original === 'boolean' ? 'stored' : 'default' });
    } else if (record(value)) {
      checks.push(...inspectBooleanSettings(value, original, source, path));
    }
  }
  return checks.sort((a, b) => a.key.localeCompare(b.key));
}
