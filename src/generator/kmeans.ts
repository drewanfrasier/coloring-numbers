/**
 * k-means clustering over 3-component points (CIELAB colors), with k-means++ seeding.
 * Trains on a random sample for speed; use assignAll() to label every point.
 */
export function kmeans(
  points: Float32Array,
  n: number,
  k: number,
  rng: () => number,
  maxIter = 24,
  sampleSize = 20000,
): { centers: Float32Array; counts: Float64Array } {
  const m = Math.min(n, sampleSize);
  const S = new Float32Array(m * 3);
  for (let i = 0; i < m; i++) {
    const src = n > sampleSize ? Math.floor(rng() * n) : i;
    S[i * 3] = points[src * 3];
    S[i * 3 + 1] = points[src * 3 + 1];
    S[i * 3 + 2] = points[src * 3 + 2];
  }

  // k-means++ seeding: each new center is picked with probability proportional to distance².
  const centers: number[] = [];
  const first = Math.floor(rng() * m);
  centers.push(S[first * 3], S[first * 3 + 1], S[first * 3 + 2]);
  const d2 = new Float64Array(m).fill(Infinity);
  while (centers.length / 3 < k) {
    const c = centers.length - 3;
    let sum = 0;
    for (let i = 0; i < m; i++) {
      const dl = S[i * 3] - centers[c], da = S[i * 3 + 1] - centers[c + 1], db = S[i * 3 + 2] - centers[c + 2];
      const d = dl * dl + da * da + db * db;
      if (d < d2[i]) d2[i] = d;
      sum += d2[i];
    }
    if (sum < 1e-6) break; // fewer distinct colors than k
    let t = rng() * sum;
    let pick = m - 1;
    for (let i = 0; i < m; i++) {
      t -= d2[i];
      if (t <= 0) { pick = i; break; }
    }
    centers.push(S[pick * 3], S[pick * 3 + 1], S[pick * 3 + 2]);
  }

  const K = centers.length / 3;
  const C = Float32Array.from(centers);
  const assign = new Int32Array(m).fill(-1);
  const sums = new Float64Array(K * 3);
  const counts = new Float64Array(K);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < m; i++) {
      const best = nearest(S, i, C, K);
      if (best !== assign[i]) { assign[i] = best; changed++; }
    }
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < m; i++) {
      const a = assign[i];
      sums[a * 3] += S[i * 3];
      sums[a * 3 + 1] += S[i * 3 + 1];
      sums[a * 3 + 2] += S[i * 3 + 2];
      counts[a]++;
    }
    for (let c = 0; c < K; c++) {
      if (counts[c] === 0) continue;
      C[c * 3] = sums[c * 3] / counts[c];
      C[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
      C[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
    }
    if (changed === 0) break;
  }
  return { centers: C, counts };
}

export function nearest(P: Float32Array, i: number, C: Float32Array, K: number): number {
  const l = P[i * 3], a = P[i * 3 + 1], b = P[i * 3 + 2];
  let best = 0;
  let bestD = Infinity;
  for (let c = 0; c < K; c++) {
    const dl = l - C[c * 3], da = a - C[c * 3 + 1], db = b - C[c * 3 + 2];
    const d = dl * dl + da * da + db * db;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/**
 * Merge centers closer than `threshold` (ΔE76) so a kid never has to tell apart two
 * nearly identical shades. Empty clusters are dropped.
 */
export function mergeClose(C: Float32Array, counts: Float64Array, threshold: number): Float32Array {
  const list: { l: number; a: number; b: number; w: number }[] = [];
  for (let c = 0; c < counts.length; c++) {
    if (counts[c] > 0) list.push({ l: C[c * 3], a: C[c * 3 + 1], b: C[c * 3 + 2], w: counts[c] });
  }
  const t2 = threshold * threshold;
  for (;;) {
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const dl = list[i].l - list[j].l, da = list[i].a - list[j].a, db = list[i].b - list[j].b;
        const d = dl * dl + da * da + db * db;
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bi < 0 || bd >= t2) break;
    const A = list[bi], B = list[bj], w = A.w + B.w;
    list[bi] = { l: (A.l * A.w + B.l * B.w) / w, a: (A.a * A.w + B.a * B.w) / w, b: (A.b * A.w + B.b * B.w) / w, w };
    list.splice(bj, 1);
  }
  const out = new Float32Array(list.length * 3);
  list.forEach((c, i) => { out[i * 3] = c.l; out[i * 3 + 1] = c.a; out[i * 3 + 2] = c.b; });
  return out;
}

export function assignAll(points: Float32Array, n: number, C: Float32Array): Uint8Array {
  const K = C.length / 3;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = nearest(points, i, C, K);
  return out;
}
