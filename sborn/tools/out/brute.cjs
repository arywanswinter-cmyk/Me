const B = require('../browser.cjs'); const { execSync } = require('child_process');
(async () => {
  await B.ensureServers(); const b = await B.launch();
  const ctx = await B.newContext(b, 'ipadPortrait'); const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${B.PORT}/index.html?test`); await pg.waitForFunction(() => window.__sborn && window.__sborn.ready); await pg.evaluate(() => window.__sborn.ready());
  await pg.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.trundle); s.hideUI(false); await s.settle(); });
  const pix = async () => { await pg.screenshot({ path: '/tmp/claude-0/-home-user-Me/c73fd272-fb23-5bfd-94d1-d0745b08255a/scratchpad/bp.png', }); return execSync("python3 -c \"from PIL import Image;print(Image.open('/tmp/claude-0/-home-user-Me/c73fd272-fb23-5bfd-94d1-d0745b08255a/scratchpad/bp.png').convert('RGB').getpixel((400,200)))\"").toString().trim(); };
  console.log('base', await pix());
  const n = await pg.evaluate(() => { window.__els = [...document.querySelectorAll('#ui *, body > *')]; return window.__els.length; });
  for (let i = 0; i < n; i++) {
    const name = await pg.evaluate((i) => { const e = window.__els[i]; e.__v = e.style.visibility; e.style.visibility = 'hidden'; return e.tagName + '.' + (e.className && e.className.baseVal === undefined ? e.className : ''); }, i);
    const p = await pix();
    await pg.evaluate((i) => { const e = window.__els[i]; e.style.visibility = e.__v; }, i);
    if (!p.startsWith('(169')) console.log('HIT', i, name, p);
  }
  await b.close(); B.stopServers();
})();
