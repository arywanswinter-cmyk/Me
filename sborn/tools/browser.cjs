// browser.cjs — shared Playwright plumbing: servers, browser, the three device contexts, console capture.
// Exports: ROOT, SB, PORT, DW_PORT, ensureServers(), stopServers(), launch(), newContext(browser, kind),
//          watchPage(page, tally), allowlist(), sleep(ms), waitTitle(page, ms).
// Invariants: never runs `playwright install`; aborts every non-localhost request (counted, not failed);
//   console errors/warnings outside console-allowlist.json are collected as failures.
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const SB = path.resolve(__dirname, '..');
const ROOT = path.resolve(SB, '..');
const PORT = 8791, DW_PORT = 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portOpen(port) {
  return new Promise((res) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.end(); res(true); }); s.on('error', () => res(false)); });
}
const procs = [];
async function ensureServers({ restart = false } = {}) {
  if (restart) stopServers(true);
  for (const [port, dir] of [[PORT, SB], [DW_PORT, ROOT]]) {
    if (!restart && await portOpen(port)) continue;
    const p = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore', detached: true });
    p.unref(); procs.push(p);
    for (let i = 0; i < 50 && !(await portOpen(port)); i++) await sleep(100);
  }
}
function stopServers(all = false) {
  for (const p of procs) { try { process.kill(-p.pid); } catch {} }
  procs.length = 0;
  if (all) { try { execSync(`pkill -f "http.server ${PORT}" ; pkill -f "http.server ${DW_PORT}"`, { stdio: 'ignore' }); } catch {} }
}

async function launch() {
  return pw.chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
}

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CONTEXTS = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  ipad: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, isMobile: false, userAgent: IPAD_UA },
  ipadPortrait: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: true, isMobile: false, userAgent: IPAD_UA },
  small: { viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 },
};
async function newContext(browser, kind = 'desktop', extra = {}) {
  const ctx = await browser.newContext({ ...CONTEXTS[kind], ...extra });
  ctx.__nonLocal = 0;
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') return route.continue();
    ctx.__nonLocal++;
    return route.abort();
  });
  return ctx;
}

function allowlist() { return JSON.parse(fs.readFileSync(path.join(SB, 'tools/console-allowlist.json'), 'utf8')); }
// tally: { bad: [], allowed: {substring: n}, nonLocal }
function watchPage(page, tally) {
  const al = allowlist();
  tally.bad = tally.bad || []; tally.allowed = tally.allowed || {};
  const judge = (kind, text) => {
    const hit = al.find((a) => text.includes(a.substring));
    if (hit) { tally.allowed[hit.substring] = (tally.allowed[hit.substring] || 0) + 1; return; }
    tally.bad.push(`${kind}: ${text.slice(0, 300)}`);
  };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') judge(m.type(), m.text()); });
  page.on('pageerror', (e) => judge('pageerror', String(e && e.stack || e)));
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) return;   // aborted non-localhost requests are counted elsewhere
    judge('requestfailed', `${u} ${r.failure() && r.failure().errorText}`);
  });
  page.on('response', (r) => { if (r.status() >= 400) judge('http', `${r.status()} ${r.url()}`); });
  return tally;
}

async function waitTitle(page, ms = 120000, not = 'running…') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const t = await page.title(); if (t !== not) return t; await sleep(250); }
  return 'TIMEOUT';
}

module.exports = { pw, ROOT, SB, PORT, DW_PORT, ensureServers, stopServers, launch, newContext, watchPage, allowlist, sleep, waitTitle, CONTEXTS };
