import { Component, effect, inject, signal } from '@angular/core';
import { open } from '@tauri-apps/plugin-shell';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AppUpdateInfoSuccess, AppUpdateService } from '../../services/app-update.service';
import { delay, isNewVersion } from '../../helpers';
import { DriverInfoService } from '../../services/driver-info.service';
import { SystemDiagnosticService } from '../../services/system-diagnostic.service';
import { DialogService } from '../../services/dialog.service';
import { DriverSettingService } from '../../services/driver-setting.service'
import {FieldTipComponent} from '../../utilities/field-tip/field-tip.component'
@Component({
  selector: 'app-about',
  imports: [MatButtonModule, MatIconModule, FieldTipComponent,],
  providers: [],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss'
})
export class AboutComponent {

  public isNewVersion = isNewVersion;
  public checking = signal<boolean>(false)
  public updateInfo = signal<AppUpdateInfoSuccess | undefined>(undefined)
  public dss = inject(DriverSettingService)
  private oldMeganeXEdidVendor: number | undefined = undefined
  private oldDreamAirEidVendor: number | undefined = undefined
  public driverVersionMismatch = signal<boolean>(false);
  constructor(public aus: AppUpdateService, public dis: DriverInfoService, public sds: SystemDiagnosticService, private dialog: DialogService) {
    effect(() => {
      const installedVersion = this.sds.driverInstalled();
      const lastRunVersion = this.dis.values()?.driverVersion;
      this.driverVersionMismatch.set(!!installedVersion && !!lastRunVersion && installedVersion !== lastRunVersion);
    });
    effect(() => {
        let newSettings = this.dss.values()
        
        if(newSettings?.meganeX8K?.edidVendorIdOverride != undefined && this.oldMeganeXEdidVendor != undefined && newSettings.meganeX8K.edidVendorIdOverride != this.oldMeganeXEdidVendor) {
          sds.restartCompositor()
        }
        this.oldMeganeXEdidVendor = newSettings?.meganeX8K?.edidVendorIdOverride
        if(newSettings?.dreamAir?.edidVendorIdOverride != undefined && this.oldDreamAirEidVendor != undefined && newSettings.dreamAir.edidVendorIdOverride != this.oldDreamAirEidVendor) {
          sds.restartCompositor()
        }
        this.oldDreamAirEidVendor = newSettings?.dreamAir?.edidVendorIdOverride
    });
  }
  async openExternal(event: Event, url: string) {
    event.preventDefault()
    await open(url)
  }

  async checkUpdate() {
    this.checking.set(true)
    try {
      const start = performance.now();
      await this.aus.checkUpdate();

      const wait = 2000 - (performance.now() - start);
      if (wait > 0) {
        await delay(wait)
      }
    } finally {
      this.checking.set(false)
    }
  }
  async installDriver() {
    if (await this.sds.installDriver()) {
      this.dialog.message($localize`Install success`, $localize`please launch SteamVR to finish the installation`)
    }
  }
  async cleanOlderIdentitySettings() {
    const report = await this.sds.cleanOlderIdentitySettings();
    if (!report) return;
    const changed = report.removedKeys.length || report.removedSections.length;
    const details = changed
      ? `${report.removedKeys.length} older identity settings and ${report.removedSections.length} empty sections removed.`
      : 'No matching older identity settings were found.';
    await this.dialog.message('Identity cleanup complete', details
      + (report.backupPath ? `\nOriginal settings backup: ${report.backupPath}` : '')
      + (report.warnings.length ? `\n${report.warnings.join('\n')}` : ''));
  }
  async uninstallDriver(){
    if (await this.sds.uninstallDriver()) {
      const report = this.sds.lastUninstallReport;
      const details = report
        ? `${report.removedPaths.length} locations removed. ${report.restoredSettings} SteamVR settings restored.`
          + (report.legacyReset ? '\nOlder settings without an original-value record were reset; exact historical values were unavailable.' : '')
          + (report.warnings.length ? `\n${report.warnings.join('\n')}` : '')
        : $localize`Successfully uninstalled the driver`;
      this.dialog.message($localize`Uninstall complete`, details);
    }
  }
}
