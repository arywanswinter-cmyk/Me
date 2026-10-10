// assemble.js — places every part instance on its socket and merges pieces into one SkinnedMesh per material.
// Exports: assembleParts(shape, skeleton, mats, { lodFor, partDefs }) -> { meshes: {bucket: SkinnedMesh}, instances, tris, recolor(paint) },
//          partHinges(type, p, size) (hinge pivots for shape.js), disposeParts(out), anchorDomain(shape, socket).
// Invariants: mirroring is baked (x → −x, normals mirrored, triangle indices 1 and 2 swapped), never a negative scale;
//   every vertex is weighted 1 to its own bone (socket, jaw, ball, lid); parts sharing a material share one draw;
//   skin-tinted pieces carry skin-shader attributes whose domain starts at the anchor's skin domain, so the seam vanishes.
import * as THREE from 'three';
import { buildPart } from './builders.js';
import { PART } from '../catalog/parts.js';

// Spring parts (tails, antennae, stalks, whiskers, tufts, waving fins) get a 3-bone chain along their out axis at
// 25/50/75% of their height; Verlet springs (anim/springs.js) bend it.
export const isSpringy = (def) => !!def && def.group !== 'eye' && def.group !== 'foot' && def.group !== 'hand' && (def.group === 'tail' || def.tags.includes('spring') || def.tags.includes('wave'));

