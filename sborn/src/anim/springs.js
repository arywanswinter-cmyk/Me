// springs.js — Verlet springs for flexible parts (tails, antennae, stalks, whiskers, tufts, waving fins).
// Exports: createSprings(rig, shape) -> { step(dt, toWorld, toRig), reset(toWorld), tips(out), count, particles }.
// Invariants: 120 Hz with 2 substeps per 60 Hz step; pose pull k_i = 0.25·(1 − 0.6 i/n) toward the animated (FK) pose,
//   damping 0.9, gravity × 0.2; segment lengths kept; ≤ 64 particles in all (chains past the cap stay rigid);
//   particles live in world space so the body's own motion swings them; only chain-bone local rotations are written.
import * as THREE from 'three';
import { aimBone } from './ik.js';

const MAXP = 64, G = new THREE.Vector3(0, -9.81 * 0.2, 0);

export function createSprings(rig, shape) {
  // one chain per socket that has c1..c3: joints socket(c0, pinned), c1 (pinned to FK), c2, c3, tip (free)
  const chains = [];
  let count = 0;
  for (const s of shape.sockets) {
    if (s.bones.c1 === undefined || count + 3 > MAXP) continue;
    const b = [s.bone, s.bones.c1, s.bones.c2, s.bones.c3];
    const R = (i) => new THREE.Vector3(rig.rest[b[i] * 3], rig.rest[b[i] * 3 + 1], rig.rest[b[i] * 3 + 2]);
    const tipRest = R(3).clone().multiplyScalar(4 / 3).addScaledVector(R(0), -1 / 3);   // c3 + (c3 − c2) along the axis
    const restDirs = [R(2).sub(R(1)), R(3).sub(R(2)), tipRest.clone().sub(R(3))];
    const lens = restDirs.map((d) => d.length());
    const pts = [0, 1, 2].map(() => ({ x: new THREE.Vector3(), prev: new THREE.Vector3(), tgt: new THREE.Vector3() }));
    chains.push({ b, tipRest, restDirs, lens, pts, k: [0, 1, 2].map((i) => 0.25 * (1 - 0.6 * (i + 1) / 3)), anchor: new THREE.Vector3() });
    count += 3;
  }
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), rp = new THREE.Vector3(), q = new THREE.Quaternion();
  const ident = (p, out) => out.copy(p);

  // the FK (animated) positions of c2, c3 and the tip, with chain locals at rest, in world
  function targets(toWorld) {
    for (const c of chains) for (let i = 1; i <= 3; i++) rig.local[c.b[i]].identity();
    rig.fk();
    for (const c of chains) {
      rig.jointWorld(c.b[1], tmp); toWorld(tmp, c.anchor);
      rig.jointWorld(c.b[2], tmp); toWorld(tmp, c.pts[0].tgt);
      rig.jointWorld(c.b[3], tmp); toWorld(tmp, c.pts[1].tgt);
      // tip: c3's world transform applied to its rest offset
      tmp.copy(c.tipRest).sub(rp.set(rig.rest[c.b[3] * 3], rig.rest[c.b[3] * 3 + 1], rig.rest[c.b[3] * 3 + 2])).applyMatrix4(rig.world[c.b[3]]);
      toWorld(tmp, c.pts[2].tgt);
    }
  }
  function reset(toWorld = ident) {
    targets(toWorld);
    for (const c of chains) for (const p of c.pts) { p.x.copy(p.tgt); p.prev.copy(p.tgt); }
  }
  function step(dt, toWorld = ident, toRig = ident) {
    if (!chains.length) return;
    targets(toWorld);
    const h = dt / 2;
    for (let sub = 0; sub < 2; sub++) {
      for (const c of chains) {
        let prevP = c.anchor;
        for (let i = 0; i < 3; i++) {
          const p = c.pts[i];
          tmp.copy(p.x).sub(p.prev).multiplyScalar(0.9);                  // damped velocity
          p.prev.copy(p.x);
          p.x.add(tmp).addScaledVector(G, h * h);
          p.x.lerp(p.tgt, c.k[i]);                                         // pose pull
          tmp.copy(p.x).sub(prevP); const l = tmp.length() || 1e-9;        // keep the segment length
          p.x.copy(prevP).addScaledVector(tmp, c.lens[i] / l);
          prevP = p.x;
        }
      }
    }
    // write rotations level by level: c1 aims at p0, c2 at p1, c3 at the tip
    for (let lvl = 0; lvl < 3; lvl++) {
      for (const c of chains) {
        const from = lvl === 0 ? c.anchor : c.pts[lvl - 1].x;
        toRig(from, tmp); toRig(c.pts[lvl].x, tmp2);
        aimBone(rig, c.b[lvl + 1], c.restDirs[lvl], tmp2.sub(tmp), q);
      }
      rig.fk();
    }
  }
  function tips(out = []) { out.length = 0; for (const c of chains) out.push(c.pts[2].x); return out; }
  return { step, reset, tips, count, chains };
}
