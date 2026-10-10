> **For the human, not part of the instructions.** This is a one-shot build prompt: a fresh cloud coding session follows it to build **Sborn**, a kid-friendly creature editor and test drive, in a new `sborn/` folder, leaving Doodle World untouched.
> 0. This file lives on branch `claude/spore-creature-builder-wy1i3f`. New sessions start from `main`, so merge that branch into `main` first (open and merge its pull request), or start the build session from that branch.
> 1. For real generated sounds, open the cloud environment menu in the session title bar → **Edit** → **Network secrets** (called **API credentials** in older app versions) and add `ELEVENLABS_API_KEY`. If that section is missing, add it as an environment variable.
> 2. In the same dialog, under **Network access**, keep the **Limited** level, add `api.elevenlabs.io` under **Allowed domains**, and leave **Allow package managers** ticked: the build needs registry.npmjs.org. (Older apps show this under **Custom**, with a box to include the default package managers.)
> 3. Use a paid ElevenLabs plan. The full bake is estimated at about 30k credits and the build stops at 50k, so make sure your plan has at least 50k credits left.
> 4. Keep the cost down: run the build as a single agent with ultracode (multi-agent mode) off, and check your credit meter after milestones M1 and M2. Every milestone is pushed and the run resumes cleanly, so you can stop at any point and continue in a later session by saying the same sentence again.
>
> Then start a new session in this repo and say: **Follow prompts/sborn-master-prompt.md**. Without the key the game still builds and plays with soft synthesized placeholder sounds, and `sborn/README.md` explains how to generate the real ones later. Everything below the line is addressed to the building agent.

---

# Sborn: master build prompt

You are building **Sborn**, a browser game in this repository that recreates the *mechanics* of the Spore (2008) Creature Creator ("the reference game" from here on): grow a body from a bendy spine, pull out limbs, snap on parts, paint in three layers, then press Play to watch the creature walk, dance, roar, eat and glide on a small island. The user's design answers are folded in and binding. Read this whole file before starting (in chunks with offset and limit if Read refuses it whole), then build the whole game in this run, in the milestone order of §14, and hand it over working.

## 1. Mission
- **Feeling.** Alive from the first frame: it breathes, blinks and watches the cursor. Every touch gets a soft, squishy, bubbly answer in motion, sound and the creature's own reaction. An 8-year-old who cannot read makes a creature they love within 3 minutes; an adult can spend an hour on a six-legged beetle whose stripes follow its curved back. Nothing scary or punishing: limits are gentle bonks and wobbles.
- **Look.** A premium vinyl toy in a soft studio, Pixar-toy quality: soft, slightly glossy skin with light glowing through thin ears and fins, bumpy detail, big wet expressive eyes with catchlights, colours that match the tapped swatch.
- **Scope.** Build, Paint, Play (island test drive), photo mode, gallery and sharing, on desktop (mouse and keyboard) and iPad (touch). No combat, other stages or online service.

## 2. Rules
1. **One shot, no questions.** Nobody is watching. When something is unspecified, decide, add a bullet to `sborn/DECISIONS.md`, and continue.
2. **Never fake results.** Every reported number comes from code you ran; never present software-GL frame rates as device performance. What the container cannot check is exactly the [U] items of §16 ("user verifies on device", with tool, steps and threshold).
3. **Done means acceptance.** You are done when `node sborn/tools/acceptance.cjs` exits 0 on a fresh clone of your pushed branch (§15.5), or when rule 4 ends the run with honest FAIL rows. Each §16 item gets exactly one status: **PASS**; **FAIL**; **USER**, only for items pre-tagged [U] (44, 45, 55, 74–79), and never re-tag an item [U]; **BLOCKED**, only for a proxy policy block, a missing secret or a tool you are forbidden to install (such as WebKit), with the cause, command and output pasted (software-GL slowness, flaky tests and hard algorithms are never BLOCKED); **NA**, only where an item says so.
4. **Time-box and honesty.** Log `date -u` when M0 starts. Boxes in hours: M0 1, M1 6, M2 4, M3 6, M4 5, M5 5, M6 2, M7 4, M8 2, M9 3, M10 4. If an exit criterion still fails after 1.5× its box, or after 3 distinct fixes without measured improvement, record it under README "Open failures" with the measured number, set its §16 row FAIL, checkpoint, continue, and revisit it in M10; when M10's box is spent too, finish with the final report, failures first. Tests assert this document's thresholds, sample sizes and fixtures verbatim (kept in `sborn/tests/thresholds.js`); never loosen one to pass. Log before/after values and data for every constant you calibrate.
5. **Checkpoint = commit + push, only through `sborn/tools/checkpoint.sh`**, written in M0 exactly as:
   ```bash
   #!/bin/bash
   # checkpoint.sh — scan, commit and push sborn/; exits 0 only when origin has HEAD.
   # Exports: nothing. Invariants: never prints the key; never force-pushes.
   set -uo pipefail
   cd "$(git rev-parse --show-toplevel)" || exit 1
   git add -A sborn
   if [ -n "${ELEVENLABS_API_KEY:-}" ] && git grep --cached -qF -- "$ELEVENLABS_API_KEY"; then git reset -q; echo 'BLOCKED: key in staged files'; exit 3; fi
   w='spo''re'
   if git grep --cached -qiI "$w" -- sborn/ || git ls-files sborn | grep -qi "$w"; then git grep --cached -liI "$w" -- sborn/; echo 'BLOCKED: IP word'; exit 4; fi
   if [ -n "$(git status --porcelain --untracked-files=all -- . ':!sborn' ':!prompts/sborn-master-prompt.md')" ]; then echo 'BLOCKED: changes outside sborn/'; exit 5; fi
   git diff --cached --quiet || git commit -q -m "$1" || exit 1
   br=$(git branch --show-current)
   for s in 0 2 4 8 16; do sleep $s; git push -q -u origin HEAD && break; done
   [ "$(git rev-parse HEAD)" = "$(git ls-remote origin "refs/heads/$br" | cut -f1)" ] && echo "PUSHED $(git rev-parse --short HEAD)" || { echo 'PUSH NOT CONFIRMED'; exit 6; }
   ```
   Run `bash sborn/tools/checkpoint.sh "Sborn Mn: <title> (<passed>/<total> tests)"` (counts from `run-tests.cjs`) at every milestone exit (exit 0 and PUSHED required), after each finished deliverable, and at least every 90 minutes. On exit 6, keep working, retry at later checkpoints, and list unpushed commits in the report. Stay on your branch; never force-push or rewrite history.
6. **IP: copy mechanics, never assets.** Never use the reference game's name, logo, part names, art, sounds, music or text. No file under `sborn/` may contain the name (any case) or carry it in its path (code that tests for it builds the word from pieces, as checkpoint.sh does); write "the reference game" in DECISIONS; never write the branch name into `sborn/`. Shapes, icons, names, code and sound prompts are original, and sound prompts never name artists, games or soundtracks. If a §7 name matches a reference-game part name you recognise, rename it, keep its id, and log it.
7. **Do not break Doodle World.** Change nothing outside `sborn/`, including `prompts/` (never commit it yourself). Copy reused code into `sborn/`; never import across games. Doodle World's tests must still show ALL PASS · 17/17 (§15.1).
8. **Kid-safe.** Icon-first UI; the only visible text is numbers and the creature's name. Big, forgiving targets. Every tooth, horn, claw, spike and beak tip is rounded (tip radius ≥ 0.15 × base radius). Roars are puffed-up and cute; nothing dark or frightening.
9. **Secrets.** Read `ELEVENLABS_API_KEY` from the environment only; never print, log, write or commit it.
10. **Offline at runtime.** No network requests: no CDNs, no remotely hosted fonts, no APIs. The local Fredoka woff2 in `fonts/` loads through `@font-face`.
11. **Resuming.** `git fetch origin && git log --all --oneline --grep='^Sborn M' | head`; if another branch holds Sborn commits yours lacks, `git merge --no-edit <that branch>` (never rebase or force). Read README (status table), DECISIONS and `git log`, re-run the tests, and continue from the first milestone not marked done.
12. **Re-read before each milestone** its §14 entry and every section it cites (Read on `prompts/sborn-master-prompt.md`). Constants are exact; never work from memory.
13. **Cost discipline.** The user pays per token from a fixed budget, so the cost is set by how long the session runs and how much enters your context. Work as a single agent: do not launch subagents, workflows or parallel agent fleets. Keep tool output short: pipe logs and test runs through `tail -n 40` or `grep`, and write long output to files under `tools/out/` instead of printing it. Wait for long jobs with background mode and notifications, never by polling or `sleep` loops. View screenshots as 640-px-wide copies, each one once, and again only after a fix (§15.3). Re-read only the sections the current milestone cites, never the whole file again. When a fix fails twice, stop and reason before trying a third time; rule 4 still ends any loop.

## 3. Where things go
```
sborn/
  index.html     import map {"three":"./vendor/three.module.js","three/addons/":"./vendor/addons/"}
  styles.css  tests.html  run.command  README.md  DECISIONS.md  USER-CHECKS.md
  vendor/        three r170 + addons, CHECKSUMS.txt, LICENSE
  fonts/         Fredoka variable woff2 (Latin subset) + OFL.txt
  audio/         shipped sounds by group + audio-manifest.json (always present)
  src/           core/ recipe/ catalog/ geo/ parts/ rig/ render/ anim/ editor/ paint/ play/ audio/ io/ ui/ debug/
  tests/         run.js, *.test.js, thresholds.js, starter-stats.json
  screens/       mN/NN-name.jpg + manifest.json (§15.3)
  tools/         checkpoint.sh browser.cjs run-tests.cjs shoot.cjs e2e.cjs acceptance.cjs three-hooks.mjs
                 bench-sim.mjs gen-sounds.mjs sound-manifest.json console-allowlist.json board.html
                 audio-raw/ audio-out/ out/
```
- **`run.command`** (Doodle World style, port 8791; Doodle World uses 8790): `cd "$(dirname "$0")"`; `python3 -m http.server 8791 --bind 0.0.0.0 &`; print the iPad LAN URL via `command -v ipconfig >/dev/null && ipconfig getifaddr en0`; `command -v open >/dev/null && open http://localhost:8791`; `wait`. Executable (`chmod +x`, `git update-index --chmod=+x`). Opened from `file://`, an inline non-module script shows a friendly full-screen picture pointing to it.
- **DECISIONS.md** (Doodle World style): a dated section per milestone; each bullet a **bold one-sentence decision** plus 1–2 sentences of rationale naming the rejected alternative. M0 opens with `Start commit: <40 hex>`, recorded before any change.
- **README.md** mirrors Doodle World's (pitch, Run including iPad over LAN, Controls, Sounds, Troubleshooting) plus Open failures, a status table `| M | status | commit | tests |` (also `tools/out/status.json`), one row per §16 item (status, number, date) and the Final report. Troubleshooting notes that over LAN http iPadOS hides share, clipboard, `storage.persist` and `audioSession`, so pictures save through the press-and-hold menu (§10.5).

