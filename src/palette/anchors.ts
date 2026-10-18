import { periodicCatmullRom } from '../color/catmullRom';

// Anchor corrections for vivid text at absolute hues 0, 30, ..., 330 (plan 6.7).
// Changing these shifts the distances between token colors, so rerun the
// palette tests after every edit.
export const ANCHOR_DL = [0, 0, 0.01, 0.04, 0, -0.01, -0.02, -0.02, 0, 0.01, 0, 0] as const;
export const ANCHOR_DH = [0, 0, -4, -12, 6, 2, -5, 5, 0, 0, 0, 0] as const;

export function anchorDeltaL(hue: number): number {
  return periodicCatmullRom(ANCHOR_DL, hue);
}

export function anchorDeltaH(hue: number): number {
  return periodicCatmullRom(ANCHOR_DH, hue);
}
