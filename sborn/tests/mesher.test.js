// mesher.test.js — skin meshes: closed fixtures, determinism (3 builds, main thread vs worker), client protocol, timings.
// Exports: nothing (registers tests). Invariants: uses the real worker; timings are worker-internal ms in this container.
import { test, ok, T, metric } from './harness.js';
import { buildShape } from '../src/geo/shape.js';
import { jobInput, runJob, meshStats } from '../src/geo/mesher.js';
import { createMesher } from '../src/geo/mesher-client.js';
import { FIXTURES, FIXTURE_NAMES } from '../src/catalog/fixtures.js';
import { PART } from '../src/catalog/parts.js';
import { fnv1aFloats, fnv1aBytes } from '../src/core/hash.js';

const inputs = {};
for (const n of FIXTURE_NAMES) inputs[n] = jobInput(buildShape(FIXTURES[n], PART), 1);
const geoHash = (r) => fnv1aBytes(new Uint8Array(r.index.buffer), fnv1aFloats(r.position));

test('C07.fixtures', '12 fixtures: 0 open edges, 0 NaN, non-manifold ≤ 1%, volume > 0, Full ≤ 40k triangles', { milestone: 1, items: [7] }, () => {
  ok(FIXTURE_NAMES.length === T.fixtures, `${FIXTURE_NAMES.length} fixtures`);
  const notes = [];
  for (const n of FIXTURE_NAMES) {
    const r = runJob(inputs[n], 'full');
    const m = meshStats(r.position, r.index);
    ok(m.open === 0, `${n}: ${m.open} open edges`);
    ok(m.nan === 0, `${n}: NaN`);
    ok(m.nonManifold <= T.nonManifoldFrac * m.edges, `${n}: non-manifold ${m.nonManifold}`);
    ok(m.volume > 0, `${n}: volume ${m.volume}`);
    ok(r.nt <= T.skinMaxTris, `${n}: ${r.nt} triangles`);
    notes.push(`${n} ${r.nt}`);
  }
  return notes.join(', ');
});

function worker() {
  const got = [];
  const m = createMesher({ onResult: (res, meta) => got.push({ res, meta }) });
  return { m, got };
}
test('C09.geometry-hash', 'geometry hashes identical across 3 builds and main thread vs worker', { milestone: 1, items: [9] }, async () => {
  for (const n of ['quad', 'max40', 'snake']) {
    const a = geoHash(runJob(inputs[n], 'full')), b = geoHash(runJob(inputs[n], 'full'));
    const s2 = jobInput(buildShape(FIXTURES[n], PART), 1);
    const c = geoHash(runJob(s2, 'full'));
    ok(a === b && b === c, `${n}: builds differ ${a} ${b} ${c}`);
    const { m, got } = worker();
    m.request('full', 'full', s2);
    await m.idle();
    m.dispose();
    ok(got.length === 1 && geoHash(got[0].res) === a, `${n}: worker differs`);
  }
});
test('C64.client', 'mesher client: 50 preview requests in 100 ms apply ≤ 50, last applied = last requested, stale dropped; Full follows', { milestone: 1, items: [64] }, async () => {
  const { m, got } = worker();
  const t0 = performance.now();
  let last = 0;
  for (let i = 0; i < 50; i++) { last = m.request('preview', 'preview', inputs.biped); while (performance.now() - t0 < i * 2) { /* spread over 100 ms */ } }
  await m.idle();
  const ids = got.map((g) => g.meta.jobId);
  ok(got.length <= 50, `applied ${got.length}`);
  ok(ids[ids.length - 1] === last, `last applied ${ids[ids.length - 1]} vs ${last}`);
  ok(ids.every((x, i) => i === 0 || x > ids[i - 1]), 'monotonic');
  const fid = m.request('full', 'full', inputs.biped);
  await m.idle();
  ok(got[got.length - 1].meta.jobId === fid && got[got.length - 1].res.skinWeight, 'full applied with weights');
  m.dispose();
  return `${got.length - 1} previews applied of 50, dropped ${m.stats.dropped}`;
});
test('C08.remesh-timing', 'remesh timings on the 40-part fixture (50 each, worker-internal)', { milestone: 1, items: [8], timeout: 600000 }, async () => {
  const { m, got } = worker();
  const run = async (q) => {
    const ms = [], rt = [];
    for (let i = 0; i < 5; i++) { m.request(q, q, inputs.max40); await m.idle(); }   // warm-up (the game warms behind the hatch)
    for (let i = 0; i < T.remeshSamples; i++) { const t0 = performance.now(); m.request(q, q, inputs.max40); await m.idle(); rt.push(performance.now() - t0); ms.push(got[got.length - 1].res.ms.worker); }
    const s = (a) => a.slice().sort((x, y) => x - y);
    const p = (a, f) => s(a)[Math.min(a.length - 1, Math.floor(f * a.length))];
    return { p50: +p(ms, 0.5).toFixed(1), p95: +p(ms, 0.95).toFixed(1), max: +p(ms, 1).toFixed(1), roundTripP95: +p(rt, 0.95).toFixed(1), n: ms.length, nv: got[got.length - 1].res.nv };
  };
  const preview = await run('preview'), full = await run('full');
  m.dispose();
  const pass = preview.p95 <= T.previewP95Ms && full.p95 <= T.fullP95Ms;
  metric('remesh', { pass, value: `preview p95 ${preview.p95} ms, full p95 ${full.p95} ms (round trip p95 ${preview.roundTripP95}/${full.roundTripP95} ms); M1 Air estimate ×0.5–0.7: full ${(full.p95 * 0.5).toFixed(0)}–${(full.p95 * 0.7).toFixed(0)} ms`,
    threshold: `preview p95 ≤ ${T.previewP95Ms}, full p95 ≤ ${T.fullP95Ms} ms`, unit: 'ms', method: '50 jobs each, 40-part fixture, worker-internal, 4 vCPU software-GL container', preview, full });
  return JSON.stringify({ preview, full });
});
