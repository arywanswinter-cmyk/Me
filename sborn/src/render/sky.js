// sky.js — the editor's soft studio sky dome and the floor that melts into it.
// Exports: createSky() -> { group, dome, floor, setPool(x, y, z) }.
// Invariants: no horizon line (the floor fades into the sky colour between 8 and 14 m); dithered so the
//   gradient never bands; colours are sRGB hex converted once, shaders take uniforms only.
import * as THREE from 'three';

const TOP = '#5FA8E8', MID = '#A9D6F5', LOW = '#FDE9D2';

const SKY_VS = /* glsl */`
varying vec3 vDir;
varying vec4 vClip;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vClip = p;
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */`
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uPool; uniform float uPoolAmt;
varying vec3 vDir;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = h > 0.12 ? mix(uMid, uTop, smoothstep(0.12, 0.75, h)) : mix(uLow, uMid, smoothstep(-0.05, 0.12, h));
  // a soft light pool behind the creature
  float pool = pow(max(dot(d, normalize(uPool)), 0.0), 6.0) * uPoolAmt;
  c = mix(c, vec3(1.0, 0.97, 0.93), pool * 0.35);
  // faint wisps
  float w = n2(vec2(atan(d.z, d.x) * 3.0, h * 9.0)) * n2(vec2(atan(d.z, d.x) * 7.0 + 3.0, h * 17.0));
  c += vec3(0.035) * smoothstep(0.25, 0.7, w) * smoothstep(0.05, 0.3, h) * (1.0 - smoothstep(0.5, 0.9, h));
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FLOOR_FS = /* glsl */`
uniform vec3 uLow; uniform vec3 uMid; uniform vec3 uFloor;
varying vec3 vW;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  float r = length(vW.xz);
  vec3 c = mix(uFloor, uLow, smoothstep(2.0, 8.0, r));
  float a = 1.0 - smoothstep(8.0, 14.0, r);
  c += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky() {
  const lin = (hex) => new THREE.Color(hex);
  const group = new THREE.Group();
  group.name = 'sky';
  const domeMat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: lin(TOP) }, uMid: { value: lin(MID) }, uLow: { value: lin(LOW) },
      uPool: { value: new THREE.Vector3(0, 0.25, -1) }, uPoolAmt: { value: 1 } },
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, toneMapped: true,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);

  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uLow: { value: lin(LOW) }, uMid: { value: lin(MID) }, uFloor: { value: lin('#F6E6D8') } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: FLOOR_FS, transparent: true, depthWrite: false,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(15, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.18;
  floor.renderOrder = -5;
  group.add(floor);

  function setPool(x, y, z) { domeMat.uniforms.uPool.value.set(x, y, z); }
  return { group, dome, floor, setPool };
}
