import { describe, expect, it } from 'vitest';
import { hueForSlot, slotIndex, timeToHue, type TimeOptions } from '../../src/palette/time';

const at = (h: number, m: number) => new Date(2026, 9, 18, h, m, 0);
const base: TimeOptions = { mode: 'normal', slotsPerDay: 96, timeOffsetMinutes: 0, pinnedHue: null };

describe('slotIndex', () => {
  it('splits the day into 15-minute slots', () => {
    expect(slotIndex(at(0, 0), 96)).toBe(0);
    expect(slotIndex(at(0, 14), 96)).toBe(0);
    expect(slotIndex(at(0, 15), 96)).toBe(1);
    expect(slotIndex(at(23, 59), 96)).toBe(95);
  });

  it('wraps the time offset around midnight', () => {
    expect(slotIndex(at(23, 50), 96, 20)).toBe(0);
    expect(slotIndex(at(0, 5), 96, -10)).toBe(95);
  });
});

describe('timeToHue', () => {
  it('normal mode starts at red and increases', () => {
    expect(timeToHue(at(0, 0), base)).toBeCloseTo(29.234, 9);
    expect(timeToHue(at(6, 0), base)).toBeCloseTo(119.234, 9);
    expect(timeToHue(at(12, 0), base)).toBeCloseTo(209.234, 9);
    expect(timeToHue(at(18, 0), base)).toBeCloseTo(299.234, 9);
    expect(timeToHue(at(23, 45), base)).toBeCloseTo((29.234 + 95 * 3.75) % 360, 9);
  });

  it('sky mode puts noon at amber and decreases', () => {
    const sky = { ...base, mode: 'sky' as const };
    expect(timeToHue(at(0, 0), sky)).toBeCloseTo(260, 9);
    expect(timeToHue(at(6, 0), sky)).toBeCloseTo(170, 9);
    expect(timeToHue(at(12, 0), sky)).toBeCloseTo(80, 9);
    expect(timeToHue(at(18, 0), sky)).toBeCloseTo(350, 9);
  });

  it('steps by the same amount across midnight', () => {
    for (const mode of ['normal', 'sky'] as const) {
      const step = (a: number, b: number) => (((b - a) % 360) + 540) % 360 - 180;
      const d1 = step(hueForSlot(94, mode, 96), hueForSlot(95, mode, 96));
      const d2 = step(hueForSlot(95, mode, 96), hueForSlot(0, mode, 96));
      expect(Math.abs(d1)).toBeCloseTo(3.75, 9);
      expect(d2).toBeCloseTo(d1, 9);
    }
  });

  it('honors pinnedHue and the time offset', () => {
    expect(timeToHue(at(3, 0), { ...base, pinnedHue: 400 })).toBeCloseTo(40, 9);
    expect(timeToHue(at(0, 0), { ...base, timeOffsetMinutes: 720 })).toBeCloseTo(209.234, 9);
  });
});
