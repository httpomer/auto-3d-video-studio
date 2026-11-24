// Procedural background score + sound design. Fully generated in code, so every
// video gets an original, licence-free bed that follows its chapter structure.
// (Drop an audio file at projects/<slug>/music.mp3|wav to use your own instead.)
import { SR } from './audio-util.js';

const MOODS = {
  // chord roots/notes as semitone offsets from the key root (MIDI)
  inspiring: { key: 50, bpm: 92, chords: [[0, 4, 7, 14], [-3, 0, 4, 12], [-7, -3, 0, 9], [-5, -1, 2, 9]] },      // D  Bm  G  A
  serious: { key: 50, bpm: 84, chords: [[0, 3, 7, 14], [-4, 0, 3, 10], [-7, -4, 0, 7], [-2, 2, 5, 12]] },        // Dm Bb  Gm C
  tense: { key: 45, bpm: 100, chords: [[0, 3, 7, 12], [-4, 0, 3, 8], [-7, -4, 0, 5], [-5, -1, 2, 7]] },          // Am F  Dm E
  hopeful: { key: 48, bpm: 96, chords: [[0, 4, 7, 11], [-5, -1, 2, 7], [-3, 0, 4, 9], [-7, -3, 0, 5]] },         // C  G  Am F
};
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Schroeder-style reverb on a stereo pair (in place, returns wet buffers). */
function reverb(L, R, mix = 0.3) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => Math.round(d * SR / 44100));
  const alls = [225, 556, 441].map((d) => Math.round(d * SR / 44100));
  const run = (x, spread) => {
    const n = x.length, out = new Float32Array(n);
    for (const d0 of combs) {
      const d = d0 + spread, buf = new Float32Array(d); let idx = 0, lp = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[idx]; lp = y * 0.72 + lp * 0.28;
        buf[idx] = x[i] + lp * 0.86; idx = (idx + 1) % d; out[i] += y;
      }
    }
    for (const d0 of alls) {
      const d = d0 + spread, buf = new Float32Array(d); let idx = 0;
      for (let i = 0; i < n; i++) { const b = buf[idx], y = -out[i] + b; buf[idx] = out[i] + b * 0.5; idx = (idx + 1) % d; out[i] = y; }
    }
    for (let i = 0; i < n; i++) out[i] *= 0.16;
    return out;
  };
  const wl = run(L, 0), wr = run(R, 23);
  for (let i = 0; i < L.length; i++) { L[i] = L[i] * (1 - mix * 0.4) + wl[i] * mix; R[i] = R[i] * (1 - mix * 0.4) + wr[i] * mix; }
}

/**
 * @param duration seconds
 * @param opts { mood, seed, sections: [{ start, energy }] }  energy 0..1 per chapter
 */
