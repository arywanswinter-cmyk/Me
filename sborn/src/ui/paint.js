// paint.js — the Paint tab panel: 3 layer cards, 18 swatches (with a long-press fan), 10 pattern tiles on mini blobs,
//   S/M/L size chips, masks, the 5 skin types, dice, and the 7-emote strip.
// Exports: SWATCHES, PATTERN_IDS, MASK_IDS, SKIN_IDS, createPaintPanel(H) -> { el, strip, set(paint), where(key), fanOpen }.
// Invariants: icons only (no words); every control ≥ 44 px with an aria-label; previews never touch history (H.onPreview),
//   applying goes through H.onPaint(op args); the fan never goes darker than #3D3A4B.
import { icon } from './icons.js';

export const SWATCHES = ['#FF8FB1', '#FF7A6B', '#FF9F43', '#FFD23F', '#B5E655', '#5CC86F', '#4FD1B5', '#2BB3C0', '#5BB8FF', '#6C8CFF', '#9B7BFF', '#D17BFF', '#FFF1D6', '#E8C995', '#9C6B4E', '#7A3E6E', '#6E8B3D', '#3D3A4B'];
export const PATTERN_IDS = ['solid', 'gradient', 'spots', 'stripes', 'scales', 'speckles', 'patches', 'saddle', 'rosettes', 'bands'];
export const MASK_IDS = ['all', 'back', 'belly', 'limbs', 'head'];
export const SKIN_IDS = ['smooth', 'bumpy', 'scaly', 'leathery', 'fuzzy'];
const EMOTES = ['dance', 'roar', 'sit', 'sleep', 'wave', 'eat', 'fly'];
const SIZES = [['S', 0.5], ['M', 1], ['L', 2]];

