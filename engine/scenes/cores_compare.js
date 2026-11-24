// CPU vs GPU explainer: the same job (a wall of 1,296 task tiles forming a
// picture) is given to a few big cores working one task each per cycle, and to
// a grid of ~1,000 tiny cores that finish it almost at once.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, roundedBox, mesh, col, setGlow } from '../core/kit.js';
import { clamp, ease, hash1, lerp, fmtNum } from '../core/util.js';

const SX = 4.4, PLAT = 6.6, COLS = 48, ROWS = 27, PITCH = 0.13, WALL_Z = -3.9, WALL_Y0 = 1.05;
const W = COLS * ROWS, WALL_H = ROWS * PITCH, WALL_W = COLS * PITCH, WALL_TOP = WALL_Y0 + WALL_H;

export default {
  name: 'cores_compare',
  description: 'CPU vs GPU explainer. Two platforms get the same job (a wall of 1,296 task tiles that form a picture). Left: a few large cores light up one after another and fill the wall tile by tile. Right: a grid of ~1,000 tiny cores fires all at once and finishes in a couple of cycles. Live task counters per side.',
  params: {
    leftLabel: 'Title of the left side (default "CPU")',
    rightLabel: 'Title of the right side (default "GPU")',
    leftCores: 'Number of large cores on the left (2-16, default 8)',
    rightGrid: 'Tiny cores per side on the right: N×N grid (8-40, default 32 → 1,024 cores)',
    mode: "'both' | 'left' | 'right' — which side is in focus (the other dims). Tweens when a continued shot changes it.",
    speed: 'Work speed multiplier for both sides (default 1)',
    cues: '{ start: seconds } or { left: seconds, right: seconds } — when each side starts working (first shot of the scene only; default 1.6 s)',
  },
  sample: { leftLabel: 'CPU', rightLabel: 'GPU', leftCores: 8, rightGrid: 32, mode: 'both' },
  framings: {
    wide: { pos: [0, 5.0, 16.4], target: [0, 2.45, -1], fov: 34 },
    left: { pos: [-8.2, 4.6, 10.5], target: [-SX, 2.1, -1.4], fov: 34 },
    right: { pos: [8.2, 4.6, 10.5], target: [SX, 2.1, -1.4], fov: 34 },
    top: { pos: [0, 18.5, 7.5], target: [0, 0.6, -1.2], fov: 36 },
    low: { pos: [0, 0.9, 15.5], target: [0, 2.8, -2], fov: 36 },
    left_cores: { pos: [-8.0, 2.7, 4.9], target: [-SX, 0.75, -0.2], fov: 30 },
    right_cores: { pos: [8.0, 2.7, 4.9], target: [SX, 0.6, -0.2], fov: 30 },
    angle: { pos: [9.5, 4.8, 14.5], target: [0, 2.1, -1], fov: 34 },
  },
  defaultCamera: { from: 'wide', to: 'wide', orbit: 14, push: 0.08 },
  look: { bloom: 0.45 },

  build(ctx, p) {
    const { theme } = ctx;
    const base = createBase(ctx, { fog: 0.016, shadowSize: 15, glow: 0.08, rim: 0.4, rim2: 0.25, horizon: 0.55 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.09, gridScale: 2.2 });
    const dust = addDust(ctx, scene, { count: 320, extent: [16, 7, 12] });
    const dm = new THREE.Object3D();
    const NL = clamp(Math.round(p.leftCores ?? 8), 2, 16), G = clamp(Math.round(p.rightGrid ?? 32), 8, 40), NR = G * G;
    const speed = p.speed ?? 1;
    const cL = 0.55 / speed, cR = 0.95 / speed;
    const t0L = p.cues?.left ?? p.cues?.start ?? 1.6, t0R = p.cues?.right ?? p.cues?.start ?? 1.6;
    const sideCol = [col(theme.warm), col(theme.accent)];

    /* ---- the job: a picture made of task tiles (same on both walls) ---- */
    const img = new Float32Array(W * 3);
    {
      const sky0 = col(theme.accent2), sky1 = col(theme.accent), sun = col(theme.warm), hill = col(theme.accent).multiplyScalar(0.28), hill2 = col(theme.accent2).multiplyScalar(0.5), c = new THREE.Color();
      for (let i = 0; i < W; i++) {
        const cx = (i % COLS) / (COLS - 1), cy = Math.floor(i / COLS) / (ROWS - 1); // cy 0 = top
        c.copy(sky1).lerp(sky0, cy * 0.9);
        const ds = Math.hypot((cx - 0.7) * (COLS / ROWS), cy - 0.34);
        if (ds < 0.17) c.copy(sun); else if (ds < 0.25) c.lerp(sun, 0.45);
        const h1 = 0.62 + 0.16 * Math.sin(cx * 6.5 + 0.6) + 0.05 * Math.sin(cx * 21), h2 = 0.78 + 0.1 * Math.sin(cx * 9 + 2.2);
        if (cy > h1) c.copy(hill2);
        if (cy > h2) c.copy(hill);
        img[i * 3] = c.r; img[i * 3 + 1] = c.g; img[i * 3 + 2] = c.b;
      }
    }
    const tileGeo = new THREE.PlaneGeometry(PITCH * 0.84, PITCH * 0.84);
    const tileLocal = (i, out) => out.set((i % COLS - (COLS - 1) / 2) * PITCH, WALL_TOP - (Math.floor(i / COLS) + 0.5) * PITCH, WALL_Z + 0.075);
    const sides = [-1, 1].map((s, si) => {
      const g = new THREE.Group(); g.position.x = s * SX; scene.add(g);
      // platform
      mesh(roundedBox(PLAT, 0.3, PLAT, 0.35, 0.03), M.dark('#0c1016', 0.6), { pos: [0, 0.15, 0], parent: g });
      const edge = M.glow(sideCol[si], 1.2);
      for (const e of [-1, 1]) {
        mesh(new THREE.BoxGeometry(PLAT - 0.9, 0.025, 0.03), edge, { pos: [0, 0.31, e * (PLAT / 2 - 0.12)], parent: g, shadow: false });
        mesh(new THREE.BoxGeometry(0.03, 0.025, PLAT - 0.9), edge, { pos: [e * (PLAT / 2 - 0.12), 0.31, 0], parent: g, shadow: false });
      }
      // wall
      mesh(new THREE.BoxGeometry(WALL_W + 0.3, WALL_H + 0.3, 0.12), M.dark('#080b10', 0.7), { pos: [0, WALL_Y0 + WALL_H / 2, WALL_Z], parent: g });
      for (const e of [-1, 1]) mesh(new THREE.BoxGeometry(0.14, WALL_Y0, 0.14), M.dark('#10141a', 0.6), { pos: [e * (WALL_W / 2 - 0.3), WALL_Y0 / 2 + 0.1, WALL_Z], parent: g });
      const frame = M.glow(sideCol[si], 0.8);
      for (const e of [-1, 1]) {
        mesh(new THREE.BoxGeometry(WALL_W + 0.3, 0.025, 0.02), frame, { pos: [0, WALL_Y0 + WALL_H / 2 + e * (WALL_H / 2 + 0.14), WALL_Z + 0.07], parent: g, shadow: false });
        mesh(new THREE.BoxGeometry(0.025, WALL_H + 0.3, 0.02), frame, { pos: [e * (WALL_W / 2 + 0.14), WALL_Y0 + WALL_H / 2, WALL_Z + 0.07], parent: g, shadow: false });
      }
      const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), W);
      const v = new THREE.Vector3();
      for (let i = 0; i < W; i++) { tileLocal(i, v); dm.position.copy(v); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); tiles.setMatrixAt(i, dm.matrix); }
      tiles.setColorAt(0, new THREE.Color(0, 0, 0)); tiles.frustumCulled = false; g.add(tiles);
      const light = new THREE.PointLight(sideCol[si], 0, 10, 1.7); light.position.set(0, 2.2, 0.5); g.add(light);
      return { s, si, g, edge, frame, tiles, light, done: 0, focus: 1 };
    });

    /* ---- left: a few big cores ---- */
    const lc = Math.ceil(Math.sqrt(NL)), lr = Math.ceil(NL / lc);
    const lb = Math.min(4.9 / lc, 4.9 / lr) * 0.78;
    const lPos = [];
    const bigBody = new THREE.InstancedMesh(roundedBox(lb, 0.6, lb, lb * 0.1, 0.03), new THREE.MeshStandardMaterial({ color: col('#1b2028'), metalness: 0.6, roughness: 0.5 }), NL);
    const bigTop = new THREE.InstancedMesh(new THREE.PlaneGeometry(lb * 0.68, lb * 0.68), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NL);
    for (let k = 0; k < NL; k++) {
      const cx = (k % lc - (lc - 1) / 2) * (4.9 / lc), cz = (Math.floor(k / lc) - (lr - 1) / 2) * (4.9 / lr) + 0.3;
      lPos.push(new THREE.Vector3(cx, 0.6, cz));
      dm.position.set(cx, 0.6, cz); dm.rotation.set(0, 0, 0); dm.updateMatrix(); bigBody.setMatrixAt(k, dm.matrix);
      dm.position.set(cx, 0.905, cz); dm.rotation.set(-Math.PI / 2, 0, 0); dm.updateMatrix(); bigTop.setMatrixAt(k, dm.matrix);
    }
    bigBody.castShadow = bigBody.receiveShadow = true;
    bigTop.setColorAt(0, new THREE.Color(0, 0, 0));
    sides[0].g.add(bigBody, bigTop);

    /* ---- right: a grid of tiny cores ---- */
    const cell = 5.5 / G;
    mesh(roundedBox(5.8, 0.14, 5.8, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: col('#141920'), metalness: 0.5, roughness: 0.55 }), { pos: [0, 0.37, 0.3], parent: sides[1].g });
    const small = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 0.76, 0.05, cell * 0.76), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NR);
    const rPos = [];
    for (let k = 0; k < NR; k++) {
      const cx = (k % G - (G - 1) / 2) * cell, cz = (Math.floor(k / G) - (G - 1) / 2) * cell + 0.3;
      rPos.push(new THREE.Vector3(cx, 0.47, cz));
      dm.position.set(cx, 0.46, cz); dm.rotation.set(0, 0, 0); dm.updateMatrix(); small.setMatrixAt(k, dm.matrix);
    }
    small.setColorAt(0, new THREE.Color(0, 0, 0)); small.frustumCulled = false;
    sides[1].g.add(small);

    /* ---- flying task results (core → wall) ---- */
    const NPR = 240;
    const partL = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), M.glow(theme.warm, 2.4), NL);
    const partR = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), M.glow(theme.accent, 2.0), NPR);
    partL.frustumCulled = partR.frustumCulled = false;
    sides[0].g.add(partL); sides[1].g.add(partR);

    const tL = (i) => t0L + Math.floor(i / NL) * cL + ((i % NL) / NL) * cL * 0.6 + cL * 0.4;
    const tR = (i) => t0R + Math.floor(i / NR) * cR + cR * (0.45 + 0.5 * hash1(i * 17 + 3));
    const endL = t0L + Math.ceil(W / NL) * cL, endR = t0R + Math.ceil(W / NR) * cR;
    const va = new THREE.Vector3(), vb = new THREE.Vector3();
    const focusOf = (mode, si) => (!mode || mode === 'both' || (mode === 'left') === (si === 0) ? 1 : 0.22);
    const dimC = [0.035, 0.045, 0.06];

    const fly = (meshI, idx, from, to, u, size) => {
      if (u <= 0 || u >= 1) { dm.position.set(0, -50, 0); dm.scale.setScalar(0.001); }
      else {
        const e = ease.inOutCubic(u);
        dm.position.lerpVectors(from, to, e); dm.position.y += Math.sin(Math.PI * e) * 1.1;
        dm.scale.setScalar(size * (0.5 + 0.5 * Math.sin(Math.PI * u)));
      }
      dm.rotation.set(u * 3, u * 4, 0); dm.updateMatrix(); meshI.setMatrixAt(idx, dm.matrix);
    };

    const labelPos = sides.map((sd) => ({ title: new THREE.Vector3(sd.s * SX, WALL_TOP + 0.95, WALL_Z), count: new THREE.Vector3(sd.s * SX, WALL_TOP + 0.4, WALL_Z) }));
    const anchors = {
      left_cores: new THREE.Vector3(-SX + lPos[NL - 1].x, 0.95, lPos[NL - 1].z), right_cores: new THREE.Vector3(SX + 1.6, 0.5, 1.6),
      left_wall: new THREE.Vector3(-SX + WALL_W / 2 - 0.4, WALL_Y0 + WALL_H * 0.7, WALL_Z + 0.1), right_wall: new THREE.Vector3(SX + WALL_W / 2 - 0.4, WALL_Y0 + WALL_H * 0.7, WALL_Z + 0.1),
    };
    let intro = 0;

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        intro = ease.outCubic(clamp(t / 1.5));
        const mk = ease.inOutCubic(clamp((f.shotT - 0.3) / 1.2));
        sides.forEach((sd) => { sd.focus = lerp(focusOf(f.prevParams ? f.prevParams.mode : f.params.mode, sd.si), focusOf(f.params.mode, sd.si), mk); });

        // walls
        sides.forEach((sd) => {
          const arr = sd.tiles.instanceColor.array, tf = sd.si === 0 ? tL : tR, fo = sd.focus * intro;
          let done = 0;
          for (let i = 0; i < W; i++) {
            const dt = t - tf(i);
            let r = dimC[0], g = dimC[1], b = dimC[2];
            if (dt >= 0) {
              done++;
              const k = Math.min(1, dt / 0.12), fl = 0.85 + 1.3 * Math.exp(-dt * 6);
              r = lerp(r, img[i * 3] * fl, k); g = lerp(g, img[i * 3 + 1] * fl, k); b = lerp(b, img[i * 3 + 2] * fl, k);
            }
            arr[i * 3] = r * fo; arr[i * 3 + 1] = g * fo; arr[i * 3 + 2] = b * fo;
          }
          sd.done = done; sd.tiles.instanceColor.needsUpdate = true;
          setGlow(sd.edge, 1.2 * fo); setGlow(sd.frame, 0.8 * fo);
        });

        // left cores: one after another
        {
          const sd = sides[0], arr = bigTop.instanceColor.array, c = sideCol[0];
          const working = t >= t0L && t < endL, ph = working ? ((t - t0L) / cL) % 1 : 0;
          let sum = 0;
          for (let k = 0; k < NL; k++) {
            let b = 0.1 + 0.05 * Math.sin(t * 1.3 + k);
            if (working) { const u = (ph - (k / NL) * 0.6) / 0.4; if (u > 0 && u < 1) b += 1.05 * Math.sin(Math.PI * u); }
            else if (t >= endL) b = 0.45 + 0.12 * Math.sin(t * 2 + k);
            b *= sd.focus * intro; sum += b;
            arr[k * 3] = c.r * b; arr[k * 3 + 1] = c.g * b; arr[k * 3 + 2] = c.b * b;
          }
          bigTop.instanceColor.needsUpdate = true;
          sd.light.intensity = (1.5 + sum * 1.5) * sd.focus * intro;
          const cyc = Math.floor((t - t0L) / cL);
          for (let k = 0; k < NL; k++) {
            const i = cyc * NL + k;
            if (t < t0L || i >= W || i < 0) { fly(partL, k, va, vb, -1, 1); continue; }
            va.copy(lPos[k]); va.y = 0.95; tileLocal(i, vb);
            fly(partL, k, va, vb, (t - (tL(i) - 0.26)) / 0.26, 1);
          }
          partL.instanceMatrix.needsUpdate = true;
        }
        // right cores: all at once
        {
          const sd = sides[1], arr = small.instanceColor.array, c = sideCol[1];
          const working = t >= t0R && t < endR, ph = working ? ((t - t0R) / cR) % 1 : 0;
          const env = working ? Math.pow(Math.sin(Math.PI * Math.min(1, ph * 1.25)), 0.7) : 0;
          const after = t >= endR ? 1 : 0;
          for (let k = 0; k < NR; k++) {
            const h = hash1(k * 29 + 11);
            let b = 0.07 + 0.04 * Math.sin(t * 1.1 + h * 40);
            if (working) b += env * (0.3 + 0.8 * h);
            else if (after) b = 0.2 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(t * (1.2 + h * 2.5) + h * 60), 6);
            b *= sd.focus * intro;
            arr[k * 3] = c.r * b; arr[k * 3 + 1] = c.g * b; arr[k * 3 + 2] = c.b * b;
          }
          small.instanceColor.needsUpdate = true;
          sd.light.intensity = (1.5 + env * 6 + after * 2.5) * sd.focus * intro;
          const cyc = Math.floor((t - t0R) / cR);
          for (let j = 0; j < NPR; j++) {
            const i = cyc * NR + Math.floor(hash1(j * 13 + cyc * 7919 + 5) * NR);
            if (t < t0R || i >= W || i < 0) { fly(partR, j, va, vb, -1, 1); continue; }
            va.copy(rPos[i % NR]); tileLocal(i, vb);
            fly(partR, j, va, vb, (t - (tR(i) - 0.34)) / 0.34, 1);
          }
          partR.instanceMatrix.needsUpdate = true;
        }
        dm.scale.setScalar(1);
      },
      labels(f) {
        const out = [];
        const names = [p.leftLabel ?? 'CPU', p.rightLabel ?? 'GPU'];
        const subs = [`${NL} powerful cores`, `${fmtNum(NR)} small cores`];
        sides.forEach((sd, si) => {
          const a = clamp(intro * (0.35 + 0.65 * sd.focus) * (sd.focus < 0.5 ? 0.6 : 1));
          const c = '#' + sideCol[si].getHexString();
          out.push({ pos: labelPos[si].title, text: `${names[si]}  ·  ${subs[si]}`, size: 38, color: theme.text, alpha: a, weight: 700 });
          const fin = sd.done >= W;
          out.push({ pos: labelPos[si].count, text: fin ? `${fmtNum(W)} / ${fmtNum(W)}  DONE` : `${fmtNum(sd.done)} / ${fmtNum(W)} tasks`, size: 30, font: 'mono', color: c, alpha: a, weight: 500, bg: true });
        });
        return out;
      },
    };
  },
};
