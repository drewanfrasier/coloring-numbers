import { luminance } from '../generator/color';
import type { Puzzle, RGB } from '../puzzle/types';
import type { Viewport } from './viewport';

export interface PaintState {
  filled: Uint8Array;
  /** Palette index whose sections are highlighted, or -1. */
  selected: number;
  overrides: Map<number, RGB>;
}

const pack = (r: number, g: number, b: number) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const WHITE = pack(255, 255, 255);
const LINE = pack(139, 147, 167);
const HIGHLIGHT = pack(199, 205, 216);
const PIXEL_HIGHLIGHT = pack(150, 160, 180);
const STAGE_BG = '#efe9f7';

/**
 * Draws the puzzle. Colors live in an offscreen "art" canvas at puzzle resolution that is
 * updated one region at a time; numbers and grid lines are drawn crisp on top each frame.
 */
export class Renderer {
  readonly art: HTMLCanvasElement;
  private artCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private px: Uint32Array;
  private dirty = true;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  cssW = 1;
  cssH = 1;
  /** Pixel indices of each region, CSR style: pixels[offsets[r] .. offsets[r+1]]. */
  private offsets: Int32Array;
  private pixels: Int32Array;
  private boundary: Uint8Array | null = null;
  private hintGray: Uint32Array | null = null;
  private packedPalette: Uint32Array;
  readonly colorRegions: number[][];
  private flash: { x: number; y: number; start: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private puzzle: Puzzle,
    public state: PaintState,
  ) {
    const { width: w, height: h, regionMap, regionCount: n } = puzzle;
    this.ctx = canvas.getContext('2d')!;
    this.art = document.createElement('canvas');
    this.art.width = w;
    this.art.height = h;
    this.artCtx = this.art.getContext('2d')!;
    this.img = this.artCtx.createImageData(w, h);
    this.px = new Uint32Array(this.img.data.buffer);
    this.px.fill(WHITE);

    const counts = new Int32Array(n + 2);
    for (let p = 0; p < regionMap.length; p++) counts[regionMap[p] + 1]++;
    this.offsets = new Int32Array(n + 2);
    for (let r = 1; r <= n + 1; r++) this.offsets[r] = this.offsets[r - 1] + counts[r];
    const cursor = this.offsets.slice();
    this.pixels = new Int32Array(regionMap.length);
    for (let p = 0; p < regionMap.length; p++) this.pixels[cursor[regionMap[p]]++] = p;

    this.packedPalette = Uint32Array.from(puzzle.palette.map(([r, g, b]) => pack(r, g, b)));
    this.colorRegions = puzzle.palette.map(() => []);
    for (let r = 1; r <= n; r++) this.colorRegions[puzzle.regionColor[r]].push(r);

    if (puzzle.mode === 'outline') {
      const b = new Uint8Array(w * h);
      for (let p = 0; p < b.length; p++) {
        const r = regionMap[p];
        if (r === 0) continue;
        const x = p % w, y = (p / w) | 0;
        b[p] = x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
          regionMap[p - 1] !== r || regionMap[p + 1] !== r || regionMap[p - w] !== r || regionMap[p + w] !== r ? 1 : 0;
      }
      this.boundary = b;
    } else {
      // Pixel mode shows a faint grayscale ghost of the picture to help her see the shape.
      this.hintGray = new Uint32Array(n + 1);
      for (let r = 1; r <= n; r++) {
        const g = Math.round(214 + 38 * Math.sqrt(luminance(puzzle.palette[puzzle.regionColor[r]])));
        this.hintGray[r] = pack(g, g, g);
      }
    }
    this.paintAll();
  }

  get regionCount() {
    return this.puzzle.regionCount;
  }

  private regionPixel(r: number): (p: number) => number {
    const { filled, selected, overrides } = this.state;
    if (filled[r]) {
      const o = overrides.get(r);
      const c = o ? pack(o[0], o[1], o[2]) : this.packedPalette[this.puzzle.regionColor[r]];
      return () => c;
    }
    const isSel = this.puzzle.regionColor[r] === selected;
    if (this.boundary) {
      const b = this.boundary, fill = isSel ? HIGHLIGHT : WHITE;
      return (p) => (b[p] ? LINE : fill);
    }
    const c = isSel ? PIXEL_HIGHLIGHT : this.hintGray![r];
    return () => c;
  }

  paintRegion(r: number): void {
    const color = this.regionPixel(r);
    const px = this.px, pixels = this.pixels;
    for (let i = this.offsets[r], end = this.offsets[r + 1]; i < end; i++) {
      const p = pixels[i];
      px[p] = color(p);
    }
    this.dirty = true;
  }

  paintColor(c: number): void {
    if (c < 0 || c >= this.colorRegions.length) return;
    for (const r of this.colorRegions[c]) this.paintRegion(r);
  }

  paintAll(): void {
    for (let r = 1; r <= this.puzzle.regionCount; r++) this.paintRegion(r);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  flashAt(x: number, y: number): void {
    this.flash = { x, y, start: performance.now() };
  }

  /** Returns true while an animation still needs more frames. */
  draw(view: Viewport, showLabels = true): boolean {
    if (this.dirty) {
      this.artCtx.putImageData(this.img, 0, 0);
      this.dirty = false;
    }
    const { ctx, dpr, puzzle } = this;
    const s = view.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = STAGE_BG;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    ctx.save();
    ctx.shadowColor = 'rgba(60, 40, 90, 0.18)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#fff';
    ctx.fillRect(view.ox, view.oy, puzzle.width * s, puzzle.height * s);
    ctx.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = puzzle.mode === 'outline' && s < 3;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.art, view.ox, view.oy, puzzle.width * s, puzzle.height * s);
    ctx.restore();

    if (showLabels) {
      if (puzzle.mode === 'pixel') this.drawPixelGrid(view);
      this.drawLabels(view);
    }
    return this.drawFlash(view);
  }

