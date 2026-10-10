// sdf.js — the skin's signed distance field: round cones and mound spheres joined by ordered smooth-min.
// Exports: STRIDE, makePrims(list) -> {data, pre, count}, primDist(P, i, x, y, z), field(P, x, y, z, idx?, nIdx?),
//          fieldAll(P, x, y, z), primBounds(P) -> [minx..maxz], smin(a, b, k), gradient(P, x, y, z, e, idx, nIdx, out).
// Invariants: negative inside; quadratic smin below k = 0.05 m, cubic at or above; primitives blend in their fixed
//   order (spine, limbs, mounds), each with its own k into the running field; pure numbers, safe in workers.
export const STRIDE = 16;
// record: 0 type (0 cone, 1 sphere) | 1-3 a | 4-6 b | 7 ra | 8 rb | 9 k | 10 group (0 spine, 1 limb, 2 mound)
//         11 boneA | 12 boneB | 13 owner (limb instance or socket) | 14 seg index | 15 spare
export function makePrims(list) {
  const count = list.length, data = new Float64Array(count * STRIDE), pre = new Float64Array(count * 8);
  list.forEach((p, i) => {
    const o = i * STRIDE;
    data[o] = p.type; data[o + 1] = p.a[0]; data[o + 2] = p.a[1]; data[o + 3] = p.a[2];
    const b = p.b || p.a;
    data[o + 4] = b[0]; data[o + 5] = b[1]; data[o + 6] = b[2];
    data[o + 7] = p.ra; data[o + 8] = p.rb ?? p.ra; data[o + 9] = p.k; data[o + 10] = p.group;
    data[o + 11] = p.boneA ?? -1; data[o + 12] = p.boneB ?? -1; data[o + 13] = p.owner ?? -1; data[o + 14] = p.seg ?? 0;
  });
  computePre(data, pre, count);
  return { data, pre, count };
}
export function computePre(data, pre, count) {
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE, q = i * 8;
    const bx = data[o + 4] - data[o + 1], by = data[o + 5] - data[o + 2], bz = data[o + 6] - data[o + 3];
    const l2 = bx * bx + by * by + bz * bz, rr = data[o + 7] - data[o + 8], a2 = l2 - rr * rr;
    pre[q] = bx; pre[q + 1] = by; pre[q + 2] = bz; pre[q + 3] = l2; pre[q + 4] = rr; pre[q + 5] = a2; pre[q + 6] = l2 > 0 ? 1 / l2 : 0;
    pre[q + 7] = data[o] === 1 || l2 < 1e-12 || a2 <= 1e-12 ? 1 : 0;   // degenerate cone → spheres
  }
}

// iq's sdRoundCone with one square root; degenerate cones fall back to the union of their end spheres.
export function primDist(P, i, x, y, z) {
  const d = P.data, pr = P.pre, o = i * STRIDE, q = i * 8;
  const px = x - d[o + 1], py = y - d[o + 2], pz = z - d[o + 3];
  if (pr[q + 7]) {
    const s1 = Math.sqrt(px * px + py * py + pz * pz) - d[o + 7];
    if (d[o] === 1) return s1;
    const qx = x - d[o + 4], qy = y - d[o + 5], qz = z - d[o + 6];
    const s2 = Math.sqrt(qx * qx + qy * qy + qz * qz) - d[o + 8];
    return s1 < s2 ? s1 : s2;
  }
  const bax = pr[q], bay = pr[q + 1], baz = pr[q + 2], l2 = pr[q + 3], rr = pr[q + 4], a2 = pr[q + 5], il2 = pr[q + 6];
  const yy = px * bax + py * bay + pz * baz, zz = yy - l2;
  const wx = px * l2 - bax * yy, wy = py * l2 - bay * yy, wz = pz * l2 - baz * yy;
  const x2 = wx * wx + wy * wy + wz * wz, y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - d[o + 8];
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - d[o + 7];
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - d[o + 7];
}

export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  const m = a < b ? a : b;
  return k >= 0.05 ? m - h * h * h * k * (1 / 6) : m - h * h * k * 0.25;
}

// Field over a subset of primitives (indices in idx[0..nIdx)), in their fixed order.
export function field(P, x, y, z, idx, nIdx) {
  const d = P.data;
  let acc = 1e9;
  for (let j = 0; j < nIdx; j++) {
    const i = idx[j];
    const v = primDist(P, i, x, y, z);
    if (acc >= 1e8) { acc = v; continue; }
    const k = d[i * STRIDE + 9];
    if (k <= 0) { if (v < acc) acc = v; continue; }
    const h = k - Math.abs(acc - v);
    if (h <= 0) { if (v < acc) acc = v; continue; }
    const hh = h / k, m = acc < v ? acc : v;
    acc = k >= 0.05 ? m - hh * hh * hh * k * (1 / 6) : m - hh * hh * k * 0.25;
  }
  return acc;
}
let ALL = new Int32Array(0);
export function fieldAll(P, x, y, z) {
  if (ALL.length < P.count) { ALL = new Int32Array(P.count); for (let i = 0; i < P.count; i++) ALL[i] = i; }
  return field(P, x, y, z, ALL, P.count);
}
export function allIndex(P) { if (ALL.length < P.count) { ALL = new Int32Array(P.count); for (let i = 0; i < P.count; i++) ALL[i] = i; } return ALL; }

// Central-difference gradient (6 taps); out = [gx, gy, gz].
export function gradient(P, x, y, z, e, idx, nIdx, out) {
  out[0] = (field(P, x + e, y, z, idx, nIdx) - field(P, x - e, y, z, idx, nIdx)) / (2 * e);
  out[1] = (field(P, x, y + e, z, idx, nIdx) - field(P, x, y - e, z, idx, nIdx)) / (2 * e);
  out[2] = (field(P, x, y, z + e, idx, nIdx) - field(P, x, y, z - e, idx, nIdx)) / (2 * e);
  return out;
}

export function primBounds(P) {
  const d = P.data, b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.count; i++) {
    const o = i * STRIDE;
    for (const [c, r] of [[1, d[o + 7]], [4, d[o + 8]]]) {
      for (let a = 0; a < 3; a++) {
        if (d[o + c + a] - r < b[a]) b[a] = d[o + c + a] - r;
        if (d[o + c + a] + r > b[a + 3]) b[a + 3] = d[o + c + a] + r;
      }
    }
  }
  return b;
}
