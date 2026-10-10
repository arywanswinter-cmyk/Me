const B = require('../browser.cjs');
(async () => {
  await B.ensureServers(); const b = await B.launch();
  const ctx = await B.newContext(b, 'ipadPortrait'); const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${B.PORT}/index.html?test`); await pg.waitForFunction(() => window.__sborn && window.__sborn.ready); await pg.evaluate(() => window.__sborn.ready());
  await pg.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.trundle); s.hideUI(false); await s.settle(); });
  await pg.screenshot({ path: '/tmp/claude-0/-home-user-Me/c73fd272-fb23-5bfd-94d1-d0745b08255a/scratchpad/c1.png' });
  await pg.evaluate(() => { const d = document.querySelector('.drawer'); d.style.display = 'none'; void d.offsetHeight; d.style.display = ''; });
  await pg.screenshot({ path: '/tmp/claude-0/-home-user-Me/c73fd272-fb23-5bfd-94d1-d0745b08255a/scratchpad/c2.png' });
  await pg.evaluate(() => { const d = document.querySelector('.drawer'); d.scrollLeft = 1; d.scrollLeft = 0; });
  await new Promise((r) => setTimeout(r, 3000));
  await pg.screenshot({ path: '/tmp/claude-0/-home-user-Me/c73fd272-fb23-5bfd-94d1-d0745b08255a/scratchpad/c3.png' });
  await b.close(); B.stopServers();
})();
