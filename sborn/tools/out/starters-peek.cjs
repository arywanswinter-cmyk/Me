// starters-peek.cjs — scratch: load each starter in the editor and save a 4×2 montage (argv[2]).
const B = require('../browser.cjs'); const { execFileSync } = require('child_process'); const path = require('path');
(async () => {
  await B.ensureServers();
  const b = await B.launch(); const ctx = await B.newContext(b, 'desktop'); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 200)); });
  await p.goto(`http://localhost:${B.PORT}/index.html?test`);
  await p.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 60000 });
  await p.evaluate(() => window.__sborn.ready());
  const names = ['bloop', 'wigglet', 'peepsy', 'trundle', 'skitter', 'clatter', 'flapjack', 'octoboop'], files = [];
  for (const n of names) {
    const info = await p.evaluate(async (n) => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); await s.load(STARTERS[n]); await s.settle(); const i = s.info(); return { tris: i.creature.tris, partTris: i.creature.partTris, gl: i.glErrors }; }, n);
    console.log(n, JSON.stringify(info));
    const f = path.join(process.argv[3], `${n}.jpg`); await p.screenshot({ path: f, type: 'jpeg', quality: 70 }); files.push(f);
  }
  await b.close(); B.stopServers();
  execFileSync('python3', ['-c', `
from PIL import Image
import sys
fs=sys.argv[2:]; W=320; ims=[Image.open(f) for f in fs]; h=int(W*ims[0].height/ims[0].width)
out=Image.new('RGB',(W*4,h*2))
for i,im in enumerate(ims): out.paste(im.resize((W,h)),((i%4)*W,(i//4)*h))
out.save(sys.argv[1])`, process.argv[2], ...files]);
})();
