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
- **Items 28/29 (slide test, `tools/out/bench-sim.json`):** 42 of 46 rows pass. Failing, all from reach-limited steps: hexapod run (drift max 143 mm, 6/126 reach-limited), tripod run (drift p95 179 mm, 35/52), Clatter walk (max 70 mm, 11/129) and Clatter circle (p95 26 mm, 14/242). A stride cap from leg geometry fixed these but broke the quads (tried 4 variants, logged in DECISIONS). Revisited in M11.
- **Island foot drift (item 28 island report, report-only):** no NaN and no penetration over 1 cm on the island bench path (22/22 rows), but foot drift max reaches 100–390 mm on slopes and at waypoint turns, mostly in reach-limited stances. Revisited in M11.
- **Smoke walk (intermittent):** the smoke creature is built by input, so its fattened vertebra varies a little per run. With the iPad run's creature (`tools/out/tmp/smoke-ipad.json`) four stances in the first 2 s become reach-limited and slide 28–128 mm (p95 74 mm over 32 stances): its legs are short for its body, so a trailing foot reaches full stretch while the body lowering is already at its 0.45 L cap. Tried: (1) pacing the body by the trailing foot's stretch — that creature's drift p95 fell to 0 mm, but the bench fell from 64/68 to 58/68 rows (slower bodies lengthen stances); (2) capping speed until every leg has stepped once — bench unchanged (64/68), that creature still 73 mm. Both reverted; the latest smoke run passed in both contexts. Revisited with item 28 in M11.
- **Intermittent harness error:** headless Chromium sometimes rejects a pending `page.evaluate(() => ready())` with "Execution context was destroyed" during boot, although the page stays loaded (no navigation event; later evaluates work). The test tools now retry that one error up to 3 times and count each retry in `tools/out/harness-retries.json`.
- **Item 8 (remesh timing):** worker-internal p95 on the 40-part fixture: full 99.9 ms (limit 90) in this 4 vCPU software-GL container; preview now 13.2 ms (limit 15, passes). Revisited in M11.

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
| M10 | done — autosave (mirror + IndexedDB), gallery with turntables and starters, Paint like, card PNG, share link and bubble, GLB, `?bench` | (this checkpoint) | 35/35 + checks 46, 48–50, 67, 68, 71 (47 fails on item 28's Clatter walk) + smoke |

## Checklist status
Filled in by `node sborn/tools/acceptance.cjs --report`.

## Final report
Not yet written.
