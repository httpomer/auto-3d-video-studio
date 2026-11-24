// A technology / business "stack": slabs that drop into place one on top of the
// other, each labelled. The layer being discussed lifts apart and glows.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, roundedBox, circuitTextures, col } from '../core/kit.js';
import { clamp, anim, ease, smoothstep } from '../core/util.js';

export default {
  name: 'stack_layers',
  description: 'Exploded layer stack: 2–6 slabs (bottom → top) drop into place and float apart, each with a label and optional sub-label. The `active` layer glows and separates further. Ideal for platform / moat / architecture explanations (hardware → software → ecosystem), cost breakdowns by layer, or "how X is built".',
  params: {
    layers: '[{ label, sub?, color? }] listed BOTTOM to TOP (2–6)',
    active: 'Index of the layer in focus (-1 = none). Tweens between continued shots.',
    spread: 'Vertical gap between layers, default 1.15',
    cues: 'layer0, layer1, … — shot-local times at which each layer drops in (sync to narration)',
  },
  sample: { layers: [{ label: 'Chips', sub: 'GPUs and accelerators' }, { label: 'Systems', sub: 'Servers and networking' }, { label: 'CUDA', sub: 'Software platform' }, { label: 'Libraries', sub: '400+ AI frameworks' }, { label: 'Developers', sub: '5 million and counting' }], active: 2 },
  framings: (p) => {
    const n = (p.layers || []).length || 3, sp = p.spread ?? 1.15, h = n * sp + 0.9;
    const fr = {
      wide: { pos: [10.5, h * 0.5 + 4.2, 14 + n], target: [1.4, h * 0.5, 0], fov: 34 },
      hero: { pos: [8.6, h * 0.5 + 3, 11 + n * 0.8], target: [1.3, h * 0.5, 0], fov: 32 },
      front: { pos: [1.5, h * 0.5 + 1.2, 15], target: [1.5, h * 0.5 + 0.2, 0], fov: 32 },
      low: { pos: [8, 0.9, 10], target: [0.8, h * 0.55, 0], fov: 34 },
      top: { pos: [3, h + 11, 6.5], target: [0.6, h * 0.4, 0], fov: 34 },
    };
    for (let i = 0; i < n; i++) fr['layer' + i] = { pos: [6.2, 0.7 + i * sp + 1.9, 7.6], target: [1.1, 0.6 + i * sp + 0.15, 0], fov: 30 };
    return fr;
  },
  defaultCamera: { from: 'wide', to: 'hero', orbit: 14 },
  look: { bloom: 0.48 },

  build(ctx, p) {
    const { theme } = ctx;
    const L = (p.layers || []).slice(0, 6), n = L.length, sp = p.spread ?? 1.15;
    const base = createBase(ctx, { fog: 0.022, glow: 0.06, shadowSize: 12 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.55, grid: 0.08, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 380, extent: [16, 10, 14] });
    const W = 5.6, D = 5.6, T = 0.34;
    const palette = [theme.accent, theme.accent2, theme.warm, theme.accent, theme.accent2, theme.warm];
    const slabGeo = roundedBox(W, T, D, 0.35, 0.03);
    const layers = L.map((d, i) => {
      const c = col(d.color ?? palette[i % palette.length]);
      const g = new THREE.Group(); scene.add(g);
      const body = mesh(slabGeo, new THREE.MeshPhysicalMaterial({ color: col('#0f161f').lerp(c, 0.1), roughness: 0.4, metalness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }), { parent: g });
      // patterned, softly glowing top face — a different pattern per layer
      const ct = circuitTextures(31 + i * 17, { cells: 22 + i * 6, traces: 60 + i * 40, glow: '#' + c.getHexString(), base: '#0a0f15', trace: '#18222e', pad: '#' + c.getHexString(), size: 512 });
      const topMat = new THREE.MeshStandardMaterial({ map: ct.map, emissiveMap: ct.emissive, emissive: col('#ffffff'), emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.3 });
      const top = mesh(new THREE.PlaneGeometry(W - 0.5, D - 0.5), topMat, { pos: [0, T / 2 + 0.004, 0], rot: [-Math.PI / 2, 0, 0], parent: g, shadow: false });
      // glowing edge band
      const edgeMat = M.glow(c, 1.2);
      const edge = mesh(roundedBox(W + 0.03, 0.035, D + 0.03, 0.36, 0), edgeMat, { pos: [0, 0, 0], parent: g, shadow: false });
      const light = new THREE.PointLight(c, 0, 9, 1.8); light.position.set(0, 0.7, 0); g.add(light);
      return { d, c, g, topMat, edgeMat, light };
    });
    const anchors = {}; const tmp = new THREE.Color();
    const st = { y: layers.map(() => 0), show: layers.map(() => 0), focus: layers.map(() => 0) };
    layers.forEach((_, i) => { anchors['layer' + i] = new THREE.Vector3(); });

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        const cues = f.params.cues || {};
        const act = f.tw('active', -1, 0.3, 1.4);
        layers.forEach((ly, i) => {
          const cue = cues['layer' + i];
          const start = cue != null ? cue + (f.t - f.shotT) : 0.25 + i * 0.45;
          const drop = anim(t, start, 0.9, ease.outCubic), show = clamp(anim(t, start, 0.5));
          const focus = act < -0.5 ? 0 : clamp(1 - Math.abs(act - i));
          const above = act < -0.5 ? 0 : smoothstep(0.0, 1.0, i - act) * 0.55 - smoothstep(0.0, 1.0, act - i) * 0.0;
          const y = 0.6 + i * sp + above + (1 - drop) * 5 + 0.04 * Math.sin(t * 1.1 + i * 1.3);
          ly.g.position.set(0, y, 0);
          ly.g.rotation.y = (1 - drop) * 0.5 + 0.02 * Math.sin(t * 0.5 + i);
          ly.g.visible = show > 0.001;
          ly.g.scale.setScalar(0.6 + 0.4 * show);
          const dim = act < -0.5 ? 0.8 : 0.3 + 0.9 * focus;
          ly.topMat.emissiveIntensity = (0.35 + 0.15 * Math.sin(t * 1.4 + i)) * dim * 1.6;
          tmp.copy(ly.c).multiplyScalar(0.5 + 2.2 * (act < -0.5 ? 0.4 : focus)); ly.edgeMat.color.copy(tmp);
          ly.light.intensity = 5 * focus * show;
          st.y[i] = y; st.show[i] = show; st.focus[i] = act < -0.5 ? 0.6 : focus;
          anchors['layer' + i].set(W / 2, y, 0);
        });
      },
      labels(f) {
        const out = [];
        layers.forEach((ly, i) => {
          const a = st.show[i] * (0.62 + 0.38 * clamp(st.focus[i] + 0.15));
          if (a < 0.02) return;
          const big = st.focus[i] > 0.6 && (f.params.active ?? -1) >= 0;
          out.push({ pos: new THREE.Vector3(W / 2 + 0.5, st.y[i] + 0.1, 0.6), text: ly.d.label, sub: ly.d.sub, size: big ? 46 : 36, weight: 700, align: 'left', alpha: a, color: big ? '#' + ly.c.getHexString() : theme.text });
        });
        return out;
      },
    };
  },
};
