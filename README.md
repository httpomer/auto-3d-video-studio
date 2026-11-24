# Automated 3D Video Studio

Give Claude Code one instruction and get back a finished, narrated, 3D-animated YouTube video.

## Daily use

Open this folder in Claude Code and type, for example:

> Create an 8–10 minute YouTube video about how NVIDIA is changing the AI industry.

Claude researches the topic, writes the script, directs every shot, generates the 3D animation, narration,
music and captions, renders the video and writes the YouTube metadata. When it finishes you will find:

```
projects/<video-name>/output/
  <video-name>.mp4     the finished 1080p video
  thumbnail.jpg        1280×720 YouTube thumbnail
  subtitles.srt        captions file to upload to YouTube
  youtube.txt          title, description with chapter timestamps, tags
```

A 10-minute video takes roughly 45–75 minutes end to end on this computer, most of it unattended rendering.

## Things you can ask for

- A different look: "use the finance theme" (themes: tech, silicon, finance, ai, amber).
- A different narrator: "use a British male voice" / "use a female voice" (any Microsoft Edge neural voice).
- Your own music: put `music.mp3` in the project folder before producing; otherwise a score is generated.
- No burned-in captions: "produce without captions" (the .srt file is still created).
- Changes to a finished video: "shorten chapter 3", "replace the chart in the money chapter" — only the
  changed parts are re-rendered.
- New kinds of 3D scenes: "add a scene template for a rocket launch" — it becomes part of the library.

## What is inside

- `engine/` — the 3D engine (Three.js): 20+ reusable scene templates, camera system, on-screen graphics.
- `pipeline/` — narration, music, rendering (headless Chrome on the GPU), mixing and assembly (FFmpeg).
- `projects/` — one folder per video: research notes, the script/storyboard (`video.json`), outputs.
- `docs/SCENES.md` — reference of every scene template.
- `CLAUDE.md` — the production rules Claude follows.

Requirements already in place: Node.js, Google Chrome, an NVIDIA GPU, internet access for narration.
