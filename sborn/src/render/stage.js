// stage.js — renderer, scene, camera, the editor light rig and environment; one WebGL2 context for the app.
// Exports: createStage(canvas, { test, tier, precision }) -> { renderer, scene, camera, lights, setTier, resize, render, info, frameCreature }.
// Invariants: NeutralToneMapping + sRGB output; the key light follows the camera azimuth on a 250 ms
//   half-life spring so the creature is never backlit; shadows are PCF only; nothing here allocates per frame.
// Shader warm-up idea from Doodle World src/stage.js (compile every material behind a cover before first use).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TIER_CFG } from './tiers.js';

const deg = THREE.MathUtils.degToRad;
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
  scene.background = new THREE.Color('#A9D6F5');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 400);
  camera.position.set(0, 1.0, 4.2);
  camera.lookAt(0, 0.45, 0);

  // Environment: generated studio (M3 replaces RoomEnvironment as the primary; it stays the fallback).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.70;
  pmrem.dispose();

  // Editor rig (§11.2): azimuths are relative to the camera.
  const key = new THREE.DirectionalLight('#FFF1DE', 2.0);
  key.castShadow = true;
  key.shadow.bias = -0.0002;
  key.shadow.intensity = 0.75;
  const hemi = new THREE.HemisphereLight('#CFE6FF', '#F2D9C4', 0.35);
  const rim = new THREE.DirectionalLight('#BFDDFF', 1.8);
  const kick = new THREE.DirectionalLight('#FFD6E8', 0.9);
  scene.add(key, key.target, hemi, rim, rim.target, kick, kick.target);
  const lights = { key, hemi, rim, kick, az: 0, focus: new THREE.Vector3(0, 0.4, 0), radius: 1.2, enabled: true };

  let tierName = tier;
  function setTier(t) {
    tierName = t;
    const cfg = TIER_CFG[t];
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
    camera.updateProjectionMatrix();
    size.set(w, h);
  }
  function setRenderScale(s) { renderScale = s; resize(); }

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
    placeLights();
  }

  function render() {
    renderer.render(scene, camera);
  }

  function info() {
    const i = renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, programs: i.programs ? i.programs.length : 0,
      geometries: i.memory.geometries, textures: i.memory.textures, tier: tierName, dpr: renderer.getPixelRatio(), renderScale };
  }

  setTier(tier);
  placeLights();
  return { renderer, scene, camera, lights, setTier, resize, render, info, updateLights, setRenderScale, size, get tier() { return tierName; } };
}
