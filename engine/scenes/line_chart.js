// 3D line / area chart that draws itself left→right: glowing tube with a bright
// head, gradient area underneath, grid, axis labels, live value and event markers.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, roundedBox, mesh, canvasTex, col } from '../core/kit.js';
import { clamp, ease, lerp, fmtNum } from '../core/util.js';

const W = 12, H = 5, Y0 = 0.14, ZGAP = 0.9, SEG = 480;

function niceStep(range, target = 4) {
  const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

/** Monotone cubic (Fritsch–Carlson): smooth, passes through every point, never overshoots. */
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

function layout(p) {
  let series = (p.series && p.series.length ? p.series : [{ data: p.data || [1, 2, 3] }]).slice(0, 3)
    .map((s) => ({ ...s, data: (s.data || []).map(Number).filter((v) => Number.isFinite(v)) })).filter((s) => s.data.length >= 2);
  if (!series.length) series = [{ data: [1, 2, 3] }];
  const all = series.flatMap((s) => s.data);
  const vmax = Math.max(...all), vmin = Math.min(...all);
  const log = !!p.logScale && vmin > 0;
  let lo, hi, ticks = [], toY, fromY, step = 1;
  if (log) {
    lo = Math.pow(10, Math.floor(Math.log10(vmin) + 1e-9)); hi = Math.pow(10, Math.ceil(Math.log10(vmax) - 1e-9));
    if (hi <= lo) hi = lo * 10;
    const l0 = Math.log10(lo), l1 = Math.log10(hi);
    toY = (v) => Y0 + ((Math.log10(Math.max(v, lo * 1e-6)) - l0) / (l1 - l0)) * H;
    fromY = (y) => Math.pow(10, l0 + ((y - Y0) / H) * (l1 - l0));
    for (let e = Math.round(l0); e <= Math.round(l1); e++) ticks.push(Math.pow(10, e));
  } else {
    lo = p.yMin != null ? Number(p.yMin) : Math.min(0, vmin); hi = p.yMax != null ? Number(p.yMax) : vmax;
    if (hi <= lo) hi = lo + 1;
    step = niceStep(hi - lo);
    if (p.yMax == null) hi = Math.ceil(hi / step - 1e-9) * step;
    if (p.yMin == null && lo < 0) lo = Math.floor(lo / step + 1e-9) * step;
    toY = (v) => Y0 + ((v - lo) / (hi - lo)) * H;
    fromY = (y) => lo + ((y - Y0) / H) * (hi - lo);
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  }
  series.forEach((s, k) => {
    s.n = s.data.length; s.z = -k * ZGAP;
    s.ys = s.data.map(toY);
    s.yAt = monotone(s.ys);            // world height at fractional index
    s.yStart = s.ys[0]; s.yEnd = s.ys[s.n - 1];
  });
  return { series, lo, hi, ticks, toY, fromY, log, S: series.length };
}

class DataCurve extends THREE.Curve {
  constructor(s) { super(); this.s = s; }
  getPoint(t, target = new THREE.Vector3()) { return target.set(-W / 2 + t * W, this.s.yAt(t * (this.s.n - 1)), this.s.z); }
  getPointAt(u, target) { return this.getPoint(u, target); }       // parameterise by x so progress == time axis
  getTangentAt(u, target) { return this.getTangent(u, target); }
}

export default {
  name: 'line_chart',
  description: 'Growth-over-time chart in 3D (stock price, revenue, users ...). A glowing line draws itself left→right with a bright head and live value label, a translucent area fills in beneath, axis labels and optional event markers pop as the head passes. Up to 3 series. Values are plotted exactly (zero-based axis unless yMin/logScale is set).',
  params: {
    series: '[{label?, color?, data: [numbers]}] — 1 to 3 series (each ≥ 2 points). Shorthand: `data: [numbers]` for one series.',
    xLabels: '[strings] labels along the time axis (same length as the data, or any shorter list spread evenly)',
    prefix: 'Text before values, e.g. "$"', suffix: 'Text after values, e.g. "B"', decimals: 'Decimal places (default 0)', compact: 'true → K/M/B/T formatting',
    title: 'Optional chart title (top-left)', subtitle: 'Optional small line under the title',
    drawDur: 'Seconds the line takes to draw (default ≈ 70 % of the shot). For chase_start→chase_end camera moves set it close to the shot length.',
    markers: '[{index, label, series?}] event markers that pop when the head passes data index `index`',
    logScale: 'true → logarithmic value axis (all values must be > 0)',
    yMin: 'Optional axis minimum (default 0 — honest zero-based axis)', yMax: 'Optional axis maximum',
    cues: '{ draw: seconds when the line starts drawing (default 0.4) } — shot-local',
  },
  sample: {
    title: 'Share price', subtitle: 'USD, split-adjusted', prefix: '$', decimals: 0,
    xLabels: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
    series: [{ label: 'NVDA', data: [6, 13, 29, 15, 49, 134, 177] }],
    markers: [{ index: 3, label: 'ChatGPT launch' }, { index: 5, label: 'AI boom' }],
  },
  framings: (p) => {
    const L = layout(p), s = L.series[0], yS = s.yStart, yE = s.yEnd;
    return {
      wide: { pos: [W * 0.3, H * 1.15, 18], target: [0, H * 0.42, 0], fov: 34 },
      front: { pos: [0, H * 0.95, 19.2], target: [0, H * 0.42, 0], fov: 32 },
      chase_start: { pos: [-W / 2 + 0.3, yS + 3.4, 12.5], target: [-W / 2 + 2.8, yS * 0.6 + 1.0, 0], fov: 36 },
      chase_end: { pos: [W / 2 - 4.0, yE * 0.7 + 3.0, 12.5], target: [W / 2 - 1.6, yE * 0.62, 0], fov: 36 },
      end: { pos: [W / 2 + 5.5, yE * 0.5 + 3.8, 11.5], target: [W / 2 - 3, yE * 0.5 - 0.7, -0.3], fov: 34 },
      low: { pos: [-W * 0.22, 0.9, 17.5], target: [0, H * 0.45, 0], fov: 36 },
      top: { pos: [0, 15.5, 14], target: [0, H * 0.36, 0], fov: 34 },
    };
  },
  defaultCamera: { from: 'wide', to: 'front', orbit: 12 },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const L = layout(p), S = L.S;
    const base = createBase(ctx, { fog: 0.018, shadowSize: 12, glow: 0.006, rim: 0.5 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.07, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 320, extent: [18, 8, 14] });

    const zBack = -(S - 1) * ZGAP - 0.75, zFront = 0.85;
    const depth = zFront - zBack + 0.9;
    mesh(roundedBox(W + 1.5, 0.14, depth, 0.18, 0.02), M.plastic('#0b0f15', 0.62), { pos: [0, 0.07, (zFront + zBack) / 2 + 0.25], parent: scene });
    const edge = mesh(new THREE.BoxGeometry(W + 1.0, 0.012, 0.03), M.glow(theme.accent, 1.2), { pos: [0, 0.146, zFront + 0.52], parent: scene, shadow: false });

    // grid
    const gridMat = new THREE.MeshBasicMaterial({ color: col(theme.textDim), transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
    const zeroMat = new THREE.MeshBasicMaterial({ color: col(theme.textDim), transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
    L.ticks.forEach((v) => mesh(new THREE.BoxGeometry(W + 0.6, 0.014, 0.014), v === 0 ? zeroMat : gridMat, { pos: [0, L.toY(v), zBack], parent: scene, shadow: false }));

    // x labels
    const n0 = L.series[0].n;
    let xl = (p.xLabels || []).map(String);
    const xLabels = xl.map((text, i) => ({ text, u: xl.length === 1 ? 0 : i / (xl.length - 1) }));
    const keepEvery = Math.max(1, Math.ceil(xLabels.length / 9));
    const xShown = xLabels.filter((_, i) => i % keepEvery === 0 || i === xLabels.length - 1);
    // drop the second-to-last if it crowds the last
    if (xShown.length > 2 && xShown[xShown.length - 1].u - xShown[xShown.length - 2].u < 0.075) xShown.splice(xShown.length - 2, 1);
    xShown.forEach((l) => mesh(new THREE.BoxGeometry(0.014, 0.014, zFront - zBack), gridMat, { pos: [-W / 2 + l.u * W, 0.146, (zFront + zBack) / 2], parent: scene, shadow: false }));

    const palette = [theme.accent, theme.accent2, theme.warm];
    const fmt = (v) => (v < 0 ? '-' : '') + fmtNum(Math.abs(v), { decimals: p.decimals ?? 0, prefix: p.prefix ?? '', suffix: p.suffix ?? '', compact: !!p.compact });
    const fmtD = (v, dec) => (v < 0 ? '-' : '') + fmtNum(Math.abs(v), { decimals: dec, prefix: p.prefix ?? '', suffix: p.suffix ?? '', compact: !!p.compact });
    let tickDec = 0;
    for (; tickDec < 4; tickDec++) if (new Set(L.ticks.map((v) => fmtD(v, tickDec))).size === L.ticks.length) break;

    const haloTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    const NA = 240;
    const lines = L.series.map((s, k) => {
      const color = s.color ?? palette[k % palette.length];
      const curve = new DataCurve(s);
      const tube = mesh(new THREE.TubeGeometry(curve, SEG, k === 0 ? 0.06 : 0.05, 8, false), M.glow(color, 1.55), { parent: scene, shadow: false });
      tube.frustumCulled = false;
      // area under the curve
      const pos = new Float32Array((NA + 1) * 6), uv = new Float32Array((NA + 1) * 4), idx = [];
      for (let i = 0; i <= NA; i++) {
        const u = i / NA, x = -W / 2 + u * W, y = s.yAt(u * (s.n - 1));
        pos.set([x, y, s.z, x, Y0 + 0.01, s.z], i * 6); uv.set([u, 1, u, 0], i * 4);
        if (i < NA) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ag.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); ag.setIndex(idx);
      const areaMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: col(color) }, uProgress: { value: 0 }, uOpacity: { value: k === 0 ? 0.95 : 0.6 }, uCols: { value: Math.max(s.n - 1, 1) }, uTime: { value: 0 }, uTop: { value: H } },
        vertexShader: `varying vec2 vUv; varying float vY; void main(){ vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uProgress, uOpacity, uCols, uTime, uTop; varying vec2 vUv; varying float vY;
          void main(){
            if (vUv.x > uProgress) discard;
            float hgt = clamp(vY / uTop, 0.0, 1.0);
            float a = pow(max(vUv.y, 0.0), 1.6) * (0.35 + 0.65 * hgt);
            float c = abs(fract(vUv.x * uCols + 0.5) - 0.5) / max(fwidth(vUv.x * uCols), 1e-5);
            a += (1.0 - min(c, 1.0)) * 0.10 * vUv.y;
            a *= 0.75 + 0.25 * smoothstep(0.25, 0.0, uProgress - vUv.x);
            gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
          }`,
      });
      const area = new THREE.Mesh(ag, areaMat); area.frustumCulled = false; area.renderOrder = 2; scene.add(area);
      const head = mesh(new THREE.SphereGeometry(k === 0 ? 0.15 : 0.12, 20, 14), M.glow(color, 2.4), { parent: scene, shadow: false });
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: col(color), transparent: true, opacity: S > 1 ? 0.35 : 0.55, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      scene.add(halo);
      const drop = mesh(new THREE.BoxGeometry(0.018, 1, 0.018), new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }), { parent: scene, shadow: false });
      const light = new THREE.PointLight(col(color), 0, 7, 1.7); scene.add(light);
      const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 8), M.glow(color, 2.6), 3);
      pulses.frustumCulled = false; scene.add(pulses);
      return { s, k, color, curve, tube, areaMat, head, halo, drop, light, pulses, hp: new THREE.Vector3(-W / 2, s.yStart, s.z), value: s.data[0] };
    });

    // markers
    const markers = (p.markers || []).map((m) => {
      const ln = lines[clamp(m.series ?? 0, 0, S - 1)], s = ln.s;
      const idx = clamp(Number(m.index) || 0, 0, s.n - 1);
      const u = idx / (s.n - 1), x = -W / 2 + u * W, y = s.yAt(idx);
      const g = new THREE.Group(); g.position.set(x, y, s.z); scene.add(g);
      mesh(new THREE.SphereGeometry(0.12, 16, 12), M.glow(theme.text, 2.2), { parent: g, shadow: false });
      mesh(new THREE.TorusGeometry(0.24, 0.018, 8, 32), M.glow(ln.color, 2.2), { parent: g, shadow: false });
      const stemH = Math.min(1.0, Y0 + H + 0.5 - y);
      mesh(new THREE.BoxGeometry(0.016, stemH, 0.016), new THREE.MeshBasicMaterial({ color: col(theme.text), transparent: true, opacity: 0.55, toneMapped: false }), { pos: [0, stemH / 2 + 0.14, 0], parent: g, shadow: false });
      return { g, u, label: String(m.label ?? ''), top: new THREE.Vector3(x, y + stemH + 0.2, s.z), k: 0 };
    });

    const anchors = { head: lines[0].hp, start: new THREE.Vector3(-W / 2, L.series[0].yStart, 0), end: new THREE.Vector3(W / 2, L.series[0].yEnd, 0), title: new THREE.Vector3(-W / 2 - 0.3, Y0 + H + 0.8, zBack) };
    markers.forEach((m, i) => { anchors['marker' + i] = m.top; });
    const dm = new THREE.Object3D(), v = new THREE.Vector3();
    const st = { prog: 0, ga: 1 };

    return {
      scene, anchors,
      update(f) {
        const t = f.t, cues = f.params.cues || {};
        dust.update(t);
        const td = cues.draw != null ? f.shotT - cues.draw : (f.prevParams ? 1e3 : t - 0.4);
        const dd = Math.max(0.5, Number(p.drawDur) || Math.max(2.5, f.dur * 0.7));
        const lin = clamp(td / dd);
        const prog = lerp(lin, ease.inOutSine(lin), 0.5);
        st.prog = prog;
        st.ga = clamp(t / 0.8 + (f.prevParams ? 1 : 0));
        gridMat.opacity = 0.16 * st.ga; zeroMat.opacity = 0.4 * st.ga;
        const done = clamp((td - dd) / 0.6);
        for (const ln of lines) {
          const s = ln.s;
          ln.tube.geometry.setDrawRange(0, Math.floor(prog * SEG) * 8 * 6);
          ln.areaMat.uniforms.uProgress.value = prog; ln.areaMat.uniforms.uTime.value = t;
          ln.curve.getPoint(prog, ln.hp);
          ln.value = prog >= 1 ? s.data[s.n - 1] : L.fromY(ln.hp.y);
          const pulse = 1 + 0.12 * Math.sin(t * 4.2 + ln.k);
          const vis = clamp(td / 0.25 + 0.0);
          ln.head.position.copy(ln.hp); ln.head.scale.setScalar(Math.max(vis * pulse, 0.001));
          ln.halo.position.copy(ln.hp); ln.halo.scale.setScalar(Math.max(vis * (S > 1 ? 0.75 : 1) * (1.5 + 0.3 * Math.sin(t * 2.1 + ln.k)), 0.001));
          const dh = Math.max(ln.hp.y - Y0, 0.001);
          ln.drop.scale.set(1, dh, 1); ln.drop.position.set(ln.hp.x, Y0 + dh / 2, s.z);
          ln.drop.material.opacity = 0.45 * vis;
          ln.light.position.set(ln.hp.x, ln.hp.y + 0.2, s.z + 0.8); ln.light.intensity = 3.2 * vis;
          // energy pulses that keep travelling along the drawn part of the line
          for (let j = 0; j < 3; j++) {
            const u = ((t * 0.11 + j / 3 + ln.k * 0.17) % 1) * prog;
            ln.curve.getPoint(u, v);
            const sc = Math.sin(clamp(u / Math.max(prog, 1e-3)) * Math.PI) * (0.4 + 0.6 * done) * (prog > 0.05 ? 1 : 0);
            dm.position.copy(v); dm.scale.setScalar(Math.max(sc, 0.001)); dm.updateMatrix(); ln.pulses.setMatrixAt(j, dm.matrix);
          }
          ln.pulses.instanceMatrix.needsUpdate = true;
        }
        for (const m of markers) {
          m.k = ease.outBack(clamp((prog - m.u) * dd / 0.45 + (prog >= 1 && m.u >= 1 ? 1 : 0)));
          if (prog < m.u) m.k = 0;
          m.g.scale.setScalar(Math.max(m.k, 0.001));
          m.g.children[1].rotation.y = t * 0.8;
        }
        edge.material.color.copy(edge.material.userData.baseColor).multiplyScalar(1.05 + 0.25 * Math.sin(t * 0.9));
      },
      labels(f) {
        const out = [], ga = st.ga, prog = st.prog;
        L.ticks.forEach((tv, i) => {
          if (!L.log && i === 0 && L.lo === 0) return;
          out.push({ pos: new THREE.Vector3(-W / 2 - 0.5, L.toY(tv), zBack), text: fmtD(tv, tickDec), size: 21, weight: 500, font: 'mono', color: theme.textDim, alpha: 0.75 * ga, align: 'right' });
        });
        xShown.forEach((l) => {
          const passed = clamp((prog - l.u) * 12 + 1);
          out.push({ pos: new THREE.Vector3(-W / 2 + l.u * W, 0.15, zFront + 0.2), text: l.text, size: 25, weight: 600, font: 'body', color: passed > 0.5 ? theme.text : theme.textDim, alpha: ga * (0.55 + 0.45 * passed) });
        });
        // live value labels
        if (S === 1) {
          const ln = lines[0], nearEnd = clamp((prog - 0.86) / 0.14);
          out.push({ pos: ln.hp, text: fmt(ln.value), sub: ln.s.label, size: 42, weight: 700, color: theme.text, alpha: clamp(prog * 30) * ga, dy: ln.s.label ? -84 : -54, dx: lerp(0, -46, nearEnd) });
        } else {
          // several series: labels sit to the right of each head, spread so they never overlap
          const PX = 100, GAP = 1.0; // approx px per world unit in default framings; min label spacing (world)
          const heads = lines.map((ln) => ({ ln, y: ln.hp.y })).sort((a, b) => a.y - b.y);
          let prev = -1e9;
          heads.forEach((h) => {
            const ly = Math.max(h.y, prev + GAP); prev = ly;
            out.push({ pos: h.ln.hp, text: fmt(h.ln.value), sub: h.ln.s.label, size: 30, weight: 700, color: theme.text, alpha: clamp(prog * 30) * ga, align: 'left', dx: 26, dy: -(ly - h.y) * PX - 10 });
          });
        }
        markers.forEach((m) => { if (m.k > 0.02) out.push({ pos: m.top, text: m.label, size: 25, weight: 600, bg: true, color: theme.text, alpha: clamp(m.k), dy: -6 }); });
        if (p.title) out.push({ pos: anchors.title, text: String(p.title), sub: p.subtitle, size: 38, weight: 700, alpha: ga, align: 'left' });
        return out;
      },
    };
  },
};
