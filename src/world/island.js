// island.js — turns the island data into meshes: clay terrain, sea, sky, trees, bushes, rocks, flowers, clouds.
// Exports: createIsland(world, reveal) -> { group, update(dt, t), dispose }, withReveal(material, reveal, key, extra).
// Look: the same matte clay as the creatures, pastel and hand-made; every blob is a lumpy sphere.
//   Shadows under props are baked into the grass so the sun's shadow map can stay tight around the creature.
// Invariants: `reveal.value` 0 paints the whole world the exact cream of the drawing paper and 1 shows it in colour,
//   so the paper can turn into the island during the birth; the sea and sky are unlit and already in output colour.
import * as THREE from 'three';
import { WATER_Y, EXTENT, SUN, makeNoise } from './terrain.js';
import { mulberry32 } from '../core/rng.js';

export const HORIZON = '#F1ECDF';
const ZENITH = '#BBD8E6';
const PAPER_OUT = { value: new THREE.Vector3(0xF4 / 255, 0xEE / 255, 0xE1 / 255) };   // sRGB, mixed after output conversion
const hex3 = (h) => { const c = new THREE.Color(); c.setStyle(h, THREE.NoColorSpace); return new THREE.Vector3(c.r, c.g, c.b); };

const GLSL_NOISE = /* glsl */`
float wHash(vec2 p) { p = fract(p * vec2(0.3183099, 0.3678794) + 0.1); p *= 17.0; return fract(p.x * p.y * (p.x + p.y)); }
float wNoise(vec2 x) {
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y);
}`;

// Paper-to-world fade on any built-in material.
export function withReveal(mat, reveal, key, extra) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uReveal = reveal;
    sh.uniforms.uPaperOut = PAPER_OUT;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReveal;\nuniform vec3 uPaperOut;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix(uPaperOut, gl_FragColor.rgb, uReveal);');
    extra?.(sh);
  };
  mat.customProgramCacheKey = () => `reveal-${key}`;
  return mat;
}

// A sphere pushed in and out a little, like a ball of clay rolled by hand.
function lumpy(detail, amount, seed) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const rnd = mulberry32(seed), ph = Array.from({ length: 9 }, () => rnd() * 6.283);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + amount * (Math.sin(2.3 * x + ph[0]) * Math.sin(2.1 * y + ph[1]) * Math.sin(2.6 * z + ph[2])
      + 0.5 * Math.sin(4.7 * x + ph[3]) * Math.sin(5.1 * y + ph[4]) * Math.sin(4.3 * z + ph[5]));
    p.setXYZ(i, x * d, y * d, z * d);
  }
  return smoothNormals(g);
}
// Polyhedra come unindexed; average normals of vertices that share a position so the clay reads smooth.
function smoothNormals(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, acc = new Map();
  const key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i), a = acc.get(k) || [0, 0, 0];
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a);
  }
  for (let i = 0; i < p.count; i++) {
    const a = acc.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
    n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
  }
  return g;
}

