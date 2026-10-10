// feet.js — the 10 foot builders, built at a limb tip: part +Y points down the leg (sole at y = rt), +Z forward.
// Exports: FEET (type → build(p, lod, rt)).
// Invariants: every foot's lowest point is the sole at y ≈ rt (the bare tip's contact), so locomotion contacts agree;
//   claws and toe tips are rounded and listed in `tips`.
import { P, sweep, blob, merge, claw, sheet, lathe, ellipsoid, xf, tooth } from './kit.js';

const toes = (n, spread, rt, len, F, lod, opts = {}) => {
  const out = [], tips = [];
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? 0 : (-0.5 + i / (n - 1)) * spread;
    const dir = [Math.sin(a), 0.15, Math.cos(a)];
    const base = [Math.sin(a) * 0.4 * rt * F, 0.75 * rt, Math.cos(a) * 0.4 * rt];
    const end = [base[0] + dir[0] * len, base[1] + 0.1 * rt, base[2] + dir[2] * len];
    const g = sweep([base, [(base[0] + end[0]) / 2, base[1] + 0.12 * rt, (base[2] + end[2]) / 2], end], [0.3 * rt * F, 0.26 * rt, opts.tipR || 0.2 * rt], { radial: 8, axial: 6, lod });
    out.push(g);
    if (opts.claws) { const c = claw(end, [dir[0], 0.4, dir[2]], 0.35 * rt, 0.12 * rt, [0, 1, 0], { lod }); out.push(c); tips.push(c.userData.tip); }
    else if (opts.tipList) tips.push(g.userData.tip);
  }
  return { geo: merge(out), tips };
};

