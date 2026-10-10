const B = require('../browser.cjs'); const fs = require('fs');
(async () => {
  await B.ensureServers(); const b = await B.launch();
  const ctx = await B.newContext(b, 'ipadPortrait'); const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${B.PORT}/index.html?test`); await pg.waitForFunction(() => window.__sborn && window.__sborn.ready); await pg.evaluate(() => window.__sborn.ready());
  await pg.evaluate(() => window.__sborn.settle());
  const url = await pg.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  fs.writeFileSync(process.argv[2], Buffer.from(url.split(',')[1], 'base64'));
  const el = await pg.evaluate(() => [...document.querySelectorAll('#ui > *')].map((e) => { const r = e.getBoundingClientRect(); return `${e.className} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} ${getComputedStyle(e).display}`; }).join('\n'));
  console.log(el);
  await b.close(); B.stopServers();
})();
