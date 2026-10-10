// palette.js — the paint dice: a harmonious random paint (three hues 30–150° apart, soft, never darker than #3D3A4B).
// Exports: dicePaint(prev, rnd) -> paint.
// Invariants: deterministic for rnd; keeps the skin type and iris; coat and detail always visible (amt 0.45–0.75).
const PATS = ['solid', 'gradient', 'spots', 'stripes', 'scales', 'speckles', 'patches', 'saddle', 'rosettes', 'bands'];
const MASKS = ['all', 'back', 'belly', 'limbs', 'head'];
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - C / 2;
  const [r, g, b] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
export function dicePaint(prev, rnd = Math.random) {
  const h0 = rnd() * 360, d1 = 30 + rnd() * 120, d2 = 30 + rnd() * 120;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return {
    skin: prev.skin,
    base: { c: hsl(h0, 0.55 + 0.3 * rnd(), 0.6 + 0.12 * rnd()), pat: pick(['solid', 'gradient']), sc: 1 },
    coat: { c: hsl(h0 + d1, 0.6 + 0.25 * rnd(), 0.55 + 0.15 * rnd()), pat: pick(PATS.slice(2)), sc: pick([0.5, 1, 2]), amt: +(0.45 + 0.3 * rnd()).toFixed(2), mask: pick(MASKS) },
    detail: { c: hsl(h0 - d2, 0.65 + 0.2 * rnd(), 0.62 + 0.15 * rnd()), pat: pick(['spots', 'speckles', 'rosettes', 'patches']), sc: pick([0.5, 1]), amt: +(0.45 + 0.3 * rnd()).toFixed(2), mask: pick(MASKS) },
    iris: prev.iris,
  };
}
