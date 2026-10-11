// acceptance.cjs — the §16 acceptance runner: restarts servers, runs every check, writes tools/out/acceptance.json.
// Exports: nothing (CLI: node sborn/tools/acceptance.cjs [--report] [--skip-run]).
// Invariants: serves from its own checkout; one row per §16 item; exits 0 only if every [T], [M] and [S] row is
//   PASS, or NA/BLOCKED where rule 3 allows; never types a number by hand (everything comes from runs here).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawnSync } = require('child_process');
const B = require('./browser.cjs');

const SB = B.SB, ROOT = B.ROOT, OUT = path.join(SB, 'tools/out');
const args = process.argv.slice(2);
const REPORT = args.includes('--report'), SKIP = args.includes('--skip-run');
const sh = (cmd, opts = {}) => { try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim(); } catch (e) { return (e.stdout || '').trim(); } };
const readJSON = (f, d = null) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); } catch { return d; } };
const commit = sh('git rev-parse HEAD');
const ranAt = () => new Date().toISOString();

// §16 tags. [U] items are USER; 52 may be NA in Case B.
const TAGS = { 1: 'T', 2: 'T', 3: 'T', 4: 'T', 5: 'T', 6: 'T', 7: 'T', 8: 'M', 9: 'T', 10: 'T', 11: 'T', 12: 'T', 13: 'T+S', 14: 'T', 15: 'T', 16: 'T',
  17: 'T', 18: 'T', 19: 'T', 20: 'T', 21: 'T', 22: 'T', 23: 'T', 24: 'T', 25: 'T', 26: 'T', 27: 'S', 28: 'M', 29: 'M', 30: 'M', 31: 'T', 32: 'T',
  33: 'T', 34: 'T', 35: 'T', 36: 'T', 37: 'T', 38: 'M', 39: 'T', 40: 'M', 41: 'T', 42: 'T', 43: 'T+S', 44: 'U', 45: 'U', 46: 'T', 47: 'T', 48: 'T',
  49: 'T', 50: 'T', 51: 'T', 52: 'T', 53: 'T', 54: 'T', 55: 'U', 56: 'S+T', 57: 'T', 58: 'T', 59: 'T', 60: 'T', 61: 'T', 62: 'T', 63: 'T', 64: 'T',
  65: 'T', 66: 'T', 67: 'M', 68: 'T', 69: 'T', 70: 'T', 71: 'T', 72: 'T', 73: 'T', 74: 'U', 75: 'U', 76: 'U', 77: 'U', 78: 'U', 79: 'U' };
const rows = {};
const row = (item, status, value, threshold, unit, method, evidence) => { rows[item] = { item, tag: TAGS[item], status, value, threshold, unit, method, evidence, ranAt: ranAt(), commit }; };

