// main.js — boots Sborn: feature checks, the stage, the hatch, the fixed-step loop and window.__sborn.
// Exports: nothing; exposes window.__sborn (automation, tests, user tools).
// Invariants: ?test renders only inside step()/settle() (no rAF loop); simulation runs at a fixed 60 Hz;
//   rendering pauses and audio suspends while the page is hidden.
import * as THREE from 'three';
import { createStage } from './render/stage.js';
import { createSky } from './render/sky.js';
import { createPedestal } from './render/pedestal.js';
import { createHatch } from './render/hatch.js';
import { bootGuess } from './render/tiers.js';
import { createHand } from './ui/hand.js';
import { showNoWebGL } from './ui/pictures.js';

const P = new URLSearchParams(location.search);
const TEST = P.has('test');
const FIXED = 1 / 60;

function hasWebGL2() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch { return false; }
}

const api = window.__sborn = { version: 1 };
let readyResolve;
const readyP = new Promise((r) => { readyResolve = r; });
api.ready = () => readyP;

boot();

function boot() {
  if (!hasWebGL2()) { showNoWebGL(); api.noWebGL = true; return; }
  const forced = P.get('quality');
  const tier = ['low', 'medium', 'high'].includes(forced) ? forced : TEST ? 'medium'
    : bootGuess({ ua: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, screenW: screen.width, screenH: screen.height, dpr: devicePixelRatio, halfFloat: true });
  const canvas = document.getElementById('gl');
  const stage = createStage(canvas, { test: TEST, tier, precision: P.get('precision') === 'mediump' ? 'mediump' : 'highp' });
  const { scene, camera, renderer } = stage;
  const sky = createSky();
  scene.add(sky.group);
  const pedestal = createPedestal();
  scene.add(pedestal.group);
  const hatch = createHatch(scene);
  const hand = createHand();

  camera.position.set(0, 1.25, 4.6);
  camera.lookAt(0, 0.42, 0);
  stage.lights.focus.set(0, 0.4, 0);
  stage.lights.radius = 1.0;

  let glErrors = 0, frameNo = 0, simT = 0;
  const gl = renderer.getContext();
  function renderFrame() {
    renderer.info.reset();
    stage.render();
    frameNo++;
    if (TEST) { const e = gl.getError(); if (e !== gl.NO_ERROR) glErrors++; }
  }
  function simStep() {
    simT += FIXED;
    hatch.update(FIXED);
    pedestal.update(FIXED);
    stage.updateLights(FIXED);
  }

  addEventListener('resize', () => stage.resize());
  stage.resize();

  api.step = (n = 1, { render = 0 } = {}) => {
    for (let i = 1; i <= n; i++) { simStep(); if (render && i % render === 0) renderFrame(); }
  };
  api.settle = async () => { for (let i = 0; i < 3; i++) renderFrame(); };
  api.info = () => ({ ...stage.info(), glErrors, frame: frameNo });
  api.mode = () => document.body.dataset.mode;

  // The UI font: wait for it so the first frame never flashes a fallback (logged fallback stack in styles.css).
  const fontP = document.fonts && document.fonts.load ? document.fonts.load('16px Fredoka').catch(() => null) : Promise.resolve();
  api.fontReady = () => fontP;

  function hatched() {
    document.body.dataset.mode = 'build';
    hand.hide();
    fontP.then(() => readyResolve(true));
  }
  if (TEST && P.has('hatch')) {
    hatch.update(0.5);
    document.body.dataset.mode = 'hatch';
    fontP.then(() => readyResolve(true));
  } else if (TEST) {
    hatch.crack();
    for (let i = 0; i < 100; i++) hatch.update(FIXED);
    hatched();
    renderFrame();
  } else {
    let tapped = false;
    const place = () => hand.show({ x: innerWidth / 2, y: innerHeight * 0.5, r: 48, kind: 'tap' });
    setTimeout(place, 300);
    const go = () => { if (tapped) return; tapped = true; removeEventListener('pointerdown', go); hatch.crack().then(hatched); hand.hide(); };
    addEventListener('pointerdown', go);
    setTimeout(go, 4000 + 300);
    let last = performance.now(), acc = 0;
    renderer.setAnimationLoop((now) => {
      if (document.hidden) { last = now; return; }
      acc += Math.min(0.1, (now - last) / 1000); last = now;
      while (acc >= FIXED) { simStep(); acc -= FIXED; }
      renderFrame();
    });
  }
}
