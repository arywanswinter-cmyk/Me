// hand.js — the white ghost hand (SVG, no words) that loops a gesture over a glowing target.
// Exports: HAND_SVG, createHand() -> { show({x, y, r, kind, toX, toY}), hide(), el }.
// Invariants: pointer-events none; one hand element for the whole app.
export const HAND_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 44c-4-3-9-9-10-13-1-3 2-5 4-3l4 4V9c0-2 1.5-3.5 3.5-3.5S22 7 22 9v11l1-.5c1.6-.8 3.3-.3 4 1l.4.8 1-.3c1.7-.5 3.3.4 3.8 1.9l.2.7.8-.1c1.8-.2 3.3 1.1 3.3 2.9V33c0 5-3 9-6 11z" fill="#fff" stroke="#3A2E5C" stroke-width="3" stroke-linejoin="round"/><ellipse cx="17" cy="11" rx="2" ry="3" fill="#fff" opacity=".6"/></svg>';

export function createHand(root = document.body) {
  const el = document.createElement('div');
  el.className = 'ghost-hand';
  el.innerHTML = HAND_SVG;
  const ring = document.createElement('div');
  ring.className = 'glow-ring';
  root.appendChild(ring); root.appendChild(el);
  let anim = null;
  function show({ x, y, r = 36, kind = 'tap', toX, toY }) {
    el.classList.add('on'); ring.classList.add('on');
    el.classList.toggle('tap', kind === 'tap');
    ring.style.left = `${x - r}px`; ring.style.top = `${y - r}px`; ring.style.width = ring.style.height = `${2 * r}px`;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    if (anim) { anim.cancel(); anim = null; }
    if (kind === 'drag' && el.animate) {
      anim = el.animate([
        { transform: 'translate(-22px,-6px) scale(1)', offset: 0 },
        { transform: 'translate(-22px,-6px) scale(0.9)', offset: 0.15 },
        { transform: `translate(${toX - x - 22}px,${toY - y - 6}px) scale(0.9)`, offset: 0.75 },
        { transform: `translate(${toX - x - 22}px,${toY - y - 6}px) scale(1)`, offset: 0.9, opacity: 1 },
        { transform: `translate(${toX - x - 22}px,${toY - y - 6}px) scale(1)`, offset: 1, opacity: 0 },
      ], { duration: 1600, iterations: Infinity });
    }
  }
  function hide() { el.classList.remove('on'); ring.classList.remove('on'); if (anim) { anim.cancel(); anim = null; } }
  return { show, hide, el, ring };
}
