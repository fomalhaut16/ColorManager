import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;
let lastMessage = '';

export function initLog(context: vscode.ExtensionContext): vscode.OutputChannel {
  channel = vscode.window.createOutputChannel('ColorManager');
  context.subscriptions.push(channel);
  return channel;
}

function stamp(): string {
  return new Date().toLocaleTimeString('ja-JP', { hour12: false });
}

export function log(message: string): void {
  channel?.appendLine(`[${stamp()}] ${message}`);
}

/** Logs only when the message differs from the previous one (for repeating states). */
export function logChange(message: string): void {
  if (message === lastMessage) return;
  lastMessage = message;
  log(message);
}

export function showLog(): void {
  channel?.show(true);
}
