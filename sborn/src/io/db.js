// db.js — IndexedDB `sborn` v1: the gallery (`creatures`) and the autosave (`autosave/current`), with a memory fallback.
// Exports: openStore() -> Promise<Store { ok, putCreature(e), getCreature(id), allCreatures(), delCreature(id),
//          putAutosave(v), getAutosave(), persist() }>, newId().
// Invariants: every call is wrapped in try/catch and resolves (never rejects); with IndexedDB blocked or throwing the
//   store keeps entries in memory for the session (`ok: false`), so the game works with storage blocked.
export const newId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function memoryStore() {
  const C = new Map(); let auto = null;
  return {
    ok: false,
    putCreature: async (e) => { C.set(e.id, e); return true; }, getCreature: async (id) => C.get(id) || null,
    allCreatures: async () => [...C.values()].sort((a, b) => b.updated - a.updated), delCreature: async (id) => C.delete(id),
    putAutosave: async (v) => { auto = v; return true; }, getAutosave: async () => auto, persist: async () => false,
  };
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function openStore() {
  let db = null;
  try {
    db = await new Promise((res, rej) => {
      const r = indexedDB.open('sborn', 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('creatures')) d.createObjectStore('creatures', { keyPath: 'id' }); if (!d.objectStoreNames.contains('autosave')) d.createObjectStore('autosave'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
      setTimeout(() => rej(new Error('timeout')), 4000);
    });
  } catch { return memoryStore(); }
  const mem = memoryStore();
  const tx = async (store, mode, fn) => { try { const t = db.transaction(store, mode); const out = await fn(t.objectStore(store)); await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); return out; } catch { return undefined; } };
  return {
    ok: true,
    putCreature: async (e) => (await tx('creatures', 'readwrite', (s) => req(s.put(e)))) !== undefined || mem.putCreature(e),
    getCreature: async (id) => (await tx('creatures', 'readonly', (s) => req(s.get(id)))) || null,
    allCreatures: async () => ((await tx('creatures', 'readonly', (s) => req(s.getAll()))) || []).sort((a, b) => b.updated - a.updated),
    delCreature: async (id) => (await tx('creatures', 'readwrite', (s) => req(s.delete(id)))) !== undefined,
    putAutosave: async (v) => (await tx('autosave', 'readwrite', (s) => req(s.put(v, 'current')))) !== undefined,
    getAutosave: async () => (await tx('autosave', 'readonly', (s) => req(s.get('current')))) || null,
    persist: async () => { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; } },
  };
}
