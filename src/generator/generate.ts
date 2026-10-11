import type { Detail, GeneratedPuzzle, ImageLike, Mode, RGB } from '../puzzle/types';
import { mulberry32, paletteOrder, rgbToLab } from './color';
import { assignAll, kmeans, mergeClose } from './kmeans';
import { pixelate } from './pixelate';
import { modeFilter, removeThinParts, simplifyRegions } from './regions';

export interface GenerateOptions {
  mode: Mode;
  colors: number;
  detail: Detail;
  /** Blur first. Photos need it; flat art and emoji don't. */
  smooth: boolean;
  seed: number;
}

/** Long side, in pixels, of the image the outline generator works on. */
export const OUTLINE_SIZE = 1000;

// Squares across the long side. Small squares mean zooming in and coloring them one by one.
export const PIXEL_GRID: Record<Detail, number> = { low: 50, medium: 75, high: 100 };

// Sizes are for a 1000px image and scale with the actual size.
const OUTLINE_DETAIL: Record<Detail, { minAreaFrac: number; minRadius: number }> = {
  low: { minAreaFrac: 0.0025, minRadius: 7 },
  medium: { minAreaFrac: 0.001, minRadius: 5 },
  high: { minAreaFrac: 0.0004, minRadius: 3.5 },
};

/** Two shades closer than this (ΔE) become one color. */
const MIN_COLOR_DISTANCE = 15;

export function generate(img: ImageLike, opts: GenerateOptions): GeneratedPuzzle {
  return opts.mode === 'pixel' ? generatePixel(img, opts) : generateOutline(img, opts);
}

function maxOf(a: Uint8Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}

/** Composite a possibly translucent pixel over white. */
function over(c: number, a: number): number {
  return Math.round(c * a + 255 * (1 - a));
}

function quantize(lab: Float32Array, n: number, k: number, seed: number): Uint8Array {
  const { centers, counts } = kmeans(lab, n, k, mulberry32(seed));
  return assignAll(lab, n, mergeClose(centers, counts, MIN_COLOR_DISTANCE));
}

function generateOutline(img: ImageLike, opts: GenerateOptions): GeneratedPuzzle {
  const { width: w, height: h } = img;
  const N = w * h;
  const src = opts.smooth ? boxBlur(boxBlur(img.data, w, h, 2), w, h, 2) : img.data;

  const fg: number[] = [];
  for (let p = 0; p < N; p++) if (img.data[p * 4 + 3] >= 128) fg.push(p);
  const nf = fg.length;
  const lab = new Float32Array(nf * 3);
  for (let j = 0; j < nf; j++) {
    const o = fg[j] * 4;
    const a = src[o + 3] / 255;
    rgbToLab(over(src[o], a), over(src[o + 1], a), over(src[o + 2], a), lab, j * 3);
  }
  const fgLabels = quantize(lab, nf, opts.colors, opts.seed);
  const numColors = maxOf(fgLabels) + 1;

  let colors: Int32Array = new Int32Array(N);
  for (let j = 0; j < nf; j++) colors[fg[j]] = fgLabels[j] + 1;
  colors = modeFilter(colors, w, h, numColors + 1);
  colors = modeFilter(colors, w, h, numColors + 1);

  const scale = Math.max(w, h) / OUTLINE_SIZE;
  const { minAreaFrac, minRadius } = OUTLINE_DETAIL[opts.detail];
  colors = removeThinParts(colors, w, h, minRadius * scale * 0.6);
  const s = simplifyRegions(colors, w, h, minAreaFrac * N, minRadius * scale);

  // Palette = average of the original pixels that ended up with each color.
  const sums = new Float64Array((numColors + 1) * 3);
  const counts = new Float64Array(numColors + 1);
  for (let p = 0; p < N; p++) {
    const c = s.colors[p];
    if (c === 0) continue;
    const o = p * 4;
    const a = img.data[o + 3] / 255;
    sums[c * 3] += over(img.data[o], a);
    sums[c * 3 + 1] += over(img.data[o + 1], a);
    sums[c * 3 + 2] += over(img.data[o + 2], a);
    counts[c]++;
  }
  const { palette, remap } = finalizePalette(sums, counts);

  const regionColor = new Uint8Array(s.count + 1);
  for (let r = 1; r <= s.count; r++) regionColor[r] = remap[s.regionColor[r]];
  return {
    mode: 'outline',
    width: w,
    height: h,
    regionMap: s.map,
    regionCount: s.count,
    regionColor,
    labelX: s.labelX,
    labelY: s.labelY,
    labelR: s.labelR,
    area: s.area,
    palette,
  };
}

