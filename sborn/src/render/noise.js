// noise.js — builds the two noise volumes in a worker at boot and wraps them as tileable Data3DTextures.
// Exports: createNoiseTextures() -> Promise<{ a: Data3DTexture, b: Data3DTexture, ms }>.
// Invariants: NoColorSpace, linear filtering, repeat wrapping on all axes; falls back to the main thread without workers.
import * as THREE from 'three';
import { N, genNoiseA, genNoiseB } from './noise-gen.js';

function tex(data) {
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
export function createNoiseTextures() {
  const t0 = performance.now();
  return new Promise((resolve) => {
    let w = null;
    try { w = new Worker(new URL('./noise-worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
    const sync = () => resolve({ a: tex(genNoiseA()), b: tex(genNoiseB()), ms: performance.now() - t0 });
    if (!w) { sync(); return; }
    w.onmessage = (e) => { w.terminate(); resolve({ a: tex(e.data.a), b: tex(e.data.b), ms: performance.now() - t0 }); };
    w.onerror = (e) => { e.preventDefault && e.preventDefault(); w.terminate(); sync(); };
    w.postMessage({});
  });
}
