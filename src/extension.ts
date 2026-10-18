import * as vscode from 'vscode';
import { valueHash } from './canonical';
import { readConfig, SECTION, setEnabled, type ColorManagerConfig } from './config';
import { auditCoverage } from './dev/auditCoverage';
import { dumpRegistry } from './dev/dumpRegistry';
import { initLog, log, logChange, showLog } from './log';
import { OwnershipRecord } from './ownership';
import { generatePalette } from './palette/generate';
import { hueForSlot, slotIndex, timeToHue } from './palette/time';
import { buildPayload, PAYLOAD_VERSION } from './payload/build';
import { validatePayload } from './payload/validate';
import { Scheduler, TICK_MS, type ApplyKey } from './scheduler';
import { MANAGED_KEYS, type ManagedKey, type Payload } from './settingsKeys';
import { SettingsWriter, type ApplyResult, type WriterUi } from './settingsWriter';
import {
  backupDir,
  backupFolderForOS,
  backupStore,
  configIO,
  offerSyncIgnore,
  settingsIO,
  settingsUri,
  targetThemeActive,
  writerUi,
} from './vscodeHost';

const THEME_SETTINGS = [
  'workbench.colorTheme',
  'window.autoDetectColorScheme',
  'window.autoDetectHighContrast',
  'workbench.preferredLightColorTheme',
  'workbench.preferredDarkColorTheme',
];

function fingerprint(c: ColorManagerConfig): string {
  return [c.mode, c.slotsPerDay, c.tint, c.pinnedHue, c.timeOffsetMinutes, PAYLOAD_VERSION].join('|');
}

function payloadFor(hue: number, c: ColorManagerConfig): Payload {
  return buildPayload(generatePalette(hue, { tint: c.tint }));
}

/** Exposed only to the integration tests (ExtensionMode.Test). */
export interface TestApi {
  apply(hue: number): Promise<ApplyResult>;
  remove(): Promise<ApplyResult>;
  setUi(overrides: Partial<WriterUi>): void;
  /** Same as the Apply Now command's unblocking. */
  clearBlock(): void;
  /** The URI the Open Backups Folder command hands to the OS. */
  backupFolderForOS(): vscode.Uri;
}

