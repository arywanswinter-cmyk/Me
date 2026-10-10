// engine.js — WebAudio engine: buses, unlock, per-creature pitch and gain, shuffle-bag variants, loops, and soft
//   synthesized placeholders for every id without a usable file.
// Exports: createAudio({ test, manifest }) -> { unlock(), play(id, opts), loop(id, on, opts), setMuted(b), muted, status(), setCreature({seed, height, family}),
//          rateFor(id, opts), ctx, buses, suspend(), resume(), log }.
// Invariants: silent until a user gesture unlocks it; one boot status line (the only console.log in src/ outside debug);
//   a placeholder is never reported as generated; the same UI id within 40 ms is skipped; bus caps steal the oldest voice.
// Placeholder voices follow Doodle World src/creature/voice.js (detuned triangles through a formant, pitch contour per mood).
import { fnv1a } from '../core/hash.js';
import { mulberry32 } from '../core/rng.js';

const BUS_GAIN = { ui: 0.7, voice: 0.85, move: 0.6, amb: 0.5, music: 0.4 };
const BUS_CAP = { ui: 4, voice: 3, move: 6, amb: 3, music: 2 };
const FAMILY_BIAS = { beak: 2, jaw: 0, snout: -1, mandible: 1, filter: -2 };
const ATTACK = { soft: 0.015, tick: 0.004, voice: 0.012, swell: 0.015, loop: 0.06 };
const busOf = (id) => (id.startsWith('ui.') ? 'ui' : id.startsWith('vo.') ? 'voice' : id.startsWith('mv.') ? 'move' : id.startsWith('amb.') ? 'amb' : 'music');

