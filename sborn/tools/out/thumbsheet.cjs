// thumbsheet.cjs — scratch: render all drawer thumbs and save a 10-column contact sheet to argv[2].
const B = require('../browser.cjs'); const fs = require('fs');
(async () => {
  await B.ensureServers();
  const b = await B.launch(); const ctx = await B.newContext(b, 'desktop'); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
  await p.goto(`http://localhost:${B.PORT}/index.html?test`);
  await p.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 });
  await p.evaluate(() => window.__sborn.ready());
  const url = await p.evaluate(async () => { const s = window.__sborn; const st = await s.thumbs(); const ids = Object.keys(st);
    const cv = document.createElement('canvas'); cv.width = 128 * 10; cv.height = 128 * 7; const c = cv.getContext('2d'); c.fillStyle = '#e8e2ee'; c.fillRect(0, 0, cv.width, cv.height);
    let k = 0; for (const id of ids) { const img = document.querySelector(`[data-card="${id}"] img`); if (img) { await img.decode(); c.drawImage(img, (k % 10) * 128, Math.floor(k / 10) * 128, 128, 128); } k++; }
    return cv.toDataURL('image/png'); });
  fs.writeFileSync(process.argv[2], Buffer.from(url.split(',')[1], 'base64'));
  await b.close(); B.stopServers();
})();
