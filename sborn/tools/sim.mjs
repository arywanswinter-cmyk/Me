// sim.mjs — headless creature simulation for Node tools: recipe → shape → mesh (main-thread mesher) → rig → locomotion.
// Exports: simCreature(recipe, { ground, stats }) -> { shape, res, rig, roles, loco, minY }.
// Invariants: same modules as the browser (no DOM, no WebGL); deterministic.
import { buildShape, limbRoles } from '../src/geo/shape.js';
import { jobInput, runJob } from '../src/geo/mesher.js';
import { createRig } from '../src/rig/skeleton.js';
import { createLocomotion } from '../src/anim/locomotion.js';
import { PART } from '../src/catalog/parts.js';

export function simCreature(recipe, { ground, stats } = {}) {
  const shape = buildShape(recipe, PART);
  const res = runJob(jobInput(shape, 1), 'full');
  const roles = limbRoles(shape, res.minY, PART);
  const rig = createRig(shape, roles);
  const c = { rig, shape, roles, minY: res.minY };
  const loco = createLocomotion(c, { ground, stats });
  return { shape, res, rig, roles, loco, minY: res.minY };
}
