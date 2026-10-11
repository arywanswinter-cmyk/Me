// gait.js — the §10.3 gait table for any leg count, plus the speed, stride and step-rate formulas.
// Exports: G, legLayout(shape, roles) -> legs[] (side, s, order), chooseGait(nLegs, Fr, prev, nSide) -> {id, offsets(legs), beta, minPlanted},
//          speeds(L, stats) -> {walk, run}, strideFor(v, L, beta, sweep) -> {S, rate}, smootherstep(u).
// Invariants: pure functions of numbers; 4-leg walk→trot switch has ±0.08 Froude hysteresis; offsets are in [0,1).
export const G = 9.81;
export const smootherstep = (u) => u * u * u * (u * (u * 6 - 15) + 10);

// Legs sorted front to back by spine arc parameter; side = sign(root.x), centre when |x| < 0.05 × body width.
export function legLayout(shape, roles) {
  let width = 0;
  for (const v of shape.vertebrae) width = Math.max(width, 2 * v[2]);
  const legs = [];
  shape.limbs.forEach((L, i) => {
    if (roles[i] !== 'leg') return;
    const root = L.joints[0];
    const nn = shape.spine.nearest(0, root[1], root[2]);
    const side = Math.abs(root[0]) < 0.05 * width ? 0 : Math.sign(root[0]);
    legs.push({ limbIndex: i, limb: L, side, s: nn.s, x: root[0] });
  });
  legs.sort((a, b) => b.s - a.s || a.side - b.side);       // front (head, high s) first
  return legs;
}

// Offsets for the active gait; `legs` from legLayout (front → back).
export function chooseGait(legs, Fr, prevId = null) {
  const n = legs.length;
  const left = legs.filter((l) => l.side < 0), right = legs.filter((l) => l.side > 0), centre = legs.filter((l) => l.side === 0);
  const balanced = left.length === right.length;
  const off = new Float64Array(n);
  const idx = (l) => legs.indexOf(l);
  const metachronal = (id, beta) => {
    const per = (side, shift) => { const s = side.slice().reverse(); s.forEach((l, k) => { off[idx(l)] = (k / s.length + shift) % 1; }); };
    per(left, 0); per(right, 0.5);
    centre.forEach((l, k) => { off[idx(l)] = (k / Math.max(1, centre.length) + 0.25) % 1; });
    const nSide = Math.max(left.length, right.length, 1);
    return { id, offsets: off, beta: beta ?? 1 - 1 / nSide, minPlanted: Math.ceil(n / 2) };
  };
  if (n === 0) return { id: 'none', offsets: off, beta: 1, minPlanted: 0 };
  if (n === 1) return { id: 'pogo', offsets: off, beta: 0.5, minPlanted: 0 };
  if (n === 2 && balanced) {
    const run = Fr >= 0.5;
    off[idx(left[0])] = 0; off[idx(right[0])] = 0.5;
    return { id: run ? 'biped-run' : 'biped-walk', offsets: off, beta: run ? 0.38 : 0.62, minPlanted: run ? 0 : 1 };
  }
  if (n === 3) { legs.forEach((l, k) => { off[k] = k / 3; }); return { id: 'tripod-ish', offsets: off, beta: 0.7, minPlanted: 2 }; }
  if (n === 4 && balanced) {
    const LF = idx(left[0]), LH = idx(left[1]), RF = idx(right[0]), RH = idx(right[1]);
    const trot = prevId === 'quad-trot' ? Fr > 0.35 - 0.08 : Fr > 0.35 + 0.08;
    if (trot) { off[LF] = 0; off[RH] = 0; off[RF] = 0.5; off[LH] = 0.5; return { id: 'quad-trot', offsets: off, beta: 0.6, minPlanted: 2 }; }
    off[LH] = 0; off[LF] = 0.25; off[RH] = 0.5; off[RF] = 0.75;
    return { id: 'quad-walk', offsets: off, beta: 0.75, minPlanted: 3 };
  }
  if (n === 6 && balanced) {
    if (Fr > 0.15) {
      const [L1, L2, L3] = left.map(idx), [R1, R2, R3] = right.map(idx);
      off[L1] = 0; off[R2] = 0; off[L3] = 0; off[R1] = 0.5; off[L2] = 0.5; off[R3] = 0.5;
      return { id: 'hex-tripod', offsets: off, beta: 0.5, minPlanted: 3 };
    }
    const g = metachronal('hex-wave', 0.75); g.minPlanted = 4; return g;
  }
  return metachronal('metachronal');
}

export function speeds(L, stats = {}) {
  const s = Math.sqrt(G * Math.max(0.05, L));
  return { walk: 0.35 * s, run: Math.min(6, 0.85 * s * (1 + 0.12 * (stats.Speed || 0))) };
}

// Stride S = 2.3·L·Fr'^0.3, clamped so β·S ≤ 1.1 L; step rate v/S clamped 0.8–4 Hz.
// `sweep` (optional) is the longest stance sweep β·S the legs can reach (from their geometry).
export function strideFor(v, L, beta, sweep = Infinity) {
  const Fr = Math.max((v * v) / (G * L), 0.02);
  let S = 2.3 * L * Math.pow(Fr, 0.3);
  const cap = Math.min(1.1 * L, sweep);
  if (beta * S > cap) S = cap / beta;
  let rate = v / S;
  rate = Math.min(4, Math.max(0.8, rate));
  S = v / rate;
  return { S, rate, Fr };
}