function generatePixel(img: ImageLike, opts: GenerateOptions): GeneratedPuzzle {
  const grid = pixelate(img, PIXEL_GRID[opts.detail]);
  const { width: gw, height: gh, rgb, opaque } = grid;
  const cells: number[] = [];
  for (let i = 0; i < gw * gh; i++) if (opaque[i]) cells.push(i);
  const n = cells.length;
  const lab = new Float32Array(n * 3);
  for (let j = 0; j < n; j++) {
    const i = cells[j] * 3;
    rgbToLab(rgb[i], rgb[i + 1], rgb[i + 2], lab, j * 3);
  }
  const labels = quantize(lab, n, opts.colors, opts.seed);
  const numColors = maxOf(labels) + 1;

  const sums = new Float64Array((numColors + 1) * 3);
  const counts = new Float64Array(numColors + 1);
  for (let j = 0; j < n; j++) {
    const c = labels[j] + 1, i = cells[j] * 3;
    sums[c * 3] += rgb[i];
    sums[c * 3 + 1] += rgb[i + 1];
    sums[c * 3 + 2] += rgb[i + 2];
    counts[c]++;
  }
  const { palette, remap } = finalizePalette(sums, counts);

  const regionMap = new Int32Array(gw * gh);
  const regionColor = new Uint8Array(n + 1);
  const labelX = new Float32Array(n + 1);
  const labelY = new Float32Array(n + 1);
  const labelR = new Float32Array(n + 1);
  const area = new Int32Array(n + 1);
  for (let j = 0; j < n; j++) {
    const r = j + 1, cell = cells[j];
    regionMap[cell] = r;
    regionColor[r] = remap[labels[j] + 1];
    labelX[r] = (cell % gw) + 0.5;
    labelY[r] = Math.floor(cell / gw) + 0.5;
    labelR[r] = 0.5;
    area[r] = 1;
  }
  return { mode: 'pixel', width: gw, height: gh, regionMap, regionCount: n, regionColor, labelX, labelY, labelR, area, palette };
}

/** Turn per-label color sums (label 0 = background, ignored) into a sorted palette. */
function finalizePalette(sums: Float64Array, counts: Float64Array): { palette: RGB[]; remap: number[] } {
  const raw: RGB[] = [];
  const rawCounts: number[] = [];
  for (let c = 1; c < counts.length; c++) {
    const k = counts[c] || 1;
    raw.push([Math.round(sums[c * 3] / k), Math.round(sums[c * 3 + 1] / k), Math.round(sums[c * 3 + 2] / k)]);
    rawCounts.push(counts[c]);
  }
  const order = paletteOrder(raw, rawCounts);
  const palette: RGB[] = [];
  order.forEach((newIdx, oldIdx) => { if (newIdx >= 0) palette[newIdx] = raw[oldIdx]; });
  // remap is indexed by label (1-based); label 0 maps to 0 but is never used for regions.
  const remap = [0, ...order.map((v) => Math.max(v, 0))];
  return { palette, remap };
}

/** Separable box blur on RGBA data. */
export function boxBlur(data: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(data.length);
  const out = new Uint8ClampedArray(data.length);
  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, horizontal: boolean) => {
    const len = horizontal ? w : h, lines = horizontal ? h : w;
    for (let line = 0; line < lines; line++) {
      for (let ch = 0; ch < 4; ch++) {
        let acc = 0, cnt = 0;
        const at = (i: number) => (horizontal ? line * w + i : i * w + line) * 4 + ch;
        for (let i = 0; i <= Math.min(r, len - 1); i++) { acc += src[at(i)]; cnt++; }
        for (let i = 0; i < len; i++) {
          dst[at(i)] = acc / cnt;
          const add = i + r + 1, rem = i - r;
          if (add < len) { acc += src[at(add)]; cnt++; }
          if (rem >= 0) { acc -= src[at(rem)]; cnt--; }
        }
      }
    }
  };
  pass(data, tmp, true);
  pass(tmp, out, false);
  return out;
}
