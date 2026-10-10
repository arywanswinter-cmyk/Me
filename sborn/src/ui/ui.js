// ui.js — the DOM interface: tabs, category rail and drawer of cards, DNA pill, complexity jar, corner buttons, paint swatches, play bar.
// Exports: SWATCHES, DRAWER, createUI(handlers) -> { root, setMode(m), setBudget(cur, ghost), setLocks(fn), cardEl(id), where(key), setMuted(b),
//          setMirror(b), shakePill(), setThumb(id, canvas), drawer, setUndo(canUndo, canRedo) }.
// Invariants: icon-first, the only text is numbers and the creature's name; every control ≥ 44×44 px with an aria-label;
//   nothing hover-only; cards that no longer fit dim with a padlock but stay visible.
import { icon } from './icons.js';

export const SWATCHES = ['#FF8FB1', '#FF7A6B', '#FF9F43', '#FFD23F', '#B5E655', '#5CC86F', '#4FD1B5', '#2BB3C0', '#5BB8FF', '#6C8CFF', '#9B7BFF', '#D17BFF', '#FFF1D6', '#E8C995', '#9C6B4E', '#7A3E6E', '#6E8B3D', '#3D3A4B'];
import { PARTS } from '../catalog/parts.js';
const ids = (g) => PARTS.filter((d) => d.group === g).map((d) => d.id);
export const DRAWER = [
  { key: 'legs', label: 'Legs', cards: [{ id: 'readyLeg', kind: 'readyLeg', label: 'Ready leg' }, { id: 'bendy', kind: 'bendy', label: 'Bendy limb' }, ...ids('foot')] },
  { key: 'arms', label: 'Arms', cards: [{ id: 'readyArm', kind: 'readyArm', label: 'Ready arm' }, ...ids('hand')] },
  { key: 'mouths', label: 'Mouths', cards: ids('mouth') },
  { key: 'eyes', label: 'Eyes', cards: ids('eye') },
  { key: 'wings', label: 'Wings', cards: ids('wing') },
  { key: 'tails', label: 'Tails', cards: ids('tail') },
  { key: 'fins', label: 'Fins', cards: ids('fin') },
  { key: 'details', label: 'Details', cards: ids('det') },
];

const h = (tag, cls, attrs = {}, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (html) e.innerHTML = html; return e; };
const btn = (cls, label, ic) => { const b = h('button', `btn ${cls}`, { 'aria-label': label, type: 'button' }, icon(ic)); return b; };

