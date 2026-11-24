// 300 mm silicon wafer on a chuck. An iridescent grid of dies slowly rotates
// while a lithography scanner bar sweeps a glowing exposure beam across it.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, roundedBox, mesh, canvasTex, col, setGlow } from '../core/kit.js';
import { clamp, ease, hash1, smoothstep } from '../core/util.js';

const R = 3, TOP = 0.79; // wafer radius, wafer top height

function dieLayout(n) {
  const pitch = (2 * R * 0.985) / n, list = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = (i - (n - 1) / 2) * pitch, z = (j - (n - 1) / 2) * pitch;
    const far = Math.hypot(Math.abs(x) + pitch / 2, Math.abs(z) + pitch / 2);
    if (far < R * 0.975) list.push({ i, j, x, z });
  }
  return { pitch, list };
}

export default {
  name: 'wafer',
  description: 'A 300 mm silicon wafer on a vacuum chuck: iridescent grid of chip dies, slowly rotating, with a lithography scanner bar sweeping a glowing exposure beam across the surface. One die can be highlighted (e.g. "each of these becomes one chip").',
  params: {
    dies: 'Dies per row across the wafer diameter (8-40, default 18)',
    scan: 'true|false — lithography scan beam sweeping across (default true). Tweens when a continued shot changes it.',
    highlightDie: 'true (a die near the centre) or [col,row] — outlines one die with a glowing frame. Omit for none.',
    spin: 'Wafer rotation speed in rad/s (default 0.05)',
    cues: '{ scan: seconds, highlight: seconds } — when the beam starts sweeping / when the die highlight switches on',
  },
  sample: { dies: 18, scan: true, highlightDie: true },
  framings: (p) => {
    const n = clamp(Math.round(p.dies ?? 18), 8, 40);
    const pitch = (2 * R * 0.985) / n;
    const hd = Array.isArray(p.highlightDie) ? p.highlightDie : [Math.floor(n / 2), Math.floor(n / 2)];
    const dx = (hd[0] - (n - 1) / 2) * pitch, dz = (hd[1] - (n - 1) / 2) * pitch;
    return {
      hero: { pos: [5.4, 5.0, 7.0], target: [0, 0.85, 0], fov: 32 },
      wide: { pos: [8.8, 6.4, 11.2], target: [0, 0.9, 0], fov: 34 },
      close: { pos: [2.9, 1.75, 3.5], target: [0.1, 0.8, 0], fov: 30 },
      top: { pos: [0.3, 12.2, 1.8], target: [0, 0.8, 0], fov: 32 },
      low: { pos: [6.6, 1.45, 7.6], target: [0, 1.15, 0], fov: 30 },
      beam: { pos: [-1.6, 2.3, 6.0], target: [0, 1.0, 0], fov: 30 },
      die: { pos: [dx + 1.25, TOP + 1.25, dz + 1.7], target: [dx, TOP, dz], fov: 28 },
    };
  },
  defaultCamera: { from: 'wide', to: 'hero', orbit: 20 },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const base = createBase(ctx, { fog: 0.024, shadowSize: 10, glow: 0.1, rim: 0.2, rim2: 0.2, horizon: 0.6, env: 0.8 });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.5, grid: 0.08, gridScale: 2 });
    const dust = addDust(ctx, scene, { count: 300, extent: [14, 7, 14] });
    const n = clamp(Math.round(p.dies ?? 18), 8, 40);
    const { pitch, list } = dieLayout(n);

    /* ---- stage, rails, chuck ---- */
    mesh(roundedBox(10.4, 0.4, 10.4, 0.5, 0.03), M.dark('#0b0e13', 0.55), { pos: [0, 0.2, 0], parent: scene });
    const edgeMat = M.glow(theme.accent, 1.1);
    for (const s of [-1, 1]) {
      mesh(new THREE.BoxGeometry(9.4, 0.02, 0.03), edgeMat, { pos: [0, 0.405, s * 4.9], parent: scene, shadow: false });
      mesh(new THREE.BoxGeometry(9.6, 0.1, 0.3), M.brushed('#6d7682'), { pos: [0, 0.45, s * 4.1], parent: scene });
    }
    const chuckTex = canvasTex(1024, 1024, (g, w) => {
      g.fillStyle = '#15191f'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#2c333d'; g.lineWidth = 3;
      for (let r = 40; r < w / 2; r += 34) { g.beginPath(); g.arc(w / 2, w / 2, r, 0, 7); g.stroke(); }
      g.strokeStyle = '#3d4652'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, 7); g.stroke();
    });
    mesh(new THREE.CylinderGeometry(R + 0.3, R + 0.42, 0.34, 96), M.dark('#12161c', 0.5), { pos: [0, 0.57, 0], parent: scene });
    mesh(new THREE.CircleGeometry(R + 0.3, 96), new THREE.MeshStandardMaterial({ map: chuckTex, metalness: 0.6, roughness: 0.5 }), { pos: [0, 0.742, 0], rot: [-Math.PI / 2, 0, 0], parent: scene, shadow: false });
    mesh(new THREE.TorusGeometry(R + 0.36, 0.02, 8, 128), edgeMat, { pos: [0, 0.44, 0], rot: [Math.PI / 2, 0, 0], parent: scene, shadow: false });

    /* ---- wafer ---- */
    const wafer = new THREE.Group(); wafer.position.y = TOP - 0.03; scene.add(wafer);
    const S = 2048, toPx = (v) => (v / (2 * R) + 0.5) * S;
    const drawDies = (g, fn) => { for (const d of list) fn(g, toPx(d.x - pitch / 2), toPx(d.z - pitch / 2), (pitch / (2 * R)) * S, d); };
    const dieTex = canvasTex(S, S, (g) => {
      g.fillStyle = '#4a5064'; g.fillRect(0, 0, S, S);
      drawDies(g, (g2, x, y, s, d) => {
        const h = hash1(d.i * 97 + d.j * 13), m = s * 0.045;
        const v = Math.round(118 + h * 40);
        g2.fillStyle = `rgb(${v - 14},${v - 6},${v + 18})`; g2.fillRect(x + m, y + m, s - 2 * m, s - 2 * m);
        // floorplan blocks inside each die
        g2.fillStyle = `rgba(20,24,40,0.55)`;
        g2.fillRect(x + s * 0.12, y + s * 0.12, s * 0.34, s * 0.3);
        g2.fillRect(x + s * 0.54, y + s * 0.12, s * 0.34, s * 0.5);
        g2.fillRect(x + s * 0.12, y + s * 0.5, s * 0.34, s * 0.38);
        g2.fillStyle = `rgba(230,236,255,0.35)`;
        g2.fillRect(x + s * 0.54, y + s * 0.7, s * 0.34, s * 0.18);
        for (let k = 0; k < 4; k++) g2.fillRect(x + s * 0.15, y + s * (0.16 + k * 0.06), s * 0.28, s * 0.02);
      });
      g.globalCompositeOperation = 'destination-in';
      g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 1, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
    });
    const thickTex = canvasTex(512, 512, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#404040'); gr.addColorStop(1, '#c0c0c0'); g.fillStyle = gr; g.fillRect(0, 0, w, w);
      const k = w / S;
      drawDies(g, (g2, x, y, s, d) => { const v = Math.round(40 + 200 * hash1(d.i * 31 + d.j * 57 + 3)); g2.fillStyle = `rgba(${v},${v},${v},0.55)`; g2.fillRect(x * k, y * k, s * k, s * k); });
    }, { srgb: false });
    const patTex = canvasTex(1024, 1024, (g, w) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
      const k = w / S;
      drawDies(g, (g2, x, y, s) => {
        x *= k; y *= k; s *= k;
        g2.strokeStyle = 'rgba(255,255,255,0.9)'; g2.lineWidth = Math.max(1, s * 0.035); g2.strokeRect(x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88);
        g2.fillStyle = 'rgba(255,255,255,0.3)'; g2.fillRect(x + s * 0.12, y + s * 0.12, s * 0.34, s * 0.3); g2.fillRect(x + s * 0.54, y + s * 0.12, s * 0.34, s * 0.5); g2.fillRect(x + s * 0.12, y + s * 0.5, s * 0.34, s * 0.38);
      });
    }, { srgb: false });
    mesh(new THREE.CylinderGeometry(R, R, 0.03, 128), M.metal('#7c828e', 0.3), { parent: wafer });
    const waferMat = new THREE.MeshPhysicalMaterial({
      map: dieTex, metalness: 1, roughness: 0.3, iridescence: 1, iridescenceIOR: 1.7,
      iridescenceThicknessMinimum: 180, iridescenceThicknessMaximum: 620, iridescenceThicknessMap: thickTex,
    });
    const surf = mesh(new THREE.CircleGeometry(R - 0.004, 128), waferMat, { pos: [0, 0.0155, 0], rot: [-Math.PI / 2, 0, 0], parent: wafer });
    surf.castShadow = false;
    // notch
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), M.dark('#12161c', 0.5), { pos: [0, 0, R], parent: wafer, shadow: false });

    // exposure glow that follows the beam (world-space band, die pattern)
    const expoMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { tPat: { value: patTex }, uBeamX: { value: -9 }, uOn: { value: 0 }, uColor: { value: col(theme.accent) }, uColor2: { value: col(theme.accent2) }, uIdle: { value: 0.0 }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform sampler2D tPat; uniform float uBeamX, uOn, uIdle, uTime; uniform vec3 uColor, uColor2; varying vec2 vUv; varying vec3 vW;
        void main(){
          float pat = texture2D(tPat, vUv).r;
          float dx = abs(vW.x - uBeamX);
          float band = exp(-dx * 1.9) * 0.75 + exp(-dx * 30.0) * 1.7;
          float wave = 0.5 + 0.5 * sin(length(vW.xz) * 3.0 - uTime * 1.3);
          vec3 c = mix(uColor, uColor2, clamp(dx * 0.6, 0.0, 1.0)) * pat * band * uOn;
          c += uColor * pat * uIdle * (0.25 + 0.75 * wave * wave);
          c += uColor * exp(-dx * 55.0) * 1.3 * uOn;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const expo = mesh(new THREE.CircleGeometry(R - 0.01, 96), expoMat, { pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0], parent: wafer, shadow: false });
    expo.renderOrder = 2;

    /* ---- highlighted die ---- */
    const hd = p.highlightDie ? (Array.isArray(p.highlightDie) ? p.highlightDie : [Math.floor(n / 2), Math.floor(n / 2)]) : null;
    const hiMat = M.glow(theme.warm, 0.001);
    const hiFill = new THREE.MeshBasicMaterial({ color: col(theme.warm), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const hiGroup = new THREE.Group();
    const hiLocal = new THREE.Vector3((((hd ? hd[0] : n / 2) - (n - 1) / 2) * pitch), 0.03, (((hd ? hd[1] : n / 2) - (n - 1) / 2) * pitch));
    if (hd) {
      hiGroup.position.copy(hiLocal); wafer.add(hiGroup);
      const w = pitch * 0.98, th = Math.max(0.012, pitch * 0.045);
      for (const s of [-1, 1]) {
        mesh(new THREE.BoxGeometry(w + th, 0.012, th), hiMat, { pos: [0, 0, s * w / 2], parent: hiGroup, shadow: false });
        mesh(new THREE.BoxGeometry(th, 0.012, w + th), hiMat, { pos: [s * w / 2, 0, 0], parent: hiGroup, shadow: false });
      }
      mesh(new THREE.PlaneGeometry(w, w), hiFill, { pos: [0, -0.004, 0], rot: [-Math.PI / 2, 0, 0], parent: hiGroup, shadow: false }).renderOrder = 3;
    }

    /* ---- scanner gantry ---- */
    const gantry = new THREE.Group(); scene.add(gantry);
    const GY = TOP + 1.55;
    mesh(roundedBox(0.4, 0.3, 8.5, 0.07, 0.02), M.dark('#161b22', 0.5), { pos: [0, GY, 0], parent: gantry });
    mesh(new THREE.BoxGeometry(0.43, 0.04, 8.5), new THREE.MeshStandardMaterial({ color: col('#5d6672'), metalness: 0.8, roughness: 0.55 }), { pos: [0, GY + 0.17, 0], parent: gantry, shadow: false });
    for (const s of [-1, 1]) {
      mesh(roundedBox(0.42, GY - 0.5, 0.42, 0.06, 0.02), M.dark('#12161c', 0.5), { pos: [0, (GY + 0.5) / 2, s * 4.1], parent: gantry });
      mesh(new THREE.BoxGeometry(0.03, GY - 0.9, 0.03), edgeMat, { pos: [0.22, (GY + 0.5) / 2, s * 4.1], parent: gantry, shadow: false });
    }
    const slitMat = M.glow(theme.accent, 0.01);
    mesh(new THREE.BoxGeometry(0.07, 0.03, 6.4), slitMat, { pos: [0, GY - 0.165, 0], parent: gantry, shadow: false });
    const curtainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: col(theme.accent) }, uOn: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOn, uTime; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          float streak = 0.75 + 0.25 * sin(vUv.x * 240.0 + sin(vUv.x * 37.0) * 4.0);
          float fall = 0.18 + 0.5 * pow(1.0 - vUv.y, 2.0) + 0.3 * pow(vUv.y, 6.0);
          gl_FragColor = vec4(uColor * edge * streak * fall * uOn * 0.55, 1.0);
        }`,
    });
    const curtain = mesh(new THREE.PlaneGeometry(1, GY - 0.18 - TOP), curtainMat, { pos: [0, (GY - 0.18 + TOP) / 2, 0], rot: [0, Math.PI / 2, 0], parent: gantry, shadow: false });
    curtain.renderOrder = 4;
    const beamLight = new THREE.PointLight(col(theme.accent), 0, 6, 1.8);
    beamLight.position.set(0, TOP + 0.5, 0); gantry.add(beamLight);

    const anchors = { wafer: new THREE.Vector3(2.0, TOP, 1.5), beam: new THREE.Vector3(), die: new THREE.Vector3(), chuck: new THREE.Vector3(-2.9, 0.6, 1.9), notch: new THREE.Vector3(), scanner: new THREE.Vector3() };
    const A = R + 0.55, PERIOD = 9;

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        const intro = ease.outCubic(clamp(t / 1.6));
        const spin = f.params.spin ?? 0.05;
        wafer.rotation.y = 0.35 + t * spin;
        // scan beam: parked at -A, then sweeps back and forth
        const scanAmt = clamp(f.tw('scan', 1, 0.2, 1.0));
        const start = f.params.cues?.scan != null && !f.prevParams ? f.params.cues.scan : 0.9;
        const ts = Math.max(0, t - start);
        const u = (ts / PERIOD) % 1;
        const k = u < 0.5 ? u * 2 : 2 - u * 2;
        const bx = -A + 2 * A * (0.5 - 0.5 * Math.cos(Math.PI * k));
        gantry.position.x = bx;
        const chord = Math.sqrt(Math.max(0, R * R - bx * bx));
        const on = scanAmt * smoothstep(0, 0.6, ts) * smoothstep(0, 0.35, chord / R);
        curtain.scale.x = Math.max(0.001, chord * 2);
        curtainMat.uniforms.uOn.value = on; curtainMat.uniforms.uTime.value = t;
        setGlow(slitMat, 0.3 + 2.4 * on);
        beamLight.intensity = 0.7 * on;
        expoMat.uniforms.uBeamX.value = bx; expoMat.uniforms.uOn.value = on; expoMat.uniforms.uTime.value = t;
        expoMat.uniforms.uIdle.value = 0.1 * intro + 0.12 * (1 - scanAmt);
        setGlow(edgeMat, 1.1 * intro);
        // highlight
        let hi = 0;
        if (hd) {
          const at = f.params.cues?.highlight;
          hi = at != null ? ease.outCubic(clamp((f.shotT - at) / 0.6)) : ease.outCubic(clamp((t - 1.3) / 0.6));
          if (f.prevParams && f.prevParams.highlightDie && at == null) hi = 1;
          setGlow(hiMat, Math.max(0.001, hi * (2.0 + 0.4 * Math.sin(t * 3.2))));
          hiFill.opacity = hi * (0.22 + 0.08 * Math.sin(t * 3.2));
          hiGroup.visible = hi > 0.01;
        }
        wafer.updateMatrixWorld(true);
        anchors.die.copy(hiLocal).applyMatrix4(wafer.matrixWorld);
        anchors.notch.set(0, 0.02, R).applyMatrix4(wafer.matrixWorld);
        anchors.beam.set(bx, TOP + 0.05, clamp(chord * 0.5, 0, 1.6));
        anchors.scanner.set(bx, GY + 0.18, 2.6);
      },
    };
  },
};
