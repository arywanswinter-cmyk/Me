// pipeline.js — doodle strokes -> 3D creature mesh data. Pure JS + a 2D canvas, no WebGL, so it runs in tests.
// Exports: G, R2, rasterize, buildSolid, findMarks, heightField, surfaceNets, smoothMesh, vertexNormals,
//          anatomy, buildCreature, meshStats.
// Method: raster the strokes, close small gaps, fill the outline, take the largest piece, then inflate it as a
//   union of balls on its medial axis (every limb gets a round cross-section, junctions blend), extract the
//   surface with surface nets and relax it with Taubin smoothing.
// Invariants: deterministic for identical strokes; output mesh is closed with outward (CCW) winding;
//   world units are metres, +Y up, +Z faces whoever looked at the drawing, lowest point at Y = 0.
import { edt } from './edt.js';
import { flood, label } from './grid.js';

export const G = 112;            // mesh grid resolution
export const R2 = G * 2;         // raster resolution (2x supersampled)
const PAD = 18;                  // raster margin in pixels
const MIN_W = 9;                 // thinnest stroke in raster pixels, so thin legs survive
const CLOSE_R = 5;               // gaps narrower than ~2*CLOSE_R raster px get closed
const Z_SCALE = 0.9;             // slightly flattened cross-sections read as soft clay
const SMOOTH_ITERS = 6;
const SKIN = 1024;               // skin (drawn marks) texture size
const INK_ON_SKIN = '#5f4f48';

function canvas2d(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function rasterize(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const st of strokes) for (const p of st.pts) {
    const r = st.w / 2;
    if (p[0] - r < x0) x0 = p[0] - r; if (p[1] - r < y0) y0 = p[1] - r;
    if (p[0] + r > x1) x1 = p[0] + r; if (p[1] + r > y1) y1 = p[1] + r;
  }
  if (!isFinite(x0)) return null;
  const side = Math.max(x1 - x0, y1 - y0, 1);
  const s = (R2 - 2 * PAD) / side, ox = R2 / 2 - ((x0 + x1) / 2) * s, oy = R2 / 2 - ((y0 + y1) / 2) * s;
  const c = canvas2d(R2, R2), g = c.getContext('2d', { willReadFrequently: true });
  g.lineCap = g.lineJoin = 'round'; g.strokeStyle = g.fillStyle = '#000';
  for (const st of strokes) {
    const w = Math.max(st.w * s, MIN_W), p = st.pts;
    if (p.length === 1) { g.beginPath(); g.arc(p[0][0] * s + ox, p[0][1] * s + oy, w / 2, 0, Math.PI * 2); g.fill(); continue; }
    g.lineWidth = w; g.beginPath(); g.moveTo(p[0][0] * s + ox, p[0][1] * s + oy);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i][0] * s + ox, p[i][1] * s + oy);
    g.stroke();
  }
  const d = g.getImageData(0, 0, R2, R2).data, ink = new Uint8Array(R2 * R2);
  for (let i = 0; i < R2 * R2; i++) ink[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  return { ink, fit: { s, ox, oy } };
}

