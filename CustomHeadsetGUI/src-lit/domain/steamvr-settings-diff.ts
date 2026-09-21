// SteamVR settings.vrjson diff — pure logic, ported from
// src/app/services/steamvr-settings-diff.ts (Angular era).
// Sends only changed keys to the backend, which merges them into a fresh file
// under the native driver's journal mutex, preserving independent SteamVR
// updates. Kept framework-free (no Tauri imports) so
// tools/Test-SteamVRSettingsDiff.cjs can transpile and run it in plain Node.
export interface SteamVRSettingChange {
    section: string;
    key: string;
    present: boolean;
    value?: unknown;
}
export function steamVRSettingsDiff(before: Record<string, any>, after: Record<string, any>): SteamVRSettingChange[] {
  const changes: SteamVRSettingChange[] = [];
  for (const section of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldSection = Object.prototype.hasOwnProperty.call(before, section) ? before[section] : {};
    const newSection = Object.prototype.hasOwnProperty.call(after, section) ? after[section] : {};
    if (JSON.stringify(oldSection) === JSON.stringify(newSection)) continue;
    if (oldSection === null || typeof oldSection !== 'object' || Array.isArray(oldSection)
      || newSection === null || typeof newSection !== 'object' || Array.isArray(newSection)) {
      throw new Error(`SteamVR section ${section} must be an object`);
    }
    for (const key of new Set([...Object.keys(oldSection), ...Object.keys(newSection)])) {
      const existed = Object.prototype.hasOwnProperty.call(oldSection, key);
      const present = Object.prototype.hasOwnProperty.call(newSection, key);
      if (existed !== present || JSON.stringify(oldSection[key]) !== JSON.stringify(newSection[key])) {
        changes.push({ section, key, present, ...(present ? { value: newSection[key] } : {}) });
      }
    }
  }
  return changes;
}
