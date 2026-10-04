// Stream Frame (Image Settings) page, ported from the Angular template (2026-09-20 Lit/Fluent migration).
// Every conditional, field, tip, reset scope and control binding from the original
// template is preserved 1:1; the only interpretation layer is the control
// adapters (app-switch / app-select / app-number / app-slider) whose events
// were verified against the pinned @fluentui/web-components package.
import { html, type TemplateResult } from 'lit';
import { customElement } from 'lit/decorators.js';
import { css } from 'lit';
import { BasePage, settingFieldRow, fieldRow, noteRow, sectionRow, sectionHeading, sectionGroup, fieldStyles } from './page-base';
import { t } from '../locale/i18n';
import { pageIntro, statusMessage } from '../ui/presentation';
import { encoderTapStatus } from '../domain/encoder-tap-status';
import '../ui/controls';
import './driver-banner';
import './system-ready';

@customElement('app-stream-frame-page')
export class StreamFramePage extends BasePage {
  private runtimeTimer?: ReturnType<typeof setTimeout>;
  private runtimeExpiryTimer?: ReturnType<typeof setTimeout>;
  private runtimeUnsub?: () => void;
  private readonly onVisibilityChange = () => this.requestUpdate();
  private pollGeneration = 0;
  private updateRuntimeEvidence(): void {
    this.requestUpdate();
    if (this.runtimeExpiryTimer !== undefined) clearTimeout(this.runtimeExpiryTimer);
    const checkedAt = this.ctx.startup.status()?.checkedAt;
    // Expire evidence independently: an unresolved native poll cannot keep
    // the previous confirmed-OFF badge alive indefinitely (2026-09-30).
    if (checkedAt !== undefined) this.runtimeExpiryTimer = setTimeout(() => this.requestUpdate(),
      Math.max(0, checkedAt + 5001 - Date.now()));
  }
  private async pollRuntime(generation: number): Promise<void> {
    if (!this.isConnected || generation !== this.pollGeneration) return;
    if (document.visibilityState !== 'hidden') await this.ctx.startup.refresh();
    if (this.isConnected && generation === this.pollGeneration) {
      this.runtimeTimer = setTimeout(() => { void this.pollRuntime(generation); }, 2000);
    }
  }
  connectedCallback(): void {
    super.connectedCallback();
    this.runtimeUnsub = this.ctx.startup.status.subscribe(() => this.updateRuntimeEvidence());
    this.updateRuntimeEvidence();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    void this.pollRuntime(++this.pollGeneration);
  }
  disconnectedCallback(): void {
    ++this.pollGeneration;
    if (this.runtimeTimer !== undefined) clearTimeout(this.runtimeTimer);
    if (this.runtimeExpiryTimer !== undefined) clearTimeout(this.runtimeExpiryTimer);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.runtimeUnsub?.();
    super.disconnectedCallback();
  }
  private async restoreEncoder(): Promise<void> {
    await this.ctx.startup.refresh();
    if (this.ctx.startup.status()?.steamvrRunning !== false) return;
    const report = await this.ctx.sds.restoreSteamLinkEncoderBehaviour();
    if (!report) return;
    this.ctx.startup.invalidate();
    this.ctx.checks.clear();
    await this.ctx.dialog.message(t('Restore Steam Link encoder behaviour'),
      t('NVENC Tap is OFF. Saved tuning was kept. Start SteamVR to use Steam Link\'s encoder parameters.'),
      [t('Recovery backup') + ': ' + report.backupPath, ...report.unresolvedItems].join('\n'));
    await this.ctx.startup.refresh();
    this.requestUpdate();
  }
  static styles = [fieldStyles, css`
    :host { display: block; padding: 0 1rem 2rem 1rem; }
    .rgb-control { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .rgb-control span { opacity: 0.75; font-size: 90%; }
    .matrix-control { flex-direction: column; align-items: flex-start; gap: 0.3rem; }
    .note-inline { opacity: 0.75; font-size: 0.9rem; }

  `];


