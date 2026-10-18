import * as vscode from 'vscode';
import { dumpRegistry } from './dev/dumpRegistry';
import { initLog, log } from './log';

export function activate(context: vscode.ExtensionContext): void {
  initLog(context);
  const dev = context.extensionMode !== vscode.ExtensionMode.Production;
  void vscode.commands.executeCommand('setContext', 'colorManager.isDevelopment', dev);

  context.subscriptions.push(
    vscode.commands.registerCommand('colorManager.dev.dumpRegistry', async (out?: vscode.Uri) => {
      if (context.extensionMode === vscode.ExtensionMode.Production) return;
      const registry = await dumpRegistry();
      const target = out ?? vscode.Uri.joinPath(context.globalStorageUri, 'color-registry.json');
      await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(JSON.stringify(registry, null, 2) + '\n'));
      log(`dumped ${Object.keys(registry.colors).length} colors to ${target.fsPath}`);
      return target;
    }),
  );
}

export function deactivate(): void {}
