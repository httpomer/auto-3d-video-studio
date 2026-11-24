// Narration: one neural-voice clip per shot, with word timings.
// Clips are cached by content hash, so re-runs only synthesise changed lines.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { decodeToMono, SR } from './audio-util.js';
import { ensureDir } from './paths.js';
import { flattenShots } from './timeline.js';

export const DEFAULT_VOICE = { provider: 'edge', name: 'en-US-AndrewMultilingualNeural', rate: '+3%', pitch: '+0Hz' };

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function synthEdge(text, voice, mp3Path) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice.name, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  const { audioStream, metadataStream } = tts.toStream(xml(text), { rate: voice.rate ?? '+0%', pitch: voice.pitch ?? '+0Hz' });
  const chunks = [], words = [];
  await new Promise((resolve, reject) => {
    metadataStream?.on('data', (d) => {
      try {
        for (const m of JSON.parse(d.toString()).Metadata || []) {
          if (m.Type === 'WordBoundary') words.push({ t: m.Data.Offset / 1e7, d: m.Data.Duration / 1e7, w: m.Data.text.Text });
        }
      } catch {}
    });
    audioStream.on('data', (d) => chunks.push(d));
    audioStream.on('error', reject);
    audioStream.on('end', resolve);
    audioStream.on('close', () => setTimeout(resolve, 50));
    setTimeout(() => reject(new Error('TTS timeout')), 90000).unref();
  });
  try { tts.close(); } catch {}
  const buf = Buffer.concat(chunks);
  if (buf.length < 800) throw new Error('TTS returned no audio');
  fs.writeFileSync(mp3Path, buf);
  return words;
}

/** Trim leading/trailing silence, return samples + adjusted word times. */
function trim(pcm, words) {
  const th = 0.006, keep = Math.round(0.03 * SR);
  let a = 0, b = pcm.length - 1;
  while (a < pcm.length && Math.abs(pcm[a]) < th) a++;
  while (b > a && Math.abs(pcm[b]) < th) b--;
  a = Math.max(0, a - keep); b = Math.min(pcm.length - 1, b + keep * 3);
  const off = a / SR;
  return { pcm: pcm.subarray(a, b + 1), words: words.map((w) => ({ ...w, t: Math.max(0, w.t - off) })) };
}

/**
 * Synthesise narration for every shot. Returns { [shotId]: { dur, words, file } }.
 * PCM (Float32 mono 48k) is stored next to the mp3 as .f32 for the mixer.
 */
export async function synthesizeNarration(video, projDir, { log = console.log } = {}) {
  const voice = { ...DEFAULT_VOICE, ...(video.meta?.voice || {}) };
  const dir = ensureDir(path.join(projDir, 'audio', 'voice'));
  const { shots } = flattenShots(video);
  const jobs = shots.filter((s) => s.narration && s.narration.trim());
  const result = {};
  let done = 0, synthesized = 0;
  const worker = async (s) => {
    const text = (s.say || s.narration).trim();
    const hash = crypto.createHash('sha1').update(JSON.stringify([text, voice])).digest('hex').slice(0, 12);
    const base = path.join(dir, hash);
    if (!(fs.existsSync(base + '.json') && fs.existsSync(base + '.f32'))) {
      let words, lastErr;
      for (let attempt = 0; attempt < 8; attempt++) {
        try { words = await synthEdge(text, voice, base + '.mp3'); lastErr = null; break; }
        catch (e) { lastErr = e; log(`  (retrying ${s.id}: ${String(e.message).slice(0, 80)})`); await new Promise((r) => setTimeout(r, 2500 * (attempt + 1) + Math.floor(Math.random() * 1500))); }
      }
      if (lastErr) throw new Error(`Narration failed for shot ${s.id}: ${lastErr.message}`);
      const t = trim(await decodeToMono(base + '.mp3'), words);
      fs.writeFileSync(base + '.f32', Buffer.from(t.pcm.buffer, t.pcm.byteOffset, t.pcm.byteLength));
      fs.writeFileSync(base + '.json', JSON.stringify({ text, voice, dur: t.pcm.length / SR, words: t.words }));
      synthesized++;
    }
    const info = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
    result[s.id] = { dur: info.dur, words: info.words, file: base + '.f32' };
    done++;
    if (done % 10 === 0 || done === jobs.length) log(`  narration ${done}/${jobs.length}`);
  };
  const queue = [...jobs];
  let failed = null;
  await Promise.all(Array.from({ length: 2 }, async () => { while (queue.length && !failed) { try { await worker(queue.shift()); } catch (e) { failed = failed || e; } } }));
  if (failed) throw failed;
  const total = Object.values(result).reduce((a, r) => a + r.dur, 0);
  log(`  voice: ${voice.name} | ${jobs.length} clips (${synthesized} new) | ${total.toFixed(1)} s of speech`);
  return result;
}
