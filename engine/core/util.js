// Shared math / easing / deterministic-random helpers.
// Everything in the engine must be a pure function of time so any frame can be
// rendered in isolation (parallel workers, re-renders, stills).

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, clamp(invLerp(a, b, x)));
export const smoothstep = (a, b, x) => {
  const t = clamp(invLerp(a, b, x));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, x) => {
  const t = clamp(invLerp(a, b, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  // gentle documentary drift: mostly linear with soft ends
  drift: (t) => lerp(t, t * t * (3 - 2 * t), 0.6),
};

/** Animate 0→1 starting at `start` lasting `dur`, eased. Pure function of t. */
export const anim = (t, start, dur, fn = ease.outCubic) => fn(clamp((t - start) / Math.max(dur, 1e-6)));

/** Seeded PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a2, b2) => a2 + (b2 - a2) * f();
  f.int = (a2, b2) => Math.floor(f.range(a2, b2 + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Hash → [0,1) for integer inputs (stateless randomness per index). */
export function hash1(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1,1], continuous in x. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i * 15731 + seed * 789221), b = hash1((i + 1) * 15731 + seed * 789221);
  return lerp(a, b, u) * 2 - 1;
}

/** Format a number for on-screen display. */
export function fmtNum(v, { decimals = 0, prefix = '', suffix = '', compact = false } = {}) {
  let s;
  if (compact) {
    const a = Math.abs(v);
    if (a >= 1e12) s = (v / 1e12).toFixed(decimals) + 'T';
    else if (a >= 1e9) s = (v / 1e9).toFixed(decimals) + 'B';
    else if (a >= 1e6) s = (v / 1e6).toFixed(decimals) + 'M';
    else if (a >= 1e3) s = (v / 1e3).toFixed(decimals) + 'K';
    else s = v.toFixed(decimals);
  } else {
    s = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return prefix + s + suffix;
}
