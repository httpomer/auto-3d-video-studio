# Automated 3D Video Studio

Give Claude Code one instruction and get back a finished, narrated, 3D-animated YouTube video.

> Create an 8–10 minute YouTube video about how NVIDIA is changing the AI industry.

Claude researches the topic, writes the script, directs every shot, then renders the 3D animation
and produces the narration, music and captions. It assembles the video and writes the YouTube title,
description and tags. You don't edit any timeline yourself.

## Setup (once per computer)

You need:

| What | Why | Get it |
|---|---|---|
| **Node.js 20 or newer** | runs the pipeline | https://nodejs.org (LTS installer) |
| **Google Chrome** (or Microsoft Edge) | renders the 3D frames on your graphics card | https://www.google.com/chrome |
| **Claude Code** | writes and directs the videos | https://claude.com/claude-code |
| **Git** | to download this project | https://git-scm.com |
| Internet connection | research and narration voice | — |

A dedicated graphics card (NVIDIA or AMD) renders much faster. Integrated graphics also work,
just slower. Plan on about 10 GB of free disk space per video while it renders.

Then, in a terminal:

```bash
git clone https://github.com/httpomer/auto-3d-video-studio.git
cd auto-3d-video-studio
npm install
```

`npm install` also downloads FFmpeg automatically; nothing else needs installing.

**Check that it works** by rendering a 16-second test video (takes 2–5 minutes):

```bash
npm run produce -- pilot
```

When it says `DONE`, open `projects/pilot/output/pilot.mp4`. If the picture and voice are there, you're ready.

If Chrome is installed somewhere unusual, set the `CHROME_PATH` environment variable to the Chrome executable.

## Making a video

Open the project folder in Claude Code and ask for a video:

> Create an 8–10 minute YouTube video about [your topic].

When it finishes you get:

```
projects/<video-name>/output/
  <video-name>.mp4     the finished 1080p video
  thumbnail.jpg        1280×720 YouTube thumbnail
  subtitles.srt        captions file to upload to YouTube
  youtube.txt          title, description with chapter timestamps, sources, tags
```

A 10-minute video takes roughly 30–75 minutes end to end, mostly unattended rendering.
Speed depends on your graphics card.

## Things you can ask for

- **A different look:** "use the finance theme". Themes: `tech`, `silicon`, `finance`, `ai`, `amber`.
- **A different narrator:** "use a British female voice" (any Microsoft Edge neural voice).
- **Your own music:** put `music.mp3` in the video's project folder before producing; otherwise a score is generated.
- **No burned-in captions:** "produce it without captions" (the `.srt` file is still created).
- **Changes to a finished video:** "shorten chapter 3", "use a chart instead of the globe in the money
  chapter". Only the changed parts are re-rendered.
- **New kinds of 3D scenes:** "add a scene template for a rocket launch". It becomes part of the library
  for every future video.

## What's inside

- `engine/` — the 3D engine (Three.js): 22 reusable scene templates (chips, GPUs, data centers, neural
  networks, charts, globes, city skylines …), camera system, on-screen graphics.
- `pipeline/` — narration, music, rendering in headless Chrome on the GPU, mixing and assembly (FFmpeg).
- `projects/` — one folder per video: research notes and the script/storyboard (`video.json`).
  `nvidia-ai` is a complete example.
- `docs/SCENES.md` — reference of every scene template.
- `CLAUDE.md` — the production rules Claude follows.

Rendered videos, thumbnails and build files stay on your computer; they are not part of the repository.

## Manual commands

Claude runs these for you, but they also work by hand:

```bash
npm run validate -- <video-name>   # check a storyboard
npm run stills   -- <video-name>   # contact sheets of every shot, for review
npm run produce  -- <video-name>   # full production
npm run catalog                    # rebuild docs/SCENES.md after adding scenes
node pipeline/dev.js chip          # preview a single scene template
```

## Troubleshooting

- **Chrome crashes or runs out of memory while rendering:** use fewer parallel workers:
  `npm run produce -- <video-name> --workers=2` (or `1`).
- **Narration keeps retrying:** the voice service rate-limits occasionally. Finished clips are cached,
  so just run the same command again.
- **A render stopped halfway:** run the same command again. Finished parts are reused.
