// main.js — boots the app and runs the two modes: DRAW (paper) and LIFE (3D creature).
// Exports: nothing; exposes window.__dw for automation and tests.
// Invariants: building a creature never touches the drawing; the drawing survives "Edit drawing";
//   audio unlocks only inside the "Bring to life" gesture.
import { createPaper, PENS, SIZES } from './draw/paper.js';
import { SAMPLES, SAMPLE_ORDER } from './draw/samples.js';
import { buildCreature } from './geo/pipeline.js';
import { createStage } from './stage.js';
import { createCreature } from './creature/creature.js';
import { createVoice } from './creature/voice.js';
import { makeGrain } from './core/grain.js';
import { hashString } from './core/rng.js';

const $ = (id) => document.getElementById(id);
const debug = new URLSearchParams(location.search).has('debug');
const grain = makeGrain();
document.documentElement.style.setProperty('--grain', `url(${grain.css.toDataURL()})`);

const voice = createVoice();
let current = null, sampleIdx = 0, lastData = null;
const stage = createStage($('gl'), {
  onFirstBreath: () => current && voice.chirp(current.voiceArgs),
  onBoop: () => current && voice.chirp(current.voiceArgs),
  onCalled: () => current && voice.chirp(current.voiceArgs),
});
const paper = createPaper($('paper'), { onChange: refresh });

PENS.forEach(([name, hex], i) => {
  const b = document.createElement('button');
  b.className = 'pen'; b.style.background = hex;
  b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name); b.setAttribute('aria-checked', String(i === 0));
  b.onclick = () => { paper.setPen(hex); [...$('pens').children].forEach((x) => x.setAttribute('aria-checked', String(x === b))); };
  $('pens').appendChild(b);
});
SIZES.forEach((w, i) => {
  const b = document.createElement('button');
  b.className = 'size';
  b.setAttribute('role', 'radio'); b.setAttribute('aria-label', ['Thin', 'Medium', 'Thick'][i]); b.setAttribute('aria-checked', String(i === 1));
  b.innerHTML = `<i style="width:${w * 0.8 + 3}px;height:${w * 0.8 + 3}px"></i>`;
  b.onclick = () => { paper.setSize(w); [...$('sizes').children].forEach((x) => x.setAttribute('aria-checked', String(x === b))); };
  $('sizes').appendChild(b);
});

function refresh() {
  const has = paper.count > 0;
  $('hint').classList.toggle('gone', has);
  $('life').disabled = !has;
}
function setMode(m) { document.body.dataset.mode = m; }
function tooSmall() {
  $('hint').textContent = 'Draw a bit bigger!';
  $('hint').classList.remove('gone');
  $('paper').classList.remove('shake'); void $('paper').offsetWidth; $('paper').classList.add('shake');
  setTimeout(() => { $('hint').textContent = 'Draw anything'; refresh(); }, 1600);
}

function bringToLife() {
  if (!paper.count || document.body.dataset.mode === 'life') return;
  const box = paper.bbox();
  if (Math.max(box.x1 - box.x0, box.y1 - box.y0) < 40) { tooSmall(); return; }
  voice.unlock();
  const frac = Math.sqrt(((box.x1 - box.x0) * (box.y1 - box.y0)) / (innerWidth * innerHeight));
  const height = Math.min(2.0, Math.max(0.9, 0.8 + 1.4 * frac));
  const strokes = paper.getStrokes();
  const data = buildCreature(strokes, { height });
  if (!data) { tooSmall(); return; }
  lastData = data;
  const seed = hashString(strokes.map((s) => `${s.color}${s.pts.length}${Math.round(s.pts[0][0])}`).join('|'));
  const creature = createCreature(data, { color: data.color, seed });
  current = { creature, data, voiceArgs: { height, seed } };
  stage.setCreature(creature, data);
  stage.playBirth();
  setMode('life');
  if (debug) {
    const s = data.stats;
    $('stats').hidden = false;
    $('stats').textContent = `build ${s.ms.total.toFixed(0)} ms (mask ${s.ms.mask.toFixed(0)} · field ${s.ms.field.toFixed(0)} · mesh ${s.ms.nets.toFixed(0)} · smooth ${s.ms.smooth.toFixed(0)})\n${s.verts} verts · ${s.tris} tris\nfeet ${data.stub ? 'stub' : data.feet.length} · eyes ${data.eyes.length}${s.drawnEyes ? ' drawn' : ' auto'} · marks ${s.marks}`;
  }
}
function backToPaper(clearToo) {
  if (clearToo) paper.clear();
  setMode('draw');
  setTimeout(() => { if (document.body.dataset.mode === 'draw') { stage.clear(); current = null; } }, 450);
}

$('life').onclick = bringToLife;
$('undo').onclick = () => paper.undo();
$('clear').onclick = () => paper.clear();
$('edit').onclick = () => backToPaper(false);
$('again').onclick = () => backToPaper(true);
$('sample').onclick = () => { paper.loadSample(SAMPLES[SAMPLE_ORDER[sampleIdx++ % SAMPLE_ORDER.length]]); };
addEventListener('keydown', (e) => {
  if (e.key === 'Enter') bringToLife();
  else if (e.key === 'Escape' && document.body.dataset.mode === 'life') backToPaper(false);
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && document.body.dataset.mode === 'draw') { e.preventDefault(); paper.undo(); }
});
refresh();

window.__dw = {
  sample: (name) => paper.loadSample(SAMPLES[name]),
  life: bringToLife,
  back: () => backToPaper(false),
  data: () => lastData,
  stage,
};
