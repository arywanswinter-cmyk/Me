// idle.js — idle life on the rig: breathing, blinks (70/30/110 ms, 12% doubles), micro-saccades, eye tracking, tail sway.
// Exports: createIdle(seed, { reduced }) -> Idle { step(dt, rig, shape, lookRig|null, opts), state, blinkLog, breath(), eyeAngles(rig, shape, target) }.
// Eye look and blinks follow Doodle World src/creature/creature.js (look clamp 0.55 rad, slerp 1 − e^(−10 dt)), on bones.
// Invariants: deterministic for a seed (no Math.random); writes only local rotations/scales of eye, lid, chest and tail bones
//   after the caller's pose, so it layers on top of locomotion; allocation-free per step.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const LOOK_MAX = 0.55;
export function createIdle(seed = 1, { reduced = false } = {}) {
  const rnd = mulberry32(seed >>> 0);
  const st = { t: 0, breathPhase: 0, breathPeriod: 3.2, blinkIn: 1.2 + rnd() * 2, blinkT: -1, doubleLeft: 0, sacIn: 0.8, sac: new THREE.Vector2(), blinkCount: 0, closedAmt: 0, chest: 1, eyeQ: [] };
  const blinkLog = [];
  const qp = new THREE.Quaternion(), qa = new THREE.Quaternion(), qt = new THREE.Quaternion(), axis = new THREE.Vector3(), v = new THREE.Vector3(), rest = new THREE.Vector3(), eyeW = new THREE.Vector3(), eul = new THREE.Euler();
  // blink envelope: close 70 ms, hold 30 ms, open 110 ms
  function lidAmount(t) { if (t < 0) return 0; if (t < 0.07) return t / 0.07; if (t < 0.1) return 1; if (t < 0.21) return 1 - (t - 0.1) / 0.11; return 0; }

  function step(dt, rig, shape, look, { breathScale = 1, running = false, extraDilate = 0 } = {}) {
    st.t += dt;
    st.breathPeriod += ((running ? 1.6 : 3.2) - st.breathPeriod) * Math.min(1, dt * 0.5);
    st.breathPhase = (st.breathPhase + dt / st.breathPeriod) % 1;
    const br = Math.sin(st.breathPhase * Math.PI * 2);
    st.chest = 1 + 0.012 * br * breathScale;
    // chest bone: the vertebra 60% of the way from pelvis to head
    const nV = shape.vertebrae.length, chest = Math.min(nV - 1, Math.round(rig.pelvis + (nV - 1 - rig.pelvis) * 0.6));
    rig.scale[chest].set(1 + 0.006 * br * breathScale, st.chest, 1 + 0.006 * br * breathScale);
    // blinks
    st.blinkIn -= dt;
    if (st.blinkIn <= 0 && st.blinkT < 0) { st.blinkT = 0; st.blinkCount++; blinkLog.push(st.t); if (blinkLog.length > 200) blinkLog.shift(); }
    if (st.blinkT >= 0) {
      st.blinkT += dt;
      if (st.blinkT > 0.21) {
        st.blinkT = -1;
        if (st.doubleLeft > 0) { st.doubleLeft--; st.blinkIn = 0.12; }
        else { st.blinkIn = 2.5 + rnd() * 3.5; if (rnd() < 0.12) st.doubleLeft = 1; }
      }
    }
    const closed = lidAmount(st.blinkT);
    st.closedAmt = closed;
    // micro-saccades ±1.5° every 0.6–1.8 s
    st.sacIn -= dt;
    if (st.sacIn <= 0) { st.sacIn = 0.6 + rnd() * 1.2; st.sac.set((rnd() - 0.5) * 0.052, (rnd() - 0.5) * 0.052); }
    // eyes
    let ei = 0;
    for (const s of shape.sockets) {
      const isEye = s.bones.ball !== undefined;
      if (!isEye) continue;
      const ball = s.bones.ball;
      const Y = s.frame.Y, mx = s.mirrored ? -1 : 1;
      rest.set(Y[0] * mx, Y[1], Y[2]);
      if (!st.eyeQ[ei]) st.eyeQ[ei] = new THREE.Quaternion();
      const q = st.eyeQ[ei];
      if (look) {
        rig.jointWorld(ball, eyeW);
        v.copy(look).sub(eyeW).normalize();
        // express in the parent's frame so the clamp is about the eye's rest axis
        rig.worldQuat(rig.parent[ball], qp);
        v.applyQuaternion(qa.copy(qp).invert());
        const ang = v.angleTo(rest);
        if (ang > LOOK_MAX) { axis.crossVectors(rest, v).normalize(); v.copy(rest).applyAxisAngle(axis, LOOK_MAX); }
        qt.setFromUnitVectors(rest, v);
      } else qt.identity();
      eul.set(st.sac.y, st.sac.x, 0); qa.setFromEuler(eul); qt.premultiply(qa);
      q.slerp(qt, 1 - Math.exp(-10 * dt));
      rig.local[ball].copy(q);
      // lids: rotate about the eye's X axis (mirrored twins rotate the other way about the mirrored axis)
      const X = s.frame.X;
      axis.set(X[0] * mx, X[1], X[2]).normalize();
      if (s.bones.lidU !== undefined) {
        rig.local[s.bones.lidU].setFromAxisAngle(axis, -mx * THREE.MathUtils.degToRad(95) * closed);
        rig.local[s.bones.lidL].setFromAxisAngle(axis, mx * THREE.MathUtils.degToRad(30) * closed);
      } else {
        rig.scale[ball].set(1, 1, 1);
        const sq = 1 - 0.9 * closed;
        // lidless: squash along the frame Z (up) axis — approximated by a uniform squash of the ball's Y in rig space
        rig.scale[ball].set(1, sq, 1);
      }
      ei++;
    }
    // tail sway 0.4 Hz on the last two tail vertebrae (index 0 is the tail end)
    if (!reduced && nV >= 3 && rig.pelvis > 1) {
      const sway = Math.sin(st.t * Math.PI * 2 * 0.4) * 0.06;
      qa.setFromAxisAngle(axis.set(0, 1, 0), sway);
      rig.local[0].multiply(qa);
      rig.local[1].multiply(qt.setFromAxisAngle(axis, sway * 0.5));
    }
    // tail parts sway side to side at 0.4 Hz about the body's up axis (springs carry it to the tip)
    if (!reduced) {
      const sw = Math.sin(st.t * Math.PI * 2 * 0.4) * 0.22;
      for (const s of shape.sockets) if (s.t.startsWith('tail.') && !s.tip) rig.local[s.bone].multiply(qa.setFromAxisAngle(axis.set(0, 1, 0), s.mirrored ? -sw : sw));
    }
  }
  // how far each eye's gaze is from a target (rig space): [{ bone, deg }]
  const g = new THREE.Vector3(), w = new THREE.Vector3(), wq = new THREE.Quaternion();
  function eyeAngles(rig, shape, target) {
    const out = [];
    for (const s of shape.sockets) {
      if (s.bones.ball === undefined) continue;
      const Y = s.frame.Y, mx = s.mirrored ? -1 : 1;
      g.set(Y[0] * mx, Y[1], Y[2]).applyQuaternion(rig.worldQuat(s.bones.ball, wq));
      rig.jointWorld(s.bones.ball, w); w.subVectors(target, w);
      out.push({ bone: s.bones.ball, deg: THREE.MathUtils.radToDeg(g.angleTo(w)) });
    }
    return out;
  }
  return { step, state: st, blinkLog, breath: () => st.chest, eyeAngles };
}
