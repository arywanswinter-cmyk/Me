// grain.js — procedural paper grain shared by the drawing sheet and the 3D floor.
// Exports: makeGrain(size, seed) -> { css: canvas (transparent ink specks), mul: canvas (near-white, for multiplying) }.
// Invariant: deterministic for a seed; tiles seamlessly because every pixel is independent.
import { mulberry32 } from './rng.js';

export function makeGrain(size = 256, seed = 7) {
  const rnd = mulberry32(seed);
  const css = document.createElement('canvas');
  const mul = document.createElement('canvas');
  css.width = css.height = mul.width = mul.height = size;
  const a = css.getContext('2d').createImageData(size, size);
  const b = mul.getContext('2d').createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const r = rnd();
    const speck = r * r * r * r;
    const j = i * 4;
    a.data[j] = 58; a.data[j + 1] = 54; a.data[j + 2] = 48; a.data[j + 3] = Math.round(speck * 30);
    const v = 255 - speck * 16;
    b.data[j] = v; b.data[j + 1] = v - speck * 2; b.data[j + 2] = v - speck * 5; b.data[j + 3] = 255;
  }
  css.getContext('2d').putImageData(a, 0, 0);
  mul.getContext('2d').putImageData(b, 0, 0);
  return { css, mul };
}
