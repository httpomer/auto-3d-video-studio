// AI training visualised as gradient descent on a 3D loss surface: a glowing
// ball rolls downhill along a precomputed descent path, leaving a bright trail,
// while a readout counts the loss down. Position is a pure function of time.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, ease, anim, lerp, rng } from '../core/util.js';

const EXT = 8, SEG = 144;
const cache = new Map();

/** Deterministic height field + descent path for a seed. */
function field(seedIn) {
  const seed = Math.round(Number(seedIn ?? 4)) || 4;
  if (cache.has(seed)) return cache.get(seed);
  const r = rng(seed * 7919 + 13);
  const mx = r.range(-1.8, 1.2), mz = r.range(-2.0, 1.0);
  // start hill: high ground on the camera-facing side, ~7 units from the minimum
  const sa = r.range(2.55, 3.75), sd = 6.6;
  const hx = clamp(mx + Math.cos(sa) * sd, -EXT + 1.6, EXT - 1.6), hz = clamp(mz + Math.sin(sa) * sd, -EXT + 1.6, EXT - 1.6);
  const ux = (mx - hx), uz = (mz - hz), ul = Math.hypot(ux, uz), nx = ux / ul, nz = uz / ul;
  const bumps = [{ x: hx, z: hz, a: 2.3, s: 2.1 }];
  // an obstacle ridge beside the direct line so the path has to curve around it
  const side = r() < 0.5 ? 1 : -1;
  bumps.push({ x: hx + ux * 0.52 - nz * side * 1.25, z: hz + uz * 0.52 + nx * side * 1.25, a: 1.15, s: 1.0 });
  for (let i = 0; i < 8; i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(3.4, 8.5);
    const bx = mx + Math.cos(a) * d, bz = mz + Math.sin(a) * d;
    if (Math.hypot(bx - hx, bz - hz) < 3.2) continue;
    bumps.push({ x: bx, z: bz, a: i < 5 ? r.range(0.8, 1.9) : -r.range(0.3, 0.5), s: r.range(1.1, 2.0) });
  }
  const p1 = r.range(0, 6.28), p2 = r.range(0, 6.28);
  const h = (x, z) => {
    const dx = x - mx, dz = z - mz, d2 = dx * dx + dz * dz;
    let y = 0.5 + 0.02 * d2;
    for (const b of bumps) { const ex = x - b.x, ez = z - b.z; y += b.a * Math.exp(-(ex * ex + ez * ez) / (2 * b.s * b.s)); }
    const far = clamp((Math.sqrt(d2) - 1.2) / 3);
    y += 0.2 * Math.sin(x * 0.95 + p1) * Math.cos(z * 0.85 + p2) * far;
    return Math.max(y, 0.32);
  };
  const best = { x: hx + nx * 0.7, z: hz + nz * 0.7 }; best.y = h(best.x, best.z);
  // gradient descent with momentum (trimmed once it has settled)
  let pts = [];
  let x = best.x, z = best.z, vx = 0, vz = 0;
  const e = 0.02;
  for (let i = 0; i < 900; i++) {
    pts.push([x, z]);
    let gx = (h(x + e, z) - h(x - e, z)) / (2 * e), gz = (h(x, z + e) - h(x, z - e)) / (2 * e);
    const gl = Math.hypot(gx, gz); if (gl > 1.4) { gx *= 1.4 / gl; gz *= 1.4 / gl; }
    vx = 0.9 * vx - 0.012 * gx; vz = 0.9 * vz - 0.012 * gz;
    x = clamp(x + vx, -EXT + 0.3, EXT - 0.3); z = clamp(z + vz, -EXT + 0.3, EXT - 0.3);
  }
  const fin = pts[pts.length - 1];
  let lastFar = 0; for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - fin[0], pts[i][1] - fin[1]) > 0.06) lastFar = i;
  pts = pts.slice(0, Math.min(pts.length, lastFar + 14));
  const end = pts[pts.length - 1];
  let hMax = 0; for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) hMax = Math.max(hMax, h(-EXT + i * 0.4, -EXT + j * 0.4));
  hMax = Math.min(hMax, 3.6);
  const out = { seed, h, pts, start: best, min: { x: end[0], z: end[1], y: h(end[0], end[1]) }, hMax };
  cache.set(seed, out);
  return out;
}

