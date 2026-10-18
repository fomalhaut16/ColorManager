// OKLab / OKLCH <-> sRGB conversions (Björn Ottosson's matrices, same values as
// research/palette-prototype/ok.py).

export type Vec3 = [number, number, number];

export interface Oklch {
  L: number;
  C: number;
  /** Hue in degrees, [0, 360). */
  h: number;
}

const LMS_TO_LAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
] as const;

const LAB_TO_LMS = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
] as const;

const LIN_TO_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
] as const;

const LMS_TO_LIN = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
] as const;

function mul(m: readonly (readonly number[])[], v: Vec3): Vec3 {
  return [
    m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2],
    m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2],
    m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2],
  ];
}

export function wrapHue(h: number): number {
  const r = h % 360;
  return r < 0 ? r + 360 : r;
}

export function oklchToOklab({ L, C, h }: Oklch): Vec3 {
  const rad = (h * Math.PI) / 180;
  return [L, C * Math.cos(rad), C * Math.sin(rad)];
}

export function oklabToOklch([L, a, b]: Vec3): Oklch {
  const C = Math.hypot(a, b);
  const h = wrapHue((Math.atan2(b, a) * 180) / Math.PI);
  return { L, C, h };
}

export function oklabToLinear(lab: Vec3): Vec3 {
  const lms = mul(LAB_TO_LMS, lab);
  return mul(LMS_TO_LIN, [lms[0] ** 3, lms[1] ** 3, lms[2] ** 3]);
}

export function linearToOklab(lin: Vec3): Vec3 {
  const lms = mul(LIN_TO_LMS, lin);
  return mul(LMS_TO_LAB, [Math.cbrt(lms[0]), Math.cbrt(lms[1]), Math.cbrt(lms[2])]);
}

export function oklchToLinear(c: Oklch): Vec3 {
  return oklabToLinear(oklchToOklab(c));
}

/** Linear-light channel -> gamma-encoded sRGB channel. Input is clamped to [0, 1]. */
export function encode(x: number): number {
  const v = Math.min(1, Math.max(0, x));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Gamma-encoded sRGB channel -> linear-light channel. */
export function decode(x: number): number {
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

/** 8-bit sRGB triple, each channel an integer in [0, 255]. */
export type Rgb8 = Vec3;

export function linearToRgb8(lin: Vec3): Rgb8 {
  return [
    Math.round(encode(lin[0]) * 255),
    Math.round(encode(lin[1]) * 255),
    Math.round(encode(lin[2]) * 255),
  ];
}

export function rgb8ToLinear(rgb: Rgb8): Vec3 {
  return [decode(rgb[0] / 255), decode(rgb[1] / 255), decode(rgb[2] / 255)];
}

export function rgb8ToOklab(rgb: Rgb8): Vec3 {
  return linearToOklab(rgb8ToLinear(rgb));
}

/** Euclidean distance in OKLab between two 8-bit colors. */
export function deltaEOK(a: Rgb8, b: Rgb8): number {
  const x = rgb8ToOklab(a);
  const y = rgb8ToOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
