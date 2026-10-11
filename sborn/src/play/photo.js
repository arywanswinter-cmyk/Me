// photo.js — photo mode: time frozen, pick an emote and scrub its pose, free orbit 0.5–8 m, ±15° roll dial, thirds grid,
//   6 backdrops, 3 frames, and Hero-quality saves of 1920×1080 or 1080×1080 PNGs carrying the recipe (iTXt + LSB).
// Exports: BACKDROPS, FRAMES, createPhoto(app, play) -> { el, enter(), exit(), active, setBackdrop(i), setFrame(i),
//          setRoll(deg), setThirds(b), pose(name, u), save({ square }) -> Promise<{ bytes, w, h, url }>, render(), state }.
// Invariants: the root never moves while in photo mode; backdrops recolour the existing sky dome and floor (no new
//   programs); saves render the hero skin then restore the full one; the PNG is shown in an <img> overlay on touch
//   devices (press-and-hold saves to Photos) and downloaded through <a download> on desktop; no visible text.
import * as THREE from 'three';
import { icon } from '../ui/icons.js';
import { HAND_SVG } from '../ui/hand.js';
import { jobInput } from '../geo/mesher.js';
import { geometryFrom } from '../render/creature.js';
import { embedITXt, writeLSB } from '../io/png.js';

export const BACKDROPS = [
  { id: 'island' },
  { id: 'studio', top: '#5FA8E8', mid: '#A9D6F5', low: '#FDE9D2', floor: '#B0A0A8' },
  { id: 'sunset', top: '#FF9E7A', mid: '#FFC6A0', low: '#FFE9C9', floor: '#E8B49A' },
  { id: 'starry', top: '#8E7CC9', mid: '#B9A8E6', low: '#E7DDFB', floor: '#A898CF' },
  { id: 'bubblegum', top: '#FF8FC4', mid: '#FFC2DE', low: '#FFE6F1', floor: '#F2A8C8' },
  { id: 'mint', top: '#7FD8BE', mid: '#BFEEDD', low: '#EFFFF8', floor: '#A9DCC8' },
];
export const FRAMES = ['none', 'polaroid', 'card'];
const EMOTES = ['dance', 'roar', 'sit', 'sleep', 'wave', 'eat'];
const FIXED = 1 / 60;

