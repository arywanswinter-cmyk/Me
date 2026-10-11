// post.js — the composer path: scene into a 4× MSAA HalfFloat target, a 3-program dual-filter bloom between non-MSAA
//   HalfFloat targets, then one final pass (bloom add, exposure, Neutral, lift-gamma-gain, saturation/vibrance,
//   vignette, sRGB, interleaved-gradient-noise dither). Low tier skips all of it and uses CustomToneMapping + CSS vignette.
// Exports: GRADE (editor, paint, island), createPost(renderer, { tier }) -> { render(scene, camera), setGrade(g), setTier(t), resize(w, h, dpr),
//          sceneTarget, enabled, dispose(), programsHint }, installLowToneMapping(renderer, grade).
// Invariants: not the stock EffectComposer (it clones the MSAA target); post costs 4 programs (prefilter, down, up, final);
//   every grade change is a uniform write.
import * as THREE from 'three';

export const GRADE = {
  editor: { exposure: 1.0, lift: [0.010, 0.006, 0.022], gamma: 1.02, gain: [1.0, 0.995, 0.985], sat: 1.05, vib: 0.10, vig: 0.30, vigTint: [0.93, 0.90, 0.97] },
  paint: { exposure: 1.0, lift: [0.010, 0.006, 0.022], gamma: 1.02, gain: [1.0, 0.995, 0.985], sat: 1.05, vib: 0.10, vig: 0.38, vigTint: [0.93, 0.90, 0.97] },
  island: { exposure: 0.95, lift: [0.004, 0.008, 0.024], gamma: 1.03, gain: [1.035, 1.0, 0.955], sat: 1.07, vib: 0.0, vig: 0.22, vigTint: [0.93, 0.90, 0.97] },
  probe: { exposure: 1.0, lift: [0, 0, 0], gamma: 1.0, gain: [1, 1, 1], sat: 1.0, vib: 0.0, vig: 0.0, vigTint: [1, 1, 1], noDither: true },
};
export const BLOOM = { medium: { strength: 0.22, radius: 0.50, threshold: 0.95, div: 4 }, high: { strength: 0.28, radius: 0.55, threshold: 0.92, div: 2 } };

const NEUTRAL = /* glsl */`
vec3 neutralTM( vec3 color ) {
  const float StartCompression = 0.8 - 0.04; const float Desaturation = 0.15;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < StartCompression ) return color;
  float d = 1. - StartCompression;
  float newPeak = 1. - d * d / ( peak + d - StartCompression );
  color *= newPeak / peak;
  float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
  return mix( color, vec3( newPeak ), g );
}
vec3 lgg( vec3 c, vec3 lift, float gamma, vec3 gain ) {
  c = c * gain + lift * ( 1.0 - c );
  return pow( max( c, 0.0 ), vec3( 1.0 / gamma ) );
}
vec3 satVib( vec3 c, float sat, float vib ) {
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) );
  float s = mx - mn;
  float k = sat * ( 1.0 + vib * ( 1.0 - s ) );
  return mix( vec3( l ), c, k );
}`;

const FS_TRI = 'out vec2 vUv; void main(){ vUv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0); }';
function pass(fs, uniforms) {
  return new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: `precision highp float;\n${FS_TRI}`, fragmentShader: `precision highp float;\nin vec2 vUv;\nout vec4 outColor;\n${fs}`, depthTest: false, depthWrite: false });
}

