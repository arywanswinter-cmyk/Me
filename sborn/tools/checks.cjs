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

const CHECKS = {
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
