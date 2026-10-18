import type { Rgb8 } from './oklab';

export const HEX_PATTERN = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

function byte(v: number): string {
  return Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0');
}

export function rgb8ToHex(rgb: Rgb8, alpha?: number): string {
  const base = `#${byte(rgb[0])}${byte(rgb[1])}${byte(rgb[2])}`;
  return alpha === undefined ? base : base + byte(alpha * 255);
}

const CLAMP_TOLERANCE = 3;

export interface TranslucentResult {
  hex: string;
  /** Alpha actually used, quantized to 1/255. */
  alpha: number;
  /** True if the source color had to be clamped even at the maximum alpha. */
  clamped: boolean;
}

/**
 * Finds a translucent color S with alpha a such that S over `background`
 * looks like `target` (plan 6.11). Blending is done per channel on
 * gamma-encoded values, like browsers do.
 */
export function solveTranslucent(
  target: Rgb8,
  background: Rgb8,
  initialAlpha: number,
  maxAlpha = 0.9,
): TranslucentResult {
  for (let a0 = initialAlpha; a0 <= maxAlpha + 1e-9; a0 += 0.05) {
    const alpha = Math.round(a0 * 255) / 255;
    const s = [0, 1, 2].map((i) => background[i]! + (target[i]! - background[i]!) / alpha);
    // A few units outside [0, 255] is invisible once clamped by rgb8ToHex.
    if (s.every((v) => v >= -CLAMP_TOLERANCE && v <= 255 + CLAMP_TOLERANCE)) {
      return { hex: rgb8ToHex(s as Rgb8, alpha), alpha, clamped: false };
    }
  }
  const alpha = Math.round(maxAlpha * 255) / 255;
  const s = [0, 1, 2].map((i) => background[i]! + (target[i]! - background[i]!) / alpha);
  return { hex: rgb8ToHex(s as Rgb8, alpha), alpha, clamped: true };
}

export function parseHex(hex: string): { rgb: Rgb8; alpha: number } {
  if (!HEX_PATTERN.test(hex)) throw new Error(`invalid hex color: ${hex}`);
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return { rgb: [n(1), n(3), n(5)], alpha: hex.length === 9 ? n(7) / 255 : 1 };
}

/** Composites a (possibly translucent) hex color over an opaque background. */
export function composite(hex: string, background: Rgb8): Rgb8 {
  const { rgb, alpha } = parseHex(hex);
  return [0, 1, 2].map((i) => Math.round(rgb[i]! * alpha + background[i]! * (1 - alpha))) as Rgb8;
}
