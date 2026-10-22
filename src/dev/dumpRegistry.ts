import * as vscode from 'vscode';
import { generateThemeDump } from './generateThemeDump';

// Dumps every registered workbench color id with its transparency
// requirement and its value under plain Visual Studio Light. Run in an
// isolated instance with the Visual Studio Light theme and no customizations.

export interface RegistryEntry {
  needsTransparency: boolean;
  /** "theme" = set by light_vs, "null" = no value, otherwise the resolved hex. */
  vsLightDefault: string;
  source: string;
}

export interface ColorRegistry {
  vscodeVersion: string;
  generatedAt: string;
  colors: Record<string, RegistryEntry>;
}

type Schema = { properties?: Record<string, unknown>; $defs?: Record<string, unknown> };

function resolveRef(schema: Schema, node: unknown, depth = 0): Record<string, unknown> {
  const n = (node ?? {}) as Record<string, unknown>;
  const ref = n.$ref;
  if (typeof ref === 'string' && ref.startsWith('#/$defs/') && depth < 10) {
    return resolveRef(schema, schema.$defs?.[ref.slice('#/$defs/'.length)], depth + 1);
  }
  return n;
}

export async function readWorkbenchColorSchema(): Promise<Map<string, { needsTransparency: boolean; deprecated: boolean }>> {
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.parse('vscode://schemas/workbench-colors'));
  const schema = JSON.parse(new TextDecoder().decode(raw)) as Schema;
  const out = new Map<string, { needsTransparency: boolean; deprecated: boolean }>();
  for (const [id, node] of Object.entries(schema.properties ?? {})) {
    const prop = resolveRef(schema, node);
    const first = resolveRef(schema, (prop.oneOf as unknown[] | undefined)?.[0]);
    out.set(id, {
      needsTransparency: typeof first.pattern === 'string' || typeof prop.pattern === 'string',
      deprecated: prop.deprecationMessage !== undefined || prop.markdownDeprecationMessage !== undefined,
    });
  }
  return out;
}

export async function dumpRegistry(): Promise<ColorRegistry> {
  const schema = await readWorkbenchColorSchema();
  const dump = await generateThemeDump();
  const colors: Record<string, RegistryEntry> = {};
  for (const id of [...schema.keys()].sort()) {
    const s = schema.get(id)!;
    if (s.deprecated) continue;
    const d = dump.get(id);
    colors[id] = {
      needsTransparency: s.needsTransparency,
      vsLightDefault: d === undefined || d.value === null ? 'null' : d.set ? 'theme' : d.value.toLowerCase(),
      source: 'core',
    };
  }
  return { vscodeVersion: vscode.version, generatedAt: new Date().toISOString(), colors };
}
