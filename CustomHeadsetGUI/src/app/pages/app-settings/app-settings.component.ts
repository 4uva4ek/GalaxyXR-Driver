import { Component, effect, inject } from '@angular/core';
import { AppSettingService } from '../../services/app-setting.service';
import { AppSetting } from '../../services/JsonFileDefines';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DriverSettingService } from '../../services/driver-setting.service';
import { driverDefaults } from '../../services/driver-defaults';
@Component({
  selector: 'app-app-settings',
  imports: [CommonModule, MatSelectModule, FormsModule, MatDividerModule,MatSlideToggleModule],
  templateUrl: './app-settings.component.html',
  styleUrl: './app-settings.component.scss'
})
export class AppSettingsComponent {
  public driverSettings = inject(DriverSettingService);
  settings?: AppSetting;
  get imageEnhancements(): boolean { return !!this.driverSettings.values()?.streamFrame?.enable; }
  setImageEnhancements(enabled: boolean) {
    const current = this.driverSettings.values();
    if (!current) return;
    const next = structuredClone(current);
    next.streamFrame ??= structuredClone(driverDefaults.streamFrame!);
    next.streamFrame.enable = enabled;
    this.driverSettings.save(next);
  }
  constructor(private appSettingService: AppSettingService) {
    effect(() => {
      this.settings = appSettingService.values();
    })
  }
  saveConfigSettings() {
    if (this.settings) {
      this.appSettingService.save(this.settings);
    }
  }
}
