// catalog.test.js — the part catalog and starters: builds and budgets, tips, base rings, mirroring, rest pose and bends.
// Exports: nothing (registers tests).
// Invariants: CPU only (skinning done by hand with the rig's own matrices);
//   thumbnails, colour seams and p-handle drags are page checks in tools/checks.cjs.
import { test, ok, T, metric } from './harness.js';
import * as THREE from 'three';
import { buildShape, limbRoles } from '../src/geo/shape.js';
import { jobInput, runJob, meshStats } from '../src/geo/mesher.js';
import { fieldAll, makePrims } from '../src/geo/sdf.js';
import { FIXTURES } from '../src/catalog/fixtures.js';
import { STARTERS, STARTER_NAMES } from '../src/catalog/starters.js';
import { PART, PARTS } from '../src/catalog/parts.js';
import { costOf, BUDGET } from '../src/catalog/budget.js';
import { validate, canonicalEqual } from '../src/recipe/schema.js';
import { buildPart } from '../src/parts/builders.js';
import { selectLods, assembleParts } from '../src/parts/assemble.js';
import { createRig } from '../src/rig/skeleton.js';
import { skinAnchors } from '../src/rig/anchors.js';

const COUNTS = { mouth: 10, eye: 8, foot: 10, hand: 8, wing: 8, tail: 8, fin: 8, det: 10 };
const FIELDS = ['id', 'group', 'name', 'dna', 'cx', 'stats', 'tags', 'baseR', 'sink', 'params'];
const TIPPED = ['mouth.grin', 'mouth.munch', 'mouth.chomper', 'mouth.peep', 'mouth.hook', 'mouth.mandible', 'foot.tiptoe', 'foot.talon', 'hand.scoop', 'hand.snip',
  'det.nubhorn', 'det.curlhorn', 'det.swirlhorn', 'det.antler', 'det.ridge'];
const params = (def, p = {}) => ({ ...(def.params || { len: 1, curl: 0.5, fat: 1 }), ...p });

// world-space vertices of one socket's L0 part, exactly as assemble.js places them
function socketVerts(s, lod = 0) {
  const def = PART[s.t], b = buildPart(s.t, params(def, s.p), lod, s.size), F = s.frame, out = [];
  for (const pc of b.pieces) {
    const pos = pc.geo.attributes.position, top = Math.max(1e-3, b.top || b.radius);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let px = s.base[0] + F.X[0] * x + F.Y[0] * y + F.Z[0] * z;
      const py = s.base[1] + F.X[1] * x + F.Y[1] * y + F.Z[1] * z, pz = s.base[2] + F.X[2] * x + F.Y[2] * y + F.Z[2] * z;
      if (s.mirrored) px = -px;
      out.push({ p: [px, py, pz], y, t: y / top, mat: pc.mat });
    }
  }
  return out;
}

test('C07.starters', '8 starters: 0 open edges, 0 NaN, non-manifold ≤ 1%, volume > 0, Full ≤ 40k triangles; valid and within both budgets', { milestone: 4, items: [7] }, () => {
  ok(STARTER_NAMES.length === T.starters, `${STARTER_NAMES.length} starters`);
  const notes = [];
  for (const n of STARTER_NAMES) {
    const r = STARTERS[n], v = validate(r);
    ok(canonicalEqual(v.recipe || v, r), `${n}: validate() changes it`);
    const c = costOf(r, PART);
    ok(c.dna <= BUDGET.dna && c.cx <= BUDGET.cx, `${n}: over budget ${c.dna}/${c.cx}`);
    const res = runJob(jobInput(buildShape(r, PART), 1), 'full'), m = meshStats(res.position, res.index);
    ok(m.open === 0, `${n}: ${m.open} open edges`); ok(m.nan === 0, `${n}: NaN`);
    ok(m.nonManifold <= T.nonManifoldFrac * m.edges, `${n}: non-manifold ${m.nonManifold}`);
    ok(m.volume > 0, `${n}: volume`); ok(res.nt <= T.skinMaxTris, `${n}: ${res.nt} triangles`);
    notes.push(`${n} ${res.nt}t ${c.dna}/${c.cx}`);
  }
  return notes.join(', ');
});

