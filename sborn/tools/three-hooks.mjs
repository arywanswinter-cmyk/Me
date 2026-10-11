// three-hooks.mjs — lets Node resolve the browser import map: `three` → ../vendor/three.module.js, `three/addons/*` → ../vendor/addons/*.
// Exports: nothing (registers a module resolve hook; use: node --import ./sborn/tools/three-hooks.mjs <tool>).
// Invariants: only the two bare specifiers are remapped; everything else resolves normally.
import { register } from 'node:module';
const vendor = new URL('../vendor/', import.meta.url).href;
const code = `
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: ${JSON.stringify(vendor)} + 'three.module.js', shortCircuit: true };
  if (spec.startsWith('three/addons/')) return { url: ${JSON.stringify(vendor)} + 'addons/' + spec.slice(13), shortCircuit: true };
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(code), import.meta.url);
