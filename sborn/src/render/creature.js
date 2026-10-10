// creature.js — the living creature in the scene: recipe → shape → mesher jobs → skinned skin + rig (+ parts).
// Exports: createCreature({ mesher, partDefs, material }) -> Creature { group, body, setRecipe(r, {preview}), applyResult(res, meta),
//          shape, rig, roles, minY, height, info(), ready() }, geometryFrom(result, geo?) .
// Invariants: the recipe is the only input; the old mesh stays until the new one arrives (no pops); preview results draw
//   as a plain rest-pose mesh in the same material; the body is lifted so its lowest point sits at Y = 0; bone count
//   changes are the only time a new Skeleton is made.
import * as THREE from 'three';
import { buildShape, limbRoles } from '../geo/shape.js';
import { jobInput } from '../geo/mesher.js';
import { createRig } from '../rig/skeleton.js';
import { recipeHash } from '../recipe/schema.js';

export function geometryFrom(res, geo = new THREE.BufferGeometry()) {
  geo.setAttribute('position', new THREE.BufferAttribute(res.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(res.normal, 3, true));
  geo.setAttribute('aDomain', new THREE.BufferAttribute(res.aDomain, 3));
  geo.setAttribute('aDomain2', new THREE.BufferAttribute(res.aDomain2, 3));
  geo.setAttribute('aPaint', new THREE.BufferAttribute(res.aPaint, 4, true));
  geo.setAttribute('aSkin', new THREE.BufferAttribute(res.aSkin, 4, true));
  if (res.skinIndex) {
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(res.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(res.skinWeight, 4, true));
  }
  geo.setIndex(new THREE.BufferAttribute(res.index, 1));
  return geo;
}

export function createCreature({ mesher, partDefs = {}, material, H = 1 }) {
  const group = new THREE.Group();          // world placement (x, z, yaw) — owned by editor/play
  group.name = 'creature';
  const body = new THREE.Group();           // lift so min Y = 0
  group.add(body);
  let recipe = null, hash = 0, shape = null, rig = null, roles = [], skin = null, previewMesh = null;
  let minY = 0, height = 1, lastFull = null;
  const listeners = [];
  const sphere = new THREE.Sphere();

  // Preview geometry: preallocated, grown ×1.5 on overflow (logged once), updated with setDrawRange.
  let pCap = 8000, pGeo = null, grewLogged = false;
  function previewGeo(res) {
    if (!pGeo || res.nv > pCap || res.index.length > pCap * 6) {
      if (pGeo) { while (res.nv > pCap || res.index.length > pCap * 6) pCap = Math.ceil(pCap * 1.5); if (!grewLogged) { grewLogged = true; console.info(`preview buffer grew to ${pCap}`); } pGeo.dispose(); }
      pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pCap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      pGeo.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(pCap * 3), 3, true).setUsage(THREE.DynamicDrawUsage));
      pGeo.setAttribute('aDomain', new THREE.BufferAttribute(new Float32Array(pCap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      pGeo.setAttribute('aDomain2', new THREE.BufferAttribute(new Float32Array(pCap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      pGeo.setAttribute('aPaint', new THREE.BufferAttribute(new Uint16Array(pCap * 4), 4, true).setUsage(THREE.DynamicDrawUsage));
      pGeo.setAttribute('aSkin', new THREE.BufferAttribute(new Uint8Array(pCap * 4), 4, true).setUsage(THREE.DynamicDrawUsage));
      pGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(pCap * 6), 1).setUsage(THREE.DynamicDrawUsage));
      pGeo.userData.buffers = 1;
      if (previewMesh) previewMesh.geometry = pGeo;
    }
    for (const k of ['position', 'normal', 'aDomain', 'aDomain2', 'aPaint', 'aSkin']) {
      const a = pGeo.attributes[k];
      a.array.set(res[k]);
      a.clearUpdateRanges(); a.addUpdateRange(0, res[k].length); a.needsUpdate = true;
    }
    pGeo.index.array.set(res.index);
    pGeo.index.clearUpdateRanges(); pGeo.index.addUpdateRange(0, res.index.length); pGeo.index.needsUpdate = true;
    pGeo.setDrawRange(0, res.index.length);
    pGeo.boundingSphere = new THREE.Sphere().set(new THREE.Vector3((res.bounds[0] + res.bounds[3]) / 2, (res.bounds[1] + res.bounds[4]) / 2, (res.bounds[2] + res.bounds[5]) / 2), 0.5 * Math.hypot(res.bounds[3] - res.bounds[0], res.bounds[4] - res.bounds[1], res.bounds[5] - res.bounds[2]));
    return pGeo;
  }

  function setRecipe(r, { preview = false, sync = false } = {}) {
    recipe = r; hash = recipeHash(r);
    shape = buildShape(r, partDefs);
    const input = jobInput(shape, H);
    if (sync) { applyResult(mesher.runSync(input, 'full'), { tag: { hash, shape } }); return; }
    mesher.request(preview ? 'preview' : 'full', preview ? 'preview' : 'full', input, { hash, shape });
  }

  function applyResult(res, meta) {
    const tag = meta.tag || {};
    if (tag.hash !== hash) return;            // stale (recipe changed since)
    if (res.quality === 'preview') {
      const g = previewGeo(res);
      if (!previewMesh) { previewMesh = new THREE.Mesh(g, material); previewMesh.castShadow = true; previewMesh.name = 'skin-preview'; body.add(previewMesh); }
      previewMesh.visible = true;
      if (skin) skin.visible = false;
      setLift(res.minY);
      emit('preview', res);
      return;
    }
    const sh = tag.shape;
    roles = limbRoles(sh, res.minY, partDefs);
    const geo = geometryFrom(res);
    const newRig = createRig(sh, roles);
    if (skin) {
      body.remove(skin);
      skin.geometry.dispose();
      if (rig && rig.n !== newRig.n) rig.skeleton.dispose();
      body.remove(rig.rigRoot);
    }
    rig = newRig;
    skin = new THREE.SkinnedMesh(geo, material);
    skin.name = 'skin';
    skin.castShadow = true; skin.receiveShadow = true;
    skin.add(rig.rigRoot);
    skin.bind(rig.skeleton, new THREE.Matrix4());
    const b = res.bounds;
    sphere.set(new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2), 0.75 * Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]));
    skin.boundingSphere = sphere.clone();
    body.add(skin);
    if (previewMesh) previewMesh.visible = false;
    shape = sh;
    lastFull = res;
    setLift(res.minY);
    height = b[4] - b[1];
    emit('full', res);
  }
  function setLift(my) { minY = my; body.position.y = -my; }

  function emit(kind, res) { for (const f of listeners) f(kind, res); }
  function on(f) { listeners.push(f); }

  return {
    group, body, setRecipe, applyResult, on,
    get recipe() { return recipe; }, get hash() { return hash; }, get shape() { return shape; }, get rig() { return rig; },
    get roles() { return roles; }, get skin() { return skin; }, get minY() { return minY; }, get height() { return height; },
    get lastFull() { return lastFull; }, get previewMesh() { return previewMesh; },
    info: () => ({ verts: lastFull ? lastFull.nv : 0, tris: lastFull ? lastFull.nt : 0, remeshMs: lastFull ? lastFull.ms.total : 0, bones: rig ? rig.n : 0 }),
  };
}
