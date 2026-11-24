import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FFMPEG = require('ffmpeg-static');
export const FFPROBE = require('ffprobe-static').path;
export const CACHE = path.join(ROOT, '.cache');

export function findChrome() {
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  for (const p of c) if (fs.existsSync(p)) return p;
  throw new Error('Chrome/Edge not found. Set CHROME_PATH.');
}

export const projectDir = (slug) => path.join(ROOT, 'projects', slug);
export const ensureDir = (d) => { fs.mkdirSync(d, { recursive: true }); return d; };
