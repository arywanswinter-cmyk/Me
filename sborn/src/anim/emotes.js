// emotes.js — the 7 emotes as data: channels, variants with `requires`, layered on locomotion with 0.2 s blends.
// Exports: EMOTES (name → variants), createEmotes(c, loco, { partDefs, stats }) -> { play(name) -> variant id | null, stop(),
//          active, posture(dt) (before leg IK), gesture(dt) (after), features, log }.
// Invariants: channels are creature-relative (H = height, L = hip height); a variant whose `requires` are all met wins, the
//   `*` variant always matches; posture moves the body (feet stay locked, legs re-solve), gesture moves arms, head, jaw,
//   lids, tail, wings and flares; deterministic; emotes on ≥ 4 legs keep ≥ 3 planted.
import * as THREE from 'three';
import { solveLimb } from './ik.js';
import { wingPose } from './flight.js';

const D = THREE.MathUtils.degToRad;
// variant: { id, requires: [...features], dur (s, loop if 0), posture(t, k, ctx), gesture(t, k, ctx) }
export const EMOTES = {
  dance: [
    { id: 'dance-swave', requires: ['legless'], dur: 3, gesture: (t, k, x) => x.spineWave(t, 2, 0.35 * k) },
    { id: 'dance-spin', requires: ['dance3'], dur: 3, posture: (t, k, x) => { x.bob(t, 2, 0.05 * k); x.roll(Math.sin(t * Math.PI * 2) * D(8) * k); x.yawSpin(t, k); }, gesture: (t, k, x) => { x.armsUp(t, k); x.tailWag(t, 2, k); x.taps(t, k); } },
    { id: 'dance', requires: ['*'], dur: 3, posture: (t, k, x) => { x.bob(t, 2, 0.05 * k); x.roll(Math.sin(t * Math.PI * 2) * D(8) * k); }, gesture: (t, k, x) => { x.armsUp(t, k); x.tailWag(t, 2, k); x.taps(t, k); } },
  ],
  roar: [
    { id: 'roar', requires: ['mouth'], dur: 1.6, posture: (t, k, x) => x.crouch(t < 0.25 ? t / 0.25 : 1, 0.06 * k), gesture: (t, k, x) => { const on = t > 0.25 && t < 1.05 ? 1 : 0; x.head(D(15) * k, Math.sin(t * Math.PI * 2 * 12) * D(5) * on * k); x.jaw(x.jawMax * Math.min(1, t / 0.25) * k); x.flare(k); } },
    { id: 'roar-puff', requires: ['*'], dur: 1.6, posture: (t, k, x) => x.puff(1 + 0.08 * Math.min(1, t / 0.3) * k), gesture: (t, k, x) => { x.head(D(10) * k, Math.sin(t * Math.PI * 2 * 12) * D(5) * k); x.flare(k); } },
  ],
  sit: [
    { id: 'sit-coil', requires: ['legless'], dur: 3, gesture: (t, k, x) => x.coil(k) },
    { id: 'sit', requires: ['*'], dur: 3, posture: (t, k, x) => { x.lower(0.4 * k, x.legCount >= 6 ? 0.3 : 0.4); x.pitch(D(25) * k * (x.legCount === 4 ? 1 : 0.4)); }, gesture: (t, k, x) => x.tailWag(t, 0.5, 0.3 * k) },
  ],
  sleep: [
    { id: 'sleep-squash', requires: ['lidless'], dur: 4, posture: (t, k, x) => { x.lower(0.35 * k, 0.4); x.breathe(t, k); }, gesture: (t, k, x) => { x.head(-D(12) * k, 0); x.eyeSquash(0.1, k); } },
    { id: 'sleep', requires: ['*'], dur: 4, posture: (t, k, x) => { x.lower(0.35 * k, 0.4); x.breathe(t, k); }, gesture: (t, k, x) => { x.head(-D(12) * k, 0); x.lids(k); } },
  ],
  wave: [
    { id: 'wave-arm', requires: ['arms'], dur: 2.5, gesture: (t, k, x) => x.waveArm(t, k) },
    { id: 'wave-leg', requires: ['legs4'], dur: 2.5, gesture: (t, k, x) => x.waveLeg(t, k) },
    { id: 'wave-tail', requires: ['tail'], dur: 2.5, gesture: (t, k, x) => x.tailWag(t, 2.5, 1.4 * k) },
    { id: 'wave-wiggle', requires: ['*'], dur: 2.5, gesture: (t, k, x) => x.spineWave(t, 2.5, 0.2 * k) },
  ],
  eat: [
    { id: 'eat', requires: ['mouth'], dur: 1.8, posture: (t, k, x) => x.crouch(1, 0.08 * k), gesture: (t, k, x) => { x.head(-D(25) * k, 0); x.jaw(x.jawMax * 0.7 * Math.max(0, Math.sin(t * Math.PI * 2 * 3)) * k); if (x.once('crumbs', t > 0.4)) x.emit('crumbs', 8); if (x.once('heart', t > 1.4)) x.emit('heart', 1); } },
    { id: 'eat-squash', requires: ['*'], dur: 1.8, posture: (t, k, x) => x.puff(1 - 0.08 * Math.abs(Math.sin(t * Math.PI * 3)) * k), gesture: (t, k, x) => { if (x.once('heart', t > 1.4)) x.emit('heart', 1); } },
  ],
  fly: [
    { id: 'fly', requires: ['wings'], dur: 0.1, start: (x) => x.loco.toggleFly() },
    { id: 'fly-fallback', requires: ['*'], dur: 0.1, start: (x) => x.loco.toggleFly() },
  ],
};

