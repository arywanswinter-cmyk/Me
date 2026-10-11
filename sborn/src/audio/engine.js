// engine.js — WebAudio engine: buses, unlock, per-creature pitch and gain, shuffle-bag file variants with sha256 checks,
//   loops with loop points, music and ambience scenes with crossfades and ducking, and soft synthesized placeholders for
//   every id without a usable file.
// Exports: createAudio({ test, jitter, base }) -> { loadManifest(url|obj), unlock(), attachUnlock(target), useContext(ctx), play(id, opts),
//          loop(id, on, opts), setScene(name), setMuted(b), muted, status(), setCreature({seed, height, family}), rateFor(id, opts),
//          ctx, buses, active, suspend(), resume(), log, ready(id) }.
// Invariants: silent until a user gesture unlocks it; one boot status line (the only console.log in src/ outside debug);
//   a placeholder is never reported as generated (a file failing its sha256 or decode becomes a placeholder); the same UI
//   id within 40 ms is skipped; bus caps steal the oldest voice with an 80 ms fade; a soft clipper keeps the output peak
//   ≤ −1 dBFS. Placeholder voices follow Doodle World src/creature/voice.js (detuned triangles through a formant, a
//   pitch contour per mood).
import { fnv1a } from '../core/hash.js';
import { mulberry32 } from '../core/rng.js';
import { sha256Hex } from '../core/sha256.js';

const BUS_GAIN = { ui: 0.7, voice: 0.85, move: 0.6, amb: 0.5, music: 0.4 };
const BUS_CAP = { ui: 4, voice: 3, move: 6, amb: 3, music: 2 };
const FAMILY_BIAS = { beak: 2, jaw: 0, snout: -1, mandible: 1, filter: -2 };
const CRITICAL = ['ui.part_hover', 'ui.button_tick', 'ui.part_attach', 'ui.part_pickup', 'ui.part_in', 'ui.part_out', 'ui.color_pick', 'ui.paint_swish', 'ui.born_tada'];
const SCENES = { editor: { music: 'mus.editor_loop', amb: ['amb.editor_tone'] }, play: { music: 'mus.play_loop', amb: ['amb.island'] }, none: { music: null, amb: [] } };
const PEAK = 0.891;                                                        // −1 dBFS
export const busOf = (id) => (id.startsWith('ui.') ? 'ui' : id.startsWith('vo.') ? 'voice' : id.startsWith('mv.') ? 'move' : id.startsWith('amb.') ? 'amb' : 'music');

