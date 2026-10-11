// camera.js — the editor's orbit camera: always centred on the creature, no pan; auto-frame and idle drift.
// Exports: createOrbit(camera, { reduced }) -> { az, el, dist, target, orbit(dxPx, dyPx), zoom(f), frame(box, instant), update(dt, idle), apply() }.
// Invariants: elevation clamped to 5°–75°; distance 0.5–12 m; framing dollies over 900 ms so the creature fills 62% of
//   the viewport height; after 6 s idle the camera drift-orbits at 3°/s (never with reduced motion).
import * as THREE from 'three';

export function createOrbit(camera, { reduced = false } = {}) {
  const o = { az: 0.35, el: 0.22, dist: 3.2, target: new THREE.Vector3(0, 0.4, 0), idleT: 0 };
  let fr = null;   // framing tween
  const clampEl = (e) => Math.min(1.3, Math.max(0.09, e));
  o.orbit = (dx, dy) => { o.az -= dx * 0.008; o.el = clampEl(o.el + dy * 0.006); o.idleT = 0; fr = fr && { ...fr, keepAngles: true }; };
  o.zoom = (f) => { o.dist = Math.min(12, Math.max(0.5, o.dist * f)); o.idleT = 0; if (fr) fr = null; };
  o.yaw = (d) => { o.az += d; o.idleT = 0; };
  // box: {cy, h, r} centre height, height and horizontal radius of the creature
  o.frame = (box, instant = false) => {
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const fill = 0.62;
    const dH = (box.h / fill) / 2 / Math.tan(fov / 2);
    const dW = (box.r * 2 / 0.8) / 2 / (Math.tan(fov / 2) * camera.aspect);
    const dist = Math.min(12, Math.max(0.9, dH, dW) + box.r * 0.6);
    const ty = box.cy;
    if (instant || reduced) { o.dist = dist; o.target.y = ty; fr = null; return; }
    fr = { t: 0, d0: o.dist, d1: dist, y0: o.target.y, y1: ty };
  };
  o.update = (dt, idle = true) => {
    if (fr) {
      fr.t += dt / 0.9;
      const k = fr.t >= 1 ? 1 : 1 - Math.pow(1 - fr.t, 3);
      o.dist = fr.d0 + (fr.d1 - fr.d0) * k; o.target.y = fr.y0 + (fr.y1 - fr.y0) * k;
      if (fr.t >= 1) fr = null;
    }
    o.idleT = idle ? o.idleT + dt : 0;
    if (!reduced && o.idleT > 6) o.az += THREE.MathUtils.degToRad(3) * dt;
  };
  o.apply = () => {
    const ce = Math.cos(o.el);
    camera.position.set(o.target.x + Math.sin(o.az) * ce * o.dist, o.target.y + Math.sin(o.el) * o.dist, o.target.z + Math.cos(o.az) * ce * o.dist);
    camera.lookAt(o.target);
    camera.updateMatrixWorld();
  };
  return o;
}
