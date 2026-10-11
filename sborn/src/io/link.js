// link.js — the share link: `index.html#c=1.<base64url(deflate-raw(canonical JSON))>`, unpadded.
// Exports: encodeLink(recipe) -> Promise<string hash>, decodeLink(hash) -> Promise<{ ok, recipe?, why? }>, b64u, unb64u.
// Invariants: decoding never throws: wrong version, bad characters, corrupt deflate, a > 64 KB inflation or bad JSON all
//   come back as { ok: false, why }; validation and migration are the caller's (recipe/schema.js).
import { canonicalJSON } from '../recipe/schema.js';
import { deflate, inflate } from './png.js';

export function b64u(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function unb64u(str) {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('chars');
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out;
}
export async function encodeLink(recipe) { return `#c=1.${b64u(await deflate(new TextEncoder().encode(canonicalJSON(recipe)), 'deflate-raw'))}`; }
export async function decodeLink(hash) {
  try {
    const m = /^#?c=(\d+)\.(.*)$/.exec(hash || ''); if (!m) return { ok: false, why: 'not a link' };
    if (m[1] !== '1') return { ok: false, why: 'version' };
    if (m[2].length > 90000) return { ok: false, why: 'too long' };
    const bytes = unb64u(m[2]);
    const txt = new TextDecoder().decode(await inflate(bytes, 'deflate-raw', 65536));
    return { ok: true, recipe: JSON.parse(txt) };
  } catch (e) { return { ok: false, why: String(e && e.message || e).slice(0, 60) }; }
}
