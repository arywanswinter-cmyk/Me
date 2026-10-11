// audio.test.js — the runtime audio engine (items 51, 52, 53) rendered offline: loops, UI ticks, roars by size, footsteps.
// Exports: nothing (registers tests). Invariants: OfflineAudioContext 48 kHz, 10 s, jitter off; the manifest and report are
//   the files the game ships (audio/audio-manifest.json, tools/audio-out/report.json).
import { test, ok } from './harness.js';
import { createAudio } from '../src/audio/engine.js';
import { fnv1a } from '../src/core/hash.js';

const getJSON = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); };

test('C51.manifest', 'audio-manifest.json lists all 85 ids, each with a generated variant or listed as a placeholder in report.json and audio.status()', { milestone: 9, items: [51] }, async () => {
  const man = await getJSON('audio/audio-manifest.json'), rep = await getJSON('tools/audio-out/report.json');
  const ids = Object.keys(man.ids);
  ok(ids.length === 85, `${ids.length} ids`);
  const A = createAudio({ test: true }); const st = await A.loadManifest(man);
  let gen = 0, ph = 0;
  for (const id of ids) {
    const v = man.ids[id].variants || [], r = rep.ids[id];
    ok(r, `${id} missing from report.json`);
    if (v.length) { gen++; ok(v.every((x) => x.checks !== undefined || x.processed === false), `${id} variant unchecked`); ok(!r.placeholder, `${id} generated but reported as placeholder`); }
    else { ph++; ok(r.placeholder === true, `${id} has no variant and is not listed as a placeholder`); }
  }
  ok(st.generated === gen && st.placeholder === ph, `status ${JSON.stringify(st)} vs manifest ${gen}/${ph}`);
  ok(rep.summary.generated === gen && rep.summary.placeholder === ph, 'report summary differs');
  return `${ids.length} ids · ${gen} generated · ${ph} placeholder (status ${JSON.stringify(st)})`;
});

test('C52.case', 'Case A files pass the checks; Case B: zero elevenlabs entries (item 52 is NA)', { milestone: 9, items: [52] }, async () => {
  const man = await getJSON('audio/audio-manifest.json');
  const all = Object.values(man.ids).flatMap((e) => e.variants || []);
  const el = all.filter((v) => v.source === 'elevenlabs');
  if (!all.length) { ok(el.length === 0, 'elevenlabs entries in Case B'); return 'Case B: NA — 0 elevenlabs entries'; }
  const bad = el.filter((v) => v.checks && v.checks.length);
  ok(!bad.length, `${bad.length} variants flagged: ${bad.slice(0, 3).map((v) => v.file + ' ' + v.checks.join('+')).join('; ')}`);
  return `Case A: ${el.length} variants, all checks clean`;
});

test('C53.offline', 'offline render (48 kHz, 10 s, jitter off): loops from 0, 40 ticks, roars at 0.25/1/4 m, 8 footsteps; peak ≤ 0.891; voice rate formula ± 1e-6; bus caps; same-id UI within 40 ms skipped; seeds and heights change rates and gains; suspended and interrupted contexts resume on the next pointerdown', { milestone: 9, items: [53] }, async () => {
  const ctx = new OfflineAudioContext(2, 48000 * 10, 48000);
  const A = createAudio({ jitter: false, test: false }); await A.loadManifest('audio/audio-manifest.json');
  A.setMuted(false); A.useContext(ctx);
  A.setScene('editor');                                                            // music and ambience loops from 0
  let skipped = 0, capOk = true;
  const cap = () => { for (const [b, n] of Object.entries({ ui: 4, voice: 3, move: 6, amb: 3, music: 2 })) if (A.active[b].length > n) capOk = false; };
  for (let i = 0; i < 40; i++) {
    const t = 0.5 + i * 0.05;
    ok(A.play('ui.button_tick', { at: t }), `tick ${i} dropped`); cap();
    if (A.play('ui.button_tick', { at: t + 0.02 }) === null) skipped++; cap();       // same id within 40 ms → skipped
  }
  const seed = 1, idSt = (fnv1a(String(seed)) / 4294967296 - 0.5) * 3, rates = [];
  for (const h of [0.25, 1, 4]) {
    A.setCreature({ seed, height: h, family: 'jaw' });
    const hd = A.play('vo.jaw.roar', { at: 3, size: h }); cap();
    const sizeSt = Math.min(9, Math.max(-9, -7 * Math.log2(h))), want = Math.pow(2, (sizeSt + 0 + idSt) / 12);
    ok(Math.abs(hd.rate - want) <= 1e-6, `roar rate ${hd.rate} vs ${want} at ${h} m`);
    if (hd.src) ok(Math.abs(hd.src.playbackRate.value - want) <= 1e-6 * want + 1e-7, 'playbackRate param');
    rates.push(hd.rate);
  }
  for (let k = 0; k < 8; k++) { A.play('mv.step_pads', { at: 4 + k * 0.0125, size: 1 }); cap(); }
  const buf = await ctx.startRendering();
  let peak = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
  // loops from 0: energy in the first second
  let e0 = 0; { const d = buf.getChannelData(0); for (let i = 0; i < 48000; i++) e0 += d[i] * d[i]; }
  // different seeds and heights → different rates and gains (same family)
  const B = createAudio({ jitter: false, test: false }); B.setMuted(false); B.useContext(new OfflineAudioContext(2, 4800, 48000));
  const r1 = B.rateFor('vo.beak.coo', { seed: 11, height: 0.5 }), r2 = B.rateFor('vo.beak.coo', { seed: 12, height: 0.5 }), r3 = B.rateFor('vo.beak.coo', { seed: 11, height: 1.5 });
  const g1 = B.play('vo.beak.coo', { size: 0.5 }).env.gain.value, g2 = B.play('vo.beak.coo', { size: 1.5, at: 0.01 }).env.gain.value;
  // mocked suspended / interrupted contexts resume on the next pointerdown
  const resumed = [];
  for (const state of ['suspended', 'interrupted']) {
    const C = createAudio({ test: true }); C.useContext(new OfflineAudioContext(1, 480, 48000));
    Object.defineProperty(C.ctx, 'state', { value: state, configurable: true }); C.ctx.resume = () => { resumed.push(state); return Promise.resolve(); };
    const tgt = new EventTarget(); C.attachUnlock(tgt); tgt.dispatchEvent(new Event('pointerdown'));
  }
  ok(peak <= 0.891, `peak ${peak.toFixed(4)}`);
  ok(e0 > 1e-6, 'no sound in the first second (loops not from 0)');
  ok(skipped === 40, `same-id skips ${skipped}/40`);
  ok(capOk, 'a bus exceeded its cap');
  ok(new Set(rates.map((r) => r.toFixed(6))).size === 3, 'roar rates do not differ by size');
  ok(r1 !== r2 && r1 !== r3 && g1 !== g2, 'seed / height do not change rate or gain');
  ok(resumed.join() === 'suspended,interrupted', `resumed ${resumed.join()}`);
  return `peak ${peak.toFixed(3)}; skipped ${skipped}/40; roar rates ${rates.map((r) => r.toFixed(4)).join('/')}; first-second energy ${e0.toExponential(2)}; resumed ${resumed.join('+')}`;
});
