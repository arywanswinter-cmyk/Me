// mesher-worker.js — module worker running skin jobs off the main thread.
// Exports: nothing (message protocol: in {jobId, quality, input} → out {jobId, result} with transferred buffers).
// Invariants: imports relative paths only (workers cannot see the import map, never `three`); one job at a time.
import { runJob } from './mesher.js';

self.onmessage = (e) => {
  const { jobId, quality, input } = e.data;
  try {
    const t0 = performance.now();
    const result = runJob(input, quality);
    result.ms.worker = performance.now() - t0;
    const tr = [];
    for (const k of ['position', 'normal', 'index', 'aDomain', 'aDomain2', 'aPaint', 'aSkin', 'skinIndex', 'skinWeight']) if (result[k]) tr.push(result[k].buffer);
    self.postMessage({ jobId, result }, tr);
  } catch (err) {
    self.postMessage({ jobId, error: String(err && err.stack || err) });
  }
};
