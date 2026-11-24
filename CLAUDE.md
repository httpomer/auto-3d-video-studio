# Automated 3D Video Studio

This project turns ONE instruction — "Create an 8–10 minute YouTube video about [TOPIC]" — into a finished,
narrated, fully 3D-animated MP4 plus thumbnail, subtitles and YouTube metadata. There is no manual editing
step. When the user gives a topic, run the whole workflow below without asking them to make creative
decisions; you are the researcher, scriptwriter, director, storyboard artist, editor and production manager.

Non-negotiables from the owner:
- 3D animation is the visual style. Never fall back to slideshows, stock images or text-only screens.
  Every shot is a real 3D scene from `engine/scenes/`, and it must illustrate what the narration is saying.
- If no existing scene explains a concept well, build a new reusable scene template (see "Adding a scene"),
  or use a simpler but polished 3D visualisation. Never insert an unrelated visual.
- Do not trade quality for render speed. Accuracy of facts and figures matters as much as looks.

## How it works

| Stage | Tool | Where |
|---|---|---|
| Research, script, storyboard | You (Claude) + WebSearch | `projects/<slug>/research.md`, `projects/<slug>/video.json` |
| 3D scenes, camera, on-screen graphics, captions | Three.js engine rendered frame-by-frame in headless Chrome (GPU) | `engine/` |
| Narration | Neural TTS, one clip per shot, with word timings | `pipeline/tts.js` |
| Music + sound design | Generated procedurally (or `projects/<slug>/music.mp3` if present) | `pipeline/music.js` |
| Mix, encode, mux | FFmpeg | `pipeline/audio.js`, `pipeline/render.js` |

Shot durations are derived from the measured narration audio, so picture and voice are always in sync.
Every frame is a pure function of time, so rendering is deterministic, parallel and resumable.

## The workflow (do all of it, in order)

1. **Research.** Use WebSearch (extended mode for recent figures). Collect current, dated facts from several
   independent sources; cross-check every number you plan to show on screen. Save `projects/<slug>/research.md`
   with the facts, their dates and source URLs. Note the "as of" date for anything that moves (prices,
   market caps, revenue).
2. **Script + storyboard.** Read `docs/SCENES.md` (the scene catalogue; regenerate with `npm run catalog` if
   scenes changed), then write `projects/<slug>/video.json` (schema below). Script and storyboard are one
   file: each shot holds its narration and the direction for what is on screen while it is spoken.
3. **Validate.** `npm run validate -- <slug>` → fix every error; read the warnings.
4. **Review the pictures.** `npm run stills -- <slug>` renders one frame per shot into contact sheets at
   `projects/<slug>/build/stills/sheet_NN.jpg`. Read every sheet. Fix anything weak: empty or confusing
   frames, labels overlapping, text colliding with the subject, wrong framing, repeated-looking neighbours,
   data that reads wrong. Re-run until every shot is clear and attractive. (`--at=0.3` / `--at=0.9` shows
   earlier/later moments of each shot.)
5. **Produce.** `npm run produce -- <slug>` (run in the background; a 10-minute video takes roughly
   30–60 minutes on this machine). It prints the exact running time after narration is generated — if it is
   outside 8:00–10:00, stop it, lengthen or trim the script, and run again (finished narration clips and
   rendered segments are cached, so re-runs only redo what changed).
6. **Quality check.** Pull a few frames from the final MP4 with ffmpeg (`node_modules/ffmpeg-static/ffmpeg.exe`)
   and look at them; confirm duration, that captions and overlays read well, and nothing is broken.
7. **Deliver.** Tell the user where the files are: `projects/<slug>/output/` → `<slug>.mp4`, `thumbnail.jpg`,
   `subtitles.srt`, `youtube.txt` (title, description with chapter timestamps, tags).

Commands: `npm run catalog` · `npm run validate -- <slug>` · `npm run stills -- <slug>` ·
`npm run produce -- <slug> [--workers=3] [--no-captions]` · `node pipeline/dev.js <scene>` (scene development).

## Writing the script

