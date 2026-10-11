# Instructions for coding agents working on Sborn

Read `sborn/HANDOVER.md` first: it says what Sborn is, where it stands, how to run and test it, and what is still broken. The full spec is `prompts/sborn-master-prompt.md`.

- Work only inside `sborn/`. Keep Doodle World (everything else in the repo) unchanged, and keep its tests at ALL PASS · 17/17.
- No build step, no runtime dependencies, no `package.json`, no network requests at runtime.
- Never write the reference game's name or the branch name in any file or path under `sborn/`.
- Never loosen a threshold in `sborn/tests/thresholds.js`. Report failures honestly in `sborn/README.md` under "Open failures".
- Start every new `.js`, `.mjs` or `.cjs` file with `// <file> — purpose.`, `// Exports: …` and `// Invariants: …`.
- Record each design decision as a bullet in `sborn/DECISIONS.md`.
- Commit and push with `bash sborn/tools/checkpoint.sh "<message>"`; it scans for keys and naming problems first.
- Never write, print or commit API keys.