export function createPost(renderer, { tier = 'medium' } = {}) {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  tri.setDrawRange(0, 3);
  const quad = new THREE.Mesh(tri);
  quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.Camera();
  const opts = (samples) => ({ type: THREE.HalfFloatType, samples, depthBuffer: samples > 0, stencilBuffer: false, colorSpace: THREE.LinearSRGBColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const sceneRT = new THREE.WebGLRenderTarget(4, 4, opts(4));
  const mips = Array.from({ length: 5 }, () => new THREE.WebGLRenderTarget(4, 4, opts(0)));
  const prefilter = pass(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
void main(){ vec3 c = vec3(0.0);
  c += texture(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb; c += texture(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb; c += texture(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb; c *= 0.25;
  float l = max(c.r, max(c.g, c.b)); float k = smoothstep(uThreshold, uThreshold + 0.5, l);
  outColor = vec4(c * k, 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.95 } });
  const down = pass(`uniform sampler2D tSrc; uniform vec2 uTexel;
void main(){ vec3 c = texture(tSrc, vUv).rgb * 4.0;
  c += texture(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb; c += texture(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb; c += texture(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  outColor = vec4(c / 8.0, 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const up = pass(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uRadius;
void main(){ vec2 o = uTexel * (0.5 + uRadius); vec3 c = vec3(0.0);
  c += texture(tSrc, vUv + vec2(-2.0, 0.0) * o).rgb; c += texture(tSrc, vUv + vec2(2.0, 0.0) * o).rgb;
  c += texture(tSrc, vUv + vec2(0.0, -2.0) * o).rgb; c += texture(tSrc, vUv + vec2(0.0, 2.0) * o).rgb;
  c += texture(tSrc, vUv + vec2(-1.0, -1.0) * o).rgb * 2.0; c += texture(tSrc, vUv + vec2(1.0, -1.0) * o).rgb * 2.0;
  c += texture(tSrc, vUv + vec2(-1.0, 1.0) * o).rgb * 2.0; c += texture(tSrc, vUv + vec2(1.0, 1.0) * o).rgb * 2.0;
  outColor = vec4(c / 12.0, 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.5 } });
  up.blending = THREE.AdditiveBlending; up.transparent = true;
  const final = pass(`uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uExposure;
uniform vec3 uLift; uniform float uGamma; uniform vec3 uGain; uniform float uSat; uniform float uVib; uniform float uVig; uniform vec3 uVigTint; uniform float uDither; uniform vec2 uRes;
${NEUTRAL}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec3 c = texture(tScene, vUv).rgb + texture(tBloom, vUv).rgb * uBloom;
  c *= uExposure;
  c = neutralTM(c);
  c = lgg(c, uLift, uGamma, uGain);
  c = satVib(c, uSat, uVib);
  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
  float v = smoothstep(0.35, 1.05, length(q) * 1.15) * uVig;
  c = mix(c, c * uVigTint * 0.78, v);
  c = toSRGB(clamp(c, 0.0, 1.0));
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0 * uDither;
  outColor = vec4(c, 1.0);
}`, { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.22 }, uExposure: { value: 1 }, uLift: { value: new THREE.Vector3() }, uGamma: { value: 1 }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 }, uVib: { value: 0 }, uVig: { value: 0.3 }, uVigTint: { value: new THREE.Vector3(1, 1, 1) }, uDither: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } });

  let bloom = BLOOM[tier] || BLOOM.medium, enabled = tier !== 'low', W = 4, H = 4;
  function setTier(t) { bloom = BLOOM[t] || BLOOM.medium; enabled = t !== 'low'; resize(W, H); }
  function resize(w, h) {
    W = Math.max(4, Math.round(w)); H = Math.max(4, Math.round(h));
    sceneRT.setSize(W, H);
    let mw = Math.max(2, Math.round(W / bloom.div)), mh = Math.max(2, Math.round(H / bloom.div));
    for (const m of mips) { m.setSize(mw, mh); mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1); }
    final.uniforms.uRes.value.set(W, H);
  }
  function setGrade(g) {
    const u = final.uniforms;
    u.uExposure.value = g.exposure; u.uLift.value.set(...g.lift); u.uGamma.value = g.gamma; u.uGain.value.set(...g.gain);
    u.uSat.value = g.sat; u.uVib.value = g.vib; u.uVig.value = g.vig; u.uVigTint.value.set(...g.vigTint); u.uDither.value = g.noDither ? 0 : 1;
  }
  const drawTo = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
  function render(scene, camera, { bloomOn = true } = {}) {
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);
    // bloom: prefilter + down chain, then additive up chain back to mips[0]
    prefilter.uniforms.tSrc.value = sceneRT.texture; prefilter.uniforms.uTexel.value.set(1 / W, 1 / H); prefilter.uniforms.uThreshold.value = bloom.threshold;
    drawTo(prefilter, mips[0]);
    for (let i = 1; i < mips.length; i++) { down.uniforms.tSrc.value = mips[i - 1].texture; down.uniforms.uTexel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height); drawTo(down, mips[i]); }
    up.uniforms.uRadius.value = bloom.radius;
    for (let i = mips.length - 1; i > 0; i--) { up.uniforms.tSrc.value = mips[i].texture; up.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height); drawTo(up, mips[i - 1]); }
    final.uniforms.tScene.value = sceneRT.texture; final.uniforms.tBloom.value = mips[0].texture; final.uniforms.uBloom.value = bloomOn ? bloom.strength : 0;
    drawTo(final, null);
  }
  function dispose() { sceneRT.dispose(); for (const m of mips) m.dispose(); for (const m of [prefilter, down, up, final]) m.dispose(); tri.dispose(); }
  setGrade(GRADE.editor);
  return { render, setGrade, setTier, resize, dispose, sceneTarget: sceneRT, get enabled() { return enabled; }, materials: [prefilter, down, up, final], quadScene: qScene, quadCam: qCam, quad };
}

// Low tier: no composer — tone map in the material shaders with Neutral + LGG + saturation.
export function installLowToneMapping(renderer, g) {
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `${NEUTRAL}
vec3 CustomToneMapping( vec3 color ) { color *= toneMappingExposure; color = neutralTM( color ); color = lgg( color, vec3(${g.lift.join(',')}), ${g.gamma.toFixed(3)}, vec3(${g.gain.join(',')}) ); return satVib( color, ${g.sat.toFixed(3)}, ${g.vib.toFixed(3)} ); }`);
  renderer.toneMapping = THREE.CustomToneMapping;
}
