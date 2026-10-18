import { beforeEach, describe, expect, it } from 'vitest';
import { valueHash } from '../../src/canonical';
import { OwnershipRecord, type StateStore } from '../../src/ownership';
import { analyzeSettingsText } from '../../src/settingsFile';
import { MANAGED_KEYS, THEME_KEY, type ManagedKey, type Payload } from '../../src/settingsKeys';
import { SettingsWriter, type OverwriteAnswer, type WriterDeps } from '../../src/settingsWriter';

const enc = new TextEncoder();

class MemoryState implements StateStore {
  data = new Map<string, unknown>();
  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }
  async update(key: string, value: unknown) {
    if (value === undefined) this.data.delete(key);
    else this.data.set(key, structuredClone(value));
  }
}

/** Simulates VSCode: a settings object rendered to text, plus the in-memory config. */
class FakeVSCode {
  settings: Record<string, unknown> = { 'workbench.colorTheme': 'Visual Studio Light', 'editor.fontSize': 14 };
  /** Extra raw text appended inside the root object, e.g. comments. */
  rawSuffix = '';
  textOverride: string | undefined;
  dirty = false;
  rejectUpdates = false;
  /** When set, inspect() lags behind the file for this key. */
  staleKey: string | undefined;
  updates: Array<{ key: string; value: unknown }> = [];

  text(): string {
    if (this.textOverride !== undefined) return this.textOverride;
    const body = JSON.stringify(this.settings, null, '\t');
    return this.rawSuffix ? body.replace(/\n}$/, `,\n${this.rawSuffix}\n}`) : body;
  }
  inspectGlobal(key: string): unknown {
    if (key === this.staleKey) return undefined;
    return structuredClone(this.settings[key]);
  }
  async update(key: string, value: unknown) {
    if (this.rejectUpdates) throw new Error('ERROR_CONFIGURATION_FILE_MODIFIED_SINCE');
    this.updates.push({ key, value });
    if (value === undefined) delete this.settings[key];
    else this.settings[key] = structuredClone(value);
  }
}

function payload(tag: string): Payload {
  return {
    'workbench.colorCustomizations': { 'editor.background': `#e0f5f8`, tag },
    'editor.tokenColorCustomizations': { textMateRules: [{ scope: 'comment', settings: { foreground: '#123456', fontStyle: '' } }], tag },
    'editor.semanticTokenColorCustomizations': { enabled: true, rules: { function: { foreground: '#654321' } }, tag },
  };
}

interface Harness {
  vs: FakeVSCode;
  state: MemoryState;
  writer: SettingsWriter;
  backups: { original?: string; snapshots: string[] };
  ui: { focused: boolean; answer: OverwriteAnswer; dropComments: boolean | undefined; asked: number; notes: string[] };
  enabled: { value: boolean };
  theme: { active: boolean };
}

function harness(): Harness {
  const vs = new FakeVSCode();
  const state = new MemoryState();
  const backups: Harness['backups'] = { snapshots: [] };
  const ui: Harness['ui'] = { focused: true, answer: undefined, dropComments: undefined, asked: 0, notes: [] };
  const enabled = { value: true };
  const theme = { active: true };
  const deps: WriterDeps = {
    config: { inspectGlobal: (k) => vs.inspectGlobal(k), update: (k, v) => vs.update(k, v) },
    file: { read: async () => enc.encode(vs.text()), isDirty: () => vs.dirty },
    backups: {
      hasOriginal: async () => backups.original !== undefined,
      writeOriginal: async (b) => void (backups.original = new TextDecoder().decode(b)),
      writeSnapshot: async (b) => void backups.snapshots.push(new TextDecoder().decode(b)),
    },
    state,
    ownership: new OwnershipRecord(state),
    ui: {
      isFocused: () => ui.focused,
      askOverwrite: async () => (ui.asked++, ui.answer),
      askDropComments: async () => (ui.asked++, ui.dropComments),
      notify: (m) => void ui.notes.push(m),
    },
    log: () => {},
    now: () => new Date(2026, 9, 18, 12, 0),
    isEnabled: () => enabled.value,
    setEnabled: async (v) => void (enabled.value = v),
    isTargetThemeActive: () => theme.active,
    validate: () => [],
    slotHashes: () => new Set(),
  };
  return { vs, state, writer: new SettingsWriter(deps), backups, ui, enabled, theme };
}