  private visibleRange(view: Viewport) {
    const [x0, y0] = view.toPuzzle(0, 0);
    const [x1, y1] = view.toPuzzle(this.cssW, this.cssH);
    return { x0, y0, x1, y1 };
  }

  private drawPixelGrid(view: Viewport): void {
    const s = view.scale;
    if (s < 7) return;
    const { ctx, puzzle } = this;
    const { x0, y0, x1, y1 } = this.visibleRange(view);
    const cx0 = Math.max(0, Math.floor(x0)), cx1 = Math.min(puzzle.width - 1, Math.ceil(x1));
    const cy0 = Math.max(0, Math.floor(y0)), cy1 = Math.min(puzzle.height - 1, Math.ceil(y1));
    ctx.beginPath();
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const r = puzzle.regionMap[cy * puzzle.width + cx];
        if (r === 0 || this.state.filled[r]) continue;
        ctx.rect(Math.round(view.ox + cx * s) + 0.5, Math.round(view.oy + cy * s) + 0.5, Math.round(s), Math.round(s));
      }
    }
    ctx.strokeStyle = 'rgba(70, 80, 105, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawLabels(view: Viewport): void {
    const { ctx, puzzle, state } = this;
    const s = view.scale;
    if (puzzle.mode === 'pixel' && s < 14) return;
    const { x0, y0, x1, y1 } = this.visibleRange(view);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let font = '';
    for (let r = 1; r <= puzzle.regionCount; r++) {
      if (state.filled[r]) continue;
      const lx = puzzle.labelX[r], ly = puzzle.labelY[r];
      if (lx < x0 - 2 || lx > x1 + 2 || ly < y0 - 2 || ly > y1 + 2) continue;
      const c = puzzle.regionColor[r];
      const num = c + 1;
      let size: number;
      if (puzzle.mode === 'pixel') {
        size = s * (num >= 10 ? 0.46 : 0.58);
      } else {
        size = Math.min(puzzle.labelR[r] * s * 1.2 * (num >= 10 ? 0.8 : 1), 36);
        if (size < 7.5) continue;
      }
      const sel = c === state.selected;
      const f = `${sel ? 800 : 700} ${Math.round(size)}px Nunito, ui-rounded, system-ui, sans-serif`;
      if (f !== font) { ctx.font = f; font = f; }
      ctx.fillStyle = sel ? '#1e1b2e' : '#737b8f';
      ctx.fillText(String(num), view.ox + lx * s, view.oy + ly * s + size * 0.06);
    }
  }

  private drawFlash(view: Viewport): boolean {
    if (!this.flash) return false;
    const t = (performance.now() - this.flash.start) / 1400;
    if (t >= 1) {
      this.flash = null;
      return false;
    }
    const { ctx } = this;
    const x = view.ox + this.flash.x * view.scale, y = view.oy + this.flash.y * view.scale;
    for (let i = 0; i < 2; i++) {
      const k = (t * 2 + i * 0.5) % 1;
      ctx.beginPath();
      ctx.arc(x, y, 14 + k * 60, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 90, 122, ${(1 - k) * 0.9})`;
      ctx.lineWidth = 5 * (1 - k) + 1;
      ctx.stroke();
    }
    return true;
  }

  /** The finished picture without lines or numbers, for saving and previews. */
  exportImage(maxSide = 1400): HTMLCanvasElement {
    const { width: w, height: h, regionMap, regionColor, palette } = this.puzzle;
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const sctx = small.getContext('2d')!;
    const out = sctx.createImageData(w, h);
    const px = new Uint32Array(out.data.buffer);
    const colors = new Uint32Array(this.puzzle.regionCount + 1);
    colors[0] = WHITE;
    for (let r = 1; r <= this.puzzle.regionCount; r++) {
      const o = this.state.overrides.get(r) ?? palette[regionColor[r]];
      colors[r] = pack(o[0], o[1], o[2]);
    }
    for (let p = 0; p < px.length; p++) px[p] = colors[regionMap[p]];
    sctx.putImageData(out, 0, 0);
    if (this.puzzle.mode === 'outline') return small;
    // Scale pixel art up with hard edges.
    const k = Math.max(1, Math.floor(maxSide / Math.max(w, h)));
    const big = document.createElement('canvas');
    big.width = w * k;
    big.height = h * k;
    const bctx = big.getContext('2d')!;
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(small, 0, 0, big.width, big.height);
    return big;
  }

  thumbnail(size = 240): string {
    const { width: w, height: h } = this.puzzle;
    const k = size / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const tctx = c.getContext('2d')!;
    tctx.fillStyle = '#fff';
    tctx.fillRect(0, 0, c.width, c.height);
    tctx.imageSmoothingEnabled = this.puzzle.mode === 'outline';
    // Leave the "selected color" highlight out of the thumbnail.
    const sel = this.state.selected;
    this.state.selected = -1;
    this.paintColor(sel);
    this.artCtx.putImageData(this.img, 0, 0);
    tctx.drawImage(this.art, 0, 0, c.width, c.height);
    this.state.selected = sel;
    this.paintColor(sel);
    return c.toDataURL('image/png');
  }
}
