// harness.js — the tiny async test registry shared by every *.test.js file.
// Exports: test(id, name, { milestone, items }, fn), ok(cond, msg), near(a, b, eps, msg), registry, T (thresholds).
// Invariants: ids are C<nn>.<slug> (checklist) or M<k>.<slug> (milestone-only); fn may be async and may return a note.
export { T } from './thresholds.js';
export const registry = [];
export function test(id, name, meta, fn) { registry.push({ id, name, milestone: meta.milestone ?? 0, items: meta.items ?? [], fn, timeout: meta.timeout ?? 120000 }); }
export function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
export function near(a, b, eps, msg) { if (!(Math.abs(a - b) <= eps)) throw new Error(`${msg || 'value'}: ${a} vs ${b} ± ${eps}`); }
// Measured metrics ([M] items): saved by run-tests.cjs as tools/out/<name>.json.
export const metrics = {};
export function metric(name, obj) { metrics[name] = obj; if (typeof window !== 'undefined') window.__metrics = metrics; }
