// flight.js — the flight rule and wing poses.
// Exports: FLY_K, flightInfo(shape, partDefs, volume) -> { area, ratio, canFly, canGlide, wings: [{bone, mirrored, span, mode}] },
//          wingPose(rig, info, mode, t, flare) (writes wing socket local rotations), meshVolume(position, index).
// Invariants: a creature flies when Σ wing area ÷ body volume^(2/3) ≥ FLY_K (calibrated on the fixtures and starters so only
//   Flapjack and the flier fixture fly; see DECISIONS), otherwise any wing glides; flap rate clamp(2.5·√(0.5/span), 1.2, 6) Hz
//   (buzz 12 Hz), stroke +45°/−30° with a 45% downstroke, glide 8° dihedral ±2°, rest folded back 70°.
import * as THREE from 'three';
import { buildPart } from '../parts/builders.js';

export const FLY_K = 1.2;
const D = THREE.MathUtils.degToRad;

export function meshVolume(P, I) {
  let v = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  return Math.abs(v / 6);
}

export function flightInfo(shape, partDefs, volume) {
  const wings = [];
  let area = 0;
  for (const s of shape.sockets) {
    const def = partDefs[s.t];
    if (!def || def.group !== 'wing') continue;
    const b = buildPart(s.t, { ...(def.params || {}), ...s.p }, 0, s.size);
    const w = b && b.wing ? b.wing : { span: s.size * 3, area: s.size * s.size * 4 };
    area += w.area;
    const mode = def.tags.includes('buzz') ? 'buzz' : def.tags.includes('glide') && !def.tags.includes('flap') ? 'glide' : 'flap';
    wings.push({ bone: s.bone, mirrored: !!s.mirrored, span: w.span, mode, frame: s.frame });
  }
  const ratio = volume > 0 ? area / Math.pow(volume, 2 / 3) : 0;
  const flapper = wings.some((w) => w.mode !== 'glide');
  return { area, ratio, canFly: flapper && ratio >= FLY_K, canGlide: wings.length > 0, wings };
}

// mode: 'rest' (folded back 70°), 'flap', 'glide', 'flare' (+30°); t in seconds; strength 0..1 blends from rest
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), ax = new THREE.Vector3();
export function wingPose(rig, info, mode, t, { big = false } = {}) {
  for (const w of info.wings) {
    const sgn = w.mirrored ? -1 : 1;
    let roll = 0, fold = 0;
    if (mode === 'rest') fold = D(70);
    else if (mode === 'flap') {
      const hz = w.mode === 'buzz' ? 12 : Math.min(6, Math.max(1.2, 2.5 * Math.sqrt(0.5 / Math.max(0.05, w.span))));
      const u = (t * hz) % 1, down = 0.45;
      // up +45°, down −30°: downstroke over 45% of the cycle (smooth cosine segments)
      const a = u < down ? 0.5 + 0.5 * Math.cos(Math.PI * u / down) : 0.5 - 0.5 * Math.cos(Math.PI * (u - down) / (1 - down));
      roll = D(-30) + (D(45) - D(-30)) * a;
      if (big) roll *= 1.25;
    } else if (mode === 'glide') roll = D(8) + D(2) * Math.sin(t * 2 * Math.PI * 0.7);
    else if (mode === 'flare') { roll = D(20); fold = D(-30); }
    // roll about the body's forward axis (z), fold about the up axis (y); mirrored twins mirror both
    q1.setFromAxisAngle(ax.set(0, 0, 1), sgn * roll);
    q2.setFromAxisAngle(ax.set(0, 1, 0), -sgn * fold);
    rig.local[w.bone].copy(q2).multiply(q1);
  }
}
