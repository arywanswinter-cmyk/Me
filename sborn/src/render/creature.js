// creature.js — the living creature in the scene: recipe → shape → mesher jobs → skinned skin + rig + parts.
// Exports: createCreature({ mesher, partDefs, material, partMats }) -> Creature { group, body, setRecipe(r, {preview, sync}), applyResult(res, meta),
//          shape, rig, roles, parts, minY, height, info(), on(fn) }, geometryFrom(result, geo?).
// Invariants: the recipe is the only input; the old mesh stays until the new one arrives (no pops); preview results draw
//   as a plain rest-pose skin while parts are re-assembled on a fresh rest rig so they ride along during drags; the body
//   is lifted so its lowest point (skin or parts) sits at Y = 0.
import * as THREE from 'three';
import { buildShape, limbRoles } from '../geo/shape.js';
import { jobInput } from '../geo/mesher.js';
import { createRig } from '../rig/skeleton.js';
import { recipeHash } from '../recipe/schema.js';
import { assembleParts, disposeParts } from '../parts/assemble.js';

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

export function createCreature({ mesher, partDefs = {}, material, partMats = {}, H = 1 }) {
  const group = new THREE.Group();          // world placement (x, z, yaw, squash) — owned by editor/play
  group.name = 'creature';
  const body = new THREE.Group();           // lift so min Y = 0
  group.add(body);
  let recipe = null, hash = 0, shape = null, rig = null, roles = [], skin = null, previewMesh = null, parts = null;
  let minY = 0, height = 1, lastFull = null, bounds = [0, 0, 0, 0, 0, 0];
  const listeners = [];

  // Preview geometry: preallocated, grown ×1.5 on overflow (logged once), updated with setDrawRange.
  let pCap = 8000, pGeo = null, grewLogged = false;
  function previewGeo(res) {
    if (!pGeo || res.nv > pCap || res.index.length > pCap * 6) {
      if (pGeo) { while (res.nv > pCap || res.index.length > pCap * 6) pCap = Math.ceil(pCap * 1.5); if (!grewLogged) { grewLogged = true; console.info(`preview buffer grew to ${pCap}`); } pGeo.dispose(); }
      pGeo = new THREE.BufferGeometry();
      const A = (Ctor, k, norm) => new THREE.BufferAttribute(new Ctor(pCap * k), k, norm).setUsage(THREE.DynamicDrawUsage);
      pGeo.setAttribute('position', A(Float32Array, 3)); pGeo.setAttribute('normal', A(Int16Array, 3, true));
      pGeo.setAttribute('aDomain', A(Float32Array, 3)); pGeo.setAttribute('aDomain2', A(Float32Array, 3));
      pGeo.setAttribute('aPaint', A(Uint16Array, 4, true)); pGeo.setAttribute('aSkin', A(Uint8Array, 4, true));
      pGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(pCap * 6), 1).setUsage(THREE.DynamicDrawUsage));
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
    const b = res.bounds;
    pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2), 0.5 * Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]));
    return pGeo;
  }

  function setRecipe(r, { preview = false, sync = false } = {}) {
    recipe = r; hash = recipeHash(r);
    const sh = buildShape(r, partDefs);
    shape = sh;
    const input = jobInput(sh, H);
    if (sync) { applyResult(mesher.runSync(input, 'full'), { tag: { hash, shape: sh } }); return; }
    mesher.request(preview ? 'preview' : 'full', preview ? 'preview' : 'full', input, { hash, shape: sh });
  }

  function rebuildRigAndParts(sh, rolesNow) {
    const newRig = createRig(sh, rolesNow);
    if (rig) { body.remove(rig.rigRoot); if (rig.n !== newRig.n) rig.skeleton.dispose(); }
    if (parts) { for (const m of Object.values(parts.meshes)) body.remove(m); disposeParts(parts); }
    rig = newRig;
    body.add(rig.rigRoot);
    parts = assembleParts(sh, rig.skeleton, partMats, { partDefs });
    if (recipe) parts.recolor(recipe.paint);
    let pMin = Infinity, pMax = -Infinity;
    for (const m of Object.values(parts.meshes)) {
      const a = m.geometry.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) { if (a[i] < pMin) pMin = a[i]; if (a[i] > pMax) pMax = a[i]; }
      body.add(m);
    }
    return { pMin, pMax };
  }

  function applyResult(res, meta) {
    const tag = meta.tag || {};
    if (tag.hash !== hash) return;            // stale (recipe changed since)
    const sh = tag.shape;
    roles = limbRoles(sh, res.minY, partDefs);
    const { pMin, pMax } = rebuildRigAndParts(sh, roles);
    if (res.quality === 'preview') {
      const g = previewGeo(res);
      if (!previewMesh) { previewMesh = new THREE.Mesh(g, material); previewMesh.castShadow = true; previewMesh.name = 'skin-preview'; body.add(previewMesh); }
      previewMesh.visible = true;
      if (skin) skin.visible = false;
    } else {
      const geo = geometryFrom(res);
      if (skin) { body.remove(skin); skin.geometry.dispose(); }
      skin = new THREE.SkinnedMesh(geo, material);
      skin.name = 'skin';
      skin.castShadow = true; skin.receiveShadow = true;
      skin.bind(rig.skeleton, new THREE.Matrix4());
      const b = res.bounds;
      skin.boundingSphere = new THREE.Sphere(new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2), 0.75 * Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]));
      body.add(skin);
      if (previewMesh) previewMesh.visible = false;
      lastFull = res;
    }
    shape = sh;
    bounds = res.bounds.slice();
    const lowest = Math.min(res.minY, pMin);
    minY = lowest; body.position.y = -lowest;
    height = Math.max(res.bounds[4], pMax) - lowest;
    bounds[1] = lowest; bounds[4] = Math.max(res.bounds[4], pMax);
    for (const f of listeners) f(res.quality === 'preview' ? 'preview' : 'full', res);
  }
  function on(f) { listeners.push(f); }

  return {
    group, body, setRecipe, applyResult, on,
    get recipe() { return recipe; }, get hash() { return hash; }, get shape() { return shape; }, get rig() { return rig; },
    get roles() { return roles; }, get skin() { return skin; }, get minY() { return minY; }, get height() { return height; },
    get lastFull() { return lastFull; }, get previewMesh() { return previewMesh; }, get parts() { return parts; }, get bounds() { return bounds; },
    info: () => ({ verts: lastFull ? lastFull.nv : 0, tris: lastFull ? lastFull.nt : 0, partTris: parts ? parts.tris : 0, remeshMs: lastFull ? lastFull.ms.total : 0, bones: rig ? rig.n : 0 }),
  };
}
