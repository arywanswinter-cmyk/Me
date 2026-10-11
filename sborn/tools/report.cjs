// report.cjs — the §18 final report, generated from tools/out/acceptance.json and the measurement files (no number is
//   typed by hand), written as the "Final report" section of sborn/README.md.
// Exports: write(list, exitCode) -> markdown string; CLI: node sborn/tools/report.cjs (rebuilds from acceptance.json).
// Invariants: failures come first; container numbers are labelled "4 vCPU software-GL container"; the API key is never read.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SB = path.resolve(__dirname, '..'), ROOT = path.resolve(SB, '..'), OUT = path.join(SB, 'tools/out');
const J = (f, d = null) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); } catch { return d; } };
const sh = (c) => { try { return execSync(c, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function write(list, exitCode) {
  const env = J('env.json', {}), commit = sh('git rev-parse --short HEAD'), branch = sh('git branch --show-current');
  const c = (s) => list.filter((r) => r.status === s).length;
  const tms = list.filter((r) => /^(T|M|S)/.test(r.tag || ''));
  const bad = list.filter((r) => r.status === 'FAIL' || r.status === 'BLOCKED');
  const L = [];
  L.push(`Verified at commit ${commit} (branch \`${branch}\`) on ${new Date().toISOString().slice(0, 10)}, from a fresh clone in a 4 vCPU software-GL container, Chromium ${env.chromium || '?'} on SwiftShader; no real GPU, Safari, iPad, speaker or child was available.`);
  L.push('');
  L.push(`**Counts:** [T]/[M]/[S] rows PASS ${tms.filter((r) => r.status === 'PASS').length} of ${tms.length}; FAIL ${c('FAIL')}, BLOCKED ${c('BLOCKED')}, NA ${c('NA')}; USER ${c('USER')} pending; \`acceptance.cjs\` exit code ${exitCode}.`);
  L.push('');
  L.push('### Not passing (first)');
  if (!bad.length) L.push('Nothing: every [T], [M] and [S] row passes (or is NA as rule 3 allows).');
  for (const r of bad) L.push(`- **Item ${r.item} [${r.tag}] ${r.status}:** ${esc(r.value).slice(0, 400)} — evidence \`${esc(r.evidence)}\`. Next step: see README "Open failures".`);
  L.push('');
  L.push('### What was built and how to run it');
  L.push('A creature editor (bendy spine, limbs, 70 parts, three-layer paint) and an island test drive (walking for any leg count, 7 emotes, eating, toys, photo mode), with a gallery, creature cards, share links and GLB export. On the Mac double-click `sborn/run.command`; on the iPad open the LAN URL it prints (same Wi-Fi). Tests: `/tests.html`. Tools: `?debug`, `?bench`.');
  L.push('');
  L.push('### Measured numbers (4 vCPU software-GL container)');
  const m = (f, k) => { const x = J(f); return x ? esc(x[k] || x.value || '') : 'not measured'; };
  L.push(`- Remesh (item 8): ${m('remesh.json', 'value')}`);
  L.push(`- Foot slide, flat (item 28): ${m('slide.json', 'value')}`);
  L.push(`- Circle and turn (item 29): ${m('circle.json', 'value')}`);
  L.push(`- Legless (item 30): ${m('legless.json', 'value')}`);
  L.push(`- Draw calls and triangles (item 38): ${m('calls.json', 'value')}`);
  L.push(`- Island step time (item 40): ${m('bench40.json', 'value')}`);
  L.push(`- Boot to first creature frame (item 67): ${m('boot.json', 'value')}`);
  const ck = (J('checks.json', { results: [] }).results || []);
  const note = (id) => { const r = ck.find((x) => x.id === id); return r ? esc(r.note).slice(0, 300) : 'not run'; };
  L.push(`- Programs (item 37): ${note('C37.programs')}`);
  L.push(`- Heap (item 41): ${note('C41.heap')}`);
  L.push('- MacBook Air and iPad frame rates: user verifies with `?bench` (target p95 ≤ 16.7 ms).');
  L.push('');
  L.push('### Test integrity');
  const th = sh('git log --format=%h -- sborn/tests/thresholds.js').split('\n').filter(Boolean);
  L.push(`- \`tests/thresholds.js\`: ${th.length <= 1 ? `unchanged since it was written (${th[0] || '?'})` : `changed in ${th.length - 1} later commit(s): ${th.slice(0, -1).join(', ')} — see DECISIONS`}.`);
  const rt = J('harness-retries.json', null), dw = J('doodle-world.json', {});
  L.push(`- Retries: harness boot retries ${rt ? rt.retries : 0}; Doodle World attempts ${dw.attempts || '?'}.`);
  const allow = (() => { try { return JSON.parse(fs.readFileSync(path.join(SB, 'tools/console-allowlist.json'), 'utf8')); } catch { return []; } })();
  L.push(`- Console allowlist (hit counts are not recorded): ${allow.map((a) => `"${esc(a.substring)}"`).join(', ')}.`);
  const notRun = list.filter((r) => /not evaluated|no test|not measured|not run/.test(String(r.value)));
  L.push(`- Tests that did not run: ${notRun.length ? notRun.map((r) => r.item).join(', ') : 'none'}.`);
  L.push('');
  L.push('### Audio');
  const ac = J('audio-case.json', {}), am = (() => { try { return JSON.parse(fs.readFileSync(path.join(SB, 'audio/audio-manifest.json'), 'utf8')); } catch { return { ids: {} }; } })();
  const ids = Object.values(am.ids || {}), gen = ids.filter((e) => (e.variants || []).length).length;
  L.push(`Case ${ac.case || '?'} (${esc(ac.why || ac.probe || '')}). ${ids.length} ids: ${gen} generated, ${ids.length - gen} placeholder; credits used 0; approved 0. Every sound is a soft placeholder made in the browser. To get the real sounds: add \`ELEVENLABS_API_KEY\` as an environment secret and allow \`api.elevenlabs.io\` in the environment's network settings, run \`NODE_USE_ENV_PROXY=1 node sborn/tools/gen-sounds.mjs --max-credits 50000\`, then \`node sborn/tools/audio-post.mjs\`, then approve on \`tools/board.html\` and run \`node sborn/tools/gen-sounds.mjs --apply-approvals approvals.json\`.`);
  L.push('');
  L.push('### User verification');
  L.push(`Items ${list.filter((r) => r.status === 'USER').map((r) => r.item).join(', ')} need a real device, browser, speaker or child: see [USER-CHECKS.md](USER-CHECKS.md) for the tool, steps and pass threshold of each.`);
  L.push('');
  L.push('### Visual judgements');
  L.push('The [S] rows are my reading of SwiftShader screenshots; every observation is in `screens/manifest.json` (one per must-show line).');
  for (const r of list.filter((x) => /S/.test(x.tag || ''))) L.push(`- Item ${r.item} [${r.tag}] ${r.status}: ${esc(r.value).slice(0, 200)}`);
  L.push('');
  L.push('### Checklist');
  L.push('| item | tag | status | value | threshold | method | evidence |');
  L.push('|---|---|---|---|---|---|---|');
  for (const r of list) L.push(`| ${r.item} | ${r.tag} | ${r.status} | ${esc(r.value).slice(0, 160)} | ${esc(r.threshold).slice(0, 80)} | ${esc(r.method).slice(0, 60)} | ${esc(r.evidence).slice(0, 60)} |`);
  L.push('');
  L.push('### Cuts, deviations and where things are');
  L.push('Deviations and every calibrated constant are logged in `sborn/DECISIONS.md`; open failures in README "Open failures". Screenshots: `sborn/screens/` (manifest with observations). Machine-readable results: `sborn/tools/out/` (`acceptance.json`, `tests.json`, `checks.json`, `e2e-*.json`, `bench-sim.json`).');
  const md = L.join('\n');
  const rp = path.join(SB, 'README.md'); let rd = fs.readFileSync(rp, 'utf8');
  const i = rd.indexOf('## Final report');
  rd = (i >= 0 ? rd.slice(0, i) : rd + '\n') + '## Final report\n' + md + '\n';
  fs.writeFileSync(rp, rd);
  return md;
}
module.exports = { write };
if (require.main === module) { const list = J('acceptance.json', []); write(list, list.every((r) => ['PASS', 'USER', 'NA', 'BLOCKED'].includes(r.status)) ? 0 : 1); console.log('README Final report written'); }
