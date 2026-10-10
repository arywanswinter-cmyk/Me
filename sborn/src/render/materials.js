// materials.js — the shared part materials: skin (same program as the body), membrane, eye, hard (keratin, teeth, mouth,
//   tongue, tints via vertex colours) and shell; plus the noise volumes they sample.
// Exports: createMaterials() -> { skin, membrane, eye, hard, shell, map (bucket → material), setPaint(paint, {height}), setNoise(a, b), all[] },
//          EYE_KEY, HARD_KEY.
// Invariants: one material object per kind for the whole app, so programs never multiply; runtime changes are uniform or
//   vertex-colour writes; every custom shader uses uniforms, not defines, for anything that varies.
import * as THREE from 'three';
import { createSkinMaterial, setPaint as setSkinPaint, setNoise as setSkinNoise } from './skin.js';

export const EYE_KEY = 'sborn-eye-v1', HARD_KEY = 'sborn-hard-v1';

function eyeMaterial() {
  const uniforms = { uIris: { value: new THREE.Color('#7fc8ff') }, uDilate: { value: 0.3 }, uNoiseA: { value: null }, uCatch: { value: 6.0 } };
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.04, sheen: 0.01 });
  mat.userData.uniforms = uniforms; mat.userData.kind = 'eye';
  mat.customProgramCacheKey = () => EYE_KEY;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aEye; attribute vec3 aEyeX; attribute vec3 aEyeY; attribute vec3 aEyeZ; attribute float aPupil;
varying vec3 vEye; varying vec3 vEX; varying vec3 vEY; varying vec3 vEZ; varying float vPupil;`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
{
  vec3 ex = aEyeX, ey = aEyeY, ez = aEyeZ;
  #ifdef USE_SKINNING
  ex = ( skinMatrix * vec4( ex, 0.0 ) ).xyz; ey = ( skinMatrix * vec4( ey, 0.0 ) ).xyz; ez = ( skinMatrix * vec4( ez, 0.0 ) ).xyz;
  #endif
  vEX = normalize( ( modelViewMatrix * vec4( ex, 0.0 ) ).xyz ); vEY = normalize( ( modelViewMatrix * vec4( ey, 0.0 ) ).xyz ); vEZ = normalize( ( modelViewMatrix * vec4( ez, 0.0 ) ).xyz );
  vEye = aEye; vPupil = aPupil;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uIris; uniform float uDilate; uniform highp sampler3D uNoiseA; uniform float uCatch;
varying vec3 vEye; varying vec3 vEX; varying vec3 vEY; varying vec3 vEZ; varying float vPupil;
float sIris;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 e = normalize( vEye );                     // eye-local unit position; +y looks out
  vec3 V = normalize( vViewPosition );            // surface → camera, view space
  vec3 vl = vec3( dot( V, vEX ), dot( V, vEY ), dot( V, vEZ ) );
  // refract the view ray at the cornea (IOR 1.336) and hit the iris plane at y = 0.82
  vec3 r = refract( -vl, e, 1.0 / 1.336 );
  float t = ( 0.82 - e.y ) / min( r.y, -0.05 );
  vec3 h = e.y > 0.6 ? e + r * clamp( t, -0.4, 0.4 ) : e;
  float rad = length( h.xz );
  float ang = atan( h.z, h.x );
  vec3 sclera = mix( vec3( 0.922, 0.851, 0.863 ), vec3( 0.984, 0.965, 0.933 ), smoothstep( -0.2, 0.6, e.y ) );
  float pupil = mix( 0.16, 0.26, uDilate );
  float fib = texture( uNoiseA, vec3( ang * 1.27, rad * 2.0, 0.37 ) ).a;
  vec3 iris = uIris * ( 0.75 + 0.5 * fib );
  iris = mix( iris, uIris * 1.35 + 0.05, smoothstep( 0.03, 0.0, abs( rad - 0.27 ) ) * 0.6 );      // collarette
  iris *= mix( 1.0, 0.45, smoothstep( 0.38, 0.48, rad ) );                                          // limbal ring
  vec3 c = sclera;
  float inIris = ( 1.0 - smoothstep( 0.47, 0.49, rad ) ) * step( 0.0, e.y );
  c = mix( c, iris, inIris );
  // pupil shape: 0 round, 1 soft vertical slit (rounded ends), 2 big round (cluster eyes)
  float pr = vPupil > 1.5 ? rad * 0.72 : vPupil > 0.5 ? length( vec2( h.x * 2.6, h.z * 0.8 ) ) : rad;
  c = mix( c, vec3( 0.05, 0.04, 0.07 ), ( 1.0 - smoothstep( pupil - 0.01, pupil + 0.01, pr ) ) * step( 0.0, e.y ) );
  sIris = inIris;
  diffuseColor.rgb *= c;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // catchlights locked in view space: big upper-left, small lower-right, HDR
  vec3 Nv = normalize( normal );
  float big = smoothstep( 0.962, 0.978, dot( Nv, normalize( vec3( -0.45, 0.55, 1.0 ) ) ) );
  float small = smoothstep( 0.994, 0.998, dot( Nv, normalize( vec3( 0.42, -0.35, 1.0 ) ) ) );
  totalEmissiveRadiance += vec3( 1.0 ) * uCatch * ( big + 0.6 * small );
}`);
  };
  return mat;
}

function hardMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.15, sheen: 0.01 });
  mat.userData.kind = 'hard';
  mat.customProgramCacheKey = () => HARD_KEY;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 aHard; varying vec2 vHard;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vHard = aHard;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vHard;`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = vHard.x;`)
      .replace('#include <lights_physical_fragment>', THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;', 'material.clearcoat = vHard.y;'));
  };
  return mat;
}

export function createMaterials() {
  const skin = createSkinMaterial();
  const membrane = createSkinMaterial({ side: THREE.DoubleSide, membrane: true });
  const eye = eyeMaterial();
  const hard = hardMaterial();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.35, iridescenceIOR: 1.4, sheen: 0.01 });
  shell.userData.kind = 'shell';
  const map = { skin, membrane, eye, hard, shell };
  function setPaint(paint, opts = {}) {
    setSkinPaint(skin, paint, opts); setSkinPaint(membrane, paint, opts);
    eye.userData.uniforms.uIris.value.set(paint.iris);
  }
  function setNoise(a, b) { setSkinNoise(skin, a, b); setSkinNoise(membrane, a, b); eye.userData.uniforms.uNoiseA.value = a; }
  return { skin, membrane, eye, hard, shell, map, setPaint, setNoise, all: [skin, membrane, eye, hard, shell] };
}
