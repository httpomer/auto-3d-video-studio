// How a language model works: input token blocks fly in, flow through a stack
// of translucent transformer layers (attention lines light up layer by layer)
// and predicted tokens emerge one by one on the other side.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, roundedBox, textPlane, col } from '../core/kit.js';
import { clamp, hash1, ease, anim, smoothstep } from '../core/util.js';

const Y0 = 1.25, XS = 2.4, XEDGE = 4.5, STEP = 1.7, WAVE = 1.25;

function lay(p = {}) {
  const input = (Array.isArray(p.input) && p.input.length ? p.input : ['The', 'future', 'of', 'computing', 'is']).slice(0, 8).map(String);
  const output = (Array.isArray(p.output) && p.output.length ? p.output : ['accelerated', '.']).slice(0, 6).map(String);
  const n = input.length;
  const dy = n > 1 ? Math.min(0.8, 4.4 / (n - 1)) : 0.8;
  const H = (n - 1) * dy;
  const L = clamp(Math.round(p.layers ?? 6), 2, 10);
  return { input, output, n, dy, H, cy: Y0 + H / 2, L };
}
const blockW = (s) => clamp(0.6 + 0.2 * s.length, 0.95, 3.4);

export default {
  name: 'token_stream',
  description: 'How a language model predicts text: a column of input word tokens flies in from the left, flows through a stack of translucent transformer layers whose attention lines light up layer by layer, and predicted output tokens emerge one at a time on the right with the newest highlighted.',
  params: {
    input: 'Array of input tokens (1–8 short words), e.g. ["The","future","of","computing","is"]',
    output: 'Array of predicted tokens (1–6) that emerge one by one, e.g. ["accelerated","."]',
    layers: 'Number of transformer layers in the stack, 2–10 (default 6)',
    speed: 'Time scale of the whole animation (default 1; first output appears ~3.2 s / speed, then one every ~1.7 s / speed)',
    cues: 'emit — shot-local time at which the FIRST output token emerges (later tokens follow automatically)',
  },
  sample: { input: ['The', 'future', 'of', 'computing', 'is'], output: ['accelerated', '.'], layers: 6 },
  framings: (p) => {
    const { cy } = lay(p);
    return {
      wide: { pos: [0, cy + 1.0, 16.2], target: [0, cy - 0.25, 0], fov: 34 },
      input: { pos: [-8.6, cy + 0.7, 8.6], target: [-4.2, cy - 0.1, 0], fov: 32 },
      stack: { pos: [3.4, cy + 1.5, 8.0], target: [0, cy - 0.1, 0], fov: 32 },
      output: { pos: [8.8, cy + 0.7, 8.6], target: [4.4, cy - 0.1, 0], fov: 32 },
      top: { pos: [0, cy + 15, 6.5], target: [0, 1.2, 0.4], fov: 34 },
      low: { pos: [-5.5, 0.7, 13.5], target: [0, cy + 0.1, 0], fov: 32 },
      through: { pos: [-9.5, cy + 0.9, 3.4], target: [2, cy - 0.2, 0], fov: 38 },
    };
  },
  defaultCamera: { from: 'wide', to: 'wide', orbit: 20, push: 0.08 },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const { input, output, n, dy, H, cy, L } = lay(p);
    const M_OUT = output.length;
    const speed = clamp(p.speed ?? 1, 0.3, 3);
    const base = createBase(ctx, { fog: 0.02, shadowSize: 12, glow: 0.035, glowDir: [0, 0.5, -1] });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.09, gridScale: 2.2 });
    const dust = addDust(ctx, scene, { count: 340, extent: [15, 8, 12] });
    const cA = col(theme.accent), cB = col(theme.accent2), cB2 = col(theme.accent2).lerp(col('#ffffff'), 0.35);
    const dm = new THREE.Object3D(), v = new THREE.Vector3(), tmpC = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    const laneY = (i) => Y0 + (n - 1 - i) * dy;

    /* ---- token blocks ---- */
    const bodyMat = new THREE.MeshStandardMaterial({ color: col('#5d6f8a'), metalness: 0.3, roughness: 0.42 });
    const mkBlock = (text, color) => {
      const w = blockW(text);
      const g = new THREE.Group(); scene.add(g);
      mesh(roundedBox(w, 0.52, 0.36, 0.1, 0.02), bodyMat, { parent: g });
      const gm = M.glow(color, 1.2);
      mesh(new THREE.BoxGeometry(w - 0.16, 0.03, 0.03), gm, { pos: [0, -0.262, 0.19], parent: g, shadow: false });
      mesh(new THREE.BoxGeometry(w - 0.16, 0.03, 0.03), gm, { pos: [0, 0.262, 0.19], parent: g, shadow: false });
      const cw = Math.round(192 * (w / 0.52));
      const tp = textPlane(text, w, { w: cw, h: 192, size: 92, weight: 600, font: '"JetBrains Mono", monospace', color: '#ffffff' });
      tp.position.set(0, 0, 0.207); tp.renderOrder = 5; g.add(tp);
      return { g, gm, w, text, tp, labelPos: new THREE.Vector3() };
    };
    const inBlocks = input.map((tx, i) => { const b = mkBlock(tx, theme.accent); b.y = laneY(i); b.x = -XEDGE - b.w / 2; b.h = hash1(i * 31 + 3); return b; });
    const outTop = cy + ((M_OUT - 1) * 0.8) / 2;
    const outBlocks = output.map((tx, m) => { const b = mkBlock(tx, theme.accent2); b.y = outTop - m * 0.8; b.x = XEDGE + b.w / 2; return b; });

    /* ---- transformer stack ---- */
    const slabX = (k) => -XS + k * (2 * XS / (L - 1));
    const Hs = H + 1.3, DEP = 2.7;
    mesh(roundedBox(2 * XS + 1.3, 0.24, DEP + 0.9, 0.25, 0.03), M.dark('#0b0f15', 0.55), { pos: [0, 0.12, 0], parent: scene });
    const baseGlow = M.glow(theme.accent, 1.1);
    mesh(new THREE.BoxGeometry(2 * XS + 0.9, 0.02, 0.05), baseGlow, { pos: [0, 0.25, DEP / 2 + 0.25], parent: scene, shadow: false });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: col(theme.accent).lerp(col('#ffffff'), 0.55), roughness: 0.25, metalness: 0, transparent: true, opacity: 0.07, clearcoat: 0.25, depthWrite: false, side: THREE.DoubleSide });
    const slabs = [];
    for (let k = 0; k < L; k++) {
      const g = new THREE.Group(); g.position.set(slabX(k), 0.24, 0); scene.add(g);
      const pane = mesh(new THREE.BoxGeometry(0.07, Hs, DEP), glassMat, { pos: [0, Hs / 2, 0], parent: g, shadow: false }); pane.renderOrder = 3;
      const fm = M.glow(theme.accent, 0.8);
      const tk = 0.028;
      mesh(new THREE.BoxGeometry(tk, tk, DEP), fm, { pos: [0, Hs, 0], parent: g, shadow: false });
      mesh(new THREE.BoxGeometry(tk, tk, DEP), fm, { pos: [0, 0.02, 0], parent: g, shadow: false });
      mesh(new THREE.BoxGeometry(tk, Hs, tk), fm, { pos: [0, Hs / 2, DEP / 2], parent: g, shadow: false });
      mesh(new THREE.BoxGeometry(tk, Hs, tk), fm, { pos: [0, Hs / 2, -DEP / 2], parent: g, shadow: false });
      slabs.push({ g, fm });
    }
    // lane nodes inside the stack (depth-staggered so the web reads as 3D)
    const nodePos = [];
    for (let k = 0; k < L; k++) { nodePos.push([]); for (let i = 0; i < n; i++) nodePos[k].push(new THREE.Vector3(slabX(k), laneY(i), k === 0 ? 0 : (hash1(k * 17 + i * 53 + 1) - 0.5) * 1.5)); }
    const NNODE = L * n;
    const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NNODE);
    nodes.frustumCulled = false; scene.add(nodes);
    // attention lines
    const att = [];
    for (let k = 0; k < L - 1; k++) for (let i = 0; i < n; i++) {
      const targets = new Set([i]);
      for (let q = 0; q < 2 && n > 1; q++) targets.add(Math.floor(hash1(k * 101 + i * 37 + q * 7 + 5) * n));
      for (const j of targets) {
        const a = nodePos[k][i], b = nodePos[k + 1][j];
        att.push({ k, a, b, len: a.distanceTo(b), q: new THREE.Quaternion().setFromUnitVectors(up, dir.subVectors(b, a).normalize()), h: hash1(att.length * 19 + 7), self: i === j });
      }
    }
    const lineGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true); lineGeo.translate(0, 0.5, 0);
    const lines = new THREE.InstancedMesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), att.length);
    lines.frustumCulled = false; scene.add(lines);
    att.forEach((c, i) => { dm.position.copy(c.a); dm.quaternion.copy(c.q); dm.scale.set(1, c.len, 1); dm.updateMatrix(); lines.setMatrixAt(i, dm.matrix); });
    // feed lanes (input → stack) + pulses
    const feedGeo = new THREE.CylinderGeometry(0.01, 0.01, 1, 5, 1, true); feedGeo.rotateZ(-Math.PI / 2); feedGeo.translate(0.5, 0, 0);
    const feeds = new THREE.InstancedMesh(feedGeo, M.glow(theme.accent, 0.3), n);
    feeds.frustumCulled = false; scene.add(feeds);
    const PPL = 3;
    const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 10, 8), M.glow(theme.accent, 1.7), n * PPL);
    pulses.frustumCulled = false; scene.add(pulses);
    const exitPos = new THREE.Vector3(XS + 0.15, cy, 0);
    const outLines = new THREE.InstancedMesh(lineGeo, M.glow(theme.accent2, 0.5), M_OUT);
    outLines.frustumCulled = false; scene.add(outLines);
    outBlocks.forEach((b) => { v.set(XEDGE, b.y, 0); b.lineLen = v.distanceTo(exitPos); b.lineQ = new THREE.Quaternion().setFromUnitVectors(up, dir.subVectors(v, exitPos).normalize()); });
    const outLight = new THREE.PointLight(col(theme.accent2), 0, 7, 1.8); outLight.position.set(XS + 1.2, cy, 1.0); scene.add(outLight);

    const anchors = {
      input: new THREE.Vector3(-XEDGE - 0.8, laneY(0) + 0.3, 0.2), stack: new THREE.Vector3(0, 0.24 + Hs, DEP / 2),
      layer: new THREE.Vector3(slabX(Math.floor(L / 2)), 0.24 + Hs, 0), output: new THREE.Vector3(XEDGE + 0.8, outTop + 0.3, 0.2), exit: exitPos.clone(),
    };

    // scene-time of the first emission
    const emitTime = (f) => {
      const c = f.params.cues && f.params.cues.emit;
      if (c != null) return Math.max(1.6, c + (f.t - f.shotT));
      return 3.2 / speed;
    };
    const st = { E0: 0, newest: -1 };

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        const E0 = emitTime(f); st.E0 = E0;
        const stepT = STEP / speed, waveT = WAVE / speed;
        const lastE = E0 + (M_OUT - 1) * stepT;

        /* input tokens fly in */
        inBlocks.forEach((b, i) => {
          const k = anim(t, 0.05 + i * 0.1, 0.9, ease.outCubic);
          b.g.position.set(b.x - (1 - k) * 9, b.y + Math.sin(t * 0.9 + b.h * 6.28) * 0.02, 0);
          b.g.visible = k > 0.001;
          b.labelPos.set(b.g.position.x, b.g.position.y, 0.2); b.alpha = clamp(k * 1.5 - 0.3);
          b.gm.color.copy(b.gm.userData.baseColor).multiplyScalar(1.0 + 0.25 * Math.sin(t * 1.6 + i * 0.9));
          const fk = anim(t, 0.9 + i * 0.08, 0.6);
          dm.position.set(-XEDGE, b.y, 0); dm.quaternion.identity(); dm.scale.set(Math.max((XEDGE - XS) * fk, 0.0001), 1, 1); dm.updateMatrix(); feeds.setMatrixAt(i, dm.matrix);
          for (let q = 0; q < PPL; q++) {
            const u = (t * 0.55 * speed + q / PPL + b.h) % 1;
            const on = t > 1.4;
            dm.position.set(-XEDGE + u * (XEDGE - XS), b.y, 0); dm.scale.setScalar(on ? 0.4 + 0.8 * Math.sin(u * Math.PI) : 0.0001); dm.updateMatrix();
            pulses.setMatrixAt(i * PPL + q, dm.matrix);
          }
        });
        feeds.instanceMatrix.needsUpdate = true; pulses.instanceMatrix.needsUpdate = true;

        /* processing waves: one per generated token, then gentle idle waves */
        const waveX = []; // positions (in slab units) of active waves, with strength
        for (let m = 0; m < M_OUT; m++) { const x = ((t - (E0 + m * stepT - waveT)) / waveT) * (L - 1); if (x > -1 && x < L + 0.5) waveX.push([x, 1]); }
        if (t > lastE + 1.2) { const tt = (t - lastE - 1.2) % (2.6 / speed); waveX.push([(tt / waveT) * (L - 1), 0.45]); }
        const glowAt = (pos, width) => { let g = 0; for (const [x, s] of waveX) { const d = (pos - x) / width; g = Math.max(g, Math.exp(-d * d) * s); } return g; };

        slabs.forEach((s, k) => {
          const b = anim(t, 0.25 + k * 0.1, 0.8, ease.outCubic);
          s.g.scale.set(1, Math.max(b, 0.001), 1); s.g.visible = b > 0.001;
          s.fm.color.copy(s.fm.userData.baseColor).multiplyScalar(0.55 + 1.2 * glowAt(k, 0.6));
        });
        const built = anim(t, 1.0, 0.8);
        for (let k = 0; k < L; k++) for (let i = 0; i < n; i++) {
          const g = glowAt(k, 0.55);
          dm.position.copy(nodePos[k][i]); dm.quaternion.identity(); dm.scale.setScalar(Math.max(built * (0.7 + 0.7 * g), 0.0001)); dm.updateMatrix();
          nodes.setMatrixAt(k * n + i, dm.matrix);
          tmpC.copy(cA).lerp(cB, g * 0.7).multiplyScalar(0.45 + 1.2 * g);
          nodes.setColorAt(k * n + i, tmpC);
        }
        nodes.instanceMatrix.needsUpdate = true; nodes.instanceColor.needsUpdate = true;
        att.forEach((c, i) => {
          const g = glowAt(c.k + 0.5, 0.5);
          const flick = 0.75 + 0.25 * Math.sin(t * 3.1 + c.h * 40);
          tmpC.copy(cA).lerp(cB, c.self ? 0 : g * 0.6).multiplyScalar((0.14 + g * (c.self ? 0.5 : 1.1) * flick) * built);
          lines.setColorAt(i, tmpC);
        });
        lines.instanceColor.needsUpdate = true;
        baseGlow.color.copy(baseGlow.userData.baseColor).multiplyScalar(0.9 + 0.4 * glowAt((L - 1) / 2, L));

        /* output tokens emerge */
        let newest = -1, flash = 0;
        outBlocks.forEach((b, m) => {
          const e = E0 + m * stepT;
          const k = ease.outCubic(clamp((t - e) / (0.8 / Math.sqrt(speed))));
          if (t >= e) newest = m;
          b.g.visible = t >= e;
          v.set(b.x, b.y, 0).sub(exitPos).multiplyScalar(k).add(exitPos);
          b.g.position.copy(v); b.g.position.z = Math.sin(k * Math.PI) * 0.9;
          b.g.scale.setScalar(Math.max(0.001, 0.25 + 0.75 * k));
          b.labelPos.set(b.g.position.x, b.g.position.y, b.g.position.z + 0.2); b.alpha = clamp((k - 0.25) * 2);
          flash = Math.max(flash, smoothstep(-0.25, 0, t - e) * (1 - smoothstep(0, 0.9, t - e)));
          dm.position.copy(exitPos); dm.quaternion.copy(b.lineQ); dm.scale.set(1, Math.max(b.lineLen * k, 0.0001), 1); dm.updateMatrix(); outLines.setMatrixAt(m, dm.matrix);
        });
        outBlocks.forEach((b, m) => {
          const e = E0 + m * stepT;
          const isNew = m === newest ? 1 - 0.0 : 0;
          const settle = m === newest ? 1 : Math.max(0, 1 - (t - (e + stepT)) / 0.6);
          const hl = Math.max(isNew, settle);
          b.hl = hl;
          b.gm.color.copy(b.gm.userData.baseColor).multiplyScalar(0.8 + 1.0 * hl * (0.85 + 0.15 * Math.sin(t * 4)));
          if (b.g.visible) b.g.scale.multiplyScalar(1 + 0.08 * hl);
          b.tp.material.color.set('#ffffff').lerp(cB2, hl * 0.75).multiplyScalar(1.0 + 0.25 * hl);
        });
        st.newest = newest; outLines.instanceMatrix.needsUpdate = true; dm.quaternion.identity();
        outLight.intensity = flash * 9;
      },
    };
  },
};
