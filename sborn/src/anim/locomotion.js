// locomotion.js — walking for any leg count: gait clock, planted feet locked in world, swing arcs, body spring, IK.
// Exports: createLocomotion(c, { ground }) -> Loco { state, setMove(dirX, dirZ, mag, run), step(dt), legs, gait, metrics,
//          rigToWorld(p, out), worldToRig(p, out), contact(leg, out), resetFeet(), stateHash() }.
// Invariants: fixed-step and deterministic; a planted foot never moves in world space; a foot never lifts if that would
//   leave fewer planted feet than the gait's minimum; contact = tip-socket origin minus tip radius along the ground
//   normal (never the IK target); per-step work allocates nothing.
import * as THREE from 'three';
import { legLayout, chooseGait, speeds, strideFor, smootherstep } from './gait.js';
import { solveLimb } from './ik.js';

const flatGround = { height: () => 0, normal: (x, z, out) => out.set(0, 1, 0) };

export function createLocomotion(c, { ground = flatGround, stats = {} } = {}) {
  const { rig, shape, roles } = c;
  const minY = c.minY;
  const legsL = legLayout(shape, roles);
  const st = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, yawRate: 0, clock: 0, run: 0, bodyY: 0, bodyVY: 0, t: 0, moving: false };
  const input = { x: 0, z: 0, mag: 0, run: false };
  // rest hip height L: mean leg-root height above the ground (or body centre height when legless)
  let L = 0;
  for (const g of legsL) L += g.limb.joints[0][1] - minY;
  L = legsL.length ? L / legsL.length : Math.max(0.15, (rig.rest[rig.pelvis * 3 + 1] - minY));
  const sp = speeds(L, stats);
  const legs = legsL.map((g) => {
    const Lb = g.limb, n = Lb.joints.length;
    const tip = Lb.joints[n - 1], tipR = Lb.radii[n - 1];
    const hip = Lb.joints[0];
    // pole: rest knee offset from the hip→tip line (falls back to forward)
    const pole = new THREE.Vector3(0, 0, 1);
    if (n >= 3) {
      const h = new THREE.Vector3(...hip), t = new THREE.Vector3(...tip), k = new THREE.Vector3(...Lb.joints[1]);
      const d = t.clone().sub(h).normalize();
      const off = k.clone().sub(h); off.addScaledVector(d, -off.dot(d));
      if (off.lengthSq() > 1e-8) pole.copy(off.normalize());
    }
    let reachLen = 0; for (let j = 1; j < n; j++) reachLen += Math.hypot(Lb.joints[j][0] - Lb.joints[j - 1][0], Lb.joints[j][1] - Lb.joints[j - 1][1], Lb.joints[j][2] - Lb.joints[j - 1][2]);
    return { ...g, tipBone: Lb.tipBone, tipR, n, reachLen,
      restContact: new THREE.Vector3(tip[0], minY, tip[2]),          // rig space, on the ground
      pole, planted: true, lock: new THREE.Vector3(), liftFrom: new THREE.Vector3(), td: new THREE.Vector3(),
      swingT: 0, swingDur: 0.3, stanceT: 0, stepLen: 0, reach: false, drift: 0, pen: 0, gap: 0, stanceSteps: 0, phase: 0 };
  });
  let gait = chooseGait(legs, 0, null);
  const metrics = { stances: [], gaitSteps: {}, lastGait: gait.id, reachLimited: 0, stanceCount: 0, minPlantedViolations: 0, steps: 0 };

  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
  const tgt = new THREE.Vector3(), ikOut = {};
  const cosY = () => Math.cos(st.yaw), sinY = () => Math.sin(st.yaw);
  // rig → world: rotateY(yaw)·(p + (0, −minY, 0)) + (x, 0, z)
  function rigToWorld(p, out) {
    const cy = cosY(), sy = sinY(), x = p.x, y = p.y - minY, z = p.z;
    return out.set(cy * x + sy * z + st.x, y, -sy * x + cy * z + st.z);
  }
  function worldToRig(p, out) {
    const cy = cosY(), sy = sinY(), x = p.x - st.x, z = p.z - st.z;
    return out.set(cy * x - sy * z, p.y + minY, sy * x + cy * z);
  }
  // offset (rig xz) rotated into world by a yaw
  function rotXZ(x, z, yaw, out) { const c2 = Math.cos(yaw), s2 = Math.sin(yaw); out.x = c2 * x + s2 * z; out.z = -s2 * x + c2 * z; return out; }
  function contact(leg, out) {
    rigToWorld(rig.jointWorld(leg.tipBone, _w), out);
    ground.normal(out.x, out.z, _n);
    return out.addScaledVector(_n, -leg.tipR);
  }
  function desiredFoot(leg, tAhead, lead, out) {
    const yawP = st.yaw + st.yawRate * (tAhead + lead);
    rotXZ(leg.restContact.x, leg.restContact.z, yawP, out);
    out.x += st.x + st.vx * (tAhead + lead); out.z += st.z + st.vz * (tAhead + lead);
    out.y = ground.height(out.x, out.z);
    return out;
  }
  function resetFeet() {
    rig.toRest(); rig.fk();
    for (const leg of legs) { desiredFoot(leg, 0, 0, leg.lock); leg.planted = true; leg.td.copy(leg.lock); leg.drift = 0; leg.pen = 0; leg.gap = 0; leg.stanceT = 0; }
    st.bodyY = 0; st.bodyVY = 0;
  }
  function setMove(x, z, mag, run = false) { input.x = x; input.z = z; input.mag = Math.min(1, Math.max(0, mag)); input.run = run; }

  function plantedCount() { let k = 0; for (const l of legs) if (l.planted) k++; return k; }
  function endStance(leg) {
    if (leg.stanceSteps > 2) { metrics.stances.push({ leg: legs.indexOf(leg), drift: leg.drift, pen: leg.pen, gap: leg.gap, reach: leg.reach, gait: gait.id, steps: leg.stanceSteps }); metrics.stanceCount++; if (leg.reach) metrics.reachLimited++; }
    if (metrics.stances.length > 4000) metrics.stances.splice(0, 1000);
  }

  function step(dt) {
    st.t += dt; metrics.steps++;
    // ---- velocity and heading ----
    const vmax = input.run ? sp.run : sp.walk;
    const dvx = input.x * input.mag * vmax - st.vx, dvz = input.z * input.mag * vmax - st.vz;
    const amax = 1.5 * Math.sqrt(Math.max(0.2, L) / 0.5) * dt, dl = Math.hypot(dvx, dvz);
    const k = dl > amax ? amax / dl : 1;
    st.vx += dvx * k; st.vz += dvz * k;
    st.speed = Math.hypot(st.vx, st.vz);
    if (st.speed > 0.02 || input.mag > 0.05) {
      const want = Math.atan2(input.mag > 0.05 ? input.x : st.vx, input.mag > 0.05 ? input.z : st.vz);
      let d = want - st.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const maxRate = (120 * Math.PI / 180) * Math.pow(Math.max(0.1, L) / 0.5, -0.5);
      const rate = Math.max(-maxRate, Math.min(maxRate, d * 6));
      st.yawRate = rate; st.yaw += rate * dt;
    } else st.yawRate = 0;
    st.x += st.vx * dt; st.z += st.vz * dt;
    st.moving = st.speed >= 0.05;
    // ---- gait ----
    const Fr = (st.speed * st.speed) / (9.81 * L);
    const g2 = chooseGait(legs, Fr, gait.id);
    if (g2.id !== gait.id) gait = g2; else gait.offsets = g2.offsets;
    metrics.gaitSteps[gait.id] = (metrics.gaitSteps[gait.id] || 0) + 1; metrics.lastGait = gait.id;
    const { S, rate } = strideFor(Math.max(st.speed, 0.05), L, gait.beta);
    if (st.moving) st.clock = (st.clock + rate * dt) % 1;
    const T = 1 / rate;
    st.run = Fr >= 0.5 ? 1 : 0;
    // ---- legs ----
    let swinging = 0; for (const l of legs) if (!l.planted) swinging++;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      leg.phase = (st.clock + gait.offsets[i]) % 1;
      if (leg.planted) {
        leg.stanceT += dt;
        desiredFoot(leg, 0, 0, tgt);
        const err = Math.hypot(tgt.x - leg.lock.x, tgt.z - leg.lock.z);
        let want = false;
        if (st.moving) want = (leg.phase >= gait.beta && leg.stanceT > 0.4 * gait.beta * T) || err > 0.6 * S;
        else want = err > 0.15 * L && swinging === 0;
        if (want && plantedCount() - 1 >= (st.moving ? gait.minPlanted : Math.max(gait.minPlanted, legs.length - 1))) {
          endStance(leg);
          leg.planted = false; leg.liftFrom.copy(leg.lock); leg.swingT = 0;
          leg.swingDur = st.moving ? Math.max(0.12, (1 - gait.beta) * T) : 0.25;
          leg.stepLen = st.moving ? S : err; swinging++;
        }
      }
      if (!leg.planted) {
        leg.swingT += dt;
        const u = Math.min(1, leg.swingT / leg.swingDur);
        desiredFoot(leg, Math.max(0, leg.swingDur - leg.swingT), st.moving ? gait.beta * T / 2 : 0, tgt);
        const s = smootherstep(u);
        leg.lock.x = leg.liftFrom.x + (tgt.x - leg.liftFrom.x) * s;
        leg.lock.z = leg.liftFrom.z + (tgt.z - leg.liftFrom.z) * s;
        const H = Math.min(0.3 * L, Math.max(0.06 * L, 0.1 * L + 0.15 * leg.stepLen));
        const gy = leg.liftFrom.y + (tgt.y - leg.liftFrom.y) * s;
        leg.lock.y = gy + H * Math.sin(Math.PI * Math.pow(u, 0.8));
        if (u >= 1) {
          leg.planted = true; leg.lock.set(tgt.x, tgt.y, tgt.z); leg.stanceT = 0; swinging--;
          leg.drift = 0; leg.pen = 0; leg.gap = 0; leg.stanceSteps = 0; leg.reach = false; leg.tdPending = true;
        }
      }
    }
    if (legs.length && plantedCount() < Math.min(gait.minPlanted, legs.length)) metrics.minPlantedViolations++;
    // ---- body height: critically damped spring (ω 10) ----
    let gh = 0;
    for (const leg of legs) gh += ground.height(leg.lock.x, leg.lock.z);
    gh = legs.length ? gh / legs.length : ground.height(st.x, st.z);
    // lower the body so every planted foot stays within 0.98 × reach (reach-limited steps lower the body)
    let lower = 0;
    for (const leg of legs) {
      if (!leg.planted && leg.swingT < 0.6 * leg.swingDur) continue;
      _v.set(leg.limb.joints[0][0], leg.limb.joints[0][1], leg.limb.joints[0][2]);
      rigToWorld(_v, _w);
      const hx = leg.lock.x - _w.x, hz = leg.lock.z - _w.z, hd2 = hx * hx + hz * hz;
      const R = 0.93 * leg.reachLen;
      const dvMax = Math.sqrt(Math.max(0, R * R - hd2));
      const dv = _w.y - (leg.lock.y + leg.tipR);
      if (dv - dvMax > lower) lower = dv - dvMax;
    }
    lower = Math.min(lower, 0.45 * L);
    const targetY = gh - 0.08 * st.run * L - lower;
    const w0 = 10, acc = w0 * w0 * (targetY - st.bodyY) - 2 * w0 * st.bodyVY;
    st.bodyVY += acc * dt; st.bodyY += st.bodyVY * dt;
    // ---- pose: pelvis, FK, IK, FK ----
    rig.offset.set(0, st.bodyY, 0);
    rig.fk();
    for (const leg of legs) {
      // IK target for the tip-socket origin: foot lock + tip radius along the ground normal
      ground.normal(leg.lock.x, leg.lock.z, _n);
      _v.copy(leg.lock).addScaledVector(_n, leg.tipR);
      worldToRig(_v, tgt);
      solveLimb(rig, leg.limb, tgt, leg.pole, ikOut);
      if (leg.planted && ikOut.reach) leg.reach = true;
    }
    rig.fk();
    // ---- contact metrics for planted feet ----
    for (const leg of legs) {
      if (!leg.planted) continue;
      contact(leg, _w);
      if (leg.tdPending) { leg.td.copy(_w); leg.tdPending = false; }
      leg.stanceSteps++;
      const gy = ground.height(_w.x, _w.z);
      leg.drift = Math.max(leg.drift, Math.hypot(_w.x - leg.td.x, _w.z - leg.td.z));
      leg.pen = Math.max(leg.pen, gy - _w.y);
      leg.gap = Math.max(leg.gap, _w.y - gy);
    }
  }

  function stateHash() {
    let h = rig.stateHash();
    const f = new Float32Array(1), u = new Uint32Array(f.buffer);
    const mix = (x) => { f[0] = Math.round(x * 1e6) / 1e6; h ^= u[0]; h = Math.imul(h, 16777619); };
    mix(st.x); mix(st.z); mix(st.yaw);
    for (const l of legs) { mix(l.planted ? 1 : 0); mix(l.lock.x); mix(l.lock.y); mix(l.lock.z); }
    return h >>> 0;
  }
  resetFeet();
  return { state: st, setMove, step, legs, get gait() { return gait; }, metrics, rigToWorld, worldToRig, contact, resetFeet, stateHash, L, speeds: sp };
}
