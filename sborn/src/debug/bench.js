// bench.js — `?bench`: 3 s warm-up, then 4 timed stages over 25 s (editor drag with remeshing every 100 ms on the 40-part
//   fixture, editor idle orbit, island walk on the bench path, photo hero frame); one big score, per-stage p50/p95, tier,
//   DPR and renderer; a tap copies the JSON (text-box fallback).
// Exports: runBench(api, app) -> Promise<{ score, stages, tier, dpr, renderer, ua, fullMs }>.
// Invariants: debug-only text (excluded from the no-words rule); frame times are rAF deltas of the live loop; score =
//   Σ w·min(1, 16.7/p95)·1000 + min(1, 40/full_ms)·250 with w = stage seconds / 25; container numbers are not device numbers.
import { FIXTURES } from '../catalog/fixtures.js';
import { BENCH_PATH } from '../play/island.js';
import { applyOp } from '../recipe/ops.js';

const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const frames = (secs, tick) => new Promise((res) => {
  const out = []; let last = 0, t0 = 0;
  const f = (now) => {
    if (!t0) t0 = now; else out.push(now - last);
    last = now;
    if (tick) tick(now - t0);
    if (now - t0 < secs * 1000) requestAnimationFrame(f); else res(out);
  };
  requestAnimationFrame(f);
});

export async function runBench(api, app) {
  const panel = document.createElement('div');
  panel.className = 'bench-panel';
  panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:70;background:rgba(255,248,236,.96);color:#3A2E5C;font:14px/1.4 ui-monospace,Menlo,monospace;padding:18px 22px;border-radius:20px;box-shadow:0 8px 30px rgba(58,46,92,.25);min-width:280px;text-align:center';
  panel.textContent = 'bench: warming up…';
  document.body.appendChild(panel);
  const say = (t) => { panel.textContent = t; };
  // the 40-part fixture in the editor
  api.load(FIXTURES.max40); await api.settle();
  await frames(3);
  const stages = [];
  // 1: editor drag, a preview remesh every 100 ms (the head vertebra's radius swings)
  say('bench: editor drag (5 s)');
  const base = api.recipe(), n = base.spine.v.length; let lastDrag = -1;
  const d1 = await frames(5, (ms) => { const k = Math.floor(ms / 100); if (k !== lastDrag) { lastDrag = k; app.preview(applyOp(base, 'spine.radius', { i: n - 1, r: base.spine.v[n - 1][2] * (1 + 0.15 * Math.sin(k * 0.7)) })); } });
  app.commit(base, 'bench'); await api.settle();
  stages.push({ name: 'editor-drag', secs: 5, d: d1 });
  // 2: editor idle orbit
  say('bench: editor idle (5 s)');
  stages.push({ name: 'editor-idle', secs: 5, d: await frames(5) });
  // 3: island walk on the bench path
  say('bench: island walk (10 s)');
  api.mode('play'); app.play.skipIntro();
  let wi = 1;
  const d3 = await frames(10, () => { const L = app.play.loco; if (!L) return; const [x, z] = BENCH_PATH[wi]; if (Math.hypot(L.state.x - x, L.state.z - z) < 0.5) wi = wi + 1 < BENCH_PATH.length ? wi + 1 : 1; app.play.drive.walkTo(BENCH_PATH[wi][0], BENCH_PATH[wi][1]); });
  stages.push({ name: 'island-walk', secs: 10, d: d3 });
  // 4: photo hero frame
  say('bench: photo (5 s)');
  api.mode('photo');
  stages.push({ name: 'photo-hero', secs: 5, d: await frames(5) });
  api.mode('build');
  const fullMs = app.creature.info().remeshMs || 0;
  const out = stages.map((s) => ({ name: s.name, p50: +pct(s.d, 0.5).toFixed(2), p95: +pct(s.d, 0.95).toFixed(2) }));
  const score = Math.round(stages.reduce((a, s, i) => a + (s.secs / 25) * Math.min(1, 16.7 / Math.max(1e-3, out[i].p95)) * 1000, 0) + Math.min(1, 40 / Math.max(1e-3, fullMs)) * 250);
  const gl = app.stage.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const res = { score, stages: out, tier: app.stage.tier, dpr: app.stage.renderer.getPixelRatio(), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), ua: navigator.userAgent, fullMs: +fullMs.toFixed(1) };
  panel.innerHTML = '';
  const big = document.createElement('div'); big.style.cssText = 'font:700 56px/1.1 Fredoka,ui-rounded,system-ui;margin-bottom:8px'; big.textContent = String(score);
  const lines = document.createElement('div'); lines.style.whiteSpace = 'pre'; lines.textContent = `${out.map((s) => `${s.name.padEnd(12)} p50 ${s.p50} p95 ${s.p95} ms`).join('\n')}\ntier ${res.tier} · dpr ${res.dpr} · full remesh ${res.fullMs} ms\n${res.renderer}\n(tap to copy)`;
  const box = document.createElement('textarea'); box.style.cssText = 'display:none;width:100%;height:110px;margin-top:8px;font:11px ui-monospace,monospace'; box.setAttribute('aria-label', 'Bench JSON');
  panel.append(big, lines, box);
  panel.onclick = async () => { const txt = JSON.stringify(res); try { if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard'); await navigator.clipboard.writeText(txt); lines.textContent += '\ncopied'; } catch { box.style.display = 'block'; box.value = txt; box.focus(); box.select(); } };
  api.benchResult = res;
  return res;
}
