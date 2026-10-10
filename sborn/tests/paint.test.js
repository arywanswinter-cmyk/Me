// paint.test.js — paint domains (item 25): stable under body edits elsewhere, continuous within a chain.
// Exports: nothing (registers tests). Invariants: CPU mesher outputs; h is the mesher's voxel size; colour across the
//   junctions (ΔE) is a page check (GPU vertex bake) in tools/checks.cjs `paint`.
import { test, ok, T, metric } from './harness.js';
import { buildShape } from '../src/geo/shape.js';
import { jobInput, runJob } from '../src/geo/mesher.js';
import { applyOp } from '../src/recipe/ops.js';
import { FIXTURES } from '../src/catalog/fixtures.js';
import { PART } from '../src/catalog/parts.js';

const mesh = (r) => runJob(jobInput(buildShape(r, PART), 1), 'full');
const W = (res, v) => res.aPaint[v * 4 + 3] / 65535;
const owner = (res, v) => res.aSkin[v * 4 + 3] & 127;

test('C25.domain', 'fattening a vertebra moves the domain on unaffected limbs ≤ 1 mm; neighbour jump ≤ 3h within a chain', { milestone: 7, items: [25] }, () => {
  const notes = [], fails = [];
  for (const name of ['quad', 'hexapod']) {
    const r0 = FIXTURES[name], n = r0.spine.v.length;
    const a = mesh(r0);
    // fatten the head vertebra (the legs sit well behind it)
    const r1 = applyOp(r0, 'spine.radius', { i: n - 1, r: r0.spine.v[n - 1][2] * 1.3 });
    const b = mesh(r1);
    // unaffected limbs: limb-owned vertices (w ≥ 0.98) below the body; match each to the nearest vertex of the new mesh
    const grid = new Map(), h = a.h, key = (x, y, z) => `${Math.floor(x / h)},${Math.floor(y / h)},${Math.floor(z / h)}`;
    for (let v = 0; v < b.nv; v++) { const k = key(b.position[v * 3], b.position[v * 3 + 1], b.position[v * 3 + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(v); }
    let worst = 0, cnt = 0;
    for (let v = 0; v < a.nv; v++) {
      if (W(a, v) < 0.98 || !owner(a, v)) continue;
      const x = a.position[v * 3], y = a.position[v * 3 + 1], z = a.position[v * 3 + 2];
      if (z > 0) continue;                         // the rear legs: far from the fattened head
      let best = -1, bd = Infinity; const cx = Math.floor(x / h), cy = Math.floor(y / h), cz = Math.floor(z / h);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const u of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) { const d = Math.hypot(b.position[u * 3] - x, b.position[u * 3 + 1] - y, b.position[u * 3 + 2] - z); if (d < bd) { bd = d; best = u; } }
      if (best < 0 || W(b, best) < 0.98 || owner(b, best) !== owner(a, v) || bd > 0.0015) continue;   // the same spot (within 1.5 mm) on the same limb
      const dd = Math.hypot(...[0, 1, 2].map((k) => a.aDomain[v * 3 + k] - b.aDomain[best * 3 + k]));
      worst = Math.max(worst, dd - Math.SQRT2 * bd); cnt++;           // the domain may change at most √2 × the offset
    }
    ok(cnt > 10, `${name}: only ${cnt} limb vertices matched`);
    // neighbour jump within a chain (both ends spine-only or both limb-only of one owner)
    let jump = 0;
    for (let t = 0; t < a.index.length; t += 3) for (let e = 0; e < 3; e++) {
      const p = a.index[t + e], q = a.index[t + (e + 1) % 3];
      const wp = W(a, p), wq = W(a, q);
      let dom = null;
      if (wp <= 0.02 && wq <= 0.02) dom = a.aDomain2; else if (wp >= 0.98 && wq >= 0.98 && owner(a, p) === owner(a, q)) dom = a.aDomain; else continue;
      jump = Math.max(jump, Math.hypot(...[0, 1, 2].map((k) => dom[p * 3 + k] - dom[q * 3 + k])) / a.h);
    }
    fails.push(...(worst <= T.domainMoveM ? [] : [`${name}: limb domain moved ${(worst * 1000).toFixed(2)} mm beyond the vertex offset`]), ...(jump <= T.neighbourJumpH ? [] : [`${name}: neighbour jump ${jump.toFixed(2)} h`]));
    notes.push(`${name} limb domain ${(worst * 1000).toFixed(3)} mm (${cnt} vertices), jump ${jump.toFixed(2)} h`);
  }
  metric('paint-domain', { notes });
  ok(!fails.length, fails.join('; ') + ' | ' + notes.join('; '));
  return notes.join('; ');
});
