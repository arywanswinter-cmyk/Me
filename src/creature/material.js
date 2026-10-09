// material.js — the clay skin.
// Exports: clayMaterial(color: THREE.Color, inkTexture, { vertexColors }) -> MeshPhysicalMaterial with uniforms in userData.uniforms,
//          clayDepthMaterial(uniforms) -> MeshDepthMaterial that bends the same way, for the sun's shadow.
// Look: matte physical clay + soft sheen + procedural thumbprint relief (object-space noise, so it never swims)
//   + warm subsurface-style rim + the player's inner drawing printed on the front (aInkUv / aFront attributes).
// Invariants: uInflate scales object z (0..1) for the birth puff and corrects normals to match;
//   legs (aLeg = k + 1, aLegW 0 at the hip → 1 at the foot) bend at the hip by uThigh[k] and at the knee by uKnee[k],
//   and the foot slides sideways by uShiftX[k] (planted feet while turning);
//   all creatures share one compiled program (customProgramCacheKey).
import * as THREE from 'three';
import { TOON, toonRamp } from '../core/look.js';

const NOISE = /* glsl */`
float clayHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float clayNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(clayHash(i), clayHash(i + vec3(1,0,0)), f.x), mix(clayHash(i + vec3(0,1,0)), clayHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(clayHash(i + vec3(0,0,1)), clayHash(i + vec3(1,0,1)), f.x), mix(clayHash(i + vec3(0,1,1)), clayHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float clayRelief(vec3 p) { return clayNoise(p * 19.0) * 0.6 + clayNoise(p * 53.0 + 7.1) * 0.4; }
`;

// Vertex side, shared by the clay, its outline and its shadow: puff, then pose each leg as two bones.
// Thigh rotates about the hip, shin about the knee (halfway down); vertices near the knee blend the two, like skinning.
export const LEG_PARS = /* glsl */`
attribute float aLeg;
attribute float aLegW;
uniform float uInflate;
uniform float uHip;
uniform float uThigh[12];
uniform float uKnee[12];
uniform float uShiftX[12];
uniform float uLegZ[12];
uniform vec3 uJiggle;
uniform float uTop;
attribute float aApp;
attribute float aAppW;
uniform vec3 uAppPivot[6];
uniform vec3 uAppAxis[6];
uniform vec3 uAppAxis2[6];
uniform float uAppSwing[6];
uniform float uAppFlap[6];
vec3 rotAxis(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
// Arms, antennae, ears, tails: turn about two axes through the joint. Drawn limbs swing fore and aft about an axis in
// the drawing's plane and flap within it (axis 2 = z); sculpted tails wag about y and lift about x.
void clayAppPose(inout vec3 p, inout vec3 nrm) {
  int ai = int(aApp + 0.5) - 1;
  if (ai < 0) return;
  vec3 pv = vec3(0.0), ax = vec3(1.0, 0.0, 0.0), bx = vec3(0.0, 0.0, 1.0); float sw = 0.0, fl = 0.0;
  for (int k = 0; k < 6; k++) if (k == ai) { pv = uAppPivot[k]; ax = uAppAxis[k]; bx = uAppAxis2[k]; sw = uAppSwing[k]; fl = uAppFlap[k]; }
  vec3 r = p - pv;
  r = rotAxis(r, bx, fl * aAppW); nrm = rotAxis(nrm, bx, fl * aAppW);
  vec3 ax2 = rotAxis(ax, bx, fl * aAppW);
  r = rotAxis(r, ax2, sw * aAppW); nrm = rotAxis(nrm, ax2, sw * aAppW);
  p = pv + r;
}
vec2 legRot(vec2 p, vec2 c, float a) { vec2 r = p - c; float co = cos(a), si = sin(a); return c + vec2(r.x * co + r.y * si, -r.x * si + r.y * co); }
void clayLegPose(inout vec3 p, inout vec3 nrm) {
  int li = int(aLeg + 0.5) - 1;
  if (li < 0) return;
  float th = 0.0, kn = 0.0, sx = 0.0, lz = 0.0;
  for (int k = 0; k < 12; k++) if (k == li) { th = uThigh[k]; kn = uKnee[k]; sx = uShiftX[k]; lz = uLegZ[k] * uInflate; }
  float t = clamp((uHip - p.y) / max(uHip, 1e-4), 0.0, 1.0);
  float s = smoothstep(0.4, 0.6, t);
  vec2 hip = vec2(uHip, lz), knee = vec2(uHip * 0.5, lz);
  vec2 up = legRot(p.yz, hip, th * aLegW);
  vec2 lo = legRot(legRot(p.yz, knee, kn), hip, th * aLegW);
  p.yz = mix(up, lo, s);
  p.x += sx * t * aLegW;
  nrm.yz = legRot(nrm.yz, vec2(0.0), th * aLegW + kn * s);
}`;
const LEG_NORMAL = /* glsl */`
{ vec3 lp = position; lp.z *= uInflate; clayAppPose(lp, objectNormal); clayLegPose(lp, objectNormal); }`;
export const LEG_VERTEX = /* glsl */`
transformed.z *= uInflate;
{ vec3 ln = vec3(0.0, 1.0, 0.0); clayAppPose(transformed, ln); clayLegPose(transformed, ln);
  float jw = smoothstep(uHip, uTop, transformed.y); transformed += uJiggle * jw * jw; }`;
