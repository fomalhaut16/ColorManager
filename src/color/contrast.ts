import { decode, type Rgb8 } from './oklab';

function relativeLuminance(rgb: Rgb8): number {
  return (
    0.2126 * decode(rgb[0] / 255) + 0.7152 * decode(rgb[1] / 255) + 0.0722 * decode(rgb[2] / 255)
  );
}

/** WCAG 2.x contrast ratio, 1..21. */
export function wcagContrast(a: Rgb8, b: Rgb8): number {
  const ya = relativeLuminance(a);
  const yb = relativeLuminance(b);
  return (Math.max(ya, yb) + 0.05) / (Math.min(ya, yb) + 0.05);
}

function apcaY(rgb: Rgb8): number {
  const y =
    0.2126729 * (rgb[0] / 255) ** 2.4 +
    0.7151522 * (rgb[1] / 255) ** 2.4 +
    0.072175 * (rgb[2] / 255) ** 2.4;
  return y < 0.022 ? y + (0.022 - Math.max(0, y)) ** 1.414 : y;
}

/**
 * APCA 0.0.98G-4g lightness contrast Lc. Positive for dark text on a light
 * background, negative for light text on a dark background.
 */
export function apcaContrast(text: Rgb8, background: Rgb8): number {
  const yt = apcaY(text);
  const yb = apcaY(background);
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    return s < 0.1 ? 0 : (s - 0.027) * 100;
  }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
  return s > -0.1 ? 0 : (s + 0.027) * 100;
}
