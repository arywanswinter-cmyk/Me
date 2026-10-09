# ElevenLabs voice-over: Sketching Strategy, Iran episode

These settings and the markup in [`script.txt`](script.txt) are set up for the slowest, most deliberate read ElevenLabs can give.

The words in `script.txt` are your script exactly, with nothing reworded. The only additions are `<break>` pause tags.

| File | What it is |
|---|---|
| `script.txt` | The script, ready to paste, with 202 pause tags (about 5 minutes of added silence) |
| `pronunciation.pls` | Pronunciation dictionary for the Persian and Kurdish names |
| `README.md` | This guide |

**Estimated runtime:** about 24–26 minutes. That's 2,207 words at roughly 105–115 words per minute, plus the pauses.

---

## 1. Voice settings

| Setting | Value | Why |
|---|---|---|
| **Model** | **Eleven Multilingual v2** | It supports `<break>` tags and the speed control. It's also the steadiest model for long-form narration. |
| **Speed** | **0.70** | This is the lowest value ElevenLabs allows (the range is 0.7–1.2). If words start to drag or sound synthetic, raise it to 0.75–0.80. The pauses still give you most of the slowness. |
| **Stability** | **0.65** (try 0.60–0.75) | Higher stability gives a steadier, more controlled delivery. Above about 0.80 it goes flat and monotone. |
| **Similarity** | **0.75** | The default. Only raise it if the voice drifts from its source. |
| **Style exaggeration** | **0** | Style adds dramatic flourishes and makes generations less stable. This script needs restraint, so the material carries the weight. |
| **Speaker boost** | **On** | |

**Voice choice:** pick a voice with a low register and a calm, measured base read, such as a documentary or audiobook narrator. Avoid voices trained on energetic or promotional reads, because they fight a slow speed setting. The script uses British spelling, and a British narrator suits it.

**Before rendering everything,** generate the first two paragraphs and tune speed and stability on that test. They're the most fragile stretch of the script, so if they work, the rest will.

---

## 2. How the pauses work

`<break time="1.5s" />` inserts silence of that length. ElevenLabs caps a single break at **3 seconds**. The script uses four lengths:

| Pause | Used for |
|---|---|
| **0.8s** | A held breath inside a sentence. Examples: before a colon's payoff, before the newest instrument in each "A cable, a rope…" refrain, between "They break the doors. / They drag women out…" |
| **1.0–1.5s** | After a sentence that needs to land before the next one starts |
| **2.0–2.5s** | End of a paragraph, especially after a death, a number, or a turn in the argument |
| **3.0s** | End of each section, and after every "Watch the line" refrain |

Sections are separated by two blank lines in `script.txt`.

**Pauses longer than 3 seconds** have to be made in your editor. These spots are worth an extra 1–2 seconds of room tone:
- after *"That sentence is what the line at zero is for."* (end of the cold open)
- after *"Then silence."*
- after *"One machine."*
- after *"It did not."*, before the final line

**If the voice starts rushing, or you hear clicks or artefacts:** ElevenLabs warns that too many break tags in one generation can cause this, and the model may even *speed up*. To fix it, generate that paragraph on its own. If it still happens, delete its 0.8s tags and let the commas do that work.

---

## 3. Where to paste it

### Studio (recommended for a 25-minute piece)
1. Create a project and paste in `script.txt`. Studio splits it into paragraphs, and you can make each section a chapter.
2. Check that the `<break>` tags turned into pause markers. If any appear as plain text, replace them with Studio's own pause control at the same spot and with the same length.
3. Set the voice settings from section 1.
4. Upload `pronunciation.pls` as a pronunciation dictionary for the project.

### Text to Speech page
Paste **one section at a time** (the blocks separated by two blank lines). Each section is under 3,000 characters, so every one fits in a single generation. Use the same voice, settings and seed for every section so the tone matches across cuts.

| # | Section | Starts with | Characters |
|---|---|---|---|
| 1 | Cold open | "On the evening of the eighth of January…" | 1,689 |
| 2 | Thesis | "This is Sketching Strategy…" | 839 |
| 3 | January 2026 | "The protests begin on the twenty-eighth of December…" | 2,435 |
| 4 | 2022 | "Go back to September twenty twenty-two…" | 1,849 |
| 5 | 2019 | "In November twenty nineteen…" | 1,358 |
| 6 | 2017 / 2009 | "Two years earlier, in late December twenty seventeen…" | 2,154 |
| 7 | 1999 | "Ten years earlier, in July nineteen ninety-nine…" | 1,270 |
| 8 | 1988 | "Go back to the summer of nineteen eighty-eight…" | 1,391 |
| 9 | 1979–81 | "And now, nineteen seventy-nine." | 2,816 |
| 10 | The machine | "Here is the eighth of January once more…" | 1,104 |
| 11 | Close | "And that brings us back to Rubina Aminian…" | 673 |

### API
Send one section per request:

```json
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}

{
  "model_id": "eleven_multilingual_v2",
  "text": "<one section of script.txt>",
  "voice_settings": {
    "stability": 0.65,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": true,
    "speed": 0.7
  },
  "pronunciation_dictionary_locators": [
    { "pronunciation_dictionary_id": "<id>", "version_id": "<version>" }
  ]
}
```

Upload `pronunciation.pls` once with the "add pronunciation dictionary from file" endpoint to get the ID and version. Request stitching keeps the delivery even across sections: pass `previous_text` and `next_text`, or `previous_request_ids` with the IDs of the sections already generated. Without it, each section can start at a slightly different pitch and energy.

---

## 4. Pronunciation

`pronunciation.pls` respells the names an English voice is likely to get wrong. It uses alias rules, which work on every model, including Multilingual v2. These are the ones that matter most:

| Written | Say | Note |
|---|---|---|
| **Jina** | ZHEE-nah | Kurdish. The J sounds like the s in "measure", not "jeans". |
| **Jin, Jiyan, Azadî** | zhin, zhee-YAHN, ah-zah-DEE | Kurdish for Woman, Life, Freedom. Same "zh" sound. |
| **Jaleh** (Square) | zhah-LEH | Persian. Same "zh" sound. |
| Saqqez | sah-KEZ | |
| Kermanshah | ker-mahn-SHAH | |
| Kamyaran | kahm-yah-RAHN | |
| Kahrizak | kah-ree-ZAHK | |
| Rubina Aminian | roo-BEE-nah ah-mee-nee-AHN | |
| Khamenei | khah-meh-neh-EE | |
| Ahmadinejad | ah-mah-dee-neh-ZHAHD | |
| Neda Agha-Soltan | neh-DAH ah-GHAH sol-TAHN | |
| Khalkhali | khal-khah-LEE | |
| Sanandaj | sah-nahn-DAHJ | |

Persian words usually take the stress on the last syllable. The respellings are approximations. Listen to each name once before the full render, and adjust the `.pls` file by ear or with a native speaker. Matching is case-sensitive, and possessive forms (*Rubina's*, *Neda's*) need their own entries. If any other form comes out wrong, add it as a new entry.

---

## 5. If you switch to Eleven v3

This markup is built for Multilingual v2. **Eleven v3 does not support `<break>` tags.** To use v3, remove the tags and mark the pauses with line breaks and ellipses (`…`) instead. Expect less exact control over how long each pause lasts.
