/**
 * Region building for outlined puzzles. Works on a "color map": one palette label per
 * pixel, with 0 meaning background (transparent, never numbered).
 */

/** 3×3 majority filter. Removes single-pixel speckle left over from quantizing. */
export function modeFilter(labels: Int32Array, w: number, h: number, numLabels: number): Int32Array {
  const out = new Int32Array(labels.length);
  const counts = new Int32Array(numLabels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const own = labels[p];
      let best = own;
      let bestCount = 0;
      const y0 = Math.max(0, y - 1), y1 = Math.min(h - 1, y + 1);
      const x0 = Math.max(0, x - 1), x1 = Math.min(w - 1, x + 1);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) counts[labels[yy * w + xx]]++;
      }
      bestCount = counts[own];
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const l = labels[yy * w + xx];
          if (counts[l] > bestCount) { bestCount = counts[l]; best = l; }
        }
      }
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) counts[labels[yy * w + xx]] = 0;
      }
      out[p] = best;
    }
  }
  return out;
}

export interface Components {
  map: Int32Array;
  count: number;
  /** Color label per region id (index 0 = background). */
  color: Int32Array;
}

/** 4-connected component labeling. Background (label 0) stays region 0. */
export function connectedComponents(colors: Int32Array, w: number, h: number): Components {
  const N = w * h;
  const map = new Int32Array(N);
  const regionColor: number[] = [0];
  const stack = new Int32Array(N);
  let n = 0;
  for (let p = 0; p < N; p++) {
    const c = colors[p];
    if (c === 0 || map[p] !== 0) continue;
    n++;
    regionColor.push(c);
    map[p] = n;
    let sp = 0;
    stack[sp++] = p;
    while (sp > 0) {
      const q = stack[--sp];
      const x = q % w;
      if (x > 0 && map[q - 1] === 0 && colors[q - 1] === c) { map[q - 1] = n; stack[sp++] = q - 1; }
      if (x < w - 1 && map[q + 1] === 0 && colors[q + 1] === c) { map[q + 1] = n; stack[sp++] = q + 1; }
      if (q >= w && map[q - w] === 0 && colors[q - w] === c) { map[q - w] = n; stack[sp++] = q - w; }
      if (q < N - w && map[q + w] === 0 && colors[q + w] === c) { map[q + w] = n; stack[sp++] = q + w; }
    }
  }
  return { map, count: n, color: Int32Array.from(regionColor) };
}

/**
 * Chamfer distance from each pixel to the edge of its own region (edge pixels = 1).
 * The maximum inside a region is where its number fits best.
 */
export function distanceTransform(map: Int32Array, w: number, h: number): Float32Array {
  const N = w * h;
  const d = new Float32Array(N);
  const INF = 1e9;
  const D = Math.SQRT2;
  for (let p = 0; p < N; p++) {
    const r = map[p];
    if (r === 0) continue;
    const x = p % w, y = (p / w) | 0;
    const edge =
      x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
      map[p - 1] !== r || map[p + 1] !== r || map[p - w] !== r || map[p + w] !== r;
    d[p] = edge ? 1 : INF;
  }
  // Interior pixels (d > 1) are never on the image border, so neighbor indices are safe.
  for (let p = 0; p < N; p++) {
    if (d[p] <= 1) continue;
    const r = map[p];
    let v = d[p];
    if (map[p - 1] === r && d[p - 1] + 1 < v) v = d[p - 1] + 1;
    if (map[p - w] === r && d[p - w] + 1 < v) v = d[p - w] + 1;
    if (map[p - w - 1] === r && d[p - w - 1] + D < v) v = d[p - w - 1] + D;
    if (map[p - w + 1] === r && d[p - w + 1] + D < v) v = d[p - w + 1] + D;
    d[p] = v;
  }
  for (let p = N - 1; p >= 0; p--) {
    if (d[p] <= 1) continue;
    const r = map[p];
    let v = d[p];
    if (map[p + 1] === r && d[p + 1] + 1 < v) v = d[p + 1] + 1;
    if (map[p + w] === r && d[p + w] + 1 < v) v = d[p + w] + 1;
    if (map[p + w + 1] === r && d[p + w + 1] + D < v) v = d[p + w + 1] + D;
    if (map[p + w - 1] === r && d[p + w - 1] + D < v) v = d[p + w - 1] + D;
    d[p] = v;
  }
  return d;
}