// Fill the doodle. A dilated copy of the ink stops the outside leaking through small gaps; the outside then
// grows back up to the real ink, so strokes keep their true width and gaps between legs stay open.
export function buildSolid(ink) {
  const N = R2, n = N * N;
  const dInk = edt(ink, N, N);
  const block = new Uint8Array(n);
  for (let i = 0; i < n; i++) block[i] = dInk[i] <= CLOSE_R ? 1 : 0;
  const ext = flood(block, N);
  // geodesic regrowth of the outside through non-ink pixels (8-connected, CLOSE_R + 1 steps)
  const dist = new Int16Array(n).fill(-1), q = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) if (ext[i]) { dist[i] = 0; q[qt++] = i; }
  while (qh < qt) {
    const i = q[qh++], d = dist[i];
    if (d >= CLOSE_R + 1) continue;
    const x = i % N, y = (i - x) / N;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (ink[j] || dist[j] >= 0) continue;
      dist[j] = d + 1; ext[j] = 1; q[qt++] = j;
    }
  }
  // Enclosed pockets: fill the real body, but leave thin slivers next to the outside open
  // (the gap between two legs whose feet touch is a pocket, not belly).
  const pocket = new Uint8Array(n);
  for (let i = 0; i < n; i++) pocket[i] = !ink[i] && !ext[i] ? 1 : 0;
  const holes = label(pocket, N, N, false);
  if (holes.sizes.length) {
    const dE = edt(ext, N, N), K = holes.sizes.length;
    const rad = new Float32Array(K), near = new Float32Array(K).fill(Infinity);
    for (let i = 0; i < n; i++) {
      const L = holes.lab[i];
      if (L < 0) continue;
      if (dInk[i] > rad[L]) rad[L] = dInk[i];
      if (dE[i] < near[L]) near[L] = dE[i];
    }
    let maxR = 0;
    for (let L = 0; L < K; L++) if (rad[L] > maxR) maxR = rad[L];
    for (let i = 0; i < n; i++) {
      const L = holes.lab[i];
      if (L >= 0 && rad[L] < 0.3 * maxR && near[L] < 16) ext[i] = 1;
    }
  }
  const solid0 = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid0[i] = ext[i] ? 0 : 1;
  const { lab, sizes } = label(solid0, N, N, false);
  if (!sizes.length) return null;
  let best = 0;
  for (let L = 1; L < sizes.length; L++) if (sizes[L] > sizes[best]) best = L;
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = lab[i] === best ? 1 : 0;
  const attached = attachNearMisses(solid, solid0, lab, sizes, best, N);
  const notSolid = new Uint8Array(n);
  let area = 0;
  for (let i = 0; i < n; i++) { notSolid[i] = 1 - solid[i]; area += solid[i]; }
  return { solid, area, attached, dIn: edt(notSolid, N, N), dOut: edt(solid, N, N) };
}

// Pieces drawn just short of the body (a leg that stops before the belly) get joined by a clay bridge
// that follows the shortest path to the body. Repeats so a foot can attach to a leg that attached to the body.
const ATTACH = 12;               // raster px, about 6% of the drawing
function attachNearMisses(solid, solid0, lab, sizes, best, N) {
  const done = new Uint8Array(sizes.length);
  done[best] = 1;
  const minSize = Math.max(12, sizes[best] * 0.002);
  let attached = 0;
  for (let round = 0; round < 4; round++) {
    const dMain = edt(solid, N, N);
    const nearest = new Int32Array(sizes.length).fill(-1), nd = new Float32Array(sizes.length).fill(Infinity);
    for (let i = 0; i < N * N; i++) {
      const L = lab[i];
      if (L < 0 || done[L] || sizes[L] < minSize) continue;
      if (dMain[i] < nd[L]) { nd[L] = dMain[i]; nearest[L] = i; }
    }
    let any = false;
    for (let L = 0; L < sizes.length; L++) {
      if (done[L] || nearest[L] < 0 || nd[L] > ATTACH) continue;
      any = true; done[L] = 1; attached++;
      for (let i = 0; i < N * N; i++) if (lab[i] === L) solid[i] = 1;
      // bridge: steepest descent on the distance-to-body field, stamping a disc as we go
      const rb = Math.min(4.5, Math.max(2.5, Math.sqrt(sizes[L]) * 0.25));
      let i = nearest[L];
      for (let guard = 0; guard < 64 && dMain[i] > 0; guard++) {
        const x = i % N, y = (i - x) / N;
        stampDisc(solid, N, x, y, rb);
        let bi = i;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const j = ny * N + nx;
          if (dMain[j] < dMain[bi]) bi = j;
        }
        if (bi === i) break;
        i = bi;
      }
      stampDisc(solid, N, i % N, Math.floor(i / N), rb);
    }
    if (!any) break;
  }
  return attached;
}

function stampDisc(mask, N, cx, cy, r) {
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(N - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(N - 1, Math.ceil(cx + r)); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) mask[y * N + x] = 1;
}

