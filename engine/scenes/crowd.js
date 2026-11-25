// A crowd of simple people figures standing on the studio floor — and the moment a share of them
// turns to dust. Two selection modes:
//   "half"      — exactly half of all figures vanish (deterministic shuffle): populations, "1 in 2".
//   "enumerate" — group i loses figure k when bit k of i is set, so the groups show EVERY possible
//                 outcome once (4 pairs → 1 in 4 lose both; 16 families of four → 1 in 16 keep everyone).
// The disintegration is a pure function of the `vanish` progress: each figure melts from the head
// down while glowing embers peel off and drift away on the wind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, rng, ease } from '../core/util.js';
import { HUMANS, DEFAULT_PEOPLE, getHuman, preloadHumans } from '../core/humans.js';

const MELT = 0.55; // share of a figure's own progress spent dissolving (the rest is embers drifting off)
const PEOPLE = DEFAULT_PEOPLE;

/** Fallback figure (capsule body + head) when the character models are not available. */
function tokenParts() {
  const body = new THREE.CapsuleGeometry(0.16, 0.42, 8, 20); body.translate(0, 0.37, 0);
  const head = new THREE.SphereGeometry(0.135, 24, 16); head.translate(0, 0.9, 0);
  const geometry = mergeGeometries([body.toNonIndexed(), head.toNonIndexed()]); geometry.scale(1 / 1.035, 1 / 1.035, 1 / 1.035);
  return [{ geometry, material: new THREE.MeshStandardMaterial({ color: col('#d9dee8'), roughness: 0.42, metalness: 0.08 }) }];
}

/**
 * Clone of a character material that dissolves from the head down: per-instance `aCut` (0..1) moves a
 * grainy cut-off line down the body (model space, height 0..1); the band just below it glows like embers.
 */