export function createIsland(world, reveal) {
  const group = new THREE.Group();
  const disposables = [];
  const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
  const { heightAt } = world, { trees, bushes, rocks, flowers } = world.props;
  const sunXZ = [-SUN[0] / SUN[1], -SUN[2] / SUN[1]];   // where a shadow falls per metre of height

  // ---- Terrain: one smooth clay sheet, grass on top, sand at the edge, seabed below.
  const N = 144, step = (2 * EXTENT) / N, row = N + 1;
  const pos = new Float32Array(row * row * 3), nor = new Float32Array(row * row * 3), col = new Float32Array(row * row * 3);
  const hs = new Float32Array(row * row);
  const tint = makeNoise(world.seed + 11);
  const C = (h) => new THREE.Color(h);
  const grassA = C('#9CBF7C'), grassB = C('#88B06C'), grassHigh = C('#ABC47F'), sand = C('#EBDAB5'), wet = C('#D6C199'), bed = C('#C4B48E');
  const shade = [...trees.map((t) => ({ x: t.x + sunXZ[0] * t.trunk * 0.9, z: t.z + sunXZ[1] * t.trunk * 0.9, r: t.blobs[0].r * 1.25, k: 0.32 })),
    ...trees.map((t) => ({ x: t.x, z: t.z, r: 0.45, k: 0.25 })),
    ...bushes.map((b) => ({ x: b.x + sunXZ[0] * 0.3, z: b.z + sunXZ[1] * 0.3, r: 0.75, k: 0.28 })),
    ...rocks.map((r) => ({ x: r.x + sunXZ[0] * r.size * 0.3, z: r.z + sunXZ[1] * r.size * 0.3, r: r.size * 1.5, k: 0.22 }))];
  const c = new THREE.Color();
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = j * row + i, x = -EXTENT + i * step, z = -EXTENT + j * step, h = heightAt(x, z);
    hs[k] = h;
    pos.set([x, h, z], k * 3);
    const e = 0.05, dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    nor.set([-dx / l, (2 * e) / l, -dz / l], k * 3);
    const n = tint(x * 0.35, z * 0.35);
    c.copy(grassA).lerp(grassB, n).lerp(grassHigh, Math.min(1, Math.max(0, (h - 0.6) / 1.4)) * 0.6);
    c.lerp(sand, 1 - Math.min(1, Math.max(0, (h - WATER_Y - 0.2) / 0.16)));
    if (h < WATER_Y + 0.08) c.lerp(wet, Math.min(1, (WATER_Y + 0.08 - h) / 0.1));
    if (h < WATER_Y - 0.05) c.lerp(bed, Math.min(1, (WATER_Y - 0.05 - h) / 0.6)).multiplyScalar(1 - Math.min(0.35, (WATER_Y - h) * 0.12));
    let ao = 1;
    for (const s of shade) {
      const d = Math.hypot(x - s.x, z - s.z) / s.r;
      if (d < 1) ao *= 1 - s.k * (1 - d * d) * (1 - d * d);
    }
    c.multiplyScalar(ao);
    col.set([c.r, c.g, c.b], k * 3);
  }
  const idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * row + i, b = a + 1, d = a + row, e = d + 1;
    if (Math.max(hs[a], hs[b], hs[d], hs[e]) < -3.0) continue;      // deep seabed hides under opaque water
    idx.push(a, d, b, b, d, e);
  }
  const tgeo = keep(new THREE.BufferGeometry());
  tgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tgeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tgeo.setIndex(idx);
  tgeo.computeBoundingSphere();
  const tmat = keep(withReveal(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, envMapIntensity: 0.5 }), reveal, 'terrain', (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float g = wNoise(vWPos.xz * 2.3) * 0.55 + wNoise(vWPos.xz * 9.0 + 3.7) * 0.45;
  diffuseColor.rgb *= 0.92 + 0.14 * g; }`);
  }));
  const terrain = new THREE.Mesh(tgeo, tmat);
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  group.add(terrain);

  // ---- Sea: unlit, coloured by depth (baked from the height field), with a breathing foam line at the shore.
  const DN = 256, depth = new Uint8Array(DN * DN * 4);
  for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
    const x = -EXTENT + ((i + 0.5) / DN) * 2 * EXTENT, z = -EXTENT + ((j + 0.5) / DN) * 2 * EXTENT;
    const d = Math.min(1, Math.max(0, (WATER_Y - heightAt(x, z)) / 3));
    depth[(j * DN + i) * 4] = Math.round(d * 255); depth[(j * DN + i) * 4 + 3] = 255;
  }
  const dtex = keep(new THREE.DataTexture(depth, DN, DN, THREE.RGBAFormat));
  dtex.magFilter = dtex.minFilter = THREE.LinearFilter;
  dtex.needsUpdate = true;
  const sunDir = new THREE.Vector3(...SUN).normalize();
  const seaU = {
    uTime: { value: 0 }, uDepth: { value: dtex }, uExtent: { value: EXTENT },
    uShallow: { value: hex3('#A9DDD6') }, uDeep: { value: hex3('#6FB7CC') }, uFar: { value: hex3('#8CC3D3') },
    uSun: { value: sunDir }, uFogColor: { value: hex3(HORIZON) }, uFogNear: { value: 30 }, uFogFar: { value: 150 },
    uReveal: reveal, uPaperOut: PAPER_OUT,
  };
  const smat = keep(new THREE.ShaderMaterial({
    uniforms: seaU, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: /* glsl */`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