// Ink drawn inside the body: small round dots become eyes, everything else becomes skin markings.
export function findMarks(ink, solid, dIn) {
  const N = R2;
  const { lab, sizes } = label(ink, N, N, true);
  const K = sizes.length;
  const touch = new Uint8Array(K), mnx = new Int32Array(K).fill(N), mny = new Int32Array(K).fill(N);
  const mxx = new Int32Array(K).fill(-1), mxy = new Int32Array(K).fill(-1);
  const sx = new Float64Array(K), sy = new Float64Array(K), sxx = new Float64Array(K), syy = new Float64Array(K), sxy = new Float64Array(K);
  let bx0 = N, by0 = N, bx1 = -1, by1 = -1;
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = (i - x) / N;
    if (solid[i]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    const L = lab[i];
    if (L < 0) continue;
    if (!solid[i] || dIn[i] <= 3) touch[L] = 1;
    if (x < mnx[L]) mnx[L] = x; if (x > mxx[L]) mxx[L] = x; if (y < mny[L]) mny[L] = y; if (y > mxy[L]) mxy[L] = y;
    sx[L] += x + 0.5; sy[L] += y + 0.5; sxx[L] += x * x; syy[L] += y * y; sxy[L] += x * y;
  }
  const S = Math.max(bx1 - bx0 + 1, by1 - by0 + 1), sh = by1 - by0 + 1;
  const kinds = new Array(K).fill('outline');
  const eyeCands = [];
  for (let L = 0; L < K; L++) {
    if (touch[L]) continue;
    const w = mxx[L] - mnx[L] + 1, h = mxy[L] - mny[L] + 1, size = Math.max(w, h);
    const aspect = w / h, fill = sizes[L] / (w * h), cy = sy[L] / sizes[L];
    // elongation from second moments: dots and rings ~1, slashes and dashes > 1.5
    const nL = sizes[L], mx = (sx[L] / nL) - 0.5, my = (sy[L] / nL) - 0.5;
    const cxx = sxx[L] / nL - mx * mx, cyy = syy[L] / nL - my * my, cxy = sxy[L] / nL - mx * my;
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const elong = Math.sqrt((tr / 2 + disc) / Math.max(1e-6, tr / 2 - disc));
    const eyeLike = size <= 0.2 * S && aspect >= 0.5 && aspect <= 2 && fill >= 0.35 && elong <= 1.5 && cy <= by0 + 0.62 * sh;
    kinds[L] = 'mark';
    if (eyeLike) eyeCands.push({ L, fill });
  }
  // Filled dots beat slashes and squiggles: if any solid dot exists, only dots become eyes.
  const dots = eyeCands.filter((c) => c.fill >= 0.6);
  const picked = (dots.length ? dots : eyeCands).map((c) => c.L);
  eyeCands.length = 0; eyeCands.push(...picked);
  eyeCands.sort((a, b) => sizes[b] - sizes[a]);
  const eyes = [];
  for (const L of eyeCands.slice(0, 4)) {
    kinds[L] = 'eye';
    eyes.push({ x: sx[L] / sizes[L], y: sy[L] / sizes[L], r: Math.max(mxx[L] - mnx[L] + 1, mxy[L] - mny[L] + 1) / 2 });
  }
  return { lab, kinds, eyes };
}

function blur121(a, n) {
  const t = new Float32Array(a.length);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    t[i] = (a[i - (x > 0 ? 1 : 0)] + 2 * a[i] + a[i + (x < n - 1 ? 1 : 0)]) / 4;
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    a[i] = (t[i - (y > 0 ? n : 0)] + 2 * t[i] + t[i + (y < n - 1 ? n : 0)]) / 4;
  }
}

