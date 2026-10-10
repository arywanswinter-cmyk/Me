// shots.cjs — the §14 screenshot list per milestone: file, context, url, mustShow and optional prepare/metrics.
// Exports: { m0: [...], m1: [...], ... }.
// Invariants: every prepare drives the game only through window.__sborn and real input; mustShow text is copied
//   from the build prompt's milestone list.
const S = (file, ctx, url, mustShow, extra = {}) => ({ file, ctx, url, mustShow, ...extra });
const fs = require('fs');
const path = require('path');
const DEMO = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-quad.json'), 'utf8'));
const { beauty } = require('./beauty.cjs');
const HERO = { ...DEMO, parts: DEMO.parts.filter((q) => q.t !== 'mouth.chomper'), paint: { skin: 'bumpy', base: { c: '#5bb8ff', pat: 'solid', sc: 1 }, coat: { c: '#9b7bff', pat: 'stripes', sc: 1, amt: 0.7, mask: 'back' }, detail: { c: '#ffd23f', pat: 'spots', sc: 0.5, amt: 0.6, mask: 'all' }, iris: '#ff9f43' } };
const loadHero = async (page) => { await page.evaluate((r) => { window.__sborn.load(r); window.__sborn.hideUI(true); }, HERO); await page.evaluate(() => window.__sborn.settle()); };
const heroMetrics = async (page) => beauty(page);
const loadDemo = async (page) => { await page.evaluate((r) => window.__sborn.load(r), DEMO); await page.evaluate(() => window.__sborn.settle()); };
const loadStarter = (name, hide = true) => async (page) => { await page.evaluate(async ([n, hide]) => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); s.load(STARTERS[n]); s.hideUI(hide); await s.settle(); }, [name, hide]); };
// lift a drawer card with the mouse and hold it over a skin point (the shot is taken mid-drag)
const holdCard = (id, skin) => async (page) => {
  await loadStarter('trundle', false)(page);
  const { Driver } = require('./e2e.cjs'); const d = new Driver(page, 'desktop'); await d.init();
  let c = await d.where(`card:${id}`); if (!c.visible) { await d.scrollDrawerTo(`card:${id}`); c = await d.where(`card:${id}`); }
  const t = await d.need(skin);
  await page.mouse.move(c.x, c.y); await page.mouse.down();
  for (let k = 1; k <= 14; k++) await page.mouse.move(c.x + (t.x - c.x) * k / 14, c.y + (t.y - c.y) * k / 14);
  await page.evaluate(() => window.__sborn.step(20, { render: 1 }));
};
// load a starter, switch to Play, hold a key for n steps with the camera side-on, then stop holding
const drivePlay = (name, code, n, run = false) => async (page) => {
  await loadStarter(name)(page);
  await page.evaluate(async ([code, n, run]) => {
    const s = window.__sborn; s.hideUI(false); s.mode('play'); await s.settle();
    s.play.state.camAz = Math.PI * 0.55; s.play.state.camDist = 2.2;
    if (run) s.drive.key('ShiftLeft', true);
    s.drive.key(code, true); s.step(n, { render: 2 });      // keys stay held: the creature is mid-stride when shot
  }, [code, n, run]);
};
module.exports = {
  m0: [
    S('m0/01-boot-desktop.jpg', 'desktop', 'index.html?test&hatch', ['gradient sky', 'pedestal centred with cyan rim glow', 'no text', 'nothing cropped']),
    S('m0/02-boot-ipad.jpg', 'ipad', 'index.html?test&hatch', ['gradient sky', 'pedestal centred with cyan rim glow', 'no text', 'nothing cropped']),
  ],
  m1: [
    S('m1/01-default.jpg', 'desktop', 'index.html?test', ['Bloop smooth and closed', 'no cracks or facets', 'on the pedestal']),
    S('m1/02-fixtures-sheet.jpg', 'desktop', 'index.html?test&sheet=fixtures', ['all 12 numbered', 'closed', 'smooth junctions']),
  ],
  m2: [
    S('m2/01-slice-build.jpg', 'desktop', 'index.html?test', ['a 4-legged creature with eyes and mouth on the pedestal', 'drawer and DNA pill visible'], { prepare: loadDemo }),
    S('m2/02-slice-play.jpg', 'desktop', 'index.html?test', ['walking on the meadow', 'feet on the ground'], { prepare: async (page) => {
      await loadDemo(page);
      await page.evaluate(() => { const s = window.__sborn; s.mode('play'); s.play.state.camAz = Math.PI * 0.7; s.drive.key('KeyW', true); s.step(150); });
    } }),
    S('m2/03-slice-ipad.jpg', 'ipad', 'index.html?test', ['the build screen at 1180×820'], { prepare: loadDemo }),
  ],
  m3: [
    S('m3/01-hero-high.jpg', 'desktop', 'index.html?test&quality=high', ['pedestal glow', 'seamless sky', 'rim light', 'contact shadow', 'catchlight in every eye'], { prepare: loadHero, metrics: heroMetrics }),
    S('m3/02-hero-medium.jpg', 'desktop', 'index.html?test&quality=medium', ['pedestal glow', 'seamless sky', 'rim light', 'contact shadow', 'catchlight in every eye'], { prepare: loadHero, metrics: heroMetrics }),
    S('m3/03-hero-low.jpg', 'desktop', 'index.html?test&quality=low', ['pedestal glow', 'seamless sky', 'rim light', 'contact shadow', 'catchlight in every eye'], { prepare: loadHero, metrics: heroMetrics }),
    S('m3/04-skin-macro.jpg', 'desktop', 'index.html?test&quality=high&sheet=skins', ['5 skin types', 'distinct micro-detail']),
    S('m3/05-backlit.jpg', 'desktop', 'index.html?test&quality=high&sheet=backlit', ['a thin fin or ear glowing warm'], { metrics: async (page) => page.evaluate(async () => {
      const s = window.__sborn; await s.settle();
      const gl = s.stage.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const read = () => { const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
      // the fin region: pixels drawn by the membrane material (mask from a membrane-only render)
      const mem = s.mats.membrane, u = mem.userData.uniforms;
      const on = read(); u.uLightThrough.value = 0; await s.settle(); const off = read(); u.uLightThrough.value = 1;
      // fin mask: pixels that change when membrane meshes are hidden
      const mem2 = []; s.stage.scene.traverse((o) => { if (o.isMesh && o.material === mem) mem2.push(o); });
      for (const o of mem2) o.visible = false; await s.settle(); const none = read(); for (const o of mem2) o.visible = true; await s.settle();
      let a = 0, b = 0, n = 0;
      const L = (p, i) => 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const Y = (p, i) => 0.2126 * lin(p[i]) + 0.7152 * lin(p[i + 1]) + 0.0722 * lin(p[i + 2]);     // relative luminance
      for (let i = 0; i < w * h * 4; i += 4) { if (Math.abs(L(on, i) - L(none, i)) < 12) continue; a += Y(on, i); b += Y(off, i); n++; }
      return { finPixels: n, ratio: n ? a / b : 0, pass: n > 200 && a / b >= 1.3 };
    }) }),
    S('m3/06-eye-macro.jpg', 'desktop', 'index.html?test&quality=high', ['iris fibres', 'pupil', 'limbal ring', 'both catchlights'], { prepare: async (page) => {
      await loadHero(page);
      await page.evaluate(() => { const s = window.__sborn; s.freeCamera(true); const e = s.probe.eyes(); const c = s.creature, sk = c.shape.sockets.find((x) => x.bones.ball !== undefined && x.inst === 0);
        const v = new s.three.Vector3(); c.rig.jointWorld(sk.bones.ball, v); c.body.updateMatrixWorld(true); v.applyMatrix4(c.body.matrixWorld);
        const n = new s.three.Vector3(...sk.frame.Y); const cam = s.stage.camera; cam.position.copy(v).addScaledVector(n, 0.32); cam.lookAt(v); cam.updateMatrixWorld(); });
    } }),
    S('m3/07-material-lineup.jpg', 'desktop', 'index.html?test&quality=high&sheet=materials', ['skin', 'eye', 'keratin', 'iridescent shell', 'glowing membrane', 'red-plum mouth interior', 'ivory teeth']),
    S('m3/08-debug-overlay.jpg', 'desktop', 'index.html?test&debug', ['every ?debug field', 'the copy button'], { prepare: async (page) => { await page.evaluate(() => { const s = window.__sborn; s.step(30, { render: 1 }); }); } }),
  ],
  m4: [
    S('m4/01-mouths.jpg', 'desktop', 'index.html?test&quality=high&sheet=group:mouth', ['every part of the category fully in frame', 'rounded tips visible']),
    S('m4/02-eyes.jpg', 'desktop', 'index.html?test&quality=high&sheet=group:eye', ['every part of the category fully in frame', 'rounded tips visible']),
    S('m4/03-feet.jpg', 'desktop', 'index.html?test&quality=high&sheet=group:foot', ['every part of the category fully in frame', 'rounded tips visible']),
    S('m4/04-hands.jpg', 'desktop', 'index.html?test&quality=high&sheet=group:hand', ['every part of the category fully in frame', 'rounded tips visible']),
    S('m4/05-wings.jpg', 'desktop', 'index.html?test&quality=high&sheet=group:wing', ['every part of the category fully in frame', 'rounded tips visible']),
    S('m4/06-tails.jpg', 'desktop', 'index.html?test&quality=high&sheet=group:tail', ['every part of the category fully in frame', 'rounded tips visible']),
    S('m4/07-fins.jpg', 'desktop', 'index.html?test&quality=high&sheet=group:fin', ['every part of the category fully in frame', 'rounded tips visible']),
    S('m4/08-details.jpg', 'desktop', 'index.html?test&quality=high&sheet=group:det', ['every part of the category fully in frame', 'rounded tips visible']),
    S('m4/09-attach-macro.jpg', 'desktop', 'index.html?test&quality=high&sheet=attach', ['a horn base and a limb root filling ≥ 30% of the frame', 'no gap, ring or colour seam']),
    S('m4/10-trundle.jpg', 'desktop', 'index.html?test&quality=high', ['Trundle on the pedestal', 'beauty checks'], { prepare: loadStarter('trundle'), metrics: heroMetrics }),
    S('m4/11-painted-starter.jpg', 'desktop', 'index.html?test&quality=high', ['a painted starter', 'beauty checks'], { prepare: loadStarter('skitter'), metrics: heroMetrics }),
  ],
  m5: [
    S('m5/01-walk-quad.jpg', 'desktop', 'index.html?test&debug', ['mid-stride', 'planted feet touching the ground', 'slide readout'], { prepare: drivePlay('trundle', 'KeyW', 140), metrics: async (page) => page.evaluate(() => { const L = window.__sborn.play.loco; return { planted: L.legs.filter((l) => l.planted).length, gait: L.gait.id }; }) }),
    S('m5/02-walk-hexapod.jpg', 'desktop', 'index.html?test', ['tripod phase', '3 feet planted'], { prepare: async (page) => { await drivePlay('skitter', 'KeyW', 150, true)(page); await page.evaluate(() => { const s = window.__sborn, L = s.play.loco; for (let i = 0; i < 60 && L.legs.filter((l) => l.planted).length !== 3; i++) s.step(1); }); }, metrics: async (page) => page.evaluate(() => { const L = window.__sborn.play.loco; return { planted: L.legs.filter((l) => l.planted).length, gait: L.gait.id }; }) }),
    S('m5/03-slither.jpg', 'desktop', 'index.html?test', ['S-curved body'], { prepare: drivePlay('wigglet', 'KeyW', 160) }),
    S('m5/04-emotes-sheet.jpg', 'desktop', 'index.html?test&quality=high&sheet=emotes', ['7 emotes × biped, quad and legless at peak pose']),
  ],
  m6: [
    S('m6/01-editor-desktop.jpg', 'desktop', 'index.html?test', ['every §8.1 placement', 'no words except the name and numbers'], { prepare: loadStarter('trundle', false) }),
    S('m6/02-editor-ipad.jpg', 'ipad', 'index.html?test', ['every §8.1 placement', 'no words except the name and numbers'], { prepare: loadStarter('trundle', false) }),
    S('m6/03-editor-ipad-portrait.jpg', 'ipadPortrait', 'index.html?test', ['2-row shelf', 'stats strip'], { prepare: async (page) => { await loadStarter('trundle', false)(page); await page.evaluate(() => document.body.classList.add('stats-open')); } }),
    S('m6/04-drag-and-look.jpg', 'desktop', 'index.html?test', ['part mid-drag', 'eyes on it', 'ghost −DNA', 'ghost twin'], { prepare: holdCard('det.curlhorn', 'skin:0.6') }),
    S('m6/05-hint-leg.jpg', 'desktop', 'index.html?test&hints', ['ghost hand and glow on the Ready Leg card'], { prepare: async (page) => { await page.evaluate(() => window.__sborn.step(100)); } }),
    S('m6/06-budget-full.jpg', 'desktop', 'index.html?test', ['pill or jar full', '≥ 1 locked card still visible'], { prepare: async (page) => { await page.evaluate(async () => { const s = window.__sborn; const { STARTERS } = await import('./src/catalog/starters.js'); const r = JSON.parse(JSON.stringify(STARTERS.skitter));
      r.parts.push({ id: 'PX0', t: 'det.curlhorn', at: { b: 'spine', u: 0.3, d: [0.6, 0.8, 0], tw: 0 }, sc: 1, m: 1, p: {}, tint: 'detail' }, { id: 'PX1', t: 'det.curlhorn', at: { b: 'spine', u: 0.55, d: [0.6, 0.8, 0], tw: 0 }, sc: 1, m: 1, p: {}, tint: 'detail' },
        { id: 'PX2', t: 'det.tuft', at: { b: 'spine', u: 0.2, d: [0, 1, 0], tw: 0 }, sc: 1, m: 0, p: {}, tint: 'skin' }, { id: 'PX3', t: 'det.tuft', at: { b: 'spine', u: 0.75, d: [0, 1, 0], tw: 0 }, sc: 1, m: 0, p: {}, tint: 'skin' });
      s.load(r); await s.settle(); }); }, metrics: async (page) => page.evaluate(() => ({ budget: window.__sborn.budget(), locked: document.querySelectorAll('.card.locked').length })) }),
    S('m6/07-symmetry-ghost.jpg', 'desktop', 'index.html?test', ['off-centre drag with a shimmering twin'], { prepare: holdCard('eye.moon', 'skin:0.8') }),
    S('m6/08-ui-icons-sheet.jpg', 'desktop', 'index.html?test&sheet=icons', ['every icon at 2×']),
  ],
  m7: [
    S('m7/01-paint-tab.jpg', 'desktop', 'index.html?test', ['3 layer cards', '18 swatches', '10 pattern blobs', 'S/M/L chips', 'dice'], { prepare: async (page) => { await loadStarter('trundle', false)(page); await page.evaluate(async () => { window.__sborn.mode('paint'); await window.__sborn.settle(); }); } }),
    S('m7/02-shimmer-mid.jpg', 'desktop', 'index.html?test', ['wavefront band mid-body with stars'], { prepare: async (page) => { await loadStarter('trundle', false)(page); await page.evaluate(async () => { const s = window.__sborn; s.mode('paint'); await s.settle(); s.paintJuice(); s.step(18, { render: 1 }); }); await new Promise((r) => setTimeout(r, 220)); }, settle: false }),
    S('m7/03-pattern-sheet.jpg', 'desktop', 'index.html?test&quality=high&sheet=patterns', ['patterns 0–9 numbered on one creature']),
    S('m7/04-stripes-follow-spine.jpg', 'desktop', 'index.html?test&quality=high&sheet=stripes', ['a bent creature with ≥ 10 vertebrae', 'stripes perpendicular to the spine along the curve', 'ring bands on the limbs']),
  ],
};
