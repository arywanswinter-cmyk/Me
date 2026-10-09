// gait.js — how a drawn body walks. Pure maths, no WebGL, so tests run headless.
// Exports: MAX_LEGS, legRig(positions, feet, height) -> { hipY, legs: [{ x, z }], legOf: Float32Array, legW: Float32Array },
//          gaitFor(rig, height, stub) -> { kind, freq, speed, swing, phases }, legPose(gait, phase, amount) -> { swing[], lift[] }.
// Method: a leg is the part of the mesh under the hip line next to a drawn foot. The hip line is the lowest height
//   where the separate legs merge into the body. Each leg swings about its hip like a pendulum; the swing and the
//   stride are matched so planted feet don't slide.
// Invariants: legOf is 0 for "not a leg" and k + 1 for leg k (so a mesh without the attribute reads as no legs);
//   legW is 0 at the hip and 1 at the foot; same input, same rig.
export const MAX_LEGS = 8;
const SWING = 0.42;   // radians either side of straight down

export function legRig(positions, feet, height) {
  const n = positions.length / 3, legs = feet.slice(0, MAX_LEGS);
  const legOf = new Float32Array(n), legW = new Float32Array(n);
  if (legs.length < 2) return { hipY: 0, legs: [], legOf, legW };

  // Walk up from the ground in thin slabs; the hip is where the slab stops showing one run per leg.
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < n; i++) { const x = positions[i * 3]; if (x < minX) minX = x; if (x > maxX) maxX = x; }
  const BINS = 160, bw = (maxX - minX) / BINS || 1, occ = new Uint8Array(BINS + 1), slab = height * 0.025;
  let hipY = height * 0.6;
  for (let y = height * 0.08; y < height * 0.6; y += height * 0.01) {
    occ.fill(0);
    for (let i = 0; i < n; i++) {
      const py = positions[i * 3 + 1];
      if (py >= y && py < y + slab) occ[Math.floor((positions[i * 3] - minX) / bw)] = 1;
    }
    let runs = 0;
    for (let b = 0; b <= BINS; b++) if (occ[b] && !occ[b - 1] && !(b > 1 && occ[b - 2])) runs++;
    if (runs < legs.length) { hipY = y; break; }
  }

  const zSum = new Float64Array(legs.length), zCnt = new Uint32Array(legs.length), blend = hipY * 0.35;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1];
    if (y >= hipY) continue;
    let best = -1, bd = Infinity;
    for (let k = 0; k < legs.length; k++) { const d = Math.abs(x - legs[k].x); if (d < bd) { bd = d; best = k; } }
    if (bd > legs[best].w * 0.5 + height * 0.06) continue;
    const t = Math.min(1, (hipY - y) / blend);
    legOf[i] = best + 1;
    legW[i] = t * t * (3 - 2 * t);
    zSum[best] += positions[i * 3 + 2]; zCnt[best]++;
  }
  return { hipY, legs: legs.map((f, k) => ({ x: f.x, z: zCnt[k] ? zSum[k] / zCnt[k] : 0 })), legOf, legW };
}

export function gaitFor(rig, height, stub) {
  if (stub || rig.legs.length < 2) {
    // Hoppers: one hop per cycle, each about a third of a body length.
    const freq = 1.7;
    return { kind: 'hop', freq, speed: height * 0.34 * freq, swing: 0, phases: [], hip: 0 };
  }
  const n = rig.legs.length, hip = Math.max(rig.hipY, height * 0.12);
  const freq = Math.min(2.6, Math.max(1.1, 1.05 / Math.sqrt(hip)));
  // While planted, a foot sweeps 2·hip·sin(SWING) backwards in half a cycle; the body must cover the same ground.
  const stance = 2 * hip * Math.sin(SWING);
  const speed = stance * 2 * freq;
  const sorted = rig.legs.map((l, k) => ({ k, x: l.x })).sort((a, b) => a.x - b.x);
  const phases = new Array(n);
  if (n <= 4) sorted.forEach((s, i) => { phases[s.k] = (i % 2) * 0.5; });          // alternate neighbours
  else sorted.forEach((s, i) => { phases[s.k] = (i / n) % 1; });                     // many legs ripple
  return { kind: n > 4 ? 'ripple' : 'walk', freq, speed, swing: SWING, phases, hip };
}

// Pendulum swing: forward in the air (lifted) for half a cycle, backward on the ground (planted) for the other half.
export function legPose(gait, phase, amount) {
  const swing = new Array(MAX_LEGS).fill(0), lift = new Array(MAX_LEGS).fill(0);
  gait.phases.forEach((p, k) => {
    const u = (phase + p) % 1;
    swing[k] = -Math.cos(u * 2 * Math.PI) * gait.swing * amount;            // back → forward in the air, forward → back planted
    lift[k] = u < 0.5 ? Math.sin(u * 2 * Math.PI) * gait.hip * 0.18 * amount : 0;
  });
  return { swing, lift };
}
