// gallery.js — the gallery shelf (8 starters on top, saved creatures with spinning turntables), the share menu (card,
//   link, 3D), the link bubble (✓ / ✗), PNG drops and the picture overlay for touch saves. Icons only, no words.
// Exports: createGallery(H) -> { el, open(), close(), refresh(), share: { el, toggle(), close() }, bubble(recipeStripBlob) -> Promise<bool>,
//          showPicture(url), shake(), where(key) }.
// Invariants: thumbnails are 2048×128 strips animated with CSS steps(16) at 8 fps; long-press (450 ms) offers bin or
//   duplicate; bin wobbles with ✓ / ✗ and a binned creature waits 10 s in an undo bubble at the end of the shelf;
//   every control is ≥ 44 px with an aria-label.
import { icon } from './icons.js';
import { HAND_SVG } from './hand.js';

export function createGallery(H) {
  const h = (tag, cls, attrs = {}, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (html) e.innerHTML = html; return e; };
  const btn = (cls, label, ic) => h('button', `btn ${cls}`, { type: 'button', 'aria-label': label }, ic ? icon(ic) : '');
  const root = document.getElementById('ui');
  // ---- shelf ----
  const el = h('div', 'gallery gallery-only', { 'aria-label': 'Gallery' });
  const bar = h('div', 'gal-bar');
  const back = btn('round', 'Back to building', 'back'); back.onclick = () => H.onClose && H.onClose();
  const plus = btn('round', 'Add a picture', 'new');
  const file = h('input', '', { type: 'file', accept: 'image/png', 'aria-label': 'Picture file', style: 'display:none' });
  plus.onclick = () => file.click();
  file.onchange = async () => { const f = file.files && file.files[0]; file.value = ''; if (f && !(await H.importFile(f))) shake(); };
  bar.append(back, plus, file);
  const starters = h('div', 'shelf starters');
  const saved = h('div', 'shelf saved');
  el.append(bar, starters, saved);
  root.appendChild(el);
  const urls = [];
  const thumb = (blob) => {
    const t = h('div', 'spin', { 'aria-hidden': 'true' });
    if (blob) { const u = URL.createObjectURL(blob); urls.push(u); t.style.backgroundImage = `url(${u})`; t.dataset.strip = '1'; } else t.innerHTML = icon('new');
    return t;
  };
  let undoBubble = null, undoTimer = null;
  function card(entry, { starter = false } = {}) {
    const c = h('div', `gcard${starter ? ' starter' : ''}`, { role: 'button', tabindex: '0', 'aria-label': starter ? 'Starter creature' : 'Saved creature' });
    c.appendChild(thumb(entry.thumbStrip || null));
    let pressT = null, longed = false;
    c.addEventListener('pointerdown', () => { longed = false; if (starter) return; pressT = setTimeout(() => { longed = true; menu(c, entry); }, 450); });
    const cancel = () => { if (pressT) { clearTimeout(pressT); pressT = null; } };
    c.addEventListener('pointerup', cancel); c.addEventListener('pointerleave', cancel); c.addEventListener('pointercancel', cancel);
    c.addEventListener('click', () => { if (longed) return; if (starter) H.loadStarter(entry.key); else H.loadEntry(entry); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    return c;
  }
  function menu(c, entry) {
    closeMenus();
    const m = h('div', 'gmenu');
    const bin = btn('round', 'Throw away', 'cross'), dup = btn('round', 'Copy', 'card');
    bin.onclick = (e) => { e.stopPropagation(); m.remove(); confirmBin(c, entry); };
    dup.onclick = async (e) => { e.stopPropagation(); m.remove(); await H.duplicate(entry); refresh(); };
    m.append(bin, dup); c.appendChild(m);
  }
  function confirmBin(c, entry) {
    c.classList.add('wobble');
    const m = h('div', 'gmenu confirm');
    const yes = btn('round', 'Yes, throw away', 'check'), no = btn('round', 'No, keep it', 'cross');
    yes.onclick = async (e) => { e.stopPropagation(); const gone = await H.remove(entry.id); c.classList.add('shrink'); setTimeout(() => { refresh(); offerUndo(gone); }, 300); };
    no.onclick = (e) => { e.stopPropagation(); c.classList.remove('wobble'); m.remove(); };
    m.append(yes, no); c.appendChild(m);
  }
  function offerUndo(entry) {
    if (undoBubble) undoBubble.remove(); if (undoTimer) clearTimeout(undoTimer);
    undoBubble = btn('round undo-bubble', 'Bring it back', 'undo');
    undoBubble.onclick = async () => { await H.restore(entry); undoBubble.remove(); undoBubble = null; refresh(); };
    saved.appendChild(undoBubble);
    undoTimer = setTimeout(() => { if (undoBubble) { undoBubble.remove(); undoBubble = null; } }, 10000);
  }
  function closeMenus() { for (const m of el.querySelectorAll('.gmenu')) m.remove(); for (const c of el.querySelectorAll('.wobble')) c.classList.remove('wobble'); }
  let starterCards = null;
  async function refresh() {
    for (const u of urls.splice(0)) URL.revokeObjectURL(u);
    if (!starterCards) {
      starterCards = H.starters().map((s) => { const c = card({ key: s.key, thumbStrip: null }, { starter: true }); starters.appendChild(c); return { c, s }; });
      // starter strips render one at a time at quiet moments
      (async () => { for (const { c, s } of starterCards) { const b = await H.starterStrip(s.key); if (b) { const t = thumb(b); c.replaceChild(t, c.firstChild); } } })();
    }
    saved.innerHTML = '';
    const list = await H.entries();
    for (const e of list.slice(0, 200)) saved.appendChild(card(e));
    if (undoBubble) saved.appendChild(undoBubble);
  }
  function open() { refresh(); }
  function close() { closeMenus(); }
  function shake() { const t = document.getElementById('ui'); t.classList.remove('shake-all'); void t.offsetWidth; t.classList.add('shake-all'); }

  // ---- share menu ----
  const share = h('div', 'share-menu', { role: 'menu', 'aria-label': 'Share' });
  const sCard = btn('round', 'Creature card', 'card'), sLink = btn('round', 'Link', 'link'), s3d = btn('round', '3D file', 'cube');
  const linkBox = h('input', 'link-box', { type: 'text', readonly: 'readonly', 'aria-label': 'Link', style: 'display:none' });
  const okPop = h('div', 'share-ok', { 'aria-hidden': 'true' }, icon('check'));
  sCard.onclick = () => H.share('card'); s3d.onclick = () => H.share('glb');
  sLink.onclick = async () => {
    const url = await H.share('link');
    try { if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard'); await navigator.clipboard.writeText(url); linkBox.style.display = 'none'; okPop.classList.remove('pop'); void okPop.offsetWidth; okPop.classList.add('pop'); }
    catch { linkBox.value = url; linkBox.style.display = 'block'; linkBox.focus(); linkBox.select(); }
  };
  share.append(sCard, sLink, s3d, linkBox, okPop);
  root.appendChild(share);
  const shareApi = { el: share, toggle() { share.classList.toggle('on'); if (!share.classList.contains('on')) linkBox.style.display = 'none'; }, close() { share.classList.remove('on'); linkBox.style.display = 'none'; } };

  // ---- link bubble: the creature spinning in a bubble with ✓ and ✗ ----
  function bubble(stripBlob) {
    return new Promise((resolve) => {
      const b = h('div', 'link-bubble', { role: 'dialog', 'aria-label': 'A creature for you' });
      const ball = h('div', 'ball'); ball.appendChild(thumb(stripBlob));
      const yes = btn('round big', 'Keep it', 'check'), no = btn('round big', 'No thanks', 'cross');
      const row = h('div', 'yn'); row.append(yes, no);
      b.append(ball, row); document.body.appendChild(b);
      const done = (v) => { b.remove(); resolve(v); };
      yes.onclick = () => done(true); no.onclick = () => done(false);
    });
  }
  // ---- picture overlay for touch saves (press and hold → Save to Photos) ----
  const pic = h('div', 'photo-overlay pic', { 'aria-hidden': 'true' });
  const pImg = h('img', '', { alt: '' }), pHand = h('div', 'press-hand', {}, HAND_SVG), pOk = btn('round', 'Done', 'check');
  pOk.onclick = () => { pic.style.display = 'none'; };
  pic.append(pImg, pHand, pOk); document.body.appendChild(pic);
  function showPicture(url) { pImg.src = url; pic.style.display = 'grid'; }

  // ---- PNG drops anywhere ----
  document.addEventListener('dragover', (e) => { if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', async (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    if (!(await H.importFile(f))) shake();
  });
  function where(key) {
    if (key === 'gallery:back') return back; if (key === 'gallery:plus') return plus;
    if (key === 'share:card') return sCard; if (key === 'share:link') return sLink; if (key === 'share:glb') return s3d;
    if (key.startsWith('gallery:starter:')) return starterCards && starterCards[+key.split(':')[2]] ? starterCards[+key.split(':')[2]].c : null;
    if (key.startsWith('gallery:saved:')) return saved.querySelectorAll('.gcard')[+key.split(':')[2]] || null;
    return null;
  }
  return { el, open, close, refresh, share: shareApi, bubble, showPicture, shake, where, linkBox };
}
