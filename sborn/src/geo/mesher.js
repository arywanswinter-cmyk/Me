// mesher.js — one complete skin job: SDF over culled 4³-cell bricks, 3D surface nets, Taubin, Newton projection,
//   then paint attributes, skin weights, AO, thickness and cavity.
// Exports: QUALITY, jobInput(shape, H) -> transferable input, runJob(input, quality) -> result (typed arrays + timings).
// Invariants: pure and deterministic (same input → bit-identical output on the main thread and in a worker); imports
//   only relative modules (workers cannot see the import map); buffers are pooled per thread, results are fresh copies.
// Surface-nets and Taubin smoothing follow Doodle World src/geo/pipeline.js, extended to a sparse 3D grid.
import { STRIDE, computePre, primDist, primBounds } from './sdf.js';

// Area-estimate factor: the prompt's 0.7, calibrated on the 12 fixtures so vertex counts land on target (DECISIONS M1).
export let AREA_K = 0.96;
export function setAreaK(k) { AREA_K = k; }
export const QUALITY = { preview: 2500, full: 15000, l1: 6000, l2: 2500, hero: 30000 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Everything the worker needs, as plain typed arrays (structured-clone friendly).
export function jobInput(shape, H = 1) {
  const P = shape.P;
  const sp = shape.spine;
  return {
    prims: P.data.slice(0, P.count * STRIDE), count: P.count, H,
    nBones: shape.bones.length,
    spine: { pts: sp.pts, s: sp.s, U: sp.U, rad: sp.rad, L: sp.L },
    limbs: shape.limbs.map((L) => {
      const ref = shape.limbs.find((x) => x.id === L.id && x.inst === 0);
      const ch = ref.chain;
      return { pts: ch.pts, s: ch.s, U: ch.U, X: ch.X, L: ch.L, mirrored: L.mirrored ? 1 : 0, hash: limbHash(L.id) };
    }),
  };
}
function limbHash(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

// ---- pooled scratch ----
const pool = {};
function buf(name, Ctor, n) { let b = pool[name]; if (!b || b.length < n) { b = pool[name] = new Ctor(Math.ceil(n * 1.25)); } return b; }
let stampGen = 1;

// Running smooth-min over a primitive sub-list. A bounding-sphere lower bound skips the exact distance when a
// primitive cannot change the result (its distance is ≥ acc + k), which is exact, not an approximation.
let BS = new Float64Array(0);
function boundSpheres(data, count) {
  if (BS.length < count * 4) BS = new Float64Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE;
    const cx = (data[o + 1] + data[o + 4]) / 2, cy = (data[o + 2] + data[o + 5]) / 2, cz = (data[o + 3] + data[o + 6]) / 2;
    const half = 0.5 * Math.hypot(data[o + 4] - data[o + 1], data[o + 5] - data[o + 2], data[o + 6] - data[o + 3]);
    BS[i * 4] = cx; BS[i * 4 + 1] = cy; BS[i * 4 + 2] = cz; BS[i * 4 + 3] = half + Math.max(data[o + 7], data[o + 8]);
  }
}
function fieldList(data, pre, P, x, y, z, list, off, n) {
  let acc = 1e9;
  for (let j = 0; j < n; j++) {
    const i = list[off + j];
    const k = data[i * STRIDE + 9];
    if (acc < 1e8) {
      const q = i * 4, dx = x - BS[q], dy = y - BS[q + 1], dz = z - BS[q + 2];
      const lb = Math.sqrt(dx * dx + dy * dy + dz * dz) - BS[q + 3];
      if (lb >= acc + (k > 0 ? k : 0)) continue;
    }
    const v = primDist(P, i, x, y, z);
    if (acc >= 1e8) { acc = v; continue; }
    const h = k - Math.abs(acc - v);
    if (k <= 0 || h <= 0) { if (v < acc) acc = v; continue; }
    const hh = h / k, m = acc < v ? acc : v;
    acc = k >= 0.05 ? m - hh * hh * hh * k * (1 / 6) : m - hh * hh * k * 0.25;
  }
  return acc;
}

const EDGES = [];
for (let k = 0; k < 8; k++) for (const bit of [1, 2, 4]) if (!(k & bit)) EDGES.push(k, k | bit);

export function runJob(input, quality = 'full') {
  const T = { start: now() };
  const full = quality !== 'preview';
  const target = QUALITY[quality] || QUALITY.full;
  const count = input.count;
  const data = new Float64Array(input.prims);
  const pre = new Float64Array(count * 8);
  computePre(data, pre, count);
  boundSpheres(data, count);
  const P = { data, pre, count };
  const log = [];

  // ---- resolution ----
  let A = 0, rMin = Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE, ra = data[o + 7], rb = data[o + 8];
    if (data[o] === 1) A += 4 * Math.PI * ra * ra;
    else { const l = Math.sqrt(pre[i * 8 + 3]); A += Math.PI * (ra + rb) * Math.sqrt(l * l + (ra - rb) * (ra - rb)); }
    rMin = Math.min(rMin, ra, data[o] === 1 ? ra : rb);
  }
  // free chain ends (spine tail and head, limb tips) add a hemisphere each
  let maxSpineSeg = -1;
  const lastSeg = {};
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE;
    if (data[o + 10] === 0) maxSpineSeg = Math.max(maxSpineSeg, data[o + 14]);
    if (data[o + 10] === 1) { const ow = data[o + 13]; if (!(ow in lastSeg) || data[o + 14] > data[lastSeg[ow] * STRIDE + 14]) lastSeg[ow] = i; }
  }
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE;
    if (data[o + 10] !== 0) continue;
    if (data[o + 14] === 0) A += 2 * Math.PI * data[o + 7] * data[o + 7];
    if (data[o + 14] === maxSpineSeg) A += 2 * Math.PI * data[o + 8] * data[o + 8];
  }
  for (const i of Object.values(lastSeg)) A += 2 * Math.PI * data[i * STRIDE + 8] * data[i * STRIDE + 8];
  A *= AREA_K;
  let bb = primBounds(P);
  const extent = Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]);
  let h = Math.min(extent / 40, Math.max(extent / 192, Math.sqrt(1.5 * A / target)));
  if (full && h > rMin / 1.5) {
    const h2 = rMin / 1.5;
    if (1.5 * A / (h2 * h2) <= 1.3 * target && h2 >= extent / 192) h = h2;
    else {
      for (let i = 0; i < count; i++) { const o = i * STRIDE; data[o + 7] = Math.max(data[o + 7], 1.5 * h); data[o + 8] = Math.max(data[o + 8], 1.5 * h); }
      computePre(data, pre, count);
      boundSpheres(data, count);
      bb = primBounds(P);
      log.push('thin-limb floor');
    }
  }

  // ---- grid ----
  const SB = 16;                                  // superbrick = 4 bricks of 4 cells
  // x lattice symmetric about the mid-plane (ox = −nx·h/2), so a symmetric creature meshes to a mirror-symmetric skin
  const xr = Math.max(-bb[0], bb[3]);
  const nx = Math.ceil((2 * xr + 4 * h) / h / SB) * SB, ox = -nx * h / 2, oy = bb[1] - 2 * h, oz = bb[2] - 2 * h;
  const ny = Math.ceil((bb[4] - bb[1] + 4 * h) / h / SB) * SB, nz = Math.ceil((bb[5] - bb[2] + 4 * h) / h / SB) * SB;
  const cx1 = nx + 1, cy1 = ny + 1, cz1 = nz + 1;
  const nCorner = cx1 * cy1 * cz1, nCell = nx * ny * nz;
  const cVal = buf('cVal', Float32Array, nCorner), cStamp = buf('cStamp', Int32Array, nCorner);
  const cellV = buf('cellV', Int32Array, nCell), cellStamp = buf('cellStamp', Int32Array, nCell);
  const gen = ++stampGen;
  const nbx = nx / 4, nby = ny / 4, nbz = nz / 4, nBrick = nbx * nby * nbz;
  const bOff = buf('bOff', Int32Array, nBrick + 1), bCnt = buf('bCnt', Int32Array, nBrick);
  let lists = buf('lists', Int32Array, Math.max(4096, count * 64));
  let listLen = 0;
  const active = buf('active', Int32Array, nBrick);
  let nActive = 0;
  const dist = buf('dist', Float64Array, count);
  const sList = buf('sList', Int32Array, count);
  const hdS = 8 * h * Math.sqrt(3), hdB = 2 * h * Math.sqrt(3);
  for (let i = 0; i < nBrick; i++) bCnt[i] = -1;
  for (let sz = 0; sz < nz / SB; sz++) for (let sy = 0; sy < ny / SB; sy++) for (let sx = 0; sx < nx / SB; sx++) {
    const cx = ox + (sx * SB + 8) * h, cy = oy + (sy * SB + 8) * h, cz = oz + (sz * SB + 8) * h;
    let dmin = Infinity;
    for (let i = 0; i < count; i++) { const d = primDist(P, i, cx, cy, cz); dist[i] = d; if (d < dmin) dmin = d; }
    let ns = 0;
    for (let i = 0; i < count; i++) if (dist[i] - hdS <= dmin + hdS + data[i * STRIDE + 9] + h) sList[ns++] = i;
    if (dmin > hdS + h + 0.0) {
      // even the closest primitive is beyond the superbrick: nothing to mesh here
      const f = fieldList(data, pre, P, cx, cy, cz, sList, 0, ns);
      if (Math.abs(f) > 1.25 * hdS + h) continue;
    }
    // bricks inside this superbrick
    for (let bz = 0; bz < 4; bz++) for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
      const gx = sx * 4 + bx, gy = sy * 4 + by, gz = sz * 4 + bz;
      const bcx = ox + (gx * 4 + 2) * h, bcy = oy + (gy * 4 + 2) * h, bcz = oz + (gz * 4 + 2) * h;
      let dm = Infinity;
      for (let j = 0; j < ns; j++) { const i = sList[j]; const d = primDist(P, i, bcx, bcy, bcz); dist[i] = d; if (d < dm) dm = d; }
      if (listLen + ns > lists.length) { const nl = new Int32Array(lists.length * 2); nl.set(lists); lists = pool.lists = nl; }
      const start = listLen;
      for (let j = 0; j < ns; j++) { const i = sList[j]; if (dist[i] - hdB <= dm + hdB + data[i * STRIDE + 9] + h) lists[listLen++] = i; }
      const nk = listLen - start;
      const f = fieldList(data, pre, P, bcx, bcy, bcz, lists, start, nk);
      if (Math.abs(f) > 1.25 * hdB + h || nk === 0) { listLen = start; continue; }
      const bi = (gz * nby + gy) * nbx + gx;
      bOff[bi] = start; bCnt[bi] = nk;
      active[nActive++] = bi;
    }
  }
  T.field0 = now();

  // ---- sub-block skip: a 2×2×2-cell block whose centre is farther than its half-diagonal from the surface has no
  // crossing (the field is 1-Lipschitz), so its cells make no vertices and their corners are never evaluated ----
  const subSkip = buf('subSkip', Uint8Array, nBrick);
  const hdSub = Math.sqrt(3) * h * 1.001;
  for (let a = 0; a < nActive; a++) {
    const bi = active[a], gx = bi % nbx, gy = ((bi / nbx) | 0) % nby, gz = (bi / (nbx * nby)) | 0;
    const o = bOff[bi], n = bCnt[bi];
    let m = 0;
    for (let k = 0; k < 8; k++) {
      const f = fieldList(data, pre, P, ox + (gx * 4 + (k & 1) * 2 + 1) * h, oy + (gy * 4 + ((k >> 1) & 1) * 2 + 1) * h, oz + (gz * 4 + ((k >> 2) & 1) * 2 + 1) * h, lists, o, n);
      if (Math.abs(f) > hdSub) m |= 1 << k;
    }
    subSkip[bi] = m;
  }
  const cornerAt = (X, Y, Z, o, n) => {
    const ci = (Z * cy1 + Y) * cx1 + X;
    if (cStamp[ci] !== gen) { cStamp[ci] = gen; cVal[ci] = fieldList(data, pre, P, ox + X * h, oy + Y * h, oz + Z * h, lists, o, n); }
    return cVal[ci];
  };
  T.field = now();

  // ---- surface nets: vertices ----
  let vCap = Math.max(4096, target * 2);
  let pos = buf('pos', Float32Array, vCap * 3);
  let vBrick = buf('vBrick', Int32Array, vCap);
  let vCell = buf('vCell', Int32Array, vCap * 3);
  let nv = 0;
  const cv = new Float64Array(8);
  for (let a = 0; a < nActive; a++) {
    const bi = active[a], gx = bi % nbx, gy = ((bi / nbx) | 0) % nby, gz = (bi / (nbx * nby)) | 0;
    const sk = subSkip[bi], bo = bOff[bi], bn = bCnt[bi];
    for (let z = 0; z < 4; z++) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      if ((sk >> ((x >> 1) | ((y >> 1) << 1) | ((z >> 1) << 2))) & 1) continue;
      const X = gx * 4 + x, Y = gy * 4 + y, Z = gz * 4 + z;
      let mask = 0;
      for (let k = 0; k < 8; k++) {
        const v = cornerAt(X + (k & 1), Y + ((k >> 1) & 1), Z + ((k >> 2) & 1), bo, bn); cv[k] = v;
        if (v < 0) mask |= 1 << k;
      }
      if (mask === 0 || mask === 255) continue;
      let ax = 0, ay = 0, az = 0, n = 0;
      for (let e = 0; e < EDGES.length; e += 2) {
        const p = EDGES[e], q = EDGES[e + 1];
        if (((mask >> p) & 1) === ((mask >> q) & 1)) continue;
        const t = cv[p] / (cv[p] - cv[q]);
        ax += (p & 1) + ((q & 1) - (p & 1)) * t;
        ay += ((p >> 1) & 1) + (((q >> 1) & 1) - ((p >> 1) & 1)) * t;
        az += ((p >> 2) & 1) + (((q >> 2) & 1) - ((p >> 2) & 1)) * t;
        n++;
      }
      if (nv >= vCap) {
        vCap *= 2;
        const np = new Float32Array(vCap * 3); np.set(pos); pos = pool.pos = np;
        const nb = new Int32Array(vCap); nb.set(vBrick); vBrick = pool.vBrick = nb;
        const nc = new Int32Array(vCap * 3); nc.set(vCell); vCell = pool.vCell = nc;
      }
      pos[nv * 3] = ox + (X + ax / n) * h; pos[nv * 3 + 1] = oy + (Y + ay / n) * h; pos[nv * 3 + 2] = oz + (Z + az / n) * h;
      vBrick[nv] = bi; vCell[nv * 3] = X; vCell[nv * 3 + 1] = Y; vCell[nv * 3 + 2] = Z;
      const cell = (Z * ny + Y) * nx + X;
      cellV[cell] = nv; cellStamp[cell] = gen;
      nv++;
    }
  }
  // ---- surface nets: quads, split on the shorter diagonal ----
  let iCap = nv * 6 + 64;
  let idx = buf('idx', Uint32Array, iCap);
  let ni = 0;
  const C = (X, Y, Z) => { if (X < 0 || Y < 0 || Z < 0) return -1; const c = (Z * ny + Y) * nx + X; return cellStamp[c] === gen ? cellV[c] : -1; };
  const d2 = (a, b) => { const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; };
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    if (ni + 6 > iCap) { iCap *= 2; const n2 = new Uint32Array(iCap); n2.set(idx); idx = pool.idx = n2; }
    if (d2(a, c) <= d2(b, d)) { idx[ni++] = a; idx[ni++] = b; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
    else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = d; idx[ni++] = b; idx[ni++] = c; idx[ni++] = d; }
  };
  const corner = (X, Y, Z) => cVal[(Z * cy1 + Y) * cx1 + X];
  for (let v = 0; v < nv; v++) {
    const X = vCell[v * 3], Y = vCell[v * 3 + 1], Z = vCell[v * 3 + 2];
    const in0 = corner(X, Y, Z) < 0;
    if (in0 !== (corner(X + 1, Y, Z) < 0)) quad(v, C(X, Y - 1, Z), C(X, Y - 1, Z - 1), C(X, Y, Z - 1), !in0);
    if (in0 !== (corner(X, Y + 1, Z) < 0)) quad(v, C(X, Y, Z - 1), C(X - 1, Y, Z - 1), C(X - 1, Y, Z), !in0);
    if (in0 !== (corner(X, Y, Z + 1) < 0)) quad(v, C(X - 1, Y, Z), C(X - 1, Y - 1, Z), C(X, Y - 1, Z), !in0);
  }
  T.nets = now();

  // ---- adjacency (CSR) and Taubin smoothing (2 iterations, λ 0.5, μ −0.53) ----
  const off = buf('adjOff', Int32Array, nv + 1);
  for (let i = 0; i <= nv; i++) off[i] = 0;
  for (let t = 0; t < ni; t++) off[idx[t] + 1] += 2;
  for (let v = 0; v < nv; v++) off[v + 1] += off[v];
  const nb = buf('adj', Int32Array, off[nv]), fill = buf('adjFill', Int32Array, nv);
  for (let v = 0; v < nv; v++) fill[v] = off[v];
  for (let t = 0; t < ni; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    nb[fill[a]++] = b; nb[fill[a]++] = c; nb[fill[b]++] = a; nb[fill[b]++] = c; nb[fill[c]++] = a; nb[fill[c]++] = b;
  }
  const avg = buf('avg', Float32Array, nv * 3);
  const relax = (f) => {
    for (let v = 0; v < nv; v++) {
      let x = 0, y = 0, z = 0; const n = off[v + 1] - off[v];
      if (!n) { avg[v * 3] = pos[v * 3]; avg[v * 3 + 1] = pos[v * 3 + 1]; avg[v * 3 + 2] = pos[v * 3 + 2]; continue; }
      for (let j = off[v]; j < off[v + 1]; j++) { const u = nb[j] * 3; x += pos[u]; y += pos[u + 1]; z += pos[u + 2]; }
      avg[v * 3] = x / n; avg[v * 3 + 1] = y / n; avg[v * 3 + 2] = z / n;
    }
    for (let i = 0; i < nv * 3; i++) pos[i] += f * (avg[i] - pos[i]);
  };
  for (let it = 0; it < 2; it++) { relax(0.5); relax(-0.53); }
  T.smooth = now();

  // ---- Newton projection from 4 tetrahedral taps at 0.5h; the same taps give the normal ----
  const nrm = new Int16Array(nv * 3);
  const nrmF = buf('nrmF', Float32Array, nv * 3);
  const e = 0.5 * h, s3 = 1 / Math.sqrt(3);
  const TET = [1, 1, 1, 1, -1, -1, -1, 1, -1, -1, -1, 1];
  for (let v = 0; v < nv; v++) {
    const bi = vBrick[v], o = bOff[bi], n = bCnt[bi];
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = 0, gy = 0, gz = 0, fm = 0;
    for (let k = 0; k < 4; k++) {
      const dx = TET[k * 3] * s3, dy = TET[k * 3 + 1] * s3, dz = TET[k * 3 + 2] * s3;
      const f = fieldList(data, pre, P, x + dx * e, y + dy * e, z + dz * e, lists, o, n);
      gx += dx * f; gy += dy * f; gz += dz * f; fm += f;
    }
    gx *= 3 / (4 * e); gy *= 3 / (4 * e); gz *= 3 / (4 * e); fm /= 4;
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    let step = fm / gl;
    if (step > e) step = e; else if (step < -e) step = -e;
    const nx_ = gx / gl, ny_ = gy / gl, nz_ = gz / gl;
    pos[v * 3] = x - nx_ * step; pos[v * 3 + 1] = y - ny_ * step; pos[v * 3 + 2] = z - nz_ * step;
    nrmF[v * 3] = nx_; nrmF[v * 3 + 1] = ny_; nrmF[v * 3 + 2] = nz_;
    nrm[v * 3] = Math.round(nx_ * 32767); nrm[v * 3 + 1] = Math.round(ny_ * 32767); nrm[v * 3 + 2] = Math.round(nz_ * 32767);
  }
  T.project = now();

  // ---- paint attributes: spine domain, limb domain, junction weight, belly ----
  const aDomain = new Float32Array(nv * 3), aDomain2 = new Float32Array(nv * 3), aPaint = new Uint16Array(nv * 4), aSkin = new Uint8Array(nv * 4);
  const sp = input.spine, spN = sp.s.length;
  const limbs = input.limbs;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const bi = vBrick[v], o = bOff[bi], n = bCnt[bi];
    // nearest spine and limb primitives among the brick's list
    let dS = Infinity, dL = Infinity, segS = 0, owner = -1, kRoot = 0.05, segL = 0;
    for (let j = 0; j < n; j++) {
      const i = lists[o + j], g = data[i * STRIDE + 10];
      const d = primDist(P, i, x, y, z);
      if (g === 0 && d < dS) { dS = d; segS = data[i * STRIDE + 14]; }
      else if (g === 1 && d < dL) { dL = d; owner = data[i * STRIDE + 13]; segL = data[i * STRIDE + 14]; kRoot = data[i * STRIDE + 9]; }
    }
    if (dS === Infinity) {
      // no spine primitive in this brick: scan all spine primitives once
      for (let i = 0; i < count; i++) if (data[i * STRIDE + 10] === 0) { const d = primDist(P, i, x, y, z); if (d < dS) { dS = d; segS = data[i * STRIDE + 14]; } }
    }
    // spine domain: closest point on the sampled spine curve near the owning segment
    let lo = Math.max(0, segS * 12 - 12), hi = Math.min(spN - 1, segS * 12 + 24), best = Infinity, bs = 0, bI = 0, bF = 0;
    for (let i = lo; i < hi; i++) {
      const ax = sp.pts[i * 3], ay = sp.pts[i * 3 + 1], az = sp.pts[i * 3 + 2];
      const bx = sp.pts[i * 3 + 3] - ax, by = sp.pts[i * 3 + 4] - ay, bz = sp.pts[i * 3 + 5] - az;
      const l2 = bx * bx + by * by + bz * bz || 1e-12;
      let f = ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2; f = f < 0 ? 0 : f > 1 ? 1 : f;
      const dx = x - ax - bx * f, dy = y - ay - by * f, dz = z - az - bz * f, d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; bI = i; bF = f; }
    }
    bs = sp.s[bI] + (sp.s[bI + 1] - sp.s[bI]) * bF;
    const cy_ = sp.pts[bI * 3 + 1] + (sp.pts[bI * 3 + 4] - sp.pts[bI * 3 + 1]) * bF, cz_ = sp.pts[bI * 3 + 2] + (sp.pts[bI * 3 + 5] - sp.pts[bI * 3 + 2]) * bF;
    const uy = sp.U[bI * 3 + 1], uz = sp.U[bI * 3 + 2];
    const yf = (y - cy_) * uy + (z - cz_) * uz;
    const rS = sp.rad[bI] + (sp.rad[bI + 1] - sp.rad[bI]) * bF;
    aDomain2[v * 3] = bs; aDomain2[v * 3 + 1] = Math.abs(x); aDomain2[v * 3 + 2] = yf;
    const belly = Math.min(1, Math.max(0, (-yf / Math.max(rS, 1e-3) - 0.15) / 0.7));
    let w = 0, tL = 0;
    if (owner >= 0) {
      const oi = owner | 0, k = Math.max(0.03, kRoot);
      w = Math.min(1, Math.max(0, 0.5 + (dS - dL) / (2 * k)));
      w = w * w * (3 - 2 * w);
    }
    if (owner >= 0) {                 // always the limb domain where a limb is near, so it never jumps inside a triangle
      const Lb = limbs[owner | 0];
      const lx = Lb.mirrored ? -x : x;
      const ln = Lb.s.length;
      let bb2 = Infinity, li = 0, lf = 0;
      for (let i = 0; i < ln - 1; i++) {
        const ax = Lb.pts[i * 3], ay = Lb.pts[i * 3 + 1], az = Lb.pts[i * 3 + 2];
        const bx = Lb.pts[i * 3 + 3] - ax, by = Lb.pts[i * 3 + 4] - ay, bz = Lb.pts[i * 3 + 5] - az;
        const l2 = bx * bx + by * by + bz * bz || 1e-12;
        let f = ((lx - ax) * bx + (y - ay) * by + (z - az) * bz) / l2; f = f < 0 ? 0 : f > 1 ? 1 : f;
        const dx = lx - ax - bx * f, dy = y - ay - by * f, dz = z - az - bz * f, d = dx * dx + dy * dy + dz * dz;
        if (d < bb2) { bb2 = d; li = i; lf = f; }
      }
      const ls = Lb.s[li] + (Lb.s[li + 1] - Lb.s[li]) * lf;
      const px = Lb.pts[li * 3] + (Lb.pts[li * 3 + 3] - Lb.pts[li * 3]) * lf, py = Lb.pts[li * 3 + 1] + (Lb.pts[li * 3 + 4] - Lb.pts[li * 3 + 1]) * lf, pz = Lb.pts[li * 3 + 2] + (Lb.pts[li * 3 + 5] - Lb.pts[li * 3 + 2]) * lf;
      const rx = lx - px, ry = y - py, rz = z - pz;
      const XX = Lb.X, UU = Lb.U, q = li * 3;
      aDomain[v * 3] = ls + 31.7 * Lb.hash; aDomain[v * 3 + 1] = rx * XX[q] + ry * XX[q + 1] + rz * XX[q + 2]; aDomain[v * 3 + 2] = rx * UU[q] + ry * UU[q + 1] + rz * UU[q + 2];
      tL = ls / (Lb.L || 1);
    } else {
      aDomain[v * 3] = aDomain2[v * 3]; aDomain[v * 3 + 1] = aDomain2[v * 3 + 1]; aDomain[v * 3 + 2] = aDomain2[v * 3 + 2];
      if (owner < 0) w = 0;
    }
    aPaint[v * 4] = Math.round(Math.min(1, bs / (sp.L || 1)) * 65535);
    aPaint[v * 4 + 1] = Math.round(belly * 65535);
    aPaint[v * 4 + 2] = Math.round(Math.min(1, tL) * 65535);
    aPaint[v * 4 + 3] = Math.round((w <= 0.02 ? 0 : w >= 0.98 ? 1 : w) * 65535);
    aSkin[v * 4 + 3] = (owner >= 0 && w > 0.5 ? Math.min(127, (owner | 0) + 1) : 0) | (x < 0 ? 128 : 0);
    aSkin[v * 4] = 255; aSkin[v * 4 + 1] = 0; aSkin[v * 4 + 2] = 255;   // preview: thick, no cavity, no occlusion
  }
  T.paint = now();

  let skinIndex = null, skinWeight = null;
  if (full) {
    // ---- AO, thickness, cavity at the brick-grid corners, trilinear per vertex ----
    const H = input.H || 1;
    const bcx1 = nbx + 1, bcy1 = nby + 1, bcz1 = nbz + 1, nBC = bcx1 * bcy1 * bcz1;
    const bcStamp = buf('bcStamp', Int32Array, nBC), bcAO = buf('bcAO', Float32Array, nBC), bcTh = buf('bcTh', Float32Array, nBC), bcCav = buf('bcCav', Float32Array, nBC);
    for (let a = 0; a < nActive; a++) {
      const bi = active[a], gx = bi % nbx, gy = ((bi / nbx) | 0) % nby, gz = (bi / (nbx * nby)) | 0;
      const o = bOff[bi], n = bCnt[bi];
      for (let k = 0; k < 8; k++) {
        const X = gx + (k & 1), Y = gy + ((k >> 1) & 1), Z = gz + ((k >> 2) & 1), ci = (Z * bcy1 + Y) * bcx1 + X;
        if (bcStamp[ci] === gen) continue;
        bcStamp[ci] = gen;
        const px = ox + X * 4 * h, py = oy + Y * 4 * h, pz = oz + Z * 4 * h;
        const fl = (a1, b1, c1) => fieldList(data, pre, P, a1, b1, c1, lists, o, n);
        const f0 = fl(px, py, pz);
        const fxp = fl(px + h, py, pz), fxm = fl(px - h, py, pz), fyp = fl(px, py + h, pz), fym = fl(px, py - h, pz), fzp = fl(px, py, pz + h), fzm = fl(px, py, pz - h);
        let gxx = fxp - fxm, gyy = fyp - fym, gzz = fzp - fzm;
        const lap = (fxp + fxm + fyp + fym + fzp + fzm - 6 * f0) / (h * h);
        const gl = Math.hypot(gxx, gyy, gzz) || 1; gxx /= gl; gyy /= gl; gzz /= gl;
        const sx = px - gxx * f0, sy = py - gyy * f0, sz = pz - gzz * f0;      // nearest surface point (approx.)
        let occ = 0, wsum = 0;
        for (let i = 1; i <= 5; i++) {
          const dd = (0.01 + 0.035 * i) * H, wi = Math.pow(0.5, i - 1);
          const fi = fl(sx + gxx * dd, sy + gyy * dd, sz + gzz * dd);
          occ += wi * Math.max(0, dd - fi) / dd; wsum += wi;
        }
        bcAO[ci] = Math.max(0, 1 - 1.6 * occ / wsum);
        let t = 0;
        for (let i = 0; i < 10; i++) { const fi = fl(sx - gxx * t, sy - gyy * t, sz - gzz * t); if (fi > 0 && t > 0) break; t += Math.max(Math.abs(fi), h); }
        bcTh[ci] = Math.min(t, 0.3);
        bcCav[ci] = Math.max(0, Math.min(1, -lap * h * 0.5));
      }
    }
    for (let v = 0; v < nv; v++) {
      const fx = (pos[v * 3] - ox) / (4 * h), fy = (pos[v * 3 + 1] - oy) / (4 * h), fz = (pos[v * 3 + 2] - oz) / (4 * h);
      const bi = vBrick[v], gx = bi % nbx, gy = ((bi / nbx) | 0) % nby, gz = (bi / (nbx * nby)) | 0;
      const tx = Math.min(1, Math.max(0, fx - gx)), ty = Math.min(1, Math.max(0, fy - gy)), tz = Math.min(1, Math.max(0, fz - gz));
      let ao = 0, th = 0, cav = 0;
      for (let k = 0; k < 8; k++) {
        const X = gx + (k & 1), Y = gy + ((k >> 1) & 1), Z = gz + ((k >> 2) & 1), ci = (Z * bcy1 + Y) * bcx1 + X;
        const wk = ((k & 1) ? tx : 1 - tx) * (((k >> 1) & 1) ? ty : 1 - ty) * (((k >> 2) & 1) ? tz : 1 - tz);
        ao += wk * bcAO[ci]; th += wk * bcTh[ci]; cav += wk * bcCav[ci];
      }
      aSkin[v * 4] = Math.round(Math.min(1, th / 0.3) * 255);
      aSkin[v * 4 + 1] = Math.round(Math.min(1, cav) * 255);
      aSkin[v * 4 + 2] = Math.round(Math.min(1, Math.max(0, ao)) * 255);
    }
    T.occlusion = now();

    // ---- skin weights: w_i = max(0, 1 − (d_i − d_min)/β_i)², β_i = max(k_i, 0.5 r_i) ----
    const nBones = input.nBones;
    const W = buf('W', Float32Array, nv * 4), WI = buf('WI', Int32Array, nv * 4);
    const acc = buf('wacc', Float32Array, nBones), touched = buf('wtouch', Int32Array, nBones + 8);
    for (let i = 0; i < nBones; i++) acc[i] = 0;
    const dd = buf('wd', Float64Array, count);
    for (let v = 0; v < nv; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const bi = vBrick[v], o = bOff[bi], n = bCnt[bi];
      let dmin = Infinity;
      for (let j = 0; j < n; j++) { const i = lists[o + j]; const d = primDist(P, i, x, y, z); dd[j] = d; if (d < dmin) dmin = d; }
      let nt = 0;
      const put = (b, w) => { if (b < 0 || w <= 0) return; if (acc[b] === 0) touched[nt++] = b; acc[b] += w; };
      for (let j = 0; j < n; j++) {
        const i = lists[o + j], q = i * STRIDE;
        const r = 0.5 * (data[q + 7] + data[q + 8]);
        const beta = Math.max(data[q + 9], 0.5 * r);
        let w = 1 - (dd[j] - dmin) / beta;
        if (w <= 0) continue;
        w *= w;
        const g = data[q + 10], bA = data[q + 11], bB = data[q + 12];
        if (g === 2 || bB < 0) { put(bA, w); continue; }
        // axis parameter t of the vertex along the cone
        const ax = data[q + 1], ay = data[q + 2], az = data[q + 3];
        const bx = data[q + 4] - ax, by = data[q + 5] - ay, bz = data[q + 6] - az;
        const l2 = bx * bx + by * by + bz * bz || 1e-12;
        let t = ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (g === 0) { put(bA, w * (1 - t)); put(bB, w * t); }
        else { const s = t < 0.6 ? 0 : (t - 0.6) / 0.4, sb = 0.5 * s * s * (3 - 2 * s); put(bA, w * (1 - sb)); put(bB, w * sb); }
      }
      // top 4, drop < 0.01, renormalize
      let tot = 0;
      for (let k = 0; k < 4; k++) { W[v * 4 + k] = 0; WI[v * 4 + k] = 0; }
      for (let k = 0; k < 4; k++) {
        let bi2 = -1, bw = 0;
        for (let j = 0; j < nt; j++) { const b = touched[j]; if (acc[b] > bw) { bw = acc[b]; bi2 = b; } }
        if (bi2 < 0) break;
        W[v * 4 + k] = bw; WI[v * 4 + k] = bi2; acc[bi2] = -acc[bi2]; tot += bw;
      }
      for (let j = 0; j < nt; j++) acc[touched[j]] = 0;
      for (let k = 0; k < 4; k++) { const wv = W[v * 4 + k] / (tot || 1); W[v * 4 + k] = wv < 0.01 ? 0 : wv; }
    }
    // 1 Laplacian pass over the sparse weights
    const W2 = buf('W2', Float32Array, nv * 4), WI2 = buf('WI2', Int32Array, nv * 4);
    for (let v = 0; v < nv; v++) {
      let nt = 0;
      const put = (b, w) => { if (w <= 0) return; if (acc[b] === 0) touched[nt++] = b; acc[b] += w; };
      for (let k = 0; k < 4; k++) put(WI[v * 4 + k], 0.5 * W[v * 4 + k]);
      const nn = off[v + 1] - off[v];
      for (let j = off[v]; j < off[v + 1]; j++) { const u = nb[j]; for (let k = 0; k < 4; k++) put(WI[u * 4 + k], 0.5 * W[u * 4 + k] / nn); }
      let tot = 0;
      for (let k = 0; k < 4; k++) {
        let bi2 = -1, bw = 0;
        for (let j = 0; j < nt; j++) { const b = touched[j]; if (acc[b] > bw) { bw = acc[b]; bi2 = b; } }
        W2[v * 4 + k] = bi2 < 0 ? 0 : bw; WI2[v * 4 + k] = bi2 < 0 ? 0 : bi2; if (bi2 >= 0) { acc[bi2] = -acc[bi2]; tot += bw; }
      }
      for (let j = 0; j < nt; j++) acc[touched[j]] = 0;
      for (let k = 0; k < 4; k++) W2[v * 4 + k] /= tot || 1;
    }
    skinIndex = new Uint8Array(nv * 4); skinWeight = new Uint8Array(nv * 4);
    for (let v = 0; v < nv; v++) {
      let sum = 0, big = 0;
      for (let k = 0; k < 4; k++) {
        let wv = W2[v * 4 + k]; if (wv < 0.01) wv = 0;
        const q = Math.round(wv * 255); skinWeight[v * 4 + k] = q; skinIndex[v * 4 + k] = WI2[v * 4 + k]; sum += q;
        if (q > skinWeight[v * 4 + big]) big = k;
      }
      skinWeight[v * 4 + big] += 255 - sum;     // u8 weights sum to exactly 255
    }
    T.weights = now();
  }

  // ---- outputs: fresh arrays (transferable) ----
  const position = pos.slice(0, nv * 3);
  const index = nv > 65535 ? idx.slice(0, ni) : Uint16Array.from(idx.subarray(0, ni));
  let minY = Infinity, b6 = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nv; v++) for (let a = 0; a < 3; a++) { const c = position[v * 3 + a]; if (c < b6[a]) b6[a] = c; if (c > b6[a + 3]) b6[a + 3] = c; }
  minY = b6[1];
  const end = now();
  return {
    quality, nv, nt: ni / 3, h, log, minY, bounds: b6,
    position, normal: nrm, index, aDomain, aDomain2, aPaint, aSkin, skinIndex, skinWeight,
    ms: { total: end - T.start, cull: T.field0 - T.start, field: T.field - T.start, nets: T.nets - T.field, smooth: T.smooth - T.nets, project: T.project - T.smooth, paint: T.paint - T.project,
      occlusion: T.occlusion ? T.occlusion - T.paint : 0, weights: T.weights ? T.weights - T.occlusion : 0 },
    stats: { bricks: nActive, grid: [nx, ny, nz] },
  };
}

// For tests: open edges, non-manifold edges, signed volume, NaNs (from Doodle World src/geo/pipeline.js meshStats).
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
    vol += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6;
  }
  return { edges: count.size, open, nonManifold, volume: vol, nan };
}
