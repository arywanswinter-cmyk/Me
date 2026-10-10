// fixtures.js — the 12 test fixtures (biped … 3-vertebra min) as full recipes, built by small helpers.
// Exports: FIXTURES (name → recipe), FIXTURE_NAMES, legLimb(spine, u, opts), straightSpine(n, len, y, radii).
// Invariants: deterministic; fixtures may exceed budgets (starters may not); every leg reaches 0.12 m below the
//   body's lowest point so the creature stands on its feet.
import { quantize } from '../recipe/schema.js';
import { spineCurve } from '../geo/curve.js';

export function straightSpine(n, len, y, radii) {
  const v = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const r = typeof radii === 'function' ? radii(t, i) : radii[i];
    v.push([y, -len / 2 + len * t, r]);
  }
  return v;
}
const bottom = (v) => Math.min(...v.map((x) => x[0] - x[2]));

// A leg whose sole reaches 0.12 m below the body's lowest point; knee bent forward, pointing out and down.
export function legLimb(spineV, u, { id, joints = 3, r = 0.07, side = 1, out = 0.25, fwd = 0.04, m = 1, centre = false } = {}) {
  const ch = spineCurve(spineV), f = ch.at(u);
  const dx = centre ? 0 : 0.62 * side, d = [dx, -0.78, 0];
  const rootY = f.p[1] - 0.72 * f.r;                     // approximate resolved root height
  const drop = rootY - (bottom(spineV) - 0.12) + r * 0.2;
  const outX = centre ? 0 : out * f.r * 0.6;
  const j = [[0, 0, 0, r]];
  for (let k = 1; k < joints; k++) {
    const t = k / (joints - 1);
    const bend = Math.sin(Math.PI * t) * fwd;
    j.push([outX * t, -drop * t, bend, r * (1 - 0.18 * t)]);
  }
  return { id, at: { b: 'spine', u, d }, m: centre ? 0 : m, j, k: 1 };
}
const P = (id, t, b, u, d, m = 1, extra = {}) => ({ id, t, at: { b, u, d, tw: 0 }, sc: 1, m, p: {}, tint: t.startsWith('eye') ? 'natural' : 'skin', ...extra });
const tip = (id, t, limb) => ({ id, t, at: { b: limb, tip: 1 }, sc: 1, m: 1, p: {}, tint: 'skin' });
const face = (v, mouth = 'mouth.grin', eye = 'eye.moon') => [
  P('P1', mouth, 'spine', 0.97, [0, -0.2, 0.98], 0),
  P('P2', eye, 'spine', 0.92, [0.42, 0.5, 0.76], 1),
];
const base = (name, v, limbs = [], parts = []) => quantize({
  v: 1, app: 'sborn', name, seed: 1000 + name.length * 7, spine: { v }, limbs, parts,
  paint: { skin: 'smooth', base: { c: '#5bb8ff', pat: 'solid', sc: 1 }, coat: { c: '#ffd23f', pat: 'stripes', sc: 1, amt: 0, mask: 'all' }, detail: { c: '#ff8fb1', pat: 'spots', sc: 1, amt: 0, mask: 'all' }, iris: '#7fc8ff' },
  meta: { created: 1760000000, from: `fixture:${name}` },
});

const vBiped = straightSpine(6, 0.7, 0.62, (t) => 0.16 + 0.12 * Math.sin(Math.PI * (0.25 + 0.7 * t)));
const vQuad = straightSpine(7, 1.0, 0.55, (t) => 0.14 + 0.1 * Math.sin(Math.PI * (0.15 + 0.8 * t)));
const vHex = straightSpine(8, 1.1, 0.42, (t) => 0.13 + 0.07 * Math.sin(Math.PI * t));
const vOcto = straightSpine(9, 1.2, 0.45, (t) => 0.14 + 0.07 * Math.sin(Math.PI * t));
const vTri = straightSpine(6, 0.8, 0.55, (t) => 0.15 + 0.09 * Math.sin(Math.PI * t));
const vUni = straightSpine(5, 0.5, 0.7, [0.14, 0.22, 0.26, 0.24, 0.2]);
const vSnake = straightSpine(14, 1.6, 0.12, (t) => 0.07 + 0.05 * Math.sin(Math.PI * (0.1 + 0.85 * t)));
const vBlob = straightSpine(4, 0.3, 0.42, [0.3, 0.38, 0.36, 0.28]);
const vFlier = straightSpine(6, 0.6, 0.5, (t) => 0.1 + 0.07 * Math.sin(Math.PI * (0.2 + 0.75 * t)));
const vHead = straightSpine(5, 0.6, 0.6, [0.12, 0.16, 0.18, 0.3, 0.45]);
const vMax = straightSpine(10, 1.3, 0.5, (t) => 0.13 + 0.08 * Math.sin(Math.PI * t));
const vMin = straightSpine(3, 0.4, 0.4, [0.2, 0.26, 0.22]);

