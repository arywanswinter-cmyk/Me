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
