// png.js — the recipe inside a PNG, twice: an iTXt chunk (zlib JSON) and an LSB copy in the bottom 64 rows' R, G, B.
// Exports: crc32(bytes), deflate(bytes, fmt), inflate(bytes, fmt, cap), embedITXt(png, recipe) -> Uint8Array,
//          readITXt(png) -> recipe|null, writeLSB(imageData, recipe) -> bool, readLSB(imageData) -> recipe|null,
//          readRecipeFromPng(blob|bytes) -> recipe|null (iTXt first, then LSB), KEYWORD.
// Invariants: keyword `Sborn.creature`, compression flag 1, own CRC32; LSB layout "SBRN" | ver | len16 | deflate-raw |
//   CRC32, written 3× and majority-decoded, never in alpha; inflation is capped at 64 KB; nothing throws to the caller.
import { canonicalJSON } from '../recipe/schema.js';

export const KEYWORD = 'Sborn.creature';
const CAP = 65536;
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b, start = 0, end = b.length) { let c = 0xFFFFFFFF; for (let i = start; i < end; i++) c = TABLE[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

async function pump(stream, bytes, cap = Infinity) {
  const w = stream.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {});
  const r = stream.readable.getReader(), parts = []; let n = 0;
  for (;;) { const { value, done } = await r.read(); if (done) break; parts.push(value); n += value.length; if (n > cap) { r.cancel().catch(() => {}); throw new Error('inflate cap'); } }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
export const deflate = (bytes, fmt = 'deflate') => pump(new CompressionStream(fmt), bytes);
export const inflate = (bytes, fmt = 'deflate', cap = CAP) => pump(new DecompressionStream(fmt), bytes, cap);
const enc = new TextEncoder(), dec = new TextDecoder();
const be32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const rd32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

// ---- iTXt ----
export async function embedITXt(png, recipe) {
  const z = await deflate(enc.encode(canonicalJSON(recipe)), 'deflate');
  const head = enc.encode(KEYWORD);
  const data = new Uint8Array(head.length + 5 + z.length);
  data.set(head, 0); let o = head.length; data[o++] = 0; data[o++] = 1; data[o++] = 0; data[o++] = 0; data[o++] = 0;   // keyword\0, flag 1, method 0, no language, no translation
  data.set(z, o);
  const chunk = new Uint8Array(12 + data.length);
  chunk.set(be32(data.length), 0); chunk.set(enc.encode('iTXt'), 4); chunk.set(data, 8);
  chunk.set(be32(crc32(chunk, 4, 8 + data.length)), 8 + data.length);
  const ihdrEnd = 8 + 12 + rd32(png, 8);                               // signature + IHDR (length 13)
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd), 0); out.set(chunk, ihdrEnd); out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}
export async function readITXt(png) {
  try {
    let i = 8;
    while (i + 12 <= png.length) {
      const len = rd32(png, i), type = dec.decode(png.subarray(i + 4, i + 8));
      if (type === 'iTXt') {
        const d = png.subarray(i + 8, i + 8 + len), k = d.indexOf(0);
        if (dec.decode(d.subarray(0, k)) === KEYWORD && crc32(png, i + 4, i + 8 + len) === rd32(png, i + 8 + len)) {
          const flag = d[k + 1]; let o = k + 3; o = d.indexOf(0, o) + 1; o = d.indexOf(0, o) + 1;
          const body = d.subarray(o);
          const txt = flag ? dec.decode(await inflate(body, 'deflate')) : dec.decode(body);
          return JSON.parse(txt);
        }
      }
      if (type === 'IEND') break;
      i += 12 + len;
    }
  } catch { /* fall through */ }
  return null;
}

// ---- LSB (bottom 64 rows, R G B low bits, 3 copies) ----
function lsbSpan(img) { const rows = Math.min(64, img.height), y0 = img.height - rows; return { y0, bits: rows * img.width * 3 }; }
function bitIndexToByte(img, y0, k) { const px = Math.floor(k / 3), ch = k % 3; const x = px % img.width, y = y0 + Math.floor(px / img.width); return (y * img.width + x) * 4 + ch; }
export async function writeLSB(img, recipe) {
  try {
    const z = await deflate(enc.encode(canonicalJSON(recipe)), 'deflate-raw');
    const pay = new Uint8Array(4 + 1 + 2 + z.length + 4);
    pay.set(enc.encode('SBRN'), 0); pay[4] = 1; pay[5] = (z.length >>> 8) & 255; pay[6] = z.length & 255; pay.set(z, 7); pay.set(be32(crc32(z)), 7 + z.length);
    const { y0, bits } = lsbSpan(img), per = Math.floor(bits / 3);
    if (pay.length * 8 > per || z.length > 65535) return false;          // too big: iTXt only (logged by the caller)
    const d = img.data;
    for (let c = 0; c < 3; c++) for (let k = 0; k < pay.length * 8; k++) {
      const bit = (pay[k >> 3] >> (7 - (k & 7))) & 1, j = bitIndexToByte(img, y0, c * per + k);
      d[j] = (d[j] & 254) | bit;
    }
    return true;
  } catch { return false; }
}
export async function readLSB(img) {
  try {
    const { y0, bits } = lsbSpan(img), per = Math.floor(bits / 3), d = img.data;
    const byteAt = (n) => { let v = 0; for (let b = 0; b < 8; b++) { const k = n * 8 + b; let s = 0; for (let c = 0; c < 3; c++) s += d[bitIndexToByte(img, y0, c * per + k)] & 1; v = (v << 1) | (s >= 2 ? 1 : 0); } return v; };
    if (String.fromCharCode(byteAt(0), byteAt(1), byteAt(2), byteAt(3)) !== 'SBRN') return null;
    const len = (byteAt(5) << 8) | byteAt(6);
    if (7 + len + 4 > per / 8) return null;
    const z = new Uint8Array(len); for (let i = 0; i < len; i++) z[i] = byteAt(7 + i);
    const crc = ((byteAt(7 + len) << 24) | (byteAt(8 + len) << 16) | (byteAt(9 + len) << 8) | byteAt(10 + len)) >>> 0;
    if (crc !== crc32(z)) return null;
    return JSON.parse(dec.decode(await inflate(z, 'deflate-raw')));
  } catch { return null; }
}
export async function readRecipeFromPng(src) {
  try {
    const blob = src instanceof Blob ? src : new Blob([src], { type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const a = await readITXt(bytes); if (a) return a;
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    return await readLSB(g.getImageData(0, 0, bmp.width, bmp.height));
  } catch { return null; }
}
