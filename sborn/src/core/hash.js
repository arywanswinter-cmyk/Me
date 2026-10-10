// hash.js — FNV-1a and CRC32, written by hand because the LAN iPad has no crypto.subtle.
// Exports: fnv1a(str) -> uint32, fnv1aBytes(u8) -> uint32, fnv1aFloats(f32, h?) -> uint32, crc32(u8, start?) -> uint32,
//          hashSeed(seed, id) -> uint32 (per-part seeds).
// Invariants: pure, no allocation beyond the one CRC table built at import.
export function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c > 0x7f) { h ^= c >>> 8; h = Math.imul(h, 16777619); c &= 0xff; }
    h ^= c; h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fnv1aBytes(u8, h = 2166136261) {
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Hash floats by their exact bits, so "identical geometry" means bit-identical.
export function fnv1aFloats(f, h = 2166136261) {
  return fnv1aBytes(new Uint8Array(f.buffer, f.byteOffset, f.byteLength), h);
}

export function hashSeed(seed, id) { return fnv1a(`${seed >>> 0}:${id}`); }

const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  TABLE[n] = c >>> 0;
}
export function crc32(u8, start = 0xFFFFFFFF) {
  let c = start;
  for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
