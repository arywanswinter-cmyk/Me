// skin.js — the creature skin: one MeshPhysicalMaterial program for every skin type, paint layer, pattern and mask.
// Exports: SKIN_KEY, SKIN_TYPES, PATTERNS, MASKS, createSkinMaterial({ noise, side, membrane }) -> Material (userData.uniforms),
//          setPaint(mat, paint, { height }), setNoise(mat, a, b), PAINT_GLSL (shared with the vertex bake), skinParams(type).
// Invariants: everything that varies at runtime is a uniform (never a define) — repainting is a uniform write, no remesh,
//   no recompile; clearcoat and sheen stay ≥ 0.01 so their defines never toggle; customProgramCacheKey is constant per
//   variant (pattern from Doodle World src/creature/material.js: onBeforeCompile + customProgramCacheKey, object-space relief).
import * as THREE from 'three';

export const SKIN_KEY = 'sborn-skin-v2';
export const SKIN_TYPES = ['smooth', 'bumpy', 'scaly', 'leathery', 'fuzzy'];
export const PATTERNS = ['solid', 'gradient', 'spots', 'stripes', 'scales', 'speckles', 'patches', 'saddle', 'rosettes', 'bands'];
export const MASKS = ['all', 'back', 'belly', 'limbs', 'head'];
// §11.3 table
const PARAMS = {
  smooth: { bump: 1.0, rough: 0.38, rough2: 0.38, cc: 0.45, ccr: 0.18, follow: 0, sheen: 0.20, sheenR: 0.5, wrap: 0.35, lt: 1.0 },
  bumpy: { bump: 2.6, rough: 0.44, rough2: 0.44, cc: 0.35, ccr: 0.22, follow: 0.35, sheen: 0.15, sheenR: 0.5, wrap: 0.35, lt: 0.9 },
  scaly: { bump: 1.6, rough: 0.30, rough2: 0.58, cc: 0.60, ccr: 0.12, follow: 0.6, sheen: 0.05, sheenR: 0.5, wrap: 0.25, lt: 0.6 },
  leathery: { bump: 2.6, rough: 0.56, rough2: 0.56, cc: 0.12, ccr: 0.40, follow: 0.2, sheen: 0.25, sheenR: 0.6, wrap: 0.30, lt: 0.7 },
  fuzzy: { bump: 1.4, rough: 0.74, rough2: 0.74, cc: 0.01, ccr: 0.6, follow: 0, sheen: 1.0, sheenR: 0.35, wrap: 0.55, lt: 0.8 },
};
export const skinParams = (t) => PARAMS[t] || PARAMS.smooth;

