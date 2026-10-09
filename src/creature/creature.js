// creature.js — turns pipeline data into a living Three.js creature.
// Exports: createCreature(data, { color, seed }) -> { group, body, setBirth(p), setWalk(amount, vx, vz), setGround(fn),
//          update(dt, t, lookWorld), boop(), jump(), setSleep(on), dispose(), lift, gait, legs, parts, radius, feetWorld }.
// Reactions: jump() crouches, springs up with its arms in the air and lands with a squash; setSleep(true) folds its
//   legs, droops, closes its eyes and puffs little z's until it wakes.
// Structure: group (world placement and heading) > rig (breath, squash, sway, crouch, hop; pivot at the body's lowest
//   point) > body + eyes. Stub feet hang off the group so they stay planted while the body breathes.
// Arms swing opposite the stride and fly up when booped; antennae, ears and horns flop and lag behind.
// Motion, Spore-style: every drawn foot has a world position. Planted feet stay put while the body moves over them;
//   when the gait says so a foot lifts, arcs forward to where the body will be, and plants again on the ground.
//   Two-bone IK turns each foot position into hip and knee angles for the vertex shader. The body rides at the
//   average height of its feet, crouches into its stride, bobs and waddles to the rhythm, and its top half lags
//   behind on a spring when it speeds up, stops or turns. Legless bodies hop on their stub feet.
// Invariants: setBirth(p) with p in [0,1] is the only thing that changes inflation; legs stay straight until the
//   first setWalk(); feet only lift when the creature is moving or a foot has been left behind; update() never
//   allocates per frame.
import * as THREE from 'three';
import { clayMaterial, clayDepthMaterial, clayOutlineMaterial } from './material.js';
import { TOON, inkOf } from '../core/look.js';
import { legRig, gaitFor, solveLeg, findAppendages } from './gait.js';
import { mulberry32 } from '../core/rng.js';

const Z = new THREE.Vector3(0, 0, 1);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

const SCLERA = new THREE.MeshPhysicalMaterial({ color: '#FFFDF7', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 });
const PUPIL = new THREE.MeshPhysicalMaterial({ color: '#15120E', roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.9 });

