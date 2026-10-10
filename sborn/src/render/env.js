// env.js — the generated studio environment (PMREM): sky-to-peach gradient dome, a 4×3 m key softbox at radiance 4.0,
//   a 1×5 m rim strip at 3.0 and a floor bounce disc; RoomEnvironment is the fallback.
// Exports: createStudioEnv(renderer) -> Texture (PMREM), studioScene().
// Invariants: built once at boot; emitters are MeshBasicMaterial with HDR colours (no lights), so the bake is cheap.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const deg = THREE.MathUtils.degToRad;
const dir = (az, el) => new THREE.Vector3(Math.sin(deg(az)) * Math.cos(deg(el)), Math.sin(deg(el)), Math.cos(deg(az)) * Math.cos(deg(el)));

export function studioScene() {
  const s = new THREE.Scene();
  const g = new THREE.SphereGeometry(20, 48, 24);
  const col = new Float32Array(g.attributes.position.count * 3);
  const top = new THREE.Color('#5FA8E8'), mid = new THREE.Color('#A9D6F5'), low = new THREE.Color('#FDE9D2'), c = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i) / 20;
    if (y > 0.1) c.copy(mid).lerp(top, Math.min(1, (y - 0.1) / 0.7)); else c.copy(low).lerp(mid, Math.max(0, (y + 0.1) / 0.2));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w, h, radiance, az, el, dist, tint = '#FFF4E8') => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(radiance), side: THREE.DoubleSide }));
    m.position.copy(dir(az, el).multiplyScalar(dist)); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(4, 3, 4.0, -40, 50, 6);                         // key softbox
  panel(1, 5, 3.0, 150, 25, 6, '#E2F0FF');              // rim strip
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#F6E6D8').multiplyScalar(0.9) }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = -1.5; s.add(disc);
  return s;
}
export function createStudioEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  let tex;
  try { tex = pm.fromScene(studioScene(), 0.02).texture; } catch { tex = pm.fromScene(new RoomEnvironment(), 0.04).texture; }
  pm.dispose();
  return tex;
}