export function createAudio({ test = false, manifest = null, jitter = true } = {}) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  let ctx = null, master = null, comp = null, verb = null;
  const buses = {};
  const active = { ui: [], voice: [], move: [], amb: [], music: [] };
  const lastUi = new Map();
  const loops = new Map();
  const bags = new Map();
  const rnd = mulberry32(99);
  let muted = false, creature = { seed: 1, height: 1, family: 'jaw' };
  try { muted = localStorage.getItem('sborn.muted') === '1'; } catch {}
  const ids = manifest ? manifest.ids.map((x) => x.id) : [];
  const generated = new Set(), unapproved = new Set();
  if (manifest) for (const e of manifest.ids) if (e.variants && e.variants.length) { generated.add(e.id); if (e.variants.some((v) => !v.approved)) unapproved.add(e.id); }
  const log = [];

  function build(c) {
    ctx = c;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
    master = ctx.createGain(); master.gain.value = muted || test ? 0 : 1;
    master.connect(comp).connect(ctx.destination);
    // shared generated 1.6 s "air" reverb
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate), r2 = mulberry32(7);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (r2() * 2 - 1) * Math.pow(1 - i / len, 3) * 0.5; }
    verb.buffer = ir; verb.connect(master);
    for (const [b, g] of Object.entries(BUS_GAIN)) {
      const n = ctx.createGain(); n.gain.value = g; n.connect(master); buses[b] = n;
      if (b === 'ui' || b === 'voice') { const s = ctx.createGain(); s.gain.value = b === 'ui' ? 0.15 : 0.2; n.connect(s).connect(verb); }
    }
  }
  function unlock() {
    if (!AC) return;
    if (!ctx) {
      build(new AC());
      try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {}
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      const st = status();
      console.log(`[sborn-audio] ${ids.length || 85} ids · ${st.generated} generated · ${st.placeholder} placeholder · ${st.unapproved} unapproved`);
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume();
  }
  function useContext(c) { build(c); }      // tests: OfflineAudioContext
  function setMuted(b) { muted = b; try { localStorage.setItem('sborn.muted', b ? '1' : '0'); } catch {} if (master) master.gain.setTargetAtTime(b || test ? 0 : 1, ctx.currentTime, 0.02); }
  function setCreature(c) { creature = { ...creature, ...c }; }
  // rate = 2^((sizeSt + biasSt + idSt + jitter)/12)
  function rateFor(id, { height = creature.height, seed = creature.seed, family = creature.family, jitterSt = 0 } = {}) {
    const bus = busOf(id);
    if (bus === 'ui' || bus === 'music' || bus === 'amb') return Math.pow(2, jitterSt / 12);
    const sizeSt = Math.min(9, Math.max(-9, -7 * Math.log2(Math.max(0.05, height) / 1)));
    const idSt = (fnv1a(String(seed >>> 0)) / 4294967296 - 0.5) * 3;
    const fam = bus === 'voice' ? (id.split('.')[1] || family) : family;
    const biasSt = bus === 'voice' ? (FAMILY_BIAS[fam] || 0) : 0;
    return Math.pow(2, (sizeSt + biasSt + idSt + jitterSt) / 12);
  }
  const sizeDb = (h) => Math.min(3, Math.max(-5, 5 * Math.log2(Math.max(0.05, h))));
  function steal(bus) {
    const a = active[bus];
    while (a.length >= BUS_CAP[bus]) { const o = a.shift(); try { o.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02); o.stop(ctx.currentTime + 0.08); } catch {} }
  }
  // ---- placeholders ----
  function synth(id, t, rate, out) {
    const nodes = [];
    const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.connect(g);
    let dur = 0.25;
    const osc = (type, f0, f1, d, at = t, gainV = 0.5) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + d); const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, at); gg.gain.exponentialRampToValueAtTime(gainV, at + 0.012); gg.gain.exponentialRampToValueAtTime(0.0001, at + d); o.connect(gg).connect(lp); o.start(at); o.stop(at + d + 0.02); nodes.push(o); };
    const noise = (d, f0, f1, at = t, gainV = 0.4, q = 1.2) => {
      const len = Math.ceil(ctx.sampleRate * d), b = ctx.createBuffer(1, len, ctx.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = rnd() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(f0, at); bp.frequency.exponentialRampToValueAtTime(f1, at + d);
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, at); gg.gain.linearRampToValueAtTime(gainV, at + d * 0.5); gg.gain.linearRampToValueAtTime(0.0001, at + d);
      s.connect(bp).connect(gg).connect(lp); s.start(at); s.stop(at + d); nodes.push(s);
    };
    if (id === 'ui.part_in' || id === 'ui.part_out') { dur = 0.5; noise(0.5, id === 'ui.part_in' ? 400 : 1800, id === 'ui.part_in' ? 1800 : 400); }
    else if (id.startsWith('mv.step')) { dur = 0.04; noise(0.04, 300 * rate, 200 * rate, t, 0.5, 0.7); }
    else if (id === 'mv.wing_buzz' || id === 'mv.glide_wind' || id === 'mv.slither' || id.startsWith('amb.')) { dur = 2; noise(2, 500, 900, t, 0.15, 0.8); }
    else if (id.startsWith('mus.')) { dur = 2.5; const scale = [0, 2, 4, 7, 9]; for (let i = 0; i < 4; i++) osc('triangle', 392 * Math.pow(2, scale[Math.floor(rnd() * 5)] / 12), 392, 0.6, t + i * 0.5, 0.15); }
    else if (id.startsWith('vo.')) {
      const mood = id.split('.')[2], base = 520 * rate;
      const contour = { coo: [1, 1.15, 0.95], chirp: [1, 1.5], purr: [0.6, 0.62, 0.6], growl: [0.5, 0.45], roar: [0.7, 0.9, 0.6], eat: [0.8, 0.9, 0.8, 0.9], sleep: [0.7, 0.5], giggle: [1.2, 1.4, 1.2, 1.5, 1.3] }[mood] || [1, 1.2];
      let tt = t;
      for (const c of contour) { const d = mood === 'giggle' ? 0.07 : 0.14; osc('triangle', base * c, base * c * 1.08, d, tt, 0.35); osc('triangle', base * c * 1.01, base * c * 1.06, d, tt, 0.2); tt += d + 0.02; }
      dur = tt - t;
    } else {
      const f = { 'ui.part_attach': 330, 'ui.budget_bonk': 180, 'ui.button_tick': 1400, 'ui.color_pick': 1700, 'ui.vertebra_add': 660, 'ui.born_tada': 523, 'ui.save_chime': 659, 'ui.undo': 500, 'ui.redo': 600 }[id] || 880;
      if (id === 'ui.born_tada' || id === 'ui.save_chime') { [0, 4, 7].forEach((s, i) => osc('sine', f * Math.pow(2, s / 12), f * Math.pow(2, s / 12) * 0.99, 0.5, t + i * 0.12, 0.3)); dur = 0.9; }
      else { osc(id === 'ui.button_tick' ? 'sine' : 'triangle', f * rate, f * rate * 0.8, 0.12, t, 0.45); dur = 0.12; }
    }
    return { g, nodes, dur };
  }
  function play(id, { x = 0, size, family, gainDb = 0, at = null, jitter: jit = jitter } = {}) {
    log.push({ id, t: ctx ? ctx.currentTime : 0 });
    if (log.length > 400) log.shift();
    if (!ctx) return null;
    const bus = busOf(id);
    const t = at ?? ctx.currentTime;
    if (bus === 'ui') { const l = lastUi.get(id); if (l !== undefined && t - l < 0.04) return null; lastUi.set(id, t); }
    steal(bus);
    const js = !jit ? 0 : bus === 'ui' ? (rnd() - 0.5) * 0.8 : bus === 'voice' ? (rnd() - 0.5) * 2.4 : bus === 'move' ? (rnd() - 0.5) * 3 : 0;
    const rate = rateFor(id, { height: size ?? creature.height, family: family ?? creature.family, jitterSt: js });
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const env = ctx.createGain();
    const db = gainDb + (bus === 'voice' || bus === 'move' ? sizeDb(size ?? creature.height) : 0) + (jit ? (rnd() - 0.5) * 3 : 0);
    env.gain.value = Math.pow(10, db / 20);
    if (pan) { pan.pan.value = Math.max(-0.7, Math.min(0.7, x)); env.connect(pan).connect(buses[bus]); } else env.connect(buses[bus]);
    const s = synth(id, t, rate, env);
    const atk = ATTACK.soft;
    s.g.gain.setValueAtTime(0, t); s.g.gain.linearRampToValueAtTime(1, t + atk);
    const handle = { id, gain: s.g, rate, stop: (when) => s.nodes.forEach((n) => { try { n.stop(when); } catch {} }), end: t + s.dur };
    active[bus].push(handle);
    setTimeout(() => { const a = active[bus]; const i = a.indexOf(handle); if (i >= 0) a.splice(i, 1); }, (s.dur + 0.2) * 1000);
    return handle;
  }
  function loop(id, on, { level = 1 } = {}) {
    if (!ctx) return;
    const cur = loops.get(id);
    if (on && !cur) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(buses[busOf(id)]);
      const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * 0.3;
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.8;
      s.connect(bp).connect(g); s.start();
      g.gain.setTargetAtTime(level * 0.5, ctx.currentTime, 0.06 / 3);
      loops.set(id, { s, g, bp });
    } else if (on && cur) { cur.g.gain.setTargetAtTime(level * 0.5, ctx.currentTime, 0.05); }
    else if (!on && cur) { cur.g.gain.setTargetAtTime(0, ctx.currentTime, 0.15 / 3); const s = cur.s; setTimeout(() => { try { s.stop(); } catch {} }, 400); loops.delete(id); }
  }
  function status() { const total = ids.length || 85; return { generated: generated.size, placeholder: total - generated.size, unapproved: unapproved.size, missing: total - generated.size }; }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume(); }
  return { unlock, useContext, play, loop, setMuted, get muted() { return muted; }, status, setCreature, rateFor, get ctx() { return ctx; }, buses, suspend, resume, log, active };
}
