import { linearToRgb8, oklchToLinear, type Oklch, type Rgb8 } from './oklab';

const EPS = 1e-6;

export function inGamut(c: Oklch): boolean {
  const lin = oklchToLinear(c);
  return lin.every((v) => v >= -EPS && v <= 1 + EPS);
}

/** Largest chroma that stays inside sRGB at the given L and h (40-step bisection on [0, 0.5]). */
export function maxChroma(L: number, h: number): number {
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ L, C: mid, h })) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Smooth min(C, 0.98 * maxC). Always below the gamut cap and continuous in hue,
 * so a full hue rotation has no seams.
 */
export function softChroma(L: number, C: number, h: number): number {
  if (C <= 0) return 0;
  const cap = 0.98 * maxChroma(L, h);
  if (cap <= 0) return 0;
  return (C ** -6 + cap ** -6) ** (-1 / 6);
}

/** Converts to 8-bit sRGB, reducing chroma (never clipping channels) if the color is out of gamut. */
export function toRgb8(c: Oklch): Rgb8 {
  const C = Math.min(c.C, maxChroma(c.L, c.h));
  return linearToRgb8(oklchToLinear({ L: c.L, C, h: c.h }));
}
