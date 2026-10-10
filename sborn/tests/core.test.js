// core.test.js — hashes, CRC32 and the deterministic RNG.
// Exports: nothing (registers tests). Invariants: pure; no WebGL.
import { test, ok } from './harness.js';
import { fnv1a, crc32 } from '../src/core/hash.js';
import { mulberry32 } from '../src/core/rng.js';

test('M0.hash', 'FNV-1a and CRC32 match reference values', { milestone: 0 }, () => {
  ok(fnv1a('') === 2166136261, `fnv empty ${fnv1a('')}`);
  ok(fnv1a('a') === 0xe40c292c, `fnv a ${fnv1a('a').toString(16)}`);
  ok(crc32(new TextEncoder().encode('123456789')) === 0xCBF43926, 'crc check value');
});
test('M0.rng', 'mulberry32 is deterministic', { milestone: 0 }, () => {
  const a = mulberry32(5), b = mulberry32(5);
  for (let i = 0; i < 100; i++) ok(a() === b(), 'sequence differs');
});
