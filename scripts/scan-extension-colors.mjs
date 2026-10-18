// Collects colors contributed by installed extensions (read-only scan of their
// package.json files) into data/color-registry.extensions.json.
// Usage: node scripts/scan-extension-colors.mjs [extensions-dir]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = process.argv[2] ?? join(homedir(), '.vscode/extensions');
const core = JSON.parse(readFileSync(join(root, 'data/color-registry.core.json'), 'utf8')).colors;

// extensions.json lists the versions VSCode actually uses.
const index = JSON.parse(readFileSync(join(extDir, 'extensions.json'), 'utf8'));
const colors = {};
const sources = [];
for (const item of index) {
  const dir = item.relativeLocation ? join(extDir, item.relativeLocation) : item.location?.path;
  if (!dir || !existsSync(join(dir, 'package.json'))) continue;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const contributed = pkg.contributes?.colors;
  if (!Array.isArray(contributed) || contributed.length === 0) continue;
  const extId = `${pkg.publisher}.${pkg.name}`.toLowerCase();
  sources.push(`${extId}@${pkg.version}`);
  for (const c of contributed) {
    if (!c?.id || core[c.id]) continue;
    const light = c.defaults?.light;
    let vsLightDefault;
    if (light === null || light === undefined) vsLightDefault = 'null';
    else if (typeof light === 'string' && light.startsWith('#')) vsLightDefault = light.toLowerCase();
    else if (typeof light === 'string') vsLightDefault = `ref:${light}`;
    else vsLightDefault = 'ref:transform';
    colors[c.id] = {
      needsTransparency: /^#[0-9a-f]{8}$/.test(vsLightDefault) && !vsLightDefault.endsWith('ff'),
      vsLightDefault,
      source: `extension:${extId}`,
    };
  }
}

const sorted = Object.fromEntries(Object.entries(colors).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(
  join(root, 'data/color-registry.extensions.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), sources, colors: sorted }, null, 2) + '\n',
);
console.log(`wrote data/color-registry.extensions.json: ${Object.keys(sorted).length} colors from ${sources.length} extensions`);
