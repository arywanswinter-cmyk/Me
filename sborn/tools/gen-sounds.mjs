// gen-sounds.mjs — bakes the 85 sound ids with the ElevenLabs sound-generation and music APIs into cached raws.
// Exports: nothing (CLI: node gen-sounds.mjs [--only 'vo.jaw.*'] [--dry-run] [--concurrency 2] [--max-credits 50000] [--force]
//          [--reprocess] [--apply-approvals approvals.json]); post-processing lives in audio-post.mjs.
// Invariants: reads ELEVENLABS_API_KEY from the environment only and never prints, logs or writes it (nor any header
//   value); --dry-run opens no socket; raws are cached by rawHash and never re-bought; credits are summed across runs
//   from gen-log.jsonl and the run stops cleanly before the cap; exit 0 all done, 1 some failed, 2 fatal.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(HERE, 'sound-manifest.json'), 'utf8'));
const RAW = path.join(HERE, 'audio-raw');
const LOG = path.join(RAW, 'gen-log.jsonl');
const LOCK = path.join(RAW, '.lock');
const API = 'https://api.elevenlabs.io';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const DRY = flag('--dry-run'), FORCE = flag('--force');
let concurrency = +opt('--concurrency', 2);
const CAP = +opt('--max-credits', 50000);
const only = opt('--only', null);
const matchOnly = (id) => !only || new RegExp('^' + only.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(id);

// ---- manifest validation: no talking, no onomatopoeia in voice phrases, anchors and timbres ----
const BANNED = ['says', 'talks', 'words', 'woof', 'meow', 'oink', 'moo', 'tweet', 'quack', 'ribbit', 'bzz', 'hiss', 'ruff', 'baa'];
function validateManifest() {
  const errs = [];
  if (MANIFEST.ids.length !== 85) errs.push(`expected 85 ids, got ${MANIFEST.ids.length}`);
  for (const e of MANIFEST.ids) if (e.group === 'voice') for (const w of BANNED) if (new RegExp(`\\b${w}\\b`, 'i').test(e.prompt)) errs.push(`${e.id}: banned "${w}"`);
  return errs;
}

// ---- requests and hashing ----
const canon = (x) => (x === null || typeof x !== 'object' ? JSON.stringify(x) : Array.isArray(x) ? `[${x.map(canon).join(',')}]` : `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`);
function requestFor(e, variant, format) {
  if (e.api === 'music') {
    const p = e.plan;
    const prompt = `${p.style}; ${p.instruments.join(', ')}; ${p.bpm} BPM, ${p.key}${p.meter ? ', ' + p.meter : ''}${p.dynamics ? ', ' + p.dynamics : ''}, instrumental. Avoid: ${p.negatives.join(', ')}.`;
    return { api: 'music', text: prompt, duration: e.seconds, influence: null, loop: true, format, plan: p, variant };
  }
  const suf = MANIFEST.suffixes[e.suffix || e.group] || MANIFEST.suffixes.ui;
  return { api: 'sfx', text: `${e.prompt}, ${suf.text}`, duration: e.seconds, influence: suf.influence, loop: !!e.loop, format, plan: null, variant };
}
const rawHash = (req) => crypto.createHash('sha256').update(canon(req)).digest('hex');
const estimate = (req) => (req.api === 'music' ? Math.ceil((req.duration / 60) * 1000) : Math.ceil(req.duration * 40));
function cachedRaw(id, i, h) { const f = path.join(RAW, id, `${i}-${h.slice(0, 12)}.mp3`); return fs.existsSync(f) ? f : null; }
function spentSoFar() {
  if (!fs.existsSync(LOG)) return 0;
  let s = 0;
  for (const line of fs.readFileSync(LOG, 'utf8').split('\n')) { if (!line.trim()) continue; try { const j = JSON.parse(line); if (j.status === 200) s += j.cost || 0; } catch {} }
  return s;
}
function plan(format) {
  const items = [];
  const crit = new Set(MANIFEST.priority.critical);
  const starterFamilies = new Set(['jaw', 'beak', 'snout', 'mandible', 'filter']);
  const prio = (e) => (crit.has(e.id) ? 1 : e.group === 'voice' && starterFamilies.has(e.family) ? 2 : /^mv\.(step|wing)/.test(e.id) ? 3 : e.api === 'music' ? 4 : 5);
  for (const e of MANIFEST.ids) {
    if (!matchOnly(e.id)) continue;
    for (let i = 0; i < e.generate; i++) {
      const req = requestFor(e, i, format);
      const h = rawHash(req);
      items.push({ e, i, req, h, prio: prio(e), cached: !FORCE && !!cachedRaw(e.id, i, h) });
    }
  }
  items.sort((a, b) => a.prio - b.prio || a.e.id.localeCompare(b.e.id) || a.i - b.i);
  return items;
}

function isMp3(buf) { return buf.length >= 1024 && ((buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function logLine(o) { fs.mkdirSync(RAW, { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ ...o, time: new Date().toISOString() }) + '\n'); }

async function call(item, key) {
  const { req, e } = item;
  let url, body;
  if (req.api === 'music') {
    url = `${API}/v1/music?output_format=${req.format}`;
    const p = req.plan;
    body = { composition_plan: { positive_global_styles: [p.style, ...p.instruments, `${p.bpm} BPM`, p.key, 'instrumental'], negative_global_styles: p.negatives,
      sections: p.sections.map((s) => ({ section_name: s.name, positive_local_styles: [p.style, ...(s.note ? [s.note] : [])], negative_local_styles: p.negatives, duration_ms: s.seconds * 1000, lines: [] })) } };
  } else {
    url = `${API}/v1/sound-generation?output_format=${req.format}`;
    body = { text: req.text, duration_seconds: req.duration, prompt_influence: req.influence };
    if (req.loop) body.loop = true;
  }
  let tries = 0, fellBack = false;
  for (;;) {
    tries++;
    const t0 = Date.now();
    let res, status = 0, buf = null, detail = null;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify(body) });
      status = res.status;
      if (status === 200) buf = Buffer.from(await res.arrayBuffer());
      else { try { detail = (await res.json()).detail; } catch { detail = null; } }
    } catch (err) { status = 0; detail = { status: 'network', message: String(err.cause?.code || err.message).slice(0, 80) }; }
    const cost = res && res.headers.get('character-cost') ? +res.headers.get('character-cost') : estimate(req);
    const ds = detail && typeof detail === 'object' ? detail.status : null;
    logLine({ id: e.id, variant: item.i, hash: item.h.slice(0, 12), status, detailStatus: ds, requestId: res ? res.headers.get('request-id') : null, cost: status === 200 ? cost : 0, ms: Date.now() - t0, model: res ? res.headers.get('x-model-id') || null : null });
    if (status === 200) {
      if (!isMp3(buf)) return { ok: false, why: 'not mp3' };
      const dir = path.join(RAW, e.id); fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, `${item.i}-${item.h.slice(0, 12)}.mp3`);
      fs.writeFileSync(f + '.part', buf); fs.renameSync(f + '.part', f);
      return { ok: true, cost };
    }
    if (ds === 'quota_exceeded' || status === 402 || status === 401) return { fatal: true, why: `${status} ${ds}` };
    if (status === 403) { if (req.api === 'music') return { skipMusic: true, why: '403 music not on plan' }; return { fatal: true, why: `403 ${ds}` }; }
    if (req.api === 'music' && ds === 'bad_prompt' && !fellBack) {
      fellBack = true;
      const sug = detail && detail.data && detail.data.prompt_suggestion;
      body = { prompt: sug || req.text, music_length_ms: req.duration * 1000, force_instrumental: true };
      continue;
    }
    if (req.api === 'music' && !fellBack && (status === 400 || status === 422)) { fellBack = true; body = { prompt: req.text, music_length_ms: req.duration * 1000, force_instrumental: true }; continue; }
    if (status === 400 || status === 422) return { ok: false, why: `${status} ${ds}` };
    if (status === 429 && ds === 'too_many_concurrent_requests') { concurrency = Math.max(1, concurrency - 1); await sleep(1500); if (tries < 6) continue; }
    if ((status === 429 || status === 408 || status >= 500 || status === 0) && tries < 6) {
      const ra = res && +res.headers.get('retry-after');
      await sleep((ra ? ra * 1000 : 1000 * 2 ** tries) * (0.75 + Math.random() * 0.5));
      continue;
    }
    return { ok: false, why: `${status} ${ds}` };
  }
}

