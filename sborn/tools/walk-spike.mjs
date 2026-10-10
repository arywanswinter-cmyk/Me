// walk-spike.mjs — M1 walk spike: the quad fixture walks 10 m on flat ground; reports foot drift.
// Exports: nothing (CLI: node --import ./sborn/tools/three-hooks.mjs sborn/tools/walk-spike.mjs [fixture]).
// Invariants: 60 Hz fixed steps; drift per stance = max XZ distance of the contact point from touchdown.
import { simCreature } from './sim.mjs';
import { FIXTURES } from '../src/catalog/fixtures.js';
const name = process.argv[2] || 'quad';
const s = simCreature(FIXTURES[name]);
const { loco } = s;
let steps = 0;
loco.setMove(0, 1, 1, false);
while (loco.state.z < 10 + 0 && steps < 6000) { loco.step(1 / 60); steps++; }
const st = loco.metrics.stances.map((x) => x.drift * 1000).sort((a, b) => a - b);
const p95 = st[Math.floor(st.length * 0.95)] || 0;
console.log(JSON.stringify({ fixture: name, roles: s.roles, L: +loco.L.toFixed(3), walk: +loco.speeds.walk.toFixed(3), steps, z: +loco.state.z.toFixed(2), x: +loco.state.x.toFixed(3),
  stances: st.length, driftP95mm: +p95.toFixed(2), driftMaxmm: +(st[st.length - 1] || 0).toFixed(2), reachLimited: loco.metrics.reachLimited,
  pen: +Math.max(...loco.metrics.stances.map((x) => x.pen * 1000)).toFixed(2), gap: +Math.max(...loco.metrics.stances.map((x) => x.gap * 1000)).toFixed(2), gaits: loco.metrics.gaitSteps, minViol: loco.metrics.minPlantedViolations }));
