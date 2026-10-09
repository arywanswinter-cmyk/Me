// look.js — which art style to render: cel-shaded (default) or soft clay (?look=clay).
// Exports: TOON (bool), toonRamp() -> shared 3-band gradient texture, OUTLINE colour helper.
// Invariant: the style is fixed for a page load, so every material agrees.
import * as THREE from 'three';

export const TOON = typeof location === 'undefined' || new URLSearchParams(location.search).get('look') !== 'clay';

let ramp = null;
export function toonRamp() {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([105, 105, 105, 255, 178, 178, 178, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}

// Ink line: the object's own colour, much darker, so outlines read as drawn rather than black wire.
export const inkOf = (color) => new THREE.Color(color).multiplyScalar(0.28);
