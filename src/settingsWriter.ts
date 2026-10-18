import { deepEqual } from './canonical';
import type { OwnershipRecord, StateStore } from './ownership';
import { analyzeSettingsText, managedValuesAreObjects, type SettingsAnalysis } from './settingsFile';
import { MANAGED_KEYS, THEME_KEY, type ManagedKey, type Payload } from './settingsKeys';

// Safe writer for the "[Visual Studio Light]" sub-keys (plan section 9).
// Every VSCode-facing operation goes through WriterDeps so the decision logic
// can be unit tested with fakes.

export interface ConfigIO {
  /** `getConfiguration().inspect(key)?.globalValue`, read fresh every call. */
  inspectGlobal(key: string): unknown;
  /** `getConfiguration().update(key, value, ConfigurationTarget.Global)`. */
  update(key: string, value: unknown): Promise<void>;
}

export interface SettingsIO {
  /** Bytes of the default profile's settings.json, or undefined if it cannot be located/read. */
  read(): Promise<Uint8Array | undefined>;
  /** True if an open editor on settings.json has unsaved changes. */
  isDirty(): boolean;
}

export interface BackupStore {
  hasOriginal(): Promise<boolean>;
  writeOriginal(bytes: Uint8Array): Promise<void>;
  /** Writes a dated snapshot and keeps the newest 20. */
  writeSnapshot(bytes: Uint8Array, at: Date): Promise<void>;
}

export type OverwriteAnswer = 'overwrite' | 'pause' | undefined;

export interface WriterUi {
  isFocused(): boolean;
  askOverwrite(keys: ManagedKey[]): Promise<OverwriteAnswer>;
  askDropComments(keys: ManagedKey[]): Promise<boolean | undefined>;
  notify(message: string): void;
}

export interface WriterDeps {
  config: ConfigIO;
  file: SettingsIO;
  backups: BackupStore;
  state: StateStore;
  ownership: OwnershipRecord;
  ui: WriterUi;
  log(message: string): void;
  now(): Date;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): Promise<void>;
  isTargetThemeActive(): boolean;
  /** Errors from validatePayload; empty means valid. */
  validate(payload: Payload): string[];
  /** Hashes of every slot's sub-value for this key under the current settings. */
  slotHashes(key: ManagedKey): ReadonlySet<string>;
}

export type ApplyStatus =
  | 'written' // at least one key written
  | 'unchanged' // everything already matched
  | 'skipped' // transient precondition failed; retry on the next tick
  | 'blocked' // waiting for the user, or disabled for safety
  | 'invalid' // payload failed validation (a ColorManager bug)
  | 'failed'; // update() rejected or read-back mismatched; back off

export interface ApplyResult {
  status: ApplyStatus;
  reason: string;
}

const STATE_ORIGINAL = 'colorManager.originalValues';
const STATE_SNAPSHOT_DATE = 'colorManager.lastSnapshotDate';
const STATE_COMMENTS_OK = 'colorManager.commentsAccepted';

type StoredValue = { present: false } | { present: true; value: unknown };
type OriginalValues = Record<ManagedKey, StoredValue>;

