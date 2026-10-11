// stats.js — the 14 creature stats from its parts (§7).
// Exports: STAT_ORDER, STAT_GROUPS, computeStats(recipe, partDefs) -> { Bite: 0..5, … }, contributors(recipe, partDefs, stat).
// Invariants: stat = highest contributing part level + 0.5 per other distinct contributing part (one recipe part, with
//   its mirror twin folded in, is one contributor), capped at 5; Health = max(1, rule); limbs give no stats; pure.
import { STAT_NAMES, statGroup } from './parts.js';

export const STAT_ORDER = STAT_NAMES;
export const STAT_GROUPS = ['attack', 'social', 'move', 'health'].map((g) => ({ key: g, stats: STAT_NAMES.filter((s) => statGroup[s] === g) }));

export function contributors(r, partDefs, stat) {
  return (r.parts || []).map((p) => ({ id: p.id, t: p.t, level: (partDefs[p.t] && partDefs[p.t].stats[stat]) || 0 })).filter((c) => c.level > 0);
}
export function computeStats(r, partDefs) {
  const out = {};
  for (const s of STAT_NAMES) {
    const lv = contributors(r, partDefs, s).map((c) => c.level).sort((a, b) => b - a);
    let v = lv.length ? Math.min(5, lv[0] + 0.5 * (lv.length - 1)) : 0;
    if (s === 'Health') v = Math.max(1, v);
    out[s] = v;
  }
  return out;
}
