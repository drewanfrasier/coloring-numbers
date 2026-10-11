import type { RGB } from '../puzzle/types';

/** Small seeded PRNG so the same picture + settings always gives the same puzzle. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/** sRGB (0-255 ints) to CIELAB (D65), written into out[o..o+2]. */
export function rgbToLab(r: number, g: number, b: number, out: Float32Array, o: number): void {
  const R = LINEAR[r], G = LINEAR[g], B = LINEAR[b];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const fx = labF(x), fy = labF(y), fz = labF(z);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
}

/** Dark text on light colors, white text on dark ones. */
export function textColorFor(rgb: RGB): string {
  return luminance(rgb) > 0.36 ? '#1e1b2e' : '#ffffff';
}

export function rgbCss([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Order palette entries so the color bar reads nicely: grays first (dark to light),
 * then by hue. Returns old index -> new index for entries with count > 0, -1 otherwise.
 */
export function paletteOrder(palette: RGB[], counts: ArrayLike<number>): number[] {
  const used = palette.map((_, i) => i).filter((i) => counts[i] > 0);
  const key = (i: number) => {
    const [h, s, l] = rgbToHsl(palette[i]);
    return s < 0.15 ? l * 10 : 100 + Math.round(h / 15) * 10 + l;
  };
  used.sort((a, b) => key(a) - key(b));
  const remap = new Array<number>(palette.length).fill(-1);
  used.forEach((oldIdx, newIdx) => (remap[oldIdx] = newIdx));
  return remap;
}
