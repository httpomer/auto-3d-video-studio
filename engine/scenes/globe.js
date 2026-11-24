// Dotted-land globe with atmosphere glow, labelled location pins and animated
// great-circle arcs carrying travelling pulses (supply chains, global networks).
import * as THREE from 'three';
import { feature } from 'topojson-client';
import { createBase, M, mesh, col, setGlow } from '../core/kit.js';
import { clamp, ease, hash1, lerp, smoothstep } from '../core/util.js';

const R = 3, D2R = Math.PI / 180;

/* ---- land mask (loaded once at module scope so build() stays synchronous) ---- */
const MW = 1440, MH = 720;
let landMask = null;
try {
  const topo = await (await fetch('/node_modules/world-atlas/land-110m.json')).json();
  const land = feature(topo, topo.objects.land);
  const c = document.createElement('canvas'); c.width = MW; c.height = MH;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, MW, MH); g.fillStyle = '#fff';
  const geoms = land.type === 'FeatureCollection' ? land.features.map((f) => f.geometry) : [land.geometry];
  for (const geom of geoms) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) {
      g.beginPath();
      for (const ring of poly) ring.forEach(([lon, lat], i) => { const x = ((lon + 180) / 360) * MW, y = ((90 - lat) / 180) * MH; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.fill('evenodd');
    }
  }
  landMask = g.getImageData(0, 0, MW, MH).data;
} catch (e) { console.warn('globe: land data unavailable, using full dot coverage', e); }
const isLand = (lat, lon) => {
  if (!landMask) return true;
  const x = Math.min(MW - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MW))), y = Math.min(MH - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MH)));
  return landMask[(y * MW + x) * 4] > 100;
};
/** lat/lon (degrees) → point on a sphere of radius r; lon 0 faces +z, north is +y. */
const ll = (lat, lon, r = R, out = new THREE.Vector3()) => out.set(r * Math.cos(lat * D2R) * Math.sin(lon * D2R), r * Math.sin(lat * D2R), r * Math.cos(lat * D2R) * Math.cos(lon * D2R));
const lerpAngle = (a, b, k) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };

