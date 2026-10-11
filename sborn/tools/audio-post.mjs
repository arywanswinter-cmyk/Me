// audio-post.mjs — post-processing and checks for baked sounds (§12.4), approvals, and a self-test that needs no API.
// Exports: decode(file, ch), measure(file), checkPcm(pcm, opts), processTake(raw, entry, out), postProcess(), applyApprovals(file, manifestPath?),
//          selfTest(); CLI: node sborn/tools/audio-post.mjs [--reprocess | --self-test | --apply-approvals approvals.json].
// Invariants: ffmpeg/ffprobe only (no sox); never sets approved:true itself (only an approvals file can, and only that
//   field changes); without raws an id is listed as a placeholder (never as generated); placeholder files are never
//   written into audio/; report.json lists every id.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SB = path.resolve(HERE, '..');
const RAW = path.join(HERE, 'audio-raw');
const OUT = path.join(HERE, 'audio-out');
const AUDIO = path.join(SB, 'audio');
const MANIFEST_OUT = path.join(AUDIO, 'audio-manifest.json');
const SR = 44100;
const hasFfmpeg = () => spawnSync('ffmpeg', ['-version']).status === 0;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ---- decode / encode ----
export function decode(file, ch = 1, hp = true) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, ...(hp ? ['-af', 'highpass=f=40'] : []), '-f', 'f32le', '-ac', String(ch), '-ar', String(SR), 'pipe:1'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`decode failed: ${String(r.stderr).slice(0, 200)}`);
  const b = r.stdout; return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice();
}
export function writeWav(file, pcm, ch = 1) {
  const n = pcm.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * ch * 4, 28); buf.writeUInt16LE(ch * 4, 32); buf.writeUInt16LE(32, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) buf.writeFloatLE(pcm[i], 44 + i * 4);
  fs.writeFileSync(file, buf);
}
function encodeMp3(wav, mp3, ch) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', ch === 2 ? '128k' : '96k', '-ac', String(ch), '-ar', String(SR), mp3]);
  if (r.status !== 0) throw new Error(`encode failed: ${String(r.stderr).slice(0, 200)}`);
}
// integrated loudness, momentary max and true peak (ebur128 with peak=true)
export function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { maxBuffer: 1 << 26 });
  const s = String(r.stderr);
  const I = +(s.match(/I:\s+(-?[\d.]+|-inf) LUFS/g) || []).pop()?.match(/(-?[\d.]+|-inf)/)[0] || -70;
  let mMax = -120; for (const m of s.matchAll(/ M:\s*(-?[\d.]+)/g)) mMax = Math.max(mMax, +m[1]);
  const tp = s.match(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf) dBFS/);
  return { integrated: Number.isFinite(I) ? I : -70, momentaryMax: mMax, truePeak: tp ? (tp[1] === '-inf' ? -120 : +tp[1]) : -120 };
}
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'json', file]);
  try { const j = JSON.parse(String(r.stdout)); return { codec: j.streams[0].codec_name, sampleRate: +j.streams[0].sample_rate, channels: +j.streams[0].channels, duration: +j.format.duration }; } catch { return null; }
}

