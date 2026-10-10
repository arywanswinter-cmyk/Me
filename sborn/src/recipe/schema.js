// schema.js — the creature recipe: defaults, quantization, canonical JSON, hashing, validation and migration.
// Exports: RECIPE_V, BLOOP, newRecipe(), quantize(r), canonicalJSON(x), recipeHash(r), canonicalEqual(a, b),
//          validate(raw, { partTypes }) -> { recipe, warnings }, MIGRATE, clone(r), limbInstances(r), partInstances(r).
// Invariants: quantize is idempotent and every commit goes through it, so round trips are exact; validate never
//   uses eval, clamps every number, repairs duplicate ids and never enforces budgets (an over-budget recipe loads).
import { fnv1a } from '../core/hash.js';

export const RECIPE_V = 1;

export const BLOOP = Object.freeze({
  v: 1, app: 'sborn', name: 'Bloop', seed: 123456,
  spine: { v: [[0.45, -0.45, 0.14], [0.45, -0.27, 0.22], [0.45, -0.09, 0.28], [0.45, 0.09, 0.30], [0.45, 0.27, 0.27], [0.45, 0.45, 0.24]] },
  limbs: [],
  parts: [
    { id: 'P1', t: 'mouth.grin', at: { b: 'spine', u: 0.97, d: [0, -0.25, 0.97], tw: 0 }, sc: 1, m: 0, p: {}, tint: 'skin' },
    { id: 'P2', t: 'eye.moon', at: { b: 'spine', u: 0.93, d: [0.42, 0.45, 0.79], tw: 0 }, sc: 1, m: 1, p: {}, tint: 'natural' },
  ],
  paint: {
    skin: 'smooth',
    base: { c: '#ff8fb1', pat: 'solid', sc: 1 },
    coat: { c: '#6c8cff', pat: 'stripes', sc: 1, amt: 0 },
    detail: { c: '#ffd23f', pat: 'spots', sc: 1, amt: 0 },
    iris: '#7fc8ff',
  },
  meta: { created: 1760000000, from: 'bloop' },
});

export const clone = (r) => JSON.parse(JSON.stringify(r));
export function newRecipe() { return clone(BLOOP); }

// ---- quantization ------------------------------------------------------------------------------------------
const q = (x, step, digits) => { const v = Math.round(x / step) * step; const s = +v.toFixed(digits); return Object.is(s, -0) ? 0 : s; };
const qm = (x) => q(x, 0.001, 3);          // metres, directions, params, angles
const qu = (x) => q(x, 0.0001, 4);         // arc parameter
const qs = (x) => q(x, 0.01, 2);           // scale
const hex = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : '#ff8fb1');

function qAt(at) {
  const o = { b: String(at.b) };
  if (at.tip) o.tip = 1;
  else {
    o.u = qu(at.u ?? 0.5);
    o.d = (at.d || [0, 1, 0]).slice(0, 3).map(qm);
  }
  if (at.tw !== undefined) o.tw = qm(at.tw);
  return o;
}
export function quantize(r) {
  const o = { v: r.v, app: 'sborn', name: String(r.name ?? ''), seed: (r.seed >>> 0) };
  o.spine = { v: r.spine.v.map((v) => [qm(v[0]), qm(v[1]), qm(v[2])]) };
  o.limbs = r.limbs.map((l) => ({ id: l.id, at: qAt(l.at), m: l.m ? 1 : 0, j: l.j.map((j) => [qm(j[0]), qm(j[1]), qm(j[2]), qm(j[3])]), k: qm(l.k ?? 1) }));
  o.parts = r.parts.map((p) => {
    const pp = {};
    for (const k of Object.keys(p.p || {}).sort()) pp[k] = qm(p.p[k]);
    return { id: p.id, t: p.t, at: qAt(p.at), sc: qs(p.sc ?? 1), m: p.m ? 1 : 0, p: pp, tint: p.tint || 'skin' };
  });
  const L = (x, d) => { const l = { c: hex(x?.c ?? d.c), pat: x?.pat ?? d.pat, sc: qs(x?.sc ?? 1) }; if (d.amt !== undefined) l.amt = qm(x?.amt ?? d.amt); if (d.mask !== undefined || x?.mask) l.mask = x?.mask ?? d.mask ?? 'all'; return l; };
  const P = r.paint || {};
  o.paint = { skin: P.skin || 'smooth', base: L(P.base, { c: '#ff8fb1', pat: 'solid' }), coat: L(P.coat, { c: '#6c8cff', pat: 'stripes', amt: 0, mask: 'all' }),
    detail: L(P.detail, { c: '#ffd23f', pat: 'spots', amt: 0, mask: 'all' }), iris: hex(P.iris ?? '#7fc8ff') };
  o.meta = { ...(r.meta || {}) };
  return o;
}

