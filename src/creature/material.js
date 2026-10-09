// material.js — the clay skin.
// Exports: clayMaterial(color: THREE.Color, inkTexture, { vertexColors }) -> MeshPhysicalMaterial with uniforms in userData.uniforms,
//          clayDepthMaterial(uniforms) -> MeshDepthMaterial that bends the same way, for the sun's shadow.
// Look: matte physical clay + soft sheen + procedural thumbprint relief (object-space noise, so it never swims)
//   + warm subsurface-style rim + the player's inner drawing printed on the front (aInkUv / aFront attributes).
// Invariants: uInflate scales object z (0..1) for the birth puff and corrects normals to match;
//   legs (aLeg = k + 1, aLegW 0 at the hip → 1 at the foot) swing about the hip line by uSwing[k] and lift by uLift[k];
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

// Vertex side, shared by the clay and its shadow: puff, then swing each leg about its hip.
export const LEG_PARS = /* glsl */`
attribute float aLeg;
attribute float aLegW;
uniform float uInflate;
uniform float uHip;
uniform float uSwing[8];
uniform float uLift[8];
uniform float uLegZ[8];
void clayLeg(out float c, out float s, out float lift, out float lz) {
  c = 1.0; s = 0.0; lift = 0.0; lz = 0.0;
  int li = int(aLeg + 0.5) - 1;
  if (li < 0) return;
  float a = 0.0;
  for (int k = 0; k < 8; k++) if (k == li) { a = uSwing[k]; lift = uLift[k]; lz = uLegZ[k]; }
  c = cos(a * aLegW); s = sin(a * aLegW); lift *= aLegW;
}`;
const LEG_NORMAL = /* glsl */`
{ float lc, ls, ll, lz; clayLeg(lc, ls, ll, lz);
  objectNormal = vec3(objectNormal.x, objectNormal.y * lc + objectNormal.z * ls, -objectNormal.y * ls + objectNormal.z * lc); }`;
export const LEG_VERTEX = /* glsl */`
transformed.z *= uInflate;
{ float lc, ls, ll, lz; clayLeg(lc, ls, ll, lz);
  float ry = transformed.y - uHip, rz = transformed.z - lz * uInflate;
  transformed.y = uHip + ry * lc + rz * ls + ll;
  transformed.z = lz * uInflate - ry * ls + rz * lc; }`;
export const legUniforms = () => ({ uInflate: { value: 1 }, uHip: { value: 0 }, uSwing: { value: new Array(8).fill(0) }, uLift: { value: new Array(8).fill(0) }, uLegZ: { value: new Array(8).fill(0) } });

export function clayDepthMaterial(uniforms) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${LEG_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${LEG_VERTEX}`);
  };
  mat.customProgramCacheKey = () => 'clay-depth-v1';
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
  mat.customProgramCacheKey = () => 'clay-outline-v1';
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
  mat.customProgramCacheKey = () => `clay-v2-${TOON ? 'toon' : 'pbr'}-${vertexColors ? 1 : 0}`;
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
