// recipe.test.js — schema (quantize, canonical JSON, hash, validate, migrate) and undo history.
// Exports: nothing (registers tests).
// Invariants: pure; no WebGL.
import { test, ok, T } from './harness.js';
import { newRecipe, quantize, canonicalJSON, recipeHash, canonicalEqual, validate, MIGRATE } from '../src/recipe/schema.js';
import { applyOp } from '../src/recipe/ops.js';
import { createHistory } from '../src/recipe/history.js';
import { mulberry32 } from '../src/core/rng.js';
import { partTypes } from '../src/catalog/parts.js';
import { FIXTURES } from '../src/catalog/fixtures.js';

test('C63.quantize', 'quantize is idempotent; canonical JSON round-trips byte-identical', { milestone: 1, items: [63] }, () => {
  for (const r of [newRecipe(), ...Object.values(FIXTURES)]) {
    const a = quantize(r), b = quantize(a);
    ok(canonicalJSON(a) === canonicalJSON(b), `${r.name} not idempotent`);
    const s = canonicalJSON(a);
    ok(canonicalJSON(JSON.parse(s)) === s, `${r.name} round trip`);
    ok(canonicalEqual(r, JSON.parse(JSON.stringify(r))), 'canonical equal');
  }
  const r = newRecipe(); r.spine.v[0][0] = 0.4504999; ok(quantize(r).spine.v[0][0] === 0.45, 'rounds to mm');
});
test('C63.hash-stable', 'hash is a fixed FNV-1a of canonical JSON (stable across reloads)', { milestone: 1, items: [63] }, () => {
  const h = recipeHash(newRecipe());
  ok(h === recipeHash(JSON.parse(JSON.stringify(newRecipe()))), 'same');
  try { const prev = localStorage.getItem('sborn.test.bloopHash'); localStorage.setItem('sborn.test.bloopHash', String(h)); if (prev) ok(+prev === h, `hash changed across reload ${prev} → ${h}`); } catch {}
  return `bloop ${h}`;
});
test('C63.validate', 'validate clamps, repairs duplicate ids, warns on unknown types, migrates v0, loads over-budget', { milestone: 1, items: [63] }, () => {
  const r = newRecipe();
  r.spine.v[2][2] = 9; r.parts.push({ ...r.parts[0] }); r.parts.push({ id: 'P9', t: 'nope.thing', at: { b: 'spine', u: 0.5, d: [0, 1, 0] } });
  const { recipe, warnings } = validate(r, { partTypes });
  ok(recipe.spine.v[2][2] === 0.6, `clamp ${recipe.spine.v[2][2]}`);
  ok(new Set(recipe.parts.map((p) => p.id)).size === recipe.parts.length, 'dup ids repaired');
  ok(warnings.some((w) => /unknown part/.test(w)), 'unknown → warning');
  const v0 = { v: 0, name: 'Old', seed: 3, spine: [{ y: 0.4, z: -0.2, r: 0.2 }, { y: 0.4, z: 0, r: 0.25 }, { y: 0.4, z: 0.2, r: 0.2 }], color: '#5CC86F' };
  const m = validate(v0, { partTypes }).recipe;
  ok(m.v === 1 && m.spine.v.length === 3 && m.paint.base.c === '#5cc86f', 'v0 → v1');
  ok(typeof MIGRATE[0] === 'function', 'migrate chain');
  const big = validate(FIXTURES.max40, { partTypes }).recipe;
  ok(big.parts.length === FIXTURES.max40.parts.length, 'over-budget recipe loads intact');
  let threw = false; try { validate({ v: 99, spine: { v: [] } }); } catch { threw = true; }
  ok(threw, 'newer version rejected');
});
function randomOp(r, rnd) {
  const k = Math.floor(rnd() * 6), n = r.spine.v.length;
  if (k === 0) return ['spine.add', { end: rnd() < 0.5 ? 'head' : 'tail' }];
  if (k === 1) return ['spine.remove', { end: rnd() < 0.5 ? 'head' : 'tail' }];
  if (k === 2) return ['spine.scale', { i: Math.floor(rnd() * n), f: 0.8 + rnd() * 0.4 }];
  if (k === 3) { const i = Math.floor(rnd() * n); return ['spine.move', { i, y: r.spine.v[i][0] + (rnd() - 0.5) * 0.1, z: r.spine.v[i][1] + (rnd() - 0.5) * 0.1 }]; }
  if (k === 4) return ['part.add', { part: { t: 'det.nubhorn', at: { b: 'spine', u: rnd(), d: [0.3, 0.9, 0], tw: 0 }, m: 1 } }];
  return r.parts.length ? ['part.remove', { id: r.parts[Math.floor(rnd() * r.parts.length)].id }] : ['spine.add', { end: 'head' }];
}
test('C17.undo-redo', '200 random ops, undo-all → original hash, redo-all → final hash', { milestone: 1, items: [17] }, () => {
  const rnd = mulberry32(42);
  let r = newRecipe();
  const h = createHistory({ maxEntries: 1000, maxBytes: 64 * 1024 * 1024 });
  h.reset(r);
  const h0 = recipeHash(r);
  for (let i = 0; i < T.undoOps; i++) { const [op, a] = randomOp(r, rnd); r = applyOp(r, op, a); h.commit(r, op); }
  const hf = recipeHash(r);
  let u; while ((u = h.undo())) r = u.recipe;
  ok(recipeHash(r) === h0, 'undo-all hash');
  let d; while ((d = h.redo())) r = d.recipe;
  ok(recipeHash(r) === hf, 'redo-all hash');
  return `${h.size()} entries`;
});
test('C68.undo-cap', 'undo ≤ 100 entries and ≤ 2 MB after 300 edits', { milestone: 1, items: [68] }, () => {
  const rnd = mulberry32(7); let r = newRecipe(); const h = createHistory(); h.reset(r);
  for (let i = 0; i < T.undoEdits; i++) { const [op, a] = randomOp(r, rnd); r = applyOp(r, op, a); h.commit(r, op); }
  ok(h.size() <= T.undoMaxEntries && h.bytes() <= T.undoMaxMB * 1048576, `${h.size()} entries ${h.bytes()} B`);
  return `${h.size()} entries, ${(h.bytes() / 1024).toFixed(0)} KB`;
});
test('M1.coalesce', 'wheel commits within 400 ms coalesce', { milestone: 1 }, () => {
  let t = 0; const h = createHistory({ now: () => t }); let r = newRecipe(); h.reset(r);
  for (let i = 0; i < 5; i++) { r = applyOp(r, 'spine.scale', { i: 2, f: 1.08 }); h.commit(r, 'fatten', null, { coalesceKey: 'wheel:2' }); t += 100; }
  ok(h.size() === 2, `entries ${h.size()}`);
});
