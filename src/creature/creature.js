// creature.js — turns pipeline data into a living Three.js creature.
// Exports: createCreature(data, { color, seed }) -> { group, body, setBirth(p), update(dt, t, lookWorld), boop(), dispose(), lift }.
// Structure: group (world placement) > rig (breath, squash, sway; pivot at the body's lowest point) > body + eyes.
//   Stub feet hang off the group so they stay planted while the body breathes.
// Invariants: setBirth(p) with p in [0,1] is the only thing that changes inflation; update() never allocates per frame.
import * as THREE from 'three';
import { clayMaterial } from './material.js';
import { mulberry32 } from '../core/rng.js';

const Z = new THREE.Vector3(0, 0, 1);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

const SCLERA = new THREE.MeshPhysicalMaterial({ color: '#FFFDF7', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 });
const PUPIL = new THREE.MeshPhysicalMaterial({ color: '#15120E', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.9 });

// Meshes that use every creature shader, so the stage can compile them before the first birth.
export function warmUpMeshes() {
  const white = document.createElement('canvas');
  white.width = white.height = 4;
  const wctx = white.getContext('2d'); wctx.fillStyle = '#fff'; wctx.fillRect(0, 0, 4, 4);
  const tex = new THREE.CanvasTexture(white);
  const g = new THREE.SphereGeometry(0.1, 8, 6);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aInkUv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('aFront', new THREE.BufferAttribute(new Float32Array(n), 1));
  const meshes = [
    new THREE.Mesh(g, clayMaterial(new THREE.Color('#ffffff'), tex)),
    new THREE.Mesh(g, clayMaterial(new THREE.Color('#ffffff'), null, { vertexColors: false })),
    new THREE.Mesh(g, SCLERA),
    new THREE.Mesh(g, PUPIL),
  ];
  for (const m of meshes) m.castShadow = true;
  return meshes;
}

