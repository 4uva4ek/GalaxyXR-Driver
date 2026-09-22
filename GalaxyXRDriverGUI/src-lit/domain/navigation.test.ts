import { describe, expect, it } from 'vitest';
import { ROUTES, driverAvailable, parseRoute, permittedRoute, visibleRoutes, type InstallationState } from './navigation';

describe('stable tab order and the always-visible Setup page', () => {
  it('keeps the canonical tab order', () => {
    expect([...ROUTES]).toEqual(['driver-settings', 'stream-frame', 'distortion-profile', 'app-settings', 'setup', 'about']);
  });

  it.each([
    ['checking', undefined, false],
    ['not-installed', undefined, false],
    ['unknown', '1.2.3', false],
    ['installed', undefined, false],
    ['installed', '1.2.3', true],
    ['checking', '1.2.3', true],
  ] as Array<[InstallationState, string | undefined, boolean]>)('%s / %s keeps a stable order', (state, version, available) => {
    expect(driverAvailable(version, state)).toBe(available);
    const routes = visibleRoutes(available);
    expect(routes[0]).toBe(available ? 'driver-settings' : 'app-settings');
    expect(routes).toContain('setup');
    expect(routes).toEqual(available
      ? ['driver-settings', 'stream-frame', 'distortion-profile', 'app-settings', 'setup', 'about']
      : ['app-settings', 'setup', 'about']);
    expect(routes.filter(route => ['app-settings', 'setup', 'about'].includes(route)))
      .toEqual(['app-settings', 'setup', 'about']);
  });

  it.each(['', '#/', '#/missing'] as const)('lands on Setup uninstalled and Driver Settings installed for %s', hash => {
    expect(parseRoute(hash, false)).toBe('setup');
    expect(parseRoute(hash, true)).toBe('driver-settings');
  });

  it.each(['app-settings', 'setup', 'about'] as const)('allows %s before and after installation', route => {
    expect(parseRoute(`#/${route}`, false)).toBe(route);
    expect(parseRoute(`#/${route}`, true)).toBe(route);
    expect(permittedRoute(route, false)).toBe(route);
    expect(permittedRoute(route, true)).toBe(route);
  });

  it.each(['driver-settings', 'distortion-profile', 'stream-frame'] as const)('gates %s through Setup without changing valid deep links', route => {
    expect(parseRoute(`#/${route}`, false)).toBe(route);
    expect(parseRoute(`#/${route}`, true)).toBe(route);
    expect(permittedRoute(route, false)).toBe('setup');
    expect(permittedRoute(route, true)).toBe(route);
  });
});
