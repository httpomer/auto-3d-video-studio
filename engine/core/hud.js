// On-screen graphics layer (titles, stats, callouts, captions ...) drawn on a
// 2D canvas over the 3D render. Every element is a pure function of time.
import * as THREE from 'three';
import { clamp, ease, lerp, fmtNum } from './util.js';

const REF_W = 1920;
const v3 = new THREE.Vector3();

export class Hud {
  constructor({ width, height, theme }) {
    this.w = width; this.h = height; this.s = width / REF_W; this.theme = theme;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.g = this.canvas.getContext('2d');
  }

  clear() { this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.w, this.h); this.g.setTransform(this.s, 0, 0, this.s, 0, 0); }

  font(weight, size, family = 'head') {
    const th = this.theme;
    return `${weight} ${size}px ${family === 'head' ? th.fontHead : family === 'mono' ? th.fontMono : th.fontBody}`;
  }

  project(pos, camera) {
    v3.copy(pos).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * REF_W, y: (1 - (v3.y * 0.5 + 0.5)) * (this.h / this.s), vis: v3.z > -1 && v3.z < 1 };
  }

  wrap(text, maxW) {
    const g = this.g, out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const test = line ? line + ' ' + word : word;
        if (line && g.measureText(test).width > maxW) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    return out;
  }

  /** Draw overlays + scene labels for one shot. `weight` scales alpha during transitions. */
  drawShot({ overlays = [], labels = [], t, dur, camera, anchors = {}, weight = 1 }) {
    const g = this.g;
    if (weight <= 0.001) return;
    for (const L of labels) this.label(L, camera, weight);
    for (const o of overlays) {
      const tin = o.in ?? 0.3, tout = o.out ?? dur - 0.15;
      if (t < tin || t > tout + 0.5) continue;
      const a = ease.outCubic(clamp((t - tin) / (o.fadeIn ?? 0.6)));
      const b = ease.inCubic(clamp((t - tout) / 0.4));
      const alpha = clamp(a * (1 - b)) * weight;
      if (alpha <= 0.001) continue;
      g.save();
      const fn = this['o_' + o.type];
      if (fn) fn.call(this, o, { t: t - tin, a, b, alpha, camera, anchors, dur });
      g.restore();
    }
  }

  /* ---------------- scene-provided 3D-anchored labels ---------------- */
  label(L, camera, weight) {
    const g = this.g, th = this.theme;
    const alpha = (L.alpha ?? 1) * weight;
    if (alpha <= 0.01) return;
    const p = this.project(L.pos, camera);
    if (!p.vis) return;
    const H = this.h / this.s;
    if (p.x < -200 || p.x > REF_W + 200 || p.y < -100 || p.y > H + 100) return;
    g.save();
    g.globalAlpha = alpha;
    const size = L.size ?? 30;
    g.font = this.font(L.weight ?? 600, size, L.font ?? 'head');
    g.textAlign = L.align ?? 'center'; g.textBaseline = 'middle';
    const x = p.x + (L.dx ?? 0), y = p.y + (L.dy ?? 0);
    if (L.bg) {
      const w = g.measureText(L.text).width + size * 0.9, h = size * 1.55;
      const bx = g.textAlign === 'center' ? x - w / 2 : g.textAlign === 'left' ? x - size * 0.45 : x - w + size * 0.45;
      g.fillStyle = 'rgba(5,9,15,0.72)'; this.rr(bx, y - h / 2, w, h, h * 0.28); g.fill();
      g.strokeStyle = this.rgba(L.color ?? th.accent, 0.45); g.lineWidth = 1.5; g.stroke();
    } else { g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 14; }
    g.fillStyle = L.color ?? th.text;
    g.fillText(L.text, x, y + size * 0.04);
    if (L.sub) {
      g.font = this.font(500, size * 0.62, 'body'); g.fillStyle = th.textDim;
      g.fillText(L.sub, x, y + size * 1.05);
    }
    g.restore();
  }

  /* ---------------- helpers ---------------- */
  rr(x, y, w, h, r) { const g = this.g; g.beginPath(); g.roundRect(x, y, w, h, r); }
  rgba(hex, a) {
    const n = parseInt(new THREE.Color(hex).getHexString(), 16); // getHexString returns sRGB
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  scrim(side, alpha) {
    const g = this.g, H = this.h / this.s;
    let gr;
    if (side === 'left') { gr = g.createLinearGradient(0, 0, REF_W * 0.62, 0); gr.addColorStop(0, `rgba(2,4,8,${0.78 * alpha})`); gr.addColorStop(1, 'rgba(2,4,8,0)'); }
    else if (side === 'right') { gr = g.createLinearGradient(REF_W, 0, REF_W * 0.38, 0); gr.addColorStop(0, `rgba(2,4,8,${0.78 * alpha})`); gr.addColorStop(1, 'rgba(2,4,8,0)'); }
    else if (side === 'bottom') { gr = g.createLinearGradient(0, H, 0, H * 0.5); gr.addColorStop(0, `rgba(2,4,8,${0.8 * alpha})`); gr.addColorStop(1, 'rgba(2,4,8,0)'); }
    else { gr = g.createRadialGradient(REF_W / 2, H / 2, 0, REF_W / 2, H / 2, REF_W * 0.6); gr.addColorStop(0, `rgba(2,4,8,${0.62 * alpha})`); gr.addColorStop(1, 'rgba(2,4,8,0)'); }
    g.fillStyle = gr; g.fillRect(0, 0, REF_W, H);
  }
  /** Lines that rise into place one after another. */
  riseLines(lines, x, y, lh, t, { stagger = 0.09, dist = 34, alpha = 1 } = {}) {
    const g = this.g;
    lines.forEach((ln, i) => {
      const k = ease.outQuart(clamp((t - i * stagger) / 0.7));
      g.globalAlpha = alpha * k;
      g.fillText(ln, x, y + i * lh + (1 - k) * dist);
    });
    g.globalAlpha = alpha;
  }

  /* ---------------- overlay components ---------------- */
  o_title(o, { t, alpha }) {
    const g = this.g, th = this.theme, H = this.h / this.s;
    const center = (o.align ?? 'left') === 'center';
    const size = o.size ?? (center ? 108 : 92);
    this.scrim(center ? 'center' : 'left', alpha * (o.scrim ?? 1));
    g.globalAlpha = alpha;
    g.textAlign = center ? 'center' : 'left'; g.textBaseline = 'alphabetic';
    const x = center ? REF_W / 2 : 120;
    g.font = this.font(700, size);
    const lines = this.wrap(o.text, center ? REF_W * 0.8 : REF_W * 0.52);
    const lh = size * 1.08;
    const blockH = lines.length * lh + (o.sub ? 70 : 0) + (o.kicker ? 54 : 0);
    let y = (o.y ?? 0.5) * H - blockH / 2 + size * 0.8;
    if (o.kicker) {
      g.font = this.font(600, 28); g.fillStyle = th.accent; g.letterSpacing = '6px';
      const k = ease.outCubic(clamp(t / 0.6));
      g.globalAlpha = alpha * k;
      g.fillText(String(o.kicker).toUpperCase(), x + (center ? 3 : 0), y - size * 0.8 + 20);
      g.letterSpacing = '0px'; y += 54;
    }
    g.font = this.font(700, size); g.fillStyle = th.text;
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 30;
    this.riseLines(lines, x, y, lh, t - 0.1, { alpha });
    g.shadowBlur = 0;
    const ly = y + (lines.length - 1) * lh + 34;
    const bar = ease.outQuart(clamp((t - 0.35) / 0.8));
    g.fillStyle = th.accent; g.globalAlpha = alpha;
    const bw = 150 * bar;
    g.fillRect(center ? x - bw / 2 : x, ly, bw, 6);
    if (o.sub) {
      g.font = this.font(400, 36, 'body'); g.fillStyle = th.textDim;
      const sl = this.wrap(o.sub, center ? REF_W * 0.7 : REF_W * 0.5);
      this.riseLines(sl, x, ly + 66, 48, t - 0.5, { alpha, dist: 20 });
    }
  }

  o_chapter(o, { t, alpha }) {
    const g = this.g, th = this.theme, H = this.h / this.s;
    this.scrim('center', alpha);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const cy = H * (o.y ?? 0.5);
    const k = ease.outCubic(clamp(t / 0.6));
    g.globalAlpha = alpha * k;
    g.font = this.font(600, 30); g.fillStyle = th.accent; g.letterSpacing = '10px';
    g.fillText((o.kicker ?? (o.index != null ? `PART ${String(o.index).padStart(2, '0')}` : '')).toUpperCase(), REF_W / 2 + 5, cy - 86);
    g.letterSpacing = '0px';
    const lw = 520 * ease.outQuart(clamp((t - 0.15) / 0.9));
    g.globalAlpha = alpha; g.fillStyle = this.rgba(th.accent, 0.9);
    g.fillRect(REF_W / 2 - lw / 2, cy - 56, lw, 2);
    g.font = this.font(700, o.size ?? 104); g.fillStyle = th.text;
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 30;
    const lines = this.wrap(o.title ?? o.text, REF_W * 0.8);
    this.riseLines(lines, REF_W / 2, cy + 52, 112, t - 0.2, { alpha });
  }

  o_lower(o, { t, alpha }) {
    const g = this.g, th = this.theme, H = this.h / this.s;
    const k = ease.outQuart(clamp(t / 0.7));
    const x = 110, y = H - (o.sub ? 300 : 270);
    g.font = this.font(600, 46);
    const tw = g.measureText(o.text).width;
    g.font = this.font(400, 28, 'body');
    const sw = o.sub ? g.measureText(o.sub).width : 0;
    const w = Math.max(tw, sw) + 78, h = o.sub ? 126 : 86;
    g.globalAlpha = alpha;
    g.save();
    this.rr(x, y, w * k, h, 10); g.clip();
    g.fillStyle = 'rgba(5,9,15,0.74)'; g.fillRect(x, y, w, h);
    g.fillStyle = th.accent; g.fillRect(x, y, 7, h);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = this.font(600, 46); g.fillStyle = th.text;
    g.fillText(o.text, x + 40 - (1 - k) * 30, y + 58);
    if (o.sub) { g.font = this.font(400, 28, 'body'); g.fillStyle = th.textDim; g.fillText(o.sub, x + 40 - (1 - k) * 30, y + 101); }
    g.restore();
  }

  o_stat(o, { t, alpha }) {
    const g = this.g, th = this.theme, H = this.h / this.s;
    const pos = o.pos ?? 'left';
    const center = pos === 'center';
    const right = pos.includes('right');
    const top = pos.includes('top');
    const x = center ? REF_W / 2 : right ? REF_W - 130 : 130;
    const size = o.size ?? (center ? 220 : 170);
    let y = center ? H * 0.52 : top ? 300 : H * 0.5;
    if (o.y != null) y = o.y * H;
    if (o.scrim !== false) this.scrim(center ? 'center' : right ? 'right' : 'left', alpha * 0.9);
    g.textAlign = center ? 'center' : right ? 'right' : 'left'; g.textBaseline = 'alphabetic';
    g.globalAlpha = alpha;
    let str;
    if (typeof o.value === 'number') {
      const k = ease.outExpo(clamp((t - 0.1) / (o.countDur ?? 1.6)));
      str = fmtNum(lerp(o.from ?? 0, o.value, k), { decimals: o.decimals ?? 0, prefix: o.prefix ?? '', suffix: o.suffix ?? '', compact: o.compact });
    } else str = String(o.value);
    if (o.label) {
      g.font = this.font(600, 30); g.fillStyle = th.accent; g.letterSpacing = '5px';
      g.fillText(String(o.label).toUpperCase(), x + (center ? 2 : 0), y - size * 0.92);
      g.letterSpacing = '0px';
    }
    g.font = this.font(700, size);
    let fs = size; const maxW = center ? REF_W * 0.86 : REF_W * 0.46;
    while (g.measureText(str).width > maxW && fs > 40) { fs -= 6; g.font = this.font(700, fs); }
    const k2 = ease.outQuart(clamp(t / 0.7));
    g.shadowColor = this.rgba(th.accent, 0.55); g.shadowBlur = 50;
    g.fillStyle = th.text;
    g.fillText(str, x, y + (1 - k2) * 30);
    g.shadowBlur = 0;
    if (o.sub) {
      g.font = this.font(400, 36, 'body'); g.fillStyle = th.textDim;
      const lines = this.wrap(o.sub, center ? REF_W * 0.6 : REF_W * 0.36);
      this.riseLines(lines, x, y + 64, 48, t - 0.45, { alpha, dist: 18 });
    }
  }

  o_callout(o, { t, alpha, camera, anchors }) {
    const g = this.g, th = this.theme;
    const world = o.world ? new THREE.Vector3(...o.world) : anchors[o.anchor];
    if (!world) return;
    const p = this.project(world, camera);
    if (!p.vis) return;
    const dir = o.dir ?? (p.x > REF_W * 0.5 ? 'right' : 'left');
    const sx = dir.includes('left') ? -1 : 1, sy = dir.includes('down') ? 1 : -1;
    const dx = (o.dx ?? 90) * sx, dy = (o.dy ?? 80) * sy, run = (o.run ?? 90) * sx;
    const k1 = ease.outCubic(clamp(t / 0.35)), k2 = ease.outCubic(clamp((t - 0.25) / 0.4)), k3 = ease.outCubic(clamp((t - 0.5) / 0.5));
    g.globalAlpha = alpha;
    const c = o.color ?? th.accent;
    g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 2.5;
    g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 10;
    g.beginPath(); g.arc(p.x, p.y, 7 * k1, 0, Math.PI * 2); g.fill();
    g.globalAlpha = alpha * 0.5 * (1 - (t * 0.7) % 1);
    g.beginPath(); g.arc(p.x, p.y, 7 + 22 * ((t * 0.7) % 1), 0, Math.PI * 2); g.stroke();
    g.globalAlpha = alpha;
    g.beginPath(); g.moveTo(p.x, p.y);
    g.lineTo(p.x + dx * k2, p.y + dy * k2);
    if (k2 >= 1) g.lineTo(p.x + dx + run * k3, p.y + dy);
    g.stroke();
    const tx = p.x + dx + run + 16 * sx, ty = p.y + dy;
    g.globalAlpha = alpha * k3;
    g.textAlign = sx > 0 ? 'left' : 'right'; g.textBaseline = 'middle';
    g.font = this.font(600, o.size ?? 38);
    const tw = g.measureText(o.text).width;
    g.font = this.font(400, 26, 'body');
    const sw = o.sub ? g.measureText(o.sub).width : 0;
    const bw = Math.max(tw, sw) + 44, bh = o.sub ? 104 : 66;
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(5,9,15,0.76)';
    this.rr(sx > 0 ? tx - 12 : tx - bw + 12, ty - (o.sub ? 36 : bh / 2), bw, bh, 10); g.fill();
    g.font = this.font(600, o.size ?? 38); g.fillStyle = th.text;
    g.fillText(o.text, tx + 10 * sx, ty + 2);
    if (o.sub) { g.font = this.font(400, 26, 'body'); g.fillStyle = th.textDim; g.fillText(o.sub, tx + 10 * sx, ty + 42); }
  }

  o_bullets(o, { t, alpha }) {
    const g = this.g, th = this.theme, H = this.h / this.s;
    const right = o.pos === 'right';
    this.scrim(right ? 'right' : 'left', alpha);
    const x = right ? REF_W * 0.6 : 130;
    const items = o.items || [];
    const lh = o.lineHeight ?? 84;
    let y = H * 0.5 - (items.length * lh + (o.title ? 90 : 0)) / 2 + 40;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.globalAlpha = alpha;
    if (o.title) {
      g.font = this.font(600, 30); g.fillStyle = th.accent; g.letterSpacing = '5px';
      g.fillText(String(o.title).toUpperCase(), x, y); g.letterSpacing = '0px'; y += 90;
    }
    const stagger = o.stagger ?? 0.9;
    items.forEach((it, i) => {
      const at = (o.times && o.times[i] != null) ? o.times[i] : 0.3 + i * stagger;
      const k = ease.outQuart(clamp((t - at) / 0.6));
      if (k <= 0) return;
      g.globalAlpha = alpha * k;
      const yy = y + i * lh, xx = x + (1 - k) * 40;
      g.fillStyle = th.accent; this.rr(xx, yy - 7, 14, 14, 3); g.fill();
      g.font = this.font(500, o.size ?? 44); g.fillStyle = th.text;
      g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 16;
      g.fillText(it, xx + 40, yy + 2);
      g.shadowBlur = 0;
    });
  }

  o_quote(o, { t, alpha }) {
    const g = this.g, th = this.theme, H = this.h / this.s;
    this.scrim('center', alpha);
    g.globalAlpha = alpha; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = this.font(500, o.size ?? 64);
    const lines = this.wrap('“' + o.text + '”', REF_W * 0.72);
    const lh = (o.size ?? 64) * 1.28;
    let y = H * 0.5 - (lines.length * lh) / 2 + 40;
    g.fillStyle = th.text; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 24;
    this.riseLines(lines, REF_W / 2, y, lh, t, { alpha, stagger: 0.14 });
    g.shadowBlur = 0;
    if (o.by) {
      const k = ease.outCubic(clamp((t - 0.8) / 0.6)); g.globalAlpha = alpha * k;
      g.font = this.font(500, 32, 'body'); g.fillStyle = th.accent;
      g.fillText('— ' + o.by, REF_W / 2, y + lines.length * lh + 16);
    }
  }

  o_tag(o, { t, alpha }) {
    const g = this.g, th = this.theme;
    const right = (o.pos ?? 'top-left').includes('right');
    g.font = this.font(600, 30); g.letterSpacing = '3px';
    const text = String(o.text).toUpperCase();
    const w = g.measureText(text).width + 56, h = 60;
    const k = ease.outQuart(clamp(t / 0.6));
    const x = right ? REF_W - 110 - w : 110, y = 96;
    g.globalAlpha = alpha * k;
    g.fillStyle = 'rgba(5,9,15,0.7)'; this.rr(x, y, w, h, 30); g.fill();
    g.strokeStyle = this.rgba(th.accent, 0.7); g.lineWidth = 2; g.stroke();
    g.fillStyle = th.accent; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(text, x + 28, y + h / 2 + 2);
    g.letterSpacing = '0px';
  }

  o_source(o, { alpha }) {
    const g = this.g, th = this.theme;
    g.globalAlpha = alpha * 0.8;
    g.font = this.font(400, 22, 'body'); g.fillStyle = th.textDim;
    g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 8;
    g.fillText(o.text, REF_W - 60, 62);
  }

  /** YouTube thumbnail typography: huge, few words, one highlighted. */
  o_thumb(o) {
    const g = this.g, th = this.theme, H = this.h / this.s;
    const right = o.side === 'right';
    const gr = g.createLinearGradient(right ? REF_W : 0, 0, right ? REF_W * 0.3 : REF_W * 0.7, 0);
    gr.addColorStop(0, 'rgba(2,4,8,0.92)'); gr.addColorStop(0.6, 'rgba(2,4,8,0.55)'); gr.addColorStop(1, 'rgba(2,4,8,0)');
    g.fillStyle = gr; g.fillRect(0, 0, REF_W, H);
    const text = String(o.text).toUpperCase();
    let size = o.size ?? 210;
    const maxW = REF_W * 0.6;
    let lines;
    for (;;) {
      g.font = this.font(700, size);
      lines = this.wrap(text, maxW);
      const widest = Math.max(...lines.map((l) => g.measureText(l).width));
      if ((lines.length <= 3 && widest <= maxW) || size < 90) break;
      size -= 10;
    }
    const lh = size * 1.02;
    let y = H / 2 - (lines.length * lh) / 2 + size * 0.82 + (o.kicker ? 40 : 0);
    const x = right ? REF_W - 90 : 90;
    g.textAlign = right ? 'right' : 'left'; g.textBaseline = 'alphabetic';
    if (o.kicker) {
      g.font = this.font(700, 46); g.letterSpacing = '6px';
      const kw = g.measureText(String(o.kicker).toUpperCase()).width + 60;
      g.fillStyle = th.accent; this.rr(right ? x - kw : x, y - size * 0.82 - 96, kw, 76, 10); g.fill();
      g.fillStyle = '#05080c'; g.textBaseline = 'middle';
      g.fillText(String(o.kicker).toUpperCase(), right ? x - 27 : x + 30, y - size * 0.82 - 56);
      g.letterSpacing = '0px'; g.textBaseline = 'alphabetic';
    }
    g.font = this.font(700, size);
    g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 40; g.shadowOffsetY = 8;
    const hl = (o.highlight ? String(o.highlight).toUpperCase().split(/\s+/) : []);
    const sp = g.measureText(' ').width;
    for (const line of lines) {
      const ws = line.split(' ');
      let cx = right ? x - g.measureText(line).width : x;
      g.textAlign = 'left';
      for (const w of ws) {
        g.fillStyle = hl.includes(w.replace(/[^A-Z0-9$%.]/g, '')) || hl.includes(w) ? th.accent : '#ffffff';
        g.fillText(w, cx, y);
        cx += g.measureText(w).width + sp;
      }
      y += lh;
    }
  }

  /* ---------------- captions ---------------- */
  drawCaption(cue, time) {
    if (!cue) return;
    const g = this.g, th = this.theme, H = this.h / this.s;
    const a = clamp((time - cue.start) / 0.1) * clamp((cue.end - time) / 0.1 + 1);
    if (a <= 0) return;
    g.save();
    g.font = this.font(600, 42, 'body');
    g.textBaseline = 'middle'; g.textAlign = 'left';
    const lines = cue.lines; // [[{w,t}]]
    const lh = 58, padX = 30;
    const widths = lines.map((ws) => g.measureText(ws.map((x) => x.w).join(' ')).width);
    const bw = Math.max(...widths) + padX * 2, bh = lines.length * lh + 22;
    const by = H - 78 - bh;
    g.globalAlpha = a;
    g.fillStyle = 'rgba(4,7,12,0.66)'; this.rr(REF_W / 2 - bw / 2, by, bw, bh, 14); g.fill();
    const sp = g.measureText(' ').width;
    lines.forEach((ws, li) => {
      let x = REF_W / 2 - widths[li] / 2; const y = by + 11 + lh * li + lh / 2 + 1;
      for (const w of ws) {
        g.fillStyle = time >= w.t - 0.04 ? th.text : 'rgba(244,247,251,0.55)';
        g.fillText(w.w, x, y);
        x += g.measureText(w.w).width + sp;
      }
    });
    g.restore();
  }
}
