// noise-gen.js — the two tileable 64³ RGBA8 noise volumes behind every pattern and skin relief.
// Exports: N, genNoiseA() -> Uint8Array (R gradient noise, G fBm, B fBm of a second seed, A value noise),
//          genNoiseB() -> Uint8Array (R Worley F1, G Worley F2, B cell id, A ridged fBm).
// Invariants: pure and deterministic, periodic with period 64 texels on every axis (8 lattice cells per tile), safe in
//   workers (no imports beyond relative ones); Worley distances are in cell units scaled so 1.0 ↔ 255.
export const N = 64;
const CELLS = 8, SPAN = N / CELLS;

function hash3(x, y, z, s) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1442695040) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrap = (i, p) => ((i % p) + p) % p;

function gradNoise(x, y, z, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  let acc = 0;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const val = [];
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    const X = wrap(xi + dx, period), Y = wrap(yi + dy, period), Z = wrap(zi + dz, period);
    const a = hash3(X, Y, Z, seed) * Math.PI * 2, b = Math.acos(2 * hash3(X, Y, Z, seed + 7) - 1);
    const gx = Math.sin(b) * Math.cos(a), gy = Math.sin(b) * Math.sin(a), gz = Math.cos(b);
    val.push(gx * (xf - dx) + gy * (yf - dy) + gz * (zf - dz));
  }
  const l = (a, b, t) => a + (b - a) * t;
  acc = l(l(l(val[0], val[1], u), l(val[2], val[3], u), v), l(l(val[4], val[5], u), l(val[6], val[7], u), v), w);
  return acc;   // ≈ [-1, 1]
}
function valueNoise(x, y, z, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const h = (dx, dy, dz) => hash3(wrap(xi + dx, period), wrap(yi + dy, period), wrap(zi + dz, period), seed);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
function fbm(x, y, z, seed, oct = 4) {
  let a = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { const p = CELLS * f; a += amp * gradNoise(x * p, y * p, z * p, p, seed + o * 31); n += amp; amp *= 0.5; f *= 2; }
  return a / n;
}

export function genNoiseA() {
  const out = new Uint8Array(N * N * N * 4);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = ((z * N + y) * N + x) * 4, u = x / N, v = y / N, w = z / N;
    const g = gradNoise(u * CELLS, v * CELLS, w * CELLS, CELLS, 11);
    out[i] = Math.max(0, Math.min(255, Math.round((g * 0.5 + 0.5) * 255)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round((fbm(u, v, w, 101) * 0.75 + 0.5) * 255)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round((fbm(u, v, w, 211, 3) * 0.75 + 0.5) * 255)));
    out[i + 3] = Math.round(valueNoise(u * N / 2, v * N / 2, w * N / 2, N / 2, 5) * 255);
  }
  return out;
}

export function genNoiseB() {
  const CELLS = 4, SPAN = N / CELLS;      // 16 texels per Worley cell keeps spot edges round under linear filtering
  // feature points: one per lattice cell, jittered
  const pts = new Float32Array(CELLS * CELLS * CELLS * 4);
  for (let z = 0; z < CELLS; z++) for (let y = 0; y < CELLS; y++) for (let x = 0; x < CELLS; x++) {
    const k = ((z * CELLS + y) * CELLS + x) * 4;
    pts[k] = x + 0.15 + 0.7 * hash3(x, y, z, 41); pts[k + 1] = y + 0.15 + 0.7 * hash3(x, y, z, 43); pts[k + 2] = z + 0.15 + 0.7 * hash3(x, y, z, 47); pts[k + 3] = hash3(x, y, z, 53);
  }
  const out = new Uint8Array(N * N * N * 4);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = (x + 0.5) / SPAN, py = (y + 0.5) / SPAN, pz = (z + 0.5) / SPAN;
    const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
    let f1 = 9, f2 = 9, id = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = cx + dx, Y = cy + dy, Z = cz + dz;
      const k = ((wrap(Z, CELLS) * CELLS + wrap(Y, CELLS)) * CELLS + wrap(X, CELLS)) * 4;
      const fx = pts[k] + (X - wrap(X, CELLS)), fy = pts[k + 1] + (Y - wrap(Y, CELLS)), fz = pts[k + 2] + (Z - wrap(Z, CELLS));
      const d = Math.hypot(px - fx, py - fy, pz - fz);
      if (d < f1) { f2 = f1; f1 = d; id = pts[k + 3]; } else if (d < f2) f2 = d;
    }
    const i = ((z * N + y) * N + x) * 4;
    out[i] = Math.min(255, Math.round(f1 / 1.2 * 255));
    out[i + 1] = Math.min(255, Math.round(f2 / 1.6 * 255));
    out[i + 2] = Math.round(id * 255);
    const u = x / N, v = y / N, w = z / N;
    let r = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 3; o++) { const p = 8 * f; r += amp * (1 - Math.abs(gradNoise(u * p, v * p, w * p, p, 301 + o))); amp *= 0.5; f *= 2; }
    out[i + 3] = Math.max(0, Math.min(255, Math.round(r / 0.875 * 255)));
  }
  return out;
}
