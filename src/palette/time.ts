import { wrapHue } from '../color/oklab';

export type HueMode = 'normal' | 'sky';

export const SLOT_COUNTS = [24, 48, 96, 144] as const;
export type SlotsPerDay = (typeof SLOT_COUNTS)[number];

/** OKLCH hue of sRGB #ff0000; `normal` mode starts here at 00:00. */
export const NORMAL_START_HUE = 29.234;
/** `sky` mode hue at 00:00 (noon lands on 80°, amber). */
export const SKY_START_HUE = 260;

export interface TimeOptions {
  mode: HueMode;
  slotsPerDay: SlotsPerDay;
  timeOffsetMinutes: number;
  pinnedHue: number | null;
}

export function slotIndex(date: Date, slotsPerDay: number, timeOffsetMinutes = 0): number {
  const raw = date.getHours() * 60 + date.getMinutes() + timeOffsetMinutes;
  const minutes = ((raw % 1440) + 1440) % 1440;
  return Math.floor(minutes / (1440 / slotsPerDay));
}

export function hueForSlot(k: number, mode: HueMode, slotsPerDay: number): number {
  const step = 360 / slotsPerDay;
  return mode === 'normal' ? wrapHue(NORMAL_START_HUE + step * k) : wrapHue(SKY_START_HUE - step * k);
}

export function timeToHue(date: Date, opt: TimeOptions): number {
  if (opt.pinnedHue !== null && Number.isFinite(opt.pinnedHue)) return wrapHue(opt.pinnedHue);
  return hueForSlot(slotIndex(date, opt.slotsPerDay, opt.timeOffsetMinutes), opt.mode, opt.slotsPerDay);
}
