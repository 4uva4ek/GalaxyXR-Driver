import type { DriverRuntimeStatus } from '../platform/tauri';

/** Saved OFF is not proof of a fresh, unhooked encoder process. */
export function encoderTapStatus(savedEnabled: boolean, runtime: DriverRuntimeStatus | undefined, now = Date.now()):
  'on' | 'waiting' | 'restart-required' | 'confirmed-off' {
  if (savedEnabled) return 'on';
  if (!runtime?.driverInitialized || !runtime.steamvrRunning || !runtime.serverPid
      || now - runtime.checkedAt > 5000 || runtime.checkedAt > now + 2000) return 'waiting';
  if (runtime.encoderTap?.state === 'restart-required') return 'restart-required';
  if (runtime.encoderTap?.state === 'disabled') return 'confirmed-off';
  return 'waiting';
}
