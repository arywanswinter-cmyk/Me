// run.js — headless geometry and island tests (no WebGL). Open tests.html; the page title becomes "ALL PASS" or "FAIL".
// Exports: nothing. Invariants: every sample doodle must build a closed, outward-facing, NaN-free mesh;
//   the island must give every creature a flat, clear, reachable place to stand; legs found in a drawing must be
//   the legs that were drawn, and walking must never leave dry land or go through a tree.
import { buildCreature, meshStats } from '../geo/pipeline.js';
import { buildWorld, reachable, WATER_Y, SPAWN_R, EXTENT } from '../world/terrain.js';
import { createNav } from '../world/nav.js';
import { legRig, gaitFor, inStance, solveLeg } from '../creature/gait.js';
import { edt } from '../geo/edt.js';
import { SAMPLES } from '../draw/samples.js';

const results = [];
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
function test(name, fn) {
  try { results.push({ name, pass: true, note: fn() || '' }); }
  catch (e) { results.push({ name, pass: false, note: e.message }); }
}
const strokesOf = (s) => s.strokes.map((x) => ({ color: s.pen, w: x.w, pts: x.pts }));
const built = {};
for (const [name, s] of Object.entries(SAMPLES)) built[name] = buildCreature(strokesOf(s), { height: 1.5 });

test('distance transform is exact', () => {
  const f = new Uint8Array(64 * 64); f[32 * 64 + 32] = 1;
  const d = edt(f, 64, 64);
  ok(Math.abs(d[32 * 64 + 60] - 28) < 1e-6, `axis ${d[32 * 64 + 60]}`);
  ok(Math.abs(d[10 * 64 + 10] - Math.hypot(22, 22)) < 1e-4, `diagonal ${d[10 * 64 + 10]}`);
});

for (const name of Object.keys(SAMPLES)) {
  test(`${name}: closed, outward, sane`, () => {
    const d = built[name];
    ok(d, 'no creature built');
    const m = meshStats(d.positions, d.indices);
    ok(m.nan === 0, `${m.nan} NaN coords`);
    ok(m.open === 0, `${m.open} open edges`);
    ok(m.nonManifold <= m.edges * 0.01, `${m.nonManifold} non-manifold edges`);
    ok(m.volume > 0, `volume ${m.volume.toFixed(4)} (inward-facing)`);
    ok(d.stats.tris < 90000, `${d.stats.tris} tris`);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 1; i < d.positions.length; i += 3) { minY = Math.min(minY, d.positions[i]); maxY = Math.max(maxY, d.positions[i]); }
    ok(Math.abs(minY) < 1e-4 && Math.abs(maxY - 1.5) < 1e-3, `height ${minY.toFixed(3)}..${maxY.toFixed(3)}`);
    return `${d.stats.tris} tris · vol ${m.volume.toFixed(3)} m³ · ${d.stats.ms.total.toFixed(0)} ms`;
  });
}