// Pattern stack in GLSL: evaluated in a domain (metres) with aPaint (s01, belly, limbT, junction w). Shared with bake.js.
export const PAINT_GLSL = /* glsl */`
uniform highp sampler3D uNoiseA;
uniform highp sampler3D uNoiseB;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2;
uniform vec3 uPat; uniform vec3 uSc; uniform vec2 uAmt; uniform vec2 uMask;
vec4 NA(vec3 q) { return texture(uNoiseA, q); }
vec4 NB(vec3 q) { return texture(uNoiseB, q); }
float aaStep(float e, float x) { float w = max(fwidth(x), 1e-4) * 0.75; return smoothstep(e - w, e + w, x); }
// returns coverage 0..1; cellT receives a per-cell tint jitter
float patV(float pat, vec3 d, vec4 pp, float sc, float seed, out float cellT) {
  cellT = 0.0;
  vec3 q = d / (0.12 * sc) + vec3(seed * 0.37, seed * 0.11, seed * 0.23);
  if (pat < 0.5) return 1.0;                                           // solid
  if (pat < 1.5) return smoothstep(0.0, 1.0, mix(pp.x, pp.z, step(0.5, pp.w)));        // gradient along spine s or limb t
  if (pat < 2.5) {                                                       // spots: Worley F1, size jitter
    vec4 w = NB(q / 4.0); float f1 = w.r * 1.2; float r = 0.30 + 0.16 * (w.b - 0.5);
    float aa = max(fwidth(f1), 1e-4); float v = 1.0 - smoothstep(r - aa, r + aa, f1);
    return mix(v, 0.35, smoothstep(0.35, 0.6, aa / max(r, 0.05)));       // cells under ~2 px fade to their average
  }
  if (pat < 3.5) {                                                       // stripes across the spine; rings on limbs
    float warp = NA(q / 16.0).g - 0.5;
    float x = sin(6.2831853 * (d.x / (0.16 * sc) + warp * 0.9));
    float aa = max(fwidth(x), 1e-4);
    return smoothstep(-aa, aa, x) * (1.0 - smoothstep(0.45, 0.9, pp.y));
  }
  if (pat < 4.5) {                                                       // scales: F2 − F1 edges, ±3% per cell
    vec4 w = NB(q * 1.6 / 4.0); float e = w.g * 1.6 - w.r * 1.2; cellT = (w.b - 0.5) * 0.06;
    return 1.0 - aaStep(0.06, e);
  }
  if (pat < 5.5) {                                                       // speckles: value noise 60–120 per metre
    float n = NA(d * (90.0 / sc) / 32.0).a; return aaStep(0.80, n);
  }
  if (pat < 6.5) { float n = NA(d / (0.45 * sc) / 8.0).g; return aaStep(0.53, n); }   // patches: thresholded low-frequency fBm
  if (pat < 7.5) { float s = pp.x; return smoothstep(0.28, 0.34, s) * (1.0 - smoothstep(0.62, 0.68, s)) * (1.0 - smoothstep(0.35, 0.7, pp.y)) * (1.0 - pp.w); } // saddle
  if (pat < 8.5) {                                                       // rosettes: Worley ring
    vec4 w = NB(q / 4.0); float f1 = w.r * 1.2; float aa = max(fwidth(f1), 1e-4);
    return smoothstep(0.20 - aa, 0.20 + aa, f1) * (1.0 - smoothstep(0.34 - aa, 0.34 + aa, f1));
  }
  float t = pp.z * 4.0 / sc; float x = sin(6.2831853 * t); float aa = max(fwidth(x), 1e-4);   // bands ("socks") on limbs
  return smoothstep(-aa, aa, x) * pp.w;
}
float maskV(float m, vec4 pp) {
  if (m < 0.5) return 1.0;
  if (m < 1.5) return 1.0 - smoothstep(0.25, 0.75, pp.y);
  if (m < 2.5) return smoothstep(0.25, 0.75, pp.y);
  if (m < 3.5) return pp.w;
  return smoothstep(0.78, 0.88, pp.x) * (1.0 - pp.w);
}
vec3 paintStack(vec3 d, vec4 pp, out float cellOut) {
  float ct;
  float vb = uPat.x < 0.5 ? 0.0 : patV(uPat.x, d, pp, uSc.x, 1.0, ct);
  vec3 c = mix(uC0, min(uC0 * 1.25 + 0.04, vec3(1.0)), vb);            // base mixes with a 25%-lighter tint of itself
  cellOut = ct;
  float vc = patV(uPat.y, d, pp, uSc.y, 2.0, ct) * uAmt.x * maskV(uMask.x, pp);
  c = mix(c, uC1 * (1.0 + ct), vc);
  float vd = patV(uPat.z, d, pp, uSc.z, 3.0, ct) * uAmt.y * maskV(uMask.y, pp);
  c = mix(c, uC2 * (1.0 + ct), vd);
  c = mix(c, vec3(1.0), 0.22 * 0.55 * smoothstep(0.2, 0.9, pp.y));     // belly countershading
  return c;
}
vec3 paintAt(vec3 dom, vec3 dom2, vec4 pp) {
  // dom = limb domain wherever a limb is near (continuous), dom2 = spine domain; w blends them at junctions
  float cell; vec4 pp2 = vec4(pp.xy, 0.0, 0.0);
  if (pp.w <= 0.02) return paintStack(dom2, pp2, cell);
  vec3 c = paintStack(dom, pp, cell);
  if (pp.w < 0.98) { float cell2; c = mix(paintStack(dom2, pp2, cell2), c, pp.w); }   // same pattern in both, colours blended
  return c;
}
`;

