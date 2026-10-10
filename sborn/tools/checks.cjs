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
const DEMO = () => JSON.parse(fs.readFileSync(path.join(B.SB, 'tools/demo-quad.json'), 'utf8'));
async function tour(page) {
  // a pass through every tab (more stops are added as features land: emotes, patterns, island, photo)
  await page.evaluate(async (r) => {
    const s = window.__sborn; s.load(r); await s.settle();
    for (const m of ['paint', 'play', 'build']) { s.mode(m); s.step(20, { render: 5 }); await s.settle(); }
  }, DEMO());
}
const CHECKS = {
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
