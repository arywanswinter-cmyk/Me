// assemble.js — places every part instance on its socket and merges pieces into one SkinnedMesh per material.
// Exports: assembleParts(shape, skeleton, materials, { lod, lodFor }) -> { meshes: {mat: SkinnedMesh}, instances, tris, contacts },
//          partHinges(type, p, size) (hinge pivots for shape.js), disposeParts(out).
// Invariants: mirroring is baked (x → −x, normals mirrored, triangle indices 1 and 2 swapped), never a negative scale;
//   every vertex is weighted 1 to its own bone (socket, jaw, ball, lid); parts sharing a material share one draw.
import * as THREE from 'three';
import { buildPart } from './builders.js';

export function partHinges(type, p, size) {
  const b = buildPart(type, { len: 1, curl: 0.5, fat: 1, ...p }, 0, size);
  return b && b.hinges ? b.hinges : null;
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3();
export function assembleParts(shape, skeleton, materials, { lodFor = () => 0, partDefs = {} } = {}) {
  const buckets = {};
  const instances = [];
  let tris = 0;
  for (const s of shape.sockets) {
    const def = partDefs[s.t] || {};
    const lod = lodFor(s);
    const p = { ...(def.params || { len: 1, curl: 0.5, fat: 1 }), ...s.p };
    const built = buildPart(s.t, p, lod, s.size);
    if (!built) continue;
    const fr = s.frame, M = s.mirrored;
    const inst = { id: s.id, inst: s.inst, t: s.t, socket: s, built, lowest: null, verts: [] };
    for (const pc of built.pieces) {
      const g = pc.geo, pos = g.attributes.position, nor = g.attributes.normal, idx = g.index;
      const mat = pc.mat === 'skin' && s.tint && s.tint !== 'skin' ? (s.tint === 'natural' ? 'skin' : `tint:${s.tint}`) : pc.mat;
      const B = buckets[mat] || (buckets[mat] = { pos: [], nor: [], idx: [], bone: [], owner: [] });
      const base = B.pos.length / 3;
      const bone = s.bones[pc.bone] ?? s.bone;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        let px = s.base[0] + fr.X[0] * x + fr.Y[0] * y + fr.Z[0] * z, py = s.base[1] + fr.X[1] * x + fr.Y[1] * y + fr.Z[1] * z, pz = s.base[2] + fr.X[2] * x + fr.Y[2] * y + fr.Z[2] * z;
        const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
        let qx = fr.X[0] * nx + fr.Y[0] * ny + fr.Z[0] * nz, qy = fr.X[1] * nx + fr.Y[1] * ny + fr.Z[1] * nz, qz = fr.X[2] * nx + fr.Y[2] * ny + fr.Z[2] * nz;
        if (M) { px = -px; qx = -qx; }
        B.pos.push(px, py, pz); B.nor.push(qx, qy, qz); B.bone.push(bone); B.owner.push(instances.length);
        if (!inst.lowest || py < inst.lowest.y) inst.lowest = { mat, index: base + i, y: py };
      }
      for (let t = 0; t < idx.count; t += 3) {
        const a = base + idx.getX(t), b = base + idx.getX(t + 1), c = base + idx.getX(t + 2);
        if (M) B.idx.push(a, c, b); else B.idx.push(a, b, c);
      }
      tris += idx.count / 3;
    }
    instances.push(inst);
  }
  const meshes = {};
  for (const [mat, B] of Object.entries(buckets)) {
    const n = B.pos.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    const si = new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = B.bone[i]; sw[i * 4] = 255; }
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
    geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
    geo.userData.owner = Uint16Array.from(B.owner);
    geo.computeBoundingSphere();
    const m = materials[mat] || materials.skin;
    const mesh = new THREE.SkinnedMesh(geo, m);
    mesh.name = `parts:${mat}`;
    mesh.castShadow = true;
    mesh.bind(skeleton, new THREE.Matrix4());
    mesh.boundingSphere = geo.boundingSphere.clone(); mesh.boundingSphere.radius *= 1.5;
    meshes[mat] = mesh;
  }
  return { meshes, instances, tris };
}

export function disposeParts(out) { if (!out) return; for (const m of Object.values(out.meshes)) m.geometry.dispose(); }
