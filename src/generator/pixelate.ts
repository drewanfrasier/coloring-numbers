import type { ImageLike } from '../puzzle/types';

export interface PixelGrid {
  width: number;
  height: number;
  /** Average color per cell, 3 bytes each. */
  rgb: Uint8Array;
  /** 1 when the cell is mostly opaque. */
  opaque: Uint8Array;
}

/** Average an image down to a grid whose long side has `cells` squares. */
export function pixelate(img: ImageLike, cells: number): PixelGrid {
  const { width: w, height: h, data } = img;
  const cs = Math.max(w, h) / cells;
  const gw = Math.max(1, Math.round(w / cs));
  const gh = Math.max(1, Math.round(h / cs));
  const rgb = new Uint8Array(gw * gh * 3);
  const opaque = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    const y0 = Math.floor((cy * h) / gh), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / gh));
    for (let cx = 0; cx < gw; cx++) {
      const x0 = Math.floor((cx * w) / gw), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / gw));
      let sa = 0, sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * w + x) * 4;
          const a = data[o + 3];
          sa += a;
          sr += data[o] * a;
          sg += data[o + 1] * a;
          sb += data[o + 2] * a;
          n++;
        }
      }
      const i = cy * gw + cx;
      if (sa / (n * 255) < 0.5) continue;
      opaque[i] = 1;
      rgb[i * 3] = Math.round(sr / sa);
      rgb[i * 3 + 1] = Math.round(sg / sa);
      rgb[i * 3 + 2] = Math.round(sb / sa);
    }
  }
  return { width: gw, height: gh, rgb, opaque };
}
