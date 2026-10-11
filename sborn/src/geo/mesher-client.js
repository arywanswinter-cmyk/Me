// mesher-client.js — two module workers (preview, full), each with one job in flight and one pending slot.
// Exports: createMesher({ onResult, workers }) -> { request(kind, quality, input) -> jobId, idle() -> Promise, stats, runSync(input, quality) }.
// Invariants: a newer request overwrites the pending one; replies older than the last applied jobId are dropped;
//   falls back to the main thread (same code, same output) when module workers are unavailable.
import { runJob } from './mesher.js';

export function createMesher({ onResult, workers = true } = {}) {
  let nextId = 1;
  const stats = { requested: 0, applied: 0, dropped: 0, lastApplied: 0, lastRequested: 0, worker: false, errors: 0 };
  const lanes = {};
  const waiters = [];
  function makeLane(name) {
    let w = null;
    if (workers) {
      try { w = new Worker(new URL('./mesher-worker.js', import.meta.url), { type: 'module' }); stats.worker = true; }
      catch { w = null; }
    }
    const lane = { name, w, busy: null, pending: null, lastApplied: 0 };
    if (w) {
      w.onmessage = (e) => finish(lane, e.data);
      w.onerror = (e) => { stats.errors++; lane.w = null; e.preventDefault && e.preventDefault(); const job = lane.busy; lane.busy = null; if (job) run(lane, job); };
    }
    return lane;
  }
  function finish(lane, msg) {
    const job = lane.busy; lane.busy = null;
    if (msg.error) { stats.errors++; console.warn('mesher', msg.error.slice(0, 200)); }
    else if (msg.jobId > lane.lastApplied) {
      lane.lastApplied = msg.jobId; stats.applied++; stats.lastApplied = msg.jobId;
      try { onResult && onResult(msg.result, { jobId: msg.jobId, kind: lane.name, tag: job && job.tag }); } catch (err) { console.warn(err); }
    } else stats.dropped++;
    if (lane.pending) { const j = lane.pending; lane.pending = null; run(lane, j); }
    checkIdle();
  }
  function run(lane, job) {
    lane.busy = job;
    if (lane.w) lane.w.postMessage({ jobId: job.jobId, quality: job.quality, input: job.input });
    else setTimeout(() => {
      let msg;
      try { const t0 = performance.now(); const result = runJob(job.input, job.quality); result.ms.worker = performance.now() - t0; msg = { jobId: job.jobId, result }; }
      catch (err) { msg = { jobId: job.jobId, error: String(err) }; }
      finish(lane, msg);
    }, 0);
  }
  function request(kind, quality, input, tag = null) {
    const lane = lanes[kind] || (lanes[kind] = makeLane(kind));
    const job = { jobId: nextId++, quality, input, tag };
    stats.requested++; stats.lastRequested = job.jobId;
    if (lane.busy) { if (lane.pending) stats.dropped++; lane.pending = job; }
    else run(lane, job);
    return job.jobId;
  }
  function busy() { return Object.values(lanes).some((l) => l.busy || l.pending); }
  function checkIdle() { if (!busy()) while (waiters.length) waiters.shift()(); }
  function idle() { return busy() ? new Promise((r) => waiters.push(r)) : Promise.resolve(); }
  function dispose() { for (const l of Object.values(lanes)) if (l.w) l.w.terminate(); }
  return { request, idle, busy, stats, dispose, runSync: (input, quality) => runJob(input, quality) };
}
