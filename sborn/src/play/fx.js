// fx.js — small island effects: crumbs, dust rings, hearts, bubbles and sparkles, each kind one instanced draw.
// Exports: createFx(mat) -> { group, emit(kind, at, n, opts), step(dt, camera), counts, clear() }.
// Invariants: shares the island's instanced vertex-colour material (no extra programs); fixed pools (48 per kind, the
//   oldest is reused); deterministic (seeded); positions in world space.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { colorGeo } from './island.js';

const CAP = 48;
function heartGeo() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5); s.bezierCurveTo(-0.15, -0.3, -0.55, -0.1, -0.5, 0.2); s.bezierCurveTo(-0.45, 0.5, -0.1, 0.55, 0, 0.3);
  s.bezierCurveTo(0.1, 0.55, 0.45, 0.5, 0.5, 0.2); s.bezierCurveTo(0.55, -0.1, 0.15, -0.3, 0, -0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -0.09); g.scale(0.2, 0.2, 0.2);
  return colorGeo(g, (x, y, z, c) => c.set(y > 0.06 && x < -0.03 ? '#FFB3C8' : '#FF5C8A'));
}
const KINDS = {
  crumb: { geo: () => colorGeo(new THREE.IcosahedronGeometry(0.022, 0), (x, y, z, c) => c.set('#E0A458')), g: -6, life: 0.9 },
  dust: { geo: () => colorGeo(new THREE.IcosahedronGeometry(0.032, 1), (x, y, z, c) => c.set('#F1DDB8')), g: 0.4, life: 0.7 },
  heart: { geo: heartGeo, g: 0.6, life: 1.4 },
  bubble: { geo: () => colorGeo(new THREE.SphereGeometry(0.06, 10, 8), (x, y, z, c) => c.set(y > 0.03 && x < 0 ? '#FFFFFF' : '#BDEBFF')), g: 0.5, life: 1.6 },
  sparkle: { geo: () => colorGeo(new THREE.OctahedronGeometry(0.035, 0).scale(1, 1.6, 1), (x, y, z, c) => c.set('#FFE680')), g: 0, life: 0.5 },
};

export function createFx(mat) {
  const rnd = mulberry32(77);
  const group = new THREE.Group(); group.name = 'fx';
  const pools = {};
  for (const [k, d] of Object.entries(KINDS)) {
    const m = new THREE.InstancedMesh(d.geo(), mat, CAP); m.name = `fx-${k}`; m.count = 0; m.frustumCulled = false;
    group.add(m);
    pools[k] = { mesh: m, list: [], next: 0 };
  }
  const counts = { crumb: 0, dust: 0, heart: 0, bubble: 0, sparkle: 0, heartScale: 0 };
  // at: {x, y, z}; opts: { scale, spread, up, dir: {x, z} }
  function emit(kind, at, n = 1, { scale = 1, spread = 0.3, up = 1.2, ring = false } = {}) {
    const P = pools[kind];
    for (let i = 0; i < n; i++) {
      const a = ring ? (i / n) * Math.PI * 2 : rnd() * Math.PI * 2, sp = ring ? spread : spread * (0.4 + 0.6 * rnd());
      const p = { x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * sp, vy: up * (ring ? 0.2 : 0.6 + 0.4 * rnd()), vz: Math.sin(a) * sp, age: 0, life: KINDS[kind].life * (0.8 + 0.4 * rnd()), s: scale, spin: rnd() * 6 };
      if (P.list.length < CAP) P.list.push(p); else { P.list[P.next] = p; P.next = (P.next + 1) % CAP; }
    }
    counts[kind] += n;
    if (kind === 'heart') counts.heartScale = scale;
  }
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  function step(dt, cam = null) {
    for (const [k, P] of Object.entries(pools)) {
      const d = KINDS[k];
      let n = 0;
      for (let i = P.list.length - 1; i >= 0; i--) {
        const p = P.list[i];
        p.age += dt;
        if (p.age >= p.life) {
          if (k === 'bubble') emit('sparkle', p, 3, { spread: 0.4, up: 0.3 });   // bubbles pop with sparkles
          P.list.splice(i, 1); P.next = Math.min(P.next, P.list.length ? P.list.length - 1 : 0); continue;
        }
        p.vy += d.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (k !== 'crumb') { p.vx *= 0.97; p.vz *= 0.97; }
      }
      for (const p of P.list) {
        const u = p.age / p.life;
        const sc = p.s * (k === 'heart' ? Math.min(1, u * 5) * (1 - Math.max(0, u - 0.8) * 5) : k === 'dust' ? (1 + u) * (1 - u * u) : k === 'sparkle' ? 1 - u : 1 - Math.max(0, u - 0.85) * 6);
        e.set(0, k === 'heart' ? (cam ? Math.atan2(cam.position.x - p.x, cam.position.z - p.z) : 0) + Math.sin(p.age * 3) * 0.3 : p.spin + p.age * 4, 0);   // hearts face the camera
        M.compose(v.set(p.x, p.y, p.z), q.setFromEuler(e), s.setScalar(Math.max(0.001, sc)));
        P.mesh.setMatrixAt(n++, M);
      }
      P.mesh.count = n; P.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  function clear() { for (const P of Object.values(pools)) { P.list.length = 0; P.next = 0; P.mesh.count = 0; } }
  return { group, emit, step, counts, clear, pools };
}