// ---- canonical JSON and hashing ----------------------------------------------------------------------------
export function canonicalJSON(x) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(canonicalJSON).join(',')}]`;
  return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJSON(x[k])}`).join(',')}}`;
}
export const recipeHash = (r) => fnv1a(canonicalJSON(quantize(r)));
export function canonicalEqual(a, b) {
  const ca = canonicalJSON(quantize(a)), cb = canonicalJSON(quantize(b));
  return ca === cb && fnv1a(ca) === fnv1a(cb);
}

// ---- validation and migration ------------------------------------------------------------------------------
const num = (x, lo, hi, d) => { const v = typeof x === 'number' && Number.isFinite(x) ? x : d; return Math.min(hi, Math.max(lo, v)); };
const PATTERNS = ['solid', 'gradient', 'spots', 'stripes', 'scales', 'speckles', 'patches', 'saddle', 'rosettes', 'bands'];
const MASKS = ['all', 'back', 'belly', 'limbs', 'head'];
const SKINS = ['smooth', 'bumpy', 'scaly', 'leathery', 'fuzzy'];
const TINTS = ['skin', 'base', 'coat', 'detail', 'natural'];

// v0 (synthetic, used by tests): spine as [{y,z,r}] objects and paint as a single colour.
export const MIGRATE = {
  0: (r) => ({ ...r, v: 1, spine: { v: (r.spine || []).map((s) => [s.y, s.z, s.r]) }, limbs: r.limbs || [], parts: r.parts || [],
    paint: { skin: 'smooth', base: { c: r.color || '#ff8fb1', pat: 'solid', sc: 1 }, coat: { c: '#6c8cff', pat: 'stripes', sc: 1, amt: 0 }, detail: { c: '#ffd23f', pat: 'spots', sc: 1, amt: 0 }, iris: '#7fc8ff' } }),
};

export function validate(raw, { partTypes = null } = {}) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') throw new Error('not a recipe');
  let r = raw;
  let v = typeof r.v === 'number' ? r.v : 0;
  while (v < RECIPE_V) { if (!MIGRATE[v]) throw new Error(`no migration from v${v}`); r = MIGRATE[v](r); v = r.v; }
  if (v > RECIPE_V) throw new Error(`recipe v${v} is newer than v${RECIPE_V}`);
  const out = { v: RECIPE_V, app: 'sborn', name: String(r.name ?? 'Bloop').slice(0, 24), seed: Number.isFinite(r.seed) ? r.seed >>> 0 : 1, meta: {} };
  let sv = Array.isArray(r.spine?.v) ? r.spine.v.filter((s) => Array.isArray(s) && s.length >= 3) : [];
  if (sv.length < 3) { warnings.push('spine too short, reset'); sv = clone(BLOOP.spine.v); }
  if (sv.length > 24) { warnings.push('spine trimmed to 24'); sv = sv.slice(0, 24); }
  out.spine = { v: sv.map((s) => [num(s[0], -5, 5, 0.45), num(s[1], -5, 5, 0), num(s[2], 0.04, 0.60, 0.2)]) };
  const ids = new Set();
  const fixId = (id, pre) => { let s = typeof id === 'string' && /^[A-Za-z0-9_]{1,12}$/.test(id) ? id : `${pre}1`; let n = 1; while (ids.has(s)) { s = `${pre}${++n}`; } if (s !== id) warnings.push(`id ${id} → ${s}`); ids.add(s); return s; };
  const at = (a) => {
    const o = { b: typeof a?.b === 'string' ? a.b : 'spine' };
    if (a?.tip) o.tip = 1;
    else { o.u = num(a?.u, 0, 1, 0.5); const d = Array.isArray(a?.d) ? a.d : [0, 1, 0]; o.d = [num(d[0], -1, 1, 0), num(d[1], -1, 1, 1), num(d[2], -1, 1, 0)]; }
    if (a?.tw !== undefined) o.tw = num(a.tw, -Math.PI, Math.PI, 0);
    return o;
  };
  out.limbs = (Array.isArray(r.limbs) ? r.limbs : []).filter((l) => Array.isArray(l?.j) && l.j.length >= 2).slice(0, 12).map((l) => ({
    id: fixId(l.id, 'L'), at: at(l.at), m: l.m ? 1 : 0, k: num(l.k, 0.3, 1.2, 1),
    j: l.j.slice(0, 5).map((j, i) => [i ? num(j[0], -3, 3, 0) : 0, i ? num(j[1], -3, 3, 0) : 0, i ? num(j[2], -3, 3, 0) : 0, num(j[3], 0.03, 0.30, 0.06)]),
  }));
  const limbIds = new Set(out.limbs.map((l) => l.id));
  for (const l of out.limbs) if (l.at.b !== 'spine' && (!limbIds.has(l.at.b) || l.at.b === l.id)) { warnings.push(`limb ${l.id} parent ${l.at.b} missing`); l.at.b = 'spine'; }
  out.parts = [];
  for (const p of Array.isArray(r.parts) ? r.parts : []) {
    if (!p || typeof p.t !== 'string' || (partTypes && !partTypes.has(p.t))) { warnings.push(`unknown part type ${p && p.t}`); continue; }
    const pp = {};
    for (const [k, x] of Object.entries(p.p || {})) if (/^(len|curl|fat|p1|p2|p3)$/.test(k) || typeof x === 'number') pp[k] = num(x, 0, 2, 1);
    const a = at(p.at);
    if (a.b !== 'spine' && !limbIds.has(a.b)) { warnings.push(`part ${p.id} on missing limb`); a.b = 'spine'; delete a.tip; a.u = a.u ?? 0.5; a.d = a.d || [0, 1, 0]; }
    out.parts.push({ id: fixId(p.id, 'P'), t: p.t, at: a, sc: num(p.sc, 0.25, 4, 1), m: p.m ? 1 : 0, p: pp, tint: TINTS.includes(p.tint) ? p.tint : 'skin' });
    if (out.parts.length >= 96) { warnings.push('parts capped'); break; }
  }
  const P = r.paint || {};
  const layer = (x, d) => ({ c: hex(x?.c ?? d.c), pat: PATTERNS.includes(x?.pat) ? x.pat : d.pat, sc: num(x?.sc, 0.25, 4, 1), ...(d.amt !== undefined ? { amt: num(x?.amt, 0, 1, d.amt), mask: MASKS.includes(x?.mask) ? x.mask : 'all' } : {}) });
  out.paint = { skin: SKINS.includes(P.skin) ? P.skin : 'smooth', base: layer(P.base, { c: '#ff8fb1', pat: 'solid' }),
    coat: layer(P.coat, { c: '#6c8cff', pat: 'stripes', amt: 0 }), detail: layer(P.detail, { c: '#ffd23f', pat: 'spots', amt: 0 }), iris: hex(P.iris ?? '#7fc8ff') };
  if (r.meta && typeof r.meta === 'object') { if (Number.isFinite(r.meta.created)) out.meta.created = r.meta.created; if (typeof r.meta.from === 'string') out.meta.from = r.meta.from.slice(0, 24); }
  return { recipe: quantize(out), warnings };
}

// Instances: a mirrored entry stands for two (the +x one stored, the twin built at x → −x).
export function limbInstances(r) { let n = 0; for (const l of r.limbs) n += l.m ? 2 : 1; return n; }
export function partInstances(r) { let n = 0; for (const p of r.parts) n += p.m ? 2 : 1; return n; }
