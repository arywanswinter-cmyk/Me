const B = require('../browser.cjs'); const { execSync } = require('child_process');
const SP = process.argv[2];
(async () => {
  await B.ensureServers(); const b = await B.launch();
  for (const css of ['.drawer{scrollbar-width:none}', '.drawer::-webkit-scrollbar{display:none}', '.drawer{overscroll-behavior:auto !important}']) {
    const ctx = await B.newContext(b, 'ipadPortrait'); const pg = await ctx.newPage();
    await pg.goto(`http://localhost:${B.PORT}/index.html?test`); await pg.waitForFunction(() => window.__sborn && window.__sborn.ready); await pg.evaluate(() => window.__sborn.ready());
    await pg.evaluate(async (css) => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.trundle); s.hideUI(false); await s.settle(); }, css);
    await pg.screenshot({ path: `${SP}/cc.png` });
    console.log(JSON.stringify(css), execSync(`python3 -c "from PIL import Image;print(Image.open('${SP}/cc.png').convert('RGB').getpixel((400,200)))"`).toString().trim());
    await ctx.close();
  }
  await b.close(); B.stopServers();
})();
