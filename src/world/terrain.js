// terrain.js — the home island as pure data: one height function, the shoreline, props and obstacles.
// Exports: WATER_Y, EXTENT, SPAWN_R, SUN, buildWorld(seed) -> { heightAt, slopeAt, isDry, inFront, props, obstacles, spawn, ms }.
// Units are metres, +y up; the creature is born at the origin facing +z, where the camera starts.
// Invariants: no WebGL, so tests run headless; same seed, same island; the meadow inside SPAWN_R is exactly flat
//   at y = 0; nothing taller than a flower stands in the front wedge (inFront), so the birth and hero cameras
//   always see the creature; every obstacle stands on dry land.
import { mulberry32 } from '../core/rng.js';

export const ISLAND_SEED = 2026;
export const WATER_Y = -0.45;
export const EXTENT = 18;          // the terrain mesh covers [-EXTENT, EXTENT]²
export const SPAWN_R = 3.2;        // flat meadow kept clear around the birth spot
export const SUN = [2.4, 5.5, 3.8];
const R0 = 11;                     // mean shore radius

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

export function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512), vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, X = xi & 255, Z = zi & 255;
    const u = xf * xf * (3 - 2 * xf), w = zf * zf * (3 - 2 * zf);
    const a = vals[perm[X + perm[Z]]], b = vals[perm[X + 1 + perm[Z]]];
    const c = vals[perm[X + perm[Z + 1]]], d = vals[perm[X + 1 + perm[Z + 1]]];
    const top = a + (b - a) * u;
    return top + (c + (d - c) * u - top) * w;
  };
}

