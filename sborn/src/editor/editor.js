// editor.js — the Build tab: pointer state machine, drawer card drags, part placement with symmetry, spine/limb/part handles,
//   wheel and pinch, budgets, and the probe targets automation uses.
// Exports: createEditor(app) -> { handles(), where(key), selection, update(dt), cancel(), state, readyLegLimb(hit) }.
// Invariants: every edit is a pure op on the committed recipe; drags preview (no history) and commit once on release;
//   the body never translates (drags on skin or empty space orbit); refused drops leave the recipe unchanged.
import * as THREE from 'three';
import { bodyField } from './picking.js';
import { resolveAnchor } from '../geo/shape.js';
import { applyOp, meanSpacing, nextId } from '../recipe/ops.js';
import { costOf, partCost, limbCost, fits, BUDGET } from '../catalog/budget.js';
import { buildPart } from '../parts/builders.js';

const deg = THREE.MathUtils.degToRad;
const isTouch = (e) => e.pointerType === 'touch';
const dragThresh = (e) => (isTouch(e) ? 8 : 3);

export function createEditor(app) {
  const { stage, creature, picker, orbit, ui, partDefs } = app;
  const canvas = stage.renderer.domElement;
  const st = { sel: null, drag: null, armed: null, pinch: null, hover: null, mirror: true, lookTarget: null, asym: false, ghostPart: null };
  const pointers = new Map();
  const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();

  const cur = () => app.recipe();
  const budgetNow = (r = cur()) => costOf(r, partDefs);

  // ---------- costs of cards ----------
  function cardCost(card) {
    if (card.kind === 'readyLeg') { const a = limbCost(3, true), b = partCost(partDefs['foot.nub'], true); return { dna: a.dna + b.dna, cx: a.cx + b.cx }; }
    if (card.kind === 'readyArm') { const a = limbCost(3, true), b = partCost(partDefs['hand.mitten'], true); return { dna: a.dna + b.dna, cx: a.cx + b.cx }; }
    if (card.kind === 'bendy') return limbCost(2, true);
    const d = partDefs[card.id];
    return partCost(d, !d.centreOnly);
  }
  function refreshBudget(ghost = null) {
    const b = budgetNow();
    ui.setBudget(b, ghost);
    ui.setLocks((id) => { const card = { id, kind: ['readyLeg', 'readyArm', 'bendy'].includes(id) ? id : 'part' }; return !fits(b, card.kind === 'part' ? partCost(partDefs[id], false) : cardCost(card)); });
  }

  // ---------- handles ----------
  const handleList = [];
  function computeHandles() {
    handleList.length = 0;
    const sh = creature.shape, r = cur();
    if (!sh || app.mode() !== 'build') return handleList;
    const V = r.spine.v, n = V.length;
    const add = (key, kind, p, extra = {}) => { const s = picker.toScreen(v3.set(p[0], p[1], p[2]), {}); if (s.z < 1) handleList.push({ key, kind, x: s.x, y: s.y, p: p.slice(), ...extra }); };
    const endDir = (end) => { const a = end === 'head' ? V[n - 1] : V[0], b = end === 'head' ? V[n - 2] : V[1]; const dy = a[0] - b[0], dz = a[1] - b[1], l = Math.hypot(dy, dz) || 1; return [0, dy / l, dz / l]; };
    for (const end of ['head', 'tail']) {
      const a = end === 'head' ? V[n - 1] : V[0], d = endDir(end), off = a[2] + 0.1;
      add(`handle:spine.${end}`, 'arrow', [0, a[0] + d[1] * off, a[1] + d[2] * off], { end, idle: !st.sel || st.sel.kind !== 'spine', dir: d });
    }
    if (st.sel && st.sel.kind === 'spine') {
      for (let i = 0; i < n; i++) add(`vertebra:${i}`, 'dot', [0, V[i][0], V[i][1]], { i });
      for (let i = 0; i < n - 1; i++) add(`handle:bead:${i}`, 'bead', [0, (V[i][0] + V[i + 1][0]) / 2, (V[i][1] + V[i + 1][1]) / 2], { i });
    }
    if (st.sel && st.sel.kind === 'limb') {
      for (const L of sh.limbs) if (L.id === st.sel.id) for (let j = 1; j < L.joints.length; j++) add(`joint:${L.id}:${j}${L.inst ? ':m' : ''}`, 'joint', L.joints[j], { id: L.id, j, mirrored: L.mirrored });
    }
    if (st.sel && st.sel.kind === 'part') {
      // p-handles: len along the part's Y (out), curl along its Z (forward), fat along its X (across)
      const so = sh.sockets.find((q) => q.id === st.sel.id && !q.mirrored);
      const pr = r.parts.find((q) => q.id === st.sel.id);
      if (so && pr) {
        const def = partDefs[so.t] || {}, built = buildPart(so.t, { ...(def.params || { len: 1, curl: 0.5, fat: 1 }), ...so.p }, 0, so.size);
        const top = Math.max(0.03, built ? built.top || built.radius : so.size * 2), F = so.frame, B = so.base;
        const at = (y, z, x) => [B[0] + F.Y[0] * y + F.Z[0] * z + F.X[0] * x, B[1] + F.Y[1] * y + F.Z[1] * z + F.X[1] * x, B[2] + F.Y[2] * y + F.Z[2] * z + F.X[2] * x];
        const P0 = at(top * 0.5, 0, 0);
        for (const [key, q] of [['len', at(top * 1.15, 0, 0)], ['curl', at(top * 0.5, top * 0.6, 0)], ['fat', at(top * 0.5, 0, top * 0.6)]]) add(`handle:${so.id}.p${key === "len" ? 1 : key === "curl" ? 2 : 3}`, "phandle", q, { id: so.id, pkey: key, from: P0, v: (pr.p && pr.p[key] !== undefined) ? pr.p[key] : (def.params ? def.params[key] : 1) });
      }
    }
    return handleList;
  }
  const handleEls = [];
  function drawHandles() {
    computeHandles();
    const layer = ui.handles;
    while (handleEls.length < handleList.length) { const e = document.createElement('div'); layer.appendChild(e); handleEls.push(e); }
    for (let i = 0; i < handleEls.length; i++) {
      const e = handleEls[i], hd = handleList[i];
      if (!hd) { e.style.display = 'none'; continue; }
      e.style.display = 'block';
      e.className = `hdl ${hd.kind === 'dot' ? '' : hd.kind}${hd.idle ? ' idle' : ''}`;
      e.style.left = `${hd.x}px`; e.style.top = `${hd.y}px`;
      if (hd.kind === 'arrow') { const s2 = picker.toScreen(v3.set(hd.p[0], hd.p[1] + hd.dir[1] * 0.1, hd.p[2] + hd.dir[2] * 0.1), {}); e.style.setProperty('--a', `${Math.atan2(s2.y - hd.y, s2.x - hd.x)}rad`); }
    }
  }
  function hitHandle(x, y, e) {
    computeHandles();
    const rad = isTouch(e) ? 22 : e.pointerType === 'pen' ? 10 : 6;
    let best = null, bd = Infinity;
    for (const hd of handleList) { const d = Math.hypot(hd.x - x, hd.y - y); if (d <= Math.max(rad, 22) && d < bd) { bd = d; best = hd; } }
    return best;
  }

  // ---------- placement ----------
  const bodyW = () => { let w = 0; for (const v of cur().spine.v) w = Math.max(w, 2 * v[2]); return w; };
  function partPlacement(type, x, y, e) {
    const def = partDefs[type];
    if (def.tipOnly) {
      // snap to the nearest limb tip within 40 px (56 touch)
      const sh = creature.shape, lim = isTouch(e) ? 56 : 40;
      let best = null, bd = Infinity;
      for (const L of sh.limbs) {
        const t = L.joints[L.joints.length - 1], s = picker.toScreen(v3.set(t[0], t[1], t[2]), {});
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < lim && d < bd) { bd = d; best = L; }
      }
      if (!best) return null;
      return { at: { b: best.id, tip: 1 }, m: cur().limbs.find((l) => l.id === best.id)?.m ? 1 : 0, limb: best.id };
    }
    const hit = picker.traceSkin(x, y);
    if (!hit) return null;
    const a = picker.anchorFor(hit.p);
    const rp = def.baseR;
    const centreDist = Math.max(0.25 * rp, 0.03 * bodyW());
    let m = st.mirror && !st.asym ? 1 : 0, d = a.d.slice();
    const sMid = picker.toScreen(v3.set(0, hit.p.y, hit.p.z), {}), sHit = picker.toScreen(hit.p, {});
    const midPx = Math.hypot(sMid.x - sHit.x, sMid.y - sHit.y);
    const snapC = def.centreOnly || (a.b === 'spine' && (Math.abs(a.x) < centreDist || midPx < (isTouch(e) ? 20 : 12)));
    if (snapC) { d[0] = 0; const l = Math.hypot(d[1], d[2]) || 1; d = [0, d[1] / l, d[2] / l]; m = 0; }
    else if (!m && a.side < 0 && a.b === 'spine') d[0] = -d[0];
    return { at: { b: a.b, u: a.u, d, tw: 0 }, m, hit, centre: snapC };
  }

  // Ready Leg: root at the drop point (slides down to 35% of body height if above the equator), 25° out and down,
  // knee bent 20° forward, sized so the sole reaches 0.12 m below the body's lowest point.
  function readyLimb(kind, hitP) {
    const sh = creature.shape, r = cur();
    const nn = sh.spine.nearest(0, hitP.y, hitP.z), fr = sh.spine.at(nn.s / sh.spine.L);
    const V = r.spine.v;
    const top = Math.max(...V.map((v) => v[0] + v[2])), bottom = Math.min(...V.map((v) => v[0] - v[2]));
    let py = hitP.y;
    if (kind === 'leg' && py > fr.p[1]) py = bottom + 0.35 * (top - bottom);
    const P = [Math.max(Math.abs(hitP.x), 0.02), py, hitP.z];
    let dir = [P[0] - fr.p[0], P[1] - fr.p[1], P[2] - fr.p[2]];
    const l = Math.hypot(...dir) || 1; dir = dir.map((x) => x / l);
    const d = [dir[0] * fr.X[0] + dir[1] * fr.X[1] + dir[2] * fr.X[2], dir[0] * fr.U[0] + dir[1] * fr.U[1] + dir[2] * fr.U[2], dir[0] * fr.T[0] + dir[1] * fr.T[1] + dir[2] * fr.T[2]];
    // resolve the root exactly like buildShape will
    const bf = bodyField(sh);
    const res = resolveAnchor(bf.P, bf.idx, bf.P.count, fr.p, dir);
    const r0 = Math.min(0.11, Math.max(0.045, 0.32 * fr.r));
    const root = [res.p[0] - res.n[0] * 0.5 * r0, res.p[1] - res.n[1] * 0.5 * r0, res.p[2] - res.n[2] * 0.5 * r0];
    let j;
    if (kind === 'leg') {
      // "the body's lowest point" is the torso's (legs excluded), so every Ready Leg on a creature ends at one level
      const groundY = bottom - 0.12;
      const tipR = 0.75 * r0;
      const drop = Math.max(0.12, root[1] - groundY - tipR);
      const a = deg(25), Lg = drop / Math.cos(a);
      const out = [Math.sin(a), -Math.cos(a), 0];
      const knee = [out[0] * Lg / 2, out[1] * Lg / 2, Math.tan(deg(20)) * Lg / 2 * 0.5];
      j = [[0, 0, 0, r0], [knee[0], knee[1], knee[2], 0.86 * r0], [out[0] * Lg, out[1] * Lg, 0, tipR]];
    } else {
      const La = Math.min(0.5, Math.max(0.2, 1.3 * fr.r));
      const out = [Math.cos(deg(30)), -0.15, Math.sin(deg(30))];
      const ln = Math.hypot(...out); const o = out.map((x) => x / ln);
      const elbow = [o[0] * La / 2, o[1] * La / 2 - 0.02, o[2] * La / 2];
      const tip = [elbow[0] + o[0] * La / 2 * Math.cos(deg(30)), elbow[1] + La / 2 * Math.sin(deg(30)) * 0.3, elbow[2] + o[2] * La / 2 + La / 2 * Math.sin(deg(30))];
      j = [[0, 0, 0, r0 * 0.85], [elbow[0], elbow[1], elbow[2], 0.75 * r0], [tip[0], tip[1], tip[2], 0.65 * r0]];
    }
    return { at: { b: 'spine', u: nn.s / sh.spine.L, d }, m: 1, j, k: 1 };
  }
  function bendyLimb(rootHit, x, y) {
    const sh = creature.shape;
    const a = picker.anchorFor(rootHit.p, { allowLimbs: false });
    const nn = sh.spine.nearest(0, rootHit.p.y, rootHit.p.z), fr = sh.spine.at(nn.s / sh.spine.L);
    const bf = bodyField(sh);
    const D = [fr.X[0] * a.d[0] + fr.U[0] * a.d[1] + fr.T[0] * a.d[2], fr.X[1] * a.d[0] + fr.U[1] * a.d[1] + fr.T[1] * a.d[2], fr.X[2] * a.d[0] + fr.U[2] * a.d[1] + fr.T[2] * a.d[2]];
    const res = resolveAnchor(bf.P, bf.idx, bf.P.count, fr.p, D);
    const r0 = Math.min(0.09, Math.max(0.04, 0.25 * fr.r));
    const root = new THREE.Vector3(res.p[0] - res.n[0] * 0.5 * r0, res.p[1] - res.n[1] * 0.5 * r0, res.p[2] - res.n[2] * 0.5 * r0);
    const camF = picker.camForwardRig(new THREE.Vector3());
    const tgt = picker.rayPlane(x, y, v3b.set(Math.abs(root.x), root.y, root.z), camF, new THREE.Vector3()) || root.clone().add(new THREE.Vector3(0.2, 0, 0));
    if (rootHit.p.x < 0) tgt.x = -tgt.x;
    const dvec = tgt.clone().sub(new THREE.Vector3(Math.abs(root.x), root.y, root.z));
    const dist = dvec.length();
    const nj = Math.min(5, Math.max(2, 1 + Math.floor(dist / 0.22)));
    const reach = Math.max(0.1, Math.min(dist, 5 * 0.22));     // never beyond the 5-joint reach
    const j = [[0, 0, 0, r0]];
    for (let k = 1; k < nj; k++) { const t = k / (nj - 1); j.push([dvec.x / dist * reach * t, dvec.y / dist * reach * t, dvec.z / dist * reach * t, r0 * (1 - 0.25 * t)]); }
    return { limb: { at: { b: 'spine', u: a.u, d: [Math.abs(a.d[0]), a.d[1], a.d[2]] }, m: st.mirror ? 1 : 0, j, k: 1 }, dist, nj };
  }

  // ---------- drags ----------
  function startCardDrag(card, e) {
    st.drag = { kind: 'card', card, id: e.pointerId, base: cur(), next: null, cost: cardCost(card), bendRoot: null };
    card.el.classList.add('lifted');
    ui.ghost.innerHTML = card.el.querySelector('.thumb').innerHTML;
    ui.ghost.classList.add('on');
    app.audio.play('ui.part_in');
    app.creatureReact('ooh');
  }
  // the dragged part's mirror twin draws as a 35% shimmering ghost until the drop
  function setGhost(r, id) { const p = id && r && r.parts.find((q) => q.id === id); creature.ghostId = p && p.m ? id : null; }
  function updateCardDrag(x, y, e) {
    const D = st.drag, card = D.card;
    ui.ghost.style.left = `${x}px`; ui.ghost.style.top = `${y}px`;
    let next = null;
    if (card.kind === 'part') {
      const pl = partPlacement(card.id, x, y, e);
      if (pl) {
        let r = D.base;
        if (pl.at.tip) for (const p of r.parts) if (p.at.tip && p.at.b === pl.at.b) r = applyOp(r, 'part.remove', { id: p.id });
        const def = partDefs[card.id];
        next = applyOp(r, 'part.add', { part: { t: card.id, at: pl.at, m: pl.m, sc: 1, p: {}, tint: def.tint } });
        D.cost = partCost(def, !!pl.m);
      }
    } else if (card.kind === 'bendy') {
      if (!D.bendRoot) { const hit = picker.traceSkin(x, y); if (hit) D.bendRoot = hit; }
      if (D.bendRoot) { const b = bendyLimb(D.bendRoot, x, y); next = applyOp(D.base, 'limb.add', { limb: b.limb }); D.cost = limbCost(b.nj, !!b.limb.m); D.bendDist = b.dist; }
    } else {
      const hit = picker.traceSkin(x, y);
      if (hit) {
        const L = readyLimb(card.kind === 'readyLeg' ? 'leg' : 'arm', hit.p);
        let r = applyOp(D.base, 'limb.add', { limb: L });
        const lid = r.limbs[r.limbs.length - 1].id;
        r = applyOp(r, 'part.add', { part: { t: card.kind === 'readyLeg' ? 'foot.nub' : 'hand.mitten', at: { b: lid, tip: 1 }, m: 1, sc: 1, p: {}, tint: 'skin' } });
        next = r;
      }
    }
    ui.ghost.classList.toggle('on', !next);
    if (next) {
      if (card.kind === 'part') setGhost(next, next.parts.length > D.base.parts.length ? next.parts[next.parts.length - 1].id : null);
      if (!D.next || JSON.stringify(next) !== JSON.stringify(D.next)) app.preview(next);
    } else if (D.next) { creature.ghostId = null; app.preview(D.base); }
    D.next = next;
    refreshBudget(D.cost);
    // eyes follow the dragged thing
    const hit = picker.traceSkin(x, y);
    st.lookTarget = hit ? hit.p.clone() : picker.rayPlane(x, y, v3b.set(0, 0.4, 0.6), picker.camForwardRig(new THREE.Vector3()), new THREE.Vector3());
  }
  function endCardDrag(ok) {
    const D = st.drag;
    D.card.el.classList.remove('lifted');
    ui.ghost.classList.remove('on');
    st.drag = null; st.lookTarget = null;
    if (ok && D.next) {
      const b = costOf(D.base, partDefs), after = costOf(D.next, partDefs);
      if (after.dna > BUDGET.dna || after.cx > BUDGET.cx) {
        app.preview(D.base); app.refuse(); refreshBudget(); return false;
      }
      app.commit(D.next, `add ${D.card.id}`, { placed: true });
      app.audio.play('ui.part_attach');
      app.creatureReact('placed', { card: D.card.id });
      refreshBudget();
      return true;
    }
    app.preview(D.base);
    if (D.next === null) app.audio.play('ui.part_out');
    refreshBudget();
    return false;
  }

  function startDrag(armed, e) {
    const { kind, target } = armed;
    if (kind === 'skin' || kind === 'empty') { st.drag = { kind: 'orbit', last: { x: e.clientX, y: e.clientY } }; return; }
    if (kind === 'part') {
      st.drag = { kind: 'part', base: cur(), id: target.sock.id, mirroredHit: target.sock.mirrored, next: null, lastOn: { x: armed.x, y: armed.y }, detached: false };
      app.audio.play('ui.part_pickup');
      return;
    }
    if (kind === 'handle') {
      const hd = target;
      if (hd.kind === 'dot') st.drag = { kind: 'vertebra', base: cur(), i: hd.i };
      else if (hd.kind === 'arrow') st.drag = { kind: 'arrow', base: cur(), end: hd.end };
      else if (hd.kind === 'joint') st.drag = { kind: 'joint', base: cur(), id: hd.id, j: hd.j, mirrored: hd.mirrored, p: hd.p };
      else if (hd.kind === 'phandle') { const s0 = picker.toScreen(v3.set(...hd.from), {}); st.drag = { kind: "phandle", base: cur(), id: hd.id, key: hd.pkey, v0: hd.v, o: { x: s0.x, y: s0.y }, h: { x: hd.x, y: hd.y }, start: null }; }
      else st.drag = { kind: 'none' };
      app.audio.loop('ui.stretch_squish', true);
    }
  }
  function updateDrag(x, y, e) {
    const D = st.drag;
    if (!D) return;
    if (D.kind === 'orbit') { orbit.orbit(x - D.last.x, y - D.last.y); D.last = { x, y }; return; }
    if (D.kind === 'card') { updateCardDrag(x, y, e); return; }
    if (D.kind === 'part') {
      const r0 = D.base, p = r0.parts.find((q) => q.id === D.id);
      if (!p) return;
      const def = partDefs[p.t];
      const pl = partPlacement(p.t, x, y, e);
      const far = Math.hypot(x - D.lastOn.x, y - D.lastOn.y) > 40;
      let next;
      if (pl && !(pl.at.tip && def.tipOnly && false)) { D.lastOn = { x, y }; D.detached = false; next = applyOp(r0, 'part.move', { id: D.id, at: pl.at, m: def.centreOnly ? 0 : pl.m }); }
      else if (far) { D.detached = true; next = applyOp(r0, 'part.remove', { id: D.id }); ui.ghost.innerHTML = (ui.cards[p.t] && ui.cards[p.t].querySelector('.thumb').innerHTML) || ''; }
      else next = D.next || r0;
      ui.ghost.classList.toggle('on', !!D.detached);
      ui.ghost.style.left = `${x}px`; ui.ghost.style.top = `${y}px`;
      if (next !== D.next) { setGhost(next, D.id); app.preview(next); }
      D.next = next;
      return;
    }
    if (D.kind === 'vertebra') {
      const camF = picker.camForwardRig(new THREE.Vector3());
      const nrm = Math.abs(camF.x) > 0.2 ? new THREE.Vector3(1, 0, 0) : camF;
      const V = D.base.spine.v[D.i];
      const q = picker.rayPlane(x, y, v3b.set(0, V[0], V[1]), nrm, new THREE.Vector3());
      if (!q) return;
      const next = applyOp(D.base, 'spine.move', { i: D.i, y: q.y, z: q.z });
      if (!D.next || next !== D.next) app.preview(next);
      D.next = next;
      return;
    }
    if (D.kind === 'arrow') {
      const V = D.base.spine.v, n = V.length, end = D.end;
      const a = end === 'head' ? V[n - 1] : V[0], b = end === 'head' ? V[n - 2] : V[1];
      const dy = a[0] - b[0], dz = a[1] - b[1], l = Math.hypot(dy, dz) || 1;
      const q = picker.rayPlane(x, y, v3b.set(0, a[0], a[1]), new THREE.Vector3(1, 0, 0), new THREE.Vector3())
        || picker.rayPlane(x, y, v3b.set(0, a[0], a[1]), picker.camForwardRig(new THREE.Vector3()), new THREE.Vector3());
      if (!q) return;
      const s = ((q.y - a[0]) * dy + (q.z - a[1]) * dz) / l - (a[2] + 0.1);
      const sp = meanSpacing(V);
      const k = Math.round(s / sp);
      let next = D.base;
      if (k > 0) for (let i = 0; i < k; i++) next = applyOp(next, 'spine.add', { end });
      else if (k < 0) for (let i = 0; i < -k; i++) next = applyOp(next, 'spine.remove', { end });
      if (k !== D.k) { if (D.k !== undefined) app.audio.play(k > (D.k || 0) ? 'ui.vertebra_add' : 'ui.part_remove'); D.k = k; app.preview(next); D.next = next; }
      return;
    }
    if (D.kind === 'phandle') {
      // pointer travel along the handle's screen direction, one handle-length = +1
      if (!D.start) D.start = { x, y };
      const dx = D.h.x - D.o.x, dy = D.h.y - D.o.y, l2 = Math.max(400, dx * dx + dy * dy);
      const dv = ((x - D.start.x) * dx + (y - D.start.y) * dy) / l2;
      const next = applyOp(D.base, 'part.param', { id: D.id, key: D.key, v: D.v0 + dv });
      if (!D.next || next !== D.next) app.preview(next);
      D.next = next;
      return;
    }
    if (D.kind === 'joint') {
      const camF = picker.camForwardRig(new THREE.Vector3());
      const q = picker.rayPlane(x, y, v3b.set(D.p[0], D.p[1], D.p[2]), camF, new THREE.Vector3());
      if (!q) return;
      const L = creature.shape.limbs.find((l) => l.id === D.id && l.inst === 0);
      if (!L) return;
      const root = L.joints[0];
      const px = D.mirrored ? -q.x : q.x;
      const next = applyOp(D.base, 'limb.joint', { id: D.id, j: D.j, d: [px - root[0], q.y - root[1], q.z - root[2]] });
      app.preview(next); D.next = next;
    }
  }
  function endDrag(ok = true) {
    const D = st.drag;
    if (!D) return;
    app.audio.loop('ui.stretch_squish', false);
    creature.ghostId = null;
    if (D.kind === 'card') { endCardDrag(ok); return; }
    st.drag = null;
    ui.ghost.classList.remove('on');
    if (D.kind === 'orbit') return;
    if (!ok || !D.next) { if (D.base) app.preview(D.base); return; }
    if (D.kind === 'part' && D.detached) { app.commit(D.next, 'remove part'); app.audio.play('ui.part_out'); app.creatureReact('relieved'); }
    else if (D.kind === 'part') { app.commit(D.next, 'move part'); app.audio.play('ui.part_attach'); }
    else if (D.kind === 'arrow') app.commit(D.next, 'spine length');
    else app.commit(D.next, `drag ${D.kind}`);
    refreshBudget();
  }

  // ---------- canvas pointer events ----------
  function onDown(e) {
    if (app.mode() !== 'build') return;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), type: e.pointerType });
    if (pointers.size === 2) {
      const first = [...pointers.values()][0];
      const moved = Math.hypot(first.x - first.x0, first.y - first.y0);
      if (st.drag && st.drag.kind !== 'orbit' && st.drag.kind !== 'card') {
        if (performance.now() - first.t0 < 150 && moved < 12) endDrag(false); else endDrag(true);
      } else if (st.drag) st.drag = null;
      st.armed = null;
      startPinch();
      return;
    }
    if (e.button === 2) { st.drag = { kind: 'orbit', last: { x: e.clientX, y: e.clientY } }; return; }
    const x = e.clientX, y = e.clientY;
    const hd = hitHandle(x, y, e);
    if (hd) { st.armed = { kind: 'handle', target: hd, x, y, e }; return; }
    const ph = picker.hitPart(x, y);
    if (ph) {
      st.armed = { kind: 'part', target: ph, x, y };
      // long-press (450 ms, < 8 px): the radial menu
      clearTimeout(st.lpTimer);
      st.lpTimer = setTimeout(() => { const a = st.armed, pp = pointers.get(e.pointerId); if (a && a.kind === 'part' && pp && Math.hypot(pp.x - a.x, pp.y - a.y) < 8 && pointers.size === 1) { st.armed = null; openRadial(a.target.sock.id, a.x, a.y); } }, 450);
      return;
    }
    const sk = picker.traceSkin(x, y);
    st.armed = { kind: sk ? 'skin' : 'empty', target: sk, x, y };
  }
  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (st.pinch) { updatePinch(); return; }
    if (st.drag && st.drag.kind === 'card') return;
    if (st.armed) {
      const a = st.armed, d = Math.hypot(e.clientX - a.x, e.clientY - a.y);
      const th = a.kind === 'skin' || a.kind === 'empty' ? 4 : dragThresh(e);
      if (d > th) { startDrag(a, e); st.armed = null; }
    }
    if (st.drag) updateDrag(e.clientX, e.clientY, e);
    else if (e.pointerType === 'mouse') st.hoverXY = { x: e.clientX, y: e.clientY };
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    clearTimeout(st.lpTimer);
    if (st.pinch) { if (pointers.size < 2) endPinch(); return; }
    if (st.drag && st.drag.kind === 'card') return;
    if (st.armed) { tap(st.armed, e); st.armed = null; return; }
    if (st.drag) endDrag(e.type !== 'pointercancel');
  }
  let lastTap = { t: 0, key: '' };
  function openRadial(id, x, y) {
    st.sel = { kind: 'part', id };
    const P = () => cur().parts.find((q) => q.id === id);
    ui.radial(x, y, [
      { icon: 'cross', label: 'Delete', fn: () => { app.commit(applyOp(cur(), 'part.remove', { id }), 'delete'); st.sel = null; refreshBudget(); } },
      { icon: 'card', label: 'Duplicate', fn: () => { const p = P(); if (!p || p.at.tip) return; const at = { ...p.at, u: Math.min(1, (p.at.u || 0.5) + 0.06) }; const next = applyOp(cur(), 'part.duplicate', { id, at }); const c = costOf(next, partDefs); if (c.dna > BUDGET.dna || c.cx > BUDGET.cx) { app.refuse(); return; } app.commit(next, 'duplicate'); refreshBudget(); } },
      { icon: 'mirror', label: 'Mirror', fn: () => { const p = P(); if (!p || partDefs[p.t].centreOnly) return; const next = applyOp(cur(), 'part.mirror', { id, m: p.m ? 0 : 1 }); const c = costOf(next, partDefs); if (c.dna > BUDGET.dna || c.cx > BUDGET.cx) { app.refuse(); return; } app.commit(next, 'mirror'); refreshBudget(); } },
      { icon: 'paint', label: 'Tint', fn: () => { const p = P(); if (!p) return; const order = ['skin', 'base', 'coat', 'detail']; const nt = order[(order.indexOf(p.tint) + 1) % order.length]; app.commit(applyOp(cur(), 'part.tint', { id, tint: nt }), 'tint'); } },
    ]);
  }
  // double-tap (300 ms) on a part frames it: the camera turns to its side and zooms to it, still centred on the creature
  function framePart(id) {
    const s = creature.shape.sockets.find((q) => q.id === id && !q.mirrored); if (!s) return;
    const v = v3.set(...s.base); creature.body.updateMatrixWorld(true); const w = v.clone().applyMatrix4(creature.body.matrixWorld);
    if (Math.abs(s.base[0]) + Math.abs(s.base[2]) > 0.02) orbit.az = Math.atan2(s.base[0], s.base[2]);
    orbit.frame({ cy: w.y, h: Math.max(0.25, s.size * 7), r: Math.max(0.12, s.size * 3) });
    st.framed = id;
  }
  function tap(a, e) {
    if (a.kind === 'handle' && a.target.kind === 'bead') { app.commit(applyOp(cur(), 'spine.insert', { i: a.target.i }), 'insert vertebra'); app.audio.play('ui.vertebra_add'); return; }
    if (a.kind === 'handle') return;
    if (a.kind === 'part') {
      const id = a.target.sock.id, now = performance.now();
      if (lastTap.key === id && now - lastTap.t < 300) { framePart(id); lastTap = { t: 0, key: '' }; return; }
      lastTap = { t: now, key: id };
      st.sel = { kind: 'part', id }; app.audio.play('ui.button_tick'); return;
    }
    if (a.kind === 'skin') {
      const an = picker.anchorFor(a.target.p);
      st.sel = an.b === 'spine' ? { kind: 'spine' } : { kind: 'limb', id: an.b };
      app.creatureReact('tap');
      return;
    }
    st.sel = null;
  }

  // ---------- pinch / two fingers ----------
  function startPinch() {
    const [a, b] = [...pointers.values()];
    st.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, ang0: Math.atan2(b.y - a.y, b.x - a.x), lastF: 1, base: cur(), target: pinchTarget((a.x + b.x) / 2, (a.y + b.y) / 2) };
  }
  function pinchTarget(x, y) {
    if (st.sel && st.sel.kind === 'spine') return { kind: 'vertebra', i: nearestVertebra(x, y) };
    if (st.sel && st.sel.kind === 'part') return { kind: 'part', id: st.sel.id };
    return { kind: 'zoom' };
  }
  function updatePinch() {
    const vals = [...pointers.values()];
    if (vals.length < 2) return;
    const [a, b] = vals, P = st.pinch;
    const d = Math.hypot(a.x - b.x, a.y - b.y), f = d / Math.max(1, P.d0);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    orbit.orbit(cx - P.cx, cy - P.cy); P.cx = cx; P.cy = cy;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (P.target.kind === 'zoom') { orbit.zoom(P.lastF / f); P.lastF = f; if (!st.sel) orbit.yaw(-(ang - P.ang0)); P.ang0 = ang; return; }
    if (P.target.kind === 'vertebra') { const next = applyOp(P.base, 'spine.radius', { i: P.target.i, r: P.base.spine.v[P.target.i][2] * f }); app.preview(next); P.next = next; }
    if (P.target.kind === 'part') { let next = applyOp(P.base, 'part.scale', { id: P.target.id, f }); next = applyOp(next, 'part.twist', { id: P.target.id, d: -(ang - Math.atan2(vals[1].y - vals[0].y, vals[1].x - vals[0].x)) + (ang - P.ang0) }); app.preview(next); P.next = next; }
  }
  function endPinch() { const P = st.pinch; st.pinch = null; if (P && P.next) app.commit(P.next, 'pinch'); }

  function nearestVertebra(x, y) {
    const V = cur().spine.v; let best = 0, bd = Infinity;
    V.forEach((v, i) => { const s = picker.toScreen(v3.set(0, v[0], v[1]), {}); const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // ---------- wheel and trackpad ----------
  function onWheel(e) {
    e.preventDefault();
    if (app.mode() !== 'build') { if (app.mode() === 'play' || app.mode() === 'paint') app.wheelOther && app.wheelOther(e); return; }
    const x = e.clientX, y = e.clientY;
    if (e.ctrlKey) {
      const f = Math.exp(-e.deltaY * 0.01);
      if (st.sel && st.sel.kind === 'part') app.commit(applyOp(cur(), 'part.scale', { id: st.sel.id, f }), 'scale', { coalesceKey: `scale:${st.sel.id}` });
      else if (st.sel && st.sel.kind === 'spine') { const i = nearestVertebra(x, y); app.commit(applyOp(cur(), 'spine.radius', { i, r: cur().spine.v[i][2] * f }), 'fatten', { coalesceKey: `fat:${i}` }); }
      else orbit.zoom(1 / f);
      return;
    }
    // picking order: handles first (a vertebra dot under the cursor fattens it even if a part is behind it)
    const hd0 = hitHandle(x, y, e);
    if (hd0 && hd0.kind === 'dot' && !e.shiftKey) {
      const f = Math.exp(-e.deltaY * 0.00077);
      app.commit(applyOp(cur(), 'spine.scale', { i: hd0.i, f }), 'fatten', { coalesceKey: `fat:${hd0.i}` });
      app.audio.play(f > 1 ? 'ui.scale_up' : 'ui.scale_down');
      return;
    }
    const ph = picker.hitPart(x, y);
    if (e.shiftKey && (ph || (st.sel && st.sel.kind === 'part'))) {
      const id = ph ? ph.sock.id : st.sel.id, dd = (e.deltaY || e.deltaX) * 0.004;
      app.commit(applyOp(cur(), 'part.twist', { id, d: dd }), 'twist', { coalesceKey: `tw:${id}` });
      return;
    }
    if (ph) { const f = Math.exp(-e.deltaY * 0.00077); app.commit(applyOp(cur(), 'part.scale', { id: ph.sock.id, f }), 'scale', { coalesceKey: `scale:${ph.sock.id}` }); app.audio.play(f > 1 ? 'ui.scale_up' : 'ui.scale_down'); return; }
    const hd = hitHandle(x, y, e);
    const overSpine = (hd && hd.kind === 'dot') || !!picker.traceSkin(x, y);      // over the body: fatten the nearest vertebra; elsewhere: zoom
    if (overSpine) {
      const i = hd && hd.kind === 'dot' ? hd.i : nearestVertebra(x, y);
      const f = Math.exp(-e.deltaY * 0.00077);
      app.commit(applyOp(cur(), 'spine.scale', { i, f }), 'fatten', { coalesceKey: `fat:${i}` });
      app.audio.play(f > 1 ? 'ui.scale_up' : 'ui.scale_down');
      return;
    }
    orbit.zoom(Math.exp(e.deltaY * 0.001));
  }

  // ---------- drawer cards ----------
  function onCardDown(card, e) {
    if (app.mode() !== 'build') return;
    const s = { card, x0: e.clientX, y0: e.clientY, t0: performance.now(), id: e.pointerId, type: e.pointerType, lifted: false };
    card.el.classList.add('pressed');
    const portrait = innerHeight > innerWidth && innerWidth < 900;
    let holdT = null;
    const lift = (ev) => {
      if (s.lifted) return;
      if (cardLocked(card)) { app.refuse(); cleanup(); return; }
      s.lifted = true; clearTimeout(holdT);
      try { card.el.setPointerCapture(s.id); } catch {}
      startCardDrag(card, ev || e);
      st.drag.id = s.id;
    };
    if (s.type !== 'mouse') holdT = setTimeout(() => lift(null), 180);
    const move = (ev) => {
      if (ev.pointerId !== s.id) return;
      const dx = ev.clientX - s.x0, dy = ev.clientY - s.y0, d = Math.hypot(dx, dy);
      if (!s.lifted) {
        if (s.type === 'mouse') { if (d > 3) lift(ev); }
        else if (d > 10) {
          const ang = portrait ? Math.atan2(Math.abs(dx), -dy) : Math.atan2(Math.abs(dy), dx);   // angle from the direction toward the stage
          if (Math.abs(ang) < deg(50) && (portrait ? dy < 0 : dx > 0)) lift(ev);
          else { clearTimeout(holdT); cleanup(); return; }
        }
      }
      if (s.lifted) updateCardDrag(ev.clientX, ev.clientY, ev);
    };
    const up = (ev) => {
      if (ev.pointerId !== s.id) return;
      clearTimeout(holdT);
      if (s.lifted) endCardDrag(ev.type === 'pointerup');
      cleanup();
    };
    const tm = (ev) => { if (s.lifted && ev.cancelable) ev.preventDefault(); };
    function cleanup() { card.el.classList.remove('pressed'); removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); ui.drawer.removeEventListener('touchmove', tm); }
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
    ui.drawer.addEventListener('touchmove', tm, { passive: false });
  }
  function cardLocked(card) { return !fits(budgetNow(), cardCost(card)); }

  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'gesturechange' && app.mode() === 'build' && pointers.size < 2) orbit.zoom(1 / (e.scale || 1)); }, { passive: false });
  addEventListener('keydown', (e) => { if (e.key === 'a' || e.key === 'A') st.asym = true; if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel && st.sel.kind === 'part' && app.mode() === 'build') { app.commit(applyOp(cur(), 'part.remove', { id: st.sel.id }), 'delete'); st.sel = null; refreshBudget(); } });
  addEventListener('keyup', (e) => { if (e.key === 'a' || e.key === 'A') st.asym = false; });

  // ---------- probe targets ----------
  function where(key) {
    const sh = creature.shape;
    if (/^(card|tab|cat|swatch):|^(undo|redo|mirror|mute|jump|back)$/.test(key)) return ui.where(key);
    if (key.startsWith('handle:') || key.startsWith('vertebra:') || key.startsWith('joint:')) {
      const prevSel = st.sel;
      if (key.startsWith('vertebra:') || key.startsWith('handle:bead')) st.sel = { kind: 'spine' };
      if (key.startsWith('joint:')) st.sel = { kind: 'limb', id: key.split(':')[1] };
      if (/^handle:[^.]+\.p[123]$/.test(key)) st.sel = { kind: 'part', id: key.slice(7).split('.')[0] };
      computeHandles();
      const hd = handleList.find((x) => x.key === key || x.key === `${key}`);
      st.sel = prevSel;
      return hd ? { x: hd.x, y: hd.y, r: 22 } : null;
    }
    if (key.startsWith('part:')) {
      const id = key.slice(5);
      const inst = creature.parts && creature.parts.instances.find((i) => i.id === id && i.inst === 0);
      if (!inst) return null;
      const s = inst.socket, cy = (inst.built.top || 0.03) * 0.5;
      const p = [s.base[0] + s.frame.Y[0] * cy, s.base[1] + s.frame.Y[1] * cy, s.base[2] + s.frame.Y[2] * cy];
      const sc = picker.toScreen(v3.set(...p), {});
      return { x: sc.x, y: sc.y, r: Math.max(12, picker.pxPerM(v3.set(...p)) * inst.built.radius * 0.5) };
    }
    if (key.startsWith('skin:')) {
      // skin:<u> camera-facing side; skin:<u>:top the mid-line of the back; :nose and :tail the mid-line ends
      const [us, where2] = key.slice(5).split(':'), u = +us;
      const fr = sh.spine.at(u);
      let to;
      if (where2 === 'top') to = new THREE.Vector3(0, 1, 0);
      else if (where2 === 'nose') to = new THREE.Vector3(0, -0.2, 1).normalize();
      else if (where2 === 'tail') to = new THREE.Vector3(0, 0.3, -1).normalize();
      else {
        const camPos = picker.worldToRig(stage.camera.position.clone(), new THREE.Vector3());
        to = camPos.clone().sub(new THREE.Vector3(...fr.p));
        const T = new THREE.Vector3(...fr.T); to.addScaledVector(T, -to.dot(T)).normalize();
      }
      const bf = bodyField(sh);
      const res = resolveAnchor(bf.P, bf.idx, bf.P.count, fr.p, [to.x, to.y, to.z]);
      const sc = picker.toScreen(v3.set(...res.p), {});
      return { x: sc.x, y: sc.y, r: 10 };
    }
    return null;
  }

  function update(dt) {
    if (app.mode() === 'build') drawHandles(); else for (const e of handleEls) e.style.display = 'none';
  }
  refreshBudget();
  return { where, update, refreshBudget, state: st, get selection() { return st.sel; }, set selection(s) { st.sel = s; }, setMirror(b) { st.mirror = b; }, cancel: () => endDrag(false), onCardDown, computeHandles, cardCost };
}