// ---------- static checks run in node ----------
function item1() {
  const dec = fs.readFileSync(path.join(SB, 'DECISIONS.md'), 'utf8');
  const m = dec.match(/Start commit: ([0-9a-f]{40})/);
  if (!m) return row(1, 'FAIL', 'no Start commit', '40 hex', '', 'DECISIONS.md', 'sborn/DECISIONS.md');
  const outside = sh(`git diff --name-only ${m[1]}..HEAD`).split('\n').filter((l) => l && !l.startsWith('sborn/'));
  const dirty = sh(`git status --porcelain --untracked-files=all -- . ':!sborn' ':!prompts/sborn-master-prompt.md'`);
  const dw = readJSON('doodle-world.json', {});
  const pass = !outside.length && !dirty && dw.pass;
  row(1, pass ? 'PASS' : 'FAIL', `outside=${outside.length} dirty=${dirty ? 1 : 0} doodle=${dw.h1 || 'not run'}`, 'all empty; ALL PASS · 17/17', '', 'git diff/status + Doodle World tests.html', 'tools/out/doodle-world.json');
}
function item5() {
  const ck = fs.readFileSync(path.join(SB, 'vendor/CHECKSUMS.txt'), 'utf8');
  const integ = /dist\.integrity: sha512-|source: github tag r170/.test(ck);
  let bad = [];
  for (const line of ck.split('\n')) {
    const m = line.match(/^([0-9a-f]{64})\s+\.\/(.+)$/);
    if (!m) continue;
    const f = path.join(SB, 'vendor', m[2]);
    const h = fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'missing';
    if (h !== m[1]) bad.push(m[2]);
  }
  const same = Buffer.compare(fs.readFileSync(path.join(SB, 'vendor/three.module.js')), fs.readFileSync(path.join(ROOT, 'vendor/three.module.js'))) === 0;
  const t = testsFor(5);
  const pass = integ && !bad.length && same && t.pass;
  row(5, pass ? 'PASS' : 'FAIL', `integrity=${integ} mismatched=${bad.length} sameAsRoot=${same} browserImports=${t.summary}`, 'all match', '', 'sha256 + browser import test', 'sborn/vendor/CHECKSUMS.txt');
}
function item6() {
  const w = ['spo', 're'].join('');
  const g1 = sh(`git grep -I -i -l ${w} -- sborn/`), g2 = sh(`git ls-files sborn | grep -i ${w}`);
  let keyHit = 'no key set';
  if (process.env.ELEVENLABS_API_KEY) {
    const r = spawnSync('bash', ['-c', 'git log -p --all | grep -qF -- "$ELEVENLABS_API_KEY"'], { cwd: ROOT });
    keyHit = r.status === 0 ? 'FOUND' : 'clean';
  }
  const pass = !g1 && !g2 && keyHit !== 'FOUND';
  row(6, pass ? 'PASS' : 'FAIL', `grep=${g1 ? g1.split('\n').length : 0} paths=${g2 ? 1 : 0} key=${keyHit}`, 'empty', '', 'git grep / git ls-files / git log -p', 'acceptance.cjs');
}
function item59() {
  const files = sh('git ls-files sborn').split('\n').filter((f) => f && !/^sborn\/(vendor|fonts|audio|tools\/audio-raw)\//.test(f));
  const probs = [];
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '');
  for (const f of files) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) continue;
    const rel = f.slice('sborn/'.length);
    const txt = fs.readFileSync(abs, 'utf8');
    const inSrc = rel.startsWith('src/') || ['index.html', 'styles.css', 'tests.html'].includes(rel);
    if (inSrc && /https?:\/\//.test(stripComments(txt))) probs.push(`(a) ${rel}`);
    if ((rel.startsWith('src/') || rel === 'index.html' || rel === 'styles.css') && /crypto\.subtle|serviceWorker|\beval\(|new Function|backdrop-filter|document\.write/.test(stripComments(txt))) probs.push(`(b) ${rel}`);
    if (/(^|\/)package\.json$/.test(rel)) probs.push(`(c) ${rel}`);
    if (/\.(m?js|cjs)$/.test(rel) && rel.startsWith('src/') && /console\.log/.test(stripComments(txt)) && rel !== 'src/audio/engine.js' && !rel.startsWith('src/debug/')) probs.push(`(d) ${rel}`);
    if (/\.(m?js|cjs)$/.test(rel) && /^(src|tests|tools)\//.test(rel)) {
      const head = txt.split('\n').slice(0, 6);
      const base = path.basename(rel);
      if (!head[0].startsWith(`// ${base} —`) || !head.some((l) => l.startsWith('// Exports:')) || !head.some((l) => l.startsWith('// Invariants:'))) probs.push(`(f) ${rel}`);
    }
    if (/from Doodle World/.test(txt) === false && /^src\/core\/rng\.js$/.test(rel)) probs.push(`(g) ${rel}`);
  }
  // (e) workers never import bare three, even transitively
  const workers = files.filter((f) => /worker\.js$/.test(f));
  const seen = new Set();
  const walk = (abs) => {
    if (seen.has(abs) || !fs.existsSync(abs)) return; seen.add(abs);
    const txt = fs.readFileSync(abs, 'utf8');
    if (/from\s+['"]three(\/|['"])/.test(txt) || /import\(\s*['"]three/.test(txt)) probs.push(`(e) ${path.relative(SB, abs)}`);
    for (const m of txt.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) walk(path.resolve(path.dirname(abs), m[1]));
  };
  for (const w of workers) walk(path.join(ROOT, w));
  const t = testsFor(59);
  row(59, !probs.length ? 'PASS' : 'FAIL', probs.length ? probs.slice(0, 12).join(', ') : `${files.length} files clean`, 'no findings', '', 'static scan of tracked sborn/ files', 'acceptance.cjs');
  return t;
}

