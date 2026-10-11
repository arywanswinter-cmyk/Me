// kit.js — shared pieces for the part builders: piece records, rounded teeth/claws/spikes, eyes, thin sheets, fur cards.
// Exports: P(geo, mat, bone), tooth(...), claw(...), eyeBall(R, lod, opts), sheet(pts, depth, lod), leafPts(len, wid, n), card(w, h, lod),
//          blob(...), ring of helpers re-exported from geom.js.
// Invariants: every pointed piece is a sweep ending in a hemisphere (tip r ≥ 0.15 × base r), registered in `tips` via
//   geo.userData.tip; part space is +Y out of the skin, +Z creature-forward.
import * as THREE from 'three';
import { sweep, lathe, ellipsoid, extrude, xf, merge, seg, clean } from './geom.js';
export { sweep, lathe, ellipsoid, extrude, xf, merge, seg, clean };

export const P = (geo, mat, bone = 'socket') => ({ geo, mat, bone });
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// A rounded tooth/claw/spike from `a` along `dir` (unit) with optional bend toward `bend` (unit), tip r = 0.3 × base.
export function tooth(a, dir, len, r, { bend = null, bendAmt = 0, radial = 6, axial = 3, lod = 0, tipK = 0.3 } = {}) {
  const pts = [];
  for (let i = 0; i <= 2; i++) {
    const t = i / 2, b = bend ? bendAmt * t * t : 0;
    pts.push([a[0] + dir[0] * len * t + (bend ? bend[0] * b * len : 0), a[1] + dir[1] * len * t + (bend ? bend[1] * b * len : 0), a[2] + dir[2] * len * t + (bend ? bend[2] * b * len : 0)]);
  }
  return sweep(pts, [r, r * (0.5 + tipK / 2), r * tipK], { radial, axial, lod });
}
export const claw = (a, dir, len, r, bend, opts = {}) => tooth(a, dir, len, r, { bend, bendAmt: 0.45, radial: 8, axial: 4, ...opts });

// eye: one sphere (24×20, 6% cornea bulge within 35° of +Y) on the 'ball' bone, lids on lidU/lidL (skin).
export function eyeBall(R, lod, { lids = true, almond = 1, lift = 0.62, pupil = 0, lashes = 0, lidOpen = 84, squashY = 1 } = {}) {
  const c = [0, R * lift, 0];
  const g = new THREE.SphereGeometry(R, seg(24, lod), seg(20, lod));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / R, y = pos.getY(i) / R, z = pos.getZ(i) / R;
    const ang = Math.acos(Math.max(-1, Math.min(1, y)));
    const lim = THREE.MathUtils.degToRad(35);
    const bulge = ang < lim ? 1 + 0.06 * Math.cos((ang / lim) * Math.PI / 2) : 1;
    pos.setXYZ(i, x * R * bulge, y * R * bulge * (y > 0 ? squashY : 1), z * R * bulge * almond);
  }
  g.computeVertexNormals(); g.translate(...c);
  const pieces = [{ geo: clean(g), mat: 'eye', bone: 'ball', eye: { centre: c, R, pupil } }];
  const hinges = { ball: c };
  if (lids) {
    const lidU = new THREE.SphereGeometry(R * 1.06, seg(24, lod), seg(5, lod), 0, Math.PI * 2, 0, Math.PI / 2);
    lidU.scale(1, 1, almond); lidU.rotateX(Math.PI / 2); lidU.rotateX(THREE.MathUtils.degToRad(lidOpen)); lidU.translate(...c);
    const lidL = new THREE.SphereGeometry(R * 1.05, seg(24, lod), seg(5, lod), 0, Math.PI * 2, 0, Math.PI / 2);
    lidL.scale(1, 1, almond); lidL.rotateX(-Math.PI / 2); lidL.rotateX(THREE.MathUtils.degToRad(-78)); lidL.translate(...c);
    pieces.push(P(clean(lidU), 'skin', 'lidU'), P(clean(lidL), 'skin', 'lidL'));
    hinges.lidU = c; hinges.lidL = c;
    if (lashes) {
      const ls = [];
      for (let i = 0; i < lashes; i++) {
        const a = (-0.5 + i / Math.max(1, lashes - 1)) * 1.1;
        const base = [Math.sin(a) * R * 1.02, c[1] + R * 0.45, Math.cos(a) * R * 0.75 * almond];
        ls.push(sweep([base, [base[0] * 1.15, base[1] + R * 0.25, base[2] + R * 0.2], [base[0] * 1.3, base[1] + R * 0.3, base[2] + R * 0.45]], [R * 0.05, R * 0.04, R * 0.025], { radial: 4, axial: 2, lod }));
      }
      pieces.push(P(merge(ls), 'ink', 'lidU'));
    }
  }
  return { pieces, tips: [], radius: R * 1.4, top: c[1] + R, hinges, eye: { centre: c, R } };
}

// Thin sheet: 2D outline [x, y] (x across, y outward) extruded `depth` thick along part X, standing in the Y–Z plane.
export function sheet(pts, depth, lod = 0, segs = 14) {
  // LOD: keep every 2^lod-th outline point (at least 6) so L1/L2 really shed triangles
  const step = Math.max(1, Math.min(1 << lod, Math.floor(pts.length / 6))), q = pts.filter((_, i) => i % step === 0);
  const g = extrude(q, depth, depth * 0.4, segs, lod); g.rotateY(Math.PI / 2); return g;
}
export function leafPts(len, wid, n = 16, back = 0.6) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([Math.sin(Math.PI * t) * wid * (1 - 0.3 * t), t * len]); }
  for (let i = n - 1; i >= 1; i--) { const t = i / n; pts.push([-Math.sin(Math.PI * t) * wid * back * (1 - 0.3 * t), t * len]); }
  return pts;
}
// A rounded petal/feather outline of length len and width wid, tip rounded.
export function petalPts(len, wid, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = Math.PI * (i / n); pts.push([Math.cos(a) * wid, Math.sin(a) * len * (0.2 + 0.8 * Math.sin(a))]); }
  return pts.map(([x, y], i) => [x * (i === 0 || i === n ? 1 : 1), y]);
}
// Fur card: a thin bent quad strip (two-sided via extrude depth).
export function card(len, wid, lod = 0, curve = 0.3) {
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) { const t = i / n, w = wid * 0.5 * (1 - 0.6 * t) * (t > 0.85 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.85) / 0.15) ** 2)) : 1); pts.push([w, t * len]); }
  for (let i = n; i >= 0; i--) { const t = i / n, w = wid * 0.5 * (1 - 0.6 * t) * (t > 0.85 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.85) / 0.15) ** 2)) : 1); pts.push([-w, t * len]); }
  const g = sheet(pts, Math.max(0.0015, wid * 0.08), lod, 6);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, pos.getZ(i) - curve * y * y / Math.max(1e-3, len)); }
  g.computeVertexNormals();
  return g;
}
export const blob = (r, p, lod = 0, s = [1, 1, 1], w = 14, h = 10) => xf(ellipsoid(r * s[0], r * s[1], r * s[2], w, h, lod), { p });
export { lerp3 };