export default {
  name: 'globe',
  description: 'Dotted-land globe with atmosphere glow: labelled location pins, animated great-circle arcs with travelling pulses, slow rotation. The globe turns so a chosen region faces the camera. Use for supply chains, global markets, data routes, geopolitics.',
  params: {
    points: '[{ name, lat, lon, color?, label?, dx?, dy? }] — pins with HUD labels. color = theme key (accent|accent2|warm|danger) or hex; dx/dy nudge the label in px to separate neighbours. Fixed by the first shot of the scene.',
    arcs: '[[fromName, toName], ...] — arcs drawn one after another between named points. Fixed by the first shot of the scene.',
    focus: '{ lat, lon } — rotate the globe so this spot faces the camera; a continued shot with a new focus turns the globe smoothly. Omit for free rotation.',
    spin: 'Free rotation speed in rad/s when no focus is set (default 0.1)',
    labels: 'true|false show pin name labels (default true)',
    cues: '{ arcs: seconds } start of the arc sequence, or per arc { arc0: s, arc1: s, ... } (shot-local seconds)',
  },
  sample: {
    points: [
      { name: 'Netherlands', lat: 51.4, lon: 5.5, color: 'accent2' },
      { name: 'Taiwan', lat: 24.8, lon: 121.0, color: 'warm' },
      { name: 'Japan', lat: 35.7, lon: 139.7, color: 'accent2' },
      { name: 'South Korea', lat: 37.5, lon: 127.0, color: 'accent2' },
      { name: 'USA', lat: 37.4, lon: -122.0, color: 'accent' },
    ],
    arcs: [['Netherlands', 'Taiwan'], ['Japan', 'Taiwan'], ['South Korea', 'Taiwan'], ['Taiwan', 'USA']],
    focus: { lat: 30, lon: 135 },
  },
  framings: {
    front: { pos: [0, 1.0, 14.2], target: [0, 0, 0], fov: 32 },
    wide: { pos: [-3.4, 1.8, 18.5], target: [-2.6, 0, 0], fov: 32 },
    close: { pos: [0.7, 1.9, 8.6], target: [0, 0.7, 0], fov: 32 },
    left: { pos: [-7.2, 2.6, 11.6], target: [0, 0, 0], fov: 32 },
    right: { pos: [7.2, 2.6, 11.6], target: [0, 0, 0], fov: 32 },
    high: { pos: [0, 8.2, 11.2], target: [0, 0.1, 0], fov: 32 },
    low: { pos: [2.6, -4.4, 12.6], target: [0, 0.1, 0], fov: 32 },
    horizon: { pos: [0.4, 1.6, 5.6], target: [0, 2.5, 0], fov: 38 },
  },
  defaultCamera: { from: 'wide', to: 'front', orbit: 10 },
  look: { bloom: 0.5 },

  build(ctx, p) {
    const { theme } = ctx;
    const base = createBase(ctx, { fog: 0.003, shadows: false, glow: 0.07, horizon: 0.4, glowDir: [0.3, 0.1, -1] });
    const { scene } = base;
    const tcol = (c) => col(theme[c] || c || theme.accent);

    /* ---- stars ---- */
    {
      const N = 900, pos = new Float32Array(N * 3), sd = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const u = hash1(i * 3 + 1) * 2 - 1, a = hash1(i * 3 + 2) * Math.PI * 2, s = Math.sqrt(1 - u * u), rr = 90 + hash1(i * 3 + 3) * 60;
        pos[i * 3] = rr * s * Math.cos(a); pos[i * 3 + 1] = rr * u; pos[i * 3 + 2] = rr * s * Math.sin(a); sd[i] = hash1(i * 7 + 5);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
      const stars = new THREE.Points(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `attribute float aSeed; uniform float uTime; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 1.2 + aSeed * 2.2; vA = 0.25 + 0.5 * aSeed * (0.7 + 0.3 * sin(uTime * (0.5 + aSeed) + aSeed * 40.0)); }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.75, 0.85, 1.0) * smoothstep(0.5, 0.1, d) * vA, 1.0); }`,
      }));
      stars.frustumCulled = false; stars.name = 'stars'; scene.add(stars);
    }

    const tilt = new THREE.Group(); scene.add(tilt);
    const globe = new THREE.Group(); tilt.add(globe);

    /* ---- core sphere (dark ocean + graticule + fresnel rim) ---- */
    const camPos = new THREE.Vector3(0, 0, 10);
    const coreMat = new THREE.ShaderMaterial({
      uniforms: { uBase: { value: col(theme.bg1).multiplyScalar(0.55) }, uRim: { value: col(theme.accent) }, uGrid: { value: col(theme.accent).multiplyScalar(0.16) } },
      vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vL; void main(){ vL = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform vec3 uBase, uRim, uGrid; varying vec3 vN, vW, vL;
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float nv = clamp(dot(normalize(vN), V), 0.0, 1.0);
          float lat = asin(clamp(vL.y, -1.0, 1.0)), lon = atan(vL.x, vL.z);
          vec2 g = vec2(lon, lat) / 0.2617994;
          vec2 gf = abs(fract(g - 0.5) - 0.5) / fwidth(g);
          float line = (1.0 - min(min(gf.x, gf.y), 1.0)) * smoothstep(1.45, 1.2, abs(lat));
          vec3 c = uBase * (0.35 + 0.65 * nv) + uGrid * line + uRim * pow(1.0 - nv, 3.4) * 0.55;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const core = mesh(new THREE.SphereGeometry(R * 0.988, 96, 64), coreMat, { parent: globe, shadow: false });
    core.onBeforeRender = (_r, _s, camera) => { if (camera.isPerspectiveCamera) camPos.setFromMatrixPosition(camera.matrixWorld); };

    /* ---- atmosphere halo ---- */
    const atmoMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: col(theme.accent) }, uAmt: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAmt; varying vec3 vN; varying vec3 vP;
        void main(){ float a = clamp(dot(normalize(vN), normalize(vP)), 0.0, 1.0); float k = pow(clamp(a / 0.46, 0.0, 1.0), 3.2); gl_FragColor = vec4(uColor * k * 0.3 * uAmt, 1.0); }`,
    });
    mesh(new THREE.SphereGeometry(R * 1.13, 64, 48), atmoMat, { parent: scene, shadow: false });

    /* ---- land dots ---- */
    const dotList = [];
    const NS = 44000, GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < NS; i++) {
      const y = 1 - (2 * (i + 0.5)) / NS, lat = Math.asin(y) / D2R;
      let lon = ((i * GA) % (2 * Math.PI)) / D2R; if (lon > 180) lon -= 360;
      if (isLand(lat, lon)) dotList.push([lat, lon]);
    }
    const dotGeo = new THREE.CircleGeometry(1, 6);
    const dots = new THREE.InstancedMesh(dotGeo, null, dotList.length);
    const dm = new THREE.Object3D(), aSeed = new Float32Array(dotList.length), vtmp = new THREE.Vector3();
    dotList.forEach(([lat, lon], i) => {
      ll(lat, lon, R, dm.position); vtmp.copy(dm.position).multiplyScalar(2); dm.lookAt(vtmp); dm.updateMatrix(); dots.setMatrixAt(i, dm.matrix); aSeed[i] = hash1(i * 11 + 3);
    });
    dotGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
    const dotMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col(theme.accent).lerp(col('#ffffff'), 0.25) }, uSize: { value: 0.0135 }, uReveal: { value: 0 }, uTime: { value: 0 }, uRevealDir: { value: new THREE.Vector3(0, 0, 1) } },
      vertexShader: `
        attribute float aSeed; uniform float uSize, uReveal, uTime; uniform vec3 uRevealDir; varying float vB;
        void main(){
          vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vec3 nrm = normalize(c);
          float ang = acos(clamp(dot(nrm, uRevealDir), -1.0, 1.0)) / 3.14159;
          float k = smoothstep(ang - 0.02, ang + 0.2, uReveal * 1.25);
          vec4 w = modelMatrix * instanceMatrix * vec4(position * uSize * k * (0.8 + 0.4 * aSeed), 1.0);
          vec3 wn = normalize(mat3(modelMatrix) * nrm);
          float facing = dot(wn, normalize(cameraPosition - w.xyz));
          float tw = 0.85 + 0.15 * sin(uTime * (0.6 + aSeed * 1.7) + aSeed * 60.0);
          float wave = smoothstep(0.12, 0.0, abs(ang - uReveal * 1.25 + 0.1)) * step(uReveal, 0.99);
          vB = (0.5 + 0.5 * aSeed) * (0.3 + 0.7 * smoothstep(-0.05, 0.7, facing)) * tw + wave * 1.2;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `uniform vec3 uColor; varying float vB; void main(){ gl_FragColor = vec4(uColor * vB * 0.95, 1.0); }`,
    });
    dots.material = dotMat; dots.frustumCulled = false; globe.add(dots);

    /* ---- orbit ring for depth ---- */
    const ringMat = M.glow(theme.accent2, 0.3); ringMat.transparent = true; ringMat.blending = THREE.AdditiveBlending; ringMat.depthWrite = false;
    let ringLevel = 0;
    const ring = mesh(new THREE.TorusGeometry(R * 1.55, 0.006, 6, 200), ringMat, { parent: scene, shadow: false, rot: [Math.PI / 2 - 0.35, 0.2, 0] });
    const satMat = M.glow(theme.accent2, 4); satMat.transparent = true; satMat.blending = THREE.AdditiveBlending; satMat.depthWrite = false;
    const sat = mesh(new THREE.SphereGeometry(0.035, 10, 8), satMat, { parent: ring, shadow: false });
    // fade the ring out when the camera is close to it (it would become a thick bar across the frame)
    ring.onBeforeRender = (_r, _s, camera) => {
      if (!camera.isPerspectiveCamera) return;
      const k = smoothstep(8.5, 11.5, camera.position.length());
      setGlow(ringMat, ringLevel * k); setGlow(satMat, 4 * k);
    };

    /* ---- pins ---- */
    const pts = (p.points || []).map((q, i) => {
      const c = tcol(q.color);
      const surf = ll(q.lat, q.lon, R * 1.004), top = ll(q.lat, q.lon, R * (1.12 + (i % 3) * 0.06));
      const grp = new THREE.Group(); globe.add(grp);
      const headMat = M.glow(c, 1.9);
      const head = mesh(new THREE.SphereGeometry(0.05, 14, 10), headMat, { parent: grp, shadow: false }); head.position.copy(surf);
      const stemGeo = new THREE.BufferGeometry().setFromPoints([surf, top]);
      const stem = new THREE.Line(stemGeo, new THREE.LineBasicMaterial({ color: c.clone().multiplyScalar(1.4), toneMapped: false })); grp.add(stem);
      const tip = mesh(new THREE.SphereGeometry(0.022, 8, 6), headMat, { parent: grp, shadow: false }); tip.position.copy(top);
      const ringM = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.1), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const pr = mesh(new THREE.RingGeometry(0.075, 0.09, 40), ringM, { parent: grp, shadow: false });
      pr.position.copy(ll(q.lat, q.lon, R * 1.006)); pr.lookAt(vtmp.copy(pr.position).multiplyScalar(2));
      return { ...q, c, grp, pr, ringM, surf, top, world: new THREE.Vector3(), worldTop: new THREE.Vector3(), facing: 1, shown: 0 };
    });
    const byName = Object.fromEntries(pts.map((q) => [q.name, q]));

    /* ---- arcs ---- */
    const arcMatBase = {
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uProg, uTime, uPhase; varying vec2 vUv;
        void main(){
          if (vUv.x > uProg) discard;
          float head = smoothstep(0.12, 0.0, uProg - vUv.x) * step(uProg, 0.999);
          float pu = fract(uTime * 0.28 + uPhase);
          float pulse = exp(-pow((vUv.x - pu) * 9.0, 2.0)) * step(0.999, uProg);
          float ends = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x);
          gl_FragColor = vec4(uColor * (0.42 + head * 1.0 + pulse * 1.3) * (0.4 + 0.6 * ends), 1.0);
        }`,
    };
    const arcs = (p.arcs || []).map(([an, bn], i) => {
      const a = byName[an], b = byName[bn];
      if (!a || !b) return null;
      const va = ll(a.lat, a.lon, 1), vb = ll(b.lat, b.lon, 1);
      const ang = va.angleTo(vb), h = 0.1 + 0.34 * (ang / Math.PI);
      const samples = [];
      const NSEG = 72, so = Math.sin(ang) || 1e-6;
      for (let s = 0; s <= NSEG; s++) {
        const u = s / NSEG, k1 = Math.sin((1 - u) * ang) / so, k2 = Math.sin(u * ang) / so;
        const v = new THREE.Vector3().addScaledVector(va, k1).addScaledVector(vb, k2).normalize();
        samples.push(v.multiplyScalar(R * (1.006 + h * Math.sin(Math.PI * u))));
      }
      const curve = new THREE.CatmullRomCurve3(samples);
      const mat = new THREE.ShaderMaterial({ ...arcMatBase, uniforms: { uColor: { value: b.c.clone().lerp(a.c, 0.5).lerp(col('#ffffff'), 0.15) }, uProg: { value: 0 }, uTime: { value: 0 }, uPhase: { value: hash1(i * 5 + 2) } } });
      const tube = mesh(new THREE.TubeGeometry(curve, 96, 0.009, 6, false), mat, { parent: globe, shadow: false });
      tube.renderOrder = 3;
      const dot = mesh(new THREE.SphereGeometry(0.03, 10, 8), M.glow(mat.uniforms.uColor.value, 2.4), { parent: globe, shadow: false });
      return { curve, mat, dot, i, a, b };
    }).filter(Boolean);

    const anchors = { center: new THREE.Vector3(0, 0, 0), top: new THREE.Vector3(0, R, 0) };
    for (const q of pts) anchors[q.name] = q.world;
    const spinDef = p.spin ?? 0.1;
    const revealDir = pts.length ? ll(pts[0].lat, pts[0].lon, 1) : new THREE.Vector3(0, 0.3, 1).normalize();
    dotMat.uniforms.uRevealDir.value.copy(revealDir);

    const labelObjs = pts.map((q, i) => ({
      pos: q.worldTop, text: q.label ?? q.name, size: 26, bg: true, dx: q.dx ?? 0, dy: q.dy ?? (i % 2 ? -62 : -30), color: '#' + q.c.getHexString(),
      // facing is evaluated at draw time (after the camera for this view has been applied)
      get alpha() {
        const cos = vtmp.copy(q.world).normalize().dot(camPos.clone().normalize());
        return q.shown * smoothstep(0.18, 0.4, cos);
      },
    }));

    return {
      scene, anchors,
      update(f) {
        const t = f.t, P = f.params, prev = f.prevParams;
        const k = ease.inOutCubic(clamp((f.shotT - 0.25) / 2.0));
        const spin = P.spin ?? spinDef;
        let yaw, tl;
        if (P.focus) {
          const to = -P.focus.lon * D2R, tlTo = P.focus.lat * D2R * 0.75;
          let from = to, tlFrom = tlTo;
          if (prev) { from = prev.focus ? -prev.focus.lon * D2R : (t - f.shotT) * spin; tlFrom = prev.focus ? prev.focus.lat * D2R * 0.75 : 0.28; }
          yaw = lerpAngle(from, to, k) + Math.sin(t * 0.21) * 0.035;
          tl = lerp(tlFrom, tlTo, k);
        } else {
          yaw = prev && prev.focus ? -prev.focus.lon * D2R + f.shotT * spin : t * spin;
          tl = prev && prev.focus ? lerp(prev.focus.lat * D2R * 0.75, 0.28, k) : 0.28;
        }
        globe.rotation.y = yaw; tilt.rotation.x = tl;
        const intro = ease.outCubic(clamp(t / 1.8));
        dotMat.uniforms.uReveal.value = clamp(t / 1.9); dotMat.uniforms.uTime.value = t;
        atmoMat.uniforms.uAmt.value = 0.3 + 0.7 * intro;
        scene.getObjectByName('stars').material.uniforms.uTime.value = t;
        ring.rotation.z = t * 0.05; ringLevel = 0.28 * intro;
        sat.position.set(Math.cos(t * 0.35) * R * 1.55, Math.sin(t * 0.35) * R * 1.55, 0);
        tilt.updateMatrixWorld(true);
        // pins
        pts.forEach((q, i) => {
          const s = ease.outBack(clamp((t - 0.7 - i * 0.14) / 0.5));
          q.shown = clamp(s); q.grp.visible = s > 0.01;
          q.world.copy(q.surf).applyMatrix4(globe.matrixWorld); q.worldTop.copy(q.top).applyMatrix4(globe.matrixWorld);
          const u = (t * 0.55 + i * 0.37) % 1;
          q.pr.scale.setScalar((1 + u * 1.5) * Math.max(s, 0.001)); q.ringM.opacity = (1 - u) * 0.8 * clamp(s);
        });
        // arcs
        const cues = P.cues || {};
        arcs.forEach((a) => {
          const hasCue = cues['arc' + a.i] != null || cues.arcs != null;
          const start = cues['arc' + a.i] ?? (cues.arcs != null ? cues.arcs + a.i * 0.7 : 1.3 + a.i * 0.8);
          let prog = ease.inOutCubic(clamp(((hasCue ? f.shotT : t) - start) / 1.5));
          if (hasCue && prev && prev.cues && (prev.cues['arc' + a.i] != null || prev.cues.arcs != null)) prog = 1;
          a.mat.uniforms.uProg.value = prog; a.mat.uniforms.uTime.value = t;
          const u = prog < 1 ? prog : (t * 0.28 + a.mat.uniforms.uPhase.value) % 1;
          a.curve.getPoint(clamp(u, 0, 1), a.dot.position);
          a.dot.visible = prog > 0.005; a.dot.scale.setScalar(prog < 1 ? 1 : 0.75 * Math.sin(u * Math.PI) + 0.25);
        });
      },
      labels(f) { return f.params.labels === false ? [] : labelObjs; },
    };
  },
};
