# Decisions

Choices made where the master prompt was silent or where a better method turned up while building.

## Step 1: the creature (7 Oct 2026)
- **The drawing is the creature's front view.** It steps out of the paper toward you. Eyes sit on the front (+Z) face and it walks along Z. A profile reading would put every drawn leg on one plane.
- **Inflation is a union of balls on the medial axis, not Teddy triangulation.** Every limb gets a round cross-section, junctions blend like pinched clay, and there is no polygon triangulator to break on messy scribbles. Surface nets extract the mesh; Taubin smoothing relaxes it without shrinking.
- **Gaps up to ~4% of the drawing close automatically.** Kids rarely close outlines.
- **Gap-closing only stops leaks; it never adds clay.** The outside is flood-filled against a thickened copy of the ink, then grown back to the real ink, so legs drawn close together stay separate.
- **Thin enclosed pockets next to the outside stay open.** The space between two legs whose feet touch is a pocket, not belly.
- **Pieces drawn just short of the body attach.** Anything within ~6% of the drawing's size gets a clay bridge along the shortest path, repeated so a foot can join a leg that joined the body. Everything further away is ignored for now; stickers come later.
- **Small round dots drawn inside the body become the eyes**, up to four. Roundness is judged by how stretched the mark is, so a short slash becomes a freckle, not an eye, and solid dots beat rings. Anything else drawn inside (mouths, spots, stripes) is printed onto the front of the clay. With no drawn eyes the creature gets two on its head, plus a smile if nothing else was drawn inside.
- **Shapes with no separate legs get two stub feet**, so everything can stand and later walk.
- **Clay is MeshPhysicalMaterial, not a toon ramp.** Matte roughness 0.62, soft sheen, object-space thumbprint relief, a warm rim that reads as subsurface light. It looks like real plasticine, which is the premium bar.
- **The paper becomes the world.** For step 1 the floor and sky are the exact cream of the drawing paper with the same grain, so the creature appears to stand on the page. The island arrives in step 2.
- **The birth camera starts where the doodle was.** The first frame puts the flat creature exactly over the drawing, then it puffs up and the camera swings to a three-quarter view.
- **Mesh resolution is 112 grid cells.** Creatures land between 10k and 60k triangles. Fine on desktop and modern phones for one creature; a level-of-detail pass comes before the herd.
- **Three.js r170 is vendored** in `vendor/`, so the game runs offline.
- **Shaders compile while you draw.** Every creature material is compiled at startup, and the birth clock starts on the first rendered frame, so the puff is never skipped.
- **Colour-true tone mapping (Khronos PBR Neutral).** ACES washed coral into salmon; Neutral keeps every pen colour recognisable.

## Step 2: the island (9 Oct 2026)
- **The paper turns into the island.** The birth still starts in a world painted the exact cream of the paper, so the first frame looks like step 1. As the creature puffs up, colour fades in: sky, sea, grass, trees. Every world material mixes toward the paper colour after output conversion, so "fully paper" is pixel-exact.
- **One handmade island, the same every time.** A fixed seed builds one home island (about 340 m² of walkable land) that every creature, and later the herd, shares. A new island per creature would make it feel disposable.
- **The island is one height function.** Pure data in `src/world/terrain.js`, no WebGL, so tests run headless and walking (step 3) can ask `heightAt`, `slopeAt`, `isDry` and `obstacles` directly. A smooth-min against a coastal profile gives the beach for free; a smooth-max puts a floor on the seabed.
- **The birth meadow is exactly flat.** Everything inside 3.2 m of the origin is y = 0 to the last bit, so the creature, its contact shadow and its stub feet sit exactly as in step 1.
- **Nothing tall stands in front of the creature.** Trees and bushes stay out of a wedge on the camera side, so the birth and hero cameras always have a clear view on any screen shape. The view out front is meadow, beach and sea; the trees and the hill frame it from behind.
- **The camera never clips.** It stays above the ground and the sea, and lifts smoothly over treetops while you orbit. You can zoom out to 38 m to see the whole island.
- **Props are clay too.** Trees, bushes, rocks and clouds are lumpy spheres (pushed in and out like hand-rolled clay) in a handful of instanced meshes. Flowers use the pen colours, so the island feels drawn with the same box of pens.
- **The sun's shadow map stays tight around the creature.** Prop shadows are baked into the grass colour instead, offset away from the sun. One 1024² map keeps the creature's own shadow crisp, and props never need a shadow pass.
- **The sea is a single unlit quad.** Its colour, transparency and foam come from a depth texture baked from the height field: turquoise shallows over sand, a breathing foam line at the shore and a soft wave rolling in. Ripples catch the sun as glints. It fades to the paper-cream horizon, which is also the fog colour.
- **The renderer idles while you draw.** No frames are drawn in drawing mode, so the bigger world costs nothing until there's a creature to look at.

