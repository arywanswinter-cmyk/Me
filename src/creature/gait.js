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
import { edt } from '../geo/edt.js';

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

// ---- Appendages: arms, antennae, ears and tails, found as the thin parts of the body above the hips.
// Method: rasterise the body's silhouette on a grid, then open it (shrink, regrow) by a disc about half as wide as the
// fattest part: what survives is the body, what's cut off is thin. Thin parts above the hips that aren't legs are
// appendages; where one meets the body is its joint, its farthest cell is its tip.
// Kinds: 'arm' joins the body's side and swings with the walk; 'top' (antennae, ears, horns) points up and flops.
// Output per vertex: appOf (0 none, k + 1 appendage k), appW (0 at the joint → 1 rigid for arms, rising to the tip
// for floppy parts).
export const MAX_APPS = 6;
export function findAppendages(positions, legOf, hipY, height) {
  const n = positions.length / 3, appOf = new Float32Array(n), appW = new Float32Array(n);
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = positions[i * 3]; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  const C = height / 64, P = 2, W = Math.ceil((x1 - x0) / C) + 1 + 2 * P, H = Math.ceil(height / C) + 1 + 2 * P;
  const has = new Uint8Array(W * H);
  const cellOf = (i) => (Math.min(H - 1 - P, Math.max(0, Math.floor(positions[i * 3 + 1] / C))) + P) * W + Math.min(W - 1 - P, Math.floor((positions[i * 3] - x0) / C)) + P;
  for (let i = 0; i < n; i++) has[cellOf(i)] = 1;
  const outside = new Uint8Array(W * H);
  for (let c = 0; c < W * H; c++) outside[c] = has[c] ? 0 : 1;
  const inR = edt(outside, W, H);
  let maxR = 0;
  for (let c = 0; c < W * H; c++) if (has[c]) maxR = Math.max(maxR, inR[c]);
  const R0 = maxR * 0.5, core = new Uint8Array(W * H);
  for (let c = 0; c < W * H; c++) core[c] = has[c] && inR[c] > R0 ? 1 : 0;
  const toCore = edt(core, W, H);
  const thin = new Uint8Array(W * H), body = new Uint8Array(W * H);
  for (let c = 0; c < W * H; c++) {
    if (!has[c]) continue;
    if (toCore[c] <= R0 + 0.75) body[c] = 1;
    else if ((Math.floor(c / W) - P) * C > hipY + C) thin[c] = 1;
  }
  const legCell = new Uint8Array(W * H);
  for (let i = 0; i < n; i++) if (legOf[i]) { const c = cellOf(i); thin[c] = 0; legCell[c] = 1; }
  const comp = new Int32Array(W * H).fill(-1), apps = [];
  for (let s = 0; s < W * H; s++) {
    if (!thin[s] || comp[s] >= 0) continue;
    const cells = [], st = [s]; comp[s] = apps.length;
    while (st.length) {
      const c = st.pop(); cells.push(c);
      const cx = c % W, cy = (c - cx) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ax = cx + dx, ay = cy + dy, q = ay * W + ax;
        if ((dx || dy) && ax >= 0 && ay >= 0 && ax < W && ay < H && thin[q] && comp[q] < 0) { comp[q] = apps.length; st.push(q); }
      }
    }
    // The joint: thin cells touching thick body.
    let jx = 0, jy = 0, jn = 0;
    for (const c of cells) {
      const cx = c % W, cy = (c - cx) / W;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) for (let dx = -1; dx <= 1; dx++) {
        const ax = cx + dx, ay = cy + dy, q = ay * W + ax;
        if (ax >= 0 && ay >= 0 && ax < W && ay < H && body[q]) { touches = true; break; }
      }
      if (touches) { jx += cx; jy += cy; jn++; }
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (legCell[(cy + dy) * W + cx + dx]) jn = -1e9;   // the top of a leg
    }
    if (jn <= 0) { apps.push(null); continue; }                       // a floating thin piece: leave it alone
    jx /= jn; jy /= jn;
    let tip = cells[0], far = -1;
    for (const c of cells) { const cx = c % W, cy = (c - cx) / W, d = Math.hypot(cx - jx, cy - jy); if (d > far) { far = d; tip = c; } }
    const len = far * C;
    if (cells.length < 6 || len < height * 0.09) { apps.push(null); continue; }
    const tx = tip % W, ty = (tip - tx) / W, dx = tx - jx, dy = ty - jy, dl = Math.hypot(dx, dy) || 1;
    const pivot = [x0 + (jx - P + 0.5) * C, (jy - P + 0.5) * C, 0], dir = [dx / dl, dy / dl, 0];
    apps.push({ pivot, dir, len, kind: dir[1] > 0.55 ? 'top' : 'arm', side: Math.sign(dir[0]) || 1, cells: cells.length });
  }
  // Keep the biggest few; renumber.
  const keep = apps.map((a, i) => (a ? i : -1)).filter((i) => i >= 0).sort((a, b) => apps[b].cells - apps[a].cells).slice(0, MAX_APPS);
  const remap = new Map(keep.map((oldI, newI) => [oldI, newI]));
  const out = keep.map((i) => apps[i]);
  for (let i = 0; i < n; i++) {
    if (legOf[i]) continue;
    const k = remap.get(comp[cellOf(i)]);
    if (k === undefined) continue;
    const a = out[k], px = positions[i * 3] - a.pivot[0], py = positions[i * 3 + 1] - a.pivot[1];
    const along = Math.max(0, (px * a.dir[0] + py * a.dir[1]) / a.len);
    appOf[i] = k + 1;
    appW[i] = a.kind === 'arm' ? Math.min(1, along / 0.3) ** 2 * (3 - 2 * Math.min(1, along / 0.3)) : Math.min(1, along) ** 1.4;
  }
  return { apps: out.map(({ cells, ...a }) => a), appOf, appW };
}
