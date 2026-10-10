// peek.cjs — scratch driver: load a URL, optionally evaluate an expression, screenshot it.
// Exports: nothing. Invariants: scratch only; prints console errors.
const B = require('../browser.cjs');
(async () => {
  await B.ensureServers();
  const b = await B.launch(); const ctx = await B.newContext(b, process.argv[3] || 'desktop'); const p = await ctx.newPage();
  p.on('console', (m) => { if (!/ReadPixels/.test(m.text())) console.log('console', m.type(), m.text().slice(0, 300)); });
  p.on('pageerror', (e) => console.log('pageerror', String(e.stack || e).slice(0, 600)));
  await p.goto(`http://localhost:${B.PORT}/${process.argv[2] || 'index.html?test'}`);
  await p.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 });
  const ok = await Promise.race([p.evaluate(() => window.__sborn.ready()).then(() => true), new Promise((r) => setTimeout(() => r(false), 15000))]);
  if (!ok) console.log('READY TIMEOUT');
  if (process.argv[4]) { try { console.log(JSON.stringify(await p.evaluate(process.argv[4])).slice(0, 3000)); } catch (e) { console.log('eval error', String(e).slice(0, 500)); } }
  await Promise.race([p.evaluate(() => window.__sborn.settle && window.__sborn.settle()), new Promise((r) => setTimeout(r, 15000))]);
  await p.screenshot({ path: process.argv[5] || '/tmp/claude-0/peek.jpg', quality: 70, type: 'jpeg' });
  try { console.log(JSON.stringify(await p.evaluate(() => window.__sborn.info && window.__sborn.info())).slice(0, 600)); } catch {}
  await b.close(); B.stopServers();
})();
