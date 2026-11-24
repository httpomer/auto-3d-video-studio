// Stage: owns the WebGL renderer, the cinematic post-processing chain
// (MSAA → bloom → filmic tone-map/grade/vignette/grain) and the transition mixer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uTime: { value: 0 },
    uGrain: { value: 0.016 },
    uVignette: { value: 0.55 },
    uCA: { value: 0.005 },
    uFade: { value: 1.0 },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.04 },
    uRes: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uExposure, uTime, uGrain, uVignette, uCA, uFade, uSaturation, uContrast;
    uniform vec2 uRes;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 color){
      const mat3 inM = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 outM = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      color *= uExposure / 0.6;
      color = inM * color; color = RRTAndODTFit(color); color = outM * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * uCA;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col = max(col, 0.0);
      col = aces(col);
      col = toSRGB(col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      float v = smoothstep(0.95, 0.25, length(c * vec2(1.0, 0.85)));
      col *= mix(1.0, v, uVignette);
      float g = hash(vUv * uRes + fract(uTime * 7.13) * 311.7) - 0.5;
      col += g * uGrain * (1.0 - 0.5 * l);
      col *= uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

const MixShader = {
  uniforms: {
    tA: { value: null }, tB: { value: null },
    uMix: { value: 0 }, uType: { value: 0 }, uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tA, tB; uniform float uMix, uAspect; uniform int uType;
    varying vec2 vUv;
    float ss(float a, float b, float x){ float t = clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
    void main(){
      float m = clamp(uMix, 0.0, 1.0);
      vec3 col;
      if (uType == 1) {            // dip through black
        vec3 a = texture2D(tA, vUv).rgb, b = texture2D(tB, vUv).rgb;
        col = m < 0.5 ? a * ss(0.5, 0.0, m) : b * ss(0.5, 1.0, m);
      } else if (uType == 2) {     // soft diagonal wipe
        vec3 a = texture2D(tA, vUv).rgb, b = texture2D(tB, vUv).rgb;
        float p = vUv.x * 0.85 + (1.0 - vUv.y) * 0.15;
        float e = ss(0.0, 1.0, m) * 1.3 - 0.15;
        float k = ss(e - 0.12, e + 0.12, p);
        col = mix(b, a, k);
        col += vec3(0.25, 0.4, 0.6) * (1.0 - abs(k - 0.5) * 2.0) * 0.12;
      } else if (uType == 3) {     // zoom-through
        float e = ss(0.0, 1.0, m);
        vec2 ua = (vUv - 0.5) * (1.0 - 0.22 * e) + 0.5;
        vec2 ub = (vUv - 0.5) * (1.0 + 0.22 * (1.0 - e)) + 0.5;
        vec3 a = texture2D(tA, ua).rgb, b = texture2D(tB, ub).rgb;
        col = mix(a, b, ss(0.25, 0.75, m));
      } else if (uType == 4) {     // push left
        float e = ss(0.0, 1.0, m); e = e * e * (3.0 - 2.0 * e);
        vec2 ua = vUv + vec2(e, 0.0), ub = vUv + vec2(e - 1.0, 0.0);
        col = ua.x <= 1.0 ? texture2D(tA, ua).rgb : texture2D(tB, ub).rgb;
      } else {                     // crossfade
        vec3 a = texture2D(tA, vUv).rgb, b = texture2D(tB, vUv).rgb;
        col = mix(a, b, ss(0.0, 1.0, m));
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export const TRANSITION_TYPES = { cut: 0, fade: 0, dip: 1, wipe: 2, zoom: 3, push: 4 };

export class Stage {
  constructor({ width, height }) {
    this.width = width; this.height = height;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;

    const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(1);
    composer.setSize(width, height);
    composer.renderToScreen = false;
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.65, 1.0);
    this.finish = new ShaderPass(FinishShader);
    this.finish.uniforms.uRes.value.set(width, height);
    composer.addPass(this.renderPass);
    composer.addPass(this.bloom);
    composer.addPass(this.finish);
    this.composer = composer;

    const mk = () => new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.rtA = mk(); this.rtB = mk();
    this.copyQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: MixShader.vertexShader,
      fragmentShader: `precision highp float; uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }`,
      depthTest: false, depthWrite: false,
    }));
    this.mixQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(MixShader.uniforms),
      vertexShader: MixShader.vertexShader, fragmentShader: MixShader.fragmentShader,
      depthTest: false, depthWrite: false,
    }));
    this.mixQuad.material.uniforms.uAspect.value = width / height;
    this.envCache = new Map();
  }

  /** Studio lighting environment (softboxes + tinted strips) for PBR reflections. */
  getEnv(theme) {
    if (this.envCache.has(theme.name)) return this.envCache.get(theme.name);
    const s = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(40, 24, 40), new THREE.MeshBasicMaterial({ color: 0x06080c, side: THREE.BackSide }));
    s.add(room);
    const panel = (w, h, color, intensity, pos, look = [0, 0, 0]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(...look); s.add(m);
    };
    panel(14, 10, '#ffffff', 1.3, [0, 11.5, 2]);              // overhead softbox
    panel(5, 14, '#ffffff', 1.8, [-18, 3, 6]);                // left key strip
    panel(4, 12, theme.accent, 2.6, [18, 2, -4]);             // accent strip
    panel(10, 3, theme.accent2, 1.6, [0, 1, -19]);            // back glow
    panel(3, 10, '#ffffff', 1.0, [10, 4, 18]);                // front kicker
    panel(24, 1.2, '#ffffff', 2.2, [0, 9, -16]);              // top-back line
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(s, 0.035).texture;
    pmrem.dispose();
    s.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.envCache.set(theme.name, env);
    return env;
  }

  /** Render one view (scene+camera+look) through the full chain into `target`. */
  renderView(view, target, time) {
    const look = view.look || {};
    this.renderPass.scene = view.scene;
    this.renderPass.camera = view.camera;
    this.bloom.strength = look.bloom ?? 0.42;
    this.bloom.radius = look.bloomRadius ?? 0.55;
    this.bloom.threshold = look.bloomThreshold ?? 1.15;
    const u = this.finish.uniforms;
    u.uExposure.value = look.exposure ?? 1.0;
    u.uVignette.value = look.vignette ?? 0.55;
    u.uGrain.value = look.grain ?? 0.016;
    u.uSaturation.value = look.saturation ?? 1.08;
    u.uContrast.value = look.contrast ?? 1.04;
    u.uFade.value = view.fade ?? 1.0;
    u.uTime.value = time;
    this.composer.render();
    this.copyQuad.material.uniforms.tDiffuse.value = this.composer.readBuffer.texture;
    this.renderer.setRenderTarget(target);
    this.copyQuad.render(this.renderer);
    this.renderer.setRenderTarget(null);
  }

  /** Put rtA (or rtA→rtB blended by a transition) on the canvas. */
  present(hasB, mix, type) {
    const u = this.mixQuad.material.uniforms;
    u.tA.value = this.rtA.texture;
    u.tB.value = hasB ? this.rtB.texture : this.rtA.texture;
    u.uMix.value = hasB ? mix : 0;
    u.uType.value = hasB ? (TRANSITION_TYPES[type] ?? 0) : 0;
    this.renderer.setRenderTarget(null);
    this.mixQuad.render(this.renderer);
  }
}
