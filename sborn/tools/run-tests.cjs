// run-tests.cjs — runs tests.html one group per page in headless Chromium; writes tools/out/tests.json.
// Exports: nothing (CLI: node sborn/tools/run-tests.cjs [--group a,b] [--milestone k]).
// Invariants: each group gets its own fresh page; console errors outside the allowlist fail the run;
//   prints one summary line "TESTS <passed>/<total>" plus one line per failure.
const fs = require('fs');
const path = require('path');
const B = require('./browser.cjs');

(async () => {
  const args = process.argv.slice(2);
  const gi = args.indexOf('--group');
  const groupsSrc = fs.readFileSync(path.join(B.SB, 'tests/run.js'), 'utf8').match(/GROUPS = \[([^\]]*)\]/)[1];
  let groups = groupsSrc.split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
    .filter((g) => fs.existsSync(path.join(B.SB, `tests/${g}.test.js`)));
  if (gi >= 0) groups = args[gi + 1].split(',');
  await B.ensureServers();
  const browser = await B.launch();
  const all = [], tally = { bad: [], allowed: {} };
  for (const g of groups) {
    const ctx = await B.newContext(browser, 'small');
    const page = await ctx.newPage();
    B.watchPage(page, tally);
    const t0 = Date.now();
    await page.goto(`http://localhost:${B.PORT}/tests.html?group=${g}`);
    const title = await B.waitTitle(page, 900000);
    const res = await page.evaluate(() => window.__results || []);
    const mets = await page.evaluate(() => window.__metrics || {});
    for (const [k, v] of Object.entries(mets)) fs.writeFileSync(path.join(B.SB, `tools/out/${k}.json`), JSON.stringify({ ...v, ranAt: new Date().toISOString() }, null, 1));
    for (const r of res) all.push({ ...r, group: g });
    if (title === 'TIMEOUT') all.push({ id: `timeout.${g}`, name: 'group timeout', pass: false, group: g, items: [], note: 'timeout' });
    process.stderr.write(`  ${g}: ${res.filter((r) => r.pass).length}/${res.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
    await ctx.close();
  }
  await browser.close();
  const prev = fs.existsSync(path.join(B.SB, 'tools/out/tests.json')) && gi >= 0 ? JSON.parse(fs.readFileSync(path.join(B.SB, 'tools/out/tests.json'), 'utf8')).results || [] : [];
  const merged = gi >= 0 ? [...prev.filter((r) => !groups.includes(r.group)), ...all] : all;
  const passed = merged.filter((r) => r.pass).length;
  fs.mkdirSync(path.join(B.SB, 'tools/out'), { recursive: true });
  fs.writeFileSync(path.join(B.SB, 'tools/out/tests.json'), JSON.stringify({ ranAt: new Date().toISOString(), passed, total: merged.length, console: tally, results: merged }, null, 1));
  for (const r of all.filter((r) => !r.pass)) console.log(`FAIL ${r.id} ${r.name}: ${String(r.note).slice(0, 300)}`);
  for (const b of tally.bad.slice(0, 10)) console.log(`CONSOLE ${b}`);
  console.log(`TESTS ${passed}/${merged.length}${tally.bad.length ? ` · ${tally.bad.length} console problems` : ''}`);
  B.stopServers();
  process.exit(passed === merged.length && !tally.bad.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
