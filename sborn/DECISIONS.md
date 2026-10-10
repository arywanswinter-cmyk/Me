# Decisions

Choices made where the master prompt was silent, or where a better method turned up while building. "The reference game" is the 2008 creature-editor game whose mechanics Sborn recreates.

## M0: recon and scaffold (10 Oct 2026)
Start commit: c3c05a57c94ad6fa7b62479083232b71a346cdbf
M0 started: 2026-10-10T17:52:48Z (`date -u`).
- **The master prompt is tracked on this branch (`git ls-files` lists it), so nothing had to be noted about a missing prompt.** It is read from `prompts/` and never committed by this run.
- **three.js addons come from `npm pack three@0.170.0`, whose tarball sha512 matches `dist.integrity`.** The GitHub tag fallback was not needed; `CHECKSUMS.txt` records the integrity and a sha256 per vendored file.
- **The font is the Latin "wght" variable woff2 from `@fontsource-variable/fredoka` 5.3.0, renamed `Fredoka-latin-variable.woff2`, with its OFL licence as `OFL.txt`.** The weight axis is all the UI needs; the width axis file was rejected as unused bytes.
- **Audio is Case B: `ELEVENLABS_API_KEY` is empty in this environment, so the probe was not run (§12.1 says key empty → Case B).** The generator, manifest and board are still built; the runtime synthesizes soft placeholders.
