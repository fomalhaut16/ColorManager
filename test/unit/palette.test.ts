import { describe, expect, it } from 'vitest';
import ref from '../fixtures/prototype-reference.json';
import { apcaContrast, wcagContrast } from '../../src/color/contrast';
import { inGamut } from '../../src/color/gamut';
import { rgb8ToHex } from '../../src/color/hex';
import { deltaEOK } from '../../src/color/oklab';
import { generatePalette, type Palette } from '../../src/palette/generate';
import { PAIRS } from '../../src/palette/guard';
import { STATUS_ROLES, TOKEN_ROLES, type RoleName } from '../../src/palette/roles';
import { hueForSlot } from '../../src/palette/time';

const PROTOTYPE_ROLE_NAMES: Record<string, RoleName> = {
  'editor.bg': 'editor.bg',
  'panel.bg': 'editor.bg',
  'tab.active': 'editor.bg',
  'sidebar.bg': 'sideBar.bg',
  'tab.inactive': 'sideBar.bg',
  'tabs.strip': 'tabs.strip',
  'titleBar.bg': 'titleBar.bg',
  'activityBar.bg': 'activityBar.bg',
  'widget.bg': 'widget.bg',
  'input.bg': 'input.bg',
  border: 'border',
  'border.strong': 'border.strong',
  lineHighlight: 'lineHighlight',
  'hover.list': 'list.hover',
  'sel.list.active': 'list.activeSelection',
  'sel.list.inactive': 'list.inactiveSelection',
  'sel.editor': 'sel.editor',
  'sel.editor.inactive': 'sel.editor.inactive',
  selHighlight: 'selHighlight',
  wordHighlight: 'wordHighlight',
  'find.current': 'find.current',
  'find.other': 'find.other',
  indentGuide: 'indentGuide',
  'indentGuide.active': 'indentGuide.active',
  scrollbar: 'scrollbar',
  'scrollbar.active': 'scrollbar.active',
  lineNumber: 'lineNumber',
  'lineNumber.active': 'lineNumber.active',
  'fg.primary': 'fg.primary',
  'fg.editor': 'editor.fg',
  'fg.secondary': 'fg.secondary',
  'fg.disabled': 'fg.disabled',
  accent: 'accent',
  'accent.hover': 'accent.hover',
  'accent.link': 'textLink',
  focus: 'focus',
  cursor: 'cursor',
  'statusBar.bg': 'statusBar.bg',
  'statusBar.debug': 'statusBar.alt',
  badge: 'accent',
  'button2.bg': 'button.secondary',
};

const hex = (p: Palette, r: RoleName) => rgb8ToHex(p.colors[r].rgb);

describe('generatePalette matches the prototype', () => {
  const palettes = ref.hues.map((h) => generatePalette(h));

  it('UI roles', () => {
    for (const [proto, role] of Object.entries(PROTOTYPE_ROLE_NAMES)) {
      const expected = (ref.roles as Record<string, string[]>)[proto]!;
      palettes.forEach((p, i) => expect(hex(p, role), `${role} @${ref.hues[i]}`).toBe(expected[i]));
    }
  });

  it('anchored token roles', () => {
    for (const [proto, expected] of Object.entries(ref.tokensAnchored)) {
      if (proto === 'decorator') continue; // aliased to function in the final design
      const role = `tok.${proto}` as RoleName;
      palettes.forEach((p, i) => expect(hex(p, role), `${role} @${ref.hues[i]}`).toBe(expected[i]));
    }
  });
});

const ALL_SLOTS = (['normal', 'sky'] as const).flatMap((mode) =>
  Array.from({ length: 96 }, (_, k) => ({ mode, k, palette: generatePalette(hueForSlot(k, mode, 96)) })),
);

