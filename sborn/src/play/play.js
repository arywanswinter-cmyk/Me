// play.js — the Play tab: the island test drive, the transition from the editor, keyboard / click / touch driving, the
//   spring-arm camera, eating fruit, toys (ball, mushrooms), tree thumps and bubble roars.
// Exports: createPlay(app) -> { enter(), exit(), rebind(), step(dt), skipIntro(), drive: { walkTo(x, z), key(code, down),
//          emote(name), act(name) }, loco, island, fx, ground, groundAt(x, y), metrics, state, mats }.
// Invariants: the island is built lazily on first Play and cached (never rendered in the editor); simulation is
//   fixed-step; the camera stays above the terrain; WASD is camera-relative; any input during the intro skips it;
//   stats change play exactly as §10.2 says (jump height in locomotion, boop × (1 + 0.25·Charge), Strike ≥ 2 thumps,
//   Spit ≥ 2 bubble roars, heart 1 + 0.15·Health).
import * as THREE from 'three';
import { createLocomotion } from '../anim/locomotion.js';
import { flightInfo, meshVolume } from '../anim/flight.js';
import { createEmotes } from '../anim/emotes.js';
import { createIslandMaterials, createIsland, islandGround, ISLAND } from './island.js';
import { createFx } from './fx.js';
import { mulberry32 } from '../core/rng.js';

