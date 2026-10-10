// builders.js — parametric part builders: build(type, params, lod, R) -> { pieces: [{geo, mat, bone}], tips, radius, top }.
// Exports: BUILDERS (type → fn), buildPart(type, p, lod, R) (cached by type, quantized params, lod and size), PIECE_MATS.
// Invariants: pure functions of their inputs (cached); part space: +Y out of the skin, +Z creature-forward, origin at the
//   sunk base; every tooth, horn, claw, spike and beak tip ends in a hemisphere with r ≥ 0.15 × base radius; bones are
//   'socket', 'jaw', 'ball', 'lidU', 'lidL' (pivots given in `hinges`).

export const PIECE_MATS = ['skin', 'keratin', 'mouth', 'teeth', 'tongue', 'eye', 'membrane', 'shell', 'ink'];

import { MOUTHS } from './mouths.js';
import { EYES } from './eyes.js';
import { FEET } from './feet.js';
import { HANDS } from './hands.js';
import { WINGS } from './wings.js';
import { TAILS } from './tails.js';
import { FINS } from './fins.js';
import { DETAILS } from './details.js';

export const BUILDERS = { ...MOUTHS, ...EYES, ...FEET, ...HANDS, ...WINGS, ...TAILS, ...FINS, ...DETAILS };

const cache = new Map();
export function buildPart(type, p, lod = 0, R = 0.05) {
  const b = BUILDERS[type];
  if (!b) return null;
  const key = `${type}|${lod}|${R.toFixed(4)}|${Object.keys(p).sort().map((k) => `${k}:${(+p[k]).toFixed(3)}`).join(',')}`;
  let out = cache.get(key);
  if (!out) {
    out = b(p, lod, R);
    for (const pc of out.pieces) { pc.geo.computeBoundingSphere(); }
    out.tris = out.pieces.reduce((a, pc) => a + pc.geo.index.count / 3, 0);
    cache.set(key, out);
    if (cache.size > 600) cache.delete(cache.keys().next().value);
  }
  return out;
}
