import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { DriverSettingsComponent } from '../driver-settings/driver-settings.component';
import { StreamFrameComponent } from '../stream-frame/stream-frame.component';
import { DistortionProfileComponent } from '../distortion-profile/distortion-profile.component';
import { AppSettingsComponent } from '../app-settings/app-settings.component';
import { DriverSettingService } from '../../services/driver-setting.service';
import { DriverInfoService } from '../../services/driver-info.service';
import { AppSettingService } from '../../services/app-setting.service';
import { SystemDiagnosticService } from '../../services/system-diagnostic.service';
import { driverDefaults } from '../../services/driver-defaults';
import { AppSetting, Settings } from '../../services/JsonFileDefines';

describe('Galaxy XR settings pages', () => {
  let driver: ReturnType<typeof signal<Settings>>;
  let app: ReturnType<typeof signal<AppSetting>>;
  beforeEach(async () => {
    const initial = structuredClone(driverDefaults);
    initial.streamFrame!.streamFrameSchema = 4;
    initial.streamFrame!.nvencSettingsVersion = 4;
    initial.streamFrame!.enable = false;
    driver = signal(initial);
    app = signal<AppSetting>({ colorScheme: 'dark', updateMode: 'rewrite', advanceMode: false });
    await TestBed.configureTestingModule({
      imports: [DriverSettingsComponent, StreamFrameComponent, DistortionProfileComponent, AppSettingsComponent],
      providers: [
        provideRouter([]), provideNoopAnimations(),
        { provide: DriverSettingService, useValue: { values: driver, save: (v: Settings) => driver.set(structuredClone(v)) } },
        { provide: DriverInfoService, useValue: { values: signal(undefined) } },
        { provide: AppSettingService, useValue: { values: app, save: (v: AppSetting) => app.set({ ...v }) } },
        { provide: SystemDiagnosticService, useValue: {
          systemReady: signal(true), steamVrConfig: signal({}),
          getSteamVRDriverEnableState: () => true, isDriverBlocked: () => false, getNeutralDriverEnabled: () => false,
        } },
      ],
    }).compileComponents();
  });

  it('opens Driver Settings offline with native identity enabled and the moved controls', () => {
    const fixture = TestBed.createComponent(DriverSettingsComponent);
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent;
    expect(content).toContain('Galaxy XR Native Identity');
    expect(content).toContain('Native Render Resolution');
    expect(content).toContain('vrlink Headset Profile');
    expect(content).toContain('Official Controller Input Profile');
    expect(fixture.componentInstance.galaxyXr.nativeIdentity).toBeTrue();
    for (const retired of ['MeganeX', 'Dream Air', 'Custom Shader', 'System not ready']) expect(content).not.toContain(retired);
  });

  it('keeps moved controls out of Galaxy XR and hides advanced headings as well as their fields', () => {
    const fixture = TestBed.createComponent(StreamFrameComponent);
    fixture.componentInstance.sections.encoderAdv = true;
    fixture.componentInstance.sections.encoderDbg = true;
    fixture.componentInstance.sections.advanced = true;
    fixture.componentInstance.sections.debug = true;
    fixture.detectChanges();
    let content = fixture.nativeElement.textContent;
    for (const moved of ['Galaxy XR Native Identity', 'Native Render Resolution', 'Controllers', 'Distortion Correction', 'Share Distortion Profile']) expect(content).not.toContain(moved);
    for (const advanced of ['Encoder', 'Bandwidth Override', 'Sync Timeout', 'Hitch Diagnostics']) expect(content).not.toContain(advanced);
    app.update(v => ({ ...v, advanceMode: true }));
    fixture.detectChanges();
    content = fixture.nativeElement.textContent;
    for (const advanced of ['Encoder', 'Bandwidth Override', 'Sync Timeout', 'Hitch Diagnostics']) expect(content).toContain(advanced);
    app.update(v => ({ ...v, advanceMode: false }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Bandwidth Override');
  });

  it('hides detailed controller tuning in simple mode and restores it in Advanced Mode', () => {
    const fixture = TestBed.createComponent(DriverSettingsComponent);
    fixture.componentInstance.sections.ctrlAdv = true;
    fixture.componentInstance.sections.kalmanAdv = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Controller Bypass');
    expect(fixture.nativeElement.textContent).not.toContain('Kalman CA Tuning');
    expect(fixture.nativeElement.textContent).toContain('Controller Fix Mode');
    app.update(v => ({ ...v, advanceMode: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Controller Bypass');
    expect(fixture.nativeElement.textContent).toContain('Kalman CA Tuning');
  });

  it('gates correction and sharing on the actual image-processing setting without losing values', () => {
    driver().streamFrame!.k1 = 0.012;
    const fixture = TestBed.createComponent(DistortionProfileComponent);
    fixture.componentInstance.sections.share = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Import from text');
    expect(fixture.nativeElement.textContent).not.toContain('Correction Gain');
    driver.update(v => ({ ...v, streamFrame: { ...v.streamFrame!, enable: true } }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Import from text');
    expect(fixture.nativeElement.textContent).toContain('Correction Gain');
    expect(fixture.nativeElement.textContent).not.toContain('Interactive Tuner');
    app.update(v => ({ ...v, advanceMode: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Interactive Tuner');
    driver.update(v => ({ ...v, streamFrame: { ...v.streamFrame!, enable: false } }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Import from text');
    expect(driver().streamFrame!.k1).toBe(0.012);
  });

  it('App Settings master switch changes the same setting consumed by the correction page', () => {
    const fixture = TestBed.createComponent(AppSettingsComponent);
    fixture.detectChanges();
    const field = Array.from(fixture.nativeElement.querySelectorAll('.field') as NodeListOf<HTMLElement>)
      .find(el => el.querySelector('.title')?.textContent?.trim() === 'Image Enhancements')!;
    field.querySelector('button')!.click();
    fixture.detectChanges();
    expect(driver().streamFrame!.enable).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('Default Settings Tab');
    expect(fixture.nativeElement.textContent).not.toContain('Update Mode');
    field.querySelector('button')!.click();
    fixture.detectChanges();
    expect(driver().streamFrame!.enable).toBeFalse();
  });

  it('keeps app controls visible and usable after driver settings disappear', () => {
    const fixture = TestBed.createComponent(AppSettingsComponent);
    fixture.detectChanges();
    driver.set(undefined as any);
    fixture.detectChanges();
    const fields = Array.from(fixture.nativeElement.querySelectorAll('.field') as NodeListOf<HTMLElement>);
    const field = (title: string) => fields.find(el => el.querySelector('.title')?.textContent?.trim() === title)!;
    expect(field('Color Scheme')).toBeTruthy();
    expect(field('Advanced Mode')).toBeTruthy();
    expect(field('Image Enhancements').querySelector('button')!.disabled).toBeTrue();
    field('Advanced Mode').querySelector('button')!.click();
    fixture.detectChanges();
    expect(app().advanceMode).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Update Mode');
    expect(driver()).toBeUndefined();
  });

  it('lets simple-mode users stop calibration left active in Advanced Mode', () => {
    driver().streamFrame!.eyeGaze.debugGrid = true;
    driver().streamFrame!.distortion.tune.enable = true;
    const fixture = TestBed.createComponent(DriverSettingsComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.calibration-banner button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    button.click();
    fixture.detectChanges();
    expect(driver().streamFrame!.eyeGaze.debugGrid).toBeFalse();
    expect(driver().streamFrame!.distortion.tune.enable).toBeFalse();
    expect(fixture.nativeElement.querySelector('.calibration-banner')).toBeNull();
  });

  it('preserves profile export/import behavior on its new tab', () => {
    driver().streamFrame!.enable = true;
    driver().streamFrame!.k1 = 0.015;
    const fixture = TestBed.createComponent(DistortionProfileComponent);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.exportProfile();
    const exported = page.shareText();
    expect(JSON.parse(exported).k1).toBe(0.015);
    page.settings!.k1 = 0;
    page.shareText.set(exported);
    page.importProfile();
    expect(driver().streamFrame!.k1).toBe(0.015);
  });
});