async function main() {
  const errs = validateManifest();
  if (errs.length) { console.error('manifest invalid:\n' + errs.join('\n')); process.exit(2); }
  if (flag('--apply-approvals')) { const { applyApprovals } = await import('./audio-post.mjs'); process.exit(applyApprovals(opt('--apply-approvals'))); }
  if (flag('--reprocess')) { const { postProcess } = await import('./audio-post.mjs'); process.exit(await postProcess()); }
  const format = opt('--format', 'mp3_44100_128');
  const items = plan(format);
  const todo = items.filter((x) => !x.cached);
  const sfxTodo = todo.filter((x) => x.req.api === 'sfx'), musTodo = todo.filter((x) => x.req.api === 'music');
  const est = todo.reduce((a, x) => a + estimate(x.req), 0);
  const ids = [...new Set(items.map((x) => x.e.id))];
  const spent = spentSoFar();
  console.log(`[gen-sounds] ${ids.length} ids · ${sfxTodo.length} SFX generations to make (${items.filter((x) => x.req.api === 'sfx').length - sfxTodo.length} cached) · music ${musTodo.reduce((a, x) => a + x.req.duration, 0)} s · estimate ${est} credits · spent so far ${spent} · cap ${CAP}`);
  if (DRY) { for (const id of ids) console.log(`  ${id}`); console.log(`[gen-sounds] dry run: no requests made`); return 0; }
  const key = process.env.ELEVENLABS_API_KEY || '';
  if (!key) { console.log('[gen-sounds] ELEVENLABS_API_KEY is not set: nothing generated (Case B). Placeholders will play.'); return 2; }
  if (fs.existsSync(LOCK)) { const age = Date.now() - fs.statSync(LOCK).mtimeMs; if (age < 3 * 3600e3) { console.error('[gen-sounds] another run holds the lock'); return 2; } }
  fs.mkdirSync(RAW, { recursive: true }); fs.writeFileSync(LOCK, String(process.pid));
  let total = spent, failed = 0, fatal = null, done = 0, skipMusic = false, n = 0;
  const queue = todo.slice();
  async function worker() {
    while (queue.length && !fatal) {
      const item = queue.shift();
      if (skipMusic && item.req.api === 'music') continue;
      const e = estimate(item.req);
      if (total + e > CAP) { fatal = fatal || 'cap'; queue.length = 0; break; }
      const r = await call(item, key);
      n++;
      if (r.fatal) { fatal = r.why; break; }
      if (r.skipMusic) { skipMusic = true; continue; }
      if (r.ok) { total += r.cost; done++; } else failed++;
      if (n % 25 === 0) console.log(`[gen-sounds] ${done} made · ${failed} failed · ${total} credits`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  fs.rmSync(LOCK, { force: true });
  console.log(`[gen-sounds] done ${done}, failed ${failed}, credits ${total}${fatal ? `, stopped: ${fatal}` : ''}${skipMusic ? ', music skipped (403)' : ''}`);
  if (fatal === 'cap') { console.log(`[gen-sounds] cap reached; resume with: NODE_USE_ENV_PROXY=1 node sborn/tools/gen-sounds.mjs --max-credits ${CAP}`); return 1; }
  if (fatal) return 2;
  return failed ? 1 : 0;
}
main().then((c) => process.exit(c), (e) => { console.error(String(e).slice(0, 300)); process.exit(2); });
