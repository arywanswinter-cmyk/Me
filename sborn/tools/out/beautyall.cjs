const B = require('../browser.cjs'); const { beauty } = require('../beauty.cjs');
(async () => {
  await B.ensureServers();
  const b = await B.launch();
  for (const n of ['bloop', 'wigglet', 'peepsy', 'trundle', 'skitter', 'clatter', 'flapjack', 'octoboop']) {
    const ctx = await B.newContext(b, 'desktop'); const page = await ctx.newPage();
    await page.goto(`http://localhost:${B.PORT}/index.html?test&quality=high`);
    await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 }); await page.evaluate(() => window.__sborn.ready());
    await page.evaluate(async (n) => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS[n]); s.hideUI(true); await s.settle(); }, n);
    const r = await beauty(page);
    console.log(n, r.pass ? 'PASS' : 'FAIL', r.fails.join(';'), 'rim', r.rimRatio.toFixed(3), 'eyes', r.eyes.join(','), 'fill', r.fill.toFixed(2));
    await ctx.close();
  }
  await b.close(); B.stopServers();
})();
