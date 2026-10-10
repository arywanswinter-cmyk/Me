const B = require('../browser.cjs'); const { Driver } = require('../e2e.cjs');
(async () => {
  await B.ensureServers(); const b = await B.launch();
  const ctx = await B.newContext(b, 'ipadPortrait'); const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${B.PORT}/index.html?test`); await pg.waitForFunction(() => window.__sborn && window.__sborn.ready); await pg.evaluate(() => window.__sborn.ready());
  const d = new Driver(pg, 'ipadPortrait'); await d.init();
  await d.cardTo('card:mouth.chomper', await d.need('skin:0.99:nose'));
  console.log(JSON.stringify(await d.where('card:eye.moon')), JSON.stringify(await d.where('skin:0.86')));
  await d.scrollDrawerTo('card:eye.moon');
  console.log(JSON.stringify(await d.where('card:eye.moon')), await pg.evaluate(() => document.querySelector('.drawer').scrollLeft));
  await d.cardTo('card:eye.moon', await d.need('skin:0.86'));
  console.log(JSON.stringify((await pg.evaluate(() => window.__sborn.recipe())).parts.map((p) => p.t)));
  await pg.screenshot({ path: process.argv[2] });
  await b.close(); B.stopServers();
})();
