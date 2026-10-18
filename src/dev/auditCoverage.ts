import * as vscode from 'vscode';
import { generatePalette } from '../palette/generate';
import { buildPayload, type ResolveOptions } from '../payload/build';
import { MANAGED_KEYS, THEME_KEY, type Payload } from '../settingsKeys';
import { generateThemeDump, type ThemeDumpEntry } from './generateThemeDump';

// Plan 7.4: finds colors that do not follow the main hue, i.e. colors that
// still show Visual Studio Light or VSCode default values. Writes directly
// with config.update, so run it only in an isolated instance.

export interface AuditResult {
  written: number;
  leaks: Array<{ id: string; value: string }>;
}

async function applyDirect(payload: Payload): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  for (const key of MANAGED_KEYS) {
    await config.update(key, { [THEME_KEY]: payload[key] }, vscode.ConfigurationTarget.Global);
  }
}

async function dumpAfterApply(payload: Payload): Promise<Map<string, ThemeDumpEntry>> {
  const expected = String(payload['workbench.colorCustomizations']['editor.background']).toLowerCase();
  for (let i = 0; i < 50; i++) {
    const dump = await generateThemeDump();
    if (dump.get('editor.background')?.value?.toLowerCase() === expected) return dump;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('theme did not pick up the written colors');
}

function isTransparent(hex: string): boolean {
  return (hex.length === 9 && hex.slice(7).toLowerCase() === '00') || (hex.length === 5 && hex[4] === '0');
}

export async function auditCoverage(opt?: ResolveOptions, hues: [number, number] = [0, 180]): Promise<AuditResult> {
  const a = buildPayload(generatePalette(hues[0]), undefined, opt);
  const b = buildPayload(generatePalette(hues[1]), undefined, opt);
  await applyDirect(a);
  const dumpA = await dumpAfterApply(a);
  await applyDirect(b);
  const dumpB = await dumpAfterApply(b);
  const written = new Set(Object.keys(a['workbench.colorCustomizations']));
  const leaks: AuditResult['leaks'] = [];
  for (const [id, ea] of dumpA) {
    if (written.has(id)) continue;
    const eb = dumpB.get(id);
    if (!eb || ea.value === null || eb.value === null) continue;
    if (ea.value.toLowerCase() !== eb.value.toLowerCase()) continue;
    if (isTransparent(ea.value)) continue;
    leaks.push({ id, value: ea.value.toLowerCase() });
  }
  leaks.sort((x, y) => x.id.localeCompare(y.id));
  return { written: written.size, leaks };
}
