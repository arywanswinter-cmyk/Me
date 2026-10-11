// overlay.js — the ?debug panel: frame timings, renderer counters, tier, remesh and audio status, with a copy-JSON button.
// Exports: createFrameStats() -> { begin(), simEnd(), end(), p50, p95, fps, cpuSim, cpuSubmit, reset() }, createOverlay(getData) -> { update(), el, data() }.
// Invariants: debug-only text (excluded from the no-words rule); copy uses navigator.clipboard when allowed, otherwise
//   shows a selectable text box; console.log is allowed here.
export function createFrameStats(n = 240) {
  const dts = new Float32Array(n), sims = new Float32Array(n), subs = new Float32Array(n);
  let i = 0, count = 0, tStart = 0, tSim = 0, last = 0;
  const pct = (a, k, p) => { const s = Array.from(a.subarray(0, Math.min(k, n))).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
  return {
    begin() { const now = performance.now(); if (last) { dts[i] = now - last; } last = now; tStart = now; },
    simEnd() { tSim = performance.now(); sims[i] = tSim - tStart; },
    end() { subs[i] = performance.now() - tSim; i = (i + 1) % n; count++; },
    get p50() { return pct(dts, count, 0.5); }, get p95() { return pct(dts, count, 0.95); }, get p90() { return pct(dts, count, 0.9); },
    get fps() { const m = pct(dts, count, 0.5); return m ? 1000 / m : 0; },
    get cpuSim() { return pct(sims, count, 0.5); }, get cpuSubmit() { return pct(subs, count, 0.5); },
    frames: () => Array.from(dts.subarray(0, Math.min(count, n))),
    reset() { i = 0; count = 0; last = 0; },
  };
}

export function createOverlay(getData) {
  const el = document.createElement('div');
  el.className = 'debug-overlay';
  el.style.cssText = 'position:fixed;right:8px;bottom:90px;z-index:60;background:rgba(255,248,236,.94);color:#3A2E5C;font:12px/1.35 ui-monospace,Menlo,monospace;padding:10px 12px;border-radius:14px;box-shadow:rgba(58,46,92,.18) 0 6px 16px;max-width:300px;white-space:pre;pointer-events:auto';
  const pre = document.createElement('div'); pre.style.cssText = 'overflow:hidden;text-overflow:ellipsis';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.textContent = 'copy JSON'; btn.setAttribute('aria-label', 'Copy debug JSON');
  btn.style.cssText = 'margin-top:6px;min-width:44px;min-height:44px;border-radius:12px;border:0;background:#FF7A59;color:#3A2E5C;font:600 13px system-ui';
  const box = document.createElement('textarea');
  box.style.cssText = 'display:none;width:270px;height:120px;margin-top:6px;font:11px ui-monospace,monospace';
  box.setAttribute('aria-label', 'Debug JSON');
  el.append(pre, btn, box);
  document.body.appendChild(el);
  btn.onclick = async () => {
    const txt = JSON.stringify(getData());
    try { if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard'); await navigator.clipboard.writeText(txt); btn.textContent = 'copied'; }
    catch { box.style.display = 'block'; box.value = txt; box.focus(); box.select(); }
  };
  function update() {
    const d = getData();
    pre.textContent = Object.entries(d).map(([k, v]) => `${k.padEnd(13)} ${typeof v === 'number' ? (Math.round(v * 100) / 100) : JSON.stringify(v)}`).join('\n');
  }
  return { el, update, data: getData, button: btn, box };
}
