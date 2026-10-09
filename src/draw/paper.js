// paper.js — the drawing sheet: pointer drawing, pens, sizes, undo, samples.
// Exports: PENS [[name, hex]], SIZES [px], createPaper(canvas, { onChange }) -> controller.
// Invariants: strokes are stored in CSS pixels as { color, w, pts: [[x, y]] }; one active pointer at a time;
//   getStrokes() returns a deep copy so the 3D pipeline can never mutate the drawing.
export const PENS = [
  ['Coral', '#F05A4F'], ['Sun', '#F7C948'], ['Sky', '#63B8D9'], ['Lime', '#9BD56A'],
  ['Lilac', '#C98BE0'], ['Tangerine', '#FF8C42'], ['Blush', '#F2A6A0'], ['Ink', '#3A3630'],
];
export const SIZES = [6, 11, 18];

export function createPaper(canvas, { onChange = () => {} } = {}) {
  const ctx = canvas.getContext('2d');
  let dpr = 1, strokes = [], cur = null, active = null;
  let pen = PENS[0][1], size = SIZES[1];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    redraw();
  }
  function drawStroke(s) {
    const p = s.pts;
    ctx.strokeStyle = ctx.fillStyle = s.color;
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], s.w / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.lineWidth = s.w;
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
    }
    const l = p[p.length - 1];
    ctx.lineTo(l[0], l[1]);
    ctx.stroke();
  }
  function redraw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const s of strokes) drawStroke(s);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (active !== null) return;
    active = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? 0.6 + e.pressure * 0.8 : 1;
    cur = { color: pen, w: size * pressure, pts: [[e.clientX, e.clientY]] };
    strokes.push(cur);
    redraw(); onChange();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== active || !cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const l = cur.pts[cur.pts.length - 1], dx = ev.clientX - l[0], dy = ev.clientY - l[1];
      if (dx * dx + dy * dy >= 2.25) cur.pts.push([ev.clientX, ev.clientY]);
    }
    redraw();
  });
  const end = (e) => { if (e.pointerId !== active) return; active = null; cur = null; onChange(); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  addEventListener('resize', resize);
  resize();

  return {
    get count() { return strokes.length; },
    getStrokes: () => strokes.map((s) => ({ color: s.color, w: s.w, pts: s.pts.map((p) => p.slice()) })),
    setPen(c) { pen = c; },
    setSize(w) { size = w; },
    undo() { strokes.pop(); redraw(); onChange(); },
    clear() { strokes = []; redraw(); onChange(); },
    bbox() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of strokes) for (const p of s.pts) {
        x0 = Math.min(x0, p[0] - s.w / 2); y0 = Math.min(y0, p[1] - s.w / 2);
        x1 = Math.max(x1, p[0] + s.w / 2); y1 = Math.max(y1, p[1] + s.w / 2);
      }
      return { x0, y0, x1, y1 };
    },
    loadSample(sample) {
      const W = innerWidth, H = innerHeight, sc = Math.min(W * 0.8, H * 0.6) / 1000;
      const ox = W / 2 - 500 * sc, oy = H * 0.46 - 500 * sc;
      strokes = sample.strokes.map((s) => ({ color: sample.pen, w: Math.max(5, s.w * sc * 1.1), pts: s.pts.map((p) => [ox + p[0] * sc, oy + p[1] * sc]) }));
      redraw(); onChange();
    },
  };
}
