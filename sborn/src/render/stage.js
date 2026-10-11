// stage.js — renderer, scene, camera, the editor light rig and environment; one WebGL2 context for the app.
// Exports: createStage(canvas, { test, tier, precision }) -> { renderer, scene, camera, lights, setTier, resize, render, info, frameCreature }.
// Invariants: NeutralToneMapping + sRGB output; the key light follows the camera azimuth on a 250 ms
//   half-life spring so the creature is never backlit; shadows are PCF only; nothing here allocates per frame.
// Shader warm-up idea from Doodle World src/stage.js (compile every material behind a cover before first use).
import * as THREE from 'three';
import { createStudioEnv } from './env.js';
import { TIER_CFG } from './tiers.js';
import { createPost, installLowToneMapping, GRADE } from './post.js';

const deg = THREE.MathUtils.degToRad;
// Lighting calibration (§11.1, run in M3 on the swatch probe at High): environment and key scaled by one common factor
// so a front three-quarter surface reads 1.0–1.15 × albedo before tone mapping. Measured (skin specularIntensity 0.25):
// k 1 → 1.235×, 0.8707 → 1.086×, 0.8622 → 1.076×.
export const LIGHT_K = 0.8622;
const dirFrom = (az, el, out) => out.set(Math.sin(deg(az)) * Math.cos(deg(el)), Math.sin(deg(el)), Math.cos(deg(az)) * Math.cos(deg(el)));

export function createStage(canvas, { test = false, tier = 'medium', precision = 'highp' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', precision, preserveDrawingBuffer: test, alpha: false });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  if (test) renderer.debug.checkShaderErrors = true;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 1e6, 2e6);   // always present (constant program keys); the island pulls it in to 30–95 m
  scene.background = new THREE.Color('#A9D6F5');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 400);
  camera.position.set(0, 1.0, 4.2);
  camera.lookAt(0, 0.45, 0);

  // Environment: generated studio (M3 replaces RoomEnvironment as the primary; it stays the fallback).
  scene.environment = createStudioEnv(renderer);
  scene.environmentIntensity = 0.70 * LIGHT_K;

  // Editor rig (§11.2): azimuths are relative to the camera.
  const key = new THREE.DirectionalLight('#FFF1DE', 2.0 * LIGHT_K);
  key.castShadow = true;
  key.shadow.bias = -0.0002;
  key.shadow.intensity = 0.75;
  const hemi = new THREE.HemisphereLight('#CFE6FF', '#F2D9C4', 0.35);
  const rim = new THREE.DirectionalLight('#BFDDFF', 1.8);
  const kick = new THREE.DirectionalLight('#FFD6E8', 0.9);
  scene.add(key, key.target, hemi, rim, rim.target, kick, kick.target);
  // lights on every layer: the contact pass (layer 2) then sees the same light set, so three.js's light state — which the next
  // shadow pass reads before it is refreshed — never flips and depth programs never fork (item 37)
  for (const l of [key, hemi, rim, kick]) l.layers.enableAll();
  const lights = { key, hemi, rim, kick, az: 0, focus: new THREE.Vector3(0, 0.4, 0), radius: 1.2, enabled: true };

  let tierName = tier;
  const post = createPost(renderer, { tier });
  let lowInstalled = false, grade = GRADE.editor;
  function setTier(t) {
    tierName = t;
    const cfg = TIER_CFG[t];
    post.setTier(t);
    if (t === 'low') { if (!lowInstalled) { installLowToneMapping(renderer, GRADE.editor); lowInstalled = true; } renderer.toneMapping = THREE.CustomToneMapping; document.body.classList.add('low'); }
    else { renderer.toneMapping = THREE.NeutralToneMapping; document.body.classList.remove('low'); }
    key.shadow.mapSize.set(cfg.shadow, cfg.shadow);
    key.shadow.radius = cfg.shadowRadius;
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    resize();
  }

  const size = new THREE.Vector2();
  let renderScale = 1;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const cfg = TIER_CFG[tierName];
    let dpr = test ? 1 : Math.min(window.devicePixelRatio || 1, cfg.dpr);
    if (w * h * dpr * dpr > cfg.maxPx) dpr = Math.sqrt(cfg.maxPx / (w * h));
    dpr *= renderScale;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    size.set(w, h);
    if (shiftPx) camera.setViewOffset(w, h, -shiftPx, 0, w, h); else camera.updateProjectionMatrix();
    post.resize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  }
  function setRenderScale(s) { renderScale = s; resize(); }
  // Shift the projection so the subject centres in the free area between side panels (CSS px, + = right).
  let shiftPx = 0;
  function setShift(px) {
    if (Math.abs(px - shiftPx) < 0.5) return;
    shiftPx = px;
    const w = size.x || innerWidth, h = size.y || innerHeight;
    if (!px) camera.clearViewOffset(); else camera.setViewOffset(w, h, -px, 0, w, h);
  }

  // Place the rig around `focus` relative to the camera azimuth; called every frame (spring in updateLights).
  const tmp = new THREE.Vector3();
  function placeLights() {
    const az = THREE.MathUtils.radToDeg(lights.az), f = lights.focus, R = lights.radius * 6;
    dirFrom(az - 40, 50, tmp); key.position.copy(f).addScaledVector(tmp, R); key.target.position.copy(f);
    dirFrom(az + 150, 25, tmp); rim.position.copy(f).addScaledVector(tmp, R); rim.target.position.copy(f);
    dirFrom(az - 145, 10, tmp); kick.position.copy(f).addScaledVector(tmp, R); kick.target.position.copy(f);
    // Shadow frustum fitted to the bounding sphere × 1.1, texel-snapped.
    const s = lights.radius * 1.1, cam = key.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 0.1; cam.far = R + s * 2;
    cam.updateProjectionMatrix();
    key.shadow.normalBias = 0.01 * Math.max(0.3, lights.radius);
  }
  function updateLights(dt) {
    const camAz = Math.atan2(camera.position.x - lights.focus.x, camera.position.z - lights.focus.z);
    let d = camAz - lights.az;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    lights.az += d * (1 - Math.pow(0.5, dt / 0.25));
    if (lights.enabled) placeLights();   // the island drives its own sun
  }

  function rebuildEnv() { const old = scene.environment; scene.environment = createStudioEnv(renderer); if (old) old.dispose(); }
  function setGrade(name) { grade = GRADE[name] || GRADE.editor; post.setGrade(grade); renderer.toneMappingExposure = grade.exposure; }
  function render(sc = scene, cam = camera) {
    if (post.enabled) post.render(sc, cam);
    else { renderer.setRenderTarget(null); renderer.render(sc, cam); }
  }

  function info() {
    const i = renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs ? i.programs.length : 0,
      geometries: i.memory.geometries, textures: i.memory.textures, tier: tierName, dpr: renderer.getPixelRatio(), renderScale };
  }

  setTier(tier);
  placeLights();
  return { renderer, scene, camera, lights, setTier, resize, render, info, updateLights, setRenderScale, setShift, setGrade, rebuildEnv, post, size, get tier() { return tierName; } };
}
