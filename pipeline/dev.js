// Scene development tool: render PNG stills of a single scene template.
//   node pipeline/dev.js <scene> [--params=file.json|inline-json] [--cam=from:to] [--times=1,4,7]
//                        [--dur=8] [--theme=tech] [--overlays=file.json] [--out=dir] [--scale=0.5]
// With no --params the template's own `sample` params are used.
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './server.js';
import { openEngine } from './browser.js';
import { buildTimeline } from './timeline.js';
import { CACHE, ensureDir } from './paths.js';

const args = process.argv.slice(2);
const scene = args.find((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]; }));
if (!scene) { console.error('usage: node pipeline/dev.js <scene> [--params=...] [--cam=from:to] [--times=1,4,7] [--dur=8] [--theme=tech]'); process.exit(1); }

const readJson = (v) => (v == null ? undefined : fs.existsSync(v) ? JSON.parse(fs.readFileSync(v, 'utf8')) : JSON.parse(v));
const scale = parseFloat(opt.scale ?? '1');
const width = Math.round(1920 * scale), height = Math.round(1080 * scale);
const dur = parseFloat(opt.dur ?? '8');
const times = String(opt.times ?? `${dur * 0.15},${dur * 0.5},${dur * 0.9}`).split(',').map(Number);
const outDir = ensureDir(path.resolve(opt.out ?? path.join(CACHE, 'dev')));

const srv = await startServer();
const eng = await openEngine(srv.port, { width, height, id: 'dev' + process.pid });
try {
  const catalog = await eng.page.evaluate(() => window.__catalog());
  const tpl = catalog.find((c) => c.name === scene);
  if (!tpl) throw new Error(`Unknown scene "${scene}". Available: ${catalog.map((c) => c.name).join(', ')}`);
  let camera;
  if (opt.cam) { const [from, to] = String(opt.cam).split(':'); camera = { from, to: to || from }; if (opt.orbit) camera.orbit = parseFloat(opt.orbit); }
  const shot = { id: 'dev', scene, params: readJson(opt.params) ?? tpl.sample, camera, overlays: readJson(opt.overlays) ?? [], duration: dur };
  const tl = buildTimeline({ meta: { theme: opt.theme ?? 'tech' }, shots: [shot] }, {}, { width, height });
  tl.noFade = true;
  const info = await eng.page.evaluate((p) => window.__init(p), tl);
  console.log('GPU:', info.gpu, '| framings:', tpl.framings.join(', '));
  for (const t of times) {
    const t0 = Date.now();
    const b64 = await eng.page.evaluate((T) => window.__renderTime(T, 'image/png', 1, false), t);
    const file = path.join(outDir, `${scene}${opt.tag ? '-' + opt.tag : ''}-t${t.toFixed(1)}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(`t=${t.toFixed(2)}s → ${file} (${Date.now() - t0} ms)`);
  }
  if (eng.errors.length) console.log('PAGE MESSAGES:\n' + [...new Set(eng.errors)].slice(0, 20).join('\n'));
} catch (e) {
  console.error('FAILED:', e.message);
  if (eng.errors.length) console.error('PAGE MESSAGES:\n' + [...new Set(eng.errors)].slice(0, 20).join('\n'));
  process.exitCode = 1;
} finally {
  await eng.close(); await srv.close();
  try { fs.rmSync(path.join(CACHE, 'chrome', 'wdev' + process.pid), { recursive: true, force: true }); } catch {}
}
