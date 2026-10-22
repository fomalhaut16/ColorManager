// Extracts every tokenColors selector and semantic selector from the built-in
// Visual Studio Light theme and assigns a ColorManager role.
// Usage: npm run extract-light-vs [-- "/path/to/Visual Studio Code.app"]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2] ?? '/Applications/Visual Studio Code.app';
const themePath = join(app, 'Contents/Resources/app/extensions/theme-defaults/themes/light_vs.json');
const productPath = join(app, 'Contents/Resources/app/product.json');

const RULES = [
  [/^comment/, 'tok.comment'],
  [/^string\.regexp/, 'tok.regexp'],
  [/^string meta\.image/, 'tok.string'],
  [/^(string|markup\.inline\.raw|meta\.embedded\.assembly)/, 'tok.string'],
  [/^constant\.character/, 'tok.escape'],
  [/^constant|^support\.constant/, 'tok.number'],
  [/^keyword\.operator\.(new|expression|cast|sizeof|alignof|typeid|alignas|instanceof|logical\.python|wordlike)/, 'tok.keyword'],
  [/^keyword\.operator/, 'tok.operator'],
  [/^keyword/, 'tok.keyword'],
  [/^storage/, 'tok.storage'],
  [/^(entity\.name\.function|support\.function)/, 'tok.function'],
  [/^(entity\.name\.(type|class|namespace|scope-resolution)|support\.(type(?!\.property-name)|class)|entity\.other\.inherited-class)/, 'tok.type'],
  [/^(entity\.name\.tag|entity\.name\.selector)/, 'tok.tag'],
  [/^entity\.other\.attribute-name|^source\.css(\.less)? entity\.other\.attribute-name/, 'tok.attribute'],
  [/^variable\.parameter/, 'tok.parameter'],
  [/^(support\.variable|variable\.other\.(property|object\.property)|meta\.object-literal\.key|support\.type\.property-name|meta\.structure\.dictionary\.key\.python)/, 'tok.property'],
  [/^(variable|source\.css variable)/, 'tok.variable'],
  [/^punctuation/, 'tok.operator'],
  [/^(meta\.decorator|entity\.name\.decorator)/, 'tok.decorator'],
  [/^markup\.heading/, 'md.heading'],
  [/^(markup\.bold|strong)/, 'md.bold'],
  [/^(markup\.italic|emphasis)/, 'md.italic'],
  [/^markup\.underline/, 'md.link'],
  [/^markup\.strikethrough/, 'md.strike'],
  [/^markup\.(quote|list)/, 'md.quote'],
  [/^markup\.inserted/, 'diff.inserted'],
  [/^markup\.deleted/, 'diff.deleted'],
  [/^markup\.changed/, 'diff.changed'],
  [/^meta\.diff\.header/, 'diff.header'],
  [/^invalid/, 'status.error'],
  [/^meta\.preprocessor/, 'tok.keyword'],
  [/^(meta\.tag|meta\.selector|meta\.template\.expression|meta\.embedded)$|^source\.\w+\.embedded$/, 'fg'],
];

const SEMANTIC_ROLES = {
  newOperator: 'tok.keyword',
  stringLiteral: 'tok.string',
  customLiteral: 'editor.fg',
  numberLiteral: 'tok.number',
};

const theme = parse(readFileSync(themePath, 'utf8'));
const product = JSON.parse(readFileSync(productPath, 'utf8'));
const selectors = [];
const seen = new Set();
const unmatched = [];
for (const rule of theme.tokenColors) {
  if (!rule.scope) continue;
  const scopes = Array.isArray(rule.scope) ? rule.scope : rule.scope.split(',');
  for (const raw of scopes) {
    const selector = raw.trim();
    if (seen.has(selector)) continue;
    seen.add(selector);
    const hit = RULES.find(([re]) => re.test(selector));
    if (!hit) unmatched.push(selector);
    selectors.push({ selector, role: hit?.[1], themeFontStyle: rule.settings.fontStyle ?? null });
  }
}
if (unmatched.length > 0) {
  console.error(`no role for: ${unmatched.join(', ')}`);
  process.exit(1);
}
const semantic = Object.keys(theme.semanticTokenColors ?? {}).map((selector) => {
  const role = SEMANTIC_ROLES[selector];
  if (!role) {
    console.error(`no role for semantic selector: ${selector}`);
    process.exit(1);
  }
  return { selector, role };
});

const out = {
  vscodeVersion: product.version ?? 'unknown',
  source: 'theme-defaults/themes/light_vs.json',
  workbenchColors: Object.keys(theme.colors ?? {}),
  selectors,
  semantic,
};
writeFileSync(join(root, 'data/light-vs-selectors.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote data/light-vs-selectors.json: ${selectors.length} selectors, ${semantic.length} semantic, ${out.workbenchColors.length} colors`);
