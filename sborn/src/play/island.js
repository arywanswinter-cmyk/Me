// island.js — the test-drive island: terrain, grass, flowers, rocks, trees, clouds, water, fruit, toys, wind and its light.
// Exports: ISLAND, islandHeight(x, z), createIslandMaterials(), createIsland(stage, mats, { tier }) -> Island
//          { group, ground: {height, normal, radius, inWater}, enter(), exit(), update(dt, ctx), fruit, ball, trees,
//            mushrooms, nearestFruit(p, r), eatFruit(i), dropFruitNear(p), thumpTree(p), boop(p, v, k), wind(x, z),
//            ripple(x, z), setTier(t), info() }.
// Invariants: built lazily on first Play and cached, never shown in the editor; every system is one draw (instanced or
//   merged); deterministic layout (seeded); the height function is analytic and shared by terrain, grass, physics and
//   locomotion; the creature's materials keep fog off (no extra programs), island materials use the scene fog.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

export const ISLAND = { R: 40, play: 28, hill: 6, pond: { x: 9, z: 5, r: 5 }, sea: -0.35, pondLevel: -0.12 };
const TIERS = { high: { quads: 96, grass: 36000, grassDist: 35, flowers: 450 }, medium: { quads: 64, grass: 18000, grassDist: 25, flowers: 250 }, low: { quads: 48, grass: 8000, grassDist: 18, flowers: 125 } };

// smooth value noise (deterministic)
function hash2(x, z) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), u = x - xi, v = z - zi, s = (t) => t * t * (3 - 2 * t);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * s(u) + (c - a) * s(v) + (a - b - c + d) * s(u) * s(v);
}
const smooth = (a, b, t) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

// the island surface: gentle meadow, a 6 m-wide hill near the centre, the pond hollow, a beach ring and the sea floor;
// the start clearing (where the pedestal sinks) at the origin is flat
export const HILL = { x: -6, z: -7 };
export function islandHeight(x, z) {
  const r = Math.hypot(x, z), rh = Math.hypot(x - HILL.x, z - HILL.z);
  let h = (0.12 * (vnoise(x * 0.12, z * 0.12) - 0.5) + 0.05 * (vnoise(x * 0.4 + 7, z * 0.4) - 0.5)) * smooth(1.5, 4, r);
  h += 1.2 * Math.exp(-(rh * rh) / (2 * 3.2 * 3.2));                                 // hill (peak 1.2 m)
  const P = ISLAND.pond, dp = Math.hypot(x - P.x, z - P.z);
  if (dp < P.r + 1.5) h -= 0.75 * (1 - smooth(P.r - 2.5, P.r + 1.5, dp));
  h -= 1.6 * smooth(ISLAND.play, ISLAND.play + 7, r);                              // beach down to the sea floor
  return h;
}
// The walkable ground shared by locomotion, the camera, picking and the benches: the analytic surface, except that in the
// pond the creature wades on a floor 0.18 m under the surface.
export function islandGround() {
  const P = ISLAND.pond, inPond = (x, z) => Math.hypot(x - P.x, z - P.z) < P.r + 0.3;
  const H = (x, z) => { const h = islandHeight(x, z); return inPond(x, z) ? Math.max(h, ISLAND.pondLevel - 0.18) : h; };
  return {
    height: H, radius: ISLAND.play, inWater: (x, z) => inPond(x, z) || Math.hypot(x, z) > ISLAND.play + 4,
    normal: (x, z, out) => { const e = 0.05; return out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize(); },
  };
}
// the bench path (item 28 island report, item 40, ?bench): start clearing → hill flank → meadow → pond edge → far meadow
export const BENCH_PATH = [[0, 1.1], [-3, -4], [6, -6], [3.5, 4], [-8, 4], [3, 12], [-12, -12], [0, 1.1]];

export function createIslandMaterials() {
  const terrain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }); terrain.name = 'island-terrain';
  // grass: instanced blades bent by wind and four trample pushers, tips lit from behind
  const grassU = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0.3) }, uPush: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -99, 0, 0)) }, uCam: { value: new THREE.Vector3() }, uFar: { value: 35 } };
  const grass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }); grass.name = 'island-grass';
  grass.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, grassU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float uTime; uniform vec2 uWind; uniform vec4 uPush[4]; uniform vec3 uCam; uniform float uFar;
