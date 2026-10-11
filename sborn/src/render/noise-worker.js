// noise-worker.js — builds both noise volumes off the main thread at boot.
// Exports: nothing (message protocol: in {} → out {a, b} transferred Uint8Arrays).
// Invariants: relative imports only (workers cannot see the import map).
import { genNoiseA, genNoiseB } from './noise-gen.js';
self.onmessage = () => { const a = genNoiseA(), b = genNoiseB(); self.postMessage({ a, b }, [a.buffer, b.buffer]); };
