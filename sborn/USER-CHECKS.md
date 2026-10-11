# User checks

Things this build could not check in a 4 vCPU software-GL container with no real GPU, Safari, iPad, speaker or child. Each row: what to run, how, the pass threshold, and a blank for your result.

| # | What | Tool and steps | Pass threshold | Your result |
|---|---|---|---|---|
| 44 | MacBook Air (Apple M1) speed | Plugged in, one tab. Open `http://localhost:8791/?bench` in Chrome, Safari and Firefox; tap the big number to copy the JSON and paste it here. Also open `/tests.html` in Safari and Firefox. | Auto tier High in Chrome and Safari; every stage p95 ≤ 16.7 ms; tests ALL PASS in Safari and Firefox | |
| 45 | iPad Safari | On the LAN URL printed by `run.command`: (a) `?debug` shows tier; (b) `?bench` JSON pasted; (c) play 10 minutes (3 building, 7 on the island); (d) drag a card onto the body first try, pinch a selected vertebra, two-finger orbit, long-press a part for the radial menu; (e) look for pattern or noise artifacts; (f) `/tests.html` | (a) Medium or Low; (b) every stage p95 ≤ 16.7 ms; (c) no reload or crash; (d) all work, no page zoom, no selection callout or magnifier; (e) none; (f) ALL PASS | |
| 55 | Sound approval | Open `tools/board.html` (served by `run.command` at `http://localhost:8791/tools/board.html`), play every variant, keep or reject, export `approvals.json`, run `node sborn/tools/gen-sounds.mjs --apply-approvals approvals.json` | Every id has an approved variant or is knowingly a placeholder | |
| 74 | run.command | Double-click `sborn/run.command` on the Mac | The game opens; the printed LAN URL loads on the iPad on the same Wi-Fi | |
| 75 | iPad audio | First tap, silent switch, mute button then reload, switch apps and come back | Sound starts on the first tap; the silent switch silences it; mute survives reload; sound resumes without reload | |
| 76 | iPad saving | Photo mode → save; share → card; press and hold the picture → Save to Photos; gallery "+" → pick that photo; share → link | Saves to Photos; the PNG re-imports as the same creature; the link shows as a selectable field over http | |
| 77 | Safari on Mac and iPad | Build → paint → play → save → reload with Web Inspector open | Clean console; colours match the swatch chips on the P3 display | |
| 78 | A child who cannot read | First boot, no help | Builds a creature and presses Play within 3 minutes | |
| 79 | iPad Low Power Mode | Turn on Low Power Mode, open `?debug` on a ≥ 2360×1640 iPad | 30 Hz cap detected; tier not below Medium | |
