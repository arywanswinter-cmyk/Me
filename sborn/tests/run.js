// run.js — runs the registered tests in order and writes window.__results; tests.html?group=<name> picks one file.
// Exports: nothing.
// Invariants: the page title reads "running…" until every async test settles, then
//   "ALL PASS" or "FAIL"; the h1 reads "ALL PASS · n/n" (title contract from Doodle World src/tests/run.js).
import { registry } from './harness.js';

export const GROUPS = ['core', 'recipe', 'mesher', 'rig', 'catalog', 'render', 'paint', 'anim', 'play', 'audio', 'io', 'editor'];
const q = new URLSearchParams(location.search);
const only = q.get('group');
const groups = only ? only.split(',') : GROUPS;
const out = document.getElementById('out');
const results = [];
window.__results = results;
window.__done = false;

async function main() {
  for (const g of groups) {
    try { await import(`./${g}.test.js`); }
    catch (e) { if (only || !/Failed to fetch|Cannot find|404|Importing a module script failed/.test(String(e))) results.push({ id: `load.${g}`, name: `load ${g}.test.js`, milestone: 0, items: [], pass: false, ms: 0, note: String(e && e.message || e) }); }
  }
  for (const t of registry) {
    const t0 = performance.now();
    let pass = false, note = '';
    try {
      const r = await Promise.race([Promise.resolve().then(t.fn), new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${t.timeout} ms`)), t.timeout))]);
      pass = true; note = r == null ? '' : typeof r === 'string' ? r : JSON.stringify(r);
    } catch (e) { note = String(e && e.message || e); }
    results.push({ id: t.id, name: t.name, milestone: t.milestone, items: t.items, pass, ms: Math.round(performance.now() - t0), note });
    render(false);
  }
  render(true);
}
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function render(final) {
  const pass = results.every((r) => r.pass);
  const n = results.filter((r) => r.pass).length;
  if (final) { document.title = pass && results.length ? 'ALL PASS' : 'FAIL'; window.__done = true; }
  out.innerHTML = `<h1 class="${pass ? 'p' : 'f'}">${final ? (pass && results.length ? 'ALL PASS' : 'FAIL') : 'running…'} · ${n}/${results.length}</h1>` +
    results.map((r) => `<div class="${r.pass ? 'p' : 'f'}">${r.pass ? '✓' : '✗'} ${esc(r.id)} ${esc(r.name)}<span>${esc(r.note).slice(0, 400)} · ${r.ms} ms</span></div>`).join('');
}
main().catch((e) => { results.push({ id: 'harness', name: 'harness', milestone: 0, items: [], pass: false, ms: 0, note: String(e) }); render(true); });
