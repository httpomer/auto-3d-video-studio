// Generic (unbranded) graphics card floating over a studio floor. Fans spin,
// and an exploded view separates shroud+fans / heatsink / PCB / backplate so
// the GPU chip underneath the cooler becomes visible.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, roundedBox, mesh, circuitTextures, canvasTex, textPlane, col, setGlow } from '../core/kit.js';
import { clamp, ease, hash1 } from '../core/util.js';

const LEN = 6.4, WID = 2.8;

function fanBlade(r0, r1) {
  const NU = 10, NV = 4, pos = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, r = r0 + (r1 - r0) * u;
    const w = 0.30 - 0.10 * u, sweep = 0.55 * u * u;
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1, a = sweep + v * w;
      pos.push(r * Math.cos(a), v * 0.06 * (0.6 + 0.4 * (1 - u)) , r * Math.sin(a));
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export default {
  name: 'gpu_card',
  description: 'A generic unbranded graphics card floating over a glossy studio floor: shroud with 2-3 spinning fans, aluminium fin stack with copper heat pipes, PCB with GPU chip / memory / power stages, backplate and PCIe gold fingers. An exploded view separates the layers to reveal the chip.',
  params: {
    fans: 'Number of fans: 2 or 3 (default 3)',
    explode: 'true|false — exploded view (shroud+fans, heatsink, PCB, backplate separate). Tweens when a continued shot changes it.',
    label: 'Optional short text printed on the side of the shroud (no real brand names/logos)',
    spin: 'Fan speed multiplier (default 1)',
    activity: '0..1 glow of the GPU chip and light strip (default 0.8)',
    cues: '{ explode: seconds } — when the explode tween starts in this shot (default 0.5 s)',
  },
  sample: { fans: 3, explode: true, label: 'RTX CLASS GPU' },
  framings: (p) => {
    const e = p.explode ? 1 : 0, ty = 1.55 + 0.95 * e, k = 1 + 0.32 * e;
    return {
      hero: { pos: [5.4 * k, ty + 3.3 * k, 7.6 * k], target: [0, ty, 0], fov: 32 },
      wide: { pos: [8.2 * k, ty + 4.2, 11.5 * k], target: [0, ty, 0], fov: 34 },
      close: { pos: [3.1, ty + 2.5 + 1.9 * e, 3.6], target: [1.2, ty + 0.35 + 1.75 * e, 0.2], fov: 30 },
      top: { pos: [0.3, ty + 10.5 * k, 3.4], target: [0, ty, 0], fov: 32 },
      low: { pos: [5.6 * k, 0.6, 8.6 * k], target: [0, ty + 0.2, 0], fov: 32 },
      side: { pos: [1.2, ty + 0.9, 11.8 * k], target: [0, ty, 0], fov: 28 },
      chip: { pos: [-2.4, ty + 0.75 - 0.2 * e, 3.6], target: [-0.3, ty - 0.55 * e - 0.1 * (1 - e), 0.1], fov: 30 },
      end: { pos: [10.5 * k, ty + 1.6, 2.6], target: [0, ty, 0], fov: 28 },
    };
  },
  defaultCamera: { from: 'wide', to: 'hero', orbit: 16 },
  look: { bloom: 0.45 },

  build(ctx, p) {
    const { theme } = ctx;
    const base = createBase(ctx, { fog: 0.024, shadowSize: 10, glow: 0.1, rim: 0.45, rim2: 0.25, horizon: 0.6 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.1, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 320, extent: [14, 8, 14] });
    const dm = new THREE.Object3D();

    const card = new THREE.Group(); scene.add(card);
    const gBack = new THREE.Group(), gPcb = new THREE.Group(), gSink = new THREE.Group(), gShroud = new THREE.Group();
    card.add(gBack, gPcb, gSink, gShroud);

    /* ---- backplate ---- */
    mesh(roundedBox(LEN, 0.05, WID, 0.12, 0.012), new THREE.MeshStandardMaterial({ color: col('#252a32'), metalness: 0.8, roughness: 0.55 }), { parent: gBack });
    for (const z of [-0.6, 0.6]) mesh(new THREE.BoxGeometry(LEN - 1.2, 0.012, 0.03), M.glow(theme.accent, 1.2), { pos: [0, -0.03, z], parent: gBack, shadow: false });

    /* ---- PCB + components ---- */
    const ct = circuitTextures(31, { cells: 52, traces: 230, glow: theme.accent, base: '#06100d', trace: '#14382c', pad: '#b89a52' });
    mesh(roundedBox(LEN - 0.2, 0.06, WID - 0.2, 0.08, 0.01), M.plastic('#07120e', 0.6), { parent: gPcb });
    const pcbMat = new THREE.MeshStandardMaterial({ map: ct.map, emissiveMap: ct.emissive, emissive: col('#ffffff'), emissiveIntensity: 0.3, roughness: 0.55, metalness: 0.25 });
    ct.map.repeat.set(1, WID / LEN); ct.emissive.repeat.set(1, WID / LEN); ct.map.wrapT = ct.emissive.wrapT = THREE.RepeatWrapping;
    mesh(new THREE.PlaneGeometry(LEN - 0.3, WID - 0.3), pcbMat, { pos: [0, 0.032, 0], rot: [-Math.PI / 2, 0, 0], parent: gPcb, shadow: false });
    // PCIe edge connector (gold fingers) on the near long edge
    const goldTex = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#07120e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e2b54c'; for (let x = 6; x < w - 4; x += 10) g.fillRect(x, 6, 6, h - 10);
    });
    const goldMat = new THREE.MeshStandardMaterial({ map: goldTex, metalness: 0.9, roughness: 0.3 });
    for (const [cx, w] of [[-1.45, 2.5], [-2.95, 0.34]]) {
      mesh(new THREE.BoxGeometry(w, 0.05, 0.34), M.plastic('#07120e', 0.6), { pos: [cx, 0, WID / 2 + 0.05], parent: gPcb });
      const gt = goldTex.clone(); gt.needsUpdate = true; gt.repeat.set(w / 2.5, 1); gt.wrapS = THREE.RepeatWrapping;
      const gm = goldMat.clone(); gm.map = gt;
      mesh(new THREE.PlaneGeometry(w - 0.04, 0.26), gm, { pos: [cx, 0.027, WID / 2 + 0.07], rot: [-Math.PI / 2, 0, 0], parent: gPcb, shadow: false });
    }
    // I/O bracket
    const brTex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#6a727c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a0c10';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.roundRect(60 + i * 110, 150, 84, 40, 8); g.fill(); }
      g.beginPath(); g.roundRect(60 + 3 * 110, 146, 70, 46, 6); g.fill();
      for (let x = 50; x < 470; x += 22) for (let y = 30; y < 120; y += 20) { g.beginPath(); g.roundRect(x, y, 14, 10, 3); g.fill(); }
    });
    mesh(new THREE.BoxGeometry(0.05, 1.3, WID + 0.3), new THREE.MeshStandardMaterial({ color: col('#59616b'), metalness: 0.8, roughness: 0.6 }), { pos: [-LEN / 2 - 0.03, 0.42, 0.1], parent: gPcb });
    mesh(new THREE.PlaneGeometry(WID + 0.2, 1.24), new THREE.MeshStandardMaterial({ map: brTex, metalness: 0.8, roughness: 0.6 }), { pos: [-LEN / 2 - 0.058, 0.42, 0.1], rot: [0, -Math.PI / 2, 0], parent: gPcb, shadow: false });
    // GPU package + die
    const CHIP = [-0.3, 0];
    mesh(roundedBox(1.2, 0.05, 1.2, 0.05, 0.008), M.plastic('#0c2a22', 0.55), { pos: [CHIP[0], 0.06, CHIP[1]], parent: gPcb });
    mesh(roundedBox(0.66, 0.04, 0.66, 0.02, 0.006), M.silicon(), { pos: [CHIP[0], 0.105, CHIP[1]], parent: gPcb });
    const dieTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const n = 12, u = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const b = 0.25 + 0.75 * hash1(i * 17 + j * 131); g.fillStyle = `rgba(255,255,255,${b})`; g.fillRect(i * u + 2, j * u + 2, u - 4, u - 4); }
    });
    const dieMat = new THREE.MeshBasicMaterial({ map: dieTex, color: col(theme.accent), toneMapped: false });
    mesh(new THREE.PlaneGeometry(0.6, 0.6), dieMat, { pos: [CHIP[0], 0.127, CHIP[1]], rot: [-Math.PI / 2, 0, 0], parent: gPcb, shadow: false });
    // memory chips around the GPU
    const memMat = M.plastic('#0b0d11', 0.45);
    const memPos = [[-1.25, -0.5], [-1.25, 0], [-1.25, 0.5], [-0.8, -0.95], [-0.3, -0.95], [0.2, -0.95], [0.65, -0.5], [0.65, 0], [0.65, 0.5]];
    memPos.forEach(([x, z], i) => mesh(roundedBox(i > 2 && i < 6 ? 0.4 : 0.3, 0.05, i > 2 && i < 6 ? 0.3 : 0.4, 0.02, 0.006), memMat, { pos: [x, 0.058, z], parent: gPcb }));
    // power stages: chokes + capacitors
    const chokes = new THREE.InstancedMesh(roundedBox(0.24, 0.2, 0.24, 0.04, 0.012), new THREE.MeshStandardMaterial({ color: col('#4a505a'), metalness: 0.7, roughness: 0.5 }), 16);
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 14), new THREE.MeshStandardMaterial({ color: col('#15181d'), metalness: 0.5, roughness: 0.35 }), 20);
    const capTops = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 14), M.metal('#aab1ba', 0.55), 20);
    let ci = 0, ki = 0;
    for (let i = 0; i < 8; i++) for (const z of [-0.95, 0.95]) { dm.position.set(1.25 + i * 0.2 * 0 + (i % 4) * 0.32, 0.13, z + (i > 3 ? (z > 0 ? -0.32 : 0.32) : 0)); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix(); chokes.setMatrixAt(ci++, dm.matrix); }
    for (let i = 0; i < 10; i++) for (const z of [-0.18, 0.18]) { dm.position.set(1.2 + i * 0.19, 0.13, z); dm.updateMatrix(); caps.setMatrixAt(ki, dm.matrix); dm.position.y = 0.232; dm.updateMatrix(); capTops.setMatrixAt(ki++, dm.matrix); }
    chokes.castShadow = caps.castShadow = true; gPcb.add(chokes, caps, capTops);
    mesh(roundedBox(0.95, 0.34, 0.34, 0.04, 0.01), M.plastic('#0a0b0e', 0.5), { pos: [2.45, 0.2, -1.08], parent: gPcb });
    const chipLight = new THREE.PointLight(col(theme.accent), 0, 5, 1.8);
    chipLight.position.set(CHIP[0], 0.55, CHIP[1]); gPcb.add(chipLight);

    /* ---- heatsink ---- */
    const FINS = 108;
    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.5, WID - 0.36), new THREE.MeshStandardMaterial({ color: col('#aeb6c0'), metalness: 0.9, roughness: 0.42 }), FINS);
    for (let i = 0; i < FINS; i++) { dm.position.set(-LEN / 2 + 0.25 + (i / (FINS - 1)) * (LEN - 0.5), 0.27, 0); dm.rotation.set(0, 0, 0); dm.updateMatrix(); fins.setMatrixAt(i, dm.matrix); }
    fins.castShadow = true; fins.receiveShadow = true; gSink.add(fins);
    const copper = M.copper();
    for (const z of [-0.95, -0.4, 0.4, 0.95]) {
      const pipe = mesh(new THREE.CylinderGeometry(0.065, 0.065, LEN - 0.3, 14), copper, { pos: [0, 0.2, z], rot: [0, 0, Math.PI / 2], parent: gSink });
      pipe.castShadow = false;
      for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.065, 12, 8), copper, { pos: [s * (LEN - 0.3) / 2, 0.2, z], parent: gSink, shadow: false });
    }
    mesh(roundedBox(1.5, 0.07, 1.5, 0.06, 0.012), copper, { pos: [CHIP[0], -0.01, CHIP[1]], parent: gSink });

    /* ---- shroud + fans ---- */
    const NF = Math.round(p.fans ?? 3) === 2 ? 2 : 3;
    const FR = NF === 3 ? 0.94 : 1.14;
    const fanX = NF === 3 ? [-2.07, 0, 2.07] : [-1.5, 1.5];
    const sh = new THREE.Shape();
    const hx = LEN / 2, hz = WID / 2, ch = 0.32;
    sh.moveTo(-hx + ch, -hz); sh.lineTo(hx - ch, -hz); sh.lineTo(hx, -hz + ch); sh.lineTo(hx, hz - ch); sh.lineTo(hx - ch, hz); sh.lineTo(-hx + ch, hz); sh.lineTo(-hx, hz - ch); sh.lineTo(-hx, -hz + ch); sh.closePath();
    for (const fx of fanX) { const h = new THREE.Path(); h.absarc(fx, 0, FR + 0.05, 0, Math.PI * 2, true); sh.holes.push(h); }
    const shGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 48 });
    shGeo.rotateX(-Math.PI / 2);
    const shroudMat = new THREE.MeshStandardMaterial({ color: col('#171b21'), metalness: 0.15, roughness: 0.58 });
    mesh(shGeo, shroudMat, { pos: [0, 0.04, 0], parent: gShroud });
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(LEN - 0.7, 0.3, 0.05), shroudMat, { pos: [0, -0.1, s * (WID / 2 - 0.03)], parent: gShroud });
    // angular metal inlays + light strip
    const inlay = new THREE.MeshStandardMaterial({ color: col('#7d8792'), metalness: 0.9, roughness: 0.4 });
    for (let i = 0; i < fanX.length - 1; i++) {
      const mx = (fanX[i] + fanX[i + 1]) / 2;
      for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.07, 0.03, 0.62), inlay, { pos: [mx, 0.305, s * 1.0], rot: [0, s * 0.5, 0], parent: gShroud, shadow: false });
    }
    const stripMat = M.glow(theme.accent, 1.6);
    mesh(new THREE.BoxGeometry(LEN - 1.4, 0.035, 0.03), stripMat, { pos: [0, 0.2, WID / 2 + 0.035], parent: gShroud, shadow: false });
    mesh(new THREE.BoxGeometry(LEN - 1.4, 0.035, 0.03), stripMat, { pos: [0, 0.2, -WID / 2 - 0.035], parent: gShroud, shadow: false });
    if (p.label) {
      const lp = textPlane(String(p.label).toUpperCase(), 1.9, { w: 1024, h: 128, color: '#dfe6ee', weight: 600, letterSpacing: '6px', size: 70, intensity: 0.9 });
      lp.position.set(1.7, -0.08, WID / 2 + 0.0); lp.position.z += 0.001; gShroud.add(lp);
    }
    const fans = [];
    const bladeGeo = fanBlade(0.3 * (FR / 0.94), FR - 0.04);
    const bladeMat = new THREE.MeshStandardMaterial({ color: col('#1c2128'), metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide });
    const ringMat = M.glow(theme.accent, 1.3);
    fanX.forEach((fx, i) => {
      const fan = new THREE.Group(); fan.position.set(fx, 0.17, 0);
      const NB = 9;
      for (let b = 0; b < NB; b++) { const bl = mesh(bladeGeo, bladeMat, { parent: fan }); bl.rotation.y = (b / NB) * Math.PI * 2; }
      mesh(new THREE.CylinderGeometry(0.31 * (FR / 0.94), 0.33 * (FR / 0.94), 0.16, 32), new THREE.MeshStandardMaterial({ color: col('#0e1116'), metalness: 0.3, roughness: 0.38 }), { parent: fan });
      mesh(new THREE.TorusGeometry(0.2 * (FR / 0.94), 0.014, 8, 40), ringMat, { pos: [0, 0.085, 0], rot: [Math.PI / 2, 0, 0], parent: fan, shadow: false });
      mesh(new THREE.TorusGeometry(FR - 0.03, 0.022, 8, 64), bladeMat, { rot: [Math.PI / 2, 0, 0], parent: fan, shadow: false });
      gShroud.add(fan); fans.push({ fan, dir: i % 2 ? -1 : 1, phase: i * 0.7 });
      // static rim around each opening
      mesh(new THREE.TorusGeometry(FR + 0.05, 0.03, 8, 64), inlay, { pos: [fx, 0.3, 0], rot: [Math.PI / 2, 0, 0], parent: gShroud, shadow: false });
    });

    const local = { fans: new THREE.Vector3(fanX[fanX.length - 1], 0.3, 0.3), heatsink: new THREE.Vector3(1.4, 0.4, WID / 2 - 0.2), chip: new THREE.Vector3(CHIP[0], 0.14, CHIP[1]), pcb: new THREE.Vector3(2.3, 0.05, 0.6), connector: new THREE.Vector3(-1.45, 0.03, WID / 2 + 0.1), backplate: new THREE.Vector3(2.4, -0.03, 1.1), shroud: new THREE.Vector3(-2.9, 0.3, 1.1) };
    const owner = { fans: gShroud, heatsink: gSink, chip: gPcb, pcb: gPcb, connector: gPcb, backplate: gBack, shroud: gShroud };
    const anchors = {}; for (const k in local) anchors[k] = new THREE.Vector3();

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        const e = f.tw('explode', 0, f.params.cues?.explode ?? 0.5, 2.4);
        const act = clamp(f.tw('activity', 0.8, 0.2, 1.5));
        const spin = f.params.spin ?? 1;
        dust.update(t);
        const intro = ease.outCubic(clamp(t / 1.8));
        card.position.set(0, 1.55 + 0.25 * e + Math.sin(t * 0.7) * 0.04 + (1 - intro) * 0.5, 0);
        card.rotation.set(0.3 - 0.1 * e, Math.sin(t * 0.23) * 0.07 - (1 - intro) * 0.55, Math.sin(t * 0.31) * 0.012);
        gBack.position.y = -0.075 - 0.8 * e;
        gPcb.position.y = 0;
        gSink.position.y = 0.16 + 1.25 * e;
        gShroud.position.y = 0.7 + 2.55 * e;
        for (const fo of fans) fo.fan.rotation.y = fo.dir * (t * 4.6 * spin + fo.phase);
        const pulse = 0.85 + 0.15 * Math.sin(t * 2.4);
        dieMat.color.copy(col(theme.accent)).multiplyScalar((0.5 + 1.4 * e) * act * pulse + 0.15);
        chipLight.intensity = 4.5 * e * act * pulse;
        pcbMat.emissiveIntensity = (0.25 + 0.9 * e) * (0.6 + 0.4 * act);
        setGlow(stripMat, (0.5 + 1.2 * act) * intro * (0.92 + 0.08 * Math.sin(t * 1.9)));
        setGlow(ringMat, (0.4 + 1.0 * act) * intro);
        card.updateMatrixWorld(true);
        for (const k in local) anchors[k].copy(local[k]).applyMatrix4(owner[k].matrixWorld);
      },
    };
  },
};
