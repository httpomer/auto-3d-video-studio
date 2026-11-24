// Generic left-to-right pipeline: labelled stages (each a small 3D object on a
// lit pedestal) joined by glass tubes carrying streams of glowing particles.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, roundedBox, canvasTex, col } from '../core/kit.js';
import { clamp, hash1, ease, anim, smoothstep } from '../core/util.js';

const SP = 3.7, ICON_Y = 1.72, ISC = 1.18;
const DEFAULT = [
  { label: 'Data', icon: 'cylinder' }, { label: 'Training', icon: 'chip' }, { label: 'Model', icon: 'sphere' },
  { label: 'Inference', icon: 'stack' }, { label: 'Apps', icon: 'screen' },
];
const ICONS = ['cube', 'stack', 'cylinder', 'chip', 'sphere', 'screen', 'gear'];

function lay(p = {}) {
  const stages = (Array.isArray(p.stages) && p.stages.length >= 2 ? p.stages : DEFAULT).slice(0, 6);
  const N = stages.length;
  return { stages, N, W: (N - 1) * SP };
}

function gearShape(teeth = 12, r0 = 0.5, r1 = 0.66) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, k = i % 4, r = k === 1 || k === 2 ? r1 : r0;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.2, 0, Math.PI * 2, true); s.holes.push(hole);
  return s;
}

/** Build a stage icon (~1.3 units) centred on the origin. Returns { group, glows[], spin } */
function makeIcon(kind, color) {
  const g = new THREE.Group(), glows = [];
  const glow = (i = 1) => { const m = M.glow(color, i); m.userData.k = i; glows.push(m); return m; };
  let spin = 0.25, tilt = 0;
  if (kind === 'stack') {
    for (let i = 0; i < 3; i++) {
      mesh(roundedBox(1.35, 0.17, 1.35, 0.16, 0.02), M.gloss('#1b2430'), { pos: [0, (i - 1) * 0.36, 0], parent: g });
      if (i < 2) mesh(roundedBox(1.08, 0.04, 1.08, 0.12, 0), glow(1.1), { pos: [0, (i - 0.5) * 0.36, 0], parent: g, shadow: false });
    }
  } else if (kind === 'cylinder') {
    for (let i = 0; i < 3; i++) {
      mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.3, 40), M.dark('#222b38', 0.32), { pos: [0, (i - 1) * 0.42, 0], parent: g });
      mesh(new THREE.TorusGeometry(0.625, 0.022, 8, 48), glow(1.3), { pos: [0, (i - 1) * 0.42, 0], rot: [Math.PI / 2, 0, 0], parent: g, shadow: false });
    }
  } else if (kind === 'chip') {
    mesh(roundedBox(1.25, 0.16, 1.25, 0.1, 0.02), M.dark('#1a222c', 0.4), { parent: g });
    mesh(roundedBox(0.72, 0.05, 0.72, 0.06, 0.01), M.brushed('#8c95a2'), { pos: [0, 0.1, 0], parent: g });
    mesh(new THREE.PlaneGeometry(0.4, 0.4), glow(1.2), { pos: [0, 0.131, 0], rot: [-Math.PI / 2, 0, 0], parent: g, shadow: false });
    const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), M.gold(), 40);
    const dm = new THREE.Object3D(); let k = 0;
    for (let s = 0; s < 4; s++) for (let i = 0; i < 10; i++) {
      const a = -0.5 + (i / 9) * 1.0; dm.rotation.set(0, s < 2 ? 0 : Math.PI / 2, 0);
      dm.position.set(s < 2 ? a : (s === 2 ? 0.68 : -0.68), -0.03, s < 2 ? (s === 0 ? 0.68 : -0.68) : a); dm.updateMatrix(); pins.setMatrixAt(k++, dm.matrix);
    }
    g.add(pins); tilt = 0.5; spin = 0.3;
  } else if (kind === 'sphere') {
    mesh(new THREE.SphereGeometry(0.36, 32, 20), glow(0.95), { parent: g, shadow: false });
    const shell = mesh(new THREE.SphereGeometry(0.62, 40, 24), new THREE.MeshPhysicalMaterial({ color: col(color).lerp(col('#ffffff'), 0.5), roughness: 0.06, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false }), { parent: g });
    shell.renderOrder = 2;
    mesh(new THREE.TorusGeometry(0.8, 0.02, 8, 64), M.metal('#aab4c4', 0.3), { rot: [1.1, 0.3, 0], parent: g });
    mesh(new THREE.TorusGeometry(0.72, 0.014, 8, 64), glow(1.2), { rot: [-0.6, 0.8, 0], parent: g, shadow: false });
    spin = 0.5;
  } else if (kind === 'screen') {
    mesh(roundedBox(1.7, 0.07, 1.06, 0.08, 0.015), M.dark('#1c2430', 0.4), { rot: [Math.PI / 2, 0, 0], parent: g });
    const tex = canvasTex(512, 320, (c, w, h) => {
      c.fillStyle = '#060a10'; c.fillRect(0, 0, w, h);
      const cc = '#' + col(color).getHexString();
      c.fillStyle = cc; c.globalAlpha = 0.16; c.fillRect(0, 0, w, h);
      c.fillStyle = cc; c.globalAlpha = 0.9; c.fillRect(24, 22, 150, 16);
      c.globalAlpha = 0.45; for (let i = 0; i < 5; i++) c.fillRect(24, 62 + i * 26, 110 + hash1(i * 7) * 120, 9);
      c.globalAlpha = 0.85; for (let i = 0; i < 7; i++) { const bh = 40 + hash1(i * 13 + 2) * 150; c.fillRect(290 + i * 28, h - 30 - bh, 18, bh); }
      c.globalAlpha = 1;
    });
    const sm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: col('#ffffff').multiplyScalar(1.5) }); sm.userData.baseColor = col('#ffffff'); sm.userData.k = 1.5; glows.push(sm);
    mesh(new THREE.PlaneGeometry(1.56, 0.94), sm, { pos: [0, 0, 0.04], parent: g, shadow: false });
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 12), M.metal('#8d96a3', 0.35), { pos: [0, -0.72, -0.05], parent: g });
    mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.04, 28), M.metal('#8d96a3', 0.35), { pos: [0, -0.92, -0.05], parent: g });
    spin = 0; tilt = 0;
  } else if (kind === 'gear') {
    const geo = new THREE.ExtrudeGeometry(gearShape(), { depth: 0.2, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 16 });
    geo.translate(0, 0, -0.1);
    const big = mesh(geo, M.metal('#9aa3ae', 0.38), { parent: g }); big.userData.rot = 0.6;
    const small = mesh(geo, M.metal('#6f7884', 0.4), { pos: [0.78, 0.5, 0], scale: 0.55, parent: g }); small.userData.rot = -1.09;
    mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 32), glow(1.3), { pos: [0, 0, 0.12], parent: g, shadow: false });
    g.userData.gears = [big, small]; spin = 0; g.position.x = -0.15;
  } else { // cube
    mesh(roundedBox(1.1, 1.1, 1.1, 0.12, 0.04), M.gloss('#1a222e'), { parent: g });
    const pm = glow(1.25), h = 0.565, tk = 0.022;
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      mesh(new THREE.BoxGeometry(1.13, tk, tk), pm, { pos: [0, a * h, b * h], parent: g, shadow: false });
      mesh(new THREE.BoxGeometry(tk, 1.13, tk), pm, { pos: [a * h, 0, b * h], parent: g, shadow: false });
      mesh(new THREE.BoxGeometry(tk, tk, 1.13), pm, { pos: [a * h, b * h, 0], parent: g, shadow: false });
    }
    spin = 0.35;
  }
  return { group: g, glows, spin, tilt };
}

