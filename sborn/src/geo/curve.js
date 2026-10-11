// curve.js — bone-chain curves with arc-length parameters and rotation-minimising frames.
// Exports: spineCurve(verts) -> Chain, polyChain(points, radii, up0) -> Chain; Chain = { n, L, pts, rad, T, X, U, s,
//          at(u, out) -> {p, r, T, X, U}, nearest(x, y, z) -> {s, i, f, dist} }.
// Invariants: pure (no three.js, no DOM), so workers and Node tools import it; u ∈ [0,1] is arc length / L;
//   the spine lies in x = 0, so its frame is X = +x, U = T × X (exactly rotation-minimising for a planar curve).
const SUB = 12;

function finishChain(pts, rad, T, X, U) {
  const n = pts.length / 3, s = new Float64Array(n);
  for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
  const L = s[n - 1] || 1e-9;
  const chain = { n, L, pts, rad, T, X, U, s };
  chain.at = (u, out = {}) => {
    const target = Math.min(1, Math.max(0, u)) * L;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= target) lo = m; else hi = m; }
    const seg = s[hi] - s[lo] || 1e-9, f = Math.min(1, Math.max(0, (target - s[lo]) / seg));
    const L3 = (a, i) => a[lo * 3 + i] + (a[hi * 3 + i] - a[lo * 3 + i]) * f;
    out.p = [L3(pts, 0), L3(pts, 1), L3(pts, 2)];
    out.r = rad[lo] + (rad[hi] - rad[lo]) * f;
    const nz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    out.T = nz([L3(T, 0), L3(T, 1), L3(T, 2)]);
    out.X = nz([L3(X, 0), L3(X, 1), L3(X, 2)]);
    out.U = nz([L3(U, 0), L3(U, 1), L3(U, 2)]);
    out.i = lo; out.f = f;
    return out;
  };
  // Closest point on the polyline (brute force over segments; n ≤ ~300).
  chain.nearest = (x, y, z, out = {}) => {
    let best = Infinity, bi = 0, bf = 0;
    for (let i = 0; i < n - 1; i++) {
      const ax = pts[i * 3], ay = pts[i * 3 + 1], az = pts[i * 3 + 2];
      const bx = pts[i * 3 + 3] - ax, by = pts[i * 3 + 4] - ay, bz = pts[i * 3 + 5] - az;
      const l2 = bx * bx + by * by + bz * bz || 1e-12;
      let f = ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      const dx = x - ax - bx * f, dy = y - ay - by * f, dz = z - az - bz * f, d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; bi = i; bf = f; }
    }
    out.i = bi; out.f = bf; out.s = s[bi] + (s[bi + 1] - s[bi]) * bf; out.dist = Math.sqrt(best);
    return out;
  };
  return chain;
}

// Centripetal Catmull-Rom through the vertebrae (x = 0), SUB samples per segment, radii linear per segment.
export function spineCurve(verts) {
  const P = verts.map((v) => [0, v[0], v[1]]), R = verts.map((v) => v[2]);
  const m = P.length;
  const ext = [[0, 2 * P[0][1] - P[1][1], 2 * P[0][2] - P[1][2]], ...P, [0, 2 * P[m - 1][1] - P[m - 2][1], 2 * P[m - 1][2] - P[m - 2][2]]];
  const pts = [], rad = [];
  const tj = (a, b) => Math.pow(Math.max(1e-9, Math.hypot(b[1] - a[1], b[2] - a[2])), 0.5);
  for (let i = 0; i < m - 1; i++) {
    const p0 = ext[i], p1 = ext[i + 1], p2 = ext[i + 2], p3 = ext[i + 3];
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    for (let k = 0; k < SUB; k++) {
      const t = t1 + (t2 - t1) * (k / SUB);
      const pt = [0, 0, 0];
      for (const c of [1, 2]) {
        const A1 = (t1 - t) / (t1 - t0) * p0[c] + (t - t0) / (t1 - t0) * p1[c];
        const A2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
        const A3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2;
        const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        pt[c] = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      }
      pts.push(pt[0], pt[1], pt[2]);
      rad.push(R[i] + (R[i + 1] - R[i]) * (k / SUB));
    }
  }
  pts.push(0, P[m - 1][1], P[m - 1][2]); rad.push(R[m - 1]);
  const n = rad.length, T = new Float64Array(n * 3), X = new Float64Array(n * 3), U = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let ty = pts[b * 3 + 1] - pts[a * 3 + 1], tz = pts[b * 3 + 2] - pts[a * 3 + 2];
    const l = Math.hypot(ty, tz) || 1; ty /= l; tz /= l;
    T[i * 3 + 1] = ty; T[i * 3 + 2] = tz;
    X[i * 3] = 1;
    // U = T × X = (0, tz, -ty)
    U[i * 3 + 1] = tz; U[i * 3 + 2] = -ty;
  }
  return finishChain(new Float64Array(pts), new Float64Array(rad), T, X, U);
}

