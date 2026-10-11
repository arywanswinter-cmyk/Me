# Sborn

Grow a creature from a bendy spine, pull out legs and arms, snap on mouths, eyes, wings and horns, paint it in three layers, then press **Play** and watch it walk, dance, roar, eat and glide on a small island. Made for an 8-year-old who cannot read yet, deep enough for an adult to spend an hour on a six-legged beetle.

## Run
- **Mac:** double-click `run.command`. It serves this folder on http://localhost:8791 and opens it (Doodle World uses 8790).
- **iPad over the LAN:** `run.command` also prints a URL like `http://192.168.1.20:8791`. Open it in Safari on the iPad on the same Wi-Fi.
- **Tests:** http://localhost:8791/tests.html (add `?group=mesher` for one group).
- **Tools:** `?debug` shows frame timings, draw calls, programs, the tier and the audio status, with a copy button. `?bench` runs a 25-second benchmark and shows one score; tap it to copy the JSON. `?quality=low|medium|high` forces a tier.

## Controls
- **Build:** drag a card from the left drawer onto the creature. Drag the arrows at the ends of the body to grow or shrink it; drag the dots to bend it; scroll or pinch to make a part fatter. Drag a part off the body to remove it. Undo and redo sit bottom left; the mirror toggle bottom right.
- **Paint:** tap a colour, a pattern blob or a size chip on each of the three layer cards. Tap a part to cycle its tint; tap an eye to cycle its iris colour.
- **Play:** WASD or arrows to walk, Shift to run, Space to jump, click the ground to walk there (double-click runs). Keys 4–9 and 0: dance, roar, sit, sleep, wave, eat, fly. F flies or glides. P opens photo mode. Esc goes back to Build. On the iPad: tap the ground, hold to follow, use the bottom bar.
- **Photo:** drag to orbit, scroll or pinch to zoom; pick a pose, backdrop and frame; the two green buttons save a wide or square picture (on the iPad, press and hold the picture to save it to Photos).
- **Gallery** (top-left shelf button): the 8 starters on top, your creatures below, spinning. Tap one to load it. Press and hold to throw it away or copy it. The "+" button (or dropping a picture anywhere) loads a creature from a saved card or photo.
- **Share** (top-right): a creature card picture, a link (copied, or shown to select), or a 3D file (`.glb`).
- **Everywhere:** 1/2/3 switch tabs, M mutes, Cmd/Ctrl+Z undoes. Everything saves by itself.

## Sounds
Right now every sound is a soft placeholder made in the browser: no API key was available when this was built (Case B). The game is complete without them. To get the real sounds later:
1. Add your ElevenLabs key as the environment secret `ELEVENLABS_API_KEY` and allow `api.elevenlabs.io` in the environment's network settings.
2. Run `NODE_USE_ENV_PROXY=1 node sborn/tools/gen-sounds.mjs --max-credits 50000` (about 30,000 credits; `--dry-run` shows the plan first). It caches every take in `tools/audio-raw/`, so a stopped run resumes.
3. Run `node sborn/tools/audio-post.mjs` to trim, level and check them into `audio/` (needs ffmpeg: `brew install ffmpeg` on a Mac).
4. Open http://localhost:8791/tools/board.html, listen, mark keep or reject, export `approvals.json`, then run `node sborn/tools/gen-sounds.mjs --apply-approvals approvals.json`.

## Troubleshooting
- Over LAN http, iPadOS hides share, clipboard, `storage.persist` and `audioSession`, so pictures save through the press-and-hold menu: press and hold the photo or card, then choose Save to Photos.
- Opening `index.html` straight from the disk shows a picture of `run.command`: modules cannot load from `file://`.

