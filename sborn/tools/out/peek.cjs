// peek.cjs — scratch driver: load a URL and screenshot it.
// Exports: nothing. Invariants: scratch only.
const B = require('../browser.cjs');
(async () => {
  await B.ensureServers();
  const b = await B.launch(); const ctx = await B.newContext(b, process.argv[3] || 'desktop'); const p = await ctx.newPage();
  const tally = {}; B.watchPage(p, tally);
  p.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200)));
  await p.goto(`http://localhost:${B.PORT}/${process.argv[2] || 'index.html?test'}`);
  await p.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 });
  await p.evaluate(() => window.__sborn.ready());
  if (process.argv[4]) console.log(JSON.stringify(await p.evaluate(process.argv[4])).slice(0, 2000));
  await p.evaluate(() => window.__sborn.settle && window.__sborn.settle());
  await p.screenshot({ path: process.argv[5] || '/tmp/claude-0/peek.jpg', quality: 70, type: 'jpeg' });
  console.log(JSON.stringify(await p.evaluate(() => window.__sborn.info && window.__sborn.info())), JSON.stringify(tally.bad));
  await b.close(); B.stopServers();
})();
