const B = require('../browser.cjs'); const { Driver } = require('../e2e.cjs');
(async () => {
  await B.ensureServers(); const b = await B.launch();
  const ctx = await B.newContext(b, 'desktop'); const pg = await ctx.newPage();
  await pg.goto(`http://localhost:${B.PORT}/index.html?test`); await pg.waitForFunction(() => window.__sborn && window.__sborn.ready); await pg.evaluate(() => window.__sborn.ready());
  await pg.evaluate(() => { window.__w = []; addEventListener('wheel', (e) => window.__w.push([e.deltaX, e.deltaY, e.shiftKey, e.ctrlKey]), true); });
  await pg.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.trundle); await s.settle(); s.editor.selection = { kind: 'part', id: 'P6' }; });
  await pg.mouse.move(640, 380); await pg.keyboard.down('Shift'); await pg.mouse.wheel(80, 0); await pg.keyboard.up('Shift');
  console.log(JSON.stringify(await pg.evaluate(() => [window.__w, window.__sborn.recipe().parts.find((p) => p.id === 'P6').at, window.__sborn.editor.selection])));
  const ic = await B.newContext(b, 'ipad'); const p2 = await ic.newPage();
  await p2.goto(`http://localhost:${B.PORT}/index.html?test`); await p2.waitForFunction(() => window.__sborn && window.__sborn.ready); await p2.evaluate(() => window.__sborn.ready());
  await p2.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS.trundle); await s.settle(); });
  await p2.evaluate(() => { window.__pe = []; document.querySelector('canvas').addEventListener('pointerdown', (e) => ((f) => f())(() => { const a = window.__sborn.editor.state.armed; window.__pe.push('armed:' + (a ? a.kind + ':' + (a.target && (a.target.kind || a.target.key || (a.target.sock && a.target.sock.id))) : 'none')); }, 0)); });
  const d = new Driver(p2, 'ipad'); await d.init(); const sk = await d.where('skin:0.5'); console.log(JSON.stringify(await p2.evaluate(() => [0, 0.5, 1].map((u) => { const s = window.__sborn, fr = s.creature.shape.spine.at(u), v = new s.three.Vector3(...fr.p); return [u, fr.p.map((x) => +x.toFixed(2)), s.picker.toScreen(v, {})]; }))));
  console.log(JSON.stringify(await p2.evaluate(() => [window.__sborn.editor.selection, window.__pe])), JSON.stringify(sk));
  await b.close(); B.stopServers();
})();
