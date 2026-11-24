// Where the money goes: sources → central entity → destinations. Sankey-style
// ribbons whose width is proportional to value carry streams of gold coins.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, ease, lerp, fmtNum, rng } from '../core/util.js';

const XS = -6.2, XT = 6.2, RC = 1.6, WTOT = 3.3, NS = 64, SPEED = 0.2;

function layout(p) {
  const norm = (arr) => (arr || []).filter((d) => Number(d.value) > 0).slice(0, 8).map((d) => ({ label: d.label, value: Number(d.value), color: d.color }));
  const sources = norm(p.sources), targets = norm(p.targets);
  const sumS = sources.reduce((a, d) => a + d.value, 0), sumT = targets.reduce((a, d) => a + d.value, 0);
  const unit = WTOT / Math.max(sumS, sumT, 1e-9);
  const place = (list, sum, x) => {
    const n = list.length, pitch = clamp(9.5 / Math.max(n, 1), 1.9, 3.3);
    let acc = -(sum * unit) / 2;
    list.forEach((d, i) => {
      d.share = d.value / Math.max(sumS, sumT, 1e-9);
      d.r = clamp(0.42 + 0.8 * Math.sqrt(d.share), 0.5, 1.15);
      d.x = x; d.z = (i - (n - 1) / 2) * pitch;
      d.w = d.value * unit; d.zc = acc + d.w / 2; acc += d.w;
    });
  };
  place(sources, sumS, XS); place(targets, sumT, XT);
  return { sources, targets, sumS, sumT, unit, hasT: targets.length > 0 };
}

const bez = (a, b, c, d, u) => { const v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; };

