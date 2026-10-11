// hints.js — learn-by-doing onboarding: one ghost-hand hint at a time over a pulsing target, no words (§8.6).
// Exports: HINTS, createHints({ hand, where, storage }) -> { step(dt, mode), event(name), replay(), state(), lookXY() }.
// Invariants: a hint appears 1.5 s after the previous step (or after ready), fades within 300 ms of its action, is stored
//   done (try/catch storage) and never returns; tapping elsewhere hides it for 20 s; replay() clears and restarts;
//   targets come from the same probe.where() keys the tests use, so a non-reader can follow them.
export const HINTS = [
  { id: 'leg', done: 'leg', mode: 'build', from: 'card:limb.leg', to: 'skin:0.5', kind: 'drag' },
  { id: 'tail', done: 'spine', mode: 'build', from: 'handle:spine.tail', kind: 'drag', away: 70 },
  { id: 'fat', done: 'fatten', mode: 'build', from: 'skin:0.5', kind: 'tap' },
  { id: 'paint', done: 'mode:paint', mode: 'build', from: 'tab:paint', kind: 'tap' },
  { id: 'colour', done: 'paint', mode: 'paint', from: 'swatch:#5BB8FF', kind: 'tap' },
  { id: 'play', done: 'mode:play', mode: 'paint', from: 'tab:play', kind: 'tap' },
  { id: 'walk', done: 'walk', mode: 'play', from: 'ground:ahead', kind: 'tap' },
];
const KEY = 'sborn.hints';

export function createHints({ hand, where, storage = null }) {
  let done = new Set();
  try { const v = (storage || localStorage).getItem(KEY); if (v) done = new Set(JSON.parse(v)); } catch { /* blocked storage: hints just repeat */ }
  const st = { cur: null, wait: 1.5, hiddenFor: 0, shown: false, fade: 0, steps: 0 };
  const save = () => { try { (storage || localStorage).setItem(KEY, JSON.stringify([...done])); } catch { /* ignore */ } };
  const next = () => HINTS.find((h) => !done.has(h.id)) || null;
  let target = null;
  function place(h) {
    const a = where(h.from);
    if (!a || a.visible === false) return null;
    if (h.kind === 'drag') {
      if (h.to) { const b = where(h.to); if (!b) return null; return { x: a.x, y: a.y, r: Math.max(30, a.r || 30), kind: 'drag', toX: b.x, toY: b.y }; }
      // drag away from the screen centre of the creature
      const cx = innerWidth * 0.6, cy = innerHeight * 0.5, dx = a.x - cx, dy = a.y - cy, l = Math.hypot(dx, dy) || 1;
      return { x: a.x, y: a.y, r: 28, kind: 'drag', toX: a.x + dx / l * h.away, toY: a.y + dy / l * h.away };
    }
    return { x: a.x, y: a.y, r: Math.max(30, a.r || 30), kind: 'tap' };
  }
  function step(dt, mode) {
    st.steps++;
    if (st.fade > 0) { st.fade -= dt; if (st.fade <= 0) hand.hide(); }
    if (st.hiddenFor > 0) { st.hiddenFor -= dt; if (st.shown) { hand.hide(); st.shown = false; } return; }
    const h = next();
    if (!h) { if (st.shown) { hand.hide(); st.shown = false; } st.cur = null; return; }
    if (st.cur !== h.id) { st.cur = h.id; st.wait = 1.5; if (st.shown) { hand.hide(); st.shown = false; } }
    if (st.wait > 0) { st.wait -= dt; return; }
    if (h.mode !== mode && !(h.id === 'play' && mode === 'build')) { if (st.shown) { hand.hide(); st.shown = false; } return; }
    const p = place(h);
    if (!p) { if (st.shown) { hand.hide(); st.shown = false; } return; }
    if (!target || Math.abs(target.x - p.x) > 2 || Math.abs(target.y - p.y) > 2 || !st.shown) { hand.show(p); target = p; }
    st.shown = true;
  }
  function event(name) {
    const h = HINTS.find((x) => x.done === name && !done.has(x.id));
    if (!h) return;
    done.add(h.id); save();
    if (st.cur === h.id && st.shown) { st.fade = 0.25; st.shown = false; }
    st.cur = null;
  }
  // a tap that is not on the current target hides the hint for 20 s
  function tapElsewhere(x, y) {
    if (!st.shown || !target) return;
    const d = Math.hypot(x - target.x, y - target.y), d2 = target.toX !== undefined ? Math.hypot(x - target.toX, y - target.toY) : Infinity;
    if (Math.min(d, d2) > Math.max(48, target.r * 1.5)) { st.hiddenFor = 20; hand.hide(); st.shown = false; }
  }
  function replay() { done.clear(); save(); st.cur = null; st.hiddenFor = 0; }
  function state() { return { current: st.shown ? st.cur : null, pending: st.cur, done: [...done] }; }
  function lookXY() { return st.shown && target ? { x: target.x, y: target.y } : null; }
  return { step, event, replay, state, lookXY, tapElsewhere };
}
