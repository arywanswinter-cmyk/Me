// history.js — undo/redo of frozen recipes with labels and selections.
// Exports: createHistory({ maxEntries, maxBytes }) -> { commit(recipe, label, sel, { coalesceKey }), undo(), redo(), canUndo, canRedo,
//          current(), size(), bytes(), reset(recipe), tail(n), restoreTail(list) }.
// Invariants: entries are frozen deep copies (1–3 KB each); wheel/pinch commits with the same coalesceKey within 400 ms
//   replace the previous entry; capped at 100 entries or 2 MB (oldest dropped first).
export function createHistory({ maxEntries = 100, maxBytes = 2 * 1024 * 1024, now = () => performance.now() } = {}) {
  let stack = [], idx = -1, bytes = 0, lastKey = null, lastT = -1e9;
  const freeze = (r) => { const s = JSON.stringify(r); return { json: s, size: s.length }; };
  function reset(recipe, label = 'start') {
    const f = freeze(recipe);
    stack = [{ label, json: f.json, size: f.size, sel: null }]; idx = 0; bytes = f.size; lastKey = null;
  }
  function commit(recipe, label = 'edit', sel = null, { coalesceKey = null } = {}) {
    const f = freeze(recipe);
    if (stack[idx] && stack[idx].json === f.json) return false;
    for (let i = idx + 1; i < stack.length; i++) bytes -= stack[i].size;
    stack.length = idx + 1;
    const t = now();
    if (coalesceKey && coalesceKey === lastKey && t - lastT < 400 && idx > 0) {
      bytes -= stack[idx].size; stack[idx] = { label, json: f.json, size: f.size, sel };
    } else { stack.push({ label, json: f.json, size: f.size, sel }); idx++; }
    bytes += f.size; lastKey = coalesceKey; lastT = t;
    while (stack.length > maxEntries || (bytes > maxBytes && stack.length > 1)) { bytes -= stack[0].size; stack.shift(); idx--; }
    return true;
  }
  const get = (i) => ({ recipe: JSON.parse(stack[i].json), label: stack[i].label, sel: stack[i].sel });
  function undo() { if (idx <= 0) return null; const label = stack[idx].label; idx--; lastKey = null; return { ...get(idx), undone: label }; }
  function redo() { if (idx >= stack.length - 1) return null; idx++; lastKey = null; return { ...get(idx), redone: stack[idx].label }; }
  // after a reload: the autosaved tail (oldest first, the last entry equal to the current recipe) becomes the stack
  function restoreTail(list) {
    if (!Array.isArray(list) || !list.length) return false;
    stack = list.map((e) => ({ label: e.label, json: e.json, size: e.json.length, sel: null })); idx = stack.length - 1; bytes = stack.reduce((a, e) => a + e.size, 0); lastKey = null;
    return true;
  }
  return {
    reset, commit, undo, redo, restoreTail,
    get canUndo() { return idx > 0; }, get canRedo() { return idx < stack.length - 1; },
    current: () => (idx >= 0 ? get(idx) : null), size: () => stack.length, bytes: () => bytes, index: () => idx,
    tail: (n = 20) => stack.slice(Math.max(0, idx - n + 1), idx + 1).map((e) => ({ label: e.label, json: e.json })),
  };
}
