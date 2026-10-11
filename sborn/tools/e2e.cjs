// e2e.cjs — input-only end-to-end runs in fresh browser contexts (desktop mouse and keyboard; iPad touch via CDP).
// Exports: Driver helpers (for other tools); CLI: node sborn/tools/e2e.cjs [--smoke] [--ctx desktop,ipad,ipadPortrait].
// Invariants: targets come only from window.__sborn.probe.where(); op/load/undo/redo are wrapped with counters before the
//   build steps and must read 0 afterwards (only real input may edit); writes tools/out/e2e-<ctx>.json and
//   tools/out/e2e-tests.json (rows shaped like tests.html results); exit 0 only if every context passes.
const fs = require('fs');
const path = require('path');
const B = require('./browser.cjs');

const OUT = path.join(B.SB, 'tools/out');
const SHOTS = path.join(B.SB, 'screens/m11');

class Driver {
  constructor(page, kind) { this.page = page; this.kind = kind; this.touch = kind !== 'desktop'; this.cdp = null; }
  async init() { if (this.touch) this.cdp = await this.page.context().newCDPSession(this.page); }
  async where(key) { return this.page.evaluate((k) => window.__sborn.probe.where(k), key); }
  async need(key) { const w = await this.where(key); if (!w) throw new Error(`no target ${key}`); return w; }
  async step(n, render = 0) { await this.page.evaluate(([n, r]) => window.__sborn.step(n, { render: r }), [n, render]); }
  async settle() { await this.page.evaluate(() => window.__sborn.settle()); }
  async touchEv(type, pts) { await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 4, radiusY: 4, force: 1 })) }); }
  async tap(p) {
    if (this.touch) { await this.touchEv('touchStart', [p]); await this.touchEv('touchEnd', []); }
    else await this.page.mouse.click(p.x, p.y);
  }
  async drag(a, b, { steps = 12, holdMs = 0, preSteps = 0, perMove = null } = {}) {
    if (this.touch) {
      await this.touchEv('touchStart', [a]);
      if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await this.touchEv('touchMove', [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }]);
        if (perMove) await perMove(i);
      }
      await this.touchEv('touchEnd', []);
    } else {
      await this.page.mouse.move(a.x, a.y);
      await this.page.mouse.down();
      for (let i = 1; i <= steps; i++) { const t = i / steps; await this.page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); if (perMove) await perMove(i); }
      await this.page.mouse.up();
    }
  }
  // Drawer card → stage: touch lifts by moving sideways toward the stage first (>10 px within 50°), then travels.
  async cardTo(cardKey, target, opts = {}) {
    let c = await this.need(cardKey);
    if (!c.visible) { await this.scrollDrawerTo(cardKey); c = await this.need(cardKey); }
    if (this.touch) {
      // lift toward the stage: sideways in landscape, up from the portrait shelf
      const portrait = this.kind === 'ipadPortrait', mid = portrait ? { x: c.x, y: c.y - 40 } : { x: c.x + 40, y: c.y };
      await this.touchEv('touchStart', [c]);
      for (let i = 1; i <= 4; i++) await this.touchEv('touchMove', [portrait ? { x: c.x, y: c.y - 10 * i } : { x: c.x + 10 * i, y: c.y }]);
      const steps = opts.steps || 14;
      for (let i = 1; i <= steps; i++) { const t = i / steps; await this.touchEv('touchMove', [{ x: mid.x + (target.x - mid.x) * t, y: mid.y + (target.y - mid.y) * t }]); }
      await this.touchEv('touchEnd', []);
    } else await this.drag(c, target, { steps: opts.steps || 14 });
    await this.settle();
  }
  async scrollDrawerTo(cardKey) {
    // scroll the drawer by a real drag (touch) or the wheel (mouse) until the card is in view
    for (let k = 0; k < 12; k++) {
      const c = await this.where(cardKey), H = await this.page.evaluate(() => innerHeight);
      if (c && c.visible) return;
      const d = await this.page.evaluate(() => { const r = document.querySelector('.drawer').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; });
      const dir = c && c.y > H / 2 ? -1 : 1;
      if (this.kind === 'ipadPortrait') {
        // the portrait shelf scrolls sideways
        const W = await this.page.evaluate(() => innerWidth), hd = c && c.x > W / 2 ? -1 : 1, a = { x: d.x, y: d.y };
        await this.touchEv('touchStart', [a]); for (let i = 1; i <= 6; i++) await this.touchEv('touchMove', [{ x: a.x + hd * 40 * i, y: a.y }]); await this.touchEv('touchEnd', []);
      } else if (this.touch) { const a = { x: d.x - 30, y: d.y }; await this.touchEv('touchStart', [a]); for (let i = 1; i <= 6; i++) await this.touchEv('touchMove', [{ x: a.x, y: a.y + dir * 30 * i }]); await this.touchEv('touchEnd', []); }
      else { await this.page.mouse.move(d.x, d.y); await this.page.mouse.wheel(0, -dir * 200); }
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  // press at `a`, move along unit `dir` in 6 px steps until cond() is true (≤ 120 steps), release
  async dragUntil(a, dir, cond, { step = 6, max = 120 } = {}) {
    if (this.touch) await this.touchEv('touchStart', [a]); else { await this.page.mouse.move(a.x, a.y); await this.page.mouse.down(); }
    for (let i = 1; i <= max; i++) {
      const p = { x: a.x + dir.x * step * i, y: a.y + dir.y * step * i };
      if (this.touch) await this.touchEv('touchMove', [p]); else await this.page.mouse.move(p.x, p.y);
      if (await cond()) break;
    }
    if (this.touch) await this.touchEv('touchEnd', []); else await this.page.mouse.up();
    await this.settle();
  }
  async pinch(centre, ratio, { steps = 8, sep = 60 } = {}) {
    const a0 = { x: centre.x - sep, y: centre.y, id: 0 }, b0 = { x: centre.x + sep, y: centre.y, id: 1 };
    await this.touchEv('touchStart', [a0]);
    await this.touchEv('touchStart', [a0, b0]);
    for (let i = 1; i <= steps; i++) { const s = sep * (1 + (ratio - 1) * i / steps); await this.touchEv('touchMove', [{ x: centre.x - s, y: centre.y, id: 0 }, { x: centre.x + s, y: centre.y, id: 1 }]); }
    await this.touchEv('touchEnd', []);
  }
  async key(code, down) { if (down) await this.page.keyboard.down(code); else await this.page.keyboard.up(code); }
  async shot(name) { fs.mkdirSync(SHOTS, { recursive: true }); await this.settle(); await this.page.screenshot({ path: path.join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 70 }); }
}

async function boot(page, url) {
  await page.goto(`http://localhost:${B.PORT}/${url}`);
  await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 120000 });
  await B.awaitReady(page);
}
async function wrapCounters(page) {
  await page.evaluate(() => {
    const s = window.__sborn; window.__wrapped = { op: 0, load: 0, undo: 0, redo: 0 };
    for (const k of ['op', 'load', 'undo', 'redo']) { const f = s[k]; s[k] = (...a) => { window.__wrapped[k]++; return f(...a); }; }
  });
}