export function generateMusic(duration, opts = {}) {
  const mood = MOODS[opts.mood] || MOODS.inspiring;
  const rnd = prng(opts.seed ?? 7);
  const n = Math.ceil((duration + 1.5) * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const beat = 60 / mood.bpm, bar = beat * 4, chordLen = bar * 2;
  const sections = (opts.sections && opts.sections.length ? opts.sections : [{ start: 0, energy: 0.6 }]).slice().sort((a, b) => a.start - b.start);
  const energyRaw = (t) => {
    let e = sections[0].energy, dip = 1;
    for (const s of sections) {
      if (t >= s.start) e = s.energy;
      const d = t - s.start; // breathe at each chapter start
      if (d > -1.5 && d < 5) dip = Math.min(dip, 0.45 + 0.55 * smooth(0, 5, Math.abs(d)));
    }
    const intro = smooth(0, 14, t) * 0.5 + 0.5, outro = 1;
    return Math.max(0.15, Math.min(1, e * dip * intro * outro));
  };
  // energy curve sampled at 50 Hz and smoothed (cheap per-sample lookup)
  const EN = 50, eTab = new Float32Array(Math.ceil((duration + 8) * EN) + 2);
  for (let i = 0; i < eTab.length; i++) eTab[i] = energyRaw(i / EN);
  for (let pass = 0; pass < 2; pass++) { let s = eTab[0]; for (let i = 0; i < eTab.length; i++) { s += 0.02 * (eTab[i] - s); eTab[i] = s; } }
  const energyAt = (t) => eTab[Math.max(0, Math.min(eTab.length - 1, (t * EN) | 0))];

  /* ---- pad + bass, chord by chord ---- */
  const nChords = Math.ceil((duration + 2) / chordLen);
  const partials = [1, 0.5, 0.28, 0.16, 0.09, 0.05];
  for (let c = 0; c < nChords; c++) {
    const chord = mood.chords[c % mood.chords.length];
    const t0 = c * chordLen, att = 1.6, rel = 2.2;
    const i0 = Math.max(0, Math.floor((t0 - 0.2) * SR)), i1 = Math.min(n, Math.ceil((t0 + chordLen + rel) * SR));
    const variant = Math.floor(c / mood.chords.length) % 2; // lift voicing every other cycle
    chord.forEach((semi, k) => {
      const m = mood.key + semi + (variant && k === 3 ? 12 : 0) + (k === 0 ? 0 : 12);
      const f = hz(m), pan = [0.5, 0.25, 0.75, 0.4][k], gl = Math.cos(pan * Math.PI / 2), gr = Math.sin(pan * Math.PI / 2);
      for (const det of [-0.0035, 0.0035]) {
        const ff = f * (1 + det), ph0 = rnd() * 6.283;
        for (let i = i0; i < i1; i++) {
          const t = i / SR, lt = t - t0;
          const env = smooth(-0.2, att, lt) * (1 - smooth(chordLen - 0.3, chordLen + rel, lt));
          if (env <= 0) continue;
          const e = energyAt(t);
          const bright = 0.35 + 0.65 * e;
          const ph = 6.283185 * ff * t + ph0;
          let s = 0, br = 1;
          for (let h = 0; h < partials.length; h++) { s += Math.sin(ph * (h + 1)) * partials[h] * br; br *= bright; }
          s *= env * 0.045 * (0.75 + 0.25 * Math.sin(t * 0.7 + k));
          L[i] += s * gl; R[i] += s * gr;
        }
      }
    });
    // bass: root, two octaves down, gently pulsing on eighths
    const fb = hz(mood.key + chord[0] - 12 - (chord[0] > -3 ? 12 : 0) + 12);
    for (let i = i0; i < i1; i++) {
      const t = i / SR, lt = t - t0;
      const env = smooth(0, 0.25, lt) * (1 - smooth(chordLen - 0.25, chordLen + 0.3, lt));
      if (env <= 0) continue;
      const e = energyAt(t);
      const pulse = 1 - 0.55 * smooth(0.35, 0.75, e) * Math.pow((lt / (beat / 2)) % 1, 0.6);
      const ph = 6.283185 * fb * t;
      const s = (Math.sin(ph) + 0.25 * Math.sin(ph * 2)) * env * pulse * 0.11 * (0.5 + 0.5 * e);
      L[i] += s; R[i] += s;
    }
  }

  /* ---- plucked arpeggio (enters with energy) + ping-pong delay ---- */
  const AL = new Float32Array(n), AR = new Float32Array(n);
  const step = beat / 2, pattern = [0, 2, 1, 3, 2, 1, 3, 2];
  const nSteps = Math.floor(duration / step);
  for (let s = 0; s < nSteps; s++) {
    const t0 = s * step, e = energyAt(t0);
    const g = smooth(0.38, 0.62, e);
    if (g <= 0.01) continue;
    const accent = s % 4 === 0 ? 1 : s % 2 === 0 ? 0.7 : 0.5;
    if (accent < 0.6 && rnd() < 0.25) continue; // leave holes so it breathes
    const chord = mood.chords[Math.floor(t0 / chordLen) % mood.chords.length];
    const m = mood.key + chord[pattern[s % 8]] + 24 + (e > 0.8 && s % 16 >= 12 ? 12 : 0);
    const f = hz(m), pan = s % 2 ? 0.3 : 0.7;
    const len = Math.floor(0.9 * SR), i0 = Math.floor(t0 * SR);
    for (let i = 0; i < len && i0 + i < n; i++) {
      const lt = i / SR;
      const env = Math.min(1, lt / 0.004) * Math.exp(-lt / 0.16);
      const ph = 6.283185 * f * lt;
      const v = (Math.sin(ph) + 0.35 * Math.sin(ph * 2) * Math.exp(-lt / 0.05) + 0.12 * Math.sin(ph * 3) * Math.exp(-lt / 0.03)) * env * 0.06 * accent * g;
      AL[i0 + i] += v * (1 - pan); AR[i0 + i] += v * pan;
    }
  }
  const dl = Math.round(step * 1.5 * SR);
  for (let i = dl; i < n; i++) { AL[i] += AR[i - dl] * 0.36; AR[i] += AL[i - dl] * 0.36; }
  for (let i = 0; i < n; i++) { L[i] += AL[i]; R[i] += AR[i]; }

  reverb(L, R, 0.42);

  /* ---- soft kick on 1 and 3 at high energy (dry, after reverb) ---- */
  const nBeats = Math.floor(duration / beat);
  for (let b = 0; b < nBeats; b++) {
    if (b % 2) continue;
    const t0 = b * beat, g = smooth(0.66, 0.88, energyAt(t0));
    if (g <= 0.01) continue;
    const i0 = Math.floor(t0 * SR), len = Math.floor(0.3 * SR);
    let ph = 0;
    for (let i = 0; i < len && i0 + i < n; i++) {
      const lt = i / SR; ph += 6.283185 * (44 + 70 * Math.exp(-lt / 0.03)) / SR;
      const v = Math.sin(ph) * Math.exp(-lt / 0.09) * 0.16 * g;
      L[i0 + i] += v; R[i0 + i] += v;
    }
  }

  /* ---- master: gentle low-pass, fades, normalise ---- */
  let ll = 0, lr = 0, peak = 0;
  const a = 1 - Math.exp(-2 * Math.PI * 7500 / SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fade = smooth(0, 2.0, t) * (1 - smooth(duration - 3.5, duration + 0.5, t));
    ll += a * (L[i] - ll); lr += a * (R[i] - lr);
    L[i] = ll * fade; R[i] = lr * fade;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = 0.7 / Math.max(peak, 1e-6);
  for (let i = 0; i < n; i++) { L[i] *= norm; R[i] *= norm; }
  return [L, R];
}

/** Transition whooshes + chapter impacts. events: [{ t, type: 'whoosh'|'impact'|'rise' }] */
export function generateSfx(duration, events = [], seed = 3) {
  const rnd = prng(seed);
  const n = Math.ceil((duration + 1.5) * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (const ev of events) {
    if (ev.type === 'whoosh') {
      const len = Math.floor(0.7 * SR), i0 = Math.floor((ev.t - 0.35) * SR);
      let bp = 0, lp = 0;
      for (let i = 0; i < len; i++) {
        const j = i0 + i; if (j < 0 || j >= n) continue;
        const u = i / len, env = Math.pow(Math.sin(Math.PI * u), 2.2);
        const fc = 500 + 2600 * Math.sin(Math.PI * u), f = 2 * Math.sin(Math.PI * fc / SR);
        const x = rnd() * 2 - 1;
        lp += f * bp; const hp = x - lp - 0.9 * bp; bp += f * hp; // state-variable band-pass
        const v = bp * env * 0.055, pan = 0.25 + 0.5 * u;
        L[j] += v * (1 - pan); R[j] += v * pan;
      }
    } else if (ev.type === 'impact') {
      const len = Math.floor(1.8 * SR), i0 = Math.floor(ev.t * SR);
      let ph = 0, lpn = 0;
      for (let i = 0; i < len; i++) {
        const j = i0 + i; if (j < 0 || j >= n) continue;
        const lt = i / SR; ph += 6.283185 * (36 + 40 * Math.exp(-lt / 0.08)) / SR;
        lpn += 0.02 * ((rnd() * 2 - 1) - lpn);
        const v = Math.sin(ph) * Math.exp(-lt / 0.45) * 0.22 + lpn * Math.exp(-lt / 0.25) * 0.5;
        L[j] += v; R[j] += v;
      }
    }
  }
  return [L, R];
}
