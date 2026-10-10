// shoot.cjs — takes the milestone screenshots, checks they are not blank and records them in screens/manifest.json.
// Exports: analyse(page, buf) (pixel stats in Chromium), shotList; CLI: node sborn/tools/shoot.cjs <m0|m1|…> [name-filter].
// Invariants: JPEG quality 85 at screens/mN/NN-name.jpg plus a 640-px copy in tools/out/view/ (not committed);
//   blank = luma std < 6 or < 24 distinct 6-bit colours, which fails the run; existing `observed` notes are kept.
const fs = require('fs');
const path = require('path');
const B = require('./browser.cjs');

const MAN = path.join(B.SB, 'screens/manifest.json');
const VIEW = path.join(B.SB, 'tools/out/view');

// Pixel statistics computed in the page (createImageBitmap → canvas → getImageData).
async function analyse(page, buf, extra = null) {
  return page.evaluate(async ({ b64, extra }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin]));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0, s2 = 0; const n = d.length / 4; const cols = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      s += y; s2 += y * y; cols.add((d[i] >> 2) << 12 | (d[i + 1] >> 2) << 6 | (d[i + 2] >> 2));
    }
    const m = s / n;
    const out = { w: c.width, h: c.height, lumaStd: Math.sqrt(Math.max(0, s2 / n - m * m)), distinctColours: cols.size, lumaMean: m };
    if (extra) out.extra = await (new Function('d', 'w', 'h', 'arg', extra.fn))(d, c.width, c.height, extra.arg);
    return out;
  }, { b64: buf.toString('base64'), extra });
}

// A 640-px-wide JPEG copy for reading, made by the page too (no image tools needed).
async function viewCopy(page, buf, file) {
  const b64 = await page.evaluate(async (b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin]));
    const w = 640, h = Math.round(bmp.height * 640 / bmp.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
    const ab = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < ab.length; i += 0x8000) s += String.fromCharCode.apply(null, ab.subarray(i, i + 0x8000));
    return btoa(s);
  }, buf.toString('base64'));
  fs.mkdirSync(VIEW, { recursive: true });
  fs.writeFileSync(path.join(VIEW, file), Buffer.from(b64, 'base64'));
}

async function boot(page, url) {
  await page.goto(`http://localhost:${B.PORT}/${url}`);
  await page.waitForFunction(() => window.__sborn && window.__sborn.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__sborn.ready());
}

const shotList = require('./shots.cjs');

(async () => {
  if (require.main !== module) return;
  const ms = process.argv[2] || 'm0';
  const filter = process.argv[3] || '';
  const shots = (shotList[ms] || []).filter((s) => s.file.includes(filter));
  if (!shots.length) { console.log(`no shots for ${ms}`); process.exit(1); }
  await B.ensureServers();
  const browser = await B.launch();
  const man = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, 'utf8')) : [];
  let blank = 0;
  for (const s of shots) {
    const ctx = await B.newContext(browser, s.ctx || 'desktop');
    const page = await ctx.newPage();
    const tally = {}; B.watchPage(page, tally);
    try {
      await boot(page, s.url);
      if (s.prepare) await s.prepare(page);
      if (s.settle !== false) await page.evaluate(() => window.__sborn.settle && window.__sborn.settle());
      const buf = s.capture ? await s.capture(page) : await page.screenshot({ type: 'jpeg', quality: 85, fullPage: false });
      const out = path.join(B.SB, 'screens', s.file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
      const st = await analyse(page, buf);
      await viewCopy(page, buf, s.file.replace(/\//g, '-'));
      const isBlank = st.lumaStd < 6 || st.distinctColours < 24;
      if (isBlank) blank++;
      const vp = page.viewportSize();
      const prev = man.find((e) => e.file === s.file);
      const entry = { file: s.file, milestone: Number(ms.slice(1)), viewport: `${vp.width}x${vp.height}`, url: s.url, mustShow: s.mustShow,
        observed: prev && JSON.stringify(prev.mustShow) === JSON.stringify(s.mustShow) ? prev.observed : [],
        lumaStd: Math.round(st.lumaStd * 10) / 10, distinctColours: st.distinctColours };
      if (s.metrics) entry.metrics = await s.metrics(page, buf, analyse);
      if (prev) Object.assign(prev, entry); else man.push(entry);
      console.log(`${isBlank ? 'BLANK' : 'ok   '} ${s.file} std ${entry.lumaStd} colours ${entry.distinctColours}${tally.bad && tally.bad.length ? ' console: ' + tally.bad.slice(0, 3).join(' | ') : ''}${entry.metrics ? ' ' + JSON.stringify(entry.metrics).slice(0, 400) : ''}`);
    } catch (e) { console.log(`ERROR ${s.file}: ${String(e).slice(0, 400)}`); blank++; }
    await ctx.close();
  }
  man.sort((a, b) => a.file.localeCompare(b.file));
  fs.writeFileSync(MAN, JSON.stringify(man, null, 1));
  await browser.close();
  B.stopServers();
  process.exit(blank ? 1 : 0);
})();

module.exports = { analyse, boot };
