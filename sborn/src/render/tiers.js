// tiers.js — quality tier choice: boot guess, calibration behind the hatch, and the frame-time governor.
// Exports: TIERS, TIER_CFG, bootGuess(env), calibrate(framesMs, tier) -> {tier, retest}, createGovernor(opts).
// Invariants: pure logic on numbers (no DOM, no WebGL), so synthetic frame-time traces test every rule;
//   never switches mid-drag; never drops below Medium on a 30 Hz-capped device; ≤ 6 resolution changes.
export const TIERS = ['low', 'medium', 'high'];
export const TIER_CFG = {
  low: { dpr: 1.25, maxPx: 1.4e6, composer: false, shadow: 1024, shadowRadius: 1.5, contact: 0, bloom: 'sprites', gtao: false, relief: 1, grass: 8000, flowers: 125, terrain: 48 },
  medium: { dpr: 1.5, maxPx: 2.2e6, composer: true, shadow: 1024, shadowRadius: 2.5, contact: 256, bloom: 'quarter', gtao: false, relief: 2, grass: 18000, flowers: 250, terrain: 64 },
  high: { dpr: 2.0, maxPx: 2.6e6, composer: true, shadow: 2048, shadowRadius: 2.5, contact: 512, bloom: 'half', gtao: true, relief: 4, grass: 36000, flowers: 450, terrain: 96 },
};

const pct = (a, p) => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export const p90 = (a) => pct(a, 0.9);
export const median = (a) => pct(a, 0.5);

// (1) Boot guess from what the browser says about itself.
export function bootGuess({ ua = '', platform = '', maxTouchPoints = 0, screenW = 0, screenH = 0, dpr = 1, halfFloat = true } = {}) {
  if (!halfFloat) return 'low';
  const iPad = /iPad/.test(ua) || (/MacIntel/.test(platform) && maxTouchPoints > 1);
  if (iPad) {
    const w = Math.max(screenW, screenH) * dpr, h = Math.min(screenW, screenH) * dpr;
    return w >= 2360 && h >= 1640 ? 'medium' : 'low';
  }
  if (/Mac/.test(platform) || /Macintosh/.test(ua)) return 'high';
  return 'medium';
}

// (2) Calibration: 90 measured frames. p90 > 17.5 ms → drop a tier and retest 60; median < 9 ms at Medium → try High.
export function calibrate(frames, tier) {
  const i = TIERS.indexOf(tier);
  if (p90(frames) > 17.5 && i > 0) return { tier: TIERS[i - 1], retest: 60, why: 'p90 > 17.5' };
  if (tier === 'medium' && median(frames) < 9) return { tier: 'high', retest: 60, why: 'median < 9 at medium' };
  return { tier, retest: 0, why: 'ok' };
}

// (3) Governor over 4 s windows.
export function createGovernor({ tier = 'medium', windowS = 4, maxResChanges = 6 } = {}) {
  const st = { tier, scale: 1, resChanges: 0, upgraded: false, badWindows: 0, goodS: 0, capped30: false, log: [] };
  let win = [], winT = 0;
  function setScale(s, t) { if (st.resChanges >= maxResChanges) return false; st.scale = Math.round(s * 10) / 10; st.resChanges++; st.log.push({ t, scale: st.scale }); return true; }
  function setTier(k, t, why) { if (st.resChanges >= maxResChanges) return false; st.tier = k; st.resChanges++; st.log.push({ t, tier: k, why }); return true; }
  // Feed one frame; returns a change or null. `dragging` freezes every switch.
  function frame(ms, { t = 0, dragging = false } = {}) {
    win.push(ms); winT += ms / 1000;
    if (winT < windowS) return null;
    const frames = win; win = []; winT = 0;
    const near30 = frames.filter((f) => Math.abs(f - 33.3) <= 1).length / frames.length;
    if (near30 > 0.8) st.capped30 = true;
    const P90 = p90(frames);
    let change = null;
    if (P90 > 18.5) { st.badWindows++; st.goodS = 0; } else st.badWindows = 0;
    if (P90 < 11) st.goodS += windowS; else if (P90 <= 18.5) st.goodS = 0;
    if (dragging) return null;
    const i = TIERS.indexOf(st.tier);
    if (st.badWindows >= 2) {
      st.badWindows = 0;
      if (st.scale > 0.7 + 1e-9) { if (setScale(st.scale - 0.1, t)) change = { scale: st.scale }; }
      else {
        const floor = st.capped30 ? 1 : 0;
        if (i > floor && setTier(TIERS[i - 1], t, 'p90 > 18.5 twice')) { st.scale = 1; change = { tier: st.tier }; }
      }
    } else if (st.goodS >= 20 && !st.upgraded) {
      if (st.scale < 1) { if (setScale(Math.min(1, st.scale + 0.1), t)) { change = { scale: st.scale }; st.upgraded = true; } }
      else if (i < 2 && setTier(TIERS[i + 1], t, '20 s under 11 ms')) { st.upgraded = true; change = { tier: st.tier }; }
      st.goodS = 0;
    }
    return change;
  }
  return { frame, state: st };
}