export function createPhoto(app, play) {
  const { stage, creature, sky } = app;
  const st = { active: false, az: 0, el: 0.25, dist: 2.5, roll: 0, thirds: false, backdrop: 0, frame: 0, emote: null, u: 0.4, root: null };
  const center = new THREE.Vector3();
  // ---- DOM (icons only) ----
  const h = (tag, cls, attrs = {}, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (html) e.innerHTML = html; return e; };
  const btn = (cls, label, ic) => h('button', `btn ${cls}`, { type: 'button', 'aria-label': label }, ic ? icon(ic) : '');
  const el = h('div', 'photo-ui photo-only');
  const grid = h('div', 'thirds-grid', { 'aria-hidden': 'true' }, '<i></i><i></i><i></i><i></i>');
  const frameEl = h('div', 'photo-frame', { 'aria-hidden': 'true' });
  const top = h('div', 'photo-top');
  const back = btn('big', 'Back to driving', 'back'); back.onclick = () => app.setMode('play');
  const thirdsB = btn('big', 'Grid', 'thirds'); thirdsB.onclick = () => setThirds(!st.thirds);
  const wide = btn('big act', 'Save wide photo', 'saveWide'); wide.onclick = () => saveAndShow(false);
  const square = btn('big act', 'Save square photo', 'saveSquare'); square.onclick = () => saveAndShow(true);
  top.append(back, thirdsB, wide, square);
  const side = h('div', 'photo-side');
  const bdBtns = BACKDROPS.map((b, i) => {
    const e = btn('backdrop', 'Backdrop'); e.dataset.i = i;
    e.style.background = b.top ? `linear-gradient(${b.top}, ${b.mid} 55%, ${b.low})` : 'linear-gradient(#A9D6F5 0 45%, #5DBB63 45% 75%, #6FDCD0 75%)';
    e.onclick = () => setBackdrop(i); side.appendChild(e); return e;
  });
  const frBtns = FRAMES.map((f, i) => { const e = btn('big', 'Frame', ['frameNone', 'framePolaroid', 'frameCard'][i]); e.onclick = () => setFrame(i); side.appendChild(e); return e; });
  const bottom = h('div', 'photo-bottom');
  const emBtns = EMOTES.map((n) => { const e = btn('big emo', n, n); e.onclick = () => pose(n, st.u); bottom.appendChild(e); return e; });
  const scrub = h('input', 'dial scrub', { type: 'range', min: '0', max: '100', value: '40', 'aria-label': 'Pose' });
  scrub.oninput = () => { st.u = +scrub.value / 100; if (st.emote) pose(st.emote, st.u); };
  const roll = h('input', 'dial roll', { type: 'range', min: '-15', max: '15', value: '0', step: '1', 'aria-label': 'Tilt' });
  roll.oninput = () => setRoll(+roll.value);
  const scrubWrap = h('label', 'dialwrap', {}, icon('scrub')); scrubWrap.appendChild(scrub);
  const rollWrap = h('label', 'dialwrap', {}, icon('roll')); rollWrap.appendChild(roll);
  bottom.append(scrubWrap, rollWrap);
  el.append(grid, frameEl, top, side, bottom);
  document.getElementById('ui').appendChild(el);
  const overlay = h('div', 'photo-overlay', { 'aria-hidden': 'true' });
  const oImg = h('img', '', { alt: '' }); const oHand = h('div', 'press-hand', {}, HAND_SVG); const oOk = btn('round', 'Done', 'check');
  oOk.onclick = () => { overlay.style.display = 'none'; };
  overlay.append(oImg, oHand, oOk); document.body.appendChild(overlay);

  // ---- state ----
  function enter() {
    st.active = true; play.freeze(true);
    const L = play.loco.state;
    st.root = { x: L.x, z: L.z, yaw: L.yaw };
    play.loco.setMove(0, 0, 0, false);
    const cam = stage.camera.position;
    center.set(L.x, (L.bodyY || 0) + creature.height * 0.5, L.z);
    st.az = Math.atan2(cam.x - center.x, cam.z - center.z); st.dist = Math.min(8, Math.max(0.5, cam.distanceTo(center)));
    st.el = Math.asin(Math.min(0.95, Math.max(-0.2, (cam.y - center.y) / st.dist)));
    setBackdrop(0); setFrame(0); setThirds(false); setRoll(0); scrub.value = String(Math.round(st.u * 100));
    app.audio.play('ui.photo_shutter', { gainDb: -6 });
    apply();
  }
  function exit() {
    st.active = false; play.freeze(false);
    if (st.backdrop !== 0) setBackdrop(0);
    stage.camera.up.set(0, 1, 0);
    st.emote = null;
    if (play.loco.emotes) play.loco.emotes.stop();
  }
  function apply() {
    const c = stage.camera;
    c.position.set(center.x + Math.sin(st.az) * Math.cos(st.el) * st.dist, center.y + Math.sin(st.el) * st.dist, center.z + Math.cos(st.az) * Math.cos(st.el) * st.dist);
    c.position.y = Math.max(c.position.y, play.ground.height(c.position.x, c.position.z) + 0.1);
    c.up.set(0, 1, 0); c.lookAt(center);
    c.rotateZ(THREE.MathUtils.degToRad(st.roll));
    stage.lights.focus.copy(center);
  }
  // pose: replay the emote from its start to u × its duration with the root held (no movement input, velocity zeroed)
  function pose(name, u = st.u) {
    st.emote = name; st.u = u;
    const L = play.loco, E = L.emotes;
    if (!E) return null;
    E.stop(); L.state.vx = L.state.vz = 0; L.state.speed = 0;
    const v = E.play(name);                                   // eat mimes munching here: no fruit, no walking
    const vnt = v ? E.choose(name) : null, dur = vnt && vnt.dur ? vnt.dur : 2;
    const n = Math.max(1, Math.round((u * Math.min(dur, 4)) / FIXED));
    for (let i = 0; i < n; i++) { L.setMove(0, 0, 0, false); creature.rig.toRest(); L.step(FIXED); L.state.x = st.root.x; L.state.z = st.root.z; L.state.yaw = st.root.yaw; }
    creature.rig.fk(); creature.rig.apply();
    for (const b of emBtns) b.setAttribute('aria-pressed', b.getAttribute('aria-label') === name ? 'true' : 'false');
    return v;
  }
  function setBackdrop(i) {
    st.backdrop = i;
    const b = BACKDROPS[i], island = play.island, dome = sky.dome.material.uniforms, floor = sky.floor.material.uniforms;
    if (!st.saved) st.saved = { top: dome.uTop.value.clone(), mid: dome.uMid.value.clone(), low: dome.uLow.value.clone(), floor: floor.uFloor.value.clone(), fLow: floor.uLow.value.clone(), fMid: floor.uMid.value.clone() };
    if (b.id === 'island') {
      dome.uTop.value.copy(st.saved.top); dome.uMid.value.copy(st.saved.mid); dome.uLow.value.copy(st.saved.low);
      floor.uFloor.value.copy(st.saved.floor); floor.uLow.value.copy(st.saved.fLow); floor.uMid.value.copy(st.saved.fMid);
      sky.floor.visible = false;
      if (island && !island.group.visible) island.enter();
    } else {
      if (island && island.group.visible) island.exit();
      dome.uTop.value.set(b.top); dome.uMid.value.set(b.mid); dome.uLow.value.set(b.low);
      floor.uFloor.value.set(b.floor); floor.uLow.value.set(b.low); floor.uMid.value.set(b.mid);
      sky.floor.visible = true; sky.floor.position.set(st.root.x, play.ground.height(st.root.x, st.root.z) - 0.002, st.root.z);
    }
    for (const e of bdBtns) e.setAttribute('aria-pressed', +e.dataset.i === i ? 'true' : 'false');
  }
  function setFrame(i) { st.frame = i; frameEl.dataset.frame = FRAMES[i]; for (let k = 0; k < frBtns.length; k++) frBtns[k].setAttribute('aria-pressed', k === i ? 'true' : 'false'); }
  function setThirds(v) { st.thirds = v; grid.style.display = v ? '' : 'none'; thirdsB.setAttribute('aria-pressed', v ? 'true' : 'false'); }
  function setRoll(d) { st.roll = Math.max(-15, Math.min(15, d)); roll.value = String(st.roll); if (st.active) apply(); }

  // ---- input: drag orbits, wheel / pinch zooms ----
  const canvas = stage.renderer.domElement, pts = new Map();
  let pinch = null;
  canvas.addEventListener('pointerdown', (e) => { if (!st.active) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: st.dist }; } });
  addEventListener('pointermove', (e) => {
    if (!st.active || !pts.has(e.pointerId)) return;
    const p = pts.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; st.dist = Math.min(8, Math.max(0.5, pinch.dist * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)))); }
    else { st.az -= dx * 0.006; st.el = Math.min(1.3, Math.max(-0.15, st.el + dy * 0.004)); }
    apply();
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { if (!st.active) return; e.preventDefault(); st.dist = Math.min(8, Math.max(0.5, st.dist * Math.exp(e.deltaY * 0.001))); apply(); }, { passive: false });

  // ---- save: Hero skin, offscreen size, frame, recipe twice ----
  function drawFrame(g, W, H) {
    const f = FRAMES[st.frame];
    if (f === 'polaroid') {
      const m = Math.round(Math.min(W, H) * 0.05), b = Math.round(Math.min(W, H) * 0.16);
      g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, W, m); g.fillRect(0, 0, m, H); g.fillRect(W - m, 0, m, H); g.fillRect(0, H - b, W, b);
    } else if (f === 'card') {
      const m = Math.round(Math.min(W, H) * 0.045), r = m * 1.6;
      g.save(); g.fillStyle = '#FFD23F'; g.beginPath(); g.rect(0, 0, W, H); g.roundRect(m, m, W - 2 * m, H - 2 * m, r); g.fill('evenodd'); g.restore();
      g.fillStyle = '#3A2E5C'; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(W / 2 + (k - 1) * m * 0.9, H - m / 2, m * 0.18, 0, Math.PI * 2); g.fill(); }
    }
  }
  async function save({ square = false } = {}) {
    const W = square ? 1080 : 1920, H = 1080, r = stage.renderer, c = stage.camera;
    // hero skin for this render only
    const skin = creature.skin; let oldGeo = null, heroGeo = null;
    if (skin && app.mesher && creature.shape) {
      try { const res = app.mesher.runSync(jobInput(creature.shape, 1), 'hero'); if (res && res.skinIndex) { heroGeo = geometryFrom(res); oldGeo = skin.geometry; skin.geometry = heroGeo; } } catch { /* full skin then */ }
    }
    const aspect = c.aspect, dpr = r.getPixelRatio();
    r.setPixelRatio(1); r.setSize(W, H, false); c.aspect = W / H; c.clearViewOffset(); c.updateProjectionMatrix(); stage.post.resize(W, H);
    r.shadowMap.needsUpdate = true;
    stage.render();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(r.domElement, 0, 0, W, H);
    // restore
    if (oldGeo) { skin.geometry = oldGeo; heroGeo.dispose(); }
    r.setPixelRatio(dpr); c.aspect = aspect; stage.resize();
    drawFrame(g, W, H);
    const recipe = app.recipe();
    const img = g.getImageData(0, 0, W, H);
    const lsb = await writeLSB(img, recipe); if (!lsb) console.info('photo: recipe too big for the LSB copy (iTXt only)');
    g.putImageData(img, 0, 0);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const bytes = await embedITXt(new Uint8Array(await blob.arrayBuffer()), recipe);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    app.audio.play('ui.photo_shutter');
    return { bytes, w: W, h: H, url, lsb };
  }
  async function saveAndShow(sq) {
    const out = await save({ square: sq });
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch) { oImg.src = out.url; overlay.style.display = 'grid'; }
    else { const a = document.createElement('a'); a.href = out.url; a.download = `${(app.recipe().name || 'sborn').replace(/[^\w-]+/g, '_')}.png`; document.body.appendChild(a); a.click(); a.remove(); }
    return out;
  }
  function where(key) {
    if (key === 'photo:back') return back; if (key === 'photo:thirds') return thirdsB; if (key === 'photo:wide') return wide; if (key === 'photo:square') return square;
    if (key.startsWith('photo:backdrop:')) return bdBtns[+key.split(':')[2]]; if (key.startsWith('photo:frame:')) return frBtns[+key.split(':')[2]];
    if (key.startsWith('photo:emote:')) return emBtns[EMOTES.indexOf(key.split(':')[2])]; if (key === 'photo:roll') return roll; if (key === 'photo:scrub') return scrub;
    return null;
  }
  return { el, enter, exit, get active() { return st.active; }, setBackdrop, setFrame, setRoll, setThirds, pose, save, saveAndShow, apply, where, state: st, overlay };
}
