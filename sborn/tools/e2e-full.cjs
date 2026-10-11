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
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${B.PORT}` }).catch(() => {});
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
    res.buildOk = true;
    // tap a target; first scroll its scrollable panel by real input (touch drag or wheel) if it sits outside the panel's view
    const K = async (key) => {
      for (let t = 0; t < 6; t++) {
        const p = await D.need(key);
        const box = await page.evaluate(([x, y, k]) => {
          const sel = /^(layer|swatch|pattern|size|mask|skintype|dice|paintlike|fan):|^(dice|paintlike)$/.test(k) ? '.paintpanel' : null;
          const c = sel && document.querySelector(sel); if (!c || c.scrollHeight <= c.clientHeight + 1) return null;
          const r = c.getBoundingClientRect(); if (y >= r.top + 24 && y <= r.bottom - 24) return null;
          return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, dy: y < r.top + 24 ? -(r.top + 60 - y) : y - (r.bottom - 60) };
        }, [p.x, p.y, key]);
        if (!box) return D.tap(p);
        const dy = Math.max(-200, Math.min(200, box.dy));
        if (D.touch) await D.drag({ x: box.cx, y: box.cy }, { x: box.cx, y: box.cy - dy }, { steps: 8 });
        else { await page.mouse.move(box.cx, box.cy); await page.mouse.wheel(0, dy); }
        await D.step(2);
      }
      return D.tap(await D.need(key));
    };
    const PG = (fn, arg) => page.evaluate(fn, arg);
    const programs = () => PG(() => window.__sborn.programs().total);
    const isDesk = kind === 'desktop';
    // (3) paint by input
    await K('tab:paint'); await D.settle();
    const req0 = await PG(() => window.__sborn.mesherStats().requested), prog0 = await programs();
    await K('layer:base'); await K('swatch:#6c8cff');
    await K('layer:coat'); await K('pattern:stripes'); await K('swatch:#ffd23f'); await K('size:M');
    await K('layer:detail'); await K('pattern:spots'); await K('swatch:#ff8fb1'); await K('size:S');
    await K('skintype:scaly'); await D.settle();
    const p1 = (await R()).paint;
    const eyeId = (await R()).parts.find((q) => q.t === 'eye.moon').id;
    const iris0 = p1.iris; await K(`part:${eyeId}`); await D.settle(); const iris1 = (await R()).paint.iris;
    await K('dice'); await D.settle(); const p2 = (await R()).paint;
    const req1 = await PG(() => window.__sborn.mesherStats().requested), prog1 = await programs();
    rec('paint', p1.base.c === '#6c8cff' && p1.coat.pat === 'stripes' && p1.coat.c === '#ffd23f' && p1.coat.sc === 1 && p1.detail.pat === 'spots' && p1.detail.c === '#ff8fb1' && p1.detail.sc === 0.5 && p1.skin === 'scaly' && iris1 !== iris0 && JSON.stringify(p2) !== JSON.stringify(p1) && req1 === req0 && prog1 === prog0,
      `base ${p1.base.c}; coat ${p1.coat.pat} ${p1.coat.c} ×${p1.coat.sc}; detail ${p1.detail.pat} ${p1.detail.c} ×${p1.detail.sc}; skin ${p1.skin}; iris ${iris0}→${iris1}; dice changed ${JSON.stringify(p2) !== JSON.stringify(p1)}; remesh requests ${req0}→${req1}; programs ${prog0}→${prog1}`);
    await shot('paint');
    // (4) play
    await K('tab:play'); await D.settle(); await D.step(110);   // the 1.6 s curtain-and-swoop intro plays out
    const L = () => PG(() => { const s = window.__sborn.play.loco.state; return { x: s.x, z: s.z, air: !!s.air }; });
    const a0 = await L();
    if (isDesk) { await D.key('KeyW', true); await D.step(300); await D.key('KeyW', false); }
    else { const g = await D.need(`ground:${a0.x},${a0.z + 4}`); await D.touchEv('touchStart', [g]); await D.step(300); await D.touchEv('touchEnd', []); }
    await D.step(30);
    const a1 = await L(); const walked = Math.hypot(a1.x - a0.x, a1.z - a0.z);
    const M = { x: a1.x, z: a1.z + 8 };
    await D.tap(await D.need(`ground:${M.x},${M.z}`));
    let best = 99, n8 = 0; for (; n8 < 1200 && best > 0.3; n8 += 10) { await D.step(10); const p = await L(); best = Math.min(best, Math.hypot(p.x - M.x, p.z - M.z)); }
    const j0 = await PG(() => window.__sborn.play.loco.metrics.jumps || 0);
    if (isDesk) { await D.key('Space', true); await D.key('Space', false); } else await K('play:jump');
    await D.step(90); const j1 = await PG(() => window.__sborn.play.loco.metrics.jumps || 0);
    const emo0 = await PG(() => window.__sborn.play.loco.emotes.log.filter((x) => x.name).length);
    const EM = [['Digit4', 'dance'], ['Digit5', 'roar'], ['Digit6', 'sit'], ['Digit7', 'sleep'], ['Digit8', 'wave']];
    for (const [code, name] of EM) { if (isDesk) { await D.key(code, true); await D.key(code, false); } else await K(`play:${name}`); await D.step(180); }
    if (isDesk) { await D.key('KeyF', true); await D.key('KeyF', false); await D.step(180); }
    const e0 = await PG(() => window.__sborn.play.metrics.eats);
    if (isDesk) { await D.key('Digit9', true); await D.key('Digit9', false); } else await K('play:eat');
    let ate = false; for (let i = 0; i < 80 && !ate; i++) { await D.step(10); ate = (await PG(() => window.__sborn.play.metrics.eats)) > e0; }
    const emo1 = await PG(() => window.__sborn.play.loco.emotes.log.filter((x) => x.name).length);
    const nan = await PG(() => { for (const w of window.__sborn.creature.rig.world) for (const e of w.elements) if (!Number.isFinite(e)) return true; return false; });
    const prog2 = await programs();
    rec('play', walked >= 2 && best <= 0.3 && j1 > j0 && emo1 - emo0 >= 6 && ate && !nan && prog2 === prog0,
      `${isDesk ? 'W' : 'hold-to-follow'} ${walked.toFixed(2)} m; tap-to-move best ${best.toFixed(3)} m in ${n8} steps; jumps ${j0}→${j1}; emotes +${emo1 - emo0}${isDesk ? ' + F' : ''}; ate ${ate}; NaN ${nan}; programs ${prog0}→${prog2}`);
    await shot('play');
    // helper: a file the page saves, by download (desktop) or the press-and-hold picture overlay (touch)
    const grab = async (key) => {
      const dl = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
      await K(key);
      const d = await Promise.race([dl, (async () => { for (let i = 0; i < 300; i++) { const src = await PG(() => { const o = [...document.querySelectorAll('.photo-overlay')].find((e) => getComputedStyle(e).display !== 'none'); return o ? o.querySelector('img').src : null; }); if (src) return { src }; await new Promise((q) => setTimeout(q, 200)); } return null; })()]);
      if (!d) { const w = await D.where(key); res.lastMiss = await PG(([x, y, k]) => { const e = document.elementFromPoint(x, y); return `${k} → ${e ? (e.getAttribute('aria-label') || e.className || e.tagName) : 'none'} (mode ${window.__sborn.mode()})`; }, [w && w.x, w && w.y, key]); return null; }
      if (d.src) { const bytes = await PG(async (u) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), d.src); await PG(() => { for (const o of document.querySelectorAll('.photo-overlay')) if (getComputedStyle(o).display !== 'none') o.querySelector('button').click(); }); return { name: null, bytes: Buffer.from(bytes) }; }
      return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
    };
    const openShare = async () => { if (!(await PG(() => document.querySelector('.share-menu').classList.contains('on')))) await K('shareBtn'); };
    const decode = (bytes) => PG(async (arr) => { const s = window.__sborn; const { readITXt, readLSB } = await import('./src/io/png.js'); const u8 = new Uint8Array(arr); const it = await readITXt(u8); const bmp = await createImageBitmap(new Blob([u8]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const ls = await readLSB(g.getImageData(0, 0, bmp.width, bmp.height)); return { w: bmp.width, h: bmp.height, itxt: !!it && s.canonicalEqual(it, s.recipe()), lsb: !!ls && s.canonicalEqual(ls, s.recipe()) }; }, Array.from(bytes));
    // (5) photo
    if (isDesk) { await D.key('KeyP', true); await D.key('KeyP', false); } else await K('play:photo');
    await D.settle();
    for (let i = 0; i < 6; i++) { await K(`photo:backdrop:${i}`); await D.step(1, 1); }
    const ph = await grab('photo:wide'); const phd = ph ? await decode(ph.bytes) : null;
    rec('photo', phd && phd.w === 1920 && phd.h === 1080 && phd.itxt, `6 backdrops; save ${phd ? `${phd.w}×${phd.h} iTXt ${phd.itxt} LSB ${phd.lsb}` : 'no file: ' + res.lastMiss}`);
    await shot('photo');
    await K('photo:back'); await D.settle();
    // (6) gallery: autosave, load Flapjack, reload the saved creature
    await new Promise((q) => setTimeout(q, 1200));
    const saved = await R();
    await K('galleryBtn'); await new Promise((q) => setTimeout(q, 800));
    await K('gallery:starter:6'); await D.settle(); await new Promise((q) => setTimeout(q, 1200));
    const fj = (await R()).name;
    await K('galleryBtn');
    let k = -1; for (let i = 0; i < 100 && k < 0; i++) { await new Promise((q) => setTimeout(q, 200)); k = await PG(async (r) => { const s = window.__sborn; const es = await s.library.entries(); const cards = document.querySelectorAll('.shelf.saved .gcard'); if (cards.length < es.length) return -1; return es.findIndex((e) => s.canonicalEqual(e.recipe, r)); }, saved); }
    if (k >= 0) { await K(`gallery:saved:${k}`); await D.settle(); }
    const back = await PG((r) => window.__sborn.canonicalEqual(window.__sborn.recipe(), r), saved);
    rec('gallery', fj === 'Flapjack' && k >= 0 && back, `loaded ${fj}; saved creature at shelf slot ${k}; back canonical-equal ${back}`);
    await shot('gallery');
    // (7) reload: canonical-equal at ready(); one undo works
    const before = await R();
    await new Promise((q) => setTimeout(q, 1200));
    await page.reload(); await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 120000 }); await B.awaitReady(page);
    const same = await PG((r) => window.__sborn.canonicalEqual(window.__sborn.recipe(), r), before);
    await PG(() => window.__sborn.storeReady()); await new Promise((q) => setTimeout(q, 300));
    await K('undo'); await D.settle();
    const undone = !(await PG((r) => window.__sborn.canonicalEqual(window.__sborn.recipe(), r), before));
    rec('reload', same && undone, `canonical-equal after reload ${same}; one undo changed the creature ${undone}`);
    await K('redo'); await D.settle();
    // (8) card: export, both copies, a drop into a second fresh context
    await openShare();
    const cd = await grab('share:card'); const cdd = cd ? await decode(cd.bytes) : null;
    const want = await R();
    let dropOk = false;
    if (cd) {
      const c2 = await B.newContext(browser, kind); const p2 = await c2.newPage(); const t2 = {}; B.watchPage(p2, t2);
      await boot(p2, 'index.html?test&quality=low');
      dropOk = await p2.evaluate(async ([arr, r]) => { const s = window.__sborn; const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(arr)], 'card.png', { type: 'image/png' })); document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); for (let i = 0; i < 60 && !s.canonicalEqual(s.recipe(), r); i++) await new Promise((q) => setTimeout(q, 100)); return s.canonicalEqual(s.recipe(), r); }, [Array.from(cd.bytes), want]);
      if (t2.bad.length) tally.bad.push(...t2.bad);
      await c2.close();
    }
    rec('card', cdd && cdd.w === 1080 && cdd.h === 1350 && cdd.itxt && cdd.lsb && dropOk, `card ${cdd ? `${cdd.w}×${cdd.h} iTXt ${cdd.itxt} LSB ${cdd.lsb}` : 'no file'}; dropped into a fresh context ${dropOk}`);
    // (9) link: opens in a new page; ✓ adds exactly 1 entry; canonical-equal
    await openShare(); await K('share:link'); await new Promise((q) => setTimeout(q, 400));
    let link = await PG(() => { const b = document.querySelector('.share-menu .link-box'); return b && getComputedStyle(b).display !== 'none' ? b.value : null; });
    let linkFrom = 'link field';
    if (!link) { link = await PG(() => navigator.clipboard.readText().catch(() => null)); linkFrom = 'clipboard'; }
    if (!link) { link = await PG(async () => `${location.origin}${location.pathname}${await window.__sborn.encodeLink()}`); linkFrom = 'encodeLink (clipboard unreadable in headless)'; }
    let linkOk = false, added = 0;
    if (link) {
      const n0 = await PG(async () => (await window.__sborn.library.entries()).length);
      const p3 = await ctx.newPage(); const t3 = {}; B.watchPage(p3, t3);
      await p3.goto(link); await p3.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 120000 }); await B.awaitReady(p3);
      const D3 = new Driver(p3, kind); await D3.init();
      await p3.waitForSelector('.link-bubble', { timeout: 60000 }); await new Promise((q) => setTimeout(q, 600));   // after the pop-in
      for (let t = 0; t < 2; t++) {
        const yes = await p3.evaluate(() => { const e = document.querySelector('.link-bubble [aria-label="Keep it"]'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
        if (!yes) break;
        await D3.tap(yes);
        for (let i = 0; i < 50 && await p3.evaluate(() => !!document.querySelector('.link-bubble')); i++) await new Promise((q) => setTimeout(q, 100));
      }
      await new Promise((q) => setTimeout(q, 1200));
      linkOk = await p3.evaluate((r) => window.__sborn.canonicalEqual(window.__sborn.recipe(), r), want);
      await p3.evaluate(() => window.__sborn.library.flush());
      added = (await p3.evaluate(async () => (await window.__sborn.library.entries()).length)) - n0;
      if (t3.bad.length) tally.bad.push(...t3.bad);
      await p3.close();
    }
    rec('link', linkOk && added === 1, `link ${link ? link.length + ' chars from ' + linkFrom : 'missing'}; canonical-equal ${linkOk}; entries +${added}`);
    // (10) GLB
    await openShare();
    const gl = await grab('share:glb');
    const glr = gl ? await PG(async (arr) => { const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); const u8 = new Uint8Array(arr); const g = await new GLTFLoader().parseAsync(u8.buffer, ''); const ms = []; g.scene.traverse((o) => { if (o.isMesh) ms.push(o); }); return { meshes: ms.length, color: ms.every((m) => !!m.geometry.attributes.color) }; }, Array.from(gl.bytes)) : null;
    const nm = (await R()).name;
    rec('glb', gl && glr && glr.color && glr.meshes <= 3 && gl.bytes.length <= 8 * 1048576 && (!gl.name || gl.name === `${nm.replace(/[^\w-]+/g, '_')}.glb`), gl ? `${gl.name || '(overlay)'} ${(gl.bytes.length / 1048576).toFixed(2)} MB, ${glr && glr.meshes} meshes, COLOR_0 ${glr && glr.color}` : 'no file: ' + res.lastMiss);
    res.pass = true;
  } catch (e) { res.error = String(e.message || e).slice(0, 400); }
  res.ms = Date.now() - t0; res.tally = { bad: tally.bad.length, first: tally.bad[0] || null }; res.nonLocal = ctx.__nonLocal || 0;
  if (tally.bad.length) { res.pass = false; res.error = (res.error || '') + ` console: ${tally.bad[0]}`; }
  await ctx.close();
  return res;
}
module.exports = { full };
