const B = require('../browser.cjs');
(async () => {
  await B.ensureServers(); const b = await B.launch();
  const ctx = await B.newContext(b, 'desktop'); const pg = await ctx.newPage();
  const tally = {}; B.watchPage(pg, tally);
  pg.on('crash', () => console.log('CRASH')); pg.on('framenavigated', (f) => console.log('nav', Date.now() % 100000, f.url()));
  pg.on('console', (m) => { if (m.type() !== 'debug') console.log('console', m.type(), m.text().slice(0, 150)); });
  pg.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${B.PORT}/index.html`);
  await pg.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 });
  await pg.evaluate(() => window.__sborn.ready()).catch((e) => console.log('ready err', String(e).slice(0, 100)));
  for (let i = 0; i < 6; i++) { console.log('breath', await pg.evaluate(() => window.__sborn.breath()).catch((e) => String(e).slice(0, 80))); await B.sleep(1000); }
  console.log('tally', JSON.stringify(tally).slice(0, 300));
  await b.close(); B.stopServers();
})();
