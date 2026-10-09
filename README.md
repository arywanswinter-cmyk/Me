# Doodle World

Draw anything. Press **Bring to life**. It puffs up into a clay creature that blinks, breathes, follows your cursor and squeaks when you tap it.

## Run
Double-click `run.command` (serves on http://localhost:8790). Tests: http://localhost:8790/tests.html. Add `?debug` to the game URL for build timings.

## Controls
- Draw with mouse, finger or pencil. Pick a colour and a pen size at the top.
- **Enter** brings it to life. **Esc** goes back to the drawing. **Cmd/Ctrl+Z** undoes.
- Drag to spin around the creature, scroll or pinch to zoom, tap it to make it squeak.
- **Try a sample** cycles through built-in doodles.

## Build steps
1. The creature — done (17/17 tests, screenshots in `screens/step1`).
2. The island.
3. Walking.
4. Eating, growing, the full birth sequence.
5. Phone pass and sound.

See `DECISIONS.md` for the choices behind each step.
