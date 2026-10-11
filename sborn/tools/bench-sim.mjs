// bench-sim.mjs — headless motion bench (items 28, 29, 30, 40): slide test on flat ground (walk and run, 10 m after 2 s of
//   acceleration), a 1.5 m-radius circle (2 laps at walk), a 360° turn in place, legless 10 m runs, the island bench path
//   (report-only: fails on NaN or penetration > 1 cm) and the island step-time bench (one creature, High, p95 ≤ 2 ms).
// Exports: nothing (CLI: node --import ./sborn/tools/three-hooks.mjs sborn/tools/bench-sim.mjs [--only name,…]);
//   writes tools/out/bench-sim.json (the creature × speed × surface table) and prints one line per row.
// Invariants: 60 Hz fixed steps, same modules as the game; thresholds copied from tests/thresholds.js; per stance:
//   drift = max XZ distance of the contact point from touchdown, penetration = max(0, ground − contact),
//   air gap = max(0, contact − ground); reach-limited stances may be excluded up to 2% (count reported).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simCreature } from './sim.mjs';
import { FIXTURES } from '../src/catalog/fixtures.js';
import { STARTERS } from '../src/catalog/starters.js';
import { T } from '../tests/thresholds.js';
import * as THREE from 'three';
import { islandGround, BENCH_PATH, createIsland, createIslandMaterials } from '../src/play/island.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DT = 1 / 60;
const args = process.argv.slice(2);
const oi = args.indexOf('--only'), only = oi >= 0 ? args[oi + 1].split(',') : null;
const SLIDE_ALL = [['biped', FIXTURES.biped], ['quad', FIXTURES.quad], ['hexapod', FIXTURES.hexapod], ['octopod', FIXTURES.octopod], ['tripod', FIXTURES.tripod],
  ['peepsy', STARTERS.peepsy], ['trundle', STARTERS.trundle], ['skitter', STARTERS.skitter], ['clatter', STARTERS.clatter], ['flapjack', STARTERS.flapjack], ['octoboop', STARTERS.octoboop]];
const SLIDE = SLIDE_ALL.filter(([n]) => !only || only.includes(n));
const pct = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

function judge(name, kind, loco, extra = {}) {
  const st = loco.metrics.stances, n = st.length;
  const legLen = Math.max(...loco.legs.map((l) => l.reachLen));
  const reach = st.filter((x) => x.reach).length;
  const excl = reach <= Math.floor(T.reachLimitedFrac * n) ? reach : 0;
  const use = excl ? st.filter((x) => !x.reach) : st;
  const drift = use.map((x) => x.drift * 1000), pen = use.map((x) => x.pen * 1000), gap = use.map((x) => x.gap * 1000);
  const rel = legLen < 0.3 || legLen > 1.0;
  const row = { creature: name, kind, surface: 'flat', legLen: +legLen.toFixed(3), stances: n, reachLimited: reach, excluded: excl,
    driftP95: +pct(drift, 0.95).toFixed(2), driftMax: +Math.max(0, ...drift).toFixed(2), penP95: +pct(pen, 0.95).toFixed(2), penMax: +Math.max(0, ...pen).toFixed(2),
    gapMax: +Math.max(0, ...gap).toFixed(2), minPlantedViolations: loco.metrics.minPlantedViolations, gaits: Object.keys(loco.metrics.gaitSteps).join('+'), ...extra };
  const fails = [];
  if (rel) { if (row.driftP95 > T.slideLegPctP95 * legLen * 1000) fails.push('drift p95 %'); if (row.driftMax > T.slideLegPctMax * legLen * 1000) fails.push('drift max %'); }
  else { if (row.driftP95 > T.slideDriftP95Mm) fails.push('drift p95'); if (row.driftMax > T.slideDriftMaxMm) fails.push('drift max'); }
  if (row.penP95 > T.penetrationP95Mm) fails.push('penetration');
  if (row.gapMax > T.airGapMm) fails.push('air gap');
  if (row.minPlantedViolations) fails.push('min planted');
  if (reach > Math.floor(T.reachLimitedFrac * n)) fails.push(`reach-limited ${reach}/${n}`);
  if (!n) fails.push('no stances');
  row.pass = fails.length === 0; row.fails = fails;
  return row;
}
// lowest skinned skin vertex above the ground (rig space y − minY), skinned on the CPU like the GPU does
function lowestSkinY(s) {
  const { res, rig } = s, P = res.position, SI = res.skinIndex, SW = res.skinWeight, R = rig.rest;
  let lo = Infinity;
  for (let v = 0; v < P.length / 3; v += 2) {
    let y = 0;
    for (let k = 0; k < 4; k++) { const w = SW[v * 4 + k] / 255; if (!w) continue; const b = SI[v * 4 + k], e = rig.world[b].elements;
      const x0 = P[v * 3] - R[b * 3], y0 = P[v * 3 + 1] - R[b * 3 + 1], z0 = P[v * 3 + 2] - R[b * 3 + 2]; y += w * (e[1] * x0 + e[5] * y0 + e[9] * z0 + e[13]); }
    if (y < lo) lo = y;
  }
  return lo - s.minY;
}
function nanCheck(rig) { for (const m of rig.world) for (const e of m.elements) if (!Number.isFinite(e)) return true; return false; }

