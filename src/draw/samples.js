// samples.js — built-in example doodles, authored in a 1000 x 1000 space.
// Exports: SAMPLES { name: { pen, strokes: [{ w, pts }] } }, SAMPLE_ORDER.
// Invariant: pure data, deterministic; used by "Try a sample" and by the tests.
const bez = (a, b, c, d, n = 28) => {
  const o = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    o.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]);
  }
  return o;
};
const join = (...segs) => segs.reduce((acc, s, i) => acc.concat(i ? s.slice(1) : s), []);
const polar = (cx, cy, f, n = 120, a0 = 0, a1 = Math.PI * 2) => {
  const o = [];
  for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n, r = f(t); o.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  return o;
};
const W = 16;

const potato = { pen: '#F05A4F', strokes: [
  { w: W, pts: join(bez([300, 420], [250, 300], [420, 220], [540, 250]), bez([540, 250], [700, 230], [800, 330], [770, 470]),
    bez([770, 470], [790, 580], [690, 650], [560, 640]), bez([560, 640], [430, 660], [300, 600], [300, 420])) },
  { w: W, pts: [[360, 630], [345, 790]] }, { w: W, pts: [[420, 645], [418, 795]] },
  { w: W, pts: [[600, 640], [612, 790]] }, { w: W, pts: [[680, 610], [705, 775]] },
  { w: W, pts: [[320, 790], [380, 790]] }, { w: W, pts: [[395, 795], [450, 795]] },
  { w: W, pts: [[590, 790], [645, 790]] }, { w: W, pts: [[685, 775], [740, 775]] },
  { w: W, pts: bez([770, 470], [830, 440], [880, 470], [900, 420], 14) },
  { w: W, pts: [[560, 250], [540, 150]] }, { w: W, pts: [[620, 255], [660, 160]] },
  { w: 40, pts: [[600, 360]] }, { w: 40, pts: [[690, 370]] },
  { w: 12, pts: bez([600, 450], [635, 490], [690, 480], [720, 440], 16) },
] };

const blob = { pen: '#C98BE0', strokes: [
  { w: W, pts: polar(500, 500, (t) => 300 + 26 * Math.sin(3 * t + 0.4) + 18 * Math.cos(5 * t)) },
] };

const star = { pen: '#F7C948', strokes: [
  { w: W, pts: Array.from({ length: 11 }, (_, k) => { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 165 : 390; return [500 + r * Math.cos(a), 520 + r * Math.sin(a)]; }) },
] };

const heart = { pen: '#F2A6A0', strokes: [
  { w: W, pts: Array.from({ length: 121 }, (_, i) => { const t = i / 120 * Math.PI * 2;
    return [500 + 22 * 16 * Math.sin(t) ** 3, 470 - 22 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]; }) },
] };

const tall = { pen: '#63B8D9', strokes: [
  { w: W, pts: polar(500, 400, (t) => 1 / Math.sqrt((Math.cos(t) / 150) ** 2 + (Math.sin(t) / 250) ** 2)) },
  { w: W, pts: [[445, 625], [425, 900]] }, { w: W, pts: [[555, 625], [575, 900]] },
  { w: W, pts: [[360, 420], [230, 570]] }, { w: W, pts: [[640, 420], [770, 570]] },
] };

const snake = { pen: '#9BD56A', strokes: [
  { w: 46, pts: join(bez([250, 250], [700, 150], [700, 450], [500, 500]), bez([500, 500], [300, 550], [300, 850], [750, 760])) },
] };

const octo = { pen: '#FF8C42', strokes: [
  { w: W, pts: polar(500, 380, (t) => 230 + 10 * Math.sin(4 * t)) },
  ...Array.from({ length: 6 }, (_, i) => {
    const x0 = 335 + i * 66, y0 = 380 + Math.sqrt(230 * 230 - (x0 - 500) ** 2) - 12, s = (i - 2.5) * 34;
    return { w: 22, pts: bez([x0, y0], [x0 + s - 40, y0 + 90], [x0 + s + 50, y0 + 170], [x0 + s * 1.6, 880], 20) };
  }),
] };

// Six legs: the insect tripod gait.
const beetle = { pen: '#63B8D9', strokes: [
  { w: W, pts: polar(500, 420, (t) => 1 / Math.sqrt((Math.cos(t) / 300) ** 2 + (Math.sin(t) / 185) ** 2)) },
  ...Array.from({ length: 6 }, (_, i) => {
    const x0 = 270 + i * 92, y0 = 420 + 185 * Math.sqrt(Math.max(0, 1 - ((x0 - 500) / 300) ** 2)) - 14, out = (i - 2.5) * 16;
    return { w: W, pts: [[x0, y0], [x0 + out * 0.5, y0 + 110], [x0 + out, 800]] };
  }),
] };

// Twelve legs: a wave ripples along the body like a centipede.
const centipede = { pen: '#FF8C42', strokes: [
  { w: W, pts: polar(500, 420, (t) => 1 / Math.sqrt((Math.cos(t) / 455) ** 2 + (Math.sin(t) / 140) ** 2), 160) },
  ...Array.from({ length: 12 }, (_, i) => {
    const x0 = 80 + i * 76.4, y0 = 420 + 140 * Math.sqrt(Math.max(0, 1 - ((x0 - 500) / 455) ** 2)) - 12;
    return { w: W, pts: [[x0, y0], [x0, Math.max(y0 + 90, 700)]] };
  }),
] };

export const SAMPLES = { potato, blob, octo, star, heart, tall, snake, beetle, centipede };
export const SAMPLE_ORDER = ['potato', 'blob', 'octo', 'beetle', 'centipede', 'star', 'heart', 'tall', 'snake'];