export function partHinges(type, p, size) {
  const b = buildPart(type, { len: 1, curl: 0.5, fat: 1, ...p }, 0, size);
  if (!b) return null;
  const h = b.hinges ? { ...b.hinges } : {};
  if (isSpringy(PART[type])) { const top = b.top || b.radius; h.c1 = [0, 0.25 * top, 0]; h.c2 = [0, 0.5 * top, 0]; h.c3 = [0, 0.75 * top, 0]; }
  return Object.keys(h).length ? h : null;
}
function limbHash(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

// The skin paint domain at a socket (spine or limb), matching the mesher's step-5 attributes.
export function anchorDomain(shape, s) {
  const surf = s.mirrored ? [-s.surf[0], s.surf[1], s.surf[2]] : s.surf;
  const limbId = s.tip ? s.limb : s.at && s.at.b !== 'spine' ? s.at.b : null;
  if (limbId) {
    const L = shape.limbs.find((l) => l.id === limbId && l.inst === 0);
    if (L && L.chain) {
      const ch = L.chain, p = s.tip ? L.joints[L.joints.length - 1] : surf;
      const nn = ch.nearest(p[0], p[1], p[2]); const fr = ch.at(nn.s / ch.L);
      const r = [p[0] - fr.p[0], p[1] - fr.p[1], p[2] - fr.p[2]];
      return { dom: [nn.s + 31.7 * limbHash(limbId), r[0] * fr.X[0] + r[1] * fr.X[1] + r[2] * fr.X[2], r[0] * fr.U[0] + r[1] * fr.U[1] + r[2] * fr.U[2]], s01: 0.5, belly: 0, limbT: nn.s / ch.L, w: 1 };
    }
  }
  const sp = shape.spine, nn = sp.nearest(0, surf[1], surf[2]), fr = sp.at(nn.s / sp.L);
  const yf = (surf[1] - fr.p[1]) * fr.U[1] + (surf[2] - fr.p[2]) * fr.U[2];
  const belly = Math.min(1, Math.max(0, (-yf / Math.max(fr.r, 1e-3) - 0.15) / 0.7));
  return { dom: [nn.s, Math.abs(surf[0]), yf], s01: nn.s / sp.L, belly, limbT: 0, w: 0 };
}

const lin = (hex) => new THREE.Color(hex);
const INK = lin('#2B2236'), IVORY = lin('#FFF4DD'), MOUTH_A = lin('#4A1621'), MOUTH_B = lin('#C8505E'), TONGUE = lin('#F07C8C');
// hard-surface roles: 0 fixed colour, 1 keratin (detail colour, base→tip gradient + growth ridges), 2/3/4 tint base/coat/detail
const ROLE = { keratin: 1, 'tint:base': 2, 'tint:coat': 3, 'tint:detail': 4, shell: 1 };
const HARD = { ink: [0.55, 0.1], keratin: [0.32, 0.8], teeth: [0.3, 0.6], mouth: [0.6, 0.05], tongue: [0.5, 0.4], tint: [0.42, 0.3] };

// LOD selection (§7): when the L0 sum exceeds the cap, step parts to L1 then L2, smallest first; eyes and the
// `keep` part (selected) stay L0. Returns Map socket → lod and the resulting triangle sum.
export function selectLods(shape, partDefs, { cap = 40000, keep = null, force = null } = {}) {
  const lod = new Map(), info = [];
  let sum = 0;
  for (const s of shape.sockets) {
    const def = partDefs[s.t] || {}, p = { ...(def.params || { len: 1, curl: 0.5, fat: 1 }), ...s.p };
    const tri = [0, 1, 2].map((l) => { const b = buildPart(s.t, p, l, s.size); return b ? b.tris : 0; });
    const l0 = force ?? 0;
    lod.set(s, l0); sum += tri[l0];
    info.push({ s, tri, size: s.size * (s.sc || 1), fixed: def.group === 'eye' || (keep && s.id === keep) });
  }
  if (force === null) {
    const order = info.filter((x) => !x.fixed).sort((a, b) => a.size - b.size);
    for (const step of [1, 2]) for (const x of order) { if (sum <= cap) break; sum += x.tri[step] - x.tri[step - 1]; lod.set(x.s, step); }
  }
  return { lod, tris: sum };
}

// The paint domain of the skin vertex nearest an anchor (when the mesh is known): the base ring copies it exactly.
function skinDomainAt(res, p) {
  const P = res.position, nv = P.length / 3;
  let best = -1, bd = Infinity;
  for (let v = 0; v < nv; v++) { const dx = P[v * 3] - p[0], dy = P[v * 3 + 1] - p[1], dz = P[v * 3 + 2] - p[2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = v; } }
  if (best < 0) return null;
  const D = res.aDomain, D2 = res.aDomain2, A = res.aPaint, k = best * 3, q = best * 4;
  const nA = A instanceof Uint16Array ? 65535 : A instanceof Uint8Array ? 255 : 1;     // aPaint is normalized u16 on the skin
  return { dom: [D[k], D[k + 1], D[k + 2]], dom2: [D2[k], D2[k + 1], D2[k + 2]], pp: [A[q] / nA, A[q + 1] / nA, A[q + 2] / nA, A[q + 3] / nA] };
}

export function assembleParts(shape, skeleton, mats, { lodFor = null, partDefs = {}, keep = null, skinRes = null } = {}) {
  if (!lodFor) { const sel = selectLods(shape, partDefs, { keep }); lodFor = (s) => sel.lod.get(s) || 0; }
  const B = {};
  const bucket = (name) => B[name] || (B[name] = { pos: [], nor: [], idx: [], bone: [], bone2: [], w2: [], dom: [], dom2: [], pp: [], sk: [], eye: [], ex: [], ey: [], ez: [], pu: [], col: [], hard: [], role: [], t: [] });
  const instances = [];
  let tris = 0;
  const c = new THREE.Color();
  for (const s of shape.sockets) {
    const def = partDefs[s.t] || {};
    const p = { ...(def.params || { len: 1, curl: 0.5, fat: 1 }), ...s.p };
    const built = buildPart(s.t, p, lodFor(s), s.size);
    if (!built) continue;
    const fr = s.frame, M = s.mirrored, mx = M ? -1 : 1;
    const ad = anchorDomain(shape, s);
    let sd = null;
    if (skinRes && skinRes.aDomain && !s.tip) sd = skinDomainAt(skinRes, s.mirrored ? [-s.surf[0], s.surf[1], s.surf[2]] : s.surf);
    const thick = def.group === 'fin' || def.group === 'wing' ? 0.03 : 0.12;
    const top = Math.max(1e-3, built.top || built.radius);
    const inst = { id: s.id, inst: s.inst, t: s.t, socket: s, built, lowest: null };
    for (const pc of built.pieces) {
      let mat = pc.mat;
      if (mat === 'skin' && s.tint && s.tint !== 'skin' && s.tint !== 'natural') mat = `tint:${s.tint}`;
      const bname = mat === 'skin' ? 'skin' : mat === 'membrane' ? 'membrane' : mat === 'eye' ? 'eye' : mat === 'shell' ? 'shell' : 'hard';
      const b = bucket(bname);
      const g = pc.geo, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
      const base = b.pos.length / 3;
      const bone = s.bones[pc.bone] ?? s.bone;
      const chain = s.bones.c1 !== undefined ? [s.bone, s.bones.c1, s.bones.c2, s.bones.c3] : null;
      let yMin = Infinity, yMax = -Infinity;
      if (mat === 'mouth') for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        let px = s.base[0] + fr.X[0] * x + fr.Y[0] * y + fr.Z[0] * z, py = s.base[1] + fr.X[1] * x + fr.Y[1] * y + fr.Z[1] * z, pz = s.base[2] + fr.X[2] * x + fr.Y[2] * y + fr.Z[2] * z;
        const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
        let qx = fr.X[0] * nx + fr.Y[0] * ny + fr.Z[0] * nz;
        const qy = fr.X[1] * nx + fr.Y[1] * ny + fr.Z[1] * nz, qz = fr.X[2] * nx + fr.Y[2] * ny + fr.Z[2] * nz;
        if (M) { px = -px; qx = -qx; }
        const t = Math.min(1, Math.max(0, y / top));
        b.pos.push(px, py, pz); b.nor.push(qx, qy, qz);
        if (chain && pc.bone === 'socket') {
          // along the chain: blend the two nearest of socket (0), c1 (.25), c2 (.5), c3 (.75); beyond .75 all c3
          const f = Math.min(3, t / 0.25), i0 = Math.min(3, Math.floor(f)), u = i0 >= 3 ? 0 : f - i0;
          b.bone.push(chain[i0]); b.bone2.push(chain[Math.min(3, i0 + 1)]); b.w2.push(u);
        } else { b.bone.push(bone); b.bone2.push(bone); b.w2.push(0); }
        if (bname === 'skin' || bname === 'membrane') {
          const u = Math.min(1, Math.max(0, (t - 0.05) / 0.15)), k = u * u * (3 - 2 * u);   // bottom 5%: exactly the anchor's domain
          if (t <= 0.05 && !s.tip) (inst.ring || (inst.ring = [])).push({ bucket: bname, index: base + i });
          if (sd) {
            b.dom.push(sd.dom[0] + z * k, sd.dom[1] + Math.abs(x) * k, sd.dom[2] + y * k);
            b.dom2.push(sd.dom2[0] + z * k, sd.dom2[1] + Math.abs(x) * k, sd.dom2[2] + y * k);
            b.pp.push(sd.pp[0], sd.pp[1], sd.pp[2], sd.pp[3]);
          } else {
            b.dom.push(ad.dom[0] + z * k, ad.dom[1] + Math.abs(x) * k, ad.dom[2] + y * k);
            b.dom2.push(ad.dom[0] + z * k, ad.dom[1] + Math.abs(x) * k, ad.dom[2] + y * k);
            b.pp.push(ad.s01, ad.belly, ad.limbT, ad.w);
          }
          b.sk.push(thick / 0.3, 0, 0.78 + 0.22 * Math.min(1, t / 0.3), 0);
        } else if (bname === 'eye') {
          const e = pc.eye;
          b.eye.push((x - e.centre[0]) / e.R, (y - e.centre[1]) / e.R, (z - e.centre[2]) / e.R);
          b.pu.push(e.pupil || 0);
          b.ex.push(fr.X[0] * mx, fr.X[1], fr.X[2]); b.ey.push(fr.Y[0] * mx, fr.Y[1], fr.Y[2]); b.ez.push(fr.Z[0] * mx, fr.Z[1], fr.Z[2]);
        } else {
          const kind = mat.startsWith('tint:') ? 'tint' : mat;
          b.role.push(ROLE[mat] || 0); b.t.push(t);
          if (mat === 'teeth') c.copy(IVORY); else if (mat === 'ink') c.copy(INK); else if (mat === 'tongue') c.copy(TONGUE);
          else if (mat === 'mouth') c.copy(MOUTH_A).lerp(MOUTH_B, (y - yMin) / Math.max(1e-6, yMax - yMin));
          else c.setRGB(1, 1, 1);
          b.col.push(c.r, c.g, c.b);
          const hv = HARD[kind] || HARD.tint; b.hard.push(hv[0], hv[1]);
        }
        if (!inst.lowest || py < inst.lowest.y) inst.lowest = { bucket: bname, index: base + i, y: py };
      }
      for (let t = 0; t < idx.count; t += 3) {
        const a = base + idx.getX(t), bb = base + idx.getX(t + 1), cc = base + idx.getX(t + 2);
        if (M) b.idx.push(a, cc, bb); else b.idx.push(a, bb, cc);
      }
      tris += idx.count / 3;
    }
    instances.push(inst);
  }
  const meshes = {};
  for (const [name, b] of Object.entries(B)) {
    const n = b.pos.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    const si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { const w2 = Math.round(b.w2[i] * 255); si[i * 4] = b.bone[i]; sw[i * 4] = 255 - w2; si[i * 4 + 1] = b.bone2[i]; sw[i * 4 + 1] = w2; }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
    if (name === 'skin' || name === 'membrane') {
      geo.setAttribute('aDomain', new THREE.Float32BufferAttribute(b.dom, 3));
      geo.setAttribute('aDomain2', new THREE.Float32BufferAttribute(b.dom2, 3));
      geo.setAttribute('aPaint', new THREE.Float32BufferAttribute(b.pp, 4));
      geo.setAttribute('aSkin', new THREE.Float32BufferAttribute(b.sk, 4));
    } else if (name === 'eye') {
      geo.setAttribute('aEye', new THREE.Float32BufferAttribute(b.eye, 3));
      geo.setAttribute('aEyeX', new THREE.Float32BufferAttribute(b.ex, 3)); geo.setAttribute('aEyeY', new THREE.Float32BufferAttribute(b.ey, 3)); geo.setAttribute('aEyeZ', new THREE.Float32BufferAttribute(b.ez, 3));
      geo.setAttribute('aPupil', new THREE.Float32BufferAttribute(b.pu, 1));
    } else {
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setAttribute('aHard', new THREE.Float32BufferAttribute(b.hard, 2));
      geo.userData.role = Uint8Array.from(b.role); geo.userData.t = Float32Array.from(b.t);
    }
    geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geo, mats[name] || mats.skin);
    mesh.name = `parts:${name}`;
    mesh.castShadow = true; mesh.receiveShadow = name === 'skin';
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.boundingSphere = geo.boundingSphere.clone(); mesh.boundingSphere.radius *= 1.5;
    meshes[name] = mesh;
  }
  const kc = new THREE.Color(), kd = new THREE.Color();
  function recolor(paint) {
    const layer = [null, null, lin(paint.base.c), lin(paint.coat.c), lin(paint.detail.c)];
    const det = lin(paint.detail.c);
    for (const name of ['hard', 'shell']) {
      const m = meshes[name]; if (!m) continue;
      const g = m.geometry, col = g.attributes.color, role = g.userData.role, tt = g.userData.t;
      for (let i = 0; i < role.length; i++) {
        const r = role[i];
        if (r === 0) continue;
        if (r === 1) {
          const t = tt[i];
          kc.copy(det).multiplyScalar(0.62); kd.copy(det).multiplyScalar(1.15);
          kc.lerp(kd, t).multiplyScalar(0.93 + 0.07 * Math.sin(t * 40));
          col.setXYZ(i, Math.min(1, kc.r), Math.min(1, kc.g), Math.min(1, kc.b));
        } else col.setXYZ(i, layer[r].r, layer[r].g, layer[r].b);
      }
      col.needsUpdate = true;
    }
  }
  return { meshes, instances, tris, recolor };
}

export function disposeParts(out) { if (!out) return; for (const m of Object.values(out.meshes)) m.geometry.dispose(); }