const sub = (vs: FakeVSCode, key: ManagedKey) => (vs.settings[key] as Record<string, unknown> | undefined)?.[THEME_KEY];

describe('SettingsWriter.apply', () => {
  let h: Harness;
  beforeEach(() => (h = harness()));

  it('writes all three keys and backs up the original bytes once', async () => {
    const before = h.vs.text();
    const r = await h.writer.apply(payload('a'));
    expect(r.status).toBe('written');
    for (const k of MANAGED_KEYS) expect(sub(h.vs, k)).toEqual(payload('a')[k]);
    expect(h.backups.original).toBe(before);
    expect(h.backups.snapshots).toHaveLength(1);
    await h.writer.apply(payload('b'));
    expect(h.backups.original).toBe(before);
    expect(h.backups.snapshots).toHaveLength(1); // at most once per day
  });

  it('keeps other theme blocks and other keys', async () => {
    h.vs.settings['workbench.colorCustomizations'] = { '[Monokai]': { 'editor.background': '#000000' }, 'editor.foreground': '#111111' };
    await h.writer.apply(payload('a'));
    const v = h.vs.settings['workbench.colorCustomizations'] as Record<string, unknown>;
    expect(v['[Monokai]']).toEqual({ 'editor.background': '#000000' });
    expect(v['editor.foreground']).toBe('#111111');
    expect(h.vs.settings['editor.fontSize']).toBe(14);
  });

  it('does nothing when values already match', async () => {
    await h.writer.apply(payload('a'));
    h.vs.updates = [];
    expect((await h.writer.apply(payload('a'))).status).toBe('unchanged');
    expect(h.vs.updates).toEqual([]);
  });

  it('skips when the file is dirty, broken or out of sync', async () => {
    h.vs.dirty = true;
    expect((await h.writer.apply(payload('a'))).status).toBe('skipped');
    h.vs.dirty = false;
    h.vs.textOverride = '{ "a": ';
    expect((await h.writer.apply(payload('a'))).status).toBe('skipped');
    h.vs.textOverride = undefined;
    h.vs.settings['editor.tokenColorCustomizations'] = { '[Monokai]': {} };
    h.vs.staleKey = 'editor.tokenColorCustomizations';
    expect((await h.writer.apply(payload('a'))).status).toBe('skipped');
    expect(h.vs.updates).toEqual([]);
  });

  it('skips when disabled or the theme is not active', async () => {
    h.enabled.value = false;
    expect((await h.writer.apply(payload('a'))).status).toBe('skipped');
    h.enabled.value = true;
    h.theme.active = false;
    expect((await h.writer.apply(payload('a'))).status).toBe('skipped');
    expect(h.vs.updates).toEqual([]);
  });

  it('refuses non-object values', async () => {
    h.vs.settings['workbench.colorCustomizations'] = 'oops';
    expect((await h.writer.apply(payload('a'))).status).toBe('blocked');
    expect(h.vs.updates).toEqual([]);
  });

  it('rejects an invalid payload without writing', async () => {
    const deps = (h.writer as unknown as { d: WriterDeps }).d;
    deps.validate = () => ['bad hex'];
    expect((await h.writer.apply(payload('a'))).status).toBe('invalid');
    expect(h.vs.updates).toEqual([]);
  });

  it('stops before writing any key if one was hand-edited', async () => {
    await h.writer.apply(payload('a'));
    (h.vs.settings['editor.semanticTokenColorCustomizations'] as Record<string, unknown>)[THEME_KEY] = { enabled: false };
    h.vs.updates = [];
    h.ui.answer = undefined; // dismissed
    expect((await h.writer.apply(payload('b'))).status).toBe('blocked');
    expect(h.vs.updates).toEqual([]);
    expect(h.ui.asked).toBe(1);
    // Stays blocked without asking again until Apply Now.
    expect((await h.writer.apply(payload('b'))).status).toBe('blocked');
    expect(h.ui.asked).toBe(1);
    h.writer.clearBlock();
    h.ui.answer = 'overwrite';
    const snapshotsBefore = h.backups.snapshots.length;
    expect((await h.writer.apply(payload('b'))).status).toBe('written');
    expect(h.backups.snapshots.length).toBe(snapshotsBefore + 1);
  });

  it('pauses when the user chooses pause', async () => {
    h.vs.settings['workbench.colorCustomizations'] = { [THEME_KEY]: { 'editor.background': '#ffffff' } };
    h.ui.answer = 'pause';
    expect((await h.writer.apply(payload('a'))).status).toBe('blocked');
    expect(h.enabled.value).toBe(false);
  });

  it('does not ask without focus', async () => {
    h.vs.settings['workbench.colorCustomizations'] = { [THEME_KEY]: { 'editor.background': '#ffffff' } };
    h.ui.focused = false;
    expect((await h.writer.apply(payload('a'))).status).toBe('blocked');
    expect(h.ui.asked).toBe(0);
  });

  it('accepts values written by earlier versions or other windows', async () => {
    await h.writer.apply(payload('old')); // remembered in the ring
    expect((await h.writer.apply(payload('new'))).status).toBe('written');
    expect(h.ui.asked).toBe(0);

    const h2 = harness();
    const other = payload('other-window');
    for (const k of MANAGED_KEYS) h2.vs.settings[k] = { [THEME_KEY]: other[k] };
    const deps = (h2.writer as unknown as { d: WriterDeps }).d;
    deps.slotHashes = (k) => new Set([valueHash(other[k])]);
    expect((await h2.writer.apply(payload('mine'))).status).toBe('written');
    expect(h2.ui.asked).toBe(0);
  });

  it('asks before dropping comments inside managed keys', async () => {
    h.vs.settings['workbench.colorCustomizations'] = {};
    h.vs.textOverride = '{\n"workbench.colorTheme": "Visual Studio Light",\n"editor.fontSize": 14,\n"workbench.colorCustomizations": { // mine\n}\n}';
    h.ui.dropComments = false;
    expect((await h.writer.apply(payload('a'))).status).toBe('blocked');
    expect(h.vs.updates).toEqual([]);
  });

  it('reports a rejected update as failed', async () => {
    h.vs.rejectUpdates = true;
    expect((await h.writer.apply(payload('a'))).status).toBe('failed');
  });

  it('records the hash before calling update', async () => {
    h.vs.rejectUpdates = true;
    await h.writer.apply(payload('a'));
    const ring = new OwnershipRecord(h.state).ring();
    expect(ring).toContain(valueHash(payload('a')['workbench.colorCustomizations']));
  });
});

