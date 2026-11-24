// Turns a storyboard (video.json) + measured narration audio into an exact
// timeline: every shot's start/duration, overlay timings, caption cues, chapters.
// Shot length is DERIVED from the narration audio, so picture and voice always sync.

const WPM = 158; // used only for estimates before audio exists

export function flattenShots(video) {
  const shots = [];
  const chapters = [];
  const src = video.chapters ? video.chapters : [{ title: null, shots: video.shots || [] }];
  src.forEach((ch, ci) => {
    (ch.shots || []).forEach((s, si) => {
      shots.push({ ...s, id: s.id || `c${ci + 1}s${si + 1}`, chapter: ci, chapterStart: si === 0, chapterEnd: si === ch.shots.length - 1 });
    });
    chapters.push({ title: ch.title });
  });
  return { shots, chapters };
}

export const wordsOf = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);
export const estimateDur = (text) => (wordsOf(text).length / WPM) * 60;

/** Per-token times for the caption text, aligned to TTS word boundaries when available. */
function tokenTimes(text, audio) {
  const tokens = wordsOf(text);
  const dur = audio?.dur ?? estimateDur(text);
  // TTS sometimes reports several words as one boundary ("In 2016") — split those
  const b = audio?.words && audio.words.flatMap((x) => {
    const parts = String(x.w).trim().split(/\s+/);
    if (parts.length < 2) return [x];
    const tot = parts.reduce((s2, q) => s2 + q.length, 0); let acc = 0;
    return parts.map((q) => { const o = { w: q, t: x.t + (acc / tot) * x.d, d: (q.length / tot) * x.d }; acc += q.length; return o; });
  });
  if (b && b.length === tokens.length) return tokens.map((w, i) => ({ w, t: b[i].t, e: b[i].t + b[i].d }));
  // fallback: distribute by character position (through boundaries if we have them)
  const total = tokens.reduce((a, w) => a + w.length + 1, 0);
  let acc = 0;
  return tokens.map((w) => {
    const f0 = acc / total; acc += w.length + 1; const f1 = acc / total;
    if (b && b.length > 1) {
      const at = (f) => { const x = f * (b.length - 1), i = Math.min(Math.floor(x), b.length - 2); return b[i].t + (b[i + 1].t - b[i].t) * (x - i); };
      return { w, t: at(f0), e: Math.min(at(f1) + 0.05, dur) };
    }
    return { w, t: f0 * dur * 0.97, e: f1 * dur * 0.97 };
  });
}

