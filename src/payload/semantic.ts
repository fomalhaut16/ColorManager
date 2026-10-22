import lightVs from '../../data/light-vs-selectors.json';
import { colorHex, type Palette } from '../palette/generate';
import type { RoleName } from '../palette/roles';

export interface SemanticStyle {
  foreground: string;
  italic: boolean;
  bold: boolean;
  underline: boolean;
  strikethrough: boolean;
}

/** Semantic token selector -> role and italic flag. */
const SEMANTIC_RULES: Array<[string[], RoleName, boolean]> = [
  [['namespace', 'type', 'class', 'interface', 'enum', 'struct', 'typeParameter'], 'tok.type', false],
  [['enumMember'], 'tok.number', false],
  [['function', 'method'], 'tok.function', false],
  [['macro'], 'tok.keyword', false],
  [['decorator'], 'tok.function', true],
  [['parameter'], 'tok.parameter', true],
  [['property', 'event'], 'tok.property', false],
  [['variable'], 'tok.variable', false],
  [['keyword'], 'tok.keyword', false],
  [['comment'], 'tok.comment', true],
  [['string'], 'tok.string', false],
  [['number'], 'tok.number', false],
  [['regexp'], 'tok.regexp', false],
  [['operator'], 'tok.operator', false],
  [['label'], 'fg.secondary', false],
];

export function buildSemanticRules(p: Palette): Record<string, SemanticStyle> {
  const style = (role: RoleName, italic: boolean): SemanticStyle => ({
    foreground: colorHex(p.colors[role]),
    italic,
    bold: false,
    underline: false,
    strikethrough: false,
  });
  const rules: Record<string, SemanticStyle> = {};
  for (const s of lightVs.semantic) rules[s.selector] = style(s.role as RoleName, false);
  for (const [selectors, role, italic] of SEMANTIC_RULES) {
    for (const sel of selectors) rules[sel] = style(role, italic);
  }
  return rules;
}
