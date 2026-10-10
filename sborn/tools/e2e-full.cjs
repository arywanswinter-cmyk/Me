// e2e-full.cjs — item 57: the full end-to-end run per context (steps are added as their milestones land).
// Exports: full(browser, kind, { Driver, boot, wrapCounters }) -> { ctx, steps: [{name, ok, note, ms}], pass, error, counters, tally }.
// Invariants: every input goes through real mouse/touch/keyboard events at targets from probe.where(); the only page
//   calls are read-only (recipe, budget, hints, editor drag state) apart from step(); counters on op/load/undo/redo must
//   stay 0 from step 2 on; a step saves screens/m11/e2e-<ctx>-NN-<step>.jpg.
const fs = require('fs');
const path = require('path');
const B = require('./browser.cjs');
const SHOTS = path.join(B.SB, 'screens/m11');

async function full(browser, kind, { Driver, boot, wrapCounters }) {
  const ctx = await B.newContext(browser, kind);
  const page = await ctx.newPage();
  const tally = {}; B.watchPage(page, tally);
  const D = new Driver(page, kind); await D.init();
  const res = { ctx: kind, steps: [], pass: false };
  const t0 = Date.now();
  let n = 0;
  const shot = async (name) => { fs.mkdirSync(SHOTS, { recursive: true }); await D.settle(); await page.screenshot({ path: path.join(SHOTS, `e2e-${kind}-${String(++n).padStart(2, '0')}-${name}.jpg`), type: 'jpeg', quality: 70 }); };
  const rec = (name, ok, note = '') => { res.steps.push({ name, ok: !!ok, note, ms: Date.now() - t0 }); if (!ok) throw new Error(`${name}: ${note}`); };
  const R = () => page.evaluate(() => window.__sborn.recipe());
  try {
    // (1) boot: ready(), Bloop and hint 1 visible
    await boot(page, 'index.html?test&quality=low&hints');
    let h1 = false;
    for (let i = 0; i < 200 && !h1; i += 10) { await D.step(10); h1 = (await page.evaluate(() => (window.__sborn.hints() || {}).current)) === 'leg'; }
    const r0 = await R();
    rec('boot', r0.name === 'Bloop' && h1, `name ${r0.name}, hint 1 ${h1}`);
    await shot('boot');
    // (2) build by input only
    await wrapCounters(page);
    for (const u of [0.78, 0.5, 0.22]) await D.cardTo('card:limb.leg', await D.need(`skin:${u}`));
    await D.cardTo('card:mouth.chomper', await D.need('skin:0.99:nose'));
    await D.cardTo('card:eye.moon', await D.need('skin:0.86'));
    await D.cardTo('card:det.curlhorn', await D.need('skin:0.93'));
    await D.cardTo('card:tail.curly', await D.need('skin:0.01:tail'));
    // tail arrow out 2 vertebrae: drag along the arrow until the editor reports +2
    const arrow = await D.need('handle:spine.tail'), mid = await D.need('skin:0.5:top');
    const dx = arrow.x - mid.x, dy = arrow.y - mid.y, l = Math.hypot(dx, dy) || 1;
    await D.dragUntil(arrow, { x: dx / l, y: dy / l }, () => page.evaluate(() => { const d = window.__sborn.editor.state.drag; return d && d.k === 2; }));
    // middle vertebra fattened 3 notches: select the spine, then wheel (desktop) or pinch (touch)
    for (const u of [0.5, 0.42, 0.58, 0.35, 0.65]) { await D.tap(await D.need(`skin:${u}:top`)); await D.settle(); if ((await page.evaluate(() => (window.__sborn.editor.selection || {}).kind)) === 'spine') break; }
    const nv = (await R()).spine.v.length, mv = Math.floor(nv / 2);
    const vt = await D.need(`vertebra:${mv}`);
    const r1 = (await R()).spine.v[mv][2];
    if (D.touch) await D.pinch(vt, Math.pow(1.08, 3));
    else for (let i = 0; i < 3; i++) { await page.mouse.move(vt.x, vt.y); await page.mouse.wheel(0, -100); await D.step(1); }
    await D.settle();
    const r2 = (await R()).spine.v[mv][2];
    await D.tap(await D.need('undo')); await D.settle();
    await D.tap(await D.need('redo')); await D.settle();
    const r = await R();
    const info = await page.evaluate(async () => { const s = window.__sborn; const { computeStats } = await import('./src/catalog/stats.js'); const { PART } = await import('./src/catalog/parts.js');
      const st = computeStats(s.recipe(), PART), pips = {}; for (const el of document.querySelectorAll('.stat')) pips[el.dataset.stat] = el.querySelectorAll('.pips .full').length + 0.5 * el.querySelectorAll('.pips .half').length;
      return { b: s.budget(), w: window.__wrapped, odo: document.querySelector('.pill .odo').textContent, statsOk: Object.keys(st).every((k) => Math.abs(st[k] - pips[k]) < 1e-9) }; });
    const types = r.parts.map((p) => p.t), count = (t) => r.parts.filter((p) => p.t === t).reduce((a, p) => a + (p.m ? 2 : 1), 0);
    const legs = r.limbs.reduce((a, L) => a + (L.m ? 2 : 1), 0);
    const counters = info.w.op + info.w.load + info.w.undo + info.w.redo;
    rec('build', counters === 0 && legs === 6 && types.includes('mouth.chomper') && count('eye.moon') === 4 && types.includes('tail.curly') && count('det.curlhorn') === 2 && r.spine.v.length === 8
      && info.b.dna === 1050 && info.b.cx === 57 && +info.odo === 1050 && info.statsOk && Math.abs(r2 / r1 - Math.pow(1.08, 3)) < 0.03 * Math.pow(1.08, 3),
    `counters ${JSON.stringify(info.w)}, legs ${legs}, eyes ${count('eye.moon')}, horns ${count('det.curlhorn')}, vertebrae ${r.spine.v.length}, DNA ${info.b.dna} (pill ${info.odo}), complexity ${info.b.cx}, fatten ×${(r2 / r1).toFixed(3)}, stats panel ${info.statsOk}, parts ${types.join(',')}`);
    await shot('build');
    res.pass = true;
  } catch (e) { res.error = String(e.message || e).slice(0, 400); }
  res.ms = Date.now() - t0; res.tally = { bad: tally.bad.length, first: tally.bad[0] || null };
  if (tally.bad.length) { res.pass = false; res.error = (res.error || '') + ` console: ${tally.bad[0]}`; }
  await ctx.close();
  return res;
}
module.exports = { full };
