// Hero processor on a live circuit board. The lid lifts off to reveal the die,
// whose cores light up in waves while data pulses race along the board traces.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, roundedBox, mesh, circuitTextures, canvasTex, textPlane, col } from '../core/kit.js';
import { clamp, hash1, rng, smoothstep } from '../core/util.js';

export default {
  name: 'chip',
  description: 'Hero processor (CPU / GPU / AI accelerator) on a glowing circuit board. The lid can lift off in an exploded view to reveal the silicon die; its cores light up in waves and data pulses race along the traces.',
  params: {
    label: 'Text engraved on the lid, e.g. "GPU" or "H100" (keep it short)',
    sublabel: 'Optional small second line on the lid',
    explode: 'true|false — exploded view (lid + die + substrate separate). Tweens when a continued shot changes it.',
    cores: 'Core blocks per side on the die: 2-4 = CPU-like, 12-20 = GPU-like (default 14)',
    activity: '0..1 how busy the die and trace pulses are (default 0.8)',
  },
  sample: { label: 'GPU', sublabel: 'AI ACCELERATOR', explode: true, cores: 14 },
  framings: (p) => {
    const ty = p.explode ? 1.9 : 0.55;
    return {
      wide: { pos: [8.5, 6.2, 10.5], target: [0, ty, 0], fov: 34 },
      hero: { pos: [5.2, 4.0 + ty * 0.6, 6.4], target: [0, ty, 0], fov: 32 },
      close: { pos: [2.6, 2.1 + ty, 3.2], target: [0, ty + 0.1, 0], fov: 30 },
      top: { pos: [0.4, 10.5 + ty, 2.2], target: [0, ty * 0.5, 0], fov: 34 },
      low: { pos: [6.4, 1.0, 7.4], target: [0, ty + 0.3, 0], fov: 30 },
      side: { pos: [9.5, 2.2 + ty, 0.6], target: [0, ty, 0], fov: 28 },
      die: { pos: [1.5, 2.6 + (p.explode ? 2.1 : 0.2), 1.9], target: [0, p.explode ? 2.3 : 0.6, 0], fov: 28 },
    };
  },
  defaultCamera: { from: 'wide', to: 'hero', orbit: 18 },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const r = ctx.rng(1);
    const base = createBase(ctx, { fog: 0.028, shadowSize: 9, glow: 0.14 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.55, grid: 0.12, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 350, extent: [14, 7, 14] });

    /* ---- circuit board ---- */
    const BOARD = 12;
    const ct = circuitTextures(11, { cells: 44, traces: 190, glow: theme.accent, base: '#070d0d', trace: '#17322c' });
    mesh(roundedBox(BOARD, 0.18, BOARD, 0.5, 0.02), M.dark('#06090b', 0.5), { pos: [0, 0.09, 0], parent: scene });
    const boardMat = new THREE.MeshStandardMaterial({ map: ct.map, emissiveMap: ct.emissive, emissive: col('#ffffff'), emissiveIntensity: 1.2, roughness: 0.5, metalness: 0.35 });
    const top = mesh(new THREE.PlaneGeometry(BOARD - 0.3, BOARD - 0.3), boardMat, { pos: [0, 0.185, 0], rot: [-Math.PI / 2, 0, 0], parent: scene });
    top.castShadow = false;

    // pulses travelling along traces (stateless: position = f(time))
    const P2W = (BOARD - 0.3) / ct.cells;
    const paths = ct.paths.filter((pp) => pp.length >= 3).map((pp) => {
      const pts = pp.map(([x, y]) => new THREE.Vector3((x - ct.cells / 2) * P2W, 0.2, (y - ct.cells / 2) * P2W));
      const seg = []; let len = 0;
      for (let i = 1; i < pts.length; i++) { const d = pts[i].distanceTo(pts[i - 1]); seg.push(d); len += d; }
      return { pts, seg, len };
    });
    const NP = Math.min(90, paths.length);
    const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), M.glow(theme.accent, 6), NP);
    pulses.frustumCulled = false; scene.add(pulses);
    const pulseInfo = Array.from({ length: NP }, (_, i) => ({ path: paths[(i * 7) % paths.length], speed: r.range(0.12, 0.3), phase: r() }));

    /* ---- package ---- */
    const pkg = new THREE.Group(); scene.add(pkg);
    // socket frame
    const frameMat = M.plastic('#0d1014', 0.55);
    for (const [x, z, w, d] of [[0, 2.15, 4.7, 0.4], [0, -2.15, 4.7, 0.4], [2.15, 0, 0.4, 3.9], [-2.15, 0, 0.4, 3.9]])
      mesh(roundedBox(w, 0.2, d, 0.06, 0.015), frameMat, { pos: [x, 0.28, z], parent: scene });
    // socket contact field
    const padTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#0a0d10'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c8a24a';
      const n = 30, u = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.beginPath(); g.arc((i + 0.5) * u, (j + 0.5) * u, u * 0.28, 0, 7); g.fill(); }
    });
    const socketPads = mesh(new THREE.PlaneGeometry(3.85, 3.85), new THREE.MeshStandardMaterial({ map: padTex, metalness: 0.9, roughness: 0.35 }), { pos: [0, 0.19, 0], rot: [-Math.PI / 2, 0, 0], parent: scene });
    socketPads.castShadow = false;

    // substrate
    const sub = new THREE.Group(); pkg.add(sub);
    const st = circuitTextures(23, { cells: 56, traces: 320, glow: theme.accent2, base: '#0b2a22', trace: '#165a44', pad: '#d8b45a', size: 1024 });
    mesh(roundedBox(3.8, 0.14, 3.8, 0.12, 0.015), M.plastic('#0a211b', 0.6), { pos: [0, 0, 0], parent: sub });
    const subTop = mesh(new THREE.PlaneGeometry(3.7, 3.7), new THREE.MeshStandardMaterial({ map: st.map, emissiveMap: st.emissive, emissive: col('#ffffff'), emissiveIntensity: 0.5, roughness: 0.45, metalness: 0.4 }), { pos: [0, 0.073, 0], rot: [-Math.PI / 2, 0, 0], parent: sub });
    subTop.castShadow = false;
    // SMD capacitors
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: col('#b08a5a'), roughness: 0.5, metalness: 0.3 }), 72);
    const dm = new THREE.Object3D();
    let ci = 0;
    for (let s = 0; s < 4; s++) for (let i = 0; i < 18; i++) {
      const a = -1.5 + (i / 17) * 3.0, off = 1.55 + (i % 2) * 0.13;
      const x = s < 2 ? a : (s === 2 ? off : -off), z = s < 2 ? (s === 0 ? off : -off) : a;
      dm.position.set(x, 0.1, z); dm.rotation.y = s < 2 ? 0 : Math.PI / 2; dm.updateMatrix(); caps.setMatrixAt(ci++, dm.matrix);
    }
    caps.castShadow = true; sub.add(caps);
    // BGA balls under the substrate
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), M.metal('#d9dde4', 0.25), 24 * 24);
    let bi = 0;
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) { dm.rotation.set(0, 0, 0); dm.position.set(-1.725 + i * 0.15, -0.085, -1.725 + j * 0.15); dm.updateMatrix(); balls.setMatrixAt(bi++, dm.matrix); }
    sub.add(balls);

    // die
    const die = new THREE.Group(); pkg.add(die);
    const DIE = 2.1;
    mesh(roundedBox(DIE, 0.07, DIE, 0.03, 0.008), M.silicon(), { parent: die });
    const N = clamp(Math.round(p.cores ?? 14), 2, 22);
    const gap = N <= 6 ? 0.06 : 0.025;
    const cell = (DIE - 0.16) / N;
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(cell - gap, 0.012, cell - gap), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N * N);
    const tilePos = [];
    let ti = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = -DIE / 2 + 0.08 + (i + 0.5) * cell, z = -DIE / 2 + 0.08 + (j + 0.5) * cell;
      dm.position.set(x, 0.042, z); dm.rotation.set(0, 0, 0); dm.updateMatrix(); tiles.setMatrixAt(ti, dm.matrix); tilePos.push([x, z, hash1(ti * 31 + 5)]); ti++;
    }
    tiles.castShadow = false; die.add(tiles);
    const cA = col(theme.accent), cB = col(theme.accent2), tmp = new THREE.Color();

    // lid (integrated heat spreader)
    const lid = new THREE.Group(); pkg.add(lid);
    mesh(roundedBox(3.3, 0.2, 3.3, 0.22, 0.03), M.brushed('#9aa3ae'), { parent: lid });
    mesh(roundedBox(2.7, 0.06, 2.7, 0.16, 0.02), M.brushed('#a9b1bb'), { pos: [0, 0.12, 0], parent: lid });
    if (p.label) {
      const lp = textPlane(String(p.label), 2.1, { w: 1024, h: 320, color: '#1d2228', weight: 700 });
      lp.rotation.x = -Math.PI / 2; lp.position.set(0, 0.153, p.sublabel ? -0.18 : 0); lid.add(lp);
    }
    if (p.sublabel) {
      const sp = textPlane(String(p.sublabel).toUpperCase(), 1.9, { w: 1024, h: 128, color: '#2a3038', weight: 600, letterSpacing: '8px', size: 64 });
      sp.rotation.x = -Math.PI / 2; sp.position.set(0, 0.153, 0.5); lid.add(sp);
    }

    const coreLight = new THREE.PointLight(col(theme.accent), 0, 9, 1.8);
    coreLight.position.set(0, 1.2, 0); scene.add(coreLight);

    const anchors = { lid: new THREE.Vector3(), die: new THREE.Vector3(), substrate: new THREE.Vector3(), board: new THREE.Vector3(3.6, 0.2, 3.2), socket: new THREE.Vector3(2.2, 0.35, 1.2) };
    const v = new THREE.Vector3();

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        const e = f.tw('explode', 0, 0.5, 2.4);
        const act = f.tw('activity', 0.8, 0.2, 1.5);
        dust.update(t);
        sub.position.y = 0.36 + e * 0.75;
        die.position.y = 0.47 + e * 1.85;
        lid.position.y = 0.55 + e * 3.1;
        lid.rotation.y = e * 0.18;
        anchors.lid.set(1.2, lid.position.y + 0.15, 1.2);
        anchors.die.set(0.6, die.position.y + 0.05, 0.6);
        anchors.substrate.set(1.7, sub.position.y + 0.08, 1.5);
        // die cores: travelling activity waves
        for (let i = 0; i < tilePos.length; i++) {
          const [x, z, h] = tilePos[i];
          const w1 = Math.sin(t * 2.2 - (x + z) * 2.6 + h * 1.5), w2 = Math.sin(t * 3.7 + x * 4.0 - z * 3.1 + h * 6.28);
          let b = smoothstep(0.1, 1.0, w1 * 0.6 + w2 * 0.4 + (h - 0.5) * 0.8) * act;
          b = 0.1 + b * b * 1.7;
          tmp.copy(h > 0.82 ? cB : cA).multiplyScalar(b * (0.35 + 0.65 * e + 0.0));
          tiles.setColorAt(i, tmp);
        }
        tiles.instanceColor.needsUpdate = true;
        coreLight.intensity = (0.4 + 5 * e) * (0.85 + 0.15 * Math.sin(t * 2.2)) * act;
        coreLight.position.y = die.position.y + 0.9;
        boardMat.emissiveIntensity = 1.3 + 0.6 * act + 0.25 * Math.sin(t * 1.3);
        // trace pulses
        for (let i = 0; i < NP; i++) {
          const pi = pulseInfo[i], pa = pi.path;
          const u = (t * pi.speed + pi.phase) % 1;
          let d = u * pa.len, k = 0;
          while (k < pa.seg.length - 1 && d > pa.seg[k]) { d -= pa.seg[k]; k++; }
          v.lerpVectors(pa.pts[k], pa.pts[k + 1], clamp(d / pa.seg[k]));
          const s = Math.sin(u * Math.PI) * (i / NP < act ? 1 : 0);
          dm.position.copy(v); dm.rotation.set(0, 0, 0); dm.scale.setScalar(Math.max(s, 0.001)); dm.updateMatrix();
          pulses.setMatrixAt(i, dm.matrix);
        }
        dm.scale.setScalar(1);
        pulses.instanceMatrix.needsUpdate = true;
      },
    };
  },
};
