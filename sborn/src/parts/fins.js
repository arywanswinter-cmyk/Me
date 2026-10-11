// fins.js — the 8 fin builders, membrane material (so they glow most), rounded outlines only.
// Exports: FINS (type → build(p, lod, R)).
// Invariants: part space +Y out of the skin, +Z creature-forward; fins stand in the part's Y–Z plane (thin along X);
//   spines are swept tubes that end in hemispheres; ripple's membrane is long along Z so the wave shader-free sway reads.
import { P, sheet, petalPts, leafPts, sweep, blob, merge, xf } from './kit.js';

const root = (s, lod, w = 0.035) => P(blob(w * s, [0, 0.008 * s, 0], lod, [1, 0.7, 1.3], 10, 8), 'skin');
const spine = (pts, r, lod) => { const g = sweep(pts, [r, r * 0.8, r * 0.6], { radial: 6, axial: 6, lod }); delete g.userData.tip; return g; };

export const FINS = {
  'fin.paddle': (p, lod, R) => {
    const s = R / 0.045, L = p.len, F = p.fat;
    const f = sheet(leafPts(0.13 * s * L, 0.05 * s * F, 12, 0.8), 0.007 * s, lod, 12); f.rotateX(-0.5 - 0.4 * p.curl);
    return { pieces: [P(f, 'membrane'), root(s, lod)], tips: [], radius: 0.15 * s * L, top: 0.12 * s * L };
  },
  'fin.ear': (p, lod, R) => {
    const s = R / 0.045, L = p.len, F = p.fat, pts = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20, a = Math.PI * t; pts.push([Math.cos(a) * 0.06 * s * F * (1 - 0.3 * t), Math.sin(a) * 0.16 * s * L * (0.85 + 0.15 * Math.sin(a))]); }
    const f = sheet(pts, 0.008 * s, lod, 14); f.rotateX(-0.25 * p.curl);
    return { pieces: [P(f, 'membrane'), root(s, lod, 0.04)], tips: [], radius: 0.18 * s * L, top: 0.16 * s * L };
  },
  'fin.whisker': (p, lod, R) => {
    const s = R / 0.045, L = p.len, g = [], sp = [];
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.45, len = (0.16 - 0.03 * Math.abs(i - 1)) * s * L;
      const f = sheet(leafPts(len, 0.014 * s, 10, 1), 0.004 * s, lod, 8); f.rotateX(0.9 + a + 0.3 * p.curl); g.push(f);
      sp.push(spine([[0, 0, 0], [0, len * 0.5 * Math.cos(0.9 + a), len * 0.5 * Math.sin(0.9 + a)], [0, len * 0.95 * Math.cos(0.9 + a), len * 0.95 * Math.sin(0.9 + a)]], 0.006 * s, lod));
    }
    return { pieces: [P(merge(g), 'membrane'), P(merge(sp), 'skin'), root(s, lod, 0.025)], tips: [], radius: 0.18 * s * L, top: 0.12 * s * L };
  },
  'fin.sail': (p, lod, R) => {
    const s = R / 0.045, L = p.len, F = p.fat;
    const f = sheet([[0.1 * s * F, 0], [0.09 * s * F, 0.08 * s * L], [0.04 * s * F, 0.17 * s * L], [-0.02 * s, 0.2 * s * L], [-0.07 * s * F, 0.15 * s * L], [-0.12 * s * F, 0.04 * s * L], [-0.13 * s * F, 0]], 0.01 * s, lod, 10);
    return { pieces: [P(f, 'membrane'), root(s, lod, 0.06)], tips: [], radius: 0.22 * s * L, top: 0.2 * s * L };
  },
  'fin.crest': (p, lod, R) => {
    const s = R / 0.045, L = p.len, pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, a = Math.PI * t; pts.push([Math.cos(a) * 0.1 * s * p.fat, (Math.sin(a) * (0.09 + 0.025 * Math.cos(a * 6)) + 0.005) * s * L]); }
    const f = sheet(pts, 0.009 * s, lod, 18); f.rotateX(-0.3 * p.curl);
    return { pieces: [P(f, 'membrane'), root(s, lod, 0.05)], tips: [], radius: 0.13 * s * L, top: 0.12 * s * L };
  },
  'fin.ripple': (p, lod, R) => {
    const s = R / 0.045, L = p.len, pts = [], n = 24;
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([(0.5 - t) * 0.36 * s * L, (0.035 + 0.02 * Math.sin(t * Math.PI * 5) * Math.sin(t * Math.PI)) * s * p.fat * Math.sin(Math.PI * Math.min(1, t * 1.15))]); }
    pts.push([-0.18 * s * L, 0], [0.18 * s * L, 0]);
    const f = sheet(pts, 0.008 * s, lod, 24);
    const pos = f.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + Math.sin(pos.getZ(i) / (0.06 * s) * Math.PI) * pos.getY(i) * 0.3);
    f.computeVertexNormals();
    return { pieces: [P(f, 'membrane'), P(blob(0.03 * s, [0, 0.004 * s, 0], lod, [0.8, 0.5, 5.5], 12, 6), 'skin')], tips: [], radius: 0.2 * s * L, top: 0.07 * s * p.fat };
  },
  'fin.glider': (p, lod, R) => {
    const s = R / 0.045, L = p.len, F = p.fat;
    const f = sheet([[0.04 * s, 0], [0.1 * s * F, 0.1 * s * L], [0.08 * s * F, 0.24 * s * L], [0, 0.28 * s * L], [-0.09 * s * F, 0.22 * s * L], [-0.12 * s * F, 0.08 * s * L], [-0.05 * s, 0]], 0.007 * s, lod, 10);
    f.rotateX(-0.25 * p.curl);
    const sp = [];
    for (const z of [0.05, 0, -0.06]) sp.push(spine([[0, 0, 0], [0, 0.12 * s * L, z * s * F], [0, 0.24 * s * L, z * 1.6 * s * F]], 0.006 * s, lod));
    const ribs = merge(sp); ribs.rotateX(-0.25 * p.curl);
    return { pieces: [P(f, 'membrane'), P(ribs, 'skin'), root(s, lod)], tips: [], radius: 0.3 * s * L, top: 0.27 * s * L };
  },
  'fin.sunfan': (p, lod, R) => {
    const s = R / 0.045, L = p.len, sp = [], pts = [[0, 0]];
    for (let i = 0; i < 5; i++) {
      const a = (-0.5 + i / 4) * 1.5 * (0.7 + 0.3 * p.fat), len = 0.17 * s * L;
      pts.push([Math.sin(a - 0.12) * len * 0.82, Math.cos(a - 0.12) * len * 0.82], [Math.sin(a) * len, Math.cos(a) * len], [Math.sin(a + 0.12) * len * 0.82, Math.cos(a + 0.12) * len * 0.82]);
      sp.push(sweep([[0, 0, 0], [0, Math.cos(a) * len * 0.55, Math.sin(a) * len * 0.55], [0, Math.cos(a) * len * 1.04, Math.sin(a) * len * 1.04]], [0.008 * s, 0.006 * s, 0.004 * s], { radial: 6, axial: 6, lod }));
    }
    pts.reverse();
    const f = sheet(pts.map(([x, y]) => [x, y]), 0.006 * s, lod, 4);
    const tipsG = merge(sp);
    return { pieces: [P(f, 'membrane'), P(tipsG, 'keratin'), root(s, lod)], tips: tipsG.userData.tips || [], radius: 0.19 * s * L, top: 0.18 * s * L };
  },
};
