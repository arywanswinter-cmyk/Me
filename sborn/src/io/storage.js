// storage.js — persistence: the synchronous localStorage mirror of the current recipe (IndexedDB gallery arrives in M10).
// Exports: saveMirror(recipe) -> bytes|0, loadMirror() -> recipe|null, MIRROR_KEY.
// Invariants: every call is wrapped in try/catch so the game works with storage blocked; the mirror stays ≤ 16 KB.
export const MIRROR_KEY = 'sborn.current';
export function saveMirror(recipe) {
  try { const s = JSON.stringify(recipe); if (s.length > 16384) return 0; localStorage.setItem(MIRROR_KEY, s); return s.length; } catch { return 0; }
}
export function loadMirror() {
  try { const s = localStorage.getItem(MIRROR_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
