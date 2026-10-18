import { rgb8ToHex, solveTranslucent } from '../color/hex';
import type { Rgb8 } from '../color/oklab';
import { colorHex, type Palette } from '../palette/generate';
import type { RoleName } from '../palette/roles';
import type { Payload } from '../settingsKeys';
import { LITERAL_IDS, REGISTRY, type RegistryEntry } from './registry';
import { buildSemanticRules } from './semantic';
import { buildTextMateRules } from './textmate';
import { WORKBENCH_RULES, type Rule } from './workbenchMap';

/** Bump whenever the palette tables or mappings change (plan 10). */
export const PAYLOAD_VERSION = 1;

/** Below this lightness a translucent color is a plain overlay instead of a solved target. */
const PALE_L = 0.8;

/** Default background a translucent color sits on, by id prefix (plan 6.11). */
function defaultOver(id: string): RoleName {
  return /^(sideBar|list|tree)/.test(id) ? 'sideBar.bg' : 'editor.bg';
}

export interface ResolvedRule {
  rule: Rule;
  role: RoleName;
}

export interface ResolveOptions {
  /** Ids whose VS Light value is a literal (from the coverage audit); fallbacks only apply to these. */
  literals?: ReadonlySet<string>;
}

export function resolveRule(
  id: string,
  entry: RegistryEntry | undefined,
  opt: ResolveOptions = { literals: LITERAL_IDS },
): ResolvedRule | undefined {
  for (const rule of WORKBENCH_RULES) {
    const hit = typeof rule.match === 'string' ? rule.match === id : rule.match.test(id);
    if (!hit) continue;
    if (rule.fallback && (!entry || entry.vsLightDefault === 'null' || !opt.literals?.has(id))) continue;
    const role = typeof rule.role === 'function' ? rule.role(id) : rule.role;
    if (role) return { rule, role };
  }
  return undefined;
}

function mix(a: Rgb8, b: Rgb8, weight: number): Rgb8 {
  return [0, 1, 2].map((i) => Math.round(b[i]! + (a[i]! - b[i]!) * weight)) as Rgb8;
}

export interface BuildReport {
  /** Translucent colors that had to be clamped (should be empty). */
  clamped: string[];
}

export function buildWorkbenchColors(p: Palette, report?: BuildReport, opt?: ResolveOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of Object.keys(REGISTRY).sort()) {
    const entry = REGISTRY[id];
    const resolved = resolveRule(id, entry, opt);
    if (!resolved) continue;
    const { rule, role } = resolved;
    const color = p.colors[role];
    const translucent = rule.alpha !== undefined || entry?.needsTransparency;
    if (!translucent && rule.weight === undefined) {
      out[id] = colorHex(color);
      continue;
    }
    const alpha = rule.alpha ?? 0.5;
    // Strong colors are simply overlaid with alpha (separators, ruler marks).
    if (translucent && rule.weight === undefined && (color.lch.L < PALE_L || role === 'onAccent')) {
      out[id] = rgb8ToHex(color.rgb, alpha);
      continue;
    }
    // Pale targets: solve the translucent color that looks like the target over its background.
    const over = p.colors[rule.over ?? defaultOver(id)].rgb;
    const target = rule.weight === undefined ? color.rgb : mix(color.rgb, over, rule.weight);
    if (!translucent) {
      out[id] = rgb8ToHex(target);
      continue;
    }
    const r = solveTranslucent(target, over, alpha);
    if (r.clamped) report?.clamped.push(id);
    out[id] = r.hex;
  }
  return out;
}

export function buildPayload(p: Palette, report?: BuildReport, opt?: ResolveOptions): Payload {
  return {
    'workbench.colorCustomizations': buildWorkbenchColors(p, report, opt),
    'editor.tokenColorCustomizations': { textMateRules: buildTextMateRules(p) },
    'editor.semanticTokenColorCustomizations': { enabled: true, rules: buildSemanticRules(p) },
  };
}