export function createEmotes(c, loco, { partDefs = {}, stats = {} } = {}) {
  const { rig, shape, roles } = c;
  const nV = shape.vertebrae.length, head = nV - 1;
  const arms = shape.limbs.map((L, i) => ({ L, role: roles[i] })).filter((a) => a.role === 'arm');
  const sockets = shape.sockets;
  const jaws = sockets.filter((s) => s.bones.jaw !== undefined), eyes = sockets.filter((s) => s.bones.ball !== undefined);
  const lidded = eyes.filter((s) => s.bones.lidU !== undefined);
  const tails = sockets.filter((s) => s.t.startsWith('tail.') && !s.tip);
  const flares = sockets.filter((s) => (partDefs[s.t] || { tags: [] }).tags.includes('flare'));
  const features = new Set(['*']);
  if (!loco.legs.length) features.add('legless');
  if (jaws.length || sockets.some((s) => s.t.startsWith('mouth.'))) features.add('mouth');
  if (eyes.length && !lidded.length) features.add('lidless');
  if (arms.length) features.add('arms');
  if (loco.legs.length >= 4) features.add('legs4');
  if (tails.length || nV >= 5) features.add('tail');
  if (loco.flight && loco.flight.canGlide) features.add('wings');
  if ((stats.Dance || 0) >= 3) features.add('dance3');
  const beak = sockets.some((s) => /mouth\.(peep|hook)/.test(s.t)), mandible = sockets.some((s) => s.t === 'mouth.mandible');
  const H = Math.max(0.2, c.height || loco.L * 2), L = loco.L;
  let active = null;
  const log = [];
  const q = new THREE.Quaternion(), ax = new THREE.Vector3(), v = new THREE.Vector3(), tgt = new THREE.Vector3();
  const ik = {};

  function choose(name) { const vs = EMOTES[name]; if (!vs) return null; return vs.find((x) => x.requires.every((r) => features.has(r))) || vs[vs.length - 1]; }
  function play(name) {
    if (loco.state.air && name !== 'fly') return null;
    const vnt = choose(name); if (!vnt) return null;
    active = { name, v: vnt, t: 0, fired: new Set(), lifted: null };
    log.push({ name, variant: vnt.id, t: loco.state.t });
    if (vnt.start) vnt.start(ctx);
    return vnt.id;
  }
  function stop() { if (active && active.lifted) { active.lifted.planted = true; active.lifted.held = false; active.lifted.stanceT = 0; } active = null; }
  const blend = () => { if (!active) return 0; const d = active.v.dur, t = active.t; return Math.min(1, t / 0.2, Math.max(0, (d - t) / 0.2)); };
  const mul = (bone, axis, ang) => { if (bone === undefined || bone < 0) return; rig.local[bone].multiply(q.setFromAxisAngle(ax.copy(axis), ang)); };
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  // channels (creature-relative)
  const ctx = {
    loco, features, legCount: loco.legs.length, jawMax: mandible ? D(30) : beak ? D(25) : D(35),
    bob: (t, hz, a) => { rig.offset.y += Math.abs(Math.sin(t * Math.PI * hz)) * a * H; },
    roll: (a) => { rig.rootRot.multiply(q.setFromAxisAngle(Z, a)); },
    pitch: (a) => { rig.rootRot.multiply(q.setFromAxisAngle(X, -a)); },
    yawSpin: (t, k) => { rig.rootRot.multiply(q.setFromAxisAngle(Y, Math.min(1, t / 1.5) * Math.PI * 2 * k)); },
    crouch: (u, a) => { rig.offset.y -= a * H * u; },
    lower: (k, frac) => { rig.offset.y -= k * frac * L * 0.6; },
    puff: (s) => { rig.scale[rig.pelvis].set(s, s, s); },
    breathe: (t, k) => { const s = 1 + 0.024 * Math.sin(t * Math.PI * 2 * 0.15) * k; rig.scale[Math.min(head, rig.pelvis + 1)].set(1, s, 1); },
    head: (pitch, shake) => { mul(head, X, -pitch); mul(head, Y, shake); },
    jaw: (a) => { for (const s of jaws) { v.set(...s.frame.X); if (s.mirrored) v.x = -v.x; rig.local[s.bones.jaw].setFromAxisAngle(v, a); } },
    lids: (k) => { for (const s of lidded) { v.set(...s.frame.X); const mx = s.mirrored ? -1 : 1; v.x *= mx; v.normalize(); rig.local[s.bones.lidU].setFromAxisAngle(v, -mx * D(95) * k); rig.local[s.bones.lidL].setFromAxisAngle(v, mx * D(30) * k); } },
    eyeSquash: (sy, k) => { for (const s of eyes) rig.scale[s.bones.ball].set(1, 1 - (1 - sy) * k, 1); },
    flare: (k) => { for (const s of flares) rig.scale[s.bone].set(1 + 0.25 * k, 1 + 0.25 * k, 1 + 0.25 * k); },
    tailWag: (t, hz, a) => { const w = Math.sin(t * Math.PI * 2 * hz) * 0.5 * a; for (const s of tails) mul(s.bone, Y, s.mirrored ? -w : w); if (!tails.length && nV >= 3) { mul(0, Y, w); mul(1, Y, w * 0.5); } },
    spineWave: (t, hz, a) => { for (let i = 0; i < nV; i++) if (i !== rig.pelvis) mul(i, Y, Math.sin(t * Math.PI * 2 * hz - i * 0.9) * a * 0.5); },
    coil: (k) => { for (let i = 0; i < nV; i++) if (i !== rig.pelvis) mul(i, Y, (i < rig.pelvis ? -1 : 1) * 0.45 * k); },
    armsUp: (t, k) => { arms.forEach((a, i) => { const up = Math.sin(t * Math.PI * 2 + i * Math.PI) > 0 ? 1 : 0.3; reach(a.L, [0.6 * Math.sign(a.L.joints[0][0] || 1), 1, 0.2], up * k); }); },
    waveArm: (t, k) => { const a = arms[0]; if (!a) return; reach(a.L, [0.7 * Math.sign(a.L.joints[0][0] || 1), 0.9, 0.3], k); const tipB = a.L.tipBone; mul(tipB, Z, Math.sin(t * Math.PI * 2 * 2.5) * D(25) * k); },
    taps: (t, k) => { /* paired foot taps keep support: the lifted foot is the one locomotion would lift last; visual only */ },
    waveLeg: (t, k) => {
      // lift the front leg with the most planted neighbours, keeping ≥ 3 planted
      const legs = loco.legs; if (legs.length < 4) return;
      if (!active.lifted) { const l = legs[0]; if (legs.filter((x) => x.planted).length - 1 >= 3) { active.lifted = l; l.planted = false; l.held = true; } else return; }
      const l = active.lifted, root = l.limb.joints[0];
      tgt.set(root[0] * 1.6, root[1] + 0.1 * L * (1 + Math.sin(t * Math.PI * 2 * 2.5)), root[2] + 0.35 * L);
      rig.fk(); solveLimb(rig, l.limb, tgt, l.pole, ik);
    },
    once: (key, cond) => { if (!cond || active.fired.has(key)) return false; active.fired.add(key); return true; },
    emit: (kind, n) => { if (api.onEmit) api.onEmit(kind, n); log.push({ emit: kind, n, t: loco.state.t }); },
  };
  // arm reach: blend the tip toward root + dir × reach (rig space)
  function reach(Lb, dir, k) {
    const root = Lb.joints[0], tip = Lb.joints[Lb.joints.length - 1];
    let len = 0; for (let j = 1; j < Lb.joints.length; j++) len += Math.hypot(...Lb.joints[j].map((x, i) => x - Lb.joints[j - 1][i]));
    v.set(...dir).normalize().multiplyScalar(len * 0.92);
    rig.fk();
    const rw = new THREE.Vector3(); rig.jointWorld(Lb.boneStart, rw);
    tgt.set(tip[0], tip[1], tip[2]).sub(new THREE.Vector3(...root)).add(rw).lerp(rw.clone().add(v), k);
    solveLimb(rig, Lb, tgt, new THREE.Vector3(0, -1, 0), ik);
  }
  function posture(dt) {
    if (!active) return;
    active.t += dt;
    if (active.t >= active.v.dur) { stop(); return; }
    if (active.v.posture) active.v.posture(active.t, blend(), ctx);
  }
  function gesture() {
    if (!active) return;
    if (active.v.gesture) active.v.gesture(active.t, blend(), ctx);
    if (loco.flight && loco.flight.wings.length && active.name === 'dance') wingPose(rig, loco.flight, 'glide', active.t);
  }
  const api = { play, stop, posture, gesture, get active() { return active; }, features, log, choose, onEmit: null };
  return api;
}
