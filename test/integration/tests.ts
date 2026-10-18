import * as assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { applyEdits, modify, parse } from 'jsonc-parser';
import * as vscode from 'vscode';
import type { TestApi } from '../../src/extension';
import { MANAGED_KEYS, THEME_KEY } from '../../src/settingsKeys';

// Integration tests for plan 12.2. They run against the real configuration
// service of an isolated VSCode instance.

const ROOT = process.env.CM_ROOT!;
const USER_DIR = process.env.CM_USER_DIR!;
const SETTINGS = `${USER_DIR}/settings.json`;
const ORIGINAL_BACKUP = `${USER_DIR}/globalStorage/local.colormanager/backups/settings-original.json`;
const FIXTURE = readFileSync(`${ROOT}/test/fixtures/settings.quirky.jsonc`, 'utf8');
const IGNORED_FOR_COMPARE = [...MANAGED_KEYS, 'colorManager.enabled', 'settingsSync.ignoredSettings', 'workbench.colorTheme'];

const LOG = `${ROOT}/.vscode-test/test/result.log`;
function say(line: string): void {
  console.log(line);
  appendFileSync(LOG, line + '\n');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const read = () => readFileSync(SETTINGS, 'utf8');

/** Removes the keys ColorManager (or the test) may touch, so the rest can be compared byte for byte. */
function stripManaged(text: string): string {
  let out = text;
  for (const key of IGNORED_FOR_COMPARE) {
    out = applyEdits(out, modify(out, [key], undefined, { formattingOptions: { insertSpaces: true, tabSize: 4 } }));
  }
  return out;
}

async function waitFor(cond: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (cond()) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function inspect(key: string): unknown {
  return vscode.workspace.getConfiguration().inspect(key)?.globalValue;
}

/** Writes settings.json directly and waits until VSCode has reloaded it. */
async function writeSettings(text: string): Promise<void> {
  writeFileSync(SETTINGS, text);
  const parsed = parse(text, [], { allowTrailingComma: true }) as Record<string, unknown> | undefined;
  await waitFor(
    () =>
      parsed !== undefined &&
      JSON.stringify(inspect('workbench.colorCustomizations')) === JSON.stringify(parsed['workbench.colorCustomizations']) &&
      inspect('workbench.colorTheme') === parsed['workbench.colorTheme'] &&
      inspect('colorManager.enabled') === parsed['colorManager.enabled'],
    'VSCode to reload settings.json',
  );
  await sleep(300);
}

async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

type Test = { name: string; fn: (api: TestApi) => Promise<void> };
const tests: Test[] = [];
const test = (name: string, fn: Test['fn']) => tests.push({ name, fn });

test('1. leaves everything outside the managed keys byte-identical', async (api) => {
  const r = await api.apply(120);
  assert.equal(r.status, 'written', r.reason);
  assert.equal(stripManaged(read()), stripManaged(FIXTURE));
  for (const k of MANAGED_KEYS) assert.ok((inspect(k) as Record<string, unknown>)[THEME_KEY], `${k} written`);
});

test('8. backs up the original bytes before the first write', async (api) => {
  await api.apply(120);
  assert.equal(readFileSync(ORIGINAL_BACKUP, 'utf8'), FIXTURE);
});

test('2. keeps other theme blocks', async (api) => {
  await api.apply(200);
  const v = inspect('workbench.colorCustomizations') as Record<string, unknown>;
  assert.deepEqual(v['[Monokai]'], { 'editor.background': '#272822' });
});

test('3. does not write while settings.json has unsaved changes', async (api) => {
  await api.apply(10);
  const before = read();
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(SETTINGS));
  const editor = await vscode.window.showTextDocument(doc);
  await editor.edit((e) => e.insert(new vscode.Position(0, 1), ' '));
  assert.ok(doc.isDirty);
  const r = await api.apply(300);
  assert.equal(r.status, 'skipped', r.reason);
  assert.equal(read(), before);
  await closeAllEditors();
});

test('4. does not touch a settings.json with syntax errors', async (api) => {
  const broken = FIXTURE.replace('"workbench.iconTheme": "vscode-icons",', '"workbench.iconTheme": "vscode-icons" "oops",');
  writeFileSync(SETTINGS, broken);
  await sleep(1500);
  const r = await api.apply(40);
  assert.notEqual(r.status, 'written', r.reason);
  assert.equal(read(), broken);
  await writeSettings(FIXTURE);
});

test('6. stops and asks when the theme block was edited by hand', async (api) => {
  let asked = 0;
  api.setUi({ isFocused: () => true, askOverwrite: async () => (asked++, undefined) });
  await api.apply(50);
  const edited = read().replace(/"\[Visual Studio Light\]":\s*\{/, '"[Visual Studio Light]": { "colorManagerTest.handEdited": "#123456",');
  await writeSettings(edited);
  const before = read();
  const r = await api.apply(60);
  assert.equal(r.status, 'blocked', r.reason);
  assert.equal(asked, 1);
  assert.equal(read(), before);
});

test('7. does nothing when another theme is active', async (api) => {
  await writeSettings(FIXTURE.replace('"workbench.colorTheme": "Visual Studio Light"', '"workbench.colorTheme": "Visual Studio Dark"'));
  const before = read();
  const r = await api.apply(70);
  assert.equal(r.status, 'skipped', r.reason);
  assert.equal(read(), before);
});

test('5. Remove Customizations restores the original state', async (api) => {
  api.clearBlock();
  await writeSettings(FIXTURE);
  const r1 = await api.apply(80);
  assert.equal(r1.status, 'written', r1.reason);
  const r2 = await api.remove();
  assert.equal(r2.status, 'written', r2.reason);
  const after = read();
  assert.equal(stripManaged(after), stripManaged(FIXTURE));
  const colors = inspect('workbench.colorCustomizations') as Record<string, unknown>;
  assert.deepEqual(colors, { '[Monokai]': { 'editor.background': '#272822' } });
  assert.equal(inspect('editor.tokenColorCustomizations'), undefined);
  assert.equal(inspect('editor.semanticTokenColorCustomizations'), undefined);
  assert.equal(inspect('colorManager.enabled'), false);
});

export async function runIntegrationTests(api: TestApi): Promise<void> {
  try {
    await writeSettings(FIXTURE);
  } catch (e) {
    say(`[test] setup failed: ${e instanceof Error ? e.stack : String(e)}\nsettings.json now:\n${read()}\ninspect: ${JSON.stringify(inspect('workbench.colorCustomizations'))} ${String(inspect('colorManager.enabled'))}`);
    throw e;
  }
  api.setUi({ isFocused: () => false, notify: () => {} });
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn(api);
      say(`[test] ok   ${t.name}`);
    } catch (e) {
      failed++;
      say(`[test] FAIL ${t.name}\n${e instanceof Error ? e.stack : String(e)}`);
    }
  }
  say(`[test] ${tests.length - failed}/${tests.length} passed`);
  if (failed > 0) throw new Error(`${failed} integration test(s) failed`);
}
