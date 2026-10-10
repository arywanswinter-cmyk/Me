// mouths.js — the 10 mouth builders (all hinge a jaw; mandibles hinge two).
// Exports: MOUTHS (type → build(p, lod, R)).
// Invariants: part space +Y forward out of the face, +Z up; pieces on 'jaw' rotate about the hinge given in `hinges.jaw`;
//   every tooth and beak tip is listed in `tips` and ends in a hemisphere.
import { P, tooth, sweep, lathe, ellipsoid, xf, merge, blob } from './kit.js';

export const MOUTHS = {
  'mouth.grin': (p, lod, R) => {
    const s = R / 0.085, L = p.len, F = p.fat;
    const muzzle = blob(0.075 * s, [0, 0.035 * s * L, 0.005 * s], lod, [F, 0.66 * L, 0.73], 18, 12);
    const interior = blob(0.045 * s, [0, 0.074 * s * L, -0.012 * s], lod, [F, 0.36, 0.31], 12, 6);
    const lip = blob(0.05 * s, [0, 0.066 * s * L, -0.03 * s], lod, [F, 0.4, 0.34], 14, 6);
    const teeth = merge([tooth([-0.016 * s, 0.083 * s * L, -0.004 * s], [0, 0, -1], 0.014 * s, 0.006 * s, { lod }), tooth([0.016 * s, 0.083 * s * L, -0.004 * s], [0, 0, -1], 0.014 * s, 0.006 * s, { lod })]);
    return { pieces: [P(muzzle, 'skin'), P(interior, 'mouth'), P(lip, 'skin', 'jaw'), P(teeth, 'teeth')], tips: teeth.userData.tips, radius: 0.09 * s, top: 0.09 * s * L, hinges: { jaw: [0, 0.03 * s, -0.01 * s] } };
  },
  'mouth.munch': (p, lod, R) => {
    const s = R / 0.085, L = p.len, F = p.fat;
    const muzzle = blob(0.08 * s, [0, 0.04 * s * L, 0], lod, [F, 0.7 * L, 0.75], 18, 12);
    const cheeks = merge([blob(0.045 * s, [-0.06 * s * F, 0.03 * s, -0.01 * s], lod, [1, 0.8, 0.9], 12, 8), blob(0.045 * s, [0.06 * s * F, 0.03 * s, -0.01 * s], lod, [1, 0.8, 0.9], 12, 8)]);
    const interior = blob(0.04 * s, [0, 0.085 * s * L, -0.022 * s], lod, [F, 0.3, 0.3], 12, 6);
    const lip = blob(0.05 * s, [0, 0.075 * s * L, -0.04 * s], lod, [F, 0.4, 0.3], 14, 6);
    const teeth = merge([tooth([-0.01 * s, 0.09 * s * L, -0.012 * s], [0, 0, -1], 0.02 * s, 0.009 * s, { lod, tipK: 0.6 }), tooth([0.01 * s, 0.09 * s * L, -0.012 * s], [0, 0, -1], 0.02 * s, 0.009 * s, { lod, tipK: 0.6 })]);
    return { pieces: [P(muzzle, 'skin'), P(cheeks, 'skin'), P(interior, 'mouth'), P(lip, 'skin', 'jaw'), P(teeth, 'teeth')], tips: teeth.userData.tips, radius: 0.11 * s, top: 0.1 * s * L, hinges: { jaw: [0, 0.03 * s, -0.02 * s] } };
  },
  'mouth.chomper': (p, lod, R) => {
    const s = R / 0.11, L = p.len, F = p.fat;
    const muzzle = blob(0.11 * s, [0, 0.04 * s * L, 0.015 * s], lod, [F, 0.6 * L, 0.64], 16, 9);
    const interior = blob(0.085 * s, [0, 0.088 * s * L, -0.01 * s], lod, [F, 0.24, 0.35], 12, 6);
    const jaw = blob(0.095 * s, [0, 0.055 * s * L, -0.07 * s], lod, [F, 0.53 * L, 0.37], 14, 7);
    const tongue = blob(0.04 * s, [0, 0.075 * s * L, -0.03 * s], lod, [1, 0.62, 0.3], 10, 6);
    const up = [], lo = [];
    for (let i = 0; i < 5; i++) {
      const a = (-0.6 + 1.2 * (i / 4)), x = Math.sin(a) * 0.07 * s * F, y = (0.095 - 0.02 * Math.abs(Math.sin(a))) * s * L;
      up.push(tooth([x, y, 0.002 * s], [0, 0, -1], 0.024 * s, 0.009 * s, { lod, radial: 6, axial: 2, tipK: 0.45 }));
      lo.push(tooth([x * 0.9, y - 0.015 * s, -0.067 * s], [0, 0, 1], 0.022 * s, 0.009 * s, { lod, radial: 6, axial: 2, tipK: 0.45 }));
    }
    const tu = merge(up), tl = merge(lo);
    return { pieces: [P(muzzle, 'skin'), P(interior, 'mouth'), P(jaw, 'skin', 'jaw'), P(tongue, 'tongue', 'jaw'), P(tu, 'teeth'), P(tl, 'teeth', 'jaw')],
      tips: [...tu.userData.tips, ...tl.userData.tips], radius: 0.13 * s, top: 0.11 * s * L, hinges: { jaw: [0, 0.03 * s, -0.02 * s] } };
  },
  'mouth.peep': (p, lod, R) => {
    const s = R / 0.085, L = p.len, c = p.curl;
    const upper = sweep([[0, 0, 0.004 * s], [0, 0.05 * s * L, -0.004 * s * c], [0, 0.09 * s * L, -0.016 * s * c]], [0.055 * s, 0.03 * s, 0.012 * s], { radial: 14, axial: 10, lod, squash: 0.7 });
    const lower = sweep([[0, 0, -0.012 * s], [0, 0.04 * s * L, -0.02 * s], [0, 0.07 * s * L, -0.03 * s]], [0.045 * s, 0.024 * s, 0.01 * s], { radial: 12, axial: 8, lod, squash: 0.7 });
    const interior = blob(0.03 * s, [0, 0.03 * s * L, -0.008 * s], lod, [1, L, 0.27], 10, 6);
    return { pieces: [P(upper, 'keratin'), P(lower, 'keratin', 'jaw'), P(interior, 'mouth')], tips: [upper.userData.tip, lower.userData.tip], radius: 0.1 * s, top: 0.095 * s * L, hinges: { jaw: [0, 0.01 * s, -0.012 * s] } };
  },
  'mouth.hook': (p, lod, R) => {
    const s = R / 0.085, L = p.len, c = 0.6 + p.curl;
    const upper = sweep([[0, 0, 0.01 * s], [0, 0.06 * s * L, 0.012 * s], [0, 0.11 * s * L, -0.01 * s * c], [0, 0.12 * s * L, -0.05 * s * c]], [0.05 * s * p.fat, 0.045 * s, 0.025 * s, 0.014 * s], { radial: 14, axial: 12, lod, squash: 0.65 });
    const lower = sweep([[0, 0, -0.016 * s], [0, 0.05 * s * L, -0.028 * s], [0, 0.074 * s * L, -0.042 * s]], [0.042 * s, 0.03 * s, 0.013 * s], { radial: 12, axial: 8, lod, squash: 0.65 });
    const interior = blob(0.035 * s, [0, 0.04 * s * L, -0.012 * s], lod, [1, 1, 0.3], 10, 6);
    return { pieces: [P(upper, 'keratin'), P(lower, 'keratin', 'jaw'), P(interior, 'mouth')], tips: [upper.userData.tip, lower.userData.tip], radius: 0.13 * s, top: 0.12 * s * L, hinges: { jaw: [0, 0.01 * s, -0.018 * s] } };
  },
  'mouth.mandible': (p, lod, R) => {
    const s = R / 0.085, L = p.len, spread = 0.5 + p.curl;
    const mand = (side) => sweep([[side * 0.03 * s, 0.01 * s, 0], [side * 0.06 * s * spread, 0.05 * s * L, 0], [side * 0.04 * s, 0.09 * s * L, 0], [side * 0.008 * s, 0.11 * s * L, 0]], [0.016 * s, 0.014 * s, 0.01 * s, 0.006 * s], { radial: 10, axial: 12, lod });
    const ml = mand(-1), mr = mand(1);
    const palps = merge([sweep([[-0.015 * s, 0.01 * s, -0.02 * s], [-0.02 * s, 0.04 * s, -0.03 * s]], [0.006 * s, 0.004 * s], { radial: 6, axial: 4, lod }), sweep([[0.015 * s, 0.01 * s, -0.02 * s], [0.02 * s, 0.04 * s, -0.03 * s]], [0.006 * s, 0.004 * s], { radial: 6, axial: 4, lod })]);
    const base = blob(0.04 * s, [0, 0.01 * s, 0], lod, [1.2, 0.6, 0.8], 12, 8);
    const interior = blob(0.02 * s, [0, 0.03 * s, 0], lod, [1, 0.6, 0.6], 8, 6);
    return { pieces: [P(base, 'skin'), P(ml, 'keratin', 'jaw'), P(mr, 'keratin', 'jaw2'), P(palps, 'keratin'), P(interior, 'mouth')], tips: [ml.userData.tip, mr.userData.tip], radius: 0.12 * s, top: 0.11 * s * L,
      hinges: { jaw: [-0.03 * s, 0.01 * s, 0], jaw2: [0.03 * s, 0.01 * s, 0] }, jawAxis: 'Z' };
  },
  'mouth.snoot': (p, lod, R) => {
    const s = R / 0.085, L = p.len, c = p.curl;
    const trunk = sweep([[0, 0, 0.01 * s], [0, 0.06 * s * L, 0.005 * s], [0, 0.1 * s * L, -0.015 * s * c]], [0.055 * s * p.fat, 0.045 * s, 0.04 * s], { radial: 16, axial: 10, lod });
    const tip = trunk.userData.tip;
    const nost = merge([blob(0.01 * s, [-0.015 * s, tip.apex[1] - 0.002 * s, tip.apex[2]], lod, [1, 0.6, 1], 8, 6), blob(0.01 * s, [0.015 * s, tip.apex[1] - 0.002 * s, tip.apex[2]], lod, [1, 0.6, 1], 8, 6)]);
    const lip = blob(0.035 * s, [0, 0.03 * s, -0.045 * s], lod, [1, 0.6, 0.4], 12, 6);
    const interior = blob(0.025 * s, [0, 0.035 * s, -0.035 * s], lod, [1, 0.5, 0.3], 8, 6);
    delete trunk.userData.tip;
    return { pieces: [P(trunk, 'skin'), P(nost, 'mouth'), P(lip, 'skin', 'jaw'), P(interior, 'mouth')], tips: [], radius: 0.12 * s * L, top: 0.11 * s * L, hinges: { jaw: [0, 0.02 * s, -0.035 * s] } };
  },
  'mouth.trumpet': (p, lod, R) => {
    const s = R / 0.07, L = p.len, fl = 0.6 + 0.8 * p.fat;
    const prof = [[0.035 * s, 0], [0.032 * s, 0.04 * s * L], [0.034 * s, 0.07 * s * L], [0.05 * s * fl, 0.1 * s * L], [0.075 * s * fl, 0.115 * s * L], [0.08 * s * fl, 0.12 * s * L], [0.072 * s * fl, 0.124 * s * L], [0.045 * s * fl, 0.112 * s * L], [0.026 * s, 0.09 * s * L]];
    const bell = lathe(prof, 24, { lod });
    const throat = blob(0.026 * s, [0, 0.085 * s * L, 0], lod, [1, 0.3, 1], 12, 6);
    const lip = blob(0.03 * s, [0, 0.02 * s, -0.03 * s], lod, [1, 0.5, 0.4], 10, 6);
    return { pieces: [P(bell, 'skin'), P(throat, 'mouth'), P(lip, 'skin', 'jaw')], tips: [], radius: 0.13 * s * L, top: 0.125 * s * L, hinges: { jaw: [0, 0.01 * s, -0.025 * s] } };
  },
  'mouth.sieve': (p, lod, R) => {
    const s = R / 0.1, L = p.len, F = p.fat;
    const plate = blob(0.1 * s, [0, 0.03 * s * L, 0], lod, [F, 0.35 * L, 0.45], 18, 10);
    const lower = blob(0.09 * s, [0, 0.035 * s * L, -0.04 * s], lod, [F, 0.3, 0.25], 16, 8);
    const fringe = [];
    for (let i = 0; i < 9; i++) { const x = (-0.07 + 0.14 * i / 8) * s * F; fringe.push(tooth([x, 0.055 * s * L, -0.02 * s], [0, 0, -1], 0.025 * s, 0.005 * s, { lod, radial: 5, axial: 2, tipK: 0.5 })); }
    const fr = merge(fringe);
    const interior = blob(0.07 * s, [0, 0.045 * s * L, -0.02 * s], lod, [F, 0.2, 0.2], 12, 6);
    return { pieces: [P(plate, 'skin'), P(lower, 'skin', 'jaw'), P(fr, 'teeth'), P(interior, 'mouth')], tips: fr.userData.tips, radius: 0.12 * s, top: 0.07 * s * L, hinges: { jaw: [0, 0.02 * s, -0.03 * s] } };
  },
  'mouth.squirt': (p, lod, R) => {
    const s = R / 0.085, L = p.len, c = p.curl;
    const tube = sweep([[0, 0, 0], [0, 0.06 * s * L, 0.01 * s * c], [0, 0.11 * s * L, 0.02 * s * c]], [0.045 * s, 0.035 * s, 0.032 * s * p.fat], { radial: 16, axial: 10, lod });
    const a = tube.userData.tip.apex; delete tube.userData.tip;
    const ringG = lathe([[0.03 * s * p.fat, -0.012 * s], [0.045 * s * p.fat, -0.004 * s], [0.042 * s * p.fat, 0.008 * s], [0.022 * s * p.fat, 0.006 * s]], 20, { lod });
    ringG.translate(a[0], a[1] - 0.03 * s, a[2]);
    const hole = blob(0.02 * s * p.fat, [a[0], a[1] - 0.026 * s, a[2]], lod, [1, 0.3, 1], 10, 6);
    const lip = blob(0.03 * s, [0, 0.02 * s, -0.035 * s], lod, [1, 0.5, 0.4], 10, 6);
    return { pieces: [P(tube, 'skin'), P(ringG, 'skin'), P(hole, 'mouth'), P(lip, 'skin', 'jaw')], tips: [], radius: 0.13 * s * L, top: 0.11 * s * L, hinges: { jaw: [0, 0.01 * s, -0.03 * s] } };
  },
};