const rows = [];
const log = (r) => { rows.push(r); console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.creature.padEnd(9)} ${r.kind.padEnd(6)} drift p95 ${r.driftP95} max ${r.driftMax} pen ${r.penP95} gap ${r.gapMax} stances ${r.stances} reach ${r.reachLimited} ${r.gaits} ${(r.fails || []).join(', ')}`); };

for (const [name, recipe] of SLIDE) {
  // slide test: walk and run, measured over 10 m after 2 s of acceleration
  for (const kind of ['walk', 'run']) {
    const s = simCreature(recipe), L = s.loco;
    L.setMove(0, 1, 1, kind === 'run');
    for (let i = 0; i < 2 / DT; i++) L.step(DT);
    L.metrics.stances.length = 0; L.metrics.reachLimited = 0; L.metrics.minPlantedViolations = 0; L.metrics.gaitSteps = {};
    const z0 = L.state.z; let steps = 0, nan = false;
    while (L.state.z - z0 < T.slideDistM && steps < 20000) { L.step(DT); steps++; if (steps % 60 === 0 && nanCheck(s.rig)) { nan = true; break; } }
    const r = judge(name, kind, L, { steps });
    if (nan) { r.pass = false; r.fails.push('NaN'); }
    log(r);
  }
  // circle: 1.5 m radius, 2 laps at walk (steer along the tangent with a radial correction)
  {
    const s = simCreature(recipe), L = s.loco, R = T.circleR;
    L.state.x = R; L.resetFeet();
    let ang = 0, prev = Math.atan2(L.state.z, L.state.x), steps = 0;
    while (ang < T.circleLaps * 2 * Math.PI && steps < 30000) {
      const a = Math.atan2(L.state.z, L.state.x), r = Math.hypot(L.state.x, L.state.z);
      let tx = -Math.sin(a), tz = Math.cos(a); const k = (R - r) * 2; tx += Math.cos(a) * k; tz += Math.sin(a) * k;
      const l = Math.hypot(tx, tz); L.setMove(tx / l, tz / l, 1, false); L.step(DT); steps++;
      let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; ang += d; prev = a;
    }
    log(judge(name, 'circle', L, { steps }));
  }
  // 360° turn in place
  {
    const s = simCreature(recipe), L = s.loco;
    let steps = 0; const y0 = L.state.yaw;
    while (L.state.yaw - y0 < 2 * Math.PI && steps < 6000) { L.setTurn(L.state.yaw + 0.6); L.step(DT); steps++; }
    L.setTurn(null); for (let i = 0; i < 90; i++) L.step(DT);
    log(judge(name, 'turn', L, { steps }));
  }
}
// legless: snake and blob cover 10 m in ≤ 1,500 steps; lowest skin vertex never > 1 cm below ground
for (const name of ['snake', 'blob']) {
  if (only && !only.includes(name)) continue;
  const s = simCreature(FIXTURES[name]), L = s.loco;
  L.setMove(0, 1, 1, false);
  let steps = 0, sink = 0, nan = false;
  while (L.state.z < T.slideDistM && steps < 3000) { L.step(DT); steps++; if (steps % 3 === 0) sink = Math.max(sink, -lowestSkinY(s)); if (nanCheck(s.rig)) { nan = true; break; } }
  const r = { creature: name, kind: 'legless', surface: 'flat', steps, z: +L.state.z.toFixed(2), sinkMm: +(sink * 1000).toFixed(2), gaits: Object.keys(L.metrics.gaitSteps).join('+') };
  r.fails = []; if (steps > T.legless10mSteps) r.fails.push(`steps ${steps}`); if (sink > T.leglessSinkM) r.fails.push(`sink ${r.sinkMm} mm`); if (nan) r.fails.push('NaN');
  r.pass = !r.fails.length;
  rows.push(r); console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${name.padEnd(9)} legless steps ${steps} z ${r.z} sink ${r.sinkMm} mm ${r.gaits} ${r.fails.join(', ')}`);
}
// island bench path (item 28 island report): walk and run along the path over the real terrain
const IG = islandGround();
function walkPath(L, run, onStep) {
  let wi = 1, steps = 0, nan = false;
  while (wi < BENCH_PATH.length && steps < 30000) {
    const [tx, tz] = BENCH_PATH[wi], dx = tx - L.state.x, dz = tz - L.state.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { wi++; continue; }
    L.setMove(dx / d, dz / d, 1, run); L.step(DT); steps++;
    if (onStep) onStep(steps);
    if (steps % 60 === 0 && !Number.isFinite(L.state.x + L.state.z + L.state.bodyY)) { nan = true; break; }
  }
  return { steps, nan, done: wi >= BENCH_PATH.length };
}
if (!only || only.includes('island')) for (const [name, recipe] of SLIDE_ALL) {
  for (const kind of ['walk', 'run']) {
    const s = simCreature(recipe, { ground: IG }), L = s.loco;
    L.state.x = BENCH_PATH[0][0]; L.state.z = BENCH_PATH[0][1]; L.resetFeet();
    const w = walkPath(L, kind === 'run');
    const r = judge(name, kind, L, { surface: 'island', steps: w.steps, reportOnly: true });
    r.fails = [...(w.nan || nanCheck(s.rig) ? ['NaN'] : []), ...(r.penMax > 10 ? ['penetration > 1 cm'] : []), ...(w.done ? [] : ['path not finished'])];
    r.pass = !r.fails.length;
    log(r);
  }
}
// item 40: one creature on the island bench path at High: 180 warm-up + 1,800 steps, simulation + scene update timed
let bench40 = null;
if (!only || only.includes('island40')) {
  const s = simCreature(STARTERS.trundle, { ground: IG }), L = s.loco;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xffffff, 1e6, 2e6);
  const lights = { key: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(), rim: new THREE.DirectionalLight(), kick: new THREE.DirectionalLight(), enabled: true };
  const isl = createIsland({ scene, lights }, createIslandMaterials(), { tier: 'high' });
  isl.enter();
  const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 400), focus = new THREE.Vector3(), body = { x: 0, y: 0, z: 0, r: 0.4, vx: 0, vz: 0, charge: 1 }, feet = [];
  L.state.x = BENCH_PATH[0][0]; L.state.z = BENCH_PATH[0][1]; L.resetFeet();
  const times = []; let n = 0, wi = 1;
  while (n < 180 + 1800) {
    const t0 = performance.now();
    const [tx, tz] = BENCH_PATH[wi], dx = tx - L.state.x, dz = tz - L.state.z, d = Math.hypot(dx, dz);
    if (d < 0.4) wi = wi + 1 < BENCH_PATH.length ? wi + 1 : 1;
    L.setMove(dx / (d || 1), dz / (d || 1), 1, false); s.rig.toRest(); L.step(DT);
    feet.length = 0; for (const l of L.legs) if (l.planted && feet.length < 4) feet.push(l.lock);
    body.x = L.state.x; body.z = L.state.z; body.y = L.state.bodyY + 0.3; body.vx = L.state.vx; body.vz = L.state.vz;
    cam.position.set(L.state.x, L.state.bodyY + 1.2, L.state.z - 2.5); cam.lookAt(L.state.x, L.state.bodyY + 0.3, L.state.z); cam.updateMatrixWorld();
    isl.update(DT, { cam, feet, body, creaturePos: { x: L.state.x, z: L.state.z } });
    focus.set(L.state.x, L.state.bodyY, L.state.z); isl.placeSun(focus, 0.8);
    s.rig.apply && s.rig.apply();
    const ms = performance.now() - t0;
    if (n >= 180) times.push(ms);
    n++;
  }
  bench40 = { creature: 'trundle', tier: 'high', steps: times.length, p50: +pct(times, 0.5).toFixed(3), p95: +pct(times, 0.95).toFixed(3), max: +Math.max(...times).toFixed(3) };
  bench40.pass = bench40.p95 <= 2;
  console.log(`${bench40.pass ? 'ok  ' : 'FAIL'} island40 trundle High p50 ${bench40.p50} p95 ${bench40.p95} max ${bench40.max} ms`);
}
const out = path.join(HERE, `out/bench-sim${process.env.BENCH_TAG || ''}.json`);
const prev = fs.existsSync(out) && only ? JSON.parse(fs.readFileSync(out, 'utf8')).rows : [];
const all = [...prev.filter((r) => !rows.some((q) => q.creature === r.creature && q.kind === r.kind && (q.surface || 'flat') === (r.surface || 'flat'))), ...rows];
const prevJ = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
fs.writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), rows: all, pass28: all.filter((r) => ['walk', 'run'].includes(r.kind) && (r.surface || 'flat') === 'flat').every((r) => r.pass), island28: all.filter((r) => r.surface === 'island').every((r) => r.pass), bench40: bench40 || prevJ.bench40 || null,
  pass29: all.filter((r) => ['circle', 'turn'].includes(r.kind)).every((r) => r.pass), pass30: all.filter((r) => r.kind === 'legless').every((r) => r.pass) }, null, 1));
console.log(`BENCH ${all.filter((r) => r.pass).length}/${all.length}`);
