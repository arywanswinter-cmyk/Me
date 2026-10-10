const B = require('../browser.cjs');
(async () => {
  await B.ensureServers(); const b = await B.launch();
  const ctx = await B.newContext(b, 'ipadPortrait'); const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${B.PORT}/index.html?test`); await pg.waitForFunction(() => window.__sborn && window.__sborn.ready); await pg.evaluate(() => window.__sborn.ready());
  await pg.evaluate(() => window.__sborn.settle());
  const px = async () => { const buf = await pg.screenshot({ clip: { x: 400, y: 200, width: 1, height: 1 } }); return buf.length; };
  let n = 0; const px2 = async () => { const f = '/tmp/claude-0/-home-user-Me/c73fd272-fb23-5bfd-94d1-d0745b08255a/scratchpad/bx' + (n++) + '.png'; await pg.screenshot({ path: f, clip: { x: 400, y: 200, width: 1, height: 1 } }); return f; };
  console.log('start', await px2());
  await pg.evaluate(() => { const el = document.querySelector('.left'); el.style.display = 'none'; void el.offsetHeight; el.style.display = ''; });
  console.log('display toggle', await px2());
  await pg.setViewportSize({ width: 821, height: 1180 }); await pg.setViewportSize({ width: 820, height: 1180 });
  console.log('resize', await px2());
  await b.close(); B.stopServers();
})();
