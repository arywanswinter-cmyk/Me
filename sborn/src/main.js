// main.js — boots Sborn: feature checks, the stage, the hatch, editor / paint / play modes, the fixed-step loop and window.__sborn.
// Exports: nothing; exposes window.__sborn (automation, tests, user tools).
// Invariants: ?test renders only inside step()/settle() (no rAF loop); simulation runs at a fixed 60 Hz; the recipe is the
//   single source of truth (every change is an op, committed to history and mirrored to storage); rendering pauses and
//   audio suspends while the page is hidden.
import * as THREE from 'three';
import { createStage } from './render/stage.js';
import { createSky } from './render/sky.js';
import { createPedestal } from './render/pedestal.js';
import { createHatch } from './render/hatch.js';
import { bootGuess } from './render/tiers.js';
import { createHand } from './ui/hand.js';
import { showNoWebGL } from './ui/pictures.js';
import { createMesher } from './geo/mesher-client.js';
import { createCreature } from './render/creature.js';
import { createSkinMaterial, setPaint } from './render/skin.js';
import { createPartMaterials } from './render/materials.js';
import { PART, partTypes } from './catalog/parts.js';
import { newRecipe, validate, canonicalEqual } from './recipe/schema.js';
import { applyOp } from './recipe/ops.js';
import { createHistory } from './recipe/history.js';
import { setHingeSource } from './geo/shape.js';
import { partHinges } from './parts/assemble.js';
import { createUI } from './ui/ui.js';
import { createPicker } from './editor/picking.js';
import { createOrbit } from './editor/camera.js';
import { createEditor } from './editor/editor.js';
import { createIdle } from './anim/idle.js';
import { createPlay } from './play/play.js';
import { createAudio } from './audio/engine.js';
import { saveMirror, loadMirror } from './io/storage.js';
import { costOf } from './catalog/budget.js';

const P = new URLSearchParams(location.search);
const TEST = P.has('test');
const FIXED = 1 / 60;
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL2() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
}

const api = window.__sborn = { version: 1 };
let readyResolve;
const readyP = new Promise((r) => { readyResolve = r; });
api.ready = () => readyP;

boot();

