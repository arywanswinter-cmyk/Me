// locomotion.js — walking for any leg count: gait clock, planted feet locked in world, swing arcs, body spring, IK.
// Exports: createLocomotion(c, { ground }) -> Loco { state, setMove(dirX, dirZ, mag, run), step(dt), legs, gait, metrics,
//          rigToWorld(p, out), worldToRig(p, out), contact(leg, out), resetFeet(), stateHash() }.
// Invariants: fixed-step and deterministic; a planted foot never moves in world space; a foot never lifts if that would
//   leave fewer planted feet than the gait's minimum; contact = tip-socket origin minus tip radius along the ground
//   normal (never the IK target); per-step work allocates nothing.
import * as THREE from 'three';
import { legLayout, chooseGait, speeds, strideFor, smootherstep } from './gait.js';
import { solveLimb } from './ik.js';
import { wingPose } from './flight.js';

const flatGround = { height: () => 0, normal: (x, z, out) => out.set(0, 1, 0) };

export function createLocomotion(c, { ground = flatGround, stats = {}, flight = null } = {}) {
  const { rig, shape, roles } = c;
  const minY = c.minY;
  const parts = c.parts || null;
  const legsL = legLayout(shape, roles);
  const st = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0, yawRate: 0, clock: 0, run: 0, bodyY: 0, bodyVY: 0, t: 0, moving: false };
  const input = { x: 0, z: 0, mag: 0, run: false, turn: null };
  // rest hip height L: mean leg-root height above the ground (or body centre height when legless)
  // (the shortest leg sets it, so the stride never outreaches any leg)
  let L = Infinity;
  for (const g of legsL) L = Math.min(L, g.limb.joints[0][1] - minY);
  if (!legsL.length) L = Math.max(0.15, (rig.rest[rig.pelvis * 3 + 1] - minY));
  const sp = speeds(L, stats);
  // legless: slither (≥ 8 vertebrae) or squash-hop; both move at least 0.55 m/s so a small body still covers ground
  const nV = shape.vertebrae.length, slither = legsL.length === 0 && nV >= 8, hopper = legsL.length === 0 && !slither;
  if (legsL.length === 0) sp.walk = Math.max(sp.walk, 0.55);
  let bodyLen = 0; for (let i = 1; i < nV; i++) bodyLen += Math.hypot(rig.rest[i * 3 + 1] - rig.rest[(i - 1) * 3 + 1], rig.rest[i * 3 + 2] - rig.rest[(i - 1) * 3 + 2]);
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
    // contact point: a foot part's lowest L0 vertex at rest (index stored), else the tip minus its radius
    let foot = null;
    const cOff = new THREE.Vector3(0, -tipR, 0);
    if (parts) {
      const fi = parts.instances.find((q) => q.socket.tip && q.socket.limb === Lb.id && !!q.socket.mirrored === !!Lb.mirrored && q.lowest);
      if (fi) {
        const m = parts.meshes[fi.lowest.bucket], pa = m.geometry.attributes.position, si = m.geometry.attributes.skinIndex;
        foot = { mesh: m, index: fi.lowest.index, bone: si.getX(fi.lowest.index) };
        cOff.set(pa.getX(foot.index) - tip[0], pa.getY(foot.index) - tip[1], pa.getZ(foot.index) - tip[2]);
      }
    }
    return { ...g, tipBone: Lb.tipBone, tipR, n, reachLen, foot, cOff,
      restContact: new THREE.Vector3(tip[0] + cOff.x, minY, tip[2] + cOff.z),          // rig space, on the ground
      pole, planted: true, lock: new THREE.Vector3(), liftFrom: new THREE.Vector3(), td: new THREE.Vector3(),
      swingT: 0, swingDur: 0.3, stanceT: 0, stepLen: 0, reach: false, drift: 0, pen: 0, gap: 0, stanceSteps: 0, phase: 0 };
  });
  let gait = chooseGait(legs, 0, null);
  let footR = 0.1; for (const l of legs) footR = Math.max(footR, Math.hypot(l.restContact.x, l.restContact.z));

  const metrics = { stances: [], gaitSteps: {}, lastGait: gait.id, reachLimited: 0, stanceCount: 0, minPlantedViolations: 0, steps: 0 };

  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
  const tgt = new THREE.Vector3(), ikOut = {}, _r2 = { x: 0, z: 0 };
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
  // the contact point in world: the foot vertex skinned exactly as the GPU does (bone matrix · inverse · rest), or the
  // tip-socket origin minus the tip radius along the ground normal
  const _m4 = new THREE.Matrix4();
  function contact(leg, out) {
    if (leg.foot) {
      const f = leg.foot, b = f.bone;
      _m4.copy(rig.world[b]); const sc = rig.scale[b]; if (sc.x !== 1 || sc.y !== 1 || sc.z !== 1) _m4.scale(sc);   // = bone.matrix after apply()
      _m4.multiply(rig.skeleton.boneInverses[b]);
      _v.fromBufferAttribute(f.mesh.geometry.attributes.position, f.index).applyMatrix4(_m4);
      return rigToWorld(_v, out);
    }
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
  function setTurn(yaw) { input.turn = yaw; }
  function setMove(x, z, mag, run = false) { input.x = x; input.z = z; input.mag = Math.min(1, Math.max(0, mag)); input.run = run; }

  function plantedCount() { let k = 0; for (const l of legs) if (l.planted) k++; return k; }
  function endStance(leg) {
    if (leg.stanceSteps > 2) { metrics.stances.push({ leg: legs.indexOf(leg), drift: leg.drift, pen: leg.pen, gap: leg.gap, reach: leg.reach, gait: gait.id, steps: leg.stanceSteps }); metrics.stanceCount++; if (leg.reach) metrics.reachLimited++; }
    if (metrics.stances.length > 4000) metrics.stances.splice(0, 1000);
  }

  function step(dt) {
    st.t += dt; metrics.steps++;
    // ---- velocity and heading ----
    const vmax = st.air && st.air.mode === 'fly' ? sp.run * 1.4 : input.run ? sp.run : sp.walk;
    const dvx = input.x * input.mag * vmax - st.vx, dvz = input.z * input.mag * vmax - st.vz;
    const amax = 1.5 * Math.sqrt(Math.max(0.2, L) / 0.5) * dt, dl = Math.hypot(dvx, dvz);
    const k = dl > amax ? amax / dl : 1;
    st.vx += dvx * k; st.vz += dvz * k;
    st.speed = Math.hypot(st.vx, st.vz);
    if (st.speed > 0.02 || input.mag > 0.05 || input.turn !== null) {
      // turn in place (speed < 0.1 m/s, yaw error > 10°) is driven by setTurn; feet step through idle settle
      const want = input.turn !== null && input.mag <= 0.05 ? input.turn : Math.atan2(input.mag > 0.05 ? input.x : st.vx, input.mag > 0.05 ? input.z : st.vz);
      let d = want - st.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      let maxRate = (120 * Math.PI / 180) * Math.pow(Math.max(0.1, L) / 0.5, -0.5);
      // in place, feet step one at a time (n − 1 planted): cap the rate so each foot falls behind by at most ~0.5 L
      // per stepping cycle (n steps of 0.25 s)
      if (st.speed < 0.1 && legs.length) maxRate = Math.min(maxRate, (0.5 * L) / (footR * legs.length * 0.25));
      const rate = Math.max(-maxRate, Math.min(maxRate, d * 6));
      st.yawRate = rate; st.yaw += rate * dt;
    } else st.yawRate = 0;
    st.x += st.vx * dt; st.z += st.vz * dt;
    st.moving = st.speed >= 0.05;
    if (st.air) { airStep(dt); return; }
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
      if (leg.held) continue;                              // an emote holds this leg up
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
          if (self.onPlant) self.onPlant(leg);
        }
      }
    }
    if (legs.length && plantedCount() < Math.min(gait.minPlanted, legs.length)) metrics.minPlantedViolations++;
    if (!legs.length) { leglessPose(dt); return; }
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
      rotXZ(leg.cOff.x, leg.cOff.z, st.yaw, _r2);                      // the IK target is lock − contact offset
      const hx = leg.lock.x - _r2.x - _w.x, hz = leg.lock.z - _r2.z - _w.z, hd2 = hx * hx + hz * hz;
      const R = 0.93 * leg.reachLen;
      const dvMax = Math.sqrt(Math.max(0, R * R - hd2));
      const dv = _w.y + st.bodyY - (leg.lock.y - leg.cOff.y);
      if (dv - dvMax > lower) lower = dv - dvMax;
    }
    lower = Math.min(lower, 0.45 * L);
    // ground following on a critically damped spring (ω 10); reach lowering applies at once and releases slowly,
    // so planted feet never fall out of reach while the spring catches up
    const targetY = gh - 0.08 * st.run * L;
    const w0 = 10, acc = w0 * w0 * (targetY - st.bodyY) - 2 * w0 * st.bodyVY;
    st.bodyVY += acc * dt; st.bodyY += st.bodyVY * dt;
    st.lower = lower >= (st.lower || 0) ? lower : Math.max(lower, (st.lower || 0) - 0.4 * dt);
    // ---- pose: pelvis, FK, IK, FK ----
    rig.toRest();
    rig.offset.set(0, st.bodyY - st.lower, 0);
    if (flight && flight.wings.length) wingPose(rig, flight, 'rest', st.t);
    if (self.emotes) self.emotes.posture(dt);          // posture layer: body moves, feet stay locked
    rig.fk();
    for (const leg of legs) {
      // IK target for the tip-socket origin: the foot lock minus the rest contact offset (the tip stays level in rig
      // space, so the offset is constant)
      if (leg.held) continue;
      worldToRig(leg.lock, tgt); tgt.sub(leg.cOff);
      solveLimb(rig, leg.limb, tgt, leg.pole, ikOut);
      if (leg.planted && ikOut.reach) leg.reach = true;
    }
    rig.fk();
    if (self.emotes) { self.emotes.gesture(dt); rig.fk(); }   // gesture layer: arms, head, jaw, lids, tail, wings
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

  // ---- air: jump, fly (takeoff, cruise, land with a flare), glide, wingless fallback ----
  const G = 9.81;
  const jumpH = () => Math.max(0.05, L) * (0.25 + 0.12 * (stats.Jump || 0));
  function launch(mode, vy) { st.air = { mode, y: 0, vy, t: 0, apex: 0, flaps: 0 }; for (const l of legs) { endStance(l); l.planted = false; } }
  function jump() { if (st.air) return false; launch('jump', Math.sqrt(2 * G * jumpH())); metrics.jumps = (metrics.jumps || 0) + 1; return true; }
  function toggleFly() {
    const A = st.air;
    if (flight && flight.canFly) {
      if (!A) { launch('fly', 0); metrics.flights = (metrics.flights || 0) + 1; return 'fly'; }
      if (A.mode === 'fly') { A.mode = 'land'; return 'land'; }
      return null;
    }
    if (flight && flight.canGlide) { if (A && (A.mode === 'jump' || A.mode === 'fall')) { A.mode = 'glide'; A.apex = Math.max(A.apex, A.y); return 'glide'; } if (!A) { jump(); return 'jump'; } return null; }
    if (!A) { launch('fallback', Math.sqrt(2 * G * jumpH() * 0.8)); return 'fallback'; }   // no wings: jump and flap the arms
    return null;
  }
  function touchDown() {
    const A = st.air; st.air = null; st.bodyY = 0; st.bodyVY = 0;
    metrics.landings = (metrics.landings || 0) + 1; metrics.lastLanding = { mode: A.mode, flareDeg: A.flareDeg || 0, t: A.t };
    for (const leg of legs) { desiredFoot(leg, 0, 0, leg.lock); leg.planted = true; leg.stanceT = 0; leg.stanceSteps = 0; leg.drift = 0; leg.pen = 0; leg.gap = 0; leg.reach = false; leg.tdPending = true; }
    if (self.onLand) self.onLand(A);
  }
  function airStep(dt) {
    const A = st.air; A.t += dt;
    const cruise = Math.max(1.5, 4 * L), h0 = ground.height(st.x, st.z);
    if (A.mode === 'jump' || A.mode === 'fallback' || A.mode === 'fall') { A.vy -= G * (A.mode === 'fallback' ? 0.8 : 1) * dt; A.y += A.vy * dt; }
    else if (A.mode === 'glide') { const vh = Math.max(st.speed, sp.walk); A.vy = -vh / (1 + (stats.Glide || 0)); A.y += A.vy * dt; if (st.speed < vh) { const f = vh / Math.max(1e-3, st.speed); if (st.speed > 1e-3) { st.vx *= f; st.vz *= f; } else { st.vx = Math.sin(st.yaw) * vh; st.vz = Math.cos(st.yaw) * vh; } } }
    else if (A.mode === 'fly') { const want = cruise; A.vy += ((want - A.y) * 6 - A.vy * 4) * dt; A.y += A.vy * dt; }
    else if (A.mode === 'land') { A.vy = -Math.min(1.4, 0.4 + A.y * 1.2); A.y += A.vy * dt; if (A.y < 0.6) A.flareDeg = 30; }
    A.apex = Math.max(A.apex, A.y);
    metrics.airSteps = (metrics.airSteps || 0) + 1;
    if (A.y <= 0 && A.t > 0.05) { A.y = 0; touchDown(); }
    // pose: body up by y, legs hang at rest (no IK), wings by mode
    rig.toRest();
    rig.offset.set(0, (st.air ? A.y : 0) + st.bodyY, 0);
    if (flight && flight.wings.length) wingPose(rig, flight, !st.air ? 'rest' : A.mode === 'land' && A.flareDeg ? 'flare' : A.mode === 'glide' ? 'glide' : A.mode === 'fly' || A.mode === 'land' ? 'flap' : 'rest', st.t, { big: A.t < 0.6 });
    rig.fk();
    for (const leg of legs) { contact(leg, leg.lock); }
  }

  // ---- legless locomotion ----
  // slither: lateral wave yaw_i = A_i·sin(2π(s_i/λ − f·t)), λ = 0.7 body lengths, A 0.2 (head) → 1.0 (tail), speed f·λ·0.6;
  // applied as per-vertebra lateral offsets (children inherit, so offsets are differenced) with the head counter-rotating
  const amp = 0.06;
  function leglessPose(dt) {
    rig.toRest();
    if (slither) {
      metrics.gaitSteps.slither = (metrics.gaitSteps.slither || 0) + 1; metrics.lastGait = 'slither';
      const lam = 0.7 * Math.max(0.2, bodyLen), f = st.speed / (0.6 * lam);
      st.wave = (st.wave || 0) + f * dt;
      const off = new Float64Array(nV);
      let sAcc = 0;
      for (let i = nV - 1; i >= 0; i--) {          // head (last vertebra) → tail
        if (i < nV - 1) sAcc += Math.hypot(rig.rest[i * 3 + 1] - rig.rest[(i + 1) * 3 + 1], rig.rest[i * 3 + 2] - rig.rest[(i + 1) * 3 + 2]);
        const u = sAcc / Math.max(1e-3, bodyLen), A = 0.2 + 0.8 * u;
        off[i] = A * amp * Math.max(0.3, bodyLen) * Math.sin(2 * Math.PI * (sAcc / lam - st.wave)) * Math.min(1, st.speed / 0.1);
      }
      // world offsets → per-bone extra translation relative to the parent (pelvis absolute)
      for (let i = 0; i < nV; i++) { const p = rig.parent[i]; rig.extraT[i].x = off[i] - (p >= 0 && p < nV ? off[p] : 0); }
      // the head counter-rotates toward the travel direction
      const h = nV - 1, dx = off[h] - off[h - 1], dz = rig.rest[h * 3 + 2] - rig.rest[(h - 1) * 3 + 2];
      rig.local[h].setFromAxisAngle(_up, Math.atan2(dx, Math.max(1e-3, dz)) * 0.8);
      st.hop = 0; st.squash = 1;
    } else {
      // squash-hop: arcs of 0.12 H at 2.2 Hz while moving, squash 0.9 at take-off and landing
      metrics.gaitSteps.hop = (metrics.gaitSteps.hop || 0) + 1; metrics.lastGait = 'hop';
      const moving = st.speed > 0.05;
      if (moving || (st.hopT || 0) > 0) { st.hopT = (st.hopT || 0) + dt * 2.2; if (st.hopT >= 1) { st.hopT = moving ? st.hopT - 1 : 0; if (moving && self.onHop) self.onHop(); } }
      st.hop = Math.sin(Math.PI * (st.hopT || 0)) * 0.12 * Math.max(0.3, L * 2);
      st.squash = (st.hopT || 0) < 0.1 || (st.hopT || 0) > 0.9 ? (moving ? 0.9 : 1) : 1.04;
    }
    rig.offset.set(0, st.hop, 0);
    if (self.emotes) self.emotes.posture(dt);
    rig.fk();
    if (self.emotes) { self.emotes.gesture(dt); rig.fk(); }
  }

  function stateHash() {
    let h = rig.stateHash();
    const f = new Float32Array(1), u = new Uint32Array(f.buffer);
    const mix = (x) => { f[0] = Math.round(x * 1e6) / 1e6; h ^= u[0]; h = Math.imul(h, 16777619); };
    mix(st.x); mix(st.z); mix(st.yaw);
    for (const l of legs) { mix(l.planted ? 1 : 0); mix(l.lock.x); mix(l.lock.y); mix(l.lock.z); }
    return h >>> 0;
  }
  const self = { emotes: null, state: st, setMove, setTurn, step, jump, toggleFly, flight, onLand: null, slither, hopper, onHop: null, legs, get gait() { return gait; }, metrics, rigToWorld, worldToRig, contact, resetFeet, stateHash, L, speeds: sp, onPlant: null };
  resetFeet();
  return self;
}