/**
 * Morphological opening per region: any part of a region narrower than about 2·t
 * (halos, hairlines, thin tentacles) is handed to the neighboring color. Unlike the
 * small-region merge, this also catches thin bits attached to an otherwise big region.
 */
export function removeThinParts(colors: Int32Array, w: number, h: number, t: number): Int32Array {
  const N = w * h;
  const { map } = connectedComponents(colors, w, h);
  const d = distanceTransform(map, w, h);

  // Grow each region's "core" (pixels deeper than t) back out by t, staying inside the region.
  const reach = new Float32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (let p = 0; p < N; p++) {
    if (map[p] !== 0 && d[p] > t) { reach[p] = 0; queue[tail++] = p; }
  }
  while (head < tail) {
    const p = queue[head++];
    const next = reach[p] + 1;
    if (next > t + 0.5) continue;
    const x = p % w, r = map[p];
    const tryPush = (q: number) => {
      if (map[q] === r && reach[q] < 0) { reach[q] = next; queue[tail++] = q; }
    };
    if (x > 0) tryPush(p - 1);
    if (x < w - 1) tryPush(p + 1);
    if (p >= w) tryPush(p - w);
    if (p < N - w) tryPush(p + w);
  }

  // Everything not reached is thin. Fill it in from the outside, majority of kept neighbors.
  const out = colors.slice();
  const thin = new Uint8Array(N);
  let remaining = 0;
  for (let p = 0; p < N; p++) {
    if (map[p] !== 0 && reach[p] < 0) { thin[p] = 1; remaining++; }
  }
  const counts = new Map<number, number>();
  for (let pass = 0; pass < 64 && remaining > 0; pass++) {
    const assigned: number[] = [];
    const values: number[] = [];
    for (let p = 0; p < N; p++) {
      if (!thin[p]) continue;
      const x = p % w, y = (p / w) | 0;
      counts.clear();
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if ((dx === 0 && dy === 0) || xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (thin[q]) continue;
          counts.set(out[q], (counts.get(out[q]) ?? 0) + 1);
        }
      }
      let best = -1, bestC = 0;
      for (const [c, n] of counts) {
        // Prefer a real color over background when there's a choice.
        if (n > bestC || (n === bestC && best === 0)) { best = c; bestC = n; }
      }
      if (best >= 0) { assigned.push(p); values.push(best); }
    }
    if (!assigned.length) break;
    for (let i = 0; i < assigned.length; i++) {
      out[assigned[i]] = values[i];
      thin[assigned[i]] = 0;
    }
    remaining -= assigned.length;
  }
  return out;
}

interface Stats {
  area: Int32Array;
  maxD: Float32Array;
  argmax: Int32Array;
}

function regionStats(map: Int32Array, d: Float32Array, count: number): Stats {
  const area = new Int32Array(count + 1);
  const maxD = new Float32Array(count + 1);
  const argmax = new Int32Array(count + 1);
  for (let p = 0; p < map.length; p++) {
    const r = map[p];
    if (r === 0) continue;
    area[r]++;
    if (d[p] > maxD[r]) { maxD[r] = d[p]; argmax[r] = p; }
  }
  return { area, maxD, argmax };
}