## 4. Tech stack
- **Code.** Vanilla ES modules, no build step, no runtime dependencies, no `package.json`. Tools may use Node 22 built-ins and the global Playwright.
- **three.js r170** in `sborn/vendor/` (the server root is `sborn/`): copy the repo root's `vendor/three.module.js`, byte-identical to npm `three@0.170.0`.
- **Addons.** `npm pack three@0.170.0` into `$SCRATCH` (§15.1); check it against `npm view three@0.170.0 dist.integrity` and record that in `CHECKSUMS.txt`. Copy with their `examples/jsm/` paths: `postprocessing/{Pass,UnrealBloomPass,GTAOPass}.js`, `shaders/{CopyShader,LuminosityHighPassShader,GTAOShader,PoissonDenoiseShader}.js`, `math/SimplexNoise.js`, `exporters/GLTFExporter.js`, `loaders/GLTFLoader.js`, `utils/BufferGeometryUtils.js`, `environments/RoomEnvironment.js`; follow relative imports until closed; sha256 each into `CHECKSUMS.txt`. If `npm pack` fails, fetch each from `https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/jsm/<path>` and record `source: github tag r170` (unpkg and jsdelivr are blocked). If both fail, every tier uses the Low path (no post) and GLB export is BLOCKED (proxy); log it and continue. Never hand-write substitutes presented as three.js addons.
- **Font.** Fredoka (SIL OFL) from npm `@fontsource-variable/fredoka`, Latin woff2 plus licence; on failure `ui-rounded, "SF Pro Rounded", system-ui, sans-serif`, logged.
- **Browsers.** Safari/iPadOS 16.4+, Chrome 110+, Firefox 115+. Feature-detect; WebGL2, module workers, `CompressionStream('deflate-raw')` and IndexedDB are required (no WebGL2 → friendly picture). The iPad loads over plain http on the LAN, so nothing may need a secure context: no `crypto.subtle` (write CRC32 and FNV-1a), no service worker; guard clipboard, share, `storage.persist` and `audioSession`.
- **Workers cannot see the import map:** worker modules import relative paths only, never `three`, even transitively. Mesher modules also run on the main thread (tests compare the two).
- **Node cannot resolve `three`:** `tools/three-hooks.mjs` calls `module.register()` with a resolve hook mapping `three` → `../vendor/three.module.js` and `three/addons/*` → `../vendor/addons/*` (file URLs). Run simulation tools as `node --import ./sborn/tools/three-hooks.mjs sborn/tools/bench-sim.mjs`; `.cjs` is only for Playwright drivers. Modules in `core/`, `recipe/`, `catalog/`, `geo/`, `rig/` and `anim/` touch no `document`, `window` or WebGL at import time.
- **Copy from Doodle World** (header note `// from Doodle World src/...`): `core/rng.js`; mesh helpers and surface-nets logic from `geo/pipeline.js`; the `onBeforeCompile` + `customProgramCacheKey` pattern and object-space relief from `creature/material.js`; eye blink and look from `creature/creature.js`; shader warm-up from `stage.js`; `creature/voice.js` for placeholder voices; the test harness and title contract from `tests/run.js`.
- **Conventions** (Doodle World's): each file starts `// <file> — purpose.`, then `// Exports: …` and `// Invariants: …`; factory functions returning closures; 2-space indent, single quotes, semicolons; comments say *why*; British spelling; no `console.log` except the audio status line and `src/debug/`. Hot paths allocate nothing per frame (preallocated scratch, typed arrays, pooled mesher buffers). Pause rendering and suspend audio while hidden.

## 5. Architecture

### 5.1 Recipe
`creature = build(recipe)` is pure and deterministic; the recipe JSON is the only source of truth for editor, undo, autosave, gallery, cards, links, context-loss recovery and tests. Edits are pure `recipe → recipe'` with structural sharing. Every commit quantizes (positions and radii 0.001 m, `u` 0.0001, directions and params 0.001, angles 0.001 rad, scale 0.01, colours lowercase hex), so round trips are exact. Hash = FNV-1a over canonical JSON (sorted keys). **Canonical-equal** = `canonicalJSON(quantize(a)) === canonicalJSON(quantize(b))` and equal hashes; every equality in §16 uses it.

```jsonc
{
  "v": 1, "app": "sborn", "name": "Bobaloo", "seed": 123456,     // per-part seed = hash(seed, part.id)
  "spine": { "v": [[0.42,-0.50,0.14], [0.45,-0.30,0.22]] },     // [y,z,r] tail→head, x = 0, 3–24 entries
  "limbs": [{ "id": "L1",
              "at": { "b": "spine", "u": 0.32, "d": [0.70,-0.71,0.0] }, // chain, arc param, direction in chain frame
              "m": 1,                                                   // mirrored pair stored once (+x side)
              "j": [[0,0,0,0.07],[0.05,-0.18,0.02,0.06],[0.06,-0.38,0.05,0.05]], // [dx,dy,dz,r] root-relative, 2–5
              "k": 1.0 }],                                              // junction blend multiplier 0.3–1.2
  "parts": [{ "id": "P3", "t": "det.curlhorn",
              "at": { "b": "spine", "u": 0.91, "d": [0.30,0.80,0.52], "tw": 0.0 }, // or { "b": "L1", "tip": 1 }
              "sc": 1.0, "m": 1, "p": { "len": 1.0, "curl": 0.4 }, "tint": "detail" }],
  "paint": { "skin": "bumpy",
             "base":   { "c": "#ff8fb1", "pat": "solid",   "sc": 1 },
             "coat":   { "c": "#6c8cff", "pat": "stripes", "sc": 1,   "amt": 0.8, "mask": "back" },
             "detail": { "c": "#ffd23f", "pat": "spots",   "sc": 0.5, "amt": 0.7, "mask": "all" },
             "iris": "#7fc8ff" },
  "meta": { "created": 1760000000, "from": "trundle" }
}
```
- **Anchors** are an arc parameter along a bone chain, never a vertebra index, re-resolved after every remesh (§6.4), so parts ride the surface as the body bends, fattens or grows.
- **`validate()`** clamps every number, repairs duplicate ids, moves unknown part types to `warnings`, caps inflated payloads at 64 KB, never uses `eval`, and keeps a `migrate[v]` chain. It does **not** enforce budgets: an over-budget recipe loads, the pill and jar show overfull (never red), and cards stay locked until it is back under budget. Fixtures may exceed budgets; starters may not.

### 5.2 Mesher worker protocol
- Two module workers, `preview` and `full`, each with one job in flight and one pending slot; a newer request overwrites the pending one and stale `jobId` results are dropped. Request `{jobId, quality, shape}`, where `shape` is spine, limbs and part sockets only, so paint never remeshes.
- Reply (transferred typed arrays): `position`, `normal` (i16 normalized), `aDomain` plus `aDomain2` near limb roots (§9), `aPaint` u16×4 (spine s, belly, limb t, junction weight), `aSkin` u8×4 (thickness, cavity, AO, region with side bit), `skinIndex`/`skinWeight` u8×4, index (u32 above 65,535 vertices), bone rest frames, socket positions, phase timings.
- Preview buffers start at 8k vertices, grow ×1.5 on overflow (logged once) and update with `setDrawRange`; nothing allocates during drags. Preview jobs skip weights, AO, thickness and cavity: the creature is held at rest during drags and the preview draws as a plain mesh in the skin material. No pops: the old mesh stays until the new one arrives, then a 120 ms dithered crossfade.

### 5.3 Hooks and switches
One WebGL2 context (§11), a pointer-event state machine (§8.2), WebAudio buses (§12), IndexedDB plus a localStorage mirror (§13). `window.__sborn` exists in every build:
- `ready()`; `recipe()`, `load(r)`; `op(name, args)`, `undo()`, `redo()`; `mode(m)` (build, paint, play, photo, gallery); `info()` (`renderer.info`, tier, DPR, programs split into scene, shadow-depth, post and bake, remesh ms, `glErrors`, audio status); `metrics()`.
- `step(n, {render = 0} = {})` (`?test` only) advances n fixed 60 Hz steps of simulation and scene update without rendering; `render = k` renders every k-th step. `settle()` renders until remesh, crossfades and thumbnails are idle, at most 30 frames.
- `drive.walkTo(x, z)`, `drive.key(code, down)`, `drive.emote(name)`; `io.card()`, `io.readCard(blob)`, `io.link()`, `io.openLink(url)`, `io.glb()`.
- Read-only probes: `probe.where(target)` → `{x, y, r}` in CSS px (centre, hit radius) for `card:<type|limb.bendy|limb.leg|limb.arm>`, `tab:<mode>`, `handle:spine.head|spine.tail|bead:<i>|<partId>.p<n>`, `vertebra:<i>`, `joint:<limbId>:<j>`, `part:<id>`, `skin:<u>` (camera-facing side), `ground:<x>,<z>`; `probe.eyes()` (each eye's screen centre and radius); `probe.mask()` (creature pixel coverage).

Switches: **`?test`** = seed 1, DPR 1, no rAF loop (frames render only in `step()`/`settle()`), no hatch delay, calibration or governor, tier Medium unless `?quality=`, hints off unless `&hints`, audio into a muted master, deterministic idle, `renderer.debug.checkShaderErrors = true`, and `gl.getError()` after every rendered frame (`info().glErrors`). `?quality=low|medium|high` forces a tier; `?debug` and `?bench` (§15.4); `?precision=mediump` (diagnostic, §9); `?test&probe=swatch&c=<hex>&quality=<tier>` (§11.1).

## 6. Body, skin and rig

### 6.1 Spine
- 3–24 vertebrae `[y, z, r]` in the mid-plane x = 0; never forks (asymmetry is for parts and limbs). Head at +Z, walks along +Z; metres, +Y up, lowest point at Y = 0 on the pedestal.
- **Bloop** (default): 6 vertebrae, z −0.45 to +0.45 at y ≈ 0.45, radii 0.14/0.22/0.28/0.30/0.27/0.24, a Button Grin and a pair of Moon Eyes, no limbs.
- **Select.** Tapping the body selects the spine (and giggles, §8.5), showing vertebra dots, both end arrows and a "+" bead at each segment midpoint. With nothing selected, both end arrows stay visible at 45% opacity with a slow 2 s breathing pulse.
- **Drag a vertebra:** it moves in x = 0 (if the view is within dot 0.2 of ±X, drag on a camera-facing plane, then project); neighbour spacing stays within 0.5 × mean radius … 0.40 m. Dragged > 60 px (90 px touch) beyond that limit, it turns 50% translucent and wobbles; releasing there removes it with a pop (never below 3), moving back cancels.
- **End arrows** drag out or in to add or remove vertebrae one at a time along the end tangent at mean spacing; each new one pops in with a 12% bulge and a squish. Tapping a "+" bead inserts one; tapping bare skin never inserts.
- **Fatten:** the wheel over a vertebra, or wheel or pinch anywhere while the spine is selected, scales the vertebra nearest the cursor or pinch centroid by `exp(−deltaY·0.00077)` (8% per 100-unit notch), radius clamped 0.04–0.60 m, eased over 100 ms, neighbours blending.
- Dragging on skin or empty space always orbits; the body never translates. After every commit, translate so the lowest point touches the pedestal, then re-stand with a 250 ms bouncy settle.

### 6.2 Limbs
- **Bendy Limb card:** drag onto the body and keep dragging; the root plants where you touched and the limb grows toward the pointer, joints = clamp(1 + floor(d/0.22), 2, 5) for drag distance d (m). Mirrored by default.
- **Ready Leg** (3-joint limb + Nub Paw): the root plants at the drop point, sliding down to 35% of body height if dropped above the equator; points 25° outward and down, knee bent 20° forward; joint spacing makes the sole reach 0.12 m below the body's current lowest point. The re-stand lifts the body onto its feet, then the tap-dance reaction plays. **Ready Arm** (3-joint limb + Mitten): outward and 30° forward at the drop height, elbow 30°, palm in. Ready cards cost the sum of their pieces.
- **Limits:** 2–5 joints; joint radius 0.03–0.30 m; segment 0.08–0.60 m; ≤ 12 limb instances (a mirrored pair counts 2); roots may sit on limbs, ≤ 2 levels deep.
- **Joint drag:** camera-facing plane, springy IK feel, twin updating live. The end joint dragged 0.22 m past the tip adds a segment; pushed within 0.5 × segment length of the previous joint, removes one. Wheel or pinch thickens a joint.
- **Hands and feet** snap to a limb tip within 40 px (56 touch), replace the tip shape and follow the last segment.
- **Role** (every edit): **leg** = foot on the tip, or tip below 0.25 × hip height pointing down; **arm** = hand on the tip, or tip above the root; else **tail-limb** (decorative, on springs).

### 6.3 Skin surface
A signed distance field of round cones (iq `sdRoundCone`) joined with polynomial smooth-min, meshed in a worker with 3D surface nets.
- **Primitives (smin k):** one cone per vertebra pair (0.25·min(r_i, r_i+1)); one per limb segment (0.2·r); limb root into body (0.6·min(r_root, r_body)·limb.k); a socket-mound sphere per rigid part, r = 0.55 × part base radius (0.6r). Quadratic smin, cubic for k ≥ 0.05 m. Fixed order: spine, limbs, mounds. No ellipsoids or negative blobs.
- **Bricks** of 4³ cells: keep primitive i only if `d_i(c) − hd ≤ d_min + hd + k_i + h`; skip the brick if `|f(c)| > 1.25·hd + h`. Bricks share corners (no cracks); reuse per-brick lists for normals, weights and paint.
- **Resolution:** `A_est = 0.7·(Σ cones π(r1+r2)·slant + Σ spheres 4πr²)`, `h = clamp(sqrt(1.5·A_est/Nv), extent/192, extent/40)`. In Full, also apply `h ≤ r_min/1.5` while the projected vertex count stays ≤ 1.3× target; otherwise keep h and floor every primitive radius at 1.5h for that job (log "thin-limb floor").
- **Qualities:** Preview 2.5k vertices (~5k triangles) on every drag move, latest wins; Full 15k (~30k, cap 40k) on pointerup and after 300 ms still; L1/L2 6k/2.5k in the background for the island at distance; Hero 30k (~60k) for saved photos, cards and GLB only.
- **Job:** (1) field over active bricks; (2) surface nets, quads split on the shorter diagonal, CCW outward; (3) 2 Taubin iterations (λ 0.5, μ −0.53); (4) one Newton projection from 4 tetrahedral taps at 0.5h, clamped to 0.5h, the same taps giving the normal; (5) paint attributes and skin weights, with AO (5 taps at `(0.01 + 0.035i)·H`), thickness (inward trace ≤ 10 steps) and cavity (field Laplacian) computed at the brick-grid corners of step 1 and trilinearly sampled per vertex.
- **Budgets, complete job:** Preview ≤ 8 ms Apple M1 Air, ≤ 15 iPad, container p95 ≤ 15; Full ≤ 40 / 80 / p95 ≤ 90 ms. (Research measured geometry alone here at 9.3 ms for 2.6k and 55.8 ms for 19k vertices.)

### 6.4 Re-resolving anchors
`A = curve_b(u)`, `D = frame_b(u)·d`; march outward from inside with step `max(|f|, h/4)` until f ≥ 0, bisect 6×; the normal is the gradient. Sink the part 20–35% of its base height along −normal (per part); limb roots sink 0.5 × root radius. About 30 evaluations per part.

### 6.5 Rig
- **Root:** the pelvis is the vertebra nearest the leg-root centroid (mid-spine without legs); forward chain chest–neck–head, backward chain tail.
- **Bones:** one per vertebra; one per limb joint plus a tip socket; per rigid part a socket bone; a jaw (2 for mandibles and pincers); 2 lids per eye; 1 per curling finger; 3 per wing (+1 per umbrella finger); 1 per Verlet particle (≤ 64). Cap 200; above it, shorten spring chains first (min 2 particles).
- **Weights** (worker): `w_i = max(0, 1 − (d_i − d_min)/β_i)²`, `β_i = max(k_junction, 0.5·r_i)`; spine segments split between their end bones by axis t; top 4, drop < 0.01, renormalize; 1–2 Laplacian passes; u8 summing to 255.
- **SkinnedMesh**, `boundingSphere` 1.5× rest. On remesh: bones to rest, `calculateInverses()`, swap geometry, `bind()`; a new Skeleton only when the bone count changes (dispose the old).
- **Skinned anchors:** each rigid part stores the 4 skin weights at its anchor; every frame, blend the anchor position and normal with the same bone matrices into its socket bone, so parts never float or sink at joints.
- **Parts mesh:** parts sharing a material merge into one SkinnedMesh (about 4 part draws). Rigid pieces weight 1 to their own bone (socket, jaw, lid, finger); flexible sweeps (tails, antennae, stalks, whiskers, fins, wing membranes) get smooth weights along their chain bones at build time. Repeats (teeth, spikes, feathers, plates) are merged into part geometry; a creature has no InstancedMesh.
- **Mirroring** is baked at build time: x → −x for positions and normals, and swap indices 1 and 2 of every triangle. Never put negative scale on a bone or an Object3D inside a creature mesh.

## 7. Parts catalog
- **Builders.** Pure `build(params, lod) → {geometries, hinges, sockets, tags, bounds, tips}`, cached by `hash(type, quantized params, lod)`. Parts are presets of ≤ 3 parametric builders per category; a part is done when it builds at all 3 LODs within budget, has a silhouette distinct from its siblings, and passes items 12, 13 and 58. LOD segment multipliers 1/0.5/0.25; the editor uses L0. Tools: tapered Catmull-Rom sweeps (12 radial × 16 axial), lathes, extruded spline shapes (4–10 mm deep, 1 bevel), merged repeats, and small SDF meshes from the §6 mesher at R 24–32 (paws, lips, palms). Every tooth, horn, claw, talon, spike, beak tip, mandible tip or tine is listed in `tips: [{apex, r, rBase}]`.
- **Triangles:** ≤ 1.5k per part at L0; all parts ≤ 40k at L0, 15k L1, 5k L2. When the L0 sum exceeds 40k, step parts to L1 then L2, smallest projected size first; eyes and the selected part stay L0; `?debug` shows the count.
- **Tunable shapes.** 1–3 `p` params per part, each with a handle on the selected part (44 px hit): p1 a straight stretch arrow along the main axis; p2 a curved arc that curls, bends or spreads; p3 a round dot at the tip that fattens or flares when dragged outward. Wheel scales 0.25–4×. Shift+wheel, or a two-finger twist on the selected part, rotates it about its normal.
- **Budget.** DNA and complexity are charged per instance (a mirrored pair costs double). Vertebra: 0 DNA, 1 complexity. Limb segment (a limb has joints − 1): 15 DNA, 1 complexity, per instance. Totals **2,000 DNA, complexity cap 100** (≤ 24 vertebrae, ≤ 48 part instances, ≤ 12 limb instances).
- **Stats,** 14, each 0–5: Bite, Charge, Strike, Spit, Sing, Dance, Charm, Pose, Speed, Sprint, Stealth, Glide, Jump, Health. Stat = highest contributing part level + 0.5 per other distinct contributing part, capped at 5, shown as half pips. A distinct contributing part is one part instance with its mirror twin folded in; two separate placements of one type count as two. Health = max(1, rule result). Worked examples: **Bloop** → Bite 1, Sing 1, Charm 1, Health 1, others 0. **Peepsy** → Bite 1, Sing 2, Charm 3, Dance 3, Jump 1, Health 1, others 0.
- **Tags:** `jaw` (hinge 0–35°), `lids`, `track` (eye look-at), `spring` (Verlet), `flap`/`glide`/`buzz` (wing modes), `fold`, `flare` (spreads on emotes), `grasp` (holds fruit), `curl` (finger curl 0..1), `wag`, `wave`, `centre` (mid-line only), `tip` (limb tips only), `keratin`, `shell`, `membrane`; plus a footstep family (pads, hooves, claws, sticky), a voice family (beak, jaw, snout, mandible, filter) and a diet (herb, carn, omni, filter: preferred fruit). Default tint is skin, except keratin parts (detail) and eyes (natural).

Lines read `key Name: shape; DNA/complexity; stats; tags`; the id is `<group>.<key>`.

**Mouths, `mouth.*` (10), all `jaw`; tags give voice family and diet**
- grin Button Grin: small soft muzzle, puffy smiling lips, 2 nub teeth; 40/3; Bite1 Sing1; jaw omni
- munch Munch Muzzle: round muzzle, cheek pads, flat front teeth; 90/4; Bite1 Sing3; jaw herb
- chomper Chomper: wide round jaw, 10 blunt teeth; 150/5; Bite3 Sing1; jaw carn
- peep Peep Beak: short two-piece cone beak; 60/3; Bite1 Sing2; beak herb
- hook Hook Beak: deep curved beak, round tip; 170/4; Bite4; beak carn
- mandible Click Mandibles: two curved sweeps opening sideways ±30°, tiny palps; 120/4; Bite2 Sing2; mandible carn
- snoot Snuffle Snoot: short trunk-snout, 2 nostrils, small mouth below; 100/4; Bite1 Sing2 Charm1; snout omni spring
- trumpet Trumpet Bell: flared bell lips on a short tube; 220/4; Sing5; snout herb flare
- sieve Sieve Lips: wide flat lip plate with a comb fringe; 80/4; Sing3; filter filter
- squirt Squirt Spout: soft tube mouth with a ring lip, blows bubbles; 170/4; Spit4 Sing1; filter omni

**Eyes, `eye.*` (8), all `track`; all blink and track**
- button Button Eye: small glossy bead, blinks by a 90 ms squash; 20/2; none
- moon Moon Eye: big round eye, huge iris; 60/2; Charm1; lids
- dreamy Dreamy Eye: oval half-lidded eye, 3 lash cards; 80/3; Charm2; lids
- almond Almond Eye: tall oval pupil; 90/2; Stealth1 Charm1; lids
- frog Frog Dome: eye in a raised dome bump; 70/3; Jump1 Charm1; lids
- cluster Dot Cluster: dome of hex facets (shader), blinks by a 90 ms squash, tracks by sliding a bright glint across the facets toward the target (clamp 0.4 rad); 100/3; Stealth2
- stalk Stalk Eye: eye on a springy 3-joint stalk; 90/4; Stealth1 Charm1; lids spring
- peeper Big Peeper: one extra-large eye; 130/3; Charm2 Stealth1; lids centre

**Feet, `foot.*` (10), all `tip`; in Legs after Ready Leg and Bendy Limb; tags give footstep family**
- nub Nub Paw: rounded stub, 3 toe bumps; 25/2; Speed1; pads
- pillow Pillow Pad: wide soft pad, 4 toe beans; 70/3; Stealth2 Speed1; pads
- tiptoe Tiptoe: dainty 3-toed bird foot; 90/3; Dance3; claws
- hoof Tap Hoof: lathe hoof with a cleft; 110/3; Speed3 Dance1; hooves
- web Splash Web: 3 toes joined by a membrane; 80/3; Speed1 Jump1; pads
- gecko Sticky Toes: 5 splayed toes, round pads; 100/4; Stealth3 Jump1; sticky
- talon Grippy Talon: 4 curved toes, rounded claw tips; 120/4; Sprint2 Strike1; claws
- spring Spring Foot: long arched hopper foot; 160/4; Jump4 Sprint1; pads
- zoom Zoom Runner: slim racing foot, heel fin; 220/4; Speed4 Sprint3; pads
- twinkle Twinkle Toes: pointed ballet foot with a pom; 200/3; Dance5; hooves

**Hands and graspers, `hand.*` (8), all `tip grasp`; in Arms after Ready Arm**
- mitten Mitten: round mitt with a thumb; 40/2; Pose1
- three Three-Finger: SDF palm, 3 sweep fingers; 80/4; Pose2 Strike1; curl
- scoop Scoop Paw: paw-hand, short round claws; 90/3; Strike2 Pose1; curl
- cup Suction Cup: round sucker disc on a short wrist; 70/3; Pose1 Stealth1
- curl Curl Tip: tentacle tip that curls; 90/3; Pose2 Charm1; spring
- snip Snip Pincer: crab claw, two rounded jaws; 140/4; Strike3; jaw
- jazz Jazz Hand: 5 splayed fingers; 160/5; Pose4 Charm1; curl
- bonk Bonk Mallet: round club fist; 180/3; Strike4

**Wings, `wing.*` (8), `flap fold` unless noted**
- nub Flutter Nub: tiny feathered stubs; 40/2; Jump1 Charm1; never flies
- leaf Leaf Glider: two leaf-shaped flaps; 70/3; Glide2; glide only
- petal Petal Wing: rounded butterfly wings in the detail colour; 130/4; Glide2 Charm2; slow flap
- glass Glass Wing: two pairs of thin iridescent ovals; 140/5; Glide2 Jump1; buzz
- sail Sail Wing: membrane on 4 spines; 120/4; Glide2 Speed1
- umbrella Umbrella Wing: membrane on 3 finger bones (8×6 skinned grid); 150/5; Glide3 Stealth1
- feather Feather Wing: bird wing of 14 feathers; 160/5; Glide3
- cloud Cloud Wing: big wing of puffy feather clusters; 230/6; Glide4 Charm1

A creature **flies** when total wing area ÷ body volume^(2/3) ≥ 1.2, otherwise it glides, launching from a jump or a hill. Calibrate the 1.2 once on the fixtures (rule 4 logging) so that only Flapjack and the flier fixture fly.

**Tails, `tail.*` (8), all `spring wag`; usually at the tail end**
- puff Puff Tail: round pom-pom; 40/2; Charm1
- curly Curly Q: corkscrew tail; 50/3; Dance1 Charm1
- sprout Sprout Tail: short tail ending in 3 leaves; 60/3; Charm1 Stealth1
- ribbon Ribbon Tail: long thin ribbon, soft tip; 80/4; Speed1 Dance1
- fluke Fluke Tail: whale-style fluke; 90/3; Speed2
- brush Brush Tail: big bushy tapered tail of fur cards; 120/4; Charm2 Stealth1
- club Thump Club: tail with a round knob end; 150/4; Strike3
- fan Fan Tail: 7 rounded feathers that spread when dancing; 180/5; Charm3 Dance2; flare

**Fins, `fin.*` (8), membrane material, so they glow most**
- paddle Paddle Fin: small side fin; 50/2; Speed1; spring
- ear Fin Ear: ear-shaped head fin; 50/2; Charm1 Stealth1; spring
- whisker Whisker Fins: 2–3 feathery barbels; 60/3; Stealth1 Charm1; spring
- sail Back Sail: tall rounded dorsal fin; 60/2; Speed1 Charm1
- crest Head Crest: rounded crest on top of the head; 90/3; Charm2 Sing1; flare
- ripple Ripple Fin: long low frill along the back that ripples; 110/4; Speed1 Charm2; wave
- glider Flying Fin: wide pectoral fin; 130/4; Glide2 Speed1; flare
- sunfan Sunfan: radial fan of 5 spines and membrane; 140/4; Charm3; flare

**Details, `det.*` (10)**
- nubhorn Nub Horn: short rounded cone; 50/2; Charge1; keratin
- curlhorn Curl Horn: curved tapered horn, ring ridges; 120/3; Charge3; keratin
- swirlhorn Swirl Horn: spiral ram-style horn; 180/4; Charge4; keratin
- antler Branch Antler: 3-tine branching antler; 140/4; Charge2 Charm2; keratin
- ridge Spike Ridge: 5–9 spikes along the spine, placed by sphere trace; 130/5; Strike2 Health1; keratin
- plates Armour Plates: 3–6 overlapping rounded plates; 120/4; Health2 Charge1; shell
- shell Dome Shell: domed back shell of hex plates, iridescent; 220/5; Health4; shell centre
- bobble Bobble Antenna: thin antenna, ball tip; 50/3; Stealth1 Sing1; spring
- frill Neck Frill: fan collar that flares on a roar; 130/4; Charm3; flare membrane
- tuft Fluff Tuft: cluster of fur cards; 40/2; Charm1; spring

## 8. Editor (Build tab)

### 8.1 Layout and style
Reference viewports: desktop 1280×800, iPad landscape 1180×820, portrait 820×1180. The creature stands on a glowing pedestal before a soft gradient sky.
- **Top centre:** Build / Paint / Play icon tabs, 72 px.
- **Left:** a 96 px rail of 64 px category buttons (Legs, Arms, Mouths, Eyes, Wings, Tails, Fins, Details) and a drawer of 88 px cards, 3 columns, 12 px gaps (2 columns under 1100 px); cards are live 3D thumbnails in the creature's current paint. Above them: the DNA pill (helix icon, odometer number, fill bar for non-readers) and the complexity jar (10 beads, #5CC86F → #FFC94A → #FF5C8A).
- **Right:** a 220 px stats panel, 14 stats in 4 icon groups (attack, social, move, health); each a 28 px icon and a 5-pip segmented bar with half pips (pips 12 px iPad, 10 px desktop); a stat at 0 shows at 35% opacity. A rising stat pops its icon to 1.25× and fills new pips left to right with a sparkle; a falling one deflates gently.
- **Corners:** top left gallery button and name tag (dice re-rolls, tap to type); top right New, share menu (card, link, 3D model) and mute; bottom left undo and redo (56 px); bottom right mirror toggle (56 px).
- **iPad portrait:** the drawer becomes a 2-row bottom shelf; stats collapse to a tappable icon strip.
- **Rules:** respect `env(safe-area-inset-*)`; no `backdrop-filter`; nothing hover-only (a press or 350 ms long-press does the same job); every control ≥ 44×44 CSS px (primary 56–72, cards ≥ 64) with an `aria-label`.
- **Style:** panel #FFF8EC; ink #3A2E5C (never #000); accent coral #FF7A59 with ink labels; focus ring 3 px #6A4CF0; radii 24 panels, 20 cards, 16 buttons; shadow `rgba(58,46,92,0.18) 0 6px 16px`. Icons on a 48-unit grid: chunky filled pastel shapes with a 3-unit rounded ink outline, one white highlight blob top-left at 60%, no strokes under 3 units, no text. Buttons are pills with a 4 px darker bottom lip that compresses 2 px on press; press scales to 0.92, release overshoots to 1.04 on a spring (stiffness 500, damping 20); drawer cards wobble ±2° when pressed.

### 8.2 Input
- **Setup.** Pointer events with `setPointerCapture`. Canvas: `touch-action: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`; `preventDefault` on `gesturestart`, `gesturechange` and `contextmenu`. Register `wheel` with `{passive: false}` and always `preventDefault` over the canvas.
- **Picking.** Hit radius mouse 6 px, pen 10, touch 22 (or the projected size if larger). Order: handles, parts, joints/vertebrae/beads, skin (SDF sphere trace in rest space), empty space. Hover tests at most once per frame.
- **One pointer.** Down on a handle, part or joint arms a drag that starts after 3 px (mouse, pen) or 8 px (touch). Down on skin or empty space orbits after 4 px; a tap on skin selects the spine and giggles. Right-drag orbits. The wheel fattens over a vertebra (§6.1), scales over a part (§7), and zooms elsewhere.
- **Drawer.** The drawer has `touch-action: pan-y`, the portrait shelf `pan-x`. A card lifts when the finger moves > 10 px within 50° of the direction toward the stage (sideways in landscape, up in portrait), or after a 180 ms still hold, swelling to 1.08×; any other movement scrolls. Once lifted, `setPointerCapture` hands the drag to the stage. A mouse lifts a card after 3 px in any direction.
- **Two fingers.** A second finger within 150 ms, while the first moved < 12 px, cancels the drag (recipe unchanged) and starts two-finger mode; otherwise the drag commits first. Pinch zooms, or scales/fattens the selected element; centroid drag orbits; twist rotates the selected part, or yaws the camera when nothing is selected. No pan: the camera stays centred on the creature.
- **Trackpad.** A `wheel` with `ctrlKey` is a pinch (zoom, or scale the selection) by `exp(−deltaY·0.01)`; Safari's `gesturechange.scale` does the same; a plain two-finger scroll is the ordinary wheel; Shift+wheel twist reads `deltaY || deltaX`.
- **Gestures and keys.** Long-press (450 ms, < 8 px) on a part opens a radial menu of 56 px icons (delete, duplicate, mirror, tint). Double-tap (300 ms) frames a part. Delete removes the selection; Alt-drag duplicates; hold A for asymmetric placement; Cmd/Ctrl+Z undo; Shift+Cmd/Ctrl+Z or Ctrl+Y redo; 1/2/3 switch tabs; M mutes.

### 8.3 Attachment, symmetry, handles
- **Drag.** A part from the drawer floats 0.04H above the surface (H = creature height), leans with velocity (±12°) and wobbles ±4° at 3 Hz; over the body it glides on the skin, turning to the normal. Snap frame: Y = field normal, Z = creature-forward projected onto the tangent plane (+Y if parallel), then the user twist.
- **Symmetry** is on by default: a 35% ghost twin with a shimmering rim follows off-centre drags. **Centreline snap** when `|x| < max(0.25·r_part, 0.03·W_body)` or the mid-plane is < 12 px away on screen (20 touch): one centred part with a soft click, released at 1.6× that distance. `centre` parts only centre. Hold A or use the mirror toggle for asymmetry.
- **Drop:** the snap magnet covers the last 15% in 70 ms (easeOutBack); the part pops 0 → 1.18 (90 ms) → 0.94 (80 ms), then springs (stiffness 420, damping 18), volume-preserving; a skin ripple of 0.01H spreads to 0.25H over 300 ms; the pedestal rim pulses.
- **Overlap** above 25% tints the part coral at 40% while dragging, but the drop is allowed. A same-type duplicate within 0.3r is nudged out to 1r.
- **Remove.** Pulling a part > 40 px off the body detaches it; released over the drawer or empty space it spin-shrinks (350 ms) into a 6-sphere poof, the DNA is refunded, and the creature does a relieved squash.
- **Handles** (about 20 px drawn, 44 px hit, constant on screen): spine end arrows, vertebra dots, "+" beads, limb joint dots, part p-handles. Shown only on the selected element, plus the idle end arrows (§6.1).

### 8.4 Undo, budgets
- **Undo.** Entry `{label, frozen recipe, selection}` (1–3 KB), committed on pointerup; wheel and pinch within 400 ms coalesce; cap 100 entries or 2 MB; undo triggers a Full remesh plus cached part rebuild. New is undoable too (§13.1).
- **DNA and complexity.** Holding a part over the body floats a ghost "−120" by the pill and ghost beads in the jar. Cards that no longer fit dim to 50% with a padlock, never hidden. Dropping one is refused: it floats home, the pill shakes ±6 px three times over 300 ms, the jar wobbles ±5°, a soft bonk plays, and the creature tilts its head. The odometer rolls over 260 ms (easeOutBack, fixed-width digits) and the helix spins half a turn.

### 8.5 The creature reacts
- **Gaze.** During any drag, only the eyeballs track the dragged part (leading by 80 ms, clamp 0.55 rad, pupils dilating); head, neck and body stay exactly at rest. With no drag (hovering a card on desktop, or after a drop) the head follows on a 180 ms half-life spring, yaw ±50°, pitch ±30°. On release the head turns to the new part, then plays its first reaction.
- **"Ooh":** within 0.3H of the body, pupils dilate 1.15× and the upper lids open 10% wider.
- **First reactions:** mouth chomps twice and chirps; eyes blink and look around; leg, a 4-step tap dance; arm waves; wings flap twice; tail wags; foot stomps twice; hand claps or flexes; fin flutters and flares; horn, spike or antler: looks cross-eyed up at it, then a proud head toss; shell or plates: wiggles under it; antenna or tuft: shakes so the springs wobble.
- After a body edit it re-stands and settles. **Tap the skin:** squash 0.88/1.08, giggle, pink blush for 1.2 s, at most once per 1.5 s. Idle life (§10.4) runs in the editor plus camera glances, blending to rest over 150 ms when a drag starts.

### 8.6 Onboarding (learn by doing)
A white ghost hand (SVG, no words) loops the gesture every 1.6 s over a pulsing glow on the target, and the creature looks at it. One hint at a time, 1.5 s after the previous step; it fades within 300 ms of its action, is stored done in localStorage (try/catch) and never returns; tapping elsewhere hides it for 20 s; a "?" bubble replays all. Sequence: (1) drag a Ready Leg onto me; (2) pull my tail arrow; (3) wheel or pinch to fatten me; (4) tap Paint; (5) tap a colour; (6) tap Play; (7) tap the ground or press WASD (key-cap icon).

## 9. Paint (Paint tab)
- **Layers** Base, Coat and Detail, each a colour and a pattern wrapped over the whole body in code: base → coat (by `coatMask·amt`) → detail (by `detailMask·amt`). The base pattern mixes the base colour with a 25%-lighter tint of itself. Belly countershading lightens 22% × 0.55. Repainting is a uniform write: one shared program, no remesh, no recompile.
- **Patterns** (same ten per layer; defaults base solid, coat stripes, detail spots): 0 solid; 1 gradient (smoothstep over spine s, belly or limb t); 2 spots (3D Worley F1, size jitter); 3 stripes (`sin(2π·f·s + warp·noise)` across the spine, limb t on limbs, fading on the belly); 4 scales (Worley F2−F1 edges, ±3% tint per cell, normal bump); 5 speckles (value noise, 60–120/m); 6 patches (thresholded low-frequency fBm); 7 saddle (back band at mid-spine); 8 rosettes (Worley ring); 9 bands (limb-t rings, "socks"). Masks: all, back, belly, limbs, head.
- **Domain.** Spine vertices: `aDomain = (s·L_spine, |x_f|, y_f)/scale`, s = arc length along the whole spine, (x_f, y_f) from a rotation-minimising frame at s; no per-vertebra offsets. Limb vertices: `(t·L_limb + 31.7·hash(limbId), radial coordinates in the limb frame)/scale`, mirror twins sharing the hash. Near a limb root, also store `aDomain2` (the spine domain) and the junction weight (`aPaint.w`); where it is in (0.02, 0.98), the fragment shader evaluates the pattern in both domains and blends the colours. Never blend coordinates carrying different offsets. Result: mirror-symmetric patterns, no sliding spots when other parts are edited, no triplanar, no seams.
- **Noise:** two 64³ RGBA8 `Data3DTexture`s generated in a worker at boot (gradient + fBm; Worley F1/F2/id/ridged), `NoColorSpace`. Anti-alias thresholds with `fwidth`; fade cells under 2 px to their average. `highp` throughout (iPad `mediump` is fp16 and breaks the hashes); `?precision=mediump` only reproduces fp16 artifacts.
- **Parts and eyes.** Part tint is skin, base, coat, detail or natural; tapping a part in Paint cycles it. Skin-tinted parts evaluate paint at `anchorDomain + local offset` and blend into skin paint over their bottom 5–20%, so the seam vanishes in colour too. Tapping an eye cycles the iris: amber, leaf, sky, violet, detail colour. A skin row offers smooth, bumpy, scaly, leathery, fuzzy (§11.3).
- **UI.** 3 layer cards, each with 18 swatches (#FF8FB1 #FF7A6B #FF9F43 #FFD23F #B5E655 #5CC86F #4FD1B5 #2BB3C0 #5BB8FF #6C8CFF #9B7BFF #D17BFF #FFF1D6 #E8C995 #9C6B4E #7A3E6E #6E8B3D #3D3A4B, the last the darkest allowed), 10 pattern tiles on mini blobs, and S/M/L size chips (0.5×, 1×, 2×). Hover previews on desktop; on iPad a swatch previews while the finger is down and applies on release. Holding a swatch 450 ms (or right-clicking it) fans out 5 lighter/darker and 2 more/less saturated steps, never darker than #3D3A4B. Dice makes a harmonious random paint (hues 30–150° apart); "Paint like" copies a gallery creature's paint. A strip of 7 emote icons under the stats plays any emote on the pedestal (locomotion in place), so paint is seen in motion.
- **Juice.** Each change sends a wavefront from the tap point (or head to tail) over 600 ms (band 0.08H, additive white-gold at 0.6 with sparkle), bursts 24 star sprites, plays a swish, and the creature shake-dries and looks itself over.

## 10. Test drive (Play tab)

### 10.1 Transition and island
Going to Play, the editor sky opens like curtains (1.2 s), the pedestal sinks into a clearing, the creature hops off (squash 0.8, dust ring, grass shivers) and the camera swoops (1.6 s, easeInOutCubic). Build the island lazily on first Play, cache it, never render it in the editor.
- **Shape:** radius 40 m, 28 m playable inside a soft boundary that gently turns the creature back; central 6 m hill, beach ring, 10 m pond, ocean ring.
- **Terrain:** 4 heightfield chunks, 96²/64²/48² quads (High/Medium/Low); vertex colour #5DBB63 → #A8E06A on crests, #D9B48A on slopes, sand 25% darker within 0.3 m of water; baked AO.
- **Grass:** one InstancedMesh per tier, 36k/18k/8k blades drawn to 35/25/18 m, shrinking to zero over the last 5 m. When the camera moves > 2 m or turns > 10°, CPU-cull 8×8 m chunks and copy visible instances to the front of the buffer (`mesh.count` = visible): one draw. Wind sway and gusts, 4 trample pushers (R 0.6 m, ≤ 1.2 rad, 0.8 s recovery), normals 60% toward terrain, #2F7D45 → #56B45A → #B7E36A, backlit tips.
- **Flora:** 3 flower species, one InstancedMesh each (450/250/125 per tier), heads turning to the creature within 3 m; 40 rocks (8 shapes, mossy tops); 14 wrap-lit lollipop trees that shake when bumped; 12 clouds in one draw; on High, 6 butterflies and 60 pollen motes.
- **Water:** Fresnel F0 0.02, baked depth colour #6FDCD0 → #1E7FA8, two scrolling generated normal maps, 8 interactive ripple rings, foam where depth < 0.12 m, no refraction pass.
- **Fruit:** 24 pieces of 4 kinds (berry cluster, bloop apple, crescent, drumstick for meat-eaters); sparkle every 2–3 s; respawn 20 s after eaten. **Toys:** a big soft beach ball (sphere physics, pushed by the body) and 4 bounce mushrooms (landing gives a 1.6× jump), one instanced draw each.
- **Light:** sun #FFE6C2 at 3.0, elevation 38°; hemisphere #BFE3FF/#9CC26E at 0.7; fog matched to the sky so the ocean rim melts in. **Wind:** one field `gust = noise(xz·0.025 + dir·t·0.06)` drives grass, flowers, trees, the creature's springs and the ambience level.

### 10.2 Controls, camera, stats
- **Desktop:** WASD or arrows (camera-relative), Shift runs, Space jumps; click the ground to walk, double-click to run; drag orbits, wheel zooms; keys 4–9 and 0 = dance, roar, sit, sleep, wave, eat, fly; F flies or glides; P photo; Esc back to Build.
- **iPad:** tap the ground to walk there; hold a finger on it and the creature follows, running after 0.6 s; one finger on the sky orbits; pinch zooms; a bottom bar of 64 px emote, jump and fly buttons (fly only with wings).
- **Camera:** spring arm at 3.5H, orbitable, kept above the terrain.
- **Speeds** (L = rest hip height): walk `0.35·√(gL)` (Froude ≈ 0.12); run `0.85·√(gL)·(1 + 0.12·Speed)` (≈ 0.72), capped at 6 m/s.
- **Stats in play:** Sprint, a 2 s Shift burst × (1 + 0.1·Sprint). Jump height = hip height × (0.25 + 0.12·Jump). Glide ratio = 1 + Glide. Bite = eating speed. Charge: running into the ball gives a boop impulse × (1 + 0.25·Charge). Strike ≥ 2: Jump beside a tree becomes a thump that drops 1–3 fruit. Spit ≥ 2: Roar becomes a bubble-blow of 6 + 2·Spit bubbles that pop with sparkles. Health: eat-heart size 1 + 0.15·Health; landing squash softened by 0.05·Health. Dance, Sing, Charm and Pose pick richer emote variants. Stealth gives a tiptoe gait at low speed.

### 10.3 Locomotion for any leg count
- **Legs:** roles as §6.2; side = `sign(root.x)`, centre when |x| < 0.05 × body width; mirrored legs pair up, sorted front to back by s.
- **Gaits.** Never lift a foot if that would leave fewer planted feet than the active gait's minimum. Log the gait id every fixed step.

| Legs | Gait | Offsets | Duty factor β | Min planted |
|---|---|---|---|---|
| 0 | Slither (≥ 8 vertebrae) or squash-hop | — | — | — |
| 1 | Pogo hop | 0 | 0.5 | 0 |
| 2 | Walk → run at Fr 0.5 | L 0, R 0.5 | 0.62 → 0.38 | walk 1, run 0 |
| 3 | Tripod-ish | 0, ⅓, ⅔ | 0.7 | 2 |
| 4 | Walk → trot at Fr 0.35 ± 0.08 | walk LH 0, LF .25, RH .5, RF .75; trot LF+RH 0, RF+LH .5 | 0.75 → 0.6 | walk 3, trot 2 |
| 6 | Wave → tripod at Fr > 0.15 | tripod L1 R2 L3 0, R1 L2 R3 .5 | 0.75 → 0.5 | wave 4, tripod 3 |
| ≥ 7 or unbalanced | Metachronal | per side rear→front k/n, right side +0.5 | 1 − 1/n_side | ⌈n/2⌉ |

  Idle settle and turning in place keep n − 1 planted (one foot at a time); emotes on ≥ 4 legs keep ≥ 3.
- **Timing.** `Fr = v²/(gL)`, `Fr' = max(Fr, 0.02)`; stride `S = 2.3·L·Fr'^0.3`, clamped so `β·S ≤ 1.1L`; step rate `v/S`, clamped 0.8–4 Hz; below 0.05 m/s the gait clock stops and idle settle takes over. A leg's offset changes only in stance, ≤ 1 cycle/s. Acceleration ≤ 1.5 m/s², scaled with size.
- **Planting.** A planted foot is locked in world space, pitched and rolled to the ground normal. Landing target = predicted hip at landing + rest foot offset rotated by yaw + `v·β·T/2` + a turning term. Forced step when `|foot − desired| > 0.6S`; idle settle moves one leg at a time once the error exceeds 0.15L.
- **Contact point** (every foot metric): for a foot part, its lowest L0 vertex at rest (store the index), read each fixed step with `SkinnedMesh.getVertexPosition` on the merged parts mesh; for a bare tip, the tip-socket bone origin minus the tip radius along the ground normal. Never measure the IK target.
- **Swing:** horizontal smootherstep (zero velocity at touchdown); height `y = H·sin(π·u^0.8)`, `H = clamp(0.1L + 0.15·step, 0.06L, 0.3L)`; toe −20° at lift-off, +10° before landing.
- **Body:** height = mean ground under the hips + rest hip height × (1 − 0.08·run), critically damped spring (ω 10); tilt from a least-squares plane through planted and predicted feet, up = slerp(worldUp, normal, 0.6), ±25°, spring ω 8; long bodies undulate with the gait.
- **IK:** 2 segments analytic two-bone; 3 segments toe target → ankle → two-bone; 4+ 2D FABRIK in the leg plane with a pole from the rest knee (8 iterations, 0.5 mm; hinge limits rest ±60–100°, knee 5–160°). A target beyond 0.98 × reach may slide: flag the step reach-limited and lower the body.
- **Slither:** `yaw_i = A_i·sin(2π(s_i/λ − f·t))`, λ = 0.7 body lengths, A 0.2 at the head to 1.0 at the tail, speed `f·λ·0.6`, head counter-rotating. **Turn in place** (speed < 0.1 m/s, yaw error > 10°): ≤ 120°/s × (L/0.5)^−0.5, feet stepping. **Arms** counter-swing 15–25° walking, 35° running.
- **Springs** (tails, antennae, stalks, whiskers, tufts, fins): Verlet at 120 Hz, 2 substeps, pose pull `k_i = 0.25·(1 − 0.6i/n)`, damping 0.9, gravity × 0.2, ≤ 64 particles.
- **Wings:** flap at `clamp(2.5·sqrt(0.5/span), 1.2, 6)` Hz (buzz 12 Hz), stroke +45°/−30°, downstroke 45% of the cycle; glide at 8° dihedral, ±2° wobble; takeoff 3 big flaps; landing +30° flare; at rest folded back 70°.

### 10.4 Emotes and idle life
Emotes are data: **channels** in creature-relative units (root, spine curve, head look, jaw, lids, limb targets by role, tail wag, wing spread, flare, breath, squash); **variants** with a `requires` list, the first met wins, a `*` variant always present; **layers** locomotion → posture → gesture → face → springs, 0.2 s blends. Each plays its voice mood (§12.5).
- **Dance:** 2 Hz bob 0.05H, roll ±8°, paired foot taps that keep support, arms up alternately, tail at 2 Hz; Dance ≥ 3 adds a spin, Dance 5 footstep sparkles. Legless: S-wave.
- **Roar:** crouch 0.25 s, head forward and up 15°, jaw 35° (beak 25°, mandibles ±30°), hold 0.8 s with a 5° shake at 12 Hz, frills flare, eyes stay big. No mouth: puff to 1.08× and shake the head.
- **Sit:** quad hind feet forward, pelvis −40%, pitch +25°; biped pelvis down, tail as tripod; hexapod body to 30%. Legless: coil.
- **Sleep:** lie low, lids closed, breathe at 0.15 Hz and 2× depth, head down, "Zzz" sprites. No lids: eye scale.y 0.1.
- **Wave:** arm IK up and out, wrist ±25° at 2.5 Hz; else a front leg (keeping 3 planted), else the tail, else a body wiggle.
- **Eat:** walk to fruit within 3 m; if none is that close, the nearest bush or tree shakes and drops one in front (from the respawn pool), so Eat always works. Bend to it, 3 chomps at 3 Hz (a grasper lifts it), 8 crumbs, a heart (bigger for the preferred diet). No mouth: squash over the shrinking fruit. In photo mode it mimes munching.
- **Fly / glide:** flyers take off, fly under WASD or tap and land with a flare; gliders launch from a jump or a hill. No wings: jump, flap arms, soft comic landing.

**Idle life** (editor and play): breathing, chest Y scale 1 ± 0.012 over 3.2 s (1.6 s after running); blinks every 2.5–6 s, 12% doubles, close 70 / hold 30 / open 110 ms; micro-saccades ±1.5° every 0.6–1.8 s; eyes follow cursor or touch (clamp 0.55 rad, slerp `1 − e^(−10dt)`); tail sway 0.4 Hz; weight shifts; a fidget every 8–14 s (look around, scratch, yawn, sniff); sniffing fruit within 1.5 m.

### 10.5 Photo mode
P or the camera button freezes time; pick an emote and scrub its pose. Free orbit 0.5–8 m, rule-of-thirds toggle, ±15° roll dial, rendered with Full skin and L0 parts. Backdrops: live island, Studio Sky, Sunset Peach, Starry Lilac (soft, never dark), Bubblegum, Mint Paper. Frames: none, polaroid, card. Save renders Hero quality (§11.5) to a PNG of 1920×1080 or 1080×1080 with the recipe embedded (§13.2). On touch devices, show the PNG full screen in an `<img>` overlay with `-webkit-touch-callout: default` and a looping ghost hand showing press-and-hold, so the iPad's own menu offers Save to Photos or Share (the same PNG, so both recipe copies survive); a big ✓ closes it. Use `navigator.share({files})` only when `isSecureContext`; `<a download>` on desktop.

## 11. Graphics

### 11.1 Colour and the swatch probe
- `NeutralToneMapping`, exposure 1.0 in the editor and 0.95 on the island (not ACES: hue shifts; not AgX: dull swatches). `outputColorSpace = SRGBColorSpace` with colour management; swatches are sRGB hex; noise volumes `NoColorSpace`; no Display P3.
- **Lighting rule, which wins over every intensity in §11.2:** a front three-quarter surface reaches 1.0–1.15 × albedo before tone mapping, so a swatch reads as itself.
- **Swatch probe** `?test&probe=swatch&c=<hex>&quality=<tier>`: a flat patch facing the camera, normal at azimuth −20°, elevation 15° (camera-relative), editor rig, skin smooth, pattern solid, 640×480, vignette and dither off for this probe only. In M2, render it at albedo 0.5, read pre-tone-map radiance through a HalfFloat target, and scale `environmentIntensity` and the key intensity by one common factor until it reads 1.0–1.15 × albedo; log the values. Swatch ΔE (items 26, 39) = Euclidean OKLab distance of the central 16×16 px mean after the final pass.

### 11.2 Lights, environment, pedestal
- **Editor rig**, following the camera azimuth on a 250 ms half-life spring so the creature is never backlit: key #FFF1DE 2.0 at azimuth −40°, elevation 50°, `shadow.intensity` 0.75; hemisphere #CFE6FF/#F2D9C4 0.35; cool rim #BFDDFF 1.8 at 150°, 25°; pink kicker #FFD6E8 0.9 at −145°, 10°.
- **Environment:** PMREM of a generated scene at `environmentIntensity` 0.70 (sky-to-peach gradient dome, key softbox 4×3 m at radiance 4.0, rim strip 1×5 m at 3.0, floor bounce disc); `RoomEnvironment` fallback.
- **Sky and floor:** gradient dome #5FA8E8 → #A9D6F5 → #FDE9D2 with a light pool behind the creature and faint wisps, dithered; the floor matches the horizon and fades into the sky between 8 and 14 m (no horizon line).
- **Pedestal:** lathe, R 1.4 m, height 0.18 m, bevel 0.04 m; top #F3F0FA → #EDE6FF with engraved rings; rim band emissive #7FE7FF at 2.4, pulsing to 4.0 for 120 ms on each placement, decaying over 600 ms, with a shockwave ring to 1.4R; 48 orbiting motes; additive under-glow #A6E9FF, 2.2R, opacity 0.35.
- **Framing:** auto-frame dollies over 900 ms so the creature fills 62% of the viewport height; after 6 s idle the camera drift-orbits at 3°/s.

### 11.3 Skin material
One `MeshPhysicalMaterial` program serves every skin type. The type is a uniform, never a define; clearcoat and sheen stay ≥ 0.01 so no define toggles; no transmission. Your own shaders also use uniforms, not defines, for anything that varies at runtime.

| Param | Smooth | Bumpy | Scaly | Leathery | Fuzzy |
|---|---|---|---|---|---|
| Roughness | 0.38 | 0.44 | 0.30 top / 0.58 groove | 0.56 | 0.74 |
| Clearcoat / roughness | 0.45 / 0.18 | 0.35 / 0.22 | 0.60 / 0.12 | 0.12 / 0.40 | 0.01 / 0.6 |
| Coat follows bump | 0 | 0.35 | 0.6 | 0.2 | 0 |
| Sheen / roughness | 0.20 / 0.5 | 0.15 / 0.5 | 0.05 / 0.5 | 0.25 / 0.6 | 1.0 / 0.35 |
| Wrap | 0.35 | 0.35 | 0.25 | 0.30 | 0.55 |
| Light-through | 1.0 | 0.9 | 0.6 | 0.7 | 0.8 |
| Detail (per H) | fBm 3 (k 0.06) + micro 22 | cell domes 16 (k 0.55) | shingled cells 24 (k 0.70) | ridged wrinkles 10 + pores 60 | strands 90; 5 fur shells on High |

`onBeforeCompile` injections (r170 chunks): wrap diffuse with a warm terminator tint (1.0, 0.55, 0.45), specular unwrapped; fake light-through (Barré-Brisebois: distortion 0.25, power 4, ambient 0.12) from key and rim, weighted by thinness `1 − smoothstep(0.03, 0.22, thickness)` and AO; rim `pow(1 − N·V, 3)·0.22`, sky-tinted; occlusion = baked AO × up to 8 sphere occluders on indirect diffuse, specular, clearcoat and sheen; paint, cavity (darkens 18%) and belly (§9); roughness from detail height plus Toksvig anti-aliasing; clearcoat normal mixed toward the bump normal by "coat follows bump".

### 11.4 Eyes and hard parts
- **Eyes:** a 24×20 sphere with a 6% cornea bulge within 35° of +Z, plus two 24×5 lid caps in skin material, ≤ 1.4k triangles per eye; the parallax iris carries the detail. Upper lid −80° (open) to 0° (closed), tilting ±12° at the inner corner (up curious, down grumpy); lower lid 0° to 25° (happy squint on giggle, eat, dance, purr); lidless eyes squash to 0.85 Y to squint. Sclera roughness 0.35, clearcoat 1.0 at 0.04, #FBF6EE → #EBD9DC with a lid AO band. Iris radius 0.48, pupil `mix(0.16, 0.26, dilate)`, parallax refraction (IOR 1.336, iris plane z 0.82), radial fibres, collarette, limbal ring. Catchlights locked in view space, big upper-left (−0.45, 0.55, 1) and small lower-right, HDR (slight bloom), identical in every eye.
- **Hard parts:** mouth interior #C8505E → #4A1621, never a black hole; tongue #F07C8C; teeth ivory #FFF4DD; keratin base-to-tip gradient, growth ridges, clearcoat 0.8; shell iridescence 0.35, clearcoat 1.0; membranes use the skin program, DoubleSide, thickness forced to 0.02 so they glow.

### 11.5 Render path, tiers, hatch and programs
- **Path.** Composer tiers render into a `HalfFloatType` target with `samples: 4`, then post between two non-MSAA HalfFloat targets (not the stock `EffectComposer`, which clones the MSAA target). Final pass: exposure, Neutral, lift-gamma-gain, saturation/vibrance, vignette, sRGB, interleaved-gradient-noise dither ±0.5/255. Editor grade: lift (0.010, 0.006, 0.022), gamma 1.02, gain (1.0, 0.995, 0.985), saturation 1.05, vibrance 0.10, vignette 0.30 plum-tinted (0.93, 0.90, 0.97), 0.38 in Paint. Island: lift (0.004, 0.008, 0.024), gamma 1.03, gain (1.035, 1.0, 0.955), saturation 1.07, vignette 0.22.

| | Low | Medium | High |
|---|---|---|---|
| DPR / pixel cap | 1.25 / 1.4 MP | 1.5 / 2.2 MP | 2.0 / 2.6 MP |
| AA, grade | Canvas MSAA, no composer; `CustomToneMapping` (Neutral + LGG + sat), CSS vignette | MSAA 4× target; final pass | As Medium |
| Shadows | PCF 1024 r1.5 + foot blobs | PCF 1024 r2.5 + 256² contact | PCSS 2048 (16 blocker + 25 PCF taps) + 512² contact |
| AO | Baked SDF + spheres | As Low | + GTAO half-res, editor only (12 samples, radius 0.18H, blend 0.55) |
| Bloom | Additive sprites | Unreal quarter-res 0.22 / 0.50 / 0.95 | Unreal half-res 0.28 / 0.55 / 0.92 |
| Skin detail-relief lookups per fragment | 1 | 1–2 | 4 analytic + fur shells |
| Grass / flowers per species | 8k / 125 | 18k / 250 | 36k / 450 |

- **Shadows:** PCF only, never VSM; frustum fitted to the bounding sphere × 1.1, texel-snapped; `bias −0.0002`, `normalBias 0.01H`. In the editor, update shadows at 15 Hz while only idle motion runs, every frame during drags and emotes.
- **Hatch screen** (the boot cover): a pastel speckled egg wobbles on the pedestal while shaders compile and the tier calibrates, with a ghost hand showing a tap. The first tap (which also unlocks audio) cracks it into soft shell confetti; the saved creature, or Bloop, pops out with squash 0.8 and `ui.born_tada`. With no tap within 4 s of ready, it hatches silently.
- **Tier choice.** (1) Boot guess: no float or half-float colour buffer → Low; iPad (`/iPad/`, or MacIntel with `maxTouchPoints > 1`) at ≥ 2360×1640 → Medium, other iPads Low; Mac → High; anything else (Windows, Linux, Android, ChromeOS) → Medium. (2) Calibration behind the hatch: 30 warm-up frames, 90 measured; p90 > 17.5 ms → drop a tier and retest 60 frames; median < 9 ms at Medium → try High. (3) Governor over 4 s windows: p90 > 18.5 ms twice running → render scale −0.1 down to 0.7, then drop a tier; upgrade only after 20 s under 11 ms, at most once per session; never mid-drag; fade switches over 150 ms; ≤ 6 resolution changes per session (WebKit leaks on resize); if > 80% of frames sit at 33.3 ± 1 ms the device is 30 Hz-capped (Low Power Mode): never drop below Medium for that. (4) Save the tier in localStorage (try/catch). A parent-gated setting (hold 2 s) offers three icon buttons (3, 2, 1 sparkles; aria-labels Pretty, Balanced, Speedy).
- **Compile up front.** Behind the hatch, `compileAsync` one mesh per variant (skinned skin with shadow, skinned parts, eye, membrane, shell, mouth, terrain, grass, water, sky, pedestal, post, bake), then render one shadowed frame into a 1×1 target so depth programs compile. **Program budget** after warm-up (`renderer.info.programs.length`): **Low ≤ 32, Medium ≤ 44, High ≤ 56**, reported split into scene, shadow-depth, post and bake/thumbs. The hard invariant: the count never grows after warm-up. Known fixed costs: UnrealBloomPass = 9 (or write a 3-program dual-filter bloom instead); GTAOPass = 5 + 1 per mesh variant; each shadow-casting material adds one depth program per skinned, instanced or plain variant; a SkinnedMesh and a Mesh sharing a material are 2 programs.
- **Hero renders** (saved photo, card, GLB) use Hero skin + L0 parts and are exempt from the 80k real-time triangle cap.
- **Context loss:** `preventDefault` on `webglcontextlost`; on restore, rebuild everything from the recipe.
- **Thumbnails:** a ThumbStudio in the same context and rig renders 176² cards, un-premultiplies alpha, reads back with `readRenderTargetPixelsAsync`, ≤ 2 per frame, none during drags; the selected card turntables at 25°/s, re-rendered at 15 fps.
- **Device budgets** (verified by the user, §16 items 44–45): frame p95 ≤ 16.7 ms on MacBook Air (High) and iPad (Medium/Low); JS ≤ 4 ms (Air) and 6–7 ms (iPad) per frame; GPU memory ≤ 400 / 250 MB; boot to first creature frame ≤ 3 / 5 s. Container-checkable budgets live in items 8 and 37–41.

### 11.6 Beauty checks
`shoot.cjs` computes these on the M2 hero shots, and again in M3 and M6 on Trundle and a painted starter in the same framing, using `probe.mask()` and `probe.eyes()`; a miss fails the milestone and item 43.
1. The creature fills 55–70% of the frame height.
2. No creature pixel has max(R, G, B) < 10; ≤ 0.3% are clipped (≥ 254 in every channel) outside the catchlights.
3. Every eye's upper-left quadrant reaches luma ≥ 235.
4. The outer 3 px silhouette band's mean luma is ≥ 1.12× the interior's (the rim reads).
5. In `m2/05-backlit`, the fin or ear is ≥ 1.3× as bright as the same render with light-through off.
6. The pedestal halo at 1.1R is ≥ 1.2× the floor's luminance; a 40×10 px band under the lowest foot is ≥ 8% darker than the pedestal 60 px to the side.
7. In each sky column outside the mask, the longest run of identical RGB is ≤ 16 px at 1280×800.

## 12. Audio

### 12.1 Probe (M0) and cases
Only when the key is non-empty:
```
code=$(curl -sS -o "$SCRATCH/probe.json" -w '%{http_code} %{http_connect}' \
  -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/user/subscription)
```
Key empty → Case B. `000` with connect `403` → B (proxy policy; quote `curl -sS "$HTTPS_PROXY/__agentproxy/status"`, never work around it). Other `000` → retry twice 30 s apart, then B. `200` → A. `401`/`403` with `detail.status` `missing_permissions` → one real sound-generation request for `ui.button_tick` variant 0 (cached as a raw): `200` → A, else B. Other `401` → B. `429`/`5xx` → retry 3× over 2 minutes, then B, and re-probe at M8. Log only codes and `detail.status`, never the key or headers.
- **Case A (key works).** Write `sound-manifest.json` and `gen-sounds.mjs` in M1. Right after the M1 checkpoint, start `NODE_USE_ENV_PROXY=1 node sborn/tools/gen-sounds.mjs --max-credits 50000 > sborn/tools/audio-out/bake.log 2>&1` in the Bash tool's background mode (timeout 7200000) or with `nohup … &` (Node's `fetch` ignores `HTTPS_PROXY` without that flag; `NODE_EXTRA_CA_CERTS` is set). While it runs, checkpoint `"Sborn M8 bake checkpoint (<done>/<total>)"` every 25 raws or 15 minutes, committing `tools/audio-raw/**` (the paid raws; git is the only durable store) and `gen-log.jsonl`. After a restart, rerun it; cached raws are skipped. If it exits 0 or 1 with ids missing and no fatal error, run it once more before placeholders fill gaps. In M8, post-process, check, and commit `audio/**`, `report.json` and the contact sheets.
- **Case B (no usable key or host).** Build everything else, including generator, manifest and `board.html`; run `--dry-run`; ship `audio/audio-manifest.json` with all 85 ids and empty `variants`; the runtime synthesizes placeholders. Never write placeholder files into `audio/`. README and the report give the exact later steps.
- **Case C (mid-run errors).** Quota (`quota_exceeded`/402), auth (401) and permission (403) are fatal: stop, keep finished items, checkpoint, placeholders fill gaps. A 403 on `/v1/music` alone means music is not on the plan: skip music, continue. Report credits used, ids done and missing, and why.

### 12.2 Generator `sborn/tools/gen-sounds.mjs` (Node 22, global `fetch`, no dependencies)
`node gen-sounds.mjs [--only 'vo.jaw.*'] [--dry-run] [--concurrency 2] [--max-credits 50000] [--force] [--reprocess] [--apply-approvals approvals.json]`
- **Requests.** SFX: `POST https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128` (`_192` on Creator or higher), header `xi-api-key`, body `{text, duration_seconds (always set), prompt_influence, loop?}`, no `model_id` (log the server's model); accept only ≥ 1 KB bodies starting with `ID3` or an MP3 frame sync. Music: `POST /v1/music` with a `composition_plan`, falling back to `prompt` + `music_length_ms` + `force_instrumental: true`; on `bad_prompt`, retry once with the suggested text.
- **Cache.** `rawHash = sha256(canonical{api, text+suffix, duration, influence, loop, format, plan, variant})`; raws at `tools/audio-raw/<id>/<i>-<hash12>.mp3`, existing ones skipped; `.part` files renamed on success; a lockfile; `gen-log.jsonl` one line per request (id, variant, hash, status, request-id, cost, ms, time), never the key or other header values.
- **Errors.** Branch on `detail.status` and HTTP code: 429 `too_many_concurrent_requests` → concurrency −1, wait 1.5 s; 429/408/5xx → jittered backoff honouring `retry-after`, ≤ 6 tries; 400/422 → fail the item; quota/auth/permission → fatal. Exit 0 all done, 1 some failed, 2 fatal.
- **Credits.** Priority: (1) critical UI (`part_hover`, `button_tick`, `part_attach`, `part_pickup`, `part_in`, `part_out`, `color_pick`, `paint_swish`, `born_tada`); (2) voices of the starters' families; (3) footsteps and wings; (4) the two music loops; (5) the rest. Estimate each item before its request (40 credits/s; music ≈ 1,000/min); if spent (summed from `gen-log.jsonl` across all runs) + estimate > cap, stop cleanly and print the resume command. Never refuse the whole run on the total (print it as information). Add each `character-cost` header to the total, or the pre-estimate when it is missing (never 0); every 25 requests, if `/v1/user/subscription` is readable, reconcile with its `character_count` change and keep the larger figure.
- **Suffixes and `prompt_influence`:** ui "soft, gentle, airy and warm, rounded attack, soft and delicate, clean isolated one-shot, cute children's game interface sound" (0.55); voice "cute small friendly animal, breathy and soft, close-mic, dry, wordless animal vocalization" (0.4); move "soft cartoon foley for a children's game, gentle and quiet, close-mic, dry, isolated" (0.35); amb "calm, soft, airy, continuous and steady, no distinct events" (0.3). The manifest validator bans "says", "talks", "words" and onomatopoeia in mood phrases, anchors and timbres.

### 12.3 Manifest: 85 ids
Line format: id (envelope class): core prompt; seconds; variants generated/kept; loudness target (M = momentary-max LUFS, I = integrated). Envelope classes (post-processing fades; softness-check attack; runtime attack):
- **soft:** in 12–30 ms, out 80–200 ms; attack ≥ 10 ms; 15 ms.
- **tick:** in 3–6 ms, out 30–60 ms; ≥ 3 ms; 4 ms.
- **voice:** in 8–15 ms, out 80–200 ms; ≥ 8 ms; 12 ms.
- **swell** (swells and stings): out 300–800 ms. **loop:** no fades.

**UI (23, mono)**
- ui.part_hover (soft): Tiny soft airy blip, a breath across a small glass bottle; 0.5; 6/3; −28 M
- ui.part_pickup (soft): Soft rubbery lift-up pluck, rising pop, tiny wooden tock; 0.5; 6/3; −25 M
- ui.part_in (soft): Soft airy whoosh swelling in, like a gentle breath through a cardboard tube, ending in a tiny bubbly shimmer; 0.8; 6/3; −26 M
- ui.part_out (soft): Soft airy whoosh fading away, a breath sighing out, with a tiny falling bubble; 0.8; 6/3; −26 M
- ui.part_attach (tick): Soft round bloop like a droplet landing in jelly, warm low marimba note, satisfying snap; 0.6; 6/3; −23 M
- ui.part_remove (soft): Soft descending bloop, gentle suction pop; 0.6; 4/2; −24 M
- ui.stretch_squish (loop): Continuous soft rubbery squishing of modelling clay, steady; 4; 3/1; −28 I
- ui.vertebra_add (tick): Soft bubbly pop with a rising kalimba note, a bead clicking onto a string; 0.6; 4/2; −24 M
- ui.scale_up (soft): Gentle rising airy swell, soft inflating-balloon squeak; 0.8; 4/2; −25 M
- ui.scale_down (soft): Gentle falling airy sigh, soft deflating rubber squeak; 0.8; 4/2; −25 M
- ui.paint_swish (soft): Soft wet paintbrush swish across smooth paper; 0.7; 6/3; −26 M
- ui.pattern_sparkle (soft): Soft shimmer of a few tiny glass chimes fading away; 1.2; 4/2; −26 M
- ui.color_pick (tick): Tiny soft glassy tap on a small crystal bowl; 0.5; 6/3; −26 M
- ui.tab_switch (tick): Soft paper page flick with a muted wooden tick; 0.5; 4/2; −26 M
- ui.button_tick (tick): Tiny muted felt-covered wooden tick with a soft breathy puff of air; 0.5; 6/3; −27 M
- ui.undo (soft): Soft reverse whoosh, descending two-note kalimba blip; 0.6; 4/2; −25 M
- ui.redo (soft): Soft forward whoosh, ascending two-note kalimba blip; 0.6; 4/2; −25 M
- ui.dna_spend (tick): Soft magical shimmering bell ping with a bubbly tail; 0.7; 4/2; −25 M
- ui.budget_bonk (tick): Gentle bonk on a cushion, muted low wooden boop, friendly; 0.5; 4/2; −25 M
- ui.save_chime (swell): Warm three-note celesta chime rising, airy tail; 2; 4/1; −23 M
- ui.photo_shutter (tick): Soft vintage shutter click with an airy whoosh, muffled and cute; 0.7; 4/1; −25 M
- ui.gallery_open (soft): Soft page-turn whoosh into a short gentle harp glissando; 1.5; 4/1; −25 M
- ui.born_tada (swell): Gentle magical ta-da, harp and celesta rising to a warm major chord; 3; 4/1; −22 M

**Voices (40) = 5 families × 8 moods**, class voice, generated 5 and kept 3, ids `vo.<family>.<mood>`, prompt `<mood phrase> of a small <anchor> creature, <timbre>`.
- Families (anchor; timbre; pitch bias): beak (round bird-like, dove or chick; whistly chirps; +2 st); jaw (round furry, puppy or bear cub; vowel-like, throaty; 0); snout (piglet-like, guinea pig or tapir; nasal, snuffly; −1); mandible (beetle-like, cricket; clicky chitter; +1); filter (whale-like water creature, manatee; bubbly, burbly; −2).
- Moods (phrase; s; target): coo (soft happy cooing hum with a warm rise and fall; 1.2; −20 M); chirp (one short curious call rising at the end; 0.8; −20 M); purr (contented steady purr, relaxed; 2; −23 M); growl (small playful growl like a puppy in a tug-of-war, rumbly, round and friendly; 1.2; −21 M); roar (tiny brave roar, puffed-up and cute, gentle and playful; 1.6; −19 M); eat (happily munching with pleased little hums; 1.4; −22 M); sleep (slow yawn, then soft sleepy breathing; 2.4; −24 M); giggle (bubbly little giggle, quick happy trills; 0.9; −20 M).

**Movement (14), ambience (4), music (4)**
- mv.step_pads: Six soft padded footsteps on grass, evenly spaced (sliced into hits); 3; 2/6; −27 M
- mv.step_hooves: Six light little hoof taps on soft earth (sliced); 3; 2/6; −27 M
- mv.step_claws: Six tiny claw-tipped steps on grass and soil (sliced); 3; 2/6; −28 M
- mv.step_sticky: Six sticky gecko-like steps, soft suction peels (sliced); 3; 2/6; −27 M
- mv.wing_flap: Six soft feathery wing flaps (sliced); 3; 2/6; −27 M
- mv.wing_buzz (loop): Soft fluffy hum of tiny wings, like a far-off bumblebee, gentle and steady; 3; 2/1; −28 I
- mv.glide_wind (loop): Soft steady wind past a gliding creature; 10; 2/1; −28 I
- mv.slither (loop): Soft rustle of a small body sliding through short grass, steady; 4; 2/1; −29 I
- mv.splash: Small creature hopping into a shallow pond, playful splash; 1.2; 4/2; −24 M
- mv.jump: Soft springy boing with an airy whoosh; 0.6; 4/2; −25 M
- mv.land: Gentle cushioned thump on grass, little rustle; 0.6; 4/2; −25 M
- mv.sniff: Two quick soft curious sniffs; 0.8; 4/2; −26 M
- mv.crunch_fruit: Biting a juicy apple, soft crisp crunch; 0.8; 4/3; −24 M
- mv.gulp: Soft cartoon gulp; 0.6; 4/2; −25 M
- amb.island (loop): Island breeze through grass and leaves, distant soft sea wash, sparse faraway birdsong; 30; 2/1; −30 I
- amb.pond (loop): Gentle lapping of shallow pond water on smooth stones; 20; 2/1; −30 I
- amb.editor_tone (loop): Very soft warm airy room tone with a faint dreamy pad; 20; 2/1; −34 I
- amb.bird_far: One faraway soft songbird trill; 2; 6/4; −32 M
- mus.editor_loop (music plan): calm dreamy lullaby; felt piano, kalimba, warm pads, soft vibraphone; 72 BPM, F major, 4/4, instrumental; sections A 40 s + A2 30 s, ending on the opening chord; negatives drums, vocals, intro, outro, ending, fade out, build-up; 70; 2/1; −23 I
- mus.play_loop (music plan): playful bouncy pizzicato, marimba, soft brushed shaker, ukulele plucks; 100 BPM, G major, quiet dynamics; same negatives with "heavy drums" for "drums"; 55; 2/1; −23 I
- mus.sting_drive (SFX API, swell): Short playful sting, pizzicato and kalimba bouncing upward, ready-set-go; 3; 4/1; −23 M
- mus.sting_save (SFX API, swell): Short warm sting, celesta and felt piano two-chord cadence; 2.5; 4/1; −23 M

**Estimate:** 367 sound-effect generations (about 642 s, ≈ 25.7k credits) plus 4.2 minutes of music (≈ 4.2k): about 29.9k credits before re-rolls.

### 12.4 Post-processing and checks (ffmpeg 6.1 is installed; sox is not)
- **Pipeline:** decode with a 40 Hz high-pass; reject takes with clipping runs, > 80% silence or M_max < −45 LUFS; trim; equal-power fades per class; slice sequence takes into the 6 hits nearest the median spectrum; loops keep the API loop if it passes the seam check, else crossfade at the best cross-correlation point, written as `[last 0.25 s | loop | first 0.25 s]` with `loopStart`/`loopEnd` so MP3 encoder delay never gaps; one −4 dB shelf at 8 kHz if > 12% of energy is above it; level with `ebur128=peak=true` 1 dB under the ceiling (−3 dBTP SFX, −2 music); CBR MP3 96k mono SFX, 128k stereo ambience and music; keep the best distinct variants (log-mel cosine < 0.97). Without ffmpeg (e.g. the user's Mac), copy raws with `processed:false` and let the runtime trim, normalise and envelope; README says `brew install ffmpeg` enables the pipeline.
- **Checks** (`audio-out/report.json`): format (ffprobe codec, 44.1 kHz, channels); duration (UI ≤ 0.9 s except swells); loudness ±1 LU; true peak under the ceiling, zero clipping runs, edges |x| ≤ 0.002, DC < 0.005; no clicks (second-difference spikes > 8× local median); spectral centroid (warning only); softness (≤ 10% energy above 8 kHz, attack per class); loop seam (RMS within 1.5 dB, log-mel continuity, no click). Look at waveform-plus-spectrogram contact sheets in `audio-out/sheets/`. Manifest entries: `{file, sha256, durationSec, lufs, truePeakDb, source:"elevenlabs", rawHash, approved:false, checks}`. **You cannot listen: never set `approved:true`.** `tools/board.html` lets the user play every variant, mark keep or reject and export `approvals.json`; `--apply-approvals` merges it.

### 12.5 Runtime (`src/audio/engine.js`)
- **Graph:** source → envelope → StereoPanner → bus (ui 0.7, voice 0.85, move 0.6, amb 0.5, music 0.4) → master compressor (−20 dB, ratio 3); a shared generated 1.6 s "air" reverb (sends ui 0.15, voice 0.2).
- **Unlock** inside the first pointerdown, touchend, click or keydown with one silent sample; treat `interrupted` like `suspended`; suspend when hidden; `navigator.audioSession.type = 'ambient'` where it exists (respects the iPad mute switch). Decode the critical set (§12.2 priority 1) after unlock, the rest on first use; skip a UI sound not ready within 30 ms (voices may wait 150 ms).
- **`play(id, {x, size, family})`:** shuffle-bag variants, no immediate repeat. `rate = 2^((sizeSt + biasSt + idSt + jitter)/12)`, `sizeSt = clamp(−7·log2(height/1 m), −9, +9)`, fixed per creature `idSt = (fnv1a(recipe.seed)/2^32 − 0.5)·3`; jitter ui ±0.4 st, voice ±1.2, move ±1.5. Per-creature gain on voice and move buses `sizeDb = clamp(5·log2(height/1 m), −5, +3)`; footsteps scale with foot radius (±3 dB); per-play jitter ±1–2 dB. Attack per class; pan by screen x, ±0.7.
- **Limits:** bus caps ui 4, voice 3, move 6, amb 3, music 2 (the oldest is stolen with an 80 ms fade); one voice per creature; the same UI id within 40 ms is skipped; hover sounds only when the hovered part changes.
- **Loops:** `ui.stretch_squish` fades in 60 ms and out 150 ms, gain following pointer speed (0 below 0.02 m/s, full at 0.5 m/s) and rate 0.9–1.2; `mv.glide_wind` follows airspeed, `mv.slither` speed; buzz wings use `mv.wing_buzz`, not per-beat flaps. Ambience and music fade in 1.5 s, out 2 s; editor and play music crossfade over 2.5 s; voices and stings duck music 6 dB. Mute (corner button or M) is remembered.
- **When:** `ui.part_in` as a card lifts off the drawer and at −6 dB under `ui.part_attach` on a drop; `ui.part_out` on detach, poof and undoing an add; every other §8 action its sound; footsteps by foot family; wing beats; crunch and gulp; bubbles reuse `ui.pattern_sparkle` at rate 1.3; `ui.born_tada` at the hatch; `mus.sting_drive` entering Play; `ui.save_chime` and `mus.sting_save` on gallery saves.
- **Mood map** (largest mouth's family): tap skin → giggle; idle fidget and drag "ooh" → coo; new mouth or eyes, wave, budget-bonk head tilt → chirp; sit, paint shake-dry → purr; roar → growl lead-in (jaw and snout), then roar; eat → eat; sleep → sleep; dance → coo on the beat, chirp at the spin.
- **Placeholders** (file missing, undecodable or failing sha256): soft sine/triangle blips with a pitch drop, low-passed at 3 kHz; `part_in`/`part_out` as noise through a band-pass sweeping 400 → 1,800 Hz (or back) with a 0.5 s equal-power swell; voices as detuned triangles through a per-family formant with a pitch contour per mood (from Doodle World's `voice.js`); steps as 40 ms low-passed noise; wind, slither and buzz as noise through a moving band-pass; music as a soft pad with random pentatonic kalimba notes.
- **Reporting:** one boot line, e.g. `[sborn-audio] 85 ids · 73 generated · 12 placeholder · 73 unapproved`. `approved:false` files play normally and count as generated and unapproved; ids rejected via `--apply-approvals` use placeholders. `audio.status()` returns `{generated, placeholder, unapproved, missing}`, shown in `?debug`. **A placeholder is never reported as generated.**

## 13. Save and share

### 13.1 Autosave and gallery
- **Storage:** IndexedDB `sborn` v1: `creatures` `{id, name, recipe, thumbStrip: Blob, updated}`; `autosave` key `current` `{recipe, undoTail (last 20)}`. A synchronous localStorage mirror of the current recipe (≤ 16 KB). `navigator.storage.persist()` where available. All storage in try/catch; the game works with storage blocked.
- **Every creature is a gallery entry from its first edit.** New, a starter, a dropped card or an opened link each creates a new entry id (starters and cards are copied, never edited in place). Autosave writes `autosave/current` and that entry 800 ms after each commit and flushes on `visibilitychange: hidden` and `pagehide`. New is undoable: Cmd/Ctrl+Z or the undo button brings the previous creature back.
- **Gallery:** a wooden shelf of up to 200 creatures with **spinning thumbnails** (16-frame, 128 px turntable strips rendered at quiet moments, CSS `steps(16)` at 8 fps); tap loads. Long-press offers bin or duplicate; bin wobbles the thumbnail with big ✓ and ✗, and after ✓ it shrinks into an undo bubble at the end of the shelf for 10 s. The top row always holds the **8 starters**; loading one sets `meta.from`.
- **Starters** (full recipes in `catalog/starters.js`, validated, within both budgets):
  - Bloop: 0 legs; the default; hops.
  - Wigglet: 0 legs; 16 vertebrae, Munch Muzzle, Moon Eyes, Sprout Tail; slithers.
  - Peepsy: 2 legs; Peep Beak, Dreamy Eyes, a Bendy Limb pair with Tiptoe, a Flutter Nub pair, Puff Tail.
  - Trundle: 4 legs; Snuffle Snoot, Moon Eyes, Tap Hooves, Brush Tail, Nub Horns, Fluff Tufts.
  - Skitter: 6 legs; Click Mandibles, Dot Cluster, Grippy Talons, Bobble Antennae, Armour Plates.
  - Clatter: 4 legs + 2 pincer arms; Squirt Spout, Stalk Eyes, Snip Pincers, Dome Shell.
  - Flapjack: 2 legs + Umbrella Wings; Hook Beak, Almond Eyes, Fan Tail; flies.
  - Octoboop: 8 legs; Trumpet Bell, Big Peeper, Pillow Pads, Neck Frill; metachronal gait.

### 13.2 Creature card PNG
- **Card**, 1080×1350: a Hero render in the creature's best pose on a soft backdrop, its name, stat icons with pips and a small "drag me in" icon. Render to a target, copy to a 2D canvas (`colorSpace: 'srgb'`, alpha 255), `toBlob('image/png')`.
- **Recipe copy 1, iTXt** after IHDR: keyword `Sborn.creature`, compression flag 1, zlib JSON via `CompressionStream('deflate')`, own CRC32.
- **Recipe copy 2, LSB** (for hosts that strip chunks): `"SBRN" | ver | len16 | deflate-raw | CRC32` in the low bit of R, G and B (never alpha) of the bottom 64 rows, written 3× and majority-decoded. Raw capacity 25,920 B, about 8.6 KB of payload; above that, write only iTXt and log it. Read with `createImageBitmap(blob, {premultiplyAlpha: 'none', colorSpaceConversion: 'none'})`.
- **Loading:** drop a PNG anywhere or pick one with the gallery "+"; iTXt first, then LSB; both fail → a friendly shake. Photo PNGs embed the recipe the same way.

### 13.3 Share link
`index.html#c=1.<base64url(deflate-raw(JSON))>`, unpadded; ≤ 2,000 characters for the 40-part fixture (otherwise add a compact `2.` array form with integer mm and catalog indices, logged). Opening inflates with a 64 KB cap, validates and migrates, then shows the creature in a bubble with big ✓ and ✗; ✓ adds it to the gallery. Copy with `navigator.clipboard` where allowed, else a selectable field (`navigator.share` in secure contexts).

### 13.4 GLB export
Remesh at Hero quality; pose (rest plus a relaxed idle frame) and bake positions with `SkinnedMesh.applyBoneTransform`; recompute normals. Bake paint to vertex colours on the GPU with the same GLSL (`render/bake.js`, built in M2): a `Points` pass writes vertex i to pixel `(i % 1024, i / 1024)` of an RGBA8 target, read back, decoded to linear, stored as `COLOR_0`; every material module has a bake chunk, so eyes, keratin and shell bake too. Merge into ≤ 3 meshes with `MeshStandardMaterial({vertexColors: true, roughness: 0.6})`; `GLTFExporter` `{binary: true}`, metres, ≤ 8 MB, named `<name>.glb`. README: the skin is closed and manifold; parts are separate overlapping shells, which slicers handle.

## 14. Milestones
**Every milestone:** re-read (rule 12); build the functional path and its tests first and checkpoint; then add juice in a second pass (§8.3 pop and ripple, §8.4 odometer and helix, §9 shimmer and stars, §10.1 butterflies and pollen, §11.2 motes). **Exit** = its `M<k>.*` tests n/n; its listed §16 items PASS (or FAIL under rule 4); its screenshots in `screens/manifest.json` with observations; DECISIONS section and README status row written; Doodle World 17/17; checkpoint.sh exit 0 with PUSHED. Do not start the next milestone until the exit passes or its failures are recorded under rule 4. After each screenshot name comes its mustShow list.

- **M0 Recon and scaffold.** First record `Start commit` and `date -u` in DECISIONS; if `git ls-files prompts/sborn-master-prompt.md` is empty, note it and continue. Read all of Doodle World (README, DECISIONS, `src/**`). `sborn/` tree, checkpoint.sh, vendored three + addons + CHECKSUMS, font, run.command, boot to sky, pedestal and hatch, async tests.html, browser.cjs, run-tests.cjs, shoot.cjs, an acceptance.cjs skeleton, console allowlist, thresholds.js, audio probe. Items 1, 5, 6, 59, 60(a, b), 73. `m0/01-boot-desktop`, `02-boot-ipad`: gradient sky; pedestal centred with cyan rim glow; no text; nothing cropped.
- **M1 Recipe, skin and rig.** Schema, ops, history, hash; sdf, nets3, mesher, two-worker client and the complete step-5 job; `rig/skeleton`, `rig/weights`; 12 fixtures (biped, quad, hexapod, octopod, tripod, uniped, snake, blob, flier, big head, 40-part max, 3-vertebra min) with socket mounds only, re-verified with real parts in M3; temporary clay material. **Walk spike:** the quad fixture walks 10 m on flat ground with analytic two-bone IK, drift reported (exit: p95 ≤ 10 mm). Manifest and generator; Case A bake starts after this checkpoint. Items 7 (fixtures), 8, 9 (geometry), 10, 14 (limb roots), 63, 64. `m1/01-default`: Bloop smooth and closed, no cracks or facets, on the pedestal. `02-fixtures-sheet`: all 12 numbered, closed, smooth junctions.
- **M2 The look.** Renderer, tiers, calibration, governor, post, lights, PMREM, sky, pedestal, contact shadows, skin (5 types) and paint shader, eyes, noise volumes, warm-up, swatch probe and lighting calibration, GPU vertex bake, context loss, `?debug`. Items 26, 37 (editor), 39 (editor, 3 tiers), 42, 43, 61 (`?debug` half), 65. `m2/01-hero-high`, `02-hero-medium`, `03-hero-low`: pedestal glow, seamless sky, rim light, contact shadow, catchlight in every eye (§11.6). `04-skin-macro`: 5 skin types, distinct micro-detail. `05-backlit`: a thin fin or ear glowing warm. `06-eye-macro`: iris fibres, pupil, limbal ring, both catchlights. `07-material-lineup`: skin, eye, keratin, iridescent shell, glowing membrane, red-plum mouth interior, ivory teeth. `08-debug-overlay`: every `?debug` field and the copy button.
- **M3 Parts and starters.** All 70 builders, attachment, mirroring, centre snap, sockets, sink and mounds, skinned anchors, roles, thumbnails, and `catalog/starters.js` with all 8 starters as full recipes. Items 7 (starters), 12, 13, 15, 16, 58. `m3/01-mouths` … `08-details`: every part of the category fully in frame, rounded tips visible. `09-attach-macro`: a horn base and a limb root filling ≥ 30% of the frame; no gap, ring or colour seam.
- **M4 Motion core (flat ground).** Idle, gait, IK, springs, wings, body, emotes, contact-point metrics, `bench-sim.mjs`. Items 9 (locomotion), 28 (flat), 29–32, 34. `m4/01-walk-quad`: mid-stride, planted feet touching the ground, slide readout. `02-walk-hexapod`: tripod phase, 3 feet planted. `03-slither`: S-curved body. `04-emotes-sheet`: 7 emotes × biped, quad and legless at peak pose.
- **M5 Editor.** Layout, drawer, tabs, gestures, picking, handles, spine, limb and part editing, undo, budgets, stats, reactions, onboarding, camera, names, icons; `e2e.cjs` steps 1–2. Items 11, 17–23, 66, 72. `m5/01-editor-desktop`, `02-editor-ipad`: every §8.1 placement; no words except the name and numbers. `03-editor-ipad-portrait`: 2-row shelf and stats strip. `04-drag-and-look`: part mid-drag, eyes on it, ghost −DNA, ghost twin. `05-hint-leg`: ghost hand and glow on the Ready Leg card. `06-budget-full`: pill or jar full, ≥ 1 locked card still visible. `07-symmetry-ghost`: off-centre drag with a shimmering twin. `08-ui-icons-sheet`: every icon at 2×.
- **M6 Paint.** Layers, patterns, masks, tints, iris, skin types, swatch fan, dice, Paint like, emote strip, shimmer. Items 24, 25, 27. `m6/01-paint-tab`: 3 layer cards, 18 swatches, 10 pattern blobs, S/M/L chips, dice. `02-shimmer-mid`: wavefront band mid-body with stars. `03-pattern-sheet`: patterns 0–9 numbered on one creature. `04-stripes-follow-spine`: a bent creature with ≥ 10 vertebrae, stripes perpendicular to the spine along the curve, ring bands on the limbs.
- **M7 Island and drive.** Island, wind, fruit, toys, transition, controls, camera, photo mode. Items 28 (island report), 33, 35, 36, 38, 39 (island), 40. `m7/01-island-establishing`: hill, pond, beach, trees, ocean fading into fog. `02-pond-eating`: fruit, crumbs, heart. `03-dance`: mid-bob, feet planted. `04-glide`: airborne at dihedral above terrain. `05-photo-mode`: backdrop picker, frames, roll dial, thirds grid. `06-island-ipad-low`: `?quality=low` at 1180×820 with grass and flowers.
- **M8 Audio.** Engine, placeholders, music, board, post-processing and checks. Case A: the bake has ended (exit code recorded) and is post-processed and checked; if it is still running, start M9 and finish M8 before M10. Items 51–54, 69, 70 (52 NA in Case B). `m8/01-debug-audio-status`: overlay counts equal `audio.status()`. `02-contact-sheet`: waveforms and spectrograms (Case A; NA in B).
- **M9 Save and share.** Autosave, gallery with turntables, starters row and remix, card, link, GLB. Items 46–50, 60(c), 68, 71. `m9/01-gallery`: 8 starters on top plus saved creatures. `02-card.png`: the real 1080×1350 export (hero, name, stat pips, drag-me icon). `03-share-menu`: card, link and 3D icons. `04-link-bubble`: creature in a bubble with ✓ and ✗.
- **M10 Performance and acceptance.** `?bench`, tier tuning, leak checks, reduced motion (squash halved, no camera drift, a fade instead of the shimmer), README, USER-CHECKS.md, `e2e.cjs`, fresh-clone acceptance, final report. All remaining items, including 41, 56, 57, 61 (`?bench` half), 62, 67. `m10/NN-<screen>-<d|i>` for editor, paint, play, photo, gallery, share, onboarding, debug and bench (score plus per-stage table) at desktop (d) and iPad landscape (i), numbered 01–18, plus `19-editor-ipad-portrait`: each screen complete and uncropped.

## 15. Verification protocol

### 15.1 Serve, launch, Doodle World check
- `$SCRATCH` = your scratchpad directory (or `mktemp -d`); `ROOT=$(git rev-parse --show-toplevel)`. Serve Sborn with `python3 -m http.server 8791 --directory "$ROOT/sborn"` and Doodle World from `$ROOT` on 8790, in the background; kill both when done.
- Playwright 1.56.1 is global; Chromium is preinstalled at `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH` set). **Never run `playwright install`.** ES imports ignore `NODE_PATH`, so drivers are `.cjs`:
  ```js
  let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
  (async () => {   // CommonJS has no top-level await
    const browser = await pw.chromium.launch({ headless: true,
      args: ['--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
    // ...
  })();
  ```
  Never pass `--disable-frame-rate-limit` or `--disable-gpu-vsync` (they closed the page and hung Node). WebGL2 runs on SwiftShader at 1–3 fps; frame rate here is not a performance signal.
- **Doodle World check:** load `http://localhost:8790/tests.html`, wait until `document.title !== 'running…'` (≤ 120 s); pass only if the title is `ALL PASS` and the h1 contains `17/17`. Pause background jobs (bake, ffmpeg) meanwhile. If only the 250 ms speed test fails, rerun up to 3 times and record the attempts; a speed-only failure under load is not a regression.

### 15.2 Drive
- **Contexts:** desktop 1280×800, DPR 1; iPad 1180×820 and 820×1180, `hasTouch`, iPad Safari user agent, `deviceScaleFactor` 1 (DPR caps are covered by item 65).
- **Input:** Playwright mouse, wheel and keyboard; `page.touchscreen` for taps only; touch drags, pinch and twist via CDP `Input.dispatchTouchEvent` (touchStart, touchMove ×N, touchEnd). Targets come only from `__sborn.probe.where()`.
- **Determinism:** load with `?test`, advance with `step()`, `await settle()` before every screenshot or measurement. Durations in §16 are game time (60 steps = 1 s) unless marked wall-clock; motion, idle and audio-timing metrics read simulation state. Timeouts: 120 s per action, 600 s per e2e scenario. `tests.html` takes `?group=`; `run-tests.cjs` runs each group in its own page. Input-driven e2e uses `?quality=low`.
- **Console:** capture every console error and warning, `pageerror`, `requestfailed` and response with status ≥ 400; fail on any not matching `sborn/tools/console-allowlist.json`, which starts as `[{"substring": "KHR_parallel_shader_compile", "why": "three.js notice; extension absent in SwiftShader"}, {"substring": "GPU stall due to ReadPixels", "why": "SwiftShader performance notice on readback; verified in this container"}]`. A new entry needs a DECISIONS bullet; the report lists every pattern with its hit count. Abort every non-localhost request and count it under item 4, not as a failed request. **Zero GL errors** = `info().glErrors === 0` and no console message containing `WebGL:` or `GL_INVALID` outside the allowlist.

### 15.3 Screenshots
JPEG (`quality: 85`) at `sborn/screens/mN/NN-name.jpg`. To keep image tokens low (rule 13), shoot.cjs also writes a 640-px-wide copy to `tools/out/view/` (not committed; add it to `sborn/.gitignore`); open each copy once with your image-reading tool, and again only after a fix that changes it. `screens/manifest.json` entries: `{file, milestone, viewport, url, mustShow[], observed[], lumaStd, distinctColours}`, with one observed sentence per mustShow entry written after opening the image. **Blank** = luma std < 6 (0–255) or < 24 distinct 6-bit colours; shoot.cjs fails on blank. Pixel analysis (blank, §11.6, diffs) runs in Chromium: `page.evaluate` loads images with `createImageBitmap` into canvases and compares `getImageData`. Diffs use PNG captures in `tools/out/diff/`, never the JPEGs: 640×480, DPR 1, fixed seed, YIQ threshold 0.1, ≤ 0.5% differing pixels, against references made in this container (`tools/out/ref/`).

### 15.4 `?debug` and `?bench`
Only Chromium is installed; install nothing else. Real frame rates, Safari, Firefox, fp16, touch feel, sound and P3 are [U] items; container numbers are labelled "4 vCPU software-GL container".
- **`?debug` overlay:** fps, p50, p95, cpuSimMs, cpuSubmitMs, triangles, calls, programs, geometries, textures, tier, dprRung, renderScale, remeshMs, footSlideMm, gpuMemMB (estimate), audio `{generated, placeholder, unapproved, missing}`, and a copy-JSON button (text-box fallback).
- **`?bench`:** 3 s warm-up, then 4 stages over 25 s: editor, 40-part fixture, remeshing drag every 100 ms (5 s); editor idle orbit (5 s); island walk on a fixed path (10 s); photo hero frame (5 s). Score = Σ w·min(1, 16.7/p95)·1000 + min(1, 40/full_ms)·250, w = stage seconds/25. Shows one big number, per-stage p50/p95, tier, DPR and renderer; a tap copies `{score, stages[4]{name, p50, p95}, tier, dpr, renderer, ua}`. `?bench&quality=high` forces a tier.
- Never write "60 fps achieved" from container data; write "MacBook Air and iPad frame rates: user verifies with `?bench` (target p95 ≤ 16.7 ms)."

### 15.5 Acceptance runner and fresh-clone verification
`node sborn/tools/acceptance.cjs [--report]`, serving from its own checkout: (1) kills and restarts the servers on 8790 and 8791; (2) runs the Doodle World check, `run-tests.cjs`, `e2e.cjs` (3 contexts), `bench-sim.mjs`, the static scan (item 59), the git checks (items 1, 6) and the screenshot manifest check (item 56); (3) writes `tools/out/acceptance.json` = `[{item, tag, status, value, threshold, unit, method, evidence, ranAt, commit}]`, one row per §16 item, printing one line each; (4) exits 0 only if every [T], [M] and [S] row is PASS, or an NA or BLOCKED that rule 3 allows. Test ids are `C<nn>.<slug>` (checklist) or `M<k>.<slug>` (milestone-only); `window.__results` entries are `{id, name, milestone, items: [n], pass, ms, note}`. A [T] item with no passing test naming it is FAIL "no test". An [S] row passes only with an observed sentence for each mustShow entry. Commit `tools/out/*.json`.

**Final verification on a fresh clone:** `git clone --branch "$(git branch --show-current)" "$(git remote get-url origin)" "$SCRATCH/verify"`, kill the working-tree servers, run `node "$SCRATCH/verify/sborn/tools/acceptance.cjs" --report`, write the report into `sborn/README.md` in the working tree and checkpoint. Commits after the verified one may touch only `sborn/README.md` and `sborn/tools/out/**` (assert with `git diff --name-only <verified>..HEAD`). README states "Verified at commit <hash>"; the final reply gives the verified and final pushed hashes.

## 16. Hard Acceptance Checklist
[T] automated test (tests.html, e2e.cjs or acceptance.cjs); [M] measured metric with its number; [S] screenshot opened, with manifest observations; [U] user verifies on a device (a row in `sborn/USER-CHECKS.md`: steps, threshold, blank result). Statuses per rule 3; steps are game time (60 = 1 s).

**Repo and runtime**
1. [T] DECISIONS M0 holds `Start commit: <40 hex>`; `git diff --name-only <start>..HEAD | grep -v ^sborn/` and `git status --porcelain --untracked-files=all -- . ':!sborn' ':!prompts/sborn-master-prompt.md'` are empty; the Doodle World check passes (§15.1).
2. [T] tests.html reads `running…` until every async test settles, then ALL PASS or FAIL; exports `window.__results`; every [T] item is named by ≥ 1 passing test id.
3. [T] `git ls-files -s sborn/run.command` shows 100755; with the test server stopped, `timeout 5 ./run.command` (own process group, killed afterwards) serves `index.html` on 8791 within 5 s and prints a URL. Without `?test` the game reaches `ready()` and breathing scale differs between frames 1 s apart.
4. [T] The item-57 run makes zero non-localhost requests.
5. [T] CHECKSUMS.txt records `dist.integrity` (or `source: github tag r170`); vendored files match their sha256; `three.module.js` equals the repo-root copy; every addon imports in the browser.
6. [T] `git grep -I -i <name> -- sborn/` and `git ls-files sborn | grep -i <name>` are empty for the reference game's name; with the key set, `git log -p --all | grep -qF -- "$ELEVENLABS_API_KEY"` finds nothing.

**Skin and body**
7. [T] 12 fixtures (M1) and 8 starters (M3): 0 open edges, 0 NaN, non-manifold ≤ 1% of edges, volume > 0, Full skin ≤ 40k triangles.
8. [M] 50 remeshes each on the 40-part fixture, worker-internal ms: Preview p95 ≤ 15, Full (complete job) p95 ≤ 90; round-trip reported; Apple M1 Air estimate = container × 0.5–0.7, labelled estimate.
9. [T] Geometry hashes identical across 3 builds and main thread vs worker. State hash (FNV-1a of bone world matrices, root transform, each foot's `{planted, lock position}`, floats rounded to 1e-6) after 600 walking steps matches across two loads.
10. [T] 3–24 vertebrae; radius 0.04–0.60 m; wheel 8% ± 0.5% per 100-unit notch; min Y 0 ± 1 mm after each edit + 15 settle steps.
11. [T] Bendy Limb dragged d m: joints = clamp(1 + floor(d/0.22), 2, 5), tip–root distance within 10% of min(d, 5-joint reach); end-joint drags stay within 2–5 joints; roles correct for every fixture; a Ready Leg pair dropped anywhere on Bloop's side gives two legs with body min Y = feet min Y = 0 ± 1 mm.

**Parts**
12. [T] 70 parts at the §7 counts with all fields; each builds at L0/L1/L2 with no NaN and ≤ 1.5k L0 triangles; non-blank 176² thumbnail (luma std ≥ 6, alpha coverage 10–90%); silhouette IoU < 0.85 between any two in a drawer; every p-handle drag changes its `p`; 40-part fixture parts ≤ 40k after LOD selection.
13. [T] Every base-ring vertex inside the skin (field ≤ −0.15 × base height); OKLab ΔE ≤ 0.02 between the skin vertex nearest each anchor and the base ring, from the GPU vertex bake. [S] `m3/09-attach-macro`.
14. [T] After 200 random spine and limb edits, every part and limb root re-resolves within 0.5h of the surface with its sink; none lost.
15. [T] Twins equal the mirror within 1e-5 and wind outward; a symmetric skin is within Hausdorff ≤ 0.5h of its x-mirror; centreline snap gives one centred part.
16. [T] Rest pose reproduces rest positions within 1e-5; a 90° limb bend flips < 0.5% of triangles; posed parts follow the skin within 2 mm.

**Editor**
17. [T] 200 random ops then undo-all → original hash; redo-all → final hash.
18. [T] A part costing more than the remaining DNA cannot drop (recipe unchanged, bonk fired); refunds exact; total ≤ 2,000.
19. [T] Complexity ≤ 100; non-fitting cards show the lock, never hidden or droppable.
20. [T] `sborn/tests/starter-stats.json`, written before `stats.js`, lists per starter the exact parts (counts, mirroring) and per stat the contributors and arithmetic; `stats.js` matches it to 0.5 for 8 starters × 14 stats, including the §7 worked examples; the panel updates on the commit's frame.
21. [T] Item 57 step 2 builds a 6-legged creature with mouth, eyes, tail and horns by input alone on desktop and iPad (which first scrolls the drawer, then lifts a card): wrapped `op`/`load`/`undo`/`redo` counters read 0; targets come only from `probe.where()`.
22. [T] `?test&hints`, fresh profile: hint 1 ≤ 120 steps after `ready()`, gone ≤ 60 steps after the leg drops, hint 2 ≤ 120 steps later; after a reload hint 1 stays absent for 300 steps.
23. [T] Visible text (text nodes whose parent has `getClientRects().length > 0`, excluding `?debug`, `?bench`, tests.html) matches `^[0-9 .,:+−×%/·?-]*$` or equals `recipe.name`, in build, paint, play, photo, gallery, share menu, link bubble, hatch, `file://` and no-WebGL screens at all 3 viewports. Every `button`, `[role=button]`, `a`, `input`, `[tabindex]` is ≥ 44×44 px (cards ≥ 64) with an `aria-label`.

**Paint**
24. [T] 3 layers × 10 patterns × 3 sizes: zero GL errors, zero remeshes, program count unchanged.
25. [T] Fattening a vertebra moves the domain on unaffected limbs ≤ 1 mm; neighbour jump ≤ 3h within a chain; neighbour ΔE ≤ 0.03 across junctions.
26. [T] All 18 swatches on the swatch probe (§11.1) within ΔE ≤ 0.06 at High and Low.
27. [S] `m6/04-stripes-follow-spine`.

**Test drive** (speeds §10.2; contact point and gait minimums §10.3)
28. [M] Slide test: biped, quad, hexapod, octopod and tripod fixtures plus Peepsy, Trundle, Skitter, Clatter, Flapjack, Octoboop; walk and run, 10 m after 2 s of acceleration; flat ground pass/fail, the island bench path report-only (fails only on NaN or penetration > 1 cm). Per stance phase, every step: drift = max XZ distance from touchdown; penetration = max(0, ground − lowest foot vertex); air gap = max(0, lowest foot vertex − ground). Pass: drift p95 ≤ 3 mm, max ≤ 10 mm; penetration p95 ≤ 2 mm; air gap ≤ 5 mm; planted ≥ the logged gait's minimum on every step. Legs outside 0.3–1.0 m: drift p95 ≤ 1%, max ≤ 3% of leg length. Reach-limited steps may be excluded up to 2% of stance steps per creature and speed (count reported), else FAIL. Report a creature × speed × surface table.
29. [M] Same creatures and limits on a 1.5 m-radius circle at walk (2 laps) and a 360° turn in place.
30. [M] Snake and blob each cover 10 m in ≤ 1,500 steps; lowest skin vertex never > 1 cm below ground; no NaN.
31. [T] Every emote × fixture and starter, 180 steps: no NaN, foot penetration < 1 cm, no new programs; variants: legless → S-wave dance, coil sit, body-wiggle wave; mouthless → puff roar, squash eat; wingless → fly fallback; lidless → eye-squash sleep.
32. [T] Flapjack: F, hold W 600 steps: root ≥ 1 m above terrain for ≥ 480; F lands within 300 with all legs planted and a +30° flare logged. Glide-only fixtures after jump + F: never above the apex, descent slope 1/(1 + Glide) ± 15%. Wingless: fallback, grounded within 120. `canFly` only for Flapjack and the flier fixture (threshold logged). No NaN.
33. [T] WASD reaches a marker 8 m away within 0.3 m in ≤ 1,800 steps; tap-to-move (click; tap on iPad) in ≤ 1,200; hold-to-follow runs from step 36 ± 1; jump apex = hip height × (0.25 + 0.12·Jump) ± 5% for Jump 0 and the highest-Jump starter.
34. [T] 1,800 editor idle steps: ≥ 5 blinks of 70/30/110 ms ± 1 step; chest half-range 0.012 ± 0.003, period 3.2 ± 0.2 s; every eye within 10° of a target 20° off-axis 30 steps after the pointer moves; tail tip std ≥ 2 mm.
35. [T] 1 m from fruit, Eat: within 300 steps 3 chomps, 8 crumbs, a heart (bigger for the preferred diet); fruit back 1,200 ± 1 steps later; with no fruit within 3 m a tree drops one. Ball boop impulse scales by (1 + 0.25·Charge); Strike ≥ 2 tree thump drops 1–3 fruit; Spit ≥ 2 roar emits 6 + 2·Spit bubbles.
36. [T] Photo mode freezes the root for 60 steps; each of 6 backdrops differs from the previous by > 5% of pixels; 1920×1080 and 1080×1080 saves carry canonical-equal recipes.

**Graphics and performance**
37. [T] Programs within the tier cap (§11.5) after warm-up, reported split, unchanged after a pass through every tab, emote, pattern, the island and photo mode.
38. [M] `renderer.info.autoReset = false`; main = scene-render calls with `shadowMap.autoUpdate = false`; shadow = calls with `needsUpdate = true` minus main; post separate. Limits: editor ≤ 40 main per tier; island main + shadow High 110 + 30, Medium 75 + 20, Low 50 + 10; island triangles 650k/380k/200k; creature ≤ 80k (skin 40k + parts 40k; L1 beyond 6 m). Poses: editor framing; island establishing shot and 5 bench-path waypoints at 3.5H; max per tier.
39. [T] All tiers render editor and island with zero GL errors; Low has no composer and is within ΔE ≤ 0.05 of High on the swatch probe.
40. [M] bench-sim, one creature on the island bench path at High, 180 warm-up + 1,800 steps, timing simulation + scene update only: p95 ≤ 2 ms (p50, max reported).
41. [T] Heap: `?test`, island, High, `step(3600, {render: 6})`; every 300 steps `gc()` then CDP `Runtime.getHeapUsage().usedSize`; least-squares slope of the 12 samples < 1 MB per 3,600 steps. Guard: `typeof gc === 'function'` and retaining a 1 MB object array raises usedSize ≥ 0.8 MB, else FAIL "heap metric imprecise". After 50 rebuild/undo cycles and 10 editor↔island trips, `renderer.info.memory` geometries and textures within ±2 of the post-warm-up baseline.
42. [T] Bloop + 3 parts: PNG A; `loseContext()`, `step(10)`, `restoreContext()`, `settle()`; PNG B: diff ≤ 0.5%, program count unchanged.
43. [T]+[S] §11.6 beauty checks pass on the M2 hero shots at all 3 tiers.
44. [U] MacBook Air (Apple M1), plugged in, one tab: `?bench` in Chrome, Safari and Firefox, JSON pasted into USER-CHECKS.md. Pass: auto tier High in Chrome and Safari; every stage p95 ≤ 16.7 ms; `/tests.html` ALL PASS in Safari and Firefox.
45. [U] iPad Safari on the LAN URL: (a) `?debug` tier Medium or Low; (b) `?bench` every stage p95 ≤ 16.7 ms, JSON pasted; (c) 10 minutes (3 building, 7 on the island) without reload or crash; (d) a card drags onto the body first try, pinch fattens a selected vertebra without page zoom, two fingers orbit, long-press opens the radial menu, no selection callout or magnifier; (e) no pattern or noise artifacts at default precision; (f) `/tests.html` ALL PASS.

**Save and share**
46. [T] After an edit, reload ≤ 100 ms later (pagehide flush) and after 1,000 ms: canonical-equal at `ready()`. With `indexedDB` throwing (`addInitScript`), the localStorage mirror restores it. New leaves the old creature on the shelf, canonical-equal; undo brings it back.
47. [T] All 8 starters load within both budgets and pass items 28 and 31; saved thumbnails run a 2048×128 `steps(16)` strip animation.
48. [T] Card: iTXt decode canonical-equal; after a canvas re-encode (chunks stripped) the LSB decode too; a page-side DataTransfer drop of the PNG on `document.body` loads it.
49. [T] Link round-trips canonical-equal, ≤ 2,000 characters for the 40-part fixture; corrupt, > 64 KB and wrong-version links fail gracefully (nothing thrown, no console error, recipe unchanged, friendly shake).
50. [T] GLBs of 3 starters reload in GLTFLoader: vertex count and bounds within 1% of the posed Hero geometry, `COLOR_0` on every mesh, ≤ 3 meshes, ≤ 8 MB, named `<name>.glb`. gltf-validator (npm into `$SCRATCH`) reports 0 errors, or that sub-check is BLOCKED (proxy) and the rest must PASS.

**Audio**
51. [T] `audio-manifest.json` lists all 85 ids, each with ≥ 1 checked generated variant or listed as a placeholder in `report.json`, `audio.status()` and the report.
52. [T] Case A files pass format, loudness ±1 LU, true peak, clipping, edges, DC and loop-seam checks and match their sha256. Case B: NA, asserting zero `source: "elevenlabs"` entries.
53. [T] OfflineAudioContext 48 kHz, 10 s, jitter off: loops from 0; 40 `ui.button_tick` 50 ms apart from 0.5 s; roars for 0.25, 1 and 4 m creatures at 3 s; 8 footsteps within 100 ms at 4 s. Pass: peak ≤ 0.891; voice `playbackRate = 2^((sizeSt + bias + idSt)/12)` ± 1e-6; bus caps hold; same-id UI within 40 ms skipped; same family with different seeds and heights → different rates and gains; mocked suspended and interrupted contexts resume on the next pointerdown.
54. [T] `env -u ELEVENLABS_API_KEY HTTPS_PROXY=http://127.0.0.1:9 node sborn/tools/gen-sounds.mjs --dry-run` exits 0, opens no socket, prints 85 ids, 367 SFX generations (less cached), music seconds and a credit estimate.
55. [U] On `tools/board.html` play every variant, keep or reject, export `approvals.json`, run `--apply-approvals`. Pass: every id has an approved variant or is knowingly a placeholder.

**Session**
56. [S]+[T] Every §14 screenshot exists (`m8/02` only in Case A), is non-blank (§15.3) and has one observation per mustShow entry.
57. [T] `node sborn/tools/e2e.cjs` passes in 3 fresh contexts (empty storage, `?test&quality=low`, §15.2): desktop mouse and keyboard; iPad landscape and portrait touch; `op`, `load`, `undo`, `redo` wrapped with counters before step 2. (1) Boot: `ready()`, Bloop and hint 1 visible. (2) Build by input only: Ready Leg onto front, middle and rear (mirrored → 6 legs); Chomper, a Moon Eye pair and a Curl Horn pair to the head; Curly Q to the tail end; tail arrow out 2 vertebrae; middle vertebra fattened 3 notches (wheel; pinch on iPad); undo, redo. Assert counters 0; 6 legs; parts include `mouth.chomper`, 4× `eye.moon`, `tail.curly`, 2× `det.curlhorn`; 8 vertebrae; DNA 1,050 and complexity 57, matching `stats.js` and the panel. (3) Paint: base #6c8cff; coat stripes #ffd23f M; detail spots #ff8fb1 S; skin scaly; tap an eye; dice once; remesh counter and programs unchanged. (4) Play: W 300 steps (hold-to-follow on iPad); tap-to-move 8 m (≤ 0.3 m off); jump; every emote 180 steps; F; eat a fruit; no NaN bone matrices; programs unchanged. (5) Photo: cycle 6 backdrops; save 1920×1080; recipe canonical-equal. (6) Gallery: save; load Flapjack; reload the saved creature, canonical-equal. (7) Reload: canonical-equal at `ready()`; one undo works. (8) Card: export; iTXt and LSB canonical-equal; dropped into a second fresh context it loads. (9) Link: opens in a new page; ✓ adds exactly 1 entry; canonical-equal. (10) GLB: `<name>.glb` ≤ 8 MB reloads with `COLOR_0`. Throughout: no console errors, warnings, page errors, failed requests or HTTP ≥ 400 outside the allowlist; no non-localhost requests; constant program count. Each step saves `screens/m10/e2e-<ctx>-NN-<step>.jpg`; each run writes `tools/out/e2e-<ctx>.json` (per-step pass, ms, counters, console tallies). Exit 0 only if all 3 pass.

**Rules, robustness, tools**
58. [T] For every L0 part and `tips` entry: r ≥ 0.15·rBase, and a sphere fitted to vertices within 0.5·r of the apex has radius ≥ 0.9·r; covers at least mouth.grin, munch, chomper, peep, hook, mandible; foot.tiptoe, talon; hand.scoop, snip; det.nubhorn, curlhorn, swirlhorn, antler, ridge.
59. [T] Static scan of tracked `sborn/` files except `vendor/`, `fonts/`, `audio/`, `tools/audio-raw/`: (a) no `http(s)://` outside comments in `src/**`, index.html, styles.css, tests.html; (b) no `crypto.subtle`, `serviceWorker`, `eval(`, `new Function`, `backdrop-filter`, `document.write` in `src/**`, index.html, styles.css; (c) no `package.json`; (d) `console.log` only in `src/audio/engine.js` and `src/debug/**`; (e) no worker imports bare `three`, even transitively; (f) every `.js`/`.mjs`/`.cjs` in `src/`, `tests/`, `tools/` starts `// <file> —` with `// Exports:` and `// Invariants:` in its first 6 lines; (g) Doodle World copies name their source.
60. [T] Fallbacks: (a) `file://` shows the run.command picture, the file:// module CORS error being the only console message; (b) `getContext('webgl2')` patched to null shows the no-WebGL picture; (c) with `indexedDB` and `localStorage` both throwing, it boots to Bloop and edits; (b) and (c) console clean.
61. [T] User tools work here (speed ignored): `?debug` JSON (copy button, or the text box with `navigator.clipboard` deleted) has every §15.4 field; `?bench` runs 4 stages and emits JSON with a finite score; `?bench&quality=high` reports High; `?precision=mediump` boots cleanly with a `precision mediump float` skin shader; `tools/board.html` loads cleanly.
62. [T] Reduced motion (`emulateMedia({reducedMotion: 'reduce'})`): skin-tap squash 0.94/1.04 ± 0.005; camera azimuth fixed over 600 idle steps; paint changes fade, no wavefront; console clean.
63. [T] Schema: `quantize` idempotent; canonical JSON round-trips byte-identical; hash stable across reload; clamps; duplicate ids repaired; unknown types → warnings; > 64 KB inflated rejected; a synthetic v0 → v1 migration; an over-budget recipe loads with cards locked.
64. [T] Mesher: 50 preview requests in 100 ms apply ≤ 50 results, the last applied jobId is the last requested, stale replies dropped; the preview position attribute keeps one ArrayBuffer per drag unless it grew (logged); a Full job follows pointerup.
65. [T] Quality logic on synthetic frame-time traces: every §11.5 calibration and governor rule (drops, scale floor 0.7, one upgrade after 20 s under 11 ms, no mid-drag switch, ≤ 6 resolution changes, 30 Hz never below Medium) and the boot guess for iPad Pro, small iPad, Mac and Linux fixtures.
66. [T] Touch and trackpad: pinch on a selected vertebra scales its radius by the pinch ratio ± 5%; a second finger within 150 ms cancels a drag, recipe unchanged; 450 ms long-press opens a 4-button radial menu (≥ 56 px); double-tap frames the part; two-finger twist rotates a selected part; `visualViewport.scale` stays 1 and `scrollY` 0. Desktop: ctrl+wheel and Shift+wheel with only deltaX leave page zoom alone and scale or twist the element.
67. [M] Boot to first creature frame, wall-clock, in the container, `?quality=high` and auto, labelled; device targets are read from `?debug` in items 44–45.
68. [T] localStorage mirror ≤ 16 KB for the 40-part fixture; undo ≤ 100 entries and ≤ 2 MB after 300 edits; card IHDR 1080×1350; 40-part fixture parts ≤ 40k/15k/5k triangles at L0/L1/L2.
69. [T] Case B: `audio/` holds only `audio-manifest.json` (85 ids, empty variants). Case A: every `audio/` file has a manifest entry with matching sha256, none `approved: true`. An applied `approvals.json` (synthetic in Case B) changes only approved fields. `gen-log.jsonl` holds no header values.
70. [T] Pipeline without the API, both cases: ffmpeg makes a clean 0.6 s 440 Hz tone (5 ms attack), the same clipped at 0 dBFS, a 90%-silent file, a tone with a 1-sample click, one with 0.02 DC, and a 4 s loop with a hard seam. The clean tone and repaired loop pass, each other input is flagged with its rule, and the clean tone lands at target ± 1 LU under the ceiling.
71. [T] A valid link shows the bubble; ✓ adds exactly 1 entry, ✗ none; with `navigator.clipboard` deleted the share menu shows a selectable field with the link.
72. [T] Non-reader proxy: fresh profile, `?test&hints`; tapping or dragging only what the current hint points at reaches Play in ≤ 12 interactions and ≤ 3,600 steps.
73. [T] `document.fonts.check('16px Fredoka')` after `ready()`, served from `sborn/fonts/` with OFL.txt; or the logged fallback stack.
74. [U] Double-clicking `sborn/run.command` on the Mac opens the game and prints a LAN URL that loads on the iPad over the same Wi-Fi.
75. [U] iPad audio: the first tap starts sound; the silent switch silences it; mute survives reload; app switching resumes without reload.
76. [U] iPad: photo and card save via press-and-hold to Photos; the PNG re-imports via gallery "+" as the same creature; link copy falls back to a selectable field over http.
77. [U] Safari on Mac and iPad: build → paint → play → save → reload with a clean Web Inspector console; colours match the swatch chips on the P3 display.
78. [U] A child who cannot read builds a creature and presses Play within 3 minutes of first boot, unhelped.
79. [U] iPad in Low Power Mode: `?debug` shows the 30 Hz cap detected and a tier not below Medium on a ≥ 2360×1640 iPad.

## 17. Cuts
Only under rule 4 or after M9 is pushed, and only after 3 documented failed approaches on that feature or a harness warning about session or usage limits. Never cut anything the user chose (GLB export, share link, card, photo backdrops, island pond, fruit and wind, music loops, the full catalog, walking for any leg count, the 7 emotes, idle life, three-layer paint, autosave, gallery, starters) or anything a §16 [T], [M] or [S] item tests. A cut changes no §16 row; log it in DECISIONS and the report. Order, first to last: fur shells; butterflies, pollen and cloud shadows; PCSS (keep PCF); GTAO (keep baked AO); live drawer turntables (static thumbnails); Paint like; GLB bake of eyes and keratin (flat colours); the 1- and 3-leg special gaits (the metachronal wave, which must still meet item 28).

## 18. Final report
Generated by `node sborn/tools/acceptance.cjs --report` (never type numbers by hand), saved as the Final report in `sborn/README.md`, and repeated as your final reply:
0. **Header:** Verified at commit <hash> (branch <name>) on <date>, from a fresh clone in a 4 vCPU software-GL container, Chromium <version> on SwiftShader; no real GPU, Safari, iPad, speaker or child was available.
1. **Counts:** T, M, S PASS/total; FAIL, BLOCKED, NA; USER pending; acceptance.cjs exit code.
2. **Not passing, first:** every FAIL and BLOCKED row with cause, evidence path and next step, including rule-4 open failures.
3. **What was built and how to run it:** double-click `sborn/run.command`; open the printed LAN URL on the iPad (same Wi-Fi); `/tests.html`; `?debug`, `?bench`.
4. **Checklist table** from acceptance.json: item, tag, status, value, threshold, method, evidence.
5. **Measured numbers** with sample sizes, labelled "4 vCPU software-GL container" (remesh, foot slide per creature, calls and triangles per tier, programs, heap slope, boot time); device figures labelled estimate.
6. **Test integrity:** diff of `thresholds.js` against §16 (a loosened threshold FAILs its item); retried tests with attempt counts; allowlist patterns with hit counts; tests that did not run.
7. **Audio:** case, probe HTTP code and `detail.status` (never the key), generated vs placeholder ids, credits used, approved = 0. For Case B or missing ids, the exact steps: add the secret and allowed domain as in the note at the top of this file, run `NODE_USE_ENV_PROXY=1 node sborn/tools/gen-sounds.mjs --max-credits 50000`, approve on `board.html`.
8. **User verification:** every [U] item with tool, steps and threshold, linking USER-CHECKS.md.
9. **Visual judgements:** the [S] verdicts are your reading of SwiftShader screenshots; each with its observation.
10. **Cuts and deviations; where things are** (`screens/`, DECISIONS.md, `tools/out/`); verified and final pushed hashes; unpushed commits, if any.
