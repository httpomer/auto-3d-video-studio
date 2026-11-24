// Small audio helpers: decode via ffmpeg, write WAV, run ffmpeg.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { FFMPEG } from './paths.js';

export const SR = 48000;

export function runFF(args, { cwd, input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-y', ...args], { cwd, windowsHide: true });
    const out = [], err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => {
      const stderr = Buffer.concat(err).toString();
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-1500)}`));
      else resolve({ stdout: Buffer.concat(out), stderr });
    });
    if (input) p.stdin.end(input);
  });
}

export async function decodeToMono(file) {
  const { stdout } = await runFF(['-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), 'pipe:1']);
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4)).slice();
}

export function readF32(file) {
  const b = fs.readFileSync(file);
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4)).slice();
}

/** Write 16-bit PCM WAV. `channels` = array of Float32Arrays (1 or 2). */
export function writeWav(file, channels, sr = SR) {
  const n = channels[0].length, ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, channels[c][i]));
    buf.writeInt16LE(Math.round(v * 32767), o); o += 2;
  }
  fs.writeFileSync(file, buf);
}
