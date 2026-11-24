// Data-driven 3D bar chart on the studio floor. Bars grow from zero with a
// stagger, values count up above them, one bar can be highlighted.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, roundedBox, mesh, canvasTex, col } from '../core/kit.js';
import { clamp, ease, lerp, fmtNum } from '../core/util.js';

const H = 5.0; // world height of the full value range

function niceStep(range, target = 4) {
  const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

function layout(p) {
  const data = (p.data && p.data.length ? p.data : [{ label: 'A', value: 1 }]).slice(0, 16);
  const n = data.length;
  const W = clamp(n * 1.55, 5.5, 13);
  const pitch = W / n;
  const bw = Math.min(pitch * 0.62, 1.5);
  const depth = Math.min(bw, 1.0);
  const vals = data.map((d) => Number(d.value) || 0);
  const vmax = Math.max(...vals, 0), vmin = Math.min(...vals, 0);
  let hi = p.maxValue != null ? Number(p.maxValue) : vmax, lo = vmin < 0 ? vmin : 0;
  if (hi <= lo) hi = lo + 1;
  const step = niceStep(hi - lo);
  if (p.maxValue == null) hi = Math.ceil(hi / step - 1e-9) * step;
  if (lo < 0) lo = Math.floor(lo / step + 1e-9) * step;
  const scale = H / (hi - lo);
  const baseY = 0.14 - lo * scale;
  const xs = data.map((_, i) => -W / 2 + pitch * (i + 0.5));
  let tallest = 0; vals.forEach((v, i) => { if (v > vals[tallest]) tallest = i; });
  return { data, n, W, pitch, bw, depth, vals, hi, lo, step, scale, baseY, xs, tallest };
}

export default {
  name: 'bar_chart',
  description: 'Data-driven 3D bar chart on a reflective studio floor. Bars grow from zero one after another, value labels count up above each bar, category labels sit in front, and one bar can be highlighted (the others dim). Heights are exactly proportional to the data.',
  params: {
    data: '[{label, value, color?}] — 2 to 12 bars (max 16). Heights are proportional to value; negative values drop below the baseline.',
    prefix: 'Text before each value, e.g. "$"',
    suffix: 'Text after each value, e.g. "B" or "%"',
    decimals: 'Decimal places for value labels (default 0)',
    compact: 'true → 1.2K / 3.4M / 5.6B / 7.8T formatting of raw numbers',
    highlight: 'Index of the bar to emphasise (accent glow, others dim). Omit or -1 for none. Tweens when a continued shot changes it.',
    title: 'Optional chart title shown top-left of the back grid',
    subtitle: 'Optional small line under the title (unit, source period ...)',
    maxValue: 'Optional top of the value axis (default: rounded-up max of the data)',
    cues: '{ grow: seconds when bars start growing (default 0.3), highlight: seconds when the highlight kicks in (default: after growth) } — shot-local times, may be "@word" in the storyboard',
  },
  sample: {
    title: 'Data-center revenue', subtitle: 'USD billions, fiscal year', prefix: '$', suffix: 'B', decimals: 1, highlight: 4,
    data: [{ label: 'FY21', value: 6.7 }, { label: 'FY22', value: 10.6 }, { label: 'FY23', value: 15.0 }, { label: 'FY24', value: 47.5 }, { label: 'FY25', value: 115.2 }],
  },
  framings: (p) => {
    const L = layout(p), W = L.W, d = W * 0.95 + 7.2;
    const xt = L.xs[L.tallest], ht = L.baseY + Math.max(L.vals[L.tallest], 0) * L.scale;
    const xl = L.xs[L.n - 1], hl = L.baseY + Math.max(L.vals[L.n - 1], 0) * L.scale;
    return {
      wide: { pos: [W * 0.42, H * 1.12, d], target: [0, H * 0.4, 0], fov: 34 },
      front: { pos: [0, H * 1.0, d + 1], target: [0, H * 0.4, 0], fov: 32 },
      left: { pos: [-W * 0.8 - 3.8, H * 1.1, d * 0.92], target: [-0.3, H * 0.42, 0], fov: 34 },
      right: { pos: [W * 0.8 + 3.8, H * 1.1, d * 0.92], target: [0.3, H * 0.42, 0], fov: 34 },
      hero: { pos: [xt - Math.sign(xt || 1) * (W * 0.6 + 3.5), ht * 0.5 + 2.6, d * 0.78], target: [xt * 0.5, H * 0.42, 0], fov: 32 },
      top: { pos: [0, H + W * 0.9 + 5, W * 0.55 + 4], target: [0, H * 0.3, 0.3], fov: 34 },
      low: { pos: [W * 0.3, 0.9, d * 0.9], target: [0, H * 0.46, 0], fov: 36 },
      last: { pos: [xl + 4.2, hl * 0.5 + 3.2, 11], target: [xl - 1.2, hl * 0.5 - 0.5, 0], fov: 34 },
    };
  },
  defaultCamera: { from: 'wide', to: 'front', orbit: 10 },
  look: { bloom: 0.45 },

  build(ctx, p) {
    const { theme } = ctx;
    const L = layout(p);
    const base = createBase(ctx, { fog: 0.02, shadowSize: 12, glow: 0.006, rim: 0.6 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.07, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 300, extent: [16, 8, 14] });

    const zBack = -L.depth / 2 - 0.9;
    // plinth
    mesh(roundedBox(L.W + 1.3, 0.14, L.depth + 2.1, 0.18, 0.02), M.plastic('#0b0f15', 0.62), { pos: [0, 0.07, 0.25], parent: scene });
    const edge = mesh(new THREE.BoxGeometry(L.W + 0.9, 0.012, 0.03), M.glow(theme.accent, 1.3), { pos: [0, 0.146, L.depth / 2 + 1.16], parent: scene, shadow: false });

    // back grid: horizontal value lines
    const ticks = [];
    for (let v = Math.ceil(L.lo / L.step - 1e-9) * L.step; v <= L.hi + L.step * 1e-6; v += L.step) ticks.push(Math.abs(v) < L.step * 1e-6 ? 0 : v);
    const gridMat = new THREE.MeshBasicMaterial({ color: col(theme.textDim), transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
    const zeroMat = new THREE.MeshBasicMaterial({ color: col(theme.textDim), transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
    const gridLines = ticks.map((v) => mesh(new THREE.BoxGeometry(L.W + 1.0, 0.014, 0.014), v === 0 ? zeroMat : gridMat, { pos: [0, 0.14 + (v - L.lo) * L.scale, zBack], parent: scene, shadow: false }));
    // soft vertical back-panel glow so bars read against the dark
    const panel = mesh(new THREE.PlaneGeometry(L.W + 1.0, H + 0.2), new THREE.MeshBasicMaterial({
      map: canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }),
      color: col(theme.accent), transparent: true, opacity: 0.05, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    }), { pos: [0, 0.14 + H / 2, zBack - 0.02], parent: scene, shadow: false });

    // bars
    const gradTex = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#121212'); gr.addColorStop(0.55, '#6e6e6e'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { srgb: true });
    const barGeo = roundedBox(L.bw, 1, L.depth, Math.min(0.09, L.bw * 0.16), 0.006);
    { // uv.y = normalised height so the gradient stretches with the bar
      const pos = barGeo.attributes.position, uv = barGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5, clamp(pos.getY(i) + 0.5));
      uv.needsUpdate = true;
    }
    const capGeo = roundedBox(L.bw, 0.035, L.depth, Math.min(0.09, L.bw * 0.16), 0.004);
    const dimCol = col(theme.metal).lerp(col(theme.bg1), 0.45);
    const bars = L.data.map((d, i) => {
      const c = col(d.color ?? theme.accent);
      const mat = new THREE.MeshPhysicalMaterial({ color: c.clone().multiplyScalar(0.3), metalness: 0.45, roughness: 0.24, clearcoat: 0.8, clearcoatRoughness: 0.18, emissive: c.clone(), emissiveMap: gradTex, emissiveIntensity: 0.7 });
      const body = mesh(barGeo, mat, { parent: scene });
      const capMat = M.glow(d.color ?? theme.accent, 1.7);
      const cap = mesh(capGeo, capMat, { parent: scene, shadow: false });
      const v = L.vals[i];
      return { body, cap, mat, capMat, c, v, x: L.xs[i], h: Math.abs(v) * L.scale, sign: v < 0 ? -1 : 1, top: new THREE.Vector3() };
    });

    const fmtD = (v, dec) => (v < 0 ? '-' : '') + fmtNum(Math.abs(v), { decimals: dec, prefix: p.prefix ?? '', suffix: p.suffix ?? '', compact: !!p.compact });
    const fmt = (v) => fmtD(v, p.decimals ?? 0);
    let tickDec = 0; // fewest decimals that keep every axis label distinct
    for (; tickDec < 4; tickDec++) if (new Set(ticks.map((v) => fmtD(v, tickDec))).size === ticks.length) break;
    const fmtTick = (v) => fmtD(v, tickDec);
    const stagger = Math.min(0.2, 1.3 / L.n), GROW = 1.35;
    const growEnd = (L.n - 1) * stagger + GROW;

    const anchors = { title: new THREE.Vector3(-L.W / 2 - 0.4, 0.14 + H + 0.75, zBack), tallest: new THREE.Vector3(), last: new THREE.Vector3() };
    bars.forEach((b, i) => { anchors['bar' + i] = b.top; });

    const state = { g: bars.map(() => 0), w: bars.map(() => 0), active: 0 };
    const tmpC = new THREE.Color();
    const hlIndex = (pp) => (pp && pp.highlight != null && pp.highlight >= 0 && pp.highlight < L.n ? Math.round(pp.highlight) : -1);

    return {
      scene, anchors,
      update(f) {
        const t = f.t, cues = f.params.cues || {};
        dust.update(t);
        // growth clock: cue in this shot, else already grown for continued shots
        const tg = cues.grow != null ? f.shotT - cues.grow : (f.prevParams ? 1e3 : t - 0.3);
        // highlight tween between previous and current shot
        const hp = f.prevParams ? hlIndex(f.prevParams) : -1, hc = hlIndex(f.params);
        const th = cues.highlight != null ? cues.highlight : (f.prevParams ? 0.4 : 0.3 + growEnd * 0.85);
        const k = ease.inOutCubic(clamp((f.shotT - th) / 0.9));
        state.active = lerp(hp >= 0 ? 1 : 0, hc >= 0 ? 1 : 0, k);
        bars.forEach((b, i) => {
          const g = ease.outCubic(clamp((tg - i * stagger) / GROW));
          const w = (i === hp ? 1 - k : 0) + (i === hc ? k : 0);
          state.g[i] = g; state.w[i] = Math.min(w, 1);
          const h = Math.max(b.h * g, 0.002);
          b.body.scale.set(1, h, 1);
          b.body.position.set(b.x, L.baseY + b.sign * h / 2, 0);
          const yTop = L.baseY + b.sign * h;
          b.cap.position.set(b.x, yTop + b.sign * 0.012, 0);
          b.top.set(b.x, Math.max(yTop, L.baseY) + 0.02, 0);
          const dim = state.active * (1 - state.w[i]);      // 1 → dimmed
          const hot = state.w[i];
          tmpC.copy(b.c).lerp(dimCol, dim * 0.62);
          b.mat.color.copy(tmpC).multiplyScalar(0.3);
          b.mat.emissive.copy(tmpC);
          const shimmer = 1 + 0.06 * Math.sin(t * 1.7 + i * 1.3);
          b.mat.emissiveIntensity = (0.7 - 0.42 * dim + 0.55 * hot) * shimmer * (0.3 + 0.7 * g);
          b.capMat.color.copy(tmpC).multiplyScalar((1.7 - 1.0 * dim + 1.3 * hot) * shimmer * (0.3 + 0.7 * clamp(g * 3)));
        });
        anchors.tallest.copy(bars[L.tallest].top);
        anchors.last.copy(bars[L.n - 1].top);
        edge.material.color.copy(edge.material.userData.baseColor).multiplyScalar(1.1 + 0.25 * Math.sin(t * 0.9));
        panel.material.opacity = 0.05 * clamp(t / 1.2 + (f.prevParams ? 1 : 0));
        const ga = clamp(t / 0.8 + (f.prevParams ? 1 : 0));
        gridMat.opacity = 0.16 * ga; zeroMat.opacity = 0.4 * ga;
        state.ga = ga;
      },
      labels(f) {
        const out = [];
        const ga = state.ga ?? 1;
        // label sizing: estimate how many px one bar pitch gets in the default framings
        const pxPerUnit = 1080 / (L.W + 4.5);
        const pitchPx = L.pitch * pxPerUnit;
        const longest = Math.max(...L.data.map((d) => String(d.label ?? '').length), 1);
        let cs = clamp(pitchPx * 0.92 / (longest * 0.58), 17, 30);
        const crowded = longest * 0.58 * cs > pitchPx * 0.95;
        const vlen = Math.max(...L.vals.map((v) => fmt(v).length), 1);
        const vs = clamp(pitchPx * 0.98 / (vlen * 0.6), 18, 36);
        bars.forEach((b, i) => {
          const g = state.g[i], dim = state.active * (1 - state.w[i]);
          const a = clamp(g * 4) * (1 - 0.45 * dim);
          if (a > 0.01) {
            const below = b.sign < 0;
            out.push({ pos: b.top.clone().setY(below ? L.baseY - b.h * g - 0.05 : b.top.y), text: fmt(b.v * g), size: vs * (1 + 0.12 * state.w[i]), weight: 700, color: state.w[i] > 0.5 ? theme.text : theme.text, alpha: a, dy: below ? vs * 0.9 : -vs * 0.85 });
          }
          if (b.v !== undefined && L.data[i].label != null)
            out.push({ pos: new THREE.Vector3(b.x, 0.15, L.depth / 2 + 0.66), text: String(L.data[i].label), size: cs, weight: 600, font: 'body', color: state.w[i] > 0.5 ? theme.accent : theme.textDim, alpha: ga * (1 - 0.35 * dim), dy: crowded && i % 2 ? cs * 1.25 : 0 });
        });
        ticks.forEach((v, i) => {
          if (i === 0 && L.lo === 0) return; // skip the 0 on the floor
          out.push({ pos: new THREE.Vector3(-L.W / 2 - 0.65, 0.14 + (v - L.lo) * L.scale, zBack), text: fmtTick(v), size: 21, weight: 500, font: 'mono', color: theme.textDim, alpha: 0.75 * ga, align: 'right' });
        });
        if (p.title) out.push({ pos: anchors.title, text: String(p.title), sub: p.subtitle, size: 38, weight: 700, alpha: ga, align: 'left', dx: 0 });
        return out;
      },
    };
  },
};
