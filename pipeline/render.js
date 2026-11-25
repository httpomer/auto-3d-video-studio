// Frame renderer: several headless-Chrome workers render frame ranges of the
// timeline in parallel; each range is encoded to an H.264 segment, then the
// segments are joined losslessly. Finished segments are cached, so an
// interrupted or edited render only redoes what changed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { startServer } from './server.js';
import { openEngine } from './browser.js';
import { runFF } from './audio-util.js';
import { FFMPEG, ROOT, ensureDir } from './paths.js';

const SEG_FRAMES = 240;

// Cache keys depend on file CONTENT: the shared engine (core + player) plus only
// the scene templates a segment actually uses — editing one scene re-renders only its segments.
const fileHash = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
export function engineHash() {
  const h = crypto.createHash('sha1');
  const core = path.join(ROOT, 'engine', 'core');
  for (const f of fs.readdirSync(core).sort()) h.update(f + fileHash(path.join(core, f)));
  for (const f of ['main.js', 'index.html']) h.update(f + fileHash(path.join(ROOT, 'engine', f)));
  return h.digest('hex');
}
const sceneHashes = new Map();
function sceneHash(name) {
  if (!sceneHashes.has(name)) sceneHashes.set(name, fileHash(path.join(ROOT, 'engine', 'scenes', name + '.js')));
  return sceneHashes.get(name);
}

export function segmentHash(tl, a, b, eh, enc) {
  const t0 = a / tl.fps - 1.5, t1 = b / tl.fps + 1.5;
  const shots = tl.shots.filter((s) => s.start < t1 && s.start + s.dur > t0);
  // include the first shot of every scene instance in range (it holds the build params)
  const firsts = [...new Set(shots.map((s) => s.instanceFirst))].map((i) => tl.shots[i]);
  const caps = tl.captions.filter((c) => c.start < t1 && c.end > t0);
  const scenes = [...new Set(shots.map((s) => s.scene))].sort().map((n) => n + sceneHash(n));
  return crypto.createHash('sha1').update(JSON.stringify([eh, scenes, enc, tl.width, tl.height, tl.fps, tl.theme, tl.themeOverrides, tl.look, tl.duration, a, b, shots, firsts, caps])).digest('hex').slice(0, 16);
}

function encoder(file, tl, { crf }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(tl.fps), '-i', 'pipe:0',
    '-vf', 'scale=in_color_matrix=bt601:in_range=full:out_color_matrix=bt709:out_range=limited,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-g', String(tl.fps * 2), '-bf', '2',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-an', file];
  const p = spawn(FFMPEG, args, { windowsHide: true });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  const done = new Promise((resolve, reject) => { p.on('error', reject); p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('encoder failed: ' + err.slice(-600))))); });
  done.catch(() => {}); // a killed encoder (during a retry) must not crash the process
  let pipeErr = null;
  p.stdin.on('error', (e) => { pipeErr = e; });
  const write = (buf) => new Promise((resolve, reject) => { if (pipeErr) return reject(pipeErr); if (p.stdin.write(buf)) resolve(); else p.stdin.once('drain', resolve); });
  return { write, finish: () => { p.stdin.end(); return done; }, kill: () => { try { p.kill(); } catch {} } };
}

