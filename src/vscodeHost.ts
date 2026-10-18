import * as vscode from 'vscode';
import { MANAGED_KEYS, type ManagedKey } from './settingsKeys';
import type { BackupStore, ConfigIO, SettingsIO, WriterUi } from './settingsWriter';
import { isTargetThemeActive, type ThemeKind } from './themeGate';

// VSCode-backed implementations of the writer's dependencies.

export const configIO: ConfigIO = {
  inspectGlobal: (key) => vscode.workspace.getConfiguration().inspect(key)?.globalValue,
  update: async (key, value) => {
    await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
  },
};

/**
 * The extension host always gets the default profile's storage, so two
 * levels above globalStorageUri is the default profile's settings.json
 * (plan 9.5). The writer cross-checks it against VSCode's values.
 */
export function settingsUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, '..', '..', 'settings.json');
}

export function settingsIO(context: vscode.ExtensionContext): SettingsIO {
  const uri = settingsUri(context);
  return {
    read: async () => {
      try {
        return await vscode.workspace.fs.readFile(uri);
      } catch {
        return undefined;
      }
    },
    isDirty: () =>
      vscode.workspace.textDocuments.some(
        (d) => d.isDirty && d.uri.path === uri.path && (d.uri.scheme === 'vscode-userdata' || d.uri.scheme === 'file'),
      ),
  };
}

const SNAPSHOT = /^settings-\d{8}-\d{6}\.json$/;
const KEEP_SNAPSHOTS = 20;

export function backupDir(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, 'backups');
}

export function backupStore(context: vscode.ExtensionContext): BackupStore {
  const dir = backupDir(context);
  const original = vscode.Uri.joinPath(dir, 'settings-original.json');
  const ensureDir = () => vscode.workspace.fs.createDirectory(dir);
  return {
    hasOriginal: async () => {
      try {
        await vscode.workspace.fs.stat(original);
        return true;
      } catch {
        return false;
      }
    },
    writeOriginal: async (bytes) => {
      await ensureDir();
      await vscode.workspace.fs.writeFile(original, bytes);
    },
    writeSnapshot: async (bytes, at) => {
      await ensureDir();
      const p = (n: number) => String(n).padStart(2, '0');
      const name = `settings-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}.json`;
      await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(dir, name), bytes);
      const names = (await vscode.workspace.fs.readDirectory(dir))
        .map(([n]) => n)
        .filter((n) => SNAPSHOT.test(n))
        .sort();
      for (const old of names.slice(0, Math.max(0, names.length - KEEP_SNAPSHOTS))) {
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(dir, old));
      }
    },
  };
}

const KEY_LABELS: Record<ManagedKey, string> = {
  'workbench.colorCustomizations': 'ワークベンチの色',
  'editor.tokenColorCustomizations': 'TextMate のトークン色',
  'editor.semanticTokenColorCustomizations': 'semantic token の色',
};

export const writerUi: WriterUi = {
  isFocused: () => vscode.window.state.focused,
  askOverwrite: async (keys) => {
    const overwrite = '上書きする';
    const pause = '一時停止する';
    const answer = await vscode.window.showWarningMessage(
      'ColorManager: "[Visual Studio Light]" の設定が手で変更されています。',
      {
        modal: true,
        detail: `変更されていた項目: ${keys.map((k) => KEY_LABELS[k]).join('、')}\n上書きする場合は、先に settings.json をバックアップします。`,
      },
      overwrite,
      pause,
    );
    return answer === overwrite ? 'overwrite' : answer === pause ? 'pause' : undefined;
  },
  askDropComments: async (keys) => {
    const ok = '続ける（コメントは消える）';
    const answer = await vscode.window.showWarningMessage(
      'ColorManager: 書き換える設定の中にコメントがあります。',
      {
        modal: true,
        detail: `対象: ${keys.join(', ')}\n書き込むとこの範囲のコメントは消えます。settings.json はバックアップしてから書き込みます。`,
      },
      ok,
    );
    return answer === ok;
  },
  notify: (message) => void vscode.window.showWarningMessage(message),
};

export function targetThemeActive(): boolean {
  const c = vscode.workspace.getConfiguration();
  return isTargetThemeActive({
    kind: vscode.window.activeColorTheme.kind as number as ThemeKind,
    autoDetectHighContrast: c.get<boolean>('window.autoDetectHighContrast', true),
    autoDetectColorScheme: c.get<boolean>('window.autoDetectColorScheme', false),
    colorTheme: c.get<string>('workbench.colorTheme'),
    preferredLightColorTheme: c.get<string>('workbench.preferredLightColorTheme'),
    preferredDarkColorTheme: c.get<string>('workbench.preferredDarkColorTheme'),
  });
}

/** Plan 9.8: offer once to keep the managed keys out of Settings Sync. */
export async function offerSyncIgnore(context: vscode.ExtensionContext): Promise<void> {
  const ASKED = 'colorManager.syncIgnoreAsked';
  if (context.globalState.get<boolean>(ASKED) || !vscode.window.state.focused) return;
  const config = vscode.workspace.getConfiguration();
  const current = config.inspect<string[]>('settingsSync.ignoredSettings')?.globalValue ?? [];
  const missing = MANAGED_KEYS.filter((k) => !current.includes(k));
  if (missing.length === 0) {
    await context.globalState.update(ASKED, true);
    return;
  }
  const add = '追加する';
  const skip = '追加しない';
  const answer = await vscode.window.showInformationMessage(
    'ColorManager: 15分ごとに書き換える3つの設定を Settings Sync の対象から外しますか？',
    {
      modal: true,
      detail:
        'settingsSync.ignoredSettings に workbench.colorCustomizations などの3つのキーを追加します。キー単位で外れるので、ほかのテーマ用にこれらのキーに書いた色も同期されなくなります。',
    },
    add,
    skip,
  );
  if (answer === undefined) return; // ask again next time
  if (answer === add) {
    await config.update('settingsSync.ignoredSettings', [...current, ...missing], vscode.ConfigurationTarget.Global);
  }
  await context.globalState.update(ASKED, true);
}
