// sheet.js — debug contact sheets: every fixture (or any recipe list) meshed and laid out in a numbered grid.
// Exports: showSheet(stage, recipes, { cols, material, partDefs, label }) -> { group, labels }.
// Invariants: debug only (?test&sheet=…); meshes are built synchronously on the main thread with the same mesher code;
//   the only text is the grid numbers.
import * as THREE from 'three';
import { buildShape } from '../geo/shape.js';
import { jobInput, runJob } from '../geo/mesher.js';
import { geometryFrom } from '../render/creature.js';
import { limbRoles } from '../geo/shape.js';
import { createRig } from '../rig/skeleton.js';
import { assembleParts } from '../parts/assemble.js';

// A whole creature at rest (skin + parts), built synchronously — for debug sheets only.
export function buildStatic(recipe, { partDefs, mats, skinMat = null }) {
  const sh = buildShape(recipe, partDefs);
  const res = runJob(jobInput(sh, 1), 'full');
  const rig = createRig(sh, limbRoles(sh, res.minY, partDefs));
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body); body.add(rig.rigRoot);
  const skin = new THREE.SkinnedMesh(geometryFrom(res), skinMat || mats.skin); skin.castShadow = true; skin.bind(rig.skeleton, new THREE.Matrix4()); skin.frustumCulled = false;
  body.add(skin);
  const parts = assembleParts(sh, rig.skeleton, skinMat ? { ...mats.map, skin: skinMat } : mats.map, { partDefs });
  parts.recolor(recipe.paint);
  let pMin = res.minY;
  for (const m of Object.values(parts.meshes)) { m.frustumCulled = false; body.add(m); const a = m.geometry.attributes.position.array; for (let i = 1; i < a.length; i += 3) pMin = Math.min(pMin, a[i]); }
  body.position.y = -pMin;
  rig.fk(); rig.apply();
  g.userData = { rig, shape: sh, res, parts };
  return g;
}

export function showSheet(stage, recipes, { cols = 4, material, partDefs = {}, spacing = 2.2, build = null, rot = 1.0 } = {}) {
  const group = new THREE.Group();
  group.name = 'sheet';
  const rows = Math.ceil(recipes.length / cols);
  const items = [];
  recipes.forEach((r, i) => {
    let obj;
    if (build) obj = build(r, i);
    else {
      const sh = buildShape(r, partDefs);
      const res = runJob(jobInput(sh, 1), 'full');
      obj = new THREE.Mesh(geometryFrom(res), material);
      obj.position.y = -res.minY;
      obj.castShadow = true;
      const holder = new THREE.Group(); holder.add(obj); obj = holder;
    }
    const c = i % cols, rr = Math.floor(i / cols);
    obj.position.x = (c - (cols - 1) / 2) * spacing;
    obj.position.z = (rr - (rows - 1) / 2) * spacing * 1.3;
    obj.rotation.y = rot;
    group.add(obj);
    items.push(obj);
  });
  stage.scene.add(group);
  const cam = stage.camera;
  const w = cols * spacing, d = rows * spacing * 1.3;
  const dist = 0.62 * w / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.max(1, cam.aspect);
  cam.position.set(0, dist * 0.6, dist * 0.8);
  cam.lookAt(0, 0.1, 0.9);
  stage.lights.focus.set(0, 0, 0); stage.lights.radius = Math.max(w, d) * 0.6;
  // numbers in front of each item, as sprites (no DOM text needed)
  const labels = items.map((o, i) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#FFF8EC'; g.beginPath(); g.roundRect(8, 4, 112, 56, 24); g.fill();
    g.fillStyle = '#3A2E5C'; g.font = '700 40px Fredoka, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), 64, 34);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, toneMapped: false, depthTest: false }));
    sp.scale.set(0.5 * spacing / 2.2, 0.25 * spacing / 2.2, 1);
    sp.position.set(o.position.x, 0.05, o.position.z + spacing * 0.5);
    group.add(sp);
    return sp;
  });
  const place = () => {};
  return { group, labels, place };
}
