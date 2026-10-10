// skeleton.js — the creature rig: bone hierarchy from the shape, local rotations, forward kinematics in creature space.
// Exports: createRig(shape, roles) -> Rig { n, rest, parent, order, pelvis, local (quats), offset (pelvis translation),
//          world (Matrix4[]), bones (THREE.Bone[]), skeleton, toRest(), fk(), apply(), jointWorld(i, out), stateHash() }.
// Invariants: rest orientations are identity, so a bone's rest matrix is a pure translation and skinning is
//   world_b · T(−rest_b); bones sit directly under one rig root (matrixAutoUpdate off) and receive creature-space
//   matrices; never a negative scale anywhere; fk() allocates nothing.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();

export function createRig(shape, roles = []) {
  const B = shape.bones, n = B.length;
  const rest = new Float32Array(n * 3);
  B.forEach((b, i) => { rest[i * 3] = b.pos[0]; rest[i * 3 + 1] = b.pos[1]; rest[i * 3 + 2] = b.pos[2]; });
  // Pelvis: vertebra nearest the leg-root centroid (mid-spine without legs).
  const nV = shape.vertebrae.length;
  let pelvis = Math.floor((nV - 1) / 2);
  const legRoots = shape.limbs.filter((L, i) => roles[i] === 'leg').map((L) => L.joints[0]);
  if (legRoots.length) {
    const cz = legRoots.reduce((a, p) => a + p[2], 0) / legRoots.length, cy = legRoots.reduce((a, p) => a + p[1], 0) / legRoots.length;
    let best = Infinity;
    for (let i = 0; i < nV; i++) { const d = Math.hypot(rest[i * 3 + 1] - cy, rest[i * 3 + 2] - cz); if (d < best) { best = d; pelvis = i; } }
  }
  const parent = new Int16Array(n);
  for (let i = 0; i < n; i++) parent[i] = B[i].parent;
  for (let i = 0; i < nV; i++) parent[i] = i === pelvis ? -1 : i > pelvis ? i - 1 : i + 1;
  // FK order: breadth-first from the pelvis.
  const kids = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) if (parent[i] >= 0) kids[parent[i]].push(i);
  const order = [pelvis];
  for (let k = 0; k < order.length; k++) for (const c of kids[order[k]]) order.push(c);
  // orphan safety: anything unreachable hangs from the pelvis
  if (order.length < n) for (let i = 0; i < n; i++) if (!order.includes(i)) { parent[i] = pelvis; order.push(i); }

  const local = Array.from({ length: n }, () => new THREE.Quaternion());
  const world = Array.from({ length: n }, () => new THREE.Matrix4());
  const offset = new THREE.Vector3();           // pelvis translation (body height, bob, sway)
  const rootRot = new THREE.Quaternion();       // pelvis rotation (tilt, roll)
  const extraT = Array.from({ length: n }, () => new THREE.Vector3());   // per-bone translation tweaks (stretch, squash)

  const rigRoot = new THREE.Object3D();
  rigRoot.name = 'rig';
  const bones = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Bone();
    b.name = `${B[i].kind}:${B[i].ref}`;
    b.matrixAutoUpdate = false;
    b.matrix.makeTranslation(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
    rigRoot.add(b); bones.push(b);
  }
  const inverses = bones.map((b, i) => new THREE.Matrix4().makeTranslation(-rest[i * 3], -rest[i * 3 + 1], -rest[i * 3 + 2]));
  const skeleton = new THREE.Skeleton(bones, inverses);

  function toRest() {
    for (let i = 0; i < n; i++) { local[i].identity(); extraT[i].set(0, 0, 0); }
    offset.set(0, 0, 0); rootRot.identity();
  }
  // world_b = world_parent · T(rest_b − rest_parent + extra_b) · R_b ; pelvis: T(rest + offset) · R_root · R_local
  function fk() {
    for (let k = 0; k < order.length; k++) {
      const i = order[k], p = parent[i];
      const W = world[i];
      if (p < 0) {
        _q.copy(rootRot).multiply(local[i]);
        W.makeRotationFromQuaternion(_q);
        W.setPosition(rest[i * 3] + offset.x + extraT[i].x, rest[i * 3 + 1] + offset.y + extraT[i].y, rest[i * 3 + 2] + offset.z + extraT[i].z);
      } else {
        _t.makeRotationFromQuaternion(local[i]);
        _t.setPosition(rest[i * 3] - rest[p * 3] + extraT[i].x, rest[i * 3 + 1] - rest[p * 3 + 1] + extraT[i].y, rest[i * 3 + 2] - rest[p * 3 + 2] + extraT[i].z);
        W.multiplyMatrices(world[p], _t);
      }
    }
  }
  function apply() {
    for (let i = 0; i < n; i++) { bones[i].matrix.copy(world[i]); bones[i].matrixWorldNeedsUpdate = true; }
  }
  function jointWorld(i, out) { return out.setFromMatrixPosition(world[i]); }
  // world rotation of bone i as a quaternion
  function worldQuat(i, out) { _m.extractRotation(world[i]); return out.setFromRotationMatrix(_m); }
  function stateHash() {
    let h = 2166136261;
    const f = new Float32Array(1), u = new Uint32Array(f.buffer);
    for (let i = 0; i < n; i++) for (let k = 0; k < 16; k++) {
      f[0] = Math.round(world[i].elements[k] * 1e6) / 1e6;
      h ^= u[0]; h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  toRest(); fk(); apply();
  return { n, rest, parent, order, pelvis, local, world, offset, rootRot, extraT, bones, skeleton, rigRoot, toRest, fk, apply, jointWorld, worldQuat, stateHash, kids };
}
