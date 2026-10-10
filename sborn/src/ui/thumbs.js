// thumbs.js — drawer card thumbnails: every part rendered once at 352² (2× supersampled) into a 176² PNG data URL.
// Exports: createThumbStudio(renderer, partDefs) -> { render(id) -> { url, stats }, renderAll(ids, onEach) -> Promise, stats, masks }.
// Invariants: one small ShaderMaterial (program key 'sborn-thumb'), plain meshes, own scene and camera, rendered between
//   frames so the editor never waits; output is sRGB with a transparent background; the 2×2 box filter averages
//   premultiplied colour so edges stay clean; stats per thumb: luma standard deviation and alpha coverage (item 12).
import * as THREE from 'three';
import { buildPart } from '../parts/builders.js';

const S = 176, SS = 2;
const COL = {
  skin: '#8FC9FF', 'tint:base': '#8FC9FF', 'tint:coat': '#FFD86B', 'tint:detail': '#FF9EC0', keratin: '#D9B98E', teeth: '#FFF4DD',
  mouth: '#7A2638', tongue: '#F07C8C', membrane: '#B5E3FF', shell: '#8EDDC0', ink: '#2B2236',
};
const VIEW = { mouth: [1, 0.75, 0.35], eye: [1, 0.35, 0.3], default: [0.75, 0.45, 1] };

