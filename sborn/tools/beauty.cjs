// beauty.cjs — the §11.6 beauty checks, computed in the page from the canvas pixels, probe.mask() and probe.eyes().
// Exports: beauty(page, { backlit }) -> { fill, dark, clipFrac, eyes[], rimRatio, haloRatio, footDarker, skyRun, pass, fails[] }.
// Invariants: reads the drawing buffer (preserveDrawingBuffer under ?test) after settle(); thresholds come from
//   tests/thresholds.js values copied here verbatim (see T.beauty*).
const T = { fill: [0.55, 0.70], dark: 10, clip: 0.003, catch: 235, rim: 1.12, backlit: 1.3, halo: 1.2, foot: 0.08, sky: 16 };

async function beauty(page, { checks = [1, 2, 3, 4, 6, 7] } = {}) {
  return page.evaluate(async ({ T, checks }) => {
    const s = window.__sborn; await s.settle();
    const gl = s.stage.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const at = (x, y) => ((h - 1 - y) * w + x) * 4;          // y down
    const luma = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const M = s.probe.mask(); const m = M.data;
    const eyes = s.probe.eyes();
    const out = { fails: [] };
    const inEye = (x, y) => eyes.some((e) => Math.hypot(x - e.x, y - e.y) < e.r * 1.05);
    if (checks.includes(1)) { out.fill = (M.bbox[3] - M.bbox[1] + 1) / h; if (out.fill < T.fill[0] || out.fill > T.fill[1]) out.fails.push(`1 fill ${out.fill.toFixed(3)}`); }
    if (checks.includes(2)) {
      let dark = 0, clip = 0, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!m[y * w + x]) continue; n++; const i = at(x, y); const mx = Math.max(px[i], px[i + 1], px[i + 2]); if (mx < T.dark) dark++; if (px[i] >= 254 && px[i + 1] >= 254 && px[i + 2] >= 254 && !inEye(x, y)) clip++; }
      out.dark = dark; out.clipFrac = clip / Math.max(1, n);
      if (dark > 0) out.fails.push(`2 dark ${dark}`); if (out.clipFrac > T.clip) out.fails.push(`2 clip ${out.clipFrac.toFixed(4)}`);
    }
    if (checks.includes(3)) {
      out.eyes = eyes.map((e) => { let best = 0; for (let y = Math.floor(e.y - e.r); y <= e.y; y++) for (let x = Math.floor(e.x - e.r); x <= e.x; x++) { if (x < 0 || y < 0 || x >= w || y >= h || Math.hypot(x - e.x, y - e.y) > e.r) continue; best = Math.max(best, luma(at(x, y))); } return Math.round(best); });
      out.eyes.forEach((v, k) => { if (v < T.catch) out.fails.push(`3 eye${k} ${v}`); });
    }
    if (checks.includes(4)) {
      // distance-to-outside within 6 px by repeated erosion
      const d = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) d[i] = m[i] ? 255 : 0;
      for (let pass = 1; pass <= 6; pass++) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (d[i] !== 255) continue; if (d[i - 1] === pass - 1 || d[i + 1] === pass - 1 || d[i - w] === pass - 1 || d[i + w] === pass - 1 || (pass === 1 && (!m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w]))) d[i] = pass; }
      let bs = 0, bn = 0, is = 0, inn = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = d[y * w + x]; if (!v || inEye(x, y)) continue; const L = luma(at(x, y)); if (v <= 3) { bs += L; bn++; } else if (v === 255) { is += L; inn++; } }
      out.rimRatio = (bs / Math.max(1, bn)) / Math.max(1, is / Math.max(1, inn));
      if (out.rimRatio < T.rim) out.fails.push(`4 rim ${out.rimRatio.toFixed(3)}`);
    }
    if (checks.includes(6)) {
      const T3 = s.three, cam = s.stage.camera;
      const proj = (x, y, z) => { const v = new T3.Vector3(x, y, z).project(cam); return { x: Math.round((v.x * 0.5 + 0.5) * w), y: Math.round((-v.y * 0.5 + 0.5) * h), z: v.z }; };
      const mean = (cx, cy, r = 3) => { let a = 0, n = 0; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { if (x < 0 || y < 0 || x >= w || y >= h || m[y * w + x]) continue; a += luma(at(x, y)); n++; } return n ? a / n : NaN; };
      const R = 1.4, ratios = [];
      // halo: the first floor point visible beyond the pedestal edge (scanning outward from 1.1 R), vs floor beyond the glow
      for (const ang of [Math.PI - 0.5, Math.PI + 0.5, Math.PI - 0.9, Math.PI + 0.9, Math.PI / 2, -Math.PI / 2]) {
        const edge = proj(Math.sin(ang) * R, 0, Math.cos(ang) * R);
        let p1 = null;
        for (let r = 1.1 * R; r < 2.0 * R; r += 0.04) { const q = proj(Math.sin(ang) * r, -0.178, Math.cos(ang) * r); if (q.y < edge.y - 3 && q.x >= 4 && q.x < w - 4 && q.y >= 4) { p1 = q; break; } }
        let p2 = null;
        for (let r = 2.8 * R; r > 2.3 * R; r -= 0.1) { const q = proj(Math.sin(ang) * r, -0.178, Math.cos(ang) * r); if (q.x >= 4 && q.x < w - 4 && q.y >= 4 && q.y < h - 4) { p2 = q; break; } }
        if (!p1 || !p2) continue;
        const a = mean(p1.x, p1.y), b = mean(p2.x, p2.y);
        if (Number.isFinite(a) && Number.isFinite(b)) { ratios.push(a / b); (out.haloAt = out.haloAt || []).push([p1.x, p1.y, Math.round(a), p2.x, p2.y, Math.round(b)]); }
      }
      out.haloRatio = ratios.length ? Math.max(...ratios) : NaN;
      if (!(out.haloRatio >= T.halo)) out.fails.push(`6 halo ${out.haloRatio}`);
      // band under the lowest foot on screen vs the pedestal 60 px to the side
      const c = s.creature, rig = c.rig;
      let fp = null, low = null;
      for (let b = 0; b < rig.n; b++) {
        const v = new T3.Vector3(); rig.jointWorld(b, v); c.body.updateMatrixWorld(true); v.applyMatrix4(c.body.matrixWorld);
        const q = proj(v.x, 0, v.z);
        if (v.y <= c.height * 0.3 && (!fp || q.y > fp.y)) fp = q;
        if (!low || v.y < low.v) low = { v: v.y, q };
      }
      if (!fp) fp = low.q;      // legless: the band under the body's lowest bone
      let yb = fp.y; while (yb < h - 1 && m[yb * w + fp.x]) yb++;
      let below = 0, side = 0, nb = 0, ns = 0;
      // the reference is the brighter (lit) side, so the key light's cast shadow never counts as "pedestal"
      let sdx = 60, sideL = 0, nL = 0, sideR = 0, nR = 0;
      for (let y = yb + 1; y < yb + 11; y++) for (let x = fp.x - 20; x < fp.x + 20; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h || m[y * w + x]) continue; below += luma(at(x, y)); nb++;
        if (x + 60 < w && !m[y * w + x + 60]) { sideR += luma(at(x + 60, y)); nR++; }
        if (x - 60 >= 0 && !m[y * w + x - 60]) { sideL += luma(at(x - 60, y)); nL++; }
      }
      if (nL && (!nR || sideL / nL > sideR / nR)) { side = sideL; ns = nL; sdx = -60; } else { side = sideR; ns = nR; }
      out.footDarker = nb && ns ? 1 - (below / nb) / (side / ns) : NaN; out.footAt = [fp.x, yb, sdx, Math.round(below / Math.max(1, nb)), Math.round(side / Math.max(1, ns))];
      if (!(out.footDarker >= T.foot)) out.fails.push(`6 foot ${out.footDarker}`);
    }
    if (checks.includes(7)) {
      let worst = 0;
      const top = Math.floor(h * 0.3);
      for (let x = 0; x < w; x++) { let run = 1; for (let y = 1; y < top; y++) { const i = at(x, y), j = at(x, y - 1); if (m[y * w + x] || m[(y - 1) * w + x]) { run = 1; continue; } if (px[i] === px[j] && px[i + 1] === px[j + 1] && px[i + 2] === px[j + 2]) { run++; if (run > worst) worst = run; } else run = 1; } }
      out.skyRun = worst; if (worst > T.sky) out.fails.push(`7 sky run ${worst}`);
    }
    out.pass = out.fails.length === 0;
    return out;
  }, { T, checks });
}
module.exports = { beauty, T };