## Step 3: walking (9 Oct 2026)
- **It walks on the legs you drew.** The hip line is the lowest height where the separate legs merge into the body; every vertex below it, next to a drawn foot, belongs to that leg. Legs swing about the hip in the vertex shader, so there's no skeleton and no rebuilt mesh, and the shadow bends the same way through a matching depth material.
- **Every body gets its own gait.** Two to four legs alternate neighbours, five or more ripple like an octopus, and shapes with no legs hop on their stub feet with squash and stretch. Two-legged creatures waddle side to side.
- **The feet don't skate.** Walking speed comes from the stride: a planted foot sweeps 2·hip·sin(swing) per half cycle, and the body moves exactly that far. Longer legs take slower, bigger steps.
- **Tap the ground to call it.** A soft ring pops where you tapped, the creature chirps, and it walks there by A* on a 0.5 m grid (obstacles grown by its own size), with the path pulled tight. A tap on the sea or behind a tree goes to the nearest reachable spot instead.
- **Left alone, it explores.** It rests a few seconds after birth (the hero moment), then strolls to nearby spots, looks around, and strolls again. Its eyes look where it's going unless you're moving the cursor.
- **The camera, sun and shadow follow it.** The orbit target eases after the creature and the camera moves with it, so your chosen angle is kept. Auto-rotate pauses while it walks.
- **It leans with the ground.** The body tilts halfway toward the slope it's standing on and leans slightly into its stride.
- **Known issue:** walking shows creatures from the side for the first time, and a faint crease is visible along the rim where the front and back of the inflated shape meet. It comes from the step 1 inflation and is worth smoothing before the phone pass.

## Art style experiment: cel shading (9 Oct 2026)
- **Cel shading is the default look.** Every clay material uses a three-band toon ramp with ink outlines (the same bent mesh pushed out along its normals, back faces only), including on the walking legs. It suits a game about drawing, and outlines keep creatures readable from far away, which the tribe stage will need. `?look=clay` brings back the soft clay. Comparison shots are in `screens/looks`.
- **Outlines are dark versions of each object's own colour**, not black, so they read like marker pen rather than wireframe, which suits a game about drawing.

## Spore-style movement (9 Oct 2026)
- **Feet plant, then step.** Every drawn foot has a position in the world. Planted feet stay put while the body moves over them; when the gait says so, a foot lifts, arcs forward to where the body will be halfway through its next planted stretch, and lands on the ground, slopes included.
- **Knees, by two-bone inverse kinematics.** Each leg is a thigh and a shin of equal length with the knee halfway down, solved analytically (no IK library). The vertex shader blends the two bones around the knee like skinning, and slides the foot sideways while the creature turns on planted feet.
- **A gait per leg count, borrowed from real animals.** 2 legs walk with a waddle, 3 take turns, 4 and 5 trot in alternate pairs, 6 use the insect tripod, and 7 to 12 ripple in a wave. Tests check that enough feet are always down (at least 3 of 6, 7 of 12) and that the body covers exactly one stride per planted stretch, so feet never skate.
- **The body rides on its legs.** It sits at its feet's average height, crouches into the stride, bobs twice per cycle, and its top half lags behind on a spring when it speeds up, brakes or turns, so antennae and arms wobble. When it stops, any foot left behind takes one more step to settle.
- **Up to 12 legs.** Leg detection and the shader now handle 12. The `beetle` (6) and `centipede` (12) samples show the tripod and the wave.
- **Arms and antennae move on their own.** Thin parts above the hips are found by opening the silhouette (shrink, regrow): what the body can't regrow is a limb. Side limbs are arms: they swing opposite the stride and fly up when you tap the creature. Limbs pointing up are antennae, ears or horns: they flop, lag behind on the body spring and wiggle when tapped. Up to six per creature, posed in the shader about their joint.
- **Running.** Called from more than 4 m away, it breaks into a run: faster, bigger strides, more bounce, arms out.
- **Calmer many-legged walks.** Centipedes crouch less, so their legs stay straighter and the wave reads clearly.
- **Idle life.** Standing still, it shifts its weight from side to side, sways its arms and wiggles its antennae.
- **Reactions.** Reaching a spot you called it to, it does a happy jump: squat, spring up with arms in the air and feet tucked, land in a squash. Tap it and it turns to face you; double-tap and it jumps. After a few strolls it gets sleepy and naps for 15 to 30 seconds (folded legs, droopy arms and antennae, closed eyes, rising z's); a tap or a call wakes it. Standing about, it glances at you and at things around it.
- **Still to come for movement:** tails and necks need the 3D editor, since a front-view drawing can't show a tail sticking out the back.

