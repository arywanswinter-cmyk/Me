// play.js — the Play tab: the test-drive ground, keyboard / click / touch driving, the spring-arm camera, and legless hops.
// Exports: createPlay(app) -> { enter(), exit(), step(dt), drive: { walkTo(x, z), key(code, down), emote(name) }, loco, ground, world, groundAt(x, y) }.
// Invariants: the world is built lazily on first Play and cached (never rendered in the editor); simulation is fixed-step;
//   the camera stays above the terrain; WASD is camera-relative; legless creatures squash-hop.
import * as THREE from 'three';
import { createLocomotion } from '../anim/locomotion.js';
import { flightInfo, meshVolume } from '../anim/flight.js';
import { createEmotes } from '../anim/emotes.js';

const MEADOW_R = 12;

export function createPlay(app) {
  const { stage, creature, picker } = app;
  const canvas = stage.renderer.domElement;
  let world = null, loco = null, active = false;
  const ground = app.ground || { height: () => 0, normal: (x, z, out) => out.set(0, 1, 0), radius: MEADOW_R };
  const keys = new Set();
  const st = { target: null, run: false, follow: null, camAz: 0, camEl: 0.26, camDist: 3, camPos: new THREE.Vector3(), camVel: new THREE.Vector3(), hop: 0, hopT: 0, legless: false, steps: 0, lastTap: 0 };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), ndc = new THREE.Vector2(), rc = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  function buildWorld() {
    world = new THREE.Group();
    world.name = 'meadow';
    const g = new THREE.CircleGeometry(MEADOW_R + 30, 96);
    g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(g.attributes.position.getX(i), g.attributes.position.getZ(i));
      c.set('#5DBB63').lerp(new THREE.Color('#A8E06A'), 0.3 + 0.2 * Math.sin(i * 0.37));
      if (r > MEADOW_R) c.lerp(new THREE.Color('#D9B48A'), Math.min(1, (r - MEADOW_R) / 4));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    m.receiveShadow = true;
    world.add(m);
    stage.scene.add(world);
  }

  function makeLoco() {
    const c = creature;
    const flight = c.lastFull ? flightInfo(c.shape, app.partDefs, meshVolume(c.lastFull.position, c.lastFull.index)) : null;
    loco = createLocomotion({ rig: c.rig, shape: c.shape, roles: c.roles, minY: c.minY, parts: c.parts }, { ground, stats: app.stats ? app.stats() : {}, flight });
    loco.onPlant = (leg) => app.audio.play(stepSoundFor(leg), { size: c.height });
    st.legless = loco.legs.length === 0;
    loco.onHop = () => app.audio.play('mv.land', { size: creature.height });
    loco.emotes = createEmotes(c, loco, { partDefs: app.partDefs, stats: app.stats ? app.stats() : {} });
  }
  function stepSoundFor(leg) {
    const s = creature.shape.sockets.find((x) => x.tip && x.limb === leg.limb.id);
    const fam = s && app.partDefs[s.t] ? app.partDefs[s.t].footstep : 'pads';
    return `mv.step_${fam || 'pads'}`;
  }

  function enter() {
    if (!world) buildWorld();
    world.visible = true;
    active = true;
    makeLoco();
    loco.state.x = 0; loco.state.z = 0; loco.state.yaw = 0;
    loco.resetFeet();
    creature.group.position.set(0, 0, 0);
    st.camAz = Math.PI; st.camDist = Math.max(1.6, 3.5 * creature.height);
    st.camPos.set(0, creature.height * 1.6, st.camDist);
    st.target = null;
    app.audio.play('mus.sting_drive');
  }
  function exit() {
    active = false;
    if (world) world.visible = false;
    creature.group.position.set(0, 0, 0); creature.group.rotation.set(0, 0, 0); creature.group.scale.set(1, 1, 1);
    keys.clear();
  }

  // ---- input ----
  function groundAt(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ndc, stage.camera);
    const hit = rc.ray.intersectPlane(plane, new THREE.Vector3());
    return hit;
  }
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!active) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false, touch: e.pointerType === 'touch', last: { x: e.clientX, y: e.clientY } };
    const g = groundAt(e.clientX, e.clientY);
    if (down.touch && g) { st.follow = { x: g.x, z: g.z, t0: performance.now() }; }
  });
  addEventListener('pointermove', (e) => {
    if (!active || !down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.last.x, dy = e.clientY - down.last.y;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.moved = true;
    if (st.follow) { const g = groundAt(e.clientX, e.clientY); if (g) { st.follow.x = g.x; st.follow.z = g.z; } }
    else if (down.moved) { st.camAz -= dx * 0.006; st.camEl = Math.min(1.2, Math.max(0.12, st.camEl + dy * 0.004)); }
    down.last = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointerup', (e) => {
    if (!active || !down || e.pointerId !== down.id) return;
    const quick = performance.now() - down.t < 350 && !down.moved;
    if (quick) {
      const g = groundAt(e.clientX, e.clientY);
      if (g) { const dbl = performance.now() - st.lastTap < 300; st.lastTap = performance.now(); walkTo(g.x, g.z, dbl); }
    }
    st.follow = null;
    down = null;
  });
  function walkTo(x, z, run = false) { st.target = new THREE.Vector2(x, z); st.run = run; }
  const EMOTE_KEYS = { Digit4: 'dance', Digit5: 'roar', Digit6: 'sit', Digit7: 'sleep', Digit8: 'wave', Digit9: 'eat', Digit0: 'fly' };
  function emote(name) { if (!loco || !loco.emotes) return null; return loco.emotes.play(name); }   // voices per mood arrive with the audio engine (M9)
  function key(code, isDown) {
    if (isDown && !keys.has(code) && loco) {
      if (EMOTE_KEYS[code]) emote(EMOTE_KEYS[code]);
      else if (code === 'Space') { if (loco.emotes) loco.emotes.stop(); loco.jump(); }
      else if (code === 'KeyF') { if (loco.emotes) loco.emotes.stop(); loco.toggleFly(); }
    }
    if (isDown) keys.add(code); else keys.delete(code); if (isDown && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) st.target = null; }
  addEventListener('keydown', (e) => { if (!active) return; key(e.code, true); });
  addEventListener('keyup', (e) => { if (!active) return; key(e.code, false); });
  canvas.addEventListener('wheel', (e) => { if (!active) return; e.preventDefault(); st.camDist = Math.min(14, Math.max(0.8, st.camDist * Math.exp(e.deltaY * 0.001))); }, { passive: false });

  function step(dt) {
    if (!active || !loco) return;
    // camera-relative WASD
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx -= 1;
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const fx = Math.sin(st.camAz + Math.PI), fz = Math.cos(st.camAz + Math.PI);    // camera forward on the ground
    let dirX = 0, dirZ = 0, mag = 0, wantRun = run;
    if (mx || mz) { dirX = fx * mz + fz * mx; dirZ = fz * mz - fx * mx; const l = Math.hypot(dirX, dirZ); dirX /= l; dirZ /= l; mag = 1; }
    else if (st.follow) {
      const dx = st.follow.x - loco.state.x, dz = st.follow.z - loco.state.z, l = Math.hypot(dx, dz);
      if (l > 0.15) { dirX = dx / l; dirZ = dz / l; mag = Math.min(1, l / 0.5); st.followSteps = (st.followSteps || 0) + 1; wantRun = st.followSteps > 36; }
    } else if (st.target) {
      const dx = st.target.x - loco.state.x, dz = st.target.y - loco.state.z, l = Math.hypot(dx, dz);
      if (l < 0.12) st.target = null;
      else { dirX = dx / l; dirZ = dz / l; mag = Math.min(1, l / 0.6); wantRun = st.run; }
    }
    if (!st.follow) st.followSteps = 0;
    // keep inside the meadow: gently turn back near the edge
    const r = Math.hypot(loco.state.x, loco.state.z);
    if (r > MEADOW_R - 1 && mag > 0) { const inX = -loco.state.x / r, inZ = -loco.state.z / r, k = Math.min(1, (r - (MEADOW_R - 1)) / 1); dirX = dirX * (1 - k) + inX * k; dirZ = dirZ * (1 - k) + inZ * k; const l = Math.hypot(dirX, dirZ) || 1; dirX /= l; dirZ /= l; }
    loco.setMove(dirX, dirZ, mag, wantRun);
    creature.rig.toRest();
    loco.step(dt);
    st.steps++;
    // legless: locomotion poses the slither or hop; the squash is a group scale about the ground point
    if (st.legless) { const sq = loco.state.squash || 1; creature.group.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5); }
    creature.group.position.set(loco.state.x, 0, loco.state.z);
    creature.group.rotation.set(0, loco.state.yaw, 0);
    // spring-arm camera at 3.5 H, orbitable, above the terrain
    const H = Math.max(0.3, creature.height);
    const tx = loco.state.x, tz = loco.state.z, ty = H * 0.55;
    const want = tmp.set(tx + Math.sin(st.camAz) * Math.cos(st.camEl) * st.camDist, ty + Math.sin(st.camEl) * st.camDist, tz + Math.cos(st.camAz) * Math.cos(st.camEl) * st.camDist);
    want.y = Math.max(want.y, ground.height(want.x, want.z) + 0.3);
    const k = 1 - Math.exp(-dt * 6);
    st.camPos.lerp(want, k);
    stage.camera.position.copy(st.camPos);
    stage.camera.lookAt(tmp2.set(tx, ty, tz));
    stage.lights.focus.set(tx, ty, tz);
  }
  const drive = { walkTo: (x, z) => walkTo(x, z, false), key, emote };
  return { enter, exit, step, drive, get loco() { return loco; }, get active() { return active; }, ground, get world() { return world; }, groundAt, state: st };
}
