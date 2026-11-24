// AI data center: long rows of server racks with thousands of blinking status
// LEDs, overhead light strips, cable trays carrying data pulses, glossy floor.
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, canvasTex, col, setGlow } from '../core/kit.js';
import { clamp, hash1, smoothstep, ease } from '../core/util.js';

const RACK_W = 0.62, RACK_D = 1.0, RACK_H = 2.1, ROW_PITCH = 3.2;
const layout = (p) => {
  const rows = clamp(Math.round(p.rows ?? 2), 1, 8), n = clamp(Math.round(p.racksPerRow ?? 16), 4, 40);
  const L = n * RACK_W;
  // always keep an aisle centred on x = 0
  const xs = Array.from({ length: rows }, (_, i) => (i - (rows - 1) / 2) * ROW_PITCH + (rows % 2 ? ROW_PITCH / 2 : 0));
  return { rows, n, L, xs };
};

export default {
  name: 'datacenter',
  description: 'AI data center aisle: long rows of server racks with thousands of blinking status LEDs, overhead light strips, cable trays with travelling data pulses and a glossy reflective floor. Racks power on in a wave at the start; one rack can be highlighted.',
  params: {
    rows: 'Number of rack rows (1-8, default 2; an aisle is always centred on the camera axis)',
    racksPerRow: 'Racks in each row (4-40, default 16)',
    activity: '0..1 how busy the LEDs and data pulses are (default 0.75). Tweens when a continued shot changes it.',
    accentRack: 'Index of a rack to highlight with a glowing frame (row * racksPerRow + position). Omit for none.',
    label: 'Optional HUD label shown above the highlighted rack (or above the aisle if no accentRack)',
    cues: '{ highlight: seconds } — when the accent rack highlight (and label) switches on (default 1.2 s)',
  },
  sample: { rows: 2, racksPerRow: 16, activity: 0.8, accentRack: 5, label: 'GPU CLUSTER' },
  framings: (p) => {
    const { L } = layout(p);
    const h = L / 2;
    return {
      aisle: { pos: [0, 1.45, h + 3.2], target: [0, 1.25, -h], fov: 36 },
      aisle_deep: { pos: [0, 1.45, h - 4.5], target: [0, 1.2, -h - 2], fov: 36 },
      wide: { pos: [h * 0.5 + 4.2, 3.5, h + 3.6], target: [0.3, 1.0, -1.0], fov: 36 },
      rack_close: { pos: [-0.15, 1.5, 1.9], target: [1.15, 1.25, 0.2], fov: 30 },
      top: { pos: [5.5, 11 + h * 0.55, 0.6], target: [0, 0.5, 0], fov: 36 },
      low: { pos: [0.45, 0.32, h + 2.2], target: [0, 1.7, -2], fov: 38 },
      end: { pos: [0, 2.3, -h - 3.5], target: [0, 1.1, h * 0.5], fov: 34 },
    };
  },
  defaultCamera: { from: 'aisle', to: 'aisle_deep', ease: 'drift' },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const r = ctx.rng(3);
    const { rows, n, L, xs } = layout(p);
    const base = createBase(ctx, { fog: 0.03, shadowSize: Math.max(12, L * 0.7), key: 1.5, fill: 0.34, rim: 0.5, glow: 0.04, horizon: 0.5, keyPos: [5, 12, 6] });
    const { scene } = base;
    addFloor(ctx, base, { reflect: 0.62, grid: 0.07, gridScale: 0.62, blur: 0.005 });
    const dust = addDust(ctx, scene, { count: 300, extent: [xs.length * 2 + 4, 3.2, L / 2 + 4], alpha: 0.35 });
    const dm = new THREE.Object3D();
    const NR = rows * n;

    /* ---- rack bodies ---- */
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(RACK_D, RACK_H, RACK_W - 0.03), M.dark('#12161c', 0.6), NR);
    bodies.castShadow = true; bodies.receiveShadow = true;
    const rackPos = [];
    for (let ri = 0; ri < rows; ri++) for (let i = 0; i < n; i++) {
      const x = xs[ri], z = -L / 2 + (i + 0.5) * RACK_W;
      dm.position.set(x, RACK_H / 2 + 0.02, z); dm.rotation.set(0, 0, 0); dm.scale.setScalar(1); dm.updateMatrix();
      bodies.setMatrixAt(ri * n + i, dm.matrix); rackPos.push([x, z]);
    }
    scene.add(bodies);

    /* ---- front / rear faces (server bezels) ---- */
    const UNITS = 20;
    const faceTex = canvasTex(256, 1024, (g, w, h) => {
      g.fillStyle = '#07090c'; g.fillRect(0, 0, w, h);
      const uh = (h - 40) / UNITS;
      for (let u = 0; u < UNITS; u++) {
        const y = 20 + u * uh;
        const gr = g.createLinearGradient(0, y, 0, y + uh);
        gr.addColorStop(0, '#3a424e'); gr.addColorStop(0.5, '#262c35'); gr.addColorStop(1, '#161a20');
        g.fillStyle = gr; g.fillRect(14, y + 2, w - 28, uh - 5);
        g.fillStyle = '#05070a';
        if (hash1(u * 7 + 1) > 0.35) { // vent grille
          for (let vx = 86; vx < w - 30; vx += 9) for (let vy = y + 9; vy < y + uh - 9; vy += 8) g.fillRect(vx, vy, 5, 4);
        } else { // drive bays
          for (let k = 0; k < 6; k++) { g.fillRect(88 + k * 24, y + 7, 20, uh - 17); }
          g.fillStyle = '#4a5462'; for (let k = 0; k < 6; k++) g.fillRect(90 + k * 24, y + 9, 16, 3);
        }
        g.fillStyle = '#566170'; g.fillRect(18, y + uh * 0.3, 5, uh * 0.4); g.fillRect(w - 23, y + uh * 0.3, 5, uh * 0.4);
      }
      g.strokeStyle = '#3a4350'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    });
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, metalness: 0.3, roughness: 0.6 });
    const faces = new THREE.InstancedMesh(new THREE.PlaneGeometry(RACK_W - 0.05, RACK_H - 0.06), faceMat, NR * 2);
    faces.receiveShadow = true;
    let fi = 0;
    for (let k = 0; k < NR; k++) for (const s of [1, -1]) {
      dm.position.set(rackPos[k][0] + s * (RACK_D / 2 + 0.004), RACK_H / 2 + 0.02, rackPos[k][1]);
      dm.rotation.set(0, s * Math.PI / 2, 0); dm.updateMatrix(); faces.setMatrixAt(fi++, dm.matrix);
    }
    scene.add(faces);

    /* ---- LEDs (one instanced draw, flicker computed in the shader) ---- */
    const PER = UNITS * 4, NL = NR * 2 * PER;
    const ledGeo = new THREE.PlaneGeometry(0.026, 0.016);
    const aSeed = new Float32Array(NL), aKind = new Float32Array(NL), aOn = new Float32Array(NL), aRack = new Float32Array(NL);
    const leds = new THREE.InstancedMesh(ledGeo, null, NL);
    let li = 0;
    const uh = (RACK_H - 0.06) * ((1024 - 40) / 1024) / UNITS;
    for (let k = 0; k < NR; k++) for (const s of [1, -1]) {
      const [x, z] = rackPos[k];
      const pos = k % n;
      for (let u = 0; u < UNITS; u++) for (let c = 0; c < 4; c++) {
        const hsh = hash1(li * 13 + 7);
        const ly = 0.02 + 0.03 + (RACK_H - 0.06) * (20 / 1024) + (UNITS - 1 - u + 0.5) * uh + (c > 1 ? -0.022 : 0.022);
        const lz = (-(RACK_W - 0.05) / 2 + 0.085 + (c % 2) * 0.045) * s;
        dm.position.set(x + s * (RACK_D / 2 + 0.008), ly, z - lz);
        dm.rotation.set(0, s * Math.PI / 2, 0); dm.updateMatrix(); leds.setMatrixAt(li, dm.matrix);
        aSeed[li] = hsh; aRack[li] = k;
        const q = hash1(li * 3 + 91);
        aKind[li] = q < 0.6 ? 0 : q < 0.84 ? 1 : q < 0.96 ? 2 : 3;
        aOn[li] = 0.15 + ((n - 1 - pos) / n) * 1.3 + hsh * 0.25; // power-on wave from the near end of the aisle
        li++;
      }
    }
    ledGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
    ledGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(aKind, 1));
    ledGeo.setAttribute('aOn', new THREE.InstancedBufferAttribute(aOn, 1));
    ledGeo.setAttribute('aRack', new THREE.InstancedBufferAttribute(aRack, 1));
    const ledMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uAct: { value: 0.75 }, uFog: { value: base.fogDensity }, uHiRack: { value: -1 }, uHi: { value: 0 },
        uC0: { value: col(theme.accent) }, uC1: { value: col(theme.accent2) }, uC2: { value: col(theme.warm) }, uC3: { value: col(theme.danger) },
      },
      vertexShader: `
        attribute float aSeed, aKind, aOn, aRack;
        uniform float uTime, uAct, uFog, uHiRack, uHi; uniform vec3 uC0, uC1, uC2, uC3; varying vec3 vCol;
        void main(){
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float rate = mix(1.2, 8.0, fract(aSeed * 7.31));
          float ph = floor(uTime * rate + aSeed * 50.0);
          float h = fract(sin(ph * 12.9898 + aSeed * 78.233) * 43758.5453);
          float steady = step(0.8, fract(aSeed * 3.7));
          float on = max(steady, step(1.0 - uAct * 0.82, h));
          float pw = smoothstep(aOn, aOn + 0.3, uTime);
          vec3 c = aKind < 0.5 ? uC0 : aKind < 1.5 ? uC1 : aKind < 2.5 ? uC2 : uC3;
          float hi = uHi * (1.0 - step(0.5, abs(aRack - uHiRack)));
          c = mix(c, uC2, hi); on = max(on, hi * 0.8);
          float d = length(mv.xyz);
          vCol = c * (0.05 + on * (1.7 + hi)) * pw * exp(-uFog * uFog * d * d);
        }`,
      fragmentShader: `varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }`,
    });
    leds.material = ledMat; leds.frustumCulled = false; scene.add(leds);

    /* ---- vertical door light strips ---- */
    const stripMat = M.glow(theme.accent, 1.5);
    const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, RACK_H - 0.16, 0.014), stripMat, NR * 2);
    let si = 0;
    for (let k = 0; k < NR; k++) for (const s of [1, -1]) {
      dm.position.set(rackPos[k][0] + s * (RACK_D / 2 + 0.008), RACK_H / 2 + 0.02, rackPos[k][1] + (RACK_W / 2 - 0.045));
      dm.rotation.set(0, 0, 0); dm.updateMatrix(); strips.setMatrixAt(si++, dm.matrix);
    }
    strips.frustumCulled = false; scene.add(strips);
    // end-cap light bars so the row ends read from outside the aisle
    for (const x of xs) for (const s of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.03, RACK_H - 0.5, 0.012), stripMat, { pos: [x, RACK_H / 2 + 0.02, s * (L / 2 - 0.006)], parent: scene, shadow: false });
      mesh(new THREE.BoxGeometry(RACK_D - 0.2, 0.02, 0.012), stripMat, { pos: [x, RACK_H - 0.2, s * (L / 2 - 0.006)], parent: scene, shadow: false });
    }

    /* ---- cable trays above each row + overhead aisle lights ---- */
    const trayMat = M.dark('#10141a', 0.55);
    const fiberMat = M.glow(theme.accent2, 1.1);
    const rungs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.025, 0.03), trayMat, rows * Math.ceil((L + 2) / 0.4));
    let gi = 0;
    for (const x of xs) {
      for (const dx of [-0.3, 0.3]) mesh(new THREE.BoxGeometry(0.035, 0.09, L + 2), trayMat, { pos: [x + dx, 2.52, 0], parent: scene });
      mesh(new THREE.BoxGeometry(0.03, 0.03, L + 2), fiberMat, { pos: [x - 0.1, 2.53, 0], parent: scene, shadow: false });
      mesh(new THREE.BoxGeometry(0.07, 0.05, L + 2), M.plastic('#161b22', 0.7), { pos: [x + 0.1, 2.53, 0], parent: scene });
      for (let z = -L / 2 - 1; z <= L / 2 + 1 && gi < rungs.count; z += 0.4) { dm.position.set(x, 2.49, z); dm.rotation.set(0, 0, 0); dm.updateMatrix(); rungs.setMatrixAt(gi++, dm.matrix); }
      for (let z = -L / 2; z <= L / 2 + 0.01; z += L / 4) mesh(new THREE.BoxGeometry(0.03, 2.2, 0.03), trayMat, { pos: [x + 0.3, 3.6, z], parent: scene, shadow: false });
    }
    rungs.count = gi; scene.add(rungs);
    // aisles: between rows plus the two outer sides
    const aisleXs = [];
    for (let i = 0; i <= rows; i++) aisleXs.push(xs[0] - ROW_PITCH / 2 + i * ROW_PITCH);
    const lightMat = M.glow(col(theme.accent).lerp(col('#ffffff'), 0.5), 0.95);
    const aisleLights = [];
    for (const ax of aisleXs) {
      mesh(new THREE.BoxGeometry(0.1, 0.035, L + 1.5), lightMat, { pos: [ax, 3.25, 0], parent: scene, shadow: false });
      mesh(new THREE.BoxGeometry(0.2, 0.05, L + 1.5), trayMat, { pos: [ax, 3.29, 0], parent: scene, shadow: false });
    }
    // real light in the centred aisle (keeps the light count low)
    for (const z of [L * 0.3, 0, -L * 0.3]) {
      const pl = new THREE.PointLight(col(theme.accent).lerp(col('#ffffff'), 0.5), 0, 9, 1.7);
      pl.position.set(0, 2.55, z); scene.add(pl); aisleLights.push(pl);
    }

    /* ---- structure: cross beams + one-sided room shell (visible only from inside, so elevated shots get a cutaway) ---- */
    const halfW = Math.max(Math.abs(aisleXs[0]), Math.abs(aisleXs[aisleXs.length - 1])) + 1.6, halfL = L / 2 + 5;
    for (let z = -L / 2; z <= L / 2 + 0.01; z += L / 4) mesh(new THREE.BoxGeometry(halfW * 2, 0.07, 0.07), trayMat, { pos: [0, 3.36, z], parent: scene, shadow: false });
    const shellTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#0d1117'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1b222c'; g.lineWidth = 4;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); }
    }, { repeat: [1, 1] });
    const shell = (w, h, pos, rot, rep) => {
      const tx = shellTex.clone(); tx.needsUpdate = true; tx.repeat.set(...rep);
      const m = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.85, metalness: 0.1 }), { pos, rot, parent: scene, shadow: false });
      m.receiveShadow = false; return m;
    };
    const CEIL = 4.3;
    shell(halfW * 2, halfL * 2, [0, CEIL, 0], [Math.PI / 2, 0, 0], [halfW / 2, halfL / 2]);
    shell(halfW * 2, CEIL, [0, CEIL / 2, -halfL], [0, 0, 0], [halfW / 2, 1.5]);
    shell(halfW * 2, CEIL, [0, CEIL / 2, halfL], [0, Math.PI, 0], [halfW / 2, 1.5]);
    shell(halfL * 2, CEIL, [-halfW, CEIL / 2, 0], [0, Math.PI / 2, 0], [halfL / 2, 1.5]);
    shell(halfL * 2, CEIL, [halfW, CEIL / 2, 0], [0, -Math.PI / 2, 0], [halfL / 2, 1.5]);
    const wallLine = M.glow(theme.accent, 1.4);
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(halfW * 2, 0.04, 0.02), wallLine, { pos: [0, 2.9, s * (halfL - 0.02)], parent: scene, shadow: false });
    // rack tops (vent grilles) so elevated views have detail
    const topTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2a313b'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#4a5563'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12);
      for (const cx of [72, 184]) { g.fillStyle = '#06080b'; g.beginPath(); g.arc(cx, 128, 44, 0, 7); g.fill(); g.strokeStyle = '#5a6675'; g.lineWidth = 3; for (let rr = 12; rr <= 44; rr += 10) { g.beginPath(); g.arc(cx, 128, rr, 0, 7); g.stroke(); } }
    });
    const tops = new THREE.InstancedMesh(new THREE.PlaneGeometry(RACK_D - 0.06, RACK_W - 0.07), new THREE.MeshStandardMaterial({ map: topTex, metalness: 0.4, roughness: 0.6 }), NR);
    for (let k = 0; k < NR; k++) { dm.position.set(rackPos[k][0], RACK_H + 0.024, rackPos[k][1]); dm.rotation.set(-Math.PI / 2, 0, 0); dm.updateMatrix(); tops.setMatrixAt(k, dm.matrix); }
    tops.receiveShadow = true; scene.add(tops);

    /* ---- data pulses along the trays ---- */
    const NP = rows * 7;
    const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), M.glow(theme.accent2, 5), NP);
    pulses.frustumCulled = false; scene.add(pulses);
    const pInfo = Array.from({ length: NP }, (_, i) => ({ x: xs[i % rows] - 0.1, speed: r.range(0.1, 0.22), phase: r(), dir: r.sign() }));

    /* ---- highlighted rack ---- */
    const hiIdx = p.accentRack != null ? clamp(Math.round(p.accentRack), 0, NR - 1) : -1;
    let hiFrame = null, hiLight = null;
    const hiMat = M.glow(theme.warm, 0.001);
    const anchorRack = new THREE.Vector3(), labelPos = new THREE.Vector3(0, 2.75, 0);
    {
      const k = hiIdx >= 0 ? hiIdx : Math.floor(n / 2);
      const [x, z] = rackPos[k];
      const s = x > 0 ? -1 : 1; // face towards the centred aisle
      anchorRack.set(x + s * (RACK_D / 2 + 0.02), 1.3, z);
      if (hiIdx >= 0) {
        hiFrame = new THREE.Group();
        const fx = x + s * (RACK_D / 2 + 0.014);
        for (const dz of [-1, 1]) mesh(new THREE.BoxGeometry(0.02, RACK_H, 0.03), hiMat, { pos: [fx, RACK_H / 2 + 0.02, z + dz * (RACK_W / 2 - 0.015)], parent: hiFrame, shadow: false });
        for (const y of [0.035, RACK_H + 0.005]) mesh(new THREE.BoxGeometry(0.02, 0.03, RACK_W), hiMat, { pos: [fx, y, z], parent: hiFrame, shadow: false });
        scene.add(hiFrame);
        hiLight = new THREE.PointLight(col(theme.warm), 0, 5, 1.8);
        hiLight.position.set(x + s * 1.1, 1.3, z); scene.add(hiLight);
        labelPos.set(x + s * (RACK_D / 2), RACK_H + 0.55, z);
      }
    }
    ledMat.uniforms.uHiRack.value = hiIdx;

    const anchors = { rack: anchorRack, aisle: new THREE.Vector3(0, 1.2, 0), ceiling: new THREE.Vector3(0, 3.25, 0), tray: new THREE.Vector3(xs[xs.length - 1] ?? 0, 2.55, 0), floor: new THREE.Vector3(0, 0, L * 0.25) };
    let hiNow = 0;

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        const act = clamp(f.tw('activity', 0.75, 0.2, 1.5));
        dust.update(t);
        ledMat.uniforms.uTime.value = t; ledMat.uniforms.uAct.value = act;
        const power = ease.outCubic(clamp(t / 1.4));
        setGlow(stripMat, 1.5 * power * (0.9 + 0.1 * Math.sin(t * 1.7)));
        setGlow(lightMat, 0.15 + 0.8 * power);
        setGlow(fiberMat, (0.5 + 0.7 * act) * power);
        for (const pl of aisleLights) pl.intensity = 7 * power;
        // highlight
        const hAt = f.params.cues?.highlight;
        hiNow = hiIdx < 0 ? 0 : (hAt != null && !f.prevParams ? ease.outCubic(clamp((f.shotT - hAt) / 0.7)) : ease.outCubic(clamp(((f.prevParams ? f.t : f.shotT) - (hAt ?? 1.2)) / 0.7)));
        if (hAt != null && f.prevParams) hiNow = Math.max(f.prevParams.accentRack != null && f.prevParams.cues?.highlight == null ? 1 : 0, ease.outCubic(clamp((f.shotT - hAt) / 0.7)));
        ledMat.uniforms.uHi.value = hiNow;
        if (hiFrame) {
          setGlow(hiMat, Math.max(0.001, hiNow * (1.5 + 0.25 * Math.sin(t * 3.0))));
          hiFrame.visible = hiNow > 0.01; hiLight.intensity = hiNow * 3.2;
        }
        for (let i = 0; i < NP; i++) {
          const pi = pInfo[i];
          let u = (t * pi.speed + pi.phase) % 1; if (pi.dir < 0) u = 1 - u;
          const s = Math.sin(u * Math.PI) > 0.05 && (i / NP) < act + 0.15 ? power : 0.001;
          dm.position.set(pi.x, 2.56, -L / 2 - 1 + u * (L + 2)); dm.rotation.set(0, 0, 0); dm.scale.setScalar(s); dm.updateMatrix();
          pulses.setMatrixAt(i, dm.matrix);
        }
        dm.scale.setScalar(1);
        pulses.instanceMatrix.needsUpdate = true;
      },
      labels() {
        if (!p.label) return [];
        const a = hiIdx >= 0 ? hiNow : 1;
        return [{ pos: labelPos, text: String(p.label), size: 30, bg: true, color: hiIdx >= 0 ? theme.warm : theme.accent, alpha: a }];
      },
    };
  },
};
