// ops.js — every edit as a pure recipe → recipe' function with structural sharing.
// Exports: OPS (name → fn(recipe, args) → recipe), applyOp(recipe, name, args) -> recipe (quantized), nextId(r, prefix),
//          SPINE (limits), meanSpacing(v).
// Invariants: never mutates its input; output is quantized; limits (3–24 vertebrae, radius 0.04–0.60 m, 2–5 joints,
//   joint radius 0.03–0.30, segment 0.08–0.60) are clamped here, budgets are not (the editor refuses drops).
import { quantize } from './schema.js';

export const SPINE = { min: 3, max: 24, rMin: 0.04, rMax: 0.60, spacingMax: 0.40 };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function meanSpacing(v) { let s = 0; for (let i = 1; i < v.length; i++) s += Math.hypot(v[i][0] - v[i - 1][0], v[i][1] - v[i - 1][1]); return s / Math.max(1, v.length - 1); }
const meanR = (v) => v.reduce((a, x) => a + x[2], 0) / v.length;
export function nextId(r, prefix) {
  let n = 0;
  for (const x of [...r.limbs, ...r.parts]) { const m = String(x.id).match(/^[A-Z](\d+)$/); if (m && x.id[0] === prefix) n = Math.max(n, +m[1]); }
  return `${prefix}${n + 1}`;
}
const withSpine = (r, v) => ({ ...r, spine: { v } });
const mapLimb = (r, id, f) => ({ ...r, limbs: r.limbs.map((l) => (l.id === id ? f(l) : l)) });
const mapPart = (r, id, f) => ({ ...r, parts: r.parts.map((p) => (p.id === id ? f(p) : p)) });

