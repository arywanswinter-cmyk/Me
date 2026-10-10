// budget.js — DNA and complexity, charged per instance (a mirrored pair costs double).
// Exports: BUDGET, costOf(recipe, partDefs) -> {dna, cx}, partCost(type, mirrored), limbCost(joints, mirrored), fits(recipe, extra).
// Invariants: vertebra 0 DNA / 1 complexity; limb segment 15 DNA / 1 complexity per instance; totals 2,000 DNA and
//   complexity 100; never enforced on load (the editor refuses drops instead).
export const BUDGET = { dna: 2000, cx: 100 };
export function partCost(def, mirrored) { const k = mirrored ? 2 : 1; return { dna: def.dna * k, cx: def.cx * k }; }
export function limbCost(nJoints, mirrored) { const k = mirrored ? 2 : 1, segs = Math.max(1, nJoints - 1); return { dna: 15 * segs * k, cx: segs * k }; }
export function costOf(r, partDefs) {
  let dna = 0, cx = r.spine.v.length;
  for (const l of r.limbs) { const c = limbCost(l.j.length, l.m); dna += c.dna; cx += c.cx; }
  for (const p of r.parts) { const d = partDefs[p.t]; if (!d) continue; const c = partCost(d, p.m); dna += c.dna; cx += c.cx; }
  return { dna, cx };
}
export function fits(cur, extra) { return cur.dna + extra.dna <= BUDGET.dna && cur.cx + extra.cx <= BUDGET.cx; }
