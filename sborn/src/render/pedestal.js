// pedestal.js — the glowing turntable the creature stands on in the editor.
// Exports: createPedestal() -> { group, top, pulse(), update(dt), R, H }.
// Invariants: the top surface is exactly Y = 0 (creatures stand on it); the rim glow decays back to 2.4
//   within 600 ms of a pulse; one draw per piece, no per-frame allocation.
import * as THREE from 'three';

export const PED_R = 1.4, PED_H = 0.18, PED_BEVEL = 0.04;

export function createPedestal() {
  const group = new THREE.Group();
  group.name = 'pedestal';
  // Lathe profile: inner top → bevel → side → base, built from the centre outwards.
  const pts = [];
  pts.push(new THREE.Vector2(0, 0));
  const ringN = 28;
  for (let i = 1; i <= ringN; i++) pts.push(new THREE.Vector2((PED_R - PED_BEVEL) * i / ringN, 0));
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * Math.PI / 2;
    pts.push(new THREE.Vector2(PED_R - PED_BEVEL + Math.sin(a) * PED_BEVEL, -PED_BEVEL + Math.cos(a) * PED_BEVEL));
  }
  pts.push(new THREE.Vector2(PED_R, -PED_H + 0.02));
  pts.push(new THREE.Vector2(PED_R - 0.03, -PED_H));
  pts.push(new THREE.Vector2(0, -PED_H));
  // LatheGeometry spins around Y; reverse so normals face outwards.
  const geo = new THREE.LatheGeometry(pts.slice().reverse(), 96);
  geo.computeVertexNormals();
  const n = geo.attributes.position.count, col = new Float32Array(n * 3);
  const cA = new THREE.Color('#F3F0FA'), cB = new THREE.Color('#EDE6FF'), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = geo.attributes.position.getX(i), y = geo.attributes.position.getY(i), z = geo.attributes.position.getZ(i);
    const r = Math.hypot(x, z);
    c.copy(cA).lerp(cB, Math.min(1, r / PED_R));
    // engraved rings at 0.45 R and 0.8 R (vertex rings land exactly on them)
    if (y > -0.001 && (Math.abs(r - 0.45 * PED_R) < 0.03 || Math.abs(r - 0.8 * PED_R) < 0.03)) c.multiplyScalar(0.92);
    if (y < -0.001) c.multiplyScalar(0.9);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const top = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }));
  top.receiveShadow = true;
  top.name = 'pedestal-top';
  group.add(top);

  // Emissive rim band just under the bevel.
  const rimColor = new THREE.Color('#7FE7FF');
  const rimMat = new THREE.MeshBasicMaterial({ color: rimColor.clone().multiplyScalar(2.4) });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(PED_R + 0.004, PED_R + 0.004, 0.035, 96, 1, true), rimMat);
  rim.position.y = -0.075;
  group.add(rim);

  // Additive under-glow, 2.2 R.
  const gc = document.createElement('canvas');
  gc.width = gc.height = 128;
  const g = gc.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(166,233,255,1)'); grd.addColorStop(0.55, 'rgba(166,233,255,0.55)'); grd.addColorStop(1, 'rgba(166,233,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(gc);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2 * PED_R * 2, 2.2 * PED_R * 2),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -PED_H + 0.003;
  glow.renderOrder = -4;
  group.add(glow);

  // Shockwave ring for placements.
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96),
    new THREE.MeshBasicMaterial({ color: rimColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  wave.rotation.x = -Math.PI / 2;
  wave.position.y = -0.07;
  group.add(wave);

  let pulseT = 9;
  function pulse() { pulseT = 0; }
  function update(dt) {
    pulseT += dt;
    // 4.0 for 120 ms, then decay to 2.4 over 600 ms
    const k = pulseT < 0.12 ? 1 : Math.max(0, 1 - (pulseT - 0.12) / 0.6);
    rimMat.color.copy(rimColor).multiplyScalar(2.4 + 1.6 * k);
    const w = Math.min(1, pulseT / 0.6);
    wave.scale.setScalar(PED_R * (1 + 0.4 * w));
    wave.material.opacity = pulseT < 0.6 ? 0.6 * (1 - w) : 0;
  }
  update(0);
  return { group, top, rim, glow, pulse, update, R: PED_R, H: PED_H };
}