function buildCues(tokens, offset, maxChars = 34) {
  const len = (arr) => arr.reduce((n, x) => n + x.w.length + 1, 0) - 1;
  const punct = (w) => (/[.!?]["')]?$/.test(w) ? 2 : /[,;:—–]$/.test(w) ? 1 : 0);
  // best place to cut `arr` into two readable halves (prefers punctuation, avoids orphans)
  const splitAt = (arr, bonus = 7) => {
    let best = 1, bestScore = -1e9;
    const total = len(arr);
    for (let i = 1; i < arr.length; i++) {
      const left = len(arr.slice(0, i));
      let score = -Math.abs(left - total / 2) + punct(arr[i - 1].w) * bonus;
      if (/^(a|an|the|of|to|in|on|and|or|for|is|its|with|at|by)$/i.test(arr[i - 1].w)) score -= 5; // don't end a line on a weak word
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  };
  // 1) sentences  2) recursively halve anything longer than two caption lines
  const groups = [];
  let cur = [];
  tokens.forEach((tk, i) => {
    cur.push(tk);
    const gap = tokens[i + 1] ? tokens[i + 1].t - tk.e : 0;
    if (punct(tk.w) === 2 || gap > 0.6) { groups.push(cur); cur = []; }
  });
  if (cur.length) groups.push(cur);
  const chunks = [];
  const fit = (arr) => { if (len(arr) <= maxChars * 2 - 4 || arr.length < 4) chunks.push(arr); else { const k = splitAt(arr); fit(arr.slice(0, k)); fit(arr.slice(k)); } };
  groups.forEach(fit);
  // merge tiny leftovers into a neighbour when the result still fits
  for (let i = chunks.length - 1; i > 0; i--) {
    if (chunks[i].length <= 2 && punct(chunks[i - 1][chunks[i - 1].length - 1].w) < 2 && len(chunks[i - 1]) + len(chunks[i]) + 1 <= maxChars * 2) { chunks[i - 1] = chunks[i - 1].concat(chunks[i]); chunks.splice(i, 1); }
  }
  const cues = chunks.map((arr) => {
    const lines = len(arr) <= maxChars ? [arr] : (() => { const k = splitAt(arr, 2); return [arr.slice(0, k), arr.slice(k)]; })();
    return { start: offset + arr[0].t, end: offset + arr[arr.length - 1].e, text: arr.map((x) => x.w).join(' '), lines: lines.map((l) => l.map((x) => ({ w: x.w, t: offset + x.t }))) };
  });
  // no caption shorter than 0.7s on screen; never overlap the next cue
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    cues[i].end = Math.max(cues[i].end, cues[i].start + 0.7);
    if (next) cues[i].end = Math.min(Math.max(cues[i].end, next.start - 0.02), next.start - 0.01);
    else cues[i].end += 0.25;
  }
  return cues;
}

function resolveTime(v, dur, lead, tokens, def) {
  if (v == null) return def;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s.endsWith('%')) return (parseFloat(s) / 100) * dur;
  if (s.startsWith('@')) {
    const needle = s.slice(1).toLowerCase().replace(/[^a-z0-9$%.]/g, '');
    const hit = tokens.find((tk) => tk.w.toLowerCase().replace(/[^a-z0-9$%.]/g, '').startsWith(needle));
    return hit ? Math.max(0, lead + hit.t - 0.12) : def;
  }
  return parseFloat(s) || def;
}

/**
 * @param video   parsed video.json
 * @param audio   { [shotId]: { dur, words:[{t,d,w}] } } (optional — estimated if missing)
 */
export function buildTimeline(video, audio = {}, opts = {}) {
  const meta = video.meta || {};
  const { shots, chapters } = flattenShots(video);
  const fps = opts.fps ?? meta.fps ?? 30;
  const width = opts.width ?? meta.width ?? 1920, height = opts.height ?? meta.height ?? 1080;
  const defaultTransition = meta.transition ?? { type: 'fade', dur: 0.5 };
  const out = [];
  const captions = [];
  const narration = [];
  let T = 0, instance = null, instanceFirst = 0;

  shots.forEach((s, i) => {
    const a = audio[s.id];
    const hasVoice = !!(s.narration && s.narration.trim());
    const aDur = hasVoice ? (a?.dur ?? estimateDur(s.narration)) : 0;
    const lead = s.lead ?? (i === 0 ? 0.5 : s.chapterStart ? 0.45 : 0.18);
    const tail = s.tail ?? (s.chapterEnd ? 0.55 : 0.22);
    let dur = hasVoice ? lead + aDur + tail : (s.duration ?? 3);
    if (s.minDuration) dur = Math.max(dur, s.minDuration);
    dur = Math.round(dur * fps) / fps;

    let tr = s.transition ?? (s.continues ? { type: 'cut' } : defaultTransition);
    if (typeof tr === 'string') tr = { type: tr };
    tr = { type: tr.type || 'fade', dur: tr.dur ?? (tr.type === 'dip' ? 0.8 : tr.type === 'cut' ? 0 : 0.5) };
    if (i === 0) tr = { type: 'cut', dur: 0 };

    if (!s.continues || !instance) { instance = `inst${i}`; instanceFirst = i; }

    const tokens = hasVoice ? tokenTimes(s.caption || s.narration, a) : [];
    const overlays = (s.overlays || []).map((o) => {
      const tin = resolveTime(o.at, dur, lead, tokens, 0.35);
      let tout = resolveTime(o.until, dur, lead, tokens, null);
      if (tout == null) tout = o.hold != null ? tin + o.hold : dur - 0.2;
      const o2 = { ...o, in: Math.max(0, tin), out: Math.min(tout, dur - 0.05) };
      if (o.times) o2.times = o.times.map((x) => resolveTime(x, dur, lead, tokens, 0) - o2.in);
      return o2;
    });
    // scene-level cue times (e.g. highlight a bar when a word is spoken)
    const params = { ...(s.params || {}) };
    if (s.cues) { params.cues = {}; for (const k in s.cues) params.cues[k] = resolveTime(s.cues[k], dur, lead, tokens, 0); }

    out.push({ id: s.id, start: T, dur, scene: s.scene, params, camera: s.camera, overlays, transition: tr, look: s.look, hideLabels: s.hideLabels, instance, instanceFirst, chapter: s.chapter });
    if (hasVoice) {
      narration.push({ id: s.id, at: T + lead, dur: aDur });
      if (s.captions !== false) captions.push(...buildCues(tokens, T + lead));
    }
    if (s.chapterStart) chapters[s.chapter].start = T;
    T += dur;
  });

  // never let two captions overlap across shot boundaries
  for (let i = 0; i < captions.length - 1; i++) if (captions[i].end > captions[i + 1].start - 0.01) captions[i].end = captions[i + 1].start - 0.01;

  const duration = Math.round(T * fps) / fps;
  return { width, height, fps, theme: meta.theme || 'tech', themeOverrides: meta.themeOverrides, look: meta.look, shots: out, captions, narration, chapters, duration, totalFrames: Math.round(duration * fps) };
}
