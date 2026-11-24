// Abstract "AI brain": a luminous energy core inside gyroscope rings, wrapped
// in a shell of orbiting particles with data streams spiralling inward.
// Designed to double as a calm hero backdrop behind big title text.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col } from '../core/kit.js';
import { clamp, hash1, ease, anim } from '../core/util.js';

const CY = 3.2;

export default {
  name: 'ai_core',
  description: 'Abstract AI "brain" hero: a luminous energy core inside slowly rotating gyroscope rings, a shell of orbiting particles and data streams spiralling inward, above a lit pedestal on the reflective floor. Calm enough to sit behind big title text (use the "left"/"right" framings to leave room for it).',
  params: {
    intensity: '0..1 energy level — core brightness, light and particle glow (default 0.7, tweens between continued shots)',
    rings: 'Number of gyroscope rings, 1–5 (default 3)',
    label: 'Optional short label shown under the core (e.g. a model name)',
    streams: '0..1 amount of inward data streams (default 0.8, tweens)',
  },
  sample: { intensity: 0.8, rings: 3, label: 'FOUNDATION MODEL' },
  framings: {
    wide: { pos: [0, 4.6, 15.5], target: [0, 3.0, 0], fov: 34 },
    hero: { pos: [5.8, 4.4, 9.0], target: [0, 3.1, 0], fov: 32 },
    close: { pos: [2.6, 3.7, 4.6], target: [0, 3.2, 0], fov: 30 },
    low: { pos: [4.6, 0.7, 9.6], target: [0, 3.5, 0], fov: 32 },
    top: { pos: [0.6, 15, 4.5], target: [0, 2.0, 0], fov: 34 },
    orbit_far: { pos: [-12.5, 6.2, 14.5], target: [0, 3.0, 0], fov: 30 },
    right: { pos: [1.6, 4.1, 13.0], target: [-3.6, 3.0, 0], fov: 34 },
    left: { pos: [-1.6, 4.1, 13.0], target: [3.6, 3.0, 0], fov: 34 },
  },
  defaultCamera: { from: 'wide', to: 'hero', orbit: 16 },
  look: { bloom: 0.55, bloomRadius: 0.6 },

  build(ctx, p) {
    const { theme } = ctx;
    const r = ctx.rng(3);
    const base = createBase(ctx, { fog: 0.02, shadowSize: 10, glow: 0.035, glowDir: [0, 0.5, -1], key: 1.4 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.55, grid: 0.08, gridScale: 2.5 });
    const dust = addDust(ctx, scene, { count: 300, extent: [16, 9, 14] });
    const cA = col(theme.accent), cB = col(theme.accent2);

    /* ---- core ---- */
    const coreMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: cA }, uB: { value: cB }, uI: { value: 1 } },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uT, uI; uniform vec3 uA, uB; varying vec3 vP; varying vec3 vN; varying vec3 vV;
        float n3(vec3 p){ return sin(p.x*1.7+sin(p.y*2.3+uT*0.55))*sin(p.y*1.9+sin(p.z*2.1-uT*0.4))*sin(p.z*2.3+sin(p.x*1.5+uT*0.47)); }
        void main(){
          vec3 q = vP * 2.4;
          float n = n3(q) * 0.6 + n3(q * 2.1 + 3.7) * 0.4;
          float veins = pow(1.0 - abs(n), 9.0);
          float cells = smoothstep(-0.2, 0.7, n);
          float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.2);
          vec3 c = uA * (0.05 + 0.2 * cells) + mix(uA, uB, 0.5) * veins * 1.5 + mix(uA, uB, 0.5) * fres * 0.5;
          gl_FragColor = vec4(c * (0.45 + 0.75 * uI), 1.0);
        }`,
    });
    const core = mesh(new THREE.SphereGeometry(1.0, 64, 40), coreMat, { pos: [0, CY, 0], parent: scene, shadow: false });
    const shell = mesh(new THREE.SphereGeometry(1.32, 64, 40), new THREE.MeshPhysicalMaterial({ color: col(theme.accent).lerp(col('#ffffff'), 0.6), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.13, clearcoat: 1, depthWrite: false }), { pos: [0, CY, 0], parent: scene, shadow: false });
    shell.renderOrder = 3;
    const light = new THREE.PointLight(col(theme.accent).lerp(col(theme.accent2), 0.3), 0, 18, 1.6);
    light.position.set(0, CY, 0); scene.add(light);

    /* ---- gyroscope rings ---- */
    const NR = clamp(Math.round(p.rings ?? 3), 1, 5);
    const rings = [];
    for (let i = 0; i < NR; i++) {
      const g = new THREE.Group(); g.position.set(0, CY, 0); scene.add(g);
      const R = 1.95 + i * 0.5;
      mesh(new THREE.TorusGeometry(R, 0.035, 12, 140), M.metal(theme.metal, 0.32), { parent: g });
      const gm = M.glow(i % 2 ? theme.accent2 : theme.accent, 1.5);
      mesh(new THREE.TorusGeometry(R, 0.042, 10, 60, Math.PI * (0.35 + 0.12 * i)), gm, { parent: g, shadow: false, rot: [0, 0, r.range(0, 6.28)] });
      mesh(new THREE.TorusGeometry(R, 0.042, 10, 30, Math.PI * 0.14), gm, { parent: g, shadow: false, rot: [0, 0, r.range(0, 6.28)] });
      // small node riding on the ring
      mesh(new THREE.SphereGeometry(0.085, 16, 12), gm, { parent: g, shadow: false, pos: [R, 0, 0] });
      rings.push({ g, gm, ax: r.range(0, 6.28), ay: r.range(0, 6.28), wx: r.range(0.1, 0.2) * (i % 2 ? -1 : 1), wy: r.range(0.14, 0.26) * (i % 2 ? 1 : -1), R });
    }

    /* ---- pedestal ---- */
    mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.22, 72), M.dark('#0b0f15', 0.5), { pos: [0, 0.11, 0], parent: scene });
    mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.05, 72), M.dark('#121822', 0.62), { pos: [0, 0.235, 0], parent: scene });
    const pedMat = M.glow(theme.accent, 1.3), pedMat2 = M.glow(theme.accent2, 1.1);
    mesh(new THREE.TorusGeometry(2.05, 0.024, 8, 120), pedMat, { pos: [0, 0.23, 0], rot: [Math.PI / 2, 0, 0], parent: scene, shadow: false });
    mesh(new THREE.TorusGeometry(1.2, 0.016, 8, 96), pedMat2, { pos: [0, 0.265, 0], rot: [Math.PI / 2, 0, 0], parent: scene, shadow: false });
    // soft light column from pedestal to core
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uC: { value: cA }, uA: { value: 0.2 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uC; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float a = pow(f, 1.6) * pow(1.0 - vUv.y, 1.5) * uA; gl_FragColor = vec4(uC * a, 1.0); }`,
    });
    const beam = mesh(new THREE.CylinderGeometry(0.55, 1.1, CY - 0.9, 40, 1, true), beamMat, { pos: [0, 0.26 + (CY - 0.9) / 2, 0], parent: scene, shadow: false });
    beam.renderOrder = 4;

    /* ---- orbiting particle shell + inward streams (GPU, stateless) ---- */
    const NPa = 1100, NSt = 1000, NT = NPa + NSt;
    const aAxis = new Float32Array(NT * 3), aData = new Float32Array(NT * 4), pos = new Float32Array(NT * 3);
    const ax = new THREE.Vector3();
    for (let i = 0; i < NT; i++) {
      const stream = i >= NPa;
      if (!stream) {
        ax.set(r.range(-1, 1), r.range(-0.35, 0.35) + 1.0, r.range(-1, 1)).normalize();
        if (r() < 0.35) ax.set(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
        aData.set([r.range(2.2, 3.9), r(), r.range(0.06, 0.22) * (r() < 0.5 ? 1 : 0.7), 0], i * 4);
      } else {
        const arm = Math.floor(r() * 7);
        ax.set(arm, r.range(-1, 1), r.range(-1, 1));
        aData.set([r.range(0.9, 1.1), r(), r.range(0.05, 0.09), 1], i * 4);
      }
      aAxis.set([ax.x, ax.y, ax.z], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aAxis', new THREE.BufferAttribute(aAxis, 3));
    pg.setAttribute('aData', new THREE.BufferAttribute(aData, 4));
    const pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uA: { value: cA }, uB: { value: cB }, uCY: { value: CY }, uAlpha: { value: 1 }, uStream: { value: 1 }, uScale: { value: ctx.height / 1080 } },
      vertexShader: `
        attribute vec3 aAxis; attribute vec4 aData; uniform float uT, uCY, uScale, uStream; varying float vA; varying float vMix;
        void main(){
          vec3 p; float size; float a;
          if (aData.w < 0.5) {
            vec3 axis = normalize(aAxis);
            vec3 u = normalize(cross(axis, vec3(0.31, 0.11, 0.94)));
            vec3 w = cross(axis, u);
            float ang = aData.y * 6.2831 + uT * aData.z;
            float R = aData.x * (1.0 + 0.03 * sin(uT * 0.5 + aData.y * 40.0));
            p = vec3(0.0, uCY, 0.0) + (cos(ang) * u + sin(ang) * w) * R;
            size = 46.0 + 60.0 * fract(aData.y * 13.7);
            a = 0.35 + 0.65 * (0.5 + 0.5 * sin(uT * 0.9 + aData.y * 90.0));
            vMix = fract(aData.y * 7.3);
          } else {
            float arm = aAxis.x;
            float s = fract(aData.y + uT * aData.z);
            float R = mix(9.5, 1.25, pow(s, 0.7));
            float ang = arm * 0.8976 + s * 4.2 + aAxis.z * 0.05;
            float y = uCY + (1.0 - s) * (sin(arm * 2.1) * 2.6) + aAxis.y * 0.07 * (1.0 + 2.0 * (1.0 - s));
            p = vec3(cos(ang) * R, y, sin(ang) * R);
            size = 44.0 + 30.0 * s;
            a = smoothstep(0.0, 0.2, s) * smoothstep(1.0, 0.85, s) * step(fract(arm * 0.37 + 0.11), uStream + 0.001) * 0.9;
            vMix = 0.75;
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * uScale / max(-mv.z, 0.6);
          vA = a * smoothstep(0.5, 2.5, -mv.z);
        }`,
      fragmentShader: `uniform vec3 uA, uB; uniform float uAlpha; varying float vA; varying float vMix;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(mix(uA, uB, vMix) * a * a * vA * uAlpha, 1.0); }`,
    });
    const pts = new THREE.Points(pg, pMat); pts.frustumCulled = false; scene.add(pts);

    const anchors = { core: new THREE.Vector3(0, CY, 0), top: new THREE.Vector3(0, CY + 1.35, 0), ring: new THREE.Vector3(1.95, CY, 0), pedestal: new THREE.Vector3(1.6, 0.3, 1.2) };
    const labelPos = new THREE.Vector3(0, 0.95, 2.4);

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        const I = clamp(f.tw('intensity', 0.7, 0.3, 1.6));
        const st = clamp(f.tw('streams', 0.8, 0.3, 1.2));
        const rv = anim(t, 0.1, 1.3, ease.outCubic);
        dust.update(t);
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
        coreMat.uniforms.uT.value = t;
        coreMat.uniforms.uI.value = I * (0.92 + 0.08 * pulse) * rv;
        const cs = Math.max(0.001, ease.outBack(clamp(rv)) * (1 + 0.012 * Math.sin(t * 1.4)));
        core.scale.setScalar(cs); shell.scale.setScalar(cs);
        core.rotation.y = t * 0.12;
        light.intensity = (5 + 16 * I) * rv * (0.94 + 0.06 * pulse);
        rings.forEach((rg, i) => {
          const k = anim(t, 0.25 + i * 0.22, 1.1, ease.outCubic);
          rg.g.scale.setScalar(Math.max(0.001, 0.4 + 0.6 * k));
          rg.g.visible = k > 0.001;
          rg.g.rotation.set(rg.ax + t * rg.wx + (1 - k) * 1.5, rg.ay + t * rg.wy, 0);
          rg.gm.color.copy(rg.gm.userData.baseColor).multiplyScalar((0.7 + 1.0 * I) * k);
        });
        pedMat.color.copy(pedMat.userData.baseColor).multiplyScalar((0.8 + 0.7 * I) * rv);
        pedMat2.color.copy(pedMat2.userData.baseColor).multiplyScalar((0.6 + 0.6 * I) * rv * (0.85 + 0.15 * pulse));
        beamMat.uniforms.uA.value = (0.03 + 0.07 * I) * rv;
        pMat.uniforms.uT.value = t;
        pMat.uniforms.uAlpha.value = (0.35 + 0.6 * I) * anim(t, 0.3, 1.5);
        pMat.uniforms.uStream.value = st;
      },
      labels(f) {
        const text = f.params.label ?? p.label;
        if (!text) return [];
        return [{ pos: labelPos, text: String(text), size: 30, bg: true, color: theme.accent, alpha: anim(f.t, 1.0, 0.8) }];
      },
    };
  },
};