const INTRO = 1.6;                                  // s: curtains 1.2, hop-off, camera swoop 1.6 (easeInOutCubic)
const PREFER = { carn: ['drumstick'], herb: ['berry', 'apple', 'crescent'], filter: ['berry', 'crescent'], omni: ['berry', 'apple', 'crescent', 'drumstick'] };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createPlay(app) {
  const { stage, creature } = app;
  const canvas = stage.renderer.domElement;
  const mats = createIslandMaterials();
  const rnd = mulberry32(4242);
  let island = null, fx = null, loco = null, active = false;
  const ground = islandGround(), H = ground.height;
  const keys = new Set();
  const st = { target: null, run: false, follow: null, camAz: 0, camEl: 0.26, camDist: 3, camPos: new THREE.Vector3(), legless: false, steps: 0, lastTap: 0, intro: null, eat: null, frozen: false };
  const metrics = { thumps: 0, thumpDrops: 0, bubbleRoars: 0, bubbles: 0, eats: 0, chomps: 0, drops: 0, bounces: 0, lastHeart: 0, introSkipped: 0 };
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), ndc = new THREE.Vector2(), rc = new THREE.Raycaster();
  const stats = () => (app.stats ? app.stats() : {});

  // ---- curtains: the editor sky opens like curtains (DOM, no text) ----
  let curtains = null;
  function openCurtains() {
    if (!curtains) {
      curtains = document.createElement('div'); curtains.className = 'curtains'; curtains.setAttribute('aria-hidden', 'true');
      curtains.innerHTML = '<i class="l"></i><i class="r"></i>';
      document.body.appendChild(curtains);
    }
    curtains.style.display = 'block'; setCurtains(0);
  }
  // driven by the fixed-step intro clock (so stepping tests and real time agree)
  function setCurtains(u) { const k = easeIO(Math.min(1, u)); curtains.children[0].style.transform = `translateX(${-102 * k}%)`; curtains.children[1].style.transform = `translateX(${102 * k}%)`; }
  function closeCurtains() { if (curtains) curtains.style.display = 'none'; }

  function makeLoco() {
    const c = creature;
    const flight = c.lastFull ? flightInfo(c.shape, app.partDefs, meshVolume(c.lastFull.position, c.lastFull.index)) : null;
    loco = createLocomotion({ rig: c.rig, shape: c.shape, roles: c.roles, minY: c.minY, parts: c.parts }, { ground, stats: stats(), flight });
    loco.onPlant = (leg) => {
      app.audio.play(stepSoundFor(leg), { size: c.height });
      if (island && ground.inWater(leg.lock.x, leg.lock.z)) island.ripple(leg.lock.x, leg.lock.z, 0.6);
    };
    st.legless = loco.legs.length === 0;
    loco.onHop = () => app.audio.play('mv.land', { size: creature.height });
    loco.onLand = () => {
      app.audio.play('mv.land', { size: creature.height });
      if (fx) fx.emit('dust', { x: loco.state.x, y: H(loco.state.x, loco.state.z) + 0.03, z: loco.state.z }, 10, { ring: true, spread: 0.7, scale: Math.min(1.2, Math.max(0.35, creature.height * 0.8)) });
      const m = island && island.mushroomAt(loco.state.x, loco.state.z);
      if (m) { loco.bounce(1.6); metrics.bounces++; app.audio.play('mv.jump', { size: creature.height }); }   // bounce mushrooms: 1.6× jump
    };
    loco.emotes = createEmotes(c, loco, { partDefs: app.partDefs, stats: stats() });
    loco.emotes.onEmit = onEmoteEvent;
    if (app.ui && app.ui.setCanFly) app.ui.setCanFly(!!(flight && (flight.canFly || flight.canGlide)));
  }
  function stepSoundFor(leg) {
    const s = creature.shape.sockets.find((x) => x.tip && x.limb === leg.limb.id);
    const fam = s && app.partDefs[s.t] ? app.partDefs[s.t].footstep : 'pads';
    return `mv.step_${fam || 'pads'}`;
  }

  // ---- enter / exit ----
  function enter() {
    if (!island) { island = createIsland(stage, mats, { tier: stage.tier }); fx = createFx(mats.plant); island.group.add(fx.group); }
    island.enter();
    active = true;
    makeLoco();
    loco.state.x = 0; loco.state.z = 1.1; loco.state.yaw = 0;
    loco.resetFeet();
    st.target = null; st.eat = null; st.frozen = false; fx.clear();
    // intro: the pedestal pokes out of the clearing, the creature hops off it, the camera swoops in from the editor view
    const ped = app.pedestal;
    const top = H(0, 0) + 0.2;
    if (ped) { ped.group.visible = true; ped.group.position.set(0, top, 0); }
    st.intro = { t: 0, from: stage.camera.position.clone(), top, landed: false };
    creature.group.position.set(0, top, 0); creature.group.rotation.set(0, 0, 0);
    st.camAz = Math.PI; st.camEl = 0.26; st.camDist = Math.max(1.6, 3.5 * creature.height);
    st.camPos.copy(stage.camera.position);
    st.fov0 = stage.camera.fov; stage.camera.fov = 45; stage.camera.updateProjectionMatrix();   // a wider lens outdoors
    openCurtains();
    app.audio.play('mus.sting_drive');
  }
  // remesh while driving: new rig, same place
  function rebind() {
    if (!active) return;
    metrics.rebinds = (metrics.rebinds || 0) + 1;
    const s = loco ? { x: loco.state.x, z: loco.state.z, yaw: loco.state.yaw } : { x: 0, z: 0, yaw: 0 };
    makeLoco(); Object.assign(loco.state, s); loco.resetFeet();
  }
  function endIntro() {
    if (!st.intro) return;
    const ped = app.pedestal;
    if (ped) { ped.group.visible = false; ped.group.position.set(0, 0, 0); }
    st.intro = null; closeCurtains();
    creature.group.scale.set(1, 1, 1);
  }
  function skipIntro() { if (st.intro) { metrics.introSkipped++; endIntro(); } }
  function exit() {
    active = false;
    endIntro();
    if (island) island.exit();
    if (st.fov0) { stage.camera.fov = st.fov0; stage.camera.updateProjectionMatrix(); st.fov0 = 0; }
    if (app.pedestal) app.pedestal.group.position.set(0, 0, 0);
    creature.group.position.set(0, 0, 0); creature.group.rotation.set(0, 0, 0); creature.group.scale.set(1, 1, 1);
    keys.clear(); st.eat = null;
  }

  // ---- input ----
  // the ground under a screen point: march the camera ray over the analytic height field
  function groundAt(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ndc, stage.camera);
    const o = rc.ray.origin, d = rc.ray.direction;
    let t = 0, prev = o.y - H(o.x, o.z);
    for (let i = 0; i < 400 && t < 90; i++) {
      const dt = Math.max(0.05, t * 0.02); t += dt;
      const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t, f = py - H(px, pz);
      if (f < 0) { const a = prev / (prev - f); const tt = t - dt * (1 - a); return new THREE.Vector3(o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt); }
      prev = f;
    }
    return null;
  }
  const touches = new Map();
  let down = null, pinch = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!active || st.frozen) return;
    skipIntro();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: st.camDist }; down = null; st.follow = null; return; }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false, touch: e.pointerType === 'touch', last: { x: e.clientX, y: e.clientY } };
    const g = groundAt(e.clientX, e.clientY);
    if (down.touch && g) st.follow = { x: g.x, z: g.z, t0: performance.now() };
  });
  addEventListener('pointermove', (e) => {
    if (!active) return;
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) { const [a, b] = [...touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); st.camDist = Math.min(14, Math.max(0.8, pinch.dist * pinch.d / Math.max(1, d))); return; }
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.last.x, dy = e.clientY - down.last.y;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.moved = true;
    if (st.follow) { const g = groundAt(e.clientX, e.clientY); if (g) { st.follow.x = g.x; st.follow.z = g.z; } }
    else if (down.moved) { st.camAz -= dx * 0.006; st.camEl = Math.min(1.2, Math.max(0.05, st.camEl + dy * 0.004)); }
    down.last = { x: e.clientX, y: e.clientY };
  });
  const up = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (!active || !down || e.pointerId !== down.id) return;
    const quick = performance.now() - down.t < 350 && !down.moved;
    if (quick && e.type === 'pointerup') {
      const g = groundAt(e.clientX, e.clientY);
      if (g) { const dbl = performance.now() - st.lastTap < 300; st.lastTap = performance.now(); walkTo(g.x, g.z, dbl); }
    }
    st.follow = null;
    down = null;
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  function walkTo(x, z, run = false) { st.target = new THREE.Vector2(x, z); st.run = run; st.eat = null; }
  const EMOTE_KEYS = { Digit4: 'dance', Digit5: 'roar', Digit6: 'sit', Digit7: 'sleep', Digit8: 'wave', Digit9: 'eat', Digit0: 'fly' };

  // ---- emotes, eating, thumps, bubbles ----
  function mouthPoint(out) {
    const b = creature.bounds, s = loco.state, f = Math.max(0.1, b[5]);
    return out.set(s.x + Math.sin(s.yaw) * f, (s.bodyY || 0) + creature.height * 0.6, s.z + Math.cos(s.yaw) * f);
  }
  function diet() {
    const m = creature.shape && creature.shape.sockets.find((x) => x.t && x.t.startsWith('mouth.'));
    return m && app.partDefs[m.t] && app.partDefs[m.t].diet || 'omni';
  }
  function emote(name) {
    if (!loco || !loco.emotes) return null;
    skipIntro();
    if (name === 'eat' && island) return startEat();
    const v = loco.emotes.play(name);
    if (v) voice(name);
    if (name === 'roar' && v && (stats().Spit || 0) >= 2) {        // Spit ≥ 2: the roar blows 6 + 2·Spit bubbles
      const n = 6 + 2 * stats().Spit;
      fx.emit('bubble', mouthPoint(tmp), n, { spread: 0.9, up: 0.9 });
      metrics.bubbleRoars++; metrics.bubbles += n;
      app.audio.play('ui.pattern_sparkle', { rate: 1.3 });
    }
    return v;
  }
  // each emote plays its voice mood (largest mouth's family): roar is a growl lead-in, then the roar
  const MOOD = { dance: 'coo', sit: 'purr', sleep: 'sleep', wave: 'chirp', eat: 'eat' };
  function voice(name) {
    const fam = app.family ? app.family() : 'jaw', A = app.audio;
    if (name === 'roar') { A.play(`vo.${fam}.growl`); const c = A.ctx; if (c) A.play(`vo.${fam}.roar`, { at: c.currentTime + 0.25 }); }
    else if (MOOD[name]) A.play(`vo.${fam}.${MOOD[name]}`);
  }
  function startEat() {
    const s = loco.state, pref = PREFER[diet()] || PREFER.omni;
    let f = null, bd = 3;
    for (const q of island.fruit) { if (!q.alive) continue; const d = Math.hypot(q.x - s.x, q.z - s.z) - (pref.includes(q.kind) ? 0.5 : 0); if (d < bd) { bd = d; f = q; } }
    if (!f || Math.hypot(f.x - s.x, f.z - s.z) > 3) { f = island.dropFruitNear(s.x, s.z, s.yaw, island.step); metrics.drops++; app.audio.play('mv.land', { size: 0.3 }); }
    st.eat = { f, phase: 'walk', t: 0, pref: pref.includes(f.kind) };
    st.target = null;
    return 'eat';
  }
  function eatStep(dt) {
    const E = st.eat, s = loco.state, f = E.f;
    const reach = Math.max(0.12, creature.bounds[5] * 0.9);
    if (E.phase === 'walk') {
      const dx = f.x - s.x, dz = f.z - s.z, d = Math.hypot(dx, dz);
      if (d <= reach + 0.12 || E.t > 6) { E.phase = 'eat'; loco.setMove(0, 0, 0, false); loco.setTurn(Math.atan2(dx, dz)); E.v = loco.emotes.play('eat'); voice('eat'); E.t = 0; return null; }
      E.t += dt;
      return { dirX: dx / d, dirZ: dz / d, mag: Math.min(1, (d - reach) / 0.4 + 0.25) };
    }
    E.t += dt;
    f.scale = Math.max(0.15, 1 - E.t / 1.6); island.placeFruit();          // the fruit shrinks as it is munched
    if (!loco.emotes.active || E.t > 2.2) { if (f.alive) { island.eatFruit(f, island.step); f.scale = 1; } st.eat = null; loco.setTurn(null); }
    return null;
  }
  function onEmoteEvent(kind, n) {
    if (!fx) return;
    if (kind === 'chomp') { metrics.chomps++; app.audio.play('mv.crunch_fruit', { size: creature.height }); }
    else if (kind === 'crumbs') fx.emit('crumb', mouthPoint(tmp), 8, { spread: 0.5, up: 1.4 });
    else if (kind === 'heart') {
      const sc = (1 + 0.15 * (stats().Health || 0)) * (st.eat && st.eat.pref ? 1.3 : 1);
      fx.emit('heart', mouthPoint(tmp).add(tmp2.set(0, creature.height * 0.5 + 0.1, 0)), 1, { scale: sc, spread: 0, up: 0.5 });
      metrics.lastHeart = sc;
      if (st.eat) { const f = st.eat.f; if (f.alive) { island.eatFruit(f, island.step); f.scale = 1; } metrics.eats++; }
      app.audio.play('mv.gulp', { size: creature.height });
    }
  }
  function jump() {
    if (!loco) return false;
    skipIntro();
    if (loco.emotes) loco.emotes.stop();
    st.eat = null;
    if (loco.state.air) return loco.glide();                       // in the air, Jump glides
    const ok = loco.jump();
    if (ok && island && (stats().Strike || 0) >= 2) {                 // Strike ≥ 2: a jump beside a tree thumps it
      const n = 1 + Math.floor(rnd() * 3), got = island.thumpTree(loco.state.x, loco.state.z, n);
      if (got > 0 || island.trees.some((t) => Math.hypot(t.x - loco.state.x, t.z - loco.state.z) < 2.2)) { metrics.thumps++; metrics.thumpDrops += got; app.audio.play('mv.land', { size: 1 }); }
    }
    return ok;
  }
  function fly() { if (!loco) return null; skipIntro(); if (loco.emotes) loco.emotes.stop(); st.eat = null; return loco.toggleFly(); }
  function act(name) {
    if (name === 'jump') return jump();
    if (name === 'fly') return fly();
    if (name === 'photo') return app.onPhoto ? app.onPhoto() : null;
    return emote(name);
  }
  function key(code, isDown) {
    if (isDown && !keys.has(code) && loco) {
      if (EMOTE_KEYS[code]) { if (EMOTE_KEYS[code] === 'fly') fly(); else emote(EMOTE_KEYS[code]); }
      else if (code === 'Space') jump();
      else if (code === 'KeyF') fly();
      else if (code === 'KeyP') act('photo');
    }
    if (isDown) keys.add(code); else keys.delete(code);
    if (isDown && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) { st.target = null; st.eat = null; skipIntro(); }
  }
  addEventListener('keydown', (e) => { if (!active || st.frozen) return; key(e.code, true); });
  addEventListener('keyup', (e) => { if (!active) return; key(e.code, false); });
  canvas.addEventListener('wheel', (e) => { if (!active || st.frozen) return; e.preventDefault(); st.camDist = Math.min(14, Math.max(0.8, st.camDist * Math.exp(e.deltaY * 0.001))); }, { passive: false });

  // ---- per fixed step ----
  const feet = [], body = { x: 0, y: 0, z: 0, r: 0.3, vx: 0, vz: 0, charge: 0 };
  function introStep(dt) {
    const I = st.intro; I.t += dt;
    const u = Math.min(1, I.t / INTRO), ped = app.pedestal;
    if (curtains) setCurtains(I.t / 1.2);
    // the pedestal sinks into the clearing from 0.4 s; the creature hops off forward (0.4–0.9 s) and squashes 0.8 on landing
    if (ped) ped.group.position.y = I.top - Math.max(0, Math.min(1, (I.t - 0.4) / 0.8)) * 0.6;
    const h = Math.min(1, Math.max(0, (I.t - 0.4) / 0.5));
    const z = h * 1.1, y0 = I.top * (1 - h) + H(0, 1.1) * h;
    creature.group.position.set(0, y0 + Math.sin(Math.PI * h) * Math.max(0.15, creature.height * 0.3), z);
    if (h >= 1 && !I.landed) {
      I.landed = true;
      if (!globalThis.__noFx) fx.emit('dust', { x: 0, y: H(0, 1.1) + 0.03, z: 1.1 }, 12, { ring: true, spread: 0.8 });
      app.audio.play('mv.land', { size: creature.height });
    }
    const sq = I.landed ? 1 - 0.2 * Math.exp(-8 * (I.t - 0.9)) * Math.cos(14 * (I.t - 0.9)) : 1;
    creature.group.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
    // grass shivers around the landing
    feet.length = 0; if (I.landed && I.t < 1.3 && !globalThis.__noPush) feet.push({ x: 0, z: 1.1 });
    // camera swoop
    const k = easeIO(u);
    armTarget(tmp, 0, 1.1);
    st.camPos.lerpVectors(I.from, tmp, k);
    stage.camera.position.copy(st.camPos);
    stage.camera.lookAt(tmp2.set(0, Math.max(0.3, creature.height) * 0.55 + H(0, 1.1) * k, z));
    if (I.t >= INTRO) endIntro();
  }
  function armTarget(out, tx, tz) {
    const Hh = Math.max(0.3, creature.height), ty = Hh * 0.55 + (loco ? loco.state.bodyY || 0 : 0) + (loco && loco.state.air ? loco.state.air.y : 0);
    out.set(tx + Math.sin(st.camAz) * Math.cos(st.camEl) * st.camDist, ty + Math.sin(st.camEl) * st.camDist, tz + Math.cos(st.camAz) * Math.cos(st.camEl) * st.camDist);
    out.y = Math.max(out.y, H(out.x, out.z) + 0.3);
    return ty;
  }
  function step(dt) {
    if (!active || !loco) return;
    if (st.frozen) return;
    if (st.intro) {
      creature.rig.toRest(); creature.rig.fk(); creature.rig.apply();
      introStep(dt);
      island.update(dt, { cam: stage.camera, feet, body: null, creaturePos: creature.group.position });
      fx.step(dt, stage.camera);
      island.placeSun(creature.group.position, Math.max(0.6, creature.height));
      if (!st.intro) { loco.state.x = 0; loco.state.z = 1.1; loco.resetFeet(); }
      return;
    }
    // camera-relative WASD
    let mx = 0, mz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx -= 1;
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const fx0 = Math.sin(st.camAz + Math.PI), fz0 = Math.cos(st.camAz + Math.PI);    // camera forward on the ground
    let dirX = 0, dirZ = 0, mag = 0, wantRun = run;
    if (mx || mz) { dirX = fx0 * mz + fz0 * mx; dirZ = fz0 * mz - fx0 * mx; const l = Math.hypot(dirX, dirZ); dirX /= l; dirZ /= l; mag = 1; }
    else if (st.follow) {
      const dx = st.follow.x - loco.state.x, dz = st.follow.z - loco.state.z, l = Math.hypot(dx, dz);
      if (l > 0.15) { dirX = dx / l; dirZ = dz / l; mag = Math.min(1, l / 0.5); st.followSteps = (st.followSteps || 0) + 1; wantRun = st.followSteps > 36; if (wantRun && !st.followRan) { st.followRan = true; metrics.followRunAt = st.followSteps; } }
    } else if (st.eat) {
      const m = eatStep(dt);
      if (m) { dirX = m.dirX; dirZ = m.dirZ; mag = m.mag; }
    } else if (st.target) {
      const dx = st.target.x - loco.state.x, dz = st.target.y - loco.state.z, l = Math.hypot(dx, dz);
      if (l < 0.12) st.target = null;
      else { dirX = dx / l; dirZ = dz / l; mag = Math.min(1, l / 0.6); wantRun = st.run; }
    }
    if (!st.follow) { st.followSteps = 0; st.followRan = false; }
    // soft boundary: gently turn back near the edge of the playable 28 m
    const R = ISLAND.play, r = Math.hypot(loco.state.x, loco.state.z);
    if (r > R - 1.5 && mag > 0) { const inX = -loco.state.x / r, inZ = -loco.state.z / r, k = Math.min(1, (r - (R - 1.5)) / 1.5); dirX = dirX * (1 - k) + inX * k; dirZ = dirZ * (1 - k) + inZ * k; const l = Math.hypot(dirX, dirZ) || 1; dirX /= l; dirZ /= l; }
    if (mag > 0 || !st.eat || st.eat.phase !== 'eat') loco.setMove(dirX, dirZ, mag, wantRun);
    creature.rig.toRest();
    loco.step(dt);
    st.steps++;
    // legless: locomotion poses the slither or hop; the squash is a group scale about the ground point
    if (st.legless) { const sq = loco.state.squash || 1; creature.group.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5); }
    creature.group.position.set(loco.state.x, 0, loco.state.z);
    creature.group.rotation.set(0, loco.state.yaw, 0);
    // island: trample pushers (planted feet), the body as the ball pusher, flowers, wind, fruit respawn
    feet.length = 0;
    for (const l of loco.legs) if (l.planted && feet.length < 4) feet.push(l.lock);
    if (st.legless) feet.push({ x: loco.state.x, z: loco.state.z });
    const b = creature.bounds;
    body.r = Math.max(0.15, 0.45 * Math.max(b[3] - b[0], b[5] - b[2], creature.height * 0.6));
    body.x = loco.state.x; body.z = loco.state.z; body.y = (loco.state.bodyY || 0) + (loco.state.air ? loco.state.air.y : 0) + creature.height * 0.45;
    body.vx = loco.state.vx; body.vz = loco.state.vz; body.charge = stats().Charge || 0;
    island.update(dt, { cam: stage.camera, feet, body, creaturePos: creature.group.position });
    fx.step(dt, stage.camera);
    // spring-arm camera at 3.5 H, orbitable, above the terrain
    const ty = armTarget(tmp, loco.state.x, loco.state.z);
    const k = 1 - Math.exp(-dt * 6);
    st.camPos.lerp(tmp, k);
    st.camPos.y = Math.max(st.camPos.y, H(st.camPos.x, st.camPos.z) + 0.3);
    stage.camera.position.copy(st.camPos);
    stage.camera.lookAt(tmp2.set(loco.state.x, ty, loco.state.z));
    stage.lights.focus.set(loco.state.x, ty, loco.state.z);
    island.placeSun(stage.lights.focus, Math.max(0.6, creature.height));
  }
  const drive = { walkTo: (x, z) => walkTo(x, z, false), key, emote, act };
  return {
    enter, exit, rebind, step, skipIntro, drive, metrics, state: st, mats, ground, groundAt,
    get loco() { return loco; }, get active() { return active; }, get island() { return island; }, get fx() { return fx; }, get world() { return island ? island.group : null; },
    freeze(v) { st.frozen = !!v; },
  };
}
