// Ecosystem / relationship graph: a central entity with partners, customers or
// competitors around it, joined by links that carry pulses of value or data.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, anim, ease, hash1, smoothstep } from '../core/util.js';

export default {
  name: 'network_graph',
  description: 'Hub-and-spoke ecosystem graph in 3D: a glowing central node (company, product, model) surrounded by satellite nodes (customers, partners, suppliers, competitors) on a tilted orbit, linked by beams carrying travelling pulses. Node size can encode a value. Great for "who buys / who depends on / who competes with".',
  params: {
    center: '{ label, sub? }',
    nodes: '[{ label, sub?, value? (relative size), color? }] — 3 to 12 satellites',
    direction: '"in" (pulses flow to the centre, e.g. money/orders) | "out" (centre supplies the nodes) | "both"',
    highlight: 'Index of a satellite to emphasise (others dim). -1 / omitted = none. Tweens between continued shots.',
    reveal: '"sequential" (default — satellites appear one after another) | "all"',
    cues: 'node0, node1, … — shot-local times at which each satellite appears (sync to narration words)',
  },
  sample: { center: { label: 'NVIDIA', sub: 'AI chips' }, nodes: [{ label: 'Microsoft', value: 5 }, { label: 'Meta', value: 4 }, { label: 'Amazon', value: 4 }, { label: 'Google', value: 4 }, { label: 'Oracle', value: 2 }, { label: 'Tesla', value: 2 }, { label: 'OpenAI', value: 3 }], direction: 'in' },
  framings: {
    wide: { pos: [0, 6.5, 19], target: [0, 2.5, 0], fov: 34 },
    hero: { pos: [4.5, 5, 16], target: [0, 2.5, 0], fov: 32 },
    top: { pos: [0.5, 21, 7], target: [0, 1.5, 0], fov: 34 },
    low: { pos: [-3.5, 1.4, 16], target: [0, 3, 0], fov: 34 },
    close: { pos: [2.5, 3.6, 8], target: [0, 2.6, 0], fov: 32 },
    left: { pos: [-3, 4.5, 13], target: [-4.5, 2.6, 0], fov: 32 },
    right: { pos: [3, 4.5, 13], target: [4.5, 2.6, 0], fov: 32 },
  },
  defaultCamera: { from: 'wide', to: 'hero', orbit: 6 },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const nodes = (p.nodes || []).slice(0, 12);
    const n = nodes.length;
    const base = createBase(ctx, { fog: 0.02, glow: 0.06, shadowSize: 16 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.55, grid: 0.07, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 420, extent: [20, 9, 16] });
    const cA = col(theme.accent), cB = col(theme.accent2);
    const C = new THREE.Vector3(0, 2.5, 0);

    // centre: faceted core inside two rings, on a pedestal
    mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.18, 64), M.dark('#0e141c', 0.4), { pos: [0, 0.09, 0], parent: scene });
    const pedRing = mesh(new THREE.TorusGeometry(1.55, 0.03, 8, 96), M.glow(theme.accent, 1.6), { pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0], parent: scene, shadow: false });
    const coreMat = new THREE.MeshStandardMaterial({ color: col('#0c1219'), emissive: cA.clone(), emissiveIntensity: 1.3, roughness: 0.25, metalness: 0.7, flatShading: true });
    const core = mesh(new THREE.IcosahedronGeometry(1.05, 1), coreMat, { pos: C.toArray(), parent: scene });
    const shell = mesh(new THREE.IcosahedronGeometry(1.32, 1), new THREE.MeshBasicMaterial({ color: cA.clone().multiplyScalar(0.9), wireframe: true, transparent: true, opacity: 0.35, toneMapped: false }), { pos: C.toArray(), parent: scene, shadow: false });
    const r1 = mesh(new THREE.TorusGeometry(1.75, 0.02, 8, 96), M.glow(theme.accent2, 1.6), { pos: C.toArray(), parent: scene, shadow: false });
    const r2 = mesh(new THREE.TorusGeometry(2.0, 0.014, 8, 96), M.glow(theme.accent, 1.2), { pos: C.toArray(), parent: scene, shadow: false });
    const coreLight = new THREE.PointLight(cA, 26, 16, 1.6); coreLight.position.copy(C); scene.add(coreLight);

    const maxV = Math.max(1, ...nodes.map((d) => d.value ?? 1));
    const R = 6.8 + Math.max(0, n - 7) * 0.35;
    const PULSES = 7;
    const items = nodes.map((d, i) => {
      // satellites fan out on a left arc and a right arc, keeping the hub's front and back clear
      const leftN = Math.ceil(n / 2), onLeft = i % 2 === 0, k = Math.floor(i / 2), cnt = onLeft ? leftN : n - leftN;
      const u = cnt <= 1 ? 0.5 : k / (cnt - 1);
      const th = (u - 0.5) * 1.75 * (cnt <= 2 ? 0.6 : 1);       // fan angle (elevation) on each side
      const size = 0.38 + 0.42 * Math.sqrt((d.value ?? maxV * 0.5) / maxV);
      const rr = R * (0.8 + 0.34 * (k % 2));
      const pos = new THREE.Vector3((onLeft ? -1 : 1) * rr * Math.cos(th * 0.9), 2.95 + (cnt >= 4 ? 2.9 : 2.3) * Math.sin(th), (k % 2 ? -1.5 : 0.9));
      const c = col(d.color ?? (i % 3 === 1 ? theme.accent2 : theme.accent));
      const g = new THREE.Group(); g.position.copy(pos); scene.add(g);
      const mat = new THREE.MeshPhysicalMaterial({ color: col('#111922'), emissive: c.clone(), emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.6, clearcoat: 1 });
      mesh(new THREE.SphereGeometry(size, 40, 28), mat, { parent: g });
      const ringMat = M.glow(c, 1.3);
      const ring = mesh(new THREE.TorusGeometry(size * 1.45, 0.014, 8, 64), ringMat, { parent: g, shadow: false });
      // stem to the floor
      const stemMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.5), transparent: true, opacity: 0.35, toneMapped: false });
      const stem = mesh(new THREE.CylinderGeometry(0.008, 0.008, pos.y - size, 6), stemMat, { pos: [0, -(pos.y + size) / 2, 0], parent: g, shadow: false });
      mesh(new THREE.CircleGeometry(size * 0.9, 40), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.35), transparent: true, opacity: 0.5, toneMapped: false }), { pos: [0, -pos.y + 0.02, 0], rot: [-Math.PI / 2, 0, 0], parent: g, shadow: false });
      // link: gentle arc between centre and node
      const mid = pos.clone().add(C).multiplyScalar(0.5); mid.y += 1.3;
      const curve = new THREE.QuadraticBezierCurve3(C.clone(), mid, pos.clone());
      const linkMat = new THREE.MeshBasicMaterial({ color: c.clone(), transparent: true, opacity: 0.5, toneMapped: false });
      const link = mesh(new THREE.TubeGeometry(curve, 40, 0.014, 6, false), linkMat, { parent: scene, shadow: false });
      return { d, pos, size, c, g, mat, ring, ringMat, linkMat, link, curve, stemMat };
    });
    const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), Math.max(1, n * PULSES));
    pulses.frustumCulled = false; scene.add(pulses);
    const dm = new THREE.Object3D(), v = new THREE.Vector3(), tmp = new THREE.Color();
    const anchors = { center: C.clone() }; items.forEach((it, i) => { anchors['node' + i] = it.pos.clone(); });
    const st = { show: items.map(() => 0), dim: items.map(() => 1) };
    const dir = p.direction || 'in';

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        const cues = f.params.cues || {};
        const seq = (f.params.reveal ?? p.reveal ?? 'sequential') !== 'all';
        const hasHl = (f.params.highlight ?? -1) >= 0;
        core.rotation.y = t * 0.35; core.rotation.x = t * 0.21; shell.rotation.y = -t * 0.18; shell.rotation.z = t * 0.1;
        r1.rotation.set(Math.PI / 2 + Math.sin(t * 0.4) * 0.5, t * 0.5, 0); r2.rotation.set(t * 0.33, Math.PI / 3, t * 0.27);
        const cb = anim(t, 0, 1.2, ease.outBack);
        core.scale.setScalar(cb * (1 + 0.03 * Math.sin(t * 2))); shell.scale.setScalar(cb);
        coreMat.emissiveIntensity = 1.1 + 0.35 * Math.sin(t * 2);
        coreLight.intensity = 22 + 6 * Math.sin(t * 2);
        pedRing.scale.setScalar(1 + 0.02 * Math.sin(t * 1.5));
        let pi = 0;
        items.forEach((it, i) => {
          // reveal time: narration cue if given, else staggered (only on the first shot of the scene)
          const cue = cues['node' + i];
          const start = !seq ? 0.4 + i * 0.07 : cue != null ? cue + (f.t - f.shotT) : (0.9 + i * 0.5);
          const show = anim(t, start, 0.8, ease.outBack);
          const sh = clamp(anim(t, start, 0.8));
          const isHl = hasHl && Math.round(f.params.highlight) === i;
          const dim = hasHl ? (isHl ? 1 : 0.28) : 1;
          const dimK = 1 + (dim - 1) * anim(f.shotT, 0.3, 0.9);
          st.show[i] = sh; st.dim[i] = dimK;
          it.g.scale.setScalar(Math.max(show, 0.001) * (isHl ? 1 + 0.25 * anim(f.shotT, 0.3, 0.9, ease.outBack) : 1));
          it.g.position.y = it.pos.y + 0.12 * Math.sin(t * 0.9 + i * 1.7);
          it.ring.rotation.set(Math.PI / 2 + 0.4 * Math.sin(t * 0.6 + i), t * 0.6 + i, 0);
          it.mat.emissiveIntensity = (0.35 + 0.25 * Math.sin(t * 1.6 + i)) * dimK + (isHl ? 0.9 : 0);
          tmp.copy(it.c).multiplyScalar(1.3 * dimK); it.ringMat.color.copy(tmp);
          it.linkMat.opacity = 0.5 * sh * dimK; it.stemMat.opacity = 0.3 * sh * dimK;
          it.link.visible = sh > 0.01;
          for (let k = 0; k < PULSES; k++) {
            let u = (t * (0.22 + 0.06 * hash1(i * 13 + k)) + k / PULSES + hash1(i * 7) ) % 1;
            const inward = dir === 'in' || (dir === 'both' && k % 2 === 0);
            const uu = inward ? 1 - u : u;
            it.curve.getPoint(uu, v);
            const s = Math.sin(u * Math.PI) * sh * (0.5 + 0.5 * dimK) * (k < 3 + 4 * dimK ? 1 : 0);
            dm.position.copy(v); dm.scale.setScalar(Math.max(s, 0.001)); dm.updateMatrix(); pulses.setMatrixAt(pi, dm.matrix);
            tmp.copy(it.c).lerp(cB, 0.3).multiplyScalar(3.2); pulses.setColorAt(pi, tmp); pi++;
          }
        });
        pulses.instanceMatrix.needsUpdate = true; if (pulses.instanceColor) pulses.instanceColor.needsUpdate = true;
      },
      labels(f) {
        const out = [];
        const cb = clamp(anim(f.t, 0.3, 0.8));
        if (p.center?.label) out.push({ pos: new THREE.Vector3(0, 4.55, 0), text: p.center.label, sub: p.center.sub, size: 52, weight: 700, alpha: cb });
        items.forEach((it, i) => {
          const a = st.show[i] * (0.35 + 0.65 * st.dim[i]);
          if (a < 0.02) return;
          out.push({ pos: new THREE.Vector3(it.pos.x, it.pos.y + it.size + 0.55, it.pos.z), text: it.d.label, sub: it.d.sub, size: 30 + (st.dim[i] > 0.9 && (f.params.highlight ?? -1) === i ? 10 : 0), weight: 600, alpha: a, bg: true, color: theme.text });
        });
        return out;
      },
    };
  },
};