// Signed distance on the mesh grid, then height = union of balls centred on the medial axis (ridges).
export function heightField(solid, dIn, dOut) {
  const N = R2, sd = new Float32Array(G * G);
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let a = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = (2 * gy + dy) * N + 2 * gx + dx;
      a += solid[i] ? dIn[i] - 0.5 : -(dOut[i] - 0.5);
    }
    sd[gy * G + gx] = a / 8;
  }
  const H = Float32Array.from(sd);
  const S2 = Math.SQRT2;
  let ridges = 0;
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
    const i = y * G + x, v = sd[i];
    if (v < 0.75) continue;
    const m = Math.max(sd[i + 1] - v, sd[i - 1] - v, sd[i + G] - v, sd[i - G] - v,
      (sd[i + G + 1] - v) / S2, (sd[i + G - 1] - v) / S2, (sd[i - G + 1] - v) / S2, (sd[i - G - 1] - v) / S2);
    if (m >= 0.5) continue;
    ridges++;
    const r2 = v * v;
    const ya = Math.max(0, Math.floor(y - v)), yb = Math.min(G - 1, Math.ceil(y + v));
    const xa = Math.max(0, Math.floor(x - v)), xb = Math.min(G - 1, Math.ceil(x + v));
    for (let py = ya; py <= yb; py++) {
      const dy = py - y;
      for (let px = xa; px <= xb; px++) {
        const j = py * G + px;
        if (sd[j] <= 0) continue;
        const dx = px - x, d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        const h = Math.sqrt(r2 - d2);
        if (h > H[j]) H[j] = h;
      }
    }
  }
  for (let i = 0; i < G * G; i++) if (sd[i] > 0) H[i] *= Z_SCALE;
  blur121(H, G);
  let maxH = 0;
  for (let i = 0; i < H.length; i++) if (H[i] > maxH) maxH = H[i];
  return { sd, H, maxH, ridges };
}

const EDGES = [];
for (let k = 0; k < 8; k++) for (const bit of [1, 2, 4]) if (!(k & bit)) EDGES.push(k, k | bit);

// Surface nets on the implicit field F(x,y,z) = H(x,y) - |z|. Only cells near the surface are visited.
export function surfaceNets(H) {
  let maxH = 0;
  for (let i = 0; i < H.length; i++) if (H[i] > maxH) maxH = H[i];
  const Z = Math.ceil(maxH) + 2, ZD = 2 * Z;
  const cellIndex = new Int32Array(G * G * ZD).fill(-1);
  const pos = [], cells = [];
  const cv = new Float32Array(8);
  for (let y = 0; y < G - 1; y++) for (let x = 0; x < G - 1; x++) {
    const i = y * G + x;
    const hmax = Math.max(H[i], H[i + 1], H[i + G], H[i + G + 1]);
    if (hmax <= 0) continue;
    const zr = Math.ceil(hmax) + 1;
    for (let z = -zr; z < zr; z++) {
      let inside = 0;
      for (let k = 0; k < 8; k++) {
        const v = H[i + (k & 1) + ((k >> 1) & 1) * G] - Math.abs(z + ((k >> 2) & 1));
        cv[k] = v;
        if (v > 0) inside |= 1 << k;
      }
      if (inside === 0 || inside === 255) continue;
      let ax = 0, ay = 0, az = 0, n = 0;
      for (let e = 0; e < EDGES.length; e += 2) {
        const a = EDGES[e], b = EDGES[e + 1];
        if (((inside >> a) & 1) === ((inside >> b) & 1)) continue;
        const t = cv[a] / (cv[a] - cv[b]);
        ax += (a & 1) + ((b & 1) - (a & 1)) * t;
        ay += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
        az += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
        n++;
      }
      cellIndex[((z + Z) * G + y) * G + x] = pos.length / 3;
      pos.push(x + ax / n, y + ay / n, z + az / n);
      cells.push(x, y, z);
    }
  }
  const C = (x, y, z) => cellIndex[((z + Z) * G + y) * G + x];
  const d2 = (a, b) => { const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; };
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    if (d2(a, c) <= d2(b, d)) idx.push(a, b, c, a, c, d); else idx.push(a, b, d, b, c, d);
  };
  for (let k = 0; k < cells.length; k += 3) {
    const x = cells[k], y = cells[k + 1], z = cells[k + 2];
    const in0 = H[y * G + x] - Math.abs(z) > 0;
    if (x < G - 1 && y > 0 && in0 !== (H[y * G + x + 1] - Math.abs(z) > 0))
      quad(C(x, y, z), C(x, y - 1, z), C(x, y - 1, z - 1), C(x, y, z - 1), !in0);
    if (y < G - 1 && x > 0 && in0 !== (H[(y + 1) * G + x] - Math.abs(z) > 0))
      quad(C(x, y, z), C(x, y, z - 1), C(x - 1, y, z - 1), C(x - 1, y, z), !in0);
    if (x > 0 && y > 0 && in0 !== (H[y * G + x] - Math.abs(z + 1) > 0))
      quad(C(x, y, z), C(x - 1, y, z), C(x - 1, y - 1, z), C(x, y - 1, z), !in0);
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

// Taubin smoothing: alternating shrink/inflate Laplacian steps, so the surface relaxes without losing volume.
export function smoothMesh(pos, idx, iters, lam = 0.5, mu = -0.53) {
  const nV = pos.length / 3, off = new Int32Array(nV + 1);
  for (let t = 0; t < idx.length; t++) off[idx[t] + 1] += 2;
  for (let v = 0; v < nV; v++) off[v + 1] += off[v];
  const nb = new Int32Array(off[nV]), fill = off.slice(0, nV);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    nb[fill[a]++] = b; nb[fill[a]++] = c; nb[fill[b]++] = a; nb[fill[b]++] = c; nb[fill[c]++] = a; nb[fill[c]++] = b;
  }
  const avg = new Float32Array(pos.length);
  const step = (f) => {
    for (let v = 0; v < nV; v++) {
      let x = 0, y = 0, z = 0;
      const n = off[v + 1] - off[v];
      if (!n) { avg[v * 3] = pos[v * 3]; avg[v * 3 + 1] = pos[v * 3 + 1]; avg[v * 3 + 2] = pos[v * 3 + 2]; continue; }
      for (let j = off[v]; j < off[v + 1]; j++) { const u = nb[j] * 3; x += pos[u]; y += pos[u + 1]; z += pos[u + 2]; }
      avg[v * 3] = x / n; avg[v * 3 + 1] = y / n; avg[v * 3 + 2] = z / n;
    }
    for (let i = 0; i < pos.length; i++) pos[i] += f * (avg[i] - pos[i]);
  };
  for (let it = 0; it < iters; it++) { step(lam); step(mu); }
}