export const FEET = {
  'foot.nub': (p, lod, rt) => {
    const L = p.len, F = p.fat;
    const pad = blob(rt, [0, 0.45 * rt, 0.45 * rt * L], lod, [1.15 * F, 0.55, 1.55 * L], 18, 10);
    const t = []; for (let i = -1; i <= 1; i++) t.push(blob(0.32 * rt, [i * 0.55 * rt * F, 0.72 * rt, 1.75 * rt * L], lod, [1, 0.88, 1], 8, 6));
    return { pieces: [P(merge([pad, ...t]), 'skin')], tips: [], radius: 2 * rt * L, top: rt, sole: rt };
  },
  'foot.pillow': (p, lod, rt) => {
    const L = p.len, F = p.fat;
    const pad = blob(rt, [0, 0.45 * rt, 0.5 * rt * L], lod, [1.5 * F, 0.55, 1.6 * L], 18, 10);
    const beans = []; for (let i = 0; i < 4; i++) { const x = (-0.75 + i * 0.5) * rt * F; beans.push(blob(0.3 * rt, [x, 0.82 * rt, 1.85 * rt * L - Math.abs(x) * 0.4], lod, [1, 0.6, 1], 8, 6)); }
    const heel = blob(0.6 * rt, [0, 0.85 * rt, 0.4 * rt * L], lod, [1.2, 0.3, 1], 10, 6);
    const cuff = blob(0.75 * rt, [0, 1.2 * rt, 0.15 * rt * L], lod, [1.25 * F, 0.5, 1.25], 14, 6);
    return { pieces: [P(merge([pad, cuff]), 'skin'), P(merge(beans), 'tongue'), P(heel, 'tongue')], tips: [], radius: 2.2 * rt * L, top: 1.5 * rt, sole: rt };
  },
  'foot.tiptoe': (p, lod, rt) => {
    const T = toes(3, 1.0 + 0.6 * p.curl, rt, 1.6 * rt * p.len, p.fat, lod, { claws: true });
    const heel = blob(0.45 * rt, [0, 0.55 * rt, 0], lod, [1, 0.9, 1], 10, 8);
    return { pieces: [P(T.geo, 'keratin'), P(heel, 'skin')], tips: T.tips, radius: 2.2 * rt, top: rt, sole: rt };
  },
  'foot.hoof': (p, lod, rt) => {
    const F = p.fat;
    const prof = [[0.001, rt], [0.95 * rt * F, rt], [1.05 * rt * F, 0.7 * rt], [0.95 * rt * F, 0.1 * rt], [0.75 * rt, -0.2 * rt], [0.001, -0.2 * rt]].map(([r, y]) => [r, -y + 0.8 * rt]);
    const h1 = lathe(prof, 20, { lod, phi: 0.06, len: Math.PI - 0.12 }), h2 = lathe(prof, 20, { lod, phi: Math.PI + 0.06, len: Math.PI - 0.12 });
    const g = merge([h1, h2]); g.rotateY(Math.PI / 2);
    return { pieces: [P(g, 'keratin'), P(blob(rt, [0, 0.55 * rt, 0], lod, [0.9 * F, 0.5, 0.08], 10, 6), 'mouth')], tips: [], radius: 1.2 * rt, top: rt, sole: rt };
  },
  'foot.web': (p, lod, rt) => {
    const T = toes(3, 1.1, rt, 1.7 * rt * p.len, p.fat, lod, { tipList: true, tipR: 0.22 * rt });
    const web = sheet([[-1.2 * rt, 0.2 * rt], [0, 0], [1.2 * rt, 0.2 * rt], [1.1 * rt, 1.7 * rt * p.len], [0, 1.5 * rt * p.len], [-1.1 * rt, 1.7 * rt * p.len]], 0.08 * rt, lod, 8);
    web.rotateX(-Math.PI / 2); web.rotateZ(Math.PI / 2); web.translate(0, 0.85 * rt, 0.3 * rt);
    return { pieces: [P(T.geo, 'skin'), P(web, 'membrane'), P(blob(0.5 * rt, [0, 0.6 * rt, 0], lod, [1, 0.8, 1], 10, 8), 'skin')], tips: [], radius: 2.2 * rt, top: rt, sole: rt };
  },
  'foot.gecko': (p, lod, rt) => {
    const T = toes(5, 2.2, rt, 1.3 * rt * p.len, p.fat, lod, {});
    const pads = []; for (let i = 0; i < 5; i++) { const a = (-0.5 + i / 4) * 2.2; pads.push(blob(0.28 * rt, [Math.sin(a) * (0.4 * rt * p.fat + 1.3 * rt * p.len), 0.85 * rt, Math.cos(a) * (0.4 * rt + 1.3 * rt * p.len)], lod, [1, 0.5, 1], 8, 6)); }
    return { pieces: [P(T.geo, 'skin'), P(merge(pads), 'tongue'), P(blob(0.55 * rt, [0, 0.55 * rt, 0], lod, [1, 0.8, 1], 10, 8), 'skin')], tips: [], radius: 2 * rt, top: rt, sole: rt };
  },
  'foot.talon': (p, lod, rt) => {
    const T = toes(3, 1.2, rt, 1.4 * rt * p.len, p.fat, lod, { claws: true });
    const back = sweep([[0, 0.75 * rt, 0], [0, 0.85 * rt, -0.6 * rt], [0, 0.85 * rt, -1.0 * rt * p.len]], [0.28 * rt, 0.24 * rt, 0.2 * rt], { radial: 8, axial: 5, lod });
    const bc = claw(back.userData.tip.apex, [0, 0.4, -1], 0.35 * rt, 0.12 * rt, [0, 1, 0], { lod });
    delete back.userData.tip;
    return { pieces: [P(merge([T.geo, back]), 'skin'), P(bc, 'keratin')], tips: [...T.tips, bc.userData.tip], radius: 2 * rt, top: rt, sole: rt };
  },
  'foot.spring': (p, lod, rt) => {
    const L = p.len, c = 0.5 + p.curl;
    const arch = sweep([[0, 0, -0.2 * rt], [0, 0.6 * rt * c, 0.9 * rt * L], [0, 0.85 * rt, 2.2 * rt * L]], [0.55 * rt * p.fat, 0.45 * rt, 0.4 * rt], { radial: 12, axial: 12, lod });
    delete arch.userData.tip;
    const pad = blob(0.5 * rt, [0, 0.82 * rt, 2.2 * rt * L], lod, [1.2, 0.35, 1.4], 10, 6);
    return { pieces: [P(arch, 'skin'), P(pad, 'tongue')], tips: [], radius: 2.6 * rt * L, top: rt, sole: rt };
  },
  'foot.zoom': (p, lod, rt) => {
    const L = p.len;
    const body = blob(rt, [0, 0.55 * rt, 0.7 * rt * L], lod, [0.8 * p.fat, 0.45, 1.9 * L], 16, 10);
    const fin = sheet([[0, 0], [0.6 * rt, 0.2 * rt], [0.9 * rt * p.curl + 0.3 * rt, 1.0 * rt], [0, 0.7 * rt]], 0.1 * rt, lod, 8);
    fin.rotateZ(Math.PI / 2); fin.rotateY(Math.PI); fin.translate(0, 0.4 * rt, -0.9 * rt);
    const stripe = blob(rt, [0, 0.5 * rt, 0.8 * rt * L], lod, [0.82 * p.fat, 0.2, 1.6 * L], 12, 6);
    return { pieces: [P(body, 'skin'), P(fin, 'keratin'), P(stripe, 'tint:detail')], tips: [], radius: 2.4 * rt * L, top: rt, sole: rt };
  },
  'foot.twinkle': (p, lod, rt) => {
    const L = p.len;
    const shoe = sweep([[0, 0.1 * rt, -0.3 * rt], [0, 0.55 * rt, 0.6 * rt * L], [0, 0.8 * rt, 1.5 * rt * L]], [0.65 * rt * p.fat, 0.5 * rt, 0.3 * rt], { radial: 12, axial: 10, lod });
    const tip = shoe.userData.tip;
    const pom = blob(0.38 * rt * (0.7 + 0.6 * p.curl), [0, 0.1 * rt, 0.5 * rt], lod, [1, 1, 1], 12, 8);
    return { pieces: [P(shoe, 'keratin'), P(pom, 'tint:detail')], tips: [tip], radius: 2 * rt * L, top: rt, sole: rt };
  },
};