export default {
  name: 'loss_landscape',
  description: 'AI training as gradient descent: a smooth 3D "loss surface" of hills and valleys (red peaks → accent-coloured valleys, glowing wireframe). A bright ball rolls downhill along the descent path to the minimum, leaving a trail, with a live "loss 2.41 → 0.03" readout following it.',
  params: {
    seed: 'Integer — picks a different landscape / descent path (default 4)',
    progress: '0..1 how far the descent has gone. Omit to animate 0→1 across the shot; set explicitly (e.g. 0.4 then 1 in a continued shot) to control it — it tweens.',
    label: 'Small caption under the loss readout, e.g. "Training loss" (default none)',
    lossStart: 'Loss value shown at the start (default 2.41)',
    lossEnd: 'Loss value shown at the minimum (default 0.03)',
    readout: 'false to hide the loss readout',
  },
  sample: { seed: 4, label: 'Training loss' },
  framings: (p) => {
    const F = field(p.seed);
    const S = F.start, Mn = F.min;
    const dx = Mn.x - S.x, dz = Mn.z - S.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
    const above = (x, y, z, m) => [x, Math.max(y, (Math.abs(x) < EXT && Math.abs(z) < EXT ? F.h(x, z) : 0) + m), z];
    return {
      wide: { pos: [11.5, 10.5, 16.5], target: [0, 0.9, 0.5], fov: 34 },
      follow: { pos: above(S.x - ux * 4.2 - uz * 1.6, S.y + 2.6, S.z - uz * 4.2 + ux * 1.6, 1.6), target: [lerp(S.x, Mn.x, 0.5), 1.2, lerp(S.z, Mn.z, 0.5)], fov: 38 },
      valley: { pos: above(Mn.x + 3.6, Mn.y + 2.7, Mn.z + 5.0, 1.5), target: [Mn.x, Mn.y + 0.3, Mn.z], fov: 30 },
      top: { pos: [0.6, 23, 3.2], target: [0, 0.8, 0], fov: 34 },
      low: { pos: [-11, 2.9, 13.5], target: [0, 1.9, 0], fov: 32 },
      side: { pos: [17, 5.2, 1.5], target: [0, 1.5, 0], fov: 30 },
    };
  },
  defaultCamera: { from: 'wide', to: 'valley', ease: 'inOutSine' },
  look: { bloom: 0.48 },

  build(ctx, p) {
    const { theme } = ctx;
    const F = field(p.seed);
    const base = createBase(ctx, { fog: 0.016, shadowSize: 13, glow: 0.03, glowDir: [0, 0.5, -1], key: 1.2, env: 0.3, rim: 0.4 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.4, grid: 0.07, gridScale: 2.5 });
    const dust = addDust(ctx, scene, { count: 320, extent: [15, 9, 15] });

    const cLow = col(theme.accent), cMid = col(theme.accent2), cHigh = col(theme.danger), tmp = new THREE.Color();
    const ramp = (y, out, k = 1) => {
      const u = clamp((y - F.min.y) / (F.hMax - F.min.y));
      if (u < 0.45) out.copy(cLow).lerp(cMid, (u / 0.45) * 0.75);
      else out.copy(cLow).lerp(cMid, 0.75).lerp(cHigh, clamp((u - 0.45) / 0.45));
      return out.multiplyScalar(k * (0.5 + 0.5 * u));
    };

    const grp = new THREE.Group(); scene.add(grp);
    /* ---- surface ---- */
    const geo = new THREE.PlaneGeometry(EXT * 2, EXT * 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = F.h(pos.getX(i), pos.getZ(i)); pos.setY(i, y);
      ramp(y, tmp, 0.3); colors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const surfMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.15, side: THREE.DoubleSide });
    surfMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor.rgb * 0.55;\n#endif'); };
    const surf = mesh(geo, surfMat, { parent: grp }); surf.castShadow = false;

    /* ---- glowing wireframe following the surface ---- */
    const NL = 24, lp = [], lc = [];
    const addSeg = (x0, z0, x1, z1) => {
      const y0 = F.h(x0, z0) + 0.015, y1 = F.h(x1, z1) + 0.015;
      lp.push(x0, y0, z0, x1, y1, z1);
      ramp(y0, tmp, 0.9); lc.push(tmp.r, tmp.g, tmp.b); ramp(y1, tmp, 0.9); lc.push(tmp.r, tmp.g, tmp.b);
    };
    for (let i = 0; i <= NL; i++) {
      const c = -EXT + (i / NL) * EXT * 2;
      for (let j = 0; j < SEG; j++) {
        const a = -EXT + (j / SEG) * EXT * 2, b = -EXT + ((j + 1) / SEG) * EXT * 2;
        addSeg(c, a, c, b); addSeg(a, c, b, c);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    const wire = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, toneMapped: false, depthWrite: false }));
    grp.add(wire);

    /* ---- descent path, trail, ball ---- */
    const K = F.pts.length;
    const p3 = F.pts.map(([x, z]) => new THREE.Vector3(x, F.h(x, z), z));
    const TS = 400, TR = 6;
    const curve = new THREE.CatmullRomCurve3(p3.filter((_, i) => i % 2 === 0).map((q) => q.clone().setY(q.y + 0.05)), false, 'centripetal');
    const trailGeo = new THREE.TubeGeometry(curve, TS, 0.03, TR, false);
    const trailMat = M.glow(theme.warm, 1.5);
    const trail = mesh(trailGeo, trailMat, { parent: grp, shadow: false });
    // cumulative arc length per path step → trail draw range in sync with the ball
    const cum = [0]; for (let i = 1; i < K; i++) cum.push(cum[i - 1] + p3[i].distanceTo(p3[i - 1]));
    const BALL = 0.26;
    const ballMat = M.glow(col(theme.warm).lerp(col('#ffffff'), 0.7), 1.3);
    const ball = mesh(new THREE.SphereGeometry(BALL, 32, 20), ballMat, { parent: scene, shadow: false });
    const halo = mesh(new THREE.SphereGeometry(BALL * 1.7, 24, 16), new THREE.MeshBasicMaterial({ color: col(theme.warm).multiplyScalar(0.5), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }), { parent: scene, shadow: false });
    const bLight = new THREE.PointLight(col(theme.warm).lerp(col('#ffffff'), 0.4), 0, 6, 1.7); scene.add(bLight);

    /* ---- minimum marker ---- */
    const minMat = M.glow(theme.accent2, 1.4);
    const ring = mesh(new THREE.TorusGeometry(0.5, 0.02, 8, 64), minMat, { pos: [F.min.x, F.min.y + 0.04, F.min.z], rot: [Math.PI / 2, 0, 0], parent: grp, shadow: false });
    const pin = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.8, 6), minMat, { pos: [F.min.x, F.min.y + 0.9, F.min.z], parent: grp, shadow: false });
    // start marker
    mesh(new THREE.TorusGeometry(0.3, 0.015, 8, 48), M.glow(theme.danger, 1.2), { pos: [F.start.x, F.start.y + 0.04, F.start.z], rot: [Math.PI / 2, 0, 0], parent: grp, shadow: false });

    const anchors = {
      ball: new THREE.Vector3(), minimum: new THREE.Vector3(F.min.x, F.min.y + 0.1, F.min.z), start: new THREE.Vector3(F.start.x, F.start.y + 0.1, F.start.z),
      peak: new THREE.Vector3(), surface: new THREE.Vector3(0, F.h(0, 0), 0),
    };
    { let by = -1; for (let i = 0; i <= 32; i++) for (let j = 0; j <= 32; j++) { const x = -EXT + i * 0.5, z = -EXT + j * 0.5, y = F.h(x, z); if (y > by) { by = y; anchors.peak.set(x, y, z); } } }
    const labelPos = new THREE.Vector3();
    const st = { prog: 0 };

    const progress = (f) => {
      if (f.params.progress != null) return clamp(f.tw('progress', 0, 0.6, Math.max(1.6, f.dur - 1.6), ease.inOutSine));
      if (f.prevParams && f.prevParams.progress != null) return clamp(Number(f.prevParams.progress));
      return ease.inOutSine(clamp((f.t - 0.9) / Math.max(f.dur - 2.2, 2)));
    };

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        const rise = anim(t, 0.0, 1.5, ease.outCubic);
        grp.scale.y = Math.max(rise, 0.001);
        const prog = progress(f); st.prog = prog;
        // progress is measured along the path's arc length (0.5 = halfway down the route)
        const sT = prog * cum[K - 1];
        let lo = 0, hi = K - 2;
        while (lo < hi) { const md = (lo + hi + 1) >> 1; if (cum[md] <= sT) lo = md; else hi = md - 1; }
        const i0 = lo, fr = clamp((sT - cum[i0]) / Math.max(cum[i0 + 1] - cum[i0], 1e-6));
        const a = p3[i0], b = p3[i0 + 1];
        const x = lerp(a.x, b.x, fr), z = lerp(a.z, b.z, fr), y = F.h(x, z) * rise;
        const show = anim(t, 0.9, 0.6, ease.outBack);
        ball.position.set(x, y + BALL * 0.95, z); ball.scale.setScalar(Math.max(show, 0.001));
        halo.position.copy(ball.position); halo.scale.setScalar(Math.max(show * (1 + 0.12 * Math.sin(t * 3)), 0.001));
        bLight.position.set(x, y + 0.7, z); bLight.intensity = 2.0 * show;
        anchors.ball.copy(ball.position); labelPos.copy(ball.position); labelPos.y += 0.35;
        const arc = prog;
        trailGeo.setDrawRange(0, Math.floor(arc * TS) * TR * 6);
        trail.visible = arc > 0.003 && show > 0.5;
        const arrived = clamp((prog - 0.9) / 0.1);
        minMat.color.copy(minMat.userData.baseColor).multiplyScalar(0.7 + 0.5 * Math.sin(t * 2.2) * 0.5 + 1.0 * arrived);
        ring.scale.setScalar(1 + 0.12 * Math.sin(t * 2.2) + 0.25 * arrived);
        pin.scale.y = 0.7 + 0.3 * arrived;
        wire.material.opacity = 0.75 * anim(t, 0.5, 1.2);
      },
      labels(f) {
        const P = f.params;
        if ((P.readout ?? p.readout) === false) return [];
        const a = anim(f.t, 1.2, 0.6);
        if (a <= 0.01) return [];
        const L0 = Number(P.lossStart ?? p.lossStart ?? 2.41), L1 = Number(P.lossEnd ?? p.lossEnd ?? 0.03);
        const prog = progress(f);
        const loss = L0 * Math.pow(Math.max(L1, 1e-4) / L0, Math.pow(prog, 0.85));
        const label = P.label ?? p.label;
        return [{ pos: labelPos, text: 'loss ' + loss.toFixed(2), sub: label ? String(label) : undefined, size: 30, font: 'mono', weight: 700, bg: true, color: prog > 0.92 ? theme.accent2 : theme.text, alpha: a, dy: label ? -64 : -44 }];
      },
    };
  },
};