export function createAudio({ test = false, jitter = true, base = 'audio/' } = {}) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  let ctx = null, master = null, comp = null, clip = null, verb = null, duck = null;
  const buses = {};
  const active = { ui: [], voice: [], move: [], amb: [], music: [] };
  const lastUi = new Map(), loops = new Map(), bags = new Map(), files = new Map();
  const rnd = mulberry32(99);
  let muted = false, creature = { seed: 1, height: 1, family: 'jaw' }, ids = [], booted = false, scene = 'none';
  try { muted = localStorage.getItem('sborn.muted') === '1'; } catch {}
  const log = [];

  // ---- manifest: ids with file variants (approved or not, minus rejected ones) ----
  async function loadManifest(src = `${base}audio-manifest.json`) {
    try {
      const m = typeof src === 'string' ? await (await fetch(src)).json() : src;
      const entries = Array.isArray(m.ids) ? m.ids.map((e) => [e.id, e]) : Object.entries(m.ids);
      ids = entries.map(([id]) => id);
      for (const [id, e] of entries) {
        const vs = (e.variants || []).filter((v) => !v.rejected).map((v) => ({ ...v, buf: null, p: null, bad: false }));
        if (vs.length) files.set(id, vs);
      }
    } catch { /* no manifest: everything is a placeholder */ }
    return status();
  }
  const usable = (id) => { const v = files.get(id); return !!v && v.some((x) => !x.bad); };
  const sha = (buf) => { try { return sha256Hex(buf); } catch { return null; } };
  function loadVariant(v) {
    if (v.p) return v.p;
    v.p = (async () => {
      try {
        const ab = await (await fetch(base + v.file)).arrayBuffer();
        const h = sha(ab); if (h && v.sha256 && h !== v.sha256) throw new Error('sha256');
        v.buf = await ctx.decodeAudioData(ab);
      } catch { v.bad = true; }
      return v;
    })();
    return v.p;
  }
  function ready(id) { const v = files.get(id); return !!v && v.some((x) => x.buf); }

  // ---- graph ----
  function build(c) {
    ctx = c;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
    // soft clipper: |out| ≤ −1 dBFS whatever piles up. The shaper reads its input on [−1, 1], so the signal is halved
    // first and the curve maps the halved value back: unity gain below the knee, PEAK·tanh above it
    master = ctx.createGain(); master.gain.value = muted || test ? 0 : 1;
    const pre = ctx.createGain(); pre.gain.value = 0.5;
    clip = ctx.createWaveShaper();
    const N = 4096, curve = new Float32Array(N); for (let i = 0; i < N; i++) { const x = ((i / (N - 1)) * 2 - 1) * 2; curve[i] = PEAK * Math.tanh(x / PEAK); }
    clip.curve = curve;
    master.connect(comp).connect(pre).connect(clip).connect(ctx.destination);
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate), r2 = mulberry32(7);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (r2() * 2 - 1) * Math.pow(1 - i / len, 3) * 0.5; }
    verb.buffer = ir; verb.connect(master);
    for (const [b, g] of Object.entries(BUS_GAIN)) {
      const n = ctx.createGain(); n.gain.value = g; buses[b] = n;
      if (b === 'music') { duck = ctx.createGain(); duck.gain.value = 1; n.connect(duck).connect(master); } else n.connect(master);
      if (b === 'ui' || b === 'voice') { const s = ctx.createGain(); s.gain.value = b === 'ui' ? 0.15 : 0.2; n.connect(s).connect(verb); }
    }
  }
  function bootLine() {
    if (booted) return; booted = true;
    const st = status();
    console.log(`[sborn-audio] ${ids.length || 85} ids · ${st.generated} generated · ${st.placeholder} placeholder · ${st.unapproved} unapproved`);
  }
  function unlock() {
    if (!AC) return;
    if (!ctx) {
      build(new AC());
      try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {}
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      bootLine();
      for (const id of CRITICAL) for (const v of files.get(id) || []) loadVariant(v);
      if (scene !== 'none') { const s2 = scene; scene = 'none'; setScene(s2); }
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume();
  }
  function attachUnlock(target = window) { for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) target.addEventListener(ev, () => unlock(), { capture: true, passive: true }); }
  function useContext(c) { build(c); }      // tests: an OfflineAudioContext (or a mock wrapped around one)
  function setMuted(b) { muted = b; try { localStorage.setItem('sborn.muted', b ? '1' : '0'); } catch {} if (master) master.gain.setTargetAtTime(b || test ? 0 : 1, ctx.currentTime, 0.02); }
  function setCreature(c) { creature = { ...creature, ...c }; }

  // rate = 2^((sizeSt + biasSt + idSt + jitter)/12); sizeSt = clamp(−7·log2(H / 1 m), −9, 9); idSt from the recipe seed
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
    const a = active[bus], now = ctx.currentTime;
    for (let i = a.length - 1; i >= 0; i--) if (a[i].end < now) a.splice(i, 1);
    while (a.length >= BUS_CAP[bus]) { const o = a.shift(); try { o.gain.gain.cancelScheduledValues(now); o.gain.gain.setValueAtTime(o.gain.gain.value, now); o.gain.gain.linearRampToValueAtTime(0, now + 0.08); o.stop(now + 0.09); } catch {} }
  }
  function duckMusic(t, dur) { if (!duck) return; duck.gain.cancelScheduledValues(t); duck.gain.setTargetAtTime(0.5, t, 0.03); duck.gain.setTargetAtTime(1, t + dur, 0.2); }   // −6 dB under voices and stings

  // ---- placeholders ----
  function synth(id, t, rate, out) {
    const nodes = [];
    const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.connect(g);
    let dur = 0.25;
    const osc = (type, f0, f1, d, at = t, gainV = 0.5) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + d); const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, at); gg.gain.exponentialRampToValueAtTime(gainV, at + 0.012); gg.gain.exponentialRampToValueAtTime(0.0001, at + d); o.connect(gg).connect(lp); o.start(at); o.stop(at + d + 0.02); nodes.push(o); };
    const noise = (d, f0, f1, at = t, gainV = 0.4, q = 1.2, swell = false) => {
      const len = Math.ceil(ctx.sampleRate * d), b = ctx.createBuffer(1, len, ctx.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = rnd() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(f0, at); bp.frequency.exponentialRampToValueAtTime(f1, at + d);
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, at);
      if (swell) { const steps = 16; for (let k = 1; k <= steps; k++) { const u = k / steps; gg.gain.linearRampToValueAtTime(gainV * Math.sin(Math.PI * u), at + d * u); } }   // equal-power swell
      else { gg.gain.linearRampToValueAtTime(gainV, at + Math.min(0.004, d * 0.2)); gg.gain.linearRampToValueAtTime(0.0001, at + d); }
      s.connect(bp).connect(gg).connect(lp); s.start(at); s.stop(at + d); nodes.push(s);
    };
    if (id === 'ui.part_in' || id === 'ui.part_out') { dur = 0.5; noise(0.5, id === 'ui.part_in' ? 400 : 1800, id === 'ui.part_in' ? 1800 : 400, t, 0.4, 1.2, true); }
    else if (id.startsWith('mv.step')) { dur = 0.04; noise(0.04, 300 * rate, 200 * rate, t, 0.5, 0.7); }
    else if (id === 'mv.wing_flap') { dur = 0.12; noise(0.12, 600 * rate, 300 * rate, t, 0.35, 0.8); }
    else if (id === 'mv.wing_buzz' || id === 'mv.glide_wind' || id === 'mv.slither' || id === 'mv.splash' || id === 'mv.sniff' || id.startsWith('amb.')) { dur = id === 'mv.sniff' ? 0.3 : 1.2; noise(dur, 500, 900, t, 0.18, 0.8); }
    else if (id === 'mv.crunch_fruit' || id === 'mv.gulp' || id === 'mv.land' || id === 'mv.jump') { dur = 0.12; noise(0.08, 900, 300, t, 0.35, 0.9); osc('sine', 220 * rate, 140 * rate, 0.1, t, 0.25); }
    else if (id.startsWith('mus.')) { dur = 1.6; [0, 4, 7, 12].forEach((s, i) => osc('triangle', 392 * Math.pow(2, s / 12), 392 * Math.pow(2, s / 12), 0.5, t + i * 0.18, 0.18)); }
    else if (id.startsWith('vo.')) {
      const mood = id.split('.')[2], fam = id.split('.')[1], basef = 520 * rate;
      const formant = ctx.createBiquadFilter(); formant.type = 'peaking'; formant.frequency.value = { beak: 1800, jaw: 900, snout: 700, mandible: 1400, filter: 600 }[fam] || 900; formant.Q.value = 2; formant.gain.value = 8; formant.connect(lp);
      const contour = { coo: [1, 1.15, 0.95], chirp: [1, 1.5], purr: [0.6, 0.62, 0.6], growl: [0.5, 0.45], roar: [0.7, 0.9, 0.6], eat: [0.8, 0.9, 0.8, 0.9], sleep: [0.7, 0.5], giggle: [1.2, 1.4, 1.2, 1.5, 1.3] }[mood] || [1, 1.2];
      let tt = t;
      const vosc = (f0, f1, d, at, gv) => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + d); const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, at); gg.gain.exponentialRampToValueAtTime(gv, at + 0.012); gg.gain.exponentialRampToValueAtTime(0.0001, at + d); o.connect(gg).connect(formant); o.start(at); o.stop(at + d + 0.02); nodes.push(o); };
      for (const c of contour) { const d = mood === 'giggle' ? 0.07 : mood === 'roar' || mood === 'growl' ? 0.22 : 0.14; vosc(basef * c, basef * c * 1.08, d, tt, 0.3); vosc(basef * c * 1.01, basef * c * 1.06, d, tt, 0.18); tt += d + 0.02; }
      dur = tt - t;
    } else {
      const f = { 'ui.part_attach': 330, 'ui.budget_bonk': 180, 'ui.button_tick': 1400, 'ui.color_pick': 1700, 'ui.vertebra_add': 660, 'ui.born_tada': 523, 'ui.save_chime': 659, 'ui.undo': 500, 'ui.redo': 600, 'ui.photo_shutter': 1200, 'ui.tab_switch': 760 }[id] || 880;
      if (id === 'ui.born_tada' || id === 'ui.save_chime') { [0, 4, 7].forEach((s, i) => osc('sine', f * Math.pow(2, s / 12), f * Math.pow(2, s / 12) * 0.99, 0.5, t + i * 0.12, 0.3)); dur = 0.9; }
      else { osc(id === 'ui.button_tick' ? 'sine' : 'triangle', f * rate, f * rate * 0.8, 0.12, t, 0.45); dur = 0.12; }
    }
    return { g, nodes, dur };
  }
  // shuffle bag: every variant once per round, never the same one twice in a row
  function pick(id, vs) {
    let bag = bags.get(id);
    if (!bag || !bag.items.length) {
      const items = vs.map((_, i) => i).filter((i) => !vs[i].bad);
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
      if (bag && items.length > 1 && items[0] === bag.last) items.push(items.shift());
      bag = { items, last: bag ? bag.last : -1 }; bags.set(id, bag);
    }
    const i = bag.items.shift(); bag.last = i; return vs[i];
  }
  function play(id, { x = 0, size, family, gainDb = 0, at = null, jitter: jit = jitter, rate: rateMul = 1 } = {}) {
    log.push({ id, t: ctx ? ctx.currentTime : 0 });
    if (log.length > 400) log.shift();
    if (!ctx) return null;
    const bus = busOf(id);
    const t = at ?? ctx.currentTime;
    if (bus === 'ui') { const l = lastUi.get(id); if (l !== undefined && Math.abs(t - l) < 0.04) return null; lastUi.set(id, t); }
    const js = !jit ? 0 : bus === 'ui' ? (rnd() - 0.5) * 0.8 : bus === 'voice' ? (rnd() - 0.5) * 2.4 : bus === 'move' ? (rnd() - 0.5) * 3 : 0;
    const rate = rateFor(id, { height: size ?? creature.height, family: family ?? creature.family, jitterSt: js }) * rateMul;
    const db = gainDb + (bus === 'voice' || bus === 'move' ? sizeDb(size ?? creature.height) : 0) + (jit ? (rnd() - 0.5) * 3 : 0);
    const gain = Math.pow(10, db / 20);
    // a file variant when one is decoded; otherwise start loading and wait up to 30 ms (UI) / 150 ms (voices), else skip
    if (usable(id)) {
      const vs = files.get(id), v = pick(id, vs);
      if (v && v.buf) return startBuffer(id, bus, v, t, rate, gain, x);
      if (v) { loadVariant(v); const wait = bus === 'voice' ? 150 : 30; const t0 = performance.now(); v.p.then(() => { if (v.buf && performance.now() - t0 <= wait) startBuffer(id, bus, v, ctx.currentTime, rate, gain, x); }); return { id, pending: true, rate, gain }; }
    }
    steal(bus);
    const env = ctx.createGain(); env.gain.value = gain;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.max(-0.7, Math.min(0.7, x)); env.connect(pan).connect(buses[bus]); } else env.connect(buses[bus]);
    const s = synth(id, t, rate, env);
    s.g.gain.setValueAtTime(0, t); s.g.gain.linearRampToValueAtTime(1, t + 0.012);
    const handle = { id, gain: s.g, env, rate, placeholder: true, stop: (when) => s.nodes.forEach((n) => { try { n.stop(when); } catch {} }), end: t + s.dur };
    active[bus].push(handle);
    if (bus === 'voice' || id.startsWith('mus.sting')) duckMusic(t, s.dur);
    return handle;
  }
  function startBuffer(id, bus, v, t, rate, gain, x) {
    steal(bus);
    const src = ctx.createBufferSource(); src.buffer = v.buf; src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + (bus === 'ui' ? 0.004 : 0.012));
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.max(-0.7, Math.min(0.7, x)); src.connect(g).connect(pan).connect(buses[bus]); } else src.connect(g).connect(buses[bus]);
    const s0 = v.loopStart ? Math.max(0, v.loopStart - 0.01) : 0, d = (v.buf.duration - s0) / rate;
    src.start(t, s0);
    const handle = { id, gain: g, rate, src, placeholder: false, stop: (when) => { try { src.stop(when); } catch {} }, end: t + d };
    active[bus].push(handle);
    if (bus === 'voice' || id.startsWith('mus.sting')) duckMusic(t, d);
    return handle;
  }

  // ---- loops: files use their loop points; placeholders are noise beds or the pad-and-kalimba music ----
  function placeholderLoop(id, g) {
    const nodes = [];
    if (id.startsWith('mus.')) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g);
      const root = id === 'mus.play_loop' ? 196 : 174.6;
      for (const [f, dt] of [[root, 0], [root * 1.5, 3], [root * 2, -4]]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = dt; const gg = ctx.createGain(); gg.gain.value = 0.06; o.connect(gg).connect(lp); o.start(); nodes.push(o); }
      const pent = [0, 2, 4, 7, 9, 12, 14, 16], state = { next: ctx.currentTime + 0.2 };
      const schedule = (until) => {
        while (state.next < until) {
          const f = root * 2 * Math.pow(2, pent[Math.floor(rnd() * pent.length)] / 12), at = state.next;
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
          const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, at); gg.gain.exponentialRampToValueAtTime(0.12, at + 0.006); gg.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
          o.connect(gg).connect(g); o.start(at); o.stop(at + 1); state.next += (id === 'mus.play_loop' ? 0.3 : 0.5) + rnd() * 0.6;
        }
      };
      schedule(ctx.currentTime + 12);
      const timer = typeof setInterval === 'function' && !(ctx instanceof (globalThis.OfflineAudioContext || function () {})) ? setInterval(() => schedule(ctx.currentTime + 2), 500) : null;
      return { nodes, stop: () => { if (timer) clearInterval(timer); } };
    }
    const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * 0.3;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = id === 'mv.wing_buzz' ? 240 : id.startsWith('amb.') ? 700 : 600; bp.Q.value = 0.8;
    s.connect(bp).connect(g); s.start(); nodes.push(s);
    return { nodes, bp, src: s, stop: () => {} };
  }
  function loop(id, on, { level = 1, rate = 1, fadeIn, fadeOut } = {}) {
    if (!ctx) return;
    const cur = loops.get(id), bus = busOf(id);
    const fi = fadeIn ?? (bus === 'music' || bus === 'amb' ? 1.5 : 0.06), fo = fadeOut ?? (bus === 'music' || bus === 'amb' ? 2 : 0.15);
    const now = ctx.currentTime;
    if (on && !cur) {
      const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.connect(buses[bus]);
      let L;
      const v = usable(id) ? pick(id, files.get(id)) : null;
      if (v && v.buf) { const s = ctx.createBufferSource(); s.buffer = v.buf; s.loop = true; if (v.loopEnd) { s.loopStart = v.loopStart; s.loopEnd = v.loopEnd; } s.playbackRate.value = rate; s.connect(g); s.start(now, v.loopStart || 0); L = { nodes: [s], src: s, stop: () => {} }; }
      else { if (v) loadVariant(v); L = placeholderLoop(id, g); }
      g.gain.linearRampToValueAtTime(level * (L.src && L.src.buffer && !L.bp ? 1 : 0.5), now + fi);
      loops.set(id, { ...L, g, level });
    } else if (on && cur) {
      cur.g.gain.setTargetAtTime(level * (cur.bp ? 0.5 : 1), now, 0.05);
      if (cur.src && cur.src.playbackRate) cur.src.playbackRate.setTargetAtTime(rate, now, 0.05);
    } else if (!on && cur) {
      cur.g.gain.cancelScheduledValues(now); cur.g.gain.setValueAtTime(cur.g.gain.value, now); cur.g.gain.linearRampToValueAtTime(0, now + fo);
      const nodes = cur.nodes; cur.stop(); for (const n of nodes) { try { n.stop(now + fo + 0.05); } catch {} }
      loops.delete(id);
    }
  }
  // editor / play: music crossfades over 2.5 s, ambience fades in 1.5 s and out 2 s
  function setScene(name) {
    const prev = SCENES[scene] || SCENES.none, next = SCENES[name] || SCENES.none;
    scene = name;
    if (!ctx) return;
    if (prev.music !== next.music) { if (prev.music) loop(prev.music, false, { fadeOut: 2.5 }); if (next.music) loop(next.music, true, { fadeIn: 2.5 }); }
    for (const a of prev.amb) if (!next.amb.includes(a)) loop(a, false);
    for (const a of next.amb) if (!prev.amb.includes(a)) loop(a, true, { level: 0.8 });
  }
  function status() {
    const total = ids.length || 85;
    let generated = 0, unapproved = 0;
    for (const [id, vs] of files) { const ok = vs.filter((v) => !v.bad); if (ok.length) { generated++; if (ok.some((v) => !v.approved)) unapproved++; } }
    return { generated, placeholder: total - generated, unapproved, missing: total - generated };
  }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume(); }
  return { loadManifest, unlock, attachUnlock, useContext, play, loop, setScene, setMuted, get muted() { return muted; }, status, setCreature, rateFor, get ctx() { return ctx; }, buses, suspend, resume, log, active, ready, get scene() { return scene; } };
}
