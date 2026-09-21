// Unit tests for the distortion-curve math in domain/curve.ts.
// The math mirrors FrameProcessor.cpp / vrlink_layer_ps.hlsl; these tests
// pin the exact evaluation semantics (clamping, pass-through, smoothstep).
import { describe, it, expect } from 'vitest';
import { evaluateCurve, smoothstep } from './curve';

const pts = (r: number, scale: number) => ({ r, scale });

describe('evaluateCurve', () => {
  it('returns 1.0 for an empty point list', () => {
    expect(evaluateCurve([], 0)).toBe(1.0);
    expect(evaluateCurve([], 0.5)).toBe(1.0);
    expect(evaluateCurve([], 1)).toBe(1.0);
  });

  it('returns the single point scale for any r', () => {
    expect(evaluateCurve([pts(0.3, 1.25)], 0)).toBe(1.25);
    expect(evaluateCurve([pts(0.3, 1.25)], 1)).toBe(1.25);
  });

  it('clamps outside the point range to the end scales', () => {
    const points = [pts(0.1, 0.9), pts(0.5, 1.0), pts(0.9, 1.1)];
    expect(evaluateCurve(points, 0)).toBe(0.9);
    expect(evaluateCurve(points, 1)).toBe(1.1);
  });

  it('passes exactly through each stored point', () => {
    const points = [pts(0, 1.0), pts(0.5, 1.1), pts(1, 1.2)];
    for (const p of points) {
      expect(evaluateCurve(points, p.r)).toBeCloseTo(p.scale, 12);
    }
    const four = [pts(0, 0.9), pts(0.33, 1.0), pts(0.66, 1.1), pts(1, 1.2)];
    for (const p of four) {
      expect(evaluateCurve(four, p.r)).toBeCloseTo(p.scale, 10);
    }
  });

  it('evaluates the cubic Hermite segment between points', () => {
    // 3 points with uniform spacing: the curve is exactly linear between knots
    const points = [pts(0, 1.0), pts(0.5, 1.1), pts(1, 1.2)];
    expect(evaluateCurve(points, 0.25)).toBeCloseTo(1.05, 12);
    expect(evaluateCurve(points, 0.75)).toBeCloseTo(1.15, 12);
  });

  it('handles duplicate radii by clamping to the first scale', () => {
    const points = [pts(0.2, 1.0), pts(0.2, 1.3), pts(1, 1.1)];
    expect(evaluateCurve(points, 0.2)).toBe(1.0);
    // r beyond the duplicated knot still resolves to a defined scale
    expect(evaluateCurve(points, 0.6)).toBeGreaterThan(0);
    expect(evaluateCurve(points, 0.6)).toBeLessThan(2);
  });
});

describe('smoothstep', () => {
  it('is 0 below a and 1 above b', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 5)).toBe(1);
  });

  it('is antipodal: f(x) + f(1 - x) = 1', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(smoothstep(0, 1, 0.25) + smoothstep(0, 1, 0.75)).toBeCloseTo(1, 12);
    expect(smoothstep(0, 1, 0.1) + smoothstep(0, 1, 0.9)).toBeCloseTo(1, 12);
  });

  it('is monotonic increasing inside the interval', () => {
    const xs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const ys = xs.map(x => smoothstep(0, 1, x));
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    }
  });

  it('degenerates to a step when a === b (value at the edge is 0)', () => {
    expect(smoothstep(2, 2, 1)).toBe(0);
    expect(smoothstep(2, 2, 2)).toBe(0);
    expect(smoothstep(2, 2, 3)).toBe(1);
  });
});