- **Length:** 1,300–1,500 spoken words for 8–10 minutes (the default voice runs ≈ 155 words/min including pauses).
- **Hook (first 15 s):** open on the most surprising fact, number or question — no greetings, no "in this video".
  Then promise what the viewer will understand by the end.
- **Structure:** hook → 4–6 chapters, each answering one question and ending on a line that pulls into the
  next → conclusion that pays off the hook, plus one closing line inviting the viewer to subscribe.
- **Write for the ear:** short sentences, concrete nouns, one idea per sentence. Spell numbers the way they
  are spoken ("four point three trillion dollars", "twenty twenty-three"). Avoid abbreviations the voice
  may misread; if a word is mispronounced, add a `say` field with a phonetic spelling (captions still use
  `narration`).
- **Accuracy:** only state facts that are in `research.md`. Date anything time-sensitive ("as of November 2026").
- One shot's narration = one or two sentences, 10–28 words (≈ 4–10 seconds).

## Directing the visuals

For every shot decide: what is being said → what should the viewer see → which scene explains it best →
which camera move → how long (from the narration) → how it hands over to the next shot.

- **Visual change every 4–10 seconds**, always motivated by the narration.
- Stay in one scene for up to ~25 s by chaining shots with `"continues": true` and a new camera framing
  (wide → close → detail) or a changed param (e.g. `explode`, `highlight`, `active`), then move on.
- **Variety:** use many different scenes across the video; no single scene in more than ~15 % of shots;
  never the same scene + framing twice in a row; alternate wide establishing shots and close-ups.
- **Data shots** (charts, comparisons) must use the real figures from research, with a `source` overlay.
- **Chapter starts:** a short shot on a `backdrop` scene with a `chapter` overlay, transition `dip`.
- **Overlays** add information (a name, a number, a label on a part) — they never repeat the captions.
  At most one or two overlays at once. Captions occupy the bottom ~18 % of the frame; keep overlays above.
- **Transitions:** default is a 0.5 s crossfade; `cut` inside continued scenes; `dip` at chapter boundaries;
  `zoom`, `wipe`, `push` sparingly (about one per chapter) for emphasis.
- Use narration cues (`"at": "@word"`) so numbers and labels appear exactly when they are spoken.
- No real company logos or trademarked artwork; refer to companies by name in text only.

## video.json

```jsonc
{
  "meta": {
    "title": "How NVIDIA Took Over AI",            // YouTube title (≤ 70 chars)
    "slug": "nvidia-ai",
    "theme": "silicon",                            // tech | silicon | finance | ai | amber  (engine/core/theme.js)
    "description": "Two or three sentences for the YouTube description.",
    "tags": ["nvidia", "ai chips"], "hashtags": ["NVIDIA", "AI"],
    "altTitles": ["…", "…"],
    "sources": ["NVIDIA Q3 FY2027 earnings release — https://…"],
    "voice": { "name": "en-US-AndrewMultilingualNeural", "rate": "+3%" },   // optional
    "music": { "mood": "inspiring", "volume": 0.3 },    // inspiring | serious | tense | hopeful
    "thumbnail": { "scene": "chip", "params": { "label": "AI", "explode": true }, "camera": { "from": "hero", "to": "hero" },
                   "text": "The $4 trillion chip", "highlight": "$4", "kicker": "Explained", "side": "left" }
  },
  "chapters": [
    { "title": "The hook",                         // becomes a YouTube chapter (needs ≥ 3 chapters, each ≥ 10 s)
      "energy": 0.5,                               // optional 0..1 music intensity for this chapter
      "shots": [
        { "narration": "Text the voice speaks during this shot.",
          "scene": "chip",                         // template name from docs/SCENES.md
          "params": { "label": "GPU" },            // template params
          "camera": { "from": "wide", "to": "hero", "orbit": 15 },
          "overlays": [ { "type": "stat", "value": 4.3, "decimals": 1, "prefix": "$", "suffix": "T", "label": "Market value", "at": "@trillion" } ],
          "transition": "fade" },
        { "narration": "Next sentence, same scene, new angle.", "scene": "chip", "continues": true,
          "params": { "label": "GPU", "explode": true }, "camera": { "from": "hero", "to": "die" } }
      ] }
  ]
}
```

