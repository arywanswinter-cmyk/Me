// hands.js — the 8 hand builders, built at a limb tip: part +Y points out along the arm.
// Exports: HANDS (type → build(p, lod, rt)).
// Invariants: graspers keep a palm near y ≈ 1.2 rt; fingers that curl are on the socket (curl is posed later);
//   claws and pincer jaws end in rounded tips listed in `tips`; the pincer's lower jaw hinges on 'jaw'.
import { P, sweep, blob, merge, claw, lathe, tooth } from './kit.js';

const finger = (a, len, r, curl, lod, spreadZ = 0) => {
  const b = [Math.sin(a) * 0.6 * r * 3, 1.5 * r * 3, spreadZ];
  const m = [b[0] + Math.sin(a) * len * 0.5, b[1] + len * 0.5, b[2] + curl * len * 0.35];
  const e = [b[0] + Math.sin(a) * len * 0.9, b[1] + len * (0.85 - 0.3 * curl), b[2] + curl * len * 0.8];
  return sweep([b, m, e], [r, r * 0.9, r * 0.75], { radial: 8, axial: 6, lod });
};

export const HANDS = {
  'hand.mitten': (p, lod, rt) => {
    const L = p.len, F = p.fat;
    const mitt = blob(rt, [0, 1.2 * rt * L, 0], lod, [1.25 * F, 1.5 * L, 0.8], 18, 12);
    const thumb = sweep([[0.7 * rt, 0.6 * rt, 0.2 * rt], [1.2 * rt, 1.0 * rt, 0.3 * rt], [1.35 * rt, 1.5 * rt * L, 0.25 * rt]], [0.45 * rt, 0.4 * rt, 0.32 * rt], { radial: 10, axial: 6, lod });
    delete thumb.userData.tip;
    return { pieces: [P(merge([mitt, thumb]), 'skin')], tips: [], radius: 2.6 * rt * L, top: 2.6 * rt * L };
  },
  'hand.three': (p, lod, rt) => {
    const palm = blob(rt, [0, 0.9 * rt, 0], lod, [1.1 * p.fat, 0.9, 0.7], 14, 10);
    const f = [-0.5, 0, 0.5].map((a) => finger(a, 1.3 * rt * p.len, 0.28 * rt, p.curl, lod));
    for (const g of f) delete g.userData.tip;
    return { pieces: [P(merge([palm, ...f]), 'skin')], tips: [], radius: 3 * rt * p.len, top: 3 * rt * p.len };
  },
  'hand.scoop': (p, lod, rt) => {
    const paw = blob(rt, [0, 1.0 * rt, 0.15 * rt], lod, [1.35 * p.fat, 1.05 * p.len, 0.95], 16, 10);
    const cl = []; for (let i = 0; i < 4; i++) { const x = (-0.6 + i * 0.4) * rt * p.fat; cl.push(claw([x, 2.0 * rt * p.len, 0.3 * rt], [0, 0.8, 0.6], 0.7 * rt, 0.15 * rt, [0, 0, 1], { lod })); }
    const c = merge(cl);
    return { pieces: [P(paw, 'skin'), P(c, 'keratin')], tips: c.userData.tips, radius: 2.6 * rt * p.len, top: 2.4 * rt * p.len };
  },
  'hand.cup': (p, lod, rt) => {
    const wrist = sweep([[0, 0, 0], [0, 0.8 * rt * p.len, 0]], [0.6 * rt, 0.5 * rt], { radial: 10, axial: 4, lod, capEnd: false });
    delete wrist.userData.tip;
    const disc = lathe([[0.001, 0.75 * rt * p.len], [0.9 * rt * p.fat, 0.8 * rt * p.len], [1.1 * rt * p.fat, 1.0 * rt * p.len], [1.0 * rt * p.fat, 1.12 * rt * p.len], [0.5 * rt, 1.05 * rt * p.len], [0.001, 1.0 * rt * p.len]], 20, { lod });
    const ring = blob(0.45 * rt, [0, 1.06 * rt * p.len, 0], lod, [1, 0.2, 1], 12, 6);
    return { pieces: [P(merge([wrist, disc]), 'skin'), P(ring, 'tongue')], tips: [], radius: 1.4 * rt * p.len, top: 1.2 * rt * p.len };
  },
  'hand.curl': (p, lod, rt) => {
    const pts = [];
    const n = 12, L = 3 * rt * p.len, c = 0.6 + p.curl * 1.4;
    let ang = 0, x = 0, y = 0;
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([0, y, x]); ang += c * 0.35 * t; y += Math.cos(ang) * L / n; x += Math.sin(ang) * L / n; }
    const g = sweep(pts, [0.7 * rt * p.fat, 0.4 * rt, 0.2 * rt], { radial: 10, axial: 16, lod });
    delete g.userData.tip;
    return { pieces: [P(g, 'skin')], tips: [], radius: L, top: L * 0.8 };
  },
  'hand.snip': (p, lod, rt) => {
    const L = p.len, F = p.fat;
    const palm = blob(rt, [0, 0.9 * rt, 0], lod, [1.2 * F, 1.0, 0.9], 14, 10);
    const up = sweep([[0, 1.4 * rt, 0.2 * rt], [0, 2.3 * rt * L, 0.55 * rt], [0, 3.0 * rt * L, 0.2 * rt]], [0.55 * rt * F, 0.4 * rt, 0.15 * rt], { radial: 12, axial: 10, lod });
    const lo = sweep([[0, 1.4 * rt, -0.25 * rt], [0, 2.1 * rt * L, -0.45 * rt], [0, 2.7 * rt * L, -0.1 * rt]], [0.45 * rt * F, 0.32 * rt, 0.13 * rt], { radial: 10, axial: 8, lod });
    return { pieces: [P(merge([palm, up]), 'keratin'), P(lo, 'keratin', 'jaw')], tips: [up.userData.tip, lo.userData.tip], radius: 3.2 * rt * L, top: 3 * rt * L, hinges: { jaw: [0, 1.4 * rt, -0.1 * rt] } };
  },
  'hand.jazz': (p, lod, rt) => {
    const palm = blob(rt, [0, 0.9 * rt, 0], lod, [1.25 * p.fat, 0.9, 0.6], 14, 10);
    const f = [-1.1, -0.55, 0, 0.55, 1.1].map((a) => finger(a, 1.2 * rt * p.len, 0.22 * rt, p.curl * 0.5, lod));
    for (const g of f) delete g.userData.tip;
    return { pieces: [P(merge([palm, ...f]), 'skin')], tips: [], radius: 3.2 * rt * p.len, top: 3 * rt * p.len };
  },
  'hand.bonk': (p, lod, rt) => {
    const wrist = sweep([[0, 0, 0], [0, 0.8 * rt, 0]], [0.6 * rt, 0.55 * rt], { radial: 10, axial: 4, lod, capEnd: false });
    delete wrist.userData.tip;
    const club = blob(1.35 * rt * p.fat, [0, 1.9 * rt * p.len, 0], lod, [1, 1, 1], 18, 12);
    const knuckles = []; for (let i = 0; i < 3; i++) knuckles.push(blob(0.35 * rt, [(-0.6 + i * 0.6) * rt, 2.7 * rt * p.len, 0.6 * rt], lod, [1, 1, 1], 8, 6));
    return { pieces: [P(merge([wrist, club, ...knuckles]), 'skin')], tips: [], radius: 3.4 * rt * p.len, top: 3.2 * rt * p.len };
  },
};
