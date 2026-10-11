// probe.js — the swatch probe: a flat skin patch facing the camera in the editor rig, for colour calibration and checks.
// Exports: runSwatchProbe(stage, mats, hex, { albedo }) -> { radiance: [r,g,b] (pre-tone-map, centre 16×16 mean), output: [r,g,b] (sRGB 0–1 after the final pass) },
//          oklab(rgb01) -> [L,a,b], deltaE(hexA, rgbB).
// Invariants: 640×480, patch normal at azimuth −20°, elevation 15° camera-relative; skin smooth, pattern solid; vignette and
//   dither off for this probe only; reads radiance from a HalfFloat target.
import * as THREE from 'three';
import { GRADE } from '../render/post.js';

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function oklab(rgb) {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export const hexRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.replace('#', '').padStart(6, '0').slice(i - 1, i + 1), 16) / 255);
export function deltaE(hex, rgb) { const a = oklab(hexRGB(hex)), b = oklab(rgb); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

function halfToFloat(h) { const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff; if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024); if (e === 31) return f ? NaN : (s ? -1 : 1) * Infinity; return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024); }

export function makeProbePatch(skinMat) {
  const g = new THREE.PlaneGeometry(0.6, 0.6, 2, 2);
  const n = g.attributes.position.count;
  g.setAttribute('aDomain', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aDomain2', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  const sk = new Float32Array(n * 4); for (let i = 0; i < n; i++) { sk[i * 4] = 1; sk[i * 4 + 2] = 1; }
  g.setAttribute('aSkin', new THREE.BufferAttribute(sk, 4));
  return new THREE.Mesh(g, skinMat);
}

// Renders the patch with the current tier path; returns pre-tone-map radiance and final sRGB output at the centre.
export function runSwatchProbe(stage, mats, hex, { patch, readOutput = true } = {}) {
  const { renderer, camera } = stage;
  const scene = new THREE.Scene();
  scene.environment = stage.scene.environment; scene.environmentIntensity = stage.scene.environmentIntensity;
  scene.background = new THREE.Color('#808080');
  for (const l of [stage.lights.key, stage.lights.hemi, stage.lights.rim, stage.lights.kick]) { const c = l.clone(); if (l.target) { c.target = l.target.clone(); scene.add(c.target); } c.castShadow = false; scene.add(c); }
  // patch facing the camera, normal turned to azimuth −20°, elevation 15° (camera-relative)
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const camPos = camera.position.clone(), target = camPos.clone().addScaledVector(fwd, 2);
  patch.position.copy(target);
  const toCam = fwd.clone().negate(), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(up, toCam).normalize(), up2 = new THREE.Vector3().crossVectors(toCam, right);
  const az = THREE.MathUtils.degToRad(-20), el = THREE.MathUtils.degToRad(15);
  const nrm = toCam.clone().multiplyScalar(Math.cos(el) * Math.cos(az)).addScaledVector(right, Math.sin(az) * Math.cos(el)).addScaledVector(up2, Math.sin(el)).normalize();
  patch.lookAt(target.clone().add(nrm));
  scene.add(patch);
  const u = mats.skin.userData.uniforms;
  const keep = { flat: u.uFlat.value, c0: u.uC0.value.clone(), pat: u.uPat.value.clone(), amt: u.uAmt.value.clone() };
  u.uFlat.value = 1; u.uC0.value.set(hex); u.uPat.value.set(0, 0, 0); u.uAmt.value.set(0, 0);
  const W = 640, H = 480;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  const buf = new Uint16Array(16 * 16 * 4);
  renderer.readRenderTargetPixels(rt, W / 2 - 8, H / 2 - 8, 16, 16, buf);
  const rad = [0, 0, 0];
  for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) rad[c] += halfToFloat(buf[i * 4 + c]) / 256;
  rt.dispose();
  let out = null;
  if (readOutput) {
    stage.setGrade('probe');
    const post = stage.post;
    post.setGrade({ ...GRADE.editor, vig: 0, noDither: true });
    stage.render(scene, camera);
    const gl = renderer.getContext(), px = new Uint8Array(16 * 16 * 4);
    const dw = gl.drawingBufferWidth, dh = gl.drawingBufferHeight;
    gl.readPixels(Math.round(dw / 2) - 8, Math.round(dh / 2) - 8, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, px);
    out = [0, 0, 0];
    for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) out[c] += px[i * 4 + c] / 255 / 256;
    stage.setGrade('editor');
  }
  u.uFlat.value = keep.flat; u.uC0.value.copy(keep.c0); u.uPat.value.copy(keep.pat); u.uAmt.value.copy(keep.amt);
  scene.remove(patch);
  return { radiance: rad, output: out };
}