test('potato: 4 legs, 2 drawn eyes, smile printed as a mark', () => {
  const d = built.potato;
  ok(!d.stub && d.feet.length === 4, `feet ${d.stub ? 'stub' : d.feet.length}`);
  ok(d.stats.drawnEyes === 2 && d.eyes.length === 2, `eyes ${d.stats.drawnEyes}`);
  ok(d.stats.marks === 1, `marks ${d.stats.marks}`);
});
test('blob: stub feet and auto eyes', () => {
  const d = built.blob;
  ok(d.stub, `feet ${d.feet.length}`);
  ok(d.stats.drawnEyes === 0 && d.eyes.length === 2, `eyes ${d.eyes.length}`);
});
test('octo: 6 tentacles touch the ground', () => {
  ok(built.octo.feet.length === 6, `feet ${built.octo.feet.length}`);
});
test('tall: 2 legs', () => { ok(built.tall.feet.length === 2, `feet ${built.tall.feet.length}`); });
test('an outline with a small gap still fills', () => {
  const pts = [];
  for (let i = 0; i <= 120; i++) { const t = 0.03 + (i / 120) * (Math.PI * 2 - 0.06); pts.push([500 + 300 * Math.cos(t), 500 + 300 * Math.sin(t)]); }
  const d = buildCreature([{ color: '#F05A4F', w: 16, pts }], { height: 1.5 });
  ok(d.depth > 0.9, `depth ${d.depth.toFixed(2)} m (a hollow ring would be thin)`);
});
test('a leg drawn short of the body still attaches', () => {
  const body = [];
  for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; body.push([500 + 260 * Math.cos(a), 420 + 170 * Math.sin(a)]); }
  const strokes = [
    { color: '#63B8D9', w: 16, pts: body },
    { color: '#63B8D9', w: 16, pts: [[400, 628], [390, 800]] },   // stops short of the belly
    { color: '#63B8D9', w: 16, pts: [[600, 585], [615, 800]] },   // touches
  ];
  const d = buildCreature(strokes, { height: 1.5 });
  ok(d.stats.attached >= 1, `attached ${d.stats.attached}`);
  ok(!d.stub && d.feet.length === 2, `feet ${d.stub ? 'stub' : d.feet.length}`);
});
test('round dots beat slashes for eyes', () => {
  const body = [];
  for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; body.push([500 + 300 * Math.cos(a), 500 + 260 * Math.sin(a)]); }
  const strokes = [
    { color: '#C98BE0', w: 16, pts: body },
    { color: '#3A3630', w: 26, pts: [[430, 430]] }, { color: '#3A3630', w: 26, pts: [[570, 430]] },
    { color: '#3A3630', w: 12, pts: [[330, 360], [350, 380]] },
  ];
  const d = buildCreature(strokes, { height: 1.5 });
  ok(d.stats.drawnEyes === 2, `eyes ${d.stats.drawnEyes}`);
  ok(d.stats.marks === 1, `marks ${d.stats.marks}`);
});
test('deterministic', () => {
  const a = buildCreature(strokesOf(SAMPLES.star)), b = buildCreature(strokesOf(SAMPLES.star));
  ok(a.positions.length === b.positions.length && a.positions.every((v, i) => v === b.positions[i]), 'positions differ');
});
test('speed: every sample builds in under 250 ms', () => {
  const worst = Math.max(...Object.values(built).map((d) => d.stats.ms.total));
  ok(worst < 250, `worst ${worst.toFixed(0)} ms`);
  return `worst ${worst.toFixed(0)} ms`;
});

