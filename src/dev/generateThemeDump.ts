import * as vscode from 'vscode';

// Reads the output of "Developer: Generate Color Theme From Current Settings".
// The output is JSONC with commented-out lines, so parse per line.

export interface ThemeDumpEntry {
  /** True when the color is set by the theme or customizations (an uncommented key). */
  set: boolean;
  /** Resolved hex value, or null when the color has no value. */
  value: string | null;
}

const LINE = /^\s*(\/\/)?"([^"]+)":\s*(null|"(#[0-9a-fA-F]{3,8})")/;

export function parseThemeDump(text: string): Map<string, ThemeDumpEntry> {
  const out = new Map<string, ThemeDumpEntry>();
  let inColors = false;
  for (const line of text.split('\n')) {
    if (/^\s*"colors":\s*\{/.test(line)) {
      inColors = true;
      continue;
    }
    if (inColors && /^\s*\},?\s*$/.test(line)) break;
    if (!inColors) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    out.set(m[2]!, { set: !m[1], value: m[3] === 'null' ? null : (m[4] ?? null) });
  }
  return out;
}

export async function generateThemeDump(): Promise<Map<string, ThemeDumpEntry>> {
  const before = new Set(vscode.workspace.textDocuments);
  await vscode.commands.executeCommand('workbench.action.generateColorTheme');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const doc = vscode.workspace.textDocuments.find(
      (d) => !before.has(d) && d.uri.scheme === 'untitled' && d.getText().includes('vscode://schemas/color-theme'),
    );
    if (doc) {
      const text = doc.getText();
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      return parseThemeDump(text);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('generateColorTheme output did not appear within 5 seconds');
}