export default {
  name: 'data_flow',
  description: 'A left-to-right pipeline of 2–6 labelled stages (e.g. Data → Training → Model → Inference → Apps). Each stage is a small 3D object on a lit pedestal; glass tubes between them carry streams of glowing particles. Stages can reveal one by one and one stage can be emphasised.',
  params: {
    stages: 'Array of 2–6 stages: { label, sub?, icon?, color? }. icon ∈ cube | stack | cylinder (database) | chip | sphere | screen | gear. color defaults to the theme accents.',
    visible: 'How many stages are shown (default all). Tweens in continued shots, so 2 → 5 reveals the rest one by one.',
    active: 'Index of the emphasised stage (others dim slightly); -1 / omitted = none. Tweens.',
    flow: '0..1 particle density in the tubes (default 0.8, tweens)',
    reveal: '"sequential" (default: stages build up one after another in the first ~2 s) | "all" (appear together)',
    cues: 'stage0 … stage5 — shot-local time at which that stage appears (first shot / newly visible stages) and briefly pulses',
  },
  sample: { stages: [{ label: 'Data', sub: 'Text, images, video', icon: 'cylinder' }, { label: 'Training', sub: 'GPU clusters', icon: 'chip' }, { label: 'Model', sub: 'Billions of weights', icon: 'sphere' }, { label: 'Inference', icon: 'stack' }, { label: 'Apps', icon: 'screen' }], active: 2 },
  framings: (p) => {
    const { N, W } = lay(p);
    const hw = W / 2;
    const ax = -hw + clamp(Math.round(p.active ?? (N - 1) / 2), 0, N - 1) * SP;
    return {
      wide: { pos: [0, 4.2, hw * 1.5 + 6.2], target: [0, 1.55, 0], fov: 34 },
      left: { pos: [-hw - 2.6, 3.0, 7.8], target: [-hw + 1.8, 1.5, 0], fov: 32 },
      right: { pos: [hw + 2.6, 3.0, 7.8], target: [hw - 1.8, 1.5, 0], fov: 32 },
      travel_start: { pos: [-hw - 0.6, 2.6, 9.4], target: [-hw + 0.6, 1.45, 0], fov: 32 },
      travel_end: { pos: [hw - 0.6, 2.6, 9.4], target: [hw + 0.6, 1.45, 0], fov: 32 },
      top: { pos: [0, hw * 1.5 + 9, 5], target: [0, 0.6, 0.3], fov: 34 },
      close: { pos: [ax + 2.4, 3.0, 6.4], target: [ax, 1.85, 0], fov: 30 },
      low: { pos: [-hw * 0.5, 0.7, hw * 1.2 + 6], target: [0, 1.8, 0], fov: 32 },
    };
  },
  defaultCamera: { from: 'wide', to: 'wide', orbit: 16, push: 0.08 },
  look: { bloom: 0.48 },

  build(ctx, p) {
    const { theme } = ctx;
    const { stages, N, W } = lay(p);
    const base = createBase(ctx, { fog: 0.02, shadowSize: Math.max(12, W / 2 + 4), glow: 0.035, glowDir: [0, 0.5, -1] });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.09, gridScale: 2.2 });
    const dust = addDust(ctx, scene, { count: 380, extent: [W / 2 + 9, 7, 12] });

    const S = stages.map((st, i) => {
      const color = st.color || (i % 2 === 0 ? theme.accent : theme.accent2);
      const x = -W / 2 + i * SP;
      const root = new THREE.Group(); root.position.set(x, 0, 0); scene.add(root);
      mesh(new THREE.CylinderGeometry(1.12, 1.22, 0.2, 56), M.dark('#0b0f15', 0.5), { pos: [0, 0.1, 0], parent: root });
      mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.04, 56), M.dark('#111720', 0.62), { pos: [0, 0.21, 0], parent: root });
      const ringMat = M.glow(color, 1.2);
      mesh(new THREE.TorusGeometry(1.0, 0.022, 8, 80), ringMat, { pos: [0, 0.21, 0], rot: [Math.PI / 2, 0, 0], parent: root, shadow: false });
      const kind = ICONS.includes(st.icon) ? st.icon : ICONS[i % ICONS.length];
      const icon = makeIcon(kind, color);
      const holder = new THREE.Group(); holder.position.y = ICON_Y; holder.rotation.x = icon.tilt; holder.add(icon.group); root.add(holder);
      const light = new THREE.PointLight(col(color).lerp(col('#ffffff'), 0.35), 0, 6, 1.6); light.position.set(0.3, 2.6, 1.7); root.add(light);
      return { st, x, color, root, ringMat, icon, holder, light, h: hash1(i * 53 + 7), labelPos: new THREE.Vector3(x, 3.2, 0) };
    });

    /* links */
    const SEG = 48, RAD = 8, PER = 16;
    const tubeMat = new THREE.MeshPhysicalMaterial({ color: col(theme.accent).lerp(col('#ffffff'), 0.6), roughness: 0.1, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
    const links = [];
    for (let i = 0; i < N - 1; i++) {
      const a = S[i].x, b = S[i + 1].x;
      const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(a + 1.0, ICON_Y, 0), new THREE.Vector3(a + 1.5, ICON_Y + 0.55, 0), new THREE.Vector3(b - 1.5, ICON_Y + 0.55, 0), new THREE.Vector3(b - 1.0, ICON_Y, 0));
      const geo = new THREE.TubeGeometry(curve, SEG, 0.075, RAD, false);
      const tube = mesh(geo, tubeMat, { parent: scene, shadow: false }); tube.renderOrder = 3;
      const pts = curve.getSpacedPoints(60);
      links.push({ geo, tube, pts });
    }
    const NPT = Math.max(1, (N - 1) * PER);
    const parts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NPT);
    parts.frustumCulled = false; scene.add(parts);
    const dm = new THREE.Object3D(), v = new THREE.Vector3(), tmpC = new THREE.Color();

    const anchors = {};
    S.forEach((s, i) => { anchors['stage' + i] = new THREE.Vector3(s.x, ICON_Y + 0.2, 0.4); });
    anchors.first = anchors.stage0; anchors.last = anchors['stage' + (N - 1)]; anchors.center = new THREE.Vector3(0, ICON_Y, 0);

    const step = Math.min(0.42, 1.5 / N);
    const state = S.map(() => ({ r: 0, e: 0 }));
    function compute(f) {
      const P = f.params, cues = P.cues || {};
      const visNow = f.tw('visible', N, 0.3, 1.1, ease.inOutQuad);
      const prevVis = f.prevParams ? (f.prevParams.visible ?? N) : 0;
      const active = f.tw('active', -1, 0.3, 1.0);
      const all = (P.reveal ?? p.reveal) === 'all';
      for (let i = 0; i < N; i++) {
        let r;
        if (!f.prevParams) r = i < (P.visible ?? N) ? anim(f.t, all ? 0.15 + i * 0.07 : 0.2 + i * step, 0.7, ease.outCubic) : 0;
        else r = ease.outCubic(clamp(visNow - i));
        const cue = cues['stage' + i];
        let pulse = 0;
        if (cue != null) {
          if (!f.prevParams || i >= prevVis) r = i < (P.visible ?? N) ? anim(f.shotT, cue, 0.7, ease.outCubic) : 0;
          const x = f.shotT - cue; pulse = smoothstep(0, 0.4, x) * (1 - smoothstep(1.6, 2.8, x));
        }
        state[i].r = r;
        state[i].e = Math.max(active < -0.5 ? 0 : clamp(1 - Math.abs(i - active)), pulse);
        state[i].dim = active < -0.5 ? 0 : clamp(active + 1) * (1 - state[i].e);
      }
    }

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        compute(f);
        const flow = clamp(f.tw('flow', 0.8, 0.2, 1.2));
        dust.update(t);
        S.forEach((s, i) => {
          const { r, e, dim } = state[i];
          s.root.visible = r > 0.001;
          const sc = ease.outBack(clamp(r));
          s.root.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * sc));
          s.root.position.y = (1 - r) * -0.4;
          s.holder.position.y = ICON_Y + Math.sin(t * 0.9 + s.h * 6.28) * 0.06 + (1 - r) * 0.8;
          s.holder.scale.setScalar(Math.max(0.001, ISC * r * (1 + e * 0.14)));
          s.icon.group.rotation.y = s.icon.spin ? t * s.icon.spin + s.h * 3 : Math.sin(t * 0.5 + s.h * 6) * 0.16 - (W > 0 ? (s.x / W) * 0.5 : 0);
          if (s.icon.group.userData.gears) for (const gm of s.icon.group.userData.gears) gm.rotation.z = t * gm.userData.rot;
          const k = (0.85 + e * 0.5) * (1 - 0.3 * dim) * r;
          for (const m of s.icon.glows) m.color.copy(m.userData.baseColor).multiplyScalar(m.userData.k * k);
          s.ringMat.color.copy(s.ringMat.userData.baseColor).multiplyScalar((0.9 + e * 0.9) * (1 - 0.35 * dim) * r * (0.92 + 0.08 * Math.sin(t * 2 + s.h * 6)));
          s.light.intensity = (4 + e * 2.2) * (1 - 0.35 * dim) * r;
        });
        links.forEach((ln, i) => {
          const r = Math.min(state[i].r, clamp((state[i + 1].r - 0.15) / 0.85));
          const grow = ease.inOutQuad(clamp(r));
          ln.tube.visible = grow > 0.01;
          ln.geo.setDrawRange(0, Math.floor(grow * SEG) * RAD * 6);
          const ca = S[i].color, cb = S[i + 1].color;
          for (let k = 0; k < PER; k++) {
            const idx = i * PER + k, h = hash1(idx * 37 + 11);
            const u = (((t * (0.22 + h * 0.08) + k / PER + h * 0.05) % 1) + 1) % 1; // t < 0 during an incoming transition
            const on = k / PER < flow && u < grow;
            if (on) {
              const x = u * 60, j = Math.max(0, Math.min(Math.floor(x), 59));
              v.lerpVectors(ln.pts[j], ln.pts[j + 1], x - j);
              dm.position.copy(v); dm.scale.setScalar(0.6 + 0.6 * Math.sin(u * Math.PI));
            } else { dm.position.set(0, -50, 0); dm.scale.setScalar(0.0001); }
            dm.updateMatrix(); parts.setMatrixAt(idx, dm.matrix);
            tmpC.set(ca).lerp(tmpC2.set(cb), u).multiplyScalar(1.5);
            parts.setColorAt(idx, tmpC);
          }
        });
        if (N < 2) { dm.position.set(0, -50, 0); dm.updateMatrix(); parts.setMatrixAt(0, dm.matrix); }
        parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
      },
      labels(f) {
        compute(f);
        const out = [];
        S.forEach((s, i) => {
          const { r, e, dim } = state[i];
          if (r <= 0.02 || !s.st.label) return;
          out.push({ pos: s.labelPos, text: String(s.st.label), sub: s.st.sub, size: 32 + e * 4, bg: true, alpha: clamp((r - 0.4) / 0.6) * (1 - 0.35 * dim), color: e > 0.5 ? theme.text : s.color, dy: s.st.sub ? -14 : 0 });
        });
        return out;
      },
    };
  },
};
const tmpC2 = new THREE.Color();
