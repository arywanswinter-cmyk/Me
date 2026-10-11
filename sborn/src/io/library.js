// library.js — every creature is a gallery entry from its first edit: autosave 800 ms after each commit (entry + autosave
//   record), flush on hide, entry switching that undo and redo follow, turntable strips rendered at quiet moments.
// Exports: createLibrary(app, { store, history }) -> { entryId, committed(recipe, label), flush(), switchTo(recipe, { id, label }),
//          onUndo(u), onRedo(u), quiet(), entries(), strip(id), starterStrip(key), remove(id), restore(entry), duplicate(entry) }.
// Invariants: 'new' and 'load' commits start a new entry (starters, cards and links are copies, never edited in place);
//   undoing one returns to the previous entry, so autosave never writes one creature into another's entry; the entry
//   id survives reloads (localStorage `sborn.entry`, try/catch); strips are keyed by recipe hash and re-rendered only when stale.
import { newId } from './db.js';
import { recipeHash } from '../recipe/schema.js';

export function createLibrary(app, { store, history }) {
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let entryId = ls.get('sborn.entry') || newId(); ls.set('sborn.entry', entryId);
  const back = [], fwd = [];                 // entry switches recorded with the history label that made them
  let timer = null, dirty = false, lastRecipe = null;
  const strips = new Map();                  // id -> { blob, hash }
  const starterStrips = new Map();
  async function save() {
    timer = null; if (!lastRecipe) return;
    dirty = false;
    const prev = await store.getCreature(entryId);
    const s = strips.get(entryId) || (prev && prev.thumbStrip ? { blob: prev.thumbStrip, hash: prev.thumbHash } : null);
    await store.putCreature({ id: entryId, name: lastRecipe.name, recipe: lastRecipe, updated: Date.now(), thumbStrip: s ? s.blob : null, thumbHash: s ? s.hash : 0 });
    await store.putAutosave({ recipe: lastRecipe, undoTail: history.tail ? history.tail(20) : [], entryId });
  }
  function committed(recipe, label) {
    lastRecipe = recipe; dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 800);
  }
  function flush() { if (timer) { clearTimeout(timer); timer = null; } if (dirty) return save(); return Promise.resolve(); }
  // a new entry (New, a starter, a card, a link, a gallery entry): the old one stays on the shelf
  async function switchTo(recipe, { id = newId(), label = 'load' } = {}) {
    await flush();
    back.push(entryId); fwd.length = 0;
    entryId = id; ls.set('sborn.entry', entryId);
    app.commit(recipe, label);
  }
  function onUndo(u) { if (u && (u.undone === 'new' || u.undone === 'load') && back.length) { flush(); fwd.push(entryId); entryId = back.pop(); ls.set('sborn.entry', entryId); } }
  function onRedo(u) { if (u && (u.redone === 'new' || u.redone === 'load') && fwd.length) { flush(); back.push(entryId); entryId = fwd.pop(); ls.set('sborn.entry', entryId); } }
  // quiet moment: (re)render the current entry's strip if its recipe changed
  let busy = false;
  async function quiet() {
    if (busy || !app.exporter || !app.creature.skin) return false;
    const r = app.recipe(), h = recipeHash(r), cur = strips.get(entryId);
    if (cur && cur.hash === h) return false;
    busy = true;
    try {
      const blob = await app.exporter.turntable();
      strips.set(entryId, { blob, hash: h });
      lastRecipe = r; dirty = true; await save();
      return true;
    } finally { busy = false; }
  }
  async function entries() { await flush(); return store.allCreatures(); }
  async function starterStrip(key, recipe) {
    if (starterStrips.has(key)) return starterStrips.get(key);
    const blob = app.exporter ? await app.exporter.turntableFor(recipe) : null;
    if (blob) starterStrips.set(key, blob);
    return blob;
  }
  async function remove(id) { const e = await store.getCreature(id); await store.delCreature(id); return e; }
  async function restore(e) { if (e) await store.putCreature(e); }
  async function duplicate(e) { const c = { ...e, id: newId(), updated: Date.now() }; await store.putCreature(c); return c; }
  return { get entryId() { return entryId; }, committed, flush, switchTo, onUndo, onRedo, quiet, entries, starterStrip, remove, restore, duplicate, strips, store };
}