const RELIEF_GLSL = /* glsl */`
uniform float uSkinType; uniform float uH; uniform float uRelief; uniform vec4 uWave; uniform float uWaveOn;
float reliefH(vec3 p, out float groove) {
  vec3 q = p / max(uH, 0.1);
  groove = 0.0;
  if (uSkinType < 0.5) { float h = (NA(q * 3.0 / 8.0).g - 0.5) * 0.6; if (uRelief > 1.5) h += (NA(q * 22.0 / 32.0).a - 0.5) * 0.25; return h; }
  if (uSkinType < 1.5) { vec4 w = NB(q * 16.0 / 4.0); float f = w.r * 1.2; float h = (1.0 - f * f) * 0.9; if (uRelief > 1.5) h += (NA(q * 40.0 / 32.0).a - 0.5) * 0.1; return h; }
  if (uSkinType < 2.5) { vec4 w = NB(q * 24.0 / 4.0); float e = w.g * 1.6 - w.r * 1.2; groove = 1.0 - smoothstep(0.0, 0.18, e); float sh = w.r * 1.2; return (1.0 - groove) * (0.9 - 0.5 * sh); }
  if (uSkinType < 3.5) { float r = NB(q * 10.0 / 8.0).a; float h = -pow(1.0 - r, 3.0) * 1.2; if (uRelief > 1.5) h -= step(0.86, NA(q * 60.0 / 32.0).a) * 0.4; return h; }
  float s = NA(vec3(q.x * 90.0, q.y * 30.0, q.z * 90.0) / 32.0).a; return (s - 0.5) * 0.8;
}
vec3 bumpNormal(vec3 pos, vec3 n, float h, float k) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float dhx = dFdx(h) * k, dhy = dFdy(h) * k;
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - g);
}
`;

export function createSkinMaterial({ side = THREE.FrontSide, membrane = false } = {}) {
  const uniforms = {
    uNoiseA: { value: null }, uNoiseB: { value: null },
    uC0: { value: new THREE.Color('#ff8fb1') }, uC1: { value: new THREE.Color('#6c8cff') }, uC2: { value: new THREE.Color('#ffd23f') },
    uPat: { value: new THREE.Vector3(0, 3, 2) }, uSc: { value: new THREE.Vector3(1, 1, 1) }, uAmt: { value: new THREE.Vector2(0, 0) }, uMask: { value: new THREE.Vector2(0, 0) },
    uSkinType: { value: 0 }, uH: { value: 1 }, uRelief: { value: 2 }, uRough2: { value: 0.38 }, uCoatFollow: { value: 0 },
    uWrap: { value: 0.35 }, uLightThrough: { value: 1 }, uAO: { value: 1 }, uThinForce: { value: membrane ? 1 : 0 },
    uRimTint: { value: new THREE.Color('#CFE6FF') }, uWave: { value: new THREE.Vector4(0, -10, 0.08, 0) }, uWaveOn: { value: 0 },
    uOcc: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -100, 0, 0)) }, uFlat: { value: 0 }, uBumpK: { value: 1 },
  };
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0, specularIntensity: 0.25, clearcoat: 0.45, clearcoatRoughness: 0.18, sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color(1, 1, 1), side });
  mat.userData.uniforms = uniforms;
  mat.userData.kind = membrane ? 'membrane' : 'skin';
  mat.customProgramCacheKey = () => `${SKIN_KEY}-${membrane ? 'm' : 's'}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aDomain; attribute vec3 aDomain2; attribute vec4 aPaint; attribute vec4 aSkin;
varying vec3 vDom; varying vec3 vDom2; varying vec4 vPaint; varying vec4 vSkinA; varying vec3 vRest;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vDom = aDomain; vDom2 = aDomain2; vPaint = aPaint; vSkinA = aSkin; vRest = position;`);
    const lp = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
      `{
    float ndl = dot( geometryNormal, directLight.direction );
    float wd = saturate( ( ndl + uWrap ) / ( 1.0 + uWrap ) );
    vec3 term = mix( vec3( 1.0, 0.55, 0.45 ), vec3( 1.0 ), smoothstep( -0.05, 0.4, ndl ) );
    reflectedLight.directDiffuse += wd * term * directLight.color * BRDF_Lambert( material.diffuseColor );
    // fake light-through (Barré-Brisebois): distortion 0.25, power 4, ambient 0.12, weighted by thinness and AO
    vec3 Ht = normalize( directLight.direction + geometryNormal * 0.25 );
    float lt = pow( saturate( dot( geometryViewDir, -Ht ) ), 4.0 ) + 0.12;
    reflectedLight.directDiffuse += lt * sThin * uLightThrough * directLight.color * material.diffuseColor * vec3( 1.0, 0.72, 0.58 ) * sAO;
  }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vDom; varying vec3 vDom2; varying vec4 vPaint; varying vec4 vSkinA; varying vec3 vRest;
uniform float uBumpK; uniform float uRough2; uniform float uCoatFollow; uniform float uWrap; uniform float uLightThrough; uniform float uAO; uniform float uThinForce; uniform vec3 uRimTint; uniform vec4 uOcc[8]; uniform float uFlat;
float sThin; float sAO; float sRelief; float sGroove;
${PAINT_GLSL}
${RELIEF_GLSL}`)
      .replace('#include <lights_physical_pars_fragment>', lp)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  sThin = mix( 1.0 - smoothstep( 0.03, 0.22, vSkinA.x * 0.3 ), 1.0, uThinForce );
  sAO = mix( 1.0, vSkinA.z, uAO );
  vec3 pc = uFlat > 0.5 ? uC0 : paintAt( vDom, vDom2, vPaint );
  sRelief = reliefH( vRest, sGroove );
  pc *= 1.0 - 0.18 * vSkinA.y;                                         // cavity darkens 18%
  // paint shimmer: a white-gold band sweeping along the spine (M7)
  if ( uWaveOn > 0.5 ) { float b = abs( vPaint.x - uWave.y ); pc += vec3( 1.0, 0.86, 0.5 ) * 0.6 * uWave.w * ( 1.0 - smoothstep( 0.0, uWave.z, b ) ); }
  diffuseColor.rgb *= pc;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix( roughnessFactor, uRough2, sGroove );
{ vec3 nn = normalize( vNormal ); float v = length( fwidth( nn ) ); roughnessFactor = sqrt( roughnessFactor * roughnessFactor + min( 0.25, v * v * 0.5 ) ); }   // Toksvig-style AA`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if ( uFlat < 0.5 ) normal = bumpNormal( - vViewPosition, normal, sRelief, 0.0016 * uH * uBumpK );`)
      .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>