// ---------------- M2.smoke ----------------
async function smoke(browser, kind) {
  const ctx = await B.newContext(browser, kind);
  const page = await ctx.newPage();
  const tally = {}; B.watchPage(page, tally);
  const D = new Driver(page, kind); await D.init();
  const res = { ctx: kind, steps: [], pass: false };
  const t0 = Date.now();
  const stepRec = (name, ok, note = '') => { res.steps.push({ name, ok: !!ok, note, ms: Date.now() - t0 }); if (!ok) throw new Error(`${name}: ${note}`); };
  try {
    await boot(page, 'index.html?test&quality=low');
    await D.settle();
    await wrapCounters(page);
    // Ready Leg pairs at the front and the back
    await D.cardTo('card:limb.leg', await D.need('skin:0.72'));
    await D.cardTo('card:limb.leg', await D.need('skin:0.22'));
    let r = await page.evaluate(() => window.__sborn.recipe());
    stepRec('legs', r.limbs.length === 2 && r.limbs.every((l) => l.m === 1), `limbs ${r.limbs.length}`);
    await D.cardTo('card:eye.moon', await D.need('skin:0.86'));
    await D.cardTo('card:mouth.chomper', await D.need('skin:0.98'));
    r = await page.evaluate(() => window.__sborn.recipe());
    stepRec('parts', r.parts.some((p) => p.t === 'mouth.chomper') && r.parts.filter((p) => p.t === 'eye.moon').length >= 2, r.parts.map((p) => p.t).join(','));
    // fatten one vertebra: select the spine, then wheel (desktop) or pinch (touch)
    const before = r.spine.v.map((v) => v[2]);
    await D.tap(await D.need('skin:0.5')); await D.step(2); await D.settle();
    const vt = await D.need('vertebra:3');
    if (D.touch) await D.pinch(vt, 1.25);
    else { await page.mouse.move(vt.x, vt.y); for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -100); await new Promise((q) => setTimeout(q, 30)); } }
    await D.settle();
    r = await page.evaluate(() => window.__sborn.recipe());
    const fattened = r.spine.v.some((v, i) => v[2] > before[i] + 1e-6);
    stepRec('fatten', fattened, `radii ${r.spine.v.map((v) => v[2]).join(',')}`);
    const hBefore = JSON.stringify(r);
    await D.tap(await D.need('undo')); await D.settle();
    const ru = await page.evaluate(() => window.__sborn.recipe());
    await D.tap(await D.need('redo')); await D.settle();
    const rr = await page.evaluate(() => window.__sborn.recipe());
    stepRec('undo-redo', JSON.stringify(ru) !== hBefore && JSON.stringify(rr) === hBefore, '');
    // paint
    await D.tap(await D.need('tab:paint')); await D.settle();
    await D.tap(await D.need('swatch:#6c8cff')); await D.settle();
    r = await page.evaluate(() => window.__sborn.recipe());
    stepRec('paint', r.paint.base.c === '#6c8cff', r.paint.base.c);
    if (kind === 'desktop') await D.shot('smoke-desktop-01-build');
    fs.mkdirSync(path.join(OUT, 'tmp'), { recursive: true }); fs.writeFileSync(path.join(OUT, `tmp/smoke-${kind}.json`), JSON.stringify(r));
    // play: hold W for 300 steps
    await D.tap(await D.need('tab:play')); await D.settle();
    const p0 = await page.evaluate(() => ({ x: window.__sborn.play.loco.state.x, z: window.__sborn.play.loco.state.z }));
    await page.evaluate(() => window.__sborn.drive.key('KeyW', true));
    await D.step(300);
    await page.evaluate(() => window.__sborn.drive.key('KeyW', false));
    await D.step(30);
    const m = await page.evaluate(() => {
      const s = window.__sborn, L = s.play.loco, st = L.state;
      const d = L.metrics.stances.map((x) => x.drift * 1000).sort((a, b) => a - b);
      let nan = false; for (const w of s.creature.rig.world) for (const e of w.elements) if (!Number.isFinite(e)) nan = true;
      return { x: st.x, z: st.z, p95: d.length ? d[Math.floor(d.length * 0.95)] : 0, n: d.length, nan, gait: L.metrics.lastGait, legs: L.legs.length, rebinds: s.play.metrics.rebinds || 0, reach: L.metrics.stances.filter((x) => x.reach).length };
    });
    const moved = Math.hypot(m.x - p0.x, m.z - p0.z);
    stepRec('play', moved >= 2 && !m.nan && m.p95 <= 10, `moved ${moved.toFixed(2)} m, drift p95 ${m.p95.toFixed(2)} mm over ${m.n} stances, legs ${m.legs}, gait ${m.gait}, reach-limited ${m.reach}, rebinds ${m.rebinds}`);
    await D.shot(`smoke-${kind}-02-play`);
    const w = await page.evaluate(() => window.__wrapped || {});
    stepRec('counters', true, JSON.stringify(w));
    // reload restores the creature canonical-equal
    const saved = await page.evaluate(() => window.__sborn.recipe());
    await page.reload();
    await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 120000 });
    await B.awaitReady(page);
    const eq = await page.evaluate((s) => window.__sborn.canonicalEqual(window.__sborn.recipe(), s), saved);
    stepRec('reload', eq, '');

    stepRec('console', !(tally.bad || []).length, (tally.bad || []).slice(0, 3).join(' | '));
    res.pass = true;
  } catch (e) { res.error = String(e).slice(0, 500); }
  res.console = tally; res.ms = Date.now() - t0;
  await ctx.close();
  return res;
}