test('C12.parts', '70 parts at the §7 counts with all fields; L0/L1/L2 build, no NaN, ≤ 1.5k L0; 40-part fixture ≤ 40k after LOD selection', { milestone: 4, items: [12] }, () => {
  ok(PARTS.length === T.parts, `${PARTS.length} parts`);
  for (const [g, n] of Object.entries(COUNTS)) ok(PARTS.filter((d) => d.group === g).length === n, `${g}: count`);
  let worst = 0, worstId = '';
  for (const d of PARTS) {
    for (const f of FIELDS) ok(d[f] !== undefined && d[f] !== null, `${d.id}: missing ${f}`);
    for (const lod of [0, 1, 2]) {
      const b = buildPart(d.id, params(d), lod, d.baseR);
      ok(b && b.pieces.length, `${d.id} L${lod}: no geometry`);
      for (const pc of b.pieces) { const a = pc.geo.attributes.position.array; for (let i = 0; i < a.length; i++) ok(Number.isFinite(a[i]), `${d.id} L${lod}: NaN`); }
      if (lod === 0) { ok(b.tris <= T.partL0MaxTris, `${d.id}: ${b.tris} L0 triangles`); if (b.tris > worst) { worst = b.tris; worstId = d.id; } }
    }
  }
  const sh = buildShape(FIXTURES.max40, PART);
  ok(sh.sockets.length >= 40, `max40 has ${sh.sockets.length} part instances`);
  const sel = selectLods(sh, PART), L = [0, 1, 2].map((f) => selectLods(sh, PART, { force: f }).tris);
  ok(sel.tris <= T.partsL0Max, `max40 after LOD selection: ${sel.tris}`);
  metric('parts-lod', { worstL0: worst, worstId, max40Selected: sel.tris, max40L0: L[0], max40L1: L[1], max40L2: L[2] });
  return `worst L0 ${worstId} ${worst}; max40 selected ${sel.tris}, forced L0/L1/L2 ${L.join('/')}`;
});

