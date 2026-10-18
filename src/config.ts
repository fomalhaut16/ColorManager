import * as vscode from 'vscode';
import { SLOT_COUNTS, type HueMode, type SlotsPerDay } from './palette/time';

export interface ColorManagerConfig {
  enabled: boolean;
  mode: HueMode;
  slotsPerDay: SlotsPerDay;
  tint: number;
  pinnedHue: number | null;
  timeOffsetMinutes: number;
}

export const SECTION = 'colorManager';

export function readConfig(): ColorManagerConfig {
  const c = vscode.workspace.getConfiguration(SECTION);
  const slots = c.get<number>('slotsPerDay', 96);
  const tint = c.get<number>('tint', 1);
  const pinned = c.get<number | null>('pinnedHue', null);
  const offset = c.get<number>('timeOffsetMinutes', 0);
  return {
    enabled: c.get<boolean>('enabled', true),
    mode: c.get<string>('mode', 'normal') === 'sky' ? 'sky' : 'normal',
    slotsPerDay: (SLOT_COUNTS as readonly number[]).includes(slots) ? (slots as SlotsPerDay) : 96,
    tint: Number.isFinite(tint) ? Math.min(1.2, Math.max(0.75, tint)) : 1,
    pinnedHue: typeof pinned === 'number' && Number.isFinite(pinned) ? pinned : null,
    timeOffsetMinutes: Number.isFinite(offset) ? Math.trunc(offset) : 0,
  };
}

export async function setEnabled(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration(SECTION).update('enabled', enabled, vscode.ConfigurationTarget.Global);
}