// ---- PCM checks (mono or interleaved; checked on the mono mix) ----
function mono(pcm, ch) { if (ch === 1) return pcm; const m = new Float32Array(pcm.length / ch); for (let i = 0; i < m.length; i++) { let s = 0; for (let c = 0; c < ch; c++) s += pcm[i * ch + c]; m[i] = s / ch; } return m; }
const rms = (a, s = 0, e = a.length) => { let t = 0; for (let i = s; i < e; i++) t += a[i] * a[i]; return Math.sqrt(t / Math.max(1, e - s)); };
const db = (x) => 20 * Math.log10(Math.max(1e-9, x));
function hiEnergyFrac(m) {
  // energy above 8 kHz via a 2-pole high-pass (biquad) against the total
  const f = 8000 / SR, w = 2 * Math.PI * f, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.707);
  const b0 = (1 + cs) / 2, b1 = -(1 + cs), b2 = (1 + cs) / 2, a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, eh = 0, et = 0;
  for (let i = 0; i < m.length; i++) { const x = m[i], y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; eh += y * y; et += x * x; }
  return et > 0 ? eh / et : 0;
}
export function checkPcm(pcm, { ch = 1, loop = false, cls = 'soft' } = {}) {
  const m = mono(pcm, ch), n = m.length, flags = [], info = {};
  // clipping runs: ≥ 3 consecutive samples at |x| ≥ 0.999
  let run = 0, runs = 0; for (let i = 0; i < n; i++) { if (Math.abs(m[i]) >= 0.999) { run++; if (run === 3) runs++; } else run = 0; }
  info.clipRuns = runs; if (runs) flags.push('clipping');
  // silence: 10 ms frames under −50 dBFS
  const F = Math.round(SR * 0.01); let sil = 0, fr = 0; for (let i = 0; i + F <= n; i += F) { fr++; if (db(rms(m, i, i + F)) < -50) sil++; }
  info.silence = fr ? sil / fr : 1; if (info.silence > 0.8) flags.push('silence');
  // DC
  let dc = 0; for (let i = 0; i < n; i++) dc += m[i]; dc /= Math.max(1, n); info.dc = dc; if (Math.abs(dc) >= 0.005) flags.push('dc');
  // edges (one-shots only; a loop's edges are its seam)
  info.edges = Math.max(Math.abs(m[0] || 0), Math.abs(m[n - 1] || 0)); if (!loop && info.edges > 0.002) flags.push('edges');
  // clicks: second-difference spikes > 8× the local median (over 256-sample windows)
  const d2 = new Float32Array(n); for (let i = 1; i < n - 1; i++) d2[i] = Math.abs(m[i + 1] - 2 * m[i] + m[i - 1]);
  let clicks = 0; const W = 256;
  for (let s = 0; s < n; s += W) {
    const seg = Array.from(d2.subarray(s, Math.min(n, s + W))).sort((a, b) => a - b), med = seg[seg.length >> 1] || 0, top = seg[seg.length - 1] || 0;
    if (top > 8 * Math.max(med, 1e-4) && top > 0.05) clicks++;
  }
  info.clicks = clicks; if (clicks) flags.push('click');
  info.hiFrac = hiEnergyFrac(m); if (info.hiFrac > 0.1) flags.push('harsh');
  if (loop) {
    const S = Math.round(SR * 0.05), a = db(rms(m, n - S, n)), b = db(rms(m, 0, S)), jump = Math.abs(m[0] - m[n - 1]), slope = Math.abs((m[1] - m[0]) - (m[n - 1] - m[n - 2]));
    info.seam = { rmsDiffDb: +Math.abs(a - b).toFixed(2), jump: +jump.toFixed(4) };
    if (Math.abs(a - b) > 1.5 || jump > 0.05 + 4 * slope) flags.push('seam');
  }
  return { flags, info };
}

