// nav.js — getting around the island: a walkable grid, A* paths and places to wander to. Pure data, no WebGL.
// Exports: createNav(world, radius) -> { cell, walkable(x, z), path(from, to) -> [{ x, z }] | null, nearestWalkable(p), wanderTarget(from, rnd) }.
// Method: 0.5 m cells, blocked by water, steep ground and obstacles grown by the walker's radius. A* with
//   8-way moves (no corner cutting), then the path is pulled tight by dropping points that have a clear line.
// Invariants: every point of a returned path is walkable and every straight hop between points stays walkable;
//   paths only ever lead to ground connected to the birth meadow, so a tap anywhere resolves to somewhere reachable.
import { EXTENT } from './terrain.js';

export function createNav(world, radius = 0.4, cell = 0.5) {
  const n = Math.ceil((2 * EXTENT) / cell);
  const at = (i) => -EXTENT + (i + 0.5) * cell;
  const toI = (v) => Math.min(n - 1, Math.max(0, Math.floor((v + EXTENT) / cell)));
  const grid = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = at(i), z = at(j);
    if (!world.isDry(x, z, 0.08) || world.slopeAt(x, z) > 0.75) continue;
    if (world.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + radius)) continue;
    grid[j * n + i] = 1;
  }
  // Ground connected to the meadow; little pockets cut off by trees and water don't count as destinations.
  const reach = new Uint8Array(n * n), stack = [toI(0) * n + toI(0)];
  reach[stack[0]] = grid[stack[0]];
  while (stack.length) {
    const k = stack.pop(), i = k % n, j = (k - i) / n;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      const q = b * n + a;
      if (a >= 0 && b >= 0 && a < n && b < n && grid[q] && !reach[q]) { reach[q] = 1; stack.push(q); }
    }
  }
  const walkable = (x, z) => Math.abs(x) < EXTENT && Math.abs(z) < EXTENT && grid[toI(z) * n + toI(x)] === 1;

  function clear(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(d / (cell * 0.4));
    for (let s = 0; s <= steps; s++) {
      const t = steps ? s / steps : 0;
      if (!walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  function nearestWalkable(p) {
    const ci = toI(p.x), cj = toI(p.z);
    for (let r = 0; r < n; r++) {
      let best = null, bd = Infinity;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n || (Math.abs(i - ci) !== r && Math.abs(j - cj) !== r) || !reach[j * n + i]) continue;
        const d = Math.hypot(at(i) - p.x, at(j) - p.z);
        if (d < bd) { bd = d; best = { x: at(i), z: at(j) }; }
      }
      if (best) return best;
    }
    return null;
  }

  function path(from, to) {
    const s = toI(from.z) * n + toI(from.x);
    let goal = to;
    if (!walkable(to.x, to.z) || !reach[toI(to.z) * n + toI(to.x)]) { goal = nearestWalkable(to); if (!goal) return null; }
    const g = toI(goal.z) * n + toI(goal.x);
    if (s === g) return [{ x: goal.x, z: goal.z }];
    const cost = new Float32Array(n * n).fill(Infinity), came = new Int32Array(n * n).fill(-1), done = new Uint8Array(n * n);
    const open = [s]; cost[s] = 0;
    const gi = g % n, gj = (g - gi) / n, h = (k) => { const i = k % n, j = (k - i) / n; return Math.hypot(i - gi, j - gj); };
    const f = new Float32Array(n * n).fill(Infinity); f[s] = h(s);
    while (open.length) {
      let bi = 0;
      for (let q = 1; q < open.length; q++) if (f[open[q]] < f[open[bi]]) bi = q;
      const k = open[bi];
      open[bi] = open[open.length - 1]; open.pop();
      if (k === g) break;
      if (done[k]) continue;
      done[k] = 1;
      const i = k % n, j = (k - i) / n;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const q = b * n + a;
        if (!grid[q] || done[q]) continue;
        if (di && dj && (!grid[j * n + a] || !grid[b * n + i])) continue;   // no squeezing past corners
        const c = cost[k] + (di && dj ? Math.SQRT2 : 1);
        if (c < cost[q]) { cost[q] = c; came[q] = k; f[q] = c + h(q); open.push(q); }
      }
    }
    if (came[g] < 0) return null;
    const raw = [];
    for (let k = g; k !== s && k >= 0; k = came[k]) { const i = k % n; raw.push({ x: at(i), z: at((k - i) / n) }); }
    raw.reverse();
    raw[raw.length - 1] = { x: goal.x, z: goal.z };
    // Pull the string: keep only the corners we can't see past.
    const out = [];
    let anchor = { x: from.x, z: from.z }, idx = 0;
    while (idx < raw.length) {
      let far = idx;
      for (let q = raw.length - 1; q > idx; q--) if (clear(anchor, raw[q])) { far = q; break; }
      out.push(raw[far]); anchor = raw[far]; idx = far + 1;
    }
    return out;
  }

  // Somewhere interesting a few metres away: dry, reachable, and not where we already stand.
  function wanderTarget(from, rnd) {
    for (let tries = 0; tries < 40; tries++) {
      const a = rnd() * Math.PI * 2, r = 2.5 + rnd() * 5.5;
      const x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
      if (walkable(x, z) && Math.hypot(x, z) < 11) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  return { cell, walkable, path, nearestWalkable, wanderTarget, clear };
}
