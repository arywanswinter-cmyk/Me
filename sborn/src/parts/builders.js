// builders.js — parametric part builders: build(type, params, lod, R) -> { pieces: [{geo, mat, bone}], tips, radius, top }.
// Exports: BUILDERS (type → fn), buildPart(type, p, lod, R) (cached by type, quantized params, lod and size), PIECE_MATS.
// Invariants: pure functions of their inputs (cached); part space: +Y out of the skin, +Z creature-forward, origin at the
//   sunk base; every tooth, horn, claw, spike and beak tip ends in a hemisphere with r ≥ 0.15 × base radius; bones are
//   'socket', 'jaw', 'ball', 'lidU', 'lidL' (pivots given in `hinges`).
import * as THREE from 'three';
import { sweep, lathe, ellipsoid, extrude, xf, merge, seg } from './geom.js';

export const PIECE_MATS = ['skin', 'keratin', 'mouth', 'teeth', 'tongue', 'sclera', 'iris', 'pupil', 'membrane', 'shell'];
const P = (geo, mat, bone = 'socket') => ({ geo, mat, bone });

// eye: sclera + iris + pupil on the 'ball' bone (looks along +Y), lids on lidU/lidL
function eye(R, lod, { lids = true, iris = 0.48, almond = 1, dome = 0 } = {}) {
  const c = [0, R * 0.62 + dome * R, 0];
  const pieces = [];
  pieces.push(P(xf(ellipsoid(R, R, R * almond, 24, 20, lod), { p: c }), 'sclera', 'ball'));
  pieces.push(P(xf(ellipsoid(R * iris, R * 0.12, R * iris * almond, 20, 8, lod), { p: [c[0], c[1] + R * 0.9, c[2]] }), 'iris', 'ball'));
  pieces.push(P(xf(ellipsoid(R * 0.22, R * 0.06, R * 0.22 * almond, 16, 6, lod), { p: [c[0], c[1] + R * 0.985, c[2]] }), 'pupil', 'ball'));
  if (dome) pieces.push(P(xf(ellipsoid(R * 1.35, R * (0.8 + dome), R * 1.35, 20, 12, lod), { p: [0, 0, 0] }), 'skin'));
  if (lids) {
    // upper lid: hemisphere cap with axis +Z, tilted 40° back (open); closes by rotating −130° about X
    const lidU = new THREE.SphereGeometry(R * 1.06, seg(24, lod), seg(5, lod), 0, Math.PI * 2, 0, Math.PI / 2);
    lidU.rotateX(Math.PI / 2); lidU.rotateX(THREE.MathUtils.degToRad(72)); lidU.translate(...c);
    const lidL = new THREE.SphereGeometry(R * 1.05, seg(24, lod), seg(5, lod), 0, Math.PI * 2, 0, Math.PI / 2);
    lidL.rotateX(-Math.PI / 2); lidL.rotateX(THREE.MathUtils.degToRad(-78)); lidL.translate(...c);
    pieces.push(P(lidU, 'skin', 'lidU'), P(lidL, 'skin', 'lidL'));
  }
  return { pieces, tips: [], radius: R * 1.4, top: c[1] + R, hinges: { ball: c, lidU: c, lidL: c }, eye: { centre: c, R } };
}

const tooth = (x, y, z, len, r, dir = [0, 0, -1]) => sweep([[x, y, z], [x + dir[0] * len * 0.5, y + dir[1] * len * 0.5, z + dir[2] * len * 0.5], [x + dir[0] * len, y + dir[1] * len, z + dir[2] * len]], [r, r * 0.75, r * 0.45], { radial: 8, axial: 4 });