describe('SettingsWriter.remove', () => {
  it('restores the original state', async () => {
    const h = harness();
    h.vs.settings['workbench.colorCustomizations'] = { '[Monokai]': { 'editor.background': '#000000' } };
    const before = structuredClone(h.vs.settings);
    await h.writer.apply(payload('a'));
    expect((await h.writer.remove()).status).toBe('written');
    expect(h.vs.settings).toEqual(before);
    expect(h.enabled.value).toBe(false);
    expect(new OwnershipRecord(h.state).ring()).toEqual([]);
  });

  it('restores a pre-existing theme block', async () => {
    const h = harness();
    const mine = { 'editor.background': '#ffffff' };
    h.vs.settings['workbench.colorCustomizations'] = { [THEME_KEY]: mine };
    h.ui.answer = 'overwrite';
    await h.writer.apply(payload('a'));
    await h.writer.remove();
    expect(sub(h.vs, 'workbench.colorCustomizations')).toEqual(mine);
    expect(h.vs.settings['editor.tokenColorCustomizations']).toBeUndefined();
  });

  it('refuses to restore when the file is dirty', async () => {
    const h = harness();
    await h.writer.apply(payload('a'));
    h.vs.dirty = true;
    expect((await h.writer.remove()).status).toBe('skipped');
    expect(h.enabled.value).toBe(false);
    expect(h.ui.notes.length).toBe(1);
  });
});

describe('analyzeSettingsText', () => {
  it('finds comments only inside managed keys', () => {
    const a = analyzeSettingsText('{\n// top\n"x": 1,\n"editor.tokenColorCustomizations": { /* c */ },\n}');
    expect(a.errors).toEqual([]);
    expect(a.keysWithComments).toEqual(['editor.tokenColorCustomizations']);
  });
});