float gn(vec2 p) { return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453); }
float gnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gn(i), gn(i + vec2(1, 0)), f.x), mix(gn(i + vec2(0, 1)), gn(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float k = position.y / 0.35;                                         // 0 at the root, 1 at the tip
  float gust = gnoise(root.xz * 0.025 * 40.0 + uWind * uTime * 0.06 * 40.0) ;
  vec2 bend = uWind * (0.12 + 0.35 * gust) * (0.6 + 0.4 * sin(uTime * 2.3 + root.x * 1.7 + root.z));
  for (int i = 0; i < 4; i++) { vec2 d = root.xz - uPush[i].xz; float r = length(d); float s = (1.0 - smoothstep(0.0, 0.6, r)) * uPush[i].w; bend += normalize(d + 1e-4) * s * 1.2; }
  // shrink to nothing over the last 5 m of the draw distance
  float fade = 1.0 - smoothstep(uFar - 5.0, uFar, distance(root.xz, uCam.xz));
  transformed *= fade;
  transformed.xz += bend * k * k * 0.35 * fade;
  transformed.y -= length(bend) * k * k * 0.12 * fade;
}`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.6));');
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.18 * pow(max(0.0, 1.0 - abs(dot(normalize(vViewPosition), normal))), 2.0);');
  };
  grass.customProgramCacheKey = () => 'island-grass';
  const plant = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }); plant.name = 'island-plant';
  const water = new THREE.ShaderMaterial({
    name: 'island-water', transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSky: { value: new THREE.Color('#BFE3FF') }, uRip: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)) }, uNorm: { value: null } }]),
    vertexShader: `attribute float depth; varying float vDepth; varying vec3 vW; varying vec3 vV;
#include <fog_pars_vertex>
void main() { vDepth = depth; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; vV = -mvPosition.xyz; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform float uTime; uniform vec3 uSky; uniform vec4 uRip[8]; uniform sampler2D uNorm; varying float vDepth; varying vec3 vW; varying vec3 vV;
#include <fog_pars_fragment>
void main() {
  vec3 n1 = texture2D(uNorm, vW.xz * 0.11 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNorm, vW.xz * 0.23 - vec2(uTime * 0.009, -uTime * 0.013)).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3(n1.x + n2.x, 6.0, n1.y + n2.y));
  float ring = 0.0;
  for (int i = 0; i < 8; i++) { float age = uTime - uRip[i].z; if (age < 0.0 || age > 2.0) continue; float r = distance(vW.xz, uRip[i].xy); float front = age * 0.9; ring += (1.0 - smoothstep(0.0, 0.06, abs(r - front))) * (1.0 - age / 2.0) * uRip[i].w; }
  vec3 V = normalize(vV), up = normalize(n);
  float cosT = clamp(dot(V, (viewMatrix * vec4(up, 0.0)).xyz), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 deep = mix(vec3(0.435, 0.863, 0.816), vec3(0.118, 0.498, 0.659), smoothstep(0.0, 1.2, vDepth));
  vec3 col = mix(deep, uSky, F * 0.85);
  float foam = 1.0 - smoothstep(0.02, 0.12, vDepth);
  col = mix(col, vec3(0.97, 0.98, 1.0), clamp(foam * (0.6 + 0.4 * sin(uTime * 2.0 + vW.x * 3.0)) + ring * 0.7, 0.0, 1.0));
  gl_FragColor = vec4(col, mix(0.78, 0.95, smoothstep(0.0, 0.8, vDepth)));
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
  });
  const cloud = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xf4ecff, emissiveIntensity: 0.55, fog: false }); cloud.name = 'island-cloud';
  return { terrain, grass, grassU, plant, water, cloud, all: [terrain, grass, plant, water, cloud] };
}

// a scrolling normal map for the water (generated, tileable)
function normalTexture() {
  const N = 64, data = new Uint8Array(N * N * 4);
  const h = (x, z) => 0.5 * Math.sin((x / N) * Math.PI * 6 + Math.sin((z / N) * Math.PI * 4) * 2) + 0.5 * Math.sin((z / N) * Math.PI * 8 + Math.cos((x / N) * Math.PI * 2) * 1.5);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const dx = h(x + 1, z) - h(x - 1, z), dz = h(x, z + 1) - h(x, z - 1), l = Math.hypot(dx, 2, dz), i = (z * N + x) * 4;
    data[i] = Math.round((dx / l * 0.5 + 0.5) * 255); data[i + 1] = Math.round((dz / l * 0.5 + 0.5) * 255); data[i + 2] = 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

const C = (hex) => new THREE.Color(hex);
export function colorGeo(geo, fn) { const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(); for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c, i); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo; }
export function mergeGeos(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0; const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, vo * 3); else col.fill(1, vo * 3, (vo + n) * 3);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; io += g.index.count; } else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.setIndex(new THREE.BufferAttribute(idx, 1)); m.computeBoundingSphere();
  return m;
}