// ---- processing one take ----
const CEIL = (e) => (e.group === 'music' ? -2 : -3);
function equalPowerFades(pcm, ch, inMs, outMs) {
  const n = pcm.length / ch, a = Math.round(SR * inMs / 1000), b = Math.round(SR * outMs / 1000);
  for (let i = 0; i < Math.min(a, n); i++) { const g = Math.sin((i / a) * Math.PI / 2); for (let c = 0; c < ch; c++) pcm[i * ch + c] *= g; }
  for (let i = 0; i < Math.min(b, n); i++) { const g = Math.sin((i / b) * Math.PI / 2), j = n - 1 - i; for (let c = 0; c < ch; c++) pcm[j * ch + c] *= g; }
  for (let c = 0; c < ch; c++) { pcm[c] = 0; pcm[(n - 1) * ch + c] = 0; }
}
function trim(pcm, ch) {
  const n = pcm.length / ch, th = 0.003, pre = Math.round(SR * 0.005);
  let s = 0, e = n - 1; const amp = (i) => { let m = 0; for (let c = 0; c < ch; c++) m = Math.max(m, Math.abs(pcm[i * ch + c])); return m; };
  while (s < n && amp(s) < th) s++; while (e > s && amp(e) < th) e--;
  s = Math.max(0, s - pre); e = Math.min(n - 1, e + pre * 4);
  return pcm.slice(s * ch, (e + 1) * ch);
}
// loop repair: crossfade the last X samples into the first X (equal power) and drop the tail
function repairLoop(pcm, ch, xSec = 0.25) {
  const n = pcm.length / ch, X = Math.min(Math.round(SR * xSec), n >> 2), out = pcm.slice(0, (n - X) * ch);
  for (let i = 0; i < X; i++) { const t = i / X, gIn = Math.sin(t * Math.PI / 2), gOut = Math.cos(t * Math.PI / 2); for (let c = 0; c < ch; c++) out[i * ch + c] = pcm[i * ch + c] * gIn + pcm[(n - X + i) * ch + c] * gOut; }
  return out;
}
// [last 0.25 s | loop | first 0.25 s] so MP3 encoder delay never gaps; loopStart / loopEnd in seconds
function padLoop(pcm, ch, pad = 0.25) {
  const n = pcm.length / ch, P = Math.min(Math.round(SR * pad), n), out = new Float32Array((n + 2 * P) * ch);
  out.set(pcm.subarray((n - P) * ch), 0); out.set(pcm, P * ch); out.set(pcm.subarray(0, P * ch), (n + P) * ch);
  return { pcm: out, loopStart: P / SR, loopEnd: (P + n) / SR };
}
export function processTake(rawFile, e, outMp3, tmpDir = fs.mkdtempSync(path.join(OUT, 'tmp-'))) {
  const ch = e.channels || 1;
  let pcm = decode(rawFile, ch);
  const pre = checkPcm(pcm, { ch, loop: false, cls: e.class });
  const wav0 = path.join(tmpDir, 'a.wav'); writeWav(wav0, pcm, ch);
  const m0 = measure(wav0);
  if (pre.flags.includes('clipping')) return { ok: false, why: 'clipping' };
  if (pre.info.silence > 0.8) return { ok: false, why: 'silence' };
  if (m0.momentaryMax < -45) return { ok: false, why: 'too quiet' };
  let loopInfo = null;
  if (e.loop) {
    const c = checkPcm(pcm, { ch, loop: true });
    if (c.flags.includes('seam')) pcm = repairLoop(pcm, ch);
    const p = padLoop(pcm, ch); pcm = p.pcm; loopInfo = { loopStart: +p.loopStart.toFixed(4), loopEnd: +p.loopEnd.toFixed(4) };
  } else {
    pcm = trim(pcm, ch);
    const C = { soft: [20, 140], tick: [4, 45], voice: [10, 140], swell: [15, 500] }[e.class] || [10, 120];
    equalPowerFades(pcm, ch, C[0], C[1]);
  }
  // one −4 dB shelf at 8 kHz if > 12% of the energy is above it
  let filt = [];
  if (hiEnergyFrac(mono(pcm, ch)) > 0.12) filt.push('highshelf=f=8000:g=-4');
  const wav1 = path.join(tmpDir, 'b.wav'); writeWav(wav1, pcm, ch);
  const wav2 = path.join(tmpDir, 'c.wav');
  if (filt.length) { spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', wav1, '-af', filt.join(','), '-c:a', 'pcm_f32le', wav2]); } else fs.copyFileSync(wav1, wav2);
  // level to target, 1 dB under the true-peak ceiling
  const m1 = measure(wav2), cur = e.loudness && e.loudness.kind === 'integrated' ? m1.integrated : m1.momentaryMax, want = e.loudness ? e.loudness.target : -24;
  let gain = want - cur; const ceil = CEIL(e) - 1; if (m1.truePeak + gain > ceil) gain = ceil - m1.truePeak;
  const lv = decode(wav2, ch, false); for (let i = 0; i < lv.length; i++) lv[i] *= Math.pow(10, gain / 20);
  const wav3 = path.join(tmpDir, 'd.wav'); writeWav(wav3, lv, ch);
  encodeMp3(wav3, outMp3, ch);
  const m2 = measure(outMp3), pr = probe(outMp3), post = checkPcm(decode(outMp3, ch, false), { ch, loop: !!e.loop });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return { ok: true, loop: loopInfo, lufs: +(e.loudness && e.loudness.kind === 'integrated' ? m2.integrated : m2.momentaryMax).toFixed(2), truePeakDb: +m2.truePeak.toFixed(2), durationSec: pr ? +pr.duration.toFixed(3) : 0, probe: pr, checks: post, target: want, ceiling: CEIL(e) };
}

// ---- whole bake → audio/ + report ----
export async function postProcess() {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'sound-manifest.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(AUDIO, { recursive: true });
  const ff = hasFfmpeg(), ids = {}, report = { at: new Date().toISOString(), ffmpeg: ff, ids: {} };
  for (const e of man.ids) {
    const dir = path.join(RAW, e.id), raws = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort() : [];
    const variants = [];
    for (const r of raws) {
      if (variants.length >= (e.keep || 1)) break;
      const rawHash = r.split('-')[1].replace('.mp3', ''), file = `${e.id}/${variants.length}.mp3`, dst = path.join(AUDIO, file);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      if (!ff) { fs.copyFileSync(path.join(dir, r), dst); variants.push({ file, sha256: sha256(fs.readFileSync(dst)), source: 'elevenlabs', rawHash, processed: false, approved: false }); continue; }
      const p = processTake(path.join(dir, r), e, dst);
      if (!p.ok) { report.ids[e.id] = { ...(report.ids[e.id] || {}), rejected: [...((report.ids[e.id] || {}).rejected || []), { raw: r, why: p.why }] }; continue; }
      variants.push({ file, sha256: sha256(fs.readFileSync(dst)), durationSec: p.durationSec, lufs: p.lufs, truePeakDb: p.truePeakDb, source: 'elevenlabs', rawHash, approved: false, ...(p.loop || {}), checks: p.checks.flags });
    }
    ids[e.id] = { variants };
    report.ids[e.id] = { ...(report.ids[e.id] || {}), variants: variants.length, placeholder: variants.length === 0 };
  }
  const out = { version: 1, generatedAt: new Date().toISOString(), ids };
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(out, null, 1));
  report.summary = { ids: man.ids.length, generated: Object.values(ids).filter((x) => x.variants.length).length, placeholder: Object.values(ids).filter((x) => !x.variants.length).length };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`[audio-post] ${report.summary.ids} ids · ${report.summary.generated} generated · ${report.summary.placeholder} placeholder`);
  return 0;
}

