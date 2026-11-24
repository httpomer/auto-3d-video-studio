// Engine player. Loaded in headless Chrome by the render pipeline.
// Given a timeline (shots with start/duration/scene/camera/overlays), it can
// render ANY frame deterministically: window.__renderFrame(n) → JPEG base64.
import * as THREE from 'three';
import { Stage } from './core/stage.js';
import { Hud } from './core/hud.js';
import { getTheme } from './core/theme.js';
import { shotCameraSpec, applyCamera } from './core/camera.js';
import { disposeScene } from './core/kit.js';
import { hashStr, rng, clamp, ease, lerp } from './core/util.js';

const templates = {};
let P = null, stage = null, hud = null, theme = null, out = null, outCtx = null;
const instances = new Map();
let useCounter = 0;

async function loadFonts() {
  const F = (family, weight, file) => new FontFace(family, `url(/node_modules/@fontsource/${file})`, { weight: String(weight) });
  const faces = [
    ...[400, 500, 600, 700, 800, 900].map((w) => F('Inter', w, `inter/files/inter-latin-${w}-normal.woff2`)),
    ...[500, 600, 700].map((w) => F('Space Grotesk', w, `space-grotesk/files/space-grotesk-latin-${w}-normal.woff2`)),
    ...[500, 700].map((w) => F('JetBrains Mono', w, `jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff2`)),
  ];
  await Promise.all(faces.map(async (f) => { await f.load(); document.fonts.add(f); }));
}

async function loadTemplates() {
  const list = await (await fetch('/api/scenes')).json();
  await Promise.all(list.map(async (name) => { templates[name] = (await import(`./scenes/${name}.js`)).default; }));
}

window.__catalog = async () => {
  await loadTemplates();
  return Object.entries(templates).map(([name, t]) => ({
    name, description: t.description || '', params: t.params || {},
    framings: Object.keys(typeof t.framings === 'function' ? t.framings(t.sample || {}) : (t.framings || {})),
    sample: t.sample || {},
  }));
};

/** Framing names for specific params (framings can depend on params, e.g. timeline atN). */
window.__framings = (list) => list.map(([scene, params]) => {
  const t = templates[scene]; if (!t) return null;
  try { return Object.keys(typeof t.framings === 'function' ? t.framings(params || {}) : (t.framings || {})); } catch (e) { return { error: String(e) }; }
});

window.__init = async (project) => {
  await Promise.all([loadFonts(), loadTemplates()]);
  P = project;
  theme = getTheme(P.theme, P.themeOverrides || {});
  stage = new Stage({ width: P.width, height: P.height });
  hud = new Hud({ width: P.width, height: P.height, theme });
  out = document.createElement('canvas'); out.width = P.width; out.height = P.height;
  outCtx = out.getContext('2d', { alpha: false });
  document.body.appendChild(out);
  const missing = [...new Set(P.shots.map((s) => s.scene))].filter((n) => !templates[n]);
  if (missing.length) throw new Error('Unknown scene templates: ' + missing.join(', '));
  const gl = stage.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return { gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown', shots: P.shots.length };
};

function ensureInstance(shot) {
  let inst = instances.get(shot.instance);
  if (!inst) {
    const tpl = templates[shot.scene];
    const first = P.shots[shot.instanceFirst];
    const ctx = { THREE, stage, theme, rng: (s = 0) => rng(hashStr(shot.instance) + s), width: P.width, height: P.height, aspect: P.width / P.height };
    const api = tpl.build(ctx, first.params || {});
    inst = { tpl, api, camera: new THREE.PerspectiveCamera(35, P.width / P.height, 0.05, 800) };
    instances.set(shot.instance, inst);
    // keep memory bounded: evict least-recently-used scenes
    if (instances.size > 3) {
      let oldest = null;
      for (const [k, v] of instances) if (k !== shot.instance && (!oldest || v.used < oldest[1].used)) oldest = [k, v];
      if (oldest) { disposeScene(oldest[1].api.scene); oldest[1].api.dispose?.(); instances.delete(oldest[0]); }
    }
  }
  inst.used = ++useCounter;
  return inst;
}

/** Update a shot's scene + camera for global time T and return its view. */
function prepare(idx, T) {
  const shot = P.shots[idx];
  const inst = ensureInstance(shot);
  const t = T - shot.start;
  const prev = shot.instanceFirst !== idx ? P.shots[idx - 1] : null;
  // continued shots inherit the scene's original params (cues are per shot)
  const baseParams = P.shots[shot.instanceFirst].params || {};
  const merged = (sh) => ({ ...baseParams, ...(sh.params || {}), cues: (sh.params || {}).cues });
  const params = merged(shot);
  const prevParams = prev ? merged(prev) : null;
  const f = {
    t: T - P.shots[shot.instanceFirst].start, shotT: t, dur: shot.dur, params, prevParams,
    /** Tween a numeric/boolean param from the previous shot's value to this shot's value. */
    tw: (key, def = 0, at = 0.4, d = 1.6, fn = ease.inOutCubic) => {
      const to = Number(params[key] ?? def);
      const from = prevParams ? Number(prevParams[key] ?? def) : Number(params[key + 'From'] ?? def);
      return lerp(from, to, fn(clamp((t - at) / d)));
    },
  };
  inst.api.update(f);
  const spec = shotCameraSpec(inst.tpl, params, shot.camera);
  applyCamera(inst.camera, spec, t, shot.dur, hashStr(shot.id || String(idx)) % 1000, P.width / P.height);
  const anchors = typeof inst.api.anchors === 'function' ? inst.api.anchors(f) : (inst.api.anchors || {});
  const labels = inst.api.labels ? inst.api.labels(f) : [];
  return { shot, t, f, view: { scene: inst.api.scene, camera: inst.camera, look: { ...(P.look || {}), ...(inst.tpl.look || {}), ...(shot.look || {}) }, fade: 1 }, anchors, labels };
}

function shotAt(T) {
  const s = P.shots;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].start <= T) lo = mid; else hi = mid - 1; }
  return lo;
}

