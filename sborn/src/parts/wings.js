// wings.js — the 8 wing builders: side-mounted, +Y out from the body, wing plane spanned by Y (span) and Z (chord).
// Exports: WINGS (type → build(p, lod, R)); each returns `wing: {span, area}` for the flight rule.
// Invariants: membranes use the membrane material (glows); feathers and fingers are thin rounded sheets; all pieces hang
//   off the socket, whose bone the wing animation rotates about the creature-forward axis.
import { P, sheet, leafPts, petalPts, sweep, blob, merge, ellipsoid, xf } from './kit.js';

const fan = (n, len, wid, spread, lod, start = -0.2, pn = 14) => {
  const g = [];
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); const f = sheet(petalPts(len * (1 - 0.35 * t), wid, pn), Math.max(0.002, wid * 0.08), lod, 10); f.rotateX(start - spread * t); g.push(f); }
  return merge(g);
};
const wing = (span, chord) => ({ span, area: span * chord * 0.7 });

export const WINGS = {
  'wing.nub': (p, lod, R) => {
    const s = R / 0.04;
    const f = fan(3, 0.07 * s * p.len, 0.022 * s, 0.6, lod, 0.1);
    return { pieces: [P(f, 'skin'), P(blob(0.025 * s, [0, 0.01 * s, 0], lod, [1, 1, 1.2], 10, 8), 'skin')], tips: [], radius: 0.08 * s, top: 0.07 * s, wing: wing(0.07 * s, 0.04 * s) };
  },
  'wing.leaf': (p, lod, R) => {
    const s = R / 0.05, L = p.len;
    const a = sheet(leafPts(0.3 * s * L, 0.08 * s), 0.006 * s, lod, 16); a.rotateX(-0.15);
    const b = sheet(leafPts(0.22 * s * L, 0.06 * s), 0.006 * s, lod, 16); b.rotateX(0.55); b.translate(0, 0, -0.03 * s);
    return { pieces: [P(merge([a, b]), 'membrane'), P(blob(0.03 * s, [0, 0.01 * s, 0], lod, [1, 1, 1.33], 12, 8), 'skin')], tips: [], radius: 0.32 * s * L, top: 0.3 * s * L, wing: wing(0.3 * s * L, 0.13 * s) };
  },
  'wing.petal': (p, lod, R) => {
    const s = R / 0.05, L = p.len;
    const a = sheet(petalPts(0.26 * s * L, 0.11 * s), 0.005 * s, lod, 18); a.rotateX(0.35);
    const b = sheet(petalPts(0.2 * s * L, 0.09 * s), 0.005 * s, lod, 18); b.rotateX(-0.9);
    return { pieces: [P(merge([a, b]), 'tint:detail'), P(blob(0.03 * s, [0, 0.01 * s, 0], lod, [1, 1, 1.3], 10, 8), 'skin')], tips: [], radius: 0.28 * s * L, top: 0.26 * s * L, wing: wing(0.26 * s * L, 0.2 * s) };
  },
  'wing.glass': (p, lod, R) => {
    const s = R / 0.05, L = p.len, g = [];
    for (const [len, w, rx, dz] of [[0.28, 0.06, 0.25, 0.02], [0.24, 0.05, -0.35, -0.03]]) { const o = xf(ellipsoid(0.004 * s, len * s * L / 2, w * s, 16, 10, lod), { p: [0, len * s * L / 2, dz * s], r: [rx, 0, 0] }); g.push(o); }
    return { pieces: [P(merge(g), 'shell'), P(blob(0.025 * s, [0, 0.01 * s, 0], lod, [1, 1, 1.3], 10, 8), 'skin')], tips: [], radius: 0.3 * s * L, top: 0.28 * s * L, wing: wing(0.28 * s * L, 0.15 * s) };
  },
  'wing.sail': (p, lod, R) => {
    const s = R / 0.05, L = p.len, sp = [];
    const mem = sheet([[0.0, 0], [0.12 * s, 0.05 * s], [0.13 * s, 0.28 * s * L], [-0.02 * s, 0.32 * s * L], [-0.1 * s, 0.2 * s * L], [-0.08 * s, 0.03 * s]], 0.004 * s, lod, 8);
    for (const [x, y] of [[0.12, 0.27], [0.04, 0.31], [-0.04, 0.27], [-0.09, 0.19]]) { const g = sweep([[0, 0, 0], [0, y * s * L * 0.5, x * s * 0.5], [0, y * s * L, x * s]], [0.008 * s, 0.006 * s, 0.004 * s], { radial: 6, axial: 6, lod }); delete g.userData.tip; sp.push(g); }
    return { pieces: [P(mem, 'membrane'), P(merge(sp), 'keratin'), P(blob(0.03 * s, [0, 0.01 * s, 0], lod, [1, 1, 1.3], 10, 8), 'skin')], tips: [], radius: 0.34 * s * L, top: 0.32 * s * L, wing: wing(0.32 * s * L, 0.2 * s) };
  },
  'wing.umbrella': (p, lod, R) => {
    const s = R / 0.05, L = p.len, f = [];
    const arm = sweep([[0, 0, 0], [0, 0.12 * s * L, 0.03 * s], [0, 0.2 * s * L, 0.02 * s]], [0.016 * s, 0.013 * s, 0.01 * s], { radial: 8, axial: 6, lod }); delete arm.userData.tip;
    const pts = [[0, 0], [0.02 * s, 0.2 * s * L]];
    for (const [x, y] of [[0.06, 0.36], [-0.08, 0.38], [-0.2, 0.3]]) { const g = sweep([[0, 0.2 * s * L, 0.02 * s], [0, (0.2 + (y - 0.2) * 0.5) * s * L, (0.02 + x * 0.5) * s], [0, y * s * L, x * s]], [0.008 * s, 0.006 * s, 0.005 * s], { radial: 6, axial: 6, lod }); delete g.userData.tip; f.push(g); pts.push([x * s, y * s * L]); }
    pts.push([-0.16 * s, 0.12 * s * L], [-0.05 * s, 0.02 * s]);
    const mem = sheet(pts.map(([z, y]) => [z, y]), 0.004 * s, lod, 8);
    return { pieces: [P(mem, 'membrane'), P(merge([arm, ...f]), 'skin'), P(blob(0.03 * s, [0, 0.01 * s, 0], lod, [1, 1, 1.3], 10, 8), 'skin')], tips: [], radius: 0.4 * s * L, top: 0.38 * s * L, wing: wing(0.38 * s * L, 0.26 * s) };
  },
  'wing.feather': (p, lod, R) => {
    const s = R / 0.05, L = p.len;
    const f = fan(12, 0.26 * s * L, 0.022 * s, 1.5, lod, 0.35, 8);
    const arm = sweep([[0, 0, 0], [0, 0.1 * s * L, -0.02 * s], [0, 0.2 * s * L, -0.06 * s]], [0.022 * s, 0.016 * s, 0.01 * s], { radial: 8, axial: 6, lod }); delete arm.userData.tip;
    return { pieces: [P(f, 'tint:coat'), P(arm, 'skin')], tips: [], radius: 0.32 * s * L, top: 0.26 * s * L, wing: wing(0.3 * s * L, 0.24 * s) };
  },
  'wing.cloud': (p, lod, R) => {
    const s = R / 0.06, L = p.len, g = [];
    for (let i = 0; i < 9; i++) { const t = i / 8; g.push(xf(ellipsoid(0.05 * s, 0.07 * s * L, 0.05 * s, 10, 8, lod), { p: [0, (0.06 + 0.26 * Math.sin(1.3 * t + 0.2)) * s * L, (0.14 - 0.34 * t) * s], s: [0.6, 1, 1] })); }
    return { pieces: [P(merge(g), 'tint:detail'), P(blob(0.035 * s, [0, 0.01 * s, 0], lod, [1, 1, 1.3], 10, 8), 'skin')], tips: [], radius: 0.4 * s * L, top: 0.36 * s * L, wing: wing(0.38 * s * L, 0.34 * s) };
  },
};
