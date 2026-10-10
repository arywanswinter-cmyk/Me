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
- **Everywhere:** 1/2/3 switch tabs, M mutes, Cmd/Ctrl+Z undoes.

## Sounds
See "Audio" below and in the Final report.

## Troubleshooting
- Over LAN http, iPadOS hides share, clipboard, `storage.persist` and `audioSession`, so pictures save through the press-and-hold menu: press and hold the photo or card, then choose Save to Photos.
- Opening `index.html` straight from the disk shows a picture of `run.command`: modules cannot load from `file://`.

## Open failures
- **Items 28/29 (slide test, `tools/out/bench-sim.json`):** 42 of 46 rows pass. Failing, all from reach-limited steps: hexapod run (drift max 143 mm, 6/126 reach-limited), tripod run (drift p95 179 mm, 35/52), Clatter walk (max 70 mm, 11/129) and Clatter circle (p95 26 mm, 14/242). A stride cap from leg geometry fixed these but broke the quads (tried 4 variants, logged in DECISIONS). Revisited in M11.
- **Item 8 (remesh timing):** worker-internal p95 on the 40-part fixture: full 99.9 ms (limit 90) in this 4 vCPU software-GL container; preview now 13.2 ms (limit 15, passes). Revisited in M11.

## Status
| M | status | commit | tests |
|---|---|---|---|
| M0 | done | f6286cc | 6/6 |
| M1 | done (item 8 timing open) | 652bd6b | 19/19 |
| M2 | done — **playable from here** (build, paint a base colour, walk on a meadow) | a256a1c | 19/19 + smoke 2/2 |
| M3 | done (GTAO and PCSS deferred, see DECISIONS) | ca8032d | 19/19 + checks 26, 37, 39, 43, 61 + smoke 2/2 |
| M4 | done — all 70 parts, 8 starters, thumbnails, p-handles, skinned anchors | d816296 | 25/25 + checks 12, 13, 15 + smoke |
| M5 | done — gaits, slither/hop, turning, springs, flight and gliding, 7 emotes, `bench-sim.mjs` (4 slide rows open) | (this checkpoint) | 29/29 + bench 42/46 + smoke |

## Checklist status
Filled in by `node sborn/tools/acceptance.cjs --report`.

## Final report
Not yet written.
