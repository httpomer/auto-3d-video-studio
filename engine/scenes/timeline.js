// History told as a journey: milestones strung along a glowing rail. The camera
// travels from one milestone to the next while each lights up in turn.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, roundedBox, col } from '../core/kit.js';
import { clamp, smoothstep, anim, ease, lerp } from '../core/util.js';

const GAP = 7;

export default {
  name: 'timeline',
  description: 'A 3D timeline: milestones (year + title) placed along a glowing rail on the studio floor. Use one shot per milestone with `continues: true` and camera from `atN` to `atN+1` so the camera travels through history while each milestone lights up.',
  params: {
    events: '[{ year: "1999", title: "First GPU", sub?: "one extra line" }] — 2 to 8 milestones, in order',
    active: 'Index of the milestone being talked about (0-based). It lights up; later ones stay dim. Tweens between continued shots.',
    revealAll: 'true = every milestone lit from the start (for a summary wide shot)',
  },
  sample: { events: [{ year: '1993', title: 'Company founded' }, { year: '1999', title: 'First GPU', sub: 'GeForce 256' }, { year: '2006', title: 'CUDA released' }, { year: '2012', title: 'AlexNet moment' }, { year: '2022', title: 'ChatGPT launches' }], active: 2 },
  framings: (p) => {
    const n = (p.events || []).length || 1;
    const x0 = -((n - 1) * GAP) / 2;
    const fr = {
      wide: { pos: [0, 3.6 + n * 0.55, 7.5 + n * 3.3], target: [0, 1.5, 0], fov: 34 },
      top: { pos: [0, 16 + n * 3.4, 6], target: [0, 0, 0], fov: 34 },
      low: { pos: [x0 - 6, 1.2, 9], target: [x0 + GAP, 2.2, 0], fov: 36 },
      along: { pos: [x0 - 9, 3.2, 4.5], target: [x0 + GAP * 1.5, 1.8, 0], fov: 34 },
    };
    for (let i = 0; i < n; i++) fr['at' + i] = { pos: [x0 + i * GAP - 2.6, 3.1, 9.2], target: [x0 + i * GAP + 0.5, 2.25, 0], fov: 32 };
    return fr;
  },
  defaultCamera: { from: 'at0', to: 'at1' },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const ev = (p.events || []).slice(0, 8);
    const n = ev.length;
    const x0 = -((n - 1) * GAP) / 2;
    const base = createBase(ctx, { fog: 0.02, glow: 0.06, shadowSize: 30 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.55, grid: 0.08, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 450, extent: [34, 8, 14] });
    const cA = col(theme.accent), cB = col(theme.accent2);

    // rail: dim base line + bright progress line that grows to the active milestone
    const railLen = (n - 1) * GAP + 10;
    mesh(new THREE.BoxGeometry(railLen, 0.05, 0.16), M.dark('#1a2330', 0.5), { pos: [0, 0.03, 0], parent: scene });
    const progMat = M.glow(theme.accent, 2.4);
    const prog = mesh(new THREE.BoxGeometry(1, 0.06, 0.09), progMat, { pos: [0, 0.07, 0], parent: scene, shadow: false });
    // tick marks along the rail
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.02, 0.5), M.glow(theme.accent, 0.5), Math.floor(railLen));
    const dm = new THREE.Object3D();
    for (let i = 0; i < ticks.count; i++) { dm.position.set(-railLen / 2 + i + 0.5, 0.012, 0); dm.updateMatrix(); ticks.setMatrixAt(i, dm.matrix); }
    scene.add(ticks);
    // travelling head light
    const head = new THREE.PointLight(cA, 10, 9, 1.6); scene.add(head);
    const headBall = mesh(new THREE.SphereGeometry(0.11, 16, 12), M.glow(theme.accent2, 4), { parent: scene, shadow: false });

    const nodes = ev.map((e, i) => {
      const g = new THREE.Group(); g.position.set(x0 + i * GAP, 0, 0); scene.add(g);
      mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.14, 48), M.dark('#0f151d', 0.4), { pos: [0, 0.07, 0], parent: g });
      const ringMat = M.glow(theme.accent, 1);
      const ring = mesh(new THREE.TorusGeometry(0.9, 0.025, 8, 64), ringMat, { pos: [0, 0.15, 0], rot: [Math.PI / 2, 0, 0], parent: g, shadow: false });
      const postMat = M.glow(theme.accent, 1);
      const post = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 8), postMat, { pos: [0, 0.65, 0], parent: g, shadow: false });
      const gemMat = new THREE.MeshStandardMaterial({ color: col('#10161e'), emissive: cA.clone(), emissiveIntensity: 0.2, roughness: 0.2, metalness: 0.8, flatShading: true });
      const gem = mesh(new THREE.OctahedronGeometry(0.34, 0), gemMat, { pos: [0, 1.5, 0], parent: g });
      const light = new THREE.PointLight(cA, 0, 7, 1.7); light.position.set(0, 1.5, 0.6); g.add(light);
      return { g, ringMat, postMat, post, gem, gemMat, light, ring, x: x0 + i * GAP };
    });
    const anchors = {}; nodes.forEach((nd, i) => { anchors['m' + i] = new THREE.Vector3(nd.x, 1.5, 0); });
    const tmp = new THREE.Color();
    const st = { lit: nodes.map(() => 0), build: nodes.map(() => 0) };

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        const all = f.params.revealAll ? 1 : 0;
        const act = all ? n - 1 : clamp(f.tw('active', 0, 0.3, 1.8), 0, n - 1);
        const intro = f.prevParams ? 1 : anim(t, 0.1, 1.3, ease.outCubic);
        const hx = lerp(x0 - 4.5, x0 + act * GAP, intro);
        prog.scale.x = Math.max(0.01, hx - (x0 - 5)); prog.position.x = (x0 - 5) + prog.scale.x / 2;
        head.position.set(hx, 0.5, 0.4); headBall.position.set(hx, 0.1, 0);
        nodes.forEach((nd, i) => {
          const build = anim(t, 0.15 + i * 0.12, 0.9, ease.outBack);
          const lit = all ? anim(t, 0.4 + i * 0.25, 0.8) : smoothstep(i - 0.55, i - 0.02, (hx - x0) / GAP);
          const focus = all ? 0.6 : clamp(1 - Math.abs(act - i));
          st.lit[i] = lit; st.build[i] = build;
          nd.g.scale.setScalar(Math.max(build, 0.001));
          nd.gem.rotation.y = t * 0.7 + i; nd.gem.rotation.x = 0.3;
          nd.gem.position.y = 1.5 + 0.08 * Math.sin(t * 1.3 + i * 2) + 0.25 * focus;
          nd.gem.scale.setScalar(0.8 + 0.5 * focus);
          nd.gemMat.emissiveIntensity = 0.1 + lit * (0.35 + 0.5 * focus);
          nd.gemMat.emissive.copy(focus > 0.5 ? cB : cA);
          tmp.copy(cA).multiplyScalar(0.25 + lit * (1.2 + 1.8 * focus)); nd.ringMat.color.copy(tmp);
          tmp.copy(cA).multiplyScalar(0.2 + lit * 1.6); nd.postMat.color.copy(tmp);
          nd.post.scale.y = 1.1 + 0.25 * focus; nd.post.position.y = 0.15 + nd.post.scale.y / 2;
          nd.ring.scale.setScalar(1 + 0.06 * focus * Math.sin(t * 2.4));
          nd.light.intensity = lit * (1.5 + 5 * focus);
        });
        st.act = act; st.all = all;
      },
      labels(f) {
        const out = [];
        nodes.forEach((nd, i) => {
          const e = ev[i];
          const focus = st.all ? 0.75 : clamp(1 - Math.abs(st.act - i));
          const a = st.build[i] * (0.28 + 0.72 * Math.max(st.lit[i] * 0.55, focus));
          if (a < 0.02) return;
          const y = 2.65 + 0.25 * focus;
          out.push({ pos: new THREE.Vector3(nd.x, y + 0.55, 0), text: String(e.year ?? ''), size: 46 + 26 * focus, weight: 700, color: focus > 0.5 || st.all ? theme.accent : theme.textDim, alpha: a });
          if (e.title) out.push({ pos: new THREE.Vector3(nd.x, y, 0), text: e.title, size: 26 + 10 * focus, weight: 600, alpha: a * (0.6 + 0.4 * focus), dy: 30 + 12 * focus });
          if (e.sub && focus > 0.3) out.push({ pos: new THREE.Vector3(nd.x, y, 0), text: e.sub, size: 26, weight: 400, font: 'body', color: theme.textDim, alpha: a * smoothstep(0.3, 0.9, focus), dy: 82 });
        });
        return out;
      },
    };
  },
};
