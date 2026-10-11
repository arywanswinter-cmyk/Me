// warmup.js — compiles every material variant behind the hatch: skinned skin, preview skin, skinned parts (skin, membrane,
//   eye, hard, shell), shadow depth, contact shadow, post and the vertex bake, then renders one shadowed frame into 1×1.
// Exports: WARM_RECIPE, warmUp({ stage, mats, partDefs, contact, extra }) -> Promise<{ programs, ms }>.
// Invariants: idea from Doodle World src/stage.js (compile up front so the first use never stalls); leaves the scene as it
//   found it; after it runs, the program count must not grow (item 37).
import * as THREE from 'three';
import { buildShape, limbRoles } from '../geo/shape.js';
import { jobInput, runJob } from '../geo/mesher.js';
import { createRig } from '../rig/skeleton.js';
import { assembleParts } from '../parts/assemble.js';
import { geometryFrom } from './creature.js';
import { bakeVertexColors } from './bake.js';

// A tiny creature that uses every part material kind.
export const WARM_RECIPE = {
  v: 1, app: 'sborn', name: 'warm', seed: 7,
  spine: { v: [[0.4, -0.3, 0.15], [0.42, 0, 0.22], [0.42, 0.3, 0.18]] },
  limbs: [{ id: 'L1', at: { b: 'spine', u: 0.5, d: [0.6, -0.8, 0] }, m: 1, j: [[0, 0, 0, 0.06], [0.05, -0.2, 0.03, 0.05], [0.06, -0.38, 0, 0.045]], k: 1 }],
  parts: [
    { id: 'P1', t: 'mouth.grin', at: { b: 'spine', u: 0.97, d: [0, -0.2, 0.98], tw: 0 }, sc: 1, m: 0, p: {}, tint: 'skin' },
    { id: 'P2', t: 'eye.moon', at: { b: 'spine', u: 0.9, d: [0.4, 0.5, 0.76], tw: 0 }, sc: 1, m: 1, p: {}, tint: 'natural' },
    { id: 'P3', t: 'det.nubhorn', at: { b: 'spine', u: 0.8, d: [0.3, 0.95, 0], tw: 0 }, sc: 1, m: 1, p: {}, tint: 'detail' },
    { id: 'P4', t: 'wing.leaf', at: { b: 'spine', u: 0.5, d: [0.9, 0.4, 0], tw: 0 }, sc: 1, m: 1, p: {}, tint: 'skin' },
    { id: 'P5', t: 'foot.nub', at: { b: 'L1', tip: 1 }, sc: 1, m: 1, p: {}, tint: 'skin' },
  ],
  paint: { skin: 'smooth', base: { c: '#ff8fb1', pat: 'solid', sc: 1 }, coat: { c: '#6c8cff', pat: 'stripes', sc: 1, amt: 0.5, mask: 'all' }, detail: { c: '#ffd23f', pat: 'spots', sc: 1, amt: 0.5, mask: 'all' }, iris: '#7fc8ff' },
  meta: {},
};

export async function warmUp({ stage, mats, partDefs, contact, extra = [] }) {
  const t0 = performance.now();
  const { renderer, scene, camera } = stage;
  const sh = buildShape(WARM_RECIPE, partDefs);
  const res = runJob(jobInput(sh, 1), 'full'), prev = runJob(jobInput(sh, 1), 'preview');
  const rig = createRig(sh, limbRoles(sh, res.minY, partDefs));
  const group = new THREE.Group(); group.name = 'warm';
  group.add(rig.rigRoot);
  const skin = new THREE.SkinnedMesh(geometryFrom(res), mats.skin); skin.castShadow = true; skin.receiveShadow = true; skin.bind(rig.skeleton, new THREE.Matrix4());
  const pmesh = new THREE.Mesh(geometryFrom(prev), mats.skin); pmesh.castShadow = true;
  const parts = assembleParts(sh, rig.skeleton, mats.map, { partDefs });
  group.add(skin, pmesh, ...Object.values(parts.meshes));
  // the shell material is rare: give it a mesh of its own
  const shellGeo = new THREE.SphereGeometry(0.05, 8, 6); shellGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(shellGeo.attributes.position.count * 3).fill(1), 3));
  const si = new Uint8Array(shellGeo.attributes.position.count * 4), sw = new Uint8Array(si.length); for (let i = 0; i < sw.length; i += 4) sw[i] = 255;
  shellGeo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); shellGeo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  const shell = new THREE.SkinnedMesh(shellGeo, mats.shell); shell.castShadow = true; shell.bind(rig.skeleton, new THREE.Matrix4());
  group.add(shell);
  // the translucent ghost twin (OPAQUE define off → its own program)
  if (mats.ghost) { const gm = new THREE.SkinnedMesh(skin.geometry, mats.ghost); gm.bind(rig.skeleton, new THREE.Matrix4()); group.add(gm); }
  for (const e of extra) group.add(e);
  rig.fk(); rig.apply();
  scene.add(group);
  group.updateMatrixWorld(true);
  // compile against the target the scene really renders into (the linear HalfFloat composer target, or the screen on Low)
  const target = stage.post.enabled ? stage.post.sceneTarget : null;
  renderer.setRenderTarget(target);
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera); } catch { /* compile errors surface on render */ }
  renderer.setRenderTarget(null);
  // one real shadowed frame (depth programs), the contact pass and a bake, so depth, post and bake programs exist too
  stage.render();
  if (contact) contact.update({ group, bounds: res.bounds, height: 0.6, skin }, 0, true);
  bakeVertexColors(renderer, skin.geometry, 'skin', mats);
  scene.remove(group);
  for (const m of [skin, pmesh, shell, ...Object.values(parts.meshes)]) m.geometry.dispose();
  rig.skeleton.dispose();
  if (contact) contact.mesh.visible = false;
  return { programs: (renderer.info.programs || []).length, ms: performance.now() - t0 };
}
