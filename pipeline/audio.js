// Soundtrack: narration placed on the timeline + generated music (ducked under
// the voice) + transition sound design, mastered to YouTube loudness (-14 LUFS).
import fs from 'node:fs';
import path from 'node:path';
import { SR, readF32, writeWav, runFF, decodeToMono } from './audio-util.js';
import { generateMusic, generateSfx } from './music.js';
import { ensureDir } from './paths.js';

export async function buildSoundtrack(video, tl, voice, projDir, buildDir, { log = console.log } = {}) {
  const dir = ensureDir(path.join(buildDir, 'audio'));
  const n = Math.ceil((tl.duration + 0.5) * SR);

  // 1) narration track
  const V = new Float32Array(n);
  for (const c of tl.narration) {
    const pcm = readF32(voice[c.id].file);
    const o = Math.round(c.at * SR);
    for (let i = 0; i < pcm.length && o + i < n; i++) V[o + i] += pcm[i];
  }
  writeWav(path.join(dir, 'voice.wav'), [V]);

  // 2) music (own file if provided, otherwise generated to match the chapter structure)
  const audioCfg = video.meta?.music || {};
  const custom = ['music.mp3', 'music.wav', 'music.m4a'].map((f) => path.join(projDir, f)).find((f) => fs.existsSync(f));
  if (custom) {
    log(`  music: using ${path.basename(custom)}`);
    const m = await decodeToMono(custom);
    const M = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; M[i] = m[i % m.length] * Math.min(1, t / 2) * Math.min(1, Math.max(0, (tl.duration - t) / 3.5)); }
    writeWav(path.join(dir, 'music.wav'), [M, M]);
  } else {
    const chapters = tl.chapters.filter((c) => c.start != null);
    const defaults = [0.5, 0.62, 0.72, 0.8, 0.7, 0.85, 0.75, 0.9];
    const src = video.chapters || [];
    const sections = chapters.map((c, i) => ({ start: c.start, energy: src[i]?.energy ?? defaults[Math.min(i, defaults.length - 1)] }));
    if (sections.length) sections[sections.length - 1].energy = Math.max(sections[sections.length - 1].energy, 0.8);
    log(`  music: generating "${audioCfg.mood || 'inspiring'}" score, ${sections.length} sections`);
    writeWav(path.join(dir, 'music.wav'), generateMusic(tl.duration, { mood: audioCfg.mood, seed: audioCfg.seed, sections }));
  }

  // 3) sound design
  const events = [];
  tl.shots.forEach((s, i) => {
    if (i === 0) return;
    const chapterStart = tl.shots[i - 1].chapter !== s.chapter;
    if (chapterStart) events.push({ t: s.start, type: 'impact' });
    if (s.transition.type !== 'cut' && (chapterStart || ['wipe', 'zoom', 'push', 'dip'].includes(s.transition.type))) events.push({ t: s.start, type: 'whoosh' });
  });
  writeWav(path.join(dir, 'sfx.wav'), generateSfx(tl.duration, audioCfg.sfx === false ? [] : events));

  // 4) mix + master (two-pass loudness normalisation)
  const musicVol = audioCfg.volume ?? 0.34;
  const graph = (tail) => [
    `[0:a]highpass=f=75,acompressor=threshold=-20dB:ratio=2.5:attack=6:release=140:makeup=2.5,equalizer=f=3200:t=q:w=1.2:g=1.5,asplit=2[v][sc]`,
    `[1:a]volume=${musicVol}[m]`,
    `[m][sc]sidechaincompress=threshold=0.05:ratio=3:attack=40:release=800[md]`,
    `[2:a]volume=0.8[fx]`,
    `[v][md][fx]amix=inputs=3:normalize=0,${tail}`,
  ].join(';');
  const inputs = ['-i', 'voice.wav', '-i', 'music.wav', '-i', 'sfx.wav'];
  const target = 'I=-14:TP=-1.5:LRA=11';
  const pass1 = await runFF([...inputs, '-filter_complex', graph(`loudnorm=${target}:print_format=json[out]`), '-map', '[out]', '-f', 'null', '-'], { cwd: dir });
  const jm = pass1.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  let tail = `loudnorm=${target}`;
  if (jm) {
    const j = JSON.parse(jm[0]);
    tail = `loudnorm=${target}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
    log(`  mix: measured ${j.input_i} LUFS → normalised to -14 LUFS`);
  }
  await runFF([...inputs, '-filter_complex', graph(`${tail},alimiter=limit=0.89,aresample=${SR}[out]`), '-map', '[out]', '-ac', '2', '-c:a', 'pcm_s16le', 'mix.wav'], { cwd: dir });
  return path.join(dir, 'mix.wav');
}