const world = buildWorld();
test('island: the birth meadow is exactly flat', () => {
  for (let i = 0; i < 400; i++) {
    const a = i * 2.39996, r = SPAWN_R * Math.sqrt(i / 400), h = world.heightAt(r * Math.cos(a), r * Math.sin(a));
    ok(h === 0, `h ${h} at r ${r.toFixed(2)}`);
  }
});
test('island: surrounded by sea, with a beach and a hill', () => {
  let max = -Infinity;
  for (let x = -EXTENT; x <= EXTENT; x += 0.5) for (let z = -EXTENT; z <= EXTENT; z += 0.5) max = Math.max(max, world.heightAt(x, z));
  for (let a = 0; a < 64; a++) ok(world.heightAt(16 * Math.cos(a / 10.2), 16 * Math.sin(a / 10.2)) < WATER_Y - 0.4, 'land at the edge of the map');
  ok(max > 1.2 && max < 4, `highest point ${max.toFixed(2)} m`);
  return `highest ${max.toFixed(2)} m`;
});
test('island: props stand on dry land, off the meadow, not overlapping', () => {
  const { trees, bushes, rocks, flowers } = world.props;
  ok(trees.length >= 7 && bushes.length >= 5 && rocks.length >= 5 && flowers.length >= 30, `${trees.length} trees, ${bushes.length} bushes, ${rocks.length} rocks, ${flowers.length} flowers`);
  for (const o of world.obstacles) {
    ok(Math.hypot(o.x, o.z) > SPAWN_R + o.r, `${o.kind} on the meadow`);
    ok(world.heightAt(o.x, o.z) > WATER_Y - 0.2, `${o.kind} in the sea`);
  }
  for (let i = 0; i < world.obstacles.length; i++) for (let j = i + 1; j < world.obstacles.length; j++) {
    const a = world.obstacles[i], b = world.obstacles[j];
    ok(Math.hypot(a.x - b.x, a.z - b.z) > a.r + b.r, `${a.kind} overlaps ${b.kind}`);
  }
  for (const f of flowers) ok(f.y > WATER_Y, 'flower in the sea');
  return `${trees.length} trees · ${bushes.length} bushes · ${rocks.length} rocks · ${flowers.length} flowers`;
});
test('island: nothing tall blocks the camera in front of the creature', () => {
  for (const p of [...world.props.trees, ...world.props.bushes]) ok(!world.inFront(p.x, p.z), `prop at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
});
test('island: almost all dry land is reachable on foot from the meadow', () => {
  const r = reachable(world);
  ok(r.reached / r.total > 0.95, `${r.reached}/${r.total} cells`);
  ok(r.area > 150, `walkable area ${r.area} m²`);
  return `${r.area.toFixed(0)} m² walkable · ${(100 * r.reached / r.total).toFixed(0)}% reachable`;
});
test('island: deterministic and quick', () => {
  const b = buildWorld();
  ok(b.obstacles.length === world.obstacles.length && b.obstacles.every((o, i) => o.x === world.obstacles[i].x), 'props differ');
  ok(b.heightAt(5.3, -4.1) === world.heightAt(5.3, -4.1), 'heights differ');
  ok(b.ms < 150, `${b.ms.toFixed(0)} ms`);
  return `${b.ms.toFixed(0)} ms`;
});

const rigs = {};
for (const name of ['potato', 'octo', 'tall', 'blob', 'beetle', 'centipede']) { const d = built[name]; rigs[name] = legRig(d.positions, d.stub ? [] : d.feet, d.height); }
test('legs: every drawn leg gets its own swinging vertices', () => {
  const notes = [];
  for (const [name, want] of [['potato', 4], ['octo', 6], ['tall', 2], ['beetle', 6], ['centipede', 12]]) {
    const r = rigs[name], h = built[name].height;
    ok(r.legs.length === want, `${name}: ${r.legs.length} legs`);
    ok(r.hipY > h * 0.08 && r.hipY < h * 0.6, `${name}: hip at ${(r.hipY / h).toFixed(2)} of the height`);
    const per = new Array(want).fill(0);
    for (const k of r.legOf) if (k) per[k - 1]++;
    ok(per.every((c) => c > 20), `${name}: leg vertex counts ${per}`);
    notes.push(`${name} hip ${(r.hipY / h * 100).toFixed(0)}%`);
  }
  ok(rigs.blob.legs.length === 0 && !rigs.blob.legOf.some((k) => k), 'blob grew legs');
  return notes.join(' · ');
});
test('legs: the body never bends above the hips', () => {
  for (const name of ['potato', 'octo', 'tall', 'beetle', 'centipede']) {
    const d = built[name], r = rigs[name];
    for (let v = 0; v < r.legOf.length; v++) if (r.legOf[v]) ok(d.positions[v * 3 + 1] < r.hipY, `${name}: vertex above the hip is a leg`);
  }
});
test('gait: each leg count gets its own animal gait', () => {
  const g = (name) => gaitFor(rigs[name], 1.5, built[name].stub);
  const want = { tall: 'walk', potato: 'trot', beetle: 'tripod', centipede: 'wave', blob: 'hop' };
  for (const [name, gaitName] of Object.entries(want)) ok(g(name).name === gaitName, `${name} gait ${g(name).name}`);
  // Feet never skate: in one planted stretch the body covers exactly one stride.
  for (const name of ['tall', 'potato', 'beetle', 'centipede']) {
    const q = g(name);
    ok(Math.abs(q.speed * q.duty / q.freq - q.stride) < 1e-9, `${name}: feet would skate`);
  }
  return Object.keys(want).map((n) => `${n} ${g(n).name}`).join(' · ');
});
test('gait: enough feet stay on the ground at every moment', () => {
  const notes = [];
  for (const [name, min] of [['tall', 1], ['potato', 2], ['beetle', 3], ['centipede', 7]]) {
    const q = gaitFor(rigs[name], 1.5, false), n = q.offsets.length;
    let least = n;
    for (let i = 0; i < 400; i++) {
      let down = 0;
      for (let k = 0; k < n; k++) if (inStance(q, k, i / 400)) down++;
      least = Math.min(least, down);
    }
    ok(least >= min, `${name}: only ${least} of ${n} feet down at some moment`);
    notes.push(`${name} ≥${least}/${n}`);
  }
  // Tripod: each lifting set is every other leg, so three stay down on alternating sides.
  const b = gaitFor(rigs.beetle, 1.5, false), order = rigs.beetle.legs.map((l, k) => [l.x, k]).sort((x, y) => x[0] - y[0]).map((p) => p[1]);
  ok(order.every((k, i) => b.offsets[k] === (i % 2) * 0.5), 'beetle is not a tripod');
  return notes.join(' · ');
});
test('knees: inverse kinematics puts the foot exactly on its target', () => {
  const a = 0.4, b = 0.4;
  for (const [dy, dz] of [[-0.8, 0], [-0.6, 0.2], [-0.5, -0.25], [-0.45, 0.4], [-0.7, -0.1]]) {
    const s = solveLeg(dy, dz, a, b);
    const ky = -a * Math.cos(s.hip), kz = a * Math.sin(s.hip);
    const fy = ky - b * Math.cos(s.hip + s.knee), fz = kz + b * Math.sin(s.hip + s.knee);
    ok(Math.hypot(fy - dy, fz - dz) < 1e-3, `foot off by ${Math.hypot(fy - dy, fz - dz).toFixed(4)} m for ${dy}, ${dz}`);
    ok(s.knee <= 1e-9, 'knee bent backwards');
  }
  const far = solveLeg(-2, 0, a, b);
  ok(!far.reach && Math.abs(far.knee) < 0.1, 'an out-of-reach foot should straighten the leg');
});
test('walking: paths go round trees and never into the sea', () => {
  const nav = createNav(world, 0.6);
  ok(nav.walkable(0, 0), 'birth spot is not walkable');
  let longest = 0;
  for (const tr of world.props.trees) {
    const goal = nav.nearestWalkable({ x: tr.x, z: tr.z });
    const p = nav.path({ x: 0, z: 0 }, goal);
    ok(p && p.length, `no path to the tree at ${tr.x.toFixed(1)}, ${tr.z.toFixed(1)}`);
    let prev = { x: 0, z: 0 }, len = 0;
    for (const q of p) {
      ok(nav.clear(prev, q), 'a straight hop crosses blocked ground');
      for (let s = 0; s <= 20; s++) {
        const x = prev.x + (q.x - prev.x) * s / 20, z = prev.z + (q.z - prev.z) * s / 20;
        ok(world.isDry(x, z, 0.05), 'path wades into the sea');
        for (const o of world.obstacles) ok(Math.hypot(o.x - x, o.z - z) > o.r, `path walks through a ${o.kind}`);
      }
      len += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q;
    }
    longest = Math.max(longest, len);
  }
  const wet = nav.path({ x: 0, z: 0 }, { x: 0, z: 15 });
  ok(wet && world.isDry(wet[wet.length - 1].x, wet[wet.length - 1].z, 0.05), 'a tap on the sea should stop at the shore');
  return `longest walk ${longest.toFixed(1)} m`;
});

const pass = results.every((r) => r.pass);
document.title = pass ? 'ALL PASS' : 'FAIL';
document.getElementById('out').innerHTML =
  `<h1 class="${pass ? 'p' : 'f'}">${pass ? 'ALL PASS' : 'FAIL'} · ${results.filter((r) => r.pass).length}/${results.length}</h1>` +
  results.map((r) => `<div class="${r.pass ? 'p' : 'f'}">${r.pass ? '✓' : '✗'} ${r.name}<span>${r.note}</span></div>`).join('');