// least-squares sphere through points: x²+y²+z² = 2a·x + 2b·y + 2c·z + d
function fitSphere(pts) {
  const A = Array.from({ length: 4 }, () => new Float64Array(4)), B = new Float64Array(4);
  for (const [x, y, z] of pts) { const row = [2 * x, 2 * y, 2 * z, 1], rhs = x * x + y * y + z * z; for (let i = 0; i < 4; i++) { B[i] += row[i] * rhs; for (let j = 0; j < 4; j++) A[i][j] += row[i] * row[j]; } }
  for (let c = 0; c < 4; c++) {        // Gaussian elimination with partial pivoting
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    if (Math.abs(A[c][c]) < 1e-20) return NaN;
    for (let r = c + 1; r < 4; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; B[r] -= f * B[c]; }
  }
  const s = new Float64Array(4);
  for (let r = 3; r >= 0; r--) { let v = B[r]; for (let k = r + 1; k < 4; k++) v -= A[r][k] * s[k]; s[r] = v / A[r][r]; }
  return Math.sqrt(s[3] + s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
}
test('C58.tips', 'every L0 tip: r ≥ 0.15·rBase and a sphere fitted within 0.5·r of the apex has radius ≥ 0.9·r', { milestone: 4, items: [58] }, () => {
  let n = 0, worst = Infinity, worstId = '';
  for (const d of PARTS) {
    const b = buildPart(d.id, params(d), 0, d.baseR);
    if (TIPPED.includes(d.id)) ok(b.tips.length > 0, `${d.id}: no tips listed`);
    for (const tp of b.tips) {
      ok(tp.r >= 0.15 * tp.rBase - 1e-9, `${d.id}: tip r ${tp.r} < 0.15 × ${tp.rBase}`);
      const near = [];
      for (const pc of b.pieces) { const a = pc.geo.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (Math.hypot(a[i] - tp.apex[0], a[i + 1] - tp.apex[1], a[i + 2] - tp.apex[2]) <= 0.5 * tp.r + 1e-9) near.push([a[i], a[i + 1], a[i + 2]]); }
      ok(near.length >= 4, `${d.id}: ${near.length} vertices near a tip apex`);
      const R = fitSphere(near), k = R / tp.r;
      ok(k >= 0.9, `${d.id}: fitted tip radius ${(k * 100).toFixed(1)}% of r`);
      if (k < worst) { worst = k; worstId = d.id; }
      n++;
    }
  }
  return `${n} tips; smallest fitted/r ${worst.toFixed(3)} (${worstId})`;
});

test('C13.base-ring', 'every base-ring vertex inside the skin: field ≤ −0.15 × base height (fixtures and starters)', { milestone: 4, items: [13] }, () => {
  let worst = -Infinity, at = '', n = 0;
  for (const [name, r] of [...Object.entries(FIXTURES), ...Object.entries(STARTERS)]) {
    const sh = buildShape(r, PART), P = makePrims(sh.prims);
    for (const s of sh.sockets) {
      if (s.tip) continue;                      // feet and hands sit on limb tips, not on a skin anchor
      const vs = socketVerts(s), yMin = Math.min(...vs.map((v) => v.y)), H = s.size;
      for (const v of vs) {
        if (v.y > yMin + 0.02 * H) continue;    // the base ring: the part's lowest vertices
        const f = fieldAll(P, v.p[0], v.p[1], v.p[2]) / H;
        if (f > worst) { worst = f; at = `${name}:${s.id}:${s.t}`; }
        n++;
      }
    }
  }
  ok(worst <= T.baseRingField, `base ring at ${worst.toFixed(3)} × base height (${at})`);
  return `${n} base-ring vertices, shallowest ${worst.toFixed(3)} × base height (${at})`;
});

test('C15.mirror', 'twins equal the mirror within 1e-5 and wind outward; a symmetric skin is within Hausdorff ≤ 0.5h of its x-mirror', { milestone: 4, items: [15] }, () => {
  let pairs = 0, worst = 0, inward = 0, faces = 0;
  for (const name of ['trundle', 'flapjack', 'clatter']) {
    const sh = buildShape(STARTERS[name], PART);
    const rig = createRig(sh, limbRoles(sh, 0, PART));
    const parts = assembleParts(sh, rig.skeleton, {}, { partDefs: PART, lodFor: () => 0 });
    for (const s of sh.sockets.filter((q) => q.inst === 0)) {
      const tw = sh.sockets.find((q) => q.id === s.id && q.inst === 1); if (!tw) continue;
      const a = socketVerts(s), b = socketVerts(tw);
      ok(a.length === b.length, `${name}:${s.id} twin vertex count`);
      for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i].p[0] + b[i].p[0]), Math.abs(a[i].p[1] - b[i].p[1]), Math.abs(a[i].p[2] - b[i].p[2]));
      pairs++;
    }
    // winding: each assembled triangle's face normal agrees with its vertex normals (mirrored ones included)
    for (const m of Object.values(parts.meshes)) {
      const g = m.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array;
      for (let t = 0; t < I.length; t += 3) {
        const [i0, i1, i2] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
        const ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2], vx = P[i2] - P[i0], vy = P[i2 + 1] - P[i0 + 1], vz = P[i2 + 2] - P[i0 + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (Math.hypot(cx, cy, cz) < 1e-12) continue;
        const nx = N[i0] + N[i1] + N[i2], ny = N[i0 + 1] + N[i1 + 1] + N[i2 + 1], nz = N[i0 + 2] + N[i1 + 2] + N[i2 + 2];
        faces++; if (cx * nx + cy * ny + cz * nz < 0) inward++;
      }
    }
  }
  ok(worst <= T.mirrorTol, `twin differs from mirror by ${worst}`);
  ok(inward <= faces * 0.01, `${inward}/${faces} part triangles wound inward`);
  // symmetric skin vs its x-mirror (grid hash nearest neighbour)
  const res = runJob(jobInput(buildShape(STARTERS.trundle, PART), 1), 'full'), Pp = res.position, nv = Pp.length / 3, h = res.h, cell = h * 2, grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let v = 0; v < nv; v++) { const k = key(Pp[v * 3], Pp[v * 3 + 1], Pp[v * 3 + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(v); }
  let haus = 0;
  for (let v = 0; v < nv; v++) {
    const x = -Pp[v * 3], y = Pp[v * 3 + 1], z = Pp[v * 3 + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let bd = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const u of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) bd = Math.min(bd, Math.hypot(Pp[u * 3] - x, Pp[u * 3 + 1] - y, Pp[u * 3 + 2] - z));
    haus = Math.max(haus, bd);
  }
  ok(haus <= T.hausdorffH * h, `skin vs x-mirror Hausdorff ${(haus / h).toFixed(3)} h`);
  return `${pairs} twin pairs, worst ${worst.toExponential(2)}; ${inward}/${faces} inward; Hausdorff ${(haus / h).toFixed(3)} h`;
});