export async function renderVideo(tl, outFile, buildDir, { workers = 3, jpegQuality = 0.95, crf = 16, log = console.log } = {}) {
  const segDir = ensureDir(path.join(buildDir, 'segments'));
  const eh = engineHash();
  const enc = { jpegQuality, crf };
  const segs = [];
  for (let a = 0; a < tl.totalFrames; a += SEG_FRAMES) {
    const b = Math.min(tl.totalFrames, a + SEG_FRAMES);
    const hash = segmentHash(tl, a, b, eh, enc);
    segs.push({ a, b, file: path.join(segDir, `seg_${String(a).padStart(6, '0')}_${hash}.mp4`), name: `seg_${String(a).padStart(6, '0')}_${hash}.mp4` });
  }
  // drop stale segments
  const keep = new Set(segs.map((s) => s.name));
  for (const f of fs.readdirSync(segDir)) if (!keep.has(f)) fs.rmSync(path.join(segDir, f), { force: true });
  const pending = segs.filter((s) => !fs.existsSync(s.file));
  const totalPending = pending.reduce((n, s) => n + (s.b - s.a), 0);
  log(`  ${tl.totalFrames} frames (${tl.duration.toFixed(1)} s) in ${segs.length} segments — ${segs.length - pending.length} cached, ${pending.length} to render`);

  if (pending.length) {
    const srv = await startServer();
    let rendered = 0, lastLog = 0;
    const t0 = Date.now();
    const progress = () => {
      const now = Date.now();
      if (now - lastLog < 20000 && rendered < totalPending) return;
      lastLog = now;
      const fps = rendered / ((now - t0) / 1000);
      const eta = (totalPending - rendered) / Math.max(fps, 0.01);
      log(`  rendered ${rendered}/${totalPending} frames (${((rendered / totalPending) * 100).toFixed(0)}%) — ${fps.toFixed(1)} fps — ETA ${Math.ceil(eta / 60)} min`);
    };
    const queue = [...pending];
    const n = Math.max(1, Math.min(workers, pending.length));
    const runWorker = async (id) => {
      let eng = null;
      const open = async () => {
        eng = await openEngine(srv.port, { width: tl.width, height: tl.height, id });
        const info = await eng.page.evaluate((p) => window.__init(p), tl);
        if (id === 0) log(`  GPU: ${info.gpu}`);
      };
      try {
        await open();
        while (queue.length) {
          const seg = queue.shift();
          let attempt = 0;
          for (;;) {
            const tmp = seg.file + '.part.mp4';
            const e = encoder(tmp, tl, enc);
            let count = 0;
            try {
              for (let f = seg.a; f < seg.b; f++) {
                const b64 = await eng.page.evaluate((fr, q) => window.__renderFrame(fr, 'image/jpeg', q), f, jpegQuality);
                await e.write(Buffer.from(b64, 'base64'));
                count++; rendered++; progress();
              }
              await e.finish();
              fs.renameSync(tmp, seg.file);
              break;
            } catch (err) {
              e.kill(); rendered -= count;
              if (++attempt > 2) throw new Error(`Segment at frame ${seg.a} failed: ${err.message}\n${eng.errors.slice(-5).join('\n')}`);
              log(`  worker ${id}: retrying segment @${seg.a} (${String(err.message).slice(0, 120)})`);
              try { await eng.close(); } catch {}
              await open();
            }
          }
        }
      } finally { try { await eng?.close(); } catch {} }
    };
    try { await Promise.all(Array.from({ length: n }, (_, i) => runWorker(i))); }
    finally { await srv.close(); }
    log(`  frames done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  }

  // lossless join (relative names + cwd avoid quoting problems in the list file)
  fs.writeFileSync(path.join(segDir, 'list.txt'), segs.map((s) => `file '${s.name}'`).join('\n'));
  await runFF(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', '-movflags', '+faststart', path.resolve(outFile)], { cwd: segDir });
  return outFile;
}

/** Render one representative still per shot (for storyboard review) + contact sheets. */
export async function renderStills(tl, outDir, { scale = 0.5, at = 0.6, log = console.log, cols = 4, perSheet = tl.width > tl.height ? 16 : 12, only = null } = {}) {
  ensureDir(outDir);
  if (only) return renderShotDetail(tl, outDir, only, { scale, log });
  for (const f of fs.readdirSync(outDir)) if (/^(sheet|shot)_/.test(f)) fs.rmSync(path.join(outDir, f), { force: true });
  const small = { ...tl, width: Math.round(tl.width * scale), height: Math.round(tl.height * scale), noFade: true };
  const srv = await startServer();
  const eng = await openEngine(srv.port, { width: small.width, height: small.height, id: 'stills' });
  const files = [];
  try {
    await eng.page.evaluate((p) => window.__init(p), small);
    const thumbs = [];
    for (let i = 0; i < tl.shots.length; i++) {
      const s = tl.shots[i];
      const T = s.start + Math.min(s.dur * at, s.dur - 0.1);
      const b64 = await eng.page.evaluate((t) => window.__renderTime(t, 'image/jpeg', 0.9, true), T);
      const file = path.join(outDir, `shot_${String(i + 1).padStart(3, '0')}_${s.id}.jpg`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      thumbs.push({ b64, label: `${i + 1}. ${s.id} · ${s.scene} · ${s.dur.toFixed(1)}s @${fmtTime(s.start)}` });
    }
    for (let k = 0; k < thumbs.length; k += perSheet) {
      const part = thumbs.slice(k, k + perSheet);
      const b64 = await eng.page.evaluate(async (list, cols2, ratio) => {
        const items = Object.assign(list, { ratio });
        const r = items.ratio, tw = r > 1 ? 480 : 300, th = Math.round(tw / r), pad = 8, lab = 26;
        const rows = Math.ceil(items.length / cols2);
        const c = document.createElement('canvas'); c.width = cols2 * (tw + pad) + pad; c.height = rows * (th + lab + pad) + pad;
        const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < items.length; i++) {
          const img = new Image(); img.src = 'data:image/jpeg;base64,' + items[i].b64; await img.decode();
          const x = pad + (i % cols2) * (tw + pad), y = pad + Math.floor(i / cols2) * (th + lab + pad);
          g.drawImage(img, x, y, tw, th);
          g.fillStyle = '#ddd'; g.font = '15px Inter, sans-serif'; g.textBaseline = 'middle'; g.fillText(items[i].label, x + 2, y + th + lab / 2 + 1, tw - 4);
        }
        return c.toDataURL('image/jpeg', 0.88).split(',')[1];
      }, part, tl.width > tl.height ? cols : 6, tl.width / tl.height);
      const file = path.join(outDir, `sheet_${String(k / perSheet + 1).padStart(2, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      files.push(file);
    }
    if (eng.errors.length) log('  page messages:\n  ' + [...new Set(eng.errors)].slice(0, 12).join('\n  '));
  } finally { await eng.close(); await srv.close(); }
  log(`  ${tl.shots.length} stills → ${files.length} contact sheet(s) in ${outDir}`);
  return files;
}

export function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

/** Render a single PNG frame at full quality (used for the thumbnail). */
export async function renderFramePng(tl, T, outFile, { captions = false } = {}) {
  const srv = await startServer();
  const eng = await openEngine(srv.port, { width: tl.width, height: tl.height, id: 'thumb' });
  try {
    await eng.page.evaluate((p) => window.__init(p), { ...tl, noFade: true });
    const b64 = await eng.page.evaluate((t, c) => window.__renderTime(t, 'image/png', 1, c), T, captions);
    fs.writeFileSync(outFile, Buffer.from(b64, 'base64'));
  } finally { await eng.close(); await srv.close(); }
  return outFile;
}

/** Close look at specific shots (1-based numbers): three moments of each, side by side. */
async function renderShotDetail(tl, outDir, only, { scale = 0.5, log = console.log } = {}) {
  const small = { ...tl, width: Math.round(tl.width * scale), height: Math.round(tl.height * scale), noFade: true };
  const srv = await startServer();
  const eng = await openEngine(srv.port, { width: small.width, height: small.height, id: 'stills' });
  const files = [];
  try {
    await eng.page.evaluate((p) => window.__init(p), small);
    for (const n of only) {
      const s = tl.shots[n - 1]; if (!s) continue;
      const imgs = [];
      for (const k of [0.2, 0.6, 0.95]) imgs.push(await eng.page.evaluate((t) => window.__renderTime(t, 'image/jpeg', 0.92, true), s.start + Math.min(s.dur * k, s.dur - 0.05)));
      const b64 = await eng.page.evaluate(async (items) => {
        const first = new Image(); first.src = 'data:image/jpeg;base64,' + items[0]; await first.decode();
        const w = first.width, h = first.height, c = document.createElement('canvas'); c.width = w * items.length; c.height = h;
        const g = c.getContext('2d');
        for (let i = 0; i < items.length; i++) { const im = new Image(); im.src = 'data:image/jpeg;base64,' + items[i]; await im.decode(); g.drawImage(im, i * w, 0); }
        return c.toDataURL('image/jpeg', 0.9).split(',')[1];
      }, imgs);
      const file = path.join(outDir, `detail_${String(n).padStart(3, '0')}_${s.id}.jpg`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64')); files.push(file);
    }
    if (eng.errors.length) log('  page messages: ' + [...new Set(eng.errors)].slice(0, 12).join(' | '));
  } finally { await eng.close(); await srv.close(); }
  return files;
}
