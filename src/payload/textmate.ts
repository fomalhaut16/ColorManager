import lightVs from '../../data/light-vs-selectors.json';
import { colorHex, type Palette } from '../palette/generate';
import type { RoleName } from '../palette/roles';

// TextMate rules: one rule per selector, scope as a string,
// fontStyle always explicit so nothing from Visual Studio Light survives.

export interface TextMateRule {
  scope: string;
  settings: { foreground: string; fontStyle: string };
}

/** Rules VSCode appends after ours unless a rule has exactly `scope: "token.info-token"`. */
const DEFAULT_TOKEN_RULES: Array<[string, RoleName]> = [
  ['token.info-token', 'status.info'],
  ['token.warn-token', 'status.warning'],
  ['token.error-token', 'status.error'],
  ['token.debug-token', 'tok.keyword'],
];

/** ColorManager's own selectors. These win over light_vs role assignments for the same string. */
export const OWN_SELECTORS: Array<[string, RoleName]> = [
  ['comment', 'tok.comment'],
  ['punctuation.definition.comment', 'tok.comment'],
  ['keyword', 'tok.keyword'],
  ['keyword.control', 'tok.keyword'],
  ['keyword.operator', 'tok.operator'],
  ['storage.type', 'tok.storage'],
  ['storage.modifier', 'tok.storage'],
  ['entity.name.function', 'tok.function'],
  ['support.function', 'tok.function'],
  ['entity.name.type', 'tok.type'],
  ['entity.name.class', 'tok.type'],
  ['support.class', 'tok.type'],
  ['support.type', 'tok.type'],
  ['string', 'tok.string'],
  ['string.quoted', 'tok.string'],
  ['string.template', 'tok.string'],
  ['constant.numeric', 'tok.number'],
  ['constant.language', 'tok.number'],
  ['variable', 'tok.variable'],
  ['variable.parameter', 'tok.parameter'],
  ['variable.other.property', 'tok.property'],
  ['variable.other.readwrite', 'tok.variable'],
  ['variable.other.constant', 'tok.variable'],
  ['support.type.property-name', 'tok.property'],
  ['punctuation', 'tok.operator'],
  ['string.regexp', 'tok.regexp'],
  ['constant.character.escape', 'tok.escape'],
  ['entity.name.tag', 'tok.tag'],
  ['entity.other.attribute-name', 'tok.attribute'],
  ['meta.decorator', 'tok.decorator'],
  ['entity.name.function.decorator', 'tok.decorator'],
  ['markup.heading', 'md.heading'],
  ['markup.bold', 'md.bold'],
  ['markup.italic', 'md.italic'],
  ['markup.inline.raw', 'tok.string'],
  ['markup.underline.link', 'md.link'],
  ['markup.quote', 'md.quote'],
  ['markup.inserted', 'diff.inserted'],
  ['markup.deleted', 'diff.deleted'],
  ['markup.changed', 'diff.changed'],
];

/** Selector -> role, light_vs first, then ColorManager's own (overriding). */
export function selectorRoles(): Map<string, RoleName> {
  const map = new Map<string, RoleName>();
  for (const s of lightVs.selectors) map.set(s.selector, s.role as RoleName);
  for (const [selector, role] of OWN_SELECTORS) map.set(selector, role);
  return map;
}

export function buildTextMateRules(p: Palette): TextMateRule[] {
  const rule = (scope: string, role: RoleName): TextMateRule => ({
    scope,
    settings: { foreground: colorHex(p.colors[role]), fontStyle: p.colors[role].fontStyle },
  });
  const rules = DEFAULT_TOKEN_RULES.map(([scope, role]) => rule(scope, role));
  for (const [selector, role] of selectorRoles()) rules.push(rule(selector, role));
  return rules;
}