export function vertexNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += cx; n[k + 1] += cy; n[k + 2] += cz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

// Legs: separate runs just above the ground line. Head: fattest point in the upper half.
export function anatomy(sd) {
  let minX = G, maxX = -1, minY = G, maxY = -1;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (sd[y * G + x] > 0) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const py = Math.round(maxY - 0.12 * bh), runs = [];
  for (let x = minX; x <= maxX; x++) {
    if (sd[py * G + x] <= 0) continue;
    const a = x;
    while (x + 1 <= maxX && sd[py * G + x + 1] > 0) x++;
    runs.push({ x: (a + x) / 2, w: x - a + 1 });
  }
  const feet = runs.length >= 2 ? runs.slice(0, 12) : [];
  let hx = (minX + maxX) / 2, hy = (minY + maxY) / 2, hR = 0;
  const yLim = minY + 0.55 * bh;
  for (let y = minY; y <= yLim; y++) for (let x = minX; x <= maxX; x++) {
    const v = sd[y * G + x];
    if (v > hR) { hR = v; hx = x; hy = y; }
  }
  return { box: { minX, maxX, minY, maxY, bw, bh }, feet, stub: feet.length < 2, head: { x: hx, y: hy, r: hR } };
}

function bilinear(a, x, y) {
  x = Math.min(G - 1.001, Math.max(0, x)); y = Math.min(G - 1.001, Math.max(0, y));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * G + x0;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + G] * (1 - fx) + a[i + G + 1] * fx) * fy;
}

