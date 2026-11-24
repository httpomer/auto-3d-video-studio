// Stock candlestick chart in 3D: candles form left→right, volume bars along the
// floor, a moving-average ribbon and a live last-price line.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, roundedBox, mesh, col } from '../core/kit.js';
import { clamp, ease, lerp, fmtNum, rng } from '../core/util.js';

const W = 14, H = 4.5, Y0 = 0.14, YB = Y0 + 1.0, SEG = 420;

function niceStep(range, target = 4) {
  const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}
function monotone(ys) {
  const n = ys.length;
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = ys[i + 1] - ys[i];
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
  }
  return (x) => {
    const i = clamp(Math.floor(x), 0, n - 2), t = clamp(x - i), t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m[i + 1];
  };
}

function generate(p) {
  const n = clamp(Math.round(p.count ?? 56), 8, 140), r = rng((p.seed ?? 7) * 7919 + 13);
  const g = () => (r() + r() + r() - 1.5) * 1.15;
  const trend = p.trend ?? 'up';
  const out = [];
  let o = Number(p.startPrice ?? 100);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    let drift = 0.009, vol = 0.022;
    if (trend === 'down') drift = -0.008;
    else if (trend === 'volatile') { drift = 0.0005; vol = 0.042; }
    else if (trend === 'crash') { drift = u < 0.6 ? 0.011 : u < 0.8 ? -0.042 : 0.004; vol = u >= 0.6 && u < 0.8 ? 0.03 : 0.02; }
    const c = Math.max(o * (1 + drift + vol * g()), 0.01);
    const h = Math.max(o, c) * (1 + Math.abs(g()) * vol * 0.55), l = Math.min(o, c) * (1 - Math.abs(g()) * vol * 0.55);
    out.push([o, h, l, c, 0.5 + Math.abs(c - o) / o * 22 + r() * 0.6]);
    o = c * (1 + g() * 0.002);
  }
  return out;
}

function layout(p) {
  let cs = Array.isArray(p.candles) && p.candles.length >= 2 ? p.candles.slice(0, 160).map((c) => c.map(Number)) : generate(p);
  cs = cs.map((c, i) => ({ o: c[0], h: Math.max(c[1], c[0], c[3]), l: Math.min(c[2], c[0], c[3]), c: c[3], v: c[4] ?? (0.5 + Math.abs(c[3] - c[0]) / Math.max(c[0], 1e-9) * 22), up: c[3] >= c[0], i }));
  const n = cs.length;
  const pmax = Math.max(...cs.map((c) => c.h)), pmin = Math.min(...cs.map((c) => c.l));
  const pad = (pmax - pmin || 1) * 0.07, lo = pmin - pad, hi = pmax + pad;
  const toY = (v) => YB + ((v - lo) / (hi - lo)) * H;
  const pitch = W / n, xs = cs.map((_, i) => -W / 2 + pitch * (i + 0.5));
  const step = niceStep(hi - lo, 4), ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const vmax = Math.max(...cs.map((c) => c.v), 1e-9);
  const m = Math.max(3, Math.round(n / 7));
  const ma = cs.map((_, i) => { let s = 0, k = 0; for (let j = Math.max(0, i - m + 1); j <= i; j++) { s += cs[j].c; k++; } return s / k; });
  return { cs, n, lo, hi, toY, pitch, xs, ticks, step, vmax, ma, yFirst: toY(cs[0].o), yLast: toY(cs[n - 1].c) };
}

