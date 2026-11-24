// Abstract cinematic environments that sit behind titles, chapter cards,
// quotes and big statistics. Four styles so title moments never look the same.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, hash1, smoothstep, anim, ease } from '../core/util.js';

export default {
  name: 'backdrop',
  description: 'Abstract 3D environment for titles, chapter cards, quotes and big numbers (pair it with title / chapter / stat / quote overlays). Styles: "wave" (flowing field of light points), "galaxy" (slow swirling particle disc with a glowing core), "pillars" (a city of rising light columns), "tunnel" (flying through rings of light — good for hooks and transitions).',
  params: {
    style: '"wave" | "galaxy" | "pillars" | "tunnel" (default "wave")',
    speed: 'Motion speed multiplier (default 1)',
    intensity: '0..1 brightness / energy (default 0.7, tweens between continued shots)',
  },
  sample: { style: 'wave' },
  framings: (p) => {
    const s = p.style || 'wave';
    if (s === 'tunnel') return {
      inside: { pos: [0, 0, 9], target: [0, 0, -20], fov: 40 },
      off_axis: { pos: [1.6, 0.9, 9], target: [-0.6, -0.2, -20], fov: 38 },
      wide: { pos: [0, 0, 14], target: [0, 0, -20], fov: 34 },
      low: { pos: [0, -1.6, 9], target: [0, 0.6, -20], fov: 40 },
      tilt: { pos: [-1.8, 1.2, 10], target: [0.8, -0.4, -20], fov: 36 },
    };
    if (s === 'galaxy') return {
      wide: { pos: [0, 7, 17], target: [0, 0.2, 0], fov: 34 },
      hero: { pos: [9, 4.5, 12], target: [0, 0.3, 0], fov: 32 },
      low: { pos: [0, 1.6, 15], target: [0, 1.2, 0], fov: 34 },
      top: { pos: [0.5, 21, 4], target: [0, 0, 0], fov: 34 },
      close: { pos: [4, 2.2, 6], target: [0, 0.6, 0], fov: 32 },
    };
    if (s === 'pillars') return {
      wide: { pos: [0, 9, 22], target: [0, 1.5, 0], fov: 34 },
      hero: { pos: [13, 6.5, 15], target: [0, 1.6, 0], fov: 32 },
      low: { pos: [3, 1.4, 17], target: [0, 3.2, 0], fov: 36 },
      top: { pos: [1, 26, 7], target: [0, 0, 0], fov: 34 },
      close: { pos: [6, 3.6, 8], target: [0, 2.2, -2], fov: 32 },
    };
    return {
      wide: { pos: [0, 5.2, 17], target: [0, 0.4, 0], fov: 34 },
      low: { pos: [0, 1.5, 13], target: [0, 1.3, 0], fov: 36 },
      hero: { pos: [10, 4.2, 12], target: [0, 0.2, 0], fov: 32 },
      top: { pos: [0.5, 20, 6], target: [0, 0, 0], fov: 34 },
      side: { pos: [16, 2.6, 2], target: [0, 0.6, 0], fov: 32 },
    };
  },
  defaultCamera: { from: 'wide', to: 'wide', orbit: 14, push: 0.08 },
  look: { bloom: 0.5, bloomThreshold: 1.0 },

  build(ctx, p) {
    const { theme } = ctx;
    const style = p.style || 'wave';
    const speed = p.speed ?? 1;
    const base = createBase(ctx, { fog: style === 'tunnel' ? 0.03 : 0.024, glow: 0.035, shadows: false });
    const { scene } = base;
    const cA = col(theme.accent), cB = col(theme.accent2);
    let upd = () => {};

    if (style === 'wave') {
      const NX = 220, NZ = 140, n = NX * NZ;
      const pos = new Float32Array(n * 3);
      let k = 0;
      for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { pos[k++] = (i / (NX - 1) - 0.5) * 70; pos[k++] = 0; pos[k++] = (j / (NZ - 1) - 0.5) * 50 - 6; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uA: { value: cA }, uB: { value: cB }, uI: { value: 0.7 } },
        vertexShader: `
          uniform float uTime; varying float vH; varying float vFade;
          void main(){
            vec3 p = position;
            float h = sin(p.x * 0.22 + uTime * 0.6) * 0.9 + sin(p.z * 0.31 - uTime * 0.45 + p.x * 0.07) * 0.8 + sin((p.x + p.z) * 0.11 + uTime * 0.25) * 1.3;
            p.y = h * 0.55;
            vH = h;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (30.0 + 26.0 * smoothstep(0.5, 2.6, h)) / max(-mv.z, 1.0);
            vFade = smoothstep(62.0, 18.0, -mv.z) * smoothstep(1.0, 4.0, -mv.z);
          }`,
        fragmentShader: `
          uniform vec3 uA, uB; uniform float uI; varying float vH; varying float vFade;
          void main(){
            float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d);
            float k = smoothstep(-2.0, 2.6, vH);
            vec3 c = mix(uA * 0.35, uB, k * k) * (0.5 + 2.4 * k * k);
            gl_FragColor = vec4(c * a * vFade * uI, 1.0);
          }`,
      });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
      upd = (t, I) => { m.uniforms.uTime.value = t * speed; m.uniforms.uI.value = 0.35 + I * 0.9; };
    }

    if (style === 'galaxy') {
      const n = 20000, pos = new Float32Array(n * 3), seed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const r = 0.8 + Math.pow(hash1(i * 3 + 1), 0.7) * 13;
        pos[i * 3] = r; pos[i * 3 + 1] = (hash1(i * 3 + 2) - 0.5) * (0.25 + 1.6 / (1 + r * 0.5)); pos[i * 3 + 2] = hash1(i * 3 + 3) * 6.2831;
        seed[i] = hash1(i * 7 + 11);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uA: { value: cA }, uB: { value: cB }, uI: { value: 0.7 } },
        vertexShader: `
          attribute float aSeed; uniform float uTime; varying float vR; varying float vS; varying float vFade;
          void main(){
            float r = position.x; float arm = floor(aSeed * 3.0) * 2.0944;
            float a = position.z * 0.22 + arm + r * 0.42 + uTime * (0.9 / (0.6 + r * 0.35));
            vec3 p = vec3(cos(a) * r, position.y + 0.9, sin(a) * r);
            vR = r; vS = aSeed;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (14.0 + 40.0 * aSeed * aSeed) / max(-mv.z, 1.0);
            vFade = smoothstep(1.0, 4.0, -mv.z);
          }`,
        fragmentShader: `
          uniform vec3 uA, uB; uniform float uI; varying float vR; varying float vS; varying float vFade;
          void main(){
            float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
            vec3 c = mix(uB, uA, smoothstep(1.0, 9.0, vR)) * (0.5 + 1.6 * vS) * smoothstep(14.5, 6.0, vR);
            gl_FragColor = vec4(c * a * a * vFade * uI, 1.0);
          }`,
      });
      const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
      const core = mesh(new THREE.SphereGeometry(0.32, 32, 24), M.glow(theme.accent2, 1.6), { pos: [0, 0.9, 0], parent: scene, shadow: false });
      
      upd = (t, I) => { m.uniforms.uTime.value = t * speed; m.uniforms.uI.value = 0.3 + I * 0.8; core.scale.setScalar(1 + 0.06 * Math.sin(t * 1.4)); };
    }

    if (style === 'pillars') {
      addFloor(ctx, base, { reflect: 0.6, grid: 0.1, gridScale: 1.2, shadow: false });
      const N = 34, sp = 1.2, count = N * N;
      const geo = new THREE.BoxGeometry(0.62, 1, 0.62); geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: col(theme.bg1).lerp(col('#5b6b82'), 0.45), roughness: 0.5, metalness: 0.25 });
      scene.environmentIntensity = 0.9;
      const pl = new THREE.PointLight(cA, 60, 40, 1.5); pl.position.set(0, 9, -2); scene.add(pl);
      const inst = new THREE.InstancedMesh(geo, mat, count);
      const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.05, 0.62), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), count);
      scene.add(caps);
      const dm = new THREE.Object3D(), tmp = new THREE.Color();
      const info = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) info.push([(i - N / 2 + 0.5) * sp, (j - N / 2 + 0.5) * sp - 4, hash1(i * 131 + j * 17), hash1(i * 71 + j * 313 + 5)]);
      scene.add(inst);
      upd = (t, I) => {
        const tt = t * speed;
        for (let k = 0; k < count; k++) {
          const [x, z, h1, h2] = info[k];
          const dist = Math.hypot(x, z + 4);
          const w = Math.sin(dist * 0.42 - tt * 0.9 + h1 * 1.4) * 0.5 + 0.5;
          const rise = anim(t, h2 * 1.2, 1.6, ease.outCubic);
          const clear = smoothstep(2.2, 6.5, dist); // keep the centre low so titles stay readable
          const h = (0.15 + (0.5 + 3.8 * h1 * h1) * (0.45 + 0.55 * w) * (0.25 + 0.75 * clear)) * rise;
          dm.position.set(x, 0, z); dm.scale.set(1, Math.max(h, 0.02), 1); dm.updateMatrix(); inst.setMatrixAt(k, dm.matrix);
          dm.position.set(x, Math.max(h, 0.02) + 0.025, z); dm.scale.set(1, 1, 1); dm.updateMatrix(); caps.setMatrixAt(k, dm.matrix);
          tmp.copy(h2 > 0.8 ? cB : cA).multiplyScalar((0.12 + 1.5 * w * w * w) * (0.35 + I));
          caps.setColorAt(k, tmp);
        }
        inst.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true; caps.instanceColor.needsUpdate = true;
      };
    }

    if (style === 'tunnel') {
      const NR = 46, L = 92;
      const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(4.2, 0.022, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NR);
      const NS = 260;
      const sg = new THREE.BoxGeometry(0.02, 0.02, 1);
      const streak = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NS);
      ring.frustumCulled = false; streak.frustumCulled = false; scene.add(ring, streak);
      const dm = new THREE.Object3D(), tmp = new THREE.Color();
      upd = (t, I) => {
        const tt = t * speed;
        for (let i = 0; i < NR; i++) {
          const z = ((i * (L / NR) + tt * 7) % L) - L + 12;
          const k = smoothstep(-L + 12, -L + 40, z) * smoothstep(11, 4, z);
          dm.position.set(Math.sin(z * 0.05 + 1.0) * 0.5, Math.cos(z * 0.04) * 0.35, z);
          dm.rotation.set(0, 0, i * 0.4 + tt * 0.05); dm.scale.setScalar(1 + 0.12 * Math.sin(i * 1.7)); dm.updateMatrix(); ring.setMatrixAt(i, dm.matrix);
          tmp.copy(i % 5 === 0 ? cB : cA).multiplyScalar(k * (i % 5 === 0 ? 1.5 : 0.55) * (0.4 + I));
          ring.setColorAt(i, tmp);
        }
        for (let i = 0; i < NS; i++) {
          const a = hash1(i * 3) * 6.2831, r = 1.2 + hash1(i * 3 + 1) * 2.7, sp2 = 14 + hash1(i * 3 + 2) * 26;
          const z = ((hash1(i * 5 + 9) * L + tt * sp2) % L) - L + 12;
          const k = smoothstep(-L + 12, -L + 44, z) * smoothstep(11, 5, z);
          dm.position.set(Math.cos(a) * r, Math.sin(a) * r, z); dm.rotation.set(0, 0, 0); dm.scale.set(1, 1, 1.5 + sp2 * 0.12); dm.updateMatrix(); streak.setMatrixAt(i, dm.matrix);
          tmp.copy(hash1(i * 11) > 0.7 ? cB : cA).multiplyScalar(k * 0.9 * (0.3 + I));
          streak.setColorAt(i, tmp);
        }
        ring.instanceMatrix.needsUpdate = streak.instanceMatrix.needsUpdate = true;
        ring.instanceColor.needsUpdate = streak.instanceColor.needsUpdate = true;
      };
    }

    const dust = style === 'tunnel' ? null : addDust(ctx, scene, { count: 420, extent: [26, 10, 22] });
    return {
      scene, anchors: { center: new THREE.Vector3(0, 1, 0) },
      update(f) { const I = clamp(f.tw('intensity', 0.7, 0.2, 1.5)); upd(f.t, I); dust?.update(f.t); },
    };
  },
};
