// Scene kit: the shared building blocks every scene template uses, so all
// scenes share one lighting / material / environment language.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { rng } from './util.js';

export const col = (c) => new THREE.Color(c);

/* ------------------------------------------------------------------ */
/* Base scene: sky dome, fog, 3-point lighting, environment reflections */
/* ------------------------------------------------------------------ */
export function createBase(ctx, o = {}) {
  const { theme, stage } = ctx;
  const scene = new THREE.Scene();
  scene.environment = stage.getEnv(theme);
  scene.environmentIntensity = o.env ?? 0.55;

  const horizon = col(theme.bg1).multiplyScalar(o.horizon ?? 0.9);
  const fogDensity = o.fog ?? 0.022;
  scene.fog = new THREE.FogExp2(horizon, fogDensity);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: col(theme.bg0) }, uHorizon: { value: horizon },
        uGlow: { value: col(o.glowColor ?? theme.accent) }, uGlowAmt: { value: o.glow ?? 0.1 },
        uGlowDir: { value: new THREE.Vector3(...(o.glowDir ?? [0, 0.05, -1])).normalize() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uGlow, uGlowDir; uniform float uGlowAmt; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -1.0, 1.0);
          vec3 c = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.75, h), 0.6));
          c = mix(c, uHorizon * 0.55, smoothstep(0.0, -0.4, h));
          float g = pow(max(dot(d, uGlowDir), 0.0), 5.0) * smoothstep(0.0, 0.3, h);
          c += uGlow * g * uGlowAmt;
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const key = new THREE.DirectionalLight(0xffffff, o.key ?? 2.0);
  key.position.set(...(o.keyPos ?? [7, 11, 6]));
  key.castShadow = o.shadows !== false;
  const ss = o.shadowSize ?? 12;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -ss, right: ss, top: ss, bottom: -ss, near: 0.5, far: 60 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03; key.shadow.radius = 5;
  scene.add(key); scene.add(key.target);

  const fill = new THREE.HemisphereLight(col(theme.accent).lerp(col('#ffffff'), 0.6), col(theme.bg0), o.fill ?? 0.35);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(col(o.rimColor ?? theme.accent), o.rim ?? 0.8);
  rim.position.set(...(o.rimPos ?? [-7, 5, -9]));
  scene.add(rim);

  const rim2 = new THREE.DirectionalLight(col(theme.accent2), o.rim2 ?? 0.35);
  rim2.position.set(9, 3, -6);
  scene.add(rim2);

  return { scene, sky, key, fill, rim, rim2, fogColor: horizon, fogDensity };
}

