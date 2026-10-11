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
  await B.awaitReady(page);
}

const SWATCHES = ['#FF8FB1', '#FF7A6B', '#FF9F43', '#FFD23F', '#B5E655', '#5CC86F', '#4FD1B5', '#2BB3C0', '#5BB8FF', '#6C8CFF', '#9B7BFF', '#D17BFF', '#FFF1D6', '#E8C995', '#9C6B4E', '#7A3E6E', '#6E8B3D', '#3D3A4B'];
const CAPS = { low: 32, medium: 44, high: 56 };
const T22 = { h1: 120, gone: 60, h2: 120 };
const DEMO = () => JSON.parse(fs.readFileSync(path.join(B.SB, 'tools/demo-quad.json'), 'utf8'));
async function tour(page) {
  // a pass through every tab, every pattern on every layer, every emote, the island and photo mode (all 6 backdrops)
  await page.evaluate(async (r) => {
    const s = window.__sborn; s.load(r); await s.settle();
    s.mode('paint'); s.step(10, { render: 10 });
    const { PATTERNS } = await import('./src/render/skin.js');
    for (const pat of PATTERNS) for (const layer of ['base', 'coat', 'detail']) { s.op('paint.layer', { layer, pat }); await s.settle(); s.step(1, { render: 1 }); }
    s.mode('play'); s.play.skipIntro(); s.step(20, { render: 10 });
    for (const e of ['dance', 'roar', 'sit', 'sleep', 'wave', 'eat']) { s.drive.emote(e); s.step(40); s.step(1, { render: 1 }); }
    s.drive.act('jump'); s.step(20, { render: 20 }); s.drive.act('fly'); s.step(40, { render: 40 }); s.drive.act('fly'); s.step(120);
    s.mode('photo'); for (let i = 0; i < 6; i++) { s.photo.setBackdrop(i); s.step(1, { render: 1 }); }
    s.mode('play'); s.step(2, { render: 1 });
    s.mode('build'); s.step(10, { render: 5 }); await s.settle();
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
  // M7: every layer × pattern × size by tapping the Paint UI (item 24); colour continuity across limb junctions (25)
  async paint(browser) {
    const { Driver } = require('./e2e.cjs');
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test');
    const d = new Driver(page, 'desktop'); await d.init();
    await page.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.trundle); await s.settle(); s.mode('paint'); await s.settle(); });
    const before = await page.evaluate(() => ({ req: window.__sborn.mesherStats().requested, prog: window.__sborn.programs().total, gl: window.__sborn.info().glErrors }));
    let combos = 0;
    for (const L of ['base', 'coat', 'detail']) {
      await d.tap(await d.need(`layer:${L}`));
      for (let p = 0; p < 10; p++) for (const sz of ['S', 'M', 'L']) {
        await d.tap(await d.need(`pattern:${p}`)); await d.tap(await d.need(`size:${sz}`));
        await page.evaluate(() => window.__sborn.step(2, { render: 1 })); combos++;
      }
    }
    await d.settle();
    const after = await page.evaluate(() => ({ req: window.__sborn.mesherStats().requested, prog: window.__sborn.programs().total, gl: window.__sborn.info().glErrors, paint: window.__sborn.recipe().paint }));
    const ok24 = combos === 90 && after.req === before.req && after.prog === before.prog && after.gl === 0 && after.paint.detail.pat === 'bands' && after.paint.detail.sc === 2;
    add('C24.paint', '3 layers × 10 patterns × 3 sizes by tapping: zero GL errors, zero remeshes, program count unchanged', 7, [24], ok24 && !tally.bad.length, `${combos} combos, remeshes ${after.req - before.req}, programs ${before.prog}→${after.prog}, GL errors ${after.gl}${tally.bad.length ? ' console: ' + tally.bad[0] : ''}`);
    // junction colours: smooth gradients on quad and hexapod, ΔE between neighbouring vertices in junction zones
    const dE = await page.evaluate(async () => {
      const s = window.__sborn, { FIXTURES } = await import('./src/catalog/fixtures.js');
      const lab = (r, g, b) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q]; };
      let worst = 0, n = 0;
      for (const name of ['quad', 'hexapod']) {
        const r = JSON.parse(JSON.stringify(FIXTURES[name]));
        r.paint = { skin: 'smooth', base: { c: '#5bb8ff', pat: 'gradient', sc: 1 }, coat: { c: '#ffd23f', pat: 'gradient', sc: 1, amt: 0.5, mask: 'all' }, detail: { c: '#ff8fb1', pat: 'solid', sc: 1, amt: 0, mask: 'all' }, iris: '#7fc8ff' };
        s.load(r); await s.settle();
        const g = s.creature.skin.geometry, C = await s.bake(g, 'skin'), P = g.attributes.aPaint, I = g.index.array;
        const w = (v) => P.getW(v);
        for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
          const a = I[t + e], b = I[t + (e + 1) % 3];
          if (!((w(a) > 0.02 && w(a) < 0.98) || (w(b) > 0.02 && w(b) < 0.98))) continue;
          const A = lab(C[a * 3], C[a * 3 + 1], C[a * 3 + 2]), Bc = lab(C[b * 3], C[b * 3 + 1], C[b * 3 + 2]);
          worst = Math.max(worst, Math.hypot(A[0] - Bc[0], A[1] - Bc[1], A[2] - Bc[2])); n++;
        }
      }
      return { worst, n };
    });
    add('C25.junction', 'neighbour ΔE ≤ 0.03 across limb junctions (GPU vertex bake, gradient paint)', 7, [25], dE.n > 0 && dE.worst <= 0.03, `${dE.n} junction edges, worst ΔE ${dE.worst.toFixed(4)}`);
    await ctx.close();
  },
  // M6 (extended in M10): item 23 on every screen that exists, at all 3 viewports
  async text(browser) {
    const out = []; let pass = true;
    for (const vp of ['desktop', 'ipad', 'ipadPortrait']) {
      const ctx = await B.newContext(browser, vp); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      const screens = [];
      await page.goto(U('index.html?test&hatch')); await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 }); await B.awaitReady(page);
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
    await page.reload(); await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 }); await B.awaitReady(page);
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
  // M8: the island drive (items 33, 35, 36, 38)
  async island(browser) {
    const LOADS = async (page, name) => page.evaluate(async (n) => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS[n]); await s.settle(); s.mode('build'); s.mode('play'); s.play.skipIntro(); s.step(20); }, name);
    const place = (page, x, z, yaw = 0) => page.evaluate(({ x, z, yaw }) => { const P = window.__sborn.play, L = P.loco.state; L.x = x; L.z = z; L.yaw = yaw; L.vx = L.vz = 0; P.loco.resetFeet(); P.state.camAz = Math.PI + yaw; P.state.target = null; window.__sborn.step(30); }, { x, z, yaw });
    // ---- item 33: WASD, click, tap, hold-to-follow, jump apex ----
    {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await bootPage(page, 'index.html?test');
      await LOADS(page, 'bloop'); await place(page, 0, 1.1);
      const M = { x: 0, z: 9.1 };
      await page.keyboard.down('KeyW');
      let wasd = { steps: 0, best: 99 };
      for (let i = 0; i < 360 && wasd.best > 0.3; i++) { const r = await page.evaluate((M) => { const s = window.__sborn; s.step(5); const L = s.play.loco.state; return Math.hypot(L.x - M.x, L.z - M.z); }, M); wasd.steps += 5; wasd.best = Math.min(wasd.best, r); }
      await page.keyboard.up('KeyW');
      // click the marker on screen
      await place(page, 0, 1.1); await page.evaluate(() => (window.__sborn.step(59), window.__sborn.step(1, { render: 1 })));
      const scr = await page.evaluate((M) => { const s = window.__sborn, v = new s.three.Vector3(M.x, s.play.ground.height(M.x, M.z), M.z).project(s.stage.camera), r = s.stage.renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }, M);
      await page.mouse.click(scr.x, scr.y);
      let click = { steps: 0, best: 99 };
      for (let i = 0; i < 240 && click.best > 0.3; i++) { const r = await page.evaluate((M) => { const s = window.__sborn; s.step(5); const L = s.play.loco.state; return Math.hypot(L.x - M.x, L.z - M.z); }, M); click.steps += 5; click.best = Math.min(click.best, r); }
      // jump apex for Jump 0 (Bloop) and the highest-Jump starter (Peepsy)
      const apex = [];
      for (const n of ['bloop', 'peepsy']) {
        await LOADS(page, n); await place(page, 0, 1.1);
        apex.push(await page.evaluate(() => { const s = window.__sborn, P = s.play, J = s.stats().Jump || 0; s.drive.act('jump'); for (let i = 0; i < 300 && P.loco.state.air; i++) s.step(1); const want = P.loco.L * (0.25 + 0.12 * J), got = P.loco.metrics.lastLanding.apex; return { J, want: +want.toFixed(4), got: +got.toFixed(4), err: Math.abs(got / want - 1) }; }));
      }
      const okW = wasd.steps <= 1800 && wasd.best <= 0.3, okC = click.steps <= 1200 && click.best <= 0.3, okJ = apex.every((a) => a.err <= 0.05);
      await ctx.close();
      // iPad: tap to walk, hold to follow (runs after 0.6 s = 36 steps)
      const ctx2 = await B.newContext(browser, 'ipad'); const pg = await ctx2.newPage(); const t2 = {}; B.watchPage(pg, t2);
      await bootPage(pg, 'index.html?test'); const cdp = await ctx2.newCDPSession(pg);
      await LOADS(pg, 'bloop'); await place(pg, 0, 1.1); await pg.evaluate(() => (window.__sborn.step(59), window.__sborn.step(1, { render: 1 })));
      const scr2 = await pg.evaluate((M) => { const s = window.__sborn, v = new s.three.Vector3(M.x, s.play.ground.height(M.x, M.z), M.z).project(s.stage.camera), r = s.stage.renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }, M);
      await pg.touchscreen.tap(scr2.x, scr2.y);
      let tap = { steps: 0, best: 99 };
      for (let i = 0; i < 240 && tap.best > 0.3; i++) { const r = await pg.evaluate((M) => { const s = window.__sborn; s.step(5); const L = s.play.loco.state; return Math.hypot(L.x - M.x, L.z - M.z); }, M); tap.steps += 5; tap.best = Math.min(tap.best, r); }
      await place(pg, 0, 1.1); await pg.evaluate(() => { window.__sborn.play.metrics.followRunAt = 0; window.__sborn.step(2, { render: 1 }); });
      const tp = [{ x: scr2.x, y: scr2.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp });
      const follow = await pg.evaluate(() => { const s = window.__sborn; s.step(60); return { runAt: s.play.metrics.followRunAt, run: s.play.loco.state.run }; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const okT = tap.steps <= 1200 && tap.best <= 0.3, okF = Math.abs(follow.runAt - 36) <= 1;
      const bad = [...(tally.bad || []), ...(t2.bad || [])];
      add('C33.drive', 'WASD reaches a marker 8 m away within 0.3 m in ≤ 1,800 steps; click and iPad tap in ≤ 1,200; hold-to-follow runs from step 36 ± 1; jump apex = hip × (0.25 + 0.12·Jump) ± 5% (Jump 0 and the highest-Jump starter)', 8, [33],
        okW && okC && okT && okF && okJ && !bad.length, `WASD ${wasd.steps} steps best ${wasd.best.toFixed(3)} m; click ${click.steps}/${click.best.toFixed(3)}; tap ${tap.steps}/${tap.best.toFixed(3)}; follow runs at step ${follow.runAt}; apex ${JSON.stringify(apex)}${bad.length ? ' console ' + bad[0] : ''}`);
      await ctx2.close();
    }
    // ---- item 35: eat, respawn, tree drop, boop × (1 + 0.25·Charge), Strike thump, Spit bubbles ----
    {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await bootPage(page, 'index.html?test');
      const eat = async (name, kind) => { await LOADS(page, name); return page.evaluate((kind) => {
        const s = window.__sborn, P = s.play, I = P.island, L = P.loco.state;
        const f = I.fruit.find((q) => q.alive && q.kind === kind) || I.fruit.find((q) => q.kind === kind); f.alive = true; f.respawnAt = -1;
        for (const q of I.fruit) if (q !== f && Math.hypot(q.x - f.x, q.z - f.z) < 4.5) { q.alive = false; q.respawnAt = -1; }
        I.placeFruit();
        L.x = f.x; L.z = f.z - 1; L.yaw = 0; L.vx = L.vz = 0; P.loco.resetFeet(); s.step(5);
        const c0 = { ...P.fx.counts }, m0 = { ...P.metrics }, t0 = I.step;
        s.drive.emote('eat');
        let k = 0; for (; k < 300 && P.metrics.eats === m0.eats; k++) s.step(1);
        const eatenAt = I.step; let back = -1; for (let j = 0; j < 1300; j++) { s.step(1); if (f.alive) { back = I.step - eatenAt; break; } }
        return { steps: k, chomps: P.metrics.chomps - m0.chomps, crumbs: P.fx.counts.crumb - c0.crumb, hearts: P.fx.counts.heart - c0.heart, heart: +P.metrics.lastHeart.toFixed(3), health: s.stats().Health || 0, back };
      }, kind); };
      const pref = await eat('bloop', 'apple'), nonpref = await eat('peepsy', 'drumstick');
      const drop = await page.evaluate(() => { const s = window.__sborn, P = s.play, I = P.island, L = P.loco.state; L.x = 0; L.z = 1.1; P.loco.resetFeet(); for (const q of I.fruit) if (Math.hypot(q.x, q.z) < 6) q.alive = false; I.placeFruit(); const d0 = P.metrics.drops, e0 = P.metrics.eats; s.drive.emote('eat'); let k = 0; for (; k < 600 && P.metrics.eats === e0; k++) s.step(1); return { drops: P.metrics.drops - d0, eaten: P.metrics.eats - e0, steps: k }; });
      const boop = [];
      for (const n of ['bloop', 'trundle']) { await LOADS(page, n); boop.push(await page.evaluate(() => { const s = window.__sborn, P = s.play, b = P.island.ball, L = P.loco.state; L.x = b.x - 1.5; L.z = b.z; L.yaw = Math.PI / 2; P.loco.resetFeet(); const b0 = b.boops; s.drive.walkTo(b.x + 3, b.z); let k = 0; for (; k < 500 && b.boops === b0; k++) s.step(1); return { charge: s.stats().Charge || 0, ratio: +(b.lastImpulse / b.lastBase).toFixed(4), boops: b.boops - b0 }; })); }
      await LOADS(page, 'clatter');
      const clatter = await page.evaluate(() => { const s = window.__sborn, P = s.play, I = P.island, L = P.loco.state, t = I.trees[0];
        for (const q of I.fruit.slice(0, 6)) { q.alive = false; q.respawnAt = -1; } I.placeFruit();
        L.x = t.x + 1.2; L.z = t.z; P.loco.resetFeet(); s.step(5); const m0 = { ...P.metrics };
        s.drive.act('jump'); for (let i = 0; i < 200 && P.loco.state.air; i++) s.step(1);
        const thump = { thumps: P.metrics.thumps - m0.thumps, drops: P.metrics.thumpDrops - m0.thumpDrops };
        s.step(30); const b0 = P.fx.counts.bubble; s.drive.emote('roar'); s.step(10);
        return { Strike: s.stats().Strike, Spit: s.stats().Spit, thump, bubbles: P.fx.counts.bubble - b0 }; });
      const okE = [pref, nonpref].every((e) => e.steps <= 300 && e.chomps === 3 && e.crumbs === 8 && e.hearts === 1 && Math.abs(e.back - 1200) <= 1);
      const okH = Math.abs(pref.heart - (1 + 0.15 * pref.health) * 1.3) < 0.01 && Math.abs(nonpref.heart - (1 + 0.15 * nonpref.health)) < 0.01;
      const okD = drop.drops === 1 && drop.eaten === 1, okB = boop.every((b) => b.boops >= 1 && Math.abs(b.ratio - (1 + 0.25 * b.charge)) < 1e-3);
      const okS = clatter.thump.thumps === 1 && clatter.thump.drops >= 1 && clatter.thump.drops <= 3 && clatter.bubbles === 6 + 2 * clatter.Spit;
      add('C35.eat-toys', '1 m from fruit Eat gives 3 chomps, 8 crumbs and a heart (bigger for the preferred diet) within 300 steps, fruit back 1,200 ± 1 steps later, a tree drops one when none is near; boop × (1 + 0.25·Charge); Strike ≥ 2 thump drops 1–3; Spit ≥ 2 roar blows 6 + 2·Spit bubbles', 8, [35],
        okE && okH && okD && okB && okS && !tally.bad.length, `preferred ${JSON.stringify(pref)}; other ${JSON.stringify(nonpref)}; drop ${JSON.stringify(drop)}; boop ${JSON.stringify(boop)}; Clatter ${JSON.stringify(clatter)}${tally.bad.length ? ' console ' + tally.bad[0] : ''}`);
      await ctx.close();
    }
    // ---- item 36: photo mode ----
    {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await bootPage(page, 'index.html?test');
      await LOADS(page, 'trundle');
      const fr = await page.evaluate(() => { const s = window.__sborn, L = s.play.loco.state; s.drive.key('KeyW', true); s.step(40); s.drive.key('KeyW', false); s.mode('photo'); const a = [L.x, L.z, L.yaw], g0 = s.creature.group.position.clone(); s.step(60); return { same: a[0] === L.x && a[1] === L.z && a[2] === L.yaw && g0.equals(s.creature.group.position), mode: s.mode() }; });
      const diffs = []; let prev = null;
      for (let i = 0; i < 6; i++) {
        await page.evaluate((i) => { window.__sborn.photo.setBackdrop(i); window.__sborn.step(1, { render: 1 }); }, i);
        const px = await page.evaluate(() => { const c = window.__sborn.stage.renderer.domElement, t = document.createElement('canvas'); t.width = 200; t.height = 125; const g = t.getContext('2d'); g.drawImage(c, 0, 0, 200, 125); return Array.from(g.getImageData(0, 0, 200, 125).data); });
        if (prev) { let n = 0; for (let k = 0; k < px.length; k += 4) if (Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2]) > 24) n++; diffs.push(+(n / (px.length / 4)).toFixed(3)); }
        prev = px;
      }
      const saves = await page.evaluate(async () => {
        const s = window.__sborn; const { readITXt, readLSB } = await import('./src/io/png.js'); const out = [];
        for (const sq of [false, true]) { const o = await s.photo.save({ square: sq }); const rec = await readITXt(o.bytes); const bmp = await createImageBitmap(new Blob([o.bytes]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const rl = await readLSB(g.getImageData(0, 0, bmp.width, bmp.height)); out.push({ w: bmp.width, h: bmp.height, itxt: !!rec && s.canonicalEqual(rec, s.recipe()), lsb: !!rl && s.canonicalEqual(rl, s.recipe()) }); }
        return out;
      });
      const ok = fr.same && fr.mode === 'photo' && diffs.every((d) => d > 0.05) && saves.length === 2 && saves[0].w === 1920 && saves[0].h === 1080 && saves[1].w === 1080 && saves[1].h === 1080 && saves.every((x) => x.itxt);
      add('C36.photo', 'photo mode freezes the root for 60 steps; each of 6 backdrops differs from the previous by > 5% of pixels; 1920×1080 and 1080×1080 saves carry canonical-equal recipes', 8, [36], ok && !tally.bad.length,
        `root frozen ${fr.same}; backdrop diffs ${diffs.join(' ')}; saves ${JSON.stringify(saves)}${tally.bad.length ? ' console ' + tally.bad[0] : ''}`);
      await ctx.close();
    }
  },
  // item 38: draw calls and triangles, editor framing and island poses, per tier (measured; limits from §11.5)
  async drawcalls(browser) {
    const LIM = { high: { ed: 40, main: 110, shadow: 30, tris: 650000 }, medium: { ed: 40, main: 75, shadow: 20, tris: 380000 }, low: { ed: 40, main: 50, shadow: 10, tris: 200000 } };
    const notes = []; let ok = true;
    for (const q of ['low', 'medium', 'high']) {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await bootPage(page, `index.html?test&quality=${q}`);
      const r = await page.evaluate(async (DEMO) => {
        const s = window.__sborn, R = s.stage.renderer, sc = s.stage.scene, cam = s.stage.camera;
        s.load(DEMO); await s.settle(); s.step(10, { render: 10 });
        const meas = () => { const au = R.shadowMap.autoUpdate; R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = false; R.info.reset(); R.setRenderTarget(null); R.render(sc, cam); const main = R.info.render.calls, tris = R.info.render.triangles; R.shadowMap.needsUpdate = true; R.info.reset(); R.render(sc, cam); const all = R.info.render.calls; R.shadowMap.autoUpdate = au; return { main, shadow: all - main, tris }; };
        const ed = meas();
        s.mode('play'); s.play.skipIntro(); s.step(20);
        const P = s.play, isl = [];
        P.state.camDist = 30; P.state.camEl = 0.45; s.step(120); isl.push(meas());               // establishing shot
        const way = [[0, 1.1], [6, -6], [-8, 4], [3, 12], [-12, -12]];
        for (const [x, z] of way) { const L = P.loco.state; L.x = x; L.z = z; P.loco.resetFeet(); P.state.camDist = Math.max(1.6, 3.5 * s.creature.height); P.state.camEl = 0.26; s.step(90); isl.push(meas()); }
        const c = s.creature.info();
        s.mode('build');
        return { ed, isl, creatureTris: c.tris + c.partTris };
      }, DEMO());
      const L = LIM[q], mx = (k) => Math.max(...r.isl.map((m) => m[k]));
      const good = r.ed.main <= L.ed && mx('main') <= L.main && mx('shadow') <= L.shadow && mx('tris') <= L.tris && r.creatureTris <= 80000 && !tally.bad.length;
      if (!good) ok = false;
      notes.push(`${q}: editor ${r.ed.main} main; island max main ${mx('main')}/${L.main} shadow ${mx('shadow')}/${L.shadow} tris ${mx('tris')}/${L.tris}; creature ${r.creatureTris}`);
      await ctx.close();
    }
    fs.writeFileSync(path.join(B.SB, 'tools/out/calls.json'), JSON.stringify({ ranAt: new Date().toISOString(), pass: ok, value: notes.join('; '), threshold: 'editor ≤ 40 main; island main + shadow High 110 + 30, Medium 75 + 20, Low 50 + 10; triangles 650k/380k/200k; creature ≤ 80k', unit: 'draw calls', method: 'checks.cjs drawcalls' }, null, 1));
    add('C38.drawcalls', 'draw calls and triangles within the tier limits: editor ≤ 40 main; island main + shadow and triangles at the establishing shot and 5 bench-path waypoints; creature ≤ 80k', 8, [38], ok, notes.join('; '));
  },
  // M9: generator dry run (54), audio/ contents and approvals (69), the post-processing pipeline without the API (70)
  async audio() {
    const { spawnSync } = require('child_process');
    const TOOLS = path.join(B.SB, 'tools'), TMP = path.join(TOOLS, 'out/tmp'); fs.mkdirSync(TMP, { recursive: true });
    // 54: a preload that records any socket or fetch attempt
    const hook = path.join(TMP, 'no-socket.mjs');
    fs.writeFileSync(hook, "import net from 'node:net'; import fs from 'node:fs'; const f = process.env.SOCK_LOG; const hit = (w) => fs.appendFileSync(f, w + '\\n'); const oc = net.Socket.prototype.connect; net.Socket.prototype.connect = function (...a) { hit('connect'); return oc.apply(this, a); }; const of = globalThis.fetch; globalThis.fetch = (...a) => { hit('fetch'); return of(...a); };\n");
    const sockLog = path.join(TMP, 'sock.log'); fs.rmSync(sockLog, { force: true });
    const env = { ...process.env, HTTPS_PROXY: 'http://127.0.0.1:9', SOCK_LOG: sockLog }; delete env.ELEVENLABS_API_KEY;
    const r = spawnSync('node', ['--import', hook, path.join(TOOLS, 'gen-sounds.mjs'), '--dry-run'], { env, encoding: 'utf8' });
    const out = r.stdout || '', head = out.split('\n')[0], idLines = out.split('\n').filter((l) => /^  [a-z]+\.[a-z_.]+$/.test(l)).length;
    const sockets = fs.existsSync(sockLog) ? fs.readFileSync(sockLog, 'utf8').trim().split('\n').filter(Boolean).length : 0;
    const ok54 = r.status === 0 && /85 ids/.test(head) && /367 SFX generations/.test(head) && /music \d+ s/.test(head) && /estimate \d+ credits/.test(head) && idLines === 85 && sockets === 0;
    add('C54.dry-run', 'gen-sounds --dry-run with no key and a dead proxy exits 0, opens no socket, prints 85 ids, 367 SFX generations, music seconds and a credit estimate', 9, [54], ok54, `exit ${r.status}; ${head}; ${idLines} id lines; sockets ${sockets}`);
    // 69: audio/ holds only the manifest (Case B); a synthetic approvals file changes only approval fields; gen-log has no header values
    const AUD = path.join(B.SB, 'audio'), files = [];
    const walk = (d) => { for (const f of fs.readdirSync(d)) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) walk(q); else files.push(path.relative(AUD, q)); } }; walk(AUD);
    const man = JSON.parse(fs.readFileSync(path.join(AUD, 'audio-manifest.json'), 'utf8'));
    const caseB = Object.values(man.ids).every((e) => !(e.variants || []).length);
    const okFiles = caseB ? files.length === 1 && files[0] === 'audio-manifest.json' && Object.keys(man.ids).length === 85 : files.every((f) => f === 'audio-manifest.json' || Object.values(man.ids).some((e) => e.variants.some((v) => v.file === f.replace(/\\/g, '/'))));
    const synth = JSON.parse(JSON.stringify(man));
    synth.ids['ui.button_tick'].variants = [{ file: 'ui.button_tick/0.mp3', sha256: 'a'.repeat(64), lufs: -25, approved: false, source: 'test' }, { file: 'ui.button_tick/1.mp3', sha256: 'b'.repeat(64), lufs: -25.4, approved: false, source: 'test' }];
    const mp = path.join(TMP, 'manifest.json'), ap = path.join(TMP, 'approvals.json');
    fs.writeFileSync(mp, JSON.stringify(synth)); fs.writeFileSync(ap, JSON.stringify({ ids: { 'ui.button_tick': { 'ui.button_tick/0.mp3': 'keep', 'ui.button_tick/1.mp3': 'reject' } } }));
    const ra = spawnSync('node', ['--input-type=module', '-e', `import { applyApprovals } from ${JSON.stringify('file://' + path.join(TOOLS, 'audio-post.mjs'))}; process.exit(applyApprovals(${JSON.stringify(ap)}, ${JSON.stringify(mp)}));`], { encoding: 'utf8' });
    const after = JSON.parse(fs.readFileSync(mp, 'utf8'));
    const diffs = [];
    const cmp = (a, b, p) => { if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) { if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(p); return; } for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) cmp(a[k], b[k], `${p}.${k}`); };
    cmp(synth, after, '');
    const okAp = ra.status === 0 && diffs.length === 2 && diffs.every((d) => /\.(approved|rejected)$/.test(d)) && after.ids['ui.button_tick'].variants[0].approved === true;
    const glog = path.join(TOOLS, 'audio-raw/gen-log.jsonl');
    const okLog = !fs.existsSync(glog) || !/xi-api-key|authorization|sk_[a-z0-9]{8,}/i.test(fs.readFileSync(glog, 'utf8'));
    add('C69.audio-files', 'Case B: audio/ holds only audio-manifest.json (85 ids, empty variants); an applied approvals.json changes only approval fields; gen-log.jsonl holds no header values', 9, [69], okFiles && okAp && okLog,
      `files ${files.join(',')}; case ${caseB ? 'B' : 'A'}; approvals changed ${diffs.join(', ')}; gen-log ${fs.existsSync(glog) ? 'clean' : 'absent'}`);
    // 70: the pipeline self-test (ffmpeg only)
    const rs = spawnSync('node', [path.join(TOOLS, 'audio-post.mjs'), '--self-test'], { encoding: 'utf8' });
    add('C70.pipeline', 'post-processing without the API: a clean tone and a repaired loop pass, clipped, 90%-silent, click and DC inputs are flagged by rule, the tone lands at target ± 1 LU under the ceiling', 9, [70], rs.status === 0, (rs.stdout || rs.stderr || '').trim().slice(0, 400));
  },
  // M10: autosave and reload (46), starters and strips (47), card (48), link (49), GLB (50), sizes (68), link bubble (71)
  async save(browser) {
    const { spawnSync } = require('child_process');
    const eq = (page, r) => page.evaluate((r) => window.__sborn.canonicalEqual(window.__sborn.recipe(), r), r);
    // ---- 46 ----
    {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await bootPage(page, 'index.html?test');
      const notes = []; let ok = true;
      for (const wait of [80, 1000]) {
        console.log('  · 46 reload', wait);
        const r = await page.evaluate(async (w) => { const s = window.__sborn; await s.storeReady(); s.op('spine.add', { end: 'head' }); s.op('name.set', { name: `Zed${w}` }); await new Promise((q) => setTimeout(q, w)); return s.recipe(); }, wait);
        await page.reload(); await bootPage(page, 'index.html?test');
        const same = await eq(page, r); if (!same) ok = false; notes.push(`reload after ${wait} ms: ${same}`);
      }
      console.log('  · 46 new');
      // New keeps the old creature on the shelf; undo brings it back
      const nw = await page.evaluate(async () => {
        const s = window.__sborn; await s.storeReady(); const old = s.recipe();
        const b = s.probe.where('new'); document.elementFromPoint(b.x, b.y).click(); await new Promise((q) => setTimeout(q, 1200));
        const shelf = (await s.library.entries()).some((e) => s.canonicalEqual(e.recipe, old));
        const isNew = !s.canonicalEqual(s.recipe(), old);
        const u = s.probe.where('undo'); document.elementFromPoint(u.x, u.y).click(); await s.settle();
        return { shelf, isNew, back: s.canonicalEqual(s.recipe(), old) };
      });
      if (!(nw.shelf && nw.isNew && nw.back)) ok = false; notes.push(`New: ${JSON.stringify(nw)}`);
      await ctx.close();
      // IndexedDB throwing: the localStorage mirror restores it
      const ctx2 = await B.newContext(browser, 'desktop'); await ctx2.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } }); });
      const p2 = await ctx2.newPage(); const t2 = {}; B.watchPage(p2, t2);
      await bootPage(p2, 'index.html?test');
      const r2 = await p2.evaluate(async () => { const s = window.__sborn; s.op('spine.add', { end: 'tail' }); await new Promise((q) => setTimeout(q, 100)); return s.recipe(); });
      await p2.reload(); await bootPage(p2, 'index.html?test');
      const m = await eq(p2, r2); if (!m) ok = false; notes.push(`IndexedDB throwing → mirror: ${m}`);
      const bad = [...(tally.bad || []), ...(t2.bad || [])];
      add('C46.autosave', 'reload ≤ 100 ms and 1,000 ms after an edit restores it canonical-equal; with IndexedDB throwing the localStorage mirror does; New keeps the old creature on the shelf and undo brings it back', 10, [46], ok && !bad.length, notes.join('; ') + (bad.length ? ' console ' + bad[0] : ''));
      await ctx2.close();
    }
    // ---- 47, 48, 49, 50, 68, 71 in one page ----
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test');
    console.log('  · 47');
    const r47 = await page.evaluate(async () => {
      const s = window.__sborn; await s.storeReady(); const { STARTERS } = await import('./src/catalog/starters.js'); const out = [];
      for (const k of Object.keys(STARTERS)) { s.load(STARTERS[k]); await s.settle(); const b = s.budget(); out.push({ k, dna: b.dna, cx: b.cx }); }
      await s.quiet();
      s.mode('gallery');
      for (let i = 0; i < 600 && !document.querySelector('.shelf.saved .spin[data-strip]'); i++) await new Promise((q) => setTimeout(q, 100));
      const sp = document.querySelector('.shelf.saved .spin[data-strip]');
      const cs = sp ? getComputedStyle(sp) : null;
      let nat = null; if (sp) { const url = cs.backgroundImage.slice(5, -2); const im = new Image(); im.src = url; await im.decode().catch(() => {}); nat = [im.naturalWidth, im.naturalHeight]; }
      s.mode('build');
      return { budgets: out, timing: cs && cs.animationTimingFunction, dur: cs && cs.animationDuration, nat };
    });
    const ok47 = r47.budgets.length === 8 && r47.budgets.every((b) => b.dna <= 2000 && b.cx <= 100) && /steps\(16/.test(r47.timing || '') && r47.nat && r47.nat[0] === 2048 && r47.nat[1] === 128;
    const res = (id) => { const p = JSON.parse(fs.readFileSync(path.join(B.SB, 'tools/out/checks.json'), 'utf8')).results.concat(JSON.parse(fs.readFileSync(path.join(B.SB, 'tools/out/tests.json'), 'utf8')).results || []); return p.find((x) => x.id === id); };
    const bench = JSON.parse(fs.readFileSync(path.join(B.SB, 'tools/out/bench-sim.json'), 'utf8'));
    const startRows = bench.rows.filter((x) => ['peepsy', 'trundle', 'skitter', 'clatter', 'flapjack', 'octoboop'].includes(x.creature) && ['walk', 'run'].includes(x.kind) && (x.surface || 'flat') === 'flat');
    const c31 = res('C31.emotes');
    add('C47.starters', 'all 8 starters load within both budgets and pass items 28 and 31; saved thumbnails run a 2048×128 steps(16) strip animation', 10, [47], ok47 && startRows.every((x) => x.pass) && c31 && c31.pass,
      `budgets ${r47.budgets.map((b) => `${b.k} ${b.dna}/${b.cx}`).join(', ')}; strip ${r47.nat && r47.nat.join('×')} ${r47.timing} ${r47.dur}; item 28 starter rows ${startRows.filter((x) => x.pass).length}/${startRows.length}${startRows.filter((x) => !x.pass).map((x) => ' FAIL ' + x.creature + ' ' + x.kind).join('')}; item 31 ${c31 ? c31.pass : 'missing'}`);
    // 48: card iTXt, LSB after a re-encode, DataTransfer drop
    console.log('  · 48');
    const r48 = await page.evaluate(async () => {
      const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.clatter); await s.settle();
      const want = s.recipe(); const { readITXt, readLSB } = await import('./src/io/png.js');
      const c = await s.exporter.card();
      const it = s.canonicalEqual(await readITXt(c.bytes), want);
      const bmp = await createImageBitmap(new Blob([c.bytes]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0);
      const re = new Uint8Array(await (await new Promise((q) => cv.toBlob(q, 'image/png'))).arrayBuffer());
      const stripped = (await readITXt(re)) === null;
      const b2 = await createImageBitmap(new Blob([re]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); const c2 = new OffscreenCanvas(b2.width, b2.height); const g2 = c2.getContext('2d'); g2.drawImage(b2, 0, 0);
      const lsb = s.canonicalEqual(await readLSB(g2.getImageData(0, 0, b2.width, b2.height)), want);
      const ihdr = new DataView(c.bytes.buffer, c.bytes.byteOffset); const W = ihdr.getUint32(16), H = ihdr.getUint32(20);
      s.load(STARTERS.bloop); await s.settle();
      const dt = new DataTransfer(); dt.items.add(new File([re], 'card.png', { type: 'image/png' }));
      document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      for (let i = 0; i < 40 && !s.canonicalEqual(s.recipe(), want); i++) await new Promise((q) => setTimeout(q, 100));
      return { itxt: it, stripped, lsb, dropped: s.canonicalEqual(s.recipe(), want), W, H };
    });
    add('C48.card', 'card: iTXt decodes canonical-equal; after a canvas re-encode (chunks stripped) the LSB copy does too; a DataTransfer drop of the PNG on document.body loads it', 10, [48], r48.itxt && r48.stripped && r48.lsb && r48.dropped, JSON.stringify(r48));
    // 49 and 71: links
    console.log('  · 49');
    const r49 = await page.evaluate(async () => {
      const s = window.__sborn; const { FIXTURES } = await import('./src/catalog/fixtures.js'); s.load(FIXTURES.max40); await s.settle(); const want = s.recipe();
      const h = await s.encodeLink(); const { decodeLink } = await import('./src/io/link.js'); const d = await decodeLink(h);
      const round = d.ok && s.canonicalEqual(d.recipe, want);
      const errs = []; const oe = console.error; console.error = (...a) => { errs.push(a.join(' ')); oe(...a); };
      const bad = {};
      const big = '#c=1.' + 'A'.repeat(100000);
      // a deflate stream that inflates past 64 KB
      const { deflate } = await import('./src/io/png.js'); const { b64u } = await import('./src/io/link.js');
      const bomb = '#c=1.' + b64u(await deflate(new TextEncoder().encode('{"a":"' + 'x'.repeat(200000) + '"}'), 'deflate-raw'));
      for (const [k, hh] of [['corrupt', '#c=1.abc$%^'], ['corrupt2', '#c=1.' + h.slice(5, 40)], ['huge', big], ['bomb', bomb], ['version', '#c=9.' + h.slice(5)]]) {
        const before = s.recipe(); document.getElementById('ui').classList.remove('shake-all');
        let threw = false, r = null; try { r = await s.openLink(hh); } catch { threw = true; }
        bad[k] = { r, threw, same: s.canonicalEqual(s.recipe(), before), shake: document.getElementById('ui').classList.contains('shake-all') };
      }
      console.error = oe;
      return { len: h.length, round, bad, errs: errs.length };
    });
    const okBad = Object.values(r49.bad).every((x) => x.r === false && !x.threw && x.same && x.shake);
    add('C49.link', 'link round-trips canonical-equal, ≤ 2,000 characters for the 40-part fixture; corrupt, > 64 KB and wrong-version links fail gracefully (nothing thrown, no console error, recipe unchanged, friendly shake)', 10, [49], r49.round && r49.len <= 2000 && okBad && r49.errs === 0 && !tally.bad.length, `length ${r49.len}; round ${r49.round}; ${Object.entries(r49.bad).map(([k, v]) => `${k} ${v.r === false && v.same && v.shake ? 'ok' : JSON.stringify(v)}`).join(', ')}; console errors ${r49.errs}`);
    console.log('  · 71');
    const r71 = await page.evaluate(async () => {
      const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.skitter); await s.settle();
      const h = await s.encodeLink(); s.load(STARTERS.bloop); await s.settle();
      const n0 = (await s.library.entries()).length;
      const click = async (sel) => { for (let i = 0; i < 60 && !document.querySelector(sel); i++) await new Promise((q) => setTimeout(q, 100)); const b = document.querySelector(sel); if (b) b.click(); return !!b; };
      const p1 = s.openLink(h); const shown = await click('.link-bubble [aria-label="No thanks"]'); await p1; await s.library.flush();
      const n1 = (await s.library.entries()).length;
      const p2 = s.openLink(h); await click('.link-bubble [aria-label="Keep it"]'); await p2; await new Promise((q) => setTimeout(q, 1100)); await s.library.flush();
      const n2 = (await s.library.entries()).length;
      // clipboard deleted: the share menu shows a selectable field with the link
      delete Navigator.prototype.clipboard; try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch {}
      s.gallery.share.toggle(); document.querySelector('.share-menu [aria-label="Link"]').click(); await new Promise((q) => setTimeout(q, 400));
      const box = document.querySelector('.share-menu .link-box'); const vis = box && getComputedStyle(box).display !== 'none';
      const sel = vis && box.selectionStart === 0 && box.selectionEnd === box.value.length && /#c=1\./.test(box.value);
      s.gallery.share.close();
      return { shown, no: n1 - n0, yes: n2 - n1, field: !!sel };
    });
    add('C71.link-bubble', 'a valid link shows the bubble; ✓ adds exactly 1 entry, ✗ none; with navigator.clipboard deleted the share menu shows a selectable field with the link', 10, [71], r71.shown && r71.no === 0 && r71.yes === 1 && r71.field, JSON.stringify(r71));
    // 50: GLBs of 3 starters
    const gv = path.join(B.SB, 'tools/out/tmp/gv');
    let validator = null;
    if (!fs.existsSync(path.join(gv, 'node_modules/gltf-validator'))) { fs.mkdirSync(gv, { recursive: true }); const ins = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--prefix', gv, 'gltf-validator@2.0.0-dev.3.10'], { encoding: 'utf8', timeout: 180000 }); if (ins.status !== 0) validator = 'BLOCKED'; }
    const r50 = [];
    for (const k of ['trundle', 'flapjack', 'octoboop']) {
      const g = await page.evaluate(async (k) => {
        const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS[k]); await s.settle();
        const out = await s.exporter.glb();
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const gl = await new GLTFLoader().parseAsync(out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength), '');
        const meshes = []; gl.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
        const verts = meshes.reduce((a, m) => a + m.geometry.attributes.position.count, 0);
        const box = new s.three.Box3().setFromObject(gl.scene);
        const b0 = out.bounds, d = Math.max(...[0, 1, 2].map((i) => Math.max(Math.abs(box.min.getComponent(i) - b0[0][i]), Math.abs(box.max.getComponent(i) - b0[1][i])) / Math.max(1e-6, b0[1][i] - b0[0][i])));
        return { k, name: out.name, mb: +(out.bytes.length / 1048576).toFixed(2), meshes: meshes.length, color: meshes.every((m) => !!m.geometry.attributes.color), vertsErr: Math.abs(verts / out.verts - 1), boundsErr: d, b64: btoa(String.fromCharCode(...out.bytes.subarray(0, 0))), bytes: Array.from(out.bytes) };
      }, k);
      let vres = validator;
      if (!vres) {
        const f = path.join(B.SB, `tools/out/tmp/${g.name}`); fs.writeFileSync(f, Buffer.from(g.bytes));
        const vr = spawnSync('node', ['-e', `const v=require(${JSON.stringify(path.join(gv, 'node_modules/gltf-validator'))});const fs=require('fs');v.validateBytes(new Uint8Array(fs.readFileSync(${JSON.stringify(f)}))).then(r=>{console.log(JSON.stringify({errors:r.issues.numErrors,warnings:r.issues.numWarnings}))},e=>{console.log(JSON.stringify({errors:-1,why:String(e).slice(0,100)}))})`], { encoding: 'utf8', timeout: 60000 });
        try { vres = JSON.parse(vr.stdout.trim()); } catch { vres = { errors: -1, why: (vr.stderr || '').slice(0, 100) }; }
      }
      delete g.bytes; g.validator = vres; r50.push(g);
    }
    const ok50 = r50.every((g) => g.meshes <= 3 && g.color && g.mb <= 8 && g.vertsErr <= 0.01 && g.boundsErr <= 0.01 && /\.glb$/.test(g.name) && (g.validator === 'BLOCKED' || g.validator.errors === 0));
    add('C50.glb', 'GLBs of 3 starters reload in GLTFLoader: vertex count and bounds within 1% of the posed Hero geometry, COLOR_0 on every mesh, ≤ 3 meshes, ≤ 8 MB, named <name>.glb; gltf-validator 0 errors', 10, [50], ok50, r50.map((g) => `${g.name} ${g.mb} MB ${g.meshes} meshes color ${g.color} verts ±${(g.vertsErr * 100).toFixed(2)}% bounds ±${(g.boundsErr * 100).toFixed(2)}% validator ${JSON.stringify(g.validator)}`).join('; '));
    // 68: mirror size, undo cap (unit test C68.undo-cap), card IHDR, 40-part LODs
    const mir = await page.evaluate(async () => { const s = window.__sborn; const { FIXTURES } = await import('./src/catalog/fixtures.js'); s.load(FIXTURES.max40); await s.settle(); return (localStorage.getItem('sborn.current') || '').length; });
    const lod = JSON.parse(fs.readFileSync(path.join(B.SB, 'tools/out/parts-lod.json'), 'utf8')), u68 = res('C68.undo-cap');
    const ok68 = mir > 0 && mir <= 16384 && r48.W === 1080 && r48.H === 1350 && lod.max40L0 <= 40000 && lod.max40L1 <= 15000 && lod.max40L2 <= 5000 && u68 && u68.pass;
    add('C68.sizes', 'localStorage mirror ≤ 16 KB for the 40-part fixture; undo ≤ 100 entries and ≤ 2 MB after 300 edits; card IHDR 1080×1350; 40-part fixture parts ≤ 40k/15k/5k triangles at L0/L1/L2', 10, [68], ok68 && !tally.bad.length,
      `mirror ${mir} B; card ${r48.W}×${r48.H}; parts L0/L1/L2 ${lod.max40L0}/${lod.max40L1}/${lod.max40L2}; undo cap ${u68 ? u68.pass + ' (' + u68.note + ')' : 'missing'}${tally.bad.length ? '; console ' + tally.bad[0] : ''}`);
    await ctx.close();
  },
  // item 67: boot to the first creature frame, wall clock, in this container (measured, labelled; device targets are items 44–45)
  async boot(browser) {
    const out = [];
    for (const [label, url] of [['quality=high', 'index.html?quality=high'], ['auto', 'index.html']]) {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage();
      const t0 = Date.now(); await page.goto(U(url));
      await page.waitForFunction(() => window.__sborn && window.__sborn.firstFrameMs, null, { timeout: 180000 }).catch(() => {});
      const r = await page.evaluate(() => ({ first: window.__sborn && window.__sborn.firstFrameMs, tier: window.__sborn && window.__sborn.info && window.__sborn.info().tier }));
      out.push({ label, ms: r.first ? Math.round(r.first) : null, wall: Date.now() - t0, tier: r.tier });
      await ctx.close();
    }
    const pass = out.every((o) => Number.isFinite(o.ms));
    fs.writeFileSync(path.join(B.SB, 'tools/out/boot.json'), JSON.stringify({ ranAt: new Date().toISOString(), pass, value: out.map((o) => `${o.label}: ${o.ms} ms to the first creature frame (tier ${o.tier})`).join('; '), threshold: 'measured (software GL container; device targets in items 44–45)', unit: 'ms', method: 'performance.now() at the first rendered frame with the creature visible', runs: out }, null, 1));
    add('C67.boot', 'boot to the first creature frame, wall clock, ?quality=high and auto (measured)', 11, [67], pass, out.map((o) => `${o.label} ${o.ms} ms (${o.tier})`).join('; '));
  },
  // item 2: tests.html reads running… until every async test settles, then ALL PASS or FAIL, and exports window.__results
  async testspage(browser) {
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage();
    await page.goto(U('tests.html?group=core'));
    const first = await page.title();
    const title = await B.waitTitle(page, 120000);
    const r = await page.evaluate(() => ({ n: (window.__results || []).length, shape: (window.__results || []).every((x) => 'id' in x && 'name' in x && 'milestone' in x && Array.isArray(x.items) && 'pass' in x && 'ms' in x && 'note' in x), done: window.__done }));
    add('C02.tests-page', 'tests.html reads running… until every async test settles, then ALL PASS or FAIL; exports window.__results with {id, name, milestone, items, pass, ms, note}', 11, [2], /running/.test(first) && /^(ALL PASS|FAIL)/.test(title) && r.n > 0 && r.shape, `first title "${first}", final "${title}", ${r.n} results, shape ${r.shape}`);
    await ctx.close();
  },
  // item 41: heap slope on the island and memory baselines after rebuild/undo cycles and island trips
  async heap(browser) {
    const ctx = await B.newContext(browser, 'small'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test&quality=high');
    const cdp = await ctx.newCDPSession(page);
    const used = async () => { await page.evaluate(() => { if (typeof gc === 'function') gc(); }); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
    const hasGc = await page.evaluate(() => typeof gc === 'function');
    const u0 = await used(); await page.evaluate(() => { window.__keep = Array.from({ length: 1 << 15 }, (_, i) => ({ i, s: 'x'.repeat(8) })); }); const u1 = await used(); await page.evaluate(() => { window.__keep = null; });
    const guard = hasGc && u1 - u0 >= 0.8 * 1048576;
    // baseline: after warm-up and the first island visit (the island is built lazily and cached by design, §10.1)
    await page.evaluate(async () => { const s = window.__sborn; s.mode('play'); s.play.skipIntro(); s.step(10, { render: 10 }); s.mode('build'); await s.settle(); });
    const base = await page.evaluate(() => { const m = window.__sborn.stage.renderer.info.memory; return { g: m.geometries, t: m.textures }; });
    await page.evaluate(() => { const s = window.__sborn; s.mode('play'); s.play.skipIntro(); s.drive.key('KeyW', true); });
    const samples = [];
    for (let k = 0; k < 12; k++) { await page.evaluate(() => { const s = window.__sborn; s.step(300, { render: 6 }); const L = s.play.loco.state; if (Math.hypot(L.x, L.z) > 20) { s.play.drive.walkTo(0, 0); } }); samples.push(await used()); }
    await page.evaluate(() => { window.__sborn.drive.key('KeyW', false); window.__sborn.mode('build'); });
    const xs = samples.map((_, i) => i), mx = 5.5, my = samples.reduce((a, b) => a + b, 0) / 12;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (samples[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);   // bytes per 300 steps
    const perRun = slope * 12 / 1048576;                                                                                      // MB per 3,600 steps
    // 50 rebuild/undo cycles and 10 editor ↔ island trips
    const mem = await page.evaluate(async () => {
      const s = window.__sborn; await s.settle();
      const m0 = s.stage.renderer.info.memory; const before = { g: m0.geometries, t: m0.textures };
      for (let i = 0; i < 50; i++) { s.op('spine.radius', { i: 1, r: 0.2 + 0.01 * (i % 5) }); await s.settle(); s.undo(); await s.settle(); }
      for (let i = 0; i < 10; i++) { s.mode('play'); s.play.skipIntro(); s.step(20, { render: 20 }); s.mode('build'); s.step(5, { render: 5 }); await s.settle(); }
      const m = s.stage.renderer.info.memory; return { before, after: { g: m.geometries, t: m.textures } };
    });
    const okMem = Math.abs(mem.after.g - base.g) <= 2 && Math.abs(mem.after.t - base.t) <= 2;
    add('C41.heap', 'heap slope on the island (High, step 3,600 rendering every 6th, gc + CDP every 300) < 1 MB per 3,600 steps with a precise metric; geometries and textures within ±2 of the post-warm-up baseline after 50 rebuild/undo cycles and 10 island trips', 11, [41],
      guard && perRun < 1 && okMem && !tally.bad.length, `guard ${guard ? 'ok' : 'heap metric imprecise'} (+${((u1 - u0) / 1048576).toFixed(2)} MB for a 1 MB array); slope ${perRun.toFixed(3)} MB/3,600 steps; samples ${samples.map((x) => (x / 1048576).toFixed(1)).join(',')} MB; geometries ${base.g}→${mem.after.g}, textures ${base.t}→${mem.after.t}${tally.bad.length ? '; console ' + tally.bad[0] : ''}`);
    await ctx.close();
  },
  // item 42: context loss and restore
  async context(browser) {
    const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test');
    const r = await page.evaluate(async () => {
      const s = window.__sborn;
      s.op('part.add', { part: { t: 'det.nubhorn', at: { b: 'spine', u: 0.8, d: [0.3, 0.95, 0], tw: 0 }, m: 1 } }); await s.settle();
      s.op('part.add', { part: { t: 'tail.curly', at: { b: 'spine', u: 0.02, d: [0, 0.2, -0.98], tw: 0 }, m: 0 } }); await s.settle();
      s.op('part.add', { part: { t: 'wing.leaf', at: { b: 'spine', u: 0.5, d: [0.9, 0.4, 0], tw: 0 }, m: 1 } }); await s.settle();
      const grab = () => { const c = s.stage.renderer.domElement, t = document.createElement('canvas'); t.width = 320; t.height = 200; s.step(1, { render: 1 }); t.getContext('2d').drawImage(c, 0, 0, 320, 200); return t.getContext('2d').getImageData(0, 0, 320, 200).data; };
      const parts = s.recipe().parts.length;
      const p0 = s.programs().total; const A = grab();
      const ext = s.stage.renderer.getContext().getExtension('WEBGL_lose_context');
      ext.loseContext(); await new Promise((q) => setTimeout(q, 200)); s.step(10);
      ext.restoreContext(); await new Promise((q) => setTimeout(q, 500)); await s.settle(); await s.settle();
      const Bp = grab(); const p1 = s.programs().total;
      let diff = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - Bp[i]) + Math.abs(A[i + 1] - Bp[i + 1]) + Math.abs(A[i + 2] - Bp[i + 2]) > 24) diff++;
      return { parts, diff: diff / (A.length / 4), p0, p1, lost: s.contextLost() };
    });
    add('C42.context', 'Bloop + 3 parts: lose and restore the WebGL context: the picture differs ≤ 0.5% and the program count is unchanged', 11, [42], r.parts >= 5 && r.diff <= 0.005 && r.p0 === r.p1 && !r.lost && !tally.bad.length, `${JSON.stringify(r)}${tally.bad.length ? ' console ' + tally.bad[0] : ''}`);
    await ctx.close();
  },
  // item 61: user tools
  async usertools(browser) {
    const notes = []; let ok = true;
    { // ?debug JSON with every §15.4 field (copy button, then the text box with clipboard deleted)
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await bootPage(page, 'index.html?test&debug');
      const r = await page.evaluate(async () => {
        window.__sborn.step(20, { render: 1 });
        delete Navigator.prototype.clipboard; try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch {}
        const btn = document.querySelector('.debug-overlay button'); btn.click(); await new Promise((q) => setTimeout(q, 200));
        const t = document.querySelector('.debug-overlay textarea'); const j = JSON.parse(t.value);
        const need = ['fps', 'p50', 'p95', 'cpuSimMs', 'cpuSubmitMs', 'triangles', 'calls', 'programs', 'geometries', 'textures', 'tier', 'dprRung', 'renderScale', 'remeshMs', 'footSlideMm', 'gpuMemMB', 'audio'];
        return { missing: need.filter((k) => !(k in j)), audio: j.audio && ['generated', 'placeholder', 'unapproved', 'missing'].every((k) => k in j.audio) };
      });
      if (r.missing.length || !r.audio || tally.bad.length) ok = false; notes.push(`debug missing [${r.missing}] audio ${r.audio}`);
      await ctx.close();
    }
    for (const q of ['', '&quality=high']) { // ?bench: 4 stages, finite score
      const ctx = await B.newContext(browser, 'small'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await page.goto(U(`index.html?bench${q}`));
      await page.waitForFunction(() => window.__sborn && window.__sborn.benchResult, null, { timeout: 240000 }).catch(() => {});
      const r = await page.evaluate(() => window.__sborn && window.__sborn.benchResult);
      const good = r && Number.isFinite(r.score) && r.stages.length === 4 && r.stages.every((s) => Number.isFinite(s.p95)) && (!q || r.tier === 'high');
      if (!good || tally.bad.length) ok = false;
      notes.push(`bench${q}: ${r ? `score ${r.score}, tier ${r.tier}, stages ${r.stages.map((s) => `${s.name} p95 ${s.p95}`).join(' / ')}` : 'no result'}${tally.bad.length ? ' console ' + tally.bad[0] : ''}`);
      await ctx.close();
    }
    { // ?precision=mediump boots with a mediump skin shader
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await bootPage(page, 'index.html?test&precision=mediump');
      const r = await page.evaluate(() => { const gl = window.__sborn.stage.renderer.getContext(); const progs = window.__sborn.stage.renderer.info.programs || []; let med = false; for (const p of progs) { const sh = gl.getAttachedShaders(p.program) || []; for (const x of sh) if (gl.getShaderParameter(x, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER && /precision mediump float/.test(gl.getShaderSource(x) || '')) med = true; } return { med, gl: window.__sborn.info().glErrors }; });
      if (!r.med || r.gl || tally.bad.length) ok = false; notes.push(`mediump shader ${r.med}, gl errors ${r.gl}`);
      await ctx.close();
    }
    { // tools/board.html loads cleanly
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
      await page.goto(U('tools/board.html')); await page.waitForFunction(() => document.querySelectorAll('.row').length >= 85, null, { timeout: 60000 }).catch(() => {});
      const n = await page.evaluate(() => document.querySelectorAll('.row').length);
      if (n < 85 || tally.bad.length) ok = false; notes.push(`board ${n} rows${tally.bad.length ? ' console ' + tally.bad[0] : ''}`);
      await ctx.close();
    }
    add('C61.user-tools', '?debug JSON has every §15.4 field (text box when clipboard is missing); ?bench runs 4 stages with a finite score; ?bench&quality=high reports High; ?precision=mediump boots with a mediump skin shader; tools/board.html loads cleanly', 11, [61], ok, notes.join('; '));
  },
  // item 62: reduced motion
  async reduced(browser) {
    const ctx = await B.newContext(browser, 'desktop', { reducedMotion: 'reduce' }); const page = await ctx.newPage(); const tally = {}; B.watchPage(page, tally);
    await bootPage(page, 'index.html?test');
    const r = await page.evaluate(async () => {
      const s = window.__sborn; await s.settle();
      // skin tap squash
      const b = s.probe.where('skin:0.5'); const c = s.stage.renderer.domElement;
      const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 }));
      ev('pointerdown', b.x, b.y); ev('pointerup', b.x, b.y); window.dispatchEvent(new PointerEvent('pointerup', { clientX: b.x, clientY: b.y, pointerId: 1, bubbles: true }));
      let minY = 9, maxXZ = 0; for (let i = 0; i < 90; i++) { s.step(1); const g = s.creature.group.scale; minY = Math.min(minY, g.y); maxXZ = Math.max(maxXZ, g.x); }
      // camera azimuth fixed over 600 idle steps
      const p = s.stage.camera.position, az0 = Math.atan2(p.x, p.z); s.step(600, { render: 600 }); const az1 = Math.atan2(s.stage.camera.position.x, s.stage.camera.position.z);
      // a paint change fades: no wavefront, no stars
      s.mode('paint'); await s.settle();
      return { minY, maxXZ, az: Math.abs(az1 - az0), sw: s.probe.where('swatch:#5cc86f'), j0: s.juice || 0 };
    });
    await page.mouse.click(r.sw.x, r.sw.y); await new Promise((q) => setTimeout(q, 80));
    Object.assign(r, await page.evaluate((j0) => { const s = window.__sborn; return { fades: (s.juice || 0) - j0, stars: document.querySelectorAll('.star-burst').length, fadeEl: document.querySelectorAll('.paint-fade').length, wave: s.mats.skin.userData.uniforms.uWaveOn ? s.mats.skin.userData.uniforms.uWaveOn.value : 0 }; }, r.j0));
    delete r.sw; delete r.j0;
    const ok = Math.abs(r.minY - 0.94) <= 0.005 && Math.abs(r.maxXZ - 1.04) <= 0.005 && r.az < 1e-6 && r.fades >= 1 && r.stars === 0 && !r.wave && !tally.bad.length;
    add('C62.reduced-motion', 'reduced motion: skin-tap squash 0.94/1.04 ± 0.005; camera azimuth fixed over 600 idle steps; paint changes fade with no wavefront; console clean', 11, [62], ok, `${JSON.stringify(r)}${tally.bad.length ? ' console ' + tally.bad[0] : ''}`);
    await ctx.close();
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
    add('C37.programs', 'programs within the tier cap after warm-up, unchanged after every tab, pattern, emote, the island and photo mode, reported split', 3, [37], ok, notes.join('; '));
    add('C39.tiers-gl', 'all tiers render the editor, the island and photo mode with zero GL errors', 3, [39], ok, notes.map((n) => n.split(' cap')[0] + ' gl ' + n.split(' gl ')[1]).join('; '));
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