// A straight-segment chain (limbs) with a double-reflection rotation-minimising frame seeded by `up0`.
export function polyChain(points, radii, up0 = [0, 1, 0]) {
  const n = points.length;
  const pts = new Float64Array(n * 3), rad = new Float64Array(radii);
  points.forEach((p, i) => { pts[i * 3] = p[0]; pts[i * 3 + 1] = p[1]; pts[i * 3 + 2] = p[2]; });
  const T = new Float64Array(n * 3), X = new Float64Array(n * 3), U = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = pts[b * 3] - pts[a * 3], ty = pts[b * 3 + 1] - pts[a * 3 + 1], tz = pts[b * 3 + 2] - pts[a * 3 + 2];
    const l = Math.hypot(tx, ty, tz) || 1; T[i * 3] = tx / l; T[i * 3 + 1] = ty / l; T[i * 3 + 2] = tz / l;
  }
  // seed: U0 = up0 minus its tangent part (fallback +z if parallel)
  let ux = up0[0], uy = up0[1], uz = up0[2];
  let d = ux * T[0] + uy * T[1] + uz * T[2];
  ux -= d * T[0]; uy -= d * T[1]; uz -= d * T[2];
  let l = Math.hypot(ux, uy, uz);
  if (l < 1e-4) { ux = 0; uy = 0; uz = 1; d = T[2]; ux -= d * T[0]; uy -= d * T[1]; uz -= d * T[2]; l = Math.hypot(ux, uy, uz) || 1; }
  U[0] = ux / l; U[1] = uy / l; U[2] = uz / l;
  for (let i = 0; i < n - 1; i++) {
    // double reflection (Wang et al. 2008)
    const v1x = pts[i * 3 + 3] - pts[i * 3], v1y = pts[i * 3 + 4] - pts[i * 3 + 1], v1z = pts[i * 3 + 5] - pts[i * 3 + 2];
    const c1 = v1x * v1x + v1y * v1y + v1z * v1z || 1e-12;
    const rLx = U[i * 3] - (2 / c1) * (v1x * U[i * 3] + v1y * U[i * 3 + 1] + v1z * U[i * 3 + 2]) * v1x;
    const rLy = U[i * 3 + 1] - (2 / c1) * (v1x * U[i * 3] + v1y * U[i * 3 + 1] + v1z * U[i * 3 + 2]) * v1y;
    const rLz = U[i * 3 + 2] - (2 / c1) * (v1x * U[i * 3] + v1y * U[i * 3 + 1] + v1z * U[i * 3 + 2]) * v1z;
    const tLx = T[i * 3] - (2 / c1) * (v1x * T[i * 3] + v1y * T[i * 3 + 1] + v1z * T[i * 3 + 2]) * v1x;
    const tLy = T[i * 3 + 1] - (2 / c1) * (v1x * T[i * 3] + v1y * T[i * 3 + 1] + v1z * T[i * 3 + 2]) * v1y;
    const tLz = T[i * 3 + 2] - (2 / c1) * (v1x * T[i * 3] + v1y * T[i * 3 + 1] + v1z * T[i * 3 + 2]) * v1z;
    const v2x = T[i * 3 + 3] - tLx, v2y = T[i * 3 + 4] - tLy, v2z = T[i * 3 + 5] - tLz;
    const c2 = v2x * v2x + v2y * v2y + v2z * v2z;
    if (c2 < 1e-12) { U[i * 3 + 3] = rLx; U[i * 3 + 4] = rLy; U[i * 3 + 5] = rLz; continue; }
    const k = (2 / c2) * (v2x * rLx + v2y * rLy + v2z * rLz);
    U[i * 3 + 3] = rLx - k * v2x; U[i * 3 + 4] = rLy - k * v2y; U[i * 3 + 5] = rLz - k * v2z;
  }
  for (let i = 0; i < n; i++) {
    // X = U × T
    const ux2 = U[i * 3], uy2 = U[i * 3 + 1], uz2 = U[i * 3 + 2], tx = T[i * 3], ty = T[i * 3 + 1], tz = T[i * 3 + 2];
    X[i * 3] = uy2 * tz - uz2 * ty; X[i * 3 + 1] = uz2 * tx - ux2 * tz; X[i * 3 + 2] = ux2 * ty - uy2 * tx;
  }
  return finishChain(pts, rad, T, X, U);
}
