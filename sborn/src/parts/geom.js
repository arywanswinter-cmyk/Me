// geom.js — the part-building toolkit: tapered sweeps with rounded tips, lathes, ellipsoids, extrusions, transforms, merging.
// Exports: LOD_MUL, seg(n, lod), sweep(path, radii, opts), lathe(profile, segs, opts), ellipsoid(rx, ry, rz, w, h), extrude(pts, depth, bevel, segs),
//          xf(geo, {p, r, s}), merge(list), mirrorGeo(geo), clean(geo), ring(n, r, y).
// Invariants: every geometry is indexed with position + normal only (so merges never mismatch); part space is
//   +Y out of the skin, +Z creature-forward, origin at the sunk base centre; sweeps end in a hemisphere of the last
//   radius, so tips are never sharp.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const LOD_MUL = [1, 0.5, 0.25];
export const seg = (n, lod = 0) => Math.max(3, Math.round(n * LOD_MUL[lod]));

export function clean(geo) {
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  if (!geo.index) {
    const n = geo.attributes.position.count, idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}

// Catmull-Rom sweep along `path` (array of [x,y,z]) with radii per path point; rounded end cap.
export function sweep(path, radii, { radial = 12, axial = 16, lod = 0, capStart = false, capEnd = true, squash = 1, twist = 0 } = {}) {
  const R = seg(radial, lod), A = seg(axial, lod);
  const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const pts = curve.getSpacedPoints(A);
  const rAt = (t) => { const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)), u = f - i; return radii[i] * (1 - u) + radii[i + 1] * u; };
  const T = [], N = [], B = [];
  for (let i = 0; i <= A; i++) T.push(curve.getTangentAt(Math.min(1, i / A)).normalize());
  // rotation-minimising frames by projection
  let n0 = new THREE.Vector3(0, 0, 1);
  if (Math.abs(n0.dot(T[0])) > 0.9) n0.set(1, 0, 0);
  n0.addScaledVector(T[0], -n0.dot(T[0])).normalize();
  N.push(n0); B.push(new THREE.Vector3().crossVectors(T[0], n0));
  for (let i = 1; i <= A; i++) {
    const n = N[i - 1].clone().addScaledVector(T[i], -N[i - 1].dot(T[i])).normalize();
    N.push(n); B.push(new THREE.Vector3().crossVectors(T[i], n));
  }
  const pos = [], nor = [], idx = [];
  // squash fades to round over the last 40% so every capped tip is a true hemisphere (item 58)
  const sqAt = (u) => { if (!capEnd) return squash; const x = Math.min(1, Math.max(0, (u - 0.6) / 0.4)); return squash + (1 - squash) * x * x * (3 - 2 * x); };
  const ringAt = (c, t, n, b, r, ang0, sq = squash) => {
    const start = pos.length / 3;
    for (let k = 0; k < R; k++) {
      const a = ang0 + (k / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a) * sq;
      const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
      pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
      const l = Math.hypot(nx, ny, nz) || 1; nor.push(nx / l, ny / l, nz / l);
    }
    return start;
  };
  const rings = [];
  for (let i = 0; i <= A; i++) rings.push(ringAt(pts[i], T[i], N[i], B[i], Math.max(1e-4, rAt(i / A)), twist * i / A, sqAt(i / A)));
  for (let i = 0; i < A; i++) for (let k = 0; k < R; k++) {
    const a = rings[i] + k, b = rings[i] + (k + 1) % R, c = rings[i + 1] + (k + 1) % R, d = rings[i + 1] + k;
    idx.push(a, b, c, a, c, d);
  }
  const cap = (iRing, c, t, n, b, r, dir, ang0) => {
    const steps = Math.max(2, seg(4, lod));
    let prev = iRing;
    for (let s = 1; s <= steps; s++) {
      const phi = (s / steps) * Math.PI / 2;
      if (s === steps) {
        const tipI = pos.length / 3;
        pos.push(c.x + t.x * r * dir, c.y + t.y * r * dir, c.z + t.z * r * dir); nor.push(t.x * dir, t.y * dir, t.z * dir);
        for (let k = 0; k < R; k++) { const a = prev + k, b2 = prev + (k + 1) % R; if (dir > 0) idx.push(a, b2, tipI); else idx.push(b2, a, tipI); }
      } else {
        const rr = r * Math.cos(phi), off = r * Math.sin(phi) * dir;
        const cc = c.clone().addScaledVector(t, off);
        const start = pos.length / 3;
        for (let k = 0; k < R; k++) {
          const a = ang0 + (k / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a) * (dir > 0 ? sqAt(1) : squash);
          const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
          pos.push(cc.x + nx * rr, cc.y + ny * rr, cc.z + nz * rr);
          const ex = nx * Math.cos(phi) + t.x * Math.sin(phi) * dir, ey = ny * Math.cos(phi) + t.y * Math.sin(phi) * dir, ez = nz * Math.cos(phi) + t.z * Math.sin(phi) * dir;
          const l = Math.hypot(ex, ey, ez) || 1; nor.push(ex / l, ey / l, ez / l);
        }
        for (let k = 0; k < R; k++) {
          const a = prev + k, b2 = prev + (k + 1) % R, c2 = start + (k + 1) % R, d = start + k;
          if (dir > 0) idx.push(a, b2, c2, a, c2, d); else idx.push(b2, a, d, b2, d, c2);
        }
        prev = start;
      }
    }
  };
  if (capEnd) cap(rings[A], pts[A], T[A], N[A], B[A], Math.max(1e-4, rAt(1)), 1, twist);
  if (capStart) cap(rings[0], pts[0], T[0], N[0], B[0], Math.max(1e-4, rAt(0)), -1, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.userData.tip = { apex: pts[A].clone().addScaledVector(T[A], rAt(1)).toArray(), r: rAt(1), rBase: rAt(0) };
  return geo;
}

// Lathe around +Y: profile [[r, y], ...] from bottom to top.
export function lathe(profile, segs = 24, { lod = 0, phi = 0, len = Math.PI * 2 } = {}) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-5), y)), seg(segs, lod), phi, len);
  geo.computeVertexNormals();
  return clean(geo);
}
export function ellipsoid(rx, ry, rz, w = 20, h = 14, lod = 0) {
  const g = new THREE.SphereGeometry(1, seg(w, lod), seg(h, lod));
  g.scale(rx, ry, rz);
  g.computeVertexNormals();
  return clean(g);
}
// 2D outline in the XZ… pts are [x, y] in a plane, extruded along +Z by depth, then the caller orients it.
export function extrude(pts, depth = 0.006, bevel = 0.002, segs = 8, lod = 0) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: lod < 2, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: seg(segs, lod), steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return clean(g);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function xf(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  _m.compose(_p.set(...p), _q, _s.set(...(Array.isArray(s) ? s : [s, s, s])));
  geo.applyMatrix4(_m);
  if (geo.userData.tip) { const a = new THREE.Vector3(...geo.userData.tip.apex).applyMatrix4(_m); geo.userData.tip.apex = a.toArray(); const k = Array.isArray(s) ? Math.max(...s) : s; geo.userData.tip.r *= k; geo.userData.tip.rBase *= k; }
  return geo;
}
export function merge(list) {
  const tips = [];
  for (const g of list) { clean(g); if (g.userData.tip) tips.push(g.userData.tip); }
  const m = mergeGeometries(list, false);
  m.userData.tips = tips;
  return m;
}
export function ring(n, r, y) { const out = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([Math.cos(a) * r, y, Math.sin(a) * r]); } return out; }