export function createThumbStudio(renderer, partDefs) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: `attribute vec3 color; attribute vec4 eyeL; varying vec3 vC; varying vec3 vN; varying vec3 vV; varying vec4 vE;
void main(){ vC = color; vE = eyeL; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying vec3 vN; varying vec3 vV; varying vec4 vE;
void main(){
  vec3 base = vC;
  if (vE.w > -0.5) {                       // eye: sclera, iris and pupil per pixel (round / slit / big round)
    vec3 e = normalize(vE.xyz); float rad = length(e.xz);
    float pr = vE.w > 1.5 ? rad * 0.72 : vE.w > 0.5 ? length(vec2(e.x * 2.6, e.z * 0.8)) : rad;
    base = vec3(0.96, 0.92, 0.87);
    if (e.y > 0.0) { base = mix(base, vec3(0.1, 0.45, 0.95) * (0.8 + 0.4 * smoothstep(0.48, 0.2, rad)), 1.0 - smoothstep(0.47, 0.5, rad)); base = mix(base, vec3(0.01, 0.008, 0.015), 1.0 - smoothstep(0.23, 0.26, pr)); }
  }
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vV), l = normalize(vec3(-0.45, 0.75, 0.6)), h = normalize(l + v);
  float wrap = max(0.0, (dot(n, l) + 0.35) / 1.35);
  float hemi = 0.5 + 0.5 * n.y;
  float rim = pow(1.0 - max(0.0, dot(n, v)), 3.0);
  vec3 c = base * (0.42 + 0.22 * hemi + 0.62 * wrap) + vec3(1.0, 0.97, 0.94) * 0.18 * pow(max(0.0, dot(n, h)), 40.0) + vec3(0.85, 0.9, 1.0) * rim * 0.22;
  gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`,
    side: THREE.DoubleSide,
  });
  mat.name = 'sborn-thumb';
  mat.customProgramCacheKey = () => 'sborn-thumb';
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(28, 1, 0.001, 50);
  const rt = new THREE.WebGLRenderTarget(S * SS, S * SS, { depthBuffer: true });
  const big = new Uint8Array(S * S * SS * SS * 4);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const stats = {}, masks = {};
  const tmp = new THREE.Color();

  function meshFor(id) {
    const def = partDefs[id]; if (!def) return null;
    const b = buildPart(id, { ...(def.params || { len: 1, curl: 0.5, fat: 1 }) }, 0, def.baseR || 0.05);
    if (!b) return null;
    const group = new THREE.Group();
    for (const pc of b.pieces) {
      const g = pc.geo.clone(), pos = g.attributes.position, n = pos.count;
      const col = new Float32Array(n * 3), eyeL = new Float32Array(n * 4);
      let mt = pc.mat; if (mt === 'skin' && def.tint && def.tint !== 'skin') mt = `tint:${def.tint}`;
      let yMin = Infinity, yMax = -Infinity;
      for (let i = 0; i < n; i++) { yMin = Math.min(yMin, pos.getY(i)); yMax = Math.max(yMax, pos.getY(i)); }
      for (let i = 0; i < n; i++) {
        if (mt === 'eye') {
          const e = pc.eye;
          eyeL[i * 4] = (pos.getX(i) - e.centre[0]) / e.R; eyeL[i * 4 + 1] = (pos.getY(i) - e.centre[1]) / e.R; eyeL[i * 4 + 2] = (pos.getZ(i) - e.centre[2]) / e.R; eyeL[i * 4 + 3] = e.pupil || 0;
          tmp.set('#FFFFFF');
        } else {
          eyeL[i * 4 + 3] = -1;
          tmp.set(COL[mt] || COL.skin);
          if (mt === 'keratin') tmp.multiplyScalar(0.8 + 0.35 * (pos.getY(i) - yMin) / Math.max(1e-6, yMax - yMin));
        }
        tmp.convertSRGBToLinear();
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('eyeL', new THREE.BufferAttribute(eyeL, 4));
      group.add(new THREE.Mesh(g, mat));
    }
    return { group, def };
  }

  function render(id) {
    const m = meshFor(id); if (!m) return null;
    scene.add(m.group);
    const box = new THREE.Box3().setFromObject(m.group), sph = box.getBoundingSphere(new THREE.Sphere());
    const d = VIEW[m.def.group] || VIEW.default, dir = new THREE.Vector3(...d).normalize();
    cam.up.set(0, m.def.group === 'mouth' ? 0 : 1, m.def.group === 'mouth' ? 1 : 0);
    // fit the projected box (not the bounding sphere) so long thin parts still fill the card
    const dist = sph.radius * 4, target = sph.center.clone(), v = new THREE.Vector3();
    cam.fov = 28; cam.near = dist * 0.05; cam.far = dist * 4;
    for (let it = 0; it < 3; it++) {
      cam.position.copy(target).addScaledVector(dir, dist); cam.lookAt(target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      m.group.traverse((o) => { if (!o.isMesh) return; const pa = o.geometry.attributes.position; for (let i = 0; i < pa.count; i += 3) { v.fromBufferAttribute(pa, i).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); } });
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ext = Math.max(x1 - x0, y1 - y0) / 2;
      const c = new THREE.Vector3(cx, cy, new THREE.Vector3().copy(target).project(cam).z).unproject(cam);
      target.copy(c);
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * ext * 1.1));
    }
    cam.position.copy(target).addScaledVector(dir, dist); cam.lookAt(target); cam.updateProjectionMatrix();
    const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    const prevTM = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S * SS, S * SS, big);
    renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA); renderer.toneMapping = prevTM;
    scene.remove(m.group); for (const o of m.group.children) o.geometry.dispose();
    // 2×2 premultiplied box filter, flipped to y-down
    const img = ctx.createImageData(S, S), o = img.data, W = S * SS, mask = new Uint8Array(S * S);
    let sl = 0, sl2 = 0, nIn = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) { const i = ((y * SS + dy) * W + x * SS + dx) * 4, al = big[i + 3] / 255; r += big[i] * al; g += big[i + 1] * al; b += big[i + 2] * al; a += al; }
      const j = ((S - 1 - y) * S + x) * 4, A = a / (SS * SS);
      o[j] = a ? r / a : 0; o[j + 1] = a ? g / a : 0; o[j + 2] = a ? b / a : 0; o[j + 3] = Math.round(A * 255);
      if (A > 0.5) { mask[(S - 1 - y) * S + x] = 1; const L = 0.299 * o[j] + 0.587 * o[j + 1] + 0.114 * o[j + 2]; sl += L; sl2 += L * L; nIn++; }
    }
    ctx.putImageData(img, 0, 0);
    const mean = sl / Math.max(1, nIn);
    stats[id] = { lumaStd: Math.sqrt(Math.max(0, sl2 / Math.max(1, nIn) - mean * mean)), coverage: nIn / (S * S) };
    masks[id] = mask;
    return { url: canvas.toDataURL('image/png'), stats: stats[id] };
  }

  // a few per frame so the editor stays responsive
  function renderAll(ids, onEach, perFrame = 4) {
    return new Promise((resolve) => {
      let k = 0;
      const step = () => {
        for (let n = 0; n < perFrame && k < ids.length; n++, k++) { const r = render(ids[k]); if (r && onEach) onEach(ids[k], r.url); }
        if (k < ids.length) requestAnimationFrame(step); else resolve(stats);
      };
      step();
    });
  }
  function iou(a, b) { const A = masks[a], B = masks[b]; if (!A || !B) return NaN; let i = 0, u = 0; for (let k = 0; k < A.length; k++) { if (A[k] && B[k]) i++; if (A[k] || B[k]) u++; } return u ? i / u : 0; }
  return { render, renderAll, stats, masks, iou, material: mat };
}
