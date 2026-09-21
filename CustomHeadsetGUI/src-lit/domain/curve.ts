// Distortion-curve math for the stream frame curve editor, ported from
// src/app/utilities/stream-frame-curve/stream-frame-curve.component.ts and
// mirrored from FrameProcessor.cpp / vrlink_layer_ps.hlsl.
// Kept framework-free (no Lit, no DOM) so it is unit-testable in plain Node;
// the curve editor component imports from here (single source of truth).
import type { StreamFrameDistortionPoint } from './types';

// math mirrored from FrameProcessor.cpp / vrlink_layer_ps.hlsl / streamframe-visualizer.html
export function evaluateCurve(points: StreamFrameDistortionPoint[], r: number): number {
  if (points.length === 0) return 1.0;
  if (points.length === 1 || r <= points[0].r) return r <= points[0].r ? points[0].scale : points[points.length - 1].scale;
  if (r >= points[points.length - 1].r) return points[points.length - 1].scale;
  let i = 0;
  while (i + 2 < points.length && r > points[i + 1].r) i++;
  const r0 = points[i].r, r1 = points[i + 1].r, v0 = points[i].scale, v1 = points[i + 1].scale;
  const h = r1 - r0;
  if (h <= 0) return v0;
  let m0: number, m1: number;
  if (i === 0) { m0 = (v1 - v0) / h; }
  else { const hr = points[i + 1].r - points[i - 1].r; m0 = hr > 0 ? (points[i + 1].scale - points[i - 1].scale) / hr : 0; }
  if (i + 2 >= points.length) { m1 = (v1 - v0) / h; }
  else { const hr = points[i + 2].r - points[i].r; m1 = hr > 0 ? (points[i + 2].scale - points[i].scale) / hr : 0; }
  const t = (r - r0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * h * m1;
}
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(1e-9, b - a)));
  return t * t * (3 - 2 * t);
}