export function createUI(H, { partDefs = {} } = {}) {
  const root = document.getElementById('ui');
  root.innerHTML = '';
  // ---- tabs ----
  const tabs = h('nav', 'tabs', { 'aria-label': 'Modes' });
  const tabBtns = {};
  for (const [m, lab] of [['build', 'Build'], ['paint', 'Paint'], ['play', 'Play']]) {
    const b = btn('tab', lab, m); b.dataset.mode = m; b.onclick = () => H.onTab && H.onTab(m);
    tabs.appendChild(b); tabBtns[m] = b;
  }
  root.appendChild(tabs);
  // ---- left: rail + drawer ----
  const left = h('aside', 'left build-only');
  const meters = h('div', 'meters');
  const pill = h('div', 'pill', { role: 'img', 'aria-label': 'DNA' });
  pill.innerHTML = `<span class="helix">${icon('helix')}</span><span class="odo" aria-hidden="true">0</span><span class="ghost" aria-hidden="true"></span><span class="bar"><i></i></span>`;
  const jar = h('div', 'jar', { role: 'img', 'aria-label': 'Complexity' });
  for (let i = 0; i < 10; i++) jar.appendChild(h('i', 'bead'));
  meters.appendChild(pill); meters.appendChild(jar);
  const rail = h('div', 'rail', { role: 'tablist', 'aria-label': 'Part kinds' });
  const drawer = h('div', 'drawer', { 'aria-label': 'Parts' });
  const cards = {};
  const sections = {};
  for (const cat of DRAWER) {
    const rb = btn('cat', cat.label, cat.key); rb.dataset.cat = cat.key;
    rb.onclick = () => { const s = sections[cat.key]; if (s) drawer.scrollTo({ top: s.offsetTop - drawer.offsetTop, behavior: 'auto' }); for (const x of rail.children) x.classList.toggle('on', x === rb); };
    rail.appendChild(rb);
    const sec = h('section', 'sec'); sec.dataset.cat = cat.key; sections[cat.key] = sec;
    sec.appendChild(h('div', 'sec-head', { 'aria-hidden': 'true' }, icon(cat.key)));
    for (const c of cat.cards) {
      const id = typeof c === 'string' ? c : c.id;
      const kind = typeof c === 'string' ? 'part' : c.kind;
      const label = typeof c === 'string' ? (partDefs[c] ? partDefs[c].name : c) : c.label;
      const card = h('div', 'card', { role: 'button', tabindex: '0', 'aria-label': label });
      card.dataset.card = id; card.dataset.kind = kind;
      card.innerHTML = `<span class="thumb">${kind === 'part' ? icon(cat.key) : icon(id)}</span><span class="lock">${icon('lock')}</span>`;
      card.addEventListener('pointerdown', (e) => H.onCardDown && H.onCardDown({ id, kind, el: card }, e));
      card.addEventListener('contextmenu', (e) => e.preventDefault());
      sec.appendChild(card);
      cards[id] = card;
    }
    drawer.appendChild(sec);
  }
  if (rail.firstChild) rail.firstChild.classList.add('on');
  left.appendChild(meters);
  const lr = h('div', 'leftrow'); lr.appendChild(rail); lr.appendChild(drawer); left.appendChild(lr);
  root.appendChild(left);
  // ---- corners ----
  const tl = h('div', 'corner tl');
  const gal = btn('round', 'Gallery', 'gallery'); gal.onclick = () => H.onGallery && H.onGallery();
  tl.appendChild(gal);
  const nameTag = h('div', 'name-tag', { 'aria-live': 'polite' });
  tl.appendChild(nameTag);
  root.appendChild(tl);
  const tr = h('div', 'corner tr');
  const nw = btn('round build-only', 'New creature', 'new'); nw.onclick = () => H.onNew && H.onNew();
  const share = btn('round', 'Share', 'share'); share.onclick = () => H.onShare && H.onShare();
  const mute = btn('round', 'Sound on or off', 'sound'); mute.onclick = () => H.onMute && H.onMute();
  tr.appendChild(nw); tr.appendChild(share); tr.appendChild(mute);
  root.appendChild(tr);
  const bl = h('div', 'corner bl edit-only');
  const undo = btn('big', 'Undo', 'undo'); undo.onclick = () => H.onUndo && H.onUndo();
  const redo = btn('big', 'Redo', 'redo'); redo.onclick = () => H.onRedo && H.onRedo();
  bl.appendChild(undo); bl.appendChild(redo);
  root.appendChild(bl);
  const br = h('div', 'corner br build-only');
  const mir = btn('big', 'Mirror on or off', 'mirror'); mir.onclick = () => H.onMirror && H.onMirror();
  br.appendChild(mir);
  root.appendChild(br);
  // ---- paint panel (base colour for now) ----
  const paint = h('aside', 'paintpanel paint-only', { 'aria-label': 'Colours' });
  const sw = h('div', 'swatches');
  for (const c of SWATCHES) {
    const b = h('button', 'swatch', { 'aria-label': `Colour ${c}`, type: 'button' });
    b.style.setProperty('--c', c); b.dataset.c = c.toLowerCase();
    b.onclick = () => H.onSwatch && H.onSwatch('base', c.toLowerCase());
    sw.appendChild(b);
  }
  paint.appendChild(sw);
  root.appendChild(paint);
  // ---- play bar (touch) ----
  const playbar = h('div', 'playbar play-only');
  const back = btn('big', 'Back to building', 'back'); back.onclick = () => H.onTab && H.onTab('build');
  const jump = btn('big', 'Jump', 'jump'); jump.onclick = () => H.onJump && H.onJump();
  playbar.appendChild(back); playbar.appendChild(jump);
  root.appendChild(playbar);
  // ---- drag ghost (a card image following the finger off-body) ----
  const ghost = h('div', 'drag-ghost', { 'aria-hidden': 'true' });
  document.body.appendChild(ghost);
  // ---- handles layer ----
  const handles = h('div', 'handles', { 'aria-hidden': 'true' });
  document.body.appendChild(handles);

  let lastDna = 0, odoT = null;
  function setBudget(cur, ghostCost = null) {
    const odo = pill.querySelector('.odo');
    if (cur.dna !== lastDna) {
      const from = lastDna, to = cur.dna, t0 = performance.now();
      cancelAnimationFrame(odoT);
      const tick = () => { const k = Math.min(1, (performance.now() - t0) / 260); const e = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2); odo.textContent = String(Math.round(from + (to - from) * Math.min(1, e))); if (k < 1) odoT = requestAnimationFrame(tick); else odo.textContent = String(to); };
      odo.textContent = String(to); if (!document.hidden) odoT = requestAnimationFrame(tick);
      pill.querySelector('.helix').classList.remove('spin'); void pill.offsetWidth; pill.querySelector('.helix').classList.add('spin');
      lastDna = to;
    }
    pill.querySelector('.bar i').style.width = `${Math.min(100, (cur.dna / 2000) * 100)}%`;
    pill.classList.toggle('full', cur.dna >= 2000);
    pill.querySelector('.ghost').textContent = ghostCost ? `−${ghostCost.dna}` : '';
    const beads = jar.children, filled = Math.min(10, Math.ceil(cur.cx / 10 - 1e-9)), gh = ghostCost ? Math.min(10, Math.ceil((cur.cx + ghostCost.cx) / 10 - 1e-9)) : filled;
    for (let i = 0; i < 10; i++) { beads[i].classList.toggle('on', i < filled); beads[i].classList.toggle('ghost', i >= filled && i < gh); beads[i].style.setProperty('--k', i / 9); }
    jar.classList.toggle('full', cur.cx >= 100);
  }
  function setLocks(isLocked) { for (const [id, el] of Object.entries(cards)) { const L = isLocked(id); el.classList.toggle('locked', L); el.setAttribute('aria-disabled', L ? 'true' : 'false'); } }
  function shakePill() { for (const el of [pill, jar]) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } }
  function setMode(m) {
    document.body.dataset.mode = m;
    for (const [k, b] of Object.entries(tabBtns)) b.setAttribute('aria-pressed', k === m ? 'true' : 'false');
  }
  function setMuted(b) { mute.innerHTML = icon(b ? 'mute' : 'sound'); mute.setAttribute('aria-pressed', b ? 'true' : 'false'); }
  function setMirror(b) { mir.innerHTML = icon(b ? 'mirror' : 'mirrorOff'); mir.setAttribute('aria-pressed', b ? 'true' : 'false'); }
  function setUndo(cu, cr) { undo.disabled = !cu; redo.disabled = !cr; }
  function setName(n) { nameTag.textContent = n; }
  function setThumb(id, src) { const c = cards[id]; if (!c) return; const t = c.querySelector('.thumb'); t.innerHTML = ''; const img = new Image(); img.alt = ''; img.src = src; img.draggable = false; t.appendChild(img); }
  function where(key) {
    let el = null;
    if (key.startsWith('card:')) { const id = key.slice(5); el = cards[id === 'limb.bendy' ? 'bendy' : id === 'limb.leg' ? 'readyLeg' : id === 'limb.arm' ? 'readyArm' : id]; }
    else if (key.startsWith('tab:')) el = tabBtns[key.slice(4)];
    else if (key.startsWith('cat:')) el = rail.querySelector(`[data-cat="${key.slice(4)}"]`);
    else if (key.startsWith('swatch:')) el = sw.querySelector(`[data-c="${key.slice(7).toLowerCase()}"]`);
    else if (key === 'undo') el = undo; else if (key === 'redo') el = redo; else if (key === 'mirror') el = mir; else if (key === 'mute') el = mute; else if (key === 'jump') el = jump; else if (key === 'back') el = back;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    let visible = r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    if (key.startsWith('card:')) { const d = drawer.getBoundingClientRect(); visible = visible && r.top >= d.top - 1 && r.bottom <= d.bottom + 1 && r.left >= d.left - 1 && r.right <= d.right + 1; }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.min(r.width, r.height) / 2, visible };
  }
  return { root, setMode, setBudget, setLocks, shakePill, setMuted, setMirror, setUndo, setName, setThumb, where, cards, drawer, ghost, handles, pill, jar, sections };
}