/* ------------------------------------------------------------------ */
/* Glossy studio floor with blurred planar reflections + optional grid */
/* ------------------------------------------------------------------ */
const FloorShader = {
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.02 },
    uReflect: { value: 0.55 }, uBlur: { value: 0.006 },
    uGridColor: { value: new THREE.Color() }, uGrid: { value: 0.0 }, uGridScale: { value: 1.0 },
  },
  vertexShader: `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld; varying vec3 vView;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
      vec4 mv = viewMatrix * w; vView = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 color, uFogColor, uGridColor; uniform sampler2D tDiffuse;
    uniform float uFogDensity, uReflect, uBlur, uGrid, uGridScale;
    varying vec4 vUv; varying vec3 vWorld; varying vec3 vView;
    void main(){
      vec2 uv = vUv.xy / vUv.w;
      float dist = length(vView);
      float b = uBlur * (0.6 + min(dist, 30.0) * 0.03);
      // 14-tap spiral blur, rotated per pixel so highlights smear instead of repeating
      float rot = 6.2831 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      vec3 refl = min(texture2D(tDiffuse, uv).rgb, vec3(3.0)) * 1.5; float wsum = 1.5;
      for (int i = 0; i < 14; i++) {
        float fi = float(i) + 0.5;
        float rr = sqrt(fi / 14.0), th = fi * 2.39996 + rot;
        vec2 o = vec2(cos(th), sin(th) * 1.6) * rr * b * 1.6;
        refl += min(texture2D(tDiffuse, uv + o).rgb, vec3(3.0)); wsum += 1.0;
      }
      refl /= wsum;
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.5);
      vec3 c = color + refl * uReflect * mix(0.28, 1.0, fres);
      vec2 g = vWorld.xz / uGridScale;
      vec2 gf = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-5));
      float line = 1.0 - min(min(gf.x, gf.y), 1.0);
      c += uGridColor * line * uGrid * exp(-dist * 0.07);
      float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
      c = mix(c, uFogColor, clamp(f, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function addFloor(ctx, base, o = {}) {
  const { theme } = ctx;
  const size = o.size ?? 400;
  const floor = new Reflector(new THREE.PlaneGeometry(size, size), {
    textureWidth: o.res ?? 1024, textureHeight: o.res ?? 1024, clipBias: 0.003,
    color: col(o.color ?? theme.floor), shader: FloorShader, multisample: 0,
  });
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = o.y ?? 0;
  const u = floor.material.uniforms;
  u.uFogColor.value.copy(base.fogColor); u.uFogDensity.value = base.fogDensity;
  u.uReflect.value = o.reflect ?? 0.5; u.uBlur.value = o.blur ?? 0.006;
  u.uGridColor.value.copy(col(o.gridColor ?? theme.accent)); u.uGrid.value = o.grid ?? 0; u.uGridScale.value = o.gridScale ?? 1;
  base.scene.add(floor);
  if (o.shadow !== false) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShadowMaterial({ opacity: o.shadowOpacity ?? 0.5 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = (o.y ?? 0) + 0.004; sh.receiveShadow = true;
    base.scene.add(sh);
  }
  return floor;
}

/* ------------------------------------------------------------------ */
/* Floating dust motes for depth (stateless: driven by uTime)           */
/* ------------------------------------------------------------------ */
export function addDust(ctx, scene, o = {}) {
  const n = o.count ?? 500, r = rng(o.seed ?? 7), ext = o.extent ?? [22, 9, 22];
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = r.range(-ext[0], ext[0]); pos[i * 3 + 1] = r.range(0.1, ext[1]); pos[i * 3 + 2] = r.range(-ext[2], ext[2]);
    seed[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: col(o.color ?? ctx.theme.accent).lerp(col('#ffffff'), 0.5) }, uSize: { value: o.size ?? 26 }, uAlpha: { value: o.alpha ?? 0.5 } },
    vertexShader: `
      attribute float aSeed; uniform float uTime, uSize; varying float vA;
      void main(){
        vec3 p = position;
        float s = aSeed * 6.2831;
        p += vec3(sin(uTime * 0.11 + s * 3.0), sin(uTime * 0.07 + s * 5.0) * 0.6, cos(uTime * 0.09 + s * 7.0)) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.4 + aSeed) / max(-mv.z, 0.5);
        vA = (0.35 + 0.65 * sin(uTime * 0.6 + s * 11.0) * 0.5 + 0.5) * smoothstep(0.6, 3.0, -mv.z) * smoothstep(60.0, 25.0, -mv.z);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor * a * a * vA * uAlpha, 1.0); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
  return { points: pts, update: (t) => { m.uniforms.uTime.value = t; } };
}

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */
export const M = {
  metal: (color = '#aab4c4', rough = 0.3) => new THREE.MeshStandardMaterial({ color: col(color), metalness: 1, roughness: rough }),
  brushed: (color = '#8d96a3') => new THREE.MeshStandardMaterial({ color: col(color), metalness: 1, roughness: 0.42 }),
  dark: (color = '#0c1016', rough = 0.45) => new THREE.MeshStandardMaterial({ color: col(color), metalness: 0.6, roughness: rough }),
  plastic: (color = '#14181f', rough = 0.5) => new THREE.MeshStandardMaterial({ color: col(color), metalness: 0.05, roughness: rough }),
  gloss: (color = '#0a0d12') => new THREE.MeshPhysicalMaterial({ color: col(color), metalness: 0.2, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 }),
  glass: (color = '#9fd6ff', opacity = 0.22) => new THREE.MeshPhysicalMaterial({ color: col(color), metalness: 0, roughness: 0.06, transparent: true, opacity, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
  gold: () => new THREE.MeshStandardMaterial({ color: col('#f2c14e'), metalness: 1, roughness: 0.25 }),
  copper: () => new THREE.MeshStandardMaterial({ color: col('#d98a4e'), metalness: 1, roughness: 0.3 }),
  silicon: () => new THREE.MeshPhysicalMaterial({ color: col('#3a3f58'), metalness: 0.9, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessMinimum: 200, iridescenceThicknessMaximum: 600 }),
  /** Self-lit material; intensity > 1 feeds the bloom pass. */
  glow: (color, intensity = 2.5) => { const m = new THREE.MeshBasicMaterial({ color: col(color).multiplyScalar(intensity) }); m.toneMapped = false; m.userData.baseColor = col(color); return m; },
  emissive: (color, emissive, intensity = 2, rough = 0.4, metal = 0.3) => new THREE.MeshStandardMaterial({ color: col(color), emissive: col(emissive), emissiveIntensity: intensity, roughness: rough, metalness: metal }),
};

export function setGlow(mat, intensity) { mat.color.copy(mat.userData.baseColor).multiplyScalar(intensity); }

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                     */
/* ------------------------------------------------------------------ */
/** Box with rounded vertical edges (extruded rounded rectangle), centred, lying in XZ with height along Y. */
export function roundedBox(w, h, d, r = 0.05, bevel = 0.012) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  r = Math.min(r, w / 2 - 1e-3, d / 2 - 1e-3);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const b = Math.min(bevel, h / 2 - 1e-4);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -h / 2 + b, 0);
  g.computeVertexNormals();
  return g;
}

