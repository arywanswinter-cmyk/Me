// shots.cjs — the §14 screenshot list per milestone: file, context, url, mustShow and optional prepare/metrics.
// Exports: { m0: [...], m1: [...], ... }.
// Invariants: every prepare drives the game only through window.__sborn and real input; mustShow text is copied
//   from the build prompt's milestone list.
const S = (file, ctx, url, mustShow, extra = {}) => ({ file, ctx, url, mustShow, ...extra });
module.exports = {
  m0: [
    S('m0/01-boot-desktop.jpg', 'desktop', 'index.html?test&hatch', ['gradient sky', 'pedestal centred with cyan rim glow', 'no text', 'nothing cropped']),
    S('m0/02-boot-ipad.jpg', 'ipad', 'index.html?test&hatch', ['gradient sky', 'pedestal centred with cyan rim glow', 'no text', 'nothing cropped']),
  ],
  m1: [
    S('m1/01-default.jpg', 'desktop', 'index.html?test', ['Bloop smooth and closed', 'no cracks or facets', 'on the pedestal']),
    S('m1/02-fixtures-sheet.jpg', 'desktop', 'index.html?test&sheet=fixtures', ['all 12 numbered', 'closed', 'smooth junctions']),
  ],
};
