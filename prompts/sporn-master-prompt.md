> **For the human: not part of the instructions.**
> This file is a one-shot build prompt. A fresh cloud coding session follows it from start to finish to build **Sporn**, a kid-friendly creature editor and test drive, in a new `sporn/` folder. Doodle World is left untouched.
> For real generated sounds, do this before starting:
> 1. Open the environment menu in the session title bar → **Edit** → **Network secrets**, and add `ELEVENLABS_API_KEY` (an environment variable also works).
> 2. In the same dialog, add `api.elevenlabs.io` under **Allowed domains**.
> 3. Use a paid ElevenLabs plan (Creator recommended). The full bake costs about 15k–47k credits, and each run stops at 20k.
>
> Then start a new session in this repo and say: **Follow prompts/sporn-master-prompt.md**.
> Without the key the game still builds and plays, with soft synthesized placeholder sounds. You can generate the real sounds later with `node sporn/tools/gen-sounds.mjs`; `sporn/README.md` explains how.
> Everything below the line is addressed to the building agent.

---

# Sporn: master build prompt

You are building **Sporn**, a browser game in `/home/user/Me`. It recreates the *mechanics* of the Spore (2008) Creature Creator ("the reference game"):
- grow a body from a bendy spine
- pull out limbs
- snap on mouths, eyes, feet, hands, wings, tails, fins and details
- paint in three layers
- press Play to watch the creature walk, dance, roar, eat and glide on a small island

The user answered every design question in advance. This document folds in those answers, and they are binding. Build the whole game in this one run, in the milestone order given, and hand it over working.

## 1. Mission and the feeling to hit

**Feeling.**
- The creature is alive from the first frame: it breathes, blinks and watches the cursor.
- Every touch gets a soft, squishy, bubbly answer in motion, in sound, and in the creature's own reaction.
- An 8-year-old who cannot read makes a creature they love within 3 minutes.
- An adult can spend an hour on a six-legged beetle whose stripes follow its curved back.
- Nothing is scary and nothing punishes. Limits show as gentle bonks and wobbles, never red crosses.

**Look.** It should look like a high-end vinyl toy photographed in a soft studio:
- glossy, pokeable skin, with light glowing through thin ears and fins
- big wet eyes with catchlights
- colours that match the tapped swatch exactly

**Scope.** Editor (Build and Paint), test drive (Play on an island), photo mode, gallery and sharing. No combat, no other stages, no online service.

## 2. Non-negotiables

1. **One shot, no questions.** Nobody is watching. When something is unspecified, decide, add a bullet to `sporn/DECISIONS.md`, and continue.
2. **Never fake results.** Every number you report comes from code you ran. If something cannot be checked in the container, mark it "user verifies on device". Never present software-GL frame rates as device performance.
3. **Never stop early.** You are done only when every item in the Hard Acceptance Checklist (§18) passes or is marked [U]. If something outside your control blocks an item (for example the network), finish everything else, then report it.
4. **Commit and push after every milestone.** The container is ephemeral.
   - Command: `git add sporn && git commit -m "Sporn Mn: <title> (<passed>/<total> tests)" && git push -u origin HEAD`.
   - Make checkpoint commits at least every 90 minutes of work.
   - If a push fails, retry 4× with waits of 2/4/8/16 s.
   - Stay on your branch. Never force-push or rewrite history.
5. **IP rule: copy mechanics, never assets.**
   - Never use the reference game's name, logo, part names, art, sounds, music or text.
   - `git grep -i spore -- sporn/` must return nothing; in DECISIONS.md write "the reference game".
   - All shapes, icons, names, code and sound prompts are original. Sound and music prompts never name artists, games or soundtracks.
6. **Do not break Doodle World.**
   - Change nothing outside `sporn/`, including `prompts/`.
   - Copy reused Doodle World code into `sporn/`; never import across games.
   - Doodle World's `tests.html` must still show ALL PASS (17/17).
7. **Kid-safe everywhere.**
   - Icon-first UI. The only visible text is numbers and the creature's name.
   - Big, forgiving targets.
   - Every tooth, horn and claw has a rounded tip, with radius ≥ 0.15 × base radius.
   - Roars are puffed-up and cute. No dark or frightening scenes.
8. **Secrets.** Read `ELEVENLABS_API_KEY` from the environment only. Never print, log, write or commit it. Before every commit, run `[ -z "$ELEVENLABS_API_KEY" ] || ! git grep -qF -- "$ELEVENLABS_API_KEY"`.
9. **Offline at runtime.** The shipped game makes no network requests: no CDNs, no web fonts, no APIs.
10. **Resuming.** If `sporn/` already exists on your branch:
    1. Read `sporn/README.md` (milestone status), `DECISIONS.md` and `git log`.
    2. Re-run the tests.
    3. Continue from the first milestone whose exit criteria are not met.

## 3. Where things go

```
sporn/
  index.html     import map {"three":"./vendor/three.module.js","three/addons/":"./vendor/addons/"}
  styles.css
  tests.html     browser test runner; document.title becomes ALL PASS or FAIL
  run.command    double-click launcher, port 8791 (Doodle World uses 8790)
  README.md      pitch, Run (incl. iPad over LAN), Controls, Build milestones + status, Sounds, Troubleshooting
  DECISIONS.md
  vendor/        three r170 + addons, CHECKSUMS.txt (sha256), LICENSE
  fonts/         Fredoka variable woff2 (Latin subset) + OFL.txt
  audio/         shipped sounds by group + audio-manifest.json (always present)
  src/           game modules (§5.2)
  screens/mN/    JPEG screenshots per milestone (m0 … m10)
  tools/         browser.cjs, run-tests.cjs, shoot.cjs, e2e.cjs, bench-sim.cjs,
                 gen-sounds.mjs, sound-manifest.json, audio-raw/, audio-out/, board.html
```

**`run.command`** follows Doodle World's:
1. `cd "$(dirname "$0")"`
2. `python3 -m http.server 8791 --bind 0.0.0.0 &`
3. Print the LAN URL for the iPad (`ipconfig getifaddr en0`).
4. `open http://localhost:8791`, then `wait`.
5. Make it executable: `chmod +x` and `git update-index --chmod=+x`.

When the page is opened from `file://`, show a friendly full-screen picture pointing to `run.command`.

**DECISIONS.md** copies Doodle World's style:
- One section per milestone, with a date (`## M3: parts and rig (10 Oct 2026)`).
- Each bullet is a **bold one-sentence decision**, then 1–2 sentences of rationale, naming the rejected alternative where it helps.

**README.md** mirrors Doodle World's.

## 4. Tech stack

- **Code.** Vanilla ES modules, no build step, no runtime dependencies, no `package.json`. Dev tools in `sporn/tools/` may use Node 22 built-ins and the globally installed Playwright.
- **three.js r170, copied into `sporn/vendor/`.** The server root is `sporn/`, so `../vendor` is unreachable. Copy `vendor/three.module.js` from the repo root; it is byte-identical to npm `three@0.170.0`.
- **Addons.** Run `npm pack three@0.170.0` into your scratch directory and check it against `npm view three@0.170.0 dist.integrity`. registry.npmjs.org works; unpkg and jsdelivr are blocked. Copy these with their `examples/jsm/` paths:
  - `postprocessing/{Pass,UnrealBloomPass,GTAOPass,SMAAPass,ShaderPass}.js`
  - `shaders/{CopyShader,LuminosityHighPassShader,GTAOShader,PoissonDenoiseShader,SMAAShader}.js`
  - `math/SimplexNoise.js`
  - `exporters/GLTFExporter.js`
  - `loaders/GLTFLoader.js` (needs `utils/BufferGeometryUtils.js`)
  - `environments/RoomEnvironment.js`

  Follow relative imports until the set is closed, write `CHECKSUMS.txt`, and test that each addon imports.
- **Font.** Fredoka (SIL OFL) from npm `@fontsource-variable/fredoka`, Latin woff2 plus licence. If that fails, use `ui-rounded, "SF Pro Rounded", system-ui, sans-serif` and log it.
- **Browser floor.** Safari/iPadOS 16.4+, Chrome 110+, Firefox 115+.
  - Feature-detect everything. WebGL2 is required; without it, show a friendly picture.
  - Required: module workers, `CompressionStream('deflate-raw')`, IndexedDB.
  - The iPad loads over plain `http://` on the LAN, so nothing may need a secure context: no `crypto.subtle` (write your own CRC32 and FNV-1a), no service worker. Guard Clipboard and `storage.persist`.
- **Workers cannot see the import map.** Worker modules import relative paths only and never `three`. Mesher modules must also run on the main thread, because tests compare the two.
- **Reuse Doodle World by copying**, and note `// from Doodle World src/...` in the header:
  - `core/rng.js` (mulberry32, FNV-1a)
  - `smoothMesh`, `vertexNormals`, `meshStats` and the surface-nets edge and quad-split logic from `geo/pipeline.js`
  - the `onBeforeCompile` + `customProgramCacheKey` pattern and object-space relief from `creature/material.js`
  - the eye blink/look code from `creature/creature.js`
  - shader warm-up from `stage.js`
  - `creature/voice.js` as the basis for placeholder voices
  - the `test`/`ok` harness and title contract from `tests/run.js`