// Meshes that use every creature shader, so the stage can compile them before the first birth.
export function warmUpMeshes() {
  const white = document.createElement('canvas');
  white.width = white.height = 4;
  const wctx = white.getContext('2d'); wctx.fillStyle = '#fff'; wctx.fillRect(0, 0, 4, 4);
  const tex = new THREE.CanvasTexture(white);
  const g = new THREE.SphereGeometry(0.1, 8, 6);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('aInkUv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('aFront', new THREE.BufferAttribute(new Float32Array(n), 1));
  const meshes = [
    new THREE.Mesh(g, clayMaterial(new THREE.Color('#ffffff'), tex)),
    new THREE.Mesh(g, clayMaterial(new THREE.Color('#ffffff'), null, { vertexColors: false })),
    new THREE.Mesh(g, SCLERA),
    new THREE.Mesh(g, PUPIL),
  ];
  for (const m of meshes) m.castShadow = true;
  return meshes;
}

export function createCreature(data, { color, seed = 1 }) {
  const rnd = mulberry32(seed);
  const phase = rnd() * Math.PI * 2;
  const base = new THREE.Color(color);
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  // Countershading: lighter belly, slightly deeper back, darker where it meets the ground.
  const nV = data.positions.length / 3, cols = new Float32Array(nV * 3);
  const light = base.clone().lerp(new THREE.Color(1, 1, 1), 0.3), dark = base.clone().multiplyScalar(0.8), c = new THREE.Color();
  for (let v = 0; v < nV; v++) {
    const ny = data.normals[v * 3 + 1], y = data.positions[v * 3 + 1] / data.height;
    c.copy(base);
    if (ny < 0) c.lerp(light, Math.min(1, -ny * 0.55)); else c.lerp(dark, ny * 0.28);
    if (y < 0.06) c.multiplyScalar(0.86 + y * 2.3);
    cols[v * 3] = c.r; cols[v * 3 + 1] = c.g; cols[v * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('aInkUv', new THREE.BufferAttribute(data.inkUv, 2));
  geo.setAttribute('aFront', new THREE.BufferAttribute(data.front, 1));
  const legs = legRig(data.positions, data.stub ? [] : data.feet, data.height);
  geo.setAttribute('aLeg', new THREE.BufferAttribute(legs.legOf, 1));
  geo.setAttribute('aLegW', new THREE.BufferAttribute(legs.legW, 1));
  const parts = findAppendages(data.positions, legs.legOf, legs.hipY, data.height);
  geo.setAttribute('aApp', new THREE.BufferAttribute(parts.appOf, 1));
  geo.setAttribute('aAppW', new THREE.BufferAttribute(parts.appW, 1));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geo.computeBoundingSphere();
  const skinTex = new THREE.CanvasTexture(data.skin);
  skinTex.colorSpace = THREE.SRGBColorSpace;
  skinTex.anisotropy = 4;
  const mat = clayMaterial(base, skinTex);
  const U = mat.userData.uniforms;
  U.uHip.value = legs.hipY;
  U.uTop.value = data.height;
  parts.apps.forEach((a, k) => {
    U.uAppPivot.value[k].set(...a.pivot);
    U.uAppAxis.value[k].set(-a.dir[1], a.dir[0], 0).normalize();   // in the drawing's plane, across the limb: swings it fore and aft
  });
  legs.legs.forEach((l, k) => { U.uLegZ.value[k] = l.z; });
  const depthMat = clayDepthMaterial(U);
  const body = new THREE.Mesh(geo, mat);
  body.customDepthMaterial = depthMat;
  body.castShadow = true;
  let outline = null;
  if (TOON) {
    outline = new THREE.Mesh(geo, clayOutlineMaterial(U, inkOf(base), data.height * 0.012));
    rig.add(outline);
  }
  const gait = gaitFor(legs, data.height, data.stub || legs.legs.length < 2);
  rig.add(body);

  // Stub feet for shapes with no legs, so everything can stand and walk.
  const feet = [];
  let lift = 0;
  if (data.stub) {
    const rf = data.height * 0.075;
    lift = rf * 1.15;
    const fmat = clayMaterial(base.clone().multiplyScalar(0.85), null, { vertexColors: false });
    const fgeo = new THREE.CapsuleGeometry(rf, rf * 1.2, 6, 16);
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(fgeo, fmat);
      f.rotation.x = Math.PI / 2;
      f.position.set(sx * Math.max(0.2 * data.width, rf * 1.3), rf, 0.03);
      f.userData.y = rf;
      f.castShadow = true;
      group.add(f);
      feet.push(f);
    }
  }
  rig.position.y = lift;

  // Eyes: holder (placement + pop) > lid (blink) > ball (look) > sclera + pupil.
  const eyes = data.eyes.map((e) => {
    const holder = new THREE.Group(), lid = new THREE.Group(), ball = new THREE.Group();
    holder.add(lid); lid.add(ball);
    const n = new THREE.Vector3(...e.normal);
    const rest = n.clone().add(new THREE.Vector3(0, 0, 0.9)).normalize();
    holder.position.set(...e.pos);
    holder.quaternion.setFromUnitVectors(Z, rest);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(e.r, 40, 28), SCLERA);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(e.r * 0.56, 32, 20), PUPIL);
    pupil.scale.z = 0.45;
    pupil.position.z = e.r * 0.8;
    sclera.castShadow = pupil.castShadow = true;
    ball.add(sclera, pupil);
    rig.add(holder);
    return { holder, lid, ball, baseZ: e.pos[2], base: new THREE.Vector3(...e.pos), jw: Math.min(1, Math.max(0, (e.pos[1] - legs.hipY) / (data.height - legs.hipY))) ** 2 };
  });

  let blinkIn = 1.5 + rnd() * 2, blinkFor = 0, boopT = -1, inflateNow = 1, jumpT = -1, airborne = false, sleepK = 0, sleepOn = false;
  const JUMP = 0.95, H = data.height;

  // Sleep z's: three little sprites that rise, drift and fade above the head.
  const zc = document.createElement('canvas'); zc.width = zc.height = 64;
  const zg = zc.getContext('2d'); zg.fillStyle = '#3A3630'; zg.font = '700 52px ui-rounded, system-ui, sans-serif'; zg.textAlign = 'center'; zg.textBaseline = 'middle'; zg.fillText('z', 32, 34);
  const zTex = new THREE.CanvasTexture(zc); zTex.colorSpace = THREE.SRGBColorSpace;
  const zs = [0, 1, 2].map(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false, toneMapped: false })); sp.visible = false; group.add(sp); return sp; });

  // ---- Walking state: gait clock, one record per foot, the body spring.
  const NL = legs.legs.length, hip = gait.hip, T = (v) => new Array(NL).fill(0).map(v);
  const footW = T(() => new THREE.Vector3()), fromW = T(() => new THREE.Vector3()), restW = T(() => new THREE.Vector3());
  const swinging = new Array(NL).fill(false), swingS = new Array(NL).fill(0), prevU = new Array(NL).fill(0);
  let walkAmt = 0, gphase = 0, ikReady = false, groundAt = () => 0, footLift = 0, landing = false;
  const vel = new THREE.Vector2(), tmp = new THREE.Vector3(), jig = new THREE.Vector3(), jigV = new THREE.Vector3();
  const lastPos = new THREE.Vector3(), lastVel = new THREE.Vector3(), curVel = new THREE.Vector3(), acc = new THREE.Vector3(), qG = new THREE.Quaternion();
  let lastYaw = 0, haveLast = false;
  const qLook = new THREE.Quaternion(), vLocal = new THREE.Vector3(), qInv = new THREE.Quaternion(), wp = new THREE.Vector3();

  function setBirth(p) {
    const inflate = p <= 0 ? 0.02 : Math.max(0.02, easeOutBack(clamp01(p)));
    U.uInflate.value = inflate;
    const e = clamp01((p - 0.62) / 0.3), es = e <= 0 ? 1e-4 : easeOutBack(e);
    inflateNow = inflate;
    for (const eye of eyes) { eye.holder.scale.setScalar(es); eye.holder.position.z = eye.baseZ * inflate; }
    const f = clamp01((p - 0.35) / 0.3), fs = f <= 0 ? 1e-4 : easeOutBack(f);
    for (const ft of feet) ft.scale.setScalar(fs);
  }

  function update(dt, t, lookWorld) {
    sleepK += ((sleepOn ? 1 : 0) - sleepK) * Math.min(1, dt * 1.6);
    const br = Math.sin(t * Math.PI * 2 * (0.3 - 0.12 * sleepK) + phase);
    let sy = 1 + (0.016 + 0.03 * sleepK) * br, sxz = 1 + (0.007 + 0.012 * sleepK) * br;
    if (boopT >= 0) {
      boopT += dt;
      const k = Math.exp(-5 * boopT) * Math.cos(16 * boopT);
      sy *= 1 - 0.17 * k; sxz *= 1 + 0.09 * k;
      if (boopT > 1.6) boopT = -1;
    }
    let ry = lift, rz = 0.02 * Math.sin(t * 0.8 + phase), rx = 0;
    const w = walkAmt;
    // Jump: squat, spring up stretched with arms in the air, land in a squash.
    let jumpArms = 0;
    airborne = false;
    if (jumpT >= 0) {
      jumpT += dt;
      const a = jumpT;
      if (a < 0.22) { const k = Math.sin(Math.PI * 0.5 * a / 0.22); ry -= H * 0.07 * k; sy *= 1 - 0.14 * k; sxz *= 1 + 0.08 * k; }
      else if (a < 0.72) { const s = (a - 0.22) / 0.5; ry += H * 0.36 * Math.sin(Math.PI * s); sy *= 1 + 0.1 * Math.sin(Math.PI * Math.min(1, s * 2)); sxz *= 1 - 0.05 * Math.sin(Math.PI * Math.min(1, s * 2)); airborne = true; }
      else if (a < JUMP) { const k = Math.sin(Math.PI * (a - 0.72) / (JUMP - 0.72)); sy *= 1 - 0.18 * k; sxz *= 1 + 0.1 * k; }
      else jumpT = -1;
      jumpArms = jumpT >= 0 ? Math.sin(Math.PI * Math.min(1, a / JUMP)) : 0;
    }
    // Asleep: sink down on folded legs and nod forward.
    ry -= sleepK * (gait.kind === 'hop' ? H * 0.04 : hip * 0.38);
    rx += 0.1 * sleepK;
    if (gait.kind === 'hop') {
      if (w > 0.01) gphase = (gphase + dt * gait.freq * Math.min(1, w * 1.6)) % 1;
      // Up in a squashy arc, land, squash, push off again.
      const u = gphase, air = u < 0.55, a = air ? u / 0.55 : (u - 0.55) / 0.45;
      if (air) { ry += w * data.height * 0.16 * Math.sin(Math.PI * a); sy *= 1 + 0.07 * w * Math.sin(Math.PI * a); sxz *= 1 - 0.03 * w * Math.sin(Math.PI * a); }
      else { const k = Math.sin(Math.PI * a); sy *= 1 - 0.13 * w * k; sxz *= 1 + 0.07 * w * k; }
      for (const f of feet) f.position.y = f.userData.y + Math.max(0, ry - lift);
      rx += 0.05 * w;
    } else if (ikReady) {
      // Crouch into the stride, bob twice per cycle, waddle side to side on two legs, lean forward a little.
      const u = gphase, crouch = hip * (gait.kind === 'ripple' ? 0.015 + 0.025 * Math.min(1, w * 1.5) : 0.03 + 0.06 * Math.min(1, w * 1.5));
      ry += footLift - crouch;
      ry += w * hip * (NL === 2 ? 0.035 : 0.015) * Math.cos(u * 4 * Math.PI);
      if (NL === 2) rz += w * 0.06 * Math.sin(u * 2 * Math.PI);
      rx += 0.06 * w;
      if (w < 0.05) rz += 0.018 * Math.sin(t * 0.55 + phase);                  // shifting its weight while it stands
    }
    rig.position.y = ry;
    rig.scale.set(sxz, sy, sxz);
    rig.rotation.set(rx, 0, rz);

    // Body spring: the top half lags behind when the creature speeds up, brakes or turns.
    group.getWorldPosition(tmp);
    if (haveLast && dt > 0) {
      curVel.subVectors(tmp, lastPos).divideScalar(dt);
      acc.subVectors(curVel, lastVel).divideScalar(dt).clampLength(0, 12);
      acc.applyQuaternion(qG.copy(group.quaternion).invert());
      const yaw = group.rotation.y, spin = Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw)) / dt;
      acc.x += spin * curVel.length() * 0.6;
      lastYaw = yaw;
    } else { curVel.set(0, 0, 0); acc.set(0, 0, 0); }
    lastPos.copy(tmp); lastVel.copy(curVel); haveLast = true;
    jigV.addScaledVector(jig, -60 * dt).addScaledVector(jigV, -7 * dt).addScaledVector(acc, -dt);
    jig.addScaledVector(jigV, dt).clampLength(0, data.height * 0.08);
    U.uJiggle.value.copy(jig);

    // Arms and antennae.
    const boopK = boopT >= 0 ? Math.exp(-3 * boopT) : 0, beat = Math.sin(gphase * 2 * Math.PI);
    parts.apps.forEach((a, k) => {
      let sw, fl;
      if (a.kind === 'arm') {
        sw = w * 0.5 * beat * a.side - jig.z * 6 + 0.06 * Math.sin(t * 1.1 + k);
        fl = (boopK * 1.1 + jumpArms * 1.2 + 0.04 * Math.sin(t * 0.9 + k * 2) + Math.max(0, w - 1) * 0.3 - 0.45 * sleepK) * a.side;
      } else {
        sw = -jig.z * 10 + 0.08 * Math.sin(t * 1.7 + k) + w * 0.12 * Math.sin(gphase * 4 * Math.PI) + 0.6 * sleepK;
        fl = jig.x * 10 + (0.1 * Math.sin(t * 1.3 + k * 2) + boopK * 0.5 * Math.sin(t * 22)) * (1 - sleepK);
      }
      U.uAppSwing.value[k] = Math.max(-1.2, Math.min(1.2, sw));
      U.uAppFlap.value[k] = Math.max(-1.3, Math.min(1.3, fl));
    });

    if (gait.kind !== 'hop' && ikReady) stepLegs(dt);
    else for (let k = 0; k < NL; k++) { U.uThigh.value[k] = 0; U.uKnee.value[k] = 0; U.uShiftX.value[k] = 0; }

    blinkIn -= dt;
    if (blinkIn <= 0) { blinkFor = 0.12; blinkIn = 2 + rnd() * 4.5; }
    const closed = blinkFor > 0 || sleepK > 0.6;
    zs.forEach((z, i) => {
      const life = ((t * 0.42 + i / 3) % 1);
      z.visible = sleepK > 0.55;
      z.position.set(H * 0.2 + life * H * 0.22 + Math.sin(t * 2 + i) * 0.04, H * (0.78 + life * 0.4), H * 0.2);
      z.scale.setScalar(H * (0.09 + life * 0.1));
      z.material.opacity = Math.min(1, (sleepK - 0.55) / 0.3) * Math.sin(Math.PI * life);
    });
    if (closed) blinkFor -= dt;

    for (const eye of eyes) {
      eye.holder.position.set(eye.base.x + jig.x * eye.jw, eye.base.y + jig.y * eye.jw, eye.baseZ * inflateNow + jig.z * eye.jw);
      eye.lid.scale.y = closed ? 0.1 : 1;
      if (lookWorld) {
        eye.holder.getWorldPosition(wp);
        eye.holder.getWorldQuaternion(qInv).invert();
        vLocal.copy(lookWorld).sub(wp).applyQuaternion(qInv).normalize();
        const ang = vLocal.angleTo(Z), max = 0.55;
        if (ang > max) vLocal.lerp(Z, 1 - max / ang).normalize();
        qLook.setFromUnitVectors(Z, vLocal);
        eye.ball.quaternion.slerp(qLook, 1 - Math.exp(-dt * 10));
      }
    }
  }

  function dispose() {
    geo.dispose(); mat.dispose(); depthMat.dispose(); skinTex.dispose(); outline?.material.dispose();
    for (const f of feet) { f.geometry.dispose(); f.material.dispose(); }
    for (const e of eyes) e.ball.children.forEach((m) => m.geometry.dispose());
    zTex.dispose(); for (const z of zs) z.material.dispose();
  }

  // Feet: plant, lift, arc forward, plant. Then IK turns every foot into hip and knee angles.
  function stepLegs(dt) {
    group.updateMatrixWorld(true);
    const m = body.matrixWorld;
    let need = false, sumY = 0;
    for (let k = 0; k < NL; k++) {
      restW[k].set(legs.legs[k].x, 0, legs.legs[k].z).applyMatrix4(m);
      restW[k].y = groundAt(restW[k].x, restW[k].z);
      if (swinging[k] || Math.hypot(footW[k].x - restW[k].x, footW[k].z - restW[k].z) > hip * 0.14) need = true;
    }
    const moving = walkAmt > 0.04, rate = moving ? gait.freq * (0.35 + 0.65 * walkAmt) : need ? gait.freq * 0.8 : 0;
    gphase = (gphase + dt * rate) % 1;
    const cycle = 1 / gait.freq;
    if (airborne) {
      // In the air the feet come along, tucked up a little; they land under the body.
      for (let k = 0; k < NL; k++) {
        footW[k].set(legs.legs[k].x, hip * 0.18, legs.legs[k].z).applyMatrix4(m);
        swinging[k] = false;
      }
      landing = true;
    } else if (landing) {
      for (let k = 0; k < NL; k++) footW[k].copy(restW[k]);
      landing = false;
    }
    for (let k = 0; k < NL && !airborne; k++) {
      const u = (gphase + gait.offsets[k]) % 1, f = footW[k];
      const lagging = Math.hypot(f.x - restW[k].x, f.z - restW[k].z) > hip * 0.14;
      if (!swinging[k] && prevU[k] < gait.duty && u >= gait.duty && (moving || lagging)) { swinging[k] = true; swingS[k] = 0; fromW[k].copy(f); }
      prevU[k] = u;
      if (swinging[k]) {
        swingS[k] = Math.min(1, swingS[k] + dt * Math.max(rate, gait.freq * 0.8) / (1 - gait.duty));
        // Aim where this foot's rest spot will be halfway through its next planted stretch.
        const ahead = cycle * ((1 - gait.duty) * (1 - swingS[k]) + gait.duty * 0.5);
        tmp.set(restW[k].x + vel.x * ahead, 0, restW[k].z + vel.y * ahead);
        tmp.y = groundAt(tmp.x, tmp.z);
        const s = swingS[k], e = s * s * (3 - 2 * s);
        f.lerpVectors(fromW[k], tmp, e);
        f.y += Math.sin(Math.PI * s) * hip * 0.24 * Math.max(0.5, walkAmt);
        if (s >= 1) { swinging[k] = false; f.y = groundAt(f.x, f.z); }
      }
    }
    for (let k = 0; k < NL; k++) sumY += footW[k].y;
    // Ride at the feet's average height (relative to where the walker put us), so slopes bend knees, not float feet.
    footLift = airborne ? footLift : Math.max(-hip * 0.35, Math.min(hip * 0.35, (sumY / NL - group.position.y) * 0.85));
    for (let k = 0; k < NL; k++) {
      tmp.copy(footW[k]);
      body.worldToLocal(tmp);
      const sol = solveLeg(tmp.y - legs.hipY, tmp.z - legs.legs[k].z, gait.thigh, gait.shin);
      U.uThigh.value[k] = sol.hip; U.uKnee.value[k] = sol.knee;
      U.uShiftX.value[k] = Math.max(-hip * 0.4, Math.min(hip * 0.4, tmp.x - legs.legs[k].x));
    }
  }

  // amount 0..1 eases between standing and full stride; (vx, vz) is the body's velocity in world metres per second.
  function setWalk(amount, vx = 0, vz = 0) {
    walkAmt = amount; vel.set(vx, vz);
    if (!ikReady && gait.kind !== 'hop') {
      group.updateMatrixWorld(true);
      for (let k = 0; k < NL; k++) {
        footW[k].set(legs.legs[k].x, 0, legs.legs[k].z).applyMatrix4(body.matrixWorld);
        footW[k].y = groundAt(footW[k].x, footW[k].z);
      }
      ikReady = true;
    }
  }

  return { group, body, setBirth, setWalk, setGround: (fn) => { groundAt = fn; }, update, boop: () => { boopT = 0; }, dispose,
    jump: () => { if (jumpT < 0 && sleepK < 0.2) jumpT = 0; }, setSleep: (on) => { sleepOn = on; }, get asleep() { return sleepK > 0.5; },
    lift, gait, legs, parts, radius: Math.max(data.width, data.depth) * 0.45, feetWorld: footW, isSwinging: (k) => swinging[k] };
}
