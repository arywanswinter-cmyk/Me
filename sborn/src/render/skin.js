// skin.js — the creature skin material (one MeshPhysicalMaterial program for every skin type and paint).
// Exports: createSkinMaterial() -> MeshPhysicalMaterial with userData.uniforms; setPaint(mat, paint); SKIN_KEY.
// Invariants: everything that varies at runtime is a uniform (never a define), so repainting is a uniform write
//   with no recompile; customProgramCacheKey is constant (pattern from Doodle World src/creature/material.js).
import * as THREE from 'three';

export const SKIN_KEY = 'sborn-skin-v1';

export function createSkinMaterial() {
  const uniforms = {
    uBase: { value: new THREE.Color('#ff8fb1') },
    uAO: { value: 1 },
  };
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.2, sheen: 0.2, sheenRoughness: 0.5 });
  mat.userData.uniforms = uniforms;
  mat.customProgramCacheKey = () => SKIN_KEY;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aSkin;
varying vec4 vSkin;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vSkin = aSkin;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uBase; uniform float uAO;
varying vec4 vSkin;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= uBase;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float ao = mix(1.0, vSkin.z, uAO);
  reflectedLight.indirectDiffuse *= ao;
  reflectedLight.indirectSpecular *= ao;
}`);
  };
  return mat;
}

export function setPaint(mat, paint) {
  mat.userData.uniforms.uBase.value.set(paint.base.c);
}
