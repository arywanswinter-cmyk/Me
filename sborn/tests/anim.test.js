// anim.test.js — motion core: locomotion determinism, flight and gliding, idle life, emotes (items 9, 31, 32, 34).
// Exports: nothing (registers tests). Invariants: headless creatures from tools/sim.mjs (same modules as the game),
//   60 Hz fixed steps; limits from thresholds.js.
import { test, ok, near, T, metric } from './harness.js';
import * as THREE from 'three';
import { simCreature } from '../tools/sim.mjs';
import { FIXTURES } from '../src/catalog/fixtures.js';
import { STARTERS } from '../src/catalog/starters.js';
import { createIdle } from '../src/anim/idle.js';
import { createSprings } from '../src/anim/springs.js';
import { FLY_K } from '../src/anim/flight.js';

const DT = 1 / 60;
const finite = (rig) => rig.world.every((m) => m.elements.every(Number.isFinite));
const pelvisY = (s) => { const v = new THREE.Vector3(); s.rig.jointWorld(s.rig.pelvis, v); return v.y - s.minY; };

test('C09.loco-hash', 'state hash after 600 walking steps matches across two loads', { milestone: 5, items: [9] }, () => {
  const run = () => { const s = simCreature(STARTERS.trundle); s.loco.setMove(0.3, 1, 1, false); for (let i = 0; i < T.stateHashSteps; i++) s.loco.step(DT); return s.loco.stateHash(); };
  const a = run(), b = run();
  ok(a === b, `hashes differ ${a} ${b}`);
  return `hash ${a.toString(16)}`;
});

test('C32.flight', 'Flapjack flies and lands with a flare; gliders never climb and descend at 1/(1+Glide); wingless falls back', { milestone: 5, items: [32] }, () => {
  const notes = [];
  // canFly only for Flapjack and the flier fixture
  const fliers = [];
  for (const [n, r] of [...Object.entries(FIXTURES), ...Object.entries(STARTERS)]) { const s = simCreature(r); if (s.flight.canFly) fliers.push(n); }
  ok(fliers.sort().join() === 'flapjack,flier', `canFly: ${fliers.join(',')}`);
  notes.push(`canFly ${fliers.join('+')} (K ${FLY_K})`);
  // Flapjack: F, hold W 600 steps
  const f = simCreature(STARTERS.flapjack);
  ok(f.loco.toggleFly() === 'fly', 'F did not take off');
  f.loco.setMove(0, 1, 1, false);
  let high = 0;
  for (let i = 0; i < T.flyHoldSteps; i++) { f.loco.step(DT); if (pelvisY(f) >= T.flyAboveM) high++; ok(finite(f.rig), 'NaN in flight'); }
  ok(high >= T.flyAboveSteps, `root ≥ 1 m for ${high} steps`);
  f.loco.setMove(0, 0, 0); f.loco.toggleFly();
  let land = -1;
  for (let i = 0; i < T.landSteps; i++) { f.loco.step(DT); if (!f.loco.state.air) { land = i; break; } }
  ok(land >= 0, 'did not land within 300 steps');
  f.loco.step(DT);
  ok(f.loco.legs.every((l) => l.planted), 'not all legs planted after landing');
  const flare = f.loco.metrics.lastLanding.flareDeg;
  ok(flare >= T.flareDeg, `flare ${flare}°`);
  notes.push(`flapjack ${high}/600 above 1 m, landed in ${land} steps, flare ${flare}°`);
  // glider: Peepsy (Flutter Nubs) after jump + F
  const g = simCreature(STARTERS.peepsy, { stats: { Glide: 0 } });
  g.loco.setMove(0, 1, 1, false); for (let i = 0; i < 60; i++) g.loco.step(DT);
  g.loco.jump();
  for (let i = 0; i < 30 && g.loco.state.air.vy > 0; i++) g.loco.step(DT);
  ok(g.loco.toggleFly() === 'glide', 'F did not glide');
  const A = g.loco.state.air, apex = A.apex;
  let maxY = 0, x0 = Math.hypot(g.loco.state.x, g.loco.state.z), y0 = A.y, x1 = x0, y1 = y0, steps = 0;
  while (g.loco.state.air && steps < 2000) { g.loco.step(DT); steps++; if (g.loco.state.air) { maxY = Math.max(maxY, g.loco.state.air.y); x1 = Math.hypot(g.loco.state.x, g.loco.state.z); y1 = g.loco.state.air.y; } ok(finite(g.rig), 'NaN gliding'); }
  ok(maxY <= apex + 1e-9, `climbed above the apex ${maxY} > ${apex}`);
  const slope = (y0 - y1) / Math.max(1e-6, x1 - x0), want = 1 / (1 + 0);
  ok(Math.abs(slope - want) <= T.glideSlopeTol * want, `glide slope ${slope.toFixed(3)} vs ${want}`);
  notes.push(`peepsy glide slope ${slope.toFixed(3)}`);
  // wingless: fallback, grounded within 120 steps
  const w = simCreature(STARTERS.trundle);
  ok(w.loco.toggleFly() === 'fallback', 'wingless F is not the fallback');
  let gr = -1; for (let i = 0; i < T.winglessGroundSteps; i++) { w.loco.step(DT); if (!w.loco.state.air) { gr = i; break; } }
  ok(gr >= 0, 'wingless not grounded within 120 steps');
  notes.push(`trundle fallback grounded in ${gr}`);
  metric('flight', { fliers, high, land, flare, slope, wingless: gr });
  return notes.join('; ');
});

