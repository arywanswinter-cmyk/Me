// shape.js — recipe → shape: resolved anchors, limb joints, socket mounds, bones and the SDF primitive list.
// Exports: buildShape(recipe, partDefs) -> Shape, resolveAnchor(P, chain, at, opts) -> {p, n, inside, ok}, mirrorX(v),
//          limbRoles(shape) (leg | arm | tail-limb per limb instance), ANCHOR_H.
// Invariants: pure and deterministic (no three.js); anchors are arc parameters re-resolved on every build, so parts
//   ride the surface as the body bends; mirror twins are exact x → −x copies; bone order is spine, then each limb
//   instance (joints + tip socket), then part sockets.
import { spineCurve, polyChain } from './curve.js';
import { makePrims, field, allIndex, gradient } from './sdf.js';

export const ANCHOR_H = 0.01;                 // anchor march resolution (m), fixed so anchors never depend on quality
export const mirrorX = (v) => [-v[0], v[1], v[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// March outward from inside along D until f ≥ 0, then bisect 6×; the normal is the field gradient.
export function resolveAnchor(P, idx, n, origin, dir, out = {}) {
  let p = origin.slice(), f = field(P, p[0], p[1], p[2], idx, n);
  let inside = f < 0, steps = 0, prev = p.slice();
  if (!inside) {
    // anchor curve point is outside (very thin body): march inward toward the axis instead
    out.p = p; out.ok = false;
  }
  let t = 0;
  while (f < 0 && steps < 400) {
    const st = Math.max(Math.abs(f), ANCHOR_H / 4);
    prev = p; t += st; p = add(origin, dir, t);
    f = field(P, p[0], p[1], p[2], idx, n);
    steps++;
  }
  let lo = prev, hi = p;
  for (let i = 0; i < 6; i++) {
    const m = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    if (field(P, m[0], m[1], m[2], idx, n) < 0) lo = m; else hi = m;
  }
  const s = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const g = gradient(P, s[0], s[1], s[2], 0.002, idx, n, [0, 0, 0]);
  out.p = s; out.n = norm(g); out.ok = inside; out.evals = steps + 6 + 6;
  return out;
}

const frameDir = (fr, d) => norm([fr.X[0] * d[0] + fr.U[0] * d[1] + fr.T[0] * d[2], fr.X[1] * d[0] + fr.U[1] * d[1] + fr.T[1] * d[2], fr.X[2] * d[0] + fr.U[2] * d[1] + fr.T[2] * d[2]]);

// Socket frame: Y = normal, Z = creature-forward projected onto the tangent plane (+Y if parallel), then the twist.
export function socketFrame(n, tw = 0) {
  const Y = norm(n);
  let f = [0, 0, 1];
  let d = f[0] * Y[0] + f[1] * Y[1] + f[2] * Y[2];
  if (Math.abs(d) > 0.98) { f = [0, 1, 0]; d = Y[1]; }
  let Z = norm([f[0] - d * Y[0], f[1] - d * Y[1], f[2] - d * Y[2]]);
  let X = [Y[1] * Z[2] - Y[2] * Z[1], Y[2] * Z[0] - Y[0] * Z[2], Y[0] * Z[1] - Y[1] * Z[0]];
  if (tw) {
    const c = Math.cos(tw), s = Math.sin(tw);
    const X2 = [X[0] * c - Z[0] * s, X[1] * c - Z[1] * s, X[2] * c - Z[2] * s], Z2 = [X[0] * s + Z[0] * c, X[1] * s + Z[1] * c, X[2] * s + Z[2] * c];
    X = X2; Z = Z2;
  }
  return { X, Y, Z };
}
let hingeFn = null;
export function setHingeSource(f) { hingeFn = f; }

export function buildShape(recipe, partDefs = {}) {
  const sv = recipe.spine.v;
  const spine = spineCurve(sv);
  const bones = [];
  const prims = [];
  // Spine: one cone per vertebra pair, one bone per vertebra.
  for (let i = 0; i < sv.length; i++) bones.push({ pos: [0, sv[i][0], sv[i][1]], parent: -1, kind: 'spine', ref: i, r: sv[i][2] });
  for (let i = 0; i < sv.length - 1; i++) {
    prims.push({ type: 0, a: [0, sv[i][0], sv[i][1]], b: [0, sv[i + 1][0], sv[i + 1][1]], ra: sv[i][2], rb: sv[i + 1][2],
      k: 0.25 * Math.min(sv[i][2], sv[i + 1][2]), group: 0, boneA: i, boneB: i + 1, owner: -1, seg: i });
  }
  // Limbs: parents before children (validate keeps ≤ 2 levels; sort by depth here).
  const byId = Object.fromEntries(recipe.limbs.map((l) => [l.id, l]));
  const depth = (l) => (l.at.b === 'spine' ? 0 : 1 + depth(byId[l.at.b] || { at: { b: 'spine' } }));
  const order = recipe.limbs.slice().sort((a, b) => depth(a) - depth(b));
  const limbs = [];
  const limbInfo = {};
  const scratch = {};
  for (const l of order) {
    const fieldList = makePrims(prims), idx = allIndex(fieldList);
    let chain, parentBone, parentLimb = null, rBody;
    if (l.at.b === 'spine') { chain = spine; }
    else { parentLimb = limbInfo[l.at.b]; chain = parentLimb ? parentLimb.chain : spine; }
    const fr = chain.at(l.at.u ?? 0.5, scratch);
    rBody = fr.r;
    const D = frameDir(fr, l.at.d || [1, 0, 0]);
    const a = resolveAnchor(fieldList, idx, fieldList.count, fr.p, D);
    const r0 = l.j[0][3];
    const root = add(a.p, a.n, -0.5 * r0);
    const joints = l.j.map((j) => [root[0] + j[0], root[1] + j[1], root[2] + j[2]]);
    const radii = l.j.map((j) => j[3]);
    const lchain = polyChain(joints, radii, a.n);
    limbInfo[l.id] = { chain: lchain, joints, radii };
    const instances = l.m ? [0, 1] : [0];
    for (const inst of instances) {
      const mir = inst === 1;
      const J = mir ? joints.map(mirrorX) : joints;
      // parent bone: nearest spine vertebra to the anchor, or the parent limb's joint bone for the segment
      if (!parentLimb) { const nn = spine.nearest(0, fr.p[1], fr.p[2]); parentBone = Math.min(sv.length - 1, Math.round((nn.i + nn.f) / 12)); }
      else {
        const pl = limbs.find((x) => x.id === l.at.b && x.inst === (mir ? 1 : 0)) || limbs.find((x) => x.id === l.at.b);
        parentBone = pl.boneStart + Math.min(pl.joints.length - 1, fr.i);
      }
      const boneStart = bones.length;
      J.forEach((p, ji) => bones.push({ pos: p.slice(), parent: ji === 0 ? parentBone : boneStart + ji - 1, kind: 'limb', ref: `${l.id}:${inst}:${ji}`, r: radii[ji] }));
      bones.push({ pos: J[J.length - 1].slice(), parent: boneStart + J.length - 1, kind: 'tip', ref: `${l.id}:${inst}:tip`, r: radii[radii.length - 1] });
      const limbIndex = limbs.length;
      for (let s = 0; s < J.length - 1; s++) {
        const k = s === 0 ? 0.6 * Math.min(radii[0], rBody) * (l.k ?? 1) : 0.2 * Math.min(radii[s], radii[s + 1]);
        prims.push({ type: 0, a: J[s], b: J[s + 1], ra: radii[s], rb: radii[s + 1], k, group: 1, boneA: boneStart + s, boneB: boneStart + s + 1, owner: limbIndex, seg: s });
      }
      limbs.push({ id: l.id, inst, mirrored: mir, joints: J, radii, k: l.k ?? 1, boneStart, nBones: J.length + 1, tipBone: boneStart + J.length,
        parentBone, parent: l.at.b, anchor: { p: mir ? mirrorX(a.p) : a.p, n: mir ? mirrorX(a.n) : a.n }, chain: mir ? null : lchain, depth: depth(l) });
    }
  }
  // Part sockets: resolved on the body + limbs field (no mounds), sunk along −normal; a mound per rigid part.
  const bodyField = makePrims(prims), bidx = allIndex(bodyField);
  const sockets = [];
  const nBodyPrims = prims.length;
  for (const p of recipe.parts) {
    const def = partDefs[p.t] || { baseR: 0.05, sink: 0.25, group: 'det', tags: [] };
    const sc = p.sc ?? 1, baseR = def.baseR * sc;
    let base, normal, tangentFwd, chainRef = null;
    if (p.at.tip) {
      const L = limbs.find((x) => x.id === p.at.b && x.inst === 0);
      if (!L) continue;
      const J = L.joints, n = J.length;
      const dir = norm([J[n - 1][0] - J[n - 2][0], J[n - 1][1] - J[n - 2][1], J[n - 1][2] - J[n - 2][2]]);
      base = J[n - 1]; normal = dir; chainRef = { limb: L.id };
    } else {
      const chain = p.at.b === 'spine' ? spine : limbInfo[p.at.b] ? limbInfo[p.at.b].chain : spine;
      const fr = chain.at(p.at.u ?? 0.5, scratch);
      const D = frameDir(fr, p.at.d || [0, 1, 0]);
      const a = resolveAnchor(bodyField, bidx, bodyField.count, fr.p, D);
      const sinkD = def.sink * baseR;
      base = add(a.p, a.n, -sinkD); normal = a.n; chainRef = { b: p.at.b, u: p.at.u, surf: a.p };
    }
    const instances = p.m ? [0, 1] : [0];
    for (const inst of instances) {
      const mir = inst === 1;
      const pos = mir ? mirrorX(base) : base, n = mir ? mirrorX(normal) : normal;
      // nearest skin bone for the socket parent
      let parent = 0, best = Infinity;
      for (let b = 0; b < bones.length; b++) {
        if (!(bones[b].kind === 'spine' || bones[b].kind === 'limb' || bones[b].kind === 'tip')) continue;
        const d = Math.hypot(bones[b].pos[0] - pos[0], bones[b].pos[1] - pos[1], bones[b].pos[2] - pos[2]);
        if (d < best) { best = d; parent = b; }
      }
      if (p.at.tip) { const L = limbs.find((x) => x.id === p.at.b && x.inst === inst); if (L) parent = L.tipBone; }
      const bone = bones.length;
      bones.push({ pos: pos.slice(), parent, kind: 'socket', ref: `${p.id}:${inst}`, r: baseR });
      const surf = chainRef.surf ? (mir ? mirrorX(chainRef.surf) : chainRef.surf) : pos;
      // socket frame of the +x instance (the twin is built from it by mirroring): Y = normal, Z = forward on the tangent plane
      const fr = socketFrame(p.at.tip ? (def.group === 'foot' ? [0, -1, 0] : normal) : def.group === 'eye' ? norm([normal[0] * 0.3, normal[1] * 0.3 + 0.1, normal[2] * 0.3 + 1.0]) : normal, p.at.tw || 0);
      let size = baseR;
      if (p.at.tip) { const L = limbs.find((x) => x.id === p.at.b && x.inst === 0); if (L) size = L.radii[L.radii.length - 1] * sc; }
      const sockBones = { socket: bone };
      const hinges = hingeFn ? hingeFn(p.t, p.p || {}, size) : null;
      if (hinges) for (const [name, h] of Object.entries(hinges)) {
        const hp = [base[0] + fr.X[0] * h[0] + fr.Y[0] * h[1] + fr.Z[0] * h[2], base[1] + fr.X[1] * h[0] + fr.Y[1] * h[1] + fr.Z[1] * h[2], base[2] + fr.X[2] * h[0] + fr.Y[2] * h[1] + fr.Z[2] * h[2]];
        sockBones[name] = bones.length;
        const par = /^c[23]$/.test(name) && sockBones[`c${+name[1] - 1}`] !== undefined ? sockBones[`c${+name[1] - 1}`] : bone;   // spring chain c1→c2→c3
        bones.push({ pos: mir ? mirrorX(hp) : hp, parent: par, kind: name, ref: `${p.id}:${inst}:${name}`, r: 0 });
      }
      sockets.push({ id: p.id, t: p.t, inst, mirrored: mir, pos, normal: n, surf, baseR, size, sc, tw: p.at.tw || 0, bone, bones: sockBones, frame: fr, base, tip: !!p.at.tip, limb: p.at.tip ? p.at.b : null, at: p.at, p: p.p || {}, tint: p.tint });
      if (!p.at.tip && def.group !== 'eye') {
        // socket mound: r = 0.55 × base radius, centred a little under the surface point, blended at 0.6 r
        const mr = 0.55 * baseR;
        prims.push({ type: 1, a: add(surf, n, -0.35 * mr), ra: mr, k: 0.6 * mr, group: 2, boneA: bone, boneB: -1, owner: sockets.length - 1, seg: 0 });
      }
    }
  }
  return { recipe, spine, vertebrae: sv, limbs, sockets, bones, prims, nBodyPrims, P: makePrims(prims) };
}

// §6.2 roles: leg = foot on the tip, or tip below 0.25 × hip height pointing down; arm = hand on the tip, or tip above the root.
export function limbRoles(shape, minY = 0, partDefs = {}) {
  const out = [];
  for (const L of shape.limbs) {
    const tipPart = shape.sockets.find((s) => s.tip && s.limb === L.id && s.inst === L.inst);
    const g = tipPart ? (partDefs[tipPart.t] || {}).group : null;
    const root = L.joints[0], tip = L.joints[L.joints.length - 1], prev = L.joints[L.joints.length - 2];
    const hip = root[1] - minY;
    let role = 'tail-limb';
    if (g === 'foot') role = 'leg';
    else if (g === 'hand') role = 'arm';
    else if (tip[1] - L.radii[L.radii.length - 1] - minY < 0.25 * hip && tip[1] < prev[1]) role = 'leg';
    else if (tip[1] > root[1]) role = 'arm';
    out.push(role);
  }
  return out;
}