export const OPS = {
  'recipe.set': (r, { recipe }) => recipe,
  'name.set': (r, { name }) => ({ ...r, name: String(name).slice(0, 24) }),
  // ---- spine ----
  'spine.move': (r, { i, y, z }) => {
    const v = r.spine.v.slice();
    const lo = 0.5 * meanR(v), hi = SPINE.spacingMax;
    let p = [y, z];
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= v.length) continue;
      const dy = p[0] - v[j][0], dz = p[1] - v[j][1], d = Math.hypot(dy, dz) || 1e-6;
      const dc = clamp(d, lo, hi);
      if (dc !== d) p = [v[j][0] + dy / d * dc, v[j][1] + dz / d * dc];
    }
    v[i] = [p[0], p[1], v[i][2]];
    return withSpine(r, v);
  },
  'spine.add': (r, { end = 'head' }) => {
    const v = r.spine.v;
    if (v.length >= SPINE.max) return r;
    const sp = meanSpacing(v);
    const [a, b] = end === 'head' ? [v[v.length - 1], v[v.length - 2]] : [v[0], v[1]];
    const dy = a[0] - b[0], dz = a[1] - b[1], d = Math.hypot(dy, dz) || 1;
    const nv = [a[0] + dy / d * sp, a[1] + dz / d * sp, clamp(a[2] * 0.92, SPINE.rMin, SPINE.rMax)];
    return withSpine(r, end === 'head' ? [...v, nv] : [nv, ...v]);
  },
  'spine.remove': (r, { i, end }) => {
    const v = r.spine.v;
    if (v.length <= SPINE.min) return r;
    const k = end === 'head' ? v.length - 1 : end === 'tail' ? 0 : i;
    return withSpine(r, v.filter((_, j) => j !== k));
  },
  'spine.insert': (r, { i }) => {
    const v = r.spine.v;
    if (v.length >= SPINE.max || i < 0 || i >= v.length - 1) return r;
    const a = v[i], b = v[i + 1];
    return withSpine(r, [...v.slice(0, i + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], ...v.slice(i + 1)]);
  },
  // Fatten: the vertebra by f, neighbours blend by f^0.35.
  'spine.scale': (r, { i, f }) => {
    const v = r.spine.v.map((x, j) => {
      const k = j === i ? f : Math.abs(j - i) === 1 ? Math.pow(f, 0.35) : 1;
      return k === 1 ? x : [x[0], x[1], clamp(x[2] * k, SPINE.rMin, SPINE.rMax)];
    });
    return withSpine(r, v);
  },
  'spine.radius': (r, { i, r: rad }) => withSpine(r, r.spine.v.map((x, j) => (j === i ? [x[0], x[1], clamp(rad, SPINE.rMin, SPINE.rMax)] : x))),
  'spine.set': (r, { v }) => withSpine(r, v.map((x) => [x[0], x[1], clamp(x[2], SPINE.rMin, SPINE.rMax)])),
  // ---- limbs ----
  'limb.add': (r, { limb }) => {
    const id = limb.id && !r.limbs.some((l) => l.id === limb.id) ? limb.id : nextId(r, 'L');
    return { ...r, limbs: [...r.limbs, { m: 1, k: 1, ...limb, id, j: limb.j.slice(0, 5).map(fixJoint) }] };
  },
  'limb.set': (r, { id, j, at, k }) => mapLimb(r, id, (l) => ({ ...l, ...(j ? { j: j.slice(0, 5).map(fixJoint) } : {}), ...(at ? { at } : {}), ...(k !== undefined ? { k: clamp(k, 0.3, 1.2) } : {}) })),
  'limb.joint': (r, { id, j, d }) => mapLimb(r, id, (l) => ({ ...l, j: l.j.map((x, i) => (i === j && i > 0 ? fixJoint([d[0], d[1], d[2], x[3]], i) : x)) })),
  'limb.radius': (r, { id, j, f }) => mapLimb(r, id, (l) => ({ ...l, j: l.j.map((x, i) => (i === j ? [x[0], x[1], x[2], clamp(x[3] * f, 0.03, 0.30)] : x)) })),
  'limb.addJoint': (r, { id, d }) => mapLimb(r, id, (l) => (l.j.length >= 5 ? l : { ...l, j: [...l.j, fixJoint([d[0], d[1], d[2], l.j[l.j.length - 1][3] * 0.92], l.j.length)] })),
  'limb.removeJoint': (r, { id }) => mapLimb(r, id, (l) => (l.j.length <= 2 ? l : { ...l, j: l.j.slice(0, -1) })),
  'limb.mirror': (r, { id, m }) => mapLimb(r, id, (l) => ({ ...l, m: m ? 1 : 0 })),
  'limb.remove': (r, { id }) => {
    const gone = new Set([id]);
    for (let k = 0; k < 3; k++) for (const l of r.limbs) if (gone.has(l.at.b)) gone.add(l.id);
    return { ...r, limbs: r.limbs.filter((l) => !gone.has(l.id)), parts: r.parts.filter((p) => !gone.has(p.at.b)) };
  },
  // ---- parts ----
  'part.add': (r, { part }) => {
    const id = part.id && !r.parts.some((p) => p.id === part.id) ? part.id : nextId(r, 'P');
    return { ...r, parts: [...r.parts, { sc: 1, m: 0, p: {}, tint: 'skin', ...part, id }] };
  },
  'part.move': (r, { id, at, m }) => mapPart(r, id, (p) => ({ ...p, at, ...(m !== undefined ? { m: m ? 1 : 0 } : {}) })),
  'part.remove': (r, { id }) => ({ ...r, parts: r.parts.filter((p) => p.id !== id) }),
  'part.param': (r, { id, key, v }) => mapPart(r, id, (p) => ({ ...p, p: { ...p.p, [key]: clamp(v, 0.2, 2) } })),
  'part.scale': (r, { id, f, sc }) => mapPart(r, id, (p) => ({ ...p, sc: clamp(sc !== undefined ? sc : (p.sc || 1) * f, 0.25, 4) })),
  'part.twist': (r, { id, tw, d }) => mapPart(r, id, (p) => { let t = tw !== undefined ? tw : (p.at.tw || 0) + d; while (t > Math.PI) t -= 2 * Math.PI; while (t < -Math.PI) t += 2 * Math.PI; return { ...p, at: { ...p.at, tw: t } }; }),
  'part.tint': (r, { id, tint }) => mapPart(r, id, (p) => ({ ...p, tint })),
  'part.mirror': (r, { id, m }) => mapPart(r, id, (p) => ({ ...p, m: m ? 1 : 0 })),
  'part.duplicate': (r, { id, at }) => { const p = r.parts.find((x) => x.id === id); if (!p) return r; return OPS['part.add'](r, { part: { ...p, id: undefined, at: at || p.at } }); },
  // ---- paint ----
  'paint.layer': (r, { layer, ...vals }) => ({ ...r, paint: { ...r.paint, [layer]: { ...r.paint[layer], ...vals } } }),
  'paint.skin': (r, { skin }) => ({ ...r, paint: { ...r.paint, skin } }),
  'paint.iris': (r, { iris }) => ({ ...r, paint: { ...r.paint, iris } }),
  'paint.set': (r, { paint }) => ({ ...r, paint: JSON.parse(JSON.stringify(paint)) }),
};
function fixJoint(x, i) {
  if (i === 0) return [0, 0, 0, clamp(x[3], 0.03, 0.30)];
  return [x[0], x[1], x[2], clamp(x[3], 0.03, 0.30)];
}

export function applyOp(recipe, name, args = {}) {
  const f = OPS[name];
  if (!f) throw new Error(`unknown op ${name}`);
  const out = f(recipe, args);
  return out === recipe ? recipe : quantize(out);
}
