// starters.js — the 8 starter creatures as full recipes (validated, quantized, within both budgets).
// Exports: STARTERS (name → recipe), STARTER_NAMES (gallery order).
// Invariants: deterministic; every starter fits 2000 DNA and 100 complexity (item 47); legs reach 0.12 m below the
//   body so each stands on its feet at rest; `meta.from` is `starter:<name>`; paints are original, bright and soft.
import { quantize, BLOOP, clone } from '../recipe/schema.js';
import { legLimb, straightSpine } from './fixtures.js';

const part = (id, t, b, u, d, m = 1, extra = {}) => ({ id, t, at: { b, u, d, tw: 0 }, sc: 1, m, p: {}, tint: t.startsWith('eye') ? 'natural' : 'skin', ...extra });
const tip = (id, t, limb, extra = {}) => ({ id, t, at: { b: limb, tip: 1 }, sc: 1, m: 1, p: {}, tint: 'skin', ...extra });
const paint = (skin, base, coat, detail, iris) => ({ skin, base: { sc: 1, ...base }, coat: { sc: 1, mask: 'all', ...coat }, detail: { sc: 1, mask: 'all', ...detail }, iris });
const make = (name, seed, v, limbs, parts, pt) => quantize({ v: 1, app: 'sborn', name, seed, spine: { v }, limbs, parts, paint: pt, meta: { created: 1760000000, from: `starter:${name.toLowerCase()}` } });

// Wigglet: a long low slitherer
const vWig = straightSpine(16, 1.5, 0.11, (t) => 0.06 + 0.055 * Math.sin(Math.PI * (0.12 + 0.82 * t)) + (t > 0.85 ? 0.03 * (t - 0.85) / 0.15 : 0));
// Peepsy: a round little biped bird
const vPeep = straightSpine(5, 0.42, 0.5, [0.12, 0.19, 0.22, 0.2, 0.17]);
// Trundle: a sturdy quadruped
const vTrun = straightSpine(7, 0.95, 0.5, (t) => 0.15 + 0.1 * Math.sin(Math.PI * (0.15 + 0.8 * t)));
// Skitter: a low six-legged beetle
const vSkit = straightSpine(7, 0.8, 0.33, (t) => 0.11 + 0.07 * Math.sin(Math.PI * t));
// Clatter: a crab-ish walker with pincers
const vClat = straightSpine(6, 0.6, 0.42, (t) => 0.15 + 0.1 * Math.sin(Math.PI * (0.1 + 0.8 * t)));
// Flapjack: a light flier on two legs
const vFlap = straightSpine(6, 0.55, 0.48, (t) => 0.1 + 0.08 * Math.sin(Math.PI * (0.2 + 0.75 * t)));
// Octoboop: a round eight-legged bouncer
const vOcto = straightSpine(6, 0.7, 0.42, (t) => 0.17 + 0.11 * Math.sin(Math.PI * (0.1 + 0.85 * t)));

const legs = (v, us, o = {}) => us.map((u, i) => legLimb(v, u, { id: `L${i + 1}`, ...o }));
function arm(v, u, id, r = 0.05) {
  // forward-reaching pincer arm: out to the side, then forward
  return { id, at: { b: 'spine', u, d: [0.8, 0.1, 0.59] }, m: 1, k: 1, j: [[0, 0, 0, r], [0.1, -0.03, 0.08, r * 0.9], [0.13, -0.02, 0.22, r * 0.8]] };
}

