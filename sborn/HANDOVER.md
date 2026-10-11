# Sborn handover

Notes for the next coding agent taking over Sborn. Written 11 Oct 2026, after the first full build.

## What Sborn is
A kid-friendly browser game: grow a creature from a bendy spine, pull out limbs, snap on 70 parts, paint it in three layers, then press Play to walk it around an island. It recreates the mechanics of a 2008 creature-creator game ("the reference game"), never its name, art or sounds. Desktop (mouse and keyboard) and iPad (touch).

- **Spec:** `prompts/sborn-master-prompt.md` at the repo root. It is the source of truth for every number, rule and checklist item (§16 has the 79-item checklist).
- **History of choices:** `sborn/DECISIONS.md`, one dated section per milestone.
- **Status and full test report:** `sborn/README.md` (Open failures, Status table, Final report with the checklist table).
- **Code:** GitHub `arywanswinter-cmyk/Me`, pull request #1 (https://github.com/arywanswinter-cmyk/Me/pull/1), still open. `main` holds only Doodle World and does not have Sborn yet.

## Where things stand
- Milestones M0–M11 are done and pushed. The acceptance run on a fresh clone was verified at commit `3a95bc9`; the final report commit is `41fd029`.
- Acceptance: 65 of 70 automated rows PASS, 4 FAIL (items 8, 28, 29, 47), 1 NA (item 52, no audio key), 9 USER rows that need a real device or person (`sborn/USER-CHECKS.md`).
- Sounds are soft placeholders made in the browser (audio Case B). No ElevenLabs sounds have been generated.

## Run and test
Requirements: Python 3 (static server), Node 22, and Playwright with Chromium for the browser tools. `tools/browser.cjs` uses `require('playwright')`; install it globally or point that line at your install.

| What | Command |
|---|---|
| Play (Mac) | double-click `sborn/run.command` (serves on http://localhost:8791 and prints an iPad LAN URL) |
| Play (any OS) | `python3 -m http.server 8791 --directory sborn`, then open http://localhost:8791 |
| Unit tests in the browser | http://localhost:8791/tests.html (`?group=mesher` for one group) |
| Unit tests headless | `node sborn/tools/run-tests.cjs` |
| Motion bench (items 28–30, 40) | `node --import ./sborn/tools/three-hooks.mjs sborn/tools/bench-sim.mjs` |
| End-to-end, input only | `node sborn/tools/e2e.cjs` (`--smoke` for the M2 smoke test) |
| Full acceptance + report | `node sborn/tools/acceptance.cjs --report` (writes `sborn/tools/out/acceptance.json`) |
| Commit and push | `bash sborn/tools/checkpoint.sh "Sborn: <what changed> (<passed>/<total> tests)"` |
| Device tools | `?debug` overlay, `?bench` 25 s benchmark, `?quality=low|medium|high`, `?test` deterministic mode |

Doodle World (the older game at the repo root) is served on port 8790 and its tests must stay at ALL PASS · 17/17.

## Code map (`sborn/src`)
- `recipe/` the creature recipe JSON: schema, quantize, canonical JSON, hash, validate, pure edit ops, undo history. The recipe is the only source of truth.
- `geo/` the skin: signed distance field of round cones (`sdf.js`), surface nets mesher (`mesher.js`) in two workers (`mesher-client.js`), recipe → shape (`shape.js`).
- `rig/` bones from spine and limbs, skin weights, skinned anchors for parts.
- `parts/` 70 parametric part builders by category, plus `assemble.js`.
- `catalog/` part data, 8 starters, 12 test fixtures, budgets, stats.
- `anim/` locomotion for any leg count (`locomotion.js`, `gait.js`, `ik.js`), springs, idle life, emotes, flight.
- `render/` stage, skin material, post-processing, tiers, environment, sky, pedestal, hatch, GPU bake, warm-up.
- `editor/` Build tab input, picking, camera. `ui/` DOM panels, icons, hints, gallery, paint panel.
- `play/` island, Play tab, photo mode, effects. `io/` autosave, IndexedDB, PNG cards, share links, GLB export.
- `audio/engine.js` WebAudio engine and placeholders. `debug/` overlay, bench, probes.

Tools are in `sborn/tools/` (each file's first line says what it does); tests are in `sborn/tests/`, with every threshold in `tests/thresholds.js`.

## Rules to keep
- No build step, no npm runtime dependencies, no `package.json`. Vanilla ES modules; three.js r170 is vendored in `sborn/vendor/`. No network requests at runtime.
- Change nothing outside `sborn/`; `checkpoint.sh` refuses to commit otherwise. Never import Doodle World code; copy it.
- Never put the reference game's name, or the branch name, in any file or path under `sborn/` (it contains that name). `checkpoint.sh` blocks it. Call it "the reference game".
- Never loosen a threshold in `tests/thresholds.js` to make a test pass. Fix the code, or record the failure honestly in README "Open failures".
- Every `.js`, `.mjs` and `.cjs` file starts with `// <file> — purpose.`, then `// Exports:` and `// Invariants:` lines.
- Log each design choice as a bullet in `DECISIONS.md`. Report only numbers from code you ran; the container's software-GL frame rates are not device performance.
- Never write, print or commit an API key.

## Open problems, most important first
1. **Feet slide in reach-limited stances (items 28, 29 and 47).** Failing: hexapod run, tripod run, the Clatter starter's walk and circle; also large drift on island slopes and turns, and occasionally in the first gait cycle from rest. Cause: a planted foot reaches full leg stretch before its step triggers, then slides. Code: `src/anim/locomotion.js`, `gait.js`, `ik.js`. Measure: the motion bench above, results in `tools/out/slide.json` and `circle.json`. Already tried and reverted: a stride cap from leg geometry (fixed these, broke the quadrupeds; 4 variants), pacing the body by the trailing foot's stretch, and a speed cap until every leg has stepped. An idea not yet tried: trigger a step early when a foot passes about 0.9 of its reach, instead of slowing the body. Item 47 fails only because Clatter fails item 28.
2. **Skin remesh time (item 8).** The full remesh p95 is about 100–120 ms in the 4 vCPU cloud container (limit 90 ms); the preview varies around the 15 ms limit. Code: `src/geo/mesher.js`. Measure on a real Mac with `?bench` before optimising.
3. **Real sounds.** All 85 sounds are placeholders. To generate them: set `ELEVENLABS_API_KEY` in the environment and allow `api.elevenlabs.io`, then run `NODE_USE_ENV_PROXY=1 node sborn/tools/gen-sounds.mjs --max-credits 50000` (the proxy flag only matters behind a proxy), then `node sborn/tools/audio-post.mjs`, then approve takes on `tools/board.html`. Estimated at about 30k credits; the run stops at the cap.
4. **Deferred graphics.** GTAO ambient occlusion and PCSS soft shadows are not built; every tier uses PCF shadows. Both are on the spec's cut list (§17).
5. **Report generator.** `tools/report.cjs` writes the branch name into the Final report header line, which breaks the naming rule. Drop `branch` from that line.
6. **Device checks.** The 9 rows in `USER-CHECKS.md` need a person with a Mac, an iPad, speakers and a child tester.

## Security note
An ElevenLabs API key was pasted into a chat on 10 Oct 2026. It was never written to this repo, but it should be revoked and replaced in the ElevenLabs dashboard before any sound generation.