uniform float uTime, uExtent, uFogNear, uFogFar, uReveal;
uniform sampler2D uDepth;
uniform vec3 uShallow, uDeep, uFar, uSun, uFogColor, uPaperOut;
varying vec3 vW;
${GLSL_NOISE}
void main() {
  vec2 uv = vW.xz / (2.0 * uExtent) + 0.5;
  bool inside = all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)));
  float d = inside ? texture2D(uDepth, uv).r * 3.0 : 3.0;
  float dist = length(vW - cameraPosition);
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 1.8, d));
  col = mix(col, uFar, smoothstep(18.0, 60.0, length(vW.xz)));
  float alpha = mix(0.5, 1.0, smoothstep(0.0, 1.4, d));
  // Ripples: a drifting noise normal catches the sun as soft glints.
  vec2 q = vW.xz * 1.3;
  float n0 = wNoise(q + uTime * vec2(0.18, 0.11)) + wNoise(q * 2.1 - uTime * vec2(0.13, 0.2));
  float nx = wNoise(q + vec2(0.07, 0.0) + uTime * vec2(0.18, 0.11)) + wNoise((q + vec2(0.07, 0.0)) * 2.1 - uTime * vec2(0.13, 0.2));
  float nz = wNoise(q + vec2(0.0, 0.07) + uTime * vec2(0.18, 0.11)) + wNoise((q + vec2(0.0, 0.07)) * 2.1 - uTime * vec2(0.13, 0.2));
  vec3 nrm = normalize(vec3((n0 - nx) * 1.2, 1.0, (n0 - nz) * 1.2));
  vec3 v = normalize(cameraPosition - vW);
  float spec = pow(max(dot(reflect(-uSun, nrm), v), 0.0), 90.0);
  col += vec3(1.0, 0.97, 0.9) * spec * 0.55;
  col = mix(col, vec3(0.93, 0.97, 0.98), pow(1.0 - max(v.y, 0.0), 4.0) * 0.35);
  // Foam: a steady lip at the waterline plus a soft wave that rolls in and fades.
  float wob = wNoise(vW.xz * 1.7 + uTime * 0.3) * 0.05;
  float lip = 1.0 - smoothstep(0.0, 0.05 + wob, d);
  float ph = fract(uTime * 0.22);
  float wave = (1.0 - smoothstep(0.0, 0.025, abs(d - (1.0 - ph) * 0.3 - wob))) * smoothstep(0.0, 0.25, ph) * (1.0 - ph);
  float foam = clamp(lip + wave * 0.8, 0.0, 1.0) * (inside ? 1.0 : 0.0);
  col = mix(col, vec3(1.0, 0.995, 0.97), foam * 0.9);
  alpha = max(alpha, foam * 0.95);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(mix(uPaperOut, col, uReveal), mix(1.0, alpha, uReveal));
}`,
  }));
  const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(420, 420)), smat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WATER_Y;
  sea.renderOrder = 2;
  sea.name = 'sea';
  group.add(sea);

  // ---- Sky: paper-cream at the horizon, soft blue overhead.
  const skyMat = keep(new THREE.ShaderMaterial({
    uniforms: { uHorizon: { value: hex3(HORIZON) }, uZenith: { value: hex3(ZENITH) }, uReveal: reveal, uPaperOut: PAPER_OUT },
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
uniform vec3 uHorizon, uZenith, uPaperOut; uniform float uReveal; varying vec3 vDir;
void main() { vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.32, vDir.y)); gl_FragColor = vec4(mix(uPaperOut, c, uReveal), 1.0); }`,
  }));
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(190, 32, 16)), skyMat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  group.add(sky);

  // ---- Props: a few instanced meshes for the whole island.
  const clay = (key, opts = {}) => keep(withReveal(new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, envMapIntensity: 0.55, ...opts }), reveal, key));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  // Props sit outside the sun's tight shadow box (their shadows are baked into the grass), so they never cast.
  function instanced(geo, mat, items, place, { receive = true } = {}) {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(keep(geo), mat, items.length);
    items.forEach((it, i) => { const color = place(it, i); mesh.setMatrixAt(i, m4); if (color) mesh.setColorAt(i, c.set(color)); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }
  const blobs = [];
  for (const t of trees) for (const b of t.blobs) blobs.push({ x: t.x + b.dx + t.lean * b.dy, y: t.y + b.dy, z: t.z + b.dz, r: b.r, sy: 0.92, color: t.color });
  for (const b of bushes) for (const k of b.blobs) blobs.push({ x: b.x + k.dx, y: b.y + k.dy - 0.06, z: b.z + k.dz, r: k.r, sy: 0.8, color: b.color });
  const rot = mulberry32(world.seed + 3);
  instanced(lumpy(4, 0.07, 5), clay('leaf', { roughness: 0.82 }), blobs, (b) => {
    q.setFromEuler(e3.set(0, rot() * 6.283, 0));
    m4.compose(v.set(b.x, b.y, b.z), q, sc.set(b.r, b.r * b.sy, b.r));
    return b.color;
  });
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 12, 1);
  trunkGeo.translate(0, 0.5, 0);
  instanced(trunkGeo, clay('trunk', { color: '#B48A63', roughness: 0.85 }), trees, (t) => {
    q.setFromEuler(e3.set(0, 0, -t.lean));
    m4.compose(v.set(t.x, t.y - 0.1, t.z), q, sc.set(t.trunkR, t.trunk + 0.3, t.trunkR));
  });
  const ROCK = [C('#CFC6B8'), C('#BDB3A4'), C('#D8CFC0')];
  instanced(lumpy(2, 0.16, 9), clay('rock', { roughness: 0.9 }), rocks, (r) => {
    q.setFromEuler(e3.set(r.tilt, r.rot, r.tilt * 0.5));
    m4.compose(v.set(r.x, r.y + r.size * 0.12, r.z), q, sc.set(r.size, r.size * 0.62, r.size * 0.85));
    return ROCK[Math.floor(r.shade * 3)].getHex();
  });
  const stemGeo = new THREE.CylinderGeometry(0.012, 0.016, 1, 5, 1);
  stemGeo.translate(0, 0.5, 0);
  instanced(stemGeo, clay('stem', { color: '#6FA35A' }), flowers, (f) => { m4.compose(v.set(f.x, f.y - 0.02, f.z), q.identity(), sc.set(1, f.h, 1)); });
  instanced(new THREE.SphereGeometry(1, 10, 8), clay('petal', { roughness: 0.6 }), flowers, (f) => {
    m4.compose(v.set(f.x, f.y + f.h, f.z), q.identity(), sc.set(0.055, 0.045, 0.055));
    return f.color;
  });

  // ---- Clouds drift slowly round the island, far enough to sit in the haze.
  const cloudRnd = mulberry32(world.seed + 7), puffs = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * 6.283 + cloudRnd() * 0.6, r = 26 + cloudRnd() * 20, y = 9 + cloudRnd() * 6, s = 1.6 + cloudRnd() * 1.4;
    const n = 3 + Math.floor(cloudRnd() * 3);
    for (let i = 0; i < n; i++) puffs.push({ x: Math.cos(a) * r + (i - n / 2) * s * 0.9, y: y + (cloudRnd() - 0.3) * s * 0.4, z: Math.sin(a) * r + (cloudRnd() - 0.5) * s, r: s * (0.7 + cloudRnd() * 0.5) * (i && i < n - 1 ? 1.15 : 0.85) });
  }
  const clouds = instanced(lumpy(2, 0.05, 13), clay('cloud', { color: '#FFFFFF', roughness: 1, emissive: '#FFFFFF', emissiveIntensity: 0.55 }), puffs, (p) => {
    m4.compose(v.set(p.x, p.y, p.z), q.identity(), sc.set(p.r, p.r * 0.62, p.r));
  }, { receive: false });
  const cloudPivot = new THREE.Group();
  if (clouds) { group.remove(clouds); cloudPivot.add(clouds); group.add(cloudPivot); }

  function update(dt, t) {
    seaU.uTime.value = t;
    cloudPivot.rotation.y = t * 0.004;
  }
  function dispose() { for (const d of disposables) d.dispose?.(); }

  return { group, update, dispose, terrain, sea };
}