## Open failures
- **Items 28/29 (slide test, `tools/out/bench-sim.json`):** 42 of 46 rows pass. Failing, all from reach-limited steps: hexapod run (drift max 143 mm, 6/126 reach-limited), tripod run (drift p95 179 mm, 35/52), Clatter walk (max 70 mm, 11/129) and Clatter circle (p95 26 mm, 14/242). A stride cap from leg geometry fixed these but broke the quads (tried 4 variants, logged in DECISIONS). Revisited in M11 with two more experiments (body pacing, start-up speed cap; see the smoke entry): neither helped, both reverted. Still open; item 47's autosave check fails only through the Clatter walk row.
- **Island foot drift (item 28 island report, report-only):** no NaN and no penetration over 1 cm on the island bench path (22/22 rows), but foot drift max reaches 100–390 mm on slopes and at waypoint turns, mostly in reach-limited stances. Revisited in M11 with item 28: still open.
- **Smoke walk (intermittent):** the smoke creature is built by input, so its fattened vertebra varies a little per run. With the iPad run's creature (`tools/out/tmp/smoke-ipad.json`) four stances in the first 2 s become reach-limited and slide 28–128 mm (p95 74 mm over 32 stances): its legs are short for its body, so a trailing foot reaches full stretch while the body lowering is already at its 0.45 L cap. Tried: (1) pacing the body by the trailing foot's stretch — that creature's drift p95 fell to 0 mm, but the bench fell from 64/68 to 58/68 rows (slower bodies lengthen stances); (2) capping speed until every leg has stepped once — bench unchanged (64/68), that creature still 73 mm. Both reverted; the latest smoke run passed in both contexts. Revisited with item 28 in M11.
- **Intermittent harness error:** headless Chromium sometimes rejects a pending `page.evaluate(() => ready())` with "Execution context was destroyed" during boot, although the page stays loaded (no navigation event; later evaluates work). The test tools now retry that one error up to 3 times and count each retry in `tools/out/harness-retries.json`.
- **Item 8 (remesh timing):** worker-internal p95 on the 40-part fixture: full 99.9 ms (limit 90) in this 4 vCPU software-GL container; preview 13.2 ms in M10 but 17.5 ms (limit 15) in the M11 fresh-clone run, with full 115.9 ms: the container's timing varies between runs. Not improved in M11; a real Mac is expected to be faster, but that is for the user to measure with `?bench`.

- **Report generator:** `tools/report.cjs` writes the branch name into the Final report line; it was removed from this README by hand after the verified run (only README and `tools/out` may change after it). The fix is to drop `branch` from that line in `report.cjs`.

