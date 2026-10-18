import { wrapHue } from './oklab';

/**
 * Periodic Catmull-Rom interpolation over values sampled every `step` degrees
 * starting at 0 (values.length * step must be 360).
 */
export function periodicCatmullRom(values: readonly number[], hue: number, step = 30): number {
  const n = values.length;
  const x = wrapHue(hue) / step;
  const i = Math.floor(x);
  const t = x - i;
  const at = (k: number) => values[(((i + k) % n) + n) % n]!;
  const p0 = at(-1);
  const p1 = at(0);
  const p2 = at(1);
  const p3 = at(2);
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  );
}