function boot() {
  if (!hasWebGL2()) { showNoWebGL(); api.noWebGL = true; return; }
  const forced = P.get('quality');
  const tier = ['low', 'medium', 'high'].includes(forced) ? forced : TEST ? 'medium'
    : bootGuess({ ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, screenW: screen.width, screenH: screen.height, dpr: devicePixelRatio, halfFloat: true });
  const canvas = document.getElementById('gl');
  const stage = createStage(canvas, { test: TEST, tier, precision: P.get('precision') === 'mediump' ? 'mediump' : 'highp' });
  const { scene, camera, renderer } = stage;
  const sky = createSky();
  scene.add(sky.group);
  const pedestal = createPedestal();
  scene.add(pedestal.group);
  const hatch = createHatch(scene);
  const hand = createHand();
  const audio = createAudio({ test: TEST });

  // ---- the creature ----
  setHingeSource(partHinges);
  const skinMat = createSkinMaterial();
  const partMats = createPartMaterials(skinMat);
  let creature = null;
  const mesher = createMesher({ onResult: (res, meta) => creature && creature.applyResult(res, meta) });
  creature = createCreature({ mesher, partDefs: PART, material: skinMat, partMats: partMats.map });
  scene.add(creature.group);
  const history = createHistory();
  let recipe = null, mode = 'hatch';
  const counters = { op: 0, load: 0, undo: 0, redo: 0 };
  const idle = createIdle(1, { reduced });
  const orbit = createOrbit(camera, { reduced: reduced || TEST });
  const picker = createPicker(stage, creature);

  // Restore the mirror (or Bloop).
  let initial = null;
  const mirror = loadMirror();
  if (mirror) { try { initial = validate(mirror, { partTypes }).recipe; } catch { initial = null; } }
  recipe = initial || newRecipe();
  history.reset(recipe);

  let ui = null, editor = null;
  function show(r, { preview = false } = {}) {
    recipe = r;
    setPaint(skinMat, r.paint); partMats.setPaint(r.paint);
    creature.setRecipe(r, { preview });
    if (ui) ui.setName(r.name);
  }
  let committed = recipe;
  const react = { squash: -1, pop: -1, tilt: 0, lastTap: -9 };
  let simT = 0;
  const family = () => { const m = committed.parts.map((p) => PART[p.t]).filter((d) => d && d.group === 'mouth').sort((a, b) => b.baseR - a.baseR)[0]; return m ? m.voice : 'jaw'; };
  const app = {
    stage, creature, picker, orbit, audio, partDefs: PART,
    recipe: () => committed,
    mode: () => mode,
    preview: (r) => show(r, { preview: true }),
    commit: (r, label = 'edit', opts = {}) => {
      history.commit(r, label, editor ? editor.selection : null, opts);
      committed = r; show(r);
      saveMirror(r);
      if (editor) editor.refreshBudget();
      ui.setUndo(history.canUndo, history.canRedo);
      if (opts.placed) pedestal.pulse();
    },
    refuse: () => { ui.shakePill(); audio.play('ui.budget_bonk'); react.tilt = 0.6; audio.play(`vo.${family()}.chirp`); },
    creatureReact: (kind) => {
      if (kind === 'tap') { if (react.lastTap < simT - 1.5) { react.lastTap = simT; react.squash = 0; audio.play(`vo.${family()}.giggle`); } }
      else if (kind === 'placed') react.pop = 0;
      else if (kind === 'relieved') react.squash = 0;
    },
  };

  let mirrorOn = true;
  ui = createUI({
    onTab: (m) => setMode(m),
    onUndo: () => api.undo(), onRedo: () => api.redo(),
    onMirror: () => { mirrorOn = !mirrorOn; editor.setMirror(mirrorOn); ui.setMirror(mirrorOn); audio.play('ui.button_tick'); },
    onMute: () => { audio.setMuted(!audio.muted); ui.setMuted(audio.muted); },
    onNew: () => { app.commit(newRecipe(), 'new'); audio.play('ui.born_tada'); },
    onSwatch: (layer, c) => { app.commit(applyOp(committed, 'paint.layer', { layer, c }), 'paint'); audio.play('ui.color_pick'); markSwatch(c); },
    onCardDown: (card, e) => editor && editor.onCardDown(card, e),
    onJump: () => {},
  }, { partDefs: PART });
  ui.setMirror(true); ui.setMuted(audio.muted); ui.setName(recipe.name);
  function markSwatch(c) { for (const b of document.querySelectorAll('.swatch')) b.setAttribute('aria-pressed', b.dataset.c === c ? 'true' : 'false'); }
  app.ui = ui;
  editor = createEditor(app);
  const play = createPlay(app);
  show(recipe);
  ui.setUndo(false, false);

  // ---- modes ----
  function setMode(m) {
    if (m === mode) return;
    const prev = mode;
    if (editor) editor.cancel();
    mode = m;
    ui.setMode(m);
    if (m === 'play') { pedestal.group.visible = false; sky.floor.visible = false; play.enter(); }
    if (prev === 'play') { play.exit(); pedestal.group.visible = true; sky.floor.visible = true; frameNow(true); }
    if (m === 'paint') markSwatch(committed.paint.base.c);
    audio.play('ui.tab_switch');
    updateShift();
  }
  // Centre the creature in the free area between the side panels (landscape only).
  function updateShift() {
    if (mode === 'play' || innerWidth < 900 || innerHeight > innerWidth) { stage.setShift(0); return; }
    const L = document.querySelector(mode === 'paint' ? '.paintpanel' : '.left'), R = document.querySelector('.stats');
    const l = L && L.getBoundingClientRect().width ? L.getBoundingClientRect().right : 0;
    const r = R && R.getBoundingClientRect().width ? innerWidth - R.getBoundingClientRect().left : 0;
    stage.setShift((l - r) / 2);
  }
  api.updateShift = updateShift;
  api.mode = (m) => { if (m) setMode(m); return mode; };

  // ---- framing ----
  function frameNow(instant = false) {
    const b = creature.bounds;
    const h = Math.max(0.2, creature.height);
    orbit.frame({ cy: h * 0.5, h, r: Math.max(b[3] - b[0], b[5] - b[2]) / 2 }, instant);
  }
  let framedOnce = false;
  creature.on((kind) => {
    if (kind !== 'full') return;
    if (!framedOnce) { framedOnce = true; frameNow(true); } else if (mode === 'build' || mode === 'paint') frameNow();
    if (play.active) play.enter();
    audio.setCreature({ seed: committed.seed, height: creature.height, family: family() });
  });

  // ---- keyboard ----
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) api.redo(); else api.undo(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); api.redo(); return; }
    if (mode === 'play') { if (e.code === 'Escape') setMode('build'); if (e.code === 'Space') e.preventDefault(); return; }
    if (e.key === '1') setMode('build'); else if (e.key === '2') setMode('paint'); else if (e.key === '3') setMode('play');
    else if (e.key === 'm' || e.key === 'M') { audio.setMuted(!audio.muted); ui.setMuted(audio.muted); }
  });
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, () => audio.unlock(), { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.suspend(); saveMirror(committed); } else audio.resume(); });
  addEventListener('pagehide', () => saveMirror(committed));

  // ---- api ----
  api.recipe = () => JSON.parse(JSON.stringify(committed));
  api.load = (r) => { counters.load++; const v = validate(r, { partTypes }).recipe; app.commit(v, 'load'); return true; };
  api.op = (name, args = {}) => { counters.op++; app.commit(applyOp(committed, name, args), name); return true; };
  api.undo = () => { counters.undo++; const u = history.undo(); if (u) { committed = u.recipe; show(u.recipe); saveMirror(u.recipe); editor.refreshBudget(); audio.play('ui.undo'); } ui.setUndo(history.canUndo, history.canRedo); return !!u; };
  api.redo = () => { counters.redo++; const u = history.redo(); if (u) { committed = u.recipe; show(u.recipe); saveMirror(u.recipe); editor.refreshBudget(); audio.play('ui.redo'); } ui.setUndo(history.canUndo, history.canRedo); return !!u; };
  api.counters = counters;
  api.creature = creature;
  api.history = history;
  api.budget = () => costOf(committed, PART);
  api.mesherStats = () => mesher.stats;
  api.canonicalEqual = canonicalEqual;
  api.drive = play.drive;
  api.play = play;
  api.audio = audio;
  api.idle = idle;
  api.editor = editor;
  api.probe = {
    where: (key) => {
      if (key.startsWith('ground:')) { const [x, z] = key.slice(7).split(',').map(Number); const s = new THREE.Vector3(x, 0, z).project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + (s.x * 0.5 + 0.5) * r.width, y: r.top + (-s.y * 0.5 + 0.5) * r.height, r: 20 }; }
      return editor.where(key);
    },
    eyes: () => creature.shape.sockets.filter((s) => s.bones.ball !== undefined).map((s) => {
      const c = new THREE.Vector3(); creature.rig.jointWorld(s.bones.ball, c); creature.body.updateMatrixWorld(true); c.applyMatrix4(creature.body.matrixWorld);
      const p = c.clone().project(camera), r = canvas.getBoundingClientRect();
      const e2 = c.clone().add(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(s.size)).project(camera);
      return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, r: Math.abs(e2.x - p.x) * 0.5 * r.width };
    }),
  };
  api.three = THREE; api.stage = stage; api.orbit = orbit;

  // Debug sheets: ?test&sheet=fixtures
  if (P.get('sheet')) {
    api.sheetReady = (async () => {
      const { showSheet } = await import('./debug/sheet.js');
      const { FIXTURES } = await import('./catalog/fixtures.js');
      creature.group.visible = false; pedestal.group.visible = false; sky.floor.position.y = 0; ui.root.style.display = 'none';
      if (P.get('sheet') === 'fixtures') showSheet(stage, Object.values(FIXTURES), { cols: 4, material: skinMat, partDefs: PART });
    })();
  }

  // ---- loop ----
  let glErrors = 0, frameNo = 0;
  const gl = renderer.getContext();
  const lookW = new THREE.Vector3(), lookR = new THREE.Vector3(), ndc = new THREE.Vector2(), rc = new THREE.Raycaster();
  let pointerXY = null;
  addEventListener('pointermove', (e) => { pointerXY = { x: e.clientX, y: e.clientY, t: simT }; });
  function lookTarget() {
    if (editor.state.lookTarget) return lookR.copy(editor.state.lookTarget);
    if (pointerXY && simT - pointerXY.t < 2.5 && mode !== 'play') {
      const r = canvas.getBoundingClientRect();
      ndc.set(((pointerXY.x - r.left) / r.width) * 2 - 1, -((pointerXY.y - r.top) / r.height) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      lookW.copy(rc.ray.origin).addScaledVector(rc.ray.direction, camera.position.distanceTo(orbit.target) * 0.6);
    } else lookW.copy(camera.position);
    return picker.worldToRig(lookW, lookR);
  }
  function simStep() {
    simT += FIXED;
    hatch.update(FIXED);
    pedestal.update(FIXED);
    const rig = creature.rig;
    if (mode === 'play') play.step(FIXED);
    else {
      orbit.update(FIXED, !editor.state.drag);
      if (rig) rig.toRest();
    }
    if (rig && creature.shape) {
      idle.step(FIXED, rig, creature.shape, lookTarget(), { running: mode === 'play' && play.loco && play.loco.state.run });
      rig.fk(); rig.apply();
    }
    // reactions: squash on tap (0.88 / 1.08; halved with reduced motion)
    if (react.squash >= 0) {
      react.squash += FIXED;
      const k = Math.exp(-6 * react.squash) * Math.cos(18 * react.squash);
      const sq = reduced ? 0.06 : 0.12;
      creature.group.scale.set(1 + (sq * 0.66) * k, 1 - sq * k, 1 + (sq * 0.66) * k);
      if (react.squash > 1.2) { react.squash = -1; creature.group.scale.set(1, 1, 1); }
    }
    if (mode !== 'play') stage.lights.focus.set(0, creature.height * 0.5, 0);
    stage.lights.radius = Math.max(0.6, creature.height);
    stage.updateLights(FIXED);
  }
  function renderFrame() {
    renderer.info.reset();
    if (mode !== 'play') orbit.apply();
    editor.update(FIXED);
    stage.render();
    frameNo++;
    if (TEST) { const e = gl.getError(); if (e !== gl.NO_ERROR) glErrors++; }
  }

  addEventListener('resize', () => { stage.resize(); updateShift(); });
  stage.resize();

  api.step = (n = 1, { render = 0 } = {}) => {
    for (let i = 1; i <= n; i++) { simStep(); if (render && i % render === 0) renderFrame(); }
  };
  api.settle = async () => {
    if (api.sheetReady) await api.sheetReady;
    for (let i = 0; i < 30; i++) { await mesher.idle(); simStep(); renderFrame(); if (!mesher.busy()) break; }
    renderFrame();
  };
  api.info = () => ({ ...stage.info(), glErrors, frame: frameNo, remeshMs: creature.info().remeshMs, creature: creature.info(), audio: audio.status(), mesher: mesher.stats });
  api.breath = () => idle.breath();
  api.metrics = () => ({ frame: frameNo, simT, blinks: idle.state.blinkCount });

  const fontP = document.fonts && document.fonts.load ? document.fonts.load('16px Fredoka').catch(() => null) : Promise.resolve();
  api.fontReady = () => fontP;
  function hatched() {
    setMode('build');
    hand.hide();
    Promise.all([fontP, mesher.idle()]).then(() => readyResolve(true));
  }
  if (TEST && P.has('hatch')) {
    hatch.update(0.5);
    creature.group.visible = false;
    ui.root.style.display = 'none';
    fontP.then(() => readyResolve(true));
  } else if (TEST) {
    hatch.crack();
    for (let i = 0; i < 100; i++) hatch.update(FIXED);
    hatched();
  } else {
    creature.group.visible = false;
    let tapped = false;
    setTimeout(() => hand.show({ x: innerWidth / 2, y: innerHeight * 0.55, r: 48, kind: 'tap' }), 300);
    const go = () => {
      if (tapped) return; tapped = true; removeEventListener('pointerdown', go);
      hand.hide();
      hatch.crack().then(() => { creature.group.visible = true; react.squash = 0; audio.play('ui.born_tada'); hatched(); });
    };
    addEventListener('pointerdown', go);
    mesher.idle().then(() => setTimeout(go, 4000));
    let last = performance.now(), acc = 0;
    renderer.setAnimationLoop((now) => {
      if (document.hidden) { last = now; return; }
      acc += Math.min(0.1, (now - last) / 1000); last = now;
      while (acc >= FIXED) { simStep(); acc -= FIXED; }
      renderFrame();
    });
  }
}
