// eyes.js — the 8 eye builders; each eye ball looks along +Y, blinks with lids (or a squash) and tracks on its 'ball' bone.
// Exports: EYES (type → build(p, lod, R)).
// Invariants: the eye sphere carries eye-local coordinates for the shared eye shader; `pupil` picks round (0), tall slit (1)
//   or hex facets (2); ≤ 1.4k triangles per eye.
import { P, eyeBall, sweep, blob, merge, ellipsoid, xf } from './kit.js';

export const EYES = {
  'eye.button': (p, lod, R) => {
    const r = R * p.fat, e = eyeBall(r, lod, { lids: false, lift: 0.75 });
    e.pieces.push(P(blob(r, [0, r * 0.2, 0], lod, [1.9, 0.32, 1.9], 14, 5), 'skin'));      // flat collar: a bead on a cushion
    e.radius = r * 2; return e;
  },
  'eye.moon': (p, lod, R) => eyeBall(R * p.fat, lod),
  'eye.dreamy': (p, lod, R) => eyeBall(R * p.fat, lod, { almond: 0.72, lashes: 3, lidOpen: 60 }),
  'eye.almond': (p, lod, R) => eyeBall(R * p.fat, lod, { almond: 1.6, pupil: 1 }),
  'eye.frog': (p, lod, R) => {
    const e = eyeBall(R * p.fat, lod, { lift: 1.25 });
    e.pieces.push(P(blob(R * p.fat, [0, R * 0.35, 0], lod, [1.05, 2.0 * p.len, 1.05], 12, 6), 'skin'));
    e.top = R * 2.3; e.radius = R * 1.6;
    return e;
  },
  'eye.cluster': (p, lod, R) => { const e = eyeBall(R * p.fat, lod, { lids: false, pupil: 2, lift: 0.2, squashY: 0.55 }); for (const pc of e.pieces) pc.geo.scale(1.45, 1, 1.05); return e; },
  'eye.stalk': (p, lod, R) => {
    const h = 0.16 * p.len * (R / 0.035);
    const e = eyeBall(R * p.fat, lod, { lift: 0 });
    for (const pc of e.pieces) { pc.geo.translate(0, h, 0); if (pc.eye) pc.eye.centre = [0, h, 0]; }
    for (const k of Object.keys(e.hinges)) e.hinges[k] = [0, h, 0];
    e.eye.centre = [0, h, 0];
    const stalk = sweep([[0, 0, 0], [0, h * 0.5, R * 0.3 * p.curl], [0, h - R * 0.6, 0]], [R * 0.45, R * 0.32, R * 0.3], { radial: 8, axial: 6, lod });
    delete stalk.userData.tip;
    e.pieces.push(P(stalk, 'skin'));
    e.top = h + R; e.radius = h + R;
    return e;
  },
  'eye.peeper': (p, lod, R) => {
    const r = R * p.fat, e = eyeBall(r, lod, { lift: 0.55, lidOpen: 70 });
    // a thick brow ridge over the lid: the one big eye looks out from under it
    e.pieces.push(P(xf(ellipsoid(r * 1.3, r * 0.34, r * 0.75, 14, 6, lod), { p: [0, r * 1.3, r * 0.75], r: [0.35, 0, 0] }), 'skin'));
    e.top = r * 1.7; return e;
  },
};
