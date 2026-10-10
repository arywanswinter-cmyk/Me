// contact.js — soft contact shadow under the creature: a top-down height render of the creature into a small target
//   (256² Medium, 512² High, 128² Low as foot blobs), blurred twice, laid on the floor with multiply blending.
// Exports: createContactShadow(renderer, scene) -> { setTier(t), update(creature, groundY), mesh, materials }.
// Invariants: darkness falls off with height above the ground, so feet and bellies near the floor read as grounded;
//   costs 3 programs (height, blur, display) plus the skinned/plain variants of the height material.
import * as THREE from 'three';

const RES = { low: 128, medium: 256, high: 512 };
export function createContactShadow(renderer, scene) {
  let res = 256;
  const rtA = new THREE.WebGLRenderTarget(res, res, { depthBuffer: true }), rtB = new THREE.WebGLRenderTarget(res, res, { depthBuffer: false });
  const heightMat = new THREE.ShaderMaterial({
    uniforms: { uMaxH: { value: 0.15 }, uGround: { value: 0 } },
    vertexShader: `#include <common>
#include <skinning_pars_vertex>
varying float vH;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4( transformed, 1.0 );
  vH = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`,
    fragmentShader: `uniform float uMaxH; uniform float uGround; varying float vH;
void main() { float a = 1.0 - smoothstep( 0.0, uMaxH, vH - uGround ); gl_FragColor = vec4( a, a, a, 1.0 ); }`,
    blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  heightMat.name = 'contact-height';
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){ float a = 0.0; float w[5]; w[0]=0.227; w[1]=0.195; w[2]=0.122; w[3]=0.054; w[4]=0.016;
  a += texture2D(tSrc, vUv).r * w[0];
  for (int i = 1; i < 5; i++) { a += texture2D(tSrc, vUv + uDir * float(i)).r * w[i]; a += texture2D(tSrc, vUv - uDir * float(i)).r * w[i]; }
  gl_FragColor = vec4(a, a, a, 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blurMat);
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.Camera();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  cam.layers.set(2);
  // display: soft edges boosted (1 − (1 − a)^2.5) so the darkening reaches a little past the sole
  const dispMat = new THREE.ShaderMaterial({
    uniforms: { tA: { value: rtA.texture }, uColor: { value: new THREE.Color('#3A2E5C') }, uOpacity: { value: 0.8 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tA; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main(){ float a = texture2D(tA, vUv).r; a = 1.0 - pow(1.0 - clamp(a, 0.0, 1.0), 2.5); gl_FragColor = vec4(uColor, a * uOpacity); }',
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dispMat);
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2; mesh.name = 'contact-shadow';
  scene.add(mesh);
  function setTier(t) { res = RES[t] || 256; rtA.setSize(res, res); rtB.setSize(res, res); }
  const box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  function update(creature, groundY = 0, visible = true) {
    mesh.visible = visible && !!creature.skin;
    if (!mesh.visible) return;
    creature.group.traverse((o) => { if (o.isMesh) o.layers.enable(2); });
    // footprint from the creature's bounds in world space
    const b = creature.bounds, g = creature.group;
    const half = Math.max(b[3] - b[0], b[5] - b[2]) * 0.5 * Math.max(g.scale.x, g.scale.z) + 0.25;
    c.set(g.position.x, groundY, g.position.z);
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
    cam.position.set(c.x, groundY + 5, c.z); cam.up.set(0, 0, -1); cam.lookAt(c.x, groundY, c.z);
    heightMat.uniforms.uMaxH.value = Math.max(0.08, creature.height * 0.35); heightMat.uniforms.uGround.value = groundY;
    const prevOverride = scene.overrideMaterial, prevBg = scene.background, prevFog = scene.fog;
    scene.overrideMaterial = heightMat; scene.background = null; scene.fog = null;
    renderer.setRenderTarget(rtA); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam);
    scene.overrideMaterial = prevOverride; scene.background = prevBg; scene.fog = prevFog;
    for (let k = 0; k < 2; k++) {
      blurMat.uniforms.tSrc.value = rtA.texture; blurMat.uniforms.uDir.value.set(2.0 / res, 0); renderer.setRenderTarget(rtB); renderer.render(qScene, qCam);
      blurMat.uniforms.tSrc.value = rtB.texture; blurMat.uniforms.uDir.value.set(0, 2.0 / res); renderer.setRenderTarget(rtA); renderer.render(qScene, qCam);
    }
    renderer.setRenderTarget(null);
    mesh.position.set(c.x, groundY + 0.002, c.z); mesh.scale.set(half * 2, half * 2, 1);
  }
  return { setTier, update, mesh, materials: [heightMat, blurMat, dispMat] };
}