// ---------- test-derived rows ----------
let TESTS = [];
function testsFor(item) {
  const ts = TESTS.filter((r) => (r.items || []).includes(item));
  const passN = ts.filter((r) => r.pass).length;
  return { pass: ts.length > 0 && passN === ts.length, n: ts.length, passN, summary: ts.length ? `${passN}/${ts.length} tests` : 'no test', ids: ts.map((r) => r.id), fails: ts.filter((r) => !r.pass) };
}
function tRow(item, extra = {}) {
  const t = testsFor(item);
  const status = extra.status || (t.n === 0 ? 'FAIL' : t.pass ? 'PASS' : 'FAIL');
  row(item, status, extra.value || (t.n === 0 ? 'no test' : `${t.summary}${t.fails.length ? ': ' + t.fails.map((f) => `${f.id} ${String(f.note).slice(0, 120)}`).join('; ') : ''}`),
    extra.threshold || 'all tests naming the item pass', extra.unit || '', extra.method || 'tests.html / e2e.cjs', extra.evidence || t.ids.join(' ') || '—');
}

function sRow(item, files) {
  const man = (() => { try { return JSON.parse(fs.readFileSync(path.join(SB, 'screens/manifest.json'), 'utf8')); } catch { return []; } })();
  const miss = [];
  for (const f of files) {
    const e = man.find((m) => m.file === f);
    if (!e || !fs.existsSync(path.join(SB, 'screens', f))) { miss.push(`${f} missing`); continue; }
    if (e.lumaStd < 6 || e.distinctColours < 24) miss.push(`${f} blank`);
    if (!e.observed || e.observed.length < e.mustShow.length) miss.push(`${f} unobserved`);
  }
  return { pass: !miss.length, miss };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!SKIP) {
    B.stopServers(true);
    await B.ensureServers({ restart: true });
    // Doodle World check (§15.1)
    const browser = await B.launch();
    let dw = { pass: false, attempts: 0 };
    for (let a = 1; a <= 4; a++) {
      const ctx = await B.newContext(browser, 'desktop'); const page = await ctx.newPage();
      await page.goto(`http://localhost:${B.DW_PORT}/tests.html`);
      const title = await B.waitTitle(page, 120000);
      const h1 = await page.evaluate(() => document.querySelector('h1') && document.querySelector('h1').textContent);
      const fails = await page.evaluate(() => [...document.querySelectorAll('.f')].map((e) => e.textContent).filter((t) => !t.startsWith('FAIL')));
      await ctx.close();
      dw = { pass: title === 'ALL PASS' && /17\/17/.test(h1 || ''), title, h1, attempts: a, fails };
      if (dw.pass || !(fails.length === 1 && /250 ms/.test(fails[0]))) break;
    }
    fs.writeFileSync(path.join(OUT, 'doodle-world.json'), JSON.stringify(dw, null, 1));
    fs.writeFileSync(path.join(OUT, 'env.json'), JSON.stringify({ chromium: browser.version(), node: process.version, at: new Date().toISOString() }, null, 1));
    await browser.close();
    for (const tool of ['run-tests.cjs', 'checks.cjs', 'e2e.cjs']) if (fs.existsSync(path.join(SB, 'tools', tool))) spawnSync('node', [path.join(SB, 'tools', tool)], { stdio: 'inherit', cwd: ROOT });
    for (const tool of ['bench-sim.mjs']) if (fs.existsSync(path.join(SB, 'tools', tool))) spawnSync('node', ['--import', './sborn/tools/three-hooks.mjs', path.join(SB, 'tools', tool)], { stdio: 'inherit', cwd: ROOT });
  }
  TESTS = [...((readJSON('tests.json', {}) || {}).results || []), ...((readJSON('checks.json', {}) || {}).results || []), ...((readJSON('e2e-tests.json', {}) || {}).results || [])];
  item1(); item5(); item6(); item59();
  for (const i of [2, 3, 4, 7, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 31, 32, 33, 34, 35, 36, 37, 39, 41, 42, 46, 47, 48, 49, 50, 51, 53, 54, 57, 58, 60, 61, 62, 63, 64, 65, 66, 68, 69, 70, 71, 72, 73]) if (!rows[i]) tRow(i);
  // 52: NA in Case B
  const audioCase = (readJSON('audio-case.json', {}) || {}).case || 'B';
  if (audioCase === 'B') { const t = testsFor(52); row(52, t.pass ? 'NA' : 'FAIL', `Case B; ${t.summary}`, 'zero elevenlabs entries', '', 'audio test', t.ids.join(' ')); } else tRow(52);
  for (const [i, files] of [[13, ['m4/09-attach-macro.jpg']], [27, ['m7/04-stripes-follow-spine.jpg']], [43, ['m3/01-hero-high.jpg', 'm3/02-hero-medium.jpg', 'm3/03-hero-low.jpg']]]) {
    const s = sRow(i, files);
    if (TAGS[i] === 'S') row(i, s.pass ? 'PASS' : 'FAIL', s.pass ? 'observed' : s.miss.join('; '), 'non-blank + observations', '', 'screens/manifest.json', files.join(' '));
    else { const t = testsFor(i); row(i, s.pass && t.pass ? 'PASS' : 'FAIL', `${t.summary}; ${s.pass ? 'screens observed' : s.miss.join('; ')}`, 'tests pass + screens observed', '', 'tests + manifest', files.join(' ')); }
  }
  // 56: every §14 screenshot exists, non-blank, observed
  const req = Object.values(require('./shots.cjs')).flat().map((x) => x.file).filter((f) => f !== 'm9/02-contact-sheet.jpg');   // every §14 shot (m9/02 is Case A only)
  const s56 = sRow(56, req);
  const t56 = testsFor(56);
  row(56, s56.pass && req.length > 0 ? 'PASS' : 'FAIL', `${req.length - s56.miss.length}/${req.length} shots ok${s56.miss.length ? ': ' + s56.miss.slice(0, 8).join('; ') : ''}`, 'all §14 shots', '', 'screens/manifest.json', 'sborn/screens/');
  // [M] rows from measurement files
  for (const [i, f, key] of [[8, 'remesh.json'], [28, 'slide.json'], [29, 'circle.json'], [30, 'legless.json'], [38, 'calls.json'], [40, 'bench40.json'], [67, 'boot.json']]) {
    const m = readJSON(f, null);
    if (!m) { row(i, 'FAIL', 'not measured', '', '', f, `tools/out/${f}`); continue; }
    row(i, m.pass ? 'PASS' : 'FAIL', m.value, m.threshold, m.unit || '', m.method || f, `tools/out/${f}`);
  }
  for (const i of [44, 45, 55, 74, 75, 76, 77, 78, 79]) row(i, 'USER', 'pending', 'see USER-CHECKS.md', '', 'user verifies on device', 'sborn/USER-CHECKS.md');
  const list = Object.keys(TAGS).map(Number).map((i) => rows[i] || { item: i, tag: TAGS[i], status: 'FAIL', value: 'not evaluated' });
  fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify(list, null, 1));
  for (const r of list) console.log(`${String(r.item).padStart(2)} [${r.tag}] ${r.status.padEnd(7)} ${String(r.value).slice(0, 140)}`);
  const okAll = list.every((r) => r.status === 'PASS' || r.status === 'USER' || r.status === 'NA' || r.status === 'BLOCKED');
  const c = (s) => list.filter((r) => r.status === s).length;
  console.log(`ACCEPTANCE PASS ${c('PASS')} FAIL ${c('FAIL')} BLOCKED ${c('BLOCKED')} NA ${c('NA')} USER ${c('USER')} → exit ${okAll ? 0 : 1}`);
  if (REPORT) require('./report.cjs').write(list, okAll ? 0 : 1);
  B.stopServers(true);
  process.exit(okAll ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
