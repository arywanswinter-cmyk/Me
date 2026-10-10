const B = require('../browser.cjs'); const { Driver } = require('../e2e.cjs');
(async () => {
  await B.ensureServers();
  const b = await B.launch(); const ctx = await B.newContext(b, 'desktop'); const page = await ctx.newPage();
  page.on('framenavigated', (f) => console.log('nav', f.url().slice(0, 80)));
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
  await page.goto(`http://localhost:${B.PORT}/index.html?test`);
  await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 }); await page.evaluate(() => window.__sborn.ready());
  await page.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.bloop); await s.settle(); });
  const skin = await page.evaluate(() => {
    const s = window.__sborn, c = s.creature, fr = c.shape.spine.at(0.55), T3 = s.three, P = c.skin.geometry.attributes.position.array;
    let top = null; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i]) < 0.01 && Math.abs(P[i + 2] - fr.p[2]) < 0.03 && (!top || P[i + 1] > top[1])) top = [0, P[i + 1], P[i + 2]];
    const v = new T3.Vector3(...top); c.body.updateMatrixWorld(true); v.applyMatrix4(c.body.matrixWorld).project(s.stage.camera);
    const r = document.querySelector('canvas').getBoundingClientRect(); return { top, x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  });
  console.log('target', JSON.stringify(skin));
  const drv = new Driver(page, 'desktop'); await drv.init();
  console.log('card', JSON.stringify(await drv.where('card:det.nubhorn')));
  await drv.cardTo('card:det.nubhorn', { x: skin.x + 3, y: skin.y });
  console.log('card after', JSON.stringify(await drv.where('card:det.nubhorn')));
  console.log(JSON.stringify(await page.evaluate(() => window.__sborn.recipe().parts.map((p) => [p.t, p.m, p.at.d]))));
  await page.screenshot({ path: process.argv[2] }); await b.close(); B.stopServers();
})();
