// bench-sim.mjs — headless motion bench (items 28, 29, 30): slide test on flat ground (walk and run, 10 m after 2 s of
//   acceleration), a 1.5 m-radius circle (2 laps at walk), a 360° turn in place, and legless 10 m runs.
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DT = 1 / 60;
const args = process.argv.slice(2);
const oi = args.indexOf('--only'), only = oi >= 0 ? args[oi + 1].split(',') : null;
const SLIDE = [['biped', FIXTURES.biped], ['quad', FIXTURES.quad], ['hexapod', FIXTURES.hexapod], ['octopod', FIXTURES.octopod], ['tripod', FIXTURES.tripod],
  ['peepsy', STARTERS.peepsy], ['trundle', STARTERS.trundle], ['skitter', STARTERS.skitter], ['clatter', STARTERS.clatter], ['flapjack', STARTERS.flapjack], ['octoboop', STARTERS.octoboop]]
  .filter(([n]) => !only || only.includes(n));
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
const out = path.join(HERE, `out/bench-sim${process.env.BENCH_TAG || ''}.json`);
const prev = fs.existsSync(out) && only ? JSON.parse(fs.readFileSync(out, 'utf8')).rows.filter((r) => !rows.some((q) => q.creature === r.creature && q.kind === r.kind)) : [];
const all = [...prev, ...rows];
fs.writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), rows: all, pass28: all.filter((r) => ['walk', 'run'].includes(r.kind)).every((r) => r.pass),
  pass29: all.filter((r) => ['circle', 'turn'].includes(r.kind)).every((r) => r.pass), pass30: all.filter((r) => r.kind === 'legless').every((r) => r.pass) }, null, 1));
console.log(`BENCH ${all.filter((r) => r.pass).length}/${all.length}`);
