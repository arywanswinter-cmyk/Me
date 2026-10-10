// picking.js — screen rays into rig space, sphere-traced skin hits, part hits, and surface points → recipe anchors.
// Exports: createPicker(stage, creature) -> { ray(x, y) (rig-space origin/dir), traceSkin(x, y) -> hit|null, hitPart(x, y) -> {sock, t}|null,
//          anchorFor(hitRig, opts) -> {b, u, d, x, owner}, toScreen(vRig, out) -> {x, y, z}, rigToWorld(v, out), worldToRig(v, out), pxPerM(vRig) }.
// Invariants: the skin is traced on the same SDF as the mesher (rest space, mounds included), so hits match what the
//   player sees; hits on the −x side are reported as their +x mirror plus `side: -1`; no allocation in hot calls.
import * as THREE from 'three';
import { fieldAll, makePrims, allIndex, field } from '../geo/sdf.js';

export function createPicker(stage, creature) {
  const cam = stage.camera, canvas = stage.renderer.domElement;
  const ndc = new THREE.Vector2(), rc = new THREE.Raycaster();
  const inv = new THREE.Matrix4(), o = new THREE.Vector3(), d = new THREE.Vector3(), tmp = new THREE.Vector3();
  function rect() { return canvas.getBoundingClientRect(); }
  function ray(x, y, out = { o: new THREE.Vector3(), d: new THREE.Vector3() }) {
    const r = rect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ndc, cam);
    creature.body.updateMatrixWorld(true);
    inv.copy(creature.body.matrixWorld).invert();
    out.o.copy(rc.ray.origin).applyMatrix4(inv);
    out.d.copy(rc.ray.direction).transformDirection(inv);
    return out;
  }
  const R = { o: new THREE.Vector3(), d: new THREE.Vector3() };
  function traceSkin(x, y) {
    const sh = creature.shape;
    if (!sh) return null;
    ray(x, y, R);
    const P = sh.P;
    // start where the ray enters a generous bounding sphere
    let t = 0, hit = false;
    const c = tmp.set(0, (sh.vertebrae[0][0] + sh.vertebrae[sh.vertebrae.length - 1][0]) / 2, 0);
    const oc = o.copy(R.o).sub(c);
    const b = oc.dot(R.d), rr = 4;
    const disc = b * b - (oc.lengthSq() - rr * rr);
    if (disc < 0) return null;
    t = Math.max(0, -b - Math.sqrt(disc));
    const tEnd = -b + Math.sqrt(disc);
    for (let i = 0; i < 160 && t < tEnd; i++) {
      d.copy(R.o).addScaledVector(R.d, t);
      const f = fieldAll(P, d.x, d.y, d.z);
      if (f < 0.0005) { hit = true; break; }
      t += Math.max(f * 0.9, 0.0008);
    }
    if (!hit) return null;
    const p = d.clone();
    const e = 0.002, n = new THREE.Vector3(fieldAll(P, p.x + e, p.y, p.z) - fieldAll(P, p.x - e, p.y, p.z), fieldAll(P, p.x, p.y + e, p.z) - fieldAll(P, p.x, p.y - e, p.z), fieldAll(P, p.x, p.y, p.z + e) - fieldAll(P, p.x, p.y, p.z - e)).normalize();
    return { p, n, t };
  }
  function hitPart(x, y) {
    const parts = creature.parts, sh = creature.shape;
    if (!parts || !sh) return null;
    ray(x, y, R);
    let best = null;
    for (const inst of parts.instances) {
      const s = inst.socket, fr = s.frame, rad = Math.max(0.03, inst.built.radius * 0.6);
      const cy = (inst.built.top || rad) * 0.5;
      let cx = s.base[0] + fr.Y[0] * cy, cyy = s.base[1] + fr.Y[1] * cy, cz = s.base[2] + fr.Y[2] * cy;
      if (s.mirrored) cx = -cx;
      tmp.set(cx, cyy, cz).sub(R.o);
      const tc = tmp.dot(R.d), d2 = tmp.lengthSq() - tc * tc;
      if (tc > 0 && d2 < rad * rad && (!best || tc < best.t)) best = { sock: s, inst, t: tc };
    }
    return best;
  }
  // Surface point (rig space) → anchor on the closest chain: spine or a limb (+x side), u = arc parameter, d in chain frame.
  function anchorFor(p, { allowLimbs = true } = {}) {
    const sh = creature.shape;
    const side = p.x < 0 ? -1 : 1;
    const q = new THREE.Vector3(Math.abs(p.x), p.y, p.z);
    // which primitive owns the point?
    let best = Infinity, owner = -1;
    if (allowLimbs) {
      const D = sh.P.data;
      for (let i = 0; i < sh.nBodyPrims; i++) {
        const g = D[i * 16 + 10];
        if (g !== 1) continue;
        const L = sh.limbs[D[i * 16 + 13]];
        if (L.inst !== 0) continue;
        const ax = D[i * 16 + 1], ay = D[i * 16 + 2], az = D[i * 16 + 3], bx = D[i * 16 + 4] - ax, by = D[i * 16 + 5] - ay, bz = D[i * 16 + 6] - az;
        const l2 = bx * bx + by * by + bz * bz || 1e-9;
        let f = ((q.x - ax) * bx + (q.y - ay) * by + (q.z - az) * bz) / l2; f = Math.max(0, Math.min(1, f));
        const dd = Math.hypot(q.x - ax - bx * f, q.y - ay - by * f, q.z - az - bz * f) - (D[i * 16 + 7] * (1 - f) + D[i * 16 + 8] * f);
        if (dd < best) { best = dd; owner = D[i * 16 + 13]; }
      }
    }
    // spine distance
    const nn = sh.spine.nearest(0, q.y, q.z);
    const fs = sh.spine.at(nn.s / sh.spine.L);
    const dSpine = Math.hypot(q.x, q.y - fs.p[1], q.z - fs.p[2]) - fs.r;
    let chain = sh.spine, b = 'spine';
    if (owner >= 0 && best < dSpine - 0.005) { const L = sh.limbs[owner]; chain = L.chain; b = L.id; }
    const near = chain.nearest(q.x, q.y, q.z);
    const u = Math.min(1, Math.max(0, near.s / chain.L));
    const fr = chain.at(u);
    const v = [q.x - fr.p[0], q.y - fr.p[1], q.z - fr.p[2]];
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    const dd = [(v[0] * fr.X[0] + v[1] * fr.X[1] + v[2] * fr.X[2]) / l, (v[0] * fr.U[0] + v[1] * fr.U[1] + v[2] * fr.U[2]) / l, (v[0] * fr.T[0] + v[1] * fr.T[1] + v[2] * fr.T[2]) / l];
    return { b, u, d: dd, side, x: p.x };
  }
  const pv = new THREE.Vector3();
  function rigToWorld(v, out) { creature.body.updateMatrixWorld(true); return out.copy(v).applyMatrix4(creature.body.matrixWorld); }
  function worldToRig(v, out) { creature.body.updateMatrixWorld(true); inv.copy(creature.body.matrixWorld).invert(); return out.copy(v).applyMatrix4(inv); }
  function toScreen(v, out = {}) {
    rigToWorld(v, pv).project(cam);
    const r = rect();
    out.x = r.left + (pv.x * 0.5 + 0.5) * r.width; out.y = r.top + (-pv.y * 0.5 + 0.5) * r.height; out.z = pv.z;
    return out;
  }
  // Pixels per metre at a rig-space point (for screen-space thresholds).
  function pxPerM(v) {
    const a = toScreen(v, {}), w = rigToWorld(v, new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(0.1).add(w);
    worldToRig(right, right);
    const b = toScreen(right, {});
    return Math.hypot(b.x - a.x, b.y - a.y) / 0.1;
  }
  // Intersect the ray with a plane (rig space) given point and normal.
  function rayPlane(x, y, point, normal, out = new THREE.Vector3()) {
    ray(x, y, R);
    const den = R.d.dot(normal);
    if (Math.abs(den) < 1e-6) return null;
    const t = tmp.copy(point).sub(R.o).dot(normal) / den;
    if (t < 0) return null;
    return out.copy(R.o).addScaledVector(R.d, t);
  }
  function camForwardRig(out = new THREE.Vector3()) { cam.getWorldDirection(out); return out.transformDirection(inv.copy(creature.body.matrixWorld).invert()); }
  return { ray, traceSkin, hitPart, anchorFor, toScreen, rigToWorld, worldToRig, pxPerM, rayPlane, camForwardRig, rect };
}
// Body field without mounds, for resolving new anchors exactly like buildShape does.
export function bodyField(shape) { const P = makePrims(shape.prims.slice(0, shape.nBodyPrims)); return { P, idx: allIndex(P), f: (x, y, z) => field(P, x, y, z, allIndex(P), P.count) }; }
