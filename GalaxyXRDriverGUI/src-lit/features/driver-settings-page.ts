// Driver Settings page, ported from
// src/app/pages/driver-settings/driver-settings.component.html (Angular era).
// All conditionals, vendor gates, advanced-mode gates, retired velocity mode
// escape hatches, and reset scopes are preserved.
import { html, LitElement, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { css } from 'lit';
import { BasePage, settingFieldRow, fieldRow, noteRow, sectionRow, sectionGroup, fieldStyles } from './page-base';
import { t, tHtml } from '../locale/i18n';
import { pageIntro, statusMessage } from '../ui/presentation';
import '../ui/controls';
import './driver-banner';
import './system-ready';
@customElement('app-driver-settings-page')
export class DriverSettingsPage extends BasePage {
  static styles = [fieldStyles, css`
    :host { display: block; padding: 0 1rem 2rem 1rem; }
    .rgb-control { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .rgb-control span { opacity: 0.75; font-size: 90%; }
    .note-inline { opacity: 0.75; font-size: 0.9rem; }
  `];

  private async changeIdentitySetting(key: 'nativeIdentity' | 'vrlinkHeadsetProfile', enabled: boolean, control: HTMLElement & { checked: boolean }): Promise<void> {
    const gx = this.ctx.galaxy.galaxyXr;
    // Do not change the persisted setting unless the user confirms. Explicit
    // saved false values remain respected; hiding advanced controls never resets them.
    if (!enabled && gx[key] !== false) {
      const confirmed = await this.ctx.dialog.confirm(t('Turn off Galaxy XR recognition?'),
        t('This setting is normally left on. Turning it off can make SteamVR show Unknown or the headset identity supplied by a patched Steam Link app instead of Galaxy XR. Restart SteamVR afterwards. Continue?'), t('Turn off'), 'danger');
      if (!confirmed) {
        // The adapter has already toggled locally; explicitly restore it on Cancel.
        control.checked = !!gx[key];
        this.requestUpdate();
        return;
      }
    }
    gx[key] = enabled;
    this.ctx.galaxy.save();
    this.requestUpdate();
  }

  private async changeBaseline(enabled: boolean, control: HTMLElement & { checked: boolean }): Promise<void> {
    const galaxy = this.ctx.galaxy;
    control.checked = galaxy.baselineRequested;
    if (enabled && !galaxy.baselineRequested) {
      if (galaxy.imageEnhancementsEnabled) return;
      const confirmed = await this.ctx.dialog.confirm(t('Reset picture adjustments and enable the baseline?'),
        t('This resets color, sharpening, lens correction and other image-processing adjustments to their defaults. It also turns off the custom shader for this headset. Your controller, tracking and stream-quality settings are kept. Turning the baseline off later will not restore the previous picture adjustments. Back up your settings or export your lens profile first. Continue?'),
        t('Reset and enable'), 'danger');
      if (!confirmed) return;
    }
    await galaxy.setSdr10Baseline(enabled);
    control.checked = galaxy.baselineRequested;
    this.requestUpdate();
  }

  render() {
    const galaxy = this.ctx.galaxy;
    if (!galaxy.settings) return html``;
    const settings = galaxy.settings;
    const defaults = galaxy.defaults;
    const advanced = galaxy.advancedMode || this.revealAdvanced;
    const vendor = galaxy.vendor;
    const c = this.ctx;
    const save = () => { galaxy.save(); this.requestUpdate(); };

    const body: TemplateResult[] = [html`
      ${pageIntro(t('Driver Settings'), t('Headset identity and controller tracking.'))}
      <app-driver-enable-banner .ctx=${this.ctx}></app-driver-enable-banner>
      ${galaxy.calibrationActive() ? statusMessage('warning', t('Calibration is active'), t('Stop calibration before playing.'),
        html`<fluent-button appearance="outline" @click=${() => { galaxy.stopCalibration(); this.requestUpdate(); }}>${t('Stop calibration')}</fluent-button>`) : html``}
      <div class="status-badge-row"><fluent-badge appearance="tint" color="informative">${t('SteamVR restart required')}</fluent-badge>
        <span>${t('After changing headset or controller identity.')}</span></div>
    `];

    // ---------------- Headset ----------------
    body.push(
      sectionRow(t('Headset'), this.section('headset'), 0, () => this.toggleSection('headset')),
    );
    if (this.section('headset')) {
      const gx = galaxy.galaxyXr;
      body.push(
        ...(advanced ? [settingFieldRow('galaxyXr.nativeIdentity', html`<app-switch .checked=${!!gx.nativeIdentity} @change=${(e: CustomEvent) => { void this.changeIdentitySetting('nativeIdentity', e.detail, e.currentTarget as HTMLElement & { checked: boolean }); }}></app-switch>`, {
          tip: "Keep this on so SteamVR identifies the headset as Galaxy XR and uses its device icons. Turning it off can show Unknown or the identity provided by a patched Steam Link app instead. Restart SteamVR after changing it.\n\nEnabled by default. Sets OpenVR model/manufacturer and named device-icon properties to the Galaxy XR identity and resources. With this disabled the native identity shim does not replace the identity reported by Steam Link; a patched APK may report a different headset. The vrlink Headset Profile is a separate switch. Explicit saved Off values are preserved. Restart SteamVR after changing identity.",
        })] : []),
        settingFieldRow('galaxyXr.nativeResolution', html`<app-switch .checked=${!!gx.nativeResolution} @change=${(e: CustomEvent) => { gx.nativeResolution = e.detail; save(); }}></app-switch>`, {
          tip: t("Ask SteamVR to render at the Galaxy XR's native per-eye size. This improves the requested resolution but can increase GPU load. Restart SteamVR to apply it.\n\nRequests 3552 × 3840 per eye without forcing a refresh rate. Your selected refresh rate, including 75 Hz, is preserved. renderWidth, renderHeight, overrideRenderWidth, and overrideRenderHeight are written to driver_vrlink, where VRLink reads the tuning settings. With vrlink Headset Profile On, the same values are also copied to vrlink_xrvst2ue, vrlink_Oculus Quest Pro and vrlink_PICO 4 Pro. Previous refresh-rate overrides are restored only when still journal-owned and unchanged; explicit displayFrequency extra keys remain under your control. Each section's original values are journaled independently. Turning this off restores only unchanged journal-owned resolution values; external edits are preserved."),
        }),
        ...(advanced ? [settingFieldRow('galaxyXr.vrlinkHeadsetProfile', html`<app-switch .checked=${!!gx.vrlinkHeadsetProfile} @change=${(e: CustomEvent) => { void this.changeIdentitySetting('vrlinkHeadsetProfile', e.detail, e.currentTarget as HTMLElement & { checked: boolean }); }}></app-switch>`, {
          tip: t("Keep this on to keep settings copies under the supported Steam Link headset identities. Stream tuning is written to driver_vrlink with this switch on or off. Requires a SteamVR restart.\n\nEnabled by default. Stream size and bandwidth, render overrides, diagnostics, and supported extra vrlink keys always use driver_vrlink. On also mirrors those settings and capability requests to vrlink_xrvst2ue, vrlink_Oculus Quest Pro and vrlink_PICO 4 Pro before connection. Recognized Quest Pro and PICO 4 Pro identities select VRLink's built-in capabilities; this SteamVR build bypasses their per-model capability sections. Profile copies alone therefore do not prove that capability requests were consumed. Off releases journal-owned tuning copies and preserves the original-model capability destination (xrvst2ue fallback); an active SDR 10-bit baseline can still request capabilities there. Each destination keeps its own recovery record. Driver enable/block keys and SteamVR global settings retain their required sections. Restart/reconnect and inspect driver_vrlink.txt to verify effective settings."),
        })] : []),
      );
      if (advanced || !gx.nativeIdentity || !gx.vrlinkHeadsetProfile) {
        body.push(statusMessage('warning', t('Keep Galaxy XR recognition enabled'), t('Turning off either identity option can make SteamVR show another headset or Unknown. Restart SteamVR after a change.')));
      }
      body.push(
        settingFieldRow('galaxyXr.sdr10Baseline', html`<app-switch
          .checked=${galaxy.baselineRequested}
          .disabled=${galaxy.imageModeChanging() || (!galaxy.baselineRequested && galaxy.imageEnhancementsEnabled)}
          @change=${(e: CustomEvent<boolean>) => { void this.changeBaseline(e.detail, e.currentTarget as HTMLElement & { checked: boolean }); }}></app-switch>`, {
          tip: t("Request a neutral 10-bit SDR picture. Enabling this resets image-processing adjustments to their defaults and turns Image Enhancements off. Switch Image Enhancements off in App Settings before enabling the baseline. You can then enable Image Enhancements in App Settings after accepting the image-quality warning. Turning the baseline off disables its 10-bit request, including when vrlink Headset Profile is off. Requires a SteamVR restart and reconnect. Explicit advanced overrides still apply.\n\nThe reset covers color/brightness, sharpening, FXAA, dither, black-floor correction, distortion curves/maps, eye alignment, dimming, calibration and video-color metadata. Controller motion, tracking, stream quality, bitrate and encoder presets are not reset. The custom shader target for this headset is turned off to avoid a conflicting color path. Previous picture adjustments are not restored when the baseline is disabled; export or back up first. The same capability request is mirrored to vrlink_xrvst2ue, vrlink_Oculus Quest Pro and vrlink_PICO 4 Pro with vrlink Headset Profile On, otherwise it uses the previous vrlink_<original model> destination. Recognized Quest Pro and PICO 4 Pro identities use VRLink's built-in capabilities instead of these per-model requests. Stream tuning is separately written to driver_vrlink. Each section's original values are tracked independently by the recovery journal. A request does not prove the live codec: restart/reconnect and check driver_vrlink.txt for Using 10bit mode: 1."),
        }),
      );
      if (galaxy.baselineRequested) {
        body.push(statusMessage(galaxy.imageEnhancementsEnabled ? 'warning' : 'info',
          galaxy.imageEnhancementsEnabled ? t('SDR 10-bit with Image Enhancements') : t('SDR 10-bit baseline is on'),
          galaxy.imageEnhancementsEnabled ? t('Image processing may reduce quality. Restart SteamVR and reconnect to apply the 10-bit request.')
            : t('Picture adjustments are reset. Restart SteamVR and reconnect to apply the 10-bit request.')));
        if (galaxy.sdr10BaselineConflict()) {
          body.push(statusMessage('warning', t('Custom shader conflicts with the baseline'), t('Turn the baseline off and on to reset picture adjustments and clear the conflict.')));
        }
      } else if (galaxy.imageEnhancementsEnabled) {
        body.push(statusMessage('info', t('Image Enhancements is on'), t('Turn it off before enabling the baseline. Enabling the baseline resets picture adjustments.'),
          html`<a href="#/app-settings">${t('Open App Settings')}</a>`));
      } else {
        body.push(noteRow(t('Enabling the baseline resets picture adjustments. Back up custom settings first; turning it off does not restore them.')));
      }
      if (galaxy.imageModeError()) body.push(statusMessage('error', t('Image mode could not be changed'), galaxy.imageModeError()!));
    }

    // ---------------- Controllers ----------------
    body.push(
      sectionRow(t('Controllers'), this.section('controllers'), 0, () => this.toggleSection('controllers')),
    );
    if (this.section('controllers')) {
      const gx = galaxy.galaxyXr;
      if (vendor) {
          body.push(
            settingFieldRow('galaxyXr.synthesizeGripTouch', html`
              <app-switch .checked=${!!gx.synthesizeGripTouch} @change=${(e: CustomEvent) => { gx.synthesizeGripTouch = e.detail; save(); }}></app-switch>
              <app-number .value=${gx.gripTouchThreshold ?? 0.03} min="0.005" max="0.5" step="0.005" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { gx.gripTouchThreshold = e.detail; save(); } }}></app-number>
            `, {
              tip: "Treat a light grip press as touching the grip sensor. This helps games that expect a separate touch signal from controllers that do not supply one.\n\nSteam Link sends no capacitive state for the grip (only its pressure), so the official profile's grip touch never lit. On: the driver creates /input/grip/touch and drives it from the grip value. The threshold is the grip value that counts as touched (release at half of it); lower feels more like a touch sensor but resting fingers may trigger it.",
              reset: {
                can: gx.synthesizeGripTouch === false || (gx.gripTouchThreshold !== undefined && gx.gripTouchThreshold != 0.03),
                on: () => { gx.synthesizeGripTouch = true; gx.gripTouchThreshold = 0.03; save(); },
              },
            }),
          );
      }

      // ---------- Controllers Advanced ----------
      if (advanced) {
        body.push(
          sectionGroup(t('Controllers Advanced'), 1),
        );
          if (vendor) {
            body.push(
              settingFieldRow('galaxyXr.controllerBypass', html`<app-switch .checked=${!!gx.controllerBypass} @change=${(e: CustomEvent) => { gx.controllerBypass = e.detail; save(); }}></app-switch>`, {
                tip: "Bypass this driver's controller adjustments while leaving the headset path active. Use this to compare with Steam Link's controller behavior.\n\nLeave the streamed controllers' pose exactly as vrlink sends it: no offsets, no skeleton offset, no grip touch synthesis. The Game Link layout is not part of the bypass: the controllers keep Samsung's identity, model and pose points on the untouched pose. For A/B tests against stock, or if you only want the image processing.",
                reset: { can: !!gx.controllerBypass, on: () => { gx.controllerBypass = false; save(); } },
              }),
              fieldRow(t('Game Link Velocity Cutoff (linear m/s, angular deg/s)'), html`
                <span>V</span><app-number .value=${settings.gameLinkLinearVelocityCutoff} step="0.01" min="0" max="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.gameLinkLinearVelocityCutoff = e.detail; save(); } }}></app-number>
                <span>W</span><app-number .value=${settings.gameLinkAngularVelocityCutoffDeg} step="1" min="0" max="90" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.gameLinkAngularVelocityCutoffDeg = e.detail; save(); } }}></app-number>
              `, {
                tip: "The controller motion is sent the way Samsung's own PC driver (Game Link) does: Steam Link's velocities as they come.\n\nA reported speed below V, or a spin below W, is sent as zero so a resting hand does not drift on sensor noise. The defaults are Samsung's own values; 0 sends every velocity as it comes.",
                reset: {
                  can: settings.gameLinkLinearVelocityCutoff != defaults.gameLinkLinearVelocityCutoff || settings.gameLinkAngularVelocityCutoffDeg != defaults.gameLinkAngularVelocityCutoffDeg,
                  on: () => { galaxy.reset('gameLinkLinearVelocityCutoff'); galaxy.reset('gameLinkAngularVelocityCutoffDeg'); },
                },
              }),
              fieldRow(t('Controller Rest Smoothing (Hz, 0 = off)'), html`<app-number .value=${settings.controllerSmoothingHz} step="1" min="0" max="60" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.controllerSmoothingHz = e.detail; save(); } }}></app-number>`, {
                tip: "Steady the controllers while they are held still, so pointers do not tremble. Lower is steadier; 0 turns it off.\n\nA low-pass filter on the controller pose whose cutoff is this value at rest and rises with the reported speed, so it opens up as soon as the hand moves and adds no felt lag to motion. Very low values make slow, precise aiming feel slightly delayed. The velocities sent to games are not changed. Applies live.",
                reset: { can: settings.controllerSmoothingHz != defaults.controllerSmoothingHz, on: () => galaxy.reset('controllerSmoothingHz') },
              }),
            );
          }
          if (galaxy.controllerSettings) {
            const cs = galaxy.controllerSettings;
            const cd = galaxy.controllerDefaults;
            body.push(
              sectionRow(t('Controller Offsets'), this.section('ctrlOffsets'), 2, () => this.toggleSection('ctrlOffsets')),
            );
            if (this.section('ctrlOffsets')) {
              body.push(
                fieldRow(t('Rotation Offset (deg)'), html`
                  <span>X</span><app-number .value=${cs.rotationOffsetDeg.x} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.rotationOffsetDeg.x = e.detail; save(); } }}></app-number>
                  <span>Y</span><app-number .value=${cs.rotationOffsetDeg.y} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.rotationOffsetDeg.y = e.detail; save(); } }}></app-number>
                  <span>Z</span><app-number .value=${cs.rotationOffsetDeg.z} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.rotationOffsetDeg.z = e.detail; save(); } }}></app-number>
                `, {
                  tip: "Rotate both controller poses by the same adjustment. Use small changes to align virtual objects with how you hold the controllers.\n\nLocal frame rotation added to both controllers' poses, live reloaded. X (pitch): positive tilts the top back toward you. Typical useful range 5-20. Y = yaw, Z = roll.",
                  reset: {
                    can: cs.rotationOffsetDeg.x != cd.rotationOffsetDeg.x || cs.rotationOffsetDeg.y != cd.rotationOffsetDeg.y || cs.rotationOffsetDeg.z != cd.rotationOffsetDeg.z,
                    on: () => galaxy.resetControllers('rotationOffsetDeg'),
                  },
                }),
                fieldRow(t('Position Offset (cm)'), html`
                  <span>X</span><app-number .value=${cs.positionOffsetCm.x} step="0.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.positionOffsetCm.x = e.detail; save(); } }}></app-number>
                  <span>Y</span><app-number .value=${cs.positionOffsetCm.y} step="0.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.positionOffsetCm.y = e.detail; save(); } }}></app-number>
                  <span>Z</span><app-number .value=${cs.positionOffsetCm.z} step="0.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.positionOffsetCm.z = e.detail; save(); } }}></app-number>
                `, {
                  tip: "Move both controller poses by the same adjustment. This shifts the virtual controller relative to the tracked hand position.\n\nLocal frame position offset added to both controllers' poses, live reloaded. Use when the virtual grip point sits offset from where the controller feels like it is (beam parallel but displaced): Z = forward/back along the controller, Y = up/down, X = sideways.",
                  reset: {
                    can: cs.positionOffsetCm.x != cd.positionOffsetCm.x || cs.positionOffsetCm.y != cd.positionOffsetCm.y || cs.positionOffsetCm.z != cd.positionOffsetCm.z,
                    on: () => galaxy.resetControllers('positionOffsetCm'),
                  },
                }),
                settingFieldRow('controllers.mirrorOffsetsForRightHand', html`<app-switch .checked=${!!cs.mirrorOffsetsForRightHand} @change=${(e: CustomEvent) => { cs.mirrorOffsetsForRightHand = e.detail; save(); }}></app-switch>`, {
                  tip: "Apply one controller alignment to both hands with left/right mirroring. Turn this off to tune each hand independently.\n\nAuthor the offsets above for the LEFT controller and mirror them for the right hand. Position X and rotations Y/Z flip sign. Pitch and position Y/Z stay the same. Turn it off if the hands need different corrections.",
                }),
              );
              if (!cs.mirrorOffsetsForRightHand && cs.left && cs.right) {
                body.push(
                  noteRow(t('Per-hand trims add to the shared offsets. Enable Mirror Offsets to use one set for both hands.')),
                  fieldRow(t('Left Hand Rotation Offset (deg)'), html`
                    <span>X</span><app-number .value=${cs.left!.rotationOffsetDeg.x} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.left!.rotationOffsetDeg.x = e.detail; save(); } }}></app-number>
                    <span>Y</span><app-number .value=${cs.left!.rotationOffsetDeg.y} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.left!.rotationOffsetDeg.y = e.detail; save(); } }}></app-number>
                    <span>Z</span><app-number .value=${cs.left!.rotationOffsetDeg.z} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.left!.rotationOffsetDeg.z = e.detail; save(); } }}></app-number>
                  `, {
                    tip: "Rotate only the left controller's pose. Use this when the two hands need different alignment.\n\nPer-hand trim applied UNMIRRORED to the left controller only, after the shared offsets above. Use when the two hands need different corrections (the tracked origins are not exact mirror images). X = pitch, Y = yaw, Z = roll. Live reloaded.",
                    reset: { can: galaxy.handOffsetsDirty('left'), on: () => galaxy.resetHandOffsets('left') },
                  }),
                  fieldRow(t('Left Hand Position Offset (cm)'), html`
                    <span>X</span><app-number .value=${cs.left!.positionOffsetCm.x} step="0.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.left!.positionOffsetCm.x = e.detail; save(); } }}></app-number>
                    <span>Y</span><app-number .value=${cs.left!.positionOffsetCm.y} step="0.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.left!.positionOffsetCm.y = e.detail; save(); } }}></app-number>
                    <span>Z</span><app-number .value=${cs.left!.positionOffsetCm.z} step="0.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.left!.positionOffsetCm.z = e.detail; save(); } }}></app-number>
                  `, {
                    tip: "Move only the left controller's pose. The offsets change where held objects appear, not the tracking space itself.\n\nPer-hand position trim for the left controller only, unmirrored, applied after the shared offsets. Same axes as the shared Position Offset: Z = along the controller, Y = up/down, X = sideways.",
                  }),
                  fieldRow(t('Right Hand Rotation Offset (deg)'), html`
                    <span>X</span><app-number .value=${cs.right!.rotationOffsetDeg.x} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.right!.rotationOffsetDeg.x = e.detail; save(); } }}></app-number>
                    <span>Y</span><app-number .value=${cs.right!.rotationOffsetDeg.y} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.right!.rotationOffsetDeg.y = e.detail; save(); } }}></app-number>
                    <span>Z</span><app-number .value=${cs.right!.rotationOffsetDeg.z} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.right!.rotationOffsetDeg.z = e.detail; save(); } }}></app-number>
                  `, {
                    tip: "Rotate only the right controller's pose. Use this when the two hands need different alignment.\n\nPer-hand trim applied UNMIRRORED to the right controller only, after the shared offsets above. Use when the two hands need different corrections (the tracked origins are not exact mirror images). X = pitch, Y = yaw, Z = roll. Live reloaded.",
                    reset: { can: galaxy.handOffsetsDirty('right'), on: () => galaxy.resetHandOffsets('right') },
                  }),
                  fieldRow(t('Right Hand Position Offset (cm)'), html`
                    <span>X</span><app-number .value=${cs.right!.positionOffsetCm.x} step="0.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.right!.positionOffsetCm.x = e.detail; save(); } }}></app-number>
                    <span>Y</span><app-number .value=${cs.right!.positionOffsetCm.y} step="0.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.right!.positionOffsetCm.y = e.detail; save(); } }}></app-number>
                    <span>Z</span><app-number .value=${cs.right!.positionOffsetCm.z} step="0.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { cs.right!.positionOffsetCm.z = e.detail; save(); } }}></app-number>
                  `, {
                    tip: "Move only the right controller's pose. The offsets change where held objects appear, not the tracking space itself.\n\nPer-hand position trim for the right controller only, unmirrored, applied after the shared offsets. Same axes as the shared Position Offset: Z = along the controller, Y = up/down, X = sideways.",
                  }),
                );
              }
            }
          }
      }
    }

    return html`<app-system-ready .ctx=${this.ctx}>${this.sectionCardsFor(body)}</app-system-ready>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-driver-settings-page': DriverSettingsPage;
  }
}