function classifyStrokes(strokes, fit, marks) {
  return strokes.map((st) => {
    const votes = { outline: 0, eye: 0, mark: 0 };
    const pts = st.pts;
    const sample = (x, y) => {
      const rx = Math.floor(x * fit.s + fit.ox), ry = Math.floor(y * fit.s + fit.oy);
      if (rx < 0 || ry < 0 || rx >= R2 || ry >= R2) return;
      const L = marks.lab[ry * R2 + rx];
      if (L >= 0) votes[marks.kinds[L]]++;
    };
    sample(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * fit.s / 2));
      for (let k = 1; k <= steps; k++) sample(ax + (bx - ax) * k / steps, ay + (by - ay) * k / steps);
    }
    return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  });
}

function strokeLength(st) {
  let l = 1;
  for (let i = 1; i < st.pts.length; i++) l += Math.hypot(st.pts[i][0] - st.pts[i - 1][0], st.pts[i][1] - st.pts[i - 1][1]);
  return l;
}

export function buildCreature(strokes, opts = {}) {
  const height = opts.height ?? 1.5;
  const t0 = performance.now();
  const ras = rasterize(strokes);
  if (!ras) return null;
  const sol = buildSolid(ras.ink);
  if (!sol) return null;
  const marks = findMarks(ras.ink, sol.solid, sol.dIn);
  const t1 = performance.now();
  const hf = heightField(sol.solid, sol.dIn, sol.dOut);
  const t2 = performance.now();
  const net = surfaceNets(hf.H);
  const t3 = performance.now();
  smoothMesh(net.pos, net.idx, SMOOTH_ITERS);
  const t4 = performance.now();
  const an = anatomy(hf.sd);

  const p = net.pos, nV = p.length / 3;
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (let v = 0; v < nV; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
  }
  const m = height / (by1 - by0), cx = (bx0 + bx1) / 2;
  const toX = (gx) => (gx - cx) * m, toY = (gy) => (by1 - gy) * m;
  const positions = new Float32Array(nV * 3), inkUv = new Float32Array(nV * 2);
  for (let v = 0; v < nV; v++) {
    const gx = p[v * 3], gy = p[v * 3 + 1], gz = p[v * 3 + 2];
    positions[v * 3] = toX(gx); positions[v * 3 + 1] = toY(gy); positions[v * 3 + 2] = gz * m;
    inkUv[v * 2] = (2 * gx + 1) / R2; inkUv[v * 2 + 1] = 1 - (2 * gy + 1) / R2;
  }
  const indices = new Uint32Array(net.idx.length);       // y was mirrored, so flip the winding back
  for (let t = 0; t < indices.length; t += 3) { indices[t] = net.idx[t]; indices[t + 1] = net.idx[t + 2]; indices[t + 2] = net.idx[t + 1]; }
  const normals = vertexNormals(positions, indices);
  const front = new Float32Array(nV);
  for (let v = 0; v < nV; v++) { const t = Math.min(1, Math.max(0, (normals[v * 3 + 2] - 0.12) / 0.38)); front[v] = t * t * (3 - 2 * t); }

  // Eyes: drawn dots win; otherwise two eyes on the head.
  const bh = an.box.bh;
  let eyesG;
  const autoEyes = marks.eyes.length === 0;
  if (!autoEyes) {
    eyesG = marks.eyes.map((e) => ({ x: (e.x - 1) / 2, y: (e.y - 1) / 2, r: Math.max(e.r / 2 * 1.3, 0.045 * bh) }));
  } else {
    const hd = an.head, r = Math.min(Math.max(0.22 * hd.r, 0.04 * bh), 0.12 * bh);
    const dx = Math.max(0.36 * hd.r, r * 1.08), ey = hd.y - 0.2 * hd.r;
    eyesG = [{ x: hd.x - dx, y: ey, r }, { x: hd.x + dx, y: ey, r }];
  }
  const eyes = eyesG.map((e) => {
    let hz = bilinear(hf.H, e.x, e.y);
    if (hz < 0.5) hz = Math.max(0.5, bilinear(hf.H, an.head.x, an.head.y));
    const gxH = (bilinear(hf.H, e.x + 1, e.y) - bilinear(hf.H, e.x - 1, e.y)) / 2;
    const gyH = (bilinear(hf.H, e.x, e.y + 1) - bilinear(hf.H, e.x, e.y - 1)) / 2;
    let nx = -gxH, ny = gyH, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const r = e.r * m;
    return { pos: [toX(e.x) - nx * 0.3 * r, toY(e.y) - ny * 0.3 * r, hz * m - nz * 0.3 * r], normal: [nx, ny, nz], r };
  });

  // Skin: the user's inner drawing (spots, mouth, stripes) printed onto the front of the clay.
  const kinds = classifyStrokes(strokes, ras.fit, marks);
  const skin = canvas2d(SKIN, SKIN), sg = skin.getContext('2d');
  sg.fillStyle = '#fff'; sg.fillRect(0, 0, SKIN, SKIN);
  sg.strokeStyle = sg.fillStyle = INK_ON_SKIN; sg.lineCap = sg.lineJoin = 'round';
  const k = SKIN / R2, { s, ox, oy } = ras.fit;
  let markCount = 0;
  strokes.forEach((st, i) => {
    if (kinds[i] !== 'mark') return;
    markCount++;
    const w = Math.max(st.w * s, 3) * k * 0.85, pts = st.pts;
    if (pts.length === 1) { sg.beginPath(); sg.arc((pts[0][0] * s + ox) * k, (pts[0][1] * s + oy) * k, w / 2, 0, Math.PI * 2); sg.fill(); return; }
    sg.lineWidth = w; sg.beginPath(); sg.moveTo((pts[0][0] * s + ox) * k, (pts[0][1] * s + oy) * k);
    for (let j = 1; j < pts.length; j++) sg.lineTo((pts[j][0] * s + ox) * k, (pts[j][1] * s + oy) * k);
    sg.stroke();
  });
  if (autoEyes && markCount === 0 && an.head.r > 4) {
    const hd = an.head, cxr = (2 * hd.x + 1) * k, cyr = (2 * (hd.y + 0.02 * hd.r) + 1) * k, rr = 2 * 0.3 * hd.r * k;
    sg.lineWidth = Math.max(6, 2 * 0.06 * hd.r * k);
    sg.beginPath(); sg.arc(cxr, cyr, rr, 0.22 * Math.PI, 0.78 * Math.PI); sg.stroke();
  }

  // Body colour: the pen that drew most of the outline.
  const weight = {};
  strokes.forEach((st, i) => { if (kinds[i] === 'outline') weight[st.color] = (weight[st.color] || 0) + strokeLength(st); });
  const color = Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] ?? strokes[0].color;

  const toScreenX = (gx) => ((2 * gx + 1) - ox) / s, toScreenY = (gy) => ((2 * gy + 1) - oy) / s;
  return {
    positions, normals, indices, inkUv, front, eyes, skin, color,
    feet: an.feet.map((f) => ({ x: toX(f.x), w: f.w * m })), stub: an.stub,
    height, width: (bx1 - bx0) * m, depth: (bz1 - bz0) * m,
    screenBox: { x0: toScreenX(bx0), x1: toScreenX(bx1), y0: toScreenY(by0), y1: toScreenY(by1) },
    stats: {
      verts: nV, tris: indices.length / 3, ridges: hf.ridges, solidArea: sol.area, attached: sol.attached, drawnEyes: marks.eyes.length, marks: markCount,
      ms: { mask: t1 - t0, field: t2 - t1, nets: t3 - t2, smooth: t4 - t3, total: performance.now() - t0 },
    },
  };
}

// For tests: open edges, non-manifold edges, signed volume, NaNs.
export function meshStats(pos, idx) {
  const nV = pos.length / 3, count = new Map();
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = idx[t + e], b = idx[t + (e + 1) % 3], key = a < b ? a * nV + b : b * nV + a;
    count.set(key, (count.get(key) || 0) + 1);
  }
  let open = 0, nonManifold = 0;
  for (const c of count.values()) { if (c === 1) open++; else if (c > 2) nonManifold++; }
  let vol = 0, nan = 0;
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) nan++;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    vol += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
  }
  return { edges: count.size, open, nonManifold, volume: vol, nan };
}
