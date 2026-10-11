const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

/**
 * Trim transparent edges, add a little padding, and scale so the long side is `longSide`.
 * Returns null when the canvas is empty (e.g. an emoji this computer can't draw).
 */
function cropAndScale(src: HTMLCanvasElement, longSide: number): ImageData | null {
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  const { data, width: w, height: h } = sctx.getImageData(0, 0, src.width, src.height);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const opaqueEdges = minX === 0 && minY === 0 && maxX === w - 1 && maxY === h - 1;
  const pad = opaqueEdges ? 0 : Math.round(Math.max(bw, bh) * 0.03);
  const scale = longSide / (Math.max(bw, bh) + pad * 2);
  const dw = Math.round((bw + pad * 2) * scale), dh = Math.round((bh + pad * 2) * scale);
  const [, ctx] = canvas(dw, dh);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, minX, minY, bw, bh, pad * scale, pad * scale, bw * scale, bh * scale);
  return ctx.getImageData(0, 0, dw, dh);
}

export function rasterizeEmoji(emoji: string, longSide: number): ImageData | null {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  ctx.font = `${Math.round(S * 0.7)}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, S / 2, S / 2);
  return cropAndScale(c, longSide);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load that picture'));
    img.src = url;
  });
}

function drawSource(source: CanvasImageSource, nw: number, nh: number, longSide: number): ImageData | null {
  // Draw a bit larger than needed so cropping the edges doesn't lose sharpness.
  const scale = (longSide * 1.25) / Math.max(nw, nh);
  const [c, ctx] = canvas(Math.max(1, Math.round(nw * scale)), Math.max(1, Math.round(nh * scale)));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return cropAndScale(c, longSide);
}

export async function rasterizeUrl(url: string, longSide: number): Promise<ImageData | null> {
  const img = await loadImage(url);
  return drawSource(img, img.naturalWidth || 512, img.naturalHeight || 512, longSide);
}

export async function rasterizeFile(file: File, longSide: number): Promise<ImageData | null> {
  const bmp = await createImageBitmap(file);
  try {
    return drawSource(bmp, bmp.width, bmp.height, longSide);
  } finally {
    bmp.close();
  }
}