test('C34.idle', '1,800 idle steps: ≥ 5 blinks of 70/30/110 ms ± 1 step; chest 0.012 ± 0.003 over 3.2 ± 0.2 s; eyes reach a 20° target within 10° in 30 steps; tail tip std ≥ 2 mm', { milestone: 5, items: [34] }, () => {
  const s = simCreature(STARTERS.trundle), idle = createIdle(7), sp = createSprings(s.rig, s.shape);
  s.rig.toRest(); s.rig.fk(); sp.reset();
  const chest = [], tail = [], closedLog = [];
  const tailChain = sp.chains.findIndex((c) => s.shape.sockets.some((q) => q.bone === c.b[0] && q.t.startsWith('tail.')));
  ok(tailChain >= 0, 'no tail chain');
  const head = new THREE.Vector3(); s.rig.jointWorld(s.shape.vertebrae.length - 1, head);
  const look = head.clone().add(new THREE.Vector3(0, 0, 2));
  for (let i = 0; i < T.idleSteps; i++) {
    s.rig.toRest(); idle.step(DT, s.rig, s.shape, look); s.rig.fk(); sp.step(DT); s.rig.fk();
    chest.push(idle.breath()); tail.push(sp.chains[tailChain].pts[2].x.clone()); closedLog.push(idle.state.closedAmt);
  }
  // blinks
  // blinks: segment the lid curve into close / hold / open runs (steps), each within ± 1 step of 70/30/110 ms
  const lids = closedLog, segs = [];
  for (let i = 0; i < lids.length; i++) {
    if (lids[i] <= 0) continue;
    let j = i; const seg = [0, 0, 0]; let ph = 0;
    while (j < lids.length && lids[j] > 0) { if (lids[j] >= 1) { ph = 1; seg[1]++; } else if (ph === 0) seg[0]++; else { ph = 2; seg[2]++; } j++; }
    segs.push(seg); i = j;
  }
  const log = segs;
  ok(log.length >= T.blinks, `${log.length} blinks`);
  for (const b of log) for (let k = 0; k < 3; k++) ok(Math.abs(b[k] - T.blinkMs[k] / (DT * 1000)) <= T.blinkTolSteps + 1e-9, `blink phases ${b.join('/')} steps`);
  // chest: half range and period (zero crossings of the mean-removed signal)
  const mx = Math.max(...chest), mn = Math.min(...chest), half = (mx - mn) / 2, mean = (mx + mn) / 2;
  near(half, T.chestHalfRange, T.chestTol, 'chest half-range');
  const ups = []; for (let i = 1; i < chest.length; i++) if (chest[i - 1] < mean && chest[i] >= mean) ups.push(i);
  const per = ups.length > 1 ? (ups[ups.length - 1] - ups[0]) / (ups.length - 1) * DT : 0;
  near(per, T.breathPeriodS, T.breathPeriodTol, 'breath period');
  // tail tip std
  const m = tail.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / tail.length);
  const sd = Math.sqrt(tail.reduce((a, v) => a + v.distanceToSquared(m), 0) / tail.length);
  ok(sd >= T.tailStdM, `tail tip std ${(sd * 1000).toFixed(2)} mm`);
  // eyes: a target 20° off-axis; within 10° after 30 steps
  const eyes = s.shape.sockets.filter((q) => q.bones.ball !== undefined);
  // the target: 2 m from the head, 20° off the creature's forward axis
  const off = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(T.eyeTargetDeg));
  const tgt = head.clone().addScaledVector(off, 2);
  for (let i = 0; i < T.eyeSteps; i++) { s.rig.toRest(); idle.step(DT, s.rig, s.shape, tgt); s.rig.fk(); }
  let worst = 0; const each = [];
  for (const e of eyes) { const a = idle.eyeAngles ? idle.eyeAngles(s.rig, s.shape, tgt).find((x) => x.bone === e.bones.ball) : null; if (a) { worst = Math.max(worst, a.deg); each.push(a.deg.toFixed(1)); } }
  ok(worst <= T.eyeWithinDeg, `eyes ${each.join("/")}° from the target`);
  metric('idle', { blinks: log.length, half, per, tailStdMm: sd * 1000, eyeDeg: worst });
  return `${log.length} blinks, chest ±${half.toFixed(4)} period ${per.toFixed(2)} s, tail std ${(sd * 1000).toFixed(1)} mm, eyes ${worst.toFixed(1)}°`;
});

