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
    "thumbnail": { "scene": "chip", "params": { "label": "GPU", "explode": true }, "camera": { "from": "hero", "to": "hero" },
                   "kicker": "Explained", "text": "How NVIDIA / won AI", "highlight": "NVIDIA", "side": "left",
                   "callouts": [ { "anchor": "die", "text": "$115.8B in 3 months", "sub": "from chips like this one", "chip": [0.62, 0.1] } ] }
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

## Thumbnails (channel template)

The thumbnail decides whether anyone clicks. The owner wants thumbnails that stop the scroll — modelled on
high-CTR explainer channels — and rejected both glowing "AI-art" thumbnails and quiet, book-cover-style ones.
No channel name or logo on the thumbnail. Every video gets 3 variants for YouTube Studio → Test & Compare.

Template (fixed for every video, so the channel is recognisable):
- **One big subject** on one side (~50–60 % of the frame): a concrete, hard-surface object or a strong
  visual metaphor — these render convincingly in 3D. Proven: graphics card (`gpu_card`), red-lit server aisle
  (`datacenter` with `themeOverrides`), and the `props` scene: `chess` (giant AI king over a toppled human
  king — "Game over?"), `countdown` (red LED "365 DAYS"), `stop` (emergency STOP button — "Can we stop it?").
  The owner rejected the abstract eye (`ai_eye`, "looks like a black hole") and every version of the
  procedural `robot` — humanoid faces built from primitives look like a game/toy. Do not use them as
  thumbnail heroes. (A photoreal subject would need an image-generation service; none is available now.)
  The subject may bleed off the frame edge.
- **Background:** dark, out of focus (`look.dof`), with a little colour from the scene. Use `look.exposure`
  to lift dark objects.
- **2–4 giant words** on the other side (`text`, ` / ` forces a line break), white Inter Black with a thick
  black outline and hard shadow. The hook word in the hot colour (`highlight`, `hot`; red by default,
  or a colour tied to the topic, e.g. NVIDIA green). Optional small context line (`sub`), e.g.
  `"$115B"` + `"in 3 months"`.
- The text must **add** curiosity or emotion — a number, a question, a stake — not repeat the title.
  Keep it honest: questions are fine, false claims are not; numbers must come from `research.md`.
- Optional: a hand-drawn style arrow (`arrow: { to: { anchor } }`) or circle (`circle: { at, r }`) pointing
  at the detail the video explains; a sticker chip (`callouts: [{ text, chip: [fx, fy] }]`).
- **Variants:** `variants: [ {...}, {...} ]` override text / colour / graphics; they render as
  `thumbnail_b.jpg`, `thumbnail_c.jpg`. Make the three hooks genuinely different (a number, a question,
  a stake).

Composition: put the subject on the opposite side to the text with an explicit camera
`{ "from": {pos, target, fov}, "to": same }`; panning `target` toward the text side moves the subject away
from it, and moving `pos` back along the view direction makes it smaller. per-thumbnail `themeOverrides` (e.g. `{ "accent": "#ff2a2a" }`) recolour the scene.

Iterate with `npm run thumbnail -- <slug>` (renders all variants, ~1 min) and look at every variant, also
downscaled to phone size (~320 px wide): the words must still read and the subject must still be obvious.

## YouTube Shorts (vertical)

When the owner asks for a "short", make a 9:16 video instead of the 8–10 minute format:
- `meta.width: 1080, meta.height: 1920`; one chapter with `"title": null` (no chapters in the description);
  `#Shorts` in the title or hashtags. Target 40–60 s: 110–150 words, 8–10 shots, same research and accuracy rules.
- Portrait mode is automatic: the HUD uses a 1080-wide layout (overlays default to the upper third, centred),
  captions become big outlined words at ~65 % height with the spoken word lit (`themeOverrides.captionHot`),
  and the thumbnail is a 1080×1920 cover. Keep overlays in the top ~35 % — the Shorts UI covers the bottom ~25 %
  and the right edge.
- Scene framings are composed for 16:9. In portrait the camera pulls back so the frame's width covers what the
  landscape frame's height did; tune per shot with `camera.fit` (< 1 = tighter, > 1 = wider) or give explicit
  `{pos, target, fov}` framings. Always check the stills: wide subjects (charts, panels) often need `fit` ≥ 1.
- Scene `cues` go on the shot (`"cues": {...}`), never inside `params` — only shot-level cues are resolved.
- `node pipeline/dev.js <scene> --portrait --fit=0.8` previews a scene vertically.

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

This project runs on whoever's computer it is cloned to (Windows, macOS or Linux). Check the machine
before the first production rather than assuming:

- Setup is `npm install` (FFmpeg comes from the `ffmpeg-static` package). Chrome or Edge must be installed;
  `pipeline/paths.js` finds it, or set `CHROME_PATH`. If `node_modules` is missing, run `npm install` first.
- Quick health check: `npm run produce -- pilot` (16-second test video).
- Paths may contain spaces or apostrophes — always pass paths as separate arguments
  (never interpolate them into shell strings or ffmpeg filter strings).
- Keep all temporary files inside the project (`.cache/`, `projects/<slug>/build/`); do not install
  tools globally. If the system drive is short on space, the npm cache and Chrome profiles already
  live under the project via `.npmrc` and `pipeline/paths.js`.
- Rendering runs in headless Chrome on the GPU. `--workers=3` is the default; use 2 or 1 on machines
  with little GPU memory or if Chrome crashes. The first frames print the GPU in use — if it shows a
  software renderer (SwiftShader), rendering works but will be very slow; tell the user.
- Narration uses Microsoft Edge neural voices over the network (`msedge-tts`); it needs internet access.
- Blender is not required. Everything is Three.js + FFmpeg.
- Rendered media (`projects/*/output/`, `projects/*/build/`, `projects/*/audio/`) is git-ignored; only
  code, storyboards and research are committed.