function dissolveMaterial(src) {
  const m = src.clone();
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCut; varying float vCut; varying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCut = aCut; vLP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCut; varying vec3 vLP;\nfloat dHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dGrain = dHash(floor(vLP * 90.0)) * 0.6 + dHash(floor(vLP * 22.0)) * 0.4;
        float dEdge = (1.06 - vCut * 1.12) - (vLP.y + (dGrain - 0.5) * 0.14);
        if (vCut > 0.0 && dEdge < 0.0) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vCut > 0.0) { float dB = 1.0 - smoothstep(0.0, 0.045, dEdge); totalEmissiveRadiance += vec3(1.0, 0.38, 0.1) * dB * 2.2; }`);
  };
  m.customProgramCacheKey = () => 'crowd-dissolve-' + (src.map ? 'map' : 'nomap');
  return m;
}

function layout(p) {
  const groups = Math.max(1, p.groups ?? 1), size = Math.max(1, p.size ?? 120);
  const perRow = p.perRow ?? (size <= 6 ? size : Math.ceil(Math.sqrt(size * 1.8)));
  const rows = Math.ceil(size / perRow);
  const sp = p.spacing ?? 0.62;
  const gw = (perRow - 1) * sp, gd = (rows - 1) * sp;
  const cols = Math.min(groups, p.cols ?? (groups <= 4 ? groups : Math.ceil(Math.sqrt(groups))));
  const grows = Math.ceil(groups / cols);
  const gapX = p.gap ?? 1.25, gapZ = p.gap ?? 1.25;
  const centers = [], figs = [];
  // optional: move the highlighted group to a chosen slot (swapping with whoever is there)
  const hl = p.highlight ?? -1, hs = p.highlightSlot;
  const slotOf = (g) => (hs == null || hl < 0 ? g : g === hl ? hs : g === hs ? hl : g);
  for (let g = 0; g < groups; g++) {
    const sl = slotOf(g), c = sl % cols, r = Math.floor(sl / cols);
    const cx = (c - (cols - 1) / 2) * (gw + gapX), cz = (r - (grows - 1) / 2) * (gd + gapZ);
    centers.push([cx, cz]);
    for (let k = 0; k < size; k++) {
      const ix = k % perRow, iz = Math.floor(k / perRow);
      // big crowds: a little jitter so it reads as people, not a grid
      const r2 = rng(1000 + g * 131 + k);
      const j = size > 12 ? 0.12 : 0;
      figs.push({ g, k, x: cx + (ix - (perRow - 1) / 2) * sp + r2.range(-j, j), z: cz + (iz - (rows - 1) / 2) * sp + r2.range(-j, j), rot: size > 12 ? r2.range(-0.5, 0.5) : 0 });
    }
  }
  const ex = (cols - 1) * (gw + gapX) + gw + 1, ez = (grows - 1) * (gd + gapZ) + gd + 1;
  return { groups, size, centers, figs, ex, ez };
}

/** Which figures vanish: a Set of indices into layout.figs. */
function victims(L, p) {
  const out = new Set();
  if ((p.mode ?? 'half') === 'enumerate') {
    L.figs.forEach((f, i) => { if ((f.g >> f.k) & 1) out.add(i); });
  } else {
    const idx = L.figs.map((_, i) => i), r = rng(p.seed ?? 7);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const n = Math.round(idx.length * (p.share ?? 0.5));
    for (let i = 0; i < n; i++) out.add(idx[i]);
  }
  return out;
}

export default {
  name: 'crowd',
  description: 'A crowd of realistic people (3D characters: men and women in everyday clothes) on the studio floor, and the moment some of them turn to dust (embers peel off from the head down and drift away). "half" mode makes exactly half of everyone vanish (population, "half of all people"); "enumerate" mode lays out groups that show every possible outcome once — 4 pairs → one pair loses both (1 in 4), 16 families of four → one family keeps everyone (1 in 16). Use for population, probability, survivors, "one in N" stories.',
  params: {
    figure: '"human" (realistic characters, default) | "token" (simple capsule figures)',
    people: `Which characters to mix (default all): ${Object.keys(HUMANS).join(', ')}`,
    figureScale: 'Height multiplier for the figures (default 1 ≈ one grid cell = 0.6 m apart for 1.75 m people)',
    size: 'Figures per group (default 120 — one big crowd)',
    groups: 'Number of groups (default 1). In "enumerate" mode use 2^size groups.',
    cols: 'Groups per row (default ≈ square)',
    perRow: 'Figures per row inside a group (default: a row for ≤ 6, else ≈ square)',
    mode: '"half" (exactly `share` of all figures vanish, default) | "enumerate" (group i loses figure k when bit k of i is set)',
    share: 'half mode: share that vanishes (default 0.5)',
    seed: 'half mode: which figures (deterministic)',
    vanish: '0..1 dust progress (tweens between continued shots; set vanishFrom: 0, vanish: 1 to watch it happen)',
    vanishDur: 'Seconds the vanish tween takes (default 3)',
    highlight: 'Group index to light up with a ring and glow (-1 none); tweens',
    highlightLabel: 'Label floating over the highlighted group',
    highlightSlot: 'Grid slot (0-based, row by row from the back) to place the highlighted group in, e.g. to bring it mid-frame',
    groupLabels: '[strings] small labels over each group',
    labelSide: '"top" (default, over each group) | "right" (beside each group — best for a single column of groups)',
    wave: 'true → a shock-wave ring sweeps the floor when the vanish starts (the snap)',
    cues: '{ snap: seconds when the vanish starts (default 0.5) } — shot-local',
  },
  sample: { size: 120, vanishFrom: 0, vanish: 1, wave: true },
  framings: (p) => {
    const L = layout(p);
    const R = Math.max(L.ex * 0.5, L.ez * 0.55, 1.6);
    const hc = L.centers[Math.max(0, Math.min(L.groups - 1, p.highlight ?? 0))] || [0, 0];
    return {
      wide: { pos: [0.45 * R, 1.25 * R + 1, 2.2 * R + 1], target: [0, 0.2, 0], fov: 35 },
      hero: { pos: [-0.35 * R, 0.5 * R + 0.6, 2.0 * R + 1.4], target: [0, 0.55, 0.15 * L.ez], fov: 35 },
      low: { pos: [0.55 * R, 0.45, 1.5 * R + 1.2], target: [0, 0.85, 0], fov: 38 },
      top: { pos: [0.01, 2.9 * R + 2, 0.55 * R + 0.5], target: [0, 0, 0], fov: 34 },
      side: { pos: [2.1 * R + 1, 0.85 * R + 0.8, 0.9 * R], target: [0, 0.3, 0], fov: 35 },
      close: { pos: [hc[0] + 0.5, 1.75, hc[1] + 3.1], target: [hc[0], 0.6, hc[1]], fov: 34 },
      focus: { pos: [hc[0] - 0.9, 2.6, hc[1] + 4.4], target: [hc[0], 0.5, hc[1]], fov: 35 },
    };
  },
  defaultCamera: { from: 'wide', to: 'hero' },
  preload: (paramsList) => (paramsList.some((q) => (q.figure ?? 'human') === 'human') ? preloadHumans([...new Set(paramsList.flatMap((q) => q.people ?? DEFAULT_PEOPLE))]) : null),
  look: { bloom: 0.6, bloomThreshold: 0.95, vignette: 0.85 },

  build(ctx, p) {
    const { theme } = ctx;
    const L = layout(p), gone = victims(L, p);
    const base = createBase(ctx, { fog: 0.03, glow: 0.12, shadowSize: Math.max(8, Math.max(L.ex, L.ez) * 0.7), key: 1.7, keyPos: [-5, 10, 6], rim: 2.0, rimPos: [6, 4, -7], env: 0.6 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.32, grid: 0.12, gridScale: 1 });
    const dust = addDust(ctx, scene, { count: 260, extent: [Math.max(10, L.ex), 6, Math.max(10, L.ez)], alpha: 0.3 });

    // --- figures: realistic people (baked rigged characters) or simple tokens; instanced per part
    const N = L.figs.length;
    const kinds = (p.figure ?? 'human') === 'human' ? (p.people ?? PEOPLE).filter((k) => getHuman(k)) : [];
    const models = kinds.length ? kinds.map((k) => getHuman(k)) : [tokenParts()];
    const fr = rng((p.seed ?? 7) + 991);
    const kindOf = L.figs.map(() => Math.floor(fr() * models.length));
    const scaleOf = L.figs.map(() => (models.length > 1 || kinds.length ? 0.92 + fr() * 0.14 : 1) * (p.figureScale ?? 1.0));
    const parts = []; // { mesh, idx: [figure indices] , cut: InstancedBufferAttribute }
    models.forEach((partsOfModel, mi) => {
      const idx = L.figs.map((_, i) => i).filter((i) => kindOf[i] === mi);
      if (!idx.length) return;
      for (const part of partsOfModel) {
        const g = part.geometry.clone();
        const cut = new THREE.InstancedBufferAttribute(new Float32Array(idx.length), 1);
        g.setAttribute('aCut', cut);
        const im = new THREE.InstancedMesh(g, dissolveMaterial(part.material), idx.length);
        im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
        scene.add(im);
        parts.push({ mesh: im, idx, cut });
      }
    });
    const ash = col('#2a2420'), hot = col(theme.accent).lerp(col('#ffffff'), 0.35);
    const r = rng(p.seed ?? 7);
    const tones = L.figs.map((_, i) => { const q = rng(77 + i); return col('#ffffff').lerp(col(q() < 0.5 ? '#ffe2c8' : '#d6e2ff'), q() * 0.35).multiplyScalar(0.82 + q() * 0.22); });
    // points on each model's surface (for ember origins), in model space
    const surf = models.map((partsOfModel) => {
      const pts = [];
      for (const part of partsOfModel) { const a = part.geometry.attributes.position; for (let i = 0; i < a.count; i += Math.max(1, Math.floor(a.count / 600))) pts.push([a.getX(i), a.getY(i), a.getZ(i)]); }
      return pts;
    });
    const delay = L.figs.map(() => 0);
    // stagger: dust spreads across the crowd over ~45 % of the vanish
    L.figs.forEach((f, i) => { delay[i] = gone.has(i) ? r() * 0.45 : 0; });

    // --- highlight ring under a group
    const ringMat = M.glow(theme.accent, 2.2); ringMat.transparent = true;
    const ring = mesh(new THREE.RingGeometry(0.98, 1.06, 96), ringMat, { rot: [-Math.PI / 2, 0, 0], parent: scene, shadow: false });

    // --- snap shock-wave
    const waveMat = M.glow(theme.accent, 2.5); waveMat.transparent = true; waveMat.depthWrite = false; waveMat.blending = THREE.AdditiveBlending;
    const wave = mesh(new THREE.RingGeometry(0.985, 1.0, 160), waveMat, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0.02, 0], parent: scene, shadow: false });
    wave.visible = false;

    // --- dust particles (GPU): every vanishing figure sheds K embers, released head-first
    const vic = [...gone];
    const K = p.dust ?? Math.max(40, Math.min(220, Math.round(9000 / Math.max(1, vic.length))));
    const n = vic.length * K;
    const pos = new Float32Array(n * 3), aDelay = new Float32Array(n), aH = new Float32Array(n), aDir = new Float32Array(n * 3);
    const pr = rng(4242);
    vic.forEach((fi, vi) => {
      const f = L.figs[fi];
      const S = surf[kindOf[fi]], sc = scaleOf[fi], cr = Math.cos(f.rot), sr = Math.sin(f.rot);
      for (let j = 0; j < K; j++) {
        const q = vi * K + j;
        const [x0, y0, z0] = S[Math.floor(pr() * S.length)];
        const h = Math.min(1, y0); // 0 feet … 1 top of head
        pos[q * 3] = f.x + (x0 * cr + z0 * sr) * sc; pos[q * 3 + 1] = y0 * sc; pos[q * 3 + 2] = f.z + (-x0 * sr + z0 * cr) * sc;
        aDelay[q] = delay[fi]; aH[q] = h;
        aDir[q * 3] = pr() * 2 - 1; aDir[q * 3 + 1] = pr(); aDir[q * 3 + 2] = pr() * 2 - 1;
      }
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aDelay', new THREE.BufferAttribute(aDelay, 1));
    pg.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
    pg.setAttribute('aDir', new THREE.BufferAttribute(aDir, 3));
    const pm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uV: { value: 0 }, uTime: { value: 0 }, uSize: { value: 90 * (Math.min(ctx.width, ctx.height) / 1080) }, uEmber: { value: col('#ff7a2e') }, uHot: { value: col(theme.accent) }, uAsh: { value: col('#6b5a4c') } },
      vertexShader: `
        attribute float aDelay, aH; attribute vec3 aDir;
        uniform float uV, uTime, uSize; varying float vA; varying float vQ; varying float vS;
        void main(){
          float pi = clamp((uV - aDelay) / 0.55, 0.0, 1.0);
          float q = clamp((pi - (1.0 - aH) * ${MELT.toFixed(2)}) / (1.0 - ${MELT.toFixed(2)} * (1.0 - aH)), 0.0, 1.0);
          vec3 p = position;
          vec3 wind = vec3(1.0, 0.35, -0.45);
          float s = aDir.x * 17.0 + aDir.z * 29.0;
          p += wind * (q * q * 2.6 + q * 0.5) + vec3(aDir.x, aDir.y * 0.8 + 0.2, aDir.z) * q * 0.7;
          p += vec3(sin(uTime * 1.7 + s), cos(uTime * 1.3 + s * 1.3) * 0.6, sin(uTime * 1.1 + s * 0.7)) * 0.18 * q;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vS = fract(s);
          gl_PointSize = q > 0.0 ? uSize * (0.55 + 0.6 * aDir.y) * (1.0 - 0.6 * q) / max(-mv.z, 0.5) : 0.0;
          vA = smoothstep(0.0, 0.05, q) * (1.0 - smoothstep(0.45, 1.0, q));
          vQ = q;
        }`,
      fragmentShader: `
        uniform vec3 uEmber, uHot, uAsh; varying float vA; varying float vQ; varying float vS;
        void main(){
          float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d);
          vec3 c = mix(mix(uEmber * 3.6, uHot * 2.4, step(0.72, vS)), uAsh * 0.6, smoothstep(0.15, 0.7, vQ));
          gl_FragColor = vec4(c * a * vA, 1.0);
        }`,
    });
    const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; scene.add(pts);

    const dm = new THREE.Object3D(), c = new THREE.Color();
    const side = p.labelSide === 'right';
    const halfW = ((Math.min(L.size, p.perRow ?? L.size) - 1) * (p.spacing ?? 0.62)) / 2;
    const labelPos = L.centers.map(([x, z]) => (side ? new THREE.Vector3(x + halfW + 0.45, 0.45, z) : new THREE.Vector3(x, 1.55, z)));
    const anchors = { center: new THREE.Vector3(0, 0.8, 0), highlight: new THREE.Vector3(), front: new THREE.Vector3(0, 0.8, L.ez * 0.45) };
    L.centers.forEach(([x, z], i) => { anchors['g' + i] = new THREE.Vector3(x, 1.1, z); });
    const groupR = (L.size <= 6 ? ((Math.min(L.size, p.perRow ?? L.size) - 1) * (p.spacing ?? 0.62)) / 2 + 0.3 : Math.max(L.ex, L.ez) * 0.5);
    let hlA = 0, hlIdx = -1;

    return {
      scene, anchors,
      update(f) {
        dust.update(f.t);
        const cue = (k, d) => { const x = Number(f.params.cues?.[k]); return Number.isFinite(x) ? x : d; };
        const snap = cue('snap', 0.5);
        const v = clamp(f.tw('vanish', 0, snap, p.vanishDur ?? 3, (x) => x));
        pm.uniforms.uV.value = v; pm.uniforms.uTime.value = f.t;
        // highlight (tweened alpha; index from this shot)
        const hi = f.params.highlight ?? -1;
        hlIdx = hi; hlA = hi >= 0 ? ease.outCubic(clamp((f.shotT - cue('highlight', 0.6)) / 0.8)) : 0;
        if (f.prevParams && (f.prevParams.highlight ?? -1) === hi && hi >= 0) hlA = 1;
        // dissolve amount per figure: 0 intact … 1 gone (head first, glowing edge — see dissolveMaterial)
        const cutOf = (i) => (gone.has(i) ? clamp((v - delay[i]) / 0.55 / MELT) : 0);
        for (const P of parts) {
          P.idx.forEach((i, j) => {
            const fg = L.figs[i], s = cutOf(i), sc = scaleOf[i];
            dm.position.set(fg.x, 0, fg.z); dm.rotation.set(0, fg.rot, 0);
            if (s >= 1) dm.scale.set(0, 0, 0); else dm.scale.set(sc, sc, sc);
            dm.updateMatrix(); P.mesh.setMatrixAt(j, dm.matrix);
            c.copy(tones[i]);
            if (s > 0) c.lerp(ash, Math.min(1, s * 1.6) * 0.7);
            else if (fg.g === hlIdx && hlA > 0) c.lerp(hot, 0.45 * hlA);
            P.mesh.setColorAt(j, c);
            P.cut.array[j] = s;
          });
          P.mesh.instanceMatrix.needsUpdate = true; P.mesh.instanceColor.needsUpdate = true; P.cut.needsUpdate = true;
        }
        // ring + light under the highlighted group
        if (hlIdx >= 0 && L.centers[hlIdx]) {
          const [x, z] = L.centers[hlIdx];
          ring.visible = true; ring.position.set(x, 0.015, z);
          ring.scale.setScalar(groupR * (0.85 + 0.15 * hlA));
          ringMat.opacity = hlA;
          anchors.highlight.set(x, 1.1, z);
        } else ring.visible = false;
        // snap wave
        const wt = f.t - snap;
        if (p.wave && !f.prevParams && wt > 0 && wt < 2.2) {
          const k2 = wt / 2.2;
          wave.visible = true; wave.scale.setScalar(0.3 + ease.outCubic(k2) * Math.max(L.ex, L.ez) * 0.9);
          waveMat.opacity = (1 - k2) * 0.55;
        } else wave.visible = false;
      },
      labels(f) {
        const out = [];
        const gl = f.params.groupLabels;
        if (Array.isArray(gl)) gl.forEach((t, i) => { if (t && labelPos[i]) out.push({ text: t, pos: labelPos[i], size: ctx.aspect < 1 ? 34 : 26, bg: true, align: side ? 'left' : 'center', alpha: ease.outCubic(clamp((f.shotT - 0.4) / 0.6)) }); });
        if (f.params.highlightLabel && hlIdx >= 0 && labelPos[hlIdx]) out.push({ text: f.params.highlightLabel, pos: labelPos[hlIdx].clone().setY(1.75), size: ctx.aspect < 1 ? 44 : 34, bg: true, color: theme.accent, alpha: hlA });
        return out;
      },
    };
  },
};
