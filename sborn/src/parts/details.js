// details.js — the 10 detail builders: horns, antler, spike ridge, plates, dome shell, antenna, frill, fur tuft.
// Exports: DETAILS (type → build(p, lod, R)).
// Invariants: every horn, tine and spike is a sweep ending in a hemisphere (tip r ≥ 0.15 × base) and reports its tip;
//   transforms of tipped geometry go through xf so tip records follow; the ridge lays its spikes along part Z
//   (the snap frame's forward), the editor's sphere-traced anchor keeps the row on the skin.
import * as THREE from 'three';
import { P, sweep, blob, merge, sheet, petalPts, card, ellipsoid, lathe, xf, clean, seg } from './kit.js';

const horn = (path, r0, F, lod, radial = 12, axial = 10) => sweep(path, [r0 * F, r0 * 0.6 * F, r0 * 0.3 * F], { radial, axial, lod });

export const DETAILS = {
  'det.nubhorn': (p, lod, R) => {
    const s = R / 0.045, L = p.len, F = p.fat;
    const g = sweep([[0, 0, 0], [0, 0.04 * s * L, 0.004 * s * p.curl], [0, 0.075 * s * L, 0.01 * s * p.curl]], [0.045 * s * F, 0.03 * s * F, 0.014 * s * F], { radial: 22, axial: 8, lod });
    return { pieces: [P(g, 'keratin')], tips: [g.userData.tip], radius: 0.09 * s * L, top: 0.09 * s * L };
  },
  'det.curlhorn': (p, lod, R) => {
    const s = R / 0.045, L = p.len, C = 0.4 + p.curl, path = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, a = t * 1.6 * C; path.push([0, Math.sin(a) / (1.6 * C) * 0.2 * s * L, -(1 - Math.cos(a)) / (1.6 * C) * 0.2 * s * L]); }
    const g = horn(path, 0.04 * s, p.fat, lod, 12, 16);
    // ring ridges: slight radius bumps along the length
    const pos = g.attributes.position, c = new THREE.Vector3();
    const curve = new THREE.CatmullRomCurve3(path.map((q) => new THREE.Vector3(...q)));
    const pts = curve.getSpacedPoints(32);
    for (let i = 0; i < pos.count; i++) {
      c.fromBufferAttribute(pos, i); let best = 0, bd = 1e9;
      for (let k = 0; k < pts.length; k++) { const d = c.distanceToSquared(pts[k]); if (d < bd) { bd = d; best = k; } }
      const t = best / 32; if (t > 0.85) continue;
      const k = 1 + 0.06 * Math.max(0, Math.sin(t * Math.PI * 12));
      c.sub(pts[best]).multiplyScalar(k).add(pts[best]); pos.setXYZ(i, c.x, c.y, c.z);
    }
    g.computeVertexNormals();
    return { pieces: [P(g, 'keratin')], tips: [g.userData.tip], radius: 0.2 * s * L, top: 0.16 * s * L };
  },
  'det.swirlhorn': (p, lod, R) => {
    const s = R / 0.045, L = p.len, path = [], turns = 0.9 + 0.4 * p.curl;
    for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * Math.PI * 2 * turns, r = (0.07 - 0.04 * t) * s * L; path.push([t * 0.06 * s, r * Math.sin(a), r * (1 - Math.cos(a)) * -1]); }
    path[0] = [0, 0, 0];
    const g = horn(path, 0.045 * s, p.fat, lod, 12, 28);
    return { pieces: [P(g, 'keratin')], tips: [g.userData.tip], radius: 0.16 * s * L, top: 0.13 * s * L };
  },
  'det.antler': (p, lod, R) => {
    const s = R / 0.045, L = p.len, F = p.fat, br = [];
    const main = sweep([[0, 0, 0], [0, 0.1 * s * L, -0.02 * s], [0, 0.2 * s * L, -0.05 * s * (0.5 + p.curl)]], [0.022 * s * F, 0.016 * s * F, 0.008 * s * F], { radial: 8, axial: 10, lod });
    br.push(main);
    for (const [t, dz, dy] of [[0.45, 0.07, 0.05], [0.72, -0.07, 0.05]]) {
      const b = [0, t * 0.2 * s * L, -t * 0.04 * s];
      br.push(sweep([b, [0, b[1] + dy * 0.6 * s * L, b[2] + dz * 0.5 * s], [0, b[1] + dy * s * L, b[2] + dz * s]], [0.013 * s * F, 0.01 * s * F, 0.006 * s * F], { radial: 8, axial: 6, lod }));
    }
    const g = merge(br);
    return { pieces: [P(g, 'keratin')], tips: g.userData.tips, radius: 0.24 * s * L, top: 0.21 * s * L };
  },
  'det.ridge': (p, lod, R) => {
    const s = R / 0.06, L = p.len, n = Math.max(5, Math.min(9, Math.round(5 + 4 * p.curl))), sp = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1), z = (0.5 - t) * 0.3 * s * L, h = (0.045 + 0.03 * Math.sin(Math.PI * t)) * s * p.fat;
      sp.push(sweep([[0, 0, z], [0, h * 0.5, z - 0.006 * s], [0, h, z - 0.016 * s]], [0.018 * s, 0.012 * s, 0.0055 * s], { radial: 8, axial: 4, lod }));
    }
    const base = blob(0.02 * s, [0, 0, 0], lod, [1, 0.5, 8 * L], 10, 6);
    const g = merge(sp);
    return { pieces: [P(g, 'keratin'), P(base, 'skin')], tips: g.userData.tips, radius: 0.17 * s * L, top: 0.08 * s * p.fat };
  },
  'det.plates': (p, lod, R) => {
    const s = R / 0.1, L = p.len, n = Math.max(3, Math.min(6, Math.round(3 + 3 * p.curl))), g = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1), z = (0.5 - t) * 0.22 * s * L;
      g.push(xf(ellipsoid(0.08 * s * p.fat, 0.022 * s, 0.06 * s, 16, 8, lod), { p: [0, 0.012 * s + 0.004 * s * i, z], r: [0.25, 0, 0] }));
    }
    return { pieces: [P(merge(g), 'shell')], tips: [], radius: 0.17 * s * L, top: 0.05 * s };
  },
  'det.shell': (p, lod, R) => {
    const s = R / 0.18, F = p.fat, H = 0.13 * s * p.len, Rr = 0.2 * s * F;
    const g = new THREE.SphereGeometry(1, seg(28, lod), seg(14, lod), 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = g.attributes.position, v = new THREE.Vector3();
    // hex plates: shallow grooves on a hexagonal lattice in (azimuth, elevation)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const az = Math.atan2(v.z, v.x), el = Math.asin(Math.min(1, v.y));
      const u = az * 3 / Math.PI, w = el * 6 / Math.PI;
      const cx = u - Math.round(u), cy = w - Math.round(w + (Math.round(u) % 2 ? 0.5 : 0)) + (Math.round(u) % 2 ? 0.5 : 0);
      const groove = Math.max(0, 1 - Math.min(Math.abs(Math.abs(cx) - 0.5), Math.abs(Math.abs(cy) - 0.5)) * 8);
      const k = 1 - 0.02 * groove * (v.y < 0.98 ? 1 : 0);
      pos.setXYZ(i, v.x * Rr * k, v.y * H * k, v.z * Rr * 1.2 * k);
    }
    g.computeVertexNormals();
    const rim = xf(ellipsoid(Rr * 1.03, 0.012 * s, Rr * 1.23, 28, 6, lod), { p: [0, 0.004 * s, 0] });
    return { pieces: [P(clean(g), 'shell'), P(rim, 'shell')], tips: [], radius: 0.26 * s, top: H };
  },
  'det.bobble': (p, lod, R) => {
    const s = R / 0.045, L = p.len, h = 0.2 * s * L;
    const stalk = sweep([[0, 0, 0], [0, h * 0.5, 0.02 * s * p.curl], [0, h, 0.05 * s * p.curl]], [0.014 * s, 0.011 * s, 0.009 * s], { radial: 8, axial: 10, lod }); delete stalk.userData.tip;
    const ball = blob(0.034 * s * p.fat, [0, h + 0.015 * s, 0.055 * s * p.curl], lod, [1, 1, 1], 14, 10);
    return { pieces: [P(stalk, 'skin'), P(ball, 'tint:detail')], tips: [], radius: h + 0.04 * s, top: h + 0.04 * s };
  },
  'det.frill': (p, lod, R) => {
    const s = R / 0.08, L = p.len, pts = [[0, 0]], n = 7;
    for (let i = 0; i <= n * 4; i++) { const t = i / (n * 4), a = (-0.5 + t) * Math.PI * 1.1 * p.fat; const r = (0.12 + 0.03 * Math.sqrt(Math.abs(Math.sin(t * n * Math.PI)))) * s * L; pts.push([Math.sin(a) * r, Math.cos(a) * r]); }
    pts.reverse();
    const f = sheet(pts, 0.007 * s, lod, 4); f.rotateX(0.35 - 0.3 * p.curl);
    const sp = [];
    for (let i = 0; i < n; i++) { const a = (-0.5 + (i + 0.5) / n) * Math.PI * 1.1 * p.fat, r = 0.12 * s * L; const g = sweep([[0, 0, 0], [0, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5], [0, Math.cos(a) * r, Math.sin(a) * r]], [0.006 * s, 0.005 * s, 0.004 * s], { radial: 6, axial: 5, lod }); delete g.userData.tip; sp.push(g); }
    const ribs = merge(sp); ribs.rotateX(0.35 - 0.3 * p.curl);
    return { pieces: [P(f, 'membrane'), P(ribs, 'skin')], tips: [], radius: 0.16 * s * L, top: 0.15 * s * L };
  },
  'det.tuft': (p, lod, R) => {
    const s = R / 0.04, L = p.len, g = [];
    for (let i = 0; i < 7; i++) { const a = i * 2.39996, r = i ? 0.012 * s : 0; const c = card(0.07 * s * L * (1 - 0.1 * (i % 3)), 0.03 * s * p.fat, lod, 0.25 + 0.3 * p.curl); c.rotateY(a); c.rotateX(i ? 0.25 : 0); c.translate(Math.cos(a) * r, 0, Math.sin(a) * r); g.push(c); }
    return { pieces: [P(merge(g), 'tint:coat'), P(blob(0.022 * s, [0, 0.004 * s, 0], lod, [1, 0.6, 1], 10, 6), 'skin')], tips: [], radius: 0.08 * s * L, top: 0.07 * s * L };
  },
};
