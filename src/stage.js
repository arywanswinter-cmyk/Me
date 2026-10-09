// stage.js — renderer, lights, the island, camera and the birth camera move.
// Exports: PAPER, createStage(canvas, hooks) -> { setCreature, clear, playBirth, renderer, scene, camera, controls, world, island, reveal }.
// Look: the birth starts in a world painted the exact cream of the drawing paper; as the creature puffs up the
//   paper turns into the island (sky, sea, grass) around it.
// Invariants: the birth starts from a camera pose that puts the flat creature exactly where the doodle was
//   on screen; OrbitControls only take over once the move finishes; the camera never dips under the ground,
//   the sea or a treetop; one render loop for the whole app, idle while you draw.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { warmUpMeshes } from './creature/creature.js';
import { buildWorld, WATER_Y, SUN } from './world/terrain.js';
import { createIsland, HORIZON } from './world/island.js';

export const PAPER = '#F4EEE1';
const FOV = 30;
const rad = THREE.MathUtils.degToRad;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth01 = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createStage(canvas, hooks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.Fog(HORIZON, 30, 150);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.05, 400);
  camera.position.set(0, 1, 5);

  scene.add(new THREE.HemisphereLight('#EEF3F7', '#D9C6AA', 0.9));
  const sun = new THREE.DirectionalLight('#FFF0DA', 2.5);
  sun.position.set(...SUN);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 10;
  sun.shadow.blurSamples = 20;
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 16 });
  scene.add(sun, sun.target);
  const rimLight = new THREE.DirectionalLight('#DCE7FF', 0.7);
  rimLight.position.set(-3, 2.5, -4);
  scene.add(rimLight);

  const world = buildWorld();
  const reveal = { value: 0 };
  const island = createIsland(world, reveal);
  scene.add(island.group);

  const cc = document.createElement('canvas');
  cc.width = cc.height = 128;
  const cg = cc.getContext('2d'), grd = cg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(70,52,36,0.5)'); grd.addColorStop(0.45, 'rgba(70,52,36,0.2)'); grd.addColorStop(1, 'rgba(70,52,36,0)');
  cg.fillStyle = grd; cg.fillRect(0, 0, 128, 128);
  const ctex = new THREE.CanvasTexture(cc);
  ctex.colorSpace = THREE.SRGBColorSpace;
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ctex, transparent: true, depthWrite: false, toneMapped: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.002;
  contact.renderOrder = 1;
  contact.visible = false;
  scene.add(contact);

  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, rotateSpeed: 0.7, autoRotateSpeed: 0.7, minPolarAngle: 0.3, maxPolarAngle: Math.PI / 2 - 0.05, minDistance: 1.5, maxDistance: 38 });
  controls.enabled = false;
  let resumeTimer = 0;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); });
  controls.addEventListener('end', () => { clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { controls.autoRotate = !reduced; }, 5000); });

  let creature = null, info = null, birth = null;
  const tgt = new THREE.Vector3();

  function heroPose() {
    const h = info.height + creature.lift, w = Math.max(info.width, info.depth);
    const target = new THREE.Vector3(0, h * 0.46, 0);
    const half = Math.tan(rad(FOV / 2));
    const dist = Math.max((h * 0.66) / half, (w * 0.66) / (half * camera.aspect), 2.4);
    const az = rad(24), el = rad(10);
    const pos = target.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist));
    return { pos: clampCamera(pos), target };
  }
  function matchPose() {
    const sb = info.screenBox, W = innerWidth, Hh = innerHeight;
    const k = (sb.y1 - sb.y0) / info.height;                 // screen px per metre
    const D = Hh / (2 * Math.tan(rad(FOV / 2)) * k);
    const camX = -((sb.x0 + sb.x1) / 2 - W / 2) / k;
    const camY = creature.lift + info.height / 2 + ((sb.y0 + sb.y1) / 2 - Hh / 2) / k;
    return { pos: new THREE.Vector3(camX, camY, D), target: new THREE.Vector3(camX, camY, 0) };
  }

  // Keep the camera above the ground and the sea, and lift it smoothly over treetops and bushes.
  const tall = [...world.props.trees.map((t) => ({ x: t.x, z: t.z, top: t.y + t.top + 0.4, r: 2.4 })),
    ...world.props.bushes.map((b) => ({ x: b.x, z: b.z, top: b.y + b.top + 0.3, r: 1.3 }))];
  function clampCamera(p) {
    let minY = Math.max(world.heightAt(p.x, p.z), WATER_Y) + 0.45;
    for (const o of tall) {
      const d = Math.hypot(p.x - o.x, p.z - o.z);
      if (d < o.r) minY = Math.max(minY, minY + (o.top - minY) * smooth01((o.r - d) / (o.r * 0.5)));
    }
    if (p.y < minY) p.y = minY;
    return p;
  }

  function setCreature(c, data) {
    clear();
    creature = c; info = data;
    scene.add(c.group);
    contact.visible = true;
    contact.scale.set(Math.max(data.width, 0.4) * 1.15, Math.max(data.depth, 0.4) * 1.15, 1);
    const s = Math.max(data.width, data.height) * 1.3 + 0.5;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    sun.shadow.camera.updateProjectionMatrix();
  }
  function clear() {
    if (creature) { scene.remove(creature.group); creature.dispose(); }
    creature = null; info = null; birth = null;
    contact.visible = false;
    controls.enabled = false; controls.autoRotate = false;
  }
  function playBirth() {
    const from = matchPose(), to = heroPose();
    camera.position.copy(from.pos); camera.lookAt(from.target);
    controls.enabled = false; controls.autoRotate = false;
    reveal.value = 0;
    birth = { t0: -1, from, to, spoke: false };       // clock starts after the first frame is on screen
    creature.setBirth(0);
  }

  const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), look = new THREE.Vector3();
  let lastPointer = -1e9, downAt = null;
  canvas.addEventListener('pointermove', (e) => { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); lastPointer = performance.now(); });
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || !creature || birth) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y), dt = performance.now() - downAt.t;
    downAt = null;
    if (moved > 6 || dt > 400) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(creature.group, true).length) { creature.boop(); hooks.onBoop?.(); }
  });
  function lookTarget() {
    if (performance.now() - lastPointer < 2500) {
      ray.setFromCamera(ndc, camera);
      const d = camera.position.distanceTo(controls.target) * 0.6;
      return look.copy(ray.ray.origin).addScaledVector(ray.ray.direction, d);
    }
    return look.copy(camera.position);
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // Compile every creature shader up front so the first birth doesn't stall.
  const warm = warmUpMeshes();
  warm.forEach((m, i) => { m.position.set(i * 0.3 - 0.45, 0.2, 0); scene.add(m); });
  const done = () => { warm.forEach((m) => scene.remove(m)); warming = false; };
  (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera))).then(done, done);

  let last = performance.now(), warming = true;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000), t = now / 1000;
    last = now;
    if (!creature && !warming) return;      // nothing on screen while you draw
    island.update(dt, t);
    if (creature) {
      if (birth && birth.t0 < 0) {
        creature.setBirth(0);
        creature.update(dt, t, camera.position);
        renderer.render(scene, camera);
        birth.t0 = performance.now() - (reduced ? 10000 : 0);
        return;
      }
      if (birth) {
        const e = (now - birth.t0) / 1000;
        creature.setBirth((e - 0.2) / 1.2);
        reveal.value = smooth01((e - 0.45) / 1.7);
        const k = easeInOutCubic(clamp01((e - 0.4) / 2.1));
        camera.position.lerpVectors(birth.from.pos, birth.to.pos, k);
        tgt.lerpVectors(birth.from.target, birth.to.target, k);
        camera.lookAt(tgt);
        if (!birth.spoke && e > 1.0) { birth.spoke = true; hooks.onFirstBreath?.(); }
        if (e > 2.6) {
          controls.target.copy(birth.to.target);
          controls.enabled = true;
          controls.autoRotate = !reduced;
          controls.update();
          reveal.value = 1;
          birth = null;
          hooks.onBorn?.();
        }
      } else {
        controls.update(dt);
        clampCamera(camera.position);
      }
      creature.update(dt, t, birth ? camera.position : lookTarget());
    }
    renderer.render(scene, camera);
  });

  return { setCreature, clear, playBirth, renderer, scene, camera, controls, world, island, reveal };
}
