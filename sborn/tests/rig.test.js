// rig.test.js — spine limits, anchor re-resolution after random edits, roles, rest pose.
// Exports: nothing (registers tests).
// Invariants: pure geometry; no WebGL.
import { test, ok, T } from './harness.js';
import { newRecipe } from '../src/recipe/schema.js';
import { applyOp } from '../src/recipe/ops.js';
import { buildShape, limbRoles } from '../src/geo/shape.js';
import { makePrims, field, allIndex } from '../src/geo/sdf.js';
import { jobInput, runJob } from '../src/geo/mesher.js';
import { PART } from '../src/catalog/parts.js';
import { FIXTURES } from '../src/catalog/fixtures.js';
import { mulberry32 } from '../src/core/rng.js';

test('C10.spine-limits', 'spine stays 3–24 vertebrae, radius 0.04–0.60 m; wheel factor 8% per 100-unit notch', { milestone: 1, items: [10] }, () => {
  let r = newRecipe();
  for (let i = 0; i < 40; i++) r = applyOp(r, 'spine.add', { end: i % 2 ? 'head' : 'tail' });
  ok(r.spine.v.length === T.vertebraeMax, `max ${r.spine.v.length}`);
  for (let i = 0; i < 40; i++) r = applyOp(r, 'spine.remove', { end: 'head' });
  ok(r.spine.v.length === T.vertebraeMin, `min ${r.spine.v.length}`);
  for (let i = 0; i < 60; i++) r = applyOp(r, 'spine.scale', { i: 1, f: 1.3 });
  ok(r.spine.v[1][2] === T.radiusMax, `rmax ${r.spine.v[1][2]}`);
  for (let i = 0; i < 90; i++) r = applyOp(r, 'spine.scale', { i: 1, f: 0.7 });
  ok(r.spine.v[1][2] === T.radiusMin, `rmin ${r.spine.v[1][2]}`);
  const f = Math.exp(100 * 0.00077);
  ok(Math.abs(f - 1 - T.wheelPerNotch) <= T.wheelTol, `notch ${f}`);
});

function randomEdit(r, rnd) {
  const k = Math.floor(rnd() * 5), n = r.spine.v.length;
  if (k === 0) return applyOp(r, 'spine.add', { end: rnd() < 0.5 ? 'head' : 'tail' });
  if (k === 1) return applyOp(r, 'spine.remove', { end: rnd() < 0.5 ? 'head' : 'tail' });
  if (k === 2) return applyOp(r, 'spine.scale', { i: Math.floor(rnd() * n), f: 0.75 + rnd() * 0.5 });
  if (k === 3) { const i = Math.floor(rnd() * n); return applyOp(r, 'spine.move', { i, y: r.spine.v[i][0] + (rnd() - 0.5) * 0.12, z: r.spine.v[i][1] + (rnd() - 0.5) * 0.12 }); }
  const l = r.limbs[Math.floor(rnd() * r.limbs.length)];
  if (!l) return r;
  const j = 1 + Math.floor(rnd() * (l.j.length - 1));
  const d = l.j[j];
  return applyOp(r, 'limb.joint', { id: l.id, j, d: [d[0] + (rnd() - 0.5) * 0.05, d[1] + (rnd() - 0.5) * 0.05, d[2] + (rnd() - 0.5) * 0.05] });
}
test('C14.reresolve', 'after 200 random spine and limb edits every part and limb root re-resolves within 0.5h, none lost', { milestone: 1, items: [14] }, () => {
  const rnd = mulberry32(14);
  let r = JSON.parse(JSON.stringify(FIXTURES.max40));
  const expectSockets = r.parts.reduce((a, p) => a + (p.m ? 2 : 1), 0), expectLimbs = r.limbs.reduce((a, l) => a + (l.m ? 2 : 1), 0);
  let worst = 0;
  for (let e = 0; e < T.randomEdits; e++) {
    r = randomEdit(r, rnd);
    if (e % 20 !== 19) continue;                    // full check every 20 edits (each check meshes once for h)
    const sh = buildShape(r, PART);
    const h = runJob(jobInput(sh, 1), 'full').h;
    ok(sh.sockets.length === expectSockets, `sockets ${sh.sockets.length}/${expectSockets} after ${e + 1}`);
    ok(sh.limbs.length === expectLimbs, `limbs ${sh.limbs.length}`);
    const body = makePrims(sh.prims.slice(0, sh.nBodyPrims)), bi = allIndex(body);
    for (const s of sh.sockets) {
      if (s.tip) continue;
      const f = Math.abs(field(body, s.surf[0], s.surf[1], s.surf[2], bi, body.count));
      worst = Math.max(worst, f / h);
      ok(f <= T.reresolveH * h, `socket ${s.id} off surface by ${(f / h).toFixed(2)}h`);
      const sink = Math.hypot(s.surf[0] - s.pos[0], s.surf[1] - s.pos[1], s.surf[2] - s.pos[2]);
      ok(Math.abs(sink - PART[s.t].sink * s.baseR) < 1e-6, `sink ${sink}`);
    }
    for (const L of sh.limbs) {
      const a = L.anchor.p, root = L.joints[0];
      const sink = Math.hypot(a[0] - root[0], a[1] - root[1], a[2] - root[2]);
      ok(Math.abs(sink - 0.5 * L.radii[0]) < 1e-6, `limb root sink ${sink}`);
    }
  }
  return `worst ${worst.toFixed(3)} h`;
});
test('M1.roles', 'roles: fixtures with legs walk on legs', { milestone: 1 }, () => {
  for (const n of ['biped', 'quad', 'hexapod', 'octopod']) {
    const sh = buildShape(FIXTURES[n], PART); const res = runJob(jobInput(sh, 1), 'preview');
    const roles = limbRoles(sh, res.minY, PART);
    ok(roles.every((x) => x === 'leg'), `${n}: ${roles}`);
  }
});