Shot fields: `narration` · `say` (TTS-only respelling) · `scene` · `params` · `camera` · `overlays` ·
`transition` (`"cut"|"fade"|"dip"|"wipe"|"zoom"|"push"` or `{type, dur}`) · `continues` (reuse the previous
shot's scene instance; scene time keeps running; params tween) · `duration` (seconds, only for shots without
narration) · `cues` (`{ name: time }` passed to the scene — see each scene's cue names) · `look`
(`{ bloom, exposure, vignette, saturation }`) · `captions: false`.

**Times** (`at`, `until`, cue values) accept seconds (`1.5`), a percentage of the shot (`"40%"`), or a narration
word (`"@trillion"` = the moment that word starts). `hold` = seconds on screen (default: until the shot ends).

**Camera:** `{ "from": "<framing>", "to": "<framing>", "orbit": degrees, "push": 0..0.3, "rise": degrees,
"ease": "drift"|"linear"|"inOutCubic"|"outCubic" }` or just `"<framing>"`. Framing names are per scene
(listed in `docs/SCENES.md`). The camera always moves a little; never leave a shot static.

**Overlays** (`engine/core/hud.js`):

| type | fields | use |
|---|---|---|
| `title` | `text`, `sub`, `kicker`, `align` (`left`/`center`), `size`, `y` | opening title, section statements |
| `chapter` | `index`, `title`, `kicker` | chapter cards (on a `backdrop` scene) |
| `stat` | `value` (number counts up, or string), `from`, `decimals`, `prefix`, `suffix`, `compact`, `label`, `sub`, `pos` (`left`/`right`/`center`/`top-left`/`top-right`) | one big number |
| `callout` | `anchor` (scene anchor name) or `world: [x,y,z]`, `text`, `sub`, `dir` (`left`/`right`/`down-left`/`down-right`) | label a part of a 3D object |
| `lower` | `text`, `sub` | lower-third: a name, a date, a place |
| `bullets` | `title`, `items[]`, `pos`, `times[]` | short list revealed item by item |
| `quote` | `text`, `by` | a quotation |
| `tag` | `text`, `pos` (`top-left`/`top-right`) | small context pill (a year, "Estimate") |
| `source` | `text` | data attribution, top-right |

## Adding a scene

A scene template is one file in `engine/scenes/<name>.js` (auto-discovered) exporting
`{ name, description, params, sample, framings, defaultCamera, look, build(ctx, p) }`; `build` returns
`{ scene, update(f), labels?(f), anchors }`. Read `engine/scenes/chip.js` and `engine/core/kit.js` first.
Rules: `update(f)` is a pure function of time (`f.t` scene time, `f.shotT` shot time, `f.tw(key, default)`
tweens a param between continued shots); no `Math.random`; colours from `ctx.theme`; text via `labels()`
or `kit.textPlane`; use `createBase` + `addFloor` + `addDust` for the house look; nothing blown out to white.
Develop with `node pipeline/dev.js <name> --scale=0.5 --cam=wide:hero --times=1,4,7` and look at the PNGs in
`.cache/dev/`. Run `npm run catalog` afterwards.

## Environment notes

- Windows; the project path contains a space and an apostrophe — always pass paths as separate arguments
  (never interpolate them into shell strings or ffmpeg filter strings).
- The C: drive is nearly full. Keep everything (npm cache, Chrome profiles, temp files) on D: inside this
  project; `.npmrc` and `pipeline/paths.js` already do this. Do not install tools globally.
- Rendering uses the installed Google Chrome with the NVIDIA GPU (Quadro T1000, 4 GB). `--workers=3` is the
  tested setting; lower it if Chrome crashes.
- Narration uses Microsoft Edge neural voices over the network (`msedge-tts`); it needs internet access.
- Blender is not installed and not required. Everything is Three.js + FFmpeg.
