// tails.js — the 8 tail builders: +Y points away from the body (backward at the tail end), +Z up.
// Exports: TAILS (type → build(p, lod, R)).
// Invariants: every tail is skin-tinted unless it has hard bits; flexible sweeps are posed by springs at runtime
//   (they hang off the socket bone here); the fan's feathers flare by rotating the socket in emotes.
import { P, sweep, blob, merge, sheet, leafPts, petalPts, card, ellipsoid, xf } from './kit.js';

export const TAILS = {
  'tail.puff': (p, lod, R) => {
    const s = R / 0.05, F = p.fat;
    const g = [blob(0.07 * s * F, [0, 0.06 * s * F, 0], lod, [1, 1, 1], 18, 12)];
    for (let i = 0; i < 7; i++) { const a = i * 2.4, b = (i / 7) * 2 - 1, q = Math.sqrt(1 - b * b); g.push(blob(0.035 * s, [Math.cos(a) * 0.055 * s * F * q, 0.06 * s * F + b * 0.055 * s * F, Math.sin(a) * 0.055 * s * F * q], lod, [1, 1, 1], 8, 6)); }
    return { pieces: [P(merge(g), 'skin')], tips: [], radius: 0.13 * s * F, top: 0.13 * s * F };
  },
  'tail.curly': (p, lod, R) => {
    const s = R / 0.05, L = p.len, C = 0.5 + p.curl, path = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * Math.PI * 2.2 * C; path.push([Math.sin(a) * 0.04 * s * t, t * 0.22 * s * L, (1 - Math.cos(a)) * 0.04 * s * t]); }
    const g = sweep(path, [0.04 * s * p.fat, 0.03 * s, 0.022 * s], { radial: 10, axial: 24, lod }); delete g.userData.tip;
    return { pieces: [P(g, 'skin')], tips: [], radius: 0.26 * s * L, top: 0.22 * s * L };
  },
  'tail.sprout': (p, lod, R) => {
    const s = R / 0.05, L = p.len;
    const stem = sweep([[0, 0, 0], [0, 0.08 * s * L, 0.02 * s], [0, 0.14 * s * L, 0.05 * s]], [0.035 * s, 0.025 * s, 0.015 * s], { radial: 10, axial: 8, lod }); delete stem.userData.tip;
    const leaves = [];
    for (let i = 0; i < 3; i++) { const l = sheet(leafPts(0.09 * s, 0.035 * s, 10), 0.004 * s, lod, 10); l.rotateX(-0.6 + 0.6 * i); l.rotateY((i - 1) * 0.9); l.translate(0, 0.14 * s * L, 0.05 * s); leaves.push(l); }
    return { pieces: [P(stem, 'skin'), P(merge(leaves), 'tint:detail')], tips: [], radius: 0.24 * s * L, top: 0.22 * s * L };
  },
  'tail.ribbon': (p, lod, R) => {
    const s = R / 0.05, L = p.len, path = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; path.push([0, t * 0.4 * s * L, Math.sin(t * Math.PI * (1 + p.curl)) * 0.13 * s]); }
    const g = sweep(path, [0.05 * s, 0.042 * s, 0.032 * s, 0.022 * s], { radial: 10, axial: 22, lod, squash: 0.35 }); delete g.userData.tip;
    return { pieces: [P(g, 'skin')], tips: [], radius: 0.42 * s * L, top: 0.4 * s * L };
  },
  'tail.fluke': (p, lod, R) => {
    const s = R / 0.05, L = p.len;
    const stem = sweep([[0, 0, 0], [0, 0.1 * s * L, 0], [0, 0.18 * s * L, 0]], [0.04 * s, 0.03 * s, 0.022 * s], { radial: 10, axial: 8, lod }); delete stem.userData.tip;
    const f = sheet([[0, 0], [0.12 * s * p.fat, 0.04 * s], [0.14 * s * p.fat, 0.09 * s], [0.03 * s, 0.05 * s], [0, 0.07 * s], [-0.03 * s, 0.05 * s], [-0.14 * s * p.fat, 0.09 * s], [-0.12 * s * p.fat, 0.04 * s]], 0.012 * s, lod, 10);
    f.rotateY(Math.PI / 2); f.translate(0, 0.16 * s * L, 0);
    return { pieces: [P(stem, 'skin'), P(f, 'skin')], tips: [], radius: 0.28 * s * L, top: 0.26 * s * L };
  },
  'tail.brush': (p, lod, R) => {
    const s = R / 0.06, L = p.len;
    const core = sweep([[0, 0, 0], [0, 0.12 * s * L, 0.03 * s], [0, 0.26 * s * L, 0.08 * s]], [0.05 * s * p.fat, 0.05 * s * p.fat, 0.025 * s], { radial: 10, axial: 10, lod }); delete core.userData.tip;
    const cards = [];
    for (let i = 0; i < 10; i++) { const t = i / 9, a = i * 2.39; const c = card(0.09 * s * (1 - 0.4 * t), 0.03 * s, lod, 0.5); c.rotateZ(Math.cos(a) * 0.9); c.rotateX(0.6 + Math.sin(a) * 0.5); c.translate(Math.cos(a) * 0.02 * s, (0.04 + 0.2 * t) * s * L, 0.02 * s + 0.06 * s * t + Math.sin(a) * 0.015 * s); cards.push(c); }
    return { pieces: [P(core, 'skin'), P(merge(cards), 'skin')], tips: [], radius: 0.32 * s * L, top: 0.3 * s * L };
  },
  'tail.club': (p, lod, R) => {
    const s = R / 0.045, L = p.len;
    const stem = sweep([[0, 0, 0], [0, 0.1 * s * L, 0], [0, 0.18 * s * L, 0]], [0.04 * s, 0.032 * s, 0.03 * s], { radial: 10, axial: 8, lod }); delete stem.userData.tip;
    const knob = blob(0.065 * s * p.fat, [0, 0.22 * s * L, 0], lod, [1, 1, 1], 18, 12);
    const bumps = []; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; bumps.push(blob(0.022 * s, [Math.cos(a) * 0.06 * s * p.fat, 0.23 * s * L, Math.sin(a) * 0.06 * s * p.fat], lod, [1, 1, 1], 8, 6)); }
    return { pieces: [P(merge([stem, knob]), 'skin'), P(merge(bumps), 'keratin')], tips: [], radius: 0.3 * s * L, top: 0.29 * s * L };
  },
  'tail.fan': (p, lod, R) => {
    const s = R / 0.05, L = p.len, g = [];
    for (let i = 0; i < 7; i++) { const a = (-0.5 + i / 6) * (0.9 + 0.8 * p.curl); const f = sheet(petalPts(0.2 * s * L, 0.025 * s), 0.004 * s, lod, 10); f.rotateZ(Math.PI / 2); f.rotateX(a); f.translate(0, 0.02 * s, 0.01 * s); g.push(f); }
    return { pieces: [P(merge(g), 'tint:coat'), P(blob(0.03 * s, [0, 0.01 * s, 0], lod, [1, 1, 1], 10, 8), 'skin')], tips: [], radius: 0.22 * s * L, top: 0.2 * s * L };
  },
};
