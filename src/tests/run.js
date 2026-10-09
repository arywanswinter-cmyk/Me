// run.js — headless geometry tests (no WebGL). Open tests.html; the page title becomes "ALL PASS" or "FAIL".
// Exports: nothing. Invariant: every sample doodle must build a closed, outward-facing, NaN-free mesh.
import { buildCreature, meshStats } from '../geo/pipeline.js';
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

const pass = results.every((r) => r.pass);
document.title = pass ? 'ALL PASS' : 'FAIL';
document.getElementById('out').innerHTML =
  `<h1 class="${pass ? 'p' : 'f'}">${pass ? 'ALL PASS' : 'FAIL'} · ${results.filter((r) => r.pass).length}/${results.length}</h1>` +
  results.map((r) => `<div class="${r.pass ? 'p' : 'f'}">${r.pass ? '✓' : '✗'} ${r.name}<span>${r.note}</span></div>`).join('');
