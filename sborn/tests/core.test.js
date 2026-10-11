// core.test.js — hashes, CRC32 and the deterministic RNG.
// Exports: nothing (registers tests).
// Invariants: pure; no WebGL.
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

test('M9.sha256', 'the JS SHA-256 used for audio integrity matches the FIPS 180-4 vectors', { milestone: 9, items: [] }, async () => {
  const { sha256Hex } = await import('../src/core/sha256.js');
  const enc = (s) => new TextEncoder().encode(s);
  ok(sha256Hex(enc('')) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'empty');
  ok(sha256Hex(enc('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'abc');
  ok(sha256Hex(enc('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')) === '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1', '448-bit');
  return 'empty, abc and the 448-bit vector match';
});
