// Market-share donut: bevelled ring segments sweep in one after another,
// the highlighted segment lifts out with a glow, labels show exact percentages.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, ease, lerp, fmtNum } from '../core/util.js';

const RO = 3.0, RI = 1.72, HT = 0.55, CH = 0.045, YB = 0.95, TAU = Math.PI * 2, GAP = 0.03;

function layout(p) {
  const data = (p.data && p.data.length ? p.data : [{ label: 'A', value: 1 }]).filter((d) => Number(d.value) > 0).slice(0, 12);
  const total = data.reduce((a, d) => a + Number(d.value), 0) || 1;
  const n = data.length, avail = TAU - (n > 1 ? n * GAP : 0);
  let a = n > 1 ? GAP / 2 : 0;
  const segs = data.map((d, i) => {
    const share = Number(d.value) / total, a0 = a, a1 = a + share * avail;
    a = a1 + (n > 1 ? GAP : 0);
    return { i, label: d.label, value: Number(d.value), color: d.color, share, a0, a1, mid: (a0 + a1) / 2 };
  });
  return { segs, total, n };
}
const hlOf = (pp, n) => (pp && pp.highlight != null && pp.highlight >= 0 && pp.highlight < n ? Math.round(pp.highlight) : -1);

export default {
  name: 'donut',
  description: 'Market-share / breakdown donut. Bevelled 3D ring segments sweep in clockwise from the top one after another; percentages (exactly value ÷ total) and names sit beside each segment; the highlighted segment lifts and slides outward with a glow; a big value sits in the centre.',
  params: {
    data: '[{label, value, color?}] — 2 to 8 segments recommended (max 12). Angles are exactly proportional to value.',
    highlight: 'Index of the segment to pull out and light up (omit / -1 for none). Tweens when a continued shot changes it.',
    centerLabel: 'Big text in the middle of the ring, e.g. "92%" or "$4.2T"', centerSub: 'Small line under it, e.g. "of AI accelerators"',
    decimals: 'Decimals for the percentages (default 0)',
    showValue: 'true → also show each raw value after the name (uses prefix/suffix/compact/valueDecimals)',
    prefix: 'Value prefix', suffix: 'Value suffix', compact: 'K/M/B/T value formatting', valueDecimals: 'Decimals for raw values (default 0)',
    cues: '{ sweep: seconds when segments start sweeping in (default 0.3), highlight: seconds when the highlight lifts (default: after the sweep) } — shot-local',
  },
  sample: {
    centerLabel: '86%', centerSub: 'data-center AI chips', highlight: 0,
    data: [{ label: 'NVIDIA', value: 86 }, { label: 'AMD', value: 7 }, { label: 'Custom ASICs', value: 5 }, { label: 'Others', value: 2 }],
  },
  framings: (p) => {
    const L = layout(p), h = hlOf(p, L.n), m = L.segs[h >= 0 ? h : 0].mid;
    const dx = Math.sin(m), dz = -Math.cos(m);
    return {
      wide: { pos: [0, 12, 12.6], target: [0, 0.3, 1.4], fov: 34 },
      hero: { pos: [7.2, 8.6, 10.2], target: [0.3, 0.3, 1.2], fov: 34 },
      top: { pos: [0, 22, 4.6], target: [0, 0.6, 0.75], fov: 34 },
      close: { pos: [dx * 10 + dz * 2.5, 7.4, dz * 10 - dx * 2.5 + 3.5], target: [dx * 1.6, 0.6, dz * 1.6 + 0.8], fov: 32 },
      low: { pos: [3.5, 2.6, 13.5], target: [0, 1.1, 0.8], fov: 34 },
      side: { pos: [-9.5, 6.4, 8.8], target: [-0.2, 0.3, 1.2], fov: 34 },
    };
  },
  defaultCamera: { from: 'wide', to: 'hero', orbit: 8 },
  look: { bloom: 0.45 },

  build(ctx, p) {
    const { theme } = ctx;
    const L = layout(p), { segs, n } = L;
    const base = createBase(ctx, { fog: 0.02, shadowSize: 9, glow: 0.006, rim: 0.5 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.55, grid: 0.07, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 300, extent: [14, 7, 14] });

    const neutral = col(theme.metal).lerp(col(theme.bg1), 0.35);
    const palette = [col(theme.accent), col(theme.accent2), col(theme.warm), col(theme.accent).lerp(col('#ffffff'), 0.45), col(theme.danger), col(theme.accent2).lerp(col(theme.bg1), 0.45), neutral.clone(), col(theme.warm).lerp(col(theme.bg1), 0.4)];

    /* ---- segment geometry (rewritten every frame — a few thousand vertices) ---- */
    const E = 8;
    segs.forEach((s) => {
      const A = Math.max(3, Math.ceil(((s.a1 - s.a0) / TAU) * 110));
      const nv = E * 2 * (A + 1) + 2 * (E + 1);
      const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), idx = [];
      for (let e = 0; e < E; e++) for (let j = 0; j < A; j++) {
        const a = (e * (A + 1) + j) * 2, b = a + 1, a2 = a + 2, b2 = a + 3;
        idx.push(a, b, a2, b, b2, a2);
      }
      const c0 = E * 2 * (A + 1), c1 = c0 + E + 1;
      for (let i = 0; i < E; i++) { idx.push(c0, c0 + 1 + ((i + 1) % E), c0 + 1 + i); idx.push(c1, c1 + 1 + i, c1 + 1 + ((i + 1) % E)); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setIndex(idx);
      const c = s.color ? col(s.color) : (/^other/i.test(String(s.label)) ? neutral.clone() : palette[s.i % palette.length].clone());
      const mat = new THREE.MeshPhysicalMaterial({ color: c.clone().multiplyScalar(0.5), metalness: 0.3, roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.3, emissive: c.clone(), emissiveIntensity: 0.2 });
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
      const leader = mesh(new THREE.BoxGeometry(1, 0.014, 0.014), new THREE.MeshBasicMaterial({ color: col(theme.textDim), transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false }), { parent: scene, shadow: false });
      Object.assign(s, { A, pos, nrm, geo: g, mat, m, c, c0, c1, leader, frac: 0, w: 0, lp: new THREE.Vector3(), anchor: new THREE.Vector3() });
    });
    const SQ = Math.SQRT1_2;
    const EN = [[0, -1], [SQ, -SQ], [1, 0], [SQ, SQ], [0, 1], [-SQ, SQ], [-1, 0], [-SQ, -SQ]];
    function fill(s, a1, h, off, y0) {
      const P = [[RI + CH, 0], [RO - CH, 0], [RO, CH], [RO, h - CH], [RO - CH, h], [RI + CH, h], [RI, h - CH], [RI, CH]];
      const ox = Math.sin(s.mid) * off, oz = -Math.cos(s.mid) * off;
      const { pos, nrm, A } = s;
      let k = 0;
      const put = (r, y, th, nr, ny, nt) => {
        const sn = Math.sin(th), cs = Math.cos(th);
        pos[k] = r * sn + ox; pos[k + 1] = y0 + y; pos[k + 2] = -r * cs + oz;
        nrm[k] = nr * sn + nt * cs; nrm[k + 1] = ny; nrm[k + 2] = -nr * cs + nt * sn; k += 3;
      };
      for (let e = 0; e < E; e++) {
        const pa = P[e], pb = P[(e + 1) % E], en = EN[e];
        for (let j = 0; j <= A; j++) { const th = lerp(s.a0, a1, j / A); put(pa[0], pa[1], th, en[0], en[1], 0); put(pb[0], pb[1], th, en[0], en[1], 0); }
      }
      const rc = (RI + RO) / 2;
      put(rc, h / 2, s.a0, 0, 0, -1); for (let i = 0; i < E; i++) put(P[i][0], P[i][1], s.a0, 0, 0, -1);
      put(rc, h / 2, a1, 0, 0, 1); for (let i = 0; i < E; i++) put(P[i][0], P[i][1], a1, 0, 0, 1);
      s.geo.attributes.position.needsUpdate = true; s.geo.attributes.normal.needsUpdate = true;
    }

    /* ---- pedestal + decoration ---- */
    mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.22, 64), M.plastic('#0b0f15', 0.55), { pos: [0, 0.11, 0], parent: scene });
    const hubRing = mesh(new THREE.TorusGeometry(1.26, 0.018, 8, 96), M.glow(theme.accent, 1.6), { pos: [0, 0.225, 0], rot: [Math.PI / 2, 0, 0], parent: scene, shadow: false });
    const NT = 90;
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.012, 0.16), new THREE.MeshBasicMaterial({ color: col(theme.textDim), transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }), NT);
    ticks.frustumCulled = false; scene.add(ticks);
    const under = new THREE.PointLight(col(theme.accent), 2.2, 8, 1.6); under.position.set(0, 0.5, 0); scene.add(under);

    const fmtV = (v) => fmtNum(v, { decimals: p.valueDecimals ?? 0, prefix: p.prefix ?? '', suffix: p.suffix ?? '', compact: !!p.compact });
    const anchors = { center: new THREE.Vector3(0, YB + 0.55, 0) };
    segs.forEach((s) => { anchors['seg' + s.i] = s.anchor; });
    const dm = new THREE.Object3D();
    const st = { ga: 1, active: 0 };
    const SWEEP = 1.9;
    // label angles: start at each segment's middle, then push neighbours apart so labels never collide
    const MINSEP = p.showValue ? 0.6 : 0.45;
    segs.forEach((s) => { s.la = s.mid; });
    if (n > 1 && n * MINSEP < TAU) for (let it = 0; it < 80; it++) for (let i = 0; i < n; i++) {
      const a = segs[i], b = segs[(i + 1) % n], wrap = i === n - 1 ? TAU : 0;
      const d = b.la + wrap - a.la;
      if (d < MINSEP) { const push = (MINSEP - d) / 2; a.la -= push; b.la += push; }
    }
    let flip = false;
    segs.forEach((s, i) => { const small = s.share < 0.075, prevSmall = i > 0 && segs[i - 1].share < 0.075; s.far = small && prevSmall ? (flip = !flip) : (flip = false); });

    return {
      scene, anchors,
      update(f) {
        const t = f.t, cues = f.params.cues || {};
        dust.update(t);
        const ts = cues.sweep != null ? f.shotT - cues.sweep : (f.prevParams ? 1e3 : t - 0.3);
        const head = ease.inOutCubic(clamp(ts / SWEEP)) * TAU;
        const hp = f.prevParams ? hlOf(f.prevParams, n) : -1, hc = hlOf(f.params, n);
        const th = cues.highlight != null ? cues.highlight : (f.prevParams ? 0.4 : 0.3 + SWEEP * 0.9);
        const k = ease.inOutCubic(clamp((f.shotT - th) / 0.9));
        st.active = lerp(hp >= 0 ? 1 : 0, hc >= 0 ? 1 : 0, k);
        st.ga = clamp(t / 0.8 + (f.prevParams ? 1 : 0));
        const bob = Math.sin(t * 0.7) * 0.03;
        for (const s of segs) {
          const w = Math.min((s.i === hp ? 1 - k : 0) + (s.i === hc ? k : 0), 1);
          s.w = w;
          const a1 = clamp(head, s.a0, s.a1);
          s.frac = (a1 - s.a0) / Math.max(s.a1 - s.a0, 1e-6);
          s.m.visible = a1 - s.a0 > 1e-3;
          const h = HT + 0.38 * w, off = 0.42 * w, y0 = YB + bob + 0.12 * w;
          if (s.m.visible) fill(s, a1, h, off, y0);
          const dim = st.active * (1 - w);
          s.mat.color.copy(s.c).multiplyScalar(0.5 - 0.2 * dim);
          s.mat.emissiveIntensity = (0.2 - 0.1 * dim + 0.16 * w) * (1 + 0.06 * Math.sin(t * 1.6 + s.i));
          const rl = RO + (s.far ? 1.55 : 0.95) + off, sx = Math.sin(s.mid), sz = -Math.cos(s.mid);
          s.lp.set(Math.sin(s.la) * rl, y0 + h * 0.5 + Math.max(0, Math.cos(s.la)) * 1.25, -Math.cos(s.la) * rl);
          s.anchor.set(sx * ((RO + RI) / 2 + off), y0 + h, sz * ((RO + RI) / 2 + off));
          const la = clamp((s.frac - 0.5) * 2), ax = sx * (RO + off + 0.1), az = sz * (RO + off + 0.1);
          const bx = Math.sin(s.la) * (rl - 0.22), bz = -Math.cos(s.la) * (rl - 0.22), len = Math.hypot(bx - ax, bz - az);
          s.leader.scale.set(Math.max(len * la, 0.001), 1, 1);
          const by = s.lp.y - (y0 + h * 0.5);
          s.leader.scale.set(Math.max(Math.hypot(len, by) * la, 0.001), 1, 1);
          s.leader.position.set(ax + (bx - ax) * la / 2, y0 + h * 0.5 + by * la / 2, az + (bz - az) * la / 2);
          s.leader.rotation.set(0, -Math.atan2(bz - az, bx - ax), Math.atan2(by, len), 'YZX');
        }
        for (let i = 0; i < NT; i++) {
          const a = (i / NT) * TAU + t * 0.05, r = 4.9;
          dm.position.set(Math.sin(a) * r, 0.02, -Math.cos(a) * r); dm.rotation.set(0, -a, 0); dm.scale.set(1, 1, i % 5 === 0 ? 1.8 : 1); dm.updateMatrix(); ticks.setMatrixAt(i, dm.matrix);
        }
        ticks.instanceMatrix.needsUpdate = true;
        hubRing.material.color.copy(hubRing.material.userData.baseColor).multiplyScalar(1.4 + 0.35 * Math.sin(t * 1.1));
        under.intensity = 2.2 + 0.5 * Math.sin(t * 1.1);
      },
      labels() {
        const out = [], ga = st.ga, dec = p.decimals ?? 0;
        for (const s of segs) {
          if (s.frac < 0.02) continue;
          const sx = Math.sin(s.la);
          const align = sx > 0.3 ? 'left' : sx < -0.3 ? 'right' : 'center';
          const dim = st.active * (1 - s.w), big = s.share >= 0.1;
          const size = (big ? 40 : 30) * (1 + 0.15 * s.w);
          out.push({
            pos: s.lp, text: (s.share * 100 * s.frac).toFixed(dec) + '%', sub: s.label != null ? String(s.label) + (p.showValue ? ' · ' + fmtV(s.value) : '') : undefined,
            size, weight: 700, color: theme.text, alpha: ga * clamp(s.frac * 3) * (1 - 0.4 * dim), align, dy: -size * 0.35, dx: align === 'left' ? 8 : align === 'right' ? -8 : 0,
          });
        }
        if (p.centerLabel) out.push({ pos: anchors.center, text: String(p.centerLabel), sub: p.centerSub, size: 64, weight: 700, alpha: ga * clamp((segs[0].frac || 0) * 2), dy: -20 });
        return out;
      },
    };
  },
};