const zeros = () => new Array(12).fill(0);
export const legUniforms = () => ({ uInflate: { value: 1 }, uHip: { value: 0 }, uThigh: { value: zeros() }, uKnee: { value: zeros() }, uShiftX: { value: zeros() }, uLegZ: { value: zeros() },
  uJiggle: { value: new THREE.Vector3() }, uTop: { value: 1 },
  uAppPivot: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) }, uAppAxis: { value: Array.from({ length: 6 }, () => new THREE.Vector3(1, 0, 0)) },
  uAppAxis2: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, 1)) },
  uAppSwing: { value: new Array(6).fill(0) }, uAppFlap: { value: new Array(6).fill(0) } });

export function clayDepthMaterial(uniforms) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${LEG_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEG_VERTEX}`);
  };
  mat.customProgramCacheKey = () => 'clay-depth-v4';
  return mat;
}

// Cel-shaded outline: the same bent mesh pushed out along its normals, back faces only, in dark ink.
export function clayOutlineMaterial(uniforms, color, width) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, { uOutline: { value: width } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${LEG_PARS}\nuniform float uOutline;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEG_VERTEX}\ntransformed += normal * uOutline;`);
  };
  mat.customProgramCacheKey = () => 'clay-outline-v4';
  return mat;
}

export function clayMaterial(color, inkTexture, { vertexColors = true } = {}) {
  const mat = TOON ? new THREE.MeshToonMaterial({ color: vertexColors ? 0xffffff : color, vertexColors, gradientMap: toonRamp() }) : new THREE.MeshPhysicalMaterial({
    color: vertexColors ? 0xffffff : color,
    vertexColors,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.45,
    sheenRoughness: 0.7,
    sheenColor: color.clone().lerp(new THREE.Color(1, 1, 1), 0.55),
    envMapIntensity: 0.55,
  });
  const uniforms = { uInk: { value: inkTexture }, uThumb: { value: TOON ? 0 : 1 }, uUseInk: { value: inkTexture ? 1 : 0 }, ...legUniforms() };
  mat.userData.uniforms = uniforms;
  mat.customProgramCacheKey = () => `clay-v5-${TOON ? 'toon' : 'pbr'}-${vertexColors ? 1 : 0}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aInkUv;
attribute float aFront;
${LEG_PARS}
varying vec2 vInkUv;
varying float vFront;
varying vec3 vObjPos;
varying vec3 vNM0; varying vec3 vNM1; varying vec3 vNM2;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
objectNormal = normalize(vec3(objectNormal.xy * max(uInflate, 0.02), objectNormal.z));
${LEG_NORMAL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${LEG_VERTEX}
vInkUv = aInkUv; vFront = aFront; vObjPos = position;
vNM0 = normalMatrix[0]; vNM1 = normalMatrix[1]; vNM2 = normalMatrix[2];`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uInk;
uniform float uThumb;
uniform float uUseInk;
varying vec2 vInkUv;
varying float vFront;
varying vec3 vObjPos;
varying vec3 vNM0; varying vec3 vNM1; varying vec3 vNM2;
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uUseInk > 0.5) {
  vec3 inkC = texture2D(uInk, vInkUv).rgb;
  diffuseColor.rgb *= mix(vec3(1.0), inkC, clamp(vFront, 0.0, 1.0));
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 p = vObjPos; float e = 0.004;
  float h0 = clayRelief(p);
  vec3 gr = vec3(clayRelief(p + vec3(e, 0.0, 0.0)) - h0, clayRelief(p + vec3(0.0, e, 0.0)) - h0, clayRelief(p + vec3(0.0, 0.0, e)) - h0) / e;
  vec3 gv = mat3(vNM0, vNM1, vNM2) * gr;
  gv -= dot(gv, normal) * normal;
  normal = normalize(normal - gv * 0.0026 * uThumb);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.8, 0.66) * ${TOON ? 'step(0.72, rimF) * 0.22' : 'pow(rimF, 3.0) * 0.2'};
}`);
  };
  return mat;
}