export default {
  name: 'candles',
  description: 'Stock candlestick chart in 3D. Candles form one after another left→right (green/up = theme accent, red/down = theme danger) with volume bars along the floor, a moving-average ribbon and a live last-price line + label. Use real OHLC data or let it generate a seeded illustrative series (label illustrative data as such in narration).',
  params: {
    candles: '[[open, high, low, close, volume?], ...] real OHLC data (2–160 candles). If omitted an ILLUSTRATIVE series is generated from count/seed/trend.',
    count: 'Number of generated candles (default 56)', seed: 'Seed for the generated series', trend: "'up' | 'down' | 'volatile' | 'crash' for the generated series", startPrice: 'First open of the generated series (default 100)',
    ticker: 'Ticker / name shown top-left, e.g. "NVDA"', prefix: 'Price prefix, e.g. "$"', decimals: 'Price decimals (default 2)',
    showChange: 'false to hide the running % change under the ticker',
    drawDur: 'Seconds for all candles to appear (default ≈ 70 % of the shot)',
    cues: '{ draw: seconds when candles start forming (default 0.4) } — shot-local',
  },
  sample: { ticker: 'NVDA', prefix: '$', trend: 'up', seed: 4, count: 56 },
  framings: (p) => {
    const L = layout(p), yS = L.yFirst, yE = L.yLast;
    return {
      wide: { pos: [W * 0.28, 6.4, 17.6], target: [0, 2.55, 0], fov: 34 },
      front: { pos: [0, 5.2, 19], target: [0, 2.6, 0], fov: 32 },
      chase_start: { pos: [-W / 2 + 0.2, yS + 2.6, 11.5], target: [-W / 2 + 3, yS * 0.7 + 0.4, 0], fov: 36 },
      chase_end: { pos: [W / 2 - 4.2, yE * 0.7 + 2.6, 11.5], target: [W / 2 - 1.8, yE * 0.7, 0], fov: 36 },
      low: { pos: [-W * 0.22, 0.9, 18], target: [0, 2.9, 0], fov: 36 },
      end: { pos: [W / 2 + 5.5, 5.8, 13], target: [W / 2 - 3.4, 2.5, -0.2], fov: 34 },
      top: { pos: [0, 16, 14.5], target: [0, 2.2, 0], fov: 34 },
    };
  },
  defaultCamera: { from: 'wide', to: 'front', orbit: 12 },
  look: { bloom: 0.45 },

  build(ctx, p) {
    const { theme } = ctx;
    const L = layout(p), n = L.n;
    const base = createBase(ctx, { fog: 0.018, shadowSize: 13, glow: 0.006, rim: 0.5 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.07, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 320, extent: [18, 8, 14] });

    const zBack = -0.75;
    mesh(roundedBox(W + 1.5, 0.14, 2.7, 0.18, 0.02), M.plastic('#0b0f15', 0.62), { pos: [0, 0.07, 0.1], parent: scene });
    const edge = mesh(new THREE.BoxGeometry(W + 1.0, 0.012, 0.03), M.glow(theme.accent, 1.2), { pos: [0, 0.146, 1.28], parent: scene, shadow: false });
    const gridMat = new THREE.MeshBasicMaterial({ color: col(theme.textDim), transparent: true, opacity: 0.15, depthWrite: false, toneMapped: false });
    L.ticks.forEach((v) => mesh(new THREE.BoxGeometry(W + 0.6, 0.014, 0.014), gridMat, { pos: [0, L.toY(v), zBack], parent: scene, shadow: false }));

    const upC = theme.accent, dnC = theme.danger;
    const bw = Math.min(L.pitch * 0.64, 0.5), bd = Math.min(bw, 0.34);
    const mkMat = (c) => new THREE.MeshStandardMaterial({ color: col(c).multiplyScalar(0.55), emissive: col(c), emissiveIntensity: 0.6, roughness: 0.32, metalness: 0.25 });
    const mkVol = (c) => new THREE.MeshStandardMaterial({ color: col(c).multiplyScalar(0.35), emissive: col(c), emissiveIntensity: 0.22, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.8 });
    const ups = L.cs.filter((c) => c.up), dns = L.cs.filter((c) => !c.up);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mkInst = (mat, count, shadow = true) => { const im = new THREE.InstancedMesh(box, mat, Math.max(count, 1)); im.count = count; im.castShadow = shadow; im.receiveShadow = false; im.frustumCulled = false; scene.add(im); return im; };
    const sets = [
      { list: ups, body: mkInst(mkMat(upC), ups.length), wick: mkInst(mkMat(upC), ups.length, false), vol: mkInst(mkVol(upC), ups.length, false) },
      { list: dns, body: mkInst(mkMat(dnC), dns.length), wick: mkInst(mkMat(dnC), dns.length, false), vol: mkInst(mkVol(dnC), dns.length, false) },
    ];

    // moving-average ribbon
    const maY = monotone(L.ma.map(L.toY));
    class MACurve extends THREE.Curve {
      getPoint(t, target = new THREE.Vector3()) { return target.set(L.xs[0] + t * (L.xs[n - 1] - L.xs[0]), maY(t * (n - 1)), bd / 2 + 0.1); }
      getPointAt(u, target) { return this.getPoint(u, target); }
      getTangentAt(u, target) { return this.getTangent(u, target); }
    }
    const maTube = mesh(new THREE.TubeGeometry(new MACurve(), SEG, 0.032, 6, false), M.glow(theme.accent2, 1.5), { parent: scene, shadow: false });
    maTube.frustumCulled = false;

    // last-price line
    const priceMat = new THREE.MeshBasicMaterial({ color: col(upC), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    const priceLine = mesh(new THREE.BoxGeometry(W + 0.6, 0.02, 0.02), priceMat, { parent: scene, shadow: false });
    const headLight = new THREE.PointLight(col(upC), 0, 7, 1.7); scene.add(headLight);

    const dec = p.decimals ?? 2;
    const fmt = (v, d = dec) => fmtNum(v, { decimals: d, prefix: p.prefix ?? '' });
    const tickDec = L.step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(L.step) - 1e-9));
    const anchors = { last: new THREE.Vector3(), first: new THREE.Vector3(L.xs[0], L.yFirst, 0), high: new THREE.Vector3(), low: new THREE.Vector3(), ticker: new THREE.Vector3(-W / 2 - 0.3, YB + H + 0.75, zBack) };
    { let hi = L.cs[0], lo = L.cs[0]; for (const c of L.cs) { if (c.h > hi.h) hi = c; if (c.l < lo.l) lo = c; } anchors.high.set(L.xs[hi.i], L.toY(hi.h), 0); anchors.low.set(L.xs[lo.i], L.toY(lo.l), 0); }
    const dm = new THREE.Object3D();
    const st = { price: L.cs[0].o, up: true, ga: 1, prog: 0, y: L.yFirst, x: L.xs[0] };
    const cUp = col(upC), cDn = col(dnC);

    return {
      scene, anchors,
      update(f) {
        const t = f.t, cues = f.params.cues || {};
        dust.update(t);
        const td = cues.draw != null ? f.shotT - cues.draw : (f.prevParams ? 1e3 : t - 0.4);
        const dd = Math.max(0.5, Number(p.drawDur) || Math.max(2.5, f.dur * 0.7));
        const FORM = Math.max(0.3, dd / n * 1.6);
        st.ga = clamp(t / 0.8 + (f.prevParams ? 1 : 0));
        gridMat.opacity = 0.15 * st.ga;
        let lastI = 0;
        for (const set of sets) {
          set.list.forEach((c, j) => {
            const k = ease.outCubic(clamp((td - (c.i / n) * dd) / FORM));
            if (k > 0 && c.i > lastI) lastI = c.i;
            const cc = lerp(c.o, c.c, k), hh = lerp(c.o, c.h, k), ll = lerp(c.o, c.l, k);
            const y0 = L.toY(Math.min(c.o, cc)), y1 = L.toY(Math.max(c.o, cc));
            const bh = Math.max(y1 - y0, 0.025), vis = k > 0 ? 1 : 0.0001;
            dm.position.set(L.xs[c.i], (y0 + y1) / 2, 0); dm.scale.set(bw * vis, bh * vis, bd * vis); dm.updateMatrix(); set.body.setMatrixAt(j, dm.matrix);
            const w0 = L.toY(ll), w1 = L.toY(hh);
            dm.position.set(L.xs[c.i], (w0 + w1) / 2, 0); dm.scale.set(Math.max(bw * 0.12, 0.025) * vis, Math.max(w1 - w0, 0.02) * vis, Math.max(bw * 0.12, 0.025) * vis); dm.updateMatrix(); set.wick.setMatrixAt(j, dm.matrix);
            const vh = Math.max((c.v / L.vmax) * 0.78 * k, 0.001);
            dm.position.set(L.xs[c.i], Y0 + vh / 2, 0); dm.scale.set(bw * vis, vh, bd * vis); dm.updateMatrix(); set.vol.setMatrixAt(j, dm.matrix);
          });
          set.body.instanceMatrix.needsUpdate = true; set.wick.instanceMatrix.needsUpdate = true; set.vol.instanceMatrix.needsUpdate = true;
        }
        const lc = L.cs[lastI];
        const lk = ease.outCubic(clamp((td - (lc.i / n) * dd) / FORM));
        st.price = lerp(lc.o, lc.c, lk); st.up = st.price >= L.cs[0].o; st.y = L.toY(st.price); st.x = L.xs[lastI];
        st.prog = clamp(td / dd);
        maTube.geometry.setDrawRange(0, Math.floor(clamp((lastI + lk - 0.5) / Math.max(n - 1, 1)) * SEG) * 6 * 6);
        const pc = st.up ? cUp : cDn;
        priceMat.color.copy(pc).multiplyScalar(1.2 + 0.25 * Math.sin(t * 3.1));
        priceMat.opacity = 0.75 * clamp(td / 0.3);
        priceLine.position.set(0, st.y, bd / 2 + 0.02);
        headLight.color.copy(pc); headLight.intensity = 2.6 * clamp(td / 0.3); headLight.position.set(st.x, st.y, 1.1);
        anchors.last.set(st.x, st.y, 0);
        edge.material.color.copy(edge.material.userData.baseColor).multiplyScalar(1.05 + 0.25 * Math.sin(t * 0.9));
      },
      labels() {
        const out = [], ga = st.ga;
        L.ticks.forEach((v) => out.push({ pos: new THREE.Vector3(-W / 2 - 0.5, L.toY(v), zBack), text: fmt(v, tickDec), size: 21, weight: 500, font: 'mono', color: theme.textDim, alpha: 0.75 * ga, align: 'right' }));
        const lc = st.up ? theme.accent : theme.danger;
        out.push({ pos: new THREE.Vector3(W / 2 + 0.45, st.y, 0.2), text: fmt(st.price), size: 30, weight: 700, font: 'mono', bg: true, color: lc, alpha: ga * clamp(st.prog * 40), align: 'left' });
        if (p.ticker) out.push({ pos: anchors.ticker, text: String(p.ticker), size: 46, weight: 700, alpha: ga, align: 'left' });
        if (p.showChange !== false) {
          const ch = (st.price / L.cs[0].o - 1) * 100;
          out.push({ pos: anchors.ticker, text: `${ch >= 0 ? '+' : '−'}${Math.abs(ch).toFixed(1)}%`, size: 30, weight: 700, font: 'mono', color: lc, alpha: ga * clamp(st.prog * 40), align: 'left', dy: p.ticker ? 48 : 0 });
        }
        return out;
      },
    };
  },
};