#ifdef USE_CLEARCOAT
clearcoatNormal = normalize( mix( nonPerturbedNormal, normal, uCoatFollow ) );
#endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float rimF = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) ); totalEmissiveRadiance += uRimTint * pow( rimF, 3.0 ) * 0.22 * sAO; }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float occ = sAO;
  reflectedLight.indirectDiffuse *= occ; reflectedLight.indirectSpecular *= occ;
  #ifdef USE_CLEARCOAT
  clearcoatSpecularIndirect *= occ;
  #endif
  #ifdef USE_SHEEN
  sheenSpecularIndirect *= occ;
  #endif
}`);
  };
  return mat;
}

const tmpC = new THREE.Color();
export function setPaint(mat, paint, { height } = {}) {
  const u = mat.userData.uniforms;
  u.uC0.value.set(paint.base.c); u.uC1.value.set(paint.coat.c); u.uC2.value.set(paint.detail.c);
  u.uPat.value.set(PATTERNS.indexOf(paint.base.pat), PATTERNS.indexOf(paint.coat.pat), PATTERNS.indexOf(paint.detail.pat));
  u.uSc.value.set(paint.base.sc || 1, paint.coat.sc || 1, paint.detail.sc || 1);
  u.uAmt.value.set(paint.coat.amt ?? 0, paint.detail.amt ?? 0);
  u.uMask.value.set(Math.max(0, MASKS.indexOf(paint.coat.mask || 'all')), Math.max(0, MASKS.indexOf(paint.detail.mask || 'all')));
  const t = Math.max(0, SKIN_TYPES.indexOf(paint.skin));
  u.uSkinType.value = t;
  const P = skinParams(paint.skin);
  mat.roughness = P.rough; u.uRough2.value = P.rough2;
  mat.clearcoat = Math.max(0.01, P.cc); mat.clearcoatRoughness = P.ccr; u.uCoatFollow.value = P.follow;
  mat.sheen = Math.max(0.01, P.sheen); mat.sheenRoughness = P.sheenR;
  mat.sheenColor.copy(tmpC.set(paint.base.c)).lerp(new THREE.Color(1, 1, 1), 0.5);
  u.uWrap.value = P.wrap; u.uLightThrough.value = P.lt; u.uBumpK.value = P.bump;
  if (height) u.uH.value = height;
}
export function setNoise(mat, a, b) { mat.userData.uniforms.uNoiseA.value = a; mat.userData.uniforms.uNoiseB.value = b; }
