import { describe, expect, it } from 'vitest';
import { encoderTapStatus } from './encoder-tap-status';
import type { DriverRuntimeStatus } from '../platform/tauri';

const runtime: DriverRuntimeStatus = { state: 'headset-connected', detail: '', steamvrRunning: true,
  driverInitialized: true, headsetConnected: true, driverVersion: '1.3.0', serverPid: 42, checkedAt: 10000,
  encoderTap: { state: 'disabled', configPath: 'settings.json', modulePath: 'driver.dll' } };
describe('NVENC OFF runtime evidence', () => {
  it('requires saved OFF and fresh initialized process evidence', () => {
    expect(encoderTapStatus(false, runtime, 12000)).toBe('confirmed-off');
    expect(encoderTapStatus(true, runtime, 12000)).toBe('on');
    expect(encoderTapStatus(false, undefined, 12000)).toBe('waiting');
    for (const change of [{driverInitialized:false}, {steamvrRunning:false}, {serverPid:null},
      {checkedAt:1000}, {checkedAt:15000}, {encoderTap:null}, {encoderTap:{...runtime.encoderTap!,state:'enabled' as const}}]) {
      expect(encoderTapStatus(false, {...runtime,...change}, 12000)).toBe('waiting');
    }
  });
  it('does not claim live restored parameters for an already hooked process', () => {
    expect(encoderTapStatus(false, {...runtime, encoderTap:{...runtime.encoderTap!,state:'restart-required'}}, 12000))
      .toBe('restart-required');
  });
});
