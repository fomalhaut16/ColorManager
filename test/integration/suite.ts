import * as vscode from 'vscode';

// Entry point loaded by @vscode/test-electron inside the isolated instance.

const ROOT = process.env.CM_ROOT!;

async function dumpRegistryTask(): Promise<void> {
  const out = vscode.Uri.file(`${ROOT}/data/color-registry.core.json`);
  await vscode.commands.executeCommand('colorManager.dev.dumpRegistry', out);
}

export async function run(): Promise<void> {
  // Wait for our extension to activate.
  const ext = vscode.extensions.getExtension('local.colormanager');
  if (!ext) throw new Error('extension local.colormanager not found');
  await ext.activate();
  switch (process.env.CM_TASK) {
    case 'dump-registry':
      return dumpRegistryTask();
    default:
      throw new Error(`unknown task ${process.env.CM_TASK}`);
  }
}