export function buildWorld(seed = ISLAND_SEED) {
  const t0 = performance.now();
  const rnd = mulberry32(seed);
  const noise = makeNoise(seed ^ 0x9e3779b9);
  const fbm = (x, z) => {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let o = 0; o < 4; o++) { s += a * noise(x * f + o * 17.3, z * f - o * 9.1); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  };
  const lobes = [[2, 0.075], [3, 0.06], [4, 0.04], [5, 0.025], [7, 0.015]].map(([k, a]) => ({ k, a: a * (0.7 + 0.6 * rnd()), p: rnd() * Math.PI * 2 }));
  const shoreAt = (theta) => { let s = 1; for (const l of lobes) s += l.a * Math.sin(l.k * theta + l.p); return R0 * s; };
  // One big soft hill off to the back right: a skyline for the hero view that still leaves the horizon open.
  const hAng = -0.55 + (rnd() - 0.5) * 0.4, bx = 7 * Math.cos(hAng), bz = 7 * Math.sin(hAng);

  function heightAt(x, z) {
    const r = Math.hypot(x, z), s = r - shoreAt(Math.atan2(z, x));
    const m = smoothstep(SPAWN_R, SPAWN_R + 3, r);
    const hills = m * (Math.max(0, fbm(x * 0.12, z * 0.12) - 0.4) * 2.6 + 1.8 * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / 11));
    const inland = Math.max(0, -s - 2), sea = Math.max(0, s - 2);
    const coast = WATER_Y + 0.05 - 0.28 * s + 0.5 * inland * inland - 0.12 * sea * sea;   // caps the land near the shore
    return smax(smin(hills, coast, 0.5), -3.2, 0.5);
  }
  function slopeAt(x, z) {
    const e = 0.1;
    return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  }
  const isDry = (x, z, margin = 0) => heightAt(x, z) > WATER_Y + margin;
  const inFront = (x, z) => z > -1 && Math.abs(x) < 0.55 * Math.max(z, 0) + 4.5;

  const obstacles = [];
  const free = (x, z, r, gap) => obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + gap);
  function scatter(n, place) {
    const out = [];
    for (let i = 0; i < n * 60 && out.length < n; i++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * R0 * 1.15;
      const p = place(rr * Math.cos(a), rr * Math.sin(a), rr);
      if (p) out.push(p);
    }
    return out;
  }
  const GREENS = ['#86B96E', '#78AE63', '#97C47A', '#8DBF6A'];

  const trees = scatter(11, (x, z, r) => {
    if (r < 7.2 || inFront(x, z) || !isDry(x, z, 0.55) || slopeAt(x, z) > 0.45 || !free(x, z, 0.8, 1.0)) return null;
    const y = heightAt(x, z), trunk = 1.25 + rnd() * 0.9, R = 0.85 + rnd() * 0.4;
    const blossom = rnd() < 0.25, color = blossom ? '#F2A9BC' : GREENS[Math.floor(rnd() * GREENS.length)];
    const blobs = [{ dx: 0, dy: trunk + R * 0.55, dz: 0, r: R }];
    const extra = Math.floor(rnd() * 3);
    for (let k = 0; k < extra; k++) {
      const a = rnd() * Math.PI * 2;
      blobs.push({ dx: Math.cos(a) * R * 0.6, dy: trunk + R * (0.2 + rnd() * 0.5), dz: Math.sin(a) * R * 0.6, r: R * (0.55 + rnd() * 0.15) });
    }
    obstacles.push({ x, z, r: 0.8, kind: 'tree' });
    return { x, y, z, trunk, trunkR: 0.11 + R * 0.06, lean: (rnd() - 0.5) * 0.12, color, blobs, top: trunk + R * 1.6 };
  });
  const bushes = scatter(14, (x, z, r) => {
    if (r < 6.2 || inFront(x, z) || !isDry(x, z, 0.5) || slopeAt(x, z) > 0.5 || !free(x, z, 0.5, 0.5)) return null;
    const y = heightAt(x, z), color = GREENS[Math.floor(rnd() * GREENS.length)], n = 2 + Math.floor(rnd() * 2);
    const blobs = [];
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, br = 0.32 + rnd() * 0.18, off = k ? 0.3 : 0;
      blobs.push({ dx: Math.cos(a) * off, dy: br * 0.62, dz: Math.sin(a) * off, r: br });
    }
    obstacles.push({ x, z, r: 0.5, kind: 'bush' });
    return { x, y, z, color, blobs, top: 0.9 };
  });
  const rocks = scatter(10, (x, z, r) => {
    const front = inFront(x, z);
    if (r < SPAWN_R + 1.2 || (front && r < 9.5) || !isDry(x, z, -0.15) || slopeAt(x, z) > 0.7) return null;
    const size = 0.22 + rnd() * (front ? 0.2 : 0.4);
    if (!free(x, z, size, 0.5)) return null;
    obstacles.push({ x, z, r: size, kind: 'rock' });
    return { x, y: heightAt(x, z), z, size, rot: rnd() * Math.PI * 2, tilt: (rnd() - 0.5) * 0.3, shade: rnd() };
  });
  const FLOWER = ['#F05A4F', '#F7C948', '#63B8D9', '#C98BE0', '#FF8C42', '#F2A6A0', '#FFFDF7'];
  const flowers = [];
  // Flowers grow in little clumps, like someone dotted them in with a pen.
  for (const clump of scatter(16, (x, z, r) => (r > 2.2 && isDry(x, z, 0.5) && slopeAt(x, z) < 0.5 && free(x, z, 0.1, 0.25) ? { x, z } : null))) {
    const color = FLOWER[Math.floor(rnd() * FLOWER.length)], n = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const x = clump.x + (rnd() - 0.5) * 0.9, z = clump.z + (rnd() - 0.5) * 0.9;
      if (Math.hypot(x, z) < 2 || !isDry(x, z, 0.45) || !free(x, z, 0.06, 0.1)) continue;
      flowers.push({ x, y: heightAt(x, z), z, h: 0.16 + rnd() * 0.14, color });
    }
  }

  return {
    seed, heightAt, slopeAt, isDry, inFront, shoreAt,
    props: { trees, bushes, rocks, flowers },
    obstacles,
    spawn: { x: 0, z: 0 },
    ms: performance.now() - t0,
  };
}

// Walkable cells on a coarse grid, flood-filled from the spawn. Used by tests now and by walking later.
export function reachable(world, cell = 0.5) {
  const n = Math.ceil((2 * EXTENT) / cell), at = (i) => -EXTENT + (i + 0.5) * cell;
  const walk = new Uint8Array(n * n);
  let total = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = at(i), z = at(j);
    if (!world.isDry(x, z, 0.05) || world.slopeAt(x, z) > 0.75) continue;
    if (world.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r)) continue;
    walk[j * n + i] = 1; total++;
  }
  const seen = new Uint8Array(n * n), start = Math.floor(n / 2) * n + Math.floor(n / 2), stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const k = stack.pop(); count++;
    const i = k % n, j = (k - i) / n;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const q = b * n + a;
      if (walk[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
    }
  }
  return { total, reached: count, area: total * cell * cell };
}
