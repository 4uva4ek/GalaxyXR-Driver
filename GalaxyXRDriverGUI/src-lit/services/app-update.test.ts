import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVersion } from '@tauri-apps/api/app';
import { signal } from '../reactive';
import { AppUpdateService } from './app-update';
import type { SystemDiagnosticService } from './system-diagnostic';

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn() }));

const latestEndpoint = 'https://api.github.com/repos/AngelDark92/GalaxyXR-Driver/releases/latest';
const releaseUrl = 'https://github.com/AngelDark92/GalaxyXR-Driver/releases/tag/v1.3.0';
const fetchMock = vi.fn<typeof fetch>();

function release(tag = 'v1.3.0') {
  return new Response(JSON.stringify({ tag_name: tag, html_url: releaseUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createService(installedVersion?: string) {
  const driverInstalled = signal<string | undefined>(installedVersion);
  const service = new AppUpdateService({ driverInstalled } as unknown as SystemDiagnosticService);
  return { service, driverInstalled };
}

beforeEach(() => {
  vi.mocked(getVersion).mockResolvedValue('1.2.2');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AppUpdateService release check', () => {
  it('checks this driver repository and exposes the newer v-prefixed release URL', async () => {
    fetchMock.mockResolvedValueOnce(release());
    const { service } = createService();

    const result = await service.checkUpdate();

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(latestEndpoint, expect.objectContaining({
      signal: expect.any(AbortSignal),
      headers: { accept: 'application/vnd.github+json' },
    }));
    expect(result).toMatchObject({
      fetchSuccess: true,
      currentVersion: '1.2.2',
      latestVersion: 'v1.3.0',
      updateAvailable: true,
      url: releaseUrl,
    });
    expect(service.updateInfo()).toEqual(result);
  });

  it.each(['v1.2.2', 'v1.2.1'])('does not advertise an update for release %s', async tag => {
    fetchMock.mockResolvedValueOnce(release(tag));
    const { service } = createService();

    expect(await service.checkUpdate()).toMatchObject({
      fetchSuccess: true,
      latestVersion: tag,
      updateAvailable: false,
    });
  });

  it.each(['HTTP failure', 'network rejection'])('reports %s and allows another check', async failure => {
    if (failure === 'HTTP failure') {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    } else {
      fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'));
    }
    fetchMock.mockResolvedValueOnce(release());
    const { service } = createService();

    expect(await service.checkUpdate()).toMatchObject({
      fetchSuccess: false,
      updateAvailable: false,
      latestVersion: 'Unknown',
      url: '',
    });
    expect(await service.checkUpdate()).toMatchObject({ fetchSuccess: true, updateAvailable: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts a stalled request after ten seconds, clears its timer, and permits retry', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
      requestSignal = init?.signal ?? undefined;
      requestSignal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
    }));
    fetchMock.mockResolvedValueOnce(release());
    const { service } = createService();
    const check = service.checkUpdate();
    await vi.advanceTimersByTimeAsync(0);

    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(requestSignal?.aborted).toBe(true);
    expect(await check).toMatchObject({ fetchSuccess: false, updateAvailable: false });
    expect(vi.getTimerCount()).toBe(0);
    expect(await service.checkUpdate()).toMatchObject({ fetchSuccess: true });
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one pending request between construction and concurrent manual checks', async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveFetch = resolve; }));
    const { service } = createService();
    const first = service.checkUpdate();
    const second = service.checkUpdate();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(release());
    const results = await Promise.all([first, second]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].fetchSuccess).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps installed-driver availability independent from GitHub update availability', async () => {
    fetchMock.mockResolvedValueOnce(release('v1.2.2'));
    const { service, driverInstalled } = createService('1.2.1');
    await service.checkUpdate();
    await Promise.resolve();

    expect(service.updateInfo()).toMatchObject({ updateAvailable: false, installAvailable: true });
    driverInstalled.set('1.2.2');
    await Promise.resolve();
    expect(service.updateInfo()).toMatchObject({ updateAvailable: false, installAvailable: false });

    fetchMock.mockResolvedValueOnce(release());
    await service.checkUpdate();
    await Promise.resolve();
    expect(service.updateInfo()).toMatchObject({ updateAvailable: true, installAvailable: false });
  });
});