export function mesh(geo, mat, { pos, rot, scale, shadow = true, parent } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) (typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale));
  m.castShadow = shadow; m.receiveShadow = shadow;
  if (parent) parent.add(m);
  return m;
}

/** Dispose every geometry / material / texture under a scene. */
export function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.getRenderTarget) { try { o.getRenderTarget().dispose(); } catch {} }
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.isRenderTargetTexture && v.mapping !== THREE.CubeUVReflectionMapping) v.dispose(); }
      if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture && !v.isRenderTargetTexture) v.dispose(); }
      m.dispose();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Procedural canvas textures                                           */
/* ------------------------------------------------------------------ */
export function canvasTex(w, h, draw, { srgb = true, repeat } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** PCB / silicon trace artwork. Returns { map, emissive } canvas textures. */
export function circuitTextures(seed = 1, o = {}) {
  const size = o.size ?? 1024, cells = o.cells ?? 40, r0 = rng(seed);
  const paths = [];
  const used = new Set();
  const key = (x, y) => x + ',' + y;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let n = 0; n < (o.traces ?? 150); n++) {
    let x = r0.int(1, cells - 1), y = r0.int(1, cells - 1);
    if (used.has(key(x, y))) continue;
    let d = r0.pick(dirs.slice(0, 4));
    const pts = [[x, y]]; used.add(key(x, y));
    const len = r0.int(4, 16);
    for (let i = 0; i < len; i++) {
      if (r0() < 0.3) d = r0.pick(dirs);
      const steps = r0.int(1, 4);
      let ok = true;
      for (let s = 0; s < steps; s++) {
        const nx = x + d[0], ny = y + d[1];
        if (nx < 1 || ny < 1 || nx > cells - 1 || ny > cells - 1 || used.has(key(nx, ny))) { ok = false; break; }
        x = nx; y = ny; used.add(key(x, y));
      }
      pts.push([x, y]);
      if (!ok) break;
    }
    if (pts.length > 2) paths.push(pts);
  }
  const u = size / cells;
  const drawPaths = (g, stroke, lw, pad, padFill) => {
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = stroke; g.lineWidth = lw;
    for (const p of paths) {
      g.beginPath(); g.moveTo(p[0][0] * u, p[0][1] * u);
      for (let i = 1; i < p.length; i++) g.lineTo(p[i][0] * u, p[i][1] * u);
      g.stroke();
      g.fillStyle = padFill;
      for (const e of [p[0], p[p.length - 1]]) { g.beginPath(); g.arc(e[0] * u, e[1] * u, pad, 0, Math.PI * 2); g.fill(); }
    }
  };
  const map = canvasTex(size, size, (g) => {
    g.fillStyle = o.base ?? '#0a1512'; g.fillRect(0, 0, size, size);
    drawPaths(g, o.trace ?? '#1d3a30', u * 0.32, u * 0.3, o.pad ?? '#b89a52');
  });
  const emissive = canvasTex(size, size, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
    g.shadowColor = o.glow ?? '#7ee04a'; g.shadowBlur = u * 0.5;
    drawPaths(g, o.glow ?? '#7ee04a', u * 0.12, u * 0.14, o.glow ?? '#7ee04a');
  });
  return { map, emissive, paths, cells };
}

/** Text drawn into a texture — for labels printed on 3D objects. */
export function textTexture(text, o = {}) {
  const w = o.w ?? 1024, h = o.h ?? 256;
  return canvasTex(w, h, (g) => {
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); } else g.clearRect(0, 0, w, h);
    g.fillStyle = o.color ?? '#ffffff';
    g.textAlign = o.align ?? 'center'; g.textBaseline = 'middle';
    let fs = o.size ?? h * 0.6;
    const font = () => `${o.weight ?? 700} ${fs}px ${o.font ?? '"Space Grotesk", sans-serif'}`;
    g.font = font();
    while (g.measureText(text).width > w * 0.92 && fs > 10) { fs *= 0.94; g.font = font(); }
    if (o.letterSpacing) g.letterSpacing = o.letterSpacing;
    g.fillText(text, o.align === 'left' ? w * 0.04 : w / 2, h / 2 + fs * 0.04);
  });
}

/** Flat plane carrying a text texture (transparent). */
export function textPlane(text, width, o = {}) {
  const tex = textTexture(text, o);
  const aspect = (o.w ?? 1024) / (o.h ?? 256);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: col('#ffffff').multiplyScalar(o.intensity ?? 1) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), mat);
  return m;
}
