import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AboutComponent } from './about.component';
import { AppUpdateService } from '../../services/app-update.service';
import { DriverInfoService } from '../../services/driver-info.service';
import { DriverSettingService } from '../../services/driver-setting.service';
import { SystemDiagnosticService } from '../../services/system-diagnostic.service';
import { DialogService } from '../../services/dialog.service';

describe('About identity cleanup', () => {
  let busy = signal(false);
  let runtime = signal<string | undefined>('D:/SteamVR');
  let cleanup: jasmine.Spy;
  let message: jasmine.Spy;
  beforeEach(async () => {
    busy = signal(false);
    runtime = signal<string | undefined>('D:/SteamVR');
    cleanup = jasmine.createSpy().and.resolveTo({ removedKeys: ['vrlink_xrvst2ue.resourceRoot'], removedSections: [], warnings: [], backupPath: 'D:/config/backup.json' });
    message = jasmine.createSpy().and.resolveTo(undefined);
    await TestBed.configureTestingModule({
      imports: [AboutComponent],
      providers: [provideNoopAnimations(),
        { provide: AppUpdateService, useValue: { updateInfo: signal(undefined) } },
        { provide: DriverInfoService, useValue: { values: signal(undefined) } },
        { provide: DriverSettingService, useValue: { values: signal(undefined) } },
        { provide: SystemDiagnosticService, useValue: {
          driverInstalled: signal(undefined), steamVRinstalled: runtime, installingDriver: busy,
          cleanOlderIdentitySettings: cleanup,
        } },
        { provide: DialogService, useValue: { message } },
      ],
    }).compileComponents();
  });
  function page() {
    const fixture = TestBed.createComponent(AboutComponent);
    fixture.detectChanges();
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(el => el.textContent?.includes('Clean Older Identity Settings'))!;
    return { fixture, button };
  }
  it('offers cleanup without an installed driver and reports the backup', async () => {
    const { fixture, button } = page();
    expect(button.disabled).toBeFalse();
    button.click();
    await fixture.whenStable();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(message.calls.mostRecent().args[1]).toContain('D:/config/backup.json');
  });
  it('disables cleanup during another mutation or without SteamVR', () => {
    const { fixture, button } = page();
    busy.set(true); fixture.detectChanges();
    expect(button.disabled).toBeTrue();
    busy.set(false); runtime.set(undefined); fixture.detectChanges();
    expect(button.disabled).toBeTrue();
    expect(cleanup).not.toHaveBeenCalled();
  });
  it('reports no matches and preserved-value warnings accurately', async () => {
    cleanup.and.resolveTo({ removedKeys: [], removedSections: [], warnings: ['Preserved custom model'], backupPath: null });
    const { fixture, button } = page();
    button.click(); await fixture.whenStable();
    expect(message.calls.mostRecent().args[1]).toContain('No matching older identity settings');
    expect(message.calls.mostRecent().args[1]).toContain('Preserved custom model');
  });
  it('does not report success when the service reports failure', async () => {
    cleanup.and.resolveTo(undefined);
    const { fixture, button } = page();
    button.click(); await fixture.whenStable();
    expect(message).not.toHaveBeenCalled();
  });
});
