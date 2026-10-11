/** Maps puzzle coordinates to screen (CSS px): screen = puzzle * scale + offset. */
export class Viewport {
  scale = 1;
  ox = 0;
  oy = 0;
  fitScale = 1;
  minScale = 0.1;
  maxScale = 10;

  constructor(
    public contentW: number,
    public contentH: number,
    private maxScreenPxPerUnit: number,
  ) {}

  fit(cw: number, ch: number): void {
    this.fitScale = Math.min(cw / this.contentW, ch / this.contentH) * 0.92;
    this.minScale = this.fitScale * 0.6;
    this.maxScale = Math.max(this.fitScale * 2, this.maxScreenPxPerUnit);
    this.scale = this.fitScale;
    this.ox = (cw - this.contentW * this.scale) / 2;
    this.oy = (ch - this.contentH * this.scale) / 2;
  }

  zoomAt(factor: number, sx: number, sy: number): void {
    const next = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    const k = next / this.scale;
    this.ox = sx - (sx - this.ox) * k;
    this.oy = sy - (sy - this.oy) * k;
    this.scale = next;
  }

  pan(dx: number, dy: number): void {
    this.ox += dx;
    this.oy += dy;
  }

  /** Keep at least a quarter of the picture on screen. */
  clamp(cw: number, ch: number): void {
    const w = this.contentW * this.scale, h = this.contentH * this.scale;
    this.ox = Math.min(cw * 0.75, Math.max(cw * 0.25 - w, this.ox));
    this.oy = Math.min(ch * 0.75, Math.max(ch * 0.25 - h, this.oy));
  }

  toPuzzle(sx: number, sy: number): [number, number] {
    return [(sx - this.ox) / this.scale, (sy - this.oy) / this.scale];
  }

  /** Where the view should be to center puzzle point (px, py) at `scale`. */
  target(px: number, py: number, scale: number, cw: number, ch: number) {
    const s = Math.min(this.maxScale, Math.max(this.minScale, scale));
    return { scale: s, ox: cw / 2 - px * s, oy: ch / 2 - py * s };
  }
}