const h = (tag, cls, attrs = {}, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (html) e.innerHTML = html; return e; };
const INK = '#3A2E5C';
const blob = (inner) => `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><clipPath id="cb"><path d="M8 26c0-11 8-18 17-18s15 7 15 16-6 16-16 16S8 35 8 26z"/></clipPath></defs><g clip-path="url(#cb)"><rect width="48" height="48" fill="#FFB3CB"/>${inner}</g><path d="M8 26c0-11 8-18 17-18s15 7 15 16-6 16-16 16S8 35 8 26z" fill="none" stroke="${INK}" stroke-width="3"/></svg>`;
const PAT_SVG = {
  solid: blob(''),
  gradient: blob('<rect y="24" width="48" height="24" fill="#FF7A9C"/><rect y="18" width="48" height="8" fill="#FF94B2"/>'),
  spots: blob('<circle cx="17" cy="20" r="4" fill="#7A3E6E"/><circle cx="30" cy="28" r="5" fill="#7A3E6E"/><circle cx="19" cy="33" r="3" fill="#7A3E6E"/><circle cx="31" cy="15" r="3" fill="#7A3E6E"/>'),
  stripes: blob('<path d="M14 4v44M22 4v44M30 4v44M38 4v44" stroke="#7A3E6E" stroke-width="4"/>'),
  scales: blob('<path d="M8 20a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0M4 28a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0M8 36a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0a4 4 0 0 1 8 0" fill="none" stroke="#7A3E6E" stroke-width="2.5"/>'),
  speckles: blob([[14, 18], [22, 14], [30, 20], [18, 26], [26, 28], [34, 30], [16, 34], [24, 36], [32, 38], [12, 26], [36, 18]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#7A3E6E"/>`).join('')),
  patches: blob('<path d="M10 14c6-2 10 2 9 7s-8 6-11 2-2-8 2-9zM27 25c5-3 11 0 11 5s-6 8-10 5-5-7-1-10z" fill="#7A3E6E"/>'),
  saddle: blob('<rect x="18" width="12" height="48" fill="#7A3E6E"/>'),
  rosettes: blob('<circle cx="18" cy="20" r="5" fill="none" stroke="#7A3E6E" stroke-width="3"/><circle cx="30" cy="30" r="5" fill="none" stroke="#7A3E6E" stroke-width="3"/><circle cx="17" cy="34" r="3.5" fill="none" stroke="#7A3E6E" stroke-width="2.5"/>'),
  bands: blob('<path d="M4 18h40M4 32h40" stroke="#7A3E6E" stroke-width="6"/>'),
};
const SIZE_SVG = (r) => `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="${r}" fill="#FFD23F" stroke="${INK}" stroke-width="3"/></svg>`;
const MASK_SVG = (m) => {
  const body = '<path d="M6 28c0-8 8-14 18-14s18 6 18 14-8 10-18 10S6 36 6 28z" fill="#FFF1D6" stroke="' + INK + '" stroke-width="3"/>';
  const hi = { all: '<path d="M6 28c0-8 8-14 18-14s18 6 18 14-8 10-18 10S6 36 6 28z" fill="#FF7A59"/>', back: '<path d="M8 24c3-6 9-9 16-9s13 3 16 9z" fill="#FF7A59"/>', belly: '<path d="M8 32c4 4 9 6 16 6s12-2 16-6z" fill="#FF7A59"/>', limbs: '<rect x="12" y="36" width="5" height="9" rx="2" fill="#FF7A59" stroke="' + INK + '" stroke-width="2.5"/><rect x="31" y="36" width="5" height="9" rx="2" fill="#FF7A59" stroke="' + INK + '" stroke-width="2.5"/>', head: '<circle cx="36" cy="22" r="7" fill="#FF7A59"/>' }[m];
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${m === 'limbs' ? body + hi : body + hi + '<path d="M6 28c0-8 8-14 18-14s18 6 18 14-8 10-18 10S6 36 6 28z" fill="none" stroke="' + INK + '" stroke-width="3"/>'}</svg>`;
};
const SKIN_SVG = (k) => {
  const tex = { smooth: '', bumpy: '<circle cx="18" cy="20" r="3" fill="#fff" opacity=".7"/><circle cx="28" cy="26" r="3" fill="#fff" opacity=".7"/><circle cx="20" cy="31" r="2.5" fill="#fff" opacity=".7"/>', scaly: '<path d="M12 22a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0M14 29a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0" fill="none" stroke="' + INK + '" stroke-width="2"/>', leathery: '<path d="M14 20l6 4 6-3 6 5M14 30l7-2 5 4 7-3" fill="none" stroke="' + INK + '" stroke-width="2"/>', fuzzy: '<path d="M10 16l-3-3M16 11l-1-4M24 10V6M32 11l1-4M38 16l3-3" stroke="' + INK + '" stroke-width="2.5"/>' }[k];
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="25" r="15" fill="#9BD8FF" stroke="${INK}" stroke-width="3"/>${tex}</svg>`;
};

// lighter/darker and more/less saturated steps of a colour, never darker than #3D3A4B
function fan(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(...c), mn = Math.min(...c), l = (mx + mn) / 2, d = mx - mn;
  let hh = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); hh = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
  const hsl = (H, S, L) => { S = Math.max(0, Math.min(1, S)); L = Math.max(0.27, Math.min(0.94, L)); const C = (1 - Math.abs(2 * L - 1)) * S, X = C * (1 - Math.abs(((H / 60) % 2) - 1)), m = L - C / 2; const [r, g, b] = H < 60 ? [C, X, 0] : H < 120 ? [X, C, 0] : H < 180 ? [0, C, X] : H < 240 ? [0, X, C] : H < 300 ? [X, 0, C] : [C, 0, X]; return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join(''); };
  return [hsl(hh, s, l + 0.24), hsl(hh, s, l + 0.12), hsl(hh, s, l - 0.12), hsl(hh, s, l - 0.2), hsl(hh, s, l + 0.06), hsl(hh, s + 0.25, l), hsl(hh, s - 0.3, l)];
}

export function createPaintPanel(H) {
  const el = h('aside', 'paintpanel paint-only', { 'aria-label': 'Colours' });
  let paint = null, layer = 'base';
  const btn = (cls, label, html) => { const b = h('button', `btn ${cls}`, { type: 'button', 'aria-label': label }, html); return b; };
  // layer cards
  const layers = h('div', 'layers');
  const layerBtn = {};
  for (const L of ['base', 'coat', 'detail']) {
    const b = btn('layer', { base: 'Base layer', coat: 'Coat layer', detail: 'Detail layer' }[L], `<span class="lsw"></span><span class="lpat"></span>`);
    b.dataset.layer = L; b.onclick = () => { layer = L; sync(); };
    layers.appendChild(b); layerBtn[L] = b;
  }
  el.appendChild(layers);
  // swatches
  const sw = h('div', 'swatches');
  const swBtn = {};
  for (const c of SWATCHES) {
    const b = h('button', 'swatch', { 'aria-label': `Colour ${c}`, type: 'button' });
    b.style.setProperty('--c', c); b.dataset.c = c.toLowerCase(); swBtn[c.toLowerCase()] = b;
    let hold = null, fanned = false;
    b.addEventListener('pointerdown', (e) => {
      fanned = false;
      if (e.pointerType !== 'mouse') H.onPreview({ layer, c: c.toLowerCase() });
      hold = setTimeout(() => { fanned = true; openFan(b, c); }, 450);
    });
    const end = () => clearTimeout(hold);
    b.addEventListener('pointerup', (e) => { end(); if (!fanned) apply({ c: c.toLowerCase() }); });
    b.addEventListener('pointerleave', (e) => { end(); if (e.pointerType === 'mouse') H.onPreview(null); });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') H.onPreview({ layer, c: c.toLowerCase() }); });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); end(); fanned = true; openFan(b, c); });
    sw.appendChild(b);
  }
  el.appendChild(sw);
  // fan of 7 steps
  const fanEl = h('div', 'fan', { role: 'menu', 'aria-label': 'Shades' });
  document.body.appendChild(fanEl);
  function openFan(anchor, c) {
    fanEl.innerHTML = '';
    const r = anchor.getBoundingClientRect();
    fan(c).forEach((fc, i) => {
      const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 0.9, R = 66;
      const b = h('button', 'swatch fanned', { type: 'button', 'aria-label': `Colour ${fc}`, role: 'menuitem' });
      b.style.setProperty('--c', fc); b.dataset.c = fc;
      b.style.left = `${r.left + r.width / 2 + Math.cos(a) * R - 24}px`; b.style.top = `${r.top + r.height / 2 + Math.sin(a) * R - 24}px`;
      b.onclick = (e) => { e.stopPropagation(); closeFan(); apply({ c: fc }); };
      fanEl.appendChild(b);
    });
    fanEl.classList.add('on');
  }
  function closeFan() { fanEl.classList.remove('on'); fanEl.innerHTML = ''; }
  addEventListener('pointerdown', (e) => { if (fanEl.classList.contains('on') && !fanEl.contains(e.target)) closeFan(); }, true);
  // patterns, sizes, masks
  const pats = h('div', 'patterns');
  const patBtn = {};
  PATTERN_IDS.forEach((p, i) => { const b = btn('pat', `Pattern ${i}`, PAT_SVG[p]); b.dataset.pat = p; b.onclick = () => apply({ pat: p }); pats.appendChild(b); patBtn[p] = b; });
  el.appendChild(pats);
  const row = h('div', 'chiprow');
  const sizeBtn = {};
  for (const [k, v] of SIZES) { const b = btn('chip', `Size ${v}`, SIZE_SVG(k === 'S' ? 7 : k === 'M' ? 12 : 17)); b.dataset.size = k; b.onclick = () => apply({ sc: v }); row.appendChild(b); sizeBtn[k] = b; }
  const maskBtn = {};
  for (const m of MASK_IDS) { const b = btn('chip mask', `Where ${m}`, MASK_SVG(m)); b.dataset.mask = m; b.onclick = () => apply({ mask: m }); row.appendChild(b); maskBtn[m] = b; }
  el.appendChild(row);
  // skin types and dice
  const row2 = h('div', 'chiprow');
  const skinBtn = {};
  for (const k of SKIN_IDS) { const b = btn('chip skin', `Skin ${k}`, SKIN_SVG(k)); b.dataset.skin = k; b.onclick = () => H.onPaint({ op: 'paint.skin', args: { skin: k } }); row2.appendChild(b); skinBtn[k] = b; }
  const dice = btn('chip dice', 'Surprise paint', icon('swatchDice')); dice.onclick = () => H.onDice();
  row2.appendChild(dice);
  const like = btn('chip like', 'Paint like another creature', icon('gallery')); like.onclick = () => H.onPaintLike && H.onPaintLike();
  row2.appendChild(like);
  el.appendChild(row2);
  // emote strip (shown in Paint, under where the stats sit)
  const strip = h('div', 'emote-strip paint-only', { 'aria-label': 'Moves' });
  const emoBtn = {};
  for (const e of EMOTES) { const b = btn('round emo', e, icon(e)); b.onclick = () => H.onEmote(e); strip.appendChild(b); emoBtn[e] = b; }

  function apply(vals) {
    // coat and detail start invisible (amt 0): picking anything for them makes them show
    const cur = paint ? paint[layer] : {};
    const extra = layer !== 'base' && !(cur.amt > 0) ? { amt: 0.6 } : {};
    H.onPaint({ op: 'paint.layer', args: { layer, ...vals, ...extra } });
  }
  function sync() {
    if (!paint) return;
    for (const [L, b] of Object.entries(layerBtn)) { b.setAttribute('aria-pressed', L === layer ? 'true' : 'false'); b.querySelector('.lsw').style.background = paint[L].c; b.querySelector('.lpat').innerHTML = PAT_SVG[paint[L].pat] || ''; }
    const P = paint[layer];
    for (const [c, b] of Object.entries(swBtn)) b.setAttribute('aria-pressed', c === String(P.c).toLowerCase() ? 'true' : 'false');
    for (const [p, b] of Object.entries(patBtn)) b.setAttribute('aria-pressed', p === P.pat ? 'true' : 'false');
    for (const [k, b] of Object.entries(sizeBtn)) b.setAttribute('aria-pressed', (P.sc ?? 1) === Object.fromEntries(SIZES)[k] ? 'true' : 'false');
    for (const [m, b] of Object.entries(maskBtn)) { b.setAttribute('aria-pressed', m === (P.mask || 'all') ? 'true' : 'false'); b.style.display = layer === 'base' ? 'none' : ''; }
    for (const [k, b] of Object.entries(skinBtn)) b.setAttribute('aria-pressed', k === paint.skin ? 'true' : 'false');
  }
  function set(p) { paint = p; sync(); }
  function where(key) {
    let e = null;
    if (key.startsWith('layer:')) e = layerBtn[key.slice(6)];
    else if (key.startsWith('swatch:')) e = swBtn[key.slice(7).toLowerCase()];
    else if (key.startsWith('pattern:')) e = patBtn[PATTERN_IDS[+key.slice(8)]] || patBtn[key.slice(8)];
    else if (key.startsWith('size:')) e = sizeBtn[key.slice(5)];
    else if (key.startsWith('mask:')) e = maskBtn[key.slice(5)];
    else if (key.startsWith('skintype:')) e = skinBtn[key.slice(9)];
    else if (key === 'dice') e = dice;
    else if (key === 'paintlike') e = like;
    else if (key.startsWith('emote:')) e = emoBtn[key.slice(6)];
    else if (key.startsWith('fan:')) e = fanEl.children[+key.slice(4)];
    return e;
  }
  return { el, strip, set, where, get layer() { return layer; }, setLayer: (L) => { layer = L; sync(); }, fanOpen: () => fanEl.classList.contains('on') };
}
