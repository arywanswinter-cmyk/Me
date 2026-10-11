// bake.js — GPU vertex bake: evaluates each material's paint/colour GLSL per vertex into an RGBA8 target (vertex i → pixel
//   (i % 1024, i / 1024)), reads it back and decodes to linear RGB (GLB COLOR_0, seam checks).
// Exports: bakeVertexColors(renderer, geometry, kind, mats) -> Float32Array (linear RGB per vertex), BAKE_KEY.
// Invariants: same paint GLSL as the skin shader (PAINT_GLSL), so baked colours match what renders; one Points draw per
//   bake; every material kind has a bake chunk (skin, membrane, eye, hard, shell).
import * as THREE from 'three';
import { PAINT_GLSL } from './skin.js';

export const BAKE_KEY = 'sborn-bake-v1';
const W = 1024;
const VS = /* glsl */`
uniform float uRows;
in vec3 position;
in vec3 aDomain; in vec3 aDomain2; in vec4 aPaint; in vec4 aSkin; in vec3 aEye; in vec3 color;
out vec3 vDom; out vec3 vDom2; out vec4 vPaint; out vec4 vSk; out vec3 vEyeP; out vec3 vCol;
void main() {
  float i = float(gl_VertexID);
  float x = mod(i, ${W}.0), y = floor(i / ${W}.0);
  gl_Position = vec4((x + 0.5) / ${W}.0 * 2.0 - 1.0, (y + 0.5) / uRows * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  vDom = aDomain; vDom2 = aDomain2; vPaint = aPaint; vSk = aSkin; vEyeP = aEye; vCol = color;
}`;
const FS = /* glsl */`
precision highp float;
uniform float uKind; uniform vec3 uIris;
in vec3 vDom; in vec3 vDom2; in vec4 vPaint; in vec4 vSk; in vec3 vEyeP; in vec3 vCol;
out vec4 outColor;
${PAINT_GLSL.replace(/fwidth\(([^)]*)\)/g, '0.0001')}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c;
  if (uKind < 0.5) { c = paintAt(vDom, vDom2, vPaint) * (1.0 - 0.18 * vSk.y); }
  else if (uKind < 1.5) {
    vec3 e = normalize(vEyeP); float rad = length(e.xz);
    c = mix(vec3(0.922, 0.851, 0.863), vec3(0.984, 0.965, 0.933), smoothstep(-0.2, 0.6, e.y));
    if (e.y > 0.0 && rad < 0.48) c = uIris;
    if (e.y > 0.0 && rad < 0.2) c = vec3(0.05, 0.04, 0.07);
  } else c = vCol;
  outColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;

let bakeMat = null;
export function bakeVertexColors(renderer, geometry, kind, mats) {
  const n = geometry.attributes.position.count, rows = Math.max(1, Math.ceil(n / W));
  if (!bakeMat) {
    const su = mats.skin.userData.uniforms;
    bakeMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false,
      uniforms: { uRows: { value: 1 }, uKind: { value: 0 }, uIris: mats.eye.userData.uniforms.uIris, uNoiseA: su.uNoiseA, uNoiseB: su.uNoiseB,
        uC0: su.uC0, uC1: su.uC1, uC2: su.uC2, uPat: su.uPat, uSc: su.uSc, uAmt: su.uAmt, uMask: su.uMask } });
    bakeMat.name = BAKE_KEY;
    bakeMat.customProgramCacheKey = () => BAKE_KEY;
  }
  // a geometry view with every attribute the bake reads (zeros where the source lacks one)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geometry.attributes.position);
  const ensure = (name, size) => g.setAttribute(name, geometry.attributes[name] || new THREE.BufferAttribute(new Float32Array(n * size), size));
  ensure('aDomain', 3); ensure('aDomain2', 3); ensure('aPaint', 4); ensure('aSkin', 4); ensure('aEye', 3); ensure('color', 3);
  bakeMat.uniforms.uRows.value = rows;
  bakeMat.uniforms.uKind.value = kind === 'skin' || kind === 'membrane' ? 0 : kind === 'eye' ? 1 : 2;
  const pts = new THREE.Points(g, bakeMat);
  pts.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(pts);
  const rt = new THREE.WebGLRenderTarget(W, rows, { type: THREE.UnsignedByteType, depthBuffer: false });
  const prevTM = renderer.toneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(sc, new THREE.Camera());
  const px = new Uint8Array(W * rows * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, rows, px);
  renderer.setRenderTarget(null); renderer.toneMapping = prevTM;
  rt.dispose(); g.dispose();
  const out = new Float32Array(n * 3);
  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = lin(px[i * 4 + k]);
  return out;
}
