// ik.js — limb IK on the rig: analytic two-bone, toe→ankle→two-bone for 3 segments, 2D FABRIK in the leg plane for 4+.
// Exports: solveLimb(rig, limb, target, pole, out) -> { reach: bool (reach-limited), err }, aimBone(rig, bone, fromRest, toDir).
// Invariants: works in rig (creature) space on rest-orientation-identity bones; sets local rotations only; segment
//   lengths are preserved exactly; allocation-free (module scratch); a target beyond 0.98 × reach is flagged.
import * as THREE from 'three';

const V = () => new THREE.Vector3();
const j0 = V(), j1 = V(), j2 = V(), t = V(), d = V(), pl = V(), k = V(), a = V(), b = V(), tmp = V(), r0 = V(), r1 = V();
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), qi = new THREE.Quaternion();
const pts = Array.from({ length: 6 }, V), lens = new Float64Array(6), restDir = Array.from({ length: 6 }, V);

function restPos(rig, i, out) { return out.set(rig.rest[i * 3], rig.rest[i * 3 + 1], rig.rest[i * 3 + 2]); }

// Rotate bone `bone` so its rest direction (restA → restB) points along `dir` in world; sets local rotation
// relative to the parent's current world rotation. Returns the bone's new world quaternion in `outQ`.
export function aimBone(rig, bone, restDirV, dir, outQ) {
  qa.setFromUnitVectors(tmp.copy(restDirV).normalize(), a.copy(dir).normalize());
  const p = rig.parent[bone];
  if (p >= 0) { rig.worldQuat(p, qp); qi.copy(qp).invert(); rig.local[bone].copy(qi).multiply(qa); }
  else rig.local[bone].copy(qa);
  if (outQ) outQ.copy(qa);
  return qa;
}

// Positions of the chain joints after FK of the parent chain: the root joint world position must be current.
export function solveLimb(rig, limb, target, pole, out = {}) {
  const n = limb.joints.length, s0 = limb.boneStart;
  rig.jointWorld(s0, j0);
  for (let i = 0; i < n - 1; i++) {
    restPos(rig, s0 + i, r0); restPos(rig, s0 + i + 1, r1);
    restDir[i].subVectors(r1, r0); lens[i] = restDir[i].length();
  }
  let reach = 0; for (let i = 0; i < n - 1; i++) reach += lens[i];
  t.copy(target);
  d.subVectors(t, j0);
  let dist = d.length();
  out.reach = dist > 0.98 * reach;
  if (n === 2) {
    aimBone(rig, s0, restDir[0], d, qb);
    rig.local[s0 + 1].copy(qb).invert();          // keep the tip bone level (world identity)
    out.err = Math.max(0, dist - lens[0]);
    return out;
  }
  if (n === 3) {
    const l1 = lens[0], l2 = lens[1];
    const dd = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-4), (l1 + l2) * 0.9999);
    d.normalize();
    // pole: the rest knee's offset from the hip→tip line, carried along with the current limb frame
    pl.copy(pole).addScaledVector(d, -pole.dot(d));
    if (pl.lengthSq() < 1e-10) pl.set(0, 0, 1).addScaledVector(d, -d.z);
    pl.normalize();
    const ax = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - ax * ax));
    k.copy(j0).addScaledVector(d, ax).addScaledVector(pl, h);
    a.subVectors(k, j0);
    aimBone(rig, s0, restDir[0], a, qb);
    // bone 1's parent world rotation is qb (rest orientations are identity)
    qa.setFromUnitVectors(tmp.copy(restDir[1]).normalize(), b.copy(t).sub(k).normalize());
    rig.local[s0 + 1].copy(qb).invert().multiply(qa);
    rig.local[s0 + 2].copy(qa).invert();          // tip joint bone stays level in world
    out.err = Math.max(0, dist - (l1 + l2) * 0.9999);
    return out;
  }
  // 4+ joints: FABRIK, 8 iterations, 0.5 mm, pulled toward the pole in the leg plane.
  rig.jointWorld(s0, pts[0]);
  for (let i = 1; i < n; i++) { restPos(rig, s0 + i, r1); restPos(rig, s0, r0); pts[i].copy(pts[0]).add(r1.sub(r0)); }
  // bias the initial chain toward the pole so the bend direction is stable
  for (let i = 1; i < n - 1; i++) pts[i].addScaledVector(pole, 0.05 * lens[i - 1]);
  const root = j0.copy(pts[0]);
  for (let it = 0; it < 8; it++) {
    pts[n - 1].copy(t);
    for (let i = n - 2; i >= 0; i--) { tmp.subVectors(pts[i], pts[i + 1]).normalize(); pts[i].copy(pts[i + 1]).addScaledVector(tmp, lens[i]); }
    pts[0].copy(root);
    for (let i = 1; i < n; i++) { tmp.subVectors(pts[i], pts[i - 1]).normalize(); pts[i].copy(pts[i - 1]).addScaledVector(tmp, lens[i - 1]); }
    if (pts[n - 1].distanceTo(t) < 0.0005) break;
  }
  qp.identity();
  for (let i = 0; i < n - 1; i++) {
    qa.setFromUnitVectors(tmp.copy(restDir[i]).normalize(), b.subVectors(pts[i + 1], pts[i]).normalize());
    if (i === 0) aimBone(rig, s0, restDir[0], b, null);
    else rig.local[s0 + i].copy(qp).invert().multiply(qa);
    qp.copy(qa);
  }
  rig.local[s0 + n - 1].copy(qp).invert();
  out.err = pts[n - 1].distanceTo(t);
  return out;
}
