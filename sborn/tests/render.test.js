// render.test.js — vendored addons import in the browser; tier boot guess, calibration and governor rules.
// Exports: nothing (registers tests).
// Invariants: no rendering needed except where noted.
import { test, ok } from './harness.js';
import { bootGuess, calibrate, createGovernor } from '../src/render/tiers.js';

const ADDONS = ['postprocessing/Pass.js', 'postprocessing/UnrealBloomPass.js', 'postprocessing/GTAOPass.js', 'shaders/CopyShader.js',
  'shaders/LuminosityHighPassShader.js', 'shaders/GTAOShader.js', 'shaders/PoissonDenoiseShader.js', 'math/SimplexNoise.js',
  'exporters/GLTFExporter.js', 'loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'environments/RoomEnvironment.js'];
test('C05.addons-import', 'every vendored addon imports in the browser', { milestone: 0, items: [5] }, async () => {
  for (const a of ADDONS) { const m = await import(`three/addons/${a}`); ok(Object.keys(m).length > 0, `${a} exports nothing`); }
  return `${ADDONS.length} addons`;
});

test('C65.boot-guess', 'boot guess: iPad Pro, small iPad, Mac, Linux', { milestone: 3, items: [65] }, () => {
  ok(bootGuess({ ua: 'iPad', screenW: 1024, screenH: 1366, dpr: 2 }) === 'medium', 'iPad Pro → medium');
  ok(bootGuess({ ua: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5, screenW: 1180, screenH: 820, dpr: 2 }) === 'medium', 'iPadOS desktop UA 2360×1640 → medium');
  ok(bootGuess({ ua: 'iPad', screenW: 810, screenH: 1080, dpr: 2 }) === 'low', 'small iPad → low');
  ok(bootGuess({ ua: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }) === 'high', 'Mac → high');
  ok(bootGuess({ ua: 'X11; Linux x86_64', platform: 'Linux x86_64' }) === 'medium', 'Linux → medium');
  ok(bootGuess({ ua: 'Mac', platform: 'MacIntel', halfFloat: false }) === 'low', 'no half float → low');
});
const frames = (ms, n) => Array.from({ length: n }, () => ms);
test('C65.calibrate', 'calibration: p90 > 17.5 drops, median < 9 at Medium tries High', { milestone: 3, items: [65] }, () => {
  ok(calibrate(frames(20, 90), 'high').tier === 'medium', 'drop high→medium');
  ok(calibrate(frames(20, 90), 'high').retest === 60, 'retest 60');
  ok(calibrate(frames(8, 90), 'medium').tier === 'high', 'median 8 → try high');
  ok(calibrate(frames(12, 90), 'medium').tier === 'medium', 'stay medium');
  ok(calibrate(frames(20, 90), 'low').tier === 'low', 'never below low');
});
test('C65.governor', 'governor: scale floor 0.7, drop tier, one upgrade after 20 s, no mid-drag switch, ≤ 6 changes, 30 Hz floor', { milestone: 3, items: [65] }, () => {
  const feed = (g, ms, seconds, opt = {}) => { const out = []; for (let t = 0; t < seconds * 1000; t += ms) { const c = g.frame(ms, opt); if (c) out.push(c); } return out; };
  let g = createGovernor({ tier: 'high' });
  const ch = feed(g, 25, 40);
  ok(ch[0].scale === 0.9 && ch[1].scale === 0.8 && ch[2].scale === 0.7, `scale steps ${JSON.stringify(ch.slice(0, 3))}`);
  ok(ch[3] && ch[3].tier === 'medium', `then tier drop ${JSON.stringify(ch[3])}`);
  g = createGovernor({ tier: 'high' });
  ok(feed(g, 25, 40, { dragging: true }).length === 0, 'no switch mid-drag');
  g = createGovernor({ tier: 'low' });
  const up = feed(g, 8, 60);
  ok(up.length === 1 && up[0].tier === 'medium', `one upgrade ${JSON.stringify(up)}`);
  g = createGovernor({ tier: 'high' });
  feed(g, 25, 200);
  ok(g.state.resChanges <= 6, `res changes ${g.state.resChanges}`);
  g = createGovernor({ tier: 'medium' });
  feed(g, 33.3, 200);
  ok(g.state.capped30 && g.state.tier === 'medium', `30 Hz: ${g.state.tier} capped ${g.state.capped30}`);
});