export function createIsland(stage, mats, { tier = 'medium' } = {}) {
  const rnd = mulberry32(20261010);
  const group = new THREE.Group(); group.name = 'island'; group.visible = false;
  const H = islandHeight;
  const nrm = (x, z, out) => { const e = 0.05; return out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize(); };
  const inPond = (x, z) => Math.hypot(x - ISLAND.pond.x, z - ISLAND.pond.z) < ISLAND.pond.r + 0.3;
  const onLand = (x, z) => H(x, z) > ISLAND.pondLevel + 0.08 && Math.hypot(x, z) < ISLAND.play + 2 && !inPond(x, z);
  const T = TIERS[tier] || TIERS.medium;
  let built = { terrain: null };

  // ---- terrain: 4 chunks ----
  function buildTerrain() {
    const g = new THREE.Group(); g.name = 'terrain';
    const half = ISLAND.R + 6;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const geo = new THREE.PlaneGeometry(half, half, T.quads, T.quads); geo.rotateX(-Math.PI / 2); geo.translate(sx * half / 2, 0, sz * half / 2);
      const p = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i)));
      geo.computeVertexNormals();
      colorGeo(geo, (x, y, z, c) => {
        nrm(x, z, v); const slope = 1 - v.y;
        c.copy(C('#5DBB63')).lerp(C('#A8E06A'), smooth(0.05, 0.9, y) * 0.8 + 0.2 * vnoise(x * 0.3, z * 0.3));
        c.lerp(C('#D9B48A'), smooth(0.06, 0.2, slope));
        const rr = Math.hypot(x, z), nearPond = Math.hypot(x - ISLAND.pond.x, z - ISLAND.pond.z) < ISLAND.pond.r + 1.5;   // water level only applies near water
        const wl = Math.min(rr > ISLAND.play - 3 ? y - ISLAND.sea : 9, nearPond ? y - ISLAND.pondLevel : 9);
        if (Math.hypot(x, z) > ISLAND.play - 1 || wl < 0.5) c.lerp(C('#E9D2A6'), smooth(ISLAND.play - 1, ISLAND.play + 2, Math.hypot(x, z)) + (wl < 0.5 ? 0.8 : 0));
        if (wl < 0.3) c.multiplyScalar(0.75);
        // baked AO: hollows darker
        const curv = (H(x + 0.6, z) + H(x - 0.6, z) + H(x, z + 0.6) + H(x, z - 0.6)) / 4 - y;
        c.multiplyScalar(1 - Math.min(0.25, Math.max(0, curv * 1.2)));
      });
      const m = new THREE.Mesh(geo, mats.terrain); m.receiveShadow = true; g.add(m);
    }
    return g;
  }

  // ---- grass: one instanced draw, chunk-culled on the CPU ----
  const blade = (() => { const g = new THREE.BufferGeometry(); const w = 0.016, h = 0.2; g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.6, h * 0.5, 0, w * 0.6, h * 0.5, 0, 0, h, 0], 3)); g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]); g.computeVertexNormals();
    return colorGeo(g, (x, y, z, c) => c.copy(C('#2F7D45')).lerp(C('#56B45A'), Math.min(1, y / 0.2)).lerp(C('#B7E36A'), Math.max(0, (y - 0.2) / 0.15))); })();
  let grass = null, grassAll = null, chunks = null;
  function buildGrass() {
    const n = T.grass, M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    grassAll = new Float32Array(n * 16); chunks = new Map();
    let k = 0, tries = 0;
    while (k < n && tries < n * 6) {
      tries++;
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (ISLAND.play + 1.5), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!onLand(x, z) || Math.hypot(x, z) < 1.4) continue;      // the start clearing stays short
      q.setFromAxisAngle(up, rnd() * Math.PI * 2); const sc = 0.7 + 0.6 * rnd();
      M.compose(p.set(x, H(x, z) - 0.01, z), q, s.set(sc, sc * (0.8 + 0.5 * rnd()), sc));
      M.toArray(grassAll, k * 16);
      const key = `${Math.floor(x / 8)},${Math.floor(z / 8)}`; (chunks.get(key) || chunks.set(key, []).get(key)).push(k);
      k++;
    }
    grass = new THREE.InstancedMesh(blade, mats.grass, k); grass.name = 'grass'; grass.frustumCulled = false; grass.count = 0;
    grass.userData.total = k;
    return grass;
  }
  const lastCull = { p: new THREE.Vector3(1e9, 0, 0), dir: new THREE.Vector3() };
  function cullGrass(cam) {
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    if (cam.position.distanceTo(lastCull.p) < 2 && dir.angleTo(lastCull.dir) < THREE.MathUtils.degToRad(10)) return false;
    lastCull.p.copy(cam.position); lastCull.dir.copy(dir);
    const arr = grass.instanceMatrix.array, far = T.grassDist + 4;
    let n = 0;
    const fx = dir.x, fz = dir.z, fl = Math.hypot(fx, fz) || 1;
    for (const [key, list] of chunks) {
      const [cx, cz] = key.split(',').map(Number), mx = cx * 8 + 4, mz = cz * 8 + 4, dx = mx - cam.position.x, dz = mz - cam.position.z, d = Math.hypot(dx, dz);
      if (d > far + 6) continue;
      if (d > 10 && (dx * fx + dz * fz) / (d * fl) < -0.2) continue;       // behind the camera
      for (const i of list) { arr.set(grassAll.subarray(i * 16, i * 16 + 16), n * 16); n++; }
    }
    grass.count = n; grass.instanceMatrix.needsUpdate = true;
    return true;
  }

  // ---- flowers (3 species, one instanced draw each), heads turning to the creature ----
  const flowerGeos = [['#FF8FB1', '#FFD23F'], ['#9B7BFF', '#FFF1D6'], ['#FFD23F', '#FF7A59']].map(([petal, eye], k) => {
    const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.3, 5).translate(0, 0.15, 0); colorGeo(stem, (x, y, z, c) => c.set('#4FA04F'));
    const parts = [stem];
    const np = 5 + k;
    for (let i = 0; i < np; i++) { const a = (i / np) * Math.PI * 2; const pt = new THREE.SphereGeometry(0.045, 6, 4).scale(1, 0.35, 0.6).translate(0.05, 0.31, 0).rotateY(a); colorGeo(pt, (x, y, z, c) => c.set(petal)); parts.push(pt); }
    const ctr = new THREE.SphereGeometry(0.03, 6, 5).translate(0, 0.315, 0); colorGeo(ctr, (x, y, z, c) => c.set(eye)); parts.push(ctr);
    return mergeGeos(parts.map((g) => g.index ? g : g));
  });
  let flowers = [];
  function buildFlowers() {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    flowers = flowerGeos.map((geo, k) => {
      const n = Math.round(T.flowers * [0.45, 0.33, 0.22][k] * 2.2), im = new THREE.InstancedMesh(geo, mats.plant, n); im.name = `flowers${k}`;
      const base = [];
      for (let i = 0; i < n; i++) {
        let x, z, t = 0; do { const a = rnd() * Math.PI * 2, r = 2 + Math.sqrt(rnd()) * (ISLAND.play - 2); x = Math.cos(a) * r; z = Math.sin(a) * r; t++; } while (!onLand(x, z) && t < 20);
        const sc = 0.8 + 0.5 * rnd(), yaw = rnd() * Math.PI * 2;
        base.push({ x, z, sc, yaw }); M.compose(p.set(x, H(x, z), z), q.setFromAxisAngle(up, yaw), s.set(sc, sc, sc)); im.setMatrixAt(i, M);
      }
      im.userData.base = base; im.castShadow = false;
      return im;
    });
    return flowers;
  }
  // heads turn toward the creature within 3 m (a yaw of the whole flower; cheap)
  function turnFlowers(cx, cz) {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const im of flowers) {
      let dirty = false;
      im.userData.base.forEach((b, i) => {
        const d = Math.hypot(b.x - cx, b.z - cz);
        if (d > 3.5 && !b.turned) return;
        const want = d < 3 ? Math.atan2(cx - b.x, cz - b.z) - Math.PI / 2 : b.yaw;
        b.cur = b.cur === undefined ? b.yaw : b.cur + (want - b.cur) * 0.08; b.turned = d < 3.5;
        M.compose(p.set(b.x, H(b.x, b.z), b.z), q.setFromAxisAngle(up, b.cur), s.set(b.sc, b.sc, b.sc)); im.setMatrixAt(i, M); dirty = true;
      });
      if (dirty) im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- rocks: 40 (8 shapes) merged into one draw, mossy tops ----
  function buildRocks() {
    const shapes = Array.from({ length: 8 }, (_, k) => { const g = new THREE.IcosahedronGeometry(0.35, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const f = 0.75 + 0.45 * hash2(i * 7 + k, k * 13); p.setXYZ(i, v.x * f * (1 + 0.3 * (k % 3)), v.y * f * 0.7, v.z * f); } g.computeVertexNormals(); return g; });
    const list = [];
    for (let i = 0; i < 40; i++) {
      let x, z, t = 0; do { const a = rnd() * Math.PI * 2, r = 3 + rnd() * (ISLAND.play + 3); x = Math.cos(a) * r; z = Math.sin(a) * r; t++; } while ((inPond(x, z) || Math.hypot(x, z) < 3) && t < 20);
      const g = shapes[i % 8].clone(); const sc = 0.5 + 1.1 * rnd(); g.scale(sc, sc, sc); g.rotateY(rnd() * 6.28); g.translate(x, H(x, z) - 0.05 * sc, z);
      colorGeo(g, (px, py, pz, c, j) => { const ny = g.attributes.normal.getY(j); c.set('#A8A2B8').lerp(C('#8C86A0'), hash2(j, i) * 0.5); if (ny > 0.55) c.lerp(C('#6FA55A'), smooth(0.55, 0.85, ny)); });
      list.push(g);
    }
    const m = new THREE.Mesh(mergeGeos(list), mats.plant); m.name = 'rocks'; m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // ---- trees: 14 lollipops (trunks and crowns instanced), shake when bumped ----
  const trees = [];
  let trunks = null, crowns = null;
  function buildTrees() {
    const trunkG = new THREE.CylinderGeometry(0.09, 0.14, 1.6, 7).translate(0, 0.8, 0); colorGeo(trunkG, (x, y, z, c) => c.set('#9C6B4E'));
    const crownG = new THREE.IcosahedronGeometry(0.9, 2).translate(0, 2.1, 0); colorGeo(crownG, (x, y, z, c, j) => { c.set('#5CC86F').lerp(C('#B5E655'), Math.max(0, (y - 2.1) / 0.9) * 0.7); });
    trunks = new THREE.InstancedMesh(trunkG, mats.plant, 14); crowns = new THREE.InstancedMesh(crownG, mats.plant, 14);
    trunks.name = 'trunks'; crowns.name = 'crowns'; trunks.castShadow = crowns.castShadow = true;
    for (let i = 0; i < 14; i++) {
      let x, z, t = 0; do { const a = (i / 14) * Math.PI * 2 + rnd() * 0.3, r = 7 + rnd() * (ISLAND.play - 9); x = Math.cos(a) * r; z = Math.sin(a) * r; t++; } while ((!onLand(x, z) || Math.hypot(x - ISLAND.pond.x, z - ISLAND.pond.z) < ISLAND.pond.r + 2) && t < 30);
      trees.push({ x, z, y: H(x, z), sc: 0.85 + 0.4 * rnd(), shake: 0 });
    }
    placeTrees(0);
    return [trunks, crowns];
  }
  function placeTrees(t) {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    trees.forEach((tr, i) => {
      const wob = tr.shake > 0 ? Math.sin(t * 28) * 0.08 * tr.shake : 0, sway = 0.02 * Math.sin(t * 0.9 + i);
      M.compose(p.set(tr.x, tr.y - 0.05, tr.z), q.setFromEuler(e.set(wob + sway, 0, wob * 0.6)), s.set(tr.sc, tr.sc, tr.sc));
      trunks.setMatrixAt(i, M); crowns.setMatrixAt(i, M);
    });
    trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  }

  // ---- clouds: 12 in one draw ----
  function buildClouds() {
    const list = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd(), r = 30 + rnd() * 25, cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = 14 + rnd() * 8;
      for (let k = 0; k < 4; k++) { const g = new THREE.SphereGeometry(2 + rnd() * 1.6, 9, 6).scale(1.3, 0.75, 1).translate(cx + (k - 1.5) * 2.4, cy + rnd() * 0.8, cz + rnd() * 1.5); list.push(g); }
    }
    const m = new THREE.Mesh(mergeGeos(list), mats.cloud); m.name = 'clouds';
    return m;
  }

  // ---- water: the pond and the ocean ring, one material ----
  function buildWater() {
    const norm = normalTexture(); mats.water.uniforms.uNorm.value = norm;
    const pond = new THREE.CircleGeometry(ISLAND.pond.r + 1.2, 48); pond.rotateX(-Math.PI / 2); pond.translate(ISLAND.pond.x, ISLAND.pondLevel, ISLAND.pond.z);
    const sea = new THREE.RingGeometry(ISLAND.play - 1, 140, 96, 3); sea.rotateX(-Math.PI / 2); sea.translate(0, ISLAND.sea, 0);
    for (const [g, lvl] of [[pond, ISLAND.pondLevel], [sea, ISLAND.sea]]) { const p = g.attributes.position, d = new Float32Array(p.count); for (let i = 0; i < p.count; i++) d[i] = Math.max(0, lvl - H(p.getX(i), p.getZ(i))); g.setAttribute('depth', new THREE.BufferAttribute(d, 1)); g.deleteAttribute('uv'); }
    const m = new THREE.Mesh(mergeWater(pond, sea), mats.water); m.name = 'water'; m.renderOrder = 1;
    return m;
  }
  function mergeWater(a, b) {
    const g = new THREE.BufferGeometry(), na = a.attributes.position.count;
    const pos = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]), dep = new Float32Array([...a.attributes.depth.array, ...b.attributes.depth.array]);
    const ia = a.index.array, ib = b.index.array, idx = new Uint32Array(ia.length + ib.length); idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('depth', new THREE.BufferAttribute(dep, 1)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
    return g;
  }
  const ripples = []; let ripI = 0;
  function ripple(x, z, strength = 1) { mats.water.uniforms.uRip.value[ripI].set(x, z, mats.water.uniforms.uTime.value, strength); ripI = (ripI + 1) % 8; }

  // ---- fruit: 24 pieces of 4 kinds, one instanced draw per kind; eaten → respawn 1,200 steps later ----
  const KINDS = ['berry', 'apple', 'crescent', 'drumstick'];
  const fruitGeos = {
    berry: (() => { const l = []; for (let i = 0; i < 5; i++) l.push(colorGeo(new THREE.SphereGeometry(0.045, 8, 6).translate(Math.cos(i * 1.3) * 0.04, 0.05 + (i % 2) * 0.04, Math.sin(i * 1.3) * 0.04), (x, y, z, c) => c.set('#7A3E6E'))); return mergeGeos(l); })(),
    apple: mergeGeos([colorGeo(new THREE.SphereGeometry(0.09, 10, 8).scale(1, 0.9, 1).translate(0, 0.09, 0), (x, y, z, c) => c.set('#FF7A6B')), colorGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 4).translate(0, 0.19, 0), (x, y, z, c) => c.set('#6E8B3D'))]),
    crescent: colorGeo(new THREE.TorusGeometry(0.08, 0.035, 6, 12, Math.PI * 1.2).rotateX(Math.PI / 2).translate(0, 0.04, 0), (x, y, z, c) => c.set('#FFD23F')),
    drumstick: mergeGeos([colorGeo(new THREE.SphereGeometry(0.07, 9, 7).scale(1.3, 1, 1).translate(0.04, 0.07, 0), (x, y, z, c) => c.set('#C8774A')), colorGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6).rotateZ(Math.PI / 2).translate(-0.08, 0.07, 0), (x, y, z, c) => c.set('#FFF1D6'))]),
  };
  const fruit = [];
  let fruitMeshes = {};
  function buildFruit() {
    for (const k of KINDS) { fruitMeshes[k] = new THREE.InstancedMesh(fruitGeos[k], mats.plant, 8); fruitMeshes[k].name = `fruit-${k}`; fruitMeshes[k].castShadow = true; fruitMeshes[k].count = 0; }
    for (let i = 0; i < 24; i++) {
      const tr = trees[i % trees.length], a = rnd() * Math.PI * 2, r = 1.2 + rnd() * 1.4;
      let x = tr.x + Math.cos(a) * r, z = tr.z + Math.sin(a) * r; if (!onLand(x, z)) { x = tr.x + 1.2; z = tr.z; }
      fruit.push({ i, kind: KINDS[i % 4], x, z, home: [x, z], alive: true, respawnAt: -1, slot: 0 });
    }
    placeFruit();
    return Object.values(fruitMeshes);
  }
  function placeFruit() {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const n = { berry: 0, apple: 0, crescent: 0, drumstick: 0 };
    for (const f of fruit) { if (!f.alive) continue; const im = fruitMeshes[f.kind]; M.compose(p.set(f.x, H(f.x, f.z) + (f.lift || 0), f.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.i), s.setScalar(f.scale ?? 1)); im.setMatrixAt(n[f.kind]++, M); }
    for (const k of KINDS) { fruitMeshes[k].count = n[k]; fruitMeshes[k].instanceMatrix.needsUpdate = true; }
  }
  function nearestFruit(x, z, r = 3) { let best = null, bd = r; for (const f of fruit) { if (!f.alive) continue; const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; best = f; } } return best; }
  function eatFruit(f, step) { f.alive = false; f.respawnAt = step + 1200; placeFruit(); }
  // no fruit near: the nearest tree shakes and drops one in front (from the respawn pool, else the farthest alive one)
  function dropFruitNear(x, z, yaw, step) {
    let tr = trees[0], bd = Infinity; for (const t of trees) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; tr = t; } }
    tr.shake = 1;
    let f = fruit.find((q) => !q.alive) || fruit.reduce((a, q) => (Math.hypot(q.x - x, q.z - z) > Math.hypot(a.x - x, a.z - z) ? q : a), fruit[0]);
    f.alive = true; f.respawnAt = -1; f.x = x + Math.sin(yaw) * 0.6; f.z = z + Math.cos(yaw) * 0.6; placeFruit();
    return f;
  }
  function thumpTree(x, z, n) { let tr = null, bd = 2.2; for (const t of trees) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; tr = t; } } if (!tr) return 0; tr.shake = 1; let k = 0; for (const f of fruit) { if (k >= n) break; if (f.alive) continue; f.alive = true; f.respawnAt = -1; const a = k * 2.1; f.x = tr.x + Math.cos(a) * 1.1; f.z = tr.z + Math.sin(a) * 1.1; k++; } placeFruit(); return k; }

  // ---- toys: a soft beach ball (sphere physics, pushed by the body) and 4 bounce mushrooms ----
  const ball = { x: 3, y: 0, z: 2.5, vx: 0, vy: 0, vz: 0, r: 0.35, boops: 0, lastImpulse: 0 };
  let ballMesh = null, mushMesh = null;
  const mushrooms = [];
  function buildToys() {
    const bg = new THREE.SphereGeometry(ball.r, 20, 14); colorGeo(bg, (x, y, z, c) => { const a = Math.atan2(z, x); c.set(['#FF7A6B', '#FFF1D6', '#5BB8FF', '#FFD23F', '#FFF1D6', '#5CC86F'][Math.floor(((a + Math.PI) / (2 * Math.PI)) * 6) % 6]); });
    ballMesh = new THREE.InstancedMesh(bg, mats.plant, 1); ballMesh.name = 'ball'; ballMesh.castShadow = true;
    ball.y = H(ball.x, ball.z) + ball.r;
    const mg = mergeGeos([colorGeo(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 8).translate(0, 0.15, 0), (x, y, z, c) => c.set('#FFF1D6')), colorGeo(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.28, 0), (x, y, z, c, j) => c.set(hash2(j, 3) > 0.85 ? '#FFF1D6' : '#FF7A9C'))]);
    mushMesh = new THREE.InstancedMesh(mg, mats.plant, 4); mushMesh.name = 'mushrooms'; mushMesh.castShadow = true;
    const M = new THREE.Matrix4();
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.6, r = 6 + i * 3.3; const x = Math.cos(a) * r, z = Math.sin(a) * r; mushrooms.push({ x, z, y: H(x, z), r: 0.42 }); M.makeTranslation(x, H(x, z) - 0.02, z); mushMesh.setMatrixAt(i, M); }
    placeBall();
    return [ballMesh, mushMesh];
  }
  function placeBall() { const M = new THREE.Matrix4().makeTranslation(ball.x, ball.y, ball.z); ballMesh.setMatrixAt(0, M); ballMesh.instanceMatrix.needsUpdate = true; }
  function stepBall(dt, body) {
    // push: the body as a sphere at (x, y, z, r)
    if (body) {
      const dx = ball.x - body.x, dy = ball.y - body.y, dz = ball.z - body.z, d = Math.hypot(dx, dy, dz), min = ball.r + body.r;
      if (d < min && d > 1e-4) {
        const k = (min - d) / d, base = Math.max(1.2, Math.hypot(body.vx, body.vz) * 1.4), imp = base * (1 + 0.25 * (body.charge || 0));   // boop × (1 + 0.25·Charge)
        ball.x += dx * k; ball.z += dz * k;
        const nx = dx / d, nz = dz / d; ball.vx = nx * imp + body.vx * 0.5; ball.vz = nz * imp + body.vz * 0.5; ball.vy = Math.max(ball.vy, 1.6);
        ball.boops++; ball.lastImpulse = imp; ball.lastBase = base;
      }
    }
    ball.vy -= 9.81 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
    const g = H(ball.x, ball.z) + ball.r;
    if (ball.y < g) { ball.y = g; if (ball.vy < 0) ball.vy = -ball.vy * 0.55; ball.vx *= 0.985; ball.vz *= 0.985; }
    const r = Math.hypot(ball.x, ball.z); if (r > ISLAND.play) { ball.vx -= ball.x / r * 2 * dt; ball.vz -= ball.z / r * 2 * dt; }
    if (ball.y < ISLAND.sea) { ball.x = 3; ball.z = 2.5; ball.y = H(3, 2.5) + 1; ball.vx = ball.vz = ball.vy = 0; }
    placeBall();
  }

  // ---- wind: one field for grass, flowers, trees, springs and the ambience ----
  const windDir = new THREE.Vector2(0.94, 0.34);
  let time = 0;
  function wind(x, z) { return vnoise(x * 0.025 + windDir.x * time * 0.06, z * 0.025 + windDir.y * time * 0.06); }

  // ---- light: the stage's key light becomes the sun; hemisphere sky/grass; fog matched to the sky ----
  const saved = {};
  function enter() {
    if (!built.terrain) build();
    group.visible = true;
    const L = stage.lights, sc = stage.scene;
    Object.assign(saved, { enabled: L.enabled, keyC: L.key.color.clone(), keyI: L.key.intensity, hemiS: L.hemi.color.clone(), hemiG: L.hemi.groundColor.clone(), hemiI: L.hemi.intensity, rim: L.rim.intensity, kick: L.kick.intensity, fog: [sc.fog.color.clone(), sc.fog.near, sc.fog.far], env: sc.environmentIntensity });
    L.enabled = false; L.key.color.set('#FFE6C2'); L.key.intensity = 3.0 * 0.8622; L.hemi.color.set('#BFE3FF'); L.hemi.groundColor.set('#9CC26E'); L.hemi.intensity = 0.7; L.rim.intensity = 0; L.kick.intensity = 0;   // zero, not hidden: the light count (program keys) stays the same
    sc.fog.color.set('#E7D7E6'); sc.fog.near = 30; sc.fog.far = 95; sc.environmentIntensity = saved.env * 0.6;
  }
  function exit() {
    group.visible = false;
    const L = stage.lights, sc = stage.scene;
    L.enabled = saved.enabled; L.key.color.copy(saved.keyC); L.key.intensity = saved.keyI; L.hemi.color.copy(saved.hemiS); L.hemi.groundColor.copy(saved.hemiG); L.hemi.intensity = saved.hemiI; L.rim.intensity = saved.rim; L.kick.intensity = saved.kick;
    sc.fog.color.copy(saved.fog[0]); sc.fog.near = saved.fog[1]; sc.fog.far = saved.fog[2]; sc.environmentIntensity = saved.env;
  }
  // sun: fixed direction (elevation 38°), shadow frustum around the creature
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(-35));
  function placeSun(focus, radius) {
    const k = stage.lights.key, R = 30;
    k.position.copy(focus).addScaledVector(sunDir, R); k.target.position.copy(focus); k.target.updateMatrixWorld();
    const s = Math.max(2.5, radius * 2.2), cam = k.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 1; cam.far = R + s * 2; cam.updateProjectionMatrix();
  }

  function build() {
    const T0 = performance.now(), lap = (n) => { if (globalThis.__islandDebug) console.log(n, (performance.now() - T0).toFixed(0)); };
    built.terrain = buildTerrain(); group.add(built.terrain); lap('terrain');
    group.add(buildGrass()); lap('grass'); for (const f of buildFlowers()) group.add(f); lap('flowers');
    group.add(buildRocks()); lap('rocks'); for (const t of buildTrees()) group.add(t); lap('trees');
    group.add(buildClouds()); group.add(buildWater()); lap('water');
    for (const f of buildFruit()) group.add(f); for (const t of buildToys()) group.add(t);
    if (tier === 'low') for (const m of [...Object.values(fruitMeshes), ballMesh, mushMesh]) m.castShadow = false;   // Low: shadow ≤ 10 draws (item 38) lap('toys');
    stage.scene.add(group);
  }

  // per fixed step: wind, grass pushers, culling, flowers, trees, ball, fruit respawn, water time
  let step = 0;
  function update(dt, { cam, feet = [], body = null, creaturePos = null } = {}) {
    step++; time += dt;
    mats.grassU.uTime.value = time; mats.grassU.uWind.value.set(windDir.x * (0.6 + 0.8 * wind(0, 0)), windDir.y * (0.6 + 0.8 * wind(0, 0)));
    mats.grassU.uFar.value = T.grassDist; if (cam) mats.grassU.uCam.value.copy(cam.position);
    for (let i = 0; i < 4; i++) { const f = feet[i]; mats.grassU.uPush.value[i].set(f ? f.x : 0, 0, f ? f.z : -999, f ? 1 : 0); }
    mats.water.uniforms.uTime.value = time;
    if (cam && grass) cullGrass(cam);
    if (creaturePos) turnFlowers(creaturePos.x, creaturePos.z);
    for (const t of trees) t.shake = Math.max(0, t.shake - dt / 0.8);
    if (trunks) placeTrees(time);
    if (ballMesh) stepBall(dt, body);
    let respawned = false; for (const f of fruit) if (!f.alive && f.respawnAt >= 0 && step >= f.respawnAt) { f.alive = true; f.x = f.home[0]; f.z = f.home[1]; f.respawnAt = -1; respawned = true; }
    if (respawned) placeFruit();
    // mushrooms: report the one under a landing body
  }
  function mushroomAt(x, z) { return mushrooms.find((m) => Math.hypot(m.x - x, m.z - z) < m.r + 0.15) || null; }
  const ground = { height: (x, z) => H(x, z), normal: (x, z, out) => nrm(x, z, out), radius: ISLAND.play, inWater: (x, z) => inPond(x, z) || Math.hypot(x, z) > ISLAND.play + 4 };
  function info() { return { grass: grass ? grass.count : 0, grassTotal: grass ? grass.userData.total : 0, fruitAlive: fruit.filter((f) => f.alive).length, ball: { ...ball } }; }
  function setTier(t) { /* tier is fixed per build (the island is cached); a different tier rebuilds on the next Play */ }
  return { group, ground, enter, exit, update, placeSun, placeFruit, fruit, ball, trees, mushrooms, mushroomAt, nearestFruit, eatFruit, dropFruitNear, thumpTree, wind, ripple, info, setTier, get step() { return step; }, tier };
}

// One tiny mesh per island material × variant (instanced or not, shadow casting / receiving), so warm-up compiles every
// island program behind the hatch and the first Play never stalls (item 37).
export function islandWarmMeshes(mats) {
  const tri = () => colorGeo(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3)).setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3)), (x, y, z, c) => c.set('#ffffff'));
  const inst = (mat, cast, recv) => { const m = new THREE.InstancedMesh(tri(), mat, 1); m.setMatrixAt(0, new THREE.Matrix4()); m.castShadow = cast; m.receiveShadow = recv; m.frustumCulled = false; return m; };
  const mesh = (mat, cast, recv) => { const m = new THREE.Mesh(tri(), mat); m.castShadow = cast; m.receiveShadow = recv; m.frustumCulled = false; return m; };
  const w = tri(); w.setAttribute('depth', new THREE.BufferAttribute(new Float32Array(3), 1));
  const water = new THREE.Mesh(w, mats.water); water.frustumCulled = false;
  return [mesh(mats.terrain, false, true), inst(mats.grass, false, false), mesh(mats.plant, true, true), inst(mats.plant, true, false), inst(mats.plant, false, false), water, mesh(mats.cloud, false, false)];
}
