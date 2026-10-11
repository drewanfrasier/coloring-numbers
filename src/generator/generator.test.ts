import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { connectedComponents, removeThinParts, simplifyRegions } from './regions';
import type { ImageLike, RGB } from '../puzzle/types';

/** Paint an RGBA image from a function returning a color (or null for transparent). */
function makeImage(w: number, h: number, fn: (x: number, y: number) => RGB | null): ImageLike {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      if (!c) continue;
      const o = (y * w + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const RED: RGB = [220, 40, 40];
const BLUE: RGB = [40, 80, 220];
const YELLOW: RGB = [250, 210, 40];

// Four quadrants: red, blue, yellow, red. Two red regions that don't touch.
const quadrants = () =>
  makeImage(200, 200, (x, y) => {
    const q = (x < 100 ? 0 : 1) + (y < 100 ? 0 : 2);
    return [RED, BLUE, YELLOW, RED][q];
  });

describe('connectedComponents', () => {
  it('labels separate same-color areas as different regions', () => {
    const colors = new Int32Array([1, 1, 2, 1, 2, 2, 2, 2, 1]);
    const cc = connectedComponents(colors, 3, 3);
    expect(cc.count).toBe(3);
    expect(cc.map[0]).toBe(cc.map[1]);
    expect(cc.map[0]).not.toBe(cc.map[8]);
  });
});

describe('simplifyRegions', () => {
  it('merges a tiny speck into its surrounding region', () => {
    const w = 60, h = 60;
    const colors = new Int32Array(w * h).fill(1);
    for (let y = 30; y < 32; y++) for (let x = 30; x < 32; x++) colors[y * w + x] = 2;
    const s = simplifyRegions(colors, w, h, 20, 1);
    expect(s.count).toBe(1);
    expect(s.regionColor[1]).toBe(1);
  });

  it('merges thin stripes even when their area is large', () => {
    const w = 100, h = 100;
    const colors = new Int32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) colors[y * w + x] = x === 50 ? 2 : x < 50 ? 1 : 3;
    const s = simplifyRegions(colors, w, h, 10, 3);
    expect(s.count).toBe(2);
  });
});

describe('generate (outline)', () => {
  const opts = { mode: 'outline' as const, colors: 6, detail: 'medium' as const, smooth: false, seed: 7 };

  it('finds each region and merges identical colors into one palette entry', () => {
    const p = generate(quadrants(), opts);
    expect(p.regionCount).toBe(4);
    expect(p.palette.length).toBe(3);
    const reds = [1, 2, 3, 4].filter((r) => {
      const [cr, cg, cb] = p.palette[p.regionColor[r]];
      return Math.abs(cr - RED[0]) < 4 && Math.abs(cg - RED[1]) < 4 && Math.abs(cb - RED[2]) < 4;
    });
    expect(reds.length).toBe(2);
  });

  it('places every label inside its own region', () => {
    const img = makeImage(240, 180, (x, y) => {
      if ((x - 120) ** 2 + (y - 90) ** 2 < 60 ** 2) return YELLOW;
      if (x < 40) return BLUE;
      return RED;
    });
    const p = generate(img, opts);
    for (let r = 1; r <= p.regionCount; r++) {
      const x = Math.floor(p.labelX[r]), y = Math.floor(p.labelY[r]);
      expect(p.regionMap[y * p.width + x]).toBe(r);
      expect(p.labelR[r]).toBeGreaterThan(1);
    }
  });

  it('never numbers transparent background', () => {
    const img = makeImage(120, 120, (x, y) => ((x - 60) ** 2 + (y - 60) ** 2 < 40 ** 2 ? BLUE : null));
    const p = generate(img, opts);
    expect(p.regionCount).toBe(1);
    expect(p.regionMap[0]).toBe(0);
  });

  it('is deterministic for the same seed', () => {
    const img = makeImage(150, 150, (x, y) => [(x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256]);
    const a = generate(img, { ...opts, smooth: true, colors: 10 });
    const b = generate(img, { ...opts, smooth: true, colors: 10 });
    expect(a.regionCount).toBe(b.regionCount);
    expect(a.palette).toEqual(b.palette);
    expect(Array.from(a.regionMap)).toEqual(Array.from(b.regionMap));
  });

  it('respects the color limit', () => {
    const img = makeImage(150, 150, (x, y) => [(x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256]);
    const p = generate(img, { ...opts, smooth: true, colors: 5 });
    expect(p.palette.length).toBeLessThanOrEqual(5);
    expect(p.palette.length).toBeGreaterThan(1);
  });
});

describe('generate (pixel)', () => {
  it('makes one region per opaque cell', () => {
    const p = generate(quadrants(), { mode: 'pixel', colors: 6, detail: 'low', smooth: false, seed: 1 });
    expect(p.width).toBe(50);
    expect(p.height).toBe(50);
    expect(p.regionCount).toBe(50 * 50);
    expect(p.palette.length).toBe(3);
  });
});

describe('removeThinParts', () => {
  it('strips a thin ring attached to a big region', () => {
    const w = 120, h = 120;
    // Big region 1 (left half) with a 2px-wide ring of color 1 around a disc of color 2 on the right.
    const colors = new Int32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = Math.hypot(x - 85, y - 60);
        colors[y * w + x] = x < 40 ? 1 : r < 20 ? 2 : r < 22 ? 1 : 3;
      }
    }
    // Connect the ring to the big region with a thin bridge.
    for (let x = 40; x < 66; x++) { colors[60 * w + x] = 1; colors[61 * w + x] = 1; }
    const out = removeThinParts(colors, w, h, 3);
    expect(out[60 * w + 85 + 21]).not.toBe(1); // ring gone
    expect(out[60 * w + 10]).toBe(1); // big region kept
    expect(out[60 * w + 85]).toBe(2); // disc kept
  });
});