export function activate(context: vscode.ExtensionContext): TestApi | undefined {
  initLog(context);
  const dev = context.extensionMode !== vscode.ExtensionMode.Production;
  void vscode.commands.executeCommand('setContext', 'colorManager.isDevelopment', dev);

  let config = readConfig();
  let lastResult: ApplyResult | undefined;
  let lastHue: number | undefined;

  // Hashes of every slot's payload under the current settings (plan 9.3, condition 4).
  let slotHashCache: { fp: string; hashes: Record<ManagedKey, Set<string>> } | undefined;
  const slotHashes = (key: ManagedKey): ReadonlySet<string> => {
    const fp = fingerprint(config);
    if (slotHashCache?.fp !== fp) {
      const hashes = Object.fromEntries(MANAGED_KEYS.map((k) => [k, new Set<string>()])) as Record<ManagedKey, Set<string>>;
      const hues = Array.from({ length: config.slotsPerDay }, (_, k) => hueForSlot(k, config.mode, config.slotsPerDay));
      if (config.pinnedHue !== null) hues.push(config.pinnedHue);
      for (const h of hues) {
        const p = payloadFor(h, config);
        for (const k of MANAGED_KEYS) hashes[k].add(valueHash(p[k]));
      }
      slotHashCache = { fp, hashes };
    }
    return slotHashCache.hashes[key];
  };

  const testMode = context.extensionMode === vscode.ExtensionMode.Test;
  const ui: WriterUi = { ...writerUi };

  const writer = new SettingsWriter({
    config: configIO,
    file: settingsIO(context),
    backups: backupStore(context),
    state: context.globalState,
    ownership: new OwnershipRecord(context.globalState),
    ui,
    log,
    now: () => new Date(),
    isEnabled: () => readConfig().enabled,
    setEnabled,
    isTargetThemeActive: targetThemeActive,
    validate: validatePayload,
    slotHashes,
  });

  const warning = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, -1000);
  warning.text = '$(warning) ColorManager';
  warning.command = 'colorManager.showStatus';
  context.subscriptions.push(warning);

  const currentKey = (): ApplyKey => {
    const now = new Date();
    const hue = timeToHue(now, config);
    const slot = slotIndex(now, config.slotsPerDay, config.timeOffsetMinutes);
    return {
      key: [hue.toFixed(4), fingerprint(config)].join('|'),
      slot: `${config.mode}|${config.slotsPerDay}|${slot}`,
    };
  };

  const scheduler = new Scheduler({
    now: () => Date.now(),
    random: Math.random,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
    currentKey,
    run: async () => {
      if (!config.enabled) return { status: 'skipped', reason: 'disabled' };
      const hue = timeToHue(new Date(), config);
      lastHue = hue;
      return writer.apply(payloadFor(hue, config));
    },
    onResult: (result, failures) => {
      lastResult = result;
      const line = `${result.status}: ${result.reason}`;
      if (result.status === 'written' || result.status === 'failed' || result.status === 'invalid') log(line);
      else logChange(line);
      if (result.status === 'invalid') {
        void vscode.window.showErrorMessage(`ColorManager: 生成した配色が検査を通りませんでした（${result.reason}）。`);
      }
      if (failures >= 3) {
        warning.tooltip = `ColorManager: 書き込みに${failures}回続けて失敗しました。\n${result.reason}`;
        warning.show();
        if (failures === 3) {
          void vscode.window.showWarningMessage('ColorManager: settings.json への書き込みに3回続けて失敗しました。', '状態を表示').then(
            (a) => a && vscode.commands.executeCommand('colorManager.showStatus'),
          );
        }
      } else if (result.status === 'written' || result.status === 'unchanged') {
        warning.hide();
      }
    },
  });

  if (!testMode) {
    const interval = setInterval(() => scheduler.tick(), TICK_MS);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
  }

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused && !testMode) scheduler.tick(1000);
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      if (!testMode) scheduler.trigger(500);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      // Our own writes touch the managed keys; never react to them (plan 10).
      const relevant = e.affectsConfiguration(SECTION) || THEME_SETTINGS.some((k) => e.affectsConfiguration(k));
      if (!relevant) return;
      config = readConfig();
      slotHashCache = undefined;
      scheduler.invalidate();
      if (!testMode) scheduler.trigger(500);
    }),
  );

  const status = async () => {
    const now = new Date();
    const lines = [
      '--- ColorManager status ---',
      `enabled: ${config.enabled}, mode: ${config.mode}, slotsPerDay: ${config.slotsPerDay}, tint: ${config.tint}`,
      `pinnedHue: ${config.pinnedHue ?? 'none'}, timeOffsetMinutes: ${config.timeOffsetMinutes}`,
      `now: ${now.toLocaleString('ja-JP')}, slot: ${slotIndex(now, config.slotsPerDay, config.timeOffsetMinutes)}, hue: ${timeToHue(now, config).toFixed(2)}°`,
      `last applied hue: ${lastHue?.toFixed(2) ?? '-'}, last result: ${lastResult ? `${lastResult.status} (${lastResult.reason})` : '-'}`,
      `Visual Studio Light active: ${targetThemeActive()}, waiting for a decision: ${writer.isBlocked()}`,
      `consecutive failures: ${scheduler.consecutiveFailures()}, backoff: ${Math.round(scheduler.backoffRemainingMs() / 1000)} s`,
      `settings.json: ${settingsUri(context).fsPath}`,
      `backups: ${backupDir(context).fsPath}`,
    ];
    for (const l of lines) log(l);
    showLog();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('colorManager.applyNow', () => {
      writer.clearBlock();
      scheduler.invalidate();
      scheduler.force();
    }),
    vscode.commands.registerCommand('colorManager.pause', () => setEnabled(false)),
    vscode.commands.registerCommand('colorManager.resume', async () => {
      writer.clearBlock();
      await setEnabled(true);
    }),
    vscode.commands.registerCommand('colorManager.showStatus', status),
    vscode.commands.registerCommand('colorManager.removeCustomizations', async () => {
      const yes = '元に戻す';
      const answer = await vscode.window.showWarningMessage(
        'ColorManager が書いた配色を取り除き、導入前の状態に戻しますか？',
        { modal: true, detail: '書き込みは一時停止します（colorManager.enabled を false にします）。' },
        yes,
      );
      if (answer !== yes) return;
      const r = await writer.remove();
      log(`remove: ${r.status}: ${r.reason}`);
      if (r.status === 'written') void vscode.window.showInformationMessage('ColorManager: 配色を元に戻しました。');
    }),
    vscode.commands.registerCommand('colorManager.openBackups', async () => {
      const dir = backupDir(context);
      await vscode.workspace.fs.createDirectory(dir);
      await vscode.env.openExternal(backupFolderForOS(context));
    }),
    vscode.commands.registerCommand('colorManager.dev.dumpRegistry', async (out?: vscode.Uri) => {
      if (context.extensionMode === vscode.ExtensionMode.Production) return;
      const registry = await dumpRegistry();
      const target = out ?? vscode.Uri.joinPath(context.globalStorageUri, 'color-registry.core.json');
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(JSON.stringify(registry, null, 2) + '\n'));
      log(`dumped ${Object.keys(registry.colors).length} colors to ${target.fsPath}`);
      return target;
    }),
    vscode.commands.registerCommand('colorManager.dev.auditCoverage', async () => {
      if (context.extensionMode === vscode.ExtensionMode.Production) return;
      const r = await auditCoverage();
      log(`audit: written ${r.written}, leaks ${r.leaks.length}`);
      for (const l of r.leaks) log(`  leak ${l.id} ${l.value}`);
      showLog();
      return r;
    }),
  );

  log(`activated (payload version ${PAYLOAD_VERSION}, ${context.extensionMode === vscode.ExtensionMode.Production ? 'production' : 'development'})`);
  if (testMode) {
    return {
      apply: (hue) => writer.apply(payloadFor(hue, readConfig())),
      remove: () => writer.remove(),
      setUi: (overrides) => Object.assign(ui, overrides),
      clearBlock: () => writer.clearBlock(),
      backupFolderForOS: () => backupFolderForOS(context),
    };
  }
  scheduler.trigger(Math.floor(Math.random() * 1000));
  if (config.enabled && targetThemeActive()) void offerSyncIgnore(context);
  return undefined;
}

export function deactivate(): void {}
