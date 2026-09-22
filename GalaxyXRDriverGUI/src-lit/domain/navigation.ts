// Canonical tab order (2026-09-22): Driver Settings, Image Settings,
// Distortion Profile, App Settings, Setup, About. Installation only hides
// driver-specific pages; it never reorders the remaining tabs.
export const ROUTES = ['driver-settings', 'stream-frame', 'distortion-profile', 'app-settings', 'setup', 'about'] as const;
export type Route = (typeof ROUTES)[number];
export type InstallationState = 'checking' | 'installed' | 'not-installed' | 'unknown';
const ALWAYS_VISIBLE: readonly Route[] = ['app-settings', 'setup', 'about'];

/** Keep an already verified installation visible during a repeat check. */
export function driverAvailable(version: string | undefined, state: InstallationState): boolean {
  return !!version && (state === 'installed' || state === 'checking');
}

export function visibleRoutes(available: boolean): readonly Route[] {
  return available ? ROUTES : ROUTES.filter(route => ALWAYS_VISIBLE.includes(route));
}

/** Landing page (2026-09-22): Setup before the driver is installed,
 * Driver Settings once it is installed. */
export function defaultRoute(available: boolean): Route {
  return available ? 'driver-settings' : 'setup';
}

export function parseRoute(hash: string, available: boolean): Route {
  const value = hash.replace(/^#\/?/, '').replace(/^\/+/, '');
  return (ROUTES as readonly string[]).includes(value) ? value as Route : defaultRoute(available);
}

export function permittedRoute(requested: Route, available: boolean): Route {
  return available || ALWAYS_VISIBLE.includes(requested) ? requested : 'setup';
}
