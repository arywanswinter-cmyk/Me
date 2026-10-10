// sim.mjs — headless creature simulation for Node tools: recipe → shape → mesh (main-thread mesher) → rig → parts → locomotion.
// Exports: simCreature(recipe, { ground, stats }) -> { shape, res, rig, roles, parts, loco, minY }.
// Invariants: same modules as the browser (no DOM, no WebGL); deterministic; minY is the lowest point of skin and parts,
//   exactly as the creature computes it, so the feet start on the ground.
import { buildShape, limbRoles, setHingeSource } from '../src/geo/shape.js';
import { jobInput, runJob } from '../src/geo/mesher.js';
import { createRig } from '../src/rig/skeleton.js';
import { skinAnchors } from '../src/rig/anchors.js';
import { createLocomotion } from '../src/anim/locomotion.js';
import { assembleParts, partHinges } from '../src/parts/assemble.js';
import { PART } from '../src/catalog/parts.js';
import { flightInfo, meshVolume } from '../src/anim/flight.js';
setHingeSource(partHinges);

export function simCreature(recipe, { ground, stats } = {}) {
  const shape = buildShape(recipe, PART);
  const res = runJob(jobInput(shape, 1), 'full');
  const roles = limbRoles(shape, res.minY, PART);
  const rig = createRig(shape, roles);
  rig.setAnchors(skinAnchors(shape, res));
  const parts = assembleParts(shape, rig.skeleton, {}, { partDefs: PART, skinRes: res });
  let pMin = Infinity;
  for (const m of Object.values(parts.meshes)) { const a = m.geometry.attributes.position.array; for (let i = 1; i < a.length; i += 3) if (a[i] < pMin) pMin = a[i]; }
  const minY = Math.min(res.minY, pMin);
  const c = { rig, shape, roles, minY, parts };
  const flight = flightInfo(shape, PART, meshVolume(res.position, res.index));
  const loco = createLocomotion(c, { ground, stats, flight });
  return { shape, res, rig, roles, parts, loco, minY, flight };
}
