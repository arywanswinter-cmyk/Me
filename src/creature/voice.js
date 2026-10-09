// voice.js — tiny synthesised creature voices (Web Audio).
// Exports: createVoice() -> { unlock(), chirp({ height, seed }) }.
// Invariants: silent until unlock() runs inside a user gesture (browser autoplay rules);
//   pitch falls as creatures get taller; each creature's seed fixes its timbre, each call varies the phrase.
import { mulberry32 } from '../core/rng.js';

export function createVoice() {
  let ac = null, master = null, calls = 0;
  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      master = ac.createGain();
      master.gain.value = 0.45;
      master.connect(comp).connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }
  function chirp({ height = 1.5, seed = 1 } = {}) {
    if (!ac) return;
    const timbre = mulberry32(seed), rnd = mulberry32(seed + ++calls * 7919);
    const base = (560 - (height - 0.9) * 230) * (0.85 + timbre() * 0.3);
    const formant = 1.8 + timbre() * 1.4, wave = timbre() < 0.5 ? 'triangle' : 'sine';
    const n = 2 + Math.floor(rnd() * 3);
    let t = ac.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const dur = 0.08 + rnd() * 0.09, f0 = base * (0.85 + rnd() * 0.45), f1 = f0 * (1.15 + rnd() * 0.45);
      const o = ac.createOscillator(); o.type = wave;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.55);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + dur);
      const vib = ac.createOscillator(), vg = ac.createGain();
      vib.frequency.value = 24 + timbre() * 10; vg.gain.value = f0 * 0.025;
      vib.connect(vg).connect(o.frequency);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f0 * formant; bp.Q.value = 2.5;
      const dry = ac.createGain(); dry.gain.value = 0.35;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(bp).connect(g); o.connect(dry).connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02); vib.start(t); vib.stop(t + dur + 0.02);
      t += dur + 0.03 + rnd() * 0.04;
    }
  }
  return { unlock, chirp };
}
