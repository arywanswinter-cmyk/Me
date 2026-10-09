// gait.js — how a drawn body walks, the way Spore does it: a leg rig found in the mesh, a gait chosen by leg count,
// and two-bone inverse kinematics so feet plant on the ground. Pure maths, no WebGL, so tests run headless.
// Exports: MAX_LEGS, legRig(positions, feet, height) -> { hipY, legs: [{ x, z }], legOf, legW },
//          gaitFor(rig, height, stub) -> { kind, name, freq, duty, offsets, speed, stride, hip, thigh, shin },
//          inStance(gait, k, phase) -> bool, solveLeg(dy, dz, thigh, shin) -> { hip, knee, reach }.
// Method: a leg is the part of the mesh under the hip line next to a drawn foot; the hip line is the lowest height
//   where the separate legs merge into the body. Each leg is two bones of equal length (thigh, shin) with the knee
//   halfway down. Every leg runs the same cycle shifted by its offset: planted for `duty` of it, swinging for the rest.
// Gaits, as in real animals: 2 legs walk left-right, 3 legs take turns, 4 legs trot in alternate pairs, 6 legs use
//   the insect tripod, 7 or more ripple in a wave from one side to the other (centipedes).
// Invariants: legOf is 0 for "not a leg" and k + 1 for leg k (so a mesh without the attribute reads as no legs);
//   legW is 0 at the hip and 1 below the blend zone; angles are radians about the x axis, positive swings the foot
//   forward (+z); same input, same rig and gait.
export const MAX_LEGS = 12;

export function legRig(positions, feet, height) {
  const n = positions.length / 3, legs = feet.slice(0, MAX_LEGS);
  const legOf = new Float32Array(n), legW = new Float32Array(n);
  if (legs.length < 2) return { hipY: 0, legs: [], legOf, legW };

  // Walk up from the ground in thin slabs; the hip is where the slab stops showing one run per leg.
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < n; i++) { const x = positions[i * 3]; if (x < minX) minX = x; if (x > maxX) maxX = x; }
  const BINS = 220, bw = (maxX - minX) / BINS || 1, occ = new Uint8Array(BINS + 1), slab = height * 0.025;
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

  const zSum = new Float64Array(legs.length), zCnt = new Uint32Array(legs.length), blend = hipY * 0.3;
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
    return { kind: 'hop', name: 'hop', freq, duty: 0.45, offsets: [], speed: height * 0.34 * freq, stride: height * 0.34, hip: 0, thigh: 0, shin: 0 };
  }
  const n = rig.legs.length, hip = Math.max(rig.hipY, height * 0.12);
  const order = rig.legs.map((l, k) => ({ k, x: l.x })).sort((a, b) => a.x - b.x).map((s) => s.k);
  const offsets = new Array(n);
  let name, duty;
  if (n === 2) { name = 'walk'; duty = 0.6; order.forEach((k, i) => { offsets[k] = i * 0.5; }); }
  else if (n === 3) { name = 'amble'; duty = 0.7; order.forEach((k, i) => { offsets[k] = i / 3; }); }
  else if (n <= 6) { name = n === 6 ? 'tripod' : 'trot'; duty = 0.56; order.forEach((k, i) => { offsets[k] = (i % 2) * 0.5; }); }
  else { name = 'wave'; duty = 0.72; order.forEach((k, i) => { offsets[k] = (i * 0.38) % 1; }); }   // a ripple that runs along the body
  // Long legs take slower, bigger steps; the body covers exactly one stride per planted stretch, so feet never skate.
  const freq = Math.min(2.8, Math.max(1.0, 1.0 / Math.sqrt(hip))) * (n >= 7 ? 1.25 : 1);
  const stride = hip * (n >= 7 ? 0.55 : 0.75);
  const speed = stride * freq / duty;
  return { kind: n >= 7 ? 'ripple' : 'walk', name, freq, duty, offsets, speed, stride, hip, thigh: hip * 0.5, shin: hip * 0.5 };
}

export const inStance = (gait, k, phase) => ((phase + gait.offsets[k]) % 1) < gait.duty;

// Two-bone IK in the leg's plane. dy, dz: foot relative to hip (dy < 0 is below). Knees bend forward.
// Returns the thigh angle from straight down and the knee bend (the shin's angle relative to the thigh).
export function solveLeg(dy, dz, thigh, shin) {
  const max = (thigh + shin) * 0.999, min = Math.abs(thigh - shin) + (thigh + shin) * 0.15;
  const raw = Math.hypot(dy, dz), d = Math.min(max, Math.max(min, raw));
  const toFoot = Math.atan2(dz, -dy);
  const a = Math.acos(Math.min(1, Math.max(-1, (thigh * thigh + d * d - shin * shin) / (2 * thigh * d))));
  const inner = Math.acos(Math.min(1, Math.max(-1, (thigh * thigh + shin * shin - d * d) / (2 * thigh * shin))));
  return { hip: toFoot + a, knee: -(Math.PI - inner), reach: raw <= max + 1e-9 };
}