export const BUILDERS = {
  'mouth.grin': (p, lod, R) => {
    const s = R / 0.085, L = p.len, F = p.fat;
    const muzzle = xf(ellipsoid(0.075 * s * F, 0.05 * s * L, 0.055 * s, 20, 14, lod), { p: [0, 0.035 * s * L, 0.005 * s] });
    const interior = xf(ellipsoid(0.045 * s * F, 0.016 * s, 0.014 * s, 16, 8, lod), { p: [0, 0.074 * s * L, -0.012 * s] });
    const lip = xf(ellipsoid(0.05 * s * F, 0.02 * s, 0.017 * s, 16, 8, lod), { p: [0, 0.066 * s * L, -0.03 * s] });
    const t1 = tooth(-0.016 * s, 0.083 * s * L, -0.004 * s, 0.014 * s, 0.006 * s), t2 = tooth(0.016 * s, 0.083 * s * L, -0.004 * s, 0.014 * s, 0.006 * s);
    const teeth = merge([t1, t2]);
    return { pieces: [P(muzzle, 'skin'), P(interior, 'mouth'), P(lip, 'skin', 'jaw'), P(teeth, 'teeth')], tips: teeth.userData.tips, radius: 0.09 * s, top: 0.09 * s * L, hinges: { jaw: [0, 0.03 * s, -0.01 * s] } };
  },
  'mouth.chomper': (p, lod, R) => {
    const s = R / 0.11, L = p.len, F = p.fat;
    const muzzle = xf(ellipsoid(0.11 * s * F, 0.065 * s * L, 0.07 * s, 24, 14, lod), { p: [0, 0.04 * s * L, 0.015 * s] });
    const interior = xf(ellipsoid(0.085 * s * F, 0.02 * s, 0.03 * s, 18, 8, lod), { p: [0, 0.088 * s * L, -0.01 * s] });
    const jaw = xf(ellipsoid(0.095 * s * F, 0.05 * s * L, 0.035 * s, 20, 10, lod), { p: [0, 0.06 * s * L, -0.045 * s] });
    const tongue = xf(ellipsoid(0.04 * s, 0.025 * s, 0.012 * s, 12, 6, lod), { p: [0, 0.075 * s * L, -0.03 * s] });
    const up = [], lo = [];
    for (let i = 0; i < 5; i++) {
      const a = (-0.6 + 1.2 * (i / 4)), x = Math.sin(a) * 0.07 * s * F, y = (0.095 - 0.02 * Math.abs(Math.sin(a))) * s * L;
      up.push(tooth(x, y, 0.002 * s, 0.018 * s, 0.009 * s));
      lo.push(tooth(x * 0.9, y - 0.01 * s, -0.042 * s, 0.016 * s, 0.009 * s, [0, 0, 1]));
    }
    const tu = merge(up), tl = merge(lo);
    return { pieces: [P(muzzle, 'skin'), P(interior, 'mouth'), P(jaw, 'skin', 'jaw'), P(tongue, 'tongue', 'jaw'), P(tu, 'teeth'), P(tl, 'teeth', 'jaw')],
      tips: [...tu.userData.tips, ...tl.userData.tips], radius: 0.13 * s, top: 0.11 * s * L, hinges: { jaw: [0, 0.03 * s, -0.02 * s] } };
  },
  'mouth.peep': (p, lod, R) => {
    const s = R / 0.085, L = p.len, c = p.curl;
    const upper = sweep([[0, 0, 0.004 * s], [0, 0.05 * s * L, -0.004 * s * c], [0, 0.09 * s * L, -0.016 * s * c]], [0.055 * s, 0.03 * s, 0.009 * s], { radial: 14, axial: 10, lod, squash: 0.7 });
    const lower = sweep([[0, 0, -0.012 * s], [0, 0.04 * s * L, -0.018 * s], [0, 0.072 * s * L, -0.022 * s]], [0.045 * s, 0.024 * s, 0.008 * s], { radial: 12, axial: 8, lod, squash: 0.7 });
    const interior = xf(ellipsoid(0.03 * s, 0.03 * s * L, 0.008 * s, 12, 8, lod), { p: [0, 0.03 * s * L, -0.008 * s] });
    return { pieces: [P(upper, 'keratin'), P(lower, 'keratin', 'jaw'), P(interior, 'mouth')], tips: [upper.userData.tip, lower.userData.tip], radius: 0.1 * s, top: 0.095 * s * L, hinges: { jaw: [0, 0.01 * s, -0.012 * s] } };
  },
  'eye.moon': (p, lod, R) => eye(R * p.fat, lod, { iris: 0.56 }),
  'eye.button': (p, lod, R) => { const e = eye(R * p.fat, lod, { lids: false, iris: 0.3 }); return e; },
  'foot.nub': (p, lod, R) => {
    const rt = R, L = p.len, F = p.fat;
    const pad = xf(ellipsoid(1.15 * rt * F, 0.55 * rt, 1.55 * rt * L, 20, 12, lod), { p: [0, 0.45 * rt, 0.45 * rt * L] });
    const toes = [];
    for (let i = -1; i <= 1; i++) toes.push(xf(ellipsoid(0.32 * rt, 0.28 * rt, 0.32 * rt, 10, 8, lod), { p: [i * 0.55 * rt * F, 0.72 * rt, 1.75 * rt * L] }));
    return { pieces: [P(merge([pad, ...toes]), 'skin')], tips: [], radius: 2 * rt * L, top: rt, sole: rt };
  },
  'foot.hoof': (p, lod, R) => {
    const rt = R, F = p.fat;
    const prof = [[0.001, rt], [0.95 * rt * F, rt], [1.05 * rt * F, 0.7 * rt], [0.95 * rt * F, 0.1 * rt], [0.75 * rt, -0.2 * rt], [0.001, -0.2 * rt]];
    const h1 = lathe(prof.map(([r, y]) => [r, -y + 0.8 * rt]), 24, { lod, phi: 0.06, len: Math.PI - 0.12 });
    const h2 = lathe(prof.map(([r, y]) => [r, -y + 0.8 * rt]), 24, { lod, phi: Math.PI + 0.06, len: Math.PI - 0.12 });
    const g = merge([h1, h2]); g.rotateY(Math.PI / 2);
    // close the halves' open faces with a thin centre plate (dark cleft)
    return { pieces: [P(g, 'keratin'), P(xf(ellipsoid(0.9 * rt * F, 0.5 * rt, 0.08 * rt, 12, 6, lod), { p: [0, 0.55 * rt, 0] }), 'mouth')], tips: [], radius: 1.2 * rt, top: rt, sole: rt };
  },
  'hand.mitten': (p, lod, R) => {
    const rt = R, L = p.len, F = p.fat;
    const mitt = xf(ellipsoid(1.25 * rt * F, 1.5 * rt * L, 0.8 * rt, 20, 14, lod), { p: [0, 1.2 * rt * L, 0] });
    const thumb = sweep([[0.7 * rt, 0.6 * rt, 0.2 * rt], [1.2 * rt, 1.0 * rt, 0.3 * rt], [1.35 * rt, 1.5 * rt * L, 0.25 * rt]], [0.45 * rt, 0.4 * rt, 0.32 * rt], { radial: 10, axial: 6, lod });
    return { pieces: [P(merge([mitt, thumb]), 'skin')], tips: [], radius: 2.6 * rt * L, top: 2.6 * rt * L };
  },
  'tail.puff': (p, lod, R) => {
    const s = R / 0.05, F = p.fat;
    const g = [xf(ellipsoid(0.07 * s * F, 0.07 * s * F, 0.07 * s * F, 20, 14, lod), { p: [0, 0.06 * s * F, 0] })];
    for (let i = 0; i < 7; i++) { const a = i * 2.4, b = (i / 7) * 2 - 1; g.push(xf(ellipsoid(0.035 * s, 0.035 * s, 0.035 * s, 10, 8, lod), { p: [Math.cos(a) * 0.055 * s * F * Math.sqrt(1 - b * b), 0.06 * s * F + b * 0.055 * s * F, Math.sin(a) * 0.055 * s * F * Math.sqrt(1 - b * b)] })); }
    return { pieces: [P(merge(g), 'skin')], tips: [], radius: 0.13 * s * F, top: 0.13 * s * F };
  },
  'tail.curly': (p, lod, R) => {
    const s = R / 0.05, L = p.len, C = 0.5 + p.curl;
    const path = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * Math.PI * 2.2 * C; path.push([Math.sin(a) * 0.04 * s * t, t * 0.22 * s * L, (1 - Math.cos(a)) * 0.04 * s * t]); }
    const g = sweep(path, [0.04 * s * p.fat, 0.03 * s, 0.022 * s], { radial: 12, axial: 24, lod });
    return { pieces: [P(g, 'skin')], tips: [], radius: 0.26 * s * L, top: 0.22 * s * L };
  },
  'det.nubhorn': (p, lod, R) => {
    const s = R / 0.045, L = p.len, F = p.fat;
    const g = sweep([[0, 0, 0], [0, 0.04 * s * L, 0.004 * s * p.curl], [0, 0.075 * s * L, 0.01 * s * p.curl]], [0.045 * s * F, 0.03 * s * F, 0.014 * s * F], { radial: 14, axial: 8, lod });
    return { pieces: [P(g, 'keratin')], tips: [g.userData.tip], radius: 0.09 * s * L, top: 0.09 * s * L };
  },
  'wing.leaf': (p, lod, R) => {
    const s = R / 0.05, L = p.len;
    const leaf = (len, wid) => { const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([Math.sin(Math.PI * t) * wid * (1 - 0.3 * t), t * len]); } for (let i = 15; i >= 1; i--) { const t = i / 16; pts.push([-Math.sin(Math.PI * t) * wid * 0.6 * (1 - 0.3 * t), t * len]); } return pts; };
    // extruded in XY then laid into the part's Y–Z plane (thin along X)
    const a = extrude(leaf(0.3 * s * L, 0.08 * s), 0.006 * s, 0.002 * s, 16, lod); a.rotateY(Math.PI / 2); a.rotateX(-0.15);
    const b = extrude(leaf(0.22 * s * L, 0.06 * s), 0.006 * s, 0.002 * s, 16, lod); b.rotateY(Math.PI / 2); b.rotateX(0.55); b.translate(0, 0, -0.03 * s);
    const root = xf(ellipsoid(0.03 * s, 0.03 * s, 0.04 * s, 12, 8, lod), { p: [0, 0.01 * s, 0] });
    return { pieces: [P(merge([a, b]), 'membrane'), P(root, 'skin')], tips: [], radius: 0.32 * s * L, top: 0.3 * s * L, wing: { span: 0.3 * s * L, area: 0.3 * s * L * 0.08 * s * 1.3 + 0.22 * s * L * 0.06 * s * 1.3 } };
  },
};

const cache = new Map();
export function buildPart(type, p, lod = 0, R = 0.05) {
  const b = BUILDERS[type];
  if (!b) return null;
  const key = `${type}|${lod}|${R.toFixed(4)}|${Object.keys(p).sort().map((k) => `${k}:${(+p[k]).toFixed(3)}`).join(',')}`;
  let out = cache.get(key);
  if (!out) {
    out = b(p, lod, R);
    for (const pc of out.pieces) { pc.geo.computeBoundingSphere(); }
    out.tris = out.pieces.reduce((a, pc) => a + pc.geo.index.count / 3, 0);
    cache.set(key, out);
    if (cache.size > 600) cache.delete(cache.keys().next().value);
  }
  return out;
}