test('C31.emotes', 'every emote × fixture and starter, 180 steps: no NaN, foot penetration < 1 cm; legless, mouthless, wingless and lidless variants', { milestone: 5, items: [31] }, async () => {
  const { createEmotes } = await import('../src/anim/emotes.js');
  const { PART } = await import('../src/catalog/parts.js');
  const names = ['dance', 'roar', 'sit', 'sleep', 'wave', 'eat', 'fly'];
  const variants = {};
  let worstPen = 0, runs = 0;
  const v = new THREE.Vector3();
  for (const [n, r] of [...Object.entries(FIXTURES), ...Object.entries(STARTERS)]) {
    for (const e of names) {
      const s = simCreature(r);
      const em = createEmotes(s, s.loco, { partDefs: PART }); s.loco.emotes = em;
      for (let i = 0; i < 20; i++) s.loco.step(DT);
      const id = em.play(e); variants[`${n}:${e}`] = id;
      for (let i = 0; i < T.emoteSteps; i++) {
        s.loco.step(DT);
        for (const l of s.loco.legs) if (l.planted) { s.loco.contact(l, v); worstPen = Math.max(worstPen, -v.y); }
      }
      ok(finite(s.rig), `${n} ${e}: NaN`);
      runs++;
    }
  }
  ok(worstPen < T.emotePenetrationM, `foot penetration ${(worstPen * 1000).toFixed(1)} mm`);
  // variants
  ok(variants['snake:dance'] === 'dance-swave' && variants['snake:sit'] === 'sit-coil' && variants['snake:wave'] !== 'wave-arm', `legless variants ${variants['snake:dance']} ${variants['snake:sit']} ${variants['snake:wave']}`);
  const mouthless = { ...STARTERS.bloop, parts: STARTERS.bloop.parts.filter((p) => !p.t.startsWith('mouth.')) };
  const sm = simCreature(mouthless), em = createEmotes(sm, sm.loco, { partDefs: PART });
  ok(em.choose('roar').id === 'roar-puff' && em.choose('eat').id === 'eat-squash', 'mouthless variants');
  ok(variants['trundle:fly'] === 'fly-fallback' && variants['flapjack:fly'] === 'fly', `fly variants ${variants['trundle:fly']} ${variants['flapjack:fly']}`);
  ok(variants['hexapod:sleep'] === 'sleep-squash', `lidless sleep ${variants['hexapod:sleep']}`);
  metric('emotes', { runs, worstPenMm: worstPen * 1000, variants });
  return `${runs} runs, worst penetration ${(worstPen * 1000).toFixed(2)} mm`;
});
