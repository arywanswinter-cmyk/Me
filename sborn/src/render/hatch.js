// hatch.js — the boot cover: a pastel speckled egg wobbling on the pedestal, cracking into soft shell confetti.
// Exports: createHatch(scene) -> { group, update(dt), crack() -> Promise (resolves when the shell is gone), cracked }.
// Invariants: the egg is built from plain three.js materials compiled with the rest; crack() is idempotent.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

export function createHatch(scene) {
  const group = new THREE.Group();
  group.name = 'hatch';
  // Egg lathe: wider bottom, pointier top.
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * Math.PI;
    const r = Math.sin(a) * 0.3 * (1 - 0.18 * t);
    pts.push(new THREE.Vector2(Math.max(r, 1e-4), 0.42 * (1 - Math.cos(a)) * (0.92 + 0.08 * t)));
  }
  const geo = new THREE.LatheGeometry(pts, 48);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  const rnd = mulberry32(7);
  const base = new THREE.Color('#FFE3EF'), spot = [new THREE.Color('#9B7BFF'), new THREE.Color('#5BB8FF'), new THREE.Color('#FFD23F')];
  const spots = Array.from({ length: 26 }, () => ({ d: new THREE.Vector3(rnd() - 0.5, rnd() * 0.9, rnd() - 0.5).normalize(), r: 0.08 + rnd() * 0.1, c: spot[Math.floor(rnd() * 3)] }));
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(geo.attributes.position, i).sub(new THREE.Vector3(0, 0.4, 0)).normalize();
    c.copy(base).lerp(new THREE.Color('#FFF6E0'), Math.max(0, v.y));
    for (const s of spots) if (v.distanceTo(s.d) < s.r) c.lerp(s.c, 0.55);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const egg = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.2, sheen: 0.2 }));
  egg.castShadow = true;
  group.add(egg);
  scene.add(group);

  // Confetti: shell chips, one instanced draw.
  const chips = new THREE.InstancedMesh(new THREE.CircleGeometry(0.05, 6), new THREE.MeshStandardMaterial({ vertexColors: false, side: THREE.DoubleSide, roughness: 0.5 }), 36);
  chips.visible = false;
  const vel = [], pos = [], rot = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 36; i++) {
    chips.setColorAt(i, new THREE.Color(['#FFE3EF', '#FFF6E0', '#D9CCFF', '#CFEAFF'][i % 4]));
    pos.push(new THREE.Vector3()); vel.push(new THREE.Vector3()); rot.push(new THREE.Vector3());
  }
  group.add(chips);

  let t = 0, crackT = -1, resolveCrack = null, cracked = false;
  function crack() {
    if (crackT >= 0) return new Promise((r) => { if (cracked) r(); else { const prev = resolveCrack; resolveCrack = () => { prev && prev(); r(); }; } });
    crackT = 0;
    chips.visible = true;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + rnd() * 0.3, up = 1.2 + rnd() * 1.4;
      pos[i].set(Math.cos(a) * 0.22, 0.3 + rnd() * 0.4, Math.sin(a) * 0.22);
      vel[i].set(Math.cos(a) * (0.8 + rnd()), up, Math.sin(a) * (0.8 + rnd()));
      rot[i].set(rnd() * 6, rnd() * 6, rnd() * 6);
    }
    return new Promise((r) => { resolveCrack = r; });
  }
  function update(dt) {
    t += dt;
    if (crackT < 0) {
      // wobble: a lazy rock with an occasional excited double-shake
      const w = Math.sin(t * 2.2) * 0.06 + (Math.sin(t * 0.9) > 0.92 ? Math.sin(t * 28) * 0.08 : 0);
      egg.rotation.z = w; egg.rotation.x = Math.sin(t * 1.7) * 0.03;
      egg.scale.set(1 + 0.01 * Math.sin(t * 3), 1 - 0.01 * Math.sin(t * 3), 1 + 0.01 * Math.sin(t * 3));
      return;
    }
    crackT += dt;
    const k = Math.min(1, crackT / 0.18);
    egg.scale.setScalar(Math.max(0.0001, 1 - k));
    egg.visible = k < 1;
    for (let i = 0; i < 36; i++) {
      vel[i].y -= 6 * dt;
      pos[i].addScaledVector(vel[i], dt);
      if (pos[i].y < 0.01) { pos[i].y = 0.01; vel[i].multiplyScalar(0.4); vel[i].y = Math.abs(vel[i].y) * 0.3; }
      e.set(rot[i].x * crackT, rot[i].y * crackT, rot[i].z * crackT);
      q.setFromEuler(e);
      sc.setScalar(Math.max(0.0001, 1 - Math.max(0, crackT - 0.9) / 0.5));
      m.compose(pos[i], q, sc);
      chips.setMatrixAt(i, m);
    }
    chips.instanceMatrix.needsUpdate = true;
    if (crackT > 1.4 && !cracked) {
      cracked = true; chips.visible = false; group.visible = false;
      if (resolveCrack) resolveCrack();
    }
  }
  return { group, update, crack, get cracked() { return cracked; }, get cracking() { return crackT >= 0; } };
}