// ---- approvals: only `approved` (and a rejected id falls back to placeholders) ----
export function applyApprovals(file, manifestPath = MANIFEST_OUT) {
  try {
    const ap = JSON.parse(fs.readFileSync(file, 'utf8')), man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let n = 0;
    for (const [id, marks] of Object.entries(ap.ids || ap)) {
      const e = man.ids[id]; if (!e) continue;
      for (const v of e.variants) { const k = marks[v.file] ?? marks[String(e.variants.indexOf(v))]; if (k === 'keep' || k === true) { v.approved = true; n++; } else if (k === 'reject' || k === false) { v.approved = false; v.rejected = true; n++; } }
    }
    fs.writeFileSync(manifestPath, JSON.stringify(man, null, 1));
    console.log(`[audio-post] applied ${n} approval marks`);
    return 0;
  } catch (err) { console.error(`[audio-post] approvals failed: ${String(err).slice(0, 200)}`); return 2; }
}

// ---- item 70: the pipeline without the API ----
export function selfTest() {
  const dir = fs.mkdtempSync(path.join(OUT, 'self-')), res = {};
  try {
    const tone = path.join(dir, 'tone.wav');
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=0.6:sample_rate=44100', '-af', 'volume=-6dB,afade=t=in:d=0.005,afade=t=out:st=0.55:d=0.05', '-c:a', 'pcm_f32le', tone]);
    const base = decode(tone, 1, false);
    const variants = {
      clean: base,
      clipped: base.map((x) => Math.max(-1, Math.min(1, x * 40))),
      silent: (() => { const a = new Float32Array(Math.round(SR * 6)); a.set(base.subarray(0, Math.round(SR * 0.5)), Math.round(SR * 2)); return a; })(),
      click: (() => { const a = base.slice(); a[Math.round(SR * 0.3)] += 0.8; return a; })(),
      dc: base.map((x) => x + 0.02),
    };
    for (const [k, v] of Object.entries(variants)) res[k] = checkPcm(v, { loop: false }).flags;
    // a 4 s loop with a hard seam: a 220 Hz tone whose level steps between start and end
    const L = Math.round(SR * 4), lp = new Float32Array(L); for (let i = 0; i < L; i++) lp[i] = Math.sin(2 * Math.PI * 220 * i / SR + 0.7) * (0.15 + 0.25 * i / L);
    res.loopBefore = checkPcm(lp, { loop: true }).flags;
    const lw = path.join(dir, 'loop.wav'); writeWav(lw, lp, 1);
    const out = path.join(dir, 'loop.mp3');
    const pl = processTake(lw, { id: 'test.loop', group: 'amb', class: 'loop', loop: true, channels: 1, loudness: { target: -30, kind: 'integrated' } }, out, fs.mkdtempSync(path.join(dir, 't')));
    if (!pl.ok) return { pass: false, res: { ...res, loop: pl } };
    // the repaired loop body (between loopStart and loopEnd) must pass the seam check
    const dec = decode(out, 1, false), d0 = Math.round(pl.loop.loopStart * SR) + 1105, d1 = Math.round(pl.loop.loopEnd * SR) + 1105;   // + LAME's decoder delay
    res.loopAfter = checkPcm(dec.subarray(d0, d1), { loop: true }).flags;
    const ct = path.join(dir, 'clean.mp3');
    const pc = processTake(tone, { id: 'test.tone', group: 'ui', class: 'soft', loop: false, channels: 1, loudness: { target: -25, kind: 'momentary-max' } }, ct, fs.mkdtempSync(path.join(dir, 't')));
    res.cleanProcessed = { lufs: pc.lufs, target: -25, truePeak: pc.truePeakDb, ceiling: -3, flags: pc.checks.flags };
    const pass = !res.clean.length && res.clipped.includes('clipping') && res.silent.includes('silence') && res.click.includes('click') && res.dc.includes('dc')
      && res.loopBefore.includes('seam') && !res.loopAfter.includes('seam') && Math.abs(pc.lufs + 25) <= 1 && pc.truePeakDb <= -3 && !pc.checks.flags.length;
    return { pass, res };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = process.argv.slice(2);
  if (a.includes('--self-test')) { fs.mkdirSync(OUT, { recursive: true }); const r = selfTest(); console.log(JSON.stringify(r)); process.exit(r.pass ? 0 : 1); }
  else if (a.includes('--apply-approvals')) process.exit(applyApprovals(a[a.indexOf('--apply-approvals') + 1]));
  else postProcess().then((c) => process.exit(c));
}