function buildAdjacency(map: Int32Array, w: number, h: number, count: number): Map<number, number>[] {
  const M = count + 1;
  const pairs = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const a = map[p];
      if (x < w - 1) {
        const b = map[p + 1];
        if (a !== b) {
          const key = a < b ? a * M + b : b * M + a;
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
      }
      if (y < h - 1) {
        const b = map[p + w];
        if (a !== b) {
          const key = a < b ? a * M + b : b * M + a;
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
      }
    }
  }
  const adj: Map<number, number>[] = Array.from({ length: M }, () => new Map());
  for (const [key, c] of pairs) {
    const a = Math.floor(key / M), b = key % M;
    adj[a].set(b, c);
    adj[b].set(a, c);
  }
  return adj;
}

export interface SimplifiedRegions {
  colors: Int32Array;
  map: Int32Array;
  count: number;
  regionColor: Int32Array;
  area: Int32Array;
  labelX: Float32Array;
  labelY: Float32Array;
  labelR: Float32Array;
}

/**
 * Repeatedly merge regions that are too small (area) or too thin (no room for a number)
 * into the neighbor they share the longest border with.
 */
export function simplifyRegions(
  input: Int32Array,
  w: number,
  h: number,
  minArea: number,
  minRadius: number,
  maxIter = 6,
): SimplifiedRegions {
  let colors: Int32Array = input;
  for (let iter = 0; iter < maxIter; iter++) {
    const cc = connectedComponents(colors, w, h);
    const st = regionStats(cc.map, distanceTransform(cc.map, w, h), cc.count);
    const isSmall = (r: number) => st.area[r] < minArea || st.maxD[r] < minRadius;
    const small: number[] = [];
    for (let r = 1; r <= cc.count; r++) if (isSmall(r)) small.push(r);
    if (small.length === 0) break;
    small.sort((a, b) => st.area[a] - st.area[b]);

    const adj = buildAdjacency(cc.map, w, h, cc.count);
    const parent = new Int32Array(cc.count + 1);
    for (let i = 0; i <= cc.count; i++) parent[i] = i;
    let merged = false;

    for (const r of small) {
      if (parent[r] !== r || !isSmall(r)) continue;
      let best = -1, bestC = -1;
      for (const [m, c] of adj[r]) {
        if (m !== 0 && c > bestC) { bestC = c; best = m; }
      }
      if (best === -1) {
        // Only touches background: a stray speck. Drop it.
        if (adj[r].has(0)) {
          parent[r] = 0;
          adj[0].delete(r);
          adj[r].clear();
          merged = true;
        }
        continue;
      }
      parent[r] = best;
      st.area[best] += st.area[r];
      merged = true;
      const ab = adj[best];
      ab.delete(r);
      for (const [m, c] of adj[r]) {
        if (m === best) continue;
        ab.set(m, (ab.get(m) ?? 0) + c);
        const am = adj[m];
        am.delete(r);
        am.set(best, (am.get(best) ?? 0) + c);
      }
      adj[r].clear();
    }
    if (!merged) break;

    const finalColor = new Int32Array(cc.count + 1);
    for (let r = 1; r <= cc.count; r++) {
      let root = r;
      while (root !== 0 && parent[root] !== root) root = parent[root];
      finalColor[r] = root === 0 ? 0 : cc.color[root];
    }
    const next = new Int32Array(colors.length);
    for (let p = 0; p < next.length; p++) next[p] = finalColor[cc.map[p]];
    colors = next;
  }

  const cc = connectedComponents(colors, w, h);
  const st = regionStats(cc.map, distanceTransform(cc.map, w, h), cc.count);
  const labelX = new Float32Array(cc.count + 1);
  const labelY = new Float32Array(cc.count + 1);
  for (let r = 1; r <= cc.count; r++) {
    labelX[r] = (st.argmax[r] % w) + 0.5;
    labelY[r] = Math.floor(st.argmax[r] / w) + 0.5;
  }
  return {
    colors,
    map: cc.map,
    count: cc.count,
    regionColor: cc.color,
    area: st.area,
    labelX,
    labelY,
    labelR: st.maxD,
  };
}