const decoder = new TextDecoder();

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export class SettingsWriter {
  private awaitingDecision = false;
  /** Set when an overwrite dialog was dismissed; cleared by Apply Now. */
  private blockedUntilApplyNow = false;

  constructor(private readonly d: WriterDeps) {}

  /** Called by the Apply Now command. */
  clearBlock(): void {
    this.blockedUntilApplyNow = false;
  }

  isBlocked(): boolean {
    return this.awaitingDecision || this.blockedUntilApplyNow;
  }

  /** Reads and checks settings.json (plan 9.2 step 4). */
  private async readChecked(): Promise<
    { ok: true; bytes: Uint8Array; analysis: SettingsAnalysis } | { ok: false; result: ApplyResult }
  > {
    const skip = (reason: string) => ({ ok: false as const, result: { status: 'skipped' as const, reason } });
    const bytes = await this.d.file.read();
    if (!bytes) return { ok: false, result: { status: 'blocked', reason: 'settings.json could not be located or read' } };
    if (this.d.file.isDirty()) return skip('settings.json has unsaved changes');
    const analysis = analyzeSettingsText(decoder.decode(bytes));
    if (analysis.errors.length > 0) return skip('settings.json has syntax errors');
    if (!managedValuesAreObjects(analysis.values)) {
      return { ok: false, result: { status: 'blocked', reason: 'a managed key holds a non-object value' } };
    }
    for (const key of MANAGED_KEYS) {
      if (!deepEqual(analysis.values[key], this.d.config.inspectGlobal(key))) {
        return skip(`settings.json and VSCode disagree on ${key} (reload pending or another profile is active)`);
      }
    }
    if (!deepEqual(analysis.colorTheme, this.d.config.inspectGlobal('workbench.colorTheme'))) {
      return skip('settings.json and VSCode disagree on workbench.colorTheme (another profile is active?)');
    }
    return { ok: true, bytes, analysis };
  }

  async apply(payload: Payload): Promise<ApplyResult> {
    const d = this.d;
    // Step 1-2.
    if (!d.isEnabled()) return { status: 'skipped', reason: 'disabled' };
    if (!d.isTargetThemeActive()) return { status: 'skipped', reason: 'Visual Studio Light is not the active theme' };
    if (this.isBlocked()) return { status: 'blocked', reason: 'waiting for the user to decide' };
    // Step 3.
    const errors = d.validate(payload);
    if (errors.length > 0) return { status: 'invalid', reason: errors.slice(0, 5).join('; ') };
    // Step 4.
    const checked = await this.readChecked();
    if (!checked.ok) return checked.result;
    const { bytes, analysis } = checked;
    // Step 4f: comments inside the managed keys would be lost.
    if (analysis.keysWithComments.length > 0 && !d.state.get<boolean>(STATE_COMMENTS_OK)) {
      if (!d.ui.isFocused()) return { status: 'blocked', reason: 'comments in managed keys; waiting for focus to ask' };
      this.awaitingDecision = true;
      const ok = await d.ui.askDropComments(analysis.keysWithComments).finally(() => (this.awaitingDecision = false));
      if (!ok) return { status: 'blocked', reason: 'user did not accept losing comments' };
      await d.state.update(STATE_COMMENTS_OK, true);
    }
    // Step 5: ownership of all three keys before writing any.
    const foreign = MANAGED_KEYS.filter(
      (k) => !d.ownership.isOwned(asRecord(analysis.values[k])[THEME_KEY], payload[k], d.slotHashes(k)),
    );
    let forceSnapshot = false;
    if (foreign.length > 0) {
      if (!d.ui.isFocused()) return { status: 'blocked', reason: `hand-edited: ${foreign.join(', ')}; waiting for focus` };
      this.awaitingDecision = true;
      const answer = await d.ui.askOverwrite(foreign).finally(() => (this.awaitingDecision = false));
      if (answer === 'pause') {
        await d.setEnabled(false);
        return { status: 'blocked', reason: 'paused by the user' };
      }
      if (answer !== 'overwrite') {
        this.blockedUntilApplyNow = true;
        return { status: 'blocked', reason: 'overwrite dialog dismissed' };
      }
      for (const k of foreign) await d.ownership.remember(asRecord(analysis.values[k])[THEME_KEY]);
      forceSnapshot = true;
    }
    // Step 6.
    const pending = MANAGED_KEYS.filter((k) => !deepEqual(asRecord(analysis.values[k])[THEME_KEY], payload[k]));
    if (pending.length === 0) return { status: 'unchanged', reason: 'already up to date' };

    // Step 7: backups.
    const firstWrite = d.state.get<OriginalValues>(STATE_ORIGINAL) === undefined;
    try {
      await this.backup(bytes, analysis, firstWrite, forceSnapshot);
    } catch (e) {
      return { status: 'blocked', reason: `backup failed: ${String(e)}` };
    }

    // Step 8.
    for (const key of pending) {
      if (!d.isEnabled()) return { status: 'skipped', reason: 'disabled while writing' };
      const current = asRecord(analysis.values[key]);
      const next = { ...current, [THEME_KEY]: payload[key] };
      await d.ownership.remember(payload[key]);
      try {
        await d.config.update(key, next);
      } catch (e) {
        return { status: 'failed', reason: `update(${key}) rejected: ${String(e)}` };
      }
      if (!(await this.readBack(key, payload[key]))) {
        await d.setEnabled(false);
        d.ui.notify('ColorManager: the value read back after writing did not match. Writing has been paused.');
        return { status: 'blocked', reason: `read-back mismatch on ${key}` };
      }
    }

    // Plan 9.5 check 3: the file we back up must be the file VSCode writes.
    if (firstWrite) {
      const after = await d.file.read();
      const bg = asRecord(payload['workbench.colorCustomizations'])['editor.background'];
      if (!after || typeof bg !== 'string' || !decoder.decode(after).includes(bg)) {
        await d.setEnabled(false);
        d.ui.notify('ColorManager only supports the default profile. Writing has been paused.');
        return { status: 'blocked', reason: 'written file is not the located settings.json' };
      }
    }
    return { status: 'written', reason: `wrote ${pending.join(', ')}` };
  }

  private async readBack(key: ManagedKey, expected: unknown): Promise<boolean> {
    for (let i = 0; i < 10; i++) {
      if (deepEqual(asRecord(this.d.config.inspectGlobal(key))[THEME_KEY], expected)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  private async backup(bytes: Uint8Array, analysis: SettingsAnalysis, firstWrite: boolean, force: boolean) {
    const d = this.d;
    if (firstWrite) {
      if (!(await d.backups.hasOriginal())) await d.backups.writeOriginal(bytes);
      const original = {} as OriginalValues;
      for (const k of MANAGED_KEYS) {
        const v = analysis.values[k];
        original[k] = v === undefined ? { present: false } : { present: true, value: v };
      }
      await d.state.update(STATE_ORIGINAL, original);
    }
    const today = localDate(d.now());
    if (force || d.state.get<string>(STATE_SNAPSHOT_DATE) !== today) {
      await d.backups.writeSnapshot(bytes, d.now());
      await d.state.update(STATE_SNAPSHOT_DATE, today);
    }
  }

  /** Plan 9.6: Remove Customizations. */
  async remove(): Promise<ApplyResult> {
    const d = this.d;
    await d.setEnabled(false);
    const checked = await this.readChecked();
    if (!checked.ok) {
      d.ui.notify(`ColorManager: could not restore (${checked.result.reason}). Writing stays paused.`);
      return checked.result;
    }
    const original = d.state.get<OriginalValues>(STATE_ORIGINAL);
    for (const key of MANAGED_KEYS) {
      const current = asRecord(checked.analysis.values[key]);
      const origSub = original?.[key]?.present ? asRecord(original[key].value)[THEME_KEY] : undefined;
      let next: Record<string, unknown> | undefined;
      if (origSub !== undefined) {
        next = { ...current, [THEME_KEY]: origSub };
      } else {
        next = { ...current };
        delete next[THEME_KEY];
        if (Object.keys(next).length === 0 && original?.[key]?.present === false) next = undefined;
      }
      if (deepEqual(next, checked.analysis.values[key])) continue;
      try {
        await d.config.update(key, next);
      } catch (e) {
        d.ui.notify(`ColorManager: restoring ${key} failed: ${String(e)}`);
        return { status: 'failed', reason: String(e) };
      }
    }
    await d.ownership.clear();
    await d.state.update(STATE_ORIGINAL, undefined);
    await d.state.update(STATE_COMMENTS_OK, undefined);
    this.blockedUntilApplyNow = false;
    return { status: 'written', reason: 'customizations removed' };
  }
}