function legs(v, us, opts = {}) { return us.map((u, i) => legLimb(v, u, { id: `L${i + 1}`, ...opts })); }
function feet(ls, type = 'foot.nub', from = 10) { return ls.filter((l) => l.m || opts0(l)).map((l, i) => tip(`P${from + i}`, type, l.id)); }
const opts0 = () => true;

export const FIXTURES = {
  biped: base('biped', vBiped, legs(vBiped, [0.38]), face(vBiped)),
  quad: base('quad', vQuad, legs(vQuad, [0.18, 0.8]), face(vQuad, 'mouth.munch')),
  hexapod: base('hexapod', vHex, legs(vHex, [0.18, 0.5, 0.82], { r: 0.05, out: 0.6 }), face(vHex, 'mouth.mandible', 'eye.button')),
  octopod: base('octopod', vOcto, legs(vOcto, [0.14, 0.38, 0.62, 0.86], { r: 0.05, out: 0.6 }), face(vOcto)),
  tripod: base('tripod', vTri, [legLimb(vTri, 0.62, { id: 'L1' }), legLimb(vTri, 0.12, { id: 'L2', centre: true })], face(vTri)),
  uniped: base('uniped', vUni, [legLimb(vUni, 0.45, { id: 'L1', centre: true, r: 0.09 })], face(vUni)),
  snake: base('snake', vSnake, [], face(vSnake, 'mouth.grin', 'eye.button')),
  blob: base('blob', vBlob, [], face(vBlob)),
  flier: base('flier', vFlier, legs(vFlier, [0.42], { r: 0.05 }), [...face(vFlier, 'mouth.hook', 'eye.almond'),
    P('P3', 'wing.feather', 'spine', 0.62, [0.85, 0.5, 0], 1, { sc: 2.2 }), P('P4', 'tail.fan', 'spine', 0.02, [0, 0.2, -0.98], 0)]),
  bighead: base('bighead', vHead, legs(vHead, [0.3], { r: 0.08 }), [P('P1', 'mouth.chomper', 'spine', 0.98, [0, -0.3, 0.95], 0), P('P2', 'eye.moon', 'spine', 0.9, [0.45, 0.55, 0.7], 1)]),
  max40: (() => {
    const ls = legs(vMax, [0.15, 0.85], { r: 0.06 });
    const ps = [...face(vMax, 'mouth.chomper', 'eye.moon'), ...feet(ls, 'foot.talon', 3)];   // 2 + 2 mirrored = 6 instances + mouth 1 = 7
    const kinds = ['det.nubhorn', 'det.curlhorn', 'det.tuft', 'det.bobble', 'fin.ear', 'det.plates', 'fin.paddle', 'tail.puff', 'eye.button', 'det.ridge',
      'fin.whisker', 'det.antler', 'det.swirlhorn', 'fin.crest', 'det.nubhorn', 'eye.dreamy', 'det.tuft'];
    let n = 7, id = 20, k = 0;
    while (n < 40) {
      const u = 0.08 + 0.84 * ((k * 0.381966) % 1), up = 0.35 + 0.6 * ((k * 0.618) % 1);
      const t = kinds[k % kinds.length];
      const mir = n + 2 <= 40;
      ps.push(P(`P${id++}`, t, 'spine', u, [mir ? 0.55 : 0, up, 0.1], mir ? 1 : 0));
      n += mir ? 2 : 1; k++;
    }
    return base('max40', vMax, ls, ps);
  })(),
  min3: base('min3', vMin, [], face(vMin)),
};
export const FIXTURE_NAMES = Object.keys(FIXTURES);
