export const ROUTES = ['driver-settings', 'distortion-profile', 'stream-frame', 'app-settings', 'about'] as const;
export type Route = (typeof ROUTES)[number];
export type InstallationState = 'checking' | 'installed' | 'not-installed' | 'unknown';

/** Keep an already verified installation visible during a repeat check. */
export function driverAvailable(version: string | undefined, state: InstallationState): boolean {
  return !!version && (state === 'installed' || state === 'checking');
}

export function visibleRoutes(available: boolean): readonly Route[] {
  return available ? ROUTES : ['app-settings'];
}

export function parseRoute(hash: string): Route {
  const value = hash.replace(/^#\/?/, '').replace(/^\/+/, '');
  return (ROUTES as readonly string[]).includes(value) ? value as Route : 'driver-settings';
}

export function permittedRoute(requested: Route, available: boolean): Route {
  return available || requested === 'app-settings' ? requested : 'app-settings';
}
