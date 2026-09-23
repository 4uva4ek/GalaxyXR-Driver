// Update info service, ported from src/app/services/app-update.service.ts.
// HttpClient is replaced by fetch with a one-in-flight guard preserved.
// "a newer GUI release exists" (updateAvailable) stays separate from
// "the staged GUI's corresponding driver should be installed"
// (installAvailable = the app is newer than the installed driver).
import { signal } from '../reactive';
import { getVersion } from '@tauri-apps/api/app';
import { isNewVersion } from '../domain/pure';
import { latestReleaseApiUrl } from '../domain/project';
import type { SystemDiagnosticService } from './system-diagnostic';
import { effect } from '../reactive';

export type GitHubRelease = {
  tag_name: string,
  html_url: string
}
export type AppUpdateInfoSuccess = {
  fetchSuccess: boolean;
  latestVersion: string;
  currentVersion: string;
  updateAvailable: boolean;
  installAvailable: boolean;
  url: string;
};
export type AppUpdateInfo = AppUpdateInfoSuccess;

export class AppUpdateService {
  private _updateInfo = signal<AppUpdateInfoSuccess | undefined>(undefined);
  public readonly updateInfo = this._updateInfo.asReadonly()
  constructor(public sds: SystemDiagnosticService) {
    this.checkUpdate();
    effect(() => {
      const driverVersion = this.sds.driverInstalled();
      const updateInfo = this._updateInfo();
      if (driverVersion && updateInfo) {
        const current = updateInfo.currentVersion;
        const next = { ...updateInfo };
        next.installAvailable = isNewVersion(driverVersion, current);
        if (next.installAvailable !== updateInfo.installAvailable) this._updateInfo.set(next);
      }
    });
  }
  private currentCheckTask?: Promise<AppUpdateInfo>;
  private async checkUpdateInternal(): Promise<AppUpdateInfo> {
    // getVersion is a core Tauri API, but a failure here must not escape as
    // an unhandled rejection (the constructor fires this without awaiting);
    // fall back to "Unknown" and let the check report its normal shape.
    let current = "Unknown";
    try {
      current = await getVersion();
    } catch (e) {
      console.warn(e);
    }
    const result: AppUpdateInfoSuccess = {
      fetchSuccess: false,
      latestVersion: "Unknown",
      currentVersion: current,
      updateAvailable: false,
      installAvailable: false,
      url: ""
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(latestReleaseApiUrl, {
        signal: controller.signal,
        headers: { accept: 'application/vnd.github+json' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release: GitHubRelease = await response.json();
      result.fetchSuccess = true;
      result.latestVersion = release.tag_name
      result.updateAvailable = isNewVersion(current, release.tag_name)
      result.url = release.html_url
    } catch (e) {
      console.warn(e)
    } finally {
      this.currentCheckTask = undefined;
      this._updateInfo.set(result);
      clearTimeout(timeout);
    }
    return result;
  }
  async checkUpdate(): Promise<AppUpdateInfo> {
    if (this.currentCheckTask) {
      return this.currentCheckTask;
    }
    return this.currentCheckTask = this.checkUpdateInternal()
  }
}
