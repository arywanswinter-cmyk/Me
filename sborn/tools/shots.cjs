// shots.cjs — the §14 screenshot list per milestone: file, context, url, mustShow and optional prepare/metrics.
// Exports: { m0: [...], m1: [...], ... }.
// Invariants: every prepare drives the game only through window.__sborn and real input; mustShow text is copied
//   from the build prompt's milestone list.
const S = (file, ctx, url, mustShow, extra = {}) => ({ file, ctx, url, mustShow, ...extra });
const fs = require('fs');
const path = require('path');
const DEMO = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-quad.json'), 'utf8'));
const loadDemo = async (page) => { await page.evaluate((r) => window.__sborn.load(r), DEMO); await page.evaluate(() => window.__sborn.settle()); };
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
};