## Status
| M | status | commit | tests |
|---|---|---|---|
| M0 | done | f6286cc | 6/6 |
| M1 | done (item 8 timing open) | 652bd6b | 19/19 |
| M2 | done — **playable from here** (build, paint a base colour, walk on a meadow) | a256a1c | 19/19 + smoke 2/2 |
| M3 | done (GTAO and PCSS deferred, see DECISIONS) | ca8032d | 19/19 + checks 26, 37, 39, 43, 61 + smoke 2/2 |
| M4 | done — all 70 parts, 8 starters, thumbnails, p-handles, skinned anchors | d816296 | 25/25 + checks 12, 13, 15 + smoke |
| M5 | done — gaits, slither/hop, turning, springs, flight and gliding, 7 emotes, `bench-sim.mjs` (4 slide rows open) | cc9ddcd | 29/29 + bench 42/46 + smoke |
| M6 | done — stats panel, hints, radial menu, gestures, names, ghost twin, e2e steps 1–2 on 3 viewports | 1fc8281 | 30/30 + checks 11, 18–19, 22–23, 66, 72 + e2e 3/3 |
| M7 | done — paint tab (layers, patterns, sizes, masks, skins, fan, dice, emote strip, shimmer) | f8b8c49 | 31/31 + checks 24, 25 + smoke |
| M8 | done — island (terrain, grass, flowers, trees, pond, sea, fruit, ball, mushrooms, wind, sun), curtain transition, iPad play bar, eating, thumps, bubbles, photo mode with saves | aefee1d | 34/34 + checks 33, 35–39 + island bench + smoke |
| M9 | done — Case B (no key): engine with file playback, placeholders, music and ambience scenes, ducking, peak guard; post-processing pipeline, board, dry run | 1a2ae8f | 34/34 + checks 54, 69, 70 |
| M10 | done — autosave (mirror + IndexedDB), gallery with turntables and starters, Paint like, card PNG, share link and bubble, GLB, `?bench` | 14fae3b | 35/35 + checks 46, 48–50, 67, 68, 71 (47 fails on item 28's Clatter walk) + smoke |
| M11 | done — `?bench`, reduced motion, leak and tier fixes, context restore, final screenshots, acceptance from a fresh clone | see Final report | 35/35 + all checks (failures listed in Final report) |

## Checklist status
Filled in by `node sborn/tools/acceptance.cjs --report`.

## Final report
Verified at commit 3a95bc9 on 2026-10-11, from a fresh clone in a 4 vCPU software-GL container, Chromium 141.0.7390.37 on SwiftShader; no real GPU, Safari, iPad, speaker or child was available.

**Counts:** [T]/[M]/[S] rows PASS 65 of 70; FAIL 4, BLOCKED 0, NA 1; USER 9 pending; `acceptance.cjs` exit code 1.

### Not passing (first)
- **Item 8 [M] FAIL:** preview p95 17.7 ms, full p95 121.1 ms (round trip p95 18.5/121.8 ms); M1 Air estimate ×0.5–0.7: full 61–85 ms — evidence `tools/out/remesh.json`. Next step: see README "Open failures".
- **Item 28 [M] FAIL:** flat 19/22 rows pass; FAIL hexapod run (drift max %, air gap, reach-limited 6/126); FAIL tripod run (drift p95 %, drift max %, air gap, reach-limited 35/52); FAIL clatter walk (drift max %, air gap, reach-limited 11/129); island report 22/22 (no NaN, penetration ≤ 1 cm) — evidence `tools/out/slide.json`. Next step: see README "Open failures".
- **Item 29 [M] FAIL:** 21/22 rows pass; FAIL clatter circle — evidence `tools/out/circle.json`. Next step: see README "Open failures".
- **Item 47 [T] FAIL:** 0/1 tests: C47.starters budgets bloop 160/13, wigglet 270/27, peepsy 610/32, trundle 1080/47, skitter 1440/63, clatter 1130/51, flapjack 940/37, — evidence `C47.starters`. Next step: see README "Open failures".

### What was built and how to run it
A creature editor (bendy spine, limbs, 70 parts, three-layer paint) and an island test drive (walking for any leg count, 7 emotes, eating, toys, photo mode), with a gallery, creature cards, share links and GLB export. On the Mac double-click `sborn/run.command`; on the iPad open the LAN URL it prints (same Wi-Fi). Tests: `/tests.html`. Tools: `?debug`, `?bench`.

### Measured numbers (4 vCPU software-GL container)
- Remesh (item 8): preview p95 17.7 ms, full p95 121.1 ms (round trip p95 18.5/121.8 ms); M1 Air estimate ×0.5–0.7: full 61–85 ms
- Foot slide, flat (item 28): flat 19/22 rows pass; FAIL hexapod run (drift max %, air gap, reach-limited 6/126); FAIL tripod run (drift p95 %, drift max %, air gap, reach-limited 35/52); FAIL clatter walk (drift max %, air gap, reach-limited 11/129); island report 22/22 (no NaN, penetration ≤ 1 cm)
- Circle and turn (item 29): 21/22 rows pass; FAIL clatter circle
- Legless (item 30): snake 1108 steps, sink 0 mm; blob 886 steps, sink 0 mm
- Draw calls and triangles (item 38): low: editor 12 main; island max main 25/50 shadow 7/10 tris 168315/200000; creature 40836; medium: editor 12 main; island max main 25/75 shadow 12/20 tris 283977/380000; creature 40836; high: editor 12 main; island max main 25/110 shadow 12/30 tris 495566/650000; creature 40836
- Island step time (item 40): p50 0.08 ms, p95 0.146 ms, max 6.855 ms (trundle, high, 1800 steps)
- Boot to first creature frame (item 67): quality=high: 26441 ms to the first creature frame (tier high); auto: 25641 ms to the first creature frame (tier medium)
- Programs (item 37): low: 32→32 (scene 28, depth 3, post 0, bake 1) cap 32 gl 0; medium: 36→36 (scene 28, depth 3, post 4, bake 1) cap 44 gl 0; high: 36→36 (scene 28, depth 3, post 4, bake 1) cap 56 gl 0
- Heap (item 41): guard ok (+3.87 MB for a 1 MB array); slope -0.286 MB/3,600 steps; samples 10.1,10.4,9.7,9.7,9.8,9.8,9.8,9.8,9.8,9.8,9.9,9.7 MB; geometries 48→49, textures 16→16
- MacBook Air and iPad frame rates: user verifies with `?bench` (target p95 ≤ 16.7 ms).

### Test integrity
- `tests/thresholds.js`: unchanged since it was written (f6286cc).
- Retries: harness boot retries 17; Doodle World attempts 1.
- Console allowlist (hit counts are not recorded): "KHR_parallel_shader_compile", "GPU stall due to ReadPixels", "audio/audio-manifest.json net::ERR_ABORTED".
- Tests that did not run: none.

### Audio
Case B (ELEVENLABS_API_KEY is empty in this environment (§12.1: key empty → Case B)). 85 ids: 0 generated, 85 placeholder; credits used 0; approved 0. Every sound is a soft placeholder made in the browser. To get the real sounds: add `ELEVENLABS_API_KEY` as an environment secret and allow `api.elevenlabs.io` in the environment's network settings, run `NODE_USE_ENV_PROXY=1 node sborn/tools/gen-sounds.mjs --max-credits 50000`, then `node sborn/tools/audio-post.mjs`, then approve on `tools/board.html` and run `node sborn/tools/gen-sounds.mjs --apply-approvals approvals.json`.

### User verification
Items 44, 45, 55, 74, 75, 76, 77, 78, 79 need a real device, browser, speaker or child: see [USER-CHECKS.md](USER-CHECKS.md) for the tool, steps and pass threshold of each.

### Visual judgements
The [S] rows are my reading of SwiftShader screenshots; every observation is in `screens/manifest.json` (one per must-show line).
- Item 13 [T+S] PASS: 2/2 tests; screens observed
- Item 27 [S] PASS: observed
- Item 43 [T+S] PASS: 1/1 tests; screens observed
- Item 56 [S+T] PASS: 72/72 shots ok

### Checklist
| item | tag | status | value | threshold | method | evidence |
|---|---|---|---|---|---|---|
| 1 | T | PASS | outside=0 dirty=0 doodle=ALL PASS · 17/17 | all empty; ALL PASS · 17/17 | git diff/status + Doodle World tests.html | tools/out/doodle-world.json |
| 2 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C02.tests-page |
| 3 | T | PASS | 2/2 tests | all tests naming the item pass | tests.html / e2e.cjs | C03.run-command C03.live-breath |
| 4 | T | PASS | 3/3 tests | all tests naming the item pass | tests.html / e2e.cjs | C04.local-desktop C04.local-ipad C04.local-ipadPortrait |
| 5 | T | PASS | integrity=true mismatched=0 sameAsRoot=true browserImports=1/1 tests | all match | sha256 + browser import test | sborn/vendor/CHECKSUMS.txt |
| 6 | T | PASS | grep=0 paths=0 key=no key set | empty | git grep / git ls-files / git log -p | acceptance.cjs |
| 7 | T | PASS | 2/2 tests | all tests naming the item pass | tests.html / e2e.cjs | C07.fixtures C07.starters |
| 8 | M | FAIL | preview p95 17.7 ms, full p95 121.1 ms (round trip p95 18.5/121.8 ms); M1 Air estimate ×0.5–0.7: full 61–85 ms | preview p95 ≤ 15, full p95 ≤ 90 ms | 50 jobs each, 40-part fixture, worker-internal, 4 vCPU softw | tools/out/remesh.json |
| 9 | T | PASS | 2/2 tests | all tests naming the item pass | tests.html / e2e.cjs | C09.geometry-hash C09.loco-hash |
| 10 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C10.spine-limits |
| 11 | T | PASS | 2/2 tests | all tests naming the item pass | tests.html / e2e.cjs | C11.ready-leg C11.bendy |
| 12 | T | PASS | 3/3 tests | all tests naming the item pass | tests.html / e2e.cjs | C12.parts C12.thumbs C12.p-handles |
| 13 | T+S | PASS | 2/2 tests; screens observed | tests pass + screens observed | tests + manifest | m4/09-attach-macro.jpg |
| 14 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C14.reresolve |
| 15 | T | PASS | 2/2 tests | all tests naming the item pass | tests.html / e2e.cjs | C15.mirror C15.centre-snap |
| 16 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C16.pose |
| 17 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C17.undo-redo |
| 18 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C18.dna |
| 19 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C19.complexity |
| 20 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C20.stats |
| 21 | T | PASS | 3/3 tests | all tests naming the item pass | tests.html / e2e.cjs | C21.build-desktop C21.build-ipad C21.build-ipadPortrait |
| 22 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C22.hints |
| 23 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C23.text |
| 24 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C24.paint |
| 25 | T | PASS | 2/2 tests | all tests naming the item pass | tests.html / e2e.cjs | C25.domain C25.junction |
| 26 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C26.swatch |
| 27 | S | PASS | observed | non-blank + observations | screens/manifest.json | m7/04-stripes-follow-spine.jpg |
| 28 | M | FAIL | flat 19/22 rows pass; FAIL hexapod run (drift max %, air gap, reach-limited 6/126); FAIL tripod run (drift p95 %, drift max %, air gap, reach-limited 35/52); FA | drift p95 ≤ 3 mm, max ≤ 10 mm; penetration p95 ≤ 2 mm; air gap ≤ 5 mm; min plant | bench-sim.mjs (table in bench-sim.json) | tools/out/slide.json |
| 29 | M | FAIL | 21/22 rows pass; FAIL clatter circle | item 28 limits on a 1.5 m circle and a 360° turn | bench-sim.mjs | tools/out/circle.json |
| 30 | M | PASS | snake 1108 steps, sink 0 mm; blob 886 steps, sink 0 mm | 10 m in ≤ 1,500 steps; sink ≤ 1 cm | bench-sim.mjs | tools/out/legless.json |
| 31 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C31.emotes |
| 32 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C32.flight |
| 33 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C33.drive |
| 34 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C34.idle |
| 35 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C35.eat-toys |
| 36 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C36.photo |
| 37 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C37.programs |
| 38 | M | PASS | low: editor 12 main; island max main 25/50 shadow 7/10 tris 168315/200000; creature 40836; medium: editor 12 main; island max main 25/75 shadow 12/20 tris 28397 | editor ≤ 40 main; island main + shadow High 110 + 30, Medium 75 + 20, Low 50 + 1 | checks.cjs drawcalls | tools/out/calls.json |
| 39 | T | PASS | 2/2 tests | all tests naming the item pass | tests.html / e2e.cjs | C39.low-vs-high C39.tiers-gl |
| 40 | M | PASS | p50 0.08 ms, p95 0.146 ms, max 6.855 ms (trundle, high, 1800 steps) | p95 ≤ 2 ms | bench-sim.mjs island40 | tools/out/bench40.json |
| 41 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C41.heap |
| 42 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C42.context |
| 43 | T+S | PASS | 1/1 tests; screens observed | tests pass + screens observed | tests + manifest | m3/01-hero-high.jpg m3/02-hero-medium.jpg m3/03-hero-low.jpg |
| 44 | U | USER | pending | see USER-CHECKS.md | user verifies on device | sborn/USER-CHECKS.md |
| 45 | U | USER | pending | see USER-CHECKS.md | user verifies on device | sborn/USER-CHECKS.md |
| 46 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C46.autosave |
| 47 | T | FAIL | 0/1 tests: C47.starters budgets bloop 160/13, wigglet 270/27, peepsy 610/32, trundle 1080/47, skitter 1440/63, clatter 1130/51, flapjack 940/37, | all tests naming the item pass | tests.html / e2e.cjs | C47.starters |
| 48 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C48.card |
| 49 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C49.link |
| 50 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C50.glb |
| 51 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C51.manifest |
| 52 | T | NA | Case B; 1/1 tests | zero elevenlabs entries | audio test | C52.case |
| 53 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C53.offline |
| 54 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C54.dry-run |
| 55 | U | USER | pending | see USER-CHECKS.md | user verifies on device | sborn/USER-CHECKS.md |
| 56 | S+T | PASS | 72/72 shots ok | all §14 shots | screens/manifest.json | sborn/screens/ |
| 57 | T | PASS | 3/3 tests | all tests naming the item pass | tests.html / e2e.cjs | C57.e2e-desktop C57.e2e-ipad C57.e2e-ipadPortrait |
| 58 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C58.tips |
| 59 | T | PASS | 244 files clean | no findings | static scan of tracked sborn/ files | acceptance.cjs |
| 60 | T | PASS | 3/3 tests | all tests naming the item pass | tests.html / e2e.cjs | C60.file-url C60.no-webgl C60.no-storage |
| 61 | T | PASS | 3/3 tests | all tests naming the item pass | tests.html / e2e.cjs | C61.user-tools C61.debug C61.mediump |
| 62 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C62.reduced-motion |
| 63 | T | PASS | 3/3 tests | all tests naming the item pass | tests.html / e2e.cjs | C63.quantize C63.hash-stable C63.validate |
| 64 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C64.client |
| 65 | T | PASS | 3/3 tests | all tests naming the item pass | tests.html / e2e.cjs | C65.boot-guess C65.calibrate C65.governor |
| 66 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C66.touch |
| 67 | M | PASS | quality=high: 26441 ms to the first creature frame (tier high); auto: 25641 ms to the first creature frame (tier medium) | measured (software GL container; device targets in items 44–45) | performance.now() at the first rendered frame with the creat | tools/out/boot.json |
| 68 | T | PASS | 2/2 tests | all tests naming the item pass | tests.html / e2e.cjs | C68.undo-cap C68.sizes |
| 69 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C69.audio-files |
| 70 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C70.pipeline |
| 71 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C71.link-bubble |
| 72 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C72.non-reader |
| 73 | T | PASS | 1/1 tests | all tests naming the item pass | tests.html / e2e.cjs | C73.font |
| 74 | U | USER | pending | see USER-CHECKS.md | user verifies on device | sborn/USER-CHECKS.md |
| 75 | U | USER | pending | see USER-CHECKS.md | user verifies on device | sborn/USER-CHECKS.md |
| 76 | U | USER | pending | see USER-CHECKS.md | user verifies on device | sborn/USER-CHECKS.md |
| 77 | U | USER | pending | see USER-CHECKS.md | user verifies on device | sborn/USER-CHECKS.md |
| 78 | U | USER | pending | see USER-CHECKS.md | user verifies on device | sborn/USER-CHECKS.md |
| 79 | U | USER | pending | see USER-CHECKS.md | user verifies on device | sborn/USER-CHECKS.md |

### Cuts, deviations and where things are
Deviations and every calibrated constant are logged in `sborn/DECISIONS.md`; open failures in README "Open failures". Screenshots: `sborn/screens/` (manifest with observations). Machine-readable results: `sborn/tools/out/` (`acceptance.json`, `tests.json`, `checks.json`, `e2e-*.json`, `bench-sim.json`).