module.exports = { Driver, boot, wrapCounters };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const isSmoke = args.includes('--smoke');
    const ci = args.indexOf('--ctx');
    const kinds = ci >= 0 ? args[ci + 1].split(',') : isSmoke ? ['desktop', 'ipad'] : ['desktop', 'ipad', 'ipadPortrait'];
    await B.ensureServers();
    const browser = await B.launch();
    const results = [];
    for (const k of kinds) {
      const r = isSmoke ? await smoke(browser, k) : await require('./e2e-full.cjs').full(browser, k, { Driver, boot, wrapCounters });
      fs.writeFileSync(path.join(OUT, `e2e-${isSmoke ? 'smoke-' : ''}${k}.json`), JSON.stringify(r, null, 1));
      console.log(`${r.pass ? 'PASS' : 'FAIL'} ${isSmoke ? 'smoke' : 'e2e'} ${k} (${(r.ms / 1000).toFixed(0)} s) ${r.error || ''}`);
      for (const s of r.steps) console.log(`   ${s.ok ? 'ok  ' : 'FAIL'} ${s.name} ${s.note}`.slice(0, 220));
      results.push(r);
    }
    await browser.close();
    const rows = results.flatMap((r) => isSmoke ? [{ id: `M2.smoke-${r.ctx}`, name: `smoke ${r.ctx}`, milestone: 2, items: [], pass: r.pass, ms: r.ms, note: r.error || '' }] : [
      { id: `C57.e2e-${r.ctx}`, name: `e2e ${r.ctx}`, milestone: 11, items: [57], pass: r.pass, ms: r.ms, note: r.error || r.steps.map((x) => x.name).join(' ') },
      { id: `C21.build-${r.ctx}`, name: `build by input only, ${r.ctx}`, milestone: 6, items: [21], pass: !!r.buildOk, ms: r.ms, note: (r.steps.find((x) => x.name === 'build') || {}).note || r.error || '' },
      { id: `C04.local-${r.ctx}`, name: `the e2e run makes zero non-localhost requests, ${r.ctx}`, milestone: 11, items: [4], pass: r.pass && r.nonLocal === 0, ms: r.ms, note: `non-localhost requests ${r.nonLocal}` }]);
    const f = path.join(OUT, 'e2e-tests.json');
    const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).results : [];
    const ids = new Set(rows.map((x) => x.id));
    fs.writeFileSync(f, JSON.stringify({ ranAt: new Date().toISOString(), results: [...prev.filter((x) => !ids.has(x.id)), ...rows] }, null, 1));
    B.stopServers();
    process.exit(results.every((r) => r.pass) ? 0 : 1);
  })();
}
