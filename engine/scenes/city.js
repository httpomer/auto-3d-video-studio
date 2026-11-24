// Financial district at night: procedural instanced skyscrapers with lit windows,
// wet reflective streets, traffic light trails and haze. Towers can rise from the
// ground (growth metaphor) and one accent-lit hero tower can mark the market leader.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, ease, lerp, rng } from '../core/util.js';

const CELL = 3.0, G = 7; // lots from -G..G
const heroH = (p) => (p.hero ? clamp(Number(p.hero.height) || 18, 8, 26) : 0);

function buildingMaterial(theme, o = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: col(o.color ?? '#0a0e16'), metalness: 0.55, roughness: 0.34 });
  const U = {
    uWarm: { value: col(o.warm ?? '#ffcf8f') }, uCool: { value: col(o.cool ?? '#bfe3ff') }, uEdge: { value: col(o.edge ?? theme.accent) },
    uLit: { value: o.lit ?? 0.4 }, uIntensity: { value: o.intensity ?? 1.05 },
  };
  mat.userData.U = U;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aDim; attribute float aSeed; varying vec2 vWin; varying vec2 vRawUv; varying float vRoof; flat out float vSeed;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 wuv = abs(normal.x) > 0.5 ? vec2(uv.x * aDim.z, uv.y * aDim.y) : vec2(uv.x * aDim.x, uv.y * aDim.y);
        vWin = wuv / vec2(0.17, 0.215); vRawUv = uv; vRoof = step(0.5, abs(normal.y)); vSeed = floor(aSeed * 4096.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vWin; varying vec2 vRawUv; varying float vRoof; flat in float vSeed;
        uniform vec3 uWarm, uCool, uEdge; uniform float uLit, uIntensity;
        float whash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.92, vRoof);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.05, vRoof);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec2 cell = floor(vWin), fr = fract(vWin);
          float h1 = whash(cell + vec2(vSeed, vSeed * 0.37)), h2 = whash(cell * 1.7 + vec2(vSeed * 0.61 + 5.0, vSeed));
          float rowLit = step(0.88, whash(vec2(cell.y, vSeed)));
          float lit = max(step(1.0 - uLit, h1), rowLit * step(0.25, h1));
          float mask = smoothstep(0.12, 0.22, fr.x) * smoothstep(0.88, 0.78, fr.x) * smoothstep(0.24, 0.34, fr.y) * smoothstep(0.86, 0.76, fr.y);
          vec3 wc = mix(uWarm, uCool, step(0.6, h2)) * (0.3 + 0.8 * h2);
          float fw = max(max(fwidth(vWin).x, fwidth(vWin).y), 1e-4);
          float detail = 1.0 - smoothstep(0.4, 1.0, fw);
          vec3 avg = mix(uWarm, uCool, 0.4) * (uLit + 0.08) * 0.2;
          vec3 win = mix(avg, wc * lit * mask, detail) * (1.0 - vRoof);
          float e = max(abs(vRawUv.x - 0.5), abs(vRawUv.y - 0.5));
          vec3 roof = uEdge * smoothstep(0.465, 0.485, e) * 0.16 * vRoof;
          totalEmissiveRadiance += (win + roof) * uIntensity;
        }`);
  };
  mat.customProgramCacheKey = () => 'cityBuilding';
  return mat;
}

function plan(p) {
  const r = rng((p.seed ?? 3) * 9973 + 7);
  const density = clamp(p.density ?? 0.85, 0.2, 1);
  const hH = heroH(p);
  const list = [];
  for (let ix = -G; ix <= G; ix++) for (let iz = -G; iz <= G; iz++) {
    const a = r(), b = r(), c = r(), d = r(), e = r();
    if (hH && ix === 0 && iz === 0) continue;
    if (a > density) continue;
    const dist = Math.hypot(ix, iz) / G;
    let h = lerp(11.5, 2.0, Math.pow(clamp(dist), 0.75)) * (0.4 + 0.95 * b);
    if (c > 0.93) h *= 1.35;
    if (hH) h = Math.min(h, hH * 0.72);
    h = Math.max(h, 1.2);
    const w = lerp(1.35, 2.15, d), dd = lerp(1.35, 2.15, e);
    const x = ix * CELL, z = iz * CELL, delay = clamp(0.12 + dist * 0.5 + r() * 0.3, 0, 1);
    const seed = r();
    list.push({ x, z, w, h, d: dd, y0: 0, seed, delay, main: true, total: h });
    if (h > 5.5 && r() > 0.35) { const h2 = h * lerp(0.18, 0.4, r()); list.push({ x, z, w: w * 0.68, h: h2, d: dd * 0.68, y0: h, seed: seed + 0.37, delay, total: h + h2 }); list[list.length - 2].total = h + h2; }
  }
  // distant skyline ring
  for (let i = 0; i < 190; i++) {
    const a = r() * Math.PI * 2, rad = lerp(27, 82, Math.pow(r(), 0.8));
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (z > 18 && Math.abs(x) < 28) continue; // keep the camera side clear
    list.push({ x, z, w: lerp(1.6, 3.6, r()), h: lerp(1.5, 9.5, Math.pow(r(), 1.6)), d: lerp(1.6, 3.6, r()), y0: 0, seed: r(), delay: clamp(0.55 + r() * 0.45, 0, 1), far: true, total: 0 });
  }
  return list;
}

export default {
  name: 'city',
  description: 'Financial-district skyline at night: glass skyscrapers with lit windows, wet reflective streets, traffic light trails and haze. `growth` makes the towers rise out of the ground (economy / company growth metaphor); an optional accent-lit `hero` tower with a label stands for the market leader; `tickers` float labels over other towers.',
  params: {
    seed: 'Layout seed (same seed → same city)',
    density: '0.2..1 share of lots that hold a tower (default 0.85)',
    growth: '0..1 how far the towers have risen (default 1 = fully built). Tweens between continued shots.',
    growthFrom: 'Starting growth for the first shot, e.g. 0 to watch the city rise',
    hero: '{ label, sub?, height? } accent-lit tallest tower at the centre with a HUD label (height in scene units, default 18; other towers reach ~12)',
    tickers: '[{label, value?}] up to 6 floating labels over other tall towers (e.g. competitors / tickers)',
    cues: '{ grow: seconds when the growth tween starts (default 0.4) } — shot-local',
  },
  sample: { seed: 3, growthFrom: 0, growth: 1, hero: { label: 'NVIDIA', sub: '$4.4T market cap' }, tickers: [{ label: 'MSFT', value: '$3.9T' }, { label: 'AAPL', value: '$3.6T' }, { label: 'GOOGL', value: '$2.5T' }] },
  framings: (p) => {
    const hh = heroH(p) || 11;
    return {
      wide: { pos: [30, 13, 36], target: [0, hh * 0.36, 0], fov: 36 },
      aerial: { pos: [16, 42, 40], target: [0, 2, 3], fov: 34 },
      street: { pos: [1.5, 0.7, 14.5], target: [0.3, hh * 0.52, 0], fov: 40 },
      hero: { pos: [18, hh * 0.4, 31], target: [0, hh * 0.7, 0], fov: 38 },
      flyover_start: { pos: [-36, 18, 34], target: [-6, 5, 2], fov: 36 },
      flyover_end: { pos: [15, 13.5, 34], target: [1.5, hh * 0.5, -3], fov: 36 },
      skyline: { pos: [4, 2.6, 60], target: [0, hh * 0.5 + 1, 0], fov: 28 },
      top: { pos: [0.6, 72, 7], target: [0, 0, 0.5], fov: 36 },
    };
  },
  defaultCamera: { from: 'wide', to: 'hero', orbit: 14 },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const base = createBase(ctx, { fog: 0.011, shadowSize: 34, glow: 0.012, glowDir: [0, 0.02, -1], key: 0.55, keyPos: [-14, 22, 10], fill: 0.3, rim: 0.35, rim2: 0.2, env: 0.5 });
    const { scene } = base;
    const floor = addFloor(ctx, base, { reflect: 0.8, blur: 0.004, color: '#04060a', shadowOpacity: 0.35 });
    floor.material.uniforms.uFogColor.value.copy(base.fogColor).lerp(col(theme.accent), 0.012);
    const dust = addDust(ctx, scene, { count: 260, extent: [30, 16, 30], size: 30, alpha: 0.35 });

    const list = plan(p);
    const hH = heroH(p);
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const N = list.length;
    const aDim = new Float32Array(N * 3), aSeed = new Float32Array(N);
    list.forEach((b, i) => { aDim.set([b.w, b.h, b.d], i * 3); aSeed[i] = b.seed; });
    geo.setAttribute('aDim', new THREE.InstancedBufferAttribute(aDim, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
    const bmat = buildingMaterial(theme);
    const towers = new THREE.InstancedMesh(geo, bmat, N);
    towers.castShadow = true; towers.receiveShadow = true; towers.frustumCulled = false; scene.add(towers);

    // rooftop beacons on the tall ones
    const tall = list.filter((b) => !b.far && b.main && b.total > 7.5);
    const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), Math.max(tall.length, 1));
    beacons.count = tall.length; beacons.frustumCulled = false; scene.add(beacons);
    const cBeacon = col(theme.danger), tmpC = new THREE.Color();

    /* ---- hero tower ---- */
    let hero = null;
    if (hH) {
      const g = new THREE.Group(); scene.add(g);
      const tiers = [[2.5, hH * 0.52, 2.5, 0], [1.95, hH * 0.3, 1.95, hH * 0.52], [1.35, hH * 0.18, 1.35, hH * 0.82]];
      const hg = new THREE.BoxGeometry(1, 1, 1); hg.translate(0, 0.5, 0);
      hg.setAttribute('aDim', new THREE.InstancedBufferAttribute(new Float32Array(tiers.flatMap((t) => [t[0], t[1], t[2]])), 3));
      hg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array([0.11, 0.52, 0.83]), 1));
      const accentWin = col(theme.accent).lerp(col('#ffffff'), 0.35);
      const hm = buildingMaterial(theme, { color: '#0b1018', warm: accentWin, cool: col(theme.accent2).lerp(col('#ffffff'), 0.4), lit: 0.7, intensity: 1.1 });
      hm.customProgramCacheKey = () => 'cityBuilding';
      const im = new THREE.InstancedMesh(hg, hm, 3); im.castShadow = true; im.frustumCulled = false;
      const dmm = new THREE.Object3D();
      tiers.forEach((t, i) => { dmm.position.set(0, t[3], 0); dmm.scale.set(t[0], t[1], t[2]); dmm.updateMatrix(); im.setMatrixAt(i, dmm.matrix); });
      g.add(im);
      const strip = M.glow(theme.accent, 2.0);
      tiers.forEach((t) => { for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) mesh(new THREE.BoxGeometry(0.045, t[1], 0.045), strip, { pos: [sx * t[0] / 2, t[3] + t[1] / 2, sz * t[2] / 2], parent: g, shadow: false }); });
      tiers.forEach((t) => mesh(new THREE.BoxGeometry(t[0] + 0.06, 0.05, t[2] + 0.06), strip, { pos: [0, t[3] + t[1], 0], parent: g, shadow: false }));
      const spire = mesh(new THREE.CylinderGeometry(0.02, 0.06, 2.6, 8), M.glow(theme.accent, 2.6), { pos: [0, hH + 1.3, 0], parent: g, shadow: false });
      const crown = new THREE.PointLight(col(theme.accent), 0, 26, 1.6); crown.position.set(0, hH + 0.8, 0); g.add(crown);
      const wash = new THREE.PointLight(col(theme.accent), 0, 20, 1.7); wash.position.set(3.5, hH * 0.45, 3.5); g.add(wash);
      hero = { g, strip, crown, wash, spire, total: hH + 2.6, top: new THREE.Vector3(0, hH + 2.9, 0), k: 0 };
    }

    /* ---- street lamps + traffic ---- */
    const L = (2 * G + 1) * CELL, half = L / 2;
    const roads = []; for (let k = -G - 1; k <= G; k++) roads.push((k + 0.5) * CELL);
    const lampsPer = 23, NL = roads.length * 2 * lampsPer;
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), M.glow('#ffc98a', 2.1), NL);
    const dm = new THREE.Object3D();
    let li = 0;
    for (const c of roads) for (let j = 0; j < lampsPer; j++) {
      const s = -half + (j + 0.5) * (L / lampsPer);
      dm.position.set(c + 0.36, 0.42, s); dm.updateMatrix(); lamps.setMatrixAt(li++, dm.matrix);
      dm.position.set(s, 0.42, c - 0.36); dm.updateMatrix(); lamps.setMatrixAt(li++, dm.matrix);
    }
    lamps.frustumCulled = false; scene.add(lamps);
    const rr = rng((p.seed ?? 3) + 101);
    const NC = 240;
    const carGeo = new THREE.BoxGeometry(0.07, 0.035, 0.75);
    const heads = new THREE.InstancedMesh(carGeo, M.glow('#fff1d6', 2.3), NC / 2), tails = new THREE.InstancedMesh(carGeo, M.glow('#ff3b30', 2.3), NC / 2);
    heads.frustumCulled = tails.frustumCulled = false; scene.add(heads, tails);
    const cars = Array.from({ length: NC }, (_, i) => ({ road: roads[rr.int(0, roads.length - 1)], axis: rr() < 0.5 ? 0 : 1, dir: i % 2 ? 1 : -1, speed: rr.range(0.018, 0.04), phase: rr() }));

    /* ---- ticker labels on tall towers that are well spread out ---- */
    const picks = [];
    const cand = list.filter((b) => !b.far && b.main).sort((a, b) => b.total - a.total);
    for (const b of cand) {
      if (picks.length >= Math.min((p.tickers || []).length, 6)) break;
      if (Math.hypot(b.x, b.z) < 5.5) continue;
      if (picks.some((q) => Math.hypot(q.x - b.x, q.z - b.z) < 7.5)) continue;
      picks.push(b);
    }
    const tickers = picks.map((b, i) => ({ b, t: p.tickers[i], pos: new THREE.Vector3(b.x, b.total + 0.7, b.z), k: 0 }));

    const anchors = { hero: hero ? hero.top : new THREE.Vector3(0, 12, 0), center: new THREE.Vector3(0, 0, 0) };
    tickers.forEach((tk, i) => { anchors['ticker' + i] = tk.pos; });
    const gOf = (Gv, delay) => ease.outCubic(clamp((Gv * 1.6 - delay) / 0.6));
    const st = { G: 1 };

    return {
      scene, anchors,
      update(f) {
        const t = f.t, cues = f.params.cues || {};
        dust.update(t);
        const Gv = clamp(f.tw('growth', 1, cues.grow ?? 0.4, Math.max(3, f.dur * 0.72), ease.inOutSine));
        st.G = Gv;
        for (let i = 0; i < N; i++) {
          const b = list[i], g = gOf(Gv, b.delay);
          const top = b.y0 + b.h;
          dm.position.set(b.x, b.y0 - (1 - g) * (top + 0.05), b.z); dm.scale.set(b.w, b.h, b.d); dm.rotation.set(0, 0, 0); dm.updateMatrix();
          towers.setMatrixAt(i, dm.matrix);
          b.g = g;
        }
        towers.instanceMatrix.needsUpdate = true;
        tall.forEach((b, i) => {
          dm.position.set(b.x, b.total * b.g + 0.1 - (1 - b.g) * 0.3, b.z); dm.scale.setScalar(b.g > 0.02 ? 1 : 0.001); dm.updateMatrix(); beacons.setMatrixAt(i, dm.matrix);
          const blink = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.4 + b.seed * 40), 6);
          beacons.setColorAt(i, tmpC.copy(cBeacon).multiplyScalar(3.2 * blink));
        });
        beacons.instanceMatrix.needsUpdate = true; if (beacons.instanceColor) beacons.instanceColor.needsUpdate = true;
        if (hero) {
          const g = ease.inOutCubic(clamp((Gv * 1.6 - 0.45) / 1.0));
          hero.k = g;
          hero.g.position.y = -(1 - g) * (hero.total + 0.1);
          const pulse = 1 + 0.12 * Math.sin(t * 1.4);
          hero.strip.color.copy(hero.strip.userData.baseColor).multiplyScalar(2.0 * pulse);
          hero.crown.intensity = 9 * g * pulse; hero.wash.intensity = 4 * g;
          hero.top.set(0, hero.total * g + 0.4, 0);
        }
        for (const tk of tickers) { tk.k = clamp((tk.b.g - 0.9) * 10); tk.pos.y = tk.b.total * tk.b.g + 0.7; }
        // traffic: head-lights one way, tail-lights the other
        let hi = 0, ti = 0;
        for (let i = 0; i < NC; i++) {
          const c = cars[i];
          const u = (((t * c.speed + c.phase) % 1) + 1) % 1;
          const s = (c.dir > 0 ? u : 1 - u) * L - half, lane = c.road + c.dir * 0.17;
          const fade = Math.min(u, 1 - u) * 14;
          if (c.axis === 0) { dm.position.set(lane, 0.06, s); dm.rotation.set(0, 0, 0); } else { dm.position.set(s, 0.06, lane); dm.rotation.set(0, Math.PI / 2, 0); }
          dm.scale.setScalar(clamp(fade, 0.001, 1)); dm.updateMatrix();
          if (i % 2) heads.setMatrixAt(hi++, dm.matrix); else tails.setMatrixAt(ti++, dm.matrix);
        }
        heads.instanceMatrix.needsUpdate = true; tails.instanceMatrix.needsUpdate = true;
      },
      labels() {
        const out = [];
        if (hero && p.hero.label && hero.k > 0.6) out.push({ pos: hero.top, text: String(p.hero.label), sub: p.hero.sub, size: 40, weight: 700, bg: !p.hero.sub, color: theme.text, alpha: clamp((hero.k - 0.6) * 4), dy: p.hero.sub ? -58 : -30 });
        for (const tk of tickers) if (tk.k > 0.02) out.push({ pos: tk.pos, text: String(tk.t.label) + (tk.t.value != null ? '  ' + tk.t.value : ''), size: 24, weight: 600, font: 'mono', bg: true, color: theme.text, alpha: tk.k, dy: -14 });
        return out;
      },
    };
  },
};