// CPU linear-blend skinning with the rig's own bone matrices (bones[i].matrix · inverse_i)
function skinPositions(rig, P, SI, SW) {
  const M = rig.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrix, rig.skeleton.boneInverses[i]));
  const out = new Float32Array(P.length), v = new THREE.Vector3(), acc = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < P.length / 3; i++) {
    v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) { const w = SW[i * 4 + k] / 255; if (w) acc.addScaledVector(t.copy(v).applyMatrix4(M[SI[i * 4 + k]]), w); }
    out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
  }
  return out;
}
test('C16.pose', 'rest pose reproduces rest within 1e-5; a 90° limb bend flips < 0.5% of triangles; posed parts follow the skin within 2 mm', { milestone: 4, items: [16] }, () => {
  const notes = [];
  for (const name of ['trundle', 'skitter']) {
    const sh = buildShape(STARTERS[name], PART), res = runJob(jobInput(sh, 1), 'full');
    const roles = limbRoles(sh, res.minY, PART), rig = createRig(sh, roles);
    rig.setAnchors(skinAnchors(sh, res));
    rig.toRest(); rig.fk(); rig.apply();
    const R0 = skinPositions(rig, res.position, res.skinIndex, res.skinWeight);
    let rest = 0; for (let i = 0; i < R0.length; i++) rest = Math.max(rest, Math.abs(R0[i] - res.position[i]));
    ok(rest <= T.restTol, `${name}: rest pose off by ${rest}`);
    for (let b = 0; b < rig.n; b++) { const p = new THREE.Vector3(); rig.jointWorld(b, p); const r = sh.bones[b].pos; ok(Math.hypot(p.x - r[0], p.y - r[1], p.z - r[2]) <= T.restTol, `${name}: bone ${b} not at rest`); }
    // bend: the first leg's knee 90°, plus a gentle spine curl so anchored parts move
    const L = sh.limbs.find((l) => l.inst === 0);
    rig.local[L.boneStart + 1].setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    for (let i = 0; i < sh.vertebrae.length; i++) if (i !== rig.pelvis) rig.local[i].setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12);
    rig.fk(); rig.apply();
    const P1 = skinPositions(rig, res.position, res.skinIndex, res.skinWeight), I = res.index, M = rig.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrix, rig.skeleton.boneInverses[i]));
    let flips = 0;
    const a = new THREE.Vector3(), b2 = new THREE.Vector3(), c = new THREE.Vector3(), n0 = new THREE.Vector3(), n1 = new THREE.Vector3(), q = new THREE.Matrix3();
    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
      n0.subVectors(b2.fromArray(res.position, i1 * 3), a.fromArray(res.position, i0 * 3)).cross(c.fromArray(res.position, i2 * 3).sub(a));
      // rest normal carried by the dominant bone of vertex 0
      let big = 0; for (let k = 1; k < 4; k++) if (res.skinWeight[i0 * 4 + k] > res.skinWeight[i0 * 4 + big]) big = k;
      n0.applyMatrix3(q.getNormalMatrix(M[res.skinIndex[i0 * 4 + big]]));
      n1.subVectors(b2.fromArray(P1, i1 * 3), a.fromArray(P1, i0 * 3)).cross(c.fromArray(P1, i2 * 3).sub(a));
      if (n0.dot(n1) < 0) flips++;
    }
    const flipFrac = flips / (I.length / 3);
    ok(flipFrac < T.bendFlipFrac, `${name}: ${(flipFrac * 100).toFixed(2)}% triangles flip`);
    // parts follow: each anchored socket keeps its distance to the nearest skin vertex (rest vs posed)
    let follow = 0;
    for (const an of skinAnchors(sh, res)) {
      const r = sh.bones[an.bone].pos, pz = new THREE.Vector3(); rig.jointWorld(an.bone, pz);
      let bd = Infinity, bi = -1;
      for (let v = 0; v < res.nv; v++) { const d = Math.hypot(res.position[v * 3] - r[0], res.position[v * 3 + 1] - r[1], res.position[v * 3 + 2] - r[2]); if (d < bd) { bd = d; bi = v; } }
      const dPose = Math.hypot(P1[bi * 3] - pz.x, P1[bi * 3 + 1] - pz.y, P1[bi * 3 + 2] - pz.z);
      follow = Math.max(follow, Math.abs(dPose - bd));
    }
    ok(follow <= T.partFollowM, `${name}: parts drift ${(follow * 1000).toFixed(2)} mm from the skin`);
    notes.push(`${name} rest ${rest.toExponential(1)}, flips ${(flipFrac * 100).toFixed(2)}%, follow ${(follow * 1000).toFixed(2)} mm`);
  }
  return notes.join('; ');
});

test('C20.stats', 'stats.js matches tests/starter-stats.json to 0.5 for 8 starters × 14 stats (incl. the §7 worked examples)', { milestone: 6, items: [20] }, async () => {
  const { computeStats, STAT_ORDER } = await import('../src/catalog/stats.js');
  const want = await (await fetch(new URL('./starter-stats.json', import.meta.url))).json();
  let n = 0;
  for (const name of STARTER_NAMES) {
    const got = computeStats(STARTERS[name], PART), w = want.starters[name];
    ok(w, `${name} missing from starter-stats.json`);
    for (const s of STAT_ORDER) { ok(Math.abs(got[s] - w.stats[s].value) <= 0.5, `${name} ${s}: ${got[s]} vs ${w.stats[s].value}`); n++; }
  }
  const b = computeStats(STARTERS.bloop, PART), p = computeStats(STARTERS.peepsy, PART);
  ok(b.Bite === 1 && b.Sing === 1 && b.Charm === 1 && b.Health === 1 && STAT_ORDER.filter((s) => b[s]).length === 4, 'Bloop worked example');
  ok(p.Bite === 1 && p.Sing === 2 && p.Charm === 3 && p.Dance === 3 && p.Jump === 1 && p.Health === 1 && STAT_ORDER.filter((s) => p[s]).length === 6, 'Peepsy worked example');
  return `${n} starter × stat values match`;
});
