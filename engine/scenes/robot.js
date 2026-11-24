// Humanoid robot bust: sleek white shell head, black glass face plate with glowing eyes,
// mechanical neck with pistons and cables, shoulders. The head turns to look at a gaze
// point (the camera for eye contact). Reads instantly as "AI / robot" — thumbnail hero and
// in-video shot for automation, robots, AI agents taking over jobs.
import * as THREE from 'three';
import { createBase, addDust, M, mesh, col, roundedBox } from '../core/kit.js';
import { clamp, hash1, noise1 } from '../core/util.js';

const HEAD_Y = 2.38;

export default {
  name: 'robot',
  description: 'Humanoid robot bust: white shell head, black glass face plate with glowing eyes, mechanical neck (pistons, cables) and shoulders, in front of out-of-focus city or server lights. The head turns to look at a gaze point — use the camera position for eye contact. Strong thumbnail hero for AI topics and an in-video shot for robots, automation and "AI is here" moments.',
  params: {
    eyes: 'Eye colour: theme key ("danger" default = red, "accent", "accent2", "warm") or a hex colour',
    background: '"city" (default) | "servers" | "none"',
    gaze: 'World point [x,y,z] the head looks at (default straight ahead). Camera position = eye contact.',
    intensity: '0..1 eye glow (default 1, tweens)',
    awake: '0..1 eyes power on (default 1; tween from 0 for a "switching on" moment)',
  },
  sample: { eyes: 'danger', background: 'city' },
  framings: {
    bust: { pos: [0.4, 2.15, 4.6], target: [0, 1.95, 0], fov: 32 },
    close: { pos: [0.25, 2.5, 2.4], target: [0, 2.42, 0], fov: 30 },
    low: { pos: [0.5, 1.1, 3.6], target: [0, 2.2, 0], fov: 34 },
    side: { pos: [3.4, 2.6, 3.0], target: [0, 2.4, 0], fov: 30 },
    wide: { pos: [0.8, 2.4, 8.5], target: [0, 1.9, 0], fov: 32 },
    right_third: { pos: [-1.05, 1.55, 3.9], target: [-1.2, 2.1, 0], fov: 34 },
    left_third: { pos: [1.05, 1.55, 3.9], target: [1.2, 2.1, 0], fov: 34 },
  },
  defaultCamera: { from: 'wide', to: 'bust' },
  look: { bloom: 0.7, bloomThreshold: 0.95, bloomRadius: 0.5, vignette: 0.8 },

  build(ctx, p) {
    const { theme } = ctx;
    const eyeC = col(!p.eyes || p.eyes === 'danger' ? '#ff0a0a' : (theme[p.eyes] || p.eyes));
    const eyeHex = '#' + eyeC.getHexString();
    const base = createBase(ctx, { fog: 0.02, glow: 0.02, shadows: false, key: 1.6, keyPos: [-4, 6, 6], rim: 1.6, rimColor: '#8fb8ff', rimPos: [3, 4, -6], rim2: 0.8, env: 1 });
    const { scene } = base;
    scene.environmentIntensity = 1.1;

    /* ---------- background lights (bokeh with depth of field) ---------- */
    const bg = p.background || 'city';
    if (bg !== 'none') {
      const n = 1700;
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(bg === 'servers' ? 0.05 : 0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
      const dm = new THREE.Object3D(), c = new THREE.Color();
      const warm = col('#ffb15c'), cool = col('#8fc4ff'), white = col('#fff2dd');
      for (let i = 0; i < n; i++) {
        const z = -16 - hash1(i * 3) * 40;
        let x, y;
        if (bg === 'servers') { const row = Math.floor(hash1(i * 5) * 6); x = (row - 2.5) * 6 + (hash1(i * 7) - 0.5) * 1.2; y = 0.3 + hash1(i * 11) * 4.5; }
        else { x = (hash1(i * 5) - 0.5) * 90; y = Math.pow(hash1(i * 7), 2.2) * 22 * (0.4 + 0.6 * hash1(Math.floor(x / 3) + 99)) - 1; }
        dm.position.set(x, y, z); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix);
        const r = hash1(i * 13);
        c.copy(bg === 'servers' ? (r > 0.8 ? eyeC : r > 0.4 ? cool : col('#5fe08c')) : (r > 0.7 ? cool : r > 0.15 ? warm : white)).multiplyScalar(0.35 + hash1(i * 17) * 0.9);
        inst.setColorAt(i, c);
      }
      scene.add(inst);
    }
    const dust = addDust(ctx, scene, { count: 220, extent: [8, 5, 6], alpha: 0.3 });

    /* ---------- materials ---------- */
    const shell = new THREE.MeshPhysicalMaterial({ color: col('#e4e7ec'), roughness: 0.3, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.15 });
    const graphite = new THREE.MeshStandardMaterial({ color: col('#1b1e24'), metalness: 0.85, roughness: 0.32 });
    const steel = M.metal('#9aa3ae', 0.25);
    const rubber = new THREE.MeshStandardMaterial({ color: col('#0d0e10'), roughness: 0.7, metalness: 0.1 });
    const glass = new THREE.MeshPhysicalMaterial({ color: col('#040507'), roughness: 0.06, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03 });

    /* ---------- body: shoulders, chest, collar ---------- */
    const body = new THREE.Group(); scene.add(body);
    // torso core (graphite) with white armour plates on top
    mesh(new THREE.SphereGeometry(1, 48, 32), graphite, { pos: [0, 0.78, -0.1], scale: [0.56, 0.7, 0.28], parent: body });
    // one angular chest plate (two halves with a centre seam) + segmented abdomen
    for (const sx of [-1, 1]) {
      const plate = mesh(roundedBox(0.46, 0.14, 0.5, 0.12, 0.03), shell, { pos: [sx * 0.245, 1.04, 0.22], parent: body });
      plate.rotation.set(Math.PI / 2 - 0.22, 0, sx * -0.12);
      plate.rotation.order = 'ZXY';
      // shoulder: compact white armour cap over a graphite joint
      mesh(new THREE.SphereGeometry(0.17, 32, 24), graphite, { pos: [sx * 0.76, 1.24, -0.05], parent: body });
      const cap = mesh(new THREE.SphereGeometry(0.22, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), shell, { pos: [sx * 0.8, 1.27, -0.05], parent: body });
      cap.rotation.z = sx * -0.55; cap.scale.set(1, 0.8, 1);
      mesh(new THREE.CapsuleGeometry(0.13, 0.5, 8, 20), shell, { pos: [sx * 0.88, 0.86, -0.05], rot: [0, 0, sx * 0.08], parent: body });
    }
    for (let i = 0; i < 3; i++) mesh(roundedBox(0.5 - i * 0.04, 0.09, 0.26, 0.06, 0.015), graphite, { pos: [0, 0.68 - i * 0.12, 0.1 - i * 0.01], rot: [Math.PI / 2, 0, 0], parent: body });
    // trapezius plates sloping up to the neck
    for (const sx of [-1, 1]) {
      const tr = mesh(new THREE.BoxGeometry(0.55, 0.1, 0.42), shell, { pos: [sx * 0.42, 1.36, -0.06], rot: [0, 0, sx * -0.28], parent: body });
      tr.geometry.translate(0, 0, 0);
    }
    mesh(new THREE.TorusGeometry(0.22, 0.06, 16, 64), graphite, { pos: [0, 1.45, -0.04], rot: [Math.PI / 2, 0, 0], parent: body });

    /* ---------- neck: core, pistons, cables ---------- */
    const neck = new THREE.Group(); neck.position.set(0, 1.45, -0.04); scene.add(neck);
    mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 32), graphite, { pos: [0, 0.21, 0], parent: neck });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 12), steel, { pos: [Math.cos(a) * 0.23, 0.2, Math.sin(a) * 0.23], rot: [Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18], parent: neck });
    }
    for (const sx of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.1, 0.4, -0.1), new THREE.Vector3(sx * 0.32, 0.12, -0.18), new THREE.Vector3(sx * 0.55, -0.1, -0.12)]);
      mesh(new THREE.TubeGeometry(curve, 24, 0.035, 10, false), rubber, { parent: neck });
    }

    /* ---------- head ---------- */
    const head = new THREE.Group(); head.position.set(0, HEAD_Y, 0); scene.add(head);
    const profile = [[0, -0.6], [0.24, -0.59], [0.38, -0.5], [0.46, -0.34], [0.5, -0.14], [0.52, 0.08], [0.53, 0.26], [0.5, 0.42], [0.42, 0.56], [0.28, 0.66], [0.12, 0.7], [0, 0.705]].map(([x, y]) => new THREE.Vector2(x, y));
    const skull = mesh(new THREE.LatheGeometry(profile, 96), shell, { parent: head });
    skull.scale.set(0.92, 1, 1.08);
    // black glass face plate over the front of the head
    const faceProfile = profile.filter(([, y]) => true).slice(2, 9).map((v) => new THREE.Vector2(v.x * 1.018, v.y));
    const face = mesh(new THREE.LatheGeometry(faceProfile, 64, -1.05, 2.1), glass, { parent: head });
    face.scale.set(0.92, 1, 1.08);
    // eyes: angled glowing capsules + tiny lights
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeC.clone().multiplyScalar(2.2), toneMapped: false });
    const eyes = [-1, 1].map((sx) => {
      const e = mesh(new THREE.CapsuleGeometry(0.026, 0.13, 8, 16), eyeMat, { parent: head, shadow: false });
      e.rotation.set(0, sx * 0.32, Math.PI / 2 + sx * 0.16);
      e.position.set(sx * 0.165, 0.09, 0.575);
      e.scale.set(1, 1, 0.5);
      return e;
    });
        // ear modules with ring lights
    for (const sx of [-1, 1]) {
      mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.1, 40), shell, { pos: [sx * 0.49, 0.04, -0.02], rot: [0, 0, Math.PI / 2], parent: head });
      mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.11, 32), graphite, { pos: [sx * 0.505, 0.04, -0.02], rot: [0, 0, Math.PI / 2], parent: head });
      mesh(new THREE.TorusGeometry(0.135, 0.01, 8, 48), M.glow(eyeHex, 1.3), { pos: [sx * 0.555, 0.04, -0.02], rot: [0, Math.PI / 2, 0], parent: head, shadow: false });
    }
    // panel seams on the skull
    mesh(new THREE.TorusGeometry(0.505, 0.006, 6, 120, Math.PI), graphite, { pos: [0, 0.2, -0.03], rot: [0, Math.PI / 2, 0], scale: [1.06, 1, 0.92], parent: head });

    const gaze = new THREE.Vector3(...(p.gaze || [0, HEAD_Y, 20]));
    const tgt = new THREE.Vector3();
    const anchors = { eyes: new THREE.Vector3(), head: new THREE.Vector3(), chest: new THREE.Vector3(0, 1.0, 0.45) };
    const v = new THREE.Vector3();

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        const I = clamp(f.tw('intensity', 1, 0.2, 1.2));
        const awake = clamp(f.tw('awake', 1, 0.3, 1.2));
        // look at the gaze point with tiny servo-like corrections; neck follows a little
        tgt.copy(gaze);
        tgt.x += noise1(t * 0.35, 5) * 0.12; tgt.y += noise1(t * 0.3, 9) * 0.06;
        head.lookAt(tgt);
        neck.rotation.y = head.rotation.y * 0.35;
        const flicker = 0.94 + 0.06 * Math.sin(t * 9.0) * Math.sin(t * 2.3);
        eyeMat.color.copy(eyeC).multiplyScalar(1.7 * I * awake * flicker);
        head.updateMatrixWorld(true);
        anchors.eyes.copy(v.set(0, 0.09, 0.6).applyMatrix4(head.matrixWorld));
        anchors.head.copy(v.set(0, 0.35, 0.3).applyMatrix4(head.matrixWorld));
      },
    };
  },
};
