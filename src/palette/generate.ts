import { apcaContrast } from '../color/contrast';
import { softChroma, toRgb8 } from '../color/gamut';
import { parseHex, rgb8ToHex } from '../color/hex';
import { wrapHue, type Oklch, type Rgb8 } from '../color/oklab';
import { anchorDeltaH, anchorDeltaL } from './anchors';
import { PAIRS } from './guard';
import {
  ALIAS_ROLES,
  ANSI_ROLES,
  BASE_FONT_STYLES,
  BRACKET_ROLES,
  DIFF_ROLES,
  ON_ACCENT_HEX,
  STATUS_ROLES,
  TINT_MIN_L,
  TOKEN_ROLES,
  UI_ROLES,
  type FontStyle,
  type RoleDef,
  type RoleName,
} from './roles';

export interface PaletteColor {
  lch: Oklch;
  rgb: Rgb8;
  /** Alpha to append to the hex as-is (undefined = opaque). */
  alpha?: number;
  fontStyle: FontStyle;
}

export interface GuardAdjustment {
  text: RoleName;
  background: RoleName;
  adjusted: RoleName;
  fromL: number;
  toL: number;
}

export interface Palette {
  hue: number;
  colors: Record<RoleName, PaletteColor>;
  guardAdjustments: GuardAdjustment[];
}

export interface PaletteOptions {
  /** Chroma multiplier for pale surfaces (0.75..1.2). */
  tint: number;
}

export const DEFAULT_PALETTE_OPTIONS: PaletteOptions = { tint: 1 };

function angularDistance(a: number, b: number): number {
  const d = Math.abs(wrapHue(a) - wrapHue(b));
  return d > 180 ? 360 - d : d;
}

function make(L: number, C: number, h: number, extra: Partial<PaletteColor> = {}): PaletteColor {
  const lch = { L, C: softChroma(L, C, h), h: wrapHue(h) };
  return { lch, rgb: toRgb8(lch), fontStyle: '', ...extra };
}

function fromDef(H: number, def: RoleDef, opt: PaletteOptions): PaletteColor {
  let h = def.hue ?? H + (def.offset ?? 0);
  let L = def.L;
  const C = def.L >= TINT_MIN_L ? def.C * opt.tint : def.C;
  if (def.group === 'vivid') {
    L += anchorDeltaL(h);
    h = wrapHue(h + anchorDeltaH(h));
  }
  return make(L, C, h, def.alpha === undefined ? {} : { alpha: def.alpha });
}

export function generatePalette(H: number, opt: PaletteOptions = DEFAULT_PALETTE_OPTIONS): Palette {
  const hue = wrapHue(H);
  const colors = {} as Record<RoleName, PaletteColor>;

  // 1. Surfaces, overlays, text, syntax, bands.
  for (const [name, def] of Object.entries({ ...UI_ROLES, ...TOKEN_ROLES })) {
    colors[name as RoleName] = fromDef(hue, def, opt);
  }
  for (const [name, style] of Object.entries(BASE_FONT_STYLES)) {
    colors[name as RoleName].fontStyle = style ?? '';
  }
  colors.onAccent = { lch: { L: 1, C: 0, h: 0 }, rgb: parseHex(ON_ACCENT_HEX).rgb, fontStyle: '' };

  // 2. Status colors: fixed hue, lightness dodge when the accent comes close.
  const accentHue = colors.accent.lch.h;
  for (const [name, s] of Object.entries(STATUS_ROLES)) {
    const d = angularDistance(accentHue, s.hue);
    const w = d < 40 ? Math.cos((Math.PI * d) / 80) ** 2 : 0;
    colors[name as RoleName] = make(s.L + s.dir * s.amp * w, s.C, s.hue);
  }
  for (const [name, def] of Object.entries({ ...DIFF_ROLES, ...ANSI_ROLES, ...BRACKET_ROLES })) {
    colors[name as RoleName] = fromDef(hue, def, opt);
  }

  // 3. Aliases.
  for (const [name, a] of Object.entries(ALIAS_ROLES)) {
    colors[name as RoleName] = { ...colors[a.of as RoleName], fontStyle: a.fontStyle };
  }

  // 4. Contrast guard (safety net; the default tables never trigger it).
  const guardAdjustments: GuardAdjustment[] = [];
  for (const p of PAIRS) {
    const lc = () => Math.abs(apcaContrast(colors[p.text].rgb, colors[p.background].rgb));
    if (lc() >= p.minLc) continue;
    const adjusted = p.text === 'onAccent' ? p.background : p.text;
    const target = colors[adjusted];
    const fromL = target.lch.L;
    let lo = fromL - 0.15;
    let hi = fromL;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      colors[adjusted] = make(mid, target.lch.C, target.lch.h, { alpha: target.alpha, fontStyle: target.fontStyle });
      if (lc() >= p.minLc) lo = mid;
      else hi = mid;
    }
    colors[adjusted] = make(lo, target.lch.C, target.lch.h, { alpha: target.alpha, fontStyle: target.fontStyle });
    guardAdjustments.push({ text: p.text, background: p.background, adjusted, fromL, toL: lo });
  }

  return { hue, colors, guardAdjustments };
}

export function colorHex(c: PaletteColor): string {
  return rgb8ToHex(c.rgb, c.alpha);
}
