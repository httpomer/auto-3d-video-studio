// 3D neural network: glass-orb neurons in layers, fully connected by thin
// filaments. Activation pulses sweep forward layer by layer (and backward in
// warm colour when training). Everything is a pure function of time.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, hash1, ease, anim, smoothstep } from '../core/util.js';

const SP = 2.8, CY = 3.3;

function layout(p = {}) {
  const src = Array.isArray(p.layers) && p.layers.length >= 2 ? p.layers : [4, 7, 7, 5, 2];
  const layers = src.slice(0, 8).map((n) => clamp(Math.round(n), 1, 12));
  const L = layers.length, W = (L - 1) * SP;
  const maxN = Math.max(...layers);
  const ring = p.layout === 'ring';
  const dy = Math.min(0.88, 5.4 / Math.max(maxN - 1, 1));
  const H = ring ? 2 * Math.min(2.5, 0.36 * maxN + 0.3) : (maxN - 1) * dy;
  return { layers, L, W, dy, H, ring };
}

export default {
  name: 'neural_network',
  description: 'A 3D neural network: layers of glass-orb neurons joined by glowing filaments. Activation pulses sweep forward layer by layer and neurons flash as signals arrive. In training mode a dimmer warm error wave also travels backward.',
  params: {
    layers: 'Array of neuron counts per layer, e.g. [4,7,7,5,2] (2–8 layers, 1–12 neurons each)',
    labels: 'Optional array of names shown under each layer, e.g. ["Input","Hidden","Hidden","Hidden","Output"] (use "" to skip one)',
    activity: '0..1 how many neurons / connections fire per wave (default 0.7, tweens between continued shots)',
    mode: '"inference" (default, forward pulses only) | "training" (adds a backward warm error wave)',
    highlightLayer: 'Index of a layer to emphasise (brighter, larger); omit or -1 for none (tweens)',
    layout: '"column" (default, classic diagram with depth stagger) | "ring" (neurons of each layer on a circle)',
    speed: 'Pulse speed multiplier (default 1)',
  },
  sample: { layers: [4, 7, 7, 5, 2], labels: ['Input', 'Hidden', 'Hidden', 'Hidden', 'Output'], activity: 0.8, mode: 'inference' },
  framings: (p) => {
    const { W, H } = layout(p);
    const hw = W / 2;
    return {
      wide: { pos: [hw * 0.75, CY + 2.2, hw * 1.9 + 7.5], target: [0, CY - 0.5, 0], fov: 34 },
      front: { pos: [0, CY, hw * 1.75 + 8.5], target: [0, CY - 0.35, 0], fov: 32 },
      side: { pos: [-hw - 5.5, CY + 1.6, 3.6], target: [hw * 0.4, CY - 0.5, 0], fov: 38 },
      close: { pos: [-hw * 0.35 - 0.6, CY + 0.5, 2.9], target: [hw * 0.45, CY - 0.1, -0.2], fov: 38 },
      top: { pos: [0, CY + 12 + hw, 4.5], target: [0, CY - 1.2, 0], fov: 34 },
      output: { pos: [hw + 4.2, CY + 0.7, 5.2], target: [hw - 1.6, CY - 0.1, 0], fov: 30 },
      low: { pos: [-hw * 0.6, 0.9, hw * 1.3 + 6.5], target: [0, CY - 0.2, 0], fov: 32 },
    };
  },
  defaultCamera: { from: 'wide', to: 'front', orbit: 14 },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const { layers, L, W, dy, H, ring } = layout(p);
    const base = createBase(ctx, { fog: 0.02, shadowSize: 12, glow: 0.035, glowDir: [0, 0.5, -1] });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.1, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 380, extent: [W / 2 + 9, 8, 12] });

    /* ---- neuron positions ---- */
    const nodes = []; // {l, i, pos}
    const first = [];
    layers.forEach((n, l) => {
      first.push(nodes.length);
      const x = -W / 2 + l * SP;
      const rr = Math.min(2.5, 0.36 * n + 0.3);
      for (let i = 0; i < n; i++) {
        let y, z;
        if (ring && n > 1) { const a = (i / n) * Math.PI * 2 + l * 0.4; y = CY + Math.cos(a) * rr; z = Math.sin(a) * rr; }
        else { y = CY + (i - (n - 1) / 2) * dy; z = n > 1 ? (((i + l) % 2) ? 0.32 : -0.32) : 0; }
        nodes.push({ l, i, pos: new THREE.Vector3(x, y, z), h: hash1(nodes.length * 97 + 3) });
      }
    });
    const NN = nodes.length;

    /* ---- connections (cap total for performance) ---- */
    const conns = [];
    for (let g = 0; g < L - 1; g++) {
      const total = layers[g] * layers[g + 1];
      const keep = Math.min(1, 150 / total);
      for (let i = 0; i < layers[g]; i++) for (let j = 0; j < layers[g + 1]; j++) {
        const id = conns.length + g * 1000 + i * 37 + j * 11;
        if (keep < 1 && hash1(id * 7 + 1) > keep) continue;
        conns.push({ g, a: first[g] + i, b: first[g + 1] + j, h: hash1(id * 131 + 9) });
      }
    }
    const NC = conns.length;

    const dm = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), tmpC = new THREE.Color(), tmpW = new THREE.Color(), v = new THREE.Vector3();
    const cA = col(theme.accent), cB = col(theme.accent2), cW = col(theme.warm);

    // filaments
    const lineGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 5, 1, true);
    lineGeo.translate(0, 0.5, 0);
    const lines = new THREE.InstancedMesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NC);
    lines.frustumCulled = false; scene.add(lines);
    for (const c of conns) {
      const a = nodes[c.a].pos, b = nodes[c.b].pos;
      c.len = a.distanceTo(b);
      c.q = new THREE.Quaternion().setFromUnitVectors(up, dir.subVectors(b, a).normalize());
    }

    // neurons: glowing core + glass shell
    const cores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NN);
    cores.frustumCulled = false; scene.add(cores);
    const shells = new THREE.InstancedMesh(new THREE.SphereGeometry(0.27, 28, 18), new THREE.MeshPhysicalMaterial({ color: col(theme.accent).lerp(col('#ffffff'), 0.55), metalness: 0, roughness: 0.08, transparent: true, opacity: 0.2, clearcoat: 1, depthWrite: false }), NN);
    shells.frustumCulled = false; shells.renderOrder = 2; scene.add(shells);

    // pulses
    const pGeo = new THREE.SphereGeometry(0.06, 12, 8);
    const fwd = new THREE.InstancedMesh(pGeo, M.glow(theme.accent2, 1.7), NC * 2);
    const bwd = new THREE.InstancedMesh(pGeo, M.glow(theme.warm, 1.5), NC);
    fwd.frustumCulled = bwd.frustumCulled = false; scene.add(fwd); scene.add(bwd);

    // layer base plates (grounding + reflection)
    const plateMat = M.dark('#0a0e14', 0.6);
    const strips = [];
    layers.forEach((n, l) => {
      const x = -W / 2 + l * SP;
      mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.07, 40), plateMat, { pos: [x, 0.035, 0], parent: scene });
      const sm = M.glow(l === L - 1 ? theme.accent2 : theme.accent, 1.2);
      const s = mesh(new THREE.TorusGeometry(0.5, 0.018, 8, 48), sm, { pos: [x, 0.075, 0], rot: [Math.PI / 2, 0, 0], parent: scene, shadow: false });
      strips.push({ s, sm, base: col(l === L - 1 ? theme.accent2 : theme.accent) });
    });

    const labelsArr = Array.isArray(p.labels) ? p.labels : [];
    const labelPos = layers.map((n, l) => new THREE.Vector3(-W / 2 + l * SP, Math.max(0.5, CY - H / 2 - 0.85), 0.2));
    const mid = Math.floor(L / 2);
    const anchors = {
      input: new THREE.Vector3(-W / 2, CY, 0), output: new THREE.Vector3(W / 2, CY, 0),
      hidden: new THREE.Vector3(-W / 2 + mid * SP, CY, 0), center: new THREE.Vector3(0, CY, 0),
    };
    for (let l = 0; l < L; l++) anchors['layer' + l] = new THREE.Vector3(-W / 2 + l * SP, CY + (layers[l] - 1) / 2 * (ring ? 0 : dy) + (ring ? Math.min(2.5, 0.36 * layers[l] + 0.3) : 0) + 0.3, 0);

    const Pd = (L - 1) + 1.3; // wave period in "gap" units
    const nodeOn = (idx, w, c, prob) => nodes[idx].l === 0 || hash1(idx * 173 + c * 7919 + w * 101) < prob;
    let hlState = new Float32Array(L);

    return {
      scene, anchors,
      update(f) {
        const t = f.t, P = f.params;
        const act = clamp(f.tw('activity', 0.7, 0.2, 1.4));
        const hl = f.tw('highlightLayer', -1, 0.3, 1.0);
        const speed = P.speed ?? p.speed ?? 1;
        const training = P.mode === 'training';
        const bAmt = training ? (f.prevParams && f.prevParams.mode !== 'training' ? smoothstep(0, 1.2, f.shotT) : 1) : 0;
        dust.update(t);
        const tw = Math.max(0, t - 1.1) * 1.5 * speed; // wave clock starts after the build-up
        const prob = 0.3 + 0.62 * act;
        const waves = [0, 1].map((w) => { const tau = tw + w * Pd / 2; const c = Math.floor(tau / Pd); return { w, c, x: t < 1.1 ? -9 : tau - c * Pd }; });
        // backward wave (training)
        const tauB = tw * 0.85 + Pd * 0.35, cBk = Math.floor(tauB / Pd), xB = t < 1.1 ? -9 : (L - 1) - (tauB - cBk * Pd) + 0.6;

        for (let l = 0; l < L; l++) hlState[l] = hl < 0 ? 0 : clamp(1 - Math.abs(l - hl));
        const anyHl = hl >= -0.5 ? clamp(hl + 1) : 0;

        /* neurons */
        for (let k = 0; k < NN; k++) {
          const n = nodes[k];
          const rv = anim(t, 0.12 + n.l * 0.2 + n.h * 0.15, 0.6, ease.outBack);
          let flash = 0;
          for (const wv of waves) {
            if (!nodeOn(k, wv.w, wv.c, prob)) continue;
            const d = wv.x - n.l;
            if (d > -0.12 && d < 1.6) flash = Math.max(flash, d < 0 ? (d + 0.12) / 0.12 : Math.exp(-d * 2.6));
          }
          let warm = 0;
          if (bAmt > 0) { const d = n.l - xB; if (d > -0.12 && d < 1.4 && hash1(k * 61 + cBk * 13) < 0.7) warm = (d < 0 ? (d + 0.12) / 0.12 : Math.exp(-d * 3)) * bAmt; }
          const hk = hlState[n.l];
          const dim = 1 - 0.55 * anyHl * (1 - hk);
          const breathe = 0.5 + 0.12 * Math.sin(t * 1.7 + n.h * 6.28);
          const b = (breathe + flash * 0.95 + hk * 0.45) * dim;
          tmpC.copy(n.l === L - 1 ? cB : cA).multiplyScalar(b);
          if (warm > 0) tmpC.lerp(tmpW.copy(cW).multiplyScalar(1.3), warm * 0.6);
          cores.setColorAt(k, tmpC);
          const s = rv * (1 + flash * 0.28 + hk * 0.22);
          dm.position.copy(n.pos); dm.position.y += Math.sin(t * 0.8 + n.h * 6.28) * 0.025;
          dm.quaternion.identity(); dm.scale.setScalar(Math.max(s, 0.0001)); dm.updateMatrix();
          cores.setMatrixAt(k, dm.matrix);
          dm.scale.setScalar(Math.max(rv * (1 + hk * 0.15), 0.0001)); dm.updateMatrix();
          shells.setMatrixAt(k, dm.matrix);
        }
        cores.instanceMatrix.needsUpdate = true; cores.instanceColor.needsUpdate = true; shells.instanceMatrix.needsUpdate = true;

        /* filaments + pulses */
        for (let k = 0; k < NC; k++) {
          const c = conns[k], a = nodes[c.a].pos, b = nodes[c.b].pos;
          const grow = anim(t, 0.45 + c.g * 0.2 + c.h * 0.25, 0.7, ease.outCubic);
          dm.position.copy(a); dm.quaternion.copy(c.q); dm.scale.set(1, Math.max(c.len * grow, 0.0001), 1); dm.updateMatrix();
          lines.setMatrixAt(k, dm.matrix);
          let glow = 0;
          for (const wv of waves) {
            const u = (wv.x - c.g) * 1.25 - c.h * 0.25;
            const on = u > 0 && u < 1 && hash1(k * 29 + wv.c * 577 + wv.w * 53) < 0.4 + 0.5 * act && nodeOn(c.a, wv.w, wv.c, prob) && nodeOn(c.b, wv.w, wv.c, prob);
            const idx = k * 2 + wv.w;
            if (on) {
              const ue = ease.inOutQuad(u);
              v.lerpVectors(a, b, ue);
              dm.position.copy(v); dm.quaternion.identity(); dm.scale.setScalar(0.55 + 0.75 * Math.sin(u * Math.PI)); dm.updateMatrix();
              glow = Math.max(glow, Math.sin(u * Math.PI));
            } else { dm.position.set(0, -50, 0); dm.scale.setScalar(0.0001); dm.updateMatrix(); }
            fwd.setMatrixAt(idx, dm.matrix);
          }
          // backward
          const ub = (c.g + 1) - xB; // 0 at target layer → 1 at source layer
          if (bAmt > 0 && ub > 0 && ub < 1 && hash1(k * 71 + cBk * 331) < 0.3 + 0.3 * act) {
            v.lerpVectors(b, a, ub);
            dm.position.copy(v); dm.quaternion.identity(); dm.scale.setScalar((0.5 + 0.5 * Math.sin(ub * Math.PI)) * bAmt); dm.updateMatrix();
          } else { dm.position.set(0, -50, 0); dm.scale.setScalar(0.0001); dm.updateMatrix(); }
          bwd.setMatrixAt(k, dm.matrix);
          const hk = Math.max(hlState[c.g], hlState[c.g + 1]);
          const dim = 1 - 0.5 * anyHl * (1 - hk);
          tmpC.copy(cA).multiplyScalar((0.13 + glow * 0.9 + hk * 0.18) * dim * grow);
          lines.setColorAt(k, tmpC);
        }
        lines.instanceMatrix.needsUpdate = true; lines.instanceColor.needsUpdate = true;
        fwd.instanceMatrix.needsUpdate = true; bwd.instanceMatrix.needsUpdate = true;

        strips.forEach((st, l) => {
          const rv = anim(t, 0.1 + l * 0.2, 0.6);
          st.s.scale.setScalar(Math.max(rv, 0.001));
          st.sm.color.copy(st.base).multiplyScalar((0.9 + hlState[l] * 1.4) * (1 - 0.5 * anyHl * (1 - hlState[l])));
        });
      },
      labels(f) {
        if (!labelsArr.length) return [];
        const out = [];
        const hl = f.params.highlightLayer ?? -1;
        for (let l = 0; l < L; l++) {
          const text = labelsArr[l];
          if (!text) continue;
          out.push({ pos: labelPos[l], text: String(text), size: 26, bg: true, alpha: anim(f.t, 0.6 + l * 0.2, 0.6), color: l === hl ? theme.text : (l === L - 1 ? theme.accent2 : theme.accent) });
        }
        return out;
      },
    };
  },
};