export function createCreature(data, { color, seed = 1 }) {
  const rnd = mulberry32(seed);
  const phase = rnd() * Math.PI * 2;
  const base = new THREE.Color(color);
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  // Countershading: lighter belly, slightly deeper back, darker where it meets the ground.
  const nV = data.positions.length / 3, cols = new Float32Array(nV * 3);
  const light = base.clone().lerp(new THREE.Color(1, 1, 1), 0.3), dark = base.clone().multiplyScalar(0.8), c = new THREE.Color();
  for (let v = 0; v < nV; v++) {
    const ny = data.normals[v * 3 + 1], y = data.positions[v * 3 + 1] / data.height;
    c.copy(base);
    if (ny < 0) c.lerp(light, Math.min(1, -ny * 0.55)); else c.lerp(dark, ny * 0.28);
    if (y < 0.06) c.multiplyScalar(0.86 + y * 2.3);
    cols[v * 3] = c.r; cols[v * 3 + 1] = c.g; cols[v * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('aInkUv', new THREE.BufferAttribute(data.inkUv, 2));
  geo.setAttribute('aFront', new THREE.BufferAttribute(data.front, 1));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geo.computeBoundingSphere();
  const skinTex = new THREE.CanvasTexture(data.skin);
  skinTex.colorSpace = THREE.SRGBColorSpace;
  skinTex.anisotropy = 4;
  const mat = clayMaterial(base, skinTex);
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  rig.add(body);

  // Stub feet for shapes with no legs, so everything can stand and walk.
  const feet = [];
  let lift = 0;
  if (data.stub) {
    const rf = data.height * 0.075;
    lift = rf * 1.15;
    const fmat = clayMaterial(base.clone().multiplyScalar(0.85), null, { vertexColors: false });
    const fgeo = new THREE.CapsuleGeometry(rf, rf * 1.2, 6, 16);
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(fgeo, fmat);
      f.rotation.x = Math.PI / 2;
      f.position.set(sx * Math.max(0.2 * data.width, rf * 1.3), rf, 0.03);
      f.castShadow = true;
      group.add(f);
      feet.push(f);
    }
  }
  rig.position.y = lift;

  // Eyes: holder (placement + pop) > lid (blink) > ball (look) > sclera + pupil.
  const eyes = data.eyes.map((e) => {
    const holder = new THREE.Group(), lid = new THREE.Group(), ball = new THREE.Group();
    holder.add(lid); lid.add(ball);
    const n = new THREE.Vector3(...e.normal);
    const rest = n.clone().add(new THREE.Vector3(0, 0, 0.9)).normalize();
    holder.position.set(...e.pos);
    holder.quaternion.setFromUnitVectors(Z, rest);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(e.r, 40, 28), SCLERA);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(e.r * 0.56, 32, 20), PUPIL);
    pupil.scale.z = 0.45;
    pupil.position.z = e.r * 0.8;
    sclera.castShadow = pupil.castShadow = true;
    ball.add(sclera, pupil);
    rig.add(holder);
    return { holder, lid, ball, baseZ: e.pos[2] };
  });

  let blinkIn = 1.5 + rnd() * 2, blinkFor = 0, boopT = -1;
  const qLook = new THREE.Quaternion(), vLocal = new THREE.Vector3(), qInv = new THREE.Quaternion(), wp = new THREE.Vector3();

  function setBirth(p) {
    const inflate = p <= 0 ? 0.02 : Math.max(0.02, easeOutBack(clamp01(p)));
    mat.userData.uniforms.uInflate.value = inflate;
    const e = clamp01((p - 0.62) / 0.3), es = e <= 0 ? 1e-4 : easeOutBack(e);
    for (const eye of eyes) { eye.holder.scale.setScalar(es); eye.holder.position.z = eye.baseZ * inflate; }
    const f = clamp01((p - 0.35) / 0.3), fs = f <= 0 ? 1e-4 : easeOutBack(f);
    for (const ft of feet) ft.scale.setScalar(fs);
  }

  function update(dt, t, lookWorld) {
    const br = Math.sin(t * Math.PI * 2 * 0.3 + phase);
    let sy = 1 + 0.016 * br, sxz = 1 + 0.007 * br;
    if (boopT >= 0) {
      boopT += dt;
      const k = Math.exp(-5 * boopT) * Math.cos(16 * boopT);
      sy *= 1 - 0.17 * k; sxz *= 1 + 0.09 * k;
      if (boopT > 1.6) boopT = -1;
    }
    rig.scale.set(sxz, sy, sxz);
    rig.rotation.z = 0.02 * Math.sin(t * 0.8 + phase);

    blinkIn -= dt;
    if (blinkIn <= 0) { blinkFor = 0.12; blinkIn = 2 + rnd() * 4.5; }
    const closed = blinkFor > 0;
    if (closed) blinkFor -= dt;

    for (const eye of eyes) {
      eye.lid.scale.y = closed ? 0.1 : 1;
      if (lookWorld) {
        eye.holder.getWorldPosition(wp);
        eye.holder.getWorldQuaternion(qInv).invert();
        vLocal.copy(lookWorld).sub(wp).applyQuaternion(qInv).normalize();
        const ang = vLocal.angleTo(Z), max = 0.55;
        if (ang > max) vLocal.lerp(Z, 1 - max / ang).normalize();
        qLook.setFromUnitVectors(Z, vLocal);
        eye.ball.quaternion.slerp(qLook, 1 - Math.exp(-dt * 10));
      }
    }
  }

  function dispose() {
    geo.dispose(); mat.dispose(); skinTex.dispose();
    for (const f of feet) { f.geometry.dispose(); f.material.dispose(); }
    for (const e of eyes) e.ball.children.forEach((m) => m.geometry.dispose());
  }

  return { group, body, setBirth, update, boop: () => { boopT = 0; }, dispose, lift };
}
