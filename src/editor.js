// editor.js — the creature editor: after birth, pull, puff and slim the clay, Spore-style, then carry on living.
// Exports: createEditor({ stage, canvas, getCurrent, onRebuilt }) -> { open(), done(), undo(), setTool(t), setMirror(on), get tool, get mirror }.
// Tools: Pull (drag the clay: stretch a leg, lengthen a neck, pull a tail out of the back), Puff and Slim (hold to
//   swell or shrink the clay under your finger). Mirror makes every stroke on both sides at once.
// Flow: open() freezes the creature in its rest pose where it stands; drags that start on the clay sculpt, drags that
//   start off it orbit the camera as usual. done() rebuilds the creature from the new shape (legs, knees, arms, tails
//   and gait all found again) and puts it back on the island in the same spot.
// Invariants: the mesh's triangles never change; every stroke can be undone; nothing is rebuilt until done().
import * as THREE from 'three';
import { brush, pull, puff, mirrorPoint, tailFrom, finalizeShape } from './creature/sculpt.js';
import { createCreature } from './creature/creature.js';

export function createEditor({ stage, canvas, getCurrent, onRebuilt }) {
  let tool = 'pull', mirror = true, active = false, stroke = null;
  const undoStack = [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), hitW = new THREE.Vector3();
  const q = new THREE.Vector3(), camDir = new THREE.Vector3();

  const geo = () => stage.creature.body.geometry;
  const radius = () => { const d = getCurrent().data; return Math.max(d.height, d.width) * 0.17; };

  function snapshot() {
    const c = stage.creature, d = getCurrent().data;
    undoStack.push({
      pos: geo().attributes.position.array.slice(),
      eyes: Array.from({ length: c.eyeCount }, (_, k) => c.eyePos(k)),
      apps: (d.extraApps || []).length,
    });
    if (undoStack.length > 30) undoStack.shift();
  }
  function refresh() {
    const g = geo();
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    g.attributes.normal.needsUpdate = true;
  }
  function pick(e) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    return ray.intersectObject(stage.creature.body, false)[0] || null;
  }

  function onDown(e) {
    if (!active || stroke) return;
    const hit = pick(e);
    if (!hit) return;                                  // off the clay: let the camera orbit
    e.preventDefault();
    stage.controls.enabled = false;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    snapshot();
    const body = stage.creature.body, pos = geo().attributes.position.array, r = radius();
    const P = body.worldToLocal(hit.point.clone()).toArray();
    const sides = [{ c: P, flip: 1 }];
    if (mirror && Math.abs(P[0]) > r) sides.push({ c: mirrorPoint(P), flip: -1 });     // near the middle there is only one of it
    const c = stage.creature;
    const eyes = Array.from({ length: c.eyeCount }, (_, k) => c.eyePos(k));
    stroke = {
      id: e.pointerId, P, normalZ: hit.face.normal.z, start: pos.slice(), eyes, r,
      sides: sides.map((s) => ({ ...s, b: brush(pos, s.c, r), ew: eyes.map((ep) => { const d2 = (ep[0] - s.c[0]) ** 2 + (ep[1] - s.c[1]) ** 2 + (ep[2] - s.c[2]) ** 2; const f = Math.max(0, 1 - d2 / (r * r)); return f * f; }) })),
      d: [0, 0, 0], x: e.clientX, y: e.clientY,
    };
    stage.camera.getWorldDirection(camDir);
    hitW.copy(hit.point);
    plane.setFromNormalAndCoplanarPoint(camDir, hitW);
  }

  function onMove(e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    stroke.x = e.clientX; stroke.y = e.clientY;
    if (tool !== 'pull') return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    if (!ray.ray.intersectPlane(plane, q)) return;
    const body = stage.creature.body, H = getCurrent().data.height;
    const a = body.worldToLocal(q.clone()), b = body.worldToLocal(hitW.clone());
    const d = [a.x - b.x, a.y - b.y, a.z - b.z], len = Math.hypot(...d), max = H * 1.2;
    if (len > max) for (let i = 0; i < 3; i++) d[i] *= max / len;
    stroke.d = d;
    pull(geo().attributes.position.array, stroke.start, stroke.sides.map((s) => ({ idx: s.b.idx, w: s.b.w, d: [d[0] * s.flip, d[1], d[2]] })));
    const c = stage.creature;
    stroke.eyes.forEach((ep, k) => {
      let x = ep[0], y = ep[1], z = ep[2];
      for (const s of stroke.sides) { const w = s.ew[k]; x += d[0] * s.flip * w; y += d[1] * w; z += d[2] * w; }
      c.moveEye(k, [x, y, z]);
    });
    refresh();
  }

  // Puff and Slim work while the finger is held down, under wherever it is now.
  function tick(dt) {
    if (!stroke || tool === 'pull') return;
    const hit = pick({ clientX: stroke.x, clientY: stroke.y });
    if (!hit) return;
    const g = geo(), pos = g.attributes.position.array, nrm = g.attributes.normal.array, H = getCurrent().data.height;
    const P = stage.creature.body.worldToLocal(hit.point.clone()).toArray(), r = stroke.r * 0.85;
    const centres = [P];
    if (mirror && Math.abs(P[0]) > r) centres.push(mirrorPoint(P));
    for (const c of centres) puff(pos, nrm, brush(pos, c, r), (tool === 'puff' ? 1 : -1) * H * 0.22 * dt);
    refresh();
  }

  function onUp(e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    const d = getCurrent().data;
    if (tool === 'pull') {
      d.extraApps = d.extraApps || [];
      for (const s of stroke.sides) {
        const tail = tailFrom(stroke.normalZ, s.b, s.c, [stroke.d[0] * s.flip, stroke.d[1], stroke.d[2]], d.height);
        if (tail) d.extraApps.push(tail);
      }
    }
    geo().computeBoundingSphere();
    stroke = null;
    stage.controls.enabled = true;
  }

  canvas.addEventListener('pointerdown', onDown, { capture: true });
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  let last = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (active) tick(dt);
    requestAnimationFrame(loop);
  })(last);

  function open() {
    if (active || !stage.creature) return;
    active = true; undoStack.length = 0;
    stage.setShaping(true);
  }
  function undo() {
    const s = undoStack.pop();
    if (!s) return;
    const c = stage.creature, d = getCurrent().data;
    geo().attributes.position.array.set(s.pos);
    s.eyes.forEach((p, k) => c.moveEye(k, p));
    if (d.extraApps) d.extraApps.length = s.apps;
    refresh(); geo().computeBoundingSphere();
  }
  function done() {
    if (!active) return;
    active = false; stroke = null;
    const cur = getCurrent(), c = stage.creature;
    const eyes = cur.data.eyes.map((e, k) => ({ ...e, pos: c.eyePos(k) }));
    const shaped = undoStack.length > 0;
    if (shaped) {
      const data = finalizeShape({ ...cur.data, positions: geo().attributes.position.array, eyes });
      const fresh = createCreature(data, { color: data.color, seed: cur.seed });
      stage.swapCreature(fresh, data);
      onRebuilt(fresh, data);
    }
    stage.setShaping(false);
  }

  return {
    open, done, undo,
    setTool: (t) => { tool = t; }, setMirror: (on) => { mirror = on; },
    get tool() { return tool; }, get mirror() { return mirror; }, get active() { return active; },
  };
}
