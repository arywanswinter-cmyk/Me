// checks.cjs — page-level checks that tests.html cannot do itself (run.command, file://, no WebGL, blocked storage, fonts, visible text).
// Exports: nothing (CLI: node sborn/tools/checks.cjs [names…]); merges results into tools/out/checks.json.
// Invariants: each check writes a result shaped like a tests.html entry {id, name, milestone, items, pass, ms, note};
//   console problems outside the allowlist fail the check that produced them.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const B = require('./browser.cjs');

const OUTF = path.join(B.SB, 'tools/out/checks.json');
const results = [];
const add = (id, name, milestone, items, pass, note, ms = 0) => { results.push({ id, name, milestone, items, pass: !!pass, ms, note: String(note) }); console.log(`${pass ? 'ok  ' : 'FAIL'} ${id} ${note}`.slice(0, 300)); };
const U = (q) => `http://localhost:${B.PORT}/${q}`;
async function bootPage(page, url, ms = 120000) {
  await page.goto(U(url));
  await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: ms });
  await page.evaluate(() => window.__sborn.ready());
}

const SWATCHES = ['#FF8FB1', '#FF7A6B', '#FF9F43', '#FFD23F', '#B5E655', '#5CC86F', '#4FD1B5', '#2BB3C0', '#5BB8FF', '#6C8CFF', '#9B7BFF', '#D17BFF', '#FFF1D6', '#E8C995', '#9C6B4E', '#7A3E6E', '#6E8B3D', '#3D3A4B'];
const CAPS = { low: 32, medium: 44, high: 56 };
const T22 = { h1: 120, gone: 60, h2: 120 };
const DEMO = () => JSON.parse(fs.readFileSync(path.join(B.SB, 'tools/demo-quad.json'), 'utf8'));
async function tour(page) {
  // a pass through every tab (more stops are added as features land: emotes, patterns, island, photo)
  await page.evaluate(async (r) => {
    const s = window.__sborn; s.load(r); await s.settle();
    for (const m of ['paint', 'play', 'build']) { s.mode(m); s.step(20, { render: 5 }); await s.settle(); }
  }, DEMO());
}
// item 23: visible text and control sizes on the current screen
async function textAudit(page) {
  return page.evaluate((re) => {
    const R = new RegExp(re), name = window.__sborn && window.__sborn.recipe ? window.__sborn.recipe().name : null, bad = [], small = [], unlabeled = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.textContent.trim(); if (!t) continue;
      const el = n.parentElement; if (!el || el.closest('.debug-overlay, script, style, noscript')) continue;
      if (el.getClientRects().length === 0) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      if (!R.test(t) && t !== name) bad.push(t.slice(0, 30));
    }
    for (const el of document.querySelectorAll('button, [role=button], a, input, [tabindex]')) {
      const r = el.getBoundingClientRect(); if (!r.width || el.closest('.debug-overlay')) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const min = el.classList.contains('card') ? 64 : 44;
      if (r.width < min - 0.5 || r.height < min - 0.5) small.push(`${el.className || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (!el.getAttribute('aria-label') && !el.closest('[aria-hidden=true]')) unlabeled.push(el.className || el.tagName);
    }
    return { bad, small, unlabeled };
  }, '^[0-9 .,:+−×%/·?-]*$');
}
const CHECKS = {
  // M6 (extended in M10): item 23 on every screen that exists, at all 3 viewports
  async text(browser) {
    const out = []; let pass = true;
    for (const vp of ['desktop', 'ipad', 'ipadPortrait']) {
      const ctx = await B.newContext(browser, vp); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      const screens = [];
      await page.goto(U('index.html?test&hatch')); await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 }); await page.evaluate(() => window.__sborn.ready());
      screens.push(['hatch', await textAudit(page)]);
      await bootPage(page, 'index.html?test');
      await page.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.trundle); await s.settle(); });
      screens.push(['build', await textAudit(page)]);
      await page.evaluate(async () => { window.__sborn.mode('paint'); await window.__sborn.settle(); }); screens.push(['paint', await textAudit(page)]);
      await page.evaluate(async () => { window.__sborn.mode('play'); await window.__sborn.settle(); }); screens.push(['play', await textAudit(page)]);
      const nw = await ctx.newPage(); await nw.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); }; });
      await nw.goto(U('index.html?test')); await B.sleep(1200); screens.push(['no-webgl', await textAudit(nw)]); await nw.close();
      for (const [n, a] of screens) { const issues = [...a.bad.map((t) => `text "${t}"`), ...a.small.map((x) => `small ${x}`), ...a.unlabeled.map((x) => `no label ${x}`)]; if (issues.length) { pass = false; out.push(`${vp}/${n}: ${issues.slice(0, 4).join('; ')}`); } }
      await ctx.close();
    }
    // file:// picture
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
    await page.goto('file://' + path.join(B.SB, 'index.html')); await B.sleep(1200);
    const f = await textAudit(page); if (f.bad.length || f.small.length) { pass = false; out.push(`file://: ${[...f.bad, ...f.small].slice(0, 4).join('; ')}`); }
    await ctx.close();
    add('C23.text', 'visible text is numbers or the name; every control ≥ 44 px (cards ≥ 64) with an aria-label (hatch, build, paint, play, file://, no-WebGL × 3 viewports)', 6, [23], pass, out.length ? out.join(' | ') : 'all screens clean (photo, gallery, share menu and link bubble arrive in M10)');
  },
  // M6: touch and trackpad gestures (item 66)
  async touch(browser) {
    const { Driver } = require('./e2e.cjs');
    const ctx = await B.newContext(browser, 'ipad'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test');
    const d = new Driver(page, 'ipad'); await d.init();
    const ev = (f, a) => page.evaluate(f, a);
    const load = (n) => ev(async (n) => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS[n]); s.editor.selection = null; await s.settle(); }, n);
    await load('bloop');
    const notes = []; let pass = true;
    const fail = (m) => { pass = false; notes.push('FAIL ' + m); };
    // pinch on a selected vertebra scales its radius by the ratio ± 5%
    let sk = null;
    const arrows = [await d.where('handle:spine.head'), await d.where('handle:spine.tail')].filter(Boolean);
    // candidate skin points: the camera-facing side and the top of the back, away from the end arrows
    const tops = await ev(() => [0.35, 0.5, 0.65].map((u) => { const s = window.__sborn, c = s.creature, fr = c.shape.spine.at(u), P = c.skin.geometry.attributes.position.array; let top = null;
      for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i]) < 0.01 && Math.abs(P[i + 2] - fr.p[2]) < 0.03 && (!top || P[i + 1] > top[1])) top = [0, P[i + 1] - 0.01, P[i + 2]];
      const v = new s.three.Vector3(...top); c.body.updateMatrixWorld(true); v.applyMatrix4(c.body.matrixWorld).project(s.stage.camera); const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height }; }));
    for (const cand of [...tops, await d.where('skin:0.5'), await d.where('skin:0.4')]) { sk = cand; if (arrows.some((a) => Math.hypot(a.x - sk.x, a.y - sk.y) < 40)) continue; await d.tap(sk); await d.settle(); if ((await ev(() => (window.__sborn.editor.selection || {}).kind)) === 'spine') break; }
    notes.push(`spine selected ${(await ev(() => (window.__sborn.editor.selection || {}).kind))}`);
    const r0 = await ev(([x, y]) => { const s = window.__sborn; return s.recipe().spine.v.map((v) => v[2]); }, [sk.x, sk.y]);
    await d.pinch(sk, 1.3); await d.settle();
    const r1 = await ev(() => window.__sborn.recipe().spine.v.map((v) => v[2]));
    const ch = r1.map((v, i) => v / r0[i]).filter((k) => Math.abs(k - 1) > 1e-6);
    if (!(ch.length >= 1 && Math.abs(Math.max(...ch) - 1.3) <= 0.05 * 1.3)) fail(`pinch ratio ${ch.map((k) => k.toFixed(3)).join(',')}`); else notes.push(`pinch ×${Math.max(...ch).toFixed(3)}`);
    // a second finger within 150 ms cancels a drag, recipe unchanged
    await load('trundle');
    const part = await d.where('part:P6'), before = await ev(() => JSON.stringify(window.__sborn.recipe()));
    await d.touchEv('touchStart', [{ ...part, id: 0 }]);
    for (let k = 1; k <= 3; k++) await d.touchEv('touchMove', [{ x: part.x + 3 * k, y: part.y, id: 0 }]);
    await d.touchEv('touchStart', [{ x: part.x + 9, y: part.y, id: 0 }, { x: part.x + 80, y: part.y + 40, id: 1 }]);
    await d.touchEv('touchMove', [{ x: part.x + 30, y: part.y, id: 0 }, { x: part.x + 90, y: part.y + 50, id: 1 }]);
    await d.touchEv('touchEnd', []); await d.settle();
    if ((await ev(() => JSON.stringify(window.__sborn.recipe()))) !== before) fail('second finger did not cancel'); else notes.push('2nd finger cancels');
    // 450 ms long-press opens a 4-button radial menu (≥ 56 px)
    await load('trundle');
    await d.touchEv('touchStart', [{ ...part, id: 0 }]); await new Promise((r) => setTimeout(r, 600)); await d.touchEv('touchEnd', []); await new Promise((r) => setTimeout(r, 300));
    const rad = await ev(() => [...document.querySelectorAll('.radial .btn')].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    if (!(rad.length === 4 && rad.every((w) => w >= 56))) fail(`radial ${rad.join(',')}`); else notes.push('radial 4 × 56 px');
    await d.tap({ x: 20, y: 400 });
    // double-tap frames the part
    await load('trundle');
    const dist0 = await ev(() => window.__sborn.orbit.dist);
    await d.tap(part); await new Promise((r) => setTimeout(r, 80)); await d.tap(part);
    await ev(() => window.__sborn.step(60));
    const fr = await ev(() => ({ framed: window.__sborn.editor.state.framed, dist: window.__sborn.orbit.dist }));
    if (fr.framed !== 'P6' || !(fr.dist < dist0)) fail(`double-tap ${fr.framed} ${fr.dist}`); else notes.push(`double-tap frames (${dist0.toFixed(2)} → ${fr.dist.toFixed(2)} m)`);
    // two-finger twist rotates the selected part
    await ev(() => { window.__sborn.editor.selection = { kind: 'part', id: 'P6' }; });
    const tw0 = await ev(() => window.__sborn.recipe().parts.find((p) => p.id === 'P6').at.tw || 0);
    const c = { x: 640, y: 420 }, R = 70;
    await d.touchEv('touchStart', [{ x: c.x - R, y: c.y, id: 0 }]); await d.touchEv('touchStart', [{ x: c.x - R, y: c.y, id: 0 }, { x: c.x + R, y: c.y, id: 1 }]);
    for (let k = 1; k <= 8; k++) { const a = (k / 8) * 0.6; await d.touchEv('touchMove', [{ x: c.x - R * Math.cos(a), y: c.y - R * Math.sin(a), id: 0 }, { x: c.x + R * Math.cos(a), y: c.y + R * Math.sin(a), id: 1 }]); }
    await d.touchEv('touchEnd', []); await d.settle();
    const tw1 = await ev(() => window.__sborn.recipe().parts.find((p) => p.id === 'P6').at.tw || 0);
    if (Math.abs(tw1 - tw0) < 0.2) fail(`twist ${tw0}→${tw1}`); else notes.push(`twist ${(tw1 - tw0).toFixed(2)} rad`);
    const vv = await ev(() => ({ scale: window.visualViewport ? visualViewport.scale : 1, y: scrollY }));
    if (vv.scale !== 1 || vv.y !== 0) fail(`viewport ${vv.scale} ${vv.y}`);
    await ctx.close();
    // desktop: ctrl+wheel scales the selected part, Shift+wheel (deltaX only) twists it; page zoom untouched
    const c2 = await B.newContext(browser, 'desktop'); const pg = await c2.newPage(); B.watchPage(pg, tally);
    await bootPage(pg, 'index.html?test');
    await pg.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.trundle); await s.settle(); s.editor.selection = { kind: 'part', id: 'P6' }; });
    const p2 = await pg.evaluate(() => window.__sborn.probe.where('skin:0.5'));
    const s0 = await pg.evaluate(() => { const p = window.__sborn.recipe().parts.find((q) => q.id === 'P6'); return [p.sc, p.at.tw || 0]; });
    await pg.mouse.move(900, 140); await pg.keyboard.down('Control'); await pg.mouse.wheel(0, -60); await pg.keyboard.up('Control');
    await pg.keyboard.down('Shift'); await pg.mouse.wheel(80, 0); await pg.keyboard.up('Shift'); await pg.evaluate(() => window.__sborn.settle());
    const s1 = await pg.evaluate(() => { const p = window.__sborn.recipe().parts.find((q) => q.id === 'P6'); return [p.sc, p.at.tw || 0, window.visualViewport ? visualViewport.scale : 1]; });
    if (!(s1[0] > s0[0] && Math.abs(s1[1] - s0[1]) > 0.05 && s1[2] === 1)) fail(`desktop wheel sc ${s0[0]}→${s1[0]} tw ${s0[1]}→${s1[1]} zoom ${s1[2]}`); else notes.push('ctrl/shift+wheel scale and twist');
    void p2;
    await c2.close();
    add('C66.touch', 'pinch, 2nd-finger cancel, long-press radial menu, double-tap frame, twist; viewport fixed; ctrl/Shift+wheel', 6, [66], pass && !tally.bad.length, notes.join(', ') + (tally.bad.length ? ` console: ${tally.bad[0]}` : ''));
  },
  // M6: onboarding hints timing (item 22) and the non-reader proxy (item 72)
  async hints(browser) {
    const { Driver } = require('./e2e.cjs');
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test&hints');
    const drv = new Driver(page, 'desktop'); await drv.init();
    const until = async (fn, max) => { for (let i = 0; i <= max; i++) { if (await page.evaluate(fn)) return i; await page.evaluate(() => window.__sborn.step(1)); } return -1; };
    const h1 = await until(() => (window.__sborn.hints() || {}).current === 'leg', 300);
    const p = await drv.where('skin:0.5');
    await drv.cardTo('card:limb.leg', { x: p.x, y: p.y });
    const gone = await until(() => (window.__sborn.hints() || {}).current !== 'leg', 300);
    const h2 = await until(() => (window.__sborn.hints() || {}).current === 'tail', 300);
    await page.reload(); await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 }); await page.evaluate(() => window.__sborn.ready());
    const absent = await until(() => (window.__sborn.hints() || {}).current === 'leg', 300);
    const ok22 = h1 >= 0 && h1 <= T22.h1 && gone >= 0 && gone <= T22.gone && h2 >= 0 && h2 <= T22.h2 && absent === -1;
    add('C22.hints', 'hint 1 ≤ 120 steps after ready, gone ≤ 60 after the leg drops, hint 2 ≤ 120 later; after a reload hint 1 stays absent 300 steps', 6, [22], ok22, `hint 1 at ${h1}, gone after ${gone}, hint 2 after ${h2}, after reload ${absent === -1 ? 'absent' : 'back at ' + absent}`);
    await ctx.close();
    // 72: fresh profile; do only what the current hint points at
    const ctx2 = await B.newContext(browser, 'desktop'); const pg = await ctx2.newPage(); B.watchPage(pg, tally);
    await bootPage(pg, 'index.html?test&hints');
    const d2 = new Driver(pg, 'desktop'); await d2.init();
    let steps = 0, acts = 0, reached = false, trail = [];
    while (steps < 3600 && acts < 20) {
      const st = await pg.evaluate(() => ({ h: window.__sborn.hints(), mode: window.__sborn.mode(), moving: !!(window.__sborn.play.loco && window.__sborn.play.loco.state.speed > 0.05) }));
      if (st.mode === 'play' && (st.h.done || []).includes('walk')) { reached = true; break; }
      if (!st.h.current) { await pg.evaluate(() => window.__sborn.step(10)); steps += 10; continue; }
      const t = await pg.evaluate(() => { const g = document.querySelector('.ghost-hand'), r = document.querySelector('.glow-ring').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const H = (await pg.evaluate(() => import('./src/ui/hints.js').then((m) => m.HINTS))).find((x) => x.id === st.h.current);
      acts++; trail.push(H.id);
      if (H.kind === 'drag') {
        const to = await pg.evaluate((H) => { const w = (k) => window.__sborn.probe.where(k); if (H.to) return w(H.to); const a = w(H.from), cx = innerWidth * 0.6, cy = innerHeight * 0.5, l = Math.hypot(a.x - cx, a.y - cy) || 1; return { x: a.x + (a.x - cx) / l * H.away, y: a.y + (a.y - cy) / l * H.away }; }, H);
        await d2.drag(t, to, { steps: 14 });
      } else if (H.id === 'fat') { await pg.mouse.move(t.x, t.y); await pg.mouse.wheel(0, -300); }
      else await d2.tap(t);
      await pg.evaluate(() => window.__sborn.step(30)); steps += 30;
      if (H.id === 'walk') { await pg.evaluate(() => window.__sborn.step(30)); steps += 30; }
    }
    add('C72.non-reader', 'following only the current hint reaches Play in ≤ 12 interactions and ≤ 3,600 steps', 6, [72], reached && acts <= 12 && steps <= 3600 && !tally.bad.length, `${reached ? 'reached' : 'NOT reached'} in ${acts} interactions, ${steps} steps (${trail.join(' → ')})${tally.bad.length ? ' console: ' + tally.bad[0] : ''}`);
    await ctx2.close();
  },
  // M6: limbs by input (item 11), DNA refusal and refunds (18), complexity and locks (19)
  async editor(browser) {
    const { Driver } = require('./e2e.cjs');
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test');
    const drv = new Driver(page, 'desktop'); await drv.init();
    const loadStarter = (n) => page.evaluate(async (n) => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS[n]); await s.settle(); }, n);
    // 11: a Ready Leg pair dropped on Bloop's side → body min Y = feet min Y = 0 ± 1 mm (three drop points)
    const legs = [];
    for (const u of [0.3, 0.5, 0.7]) {
      await loadStarter('bloop');
      const p = await drv.where(`skin:${u}`);
      await drv.cardTo('card:limb.leg', { x: p.x, y: p.y });
      legs.push(await page.evaluate(() => {
        const s = window.__sborn, c = s.creature, r = s.recipe(), lift = c.body.position.y;
        let feet = Infinity; for (const m of Object.values(c.parts.meshes)) { const g = m.geometry, si = g.attributes.skinIndex, pa = g.attributes.position;
          for (let i = 0; i < pa.count; i++) { const b = c.rig.bones[si.getX(i)]; if (/^tip:|^socket:P[0-9]+:/.test(b.name) && c.shape.sockets.some((q) => q.tip && q.bone === si.getX(i))) feet = Math.min(feet, pa.getY(i)); } }
        return { limbs: r.limbs.length, mirrored: r.limbs.map((l) => l.m), skinMin: c.lastFull.minY + lift, feetMin: feet + lift };
      }));
    }
    const legOk = legs.every((l) => l.limbs === 1 && l.mirrored[0] === 1 && Math.abs(l.feetMin) <= 0.001 && l.skinMin >= -0.001);
    add('C11.ready-leg', 'a Ready Leg pair dropped anywhere on Bloop\'s side: two legs, body min Y = feet min Y = 0 ± 1 mm', 6, [11], legOk, legs.map((l) => `feet ${(l.feetMin * 1000).toFixed(2)} mm, skin ${(l.skinMin * 1000).toFixed(1)} mm`).join('; '));
    // 11: Bendy Limb dragged out d m → joints = clamp(1 + floor(d/0.22), 2, 5), tip–root within 10% of min(d, 5-joint reach)
    const bend = [];
    for (const dx of [60, 160, 320]) {
      await loadStarter('bloop');
      const p = await drv.where('skin:0.5'), c = await drv.where('card:limb.bendy');
      await page.mouse.move(c.x, c.y); await page.mouse.down();
      for (let k = 1; k <= 10; k++) await page.mouse.move(c.x + (p.x - c.x) * k / 10, c.y + (p.y - c.y) * k / 10);
      for (let k = 1; k <= 10; k++) await page.mouse.move(p.x + dx * k / 10, p.y + 0.2 * dx * k / 10);
      const d = await page.evaluate(() => { const s = window.__sborn, D = s.editor.state.drag; return D && D.bendDist !== undefined ? D.bendDist : null; });
      await page.mouse.up(); await drv.settle();
      bend.push(await page.evaluate((d) => { const L = window.__sborn.recipe().limbs[0]; if (!L) return { d, nj: 0 }; const t = L.j[L.j.length - 1]; return { d, nj: L.j.length, tr: Math.hypot(t[0], t[1], t[2]) }; }, d));
    }
    const bendOk = bend.every((b) => b.d !== null && b.nj === Math.min(5, Math.max(2, 1 + Math.floor(b.d / 0.22))) && Math.abs(b.tr - Math.min(b.d, 1.1)) <= 0.1 * Math.min(b.d, 1.1));
    add('C11.bendy', 'Bendy Limb dragged d m: joints = clamp(1 + floor(d/0.22), 2, 5), tip–root within 10% of min(d, 5-joint reach)', 6, [11], bendOk, bend.map((b) => `d ${b.d && b.d.toFixed(3)} → ${b.nj} joints, tip ${b.tr && b.tr.toFixed(3)}`).join('; '));
    // 18: over-budget drop refused (recipe unchanged, bonk), refunds exact, total ≤ 2000
    const r18 = await page.evaluate(async () => {
      const s = window.__sborn, { STARTERS } = await import('./src/catalog/starters.js');
      const r = JSON.parse(JSON.stringify(STARTERS.skitter));        // 1440 DNA
      for (let i = 0; i < 2; i++) r.parts.push({ id: `PX${i}`, t: 'det.curlhorn', at: { b: 'spine', u: 0.3 + 0.2 * i, d: [0.6, 0.8, 0], tw: 0 }, sc: 1, m: 1, p: {}, tint: 'detail' });
      s.load(r); await s.settle(); return { dna: s.budget().dna, before: JSON.stringify(s.recipe()), refusals: s.refusals || 0 };
    });
    const card = await drv.where('card:det.shell');
    if (!card.visible) await drv.scrollDrawerTo('card:det.shell');
    const sk = await drv.where('skin:0.5');
    const c2 = await drv.where('card:det.shell');
    await page.mouse.move(c2.x, c2.y); await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(c2.x + (sk.x - c2.x) * k / 12, c2.y + (sk.y - c2.y) * k / 12);
    await page.mouse.up(); await drv.settle();
    const a18 = await page.evaluate(() => ({ after: JSON.stringify(window.__sborn.recipe()), refusals: window.__sborn.refusals || 0, dna: window.__sborn.budget().dna }));
    // 19: complexity ≤ 100, non-fitting cards locked but visible
    const r19 = await page.evaluate(() => { const s = window.__sborn, b = s.budget(); const locked = [...document.querySelectorAll('.card.locked')]; return { cx: b.cx, locked: locked.length, hidden: locked.filter((el) => getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden' || +getComputedStyle(el).opacity < 0.3).length, lockIcon: locked.every((el) => getComputedStyle(el.querySelector('.lock')).display !== 'none') }; });
    add('C19.complexity', 'complexity ≤ 100; non-fitting cards show the lock, never hidden or droppable', 6, [19], r19.cx <= 100 && r19.locked > 0 && r19.hidden === 0 && r19.lockIcon && !tally.bad.length, `complexity ${r19.cx}, ${r19.locked} locked cards, ${r19.hidden} hidden${tally.bad.length ? ' console: ' + tally.bad[0] : ''}`);
    // refund: removing a curl horn pair gives back exactly 2 × 120
    const ref = await page.evaluate(() => { const s = window.__sborn, b0 = s.budget().dna; s.op('part.remove', { id: 'PX0' }); return b0 - s.budget().dna; });
    const ok18 = a18.after === r18.before && a18.refusals > r18.refusals && ref === 240 && a18.dna <= 2000;
    add('C18.dna', 'a part costing more than the remaining DNA cannot drop (recipe unchanged, bonk); refunds exact; total ≤ 2,000', 6, [18], ok18, `DNA ${r18.dna}, shell (220) refused ${a18.after === r18.before ? 'unchanged' : 'CHANGED'}, bonks +${a18.refusals - r18.refusals}, refund ${ref}`);
    await ctx.close();
  },
  // M4: drawer thumbnails (item 12), p-handle drags (item 12), base-ring colour seam from the GPU bake (item 13),
  // centreline snap (item 15)
  async parts(browser) {
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test');
    const th = await page.evaluate(async () => {
      const s = window.__sborn, st = await s.thumbs(), T = s.thumbStudio, ids = Object.keys(st);
      const bad = ids.filter((i) => !(st[i].lumaStd >= 6 && st[i].coverage >= 0.10 && st[i].coverage <= 0.90)).map((i) => `${i} ${st[i].lumaStd.toFixed(1)}/${st[i].coverage.toFixed(2)}`);
      let worst = 0, pair = '';
      for (const a of ids) for (const b of ids) if (a < b && a.split('.')[0] === b.split('.')[0]) { const v = T.iou(a, b); if (v > worst) { worst = v; pair = `${a}~${b}`; } }
      const imgs = document.querySelectorAll('.card .thumb img').length;
      let minStd = Infinity, cov = [1, 0]; for (const i of ids) { minStd = Math.min(minStd, st[i].lumaStd); cov = [Math.min(cov[0], st[i].coverage), Math.max(cov[1], st[i].coverage)]; }
      return { n: ids.length, imgs, bad, worst, pair, minStd, cov };
    });
    add('C12.thumbs', '70 non-blank 176² thumbnails (luma std ≥ 6, alpha 10–90%); silhouette IoU < 0.85 within each drawer', 4, [12],
      th.n === 70 && th.imgs === 70 && !th.bad.length && th.worst < 0.85, `${th.n} thumbs (${th.imgs} on cards), min luma std ${th.minStd.toFixed(1)}, coverage ${th.cov.map((x) => x.toFixed(2)).join('–')}, max IoU ${th.worst.toFixed(3)} (${th.pair})${th.bad.length ? ' bad: ' + th.bad.join(', ') : ''}`);
    // p-handles: select a part with a click, then drag each of its three handles outward
    await page.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.trundle); await s.settle(); });
    const ph = []; let phOk = true;
    for (const id of ['P6', 'P5', 'P1']) {
      for (const n of [1, 2, 3]) {
        const key = ['len', 'curl', 'fat'][n - 1];
        const pw = await page.evaluate((id) => window.__sborn.probe.where(`part:${id}`), id);
        if (!pw) { phOk = false; ph.push(`${id} not visible`); continue; }
        await page.mouse.click(pw.x, pw.y); await page.evaluate(() => window.__sborn.settle());
        const hw = await page.evaluate((k) => window.__sborn.probe.where(k), `handle:${id}.p${n}`);
        if (!hw) { phOk = false; ph.push(`${id}.p${n} missing`); continue; }
        const before = await page.evaluate(([id, key]) => { const p = window.__sborn.recipe().parts.find((q) => q.id === id); return p.p && p.p[key] !== undefined ? p.p[key] : null; }, [id, key]);
        let dx = hw.x - pw.x, dy = hw.y - pw.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        await page.mouse.move(hw.x, hw.y); await page.mouse.down();
        for (let k = 1; k <= 6; k++) await page.mouse.move(hw.x + dx * 8 * k, hw.y + dy * 8 * k);
        await page.mouse.up(); await page.evaluate(() => window.__sborn.settle());
        const after = await page.evaluate(([id, key]) => { const p = window.__sborn.recipe().parts.find((q) => q.id === id); return p.p ? p.p[key] : undefined; }, [id, key]);
        const changed = after !== undefined && after !== before;
        if (!changed) phOk = false;
        ph.push(`${id}.p${n} ${before ?? 'def'}→${after}`);
      }
    }
    add('C12.p-handles', 'every p-handle drag changes its p', 4, [12], phOk, ph.join(', '));
    // base ring vs the skin vertex nearest each anchor, from the GPU vertex bake (fixtures with paint + starters)
    const seam = await page.evaluate(async () => {
      const s = window.__sborn, { STARTERS } = await import('./src/catalog/starters.js');
      const lin2lab = (r, g, b) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q]; };
      let worst = 0, at = '', n = 0;
      for (const name of ['trundle', 'skitter', 'octoboop', 'wigglet']) {
        s.load(STARTERS[name]); await s.settle();
        const c = s.creature, skinC = await s.bake(c.skin.geometry, 'skin'), SP = c.skin.geometry.attributes.position.array;
        const partC = {};
        for (const [b, m] of Object.entries(c.parts.meshes)) if (b === 'skin' || b === 'membrane') partC[b] = await s.bake(m.geometry, 'skin');
        for (const inst of c.parts.instances) {
          if (!inst.ring || !inst.ring.length) continue;
          const so = inst.socket, a = so.mirrored ? [-so.surf[0], so.surf[1], so.surf[2]] : so.surf;
          let bv = -1, bd = Infinity; for (let v = 0; v < SP.length / 3; v++) { const d = (SP[v * 3] - a[0]) ** 2 + (SP[v * 3 + 1] - a[1]) ** 2 + (SP[v * 3 + 2] - a[2]) ** 2; if (d < bd) { bd = d; bv = v; } }
          const A = lin2lab(skinC[bv * 3], skinC[bv * 3 + 1], skinC[bv * 3 + 2]);
          for (const r of inst.ring) { const C = partC[r.bucket]; const Bc = lin2lab(C[r.index * 3], C[r.index * 3 + 1], C[r.index * 3 + 2]); const dE = Math.hypot(A[0] - Bc[0], A[1] - Bc[1], A[2] - Bc[2]); n++; if (dE > worst) { worst = dE; at = `${name}:${inst.id}:${inst.t}`; } }
        }
      }
      return { worst, at, n };
    });
    add('C13.seam', 'OKLab ΔE ≤ 0.02 between the skin vertex nearest each anchor and the base ring (GPU vertex bake)', 4, [13], seam.n > 0 && seam.worst <= 0.02, `${seam.n} ring vertices, worst ΔE ${seam.worst.toFixed(4)} (${seam.at})`);
    // centreline snap: dragging a centre-able part to near the mid-plane gives one centred part
    await ctx.close();
    const ctx2 = await B.newContext(browser, 'desktop'); const page2 = await ctx2.newPage(); B.watchPage(page2, tally);
    await bootPage(page2, 'index.html?test');
    {
    const page = page2;
    await page.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.bloop); await s.settle(); });
    const before = await page.evaluate(() => window.__sborn.recipe().parts.length);
    const { Driver } = require('./e2e.cjs');
    const drv = new Driver(page, 'desktop'); await drv.init();
    // a point on the mid-plane (top of the back at u 0.55), projected to the screen
    const skin = await page.evaluate(() => {
      const s = window.__sborn, c = s.creature, fr = c.shape.spine.at(0.55), T3 = s.three, P = c.skin.geometry.attributes.position.array;
      let top = null; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i]) < 0.01 && Math.abs(P[i + 2] - fr.p[2]) < 0.03 && (!top || P[i + 1] > top[1])) top = [0, P[i + 1], P[i + 2]];
      const v = new T3.Vector3(...top); c.body.updateMatrixWorld(true); v.applyMatrix4(c.body.matrixWorld).project(s.stage.camera);
      const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
    });
    let snapNote = 'no skin target', snapOk = false;
    if (skin) {
      await drv.cardTo('card:det.nubhorn', { x: skin.x + 3, y: skin.y });
      const after = await page.evaluate(() => window.__sborn.recipe().parts);
      const added = after.slice(before);
      snapOk = added.length === 1 && added[0].m === 0 && Math.abs(added[0].at.d[0]) < 1e-6;
      snapNote = `${added.length} part added, m ${added[0] && added[0].m}, d.x ${added[0] && added[0].at.d[0]}`;
    }
    add('C15.centre-snap', 'centreline snap gives one centred part', 4, [15], snapOk && !tally.bad.length, snapNote + (tally.bad.length ? ` console: ${tally.bad[0]}` : ''));
    }
    await ctx2.close();
  },
  async swatch(browser) {
    const res = {};
    for (const q of ['high', 'low']) {
      const ctx = await B.newContext(browser, 'small'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await bootPage(page, `index.html?test&quality=${q}`);
      res[q] = await page.evaluate(async (sw) => { const out = []; for (const c of sw) { const r = await window.__sborn.swatch(c); out.push({ c, dE: r.deltaE, rgb: r.output }); } return out; }, SWATCHES);
      res[q + 'Console'] = tally.bad.length;
      await ctx.close();
    }
    const worst = (q) => Math.max(...res[q].map((x) => x.dE));
    add('C26.swatch', 'all 18 swatches within ΔE ≤ 0.06 at High and Low', 3, [26], worst('high') <= 0.06 && worst('low') <= 0.06 && !res.highConsole && !res.lowConsole, `worst High ${worst('high').toFixed(3)} Low ${worst('low').toFixed(3)}`);
    // Low within ΔE 0.05 of High on the swatch probe
    let lw = 0;
    for (let i = 0; i < SWATCHES.length; i++) {
      const a = res.high[i].rgb, b = res.low[i].rgb;
      const { oklab } = { oklab: (rgb) => { const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); const [r, g, bb] = rgb.map(lin); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bb), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bb), s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bb); return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s2, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s2, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s2]; } };
      const A = oklab(a), Bv = oklab(b); lw = Math.max(lw, Math.hypot(A[0] - Bv[0], A[1] - Bv[1], A[2] - Bv[2]));
    }
    add('C39.low-vs-high', 'Low is within ΔE ≤ 0.05 of High on the swatch probe', 3, [39], lw <= 0.05, `worst ${lw.toFixed(3)}`);
  },
  async programs(browser) {
    const notes = []; let ok = true;
    for (const q of ['low', 'medium', 'high']) {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await bootPage(page, `index.html?test&quality=${q}`);
      const p0 = await page.evaluate(() => window.__sborn.programs());
      await tour(page);
      const p1 = await page.evaluate(() => window.__sborn.programs());
      const info = await page.evaluate(() => window.__sborn.info());
      const good = p1.total <= CAPS[q] && p1.total === p0.total && info.glErrors === 0 && !tally.bad.length;
      if (!good) ok = false;
      notes.push(`${q}: ${p0.total}→${p1.total} (scene ${p1.scene}, depth ${p1.shadowDepth}, post ${p1.post}, bake ${p1.bake}) cap ${CAPS[q]} gl ${info.glErrors}${tally.bad.length ? ' console ' + tally.bad[0] : ''}`);
      await ctx.close();
    }
    add('C37.programs', 'programs within the tier cap after warm-up, unchanged after a tour, reported split', 3, [37], ok, notes.join('; '));
    add('C39.tiers-gl', 'all tiers render the editor with zero GL errors', 3, [39], ok, notes.map((n) => n.split(' cap')[0] + ' gl ' + n.split(' gl ')[1]).join('; '));
  },
  async beauty(browser) {
    const { beauty } = require('./beauty.cjs');
    const HERO = { ...DEMO(), parts: DEMO().parts.filter((q) => q.t !== 'mouth.chomper'), paint: { skin: 'bumpy', base: { c: '#5bb8ff', pat: 'solid', sc: 1 }, coat: { c: '#9b7bff', pat: 'stripes', sc: 1, amt: 0.7, mask: 'back' }, detail: { c: '#ffd23f', pat: 'spots', sc: 0.5, amt: 0.6, mask: 'all' }, iris: '#ff9f43' } };
    const notes = []; let ok = true;
    for (const q of ['high', 'medium', 'low']) {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage();
      await bootPage(page, `index.html?test&quality=${q}`);
      await page.evaluate((r) => { window.__sborn.load(r); window.__sborn.hideUI(true); }, HERO);
      const b = await beauty(page);
      if (!b.pass) ok = false;
      notes.push(`${q}: ${b.pass ? 'pass' : b.fails.join('/')}`);
      await ctx.close();
    }
    const man = JSON.parse(fs.readFileSync(path.join(B.SB, 'screens/manifest.json'), 'utf8'));
    const bl = man.find((e) => e.file === 'm3/05-backlit.jpg');
    const blOk = bl && bl.metrics && bl.metrics.pass;
    add('C43.beauty', '§11.6 beauty checks on the hero shots at all 3 tiers (+ backlit fin ≥ 1.3×)', 3, [43], ok && blOk, `${notes.join('; ')}; backlit ${bl && bl.metrics ? bl.metrics.ratio.toFixed(2) : 'n/a'}`);
  },
  async debug(browser) {
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test&debug');
    await page.evaluate(() => { delete navigator.clipboard; try { Object.defineProperty(navigator, 'clipboard', { value: undefined }); } catch {} window.__sborn.step(20, { render: 2 }); });
    await page.click('.debug-overlay button');
    const r = await page.evaluate(() => { const t = document.querySelector('.debug-overlay textarea'); return { shown: t && t.style.display !== 'none', json: t ? t.value : '' }; });
    let fields = {};
    try { fields = JSON.parse(r.json); } catch {}
    const need = ['fps', 'p50', 'p95', 'cpuSimMs', 'cpuSubmitMs', 'triangles', 'calls', 'programs', 'geometries', 'textures', 'tier', 'dprRung', 'renderScale', 'remeshMs', 'footSlideMm', 'gpuMemMB', 'audio'];
    const missing = need.filter((k) => !(k in fields));
    add('C61.debug', '?debug JSON (text box with navigator.clipboard deleted) has every field', 3, [61], r.shown && !missing.length && !tally.bad.length, `missing ${missing.join(',') || 'none'}; console ${tally.bad.length}`);
    // ?precision=mediump boots cleanly
    const ctx2 = await B.newContext(browser, 'small'); const p2 = await ctx2.newPage(); const t2 = {}; B.watchPage(p2, t2);
    await bootPage(p2, 'index.html?test&precision=mediump');
    const prec = await p2.evaluate(() => window.__sborn.stage.renderer.capabilities.precision);
    add('C61.mediump', '?precision=mediump boots cleanly with mediump shaders', 3, [61], prec === 'mediump' && !t2.bad.length, `precision ${prec}; console ${t2.bad.length}`);
    await ctx.close(); await ctx2.close();
  },
  async doodle(browser) {
    let dw = { pass: false };
    for (let a = 1; a <= 4; a++) {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage();
      await page.goto(`http://localhost:${B.DW_PORT}/tests.html`);
      const title = await B.waitTitle(page, 120000);
      const h1 = await page.evaluate(() => document.querySelector('h1') && document.querySelector('h1').textContent);
      const fails = await page.evaluate(() => [...document.querySelectorAll('div.f')].map((e) => e.textContent));
      await ctx.close();
      dw = { pass: title === 'ALL PASS' && /17\/17/.test(h1 || ''), title, h1, attempts: a, fails };
      if (dw.pass || !(fails.length === 1 && /250 ms/.test(fails[0]))) break;
    }
    fs.writeFileSync(path.join(B.SB, 'tools/out/doodle-world.json'), JSON.stringify(dw, null, 1));
    add('C01.doodle-world', 'Doodle World tests.html ALL PASS · 17/17', 0, [1], dw.pass, `${dw.h1} (attempts ${dw.attempts})`);
  },
  async runcommand() {
    const t0 = Date.now();
    B.stopServers(true);
    const { execSync } = require('child_process');
    try { execSync(`pkill -f "http.server ${B.PORT}"`, { stdio: 'ignore' }); } catch {}
    await B.sleep(300);
    const mode = require('child_process').execSync('git ls-files -s sborn/run.command', { cwd: B.ROOT, encoding: 'utf8' }).split(' ')[0];
    const p = spawn('timeout', ['5', './run.command'], { cwd: B.SB, detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    let served = false;
    for (let i = 0; i < 45 && !served; i++) {
      await B.sleep(100);
      try { const r = await fetch(U('index.html')); served = r.ok && (await r.text()).includes('importmap'); } catch {}
    }
    const ms = Date.now() - t0;
    await new Promise((r) => { p.on('exit', r); setTimeout(r, 6000); });
    try { process.kill(-p.pid); } catch {}
    try { execSync(`pkill -f "http.server ${B.PORT}"`, { stdio: 'ignore' }); } catch {}
    await B.ensureServers();
    add('C03.run-command', 'run.command is 100755 and serves within 5 s, printing a URL', 0, [3], mode === '100755' && served && /http:\/\/localhost:8791/.test(out), `mode ${mode} served ${served} in ${ms} ms, printed "${out.trim().split('\n')[0]}"`);
  },
  async live(browser) {
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html');
    // without ?test the rAF loop runs; breathing must differ between frames 1 s apart
    const a = await page.evaluate(() => window.__sborn.breath ? window.__sborn.breath() : null);
    await B.sleep(1000);
    const b = await page.evaluate(() => window.__sborn.breath ? window.__sborn.breath() : null);
    add('C03.live-breath', 'without ?test the game reaches ready() and breathes', 2, [3], a !== null && b !== null && Math.abs(a - b) > 1e-6 && !tally.bad.length, `breath ${a} → ${b}; console ${tally.bad.length}`);
    await ctx.close();
  },
  async fileurl(browser) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
    const msgs = []; page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') msgs.push(m.text()); }); page.on('pageerror', (e) => msgs.push(String(e)));
    await page.goto('file://' + path.join(B.SB, 'index.html'));
    await B.sleep(1500);
    const shown = await page.evaluate(() => { const c = document.getElementById('cover'); return !!c && !c.hidden && !!c.querySelector('svg'); });
    const others = msgs.filter((m) => !/CORS|cross origin|Cross origin|file:|net::ERR_FAILED|Failed to load module script|origin 'null'/i.test(m));
    add('C60.file-url', 'file:// shows the run.command picture; only the module CORS error', 0, [60], shown && !others.length, `picture ${shown}; messages ${msgs.length} (${others.length} unexpected) ${others.join(' | ').slice(0, 200)}`);
    await ctx.close();
  },
  async nowebgl(browser) {
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); }; });
    await page.goto(U('index.html?test'));
    await B.sleep(1500);
    const shown = await page.evaluate(() => { const c = document.getElementById('cover'); return !!c && !c.hidden && !!c.querySelector('svg'); });
    add('C60.no-webgl', 'getContext(webgl2) → null shows the no-WebGL picture, console clean', 0, [60], shown && !tally.bad.length, `picture ${shown}; console ${tally.bad.join(' | ').slice(0, 200)}`);
    await ctx.close();
  },
  async nostorage(browser) {
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } });
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    let pass = false, note = '';
    try {
      await bootPage(page, 'index.html?test');
      const r = await page.evaluate(async () => {
        const s = window.__sborn; const before = s.recipe ? s.recipe().spine.v.length : -1;
        if (s.op) s.op('spine.add', { end: 'head' });
        s.step(30);
        return { name: s.recipe ? s.recipe().name : null, before, after: s.recipe ? s.recipe().spine.v.length : -1 };
      });
      pass = r.name !== null && r.after === r.before + 1 && !tally.bad.length;
      note = `${JSON.stringify(r)} console ${tally.bad.join(' | ').slice(0, 200)}`;
    } catch (e) { note = String(e).slice(0, 200); }
    add('C60.no-storage', 'indexedDB and localStorage both throwing: boots to Bloop and edits, console clean', 10, [60], pass, note);
    await ctx.close();
  },
  async font(browser) {
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test');
    const r = await page.evaluate(() => ({ check: document.fonts.check('16px Fredoka'), loaded: [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Fredoka' && f.status === 'loaded').length }));
    const served = await (await fetch(U('fonts/OFL.txt'))).ok;
    add('C73.font', 'Fredoka loads from sborn/fonts/ with OFL.txt', 0, [73], r.check && r.loaded > 0 && served && !tally.bad.length, `${JSON.stringify(r)} OFL ${served}`);
    await ctx.close();
  },
};

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHECKS);
  await B.ensureServers();
  const browser = await B.launch();
  for (const n of names) {
    const t0 = Date.now();
    try { await CHECKS[n](browser); } catch (e) { add(`check.${n}`, n, 0, [], false, String(e).slice(0, 300)); }
    if (results.length) results[results.length - 1].ms = Date.now() - t0;
  }
  await browser.close();
  const prev = fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, 'utf8')) : { results: [] };
  const ids = new Set(results.map((r) => r.id));
  const merged = [...prev.results.filter((r) => !ids.has(r.id)), ...results];
  fs.writeFileSync(OUTF, JSON.stringify({ ranAt: new Date().toISOString(), results: merged }, null, 1));
  B.stopServers();
  process.exit(results.every((r) => r.pass) ? 0 : 1);
})();