export const STARTERS = {
  bloop: quantize({ ...clone(BLOOP), meta: { created: 1760000000, from: 'starter:bloop' } }),
  wigglet: make('Wigglet', 2101, vWig, [], [
    part('P1', 'mouth.munch', 'spine', 0.985, [0, -0.15, 0.99], 0, { sc: 0.7 }),
    part('P2', 'eye.moon', 'spine', 0.95, [0.5, 0.62, 0.6], 1, { sc: 0.65 }),
    part('P3', 'tail.sprout', 'spine', 0.0, [0, 0.3, -0.95], 0, { sc: 0.8 }),
  ], paint('scaly', { c: '#B5E655', pat: 'gradient' }, { c: '#4FD1B5', pat: 'bands', amt: 0.6, mask: 'back' }, { c: '#FFD23F', pat: 'speckles', amt: 0.4, mask: 'belly' }, '#FF9F43')),
  peepsy: (() => {
    const ls = [legLimb(vPeep, 0.4, { id: 'L1', joints: 4, r: 0.04, fwd: 0.06 })];
    return make('Peepsy', 2203, vPeep, ls, [
      part('P1', 'mouth.peep', 'spine', 0.98, [0, -0.05, 1], 0),
      part('P2', 'eye.dreamy', 'spine', 0.9, [0.55, 0.5, 0.67], 1),
      tip('P3', 'foot.tiptoe', 'L1'),
      part('P4', 'wing.nub', 'spine', 0.5, [0.98, 0.18, 0], 1, { sc: 1.3 }),
      part('P5', 'tail.puff', 'spine', 0.0, [0, 0.35, -0.94], 0),
    ], paint('fuzzy', { c: '#FFD23F', pat: 'gradient' }, { c: '#FF9F43', pat: 'saddle', amt: 0.55, mask: 'back' }, { c: '#FFF1D6', pat: 'patches', amt: 0.5, mask: 'belly' }, '#5BB8FF'));
  })(),
  trundle: (() => {
    const ls = legs(vTrun, [0.2, 0.78], { r: 0.075 });
    return make('Trundle', 2307, vTrun, ls, [
      part('P1', 'mouth.snoot', 'spine', 0.985, [0, -0.2, 0.98], 0),
      part('P2', 'eye.moon', 'spine', 0.9, [0.48, 0.55, 0.68], 1),
      tip('P3', 'foot.hoof', 'L1'), tip('P4', 'foot.hoof', 'L2'),
      part('P5', 'tail.brush', 'spine', 0.0, [0, 0.3, -0.95], 0),
      part('P6', 'det.nubhorn', 'spine', 0.93, [0.35, 0.92, 0.17], 1),
      part('P7', 'det.tuft', 'spine', 0.62, [0, 1, 0], 0),
      part('P8', 'det.tuft', 'spine', 0.4, [0, 1, 0], 0),
    ], paint('bumpy', { c: '#9C6B4E', pat: 'solid' }, { c: '#E8C995', pat: 'patches', amt: 0.6, mask: 'belly' }, { c: '#FF8FB1', pat: 'spots', amt: 0.35, mask: 'back' }, '#6E8B3D'));
  })(),
  skitter: (() => {
    const ls = legs(vSkit, [0.2, 0.5, 0.8], { r: 0.04, out: 0.7 });
    return make('Skitter', 2411, vSkit, ls, [
      part('P1', 'mouth.mandible', 'spine', 0.985, [0, -0.25, 0.97], 0),
      part('P2', 'eye.cluster', 'spine', 0.9, [0.55, 0.5, 0.67], 1, { sc: 0.75 }),
      tip('P3', 'foot.talon', 'L1'), tip('P4', 'foot.talon', 'L2'), tip('P5', 'foot.talon', 'L3'),
      part('P6', 'det.bobble', 'spine', 0.93, [0.3, 0.9, 0.3], 1),
      part('P7', 'det.plates', 'spine', 0.45, [0, 1, 0], 0, { sc: 1.4 }),
    ], paint('leathery', { c: '#2BB3C0', pat: 'solid' }, { c: '#6C8CFF', pat: 'scales', amt: 0.55, mask: 'back' }, { c: '#B5E655', pat: 'speckles', amt: 0.4, mask: 'all' }, '#FFD23F'));
  })(),
  clatter: (() => {
    const ls = legs(vClat, [0.15, 0.55], { r: 0.05, out: 0.6 });
    const arms = [arm(vClat, 0.78, 'L3')];
    return make('Clatter', 2503, vClat, [...ls, ...arms], [
      part('P1', 'mouth.squirt', 'spine', 0.985, [0, -0.1, 0.99], 0),
      part('P2', 'eye.stalk', 'spine', 0.85, [0.35, 0.9, 0.25], 1, { sc: 0.9 }),
      tip('P3', 'hand.snip', 'L3'),
      tip('P4', 'foot.nub', 'L1'), tip('P5', 'foot.nub', 'L2'),
      part('P6', 'det.shell', 'spine', 0.45, [0, 1, 0], 0),
    ], paint('smooth', { c: '#FF7A6B', pat: 'gradient' }, { c: '#FFD23F', pat: 'rosettes', amt: 0.45, mask: 'limbs' }, { c: '#FFF1D6', pat: 'spots', amt: 0.4, mask: 'belly' }, '#2BB3C0'));
  })(),
  flapjack: (() => {
    const ls = [legLimb(vFlap, 0.42, { id: 'L1', r: 0.04 })];
    return make('Flapjack', 2609, vFlap, ls, [
      part('P1', 'mouth.hook', 'spine', 0.985, [0, -0.1, 0.99], 0),
      part('P2', 'eye.almond', 'spine', 0.9, [0.55, 0.5, 0.67], 1),
      tip('P3', 'foot.nub', 'L1'),
      part('P4', 'wing.umbrella', 'spine', 0.6, [0.9, 0.42, 0], 1, { sc: 1.6 }),
      part('P5', 'tail.fan', 'spine', 0.0, [0, 0.3, -0.95], 0),
    ], paint('fuzzy', { c: '#9B7BFF', pat: 'gradient' }, { c: '#D17BFF', pat: 'stripes', amt: 0.45, mask: 'back' }, { c: '#FFF1D6', pat: 'patches', amt: 0.5, mask: 'belly' }, '#FF9F43'));
  })(),
  octoboop: (() => {
    const ls = legs(vOcto, [0.12, 0.37, 0.63, 0.88], { r: 0.045, out: 0.65 });
    return make('Octoboop', 2713, vOcto, ls, [
      part('P1', 'mouth.trumpet', 'spine', 0.985, [0, -0.2, 0.98], 0),
      part('P2', 'eye.peeper', 'spine', 0.9, [0, 0.55, 0.83], 0),
      tip('P3', 'foot.pillow', 'L1'), tip('P4', 'foot.pillow', 'L2'), tip('P5', 'foot.pillow', 'L3'), tip('P6', 'foot.pillow', 'L4'),
      part('P7', 'det.frill', 'spine', 0.8, [0, 0.75, -0.66], 0),
    ], paint('smooth', { c: '#FF8FB1', pat: 'solid' }, { c: '#D17BFF', pat: 'spots', amt: 0.5, mask: 'back' }, { c: '#FFF1D6', pat: 'gradient', amt: 0.45, mask: 'belly' }, '#6C8CFF'));
  })(),
};
export const STARTER_NAMES = ['bloop', 'wigglet', 'peepsy', 'trundle', 'skitter', 'clatter', 'flapjack', 'octoboop'];
