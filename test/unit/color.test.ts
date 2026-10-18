import { describe, expect, it } from 'vitest';
import ref from '../fixtures/prototype-reference.json';
import { apcaContrast, wcagContrast } from '../../src/color/contrast';
import { inGamut, maxChroma, softChroma, toRgb8 } from '../../src/color/gamut';
import { composite, parseHex, rgb8ToHex, solveTranslucent } from '../../src/color/hex';
import {
  deltaEOK,
  linearToOklab,
  oklabToLinear,
  oklabToOklch,
  rgb8ToLinear,
  type Rgb8,
} from '../../src/color/oklab';
import { periodicCatmullRom } from '../../src/color/catmullRom';

describe('oklab', () => {
  it('converts #ff0000 to the known OKLCH value', () => {
    const lch = oklabToOklch(linearToOklab(rgb8ToLinear([255, 0, 0])));
    expect(lch.L).toBeCloseTo(0.628, 3);
    expect(lch.C).toBeCloseTo(0.2577, 3);
    expect(lch.h).toBeCloseTo(29.234, 2);
  });

  it('round-trips linear sRGB through OKLab', () => {
    for (const lin of [
      [0.2, 0.5, 0.9],
      [1, 1, 1],
      [0.01, 0.3, 0.02],
    ] as const) {
      const back = oklabToLinear(linearToOklab([...lin]));
      // The published matrices are not exact inverses; ~1e-7 is expected.
      back.forEach((v, i) => expect(v).toBeCloseTo(lin[i]!, 6));
    }
  });
});

describe('gamut', () => {
  it('matches the prototype maxChroma', () => {
    for (const [L, values] of Object.entries(ref.maxChroma)) {
      ref.hues.forEach((h, i) => expect(maxChroma(Number(L), h)).toBeCloseTo(values[i]!, 9));
    }
  });

  it('matches the prototype softChroma and stays under the cap', () => {
    for (const [key, values] of Object.entries(ref.softChroma)) {
      const [L, C] = key.split(',').map(Number) as [number, number];
      ref.hues.forEach((h, i) => {
        const c = softChroma(L, C, h);
        expect(c).toBeCloseTo(values[i]!, 9);
        expect(c).toBeLessThanOrEqual(0.98 * maxChroma(L, h) + 1e-12);
        expect(inGamut({ L, C: c, h })).toBe(true);
      });
    }
  });

  it('is continuous in hue', () => {
    let prev = softChroma(0.54, 0.13, 0);
    for (let h = 0.25; h <= 360; h += 0.25) {
      const c = softChroma(0.54, 0.13, h);
      expect(Math.abs(c - prev)).toBeLessThan(0.003);
      prev = c;
    }
  });

  it('never returns out-of-gamut channels', () => {
    const rgb = toRgb8({ L: 0.5, C: 0.4, h: 200 });
    rgb.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    });
  });
});

describe('contrast', () => {
  it('matches the prototype WCAG and APCA values', () => {
    for (const p of ref.contrast) {
      expect(wcagContrast(p.text as Rgb8, p.bg as Rgb8)).toBeCloseTo(p.wcag, 9);
      expect(apcaContrast(p.text as Rgb8, p.bg as Rgb8)).toBeCloseTo(p.apca, 9);
    }
  });

  it('matches the prototype deltaE', () => {
    for (const p of ref.deltaE) {
      expect(deltaEOK(p.a as Rgb8, p.b as Rgb8)).toBeCloseTo(p.dE, 9);
    }
  });

  it('gives 21:1 for black on white', () => {
    expect(wcagContrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 9);
  });
});

describe('catmullRom', () => {
  it('passes through anchors and is periodic', () => {
    const v = [0, 0, 0.01, 0.04, 0, -0.01, -0.02, -0.02, 0, 0.01, 0, 0];
    expect(periodicCatmullRom(v, 90)).toBeCloseTo(0.04, 12);
    expect(periodicCatmullRom(v, 360 + 45)).toBeCloseTo(periodicCatmullRom(v, 45), 12);
    expect(periodicCatmullRom(v, -15)).toBeCloseTo(periodicCatmullRom(v, 345), 12);
  });
});

describe('hex', () => {
  it('formats and parses', () => {
    expect(rgb8ToHex([255, 0, 16])).toBe('#ff0010');
    expect(rgb8ToHex([255, 0, 16], 0.5)).toBe('#ff001080');
    expect(parseHex('#ff001080')).toEqual({ rgb: [255, 0, 16], alpha: 128 / 255 });
    expect(() => parseHex('#ff00')).toThrow();
  });

  it('solves a translucent color that composites to the target', () => {
    const bg: Rgb8 = [240, 245, 250];
    const target: Rgb8 = [200, 220, 240];
    const r = solveTranslucent(target, bg, 0.5);
    expect(r.clamped).toBe(false);
    composite(r.hex, bg).forEach((v, i) => expect(Math.abs(v - target[i]!)).toBeLessThanOrEqual(1));
  });

  it('raises alpha when the source would leave the gamut', () => {
    const bg: Rgb8 = [250, 250, 250];
    const target: Rgb8 = [60, 60, 60];
    const r = solveTranslucent(target, bg, 0.5);
    expect(r.alpha).toBeGreaterThan(0.7);
    expect(r.clamped).toBe(false);
  });
});
