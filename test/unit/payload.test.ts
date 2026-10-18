import { describe, expect, it } from 'vitest';
import lightVs from '../../data/light-vs-selectors.json';
import { generatePalette } from '../../src/palette/generate';
import { hueForSlot } from '../../src/palette/time';
import { buildPayload, resolveRule, type BuildReport } from '../../src/payload/build';
import { REGISTRY } from '../../src/payload/registry';
import { validatePayload } from '../../src/payload/validate';
import { ansiRole, bracketRole, symbolIconRole } from '../../src/payload/workbenchMap';

const payload = buildPayload(generatePalette(209.234));
const colors = payload['workbench.colorCustomizations'] as Record<string, string>;
const textMate = payload['editor.tokenColorCustomizations'].textMateRules as Array<{
  scope: string;
  settings: { foreground: string; fontStyle: string };
}>;
const semantic = payload['editor.semanticTokenColorCustomizations'].rules as Record<string, Record<string, unknown>>;

describe('buildPayload', () => {
  it('produces a valid payload for every slot of both modes', () => {
    for (const mode of ['normal', 'sky'] as const) {
      for (let k = 0; k < 96; k += 1) {
        const report: BuildReport = { clamped: [] };
        const p = buildPayload(generatePalette(hueForSlot(k, mode, 96)), report);
        expect(validatePayload(p), `${mode} ${k}`).toEqual([]);
        expect(report.clamped, `${mode} ${k}`).toEqual([]);
      }
    }
  });

  it('covers every color Visual Studio Light defines', () => {
    for (const id of lightVs.workbenchColors) expect(colors[id], id).toBeDefined();
  });

  it('never applies generic fallbacks to ids whose VS Light value is null', () => {
    for (const [id, entry] of Object.entries(REGISTRY)) {
      if (entry.vsLightDefault !== 'null') continue;
      const r = resolveRule(id, entry);
      expect(r?.rule.fallback ?? false, id).toBe(false);
    }
  });

  it('writes translucent values for ids that require transparency', () => {
    for (const [id, entry] of Object.entries(REGISTRY)) {
      if (!entry.needsTransparency || colors[id] === undefined) continue;
      expect(colors[id]!.length, id).toBe(9);
    }
  });

  it('contains every light_vs selector exactly once with an explicit fontStyle', () => {
    const scopes = textMate.map((r) => r.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
    for (const s of lightVs.selectors) expect(scopes, s.selector).toContain(s.selector);
    for (const r of textMate) expect(typeof r.settings.fontStyle).toBe('string');
  });

  it('keeps Markdown emphasis styles', () => {
    const style = (scope: string) => textMate.find((r) => r.scope === scope)?.settings.fontStyle;
    expect(style('markup.heading')).toBe('bold');
    expect(style('markup.bold')).toBe('bold');
    expect(style('strong')).toBe('bold');
    expect(style('markup.italic')).toBe('italic');
    expect(style('emphasis')).toBe('italic');
    expect(style('markup.underline')).toBe('underline');
    expect(style('markup.strikethrough')).toBe('strikethrough');
    expect(style('comment')).toBe('italic');
    expect(style('keyword')).toBe('');
  });

  it('starts with the four default token rules as string scopes', () => {
    expect(textMate.slice(0, 4).map((r) => r.scope)).toEqual([
      'token.info-token',
      'token.warn-token',
      'token.error-token',
      'token.debug-token',
    ]);
  });

  it('defines the light_vs semantic selectors with explicit styles', () => {
    for (const s of lightVs.semantic) {
      expect(semantic[s.selector], s.selector).toMatchObject({ italic: false, bold: false });
    }
    expect(semantic.parameter).toMatchObject({ italic: true });
    expect(semantic.decorator).toMatchObject({ italic: true });
  });
});

describe('role helpers', () => {
  it('maps terminal, bracket and symbol ids', () => {
    expect(ansiRole('terminal.ansiBrightYellow')).toBe('ansi.brightYellow');
    expect(ansiRole('terminal.ansiBlack')).toBe('ansi.black');
    expect(bracketRole('editorBracketHighlight.foreground4')).toBe('bracket.4');
    expect(symbolIconRole('symbolIcon.methodForeground')).toBe('tok.function');
    expect(symbolIconRole('symbolIcon.snippetForeground')).toBe('fg.secondary');
  });
});

describe('validatePayload', () => {
  it('rejects bad hex, opaque translucent colors and wrong counts', () => {
    const translucentId = Object.entries(REGISTRY).find(([id, e]) => e.needsTransparency && colors[id])![0];
    const broken = structuredClone(payload);
    broken['workbench.colorCustomizations']['editor.background'] = 'red';
    broken['workbench.colorCustomizations'][translucentId] = '#123456';
    const errors = validatePayload(broken);
    expect(errors.some((e) => e.includes('editor.background'))).toBe(true);
    expect(errors.some((e) => e.includes(translucentId))).toBe(true);

    const few = structuredClone(payload);
    few['editor.tokenColorCustomizations'] = { textMateRules: [] };
    expect(validatePayload(few).some((e) => e.includes('textMateRules count'))).toBe(true);
  });
});

describe('coverage audit', () => {
  it('leaves no Visual Studio Light colors except allowlisted ones', async () => {
    const report = (await import('../../data/coverage-report.json')).default as { leaks: Array<{ id: string }> };
    const allow = (await import('../../data/coverage-allowlist.json')).default as { ids: Record<string, string> };
    const unexpected = report.leaks.map((l) => l.id).filter((id) => !(id in allow.ids));
    expect(unexpected).toEqual([]);
  });
});
