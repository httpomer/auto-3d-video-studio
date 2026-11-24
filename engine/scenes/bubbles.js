// Size comparison: glossy spheres whose AREA is proportional to a value
// (market caps, revenues, parameter counts ...), lined up on the studio floor.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, anim, ease, fmtNum, lerp } from '../core/util.js';

export default {
  name: 'bubbles',
  description: 'Scale comparison with spheres: each item is a glossy sphere whose cross-section area is proportional to its value (so sizes are honest), lined up left→right with name and value labels. Use for market caps, revenue by company, model sizes, "X is bigger than A+B+C".',
  params: {
    items: '[{ label, value, color? }] — 2 to 7 items, shown in the order given',
    prefix: 'Value prefix, e.g. "$"', suffix: 'Value suffix, e.g. "B"', decimals: 'Decimals in value labels (default 0)', compact: 'true → 4200000000000 shows as 4.2T',
    highlight: 'Index to emphasise (-1 = none); tweens between continued shots',
    cues: 'item0, item1, … — shot-local times at which each sphere grows in',
  },
  sample: { items: [{ label: 'NVIDIA', value: 4300 }, { label: 'TSMC', value: 1100 }, { label: 'Broadcom', value: 1300 }, { label: 'AMD', value: 260 }, { label: 'Intel', value: 100 }], prefix: '$', suffix: 'B', highlight: 0 },
  framings: (p) => {
    const L = layout(p);
    const w = L.width, r = L.maxR;
    return {
      wide: { pos: [0, r * 1.2 + 2.5, w * 0.62 + r * 2.4 + 6], target: [0, r * 0.95, 0], fov: 34 },
      front: { pos: [0, r * 0.9, w * 0.66 + r * 2.2 + 6], target: [0, r * 0.9, 0], fov: 32 },
      hero: { pos: [L.xs[L.big] + r * 2.4 + 2, r * 1.3 + 1, r * 3 + 5], target: [L.xs[L.big] * 0.6, r * 0.9, 0], fov: 32 },
      low: { pos: [-w * 0.3, 0.7, w * 0.5 + r * 2 + 5], target: [0, r * 1.0, 0], fov: 36 },
      top: { pos: [0, w * 0.75 + r * 2 + 8, 5], target: [0, 0, 0], fov: 34 },
      small: { pos: [L.xs[L.small] + 1.5, 1.6, 5.5], target: [L.xs[L.small], L.rs[L.small], 0], fov: 30 },
    };
  },
  defaultCamera: { from: 'wide', to: 'front', orbit: 12 },
  look: { bloom: 0.45 },

  build(ctx, p) {
    const { theme } = ctx;
    const items = (p.items || []).slice(0, 7);
    const L = layout(p);
    const base = createBase(ctx, { fog: 0.016, glow: 0.06, shadowSize: Math.max(12, L.width * 0.7 + L.maxR) });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.6, grid: 0.07, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 380, extent: [L.width * 0.7 + 8, L.maxR * 2 + 5, 12] });
    const palette = [theme.accent, theme.accent2, theme.warm, theme.metal, theme.accent, theme.accent2, theme.warm];
    const geo = new THREE.SphereGeometry(1, 64, 48);
    const objs = items.map((d, i) => {
      const c = col(d.color ?? palette[i % palette.length]);
      const mat = new THREE.MeshPhysicalMaterial({ color: c.clone().multiplyScalar(0.55), emissive: c.clone(), emissiveIntensity: 0.12, roughness: 0.22, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 });
      const m = mesh(geo, mat, { parent: scene });
      const ringMat = M.glow(c, 1.5);
      const ring = mesh(new THREE.TorusGeometry(1, 0.012, 8, 96), ringMat, { rot: [Math.PI / 2, 0, 0], parent: scene, shadow: false });
      return { d, c, m, mat, ring, ringMat, x: L.xs[i], r: L.rs[i] };
    });
    const anchors = {}; objs.forEach((o, i) => { anchors['item' + i] = new THREE.Vector3(o.x, o.r * 2, 0); });
    const st = { g: objs.map(() => 0), dim: objs.map(() => 1) };
    const tmp = new THREE.Color();
    const fmt = (v) => fmtNum(v, { prefix: p.prefix ?? '', suffix: p.suffix ?? '', decimals: p.decimals ?? 0, compact: !!p.compact });

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        const cues = f.params.cues || {};
        const hl = f.params.highlight ?? -1;
        objs.forEach((o, i) => {
          const cue = cues['item' + i];
          const start = cue != null ? cue + (f.t - f.shotT) : 0.3 + i * 0.4;
          const g = anim(t, start, 1.1, ease.outBack);
          const target = hl < 0 ? 1 : hl === i ? 1 : 0.35;
          const prev = f.prevParams ? ((f.prevParams.highlight ?? -1) < 0 ? 1 : (f.prevParams.highlight === i ? 1 : 0.35)) : 1;
          const dim = lerp(prev, target, anim(f.shotT, 0.3, 0.9, ease.inOutCubic));
          st.g[i] = clamp(anim(t, start, 1.1)); st.dim[i] = dim;
          const r = Math.max(o.r * g, 0.001);
          o.m.scale.setScalar(r); o.m.position.set(o.x, r + 0.02 + 0.03 * Math.sin(t * 0.9 + i), 0);
          o.m.rotation.y = t * 0.15 + i;
          o.mat.emissiveIntensity = 0.06 + 0.3 * (dim - 0.35) + (hl === i ? 0.12 * Math.sin(t * 2) + 0.12 : 0);
          o.mat.color.copy(o.c).multiplyScalar(0.2 + 0.4 * dim);
          o.ring.scale.setScalar(r * 1.12 + 0.05); o.ring.position.set(o.x, 0.03, 0);
          tmp.copy(o.c).multiplyScalar(0.3 + 1.6 * dim); o.ringMat.color.copy(tmp);
        });
      },
      labels(f) {
        const out = [];
        objs.forEach((o, i) => {
          const a = st.g[i] * (0.4 + 0.6 * st.dim[i]);
          if (a < 0.02) return;
          const small = o.r < L.maxR * 0.32;
          const big = (f.params.highlight ?? -1) === i;
          const top = new THREE.Vector3(o.x, o.r * 2 * st.g[i] + 0.25, 0);
          out.push({ pos: top, text: fmt(o.d.value * st.g[i]), size: big ? 58 : small ? 34 : 44, weight: 700, alpha: a, color: big ? theme.accent : theme.text, dy: small ? -58 - (i % 2) * 54 : -64 });
          out.push({ pos: top, text: o.d.label, size: small ? 24 : 30, weight: 500, font: 'body', alpha: a * 0.9, color: theme.textDim, dy: small ? -24 - (i % 2) * 54 : -22 });
        });
        return out;
      },
    };
  },
};

/** Sphere radii (area ∝ value) and x positions, scaled to a sensible stage width. */
function layout(p) {
  const items = (p.items || []).slice(0, 7);
  const maxV = Math.max(1e-9, ...items.map((d) => Math.abs(d.value)));
  const maxR = items.length <= 3 ? 2.6 : 2.3;
  const rs = items.map((d) => Math.max(0.12, maxR * Math.sqrt(Math.abs(d.value) / maxV)));
  const gap = 0.9;
  let x = 0; const xs = [];
  rs.forEach((r, i) => { x += (i ? rs[i - 1] + gap : 0) + (i ? r : 0); xs.push(x); });
  const width = xs.length ? xs[xs.length - 1] + rs[rs.length - 1] + rs[0] : 1;
  const off = (xs[xs.length - 1] + rs[rs.length - 1] - rs[0]) / 2;
  let big = 0, small = 0;
  rs.forEach((r, i) => { if (r > rs[big]) big = i; if (r < rs[small]) small = i; });
  return { rs, xs: xs.map((v) => v - off), width, maxR: Math.max(...rs, 0.5), big, small };
}
