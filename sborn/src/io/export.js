// export.js — offscreen renders through the real pipeline (same programs), the 16-frame turntable strip, the 1080×1350
//   creature card PNG (recipe twice: iTXt + LSB) and the GLB export.
// Exports: createExporter(app) -> { renderFrames(W, H, setups, opts) -> canvases, turntable() -> Promise<Blob>, turntableFor(recipe),
//          card() -> Promise<{ bytes, url, w, h, lsb }>, glb() -> Promise<{ bytes, name, meshes, verts, bounds }> }.
// Invariants: renders resize the drawing buffer for the duration of one task and restore it (no new programs: same
//   scene, lights, fog and output path); Hero skin only for card and GLB; the card text is only the creature's name.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { jobInput } from '../geo/mesher.js';
import { geometryFrom, createCreature } from '../render/creature.js';
import { disposeParts } from '../parts/assemble.js';
import { bakeVertexColors } from '../render/bake.js';
import { embedITXt, writeLSB } from './png.js';
import { icon } from '../ui/icons.js';
import { STAT_GROUPS } from '../catalog/stats.js';

export function createExporter(app) {
  const { stage, creature } = app;
  // render each setup(camera) at W×H through stage.render() and copy it to a 2D canvas
  function renderFrames(W, H, setups, { hero = false } = {}) {
    const r = stage.renderer, c = stage.camera;
    const saved = { aspect: c.aspect, dpr: r.getPixelRatio(), pos: c.position.clone(), quat: c.quaternion.clone(), up: c.up.clone(), fov: c.fov, view: c.view ? { ...c.view } : null };
    const skin = creature.skin; let oldGeo = null, heroGeo = null;
    if (hero && skin && app.mesher && creature.shape) {
      try { const res = app.mesher.runSync(jobInput(creature.shape, 1), 'hero'); if (res && res.skinIndex) { heroGeo = geometryFrom(res); oldGeo = skin.geometry; skin.geometry = heroGeo; } } catch { /* the full skin then */ }
    }
    const out = [];
    try {
      r.setPixelRatio(1); r.setSize(W, H, false); c.aspect = W / H; c.clearViewOffset(); stage.post.resize(W, H);
      for (const setup of setups) {
        setup(c); c.updateProjectionMatrix(); c.updateMatrixWorld();
        r.shadowMap.needsUpdate = true;
        stage.render();
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        cv.getContext('2d', { willReadFrequently: true }).drawImage(r.domElement, 0, 0, W, H);
        out.push(cv);
      }
    } finally {
      if (oldGeo) { skin.geometry = oldGeo; heroGeo.dispose(); }
      c.position.copy(saved.pos); c.quaternion.copy(saved.quat); c.up.copy(saved.up); c.fov = saved.fov; c.aspect = saved.aspect;
      r.setPixelRatio(saved.dpr); stage.resize();
      if (saved.view && saved.view.enabled) c.setViewOffset(saved.view.fullWidth, saved.view.fullHeight, saved.view.offsetX, saved.view.offsetY, saved.view.width, saved.view.height);
      c.updateProjectionMatrix();
      if (app.renderNow) app.renderNow();
    }
    return out;
  }
  // a camera looking at the creature from azimuth az (radians), elevation el, framing its bounds with margin m
  function framer(az, el = 0.28, m = 1.15, who = creature) {
    return (c) => {
      const b = who.bounds, g = who.group.position, h = Math.max(0.2, who.height);
      const ctr = new THREE.Vector3(g.x, g.y + h * 0.5, g.z), R = 0.5 * Math.hypot(b[3] - b[0], h, b[5] - b[2]);
      const d = (R * m) / Math.sin(THREE.MathUtils.degToRad(c.fov) / 2) / Math.min(1, c.aspect);
      c.up.set(0, 1, 0); c.position.set(ctr.x + Math.sin(az) * Math.cos(el) * d, ctr.y + Math.sin(el) * d, ctr.z + Math.cos(az) * Math.cos(el) * d); c.lookAt(ctr);
    };
  }
  // 16 frames × 128 px in one 2048×128 strip (gallery turntables, CSS steps(16))
  async function turntable() {
    const frames = renderFrames(128, 128, Array.from({ length: 16 }, (_, k) => framer(0.6 + (k / 16) * Math.PI * 2, 0.3, 1.05)));
    const strip = document.createElement('canvas'); strip.width = 2048; strip.height = 128;
    const g = strip.getContext('2d'); frames.forEach((f, k) => g.drawImage(f, k * 128, 0));
    return new Promise((res) => strip.toBlob(res, 'image/png'));
  }
  // the strip of any recipe (gallery starters, link bubble): a temporary creature swapped into the scene for 16 frames
  async function turntableFor(recipe) {
    const t = createCreature({ mesher: app.mesher, partDefs: app.partDefs, material: app.mats.skin, partMats: app.mats.map });
    t.setRecipe(recipe, { sync: true });
    if (!t.skin) return null;
    const main = creature.group, was = main.visible;
    main.visible = false; stage.scene.add(t.group);
    app.mats.setPaint(recipe.paint, { height: t.height }); if (t.parts) t.parts.recolor(recipe.paint);
    t.rig.fk(); t.rig.apply();
    let frames;
    try { frames = renderFrames(128, 128, Array.from({ length: 16 }, (_, k) => framer(0.6 + (k / 16) * Math.PI * 2, 0.3, 1.05, t))); }
    finally {
      stage.scene.remove(t.group); main.visible = was;
      const cur = app.recipe(); app.mats.setPaint(cur.paint, { height: creature.height }); if (creature.parts) creature.parts.recolor(cur.paint);
      if (t.skin) t.skin.geometry.dispose(); if (t.parts) disposeParts(t.parts); if (t.rig) t.rig.skeleton.dispose();
    }
    const strip = document.createElement('canvas'); strip.width = 2048; strip.height = 128;
    const g = strip.getContext('2d'); frames.forEach((f, k) => g.drawImage(f, k * 128, 0));
    return new Promise((res) => strip.toBlob(res, 'image/png'));
  }
  // ---- card ----
  const svgImg = (svg) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" '))}`; });
  async function card() {
    const W = 1080, H = 1350, recipe = app.recipe(), stats = app.stats ? app.stats() : {};
    const [shot] = renderFrames(W, 1000, [framer(0.55, 0.22, 1.05)], { hero: true });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    g.fillStyle = '#FFF8EE'; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.roundRect(40, 40, W - 80, 1000 - 40, 48); g.clip(); g.drawImage(shot, 0, 0, W, 1000); g.restore();
    g.lineWidth = 10; g.strokeStyle = '#3A2E5C'; g.beginPath(); g.roundRect(40, 40, W - 80, 960, 48); g.stroke();
    // name
    try { await document.fonts.load('600 72px Fredoka'); } catch {}
    g.fillStyle = '#3A2E5C'; g.font = '600 72px Fredoka, ui-rounded, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(recipe.name || '', W / 2, 1080, W - 120);
    // stat icons with pips: the 6 highest stats
    const list = STAT_GROUPS.flatMap((x) => x.stats).map((k) => [k, stats[k] || 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const cellW = (W - 160) / Math.max(3, Math.min(6, list.length || 1));
    for (let i = 0; i < list.length; i++) {
      const [k, v] = list[i], x = 80 + cellW * i + cellW / 2, im = await svgImg(icon(`stat${k}`));
      if (im) g.drawImage(im, x - 44, 1150, 88, 88);
      for (let p = 0; p < 5; p++) { const fill = Math.max(0, Math.min(1, v - p)); g.beginPath(); g.arc(x - 40 + p * 20, 1268, 8, 0, Math.PI * 2); g.fillStyle = '#E6DDF5'; g.fill(); if (fill > 0) { g.save(); g.beginPath(); g.rect(x - 48 + p * 20, 1258, 16 * fill, 20); g.clip(); g.beginPath(); g.arc(x - 40 + p * 20, 1268, 8, 0, Math.PI * 2); g.fillStyle = '#FF7A59'; g.fill(); g.restore(); } }
    }
    // the small "drag me in" icon: a hand over a card
    const hand = await svgImg('<svg viewBox="0 0 48 48"><rect x="6" y="4" width="26" height="32" rx="6" fill="#FFD23F" stroke="#3A2E5C" stroke-width="3"/><path d="M27 46c-3-2-7-7-8-10-1-2 1-4 3-2l3 3V20c0-1.5 1-2.6 2.6-2.6S30 18.5 30 20v8l.8-.4c1.2-.6 2.5-.2 3 .8l.3.6.8-.2c1.3-.4 2.5.3 2.8 1.4l.2.5h.6c1.4-.2 2.5.8 2.5 2.2V37c0 4-2 7-4.5 9z" fill="#fff" stroke="#3A2E5C" stroke-width="2.5" stroke-linejoin="round"/></svg>');
    if (hand) g.drawImage(hand, W - 150, 1040, 96, 96);
    const img = g.getImageData(0, 0, W, H);
    const lsb = await writeLSB(img, recipe); if (!lsb) console.info('card: recipe too big for the LSB copy (iTXt only)');
    g.putImageData(img, 0, 0);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const bytes = await embedITXt(new Uint8Array(await blob.arrayBuffer()), recipe);
    return { bytes, url: URL.createObjectURL(new Blob([bytes], { type: 'image/png' })), w: W, h: H, lsb };
  }
  // ---- GLB: Hero skin and parts, posed (rest + the current relaxed idle frame), paint baked to COLOR_0, ≤ 3 meshes ----
  function bakePosed(mesh) {
    const geo = mesh.geometry, P = geo.attributes.position, n = P.count, out = new Float32Array(n * 3), v = new THREE.Vector3();
    mesh.skeleton.update();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i); mesh.applyBoneTransform(i, v); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    return out;
  }
  async function glb() {
    const recipe = app.recipe(), mats = app.mats, r = stage.renderer, lift = creature.body.position.y;
    const res = app.mesher.runSync(jobInput(creature.shape, 1), 'hero');
    const heroGeo = geometryFrom(res), hero = new THREE.SkinnedMesh(heroGeo, mats.skin); hero.bind(creature.rig.skeleton, new THREE.Matrix4());
    const groups = { skin: [], parts: [], eyes: [] };
    const plain = (pos, idx, col) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.translate(0, lift, 0); g.computeVertexNormals(); return g; };
    const idxOf = (geo) => Array.from(geo.index.array);
    groups.skin.push(plain(bakePosed(hero), idxOf(heroGeo), bakeVertexColors(r, heroGeo, 'skin', mats)));
    for (const [name, m] of Object.entries(creature.parts ? creature.parts.meshes : {})) {
      if (name === 'ghost') continue;
      const kind = name === 'membrane' ? 'membrane' : name === 'eye' ? 'eye' : name === 'skin' ? 'skin' : name === 'shell' ? 'shell' : 'hard';
      const g = plain(bakePosed(m), idxOf(m.geometry), bakeVertexColors(r, m.geometry, kind, mats));
      (name === 'eye' ? groups.eyes : groups.parts).push(g);
    }
    heroGeo.dispose();
    const scene = new THREE.Scene(), meshes = [];
    for (const [k, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); mesh.name = k;
      scene.add(mesh); meshes.push(mesh);
    }
    const bytes = new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true }));
    const box = new THREE.Box3().setFromObject(scene), verts = meshes.reduce((a, m) => a + m.geometry.attributes.position.count, 0);
    for (const m of meshes) { m.geometry.dispose(); m.material.dispose(); }
    return { bytes, name: `${(recipe.name || 'sborn').replace(/[^\w-]+/g, '_')}.glb`, meshes: meshes.length, verts, bounds: [box.min.toArray(), box.max.toArray()] };
  }
  return { renderFrames, framer, turntable, turntableFor, card, glb };
}
