// sculpt.js — the creature editor's maths: pull, puff and slim the clay after it's born, Spore-style.
// Exports: brush(positions, center, radius) -> { idx: Int32Array, w: Float32Array },
//          pull(positions, start, strokes, delta) — strokes: [{ idx, w, d: [dx, dy, dz] }], each moved by w·d from start,
//          puff(positions, normals, b, amount), mirrorPoint(p), tailFrom(normalZ, b, start, pivot, delta, height),
//          finalizeShape(data) -> data with the body back on the ground and feet, size and normals recomputed.
// Method: every tool works on a soft round brush in the mesh's own space: full strength at the centre, fading to
//   nothing at the radius ((1 - d²/r²)², so the clay never tears). Pulls move vertices from where they were when the
//   drag began, so a drag can go back and forth without smearing. Mirror mode runs the same stroke on the other side.
// Invariants: the triangle list never changes (the drawing printed on the skin keeps its place); a pull that starts
//   on the back of the body and goes far enough becomes a tail; finalizeShape puts the lowest point at y = 0.
import { vertexNormals } from '../geo/pipeline.js';

export function brush(positions, center, radius) {
  const n = positions.length / 3, r2 = radius * radius, idx = [], w = [];
  for (let i = 0; i < n; i++) {
    const dx = positions[i * 3] - center[0], dy = positions[i * 3 + 1] - center[1], dz = positions[i * 3 + 2] - center[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r2) continue;
    const f = 1 - d2 / r2;
    idx.push(i); w.push(f * f);
  }
  return { idx: Int32Array.from(idx), w: Float32Array.from(w) };
}

export const mirrorPoint = (p) => [-p[0], p[1], p[2]];

// Moves each brushed vertex from its start position by its weight times the stroke's delta. Overlapping strokes add.
export function pull(positions, start, strokes) {
  for (const s of strokes) for (let j = 0; j < s.idx.length; j++) {
    const i = s.idx[j] * 3;
    positions[i] = start[i]; positions[i + 1] = start[i + 1]; positions[i + 2] = start[i + 2];
  }
  for (const s of strokes) for (let j = 0; j < s.idx.length; j++) {
    const i = s.idx[j] * 3, w = s.w[j];
    positions[i] += s.d[0] * w; positions[i + 1] += s.d[1] * w; positions[i + 2] += s.d[2] * w;
  }
}

// Push the brushed clay out along its normals (amount > 0 puffs, < 0 slims).
export function puff(positions, normals, b, amount) {
  for (let j = 0; j < b.idx.length; j++) {
    const i = b.idx[j] * 3, a = amount * b.w[j];
    positions[i] += normals[i] * a; positions[i + 1] += normals[i + 1] * a; positions[i + 2] += normals[i + 2] * a;
  }
}

// A long pull off the back of the body is a tail: it wags from where the pull started.
export function tailFrom(normalZ, b, pivot, delta, height) {
  const len = Math.hypot(delta[0], delta[1], delta[2]);
  if (normalZ > -0.45 || len < height * 0.15) return null;
  return {
    kind: 'tail', pivot: pivot.slice(), dir: delta.map((v) => v / len), len, side: 1,
    verts: Array.from(b.idx), weights: Array.from(b.w, (w) => Math.pow(w, 0.7)),
  };
}

// Feet: separate runs of clay a little above the ground, as in the drawing's anatomy.
export function feetFromMesh(positions, height) {
  const n = positions.length / 3;
  let x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = positions[i * 3]; if (x < x0) x0 = x; if (x > x1) x1 = x; }
  // Look just above the toes (like the drawing's anatomy does), where separate legs are still separate.
  const bw = height / 70, BINS = Math.ceil((x1 - x0) / bw), occ = new Uint8Array(BINS + 3), lo = height * 0.09, hi = height * 0.14;
  for (let i = 0; i < n; i++) { const y = positions[i * 3 + 1]; if (y >= lo && y < hi) occ[Math.floor((positions[i * 3] - x0) / bw)] = 1; }
  const feet = [];
  for (let b = 0; b <= BINS; b++) {
    if (!occ[b]) continue;
    const a = b;
    while (b + 1 <= BINS && (occ[b + 1] || occ[b + 2])) b++;     // bridge one empty bin: the mesh is sampled, not solid
    feet.push({ x: x0 + ((a + b + 1) / 2) * bw, w: (b - a + 1) * bw });
  }
  return feet.length >= 2 ? feet.slice(0, 12) : [];
}

export function finalizeShape(data) {
  const p = data.positions, n = p.length / 3;
  let minY = Infinity, maxY = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  for (let i = 0; i < n; i++) p[i * 3 + 1] -= minY;
  const eyes = data.eyes.map((e) => ({ ...e, pos: [e.pos[0], e.pos[1] - minY, e.pos[2]] }));
  const extraApps = (data.extraApps || []).map((a) => ({ ...a, pivot: [a.pivot[0], a.pivot[1] - minY, a.pivot[2]] }));
  const height = maxY - minY, feet = data.stub ? [] : feetFromMesh(p, height);
  return {
    ...data, eyes, extraApps, height, feet, stub: data.stub || feet.length < 2,
    width: x1 - x0, depth: z1 - z0, normals: vertexNormals(p, data.indices),
  };
}