describe('palette invariants over all 96 slots in both modes', () => {
  it('never needs the contrast guard', () => {
    for (const s of ALL_SLOTS) expect(s.palette.guardAdjustments, `${s.mode} ${s.k}`).toEqual([]);
  });

  it('keeps every color in gamut', () => {
    for (const s of ALL_SLOTS) {
      for (const [name, c] of Object.entries(s.palette.colors)) {
        if (name === 'onAccent') continue;
        expect(inGamut(c.lch), `${name} ${s.mode} ${s.k}`).toBe(true);
      }
    }
  });

  it('changes less than the JND between adjacent slots', () => {
    for (const mode of ['normal', 'sky'] as const) {
      const slots = ALL_SLOTS.filter((s) => s.mode === mode);
      for (let k = 0; k < 96; k++) {
        const a = slots[k]!.palette.colors;
        const b = slots[(k + 1) % 96]!.palette.colors;
        for (const name of Object.keys(a) as RoleName[]) {
          expect(deltaEOK(a[name].rgb, b[name].rgb), `${name} ${mode} ${k}`).toBeLessThan(0.02);
        }
      }
    }
  });

  it('keeps base token colors apart', () => {
    const names = Object.keys(TOKEN_ROLES) as RoleName[];
    for (const s of ALL_SLOTS) {
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = names[i]!;
          const b = names[j]!;
          const floor = [a, b].sort().join() === 'tok.number,tok.regexp' ? 0.04 : 0.045;
          const d = deltaEOK(s.palette.colors[a].rgb, s.palette.colors[b].rgb);
          expect(d, `${a}/${b} ${s.mode} ${s.k}`).toBeGreaterThanOrEqual(floor);
        }
      }
    }
  });

  it('keeps syntax readable on the selection', () => {
    for (const s of ALL_SLOTS) {
      for (const name of Object.keys(TOKEN_ROLES) as RoleName[]) {
        if (name === 'tok.comment') continue;
        const c = wcagContrast(s.palette.colors[name].rgb, s.palette.colors['sel.editor'].rgb);
        expect(c, `${name} ${s.mode} ${s.k}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('separates status colors from the accent', () => {
    const floors: Record<string, number> = {
      'status.error': 0.075,
      'status.warning': 0.12,
      'status.success': 0.08,
      'status.info': 0.055,
    };
    // Sweep the accent finely around each status hue, not just the 96 slots.
    for (let h = 0; h < 360; h += 0.5) {
      const p = generatePalette(h);
      for (const name of Object.keys(STATUS_ROLES) as RoleName[]) {
        expect(deltaEOK(p.colors[name].rgb, p.colors.accent.rgb), `${name} @${h}`).toBeGreaterThanOrEqual(floors[name]!);
      }
    }
  });

  it('keeps terminal and bracket colors readable on the editor background', () => {
    const floor = (name: string) =>
      name === 'ansi.brightWhite' ? 40 : name.startsWith('ansi.bright') ? 55 : 60;
    for (const s of ALL_SLOTS) {
      for (const name of Object.keys(s.palette.colors) as RoleName[]) {
        if (!name.startsWith('ansi.') && !name.startsWith('bracket.')) continue;
        const lc = Math.abs(apcaContrast(s.palette.colors[name].rgb, s.palette.colors['editor.bg'].rgb));
        expect(lc, `${name} ${s.mode} ${s.k}`).toBeGreaterThanOrEqual(floor(name));
      }
    }
  });

  it('declares contrast pairs only between known roles', () => {
    const p = ALL_SLOTS[0]!.palette;
    for (const pair of PAIRS) {
      expect(p.colors[pair.text]).toBeDefined();
      expect(p.colors[pair.background]).toBeDefined();
    }
  });
});

describe('tint', () => {
  it('scales pale surfaces only', () => {
    const base = generatePalette(150);
    const calm = generatePalette(150, { tint: 0.75 });
    expect(calm.colors['sideBar.bg'].lch.C).toBeLessThan(base.colors['sideBar.bg'].lch.C);
    expect(calm.colors.accent.lch.C).toBe(base.colors.accent.lch.C);
  });
});