  render() {
    const galaxy = this.ctx.galaxy;
    if (!galaxy.settings) return html``;
    const settings = galaxy.settings;
    const defaults = galaxy.defaults;
    const advancedMode = galaxy.advancedMode || this.revealAdvanced;
    const vendor = galaxy.vendor;
    const galaxyXr = galaxy.galaxyXr;
    const sections = galaxy.sections();
    const save = () => { galaxy.save(); this.requestUpdate(); };
    const parts: TemplateResult[] = [pageIntro(t('Image Settings'), t('Stream quality, color, and sharpening.'))];
if (settings) {
      parts.push(html`<app-driver-enable-banner .ctx=${this.ctx}></app-driver-enable-banner>`);
if (galaxy.calibrationActive()) {
          parts.push(statusMessage('warning', t('Calibration is active'), t('Stop calibration before playing.'),
            html`<fluent-button appearance="outline" @click=${() => { galaxy.stopCalibration(); this.requestUpdate(); }}>${t('Stop calibration')}</fluent-button>`));
}
if (vendor) {
        parts.push(sectionHeading(t('Stream Quality')));
        parts.push(fieldRow(t('Stream Quality Preset'), html`
      <app-select .width=${300} .value=${galaxyXr.streamQuality} .options=${[{ value: 'efficient', label: 'Efficient — 1536 tile, 300 Mbit/s (any link)' }, { value: 'balanced', label: 'Balanced — 1536 tile, 350 Mbit/s (recommended)' }, { value: 'vivid', label: 'Vivid — 1536 tile, 400 Mbit/s' }, { value: 'sharp', label: 'Sharp — 1536 tile, 450 Mbit/s (good 6 GHz link, headset permitting)' }, { value: 'max', label: 'Max — 2048 tile, 450 Mbit/s (encode-limited on current GPUs)' }, { value: 'custom', label: 'Custom — set tile and bandwidth yourself' }]} @change=${(e: CustomEvent) => { galaxyXr.streamQuality = e.detail; save(); }}></app-select>
        `, {
  tip: "Choose the video-stream detail and bandwidth preset. Higher settings need more GPU, network, and headset decoding capacity; they do not guarantee a clearer or smoother result.\n\nTile width and bandwidth. The stream is four stacked square tiles of this width per frame (per eye: the whole view downscaled, plus a 1:1 gaze-tracked cut-out of the render target). 1536 keeps the encoder ahead of the streamer on a 3-engine GPU and gets the full bitrate; 2048 is the hard ceiling (4 x 2048 = the codec's 8192-row limit) and is encode-limited today. Bandwidth drives the network pacer and the encoder together; 350 is the streamer's own ceiling, 450 the headset's. Everything else about the encoder is in the Encoder group below and is the same for every tier. Box size and sharpness inside the fovea come from SteamVR supersampling (~200% recommended). Takes effect at the next SteamVR start or headset connect."
        }));
if (galaxyXr.streamQuality === 'custom') {
          parts.push(fieldRow(t('Custom: Tile Width (streamFormatWidth)'), html`
      <app-number .value=${galaxyXr.customStreamFormatWidth} step="512" min="512" max="2048" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { galaxyXr.customStreamFormatWidth = e.detail; } save(); }}></app-number>
          `, {
  tip: "Set the custom video tile width. Larger tiles can increase detail and processing load; the driver clamps this value to its supported range.\n\nThe transport tile in pixels: 1536 or 2048. Anything above 2048 is silently clamped by the streamer (four stacked tiles must fit the codec's 8192-row limit). Also sets the profile's maxStreamFormatWidth.",
  reset: { can: galaxyXr.customStreamFormatWidth != 1536, on: () => { galaxyXr.customStreamFormatWidth = 1536; save(); } }
          }));
          parts.push(fieldRow(t('Custom: Bandwidth (Mbit/s)'), html`
      <app-number .value=${galaxyXr.customBandwidthMbit} step="25" min="100" max="600" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { galaxyXr.customBandwidthMbit = e.detail; } save(); }}></app-number>
          `, {
  tip: "Set the custom streaming bandwidth budget. Higher bandwidth can improve compression quality only when the connection can sustain it.\n\nWritten to targetBandwidth and recommendedBandwidthMbit (the pacer) and used as the encoder bitrate. The streamer's own request never exceeds 350; above that the encoder is scaled up proportionally. 450 is the headset's practical limit.",
  reset: { can: galaxyXr.customBandwidthMbit != 350, on: () => { galaxyXr.customBandwidthMbit = 350; save(); } }
          }));
}
        parts.push(html`<div class="status-badge-row"><fluent-badge appearance="tint" color="informative">${t('SteamVR restart required')}</fluent-badge>
          <span>${t('After changing stream quality.')}</span></div>`);
}
parts.push(sectionHeading(t('Image Processing'), 0, 'image-processing'));
if (galaxy.imageEnhancementsEnabled) {
        parts.push(sectionRow(t('Color'), sections['color'], 1, () => this.toggleSection('color')));
if (sections.color) {
if (galaxy.sdr10BaselineActive()) {
            parts.push(statusMessage('warning', t('SDR 10-bit with Image Enhancements'), t('Image processing may reduce quality.')));
}
          parts.push(fieldRow(t('Brightness'), html`
      <app-number .value=${settings.brightness} step="0.05" min="0.05" max="1.5" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.brightness = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.brightness} .min=${0.05} .max=${1.5} .step=${0.05} @change=${(e: CustomEvent) => { settings.brightness = e.detail; save(); }}></app-slider>
          `, {
  tip: "Adjust the overall picture brightness. Lower values darken the image; this is a display preference, not a guarantee about panel lifespan.\n\nScales output brightness in the host image-processing path. Compare against a known neutral setting and avoid compensating for a video-range mismatch with brightness alone. Panel wear depends on many factors; this control does not provide a measured or guaranteed lifespan improvement.",
  reset: { can: settings.brightness != defaults.brightness, on: () => { galaxy.reset('brightness'); } }
          }));
          parts.push(fieldRow(t('Saturation'), html`
      <app-number .value=${settings.saturation} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.saturation = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.saturation} .min=${0} .max=${100} .step=${1} @change=${(e: CustomEvent) => { settings.saturation = e.detail; save(); }}></app-slider>
          `, {
  tip: "Adjust the strength of colors. The neutral value keeps the original color saturation.\n\nIncrease or decrease the variation of the colors. 50 is neutral, 0 is grayscale.",
  reset: { can: settings.saturation != defaults.saturation, on: () => { galaxy.reset('saturation'); } }
          }));
          parts.push(fieldRow(t('Vibrance'), html`
      <app-number .value=${settings.vibrance} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.vibrance = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.vibrance} .min=${-100} .max=${100} .step=${1} @change=${(e: CustomEvent) => { settings.vibrance = e.detail; save(); }}></app-slider>
          `, {
  tip: "Boost quieter colors without changing all colors equally. Use small adjustments to avoid an unnatural-looking picture.\n\nSmart saturation: changes muted colors the most and already vivid colors the least. Positive enriches dull colors with far less clipping and skin tone blowout than raw saturation; negative fades muted colors toward gray while vivid accents remain. 0 is off, stacks with Saturation.",
  reset: { can: settings.vibrance != defaults.vibrance, on: () => { galaxy.reset('vibrance'); } }
          }));
          parts.push(fieldRow(t('Contrast'), html`
      <app-number .value=${settings.contrast} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.contrast = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.contrast} .min=${0} .max=${100} .step=${1} @change=${(e: CustomEvent) => { settings.contrast = e.detail; save(); }}></app-slider>
          `, {
  tip: "Adjust the difference between light and dark areas. Stronger contrast can hide details in shadows or highlights.\n\nContrast around the midpoint. 50 is neutral.",
  reset: { can: settings.contrast != defaults.contrast, on: () => { galaxy.reset('contrast'); } }
          }));
          parts.push(fieldRow(t('Contrast Midpoint'), html`
      <app-number .value=${settings.contrastMidpoint} step="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.contrastMidpoint = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.contrastMidpoint} .min=${0} .max=${100} .step=${1} @change=${(e: CustomEvent) => { settings.contrastMidpoint = e.detail; save(); }}></app-slider>
          `, {
  tip: "Choose the brightness level around which contrast is adjusted. Change this only when the normal contrast control does not give the desired balance.\n\nThe brightness level from 0 to 100 percent of white that the contrast pivots around.",
  reset: { can: settings.contrastMidpoint != defaults.contrastMidpoint, on: () => { galaxy.reset('contrastMidpoint'); } }
          }));
          parts.push(settingFieldRow('streamFrame.contrastLinear', html`
      <app-switch .checked=${!!settings.contrastLinear} @change=${(e: CustomEvent) => { settings.contrastLinear = e.detail; save(); }}></app-switch>
          `, {
  tip: "Apply contrast in linear light rather than the usual display-encoded space. This changes the effect of the contrast control.\n\nApply the contrast in linear space instead of gamma space.",
  reset: { can: settings.contrastLinear != defaults.contrastLinear, on: () => { galaxy.reset('contrastLinear'); } }
          }));
          parts.push(fieldRow(t('Gamma'), html`
      <app-number .value=${settings.gamma} step="0.01" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.gamma = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.gamma} .min=${1.2} .max=${3.2} .step=${0.01} @change=${(e: CustomEvent) => { settings.gamma = e.detail; save(); }}></app-slider>
          `, {
  tip: "Adjust midtone brightness without using the overall brightness control. The neutral pipeline value is 2.2.\n\nGamma of the output. 2.2 is neutral, lower brightens midtones.",
  reset: { can: settings.gamma != defaults.gamma, on: () => { galaxy.reset('gamma'); } }
          }));
          parts.push(fieldRow(t('Color Multiplier'), html`
      <span>R</span>
      <app-number .value=${settings.colorMultiplier.r} step="0.01" min="0" max="2" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.colorMultiplier.r = e.detail; } save(); }}></app-number>
      <span>G</span>
      <app-number .value=${settings.colorMultiplier.g} step="0.01" min="0" max="2" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.colorMultiplier.g = e.detail; } save(); }}></app-number>
      <span>B</span>
      <app-number .value=${settings.colorMultiplier.b} step="0.01" min="0" max="2" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.colorMultiplier.b = e.detail; } save(); }}></app-number>
          `, {
  tip: "Adjust the red, green, and blue channels separately to correct a color tint. 1 on every channel leaves the balance unchanged.\n\nPer channel tint multiplier applied to the image. 1 for each channel is neutral.",
  reset: { can: settings.colorMultiplier.r != defaults.colorMultiplier.r || settings.colorMultiplier.g != defaults.colorMultiplier.g || settings.colorMultiplier.b != defaults.colorMultiplier.b, on: () => { galaxy.reset('colorMultiplier'); } }
          }));
          parts.push(fieldRow(t('Color Matrix'), html`
      <input type="text" .value=${galaxy.matrixText()} placeholder="empty = disabled" @input=${(e: Event) => { galaxy.onMatrixTextChanged((e.target as HTMLInputElement).value) }}></input>
      ${galaxy.matrixError() ? statusMessage('error', t('Color matrix could not be applied'), galaxy.matrixError()!) : html``}
          `, {
  tip: "Apply a nine-value color correction matrix. This is an advanced calibration tool; an incorrect matrix can strongly distort colors.\n\nOptional 3x3 linear rgb matrix, row major, 9 comma separated numbers. Used for gamut or white point correction. Leave empty to disable.",
  reset: { can: settings.srgbMatrix.length != 0, on: () => { galaxy.reset('srgbMatrix'); } }
          }));
}
        parts.push(sectionRow(t('Image Enhancements'), sections['enhance'], 1, () => this.toggleSection('enhance')));
if (sections.enhance) {
          parts.push(fieldRow(t('FXAA Anti-Aliasing'), html`
      <app-select .value=${settings.fxaa} .options=${[{ value: 'off', label: 'Off' }, { value: 'fast', label: 'Fast - in-pass (single pass, lightest)' }, { value: 'quality', label: 'Quality - separate pre-pass (best edges)' }]} @change=${(e: CustomEvent) => { settings.fxaa = e.detail; save(); }}></app-select>
          `, {
  tip: "Reduce jagged edges with a post-processing filter. The quality mode does more work than the fast mode and may cost performance.\n\nFXAA applied BEFORE CAS so sharpening enhances resolved edges instead of amplifying jagged staircases. Best for titles with heavy edge shimmer (specular geometry, foliage, thin railings); slightly softens fine text - leave off for text-heavy apps. Fast: integrated into the main pass; CAS sharpens raw neighbors around the AA-resolved center (can faintly re-jag very strong edges at high CAS strength). Quality: a separate FXAA pre-pass, so CAS sees fully resolved edges - costs one extra full-frame pass and VRAM for an intermediate texture; falls back to Fast automatically (with a log line) if the pass shader or intermediate is unavailable. Check 'pixel shader ready (... fxaa: yes, fxaaPass: yes)' in the log after updating.",
  reset: { can: settings.fxaa != defaults.fxaa, on: () => { galaxy.reset('fxaa'); } }
          }));
          parts.push(settingFieldRow('cas-sharpening', html`
      <app-select .width=${300} .value=${galaxy.casMode} .options=${[{ value: 'off', label: 'Off' }, { value: 'postpack', label: 'Post-pack — on the encoded frame (recommended)' }, { value: 'preencode', label: 'Pre-encode — full-resolution pass (AMD / tap off)' }]} @change=${(e: CustomEvent) => { galaxy.casMode = e.detail; save(); }}></app-select>
          `, {
  tip: "Choose where contrast-adaptive sharpening is applied. The modes use different processing paths; avoid adding the same sharpening twice.\n\nContrast adaptive sharpening. POST-PACK (recommended, NVIDIA + NVENC Tap): runs on the frame the encoder actually sends - the foveated transport image - with separate strengths for the gaze region and the periphery; the periphery is sharpened after Steam Link downscales it, so it survives to the panel, at ~0.04 ms per frame. PRE-ENCODE: the older full-resolution pass on the eye textures; only for AMD GPUs or with the NVENC Tap off. Never run both."
          }));
if (galaxy.casMode === 'postpack' && !settings.nvencTap) {
            parts.push(statusMessage('info', t('Post-pack sharpening needs NVENC Tap'), t('Enable NVENC Tap in Encoder, or choose Pre-encode sharpening.')));
}
if (galaxy.casMode === 'postpack') {
            parts.push(fieldRow(t('Fovea Strength'), html`
      <app-number .value=${settings.postPack.foveaStrength} step="0.05" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.postPack.foveaStrength = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.postPack.foveaStrength} .min=${0} .max=${1} .step=${0.05} @change=${(e: CustomEvent) => { settings.postPack.foveaStrength = e.detail; save(); }}></app-slider>
            `, {
  tip: "Adjust sharpening in the high-detail center of the streamed image. Too much sharpening can create bright outlines or noise.\n\nSharpening for the gaze cut-out tile (1:1 render-target pixels), 0 to 1. Under CBR sharpening costs bits: spend them here.",
  reset: { can: settings.postPack.foveaStrength != 0.6, on: () => { settings.postPack.foveaStrength = 0.6; save(); } }
            }));
            parts.push(fieldRow(t('Periphery Strength'), html`
      <app-number .value=${settings.postPack.peripheryStrength} step="0.05" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.postPack.peripheryStrength = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.postPack.peripheryStrength} .min=${0} .max=${1} .step=${0.05} @change=${(e: CustomEvent) => { settings.postPack.peripheryStrength = e.detail; save(); }}></app-slider>
            `, {
  tip: "Adjust sharpening outside the high-detail center. This affects the lower-detail edges of the streamed image.\n\nSharpening for the downscaled whole-view tile, 0 to 1. Applied after the downscale, so it is visible on the panel; keep it lower than the fovea to avoid haloing on the stretched periphery.",
  reset: { can: settings.postPack.peripheryStrength != 0.3, on: () => { settings.postPack.peripheryStrength = 0.3; save(); } }
            }));
            parts.push(fieldRow(t('Fovea Edge Falloff'), html`
      <app-number .value=${settings.postPack.edgeFalloff} step="0.02" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.postPack.edgeFalloff = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.postPack.edgeFalloff} .min=${0} .max=${0.5} .step=${0.02} @change=${(e: CustomEvent) => { settings.postPack.edgeFalloff = e.detail; save(); }}></app-slider>
            `, {
  tip: "Smooth the transition between center and edge sharpening. Use this when a visible boundary appears around the sharp region.\n\nFraction of the fovea tile (0 to 0.5) over which its sharpening ramps down to the periphery strength at the tile border, so the seam where the headset composites the cut-out over the stretched periphery is not a sharpness step. 0 = hard edge. Raise if a halo is visible around the fovea region.",
  reset: { can: settings.postPack.edgeFalloff != 0.12, on: () => { settings.postPack.edgeFalloff = 0.12; save(); } }
            }));
            parts.push(settingFieldRow('streamFrame.postPack.foveaTop', html`
      <app-switch .checked=${!!settings.postPack.foveaTop} @change=${(e: CustomEvent) => { settings.postPack.foveaTop = e.detail; save(); }}></app-switch>
            `, {
  tip: "Adjust sharpening for the upper and lower center tiles. These values fine-tune the streamed image layout.\n\nWhich tile of each eye's pair is the gaze cut-out. On = upper tile (what the streamer's shader indicates). If the wrong region looks sharpened - e.g. periphery crisp, fovea soft - flip this."
            }));
}
if (galaxy.casMode === 'preencode') {
            parts.push(settingFieldRow('streamFrame.cas.perEye', html`
      <app-switch .checked=${!!settings.cas.perEye} @change=${(e: CustomEvent) => { settings.cas.perEye = e.detail; save(); }}></app-switch>
            `, {
  tip: "Use different sharpening values for the left and right eye. Leave linked unless you need an eye-specific correction.\n\nSharpen each eye independently. Useful when one eye sits slightly off its lens axis (facial asymmetry) and only that eye needs extra sharpening to mask the mild off-axis blur; the other eye is spared the over-sharpening."
            }));
if (!settings.cas.perEye) {
              parts.push(fieldRow(t('CAS Strength'), html`
      <app-number .value=${settings.cas.strength} step="0.05" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.cas.strength = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.cas.strength} .min=${0} .max=${1} .step=${0.05} @change=${(e: CustomEvent) => { settings.cas.strength = e.detail; save(); }}></app-slider>
              `, {
  tip: "Set the overall sharpening strength. Higher values can improve apparent detail but may also amplify noise or create halos.\n\nStrength of the sharpening from 0 to 1."
              }));
}
if (settings.cas.perEye) {
              parts.push(fieldRow(t('Strength Left'), html`
      <app-number .value=${settings.cas.strengthLeft} step="0.05" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.cas.strengthLeft = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.cas.strengthLeft} .min=${0} .max=${1} .step=${0.05} @change=${(e: CustomEvent) => { settings.cas.strengthLeft = e.detail; save(); }}></app-slider>
              `, {
  tip: "Set sharpening strength for the left eye. Compare both eyes to avoid an uneven-looking image.\n\nSharpening strength for the left eye only, 0 to 1."
              }));
              parts.push(fieldRow(t('Strength Right'), html`
      <app-number .value=${settings.cas.strengthRight} step="0.05" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.cas.strengthRight = e.detail; } save(); }}></app-number>
      <app-slider .value=${settings.cas.strengthRight} .min=${0} .max=${1} .step=${0.05} @change=${(e: CustomEvent) => { settings.cas.strengthRight = e.detail; save(); }}></app-slider>
              `, {
  tip: "Set sharpening strength for the right eye. Compare both eyes to avoid an uneven-looking image.\n\nSharpening strength for the right eye only, 0 to 1."
              }));
}
}
          parts.push(settingFieldRow('streamFrame.dither', html`
      <app-switch .checked=${!!settings.dither} @change=${(e: CustomEvent) => { settings.dither = e.detail; save(); }}></app-switch>
          `, {
  tip: "Add a small amount of noise to make color banding less obvious. It can improve smooth gradients but does not add real color detail.\n\nAdds a small amount of noise before the encode to reduce banding in dark gradients.",
  reset: { can: settings.dither != defaults.dither, on: () => { galaxy.reset('dither'); } }
          }));
          parts.push(settingFieldRow('streamFrame.stationaryDimming.enable', html`
      <app-switch .checked=${!!settings.stationaryDimming.enable} @change=${(e: CustomEvent) => { settings.stationaryDimming.enable = e.detail; save(); }}></app-switch>
          `, {
  tip: "Dim the picture when the headset is not moving. This reduces visible brightness during still periods rather than pausing the game.\n\nFades the streamed image uniformly toward black when the headset has not moved for the configured time, then restores brightness on movement. This reduces time spent showing a bright stationary image; it does not guarantee protection from panel wear. Tracking and the game can continue while the picture is dimmed."
          }));
if (settings.stationaryDimming.enable) {
            parts.push(fieldRow(t('Dimming Timing'), html`
      <span>after</span>
      <app-number .value=${settings.stationaryDimming.movementTime} step="1" min="2" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.stationaryDimming.movementTime = e.detail; } save(); }}></app-number>
      <span>fade</span>
      <app-number .value=${settings.stationaryDimming.dimSeconds} step="1" min="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.stationaryDimming.dimSeconds = e.detail; } save(); }}></app-number>
            `, {
  tip: "Set how long the headset must stay still before dimming starts and how quickly the picture fades.\n\nSeconds of stillness before dimming starts, and seconds to fade fully to black."
            }));
}
}
} else {
        parts.push(statusMessage('info', t('Image Enhancements is off'),
          galaxy.baselineRequested ? t('Enable it in App Settings and accept the quality warning to adjust the SDR 10-bit picture.')
            : t('Enable it in App Settings to adjust color and sharpening.'),
          html`<a href="#/app-settings">${t('Open App Settings')}</a>`));
}
if (advancedMode) {
        parts.push(sectionGroup(t('Advanced'), 1));
          parts.push(fieldRow(t('Sync Timeout (ms)'), html`
      <app-number .value=${settings.syncTimeoutMs} step="1" min="1" max="100" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.syncTimeoutMs = e.detail; } save(); }}></app-number>
          `, {
  tip: "Skip a synchronization wait in the image-processing path. This is a latency experiment and can cause flashes or other display artifacts.\n\nHow long to wait for the frame sync before letting a frame through unprocessed (a brief 'flash' of ungraded color). Higher values trade flashes under heavy load for slightly later frames. After a skipped frame the wait automatically escalates to break flash streaks. Default 10, sensible range 3-15.",
  reset: { can: settings.syncTimeoutMs != defaults.syncTimeoutMs, on: () => { galaxy.reset('syncTimeoutMs'); } }
          }));
          parts.push(fieldRow(t('Gaze Prediction (ms)'), html`
      <app-number .value=${settings.eyeGaze.predictionMs} step="5" min="0" max="100" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.eyeGaze.predictionMs = e.detail; } save(); }}></app-number>
          `, {
  tip: "Adjust how far ahead eye movement is predicted for processing. Too much prediction can place the correction ahead of your actual gaze.\n\nLeads the gaze point by extrapolating recent eye motion, compensating the capture-to-display latency that makes the ring trail your eyes. Raise if the ring lags behind saccades, lower if it overshoots. 0 disables."
          }));
          parts.push(settingFieldRow('streamFrame.directRender', html`
      <app-switch .checked=${!!settings.directRender} @change=${(e: CustomEvent) => { settings.directRender = e.detail; save(); }}></app-switch>
          `, {
  tip: "Request a more direct rendering path. Performance and compatibility depend on the runtime; compare carefully before leaving it enabled.\n\nPerformance: draws the processed frame directly into the layer texture instead of a scratch target plus copy-back (about a third less GPU memory traffic). Falls back automatically per texture if a layer refuses a render target view. Only turn off to A/B against the old path; the log line 'direct render path' / 'copy-back path' shows which is active per app.",
  reset: { can: settings.directRender != defaults.directRender, on: () => { galaxy.reset('directRender'); } }
          }));
          parts.push(settingFieldRow('streamFrame.deferredEviction', html`
      <app-switch .checked=${!!settings.deferredEviction} @change=${(e: CustomEvent) => { settings.deferredEviction = e.detail; save(); }}></app-switch>
          `, {
  tip: "Keep cached resources longer to try to reduce short stutters. This changes resource handling and may use more memory.\n\nPerformance: when the scratch texture cache is full and a new resolution arrives, the old set's release is postponed a few frames and performed after the frame sync mutex is released, instead of inside the same frame that already pays the unavoidable creation stall. Spreads transition cost so resolution/app switches hitch less. Off restores the old synchronous eviction for A/B; score the difference with Hitch Diagnostics on ('creates'/'evicts' counters and HITCH tags mark the transitions).",
  reset: { can: settings.deferredEviction != defaults.deferredEviction, on: () => { galaxy.reset('deferredEviction'); } }
          }));
          parts.push(settingFieldRow('streamFrame.processAtSubmitLayer', html`
      <app-switch .checked=${!!settings.processAtSubmitLayer} @change=${(e: CustomEvent) => { settings.processAtSubmitLayer = e.detail; save(); }}></app-switch>
          `, {
  tip: "Choose an alternate point in the rendering pipeline for image processing. This is a compatibility and performance experiment.\n\nProcesses frames during SubmitLayer instead of Present. Only needed if processing at Present has no visible effect on your driver.",
  reset: { can: settings.processAtSubmitLayer != defaults.processAtSubmitLayer, on: () => { galaxy.reset('processAtSubmitLayer'); } }
          }));
          parts.push(settingFieldRow('streamFrame.calib.blackout', html`
      <app-switch .checked=${!!settings.calib?.blackout} ?disabled=${!settings.enable} @change=${(e: CustomEvent) => { galaxy.setBlackout(e.detail); }}></app-switch>
      ${!settings.enable ? html`<span class="note">enable Image Processing first</span>` : html``}
          `, {
  tip: "Make the headset image black while keeping tracking and the game running. Use this for testing, not as a way to stop or pause the application.\n\nBlack out the headset's screens to protect from burn in. Tracking, streaming and the game keep running; only the panels go black. Useful while developing or leaving the headset connected. Needs Enable Image Processing on.",
  reset: { can: !!settings.calib?.blackout, on: () => { galaxy.setBlackout(false); } }
          }));
if (vendor) {
        parts.push(sectionHeading(t('Encoder'), 0, 'encoder'));
        parts.push(settingFieldRow('streamFrame.nvencTap', html`
      <app-switch .checked=${!!settings.nvencTap} @change=${(e: CustomEvent) => { settings.nvencTap = e.detail; save(); }}></app-switch>
            `, {
  tip: "Allow this driver to adjust NVIDIA's video encoder. OFF bypasses NVIDIA parameter overrides and post-pack processing; saved tuning is kept. Stream quality, bandwidth, resolution and 10-bit requests still apply. Requires a SteamVR restart.\n\nAn encoder already created with the tap can retain its earlier parameters and API version until SteamVR is closed. The restore action requires SteamVR to be stopped so the next session starts without the tap.",
  reset: { can: settings.nvencTap != defaults.nvencTap, on: () => { galaxy.reset('nvencTap'); } }
            }));
        parts.push(fieldRow(t('Restore Steam Link encoder behaviour'), html`
          <fluent-button appearance="outline" ?disabled=${this.ctx.sds.installingDriver() || this.ctx.startup.status()?.steamvrRunning !== false}
            @click=${() => this.restoreEncoder()}>${t('Restore encoder behaviour')}</fluent-button>
        `, { tip: "Disable NVENC Tap without deleting your custom tuning. Stream quality, bandwidth, resolution, 10-bit requests and other settings are kept. Close SteamVR completely before restoring." }));
        if (!settings.nvencTap) {
          const runtime = this.ctx.startup.status();
          const state = encoderTapStatus(false, runtime);
          parts.push(statusMessage(state === 'restart-required' ? 'warning' : 'info',
            t(state === 'confirmed-off' ? 'NVENC Tap OFF confirmed' : state === 'restart-required' ? 'NVENC Tap OFF: restart required' : 'NVENC Tap OFF saved'),
            t(state === 'confirmed-off' ? 'The current driver process reports no NVENC hook. Your selected stream settings remain active.'
              : state === 'restart-required' ? 'This SteamVR process already installed the hook. Close SteamVR completely and start it again to clear the encoder session.'
              : 'Start SteamVR to verify OFF in a fresh driver process. Old or missing runtime information cannot confirm it.')));
          if (state === 'confirmed-off' && runtime?.encoderTap) {
            parts.push(noteRow(html`${t('Driver configuration')}: ${runtime.encoderTap.configPath}<br />
              ${t('Loaded driver')}: ${runtime.encoderTap.modulePath}`));
          }
        }
if (settings.nvencTap) {
              parts.push(sectionGroup(t('Advanced'), 1));
                parts.push(fieldRow(t('Bandwidth Override (Mbit/s)'), html`
      <app-number .value=${settings.nvencBandwidthOverrideMbit} step="25" min="0" max="600" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencBandwidthOverrideMbit = e.detail; } save(); }}></app-number>
                `, {
  tip: "Override the normal stream bandwidth budget. 0 uses the selected stream preset instead of forcing a separate value.\n\n0 follows the tier (or custom) bandwidth. Nonzero writes both the network pacer and the encoder bitrate at once, replacing the tier value.",
  reset: { can: settings.nvencBandwidthOverrideMbit != defaults.nvencBandwidthOverrideMbit, on: () => { galaxy.reset('nvencBandwidthOverrideMbit'); } }
                }));
                parts.push(fieldRow(t('VBV Frames'), html`
      <app-number .value=${settings.nvencVbvFrames} step="1" min="0" max="30" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencVbvFrames = e.detail; } save(); }}></app-number>
                `, {
  tip: "Set how much video the encoder may buffer. A smaller buffer can reduce delay but makes sudden complex scenes harder to encode cleanly.\n\nVBV = average bitrate per frame times this, which bounds how large any single frame can be. 2 caps vegetation peaks and reset key frames at about two frame budgets, far below the streamer's 2 MB send limit. 0 leaves the streamer's value.",
  reset: { can: settings.nvencVbvFrames != defaults.nvencVbvFrames, on: () => { galaxy.reset('nvencVbvFrames'); } }
                }));
                parts.push(fieldRow(t('Preset Override (P1-P7)'), html`
      <app-number .value=${settings.nvencPreset} step="1" min="0" max="7" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencPreset = e.detail; } save(); }}></app-number>
                `, {
  tip: "Choose the NVIDIA encoding preset. Keep automatic selection unless you are testing a specific quality or latency trade-off.\n\n0 = automatic by NVENC engine count (3 engines: P7, 2: P5, 1: P4; logged as 'preset AUTO'). Higher presets spend more encoder time for better quality at the same bitrate; P7 needs the split across three engines to hold 90 fps.",
  reset: { can: settings.nvencPreset != defaults.nvencPreset, on: () => { galaxy.reset('nvencPreset'); } }
                }));
                parts.push(settingFieldRow('streamFrame.nvencForceCbr', html`
      <app-switch .checked=${!!settings.nvencForceCbr} @change=${(e: CustomEvent) => { settings.nvencForceCbr = e.detail; save(); }}></app-switch>
                `, {
  tip: "Force constant-bitrate encoding. This changes how the encoder spends its bandwidth budget and can alter image quality and latency.\n\nSwitches rate control to constant bitrate with low-delay key-frame scaling. Every frame gets the same budget, so complex scenes get slightly coarser instead of larger and later. Recommended on.",
  reset: { can: settings.nvencForceCbr != defaults.nvencForceCbr, on: () => { galaxy.reset('nvencForceCbr'); } }
                }));
                parts.push(fieldRow(t('CBR Key Frame Budget (x frames)'), html`
      <app-number .value=${settings.nvencLowDelayKfScale} step="1" min="1" max="4" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencLowDelayKfScale = e.detail; } save(); }}></app-number>
                `, {
  tip: "Limit the size of keyframes, which refresh the whole video picture. Large keyframes can create brief network or decoding spikes.\n\nWith Force CBR: how many P-frame budgets the key frame after an encoder reset may spend (1-4). 2 fits inside VBV Frames 2 and gives a sharper key frame than 1.",
  reset: { can: settings.nvencLowDelayKfScale != defaults.nvencLowDelayKfScale, on: () => { galaxy.reset('nvencLowDelayKfScale'); } }
                }));
                parts.push(fieldRow(t('Split-Frame Encoding'), html`
      <app-number .value=${settings.nvencSplitMode} step="1" min="0" max="15" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencSplitMode = e.detail; } save(); }}></app-number>
                `, {
  tip: "Allow multiple NVIDIA encoder engines to share the work, where supported. Availability depends on the GPU and encoding mode.\n\nSpreads each frame across the GPU's NVENC engines. The driver only does this by itself for presets P1-P4; higher presets need it forced or they drop to ~50 fps. 1 = forced, driver picks the strip count (measured best); 2-4 force that many strips; 15 disables; 0 leaves the driver's choice. Nonzero opens the encoder session as API 12.1 (look for 'SESSION UPGRADE' in the log).",
  reset: { can: settings.nvencSplitMode != defaults.nvencSplitMode, on: () => { galaxy.reset('nvencSplitMode'); } }
                }));
                parts.push(fieldRow(t('Foveated QP: Fovea / Periphery Delta'), html`
      <app-number .value=${settings.nvencQpFovea} step="1" min="-10" max="0" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencQpFovea = e.detail; } save(); }}></app-number>
      <app-number .value=${settings.nvencQpPeriphery} step="1" min="0" max="10" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencQpPeriphery = e.detail; } save(); }}></app-number>
                `, {
  tip: "Spend more encoding quality on the center of the image than on the edges. This advanced option can change artifacts in different areas.\n\nMoves bits within the same bitrate: a QP offset per block, negative for the gaze cut-out tile (finer, more bits) and positive for the periphery tile (coarser, fewer bits), blended over the same edge falloff as the sharpening. 0 / 0 = off. Small values (-2 / 2, -3 / 3) work; large ones starve the whole frame.",
  reset: { can: settings.nvencQpFovea != 0 || settings.nvencQpPeriphery != 0, on: () => { settings.nvencQpFovea = 0; settings.nvencQpPeriphery = 0; save(); } }
                }));
                parts.push(settingFieldRow('streamFrame.postPack.limitedRange', html`
      <app-switch .checked=${!!settings.postPack.limitedRange} @change=${(e: CustomEvent) => { settings.postPack.limitedRange = e.detail; settings.postPack.enable = settings.postPack.enable || settings.postPack.limitedRange; save(); }}></app-switch>
                `, {
  tip: "Correct a mismatch between full-range and limited-range video levels. Use this only to diagnose washed-out blacks or crushed shadows; it requires the NVIDIA encoder adjustment path.\n\nSteam Link produces full-range video; the Galaxy XR client handles full-range imperfectly and lifts the 'black floor'. This remaps luma to 16-235 and chroma to 16-240 on the packed frame and tags the stream as limited range, so the headset expands it on its standard path. Measured to fix the black floor with the xrvst2ue-identity APK (no effect on the older Quest-Pro-identity build). Needs the NVENC Tap.",
  reset: { can: settings.postPack.limitedRange != true, on: () => { settings.postPack.limitedRange = true; settings.postPack.enable = settings.postPack.enable || true; save(); } }
                }));

}
}
if (settings.graveyardEnable) {
          parts.push(sectionRow(t('Graveyard (retired experiments)'), sections['graveyard'], 0, () => this.toggleSection('graveyard')));
if (sections.graveyard) {
if (galaxy.controllerSettings) {
const controllerSettings = galaxy.controllerSettings;
              parts.push(settingFieldRow('controllers.aligner.enable', html`
      <app-switch .checked=${!!controllerSettings.aligner.enable} @change=${(e: CustomEvent) => { controllerSettings.aligner.enable = e.detail; save(); }}></app-switch>
              `, {
  tip: "Open the controller alignment workflow to compare tracked poses and adjust held-object alignment. Follow the capture instructions and save a known-good profile first.\n\nInteractive tuning of the controller offsets below, with the controllers themselves. A magenta marker draws where the driver believes the selected controller's TIP is. MANUAL: X switches hand, Y switches position/rotation, A/B cycle the axis, stick adjusts it live. AUTOMATIC (position): plant the tip on any solid surface at chest height away from your body (armrest, desk edge), HOLD THE TRIGGER, slowly swirl a wide cone around the planted tip for a few seconds, release. Swirl again without the trigger to verify: a frozen marker means the offset is right. Rotation is finished manually by aiming. Hold a grip 1.5s to save (paste block + file). Offsets are shared by both hands for now."
              }));
}
if (vendor) {
              parts.push(fieldRow(t('Debug: Skeleton Hand Offset X (cm)'), html`
      <app-number .value=${galaxyXr.skeletonOffsetXCm} step="0.25" min="-10" max="10" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { galaxyXr.skeletonOffsetXCm = e.detail; } save(); }}></app-number>
              `, {
  tip: "Move the animated hand skeleton sideways relative to the controller. This affects compatible hand visuals rather than headset tracking.\n\nMoves the skeletal hand relative to its grip anchor without touching the tracked pose, controller model, or the pivot games rotate held items around. Mirrored to the right hand. Applies LIVE - no restart, watch the hand move as you adjust."
              }));
              parts.push(fieldRow(t('Debug: Skeleton Hand Offset Y (cm)'), html`
      <app-number .value=${galaxyXr.skeletonOffsetYCm} step="0.25" min="-10" max="10" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { galaxyXr.skeletonOffsetYCm = e.detail; } save(); }}></app-number>
              `, {
  tip: "Move the animated hand skeleton vertically relative to the controller. This affects compatible hand visuals.\n\nSecond axis of the live skeletal hand offset. Axes are in the skeleton root frame - identify directions empirically by nudging; changes apply immediately."
              }));
              parts.push(fieldRow(t('Debug: Skeleton Hand Offset Z (cm)'), html`
      <app-number .value=${galaxyXr.skeletonOffsetZCm} step="0.25" min="-10" max="10" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { galaxyXr.skeletonOffsetZCm = e.detail; } save(); }}></app-number>
              `, {
  tip: "Move the animated hand skeleton forward or backward relative to the controller. This affects compatible hand visuals.\n\nThird axis of the live skeletal hand offset. Set skeletonOffsetMirror to false in settings.json if the left hand needs the X direction unmirrored."
              }));
}
            parts.push(settingFieldRow('streamFrame.eyeGaze.probeCapture', html`
      <app-switch .checked=${!!settings.eyeGaze.probeCapture} @change=${(e: CustomEvent) => { settings.eyeGaze.probeCapture = e.detail; save(); }}></app-switch>
            `, {
  tip: "Use a controlled comparison preset for measuring image movement. This changes a group of calibration settings; it is not intended for normal play.\n\nOne switch for an A/B scoring run: acts as Fixation Dot + Swim Probe logging + Warped Overlays together, in the right combination, so nothing can be toggled in the wrong order. Procedure: face forward, flip this on (the dot latches ahead), fixate the dot, rotate your head slowly for 60-90s sweeping it around, flip off, save vrserver.txt. Do one run with the profile off (gain 0) and one with it on, then compare with swimprobe_score.py."
            }));
            parts.push(settingFieldRow('streamFrame.skipColorWhileDashboardOpen', html`
      <app-switch .checked=${!!settings.skipColorWhileDashboardOpen} @change=${(e: CustomEvent) => { settings.skipColorWhileDashboardOpen = e.detail; save(); }}></app-switch>
            `, {
  tip: "Avoid applying color correction twice when the dashboard's custom shader is active. Choose one processing path for a fair comparison.\n\nOnly needed if the custom shader is also enabled with color adjustments: avoids applying them twice while the dashboard is open. Recommended setup for streamed headsets is custom shader off and this off.",
  reset: { can: settings.skipColorWhileDashboardOpen != defaults.skipColorWhileDashboardOpen, on: () => { galaxy.reset('skipColorWhileDashboardOpen'); } }
            }));
            parts.push(settingFieldRow('streamFrame.eyeGaze.calibDot', html`
      <app-switch .checked=${!!settings.eyeGaze.calibDot} @change=${(e: CustomEvent) => { settings.eyeGaze.calibDot = e.detail; save(); }}></app-switch>
            `, {
  tip: "Show a target fixed in the virtual world for gaze and lens-correction tests. Follow the target as directed by the measurement workflow.\n\nDraws a world-locked cyan dot, latched to your view direction the moment it's enabled (toggle off and on to re-center it). Stare at the dot and slowly ROTATE your head in place - don't translate, the dot is at infinity. With the gaze ring on, the red ring should stay centered on the dot. This is the fixation target for swim probe data collection."
            }));
            parts.push(settingFieldRow('streamFrame.eyeGaze.swimProbe', html`
      <app-switch .checked=${!!settings.eyeGaze.swimProbe} @change=${(e: CustomEvent) => { settings.eyeGaze.swimProbe = e.detail; save(); }}></app-switch>
            `, {
  tip: "Record data for measuring image movement as your eyes or head move. Use the probe with the matching calibration tools.\n\nWhile the fixation dot is on, writes throttled SwimProbe lines to vrserver.txt: gaze-vs-dot angular residual (raw and smoothed), head angular velocity, gaze sample age, and per-eye lens UVs of both. This is the raw data for empirical distortion / pupil swim calibration. Leave off when not collecting."
            }));
            parts.push(fieldRow(t('Black Floor: Range Remap'), html`
      <app-select .value=${settings.blackFloor.rangeMode} .options=${[{ value: 'off', label: 'Off' }, { value: 'compress', label: 'Compress (fix crushed blacks below code 16)' }, { value: 'expand', label: 'Expand (fix grey blacks / clipped whites)' }]} @change=${(e: CustomEvent) => { settings.blackFloor.rangeMode = e.detail; save(); }}></app-select>
            `, {
  tip: "Adjust video black levels to diagnose a range mismatch. Incorrect compression or expansion can wash out blacks or erase shadow detail.\n\nFix for a full-vs-limited video range mismatch in the stream chain. Compress: pre-maps into limited range (16-235) before encode - the fix when the first ~8 ramp patches are indistinguishable black (display decoding full as limited). Expand: the inverse - the fix when black looks grey and highlights clip. Leave off unless the ramp bar diagnosed one of the two."
            }));
            parts.push(settingFieldRow('streamFrame.blackFloor.shadowLift', html`
      <app-switch .checked=${!!settings.blackFloor.shadowLift} @change=${(e: CustomEvent) => { settings.blackFloor.shadowLift = e.detail; save(); }}></app-switch>
      <span>F</span>
      <app-number .value=${settings.blackFloor.floorCode} step="0.5" min="0" max="16" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.blackFloor.floorCode = e.detail; } save(); }}></app-number>
      <span>K</span>
      <app-number .value=${settings.blackFloor.kneeCode} step="1" min="2" max="48" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.blackFloor.kneeCode = e.detail; } save(); }}></app-number>
            `, {
  tip: "Brighten the darkest visible shades. Use small values to reveal shadow detail without making black areas look gray.\n\nLifts the deepest shadows before encoding: values below the knee are remapped so black reaches the selected floor, while values above the knee are unchanged. This may make dark detail more visible, but cannot recreate detail already lost elsewhere in the pipeline. Floor 2 / knee 8 is a small starting adjustment. Check near-black test patches; excessive lifting can make blacks look gray."
            }));
            parts.push(fieldRow(t('Field-retired experiments - kept for reproducibility. Each lost a live test. Values here stay ACTIVE while hidden; re-test only if the transport fresh-rate materially improves.'), html`
      
            `, {
  reset: { can: true, on: () => { galaxy.resetGraveyard(); } }
            }));
            parts.push(settingFieldRow('streamFrame.zeroCopyV3', html`
      <app-switch .checked=${!!settings.zeroCopyV3} @change=${(e: CustomEvent) => { settings.zeroCopyV3 = e.detail; save(); }}></app-switch>
            `, {
  tip: "Use an alternate texture-staging path for image processing. This is a performance and compatibility experiment, not a picture-quality control.\n\nPerformance: instead of writing the processed frame back into the layer, it is drawn into a shared shadow texture and the streamer's own per-frame staging copy is redirected to read it - roughly halving this driver's GPU memory traffic on top of Direct Render. Failure mode is benign: any miss ships one unprocessed frame (a brief ungraded flash), the same as a sync timeout skip. Test in a disposable session first: grep the log for 'zero-copy v3: redirect active' to confirm engagement, and 'passthrough' lines to see misses. Turn off if you see persistent unprocessed frames or flicker.",
  reset: { can: settings.zeroCopyV3 != defaults.zeroCopyV3, on: () => { galaxy.reset('zeroCopyV3'); } }
            }));
            parts.push(fieldRow(t('NVENC (retired): AQ Strength'), html`
      <app-number .value=${settings.nvencAqStrength} step="1" min="0" max="15" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencAqStrength = e.detail; } save(); }}></app-number>
            `, {
  tip: "Do not use spatial adaptive quantization for normal play in this build. It has caused encoder stalls in testing, and the driver's safety checks may reset it.\n\nDO NOT USE. Any spatial AQ, at any strength, makes nvEncEncodePicture block 4-6 ms per frame on these tall frames and trips the streamer's 10 ms watchdog (encoder resets, soft key frames, storms). Migration forces it to 0.",
  reset: { can: settings.nvencAqStrength != defaults.nvencAqStrength, on: () => { galaxy.reset('nvencAqStrength'); } }
            }));
            parts.push(fieldRow(t('NVENC (retired): Max QP'), html`
      <app-number .value=${settings.nvencMaxQp} step="1" min="0" max="51" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencMaxQp = e.detail; } save(); }}></app-number>
            `, {
  tip: "Set a lower limit on the encoder's quantization value. This is an advanced quality/bandwidth constraint, not a simple quality slider.\n\nQuality floor per block (0 = off). Fights CBR; can overshoot the 2 MB frame limit in complex scenes.",
  reset: { can: settings.nvencMaxQp != defaults.nvencMaxQp, on: () => { galaxy.reset('nvencMaxQp'); } }
            }));
            parts.push(fieldRow(t('NVENC (retired): Min QP / Min QP intra'), html`
      <app-number .value=${settings.nvencMinQp} step="1" min="0" max="51" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencMinQp = e.detail; } save(); }}></app-number>
      <app-number .value=${settings.nvencMinQpIntra} step="1" min="0" max="51" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencMinQpIntra = e.detail; } save(); }}></app-number>
            `, {
  tip: "Set an upper limit on quantization where the selected rate-control mode uses it. It has no effect in the documented constant-bitrate path.\n\nInert under CBR (the key-frame budget does the containment). Only meaningful with Force CBR off."
            }));
            parts.push(settingFieldRow('streamFrame.nvencBitrateScale', html`
      <app-switch .checked=${!!settings.nvencBitrateScale} @change=${(e: CustomEvent) => { settings.nvencBitrateScale = e.detail; save(); }}></app-switch>
            `, {
  tip: "Preserve the streamer's rate-control configuration. This compatibility behavior stays enabled; it is not a separate quality improvement to tune.\n\nAlways on. The streamer's per-frame request is its real rate control; replacing it outright (off) starves the pacer (R3).",
  reset: { can: settings.nvencBitrateScale != defaults.nvencBitrateScale, on: () => { galaxy.reset('nvencBitrateScale'); } }
            }));
            parts.push(settingFieldRow('streamFrame.nvencPresetMerge', html`
      <app-switch .checked=${!!settings.nvencPresetMerge} @change=${(e: CustomEvent) => { settings.nvencPresetMerge = e.detail; save(); }}></app-switch>
            `, {
  tip: "Choose which encoder preset configuration is used as the starting point. This affects several low-level settings together.\n\nAdopts the canonical preset's multipass / AQ / ref settings besides the preset GUID. Left on; one A/B (P7 with it off) was never run.",
  reset: { can: settings.nvencPresetMerge != defaults.nvencPresetMerge, on: () => { galaxy.reset('nvencPresetMerge'); } }
            }));
            parts.push(fieldRow(t('NVENC (retired): VUI Full Range / Matrix / Primaries / Transfer'), html`
      <app-number .value=${settings.nvencVuiFullRange} step="1" min="-1" max="1" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencVuiFullRange = e.detail; } save(); }}></app-number>
      <app-number .value=${settings.nvencVuiMatrix} step="1" min="-1" max="14" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencVuiMatrix = e.detail; } save(); }}></app-number>
      <app-number .value=${settings.nvencVuiPrimaries} step="1" min="-1" max="22" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencVuiPrimaries = e.detail; } save(); }}></app-number>
      <app-number .value=${settings.nvencVuiTransfer} step="1" min="-1" max="18" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.nvencVuiTransfer = e.detail; } save(); }}></app-number>
            `, {
  tip: "Override video color-range metadata. Leave automatic unless diagnosing a known mismatch; incompatible client handling can darken the image.\n\n-1 leaves the streamer's tags. The correct BT.709 tags (1/1/1) make the client render dim and saturated - the client mishandles explicit tags, so these stay inert until the APK changes."
            }));
            parts.push(fieldRow(t('vrlink (retired): Encode Width'), html`
      <app-number .value=${galaxyXr.customEncodeWidth} step="256" min="512" max="8192" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { galaxyXr.customEncodeWidth = e.detail; } save(); }}></app-number>
            `, {
  tip: "Compatibility value for encoder width. It does not control the actual tile width in the current foveated streaming path.\n\nNo observable effect in foveated mode (the streamer's sampling shader never reads it); written as 3072 for compatibility.",
  reset: { can: galaxyXr.customEncodeWidth != 3072, on: () => { galaxyXr.customEncodeWidth = 3072; save(); } }
            }));
            parts.push(fieldRow(t('vrlink (retired): Max Video Queue Latency (us) / Backoff Recovery Coefficient'), html`
      <app-number .value=${galaxyXr.vrlinkMaxVideoQueueLatencyUs} step="1000" min="0" max="200000" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { galaxyXr.vrlinkMaxVideoQueueLatencyUs = e.detail; } save(); }}></app-number>
      <app-number .value=${galaxyXr.vrlinkBackoffRecoveryCoefficient} step="0.1" min="0" max="100" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { galaxyXr.vrlinkBackoffRecoveryCoefficient = e.detail; } save(); }}></app-number>
            `, {
  tip: "Test undocumented Steam Link settings. 0 or the default value leaves the override unused; there is no guarantee that a particular client reads these keys.\n\nUndocumented streamer keys found in driver_vrlink.dll. No measurable effect in A/B (V1/V2). 0 leaves the streamer's defaults."
            }));
            parts.push(fieldRow(t('Gaze FOV Tangents'), html`
      <span>X</span>
      <app-number .value=${settings.eyeGaze.tanHalfFovX} step="0.02" min="0.3" max="3" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.eyeGaze.tanHalfFovX = e.detail; } save(); }}></app-number>
      <span>Y</span>
      <app-number .value=${settings.eyeGaze.tanHalfFovY} step="0.02" min="0.3" max="3" @change=${(e: CustomEvent) => { if (e.detail !== undefined) { settings.eyeGaze.tanHalfFovY = e.detail; } save(); }}></app-number>
            `, {
  tip: "Set the field-of-view values used to map eye gaze into the image. Incorrect values can misplace gaze-based correction.\n\nHalf-FOV tangents used to map gaze direction to screen position. 1.19 corresponds to ~100 degrees. If the ring moves too far for your gaze, increase; too little, decrease. Tune X with horizontal gaze, Y with vertical."
            }));
}
}
}
}
    return html`<app-system-ready .ctx=${this.ctx}>${this.sectionCardsFor(parts)}</app-system-ready>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-stream-frame-page': StreamFramePage;
  }
}