function renderAt(T, { captions = true } = {}) {
  const s = P.shots;
  let i = shotAt(T);
  // inside a transition window?
  let A = i, B = -1, mix = 0, type = 'cut';
  const next = s[i + 1];
  if (next && next.transition && next.transition.type !== 'cut' && T >= next.start - next.transition.dur / 2) {
    B = i + 1; type = next.transition.type; mix = (T - (next.start - next.transition.dur / 2)) / next.transition.dur;
  } else if (i > 0 && s[i].transition && s[i].transition.type !== 'cut' && T < s[i].start + s[i].transition.dur / 2) {
    A = i - 1; B = i; type = s[i].transition.type; mix = (T - (s[i].start - s[i].transition.dur / 2)) / s[i].transition.dur;
  }
  hud.clear();
  const a = prepare(A, T);
  // global fade in at video start / fade out at the end
  const fadeIn = P.noFade ? 1 : clamp(T / 0.8), fadeOut = P.noFade ? 1 : clamp((P.duration - T) / 1.0);
  a.view.fade = Math.min(fadeIn, fadeOut);
  stage.renderView(a.view, stage.rtA, T);
  const m = clamp(mix);
  hud.drawShot({ overlays: a.shot.overlays, labels: a.shot.hideLabels ? [] : a.labels, t: a.t, dur: a.shot.dur, camera: a.view.camera, anchors: a.anchors, weight: B >= 0 ? 1 - ease.inOutCubic(m) : 1 });
  if (B >= 0) {
    const b = prepare(B, T);
    b.view.fade = Math.min(fadeIn, fadeOut);
    stage.renderView(b.view, stage.rtB, T);
    hud.drawShot({ overlays: b.shot.overlays, labels: b.shot.hideLabels ? [] : b.labels, t: b.t, dur: b.shot.dur, camera: b.view.camera, anchors: b.anchors, weight: ease.inOutCubic(m) });
    stage.present(true, m, type);
  } else stage.present(false, 0, 'cut');
  if (captions && P.captions) {
    const cue = P.captions.find((c) => T >= c.start - 0.02 && T < c.end + 0.1);
    hud.drawCaption(cue, T);
  }
  outCtx.drawImage(stage.canvas, 0, 0);
  outCtx.drawImage(hud.canvas, 0, 0);
}

const b64 = (type, q) => out.toDataURL(type, q).split(',')[1];

window.__renderFrame = (frame, type = 'image/jpeg', q = 0.96) => { renderAt(frame / P.fps); return b64(type, q); };
window.__renderTime = (T, type = 'image/png', q = 0.96, captions = true) => { renderAt(T, { captions }); return b64(type, q); };
window.__ready = true;