- **Conventions** (Doodle World's):
  - Header in every file: `// file.js — purpose.` / `// Exports: …` / `// Invariants: …`.
  - Factory functions returning closures.
  - 2-space indent, single quotes, semicolons, `const`/`let`, typed arrays in hot paths.
  - Comments say *why*. British spelling in prose. `async/await` is fine.
  - No `console.log` except the audio status line and `?debug`.

## 5. Architecture

### 5.1 Core invariant
`creature = build(recipe)` is pure and deterministic. The recipe JSON is the only source of truth: editor, undo, autosave, gallery, cards, links, context-loss recovery and tests all derive from it.

- Edits are pure functions `recipe → recipe'` with structural sharing.
- Every commit quantizes:

  | Quantity | Step |
  |---|---|
  | Positions, radii | 0.001 m |
  | `u` | 0.0001 |
  | Directions, params | 0.001 |
  | Angles | 0.001 rad |
  | Scale | 0.01 |
  | Colours | lowercase hex |

  Round trips are therefore exact.
- Recipe hash = FNV-1a over canonical JSON (sorted keys).

### 5.2 Modules (`sporn/src/`)

| Folder | Files and job |
|---|---|
| `core/` | `rng.js`, `math.js` (springs, easing), `clock.js` (fixed 60 Hz step; manual stepping in `?test`), `emitter.js` |
| `recipe/` | `schema.js` (defaults, clamp, validate, migrate, quantize, hash), `ops.js` (every edit), `history.js` (undo/redo) |
| `catalog/` | `parts.js` (§7 as data), `stats.js` (stats, DNA, complexity), `names.js` (syllable names), `starters.js` (8 starters), `fixtures.js` (12 test creatures) |
| `geo/` | `sdf.js` (round cones, smin, bricks, sphere trace), `nets3.js`, `meshutil.js`, `mesher.js` (pure pipeline), `mesher.worker.js`, `mesher-client.js` (2 workers, latest wins) |
| `parts/` | `sweep.js`, `build.js` (dispatch + cache), one builder file per category |
| `rig/` | `skeleton.js`, `weights.js` (worker), `anchors.js`, `classify.js` (limb roles, gait groups) |
| `render/` | `renderer.js`, `quality.js` (tiers, calibration, governor), `post.js`, `lights.js`, `env.js`, `sky.js`, `pedestal.js`, `contact.js`, `noisevol.js`, `warmup.js`, `thumbs.js`, `materials/{skin,paint.glsl,eye,keratin,shell,membrane,mouth}.js` |
| `anim/` | `idle.js`, `gait.js`, `ik.js`, `springs.js`, `wings.js`, `body.js`, `emotes.js`, `metrics.js` (foot slide) |
| `editor/` | `editor.js`, `pick.js`, `gestures.js`, `handles.js`, `camera.js`, `palette.js`, `statspanel.js`, `hints.js`, `reactions.js` |
| `paint/`, `play/` | `paintmode.js`, `patterns.js`; `island.js`, `terrain.js`, `grass.js`, `flora.js`, `pond.js`, `fruit.js`, `wind.js`, `drive.js`, `photo.js` |
| `audio/`, `io/` | `engine.js`, `synth.js`, `music.js`; `db.js`, `autosave.js`, `gallery.js`, `pngcard.js`, `sharelink.js`, `glb.js`, `crc32.js`, `zip.js` |
| `ui/`, `debug/`, `tests/` | `icons.js` (original SVG icons drawn in code), `dom.js`, `tabs.js`; `overlay.js`, `bench.js`; `run.js` + `*.test.js` |

### 5.3 Recipe schema (v1)

```jsonc
{
  "v": 1, "app": "sporn", "name": "Bobaloo", "seed": 123456,     // per-part seed = hash(seed, part.id)
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

- **Anchors** use an arc parameter along a bone chain, never a vertebra index. They are re-resolved after every remesh (§6.4), so parts and limbs ride the surface when the body bends, fattens or grows.
- **Validation:**
  - Clamp every number to its range.
  - Ids must be unique.
  - Unknown part types are dropped into a `warnings` list.
  - Inflated payloads are capped at 64 KB.
  - No `eval`.
  - Keep a `migrate[v]` chain.

### 5.4 Mesher worker protocol
- **Workers.** Two module workers, `preview` and `full`. Each has one job in flight and one pending slot. A newer request overwrites the pending one, and results with a stale `jobId` are dropped.
- **Request.** `{jobId, quality, shape}`. `shape` is only the spine, limbs and part sockets, so paint never remeshes.
- **Reply.** Transferred typed arrays:

  | Attribute | Format |
  |---|---|
  | `position` | f32×3 |
  | `normal` | i16×4 normalized |
  | `aDomain` | f32×3 |
  | `aPaint` | u16×4: spine s, belly, limb t, baked AO |
  | `aSkin` | u8×4: thickness, cavity, region, side |
  | `skinIndex`, `skinWeight` | u8×4 |
  | Index | u16, or u32 above 65,535 vertices |

  The reply also carries bone rest frames, socket positions and phase timings.
- **No allocation during drags.** Preview geometry is preallocated for 8k vertices and updated with `setDrawRange`.
- **Preview jobs skip skin weights, AO, thickness and cavity.** The creature is held at rest during drags, so the preview is drawn as a plain mesh in the skin material.
- **No pops.** The old mesh stays visible until the new one arrives, then a 120 ms dithered crossfade swaps them.

### 5.5 Other layers and hooks
- **Rendering:** single WebGL2 context (§11).
- **Input:** a pointer-event state machine (§8.2) feeding the editor, paint and play controllers.
- **Audio:** WebAudio buses with files or placeholders (§12).
- **Storage:** IndexedDB plus a localStorage mirror (§13).

`window.__sporn` exists in every build:

| Hook | What it does |
|---|---|
| `ready()` | Resolves when the game has booted |
| `recipe()`, `load(r)` | Read or replace the current recipe |
| `op(name, args)`, `undo()`, `redo()` | Apply an edit; move through history |
| `mode(m)` | Switch between build, paint, play, photo and gallery |
| `step(n)` | Advance `n` fixed steps (`?test` only) |
| `settle()` | Render until remesh, crossfades and thumbnails are idle |
| `info()` | `renderer.info`, tier, DPR, programs, remesh ms, audio status |
| `drive.walkTo(x,z)`, `drive.key(code,down)`, `drive.emote(name)` | Drive the creature |
| `io.card()`, `io.readCard(blob)`, `io.link()`, `io.openLink(url)`, `io.glb()` | Save and share |
| `metrics()` | Collected measurements |

URL switches:

| Switch | Effect |
|---|---|
| `?test` | Seed 1, manual clock, DPR 1, hints off unless `&hints`, audio into a muted master, deterministic idle |
| `?quality=low\|medium\|high` | Forces a quality tier |
| `?debug`, `?bench` | Debug overlay and benchmark (§17.4) |

## 6. Body and skin

### 6.1 Spine
- 3–24 vertebrae `[y, z, r]` in the mid-plane x = 0. The spine never forks and stays in that plane; asymmetry is for parts and limbs.
- Head at +Z, creature walks along +Z. Units are metres, +Y up, lowest point at Y = 0 on the pedestal.
- **Default creature "Bloop":** 6 vertebrae from z −0.45 to +0.45 at y ≈ 0.45, radii 0.14 / 0.22 / 0.28 / 0.30 / 0.27 / 0.24, a Button Grin and two Moon Eyes, no limbs.

| Action | Rule |
|---|---|
| Drag a vertebra | Moves it in the x = 0 plane. If the view is within dot 0.2 of ±X, drag on a camera-facing plane, then project. Neighbour spacing stays between 0.5 × mean radius and 0.40 m. |
| Drag an end arrow out or in | Adds or removes vertebrae one at a time along the end tangent, at the mean spacing. Each new one pops in with a 12% bulge and a squish sound. |
| Tap a segment midpoint, or drag a vertebra off the body | Inserts one, or removes one (never below 3). |
| Wheel on a vertebra (pinch when selected) | Radius ×1.08 per notch, `exp(−deltaY·0.00077)`. Clamped to 0.25–4× the default and 0.04–0.60 m. Eased over 100 ms; neighbours blend. |
| Drag skin away from handles | Moves the whole body. |

After every commit, translate the creature so its lowest point touches the pedestal, then re-stand with a 250 ms settle.

### 6.2 Limbs
- **Creating.** Drag the **Bendy Limb**, **Ready Leg** or **Ready Arm** card onto the body and keep dragging. The root plants where you touched and the limb grows toward the pointer, adding one joint per 0.22 m, up to 5. Limbs are mirrored by default.
- **Limits.**
  - 2–5 joints.
  - Joint radius 0.03–0.30 m; segment length 0.08–0.60 m.
  - At most 12 limb instances, counting a mirrored pair as 2.
  - Roots may sit on other limbs, at most 2 levels deep.
- **Joint drag.** The joint moves on a camera-facing plane with a springy IK feel; the twin updates live.
  - Dragging the end joint 0.22 m past the tip adds a segment.
  - Pushing it within 0.5 × segment length of the previous joint removes one.
  - Wheel or pinch thickens or thins a joint.
- **Hands and feet.** They snap to a limb tip within 40 px (56 px on touch), replace the tip shape, and follow the last segment's direction.
- **Role**, recomputed on every edit:
  - **leg:** a foot on the tip, or the tip is below 0.25 × hip height and points down.
  - **arm:** a hand on the tip, or the tip is above the root.
  - **tail-limb:** anything else. It is decorative and moves on springs.

### 6.3 Skin surface
**Shape.** A signed distance field of round cones (iq `sdRoundCone`), joined with polynomial smooth-min, meshed in a worker with 3D surface nets.

| Primitive | Shape | Smooth-min k |
|---|---|---|
| Spine | One cone per vertebra pair | 0.25·min(r_i, r_i+1) |
| Limbs | One cone per segment | 0.2·r |
| Limb root into body | — | 0.6·min(r_root, r_body)·limb.k |
| Socket mound, one per rigid part | Sphere, r = 0.55 × part base radius | 0.6r |

- **Blend.** Quadratic smin; cubic smin for k ≥ 0.05 m (no highlight crease). Evaluation order is fixed (spine, limbs, mounds), so the result is deterministic. No ellipsoids and no negative blobs.
- **Bricks.** 4³-cell bricks with exact narrow-band pruning:
  - Keep primitive i in a brick only if `d_i(c) − hd ≤ d_min + hd + k_i + h`.
  - Skip the brick if `|f(c)| > 1.25·hd + h`.
  - Bricks share corners, so there are no cracks.
  - Reuse the per-brick primitive lists for normals, weights and paint attributes.
- **Resolution from a vertex target.** `h = sqrt(1.5·A_est/Nv)`, clamped to [extent/192, extent/40]. In Full quality also require `h ≤ r_min/1.5` so thin limbs stay manifold.

| Quality | Vertices | Triangles | When |
|---|---|---|---|
| Preview | 2.5k | ~5k | Every pointer move while dragging (latest wins) |
| Full | 15k | ~30k (cap 40k) | On pointerup, and after 300 ms still during a drag |
| LOD1 / LOD2 | 6k / 2.5k | 12k / 5k | Built in the background; island at distance |
| Hero | 30k | ~60k | Card, photo, GLB |

**Each job, in order:**
1. Evaluate the field over the active bricks.
2. Surface nets: split each quad along its shorter diagonal, CCW winding facing outward.
3. 2 iterations of Taubin smoothing (λ 0.5, μ −0.53).
4. One Newton projection onto the surface from 4 tetrahedral taps at 0.5h, clamped to 0.5h. The same taps give the normal.
5. Paint attributes, skin weights, SDF AO, thickness and cavity.

**Timing budgets:**

| Job | M1 Air | iPad | This container |
|---|---|---|---|
| Preview | ≤ 8 ms | ≤ 15 ms | p95 ≤ 15 ms |
| Full | ≤ 40 ms | ≤ 80 ms | p95 ≤ 90 ms |

Research measured 9.3 ms at 2.6k vertices and 55.8 ms at 19k vertices in this container.

### 6.4 Re-resolving anchors
1. Find the axis point `A = curve_b(u)` and the direction `D = frame_b(u)·d`.
2. March outward from inside with step `max(|f|, h/4)` until f ≥ 0, then bisect 6 times. The normal is the gradient there.
3. Sink the part 20–35% of its base height along −normal (per-part value). Limb roots sink 0.5 × root radius.

Cost is about 30 evaluations per part, under 1 ms for 48 parts.

### 6.5 Rig
- **Root.** The pelvis is the vertebra nearest the centroid of the leg roots, or mid-spine when there are no legs. The forward chain is chest, neck, head; the backward chain is the tail.
- **Bones.** One per vertebra, one per limb joint plus a tip socket, a jaw, 2 lids per eye, and one socket bone per rigid part. At most 140.
- **Skin weights**, computed in the worker:
  1. `w_i = max(0, 1 − (d_i − d_min)/β_i)²`, with `β_i = max(k_junction, 0.5·r_i)`.
  2. Spine segments split their weight between the two end bones by axis t.
  3. Keep the top 4, drop anything under 0.01, renormalize.
  4. 1–2 Laplacian smoothing passes.
  5. Quantize to u8 summing to 255.
- **Skinned mesh.** Use `THREE.SkinnedMesh`, with `boundingSphere` set to 1.5× the rest bounds.
- **On remesh:**
  1. Put the bones at rest.
  2. `calculateInverses()`.
  3. Swap the geometry.
  4. `bind()`.

  A new Skeleton is built only if the bone count changed; dispose the old one.
- **Skinned anchors.** Each rigid part stores the 4 skin weights at its anchor. Every frame, blend the anchor position and normal with the same bone matrices and write the result into the part's socket bone. Parts never float or sink at joints.
- **Draw calls.** All rigid parts sharing a material merge into one SkinnedMesh, weighted 1 to their socket bone. That is about 4 part draw calls.

## 7. Parts catalog

**Builders and geometry.**
- Each part is a pure builder `build(params, lod) → {geometries, hinges, sockets, tags, bounds}`, cached by `hash(type, quantized params, lod)`.
- LOD segment multipliers are 1 / 0.5 / 0.25; the editor always uses L0.
- Triangle budgets: ≤ 1.5k per part at L0, and all parts together ≤ 40k at L0, 15k at L1, 5k at L2.
- Shape tools: tapered Catmull-Rom sweeps (12 radial × 16 axial), lathes, extruded spline shapes (4–10 mm deep, 1 bevel), instanced repeats (teeth, spikes, feathers, plates), and small SDF meshes from the §6 mesher at R 24–32 (paws, lips, palms).
- Mirroring: `scale.x = −1` for plain meshes; instanced pieces get a mirrored geometry instead.

**Editing a part.** Each part has 1–3 tunable `p` parameters; the first one gets a stretch handle. Wheel scales 0.25–4×; Shift+wheel twists.

**Budget.**
- DNA and complexity are charged per instance, so a mirrored pair costs double.
- Vertebra: 0 DNA, 1 complexity. Limb segment: 15 DNA, 1 complexity, per instance.
- Totals: **2,000 DNA, complexity cap 100.** The cap implies ≤ 24 vertebrae, ≤ 48 part instances and ≤ 12 limb instances, which keeps every creature inside the render budgets.

**Stats.** 14 stats, each 0–5: Bite, Charge, Strike, Spit, Sing, Dance, Charm, Pose, Speed, Sprint, Stealth, Glide, Jump, Health.
- **Combination rule:** stat = the highest contributing part level, plus 0.5 for each other distinct contributing part (a mirrored pair counts once), capped at 5 and shown as half pips.
- Health starts at 1 and then follows the same rule.
- Adding parts helps, but spamming cheap parts cannot max a stat.

**Tags.**

| Tag | Meaning |
|---|---|
| `jaw` | Hinge, 0–35° |
| `lids` | Hinged lid shells |
| `track` | Eye look-at |
| `spring` | Verlet chain |
| `flap`, `glide`, `buzz` | Wing modes |
| `flare` | Spreads on emotes |
| `grasp` | Holds fruit; finger curl 0..1 |
| `step:pads`, `step:hooves`, `step:claws`, `step:sticky` | Footstep sound family |
| `voice:beak`, `voice:jaw`, `voice:snout`, `voice:mandible`, `voice:filter` | Voice family |
| `diet:herb`, `diet:carn`, `diet:omni`, `diet:filter` | Preferred fruit |
| `centre` | Mid-line only |
| `tip` | Limb tips only |

Default tint is `skin`, except keratin parts (`detail`) and eyes (`fixed`).

### 7.1 Mouths (10): all `jaw`

| id | Name | Shape | DNA | Cx | Stats | Tags |
|---|---|---|---|---|---|---|
| mouth.grin | Button Grin | Small soft muzzle, puffy smiling lips, 2 nub teeth | 40 | 3 | Bite 1, Sing 1 | voice:jaw diet:omni |
| mouth.munch | Munch Muzzle | Round muzzle, cheek pads, flat front teeth | 90 | 4 | Bite 1, Sing 3 | voice:jaw diet:herb |
| mouth.chomper | Chomper | Wide round jaw, 10 blunt instanced teeth | 150 | 5 | Bite 3, Sing 1 | voice:jaw diet:carn |
| mouth.peep | Peep Beak | Short two-piece cone beak | 60 | 3 | Bite 1, Sing 2 | voice:beak diet:herb |
| mouth.hook | Hook Beak | Deep curved beak, round tip | 170 | 4 | Bite 4 | voice:beak diet:carn |
| mouth.mandible | Click Mandibles | Two curved sweeps opening sideways ±30°, tiny palps | 120 | 4 | Bite 2, Sing 2 | voice:mandible diet:carn |
| mouth.snoot | Snuffle Snoot | Short trunk-snout, 2 nostrils, small mouth below | 100 | 4 | Bite 1, Sing 2, Charm 1 | voice:snout diet:omni spring |
| mouth.trumpet | Trumpet Bell | Flared bell lips on a short tube | 220 | 4 | Sing 5 | voice:snout diet:herb flare |
| mouth.sieve | Sieve Lips | Wide flat lip plate with a comb fringe | 80 | 4 | Sing 3 | voice:filter diet:filter |
| mouth.squirt | Squirt Spout | Soft tube mouth with a ring lip; blows bubbles | 170 | 4 | Spit 3, Sing 1 | voice:filter diet:omni |

### 7.2 Eyes (8): all `track`, all blink

| id | Name | Shape | DNA | Cx | Stats | Tags |
|---|---|---|---|---|---|---|
| eye.button | Button Eye | Small glossy bead; blinks by squash | 20 | 2 | — | |
| eye.moon | Moon Eye | Big round eye, huge iris | 60 | 2 | Charm 1 | lids |
| eye.dreamy | Dreamy Eye | Oval half-lidded eye, 3 lash cards | 80 | 3 | Charm 2 | lids |
| eye.almond | Almond Eye | Almond eye, tall oval pupil | 90 | 2 | Stealth 1, Charm 1 | lids |
| eye.frog | Frog Dome | Eye in a raised dome bump | 70 | 3 | Jump 1, Charm 1 | lids |
| eye.cluster | Dot Cluster | Dome with hex facets (shader) | 100 | 3 | Stealth 2 | |
| eye.stalk | Stalk Eye | Eye on a springy 3-joint stalk | 90 | 4 | Stealth 1, Charm 1 | lids spring |
| eye.peeper | Big Peeper | One extra-large eye | 130 | 3 | Charm 2, Stealth 1 | lids centre |

### 7.3 Feet (10): all `tip`; shown in Legs after "Ready Leg" and "Bendy Limb"

| id | Name | Shape | DNA | Cx | Stats | Tags |
|---|---|---|---|---|---|---|
| foot.nub | Nub Paw | Rounded stub, 3 toe bumps | 25 | 2 | Speed 1 | step:pads |
| foot.pillow | Pillow Pad | Wide soft pad, 4 toe beans | 70 | 3 | Stealth 2, Speed 1 | step:pads |
| foot.tiptoe | Tiptoe | Dainty 3-toed bird foot | 90 | 3 | Dance 3 | step:claws |
| foot.hoof | Tap Hoof | Lathe hoof with a cleft | 110 | 3 | Speed 3, Dance 1 | step:hooves |
| foot.web | Splash Web | 3 toes joined by a membrane | 80 | 3 | Speed 1, Jump 1 | step:pads |
| foot.gecko | Sticky Toes | 5 splayed toes, round pads | 100 | 4 | Stealth 3, Jump 1 | step:sticky |
| foot.talon | Grippy Talon | 4 curved toes, rounded claw tips | 120 | 4 | Sprint 2, Strike 1 | step:claws |
| foot.spring | Spring Foot | Long arched hopper foot | 160 | 4 | Jump 4, Sprint 1 | step:pads |
| foot.zoom | Zoom Runner | Slim racing foot, heel fin | 220 | 4 | Speed 4, Sprint 3 | step:pads |
| foot.twinkle | Twinkle Toes | Pointed ballet foot with a pom | 200 | 3 | Dance 5 | step:hooves |

### 7.4 Hands and graspers (8): all `tip grasp`; shown in Arms after "Ready Arm"

| id | Name | Shape | DNA | Cx | Stats | Tags |
|---|---|---|---|---|---|---|
| hand.mitten | Mitten | Round mitt with a thumb | 40 | 2 | Pose 1 | |
| hand.three | Three-Finger | SDF palm, 3 sweep fingers | 80 | 4 | Pose 2, Strike 1 | curl |
| hand.scoop | Scoop Paw | Paw-hand, short round claws | 90 | 3 | Strike 2, Pose 1 | curl |
| hand.cup | Suction Cup | Round sucker disc on a short wrist | 70 | 3 | Pose 1, Stealth 1 | |
| hand.curl | Curl Tip | Tentacle tip that curls | 90 | 3 | Pose 2, Charm 1 | spring |
| hand.snip | Snip Pincer | Crab claw, two rounded jaws | 140 | 4 | Strike 3 | jaw |
| hand.jazz | Jazz Hand | 5 splayed fingers | 160 | 5 | Pose 4, Charm 1 | curl |
| hand.bonk | Bonk Mallet | Round club fist | 180 | 3 | Strike 4 | |

### 7.5 Wings (8): `flap fold` unless noted

| id | Name | Shape | DNA | Cx | Stats | Tags |
|---|---|---|---|---|---|---|
| wing.nub | Flutter Nub | Tiny feathered stubs | 40 | 2 | Jump 1, Charm 1 | no flight |
| wing.leaf | Leaf Glider | Two leaf-shaped flaps | 70 | 3 | Glide 2 | glide only |
| wing.petal | Petal Wing | Rounded butterfly wings in the detail colour | 130 | 4 | Glide 2, Charm 2 | slow flap |
| wing.glass | Glass Wing | Two pairs of thin iridescent ovals | 140 | 5 | Glide 2, Jump 1 | buzz |
| wing.sail | Sail Wing | Membrane on 4 spines | 120 | 4 | Glide 2, Speed 1 | |
| wing.umbrella | Umbrella Wing | Membrane on 3 finger bones (8×6 skinned grid) | 150 | 5 | Glide 3, Stealth 1 | |
| wing.feather | Feather Wing | Bird wing of 14 instanced feathers | 160 | 5 | Glide 3 | |
| wing.cloud | Cloud Wing | Big wing of puffy feather clusters | 230 | 6 | Glide 4, Charm 1 | |

**Can it fly?** A creature can fly when total wing area divided by body volume^(2/3) is ≥ 1.2; otherwise it only glides, launching from a jump or a hill. Calibrate the 1.2 on the fixtures and log the final value.

### 7.6 Tails (8): all `spring wag`; usually placed at the spine's tail end

| id | Name | Shape | DNA | Cx | Stats | Tags |
|---|---|---|---|---|---|---|
| tail.puff | Puff Tail | Round pom-pom | 40 | 2 | Charm 1 | |
| tail.curly | Curly Q | Corkscrew tail | 50 | 3 | Dance 1, Charm 1 | |
| tail.sprout | Sprout Tail | Short tail ending in 3 leaves | 60 | 3 | Charm 1, Stealth 1 | |
| tail.ribbon | Ribbon Tail | Long thin ribbon, soft tip | 80 | 4 | Speed 1, Dance 1 | |
| tail.fluke | Fluke Tail | Whale-style fluke | 90 | 3 | Speed 2 | |
| tail.brush | Brush Tail | Big bushy tapered tail of fur cards | 120 | 4 | Charm 2, Stealth 1 | |
| tail.club | Thump Club | Tail with a round knob end | 150 | 4 | Strike 3 | |
| tail.fan | Fan Tail | 7 rounded feathers that spread when dancing | 180 | 5 | Charm 3, Dance 2 | flare |

### 7.7 Fins (8): membrane material, so they glow most

| id | Name | Shape | DNA | Cx | Stats | Tags |
|---|---|---|---|---|---|---|
| fin.paddle | Paddle Fin | Small side fin | 50 | 2 | Speed 1 | spring |
| fin.ear | Fin Ear | Ear-shaped head fin | 50 | 2 | Charm 1, Stealth 1 | spring |
| fin.whisker | Whisker Fins | 2–3 feathery barbels | 60 | 3 | Stealth 1, Charm 1 | spring |
| fin.sail | Back Sail | Tall rounded dorsal fin | 60 | 2 | Speed 1, Charm 1 | |
| fin.crest | Head Crest | Rounded crest on top of the head | 90 | 3 | Charm 2, Sing 1 | flare |
| fin.ripple | Ripple Fin | Long low frill along the back that ripples | 110 | 4 | Speed 1, Charm 2 | wave |
| fin.glider | Flying Fin | Wide pectoral fin | 130 | 4 | Glide 2, Speed 1 | flare |
| fin.sunfan | Sunfan | Radial fan of 5 spines and membrane | 140 | 4 | Charm 3 | flare |

### 7.8 Details (13)

| id | Name | Shape | DNA | Cx | Stats | Tags |
|---|---|---|---|---|---|---|
| det.nubhorn | Nub Horn | Short rounded cone | 50 | 2 | Charge 1 | keratin |
| det.curlhorn | Curl Horn | Curved tapered horn, ring ridges | 120 | 3 | Charge 3 | keratin |
| det.swirlhorn | Swirl Horn | Spiral ram-style horn | 180 | 4 | Charge 4 | keratin |
| det.antler | Branch Antler | 3-tine branching antler | 140 | 4 | Charge 2, Charm 2 | keratin |
| det.spike | Soft Spike | Single cone, rounded tip | 40 | 2 | Strike 1 | keratin |
| det.ridge | Spike Ridge | 5–9 instanced spikes along the spine, placed by sphere trace | 130 | 5 | Strike 2, Health 1 | keratin |
| det.plates | Armour Plates | 3–6 overlapping rounded plates | 120 | 4 | Health 2, Charge 1 | shell |
| det.shell | Dome Shell | Domed back shell of hex plates, iridescent | 220 | 5 | Health 4 | shell centre |
| det.bobble | Bobble Antenna | Thin antenna, ball tip | 50 | 3 | Stealth 1, Sing 1 | spring |
| det.feeler | Feather Feeler | Feathery moth antenna | 90 | 3 | Stealth 2 | spring |
| det.frill | Neck Frill | Fan collar that flares on a roar | 130 | 4 | Charm 3 | flare membrane |
| det.tuft | Fluff Tuft | Cluster of fur cards | 40 | 2 | Charm 1 | spring |
| det.bubble | Spit Bubble | Translucent cheek sac; puffs before a spit | 150 | 3 | Spit 3 | membrane |

**Pre-assembled cards:**
- **Ready Leg** = Bendy Limb (3 joints) + Nub Paw.
- **Ready Arm** = Bendy Limb (3 joints) + Mitten.

Each costs the sum of its pieces.

## 8. Editor (Build tab)

### 8.1 Layout
Reference sizes: 1280×800 desktop, 1180×820 iPad landscape.

**Stage.** The creature stands on a glowing pedestal in front of a soft gradient sky.

**Placement:**

| Where | What |
|---|---|
| Top centre | **Build / Paint / Play** icon tabs, 72 px tall |
| Left | 96 px rail of 64 px category buttons: Legs, Arms, Mouths, Eyes, Wings, Tails, Fins, Details. Beside it, a drawer of 88 px cards in 3 columns with 12 px gaps (2 columns under 1100 px). Cards are live 3D thumbnails in the creature's current paint. |
| Top of the drawer | DNA pill (helix icon, odometer number, fill bar for non-readers) and complexity jar (10 beads, green #5CC86F → yellow #FFC94A → berry #FF5C8A) |
| Right | 220 px stats panel: 14 stats in 4 icon groups (attack, social, move, health). Each has a 28 px icon and 5 chunky pips (12 px iPad, 10 px desktop) with half pips. A stat at 0 shows at 35% opacity. |
| Top left | Gallery shelf button; name tag (dice re-rolls the name, tap to type) |
| Top right | New, share menu (card, link, 3D model), mute |
| Bottom left | Undo and redo, 56 px |
| Bottom right | Mirror toggle, 56 px |
| iPad portrait 820×1180 | The drawer becomes a 2-row bottom shelf; stats collapse to a tappable icon strip |

**Rules:**
- Respect `env(safe-area-inset-*)`.
- No `backdrop-filter`.
- No hover-only features: a press or a 350 ms long-press does the same job.
- Every control is ≥ 44×44 CSS px; primary controls 56–72.

**Style tokens.**

| Token | Value |
|---|---|
| Panel | #FFF8EC |
| Ink | #3A2E5C (never #000) |
| Accent | Coral #FF7A59, with ink labels |
| Focus | 3 px #6A4CF0 |
| Radii | 24 (panels), 20 (cards), 16 (buttons) |
| Shadow | `rgba(58,46,92,0.18) 0 6px 16px` |

### 8.2 Input state machine
**Setup.** Pointer events with `setPointerCapture`. The canvas sets `touch-action: none`, `-webkit-user-select: none` and `-webkit-touch-callout: none`. Call `preventDefault` on `gesturestart`, `gesturechange` and `contextmenu`.

**Picking.** Hit radius is mouse 6 px, pen 10 px, touch 22 px (or the projected size if larger). Pick order: handles, parts, joints and vertebrae, skin (SDF sphere trace in rest space), empty space. Hover tests run at most once per frame.

**One pointer:**
- Down on a handle, part or joint arms a drag. It starts after 3 px of movement (mouse or pen) or 8 px (touch).
- Down on skin or empty space orbits after 4 px.

**Two fingers:**
- A second finger within 150 ms, while the first has moved < 12 px, cancels the drag and starts two-finger mode. Otherwise the drag is committed first.
- In two-finger mode: pinch zooms (or scales the selected element), centroid drag orbits, twist yaws. There is no pan; the camera stays centred on the creature.

**Other gestures:**
- Long-press (450 ms, < 8 px) on a part opens a radial menu of 56 px icons: delete, duplicate, mirror, tint.
- Double-tap (300 ms) frames a part.

### 8.3 Attachment, symmetry and handles
- **Drag.** A part dragged from the drawer floats 0.04H above the surface. It leans with velocity (clamped ±12°) and wobbles ±4° at 3 Hz. Over the body it glides on the skin, turning to the normal.
- **Snap frame.**
  - Y is the field normal.
  - Z is creature-forward projected onto the tangent plane (+Y if parallel).
  - Then the user twist is applied.
- **Symmetry.** Mirroring is on by default.
  - A 35%-opacity ghost twin with a shimmering rim follows every off-centre drag.
  - **Centreline snap** when `|x| < max(0.25·r_part, 0.03·W_body)` or the screen distance to the mid-plane is < 12 px (20 px touch). It becomes one centred part with a soft click, and releases at 1.6× that distance.
  - Parts tagged `centre` only allow centred placement.
  - Hold **A**, or use the mirror toggle, to place asymmetrically.
- **Drop:**
  1. The snap magnet covers the last 15% in 70 ms (easeOutBack).
  2. The part pops: scale 0 → 1.18 (90 ms) → 0.94 (80 ms), then a spring (stiffness 420, damping 18), volume-preserving.
  3. A skin ripple of amplitude 0.01H spreads to 0.25H over 300 ms.
  4. The pedestal rim pulses and a bubbly attach sound plays.
- **Overlap.** Above 25% overlap the part is tinted coral at 40% while dragging, but the drop is still allowed. A same-type duplicate within 0.3r is nudged up to 1r.
- **Remove.**
  - Pulling more than 40 px off the body detaches the part. Releasing it over the drawer or empty space plays a 350 ms spin-shrink and a 6-sphere poof, refunds the DNA, and the creature does a relieved squash.
  - The Delete key removes the selection. Alt-drag duplicates.
- **Handles.** About 20 px drawn with a 44 px hit area, constant on screen.
  - Spine end arrows, vertebra dots, limb joint dots, and one stretch handle per selected part.
  - Shown only on the selected element and near the pointer, to keep the view uncluttered for kids.

### 8.4 Undo and redo
- An entry is `{label, frozen recipe, selection}`, about 1–3 KB.
- Commit on pointerup. Wheel and pinch changes within 400 ms coalesce into one entry.
- Cap: 100 entries or 2 MB.
- Keys: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y, plus the on-screen buttons.
- Undo triggers a Full remesh plus a cached part rebuild.

### 8.5 DNA and complexity
- **While holding a part** over the body, a ghost "−120" floats by the pill and ghost beads appear in the jar.
- **Cards that no longer fit** dim to 50% and show a padlock. Never hide them.
- **Dropping one that does not fit:** the drop is refused and the part floats home. The pill shakes ±6 px three times over 300 ms, the jar wobbles ±5°, a soft bonk plays, and the creature tilts its head.
- **Odometer.** 260 ms easeOutBack with fixed-width digits; the helix spins half a turn on each change.

### 8.6 The creature reacts while you edit
- **Gaze.** The eyes lead the head by 80 ms toward the dragged part. The head follows on a 180 ms half-life spring, yaw ±50°, pitch ±30°.
- **"Ooh".** Within 0.3H of the body, the pupils dilate 1.15× and the brows lift.
- **First reaction to a new part:**

  | New part | Reaction |
  |---|---|
  | Mouth | Chomps twice and calls in its voice family |
  | Eyes | Blink and look around |
  | Leg | 4-step tap dance |
  | Arm | Waves |
  | Wings | Flap twice |
  | Tail | Wags |

- **After a body edit,** it re-stands and settles.
- **Tap the skin.** It squashes 0.88/1.08, giggles and blushes pink for 1.2 s, at most once per 1.5 s.
- **Idle.** Breathing, blinks, micro-saccades, glances at the camera, and a fidget every 8–14 s: look around, scratch, yawn or sniff.
- **During a drag** the idle blends to rest over 150 ms, so nothing moves under the finger.

### 8.7 Learn-by-doing onboarding
**How a hint looks.** A white ghost hand (SVG, no words) loops the gesture every 1.6 s over a pulsing glow on the target, and the creature looks at the target.

**Rules:**
- One hint at a time. Each appears 1.5 s after the previous step is done.
- A hint fades within 300 ms of its action.
- Once done, it is stored in localStorage (inside try/catch) and never returns.
- Tapping elsewhere hides the current hint for 20 s.
- A "?" bubble replays them all.

**Sequence:**
1. Drag a Ready Leg onto me.
2. Pull my tail arrow.
3. Wheel or pinch to fatten me.
4. Tap Paint.
5. Tap a colour.
6. Tap Play.
7. Tap the ground, or press WASD (key-cap icon).

## 9. Paint mode

**Layers.** Three layers, **Base**, **Coat** and **Detail**, each with a colour and a pattern, wrapped over the whole body in code.
- Final colour: base → coat (by `coatMask·amt`) → detail (by `detailMask·amt`).
- The base layer's pattern mixes the base colour with a 25%-lighter tint of itself.
- Belly countershading lightens 22% × 0.55.
- Repainting is a uniform write: one shared program, no remesh, no recompile.

**Patterns.** Ten, the same for every layer (defaults: base solid, coat stripes, detail spots):

| # | Pattern | How |
|---|---|---|
| 0 | Solid | — |
| 1 | Gradient | smoothstep over spine s, belly or limb t |
| 2 | Spots | 3D Worley F1, size jitter |
| 3 | Stripes | `sin(2π·f·s + warp·noise)` across the spine, limb t on limbs, fading on the belly |
| 4 | Scales | Worley F2−F1 edges, ±3% tint per cell, plus a normal bump |
| 5 | Speckles | Value noise at 60–120 per metre |
| 6 | Patches | Thresholded low-frequency fBm |
| 7 | Saddle | Back band around mid-spine |
| 8 | Rosettes | Worley ring |
| 9 | Bands | Limb t rings ("socks") |

**Masks** for coat and detail: all, back, belly, limbs, head.

**Domain.** Patterns are sampled in bone-anchored coordinates, `aDomain = Σ top-2 bones w·(Rᵀ(p − j)/scale + hash(boneId)·17.3)`, using `|x|` in the body frame.
- Every pattern is therefore mirror-symmetric.
- Spots never slide when the body is edited.
- No triplanar mapping and no seams.

**Noise and precision.**
- Noise comes from two 64³ RGBA8 `Data3DTexture`s generated in a worker at boot: gradient plus fBm, and Worley F1/F2/id/ridged.
- Anti-alias thresholds with `fwidth`, and fade cells smaller than 2 px to their average.
- Use `highp` throughout; iPad `mediump` is fp16 and breaks the hashes.

**Parts and eyes.**
- Each part's tint is one of skin, base, coat, detail or natural. Tapping a part in Paint mode cycles it.
- Skin-tinted parts evaluate paint at `anchorDomain + local offset` and blend into skin paint over the bottom 5–20% of their height, so the seam vanishes in colour too.
- Tapping an eye cycles the iris: amber, leaf, sky, violet, or the detail colour.
- A skin texture row offers smooth, bumpy, scaly, leathery and fuzzy (§11.3).

**Paint UI.** The drawer shows 3 layer cards. Each card has:
- **18 swatches:** #FF8FB1 #FF7A6B #FF9F43 #FFD23F #B5E655 #5CC86F #4FD1B5 #2BB3C0 #5BB8FF #6C8CFF #9B7BFF #D17BFF #FFF1D6 #E8C995 #9C6B4E #7A3E6E #6E8B3D #3D3A4B. The last is the darkest allowed; there is no pure black.
- **10 pattern tiles**, each shown on a mini blob.
- **S/M/L size chips:** 0.5×, 1×, 2×.

**Previews and helpers.**
- Hover (desktop) or press-and-hold (iPad) previews a swatch.
- A dice button makes a harmonious random paint, with hues 30–150° apart.
- "Paint like" copies the paint of any gallery creature.

**Juice.** On each paint change:
1. A wavefront sweeps from the tap point, or head to tail, over 600 ms (band 0.08H, additive white-gold at 0.6 with sparkle).
2. 24 star sprites burst and a swish plays.
3. The creature does a shake-dry wiggle and looks itself over.

## 10. Test drive on the island (Play tab)

### 10.1 Transition and island
**Going to Play:**
1. The editor sky opens like curtains over 1.2 s, revealing the island.
2. The pedestal sinks into a clearing in the middle.
3. The creature hops off with squash 0.8 and a dust ring, and the grass shivers.
4. The camera swoops over 1.6 s (easeInOutCubic).

Build the island lazily on the first Play and cache it. Never render it in the editor.

| Element | Spec |
|---|---|
| Shape | Radius 60 m, 45 m playable behind a soft boundary that turns the creature back gently. Central hill 6 m, beach ring, pond 10 m across. |
| Terrain | 4 heightfield chunks, 96² / 64² / 48² quads (High / Medium / Low). Vertex colour #5DBB63 → #A8E06A on crests, #D9B48A on slopes. Sand 25% darker within 0.3 m of water. Baked AO. |
| Grass | Instanced 8×8 m chunks, frustum culled. 36k / 18k / 8k blades to 35 / 25 / 18 m, shrinking to zero over the last 5 m. Wind sway and gusts. 4 trample pushers (R 0.6 m, ≤ 1.2 rad, 0.8 s recovery). Normals 60% toward the terrain normal. Colour #2F7D45 → #56B45A → #B7E36A. Backlit tips. |
| Flora | 3 flower species (900 / 500 / 250) whose heads turn toward the creature within 3 m. 80 rocks (8 shapes, moss on top). 14 lollipop trees with wrap-lit foliage. 12 clouds in one instanced draw. 6 butterflies; 60 pollen motes on High. |
| Water | Fresnel F0 0.02. Baked depth colour #6FDCD0 → #1E7FA8. Two scrolling generated normal maps. 8 interactive ripple rings. Foam where depth < 0.12 m. No refraction pass. An ocean ring around the island. |
| Fruit | 24 pieces of 4 kinds (berry cluster, bloop apple, crescent, drumstick for meat-eaters). Each sparkles every 2–3 s and respawns 20 s after being eaten. |
| Light | Sun #FFE6C2 at 3.0, elevation 38°. Hemisphere #BFE3FF / #9CC26E at 0.7. Fog matched to the sky, so the ocean rim melts into it. |
| Wind | One field, `gust = noise(xz·0.025 + dir·t·0.06)`, drives grass, flowers, trees, the creature's springs and the ambience level. |

### 10.2 Controls and stats
**Desktop.**
- Movement: WASD or arrows relative to the camera, Shift runs, Space jumps.
- Click ground to walk; double-click to run.
- Drag orbits, wheel zooms.
- Keys 4–9 and 0 play the emotes. F flies or glides. P opens photo mode. Esc returns to Build.

**iPad.**
- Tap the ground to walk there.
- Hold a finger on the ground and the creature follows it, running after 0.6 s.
- One finger on the sky orbits; pinch zooms.
- A bottom bar holds 64 px emote, jump and fly buttons. Fly appears only if the creature has wings.

**Camera.** Spring arm at 3.5H, orbitable, kept above the terrain.

**How stats change play:**

| Stat | Effect |
|---|---|
| Speed | Run speed × (1 + 0.12·Speed) |
| Sprint | A 2 s Shift burst × (1 + 0.1·Sprint) |
| Jump | Jump height = hip height × (0.25 + 0.12·Jump) |
| Glide | Glide ratio = 1 + Glide |
| Bite | Eating speed |
| Dance, Sing, Charm, Pose | Pick richer emote variants |
| Stealth | Tiptoe gait at low speed |

### 10.3 Procedural locomotion for any leg count
**Legs.** Classify legs as in §6.2.
- Side is `sign(root.x)`; it is centre when |x| < 0.05 × body width.
- Mirrored legs form pairs, sorted front to back by s.

**Gait tables** (cycle offsets; β = duty factor):

| Support legs | Gait | Offsets | β |
|---|---|---|---|
| 0 | Slither (≥ 8 vertebrae) or squash-hop (blobs) | — | — |
| 1 | Pogo hop | 0 | 0.5 |
| 2 | Walk → run | L 0, R 0.5 | 0.62 → 0.38; switch at Froude 0.5 |
| 3 | Tripod-ish | 0, ⅓, ⅔ | 0.7 |
| 4 | Walk → trot at Fr 0.35 ± 0.08 | Walk LH 0, LF .25, RH .5, RF .75; trot LF+RH 0, RF+LH .5 | 0.75 → 0.6 |
| 6 | Wave → tripod at Fr > 0.15 | Tripod L1 R2 L3 = 0, R1 L2 R3 = 0.5 | 0.75 → 0.5 |
| ≥ 7 or unbalanced | Metachronal wave | Per side rear→front k/n; right side +0.5 | 1 − 1/n_side, ≥ 50% planted |

**Timing.**
- Froude number `Fr = v²/(gL)`, where L is hip height.
- Stride `S = 2.3·L·Fr^0.3`, clamped so that `β·S ≤ 1.1L`.
- Step rate `v/S`, clamped to 0.8–4 Hz.
- A leg's offset changes only while that leg is in stance, at most 1 cycle per second.
- Acceleration ≤ 1.5 m/s², scaled with creature size.

**Foot planting.**
- A planted foot is locked in world space, pitched and rolled to the ground normal.
- **Landing target:** predicted hip at landing, plus the rest foot offset rotated by yaw, plus `v·β·T/2`, plus a turning term.
- **Forced step** when `|foot − desired| > 0.6S`.
- **Idle settle:** one leg at a time once the error exceeds 0.15L.
- Never lift a foot if that would leave fewer than the minimum support, which is 3 when there are ≥ 4 legs.

**Swing.**
- Horizontal motion uses smootherstep, so velocity at touchdown is 0 and nothing skids.
- Height: `y = H·sin(π·u^0.8)`, with `H = clamp(0.1L + 0.15·step, 0.06L, 0.3L)`.
- Toe: −20° at lift-off, +10° before landing.

**Body.**
- Height is the mean ground height under the hips plus the rest hip height × (1 − 0.08·run), on a critically damped spring (ω 10).
- Tilt comes from a least-squares plane through planted and predicted feet. Up = slerp(worldUp, normal, 0.6), clamped to ±25°, on a spring (ω 8).
- Long bodies undulate in phase with the gait.

**IK.**
- 2-segment legs: analytic two-bone IK.
- 3-segment legs: toe target → ankle → two-bone IK.
- 4+ segments: 2D FABRIK in the leg plane with a pole from the rest knee. 8 iterations, 0.5 mm tolerance. Hinge limits are the rest angle ±60–100°, and the knee 5–160°.
- **Out of reach:** a target beyond 0.98 × reach may slide; flag it as reach-limited and lower the body.

**Other motion.**
- **Slither:** `yaw_i = A_i·sin(2π(s_i/λ − f·t))`, λ = 0.7 body lengths, amplitude 0.2 at the head to 1.0 at the tail, speed `f·λ·0.6`. The head counter-rotates.
- **Turn in place:** when speed < 0.1 m/s and the yaw error > 10°, rotate at ≤ 120°/s × (L/0.5)^−0.5. The gait clock runs, so the feet step.
- **Arms:** counter-swing 15–25° at a walk and 35° at a run.
- **Springs** (tails, antennae, stalks, whiskers, tufts, fins):
  - Verlet at 120 Hz, 2 substeps.
  - Pose pull `k_i = 0.25·(1 − 0.6i/n)`, damping 0.9, gravity × 0.2.
  - At most 64 particles per creature.
- **Wings:**
  - Flapping: frequency `clamp(2.5·sqrt(0.5/span), 1.2, 6)` Hz (buzz 12 Hz), stroke +45° / −30°, downstroke 45% of the cycle.
  - Gliding: 8° dihedral, ±2° wobble.
  - Takeoff: 3 big flaps. Landing: a +30° flare. At rest the wings fold back 70°.

### 10.4 Emotes and idle life
**Emote format.** Each emote is data:
- **Channels**, in creature-relative units: root, spine curve, head look, jaw, lids, limb targets by role, tail wag, wing spread, flare, breath, squash.
- **Variants:** a `requires` list plus ordered fallback variants. The first variant whose needs are met wins, and a `*` variant always exists.
- **Layers:** locomotion, then posture, then gesture, then face, then springs. Blends take 0.2 s.

| Emote | Motion | Fallback |
|---|---|---|
| Dance | 2 Hz bob 0.05H, roll ±8°, paired foot taps that keep support, arms up alternately, tail at 2 Hz. Dance ≥ 3 adds a spin; Dance 5 adds footstep sparkles. | Legless: S-wave |
| Roar | Crouch 0.25 s, head forward and up 15°, jaw 35° (beak 25°, mandibles ±30°), hold 0.8 s with a 5° shake at 12 Hz, frills flare. Eyes stay big. | No mouth: puff to 1.08× and shake the head |
| Sit | Quad: hind feet forward, pelvis −40%, pitch +25°. Biped: pelvis down, tail as a tripod. Hexapod: body to 30% height. | Legless: coil |
| Sleep | Lie low, lids closed, breathe at 0.15 Hz and 2× depth, head on the ground, "Zzz" sprites | No lids: eye scale.y 0.1 |
| Wave | Arm IK up and out, wrist ±25° at 2.5 Hz | Front leg (keeping 3 planted), else tail, else body wiggle |
| Eat | Walk to fruit within 3 m, bend spine and head to it, 3 chomps at 3 Hz (a grasper lifts the fruit if present), 8 crumbs, a heart. Preferred diet gives a bigger heart. | No mouth: squash over the fruit as it shrinks |
| Fly / glide | §10.3 wings. Flyers take off, fly under WASD or tap, and land with a flare. Gliders launch from a jump or a hill. | No wings: jump, flap arms, soft comic landing |

Every emote plays its voice mood (§12).

**Idle life** runs in both editor and play:

| Behaviour | Spec |
|---|---|
| Breathing | Chest Y scale 1 ± 0.012, 3.2 s period (1.6 s after running) |
| Blinks | Every 2.5–6 s, 12% doubles; close 70 ms, hold 30 ms, open 110 ms |
| Micro-saccades | ±1.5° every 0.6–1.8 s |
| Eye tracking | Follows the cursor or touch, clamp 0.55 rad, slerp `1 − e^(−10dt)` |
| Tail | Sways at 0.4 Hz |
| Body | Weight shifts; a fidget every 8–14 s |
| Fruit | Sniffs fruit it passes within 1.5 m |

### 10.5 Photo mode
**Opening.** P or the camera button freezes time. An emote can be picked and its pose scrubbed.

**Framing.** Free orbit 0.5–8 m, a rule-of-thirds toggle, and a ±15° roll dial.

**Backdrops (6):**
1. Live island
2. Studio Sky
3. Sunset Peach
4. Starry Lilac (soft, never dark)
5. Bubblegum
6. Mint Paper

**Frames:** none, polaroid, card.

**Saving.** A Hero-quality PNG, 1920×1080 or 1080×1080, with the recipe embedded (§13.2). On iPad, use `navigator.share({files})` where available; otherwise `<a download>`.

## 11. Graphics bar

### 11.1 Colour
**Tone mapping.** `NeutralToneMapping`, exposure 1.0 in the editor and 0.95 on the island. Do not use ACES (hue shifts) or AgX (dulls swatches).

**Colour spaces.**
- `outputColorSpace = SRGBColorSpace` with colour management on.
- Swatches are sRGB hex. Noise volumes use `NoColorSpace`.
- No Display P3.

**Lighting rule.** A front three-quarter surface should reach 1.0–1.15 × albedo before tone mapping, so a swatch reads as itself.

### 11.2 Lights, environment, pedestal
**Editor rig.** It follows the camera azimuth on a 250 ms half-life spring, so the creature is never lit from behind.

| Light | Colour | Intensity | Direction (camera-relative) |
|---|---|---|---|
| Key (shadow) | #FFF1DE | 2.0 | Azimuth −40°, elevation 50°; `shadow.intensity` 0.75 |
| Hemisphere | #CFE6FF / #F2D9C4 | 0.35 | — |
| Cool rim | #BFDDFF | 1.8 | Azimuth 150°, elevation 25° |
| Pink kicker | #FFD6E8 | 0.9 | Azimuth −145°, elevation 10° |

**Environment.** A PMREM built from a generated scene, at `environmentIntensity` 0.70:
- Gradient dome: zenith #6FB6F0, horizon #FCE7D8, ground #E9D9F2.
- Key softbox: 4×3 m at radiance 4.0.
- Rim strip: 1×5 m at 3.0.
- A floor bounce disc.

`RoomEnvironment` is the fallback.

**Sky and floor.**
- Sky dome radius 50, gradient #5FA8E8 → #A9D6F5 → #FDE9D2.
- A light pool behind the creature, wisps at 4% contrast, ±4° hue drift over 60 s, dithered.
- The floor matches the horizon and fades into the sky between 8 and 14 m, so there is no horizon line.

**Pedestal.**
- Lathe shape: R 1.4 m, height 0.18 m, bevel 0.04 m. Top gradient #F3F0FA → #EDE6FF with engraved rings.
- Rim band: emissive #7FE7FF at 2.4. On each placement it pulses to 4.0 for 120 ms, decays over 600 ms, and sends a shockwave ring out to 1.4R.
- 48 orbiting motes and an additive under-glow (#A6E9FF, 2.2R, opacity 0.35).

**Camera framing.**
- Auto-frame dollies over 900 ms so the creature fills 62% of the viewport height.
- After 6 s idle the camera drift-orbits at 3°/s.

### 11.3 Skin material
**One program.** A single `MeshPhysicalMaterial` program serves every skin type.
- The skin type is a uniform, never a define.
- Keep clearcoat and sheen ≥ 0.01 so they never toggle a define (which would recompile).
- No transmission.

| Param | Smooth | Bumpy | Scaly | Leathery | Fuzzy |
|---|---|---|---|---|---|
| Roughness | 0.38 | 0.44 | 0.30 top / 0.58 groove | 0.56 | 0.74 |
| Clearcoat / roughness | 0.45 / 0.18 | 0.35 / 0.22 | 0.60 / 0.12 | 0.12 / 0.40 | 0.01 / 0.6 |
| Coat follows bump | 0 | 0.35 | 0.6 | 0.2 | 0 |
| Sheen / roughness | 0.20 / 0.5 | 0.15 / 0.5 | 0.05 / 0.5 | 0.25 / 0.6 | 1.0 / 0.35 |
| Wrap | 0.35 | 0.35 | 0.25 | 0.30 | 0.55 |
| Light-through | 1.0 | 0.9 | 0.6 | 0.7 | 0.8 |
| Detail (per H) | fBm 3 (k 0.06) + micro 22 | Cell domes 16 (k 0.55) | Shingled cells 24 (k 0.70) | Ridged wrinkles 10 + pores 60 | Strands 90; 5 fur shells on High |

**`onBeforeCompile` injections** (r170 chunk names):
- **Wrap diffuse** with a warm terminator tint (1.0, 0.55, 0.45). Specular stays unwrapped.
- **Fake light-through** (Barré-Brisebois): distortion 0.25, power 4, ambient 0.12. It uses the key and rim directions, weighted by thinness `1 − smoothstep(0.03, 0.22, thickness)` and by AO.
- **Rim:** `pow(1 − N·V, 3)·0.22`, sky-tinted.
- **Occlusion:** baked SDF AO × up to 8 sphere occluders, on indirect diffuse, specular, clearcoat and sheen.
- **Paint, cavity and belly** (§9). Cavity darkens 18%.
- **Roughness:** from detail height, plus Toksvig specular anti-aliasing.
- **Clearcoat normal:** mixed toward the bump normal by "coat follows bump".

**Worker-baked attributes:**
- Thickness: inward sphere trace, ≤ 10 steps.
- AO: 5 taps at `(0.01 + 0.035i)·H`.
- Cavity: Laplacian of the field.

### 11.4 Eyes and hard parts
**Eyes.**
- **Geometry:** a 32×24 sphere with a 6% cornea bulge within 35° of +Z. Lids are skin-material caps; the upper lid goes from −80° (open) to 0° (closed).
- **Sclera:** roughness 0.35, clearcoat 1.0 at 0.04, colour #FBF6EE shading to #EBD9DC, with a lid AO band.
- **Iris:** radius 0.48, pupil radius `mix(0.16, 0.26, dilate)`. Parallax refraction (IOR 1.336, iris plane z 0.82). Radial fibres, collarette, limbal ring.
- **Catchlights:** locked in view space at upper-left (−0.45, 0.55, 1) plus a small lower-right one. HDR, so they bloom slightly, and identical on every eye.

**Hard parts.**

| Part | Look |
|---|---|
| Mouth interior | #C8505E → #4A1621; never a black hole |
| Tongue | #F07C8C |
| Teeth | Ivory #FFF4DD |
| Keratin | Base-to-tip gradient, growth ridges, clearcoat 0.8 |
| Shell | Iridescence 0.35, clearcoat 1.0 |
| Membranes | Skin program, DoubleSide, thickness forced to 0.02 so they glow |

### 11.5 Shadows, post-processing and tiers
**Render path.**
- Composer tiers render into a `HalfFloatType` target with `samples: 4`, then run post between two non-MSAA HalfFloat targets.
- Do not use the stock `EffectComposer`: it clones the MSAA target.
- **Final pass,** in order: exposure, Neutral, lift-gamma-gain, saturation and vibrance, vignette, sRGB, then interleaved-gradient-noise dither ±0.5/255.

| Grade | Lift | Gamma | Gain | Saturation | Vignette |
|---|---|---|---|---|---|
| Editor | (0.010, 0.006, 0.022) | 1.02 | (1.0, 0.995, 0.985) | 1.05 (vibrance 0.10) | 0.30, plum tint (0.93, 0.90, 0.97) |
| Island | (0.004, 0.008, 0.024) | 1.03 | (1.035, 1.0, 0.955) | 1.07 | 0.22 |

Paint mode uses vignette 0.38.

| | Low | Medium | High |
|---|---|---|---|
| DPR / pixel cap | 1.25 / 1.4 MP | 1.5 / 2.2 MP | 2.0 / 2.6 MP |
| AA | Canvas MSAA, no composer | MSAA 4× target | MSAA 4× target |
| Shadows | PCF 1024 r1.5 + foot blobs | PCF 1024 r2.5 + 256² contact | PCSS 2048 (16 blocker + 25 PCF taps) + 512² contact |
| AO | Baked SDF + spheres | Same | + GTAO half-res, editor only (12 samples, radius 0.18H, blend 0.55) |
| Bloom | Additive sprites | Unreal quarter-res 0.22 / 0.50 / 0.95 | Unreal half-res 0.28 / 0.55 / 0.92 |
| Grade | `CustomToneMapping` (Neutral + LGG + sat), CSS vignette | Final pass | Final pass |
| Skin taps | 1 | 1–2 | 4 analytic + fur shells |
| Grass / flowers | 8k / 250 | 18k / 500 | 36k / 900 |

**Shadow rules.**
- Always PCF, never VSM.
- The frustum is fitted to the bounding sphere × 1.1 and snapped to texels. `bias −0.0002`, `normalBias 0.01H`.
- In the editor, freeze shadows when nothing moves (`autoUpdate = false`, plus `needsUpdate` on change).

**Choosing a tier.**
1. **Boot guess.**
   - No float or half-float colour buffer → Low.
   - iPad (`/iPad/`, or MacIntel with `maxTouchPoints > 1`) at ≥ 2360×1640 → Medium.
   - Other iPads → Low.
   - Mac → High.
2. **Calibration** behind the hatch screen: 30 warm-up frames, then 90 measured frames.
   - p90 > 17.5 ms → drop a tier and retest 60 frames.
   - Median < 9 ms at Medium → try High.
3. **Governor**, over 4 s windows.
   - p90 > 18.5 ms twice in a row → render scale −0.1, down to 0.7. At the floor, drop a tier.
   - Upgrade only after 20 s under 11 ms, at most once per session.
   - Never switch mid-drag; fade any switch over 150 ms.
   - At most 6 resolution changes per session (WebKit leaks memory on resize).
   - If more than 80% of frames sit at 33.3 ± 1 ms, the device is capped at 30 Hz (Low Power Mode). Do not drop below Medium for that.
4. **Persistence.** Save the chosen tier to localStorage (inside try/catch). A parent-gated setting (hold 2 s) offers Pretty / Balanced / Speedy.

**Compile everything up front.**
- Behind the hatch screen, call `compileAsync` on one mesh per variant: skinned skin with shadow, skinned parts, instanced keratin, eye, membrane, shell, mouth, terrain, grass, water, sky, pedestal, post, bake.
- Then render one shadowed frame into a 1×1 target so the depth programs compile too.
- No more than 20 programs, and the count never grows during play.

**Context loss.** `preventDefault` on `webglcontextlost`, then rebuild everything from the recipe on restore.

**Thumbnails.** A ThumbStudio in the same context and light rig renders 176² cards:
- un-premultiplies alpha and reads back with `readRenderTargetPixelsAsync`
- at most 2 per frame, and none during drags
- the selected card turntables at 25°/s, re-rendered at 15 fps

## 12. Audio

### 12.1 Three cases: probe at M0 and log the result in DECISIONS.md

```
[ -n "$ELEVENLABS_API_KEY" ] && curl -sS -o /dev/null -w '%{http_code}' \
  -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/user/subscription
```

| Probe result | Case |
|---|---|
| `200` | A |
| Empty key, `401`, `000` or a proxy CONNECT 403 | B. Read `curl -sS "$HTTPS_PROXY/__agentproxy/status"` for the reason. Never retry or work around a policy block. |

**Case A: key present and host reachable.**
1. At M8, start the bake in the background: `NODE_USE_ENV_PROXY=1 node sporn/tools/gen-sounds.mjs --max-credits 20000`. Node's `fetch` ignores `HTTPS_PROXY` without that flag (Node ≥ 22.21). `NODE_EXTRA_CA_CERTS` is already set.
2. Post-process and verify (§12.4).
3. Commit:
   - `sporn/audio/**`
   - `sporn/tools/audio-raw/**`, the paid raws (about 15 MB). Git is the only durable store.
   - `gen-log.jsonl`, `audio-out/report.json` and the contact sheets.

**Case B: no usable key or host.**
- Build everything else, including `gen-sounds.mjs`, `sound-manifest.json` and `board.html`.
- Run `node sporn/tools/gen-sounds.mjs --dry-run`. It validates the manifest and prints the plan and estimate.
- Ship `audio/audio-manifest.json` with all 81 ids and empty `variants`. The runtime synthesizes placeholders (§12.5). Never write placeholder files into `audio/`.
- State the exact later steps in README and the final report.

**Case C: quota or errors mid-run.**
- Quota (`quota_exceeded`/402), auth (401) and permission (403) are fatal. Stop new work, keep everything finished, commit, and let placeholders fill the missing ids.
- Reruns are idempotent: cached raws are skipped.
- A 403 on `/v1/music` alone means music is not on the plan. Skip the music items and continue with sound effects.
- Report credits used, ids done, ids missing, and why.

### 12.2 Generator: `sporn/tools/gen-sounds.mjs` (Node 22, global `fetch`, no dependencies)
**Usage:**
```
node gen-sounds.mjs [--only 'vo.jaw.*'] [--dry-run] [--concurrency 2] [--max-credits 20000]
                    [--force] [--reprocess] [--apply-approvals approvals.json]
```

**Sound effects request.**
- `POST https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128`. Use `mp3_44100_192` when the subscription is Creator or higher.
- Headers: `xi-api-key`, `content-type: application/json`.
- Body: `{text, duration_seconds (0.5–30, always set), prompt_influence, loop?}`.
- Omit `model_id` so the server default is used, and log which model it is.
- Accept the response only if it is ≥ 1 KB and starts with `ID3` or an MP3 frame sync.

**Music request.**
- `POST /v1/music` with a `composition_plan`.
- If the plan is rejected, fall back to `prompt` + `music_length_ms` + `force_instrumental: true`.
- On `bad_prompt`, retry once with the suggested text.

**Caching.**
- `rawHash = sha256(canonical{api, text+suffix, duration, influence, loop, format, plan, variant})`. The tool version is not part of the hash.
- Raws are stored as `tools/audio-raw/<id>/<i>-<hash12>.mp3`. If the file exists, skip the request.
- Write `.part` files and rename on success.
- A lockfile stops two runs overlapping.
- `gen-log.jsonl` gets one line per request: id, variant, hash, status, request-id, cost header, ms, time. Never the key.

**Errors.**
- Branch on `detail.status` in the response body as well as the HTTP code.

| Error | Action |
|---|---|
| 429 `too_many_concurrent_requests` | Concurrency −1 (minimum 1), wait 1.5 s |
| 429, 408, 5xx | Jittered exponential backoff honouring `retry-after`, up to 6 tries |
| 400, 422 | Fail that item and continue |
| Quota, auth, permission | Fatal: stop as in Case C |

- Exit code 0 = all done, 1 = some items failed, 2 = fatal.

**Credits.**
- Before starting, estimate uncached items at 40 credits per second (music about 1,000 per minute) and refuse if spent + estimate > cap.
- After each request, add the `character-cost` header to the running total.
- Whole-bake ceiling: 50,000.

**Group suffixes and `prompt_influence`:**

| Group | Suffix | Influence |
|---|---|---|
| ui | "soft, gentle, airy and warm, rounded attack, quiet, clean isolated one-shot, cute children's game interface sound" | 0.55 |
| voice | "cute non-verbal creature vocalization, small friendly animal, breathy and soft, close-mic, dry, no human speech, no words" | 0.4 |
| move | "soft cartoon foley for a children's game, gentle and quiet, close-mic, dry, isolated" | 0.35 |
| amb | "calm, soft, airy, continuous and steady, no distinct events" | 0.3 |

### 12.3 Manifest: 81 ids, about 218 shipped files
Each row gives the id, the core prompt, duration in seconds, variants generated/kept, and the loudness target. M = momentary-max LUFS; I = integrated LUFS.

**UI (21, mono).**

| id | Prompt | s | gen/keep | Target |
|---|---|---|---|---|
| ui.part_hover | Tiny soft airy blip, a breath across a small glass bottle | 0.5 | 6/3 | −28 M |
| ui.part_pickup | Soft rubbery lift-up pluck, rising pop, tiny wooden tock | 0.5 | 6/3 | −25 M |
| ui.part_attach | Soft round bloop like a droplet landing in jelly, warm low marimba note, satisfying snap | 0.6 | 6/3 | −23 M |
| ui.part_remove | Soft descending bloop, gentle suction pop | 0.6 | 4/2 | −24 M |
| ui.stretch_squish | Continuous soft rubbery squishing of modelling clay, steady (loop) | 4 | 3/1 | −28 I |
| ui.vertebra_add | Soft bubbly pop with a rising kalimba note, a bead clicking onto a string | 0.6 | 4/2 | −24 M |
| ui.scale_up | Gentle rising airy swell, soft inflating-balloon squeak | 0.8 | 4/2 | −25 M |
| ui.scale_down | Gentle falling airy sigh, soft deflating rubber squeak | 0.8 | 4/2 | −25 M |
| ui.paint_swish | Soft wet paintbrush swish across smooth paper | 0.7 | 6/3 | −26 M |
| ui.pattern_sparkle | Soft shimmer of a few tiny glass chimes fading away | 1.2 | 4/2 | −26 M |
| ui.color_pick | Tiny soft glassy tap on a small crystal bowl | 0.5 | 6/3 | −26 M |
| ui.tab_switch | Soft paper page flick with a muted wooden tick | 0.5 | 4/2 | −26 M |
| ui.button_tick | Tiny muted felt-covered wooden tick | 0.5 | 6/3 | −27 M |
| ui.undo | Soft reverse whoosh, descending two-note kalimba blip | 0.6 | 4/2 | −25 M |
| ui.redo | Soft forward whoosh, ascending two-note kalimba blip | 0.6 | 4/2 | −25 M |
| ui.dna_spend | Soft magical shimmering bell ping with a bubbly tail | 0.7 | 4/2 | −25 M |
| ui.budget_bonk | Gentle bonk on a cushion, muted low wooden boop, friendly | 0.5 | 4/2 | −25 M |
| ui.save_chime | Warm three-note celesta chime rising, airy tail | 2 | 4/1 | −23 M |
| ui.photo_shutter | Soft vintage shutter click with an airy whoosh, muffled and cute | 0.7 | 4/1 | −25 M |
| ui.gallery_open | Soft page-turn whoosh into a short gentle harp glissando | 1.5 | 4/1 | −25 M |
| ui.born_tada | Gentle magical ta-da, harp and celesta rising to a warm major chord | 3 | 4/1 | −22 M |

**Voices (40) = 5 families × 8 moods.**
- Prompt template: `<mood phrase> of a small <anchor> creature, <timbre>`.
- Every voice is generated 5 times and 3 are kept.
- Ids are `vo.<family>.<mood>`.
- Never use "says", "talks", "words" or onomatopoeia in a voice prompt.

| Family | Anchor | Timbre | Pitch bias |
|---|---|---|---|
| beak | round bird-like (dove, chick) | whistly chirps | +2 st |
| jaw | round furry (puppy, bear cub) | vowel-like, throaty | 0 |
| snout | piglet-like (guinea pig, tapir) | nasal, snuffly | −1 |
| mandible | beetle-like (cricket) | clicky chitter | +1 |
| filter | whale-like water creature (manatee) | bubbly, burbly | −2 |

| Mood | Phrase | s | Target |
|---|---|---|---|
| coo | soft happy cooing hum with a warm rise and fall | 1.2 | −20 M |
| chirp | one short curious call rising at the end | 0.8 | −20 M |
| purr | contented steady purr, relaxed | 2 | −23 M |
| grumble | small grumpy mumble, mildly annoyed, not scary | 1.2 | −21 M |
| roar | tiny brave roar, puffed-up and cute, not scary | 1.6 | −19 M |
| eat | happily munching with pleased little hums | 1.4 | −22 M |
| sleep | slow yawn, then soft sleepy breathing | 2.4 | −24 M |
| sad | soft sad whimper falling in pitch | 1.4 | −22 M |

**Movement (12), ambience (4), music (4).**

| id | Prompt | s | gen/keep | Target |
|---|---|---|---|---|
| mv.step_pads | Six soft padded footsteps on grass, evenly spaced (sliced into hits) | 3 | 2/6 | −27 M |
| mv.step_hooves | Six light little hoof taps on soft earth (sliced) | 3 | 2/6 | −27 M |
| mv.step_claws | Six tiny claw-tipped steps on grass and soil (sliced) | 3 | 2/6 | −28 M |
| mv.step_sticky | Six sticky gecko-like steps, soft suction peels (sliced) | 3 | 2/6 | −27 M |
| mv.wing_flap | Six soft feathery wing flaps (sliced) | 3 | 2/6 | −27 M |
| mv.glide_wind | Soft steady wind past a gliding creature (loop) | 10 | 2/1 | −28 I |
| mv.splash | Small creature hopping into a shallow pond, playful splash | 1.2 | 4/2 | −24 M |
| mv.jump | Soft springy boing with an airy whoosh | 0.6 | 4/2 | −25 M |
| mv.land | Gentle cushioned thump on grass, little rustle | 0.6 | 4/2 | −25 M |
| mv.sniff | Two quick soft curious sniffs | 0.8 | 4/2 | −26 M |
| mv.crunch_fruit | Biting a juicy apple, soft crisp crunch | 0.8 | 4/3 | −24 M |
| mv.gulp | Soft cartoon gulp | 0.6 | 4/2 | −25 M |
| amb.island | Island breeze through grass and leaves, distant soft sea wash, sparse faraway birdsong (loop) | 30 | 2/1 | −30 I |
| amb.pond | Gentle lapping of shallow pond water on smooth stones (loop) | 20 | 2/1 | −30 I |
| amb.editor_tone | Very soft warm airy room tone with a faint dreamy pad (loop) | 20 | 2/1 | −34 I |
| amb.bird_far | One faraway soft songbird trill | 2 | 6/4 | −32 M |
| mus.editor_loop | Music plan: calm dreamy lullaby; felt piano, kalimba, warm pads, soft vibraphone; 72 BPM, F major, 4/4, instrumental; sections A 40 s + A2 30 s, ending on the opening chord. Negative: drums, vocals, intro, outro, ending, fade out, build-up | 70 | 2/1 | −23 I |
| mus.play_loop | Music plan: playful bouncy pizzicato, marimba, soft brushed shaker, ukulele plucks; 100 BPM, G major, quiet dynamics. Same negatives, but "heavy drums" instead of "drums" | 55 | 2/1 | −23 I |
| mus.sting_drive | (SFX API) Short playful sting, pizzicato and kalimba bouncing upward, ready-set-go | 3 | 4/1 | −23 M |
| mus.sting_save | (SFX API) Short warm sting, celesta and felt piano two-chord cadence | 2.5 | 4/1 | −23 M |

**Estimate:** 351 sound-effect generations (about 631 s) plus 4.2 min of music. That is about 15k credits optimistic, about 47k conservative, including a 30% re-roll reserve.

### 12.4 Post-processing and checks (ffmpeg 6.1 is installed; sox is not)
**Steps, in order:**
1. **Decode** to f32 with a 40 Hz high-pass. Mono for sound effects, stereo for ambience and music.
2. **Reject raw takes** with clipping runs (3 or more samples at ≥ 0.995), more than 80% silence, or M_max below −45 LUFS.
3. **Trim** using a 5 ms RMS envelope, threshold `max(peak − 45 dB, −65 dBFS)`. Leave 3 ms before the onset (UI) or 10 ms (voices), and 30 ms after the tail.
4. **Fade** with equal-power curves, for the soft in-and-out:

   | Type | Fade in | Fade out |
   |---|---|---|
   | UI | 2–5 ms | 30–60 ms |
   | Voice | 8–15 ms | 80–200 ms |
   | Swells and stingers | — | 300–800 ms |
   | Loops | none | none |

5. **Slice** sequence takes at onsets (12 dB over the floor, at least 150 ms apart) and keep the 6 hits closest to the median spectrum.
6. **Loops.** Keep the API's loop if it passes the seam check. Otherwise crossfade-loop at the best cross-correlation point: 1–2 bars for music, 0.5–2 s for ambience. Write the file padded as `[last 0.25 s | loop | first 0.25 s]` with `loopStart`/`loopEnd`, so MP3 encoder delay never causes a gap.
7. **Soften:** if more than 12% of the energy is above 8 kHz, apply a −4 dB shelf at 8 kHz once.
8. **Level and encode.** Measure with `ebur128=peak=true`, then gain = target − (M_max or I), clamped ±18 dB. Limit 1 dB under the ceiling: −3 dBTP for sound effects, −2 dBTP for music. Encode CBR MP3, 96k mono for sound effects and 128k stereo for ambience and music. Re-measure and fix once.
9. **Choose variants:** keep the top-scoring ones that are also distinct from each other (log-mel cosine < 0.97).

**If ffmpeg is missing** (for example on the user's Mac), copy the raws unchanged with `processed:false`, and let the runtime trim by threshold, normalise loudness in JS and apply gain envelopes. The README tells the user that `brew install ffmpeg` enables the full pipeline.

**Checks** (in `report.json`):

| Check | Pass rule |
|---|---|
| Format | ffprobe: codec, 44.1 kHz, channels |
| Duration | Within bounds; UI ≤ 0.9 s except swells |
| Loudness | Within ±1 LU of target |
| Peaks | True peak under the ceiling, zero clipping runs, edges \|x\| ≤ 0.002, DC < 0.005 |
| Clicks | No clicks (second-difference spikes above 8× the local median) |
| Spectral centroid (warning only) | UI 400–4,500 Hz, voice 250–3,500, steps 150–2,500 |
| Softness | Energy above 8 kHz ≤ 10%; attack ≥ 3 ms (UI), ≥ 8 ms (voice) |
| Loop seam | Sample step, RMS match within 1.5 dB, log-mel continuity, no click |

**After the checks:**
- Write waveform-plus-spectrogram contact sheets to `audio-out/sheets/` and look at them.
- `audio-manifest.json` entries carry `{file, sha256, durationSec, lufs, truePeakDb, source:"elevenlabs", rawHash, approved:false, checks}`.
- **You cannot listen, so never set `approved:true`.** `tools/board.html` lets the user play every variant, mark keep or reject, and export `approvals.json`; `--apply-approvals` merges it.

### 12.5 Runtime (`src/audio/engine.js`)
**Signal graph.**
- Each sound: source → envelope → StereoPanner → bus.
- Bus gains: ui 0.7, voice 0.85, move 0.6, amb 0.5, music 0.4.
- Master compressor: threshold −20, knee 18, ratio 3, attack 0.006, release 0.3.
- Shared "air" reverb: a ConvolverNode with a generated 1.6 s noise impulse response, low-passed at 6 kHz, returned at 0.18. Sends: ui 0.15, voice 0.2.

**Unlock.**
- Create or resume the context inside the first pointerdown, touchend, click or keydown, and play one silent sample.
- Treat `interrupted` like `suspended`.
- Suspend when the page is hidden.
- Set `navigator.audioSession.type = 'ambient'` where it exists, so the iPad mute switch is respected.

**Loading.**
- After unlock, decode the critical set: hover, tick, attach, pickup, colour, swish, born. Everything else decodes on first use.
- If a UI sound is not ready within 30 ms, skip it. Voices may wait 150 ms.
- Keep only the current creature's voice families decoded. LRU cap about 80 MB.

**`play(id, {x, size, family})`.**
- Choose a variant from a shuffle bag with no immediate repeat.
- Playback rate: `rate = 2^((sizeSt + biasSt + jitter)/12)`, with `sizeSt = clamp(−7·log2(height/1 m), −9, +9)`. Bigger creatures sound lower.
- Pitch jitter: ui ±0.4 st, voice ±1.2, move ±1.5.
- Below rate 0.8, low-pass at 18 kHz × rate.
- Gain jitter ±1–2 dB.
- Attack 4 ms (ui) or 12 ms (voice). Stop with `setTargetAtTime(0, t, 0.04)`.
- Pan by screen x, ±0.7.

**Voice limits.**
- Bus caps: ui 4, voice 3, move 6, amb 3, music 2. When full, the oldest sound is stolen with an 80 ms fade.
- One voice per creature at a time.
- UI cooldown 40–70 ms per id. Hover sounds only when the hovered part changes.

**Loops and music.**
- Loops fade in over 1.5 s and out over 2 s.
- Editor and play music swap with an equal-power crossfade over 2.5 s.
- Voices and stingers duck the music by 6 dB.
- Mute: the corner button or M, remembered in localStorage.

**What plays when.**
- Every editor action in §8 has its sound, and the stretch loop runs during drags.
- Footsteps use the step family of each foot.
- Wing beats and eating play their sounds.
- Emotes use the matching voice mood from the largest mouth's family.

**Placeholders.** Used when a file is missing, fails to decode, or fails its sha256.

| Group | Placeholder |
|---|---|
| UI | Sine or triangle blips with a pitch drop (attach: 520 → 392 Hz over 60 ms), low-passed at 3 kHz; sparkle = 3 sines at 2–4 kHz |
| Voices | Detuned triangles with vibrato through a per-family formant (beak 2.2 kHz, jaw 700 Hz, snout 900 Hz + noise, mandible 20–40 Hz click train, filter 300 Hz with FM bubbles), with a pitch contour per mood. Base it on Doodle World's `voice.js`. |
| Steps | 40 ms low-passed noise bursts |
| Wind | Noise through a slowly moving band-pass |
| Music | Soft generated pad plus random pentatonic kalimba notes at −30 LUFS |

**Reporting.**
- Log one boot line, for example `[sporn-audio] 81 ids · 69 generated · 12 placeholder · 0 unapproved`.
- `audio.status()` returns `{generated, placeholder, unapproved, missing}`, and `?debug` shows the same counts.
- **A placeholder is never reported as generated.**

## 13. Save and share

### 13.1 Autosave and gallery
**Database.** IndexedDB `sporn` v1, with two stores:
- `creatures`: `{id, name, recipe, thumbStrip: Blob, updated}`
- `autosave`, key `current`: `{recipe, undoTail (last 20)}`

**Autosave.**
- Write 800 ms after each commit.
- Flush on `visibilitychange: hidden` and on `pagehide`.
- Mirror the current recipe synchronously in localStorage (≤ 16 KB).
- Call `navigator.storage.persist()` where available.
- Wrap all storage in try/catch; the game must work with storage blocked.

**Gallery.**
- A wooden shelf of up to 200 creatures with **spinning thumbnails**: 16-frame, 128 px turntable strips, rendered at quiet moments and animated with CSS `steps()` at 8 fps.
- Tap a creature to load it. Long-press for delete (with a confirm wobble) or duplicate.
- The top row always holds **8 starter creatures** to remix. Loading one sets `meta.from`.

| Starter | Legs | Build |
|---|---|---|
| Bloop (default) | 0 | 6-vertebra blob, Button Grin, 2 Moon Eyes; hops |
| Wigglet | 0 | 16 vertebrae, Munch Muzzle, Moon Eyes, Sprout Tail; slithers |
| Peepsy | 2 | Peep Beak, Dreamy Eyes, Tiptoe, Flutter Nub, Puff Tail |
| Trundle | 4 | Snuffle Snoot, Moon Eyes, Tap Hooves, Brush Tail, Nub Horns, Fluff Tufts |
| Skitter | 6 | Click Mandibles, Dot Cluster, Grippy Talons, Bobble Antennae, Armour Plates |
| Clatter | 4 + 2 pincer arms | Squirt Spout, Stalk Eyes, Snip Pincers, Dome Shell |
| Flapjack | 2 + Umbrella Wings | Hook Beak, Almond Eyes, Fan Tail; flies |
| Octoboop | 8 | Trumpet Bell, Big Peeper, Pillow Pads, Neck Frill; metachronal gait |

Every starter fits both budgets and passes all walk and emote tests.

### 13.2 Creature card PNG with the recipe inside
**The card.** 1080×1350, containing:
- a Hero render in the creature's best pose on a soft backdrop
- its name
- a row of stat icons with pips
- a small "drag me into Sporn" icon

Render to a target, copy to a 2D canvas (`colorSpace: 'srgb'`, alpha 255), then `toBlob('image/png')`.

**Two hidden copies of the recipe:**
1. **iTXt chunk** after IHDR: keyword `Sporn.creature`, compression flag 1, zlib JSON via `CompressionStream('deflate')`, and your own CRC32.
2. **LSB fallback,** for hosts that strip chunks:
   - Payload: `"SPRN" | ver | len16 | deflate-raw | CRC32`.
   - One bit in each R, G and B low bit, never alpha, in the bottom 64 rows.
   - Written 3× and decoded by majority vote; capacity about 25 KB.
   - Read with `createImageBitmap(blob, {premultiplyAlpha: 'none', colorSpaceConversion: 'none'})`.

**Loading a card.** Drop a PNG anywhere on the page, or pick one with the gallery's "+". Decode iTXt first, then the LSB copy. If both fail, show a friendly shake. Photo-mode PNGs embed the recipe the same way.

### 13.3 Share link
**Format.** `index.html#c=1.<base64url(deflate-raw(JSON))>`, unpadded.

**Size.** The 40-part fixture must give ≤ 2,000 characters. If it doesn't, add a compact array form `2.` (integer mm, catalog indices) and log it.

**Opening a link.**
- Inflate with a 64 KB cap, validate, migrate.
- Show the creature in a bubble with big check and cross icons. The check saves it to the gallery.

**Copying.** Use `navigator.clipboard` where allowed. Otherwise show a selectable field and offer `navigator.share`.

### 13.4 GLB export
1. Remesh at Hero quality.
2. Pose the creature (rest plus a relaxed idle frame) and bake positions with `SkinnedMesh.applyBoneTransform`. Recompute normals.
3. Bake paint to vertex colours on the GPU with the same GLSL:
   - A `Points` pass writes vertex i to pixel `(i % 1024, i / 1024)` of an RGBA8 target.
   - Read it back, decode to linear, and store it as `COLOR_0`.
   - Every material module provides a bake chunk, so eyes, keratin and shell are baked too.
4. Merge into ≤ 3 meshes, using `MeshStandardMaterial({vertexColors: true, roughness: 0.6})`.
5. Export with `GLTFExporter` `{binary: true}`, in metres, ≤ 8 MB, named `<name>.glb`.

README note: the skin is closed and manifold, and the parts are separate overlapping shells, which slicers handle.

## 14. Desktop and iPad controls

| Action | Desktop | iPad |
|---|---|---|
| Add part, leg or limb | Drag a drawer card onto the body; keep dragging a limb to grow it | Same, with a finger |
| Move a part, bend the spine or a joint | Drag | Drag |
| Grow or shrink the spine | Drag an end arrow out or in | Same |
| Fatten or scale | Wheel over it (Shift+wheel twists a part) | Pinch on the selected element |
| Insert or remove a vertebra | Tap a segment midpoint, or drag a vertebra off | Same |
| Delete a part | Drag it off the body, or press Delete | Drag it off, or long-press → bin |
| Duplicate | Alt-drag | Long-press → copy |
| Asymmetric placement | Hold A, or the mirror toggle | Mirror toggle |
| Orbit / zoom | Drag empty space or right-drag / wheel on empty space | One finger on empty space / pinch |
| Undo / redo | Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z, Ctrl+Y | 56 px buttons |
| Tabs | 1 Build, 2 Paint, 3 Play | Tap |
| Paint | Click; hover previews | Tap; press-and-hold previews |
| Move in Play | WASD or arrows, Shift runs; click ground (double-click runs) | Tap ground; hold to follow, runs after 0.6 s |
| Jump / fly | Space / F | Buttons |
| Emotes (dance, roar, sit, sleep, wave, eat, fly) | Keys 4–9 and 0, or the bar | Bottom bar |
| Photo | P, frame, save | Camera button, frame, save or share |
| Back to Build / mute | Esc / M | Build tab / speaker button |

## 15. Performance budgets

| Budget | MacBook Air (High) | iPad (Medium/Low) | In this container |
|---|---|---|---|
| Frame time | p95 ≤ 16.7 ms | p95 ≤ 16.7 ms | Not measurable; the user runs `?bench` [U] |
| CPU per frame (JS) | ≤ 4 ms | ≤ 6–7 ms | Simulation + scene update p95 ≤ 2 ms; render submit is reported only |
| Draw calls, editor main pass | ≤ 40 | ≤ 40 | Yes |
| Draw calls, island main + shadow | ≤ 110 + 30 | ≤ 75 + 20 (Medium) / 50 + 10 (Low) | Yes, per tier |
| Creature triangles | ≤ 80k (skin 40k + parts 40k) | Same at L0; L1 beyond 6 m | Yes |
| Island visible triangles | ≤ 650k | ≤ 380k / 200k | Yes |
| Shader programs | ≤ 20, constant | Same | Yes |
| Remesh preview / full | ≤ 8 / 40 ms | ≤ 15 / 80 ms | p95 ≤ 15 / 90 ms |
| GPU memory | ≤ 400 MB | ≤ 250 MB | Estimate shown in `?debug` |
| Heap churn | < 1 MB/min | Same | Yes (`performance.memory`) |
| Boot to first creature frame | ≤ 3 s | ≤ 5 s | Measure and report |

**Hot-path rules.**
- Nothing allocates per frame: preallocate scratch vectors and matrices; no closures, array literals or `.clone()` in update loops.
- Mesher buffers come from pools.
- Pause rendering and suspend audio while the page is hidden.

## 16. Milestones
Every milestone ends with these steps, in order:
1. Its tests pass in `tests.html`.
2. Its screenshots are taken and viewed.
3. Its DECISIONS section is written.
4. The README status is updated.
5. Doodle World's tests are re-run.
6. Commit and push.

**Do not start the next milestone until the exit criteria pass.** If a criterion is blocked by something outside your control, record why and continue.

| # | Deliverables | Tests | Screens (`screens/mN/`) | Exit |
|---|---|---|---|---|
| M0 Recon and scaffold | Read all of Doodle World (README, DECISIONS, `src/**`). `sporn/` tree, vendored three + addons + checksums, font, `run.command`, boot to sky and pedestal, async `tests.html`, `tools/browser.cjs`, `run-tests.cjs`, `shoot.cjs`. Audio probe (§12.1). Record the starting commit (`git rev-parse HEAD`) in DECISIONS.md for checklist item 1. | Harness self-test, checksums, every addon imports, Doodle World 17/17 | `01-boot-desktop`, `02-boot-ipad` | ALL PASS, zero console errors, pushed |
| M1 Recipe and skin | Schema, ops, hash; `sdf.js`, `nets3.js`, `mesher.js`, two-worker client; 12 fixtures (biped, quad, hexapod, octopod, tripod, uniped, snake, blob, flier, big head, 40-part max, 3-vertebra min); temporary clay material | Schema round trip and clamps; mesh validity; determinism (3×, main vs worker); timings; triangle caps; anchors after 200 random edits | `01-default`, `02-fixtures-sheet` | Remesh p95 ≤ 15 / 90 ms |
| M2 The look | Renderer, tiers, calibration, governor, post, lights, PMREM, sky, pedestal, contact shadows, skin (5 types) + paint shader, eyes, noise volumes, warm-up, context loss, `?debug` | Programs ≤ 20 and stable; zero GL errors per tier; swatch fidelity; context loss; tier override | `01-hero-high`, `02-hero-medium`, `03-hero-low`, `04-skin-macro`, `05-backlit`, `06-eye-macro`, `07-material-lineup`, `08-debug-overlay` | Shots meet §11: no banding, acne or black pixels; catchlights in every eye |
| M3 Parts and rig | All 73 builders, attachment, mirroring, centre snap, sockets, sink and mounds, skeleton, weights, skinned anchors, roles, thumbnails | Catalog completeness; L0/L1/L2 budgets; seams; symmetry; attachment; skinning at rest (1e-5); bend flips < 0.5% | `01-mouths` … `08-details`, `09-attach-macro` | M3 tests pass |
| M4 Editor | Layout, drawer, tabs, gestures, picking, handles, spine/limb/part editing, undo, budgets, stats, reactions, onboarding, camera, names | Scripted mouse and touch builds; undo round trip; budgets; stats table; hints; DOM text scan; target sizes | `01-editor-desktop`, `02-editor-ipad`, `03-editor-ipad-portrait`, `04-drag-and-look`, `05-hint-leg`, `06-budget-full`, `07-symmetry-ghost` | A 6-legged creature can be built by simulated input alone |
| M5 Paint | Layers, patterns, masks, tints, iris, skin types, dice, paint-like, shimmer | No remesh or new program on paint; domain stability; tint cycle | `01-paint-tab`, `02-shimmer-mid`, `03-pattern-sheet`, `04-stripes-follow-spine` | M5 tests pass |
| M6 Motion core (flat ground) | Idle, gait, IK, springs, wings, body, emotes, foot-slide metrics, `tools/bench-sim.cjs` | Slide scenarios for every legged fixture; legless travel; turning; every emote × every fixture; flight rule | `01-walk-quad`, `02-walk-hexapod`, `03-slither`, `04-emotes-sheet` | §18 motion items pass |
| M7 Island and drive | Island, wind, fruit, transition, controls, camera, photo mode | WASD and tap reach targets; eating; per-tier budgets; photo PNG round trip | `01-island-establishing`, `02-pond-eating`, `03-dance`, `04-glide`, `05-photo-mode`, `06-island-ipad-low` | M7 tests pass |
| M8 Audio | Manifest, generator (Case A: start the bake in the background, continue to M9, come back), post-processing and checks, board, engine, placeholders, music | Manifest complete; status honesty; OfflineAudioContext graph; file checks; key hygiene | `01-debug-audio-status`, plus a contact-sheet montage if files exist | A: files pass or are recorded as failed with placeholders. B: dry run clean and placeholders reported |
| M9 Save and share | Autosave, gallery with turntables and 8 starters, card, link, GLB | All round trips; starters valid; drop to load | `01-gallery`, `02-card.png` (the real export), `03-share-menu`, `04-link-bubble` | M9 tests pass |
| M10 Performance and acceptance | `?bench`, tier tuning, leak and GC checks, reduced motion (halve squash, no camera drift, fade instead of shimmer), README, full checklist | Everything in §18 | Every screen at desktop and iPad landscape (editor, paint, play, photo, gallery, share, onboarding, debug, bench), plus the editor in iPad portrait | §18 passes; final report written |

## 17. Verification protocol

### 17.1 Serve and launch
- **Servers.**
  - Sporn: `python3 -m http.server 8791 --directory /home/user/Me/sporn` in the background.
  - Doodle World: the repo root on 8790.
  - Kill both when done.
- **Playwright.**
  - Playwright 1.56.1 is global, and Chromium is preinstalled at `/opt/pw-browsers` (`PLAYWRIGHT_BROWSERS_PATH` is set). **Never run `playwright install`.**
  - ES module imports ignore `NODE_PATH`, so driver scripts are `.cjs`:
    ```js
    let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
    (async () => {   // CommonJS has no top-level await
      const browser = await pw.chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
      // ...
    })();
    ```
  - Never pass `--disable-frame-rate-limit` or `--disable-gpu-vsync`; they made the page close and Node hang.
- **Rendering.** WebGL2 runs on SwiftShader (software), so expect 1–3 fps with full effects. Frame rate here is not a performance signal.

### 17.2 Drive
**Contexts.**
- Desktop: 1280×800, DPR 1.
- iPad: 1180×820 and 820×1180, `hasTouch: true`, iPad Safari user agent.

**Input.** Use real input events:
- Playwright mouse, wheel and keyboard.
- `page.touchscreen` for taps.
- CDP `Input.dispatchTouchEvent` with two touch points for pinch and twist.

**Determinism.** Load with `?test`. Advance time with `__sporn.step(n)` and call `await __sporn.settle()` before every screenshot or measurement. Timeouts are 120 s.

**Console.**
- Capture every `console.error`, warning, page error and failed request.
- Fail on any, except the allowlisted `KHR_parallel_shader_compile` warning.
- Abort every non-localhost request and assert there were none.

### 17.3 Screenshots
- Save with `page.screenshot({type: 'jpeg', quality: 85})` to `sporn/screens/mN/NN-name.jpg`.
- Open every one with your image-reading tool and judge it against the milestone's bar.
- `shoot.cjs` fails on blank frames (pixel variance below a threshold).
- **Regression diffs:** 640×480, DPR 1, fixed seed, YIQ threshold 0.1, ≤ 0.5% differing pixels. Compare only against references made in this container.

### 17.4 What cannot be measured here, and the proxies
**Not measurable in the container:**
- real GPU fps, thermals, iPad memory kills
- Safari and WebKit behaviour (only Chromium is installed; install nothing else)
- fp16 `mediump` artifacts
- touch feel
- sound by ear
- P3 colour

**Measure instead, labelled "4 vCPU software-GL container":**
- simulation and scene-update CPU time (`performance.now()`)
- `renderer.info` calls, triangles, programs
- worker remesh ms
- `performance.memory`
- foot-slide mm

**`?debug` overlay shows:**
- fps and frame p50/p95
- CPU ms for simulation and render submit
- triangles, calls, programs, geometries, textures
- tier, DPR rung, render scale
- last remesh ms
- live foot slide
- audio counts
- a "copy JSON" button (falls back to a text box)

**`?bench`:** 3 s warm-up, then 25 s:
1. Editor, 40-part fixture, drag remeshing every 100 ms: 5 s.
2. Editor idle orbit: 5 s.
3. Island walk on a fixed path: 10 s.
4. Photo hero frame: 5 s.

- **Score** = Σ w·min(1, 16.7/p95)·1000 + min(1, 40/full_ms)·250.
- **Display:** one big number, plus per-stage p50/p95, tier, DPR and renderer string. Tap to copy the JSON.
- **Options:** `?bench&quality=high` forces a tier. `?precision=mediump` lets the user check fp16 artifacts on the iPad.

**Wording.** Never write "60 fps achieved" from container data. Write: "MacBook Air and iPad frame rates: user verifies with `?bench` (target p95 ≤ 16.7 ms)."

## 18. Hard Acceptance Checklist
Every [T], [M] and [S] item must pass.

| Tag | Meaning |
|---|---|
| [T] | Automated test in `tests.html` or `tools/e2e.cjs` |
| [M] | Measured metric, reported with its number |
| [S] | Screenshot that you viewed |
| [U] | User verifies on a device |

**Repo and runtime**
1. [T] `git diff --name-only <start>..HEAD` lists only `sporn/` paths. Doodle World `tests.html` shows ALL PASS (17/17).
2. [T] `sporn/tests.html` shows ALL PASS with ≥ 80 tests and exports `window.__results`.
3. [T] `run.command` is mode 100755 in git and serves port 8791. The game boots to a living creature with zero console errors or warnings outside the allowlist.
4. [T] A full scripted session makes zero non-localhost requests.
5. [T] Vendored files match `CHECKSUMS.txt` and npm `three@0.170.0`. Every addon imports.
6. [T] `git grep -i spore -- sporn/` is empty, and no file contains the ElevenLabs key.

**Skin and body**
7. [T] All 12 fixtures and 8 starters have 0 open edges, 0 NaN, non-manifold ≤ 1% of edges, volume > 0, and full skin ≤ 40k triangles.
8. [M] Remesh, 50 runs on the 40-part fixture: preview p95 ≤ 15 ms and full p95 ≤ 90 ms. Report the numbers plus the M1 estimate (×0.5–0.7).
9. [T] Geometry hashes are identical across 3 builds and between main thread and worker. The locomotion state hash after 600 fixed steps repeats.
10. [T] Spine limits hold: 3–24 vertebrae, radius clamps, wheel step 8% ± 0.5% per notch, and after every edit the creature's minimum Y is 0 ± 1 mm.
11. [T] Limb drag-out grows segments in proportion to the drag. End-joint drags add and remove segments within 2–5 joints. Roles are correct for every fixture.

**Parts**
12. [T] 73 parts, every group at its §7 count, each with name, builder, DNA, complexity, stats and tags. Each builds at L0/L1/L2 with no NaN, ≤ 1.5k triangles at L0, and a non-blank thumbnail.
13. [T] No seams: every base-ring vertex of every part sits inside the skin (field ≤ −0.15 × base height), and OKLab ΔE between skin paint at the anchor and the part base is ≤ 0.02. [S] `m3/09-attach-macro` shows no gap.
14. [T] After 200 random spine and limb edits, every part and limb root re-resolves to within 0.5h of the surface with the correct sink, and none is lost.
15. [T] Twin transforms equal the mirror within 1e-5. A symmetric recipe's skin is within Hausdorff ≤ 0.5h of its x-mirror. The centreline snap gives a single centred part.
16. [T] Rest pose reproduces rest positions within 1e-5. A 90° limb bend flips < 0.5% of triangles. Parts follow the skin within 2 mm in posed frames.

**Editor**
17. [T] 200 scripted random operations, then undo all, gives the original recipe hash. Redo all gives the final one.
18. [T] A part costing more than the remaining DNA cannot be dropped (recipe unchanged, bonk fired). Refunds are exact. The total never exceeds 2,000.
19. [T] Complexity never exceeds 100. Cards that do not fit show the lock and are neither hidden nor droppable.
20. [T] Starter stats match a hand-computed table and update in the same frame as the edit.
21. [T] A 6-legged creature with mouth, eyes, tail and horns is built purely by simulated mouse input, and again by simulated touch in the iPad context. No `__sporn.op` shortcuts.
22. [T] On a fresh profile, hint 1 appears within 2 s, disappears within 1 s of attaching a leg, never returns after a reload, and the next hint follows.
23. [T] Every control is ≥ 44×44 CSS px (cards ≥ 64). Visible text nodes in every mode contain only digits, the creature name and symbols. Every control has an `aria-label`.

**Paint**
24. [T] Every layer × 10 patterns × 3 sizes renders with zero GL errors, zero remeshes and an unchanged program count.
25. [T] Fattening one vertebra moves the pattern domain on unaffected limbs by ≤ 1 mm. The domain is continuous across junctions (neighbour jump ≤ 3h).
26. [T] Each of the 18 swatches on a front-lit reference patch renders within OKLab ΔE ≤ 0.06 of itself, in High and in Low.
27. [S] `m5/04-stripes-follow-spine` shows stripes curving with the spine and wrapping the limbs.

**Test drive**
28. [M] 10 m straight at walk and at run speed for the biped, quad, hexapod, octopod and tripod fixtures and every legged starter:
    - planted-foot drift p95 ≤ 3 mm and max ≤ 10 mm (legs 0.3–1.0 m, not reach-limited)
    - penetration p95 ≤ 2 mm
    - stance air gap ≤ 5 mm
    - supporting feet never below the gait minimum
29. [M] A 1.5 m-radius circle and a 360° turn in place meet the same slide limits.
30. [M] The snake (slither) and the blob (hop) each cover 10 m in ≤ 25 s, with penetration ≤ 1 cm and no NaN.
31. [T] Every emote resolves for every fixture and starter and runs 3 s with no NaN, feet penetrating < 1 cm, and no new programs.
32. [T] Flapjack takes off, flies 10 s under input and lands. Glide-only creatures only glide. Wingless creatures play the fallback.
33. [T] WASD and tap-to-move each reach a target 8 m away to within 0.3 m. Hold-to-follow switches to running after 0.6 s. Jump height is within ±5% of the stat formula.
34. [T] Over 30 s of idle: ≥ 5 blinks, breathing amplitude 1.2% ± 0.3%, eyes within 10° of a moved cursor target after 0.5 s, and the tail springs move.
35. [T] Fruit within 1 m is eaten (chomps, crumbs, heart), disappears, and respawns after 20 s.
36. [T] Photo mode freezes, cycles all 6 backdrops, and saves a 1920×1080 PNG whose embedded recipe round-trips.

**Graphics and performance**
37. [T] Program count is ≤ 20 after warm-up and unchanged after a scripted session through every tab, emote, paint pattern, the island and photo mode.
38. [M] Draw calls and triangles are within the §15 budgets for each tier, in the editor and on the island (via `?quality=`).
39. [T] All tiers render the editor and island with zero GL errors. Low uses no composer and matches High within ΔE ≤ 0.05 at the creature reference patch.
40. [M] Simulation plus scene update ≤ 2 ms p95 in the container (one creature on the island, High).
41. [T] Heap grows < 1 MB/min over 60 s of island idle. After 50 rebuild/undo cycles and 10 editor↔island trips, `renderer.info.memory` is back to baseline ± 2.
42. [T] After context loss and restore, the screenshot differs by ≤ 0.5% of pixels.
43. [S] The M2 hero shots in all 3 tiers show the pedestal glow, a seamless sky, rim lights, contact shadows and catchlights in every eye, with no banding, acne or pure-black creature pixels.
44. [U] MacBook Air: `?bench` in Chrome and Safari at the auto tier, every stage p95 ≤ 16.7 ms.
45. [U] iPad Safari:
    - auto tier is Medium or Low
    - `?bench` p95 ≤ 16.7 ms
    - no reload or crash in 10 minutes
    - touch feels right
    - `?precision=mediump` is clean

**Save and share**
46. [T] After an edit and a reload, the recipe comes back deep-equal within 1 s. With IndexedDB blocked, the localStorage mirror restores it.
47. [T] All 8 starters load, fit the budgets, and pass the walk and emote tests. The shelf shows animated turntables.
48. [T] Card export decoded via iTXt is deep-equal. With chunks stripped (re-encoded through a canvas), the LSB decode is deep-equal. Dropping the PNG on the page loads the creature.
49. [T] The share link round-trips deep-equal and is ≤ 2,000 characters for the 40-part fixture. Corrupt, oversized (> 64 KB inflated) and wrong-version links are rejected gracefully.
50. [T] GLBs from 3 starters reload with GLTFLoader: vertex count and bounding box within 1%, `COLOR_0` present, each ≤ 8 MB. If `npm install gltf-validator` into scratch works, it reports 0 errors.

**Audio**
51. [T] `audio-manifest.json` lists all 81 ids. Each has ≥ 1 generated variant that passed its checks, or is listed as a placeholder in `report.json`, in `audio.status()` and in the final report. A placeholder is never reported as generated.
52. [T] Case A files pass format, loudness ±1 LU, true peak, clipping, edges, DC and loop-seam checks, and their sha256 matches the manifest.
53. [T] An OfflineAudioContext render of a scripted sequence peaks ≤ −1 dBFS. Rate follows the size formula. Caps and cooldowns hold. Unlock handles `suspended` and `interrupted`.
54. [T] `gen-sounds.mjs --dry-run` exits 0 offline and prints the plan and estimate.
55. [U] The user listens on `tools/board.html` and approves.

**Session**
56. [S] Every screenshot listed in §16 exists, is non-blank and has been viewed.
57. [T] A scripted end-to-end session at the desktop and iPad viewports (boot, build, paint, play, every emote, photo, gallery, save and reload, card, link, GLB) logs zero console errors.

## 19. Priorities if time runs short
**Never cut:**
- Doodle World safety
- recipe and undo
- seamless skin and parts, and the full catalog
- the editor on mouse and on touch
- three-layer paint
- walking for any leg count with planted feet
- the 7 emotes and idle life
- autosave, gallery and starters
- card and link
- honest audio
- tests, screenshots, commits and the final report

**Cut first to last,** logging each cut in DECISIONS.md and the report:
1. fur shells
2. butterflies, pollen, cloud shadows
3. PCSS (keep PCF)
4. GTAO (keep baked AO)
5. live drawer turntables (keep static thumbnails)
6. Paint like
7. GLB bake of eyes and keratin (flat colours)
8. photo frames
9. 1- and 3-leg special gaits (use the metachronal wave)
10. GLB export, last

## 20. Final report
End with this report, also saved as the "Final report" section of `sporn/README.md`:

1. **What was built.** One paragraph, then how to run it:
   - double-click `sporn/run.command`
   - open the printed LAN URL on the iPad (same Wi-Fi)
   - tests at `/tests.html`
   - `?debug` and `?bench`
2. **Checklist.** A table of all §18 items with pass/fail, method, and the measured number.
3. **Measured numbers,** each labelled as from a 4 vCPU software-GL container:
   - remesh times
   - foot slide p95/max per creature
   - calls and triangles per tier
   - program count
   - heap growth
4. **Audio.** Which case applied; generated vs placeholder ids; credits used. For Case B, the exact steps:
   1. Add the secret and the allowed domain.
   2. Run `NODE_USE_ENV_PROXY=1 node sporn/tools/gen-sounds.mjs --max-credits 20000`.
   3. Approve sounds on `board.html`.
5. **Not verifiable here.** Real frame rates, Safari/iPad behaviour, touch feel, sound by ear, P3 colour. Give the exact check for each.
6. **Cuts and deviations,** with reasons.
7. **Where things are.** `screens/m10/`, `DECISIONS.md`, `tools/`, and the last pushed commit hash.