export default {
  name: 'money_flow',
  description: 'Where the money comes from and where it goes: source nodes on the left, a central entity, destination nodes on the right. Sankey-style glowing ribbons (width exactly proportional to value) carry streams of gold coins; values count up as the money flows. Works with sources only (targets empty).',
  params: {
    sources: '[{label, value, color?}] 1–8 inflows on the left (e.g. customers, revenue segments)',
    center: '{ label, sub? } the entity in the middle (e.g. the company)',
    targets: '[{label, value, color?}] 0–8 outflows on the right (e.g. costs, R&D, buybacks, profit). Leave empty for a sources→centre scene.',
    prefix: 'Value prefix, e.g. "$"', suffix: 'Value suffix, e.g. "B"', decimals: 'Decimals (default 0)', compact: 'K/M/B/T formatting',
    showTotal: 'false to hide the running total at the centre',
    cues: '{ flow: seconds when money starts flowing from the sources (default 0.6), out: seconds when it starts leaving the centre (default: when the first coins arrive) } — shot-local',
  },
  sample: {
    prefix: '$', suffix: 'B', decimals: 1,
    sources: [{ label: 'Data center', value: 115.2 }, { label: 'Gaming', value: 11.4 }, { label: 'Other', value: 3.9 }],
    center: { label: 'NVIDIA', sub: 'FY2025 revenue' },
    targets: [{ label: 'Cost of revenue', value: 32.6 }, { label: 'R&D', value: 12.9 }, { label: 'Taxes & other', value: 12.1 }, { label: 'Net income', value: 72.9 }],
  },
  framings: (p) => {
    const L = layout(p), cx = L.hasT ? 0 : -3.4, k = L.hasT ? 1 : 0.74;
    return {
      wide: { pos: [cx, 12 * k + 1, 16.5 * k + 1.5], target: [cx, 0.2, 0.2], fov: 38 },
      left: { pos: [-13, 6.2, 10], target: [-2.8, 0.7, 0], fov: 36 },
      center: { pos: [4.2, 4.6, 9.5], target: [0, 1.5, 0], fov: 34 },
      right: { pos: L.hasT ? [13, 6.2, 10] : [5.5, 5.2, 9], target: L.hasT ? [2.8, 0.7, 0] : [-1.5, 1, 0], fov: 36 },
      top: { pos: [cx, 26 * k + 2, 5.5], target: [cx, 0, 0.9], fov: 36 },
      low: { pos: [cx - 2, 1.7, 15.5 * k + 2], target: [cx, 1.5, 0], fov: 36 },
    };
  },
  defaultCamera: { from: 'wide', to: 'center', orbit: 8 },
  look: { bloom: 0.45 },

  build(ctx, p) {
    const { theme } = ctx;
    const L = layout(p), r0 = rng(77);
    const base = createBase(ctx, { fog: 0.018, shadowSize: 13, glow: 0.006, rim: 0.5 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.07, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 300, extent: [18, 7, 14] });
    const fmt = (v) => fmtNum(v, { decimals: p.decimals ?? 0, prefix: p.prefix ?? '', suffix: p.suffix ?? '', compact: !!p.compact });

    /* ---- nodes ---- */
    const pedMat = M.dark('#161c27', 0.42), topMat = M.gloss('#0d1219');
    const node = (d, color) => {
      const g = new THREE.Group(); g.position.set(d.x, 0, d.z); scene.add(g);
      mesh(new THREE.CylinderGeometry(d.r, d.r * 1.1, 0.5, 56), pedMat, { pos: [0, 0.25, 0], parent: g });
      mesh(new THREE.CylinderGeometry(d.r * 0.86, d.r * 0.86, 0.04, 56), topMat, { pos: [0, 0.52, 0], parent: g });
      d.ring = mesh(new THREE.TorusGeometry(d.r * 0.93, 0.022, 8, 80), M.glow(d.color ?? color, 1.8), { pos: [0, 0.51, 0], rot: [Math.PI / 2, 0, 0], parent: g, shadow: false });
      mesh(new THREE.TorusGeometry(d.r * 1.16, 0.014, 6, 80), M.glow(d.color ?? color, 0.7), { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0], parent: g, shadow: false });
      d.top = new THREE.Vector3(d.x, 0.56, d.z);
    };
    L.sources.forEach((d) => node(d, theme.accent));
    L.targets.forEach((d) => node(d, theme.accent2));
    // centre
    mesh(new THREE.CylinderGeometry(RC, RC * 1.08, 0.9, 72), pedMat, { pos: [0, 0.45, 0], parent: scene });
    mesh(new THREE.CylinderGeometry(RC * 0.9, RC * 0.9, 0.04, 72), topMat, { pos: [0, 0.92, 0], parent: scene });
    mesh(new THREE.TorusGeometry(RC * 1.14, 0.016, 6, 96), M.glow(theme.warm, 0.7), { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0], parent: scene, shadow: false });
    const cRing = mesh(new THREE.TorusGeometry(RC * 0.95, 0.03, 8, 96), M.glow(theme.warm, 1.9), { pos: [0, 0.91, 0], rot: [Math.PI / 2, 0, 0], parent: scene, shadow: false });
    const core = mesh(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshStandardMaterial({ color: col('#f2c14e'), metalness: 1, roughness: 0.22, emissive: col(theme.warm), emissiveIntensity: 0.25, flatShading: true }), { pos: [0, 2.0, 0], parent: scene });
    const orbA = mesh(new THREE.TorusGeometry(0.98, 0.012, 6, 80), M.glow(theme.warm, 1.6), { pos: [0, 2.0, 0], parent: scene, shadow: false });
    const orbB = mesh(new THREE.TorusGeometry(1.14, 0.01, 6, 80), M.glow(theme.accent, 1.4), { pos: [0, 2.0, 0], parent: scene, shadow: false });
    const coreLight = new THREE.PointLight(col(theme.warm), 5, 9, 1.7); coreLight.position.set(0, 2.0, 0); scene.add(coreLight);

    /* ---- flows (ribbon + coins) ---- */
    const YN = 0.6, YC = 0.98;
    const flows = [];
    const mkFlow = (d, incoming, color) => {
      // centre-line: cubic bezier with horizontal tangents and a gentle arc
      const x0 = incoming ? XS + d.r * 0.9 : RC * 0.9 * Math.sign(XT), x1 = incoming ? -RC * 0.9 : XT - d.r * 0.9;
      const z0 = incoming ? d.z : d.zc, z1 = incoming ? d.zc : d.z, y0 = incoming ? YN : YC, y1 = incoming ? YC : YN;
      const arc = 0.55 + Math.abs(z1 - z0) * 0.08;
      const pt = (u, out) => out.set(lerp(x0, x1, u), bez(y0, y0 + arc, y1 + arc, y1, u), bez(z0, z0, z1, z1, u));
      const pos = new Float32Array((NS + 1) * 6), uv = new Float32Array((NS + 1) * 4), idx = [], v = new THREE.Vector3();
      const hw = Math.max(d.w / 2, 0.03);
      for (let i = 0; i <= NS; i++) {
        const u = i / NS; pt(u, v);
        pos.set([v.x, v.y, v.z - hw, v.x, v.y, v.z + hw], i * 6); uv.set([u, -1, u, 1], i * 4);
        if (i < NS) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: col(d.color ?? color) }, uFront: { value: 0 }, uTime: { value: 0 }, uLen: { value: Math.abs(x1 - x0) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uFront, uTime, uLen; varying vec2 vUv;
          void main(){
            float reveal = smoothstep(uFront, uFront - 0.06, vUv.x);
            float edge = smoothstep(1.0, 0.82, abs(vUv.y));
            float rim = smoothstep(0.7, 1.0, abs(vUv.y)) * edge;
            float dash = 0.5 + 0.5 * sin((vUv.x * uLen * 1.6 - uTime * 1.4) * 6.2831);
            float a = (0.16 + 0.10 * dash + 0.55 * rim) * edge * reveal;
            a *= smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
            gl_FragColor = vec4(uColor * a, 1.0);
          }`,
      });
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 2; scene.add(m);
      flows.push({ d, incoming, pt, mat, hw, coins: [] });
    };
    L.sources.forEach((d) => mkFlow(d, true, theme.accent));
    L.targets.forEach((d) => mkFlow(d, false, theme.accent2));
    // coins, distributed in proportion to value
    const BUDGET = 380, sumAll = L.sumS + L.sumT || 1;
    let total = 0;
    flows.forEach((fl) => { const n = Math.max(5, Math.round((fl.d.value / sumAll) * BUDGET)); for (let j = 0; j < n; j++) fl.coins.push({ phase: (j + r0()) / n, lat: r0.range(-0.8, 0.8), lift: r0.range(0.05, 0.3), spin: r0.range(1.5, 4), ax: r0() * 6.28, sp: r0.range(0.9, 1.1) }); total += n; });
    const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.082, 0.082, 0.02, 14), new THREE.MeshStandardMaterial({ color: col('#f5c451'), metalness: 0.9, roughness: 0.45, emissive: col('#f2a43a'), emissiveIntensity: 0.5 }), total);
    coins.frustumCulled = false; coins.castShadow = true; scene.add(coins);

    const anchors = { center: new THREE.Vector3(0, 2.0, 0), centerTop: new THREE.Vector3(0, 3.15, 0) };
    L.sources.forEach((d, i) => { anchors['source' + i] = d.top; });
    L.targets.forEach((d, i) => { anchors['target' + i] = d.top; });
    const dm = new THREE.Object3D(), v = new THREE.Vector3();
    const st = { tin: 0, tout: 0, ga: 1 };
    const TRAVEL = 1 / SPEED;

    return {
      scene, anchors,
      update(f) {
        const t = f.t, cues = f.params.cues || {};
        dust.update(t);
        const tin = cues.flow != null ? f.shotT - cues.flow : (f.prevParams ? 1e3 : t - 0.6);
        const tout = cues.out != null ? f.shotT - cues.out : tin - TRAVEL * 0.85;
        st.tin = tin; st.tout = tout; st.ga = clamp(t / 0.8 + (f.prevParams ? 1 : 0));
        let ci = 0;
        for (const fl of flows) {
          const tau = fl.incoming ? tin : tout;
          fl.mat.uniforms.uFront.value = clamp(tau * SPEED * 1.25, 0, 1.1); fl.mat.uniforms.uTime.value = t;
          for (const c of fl.coins) {
            const prog = tau * SPEED * c.sp;
            const u = ((prog + c.phase) % 1 + 1) % 1;
            const on = tau > 0 && u <= prog;
            if (!on) { dm.position.set(0, -5, 0); dm.scale.setScalar(0.001); dm.updateMatrix(); coins.setMatrixAt(ci++, dm.matrix); continue; }
            fl.pt(u, v);
            const env = clamp(u / 0.07) * clamp((1 - u) / 0.07);
            dm.position.set(v.x, v.y + c.lift + 0.04 * Math.sin(t * 3 + c.ax), v.z + c.lat * fl.hw);
            dm.rotation.set(c.ax + t * c.spin, t * c.spin * 0.6, c.ax * 0.5);
            dm.scale.setScalar(Math.max(env, 0.001)); dm.updateMatrix(); coins.setMatrixAt(ci++, dm.matrix);
          }
        }
        coins.instanceMatrix.needsUpdate = true;
        const arrived = clamp((tin - TRAVEL * 0.8) / 1.5);
        core.rotation.set(t * 0.5, t * 0.8, 0); core.position.y = 2.0 + 0.08 * Math.sin(t * 1.3);
        core.material.emissiveIntensity = 0.2 + 0.35 * arrived + 0.1 * Math.sin(t * 2.6);
        orbA.rotation.set(Math.PI / 2 + 0.5 * Math.sin(t * 0.6), t * 0.7, 0); orbB.rotation.set(0.6, -t * 0.5, t * 0.3);
        coreLight.intensity = 3 + 4 * arrived + 0.8 * Math.sin(t * 2.6);
        cRing.material.color.copy(cRing.material.userData.baseColor).multiplyScalar(1.4 + 0.6 * arrived + 0.2 * Math.sin(t * 2.1));
        for (const d of L.sources) d.ring.material.color.copy(d.ring.material.userData.baseColor).multiplyScalar(1.3 + 0.7 * clamp(tin / 0.8));
        for (const d of L.targets) d.ring.material.color.copy(d.ring.material.userData.baseColor).multiplyScalar(1.0 + 1.0 * clamp((tout - TRAVEL * 0.8) / 1.0));
      },
      labels() {
        const out = [], ga = st.ga;
        const kin = ease.outCubic(clamp(st.tin / 2.2)), karr = ease.outCubic(clamp((st.tin - TRAVEL * 0.8) / 2.2)), kout = ease.outCubic(clamp((st.tout - TRAVEL * 0.8) / 2.2));
        const small = Math.max(L.sources.length, L.targets.length) > 5;
        const size = small ? 26 : 30;
        L.sources.forEach((d) => out.push({ pos: new THREE.Vector3(d.x - d.r - 0.3, 0.75, d.z), text: String(d.label ?? ''), sub: fmt(d.value * kin), size, weight: 600, color: theme.text, alpha: ga, align: 'right', dy: -12 }));
        L.targets.forEach((d) => out.push({ pos: new THREE.Vector3(d.x + d.r + 0.3, 0.75, d.z), text: String(d.label ?? ''), sub: fmt(d.value * kout), size, weight: 600, color: theme.text, alpha: ga * (0.45 + 0.55 * clamp(st.tout / 0.6 + 0.0)), align: 'left', dy: -12 }));
        if (p.center?.label) out.push({ pos: anchors.centerTop, text: String(p.center.label), sub: p.center.sub, size: 44, weight: 700, alpha: ga, dy: p.center.sub ? -34 : -10 });
        if (p.showTotal !== false && L.sumS > 0) out.push({ pos: new THREE.Vector3(0, 0.55, RC + 0.55), text: fmt(L.sumS * karr), size: 34, weight: 700, font: 'mono', bg: true, color: theme.warm, alpha: ga * clamp(karr * 8) });
        return out;
      },
    };
  },
};
