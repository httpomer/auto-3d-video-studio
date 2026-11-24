// Symbolic hero props — strong metaphors that render beautifully as hard-surface 3D:
//   chess      — a giant glowing AI king towering over a toppled human king (AI vs humans, "checkmate")
//   countdown  — a wall-mounted red LED countdown ("365 DAYS") for deadlines and timelines
//   stop       — a big emergency STOP button with hazard stripes ("can we stop it?", slowing down)
import * as THREE from 'three';
import { createBase, addFloor, addDust, M, mesh, col, roundedBox, canvasTex, textPlane } from '../core/kit.js';
import { clamp } from '../core/util.js';

const lathe = (pts, seg = 96) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const KING = [[0, 0], [0.56, 0], [0.56, 0.1], [0.47, 0.17], [0.5, 0.24], [0.34, 0.34], [0.26, 0.55], [0.21, 0.95], [0.3, 1.04], [0.2, 1.1], [0.22, 1.16], [0.36, 1.34], [0.38, 1.44], [0.24, 1.52], [0, 1.54]];
const PAWN = [[0, 0], [0.42, 0], [0.42, 0.08], [0.34, 0.14], [0.36, 0.2], [0.22, 0.3], [0.15, 0.6], [0.26, 0.66], [0.13, 0.72], [0, 0.72]];

function king(mat) {
  const g = new THREE.Group();
  mesh(lathe(KING), mat, { parent: g });
  mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), mat, { pos: [0, 1.72, 0], parent: g });
  mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), mat, { pos: [0, 1.76, 0], parent: g });
  return g;
}
function pawn(mat) {
  const g = new THREE.Group();
  mesh(lathe(PAWN, 64), mat, { parent: g });
  mesh(new THREE.SphereGeometry(0.2, 32, 24), mat, { pos: [0, 0.86, 0], parent: g });
  return g;
}

// 7-segment layout: [x, y, horizontal?] for segments a..g, digit 1.0 tall units
const SEG = { a: [0, 0.7, 1], b: [0.33, 0.35, 0], c: [0.33, -0.35, 0], d: [0, -0.7, 1], e: [-0.33, -0.35, 0], f: [-0.33, 0.35, 0], g: [0, 0, 1] };
const DIGITS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

function hazardTexture() {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#f2c11b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111111';
    for (let x = -h; x < w + h; x += 128) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 64, h); g.lineTo(x + 64 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
  }, { repeat: [3, 1] });
}
function ringLabel(text, color) {
  return canvasTex(1024, 1024, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.fillStyle = color; g.font = '700 92px "Inter", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const r = w * 0.4, chars = text.split(''), span = Math.PI * 0.95, start = -Math.PI / 2 - span / 2;
    chars.forEach((ch, i) => {
      const a = start + (i + 0.5) * (span / chars.length);
      g.save(); g.translate(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    });
  });
}

export default {
  name: 'props',
  description: 'Symbolic hero props that read instantly: "chess" — a giant glowing AI king towering over a toppled human king (AI vs humans, checkmate); "countdown" — a wall-mounted red LED countdown such as 365 DAYS (deadlines, "next year"); "stop" — a big emergency STOP button with hazard stripes (can we stop it, slowing down, regulation). Great thumbnail heroes and punchy in-video metaphors.',
  params: {
    prop: '"chess" | "countdown" | "stop"',
    color: 'Glow colour: theme key or hex (default red)',
    number: 'countdown: the number shown (default 365)',
    unit: 'countdown: small word under the number (default "DAYS")',
    caption: 'countdown: small label on the panel (default "AI 2027")',
    label: 'stop: text around the button (default "EMERGENCY STOP")',
    press: 'stop: 0..1 how far the button is pressed (tweens)',
    topple: 'chess: 0..1 how far the human king has fallen (default 1, tween from 0 to show the fall)',
  },
  sample: { prop: 'chess' },
  framings: (p) => {
    const prop = p.prop || 'chess';
    if (prop === 'countdown') return {
      hero: { pos: [-2.6, 1.6, 6.2], target: [-0.8, 2.0, 0], fov: 34 },
      front: { pos: [1.2, 2.0, 6.5], target: [1.2, 2.0, 0], fov: 32 },
      close: { pos: [0.2, 2.2, 3.6], target: [1.1, 2.0, 0], fov: 32 },
      low: { pos: [-1.8, 0.6, 5.2], target: [-0.4, 2.2, 0], fov: 36 },
      side: { pos: [-4.5, 2.2, 3.5], target: [0.8, 2.0, 0], fov: 32 },
    };
    if (prop === 'stop') return {
      hero: { pos: [-1.6, 2.6, 4.2], target: [-0.9, 0.8, 0], fov: 34 },
      top: { pos: [0.2, 5.2, 1.6], target: [0.2, 0.6, 0], fov: 34 },
      low: { pos: [-1.9, 1.0, 3.8], target: [-0.9, 1.0, 0], fov: 36 },
      close: { pos: [-0.6, 2.0, 2.6], target: [0.1, 1.0, 0], fov: 32 },
      wide: { pos: [-2.6, 3.4, 6.8], target: [-0.6, 0.6, 0], fov: 34 },
    };
    return {
      hero: { pos: [-2.6, 1.15, 5.6], target: [-0.6, 1.5, 0], fov: 36 },
      low: { pos: [-1.8, 0.45, 4.6], target: [-0.4, 1.8, 0], fov: 38 },
      wide: { pos: [-3.5, 3.6, 8.5], target: [0, 0.8, 0], fov: 34 },
      top: { pos: [0.5, 9, 3.5], target: [0.5, 0, 0], fov: 34 },
      close: { pos: [-0.2, 2.2, 3.4], target: [1.4, 2.0, -0.4], fov: 32 },
    };
  },
  defaultCamera: { from: 'wide', to: 'hero' },
  look: { bloom: 0.55, bloomThreshold: 1.0, vignette: 0.85 },

  build(ctx, p) {
    const { theme } = ctx;
    const prop = p.prop || 'chess';
    const glowC = col(!p.color || p.color === 'danger' ? '#ff1a12' : (theme[p.color] || p.color));
    const glowHex = '#' + glowC.getHexString();
    const base = createBase(ctx, { fog: 0.035, glow: 0.015, shadowSize: 8, key: 1.6, keyPos: [-5, 8, 5], rim: 2.6, rimColor: glowHex, rimPos: [5, 3, -4], rim2: 0, env: 0.7 });
    const { scene } = base;
    const blue = new THREE.DirectionalLight(col('#7aa8ff'), 1.4); blue.position.set(-6, 4, -3); scene.add(blue);
    const dust = addDust(ctx, scene, { count: 300, extent: [9, 5, 8], alpha: 0.35 });
    let upd = () => {};
    const anchors = { hero: new THREE.Vector3(1.4, 1.8, 0) };

    if (prop === 'chess') {
      addFloor(ctx, base, { reflect: 0.35, y: -0.001, color: '#050506' });
      // board
      const sq = new THREE.InstancedMesh(new THREE.BoxGeometry(0.98, 0.12, 0.98), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }), 64);
      const dm = new THREE.Object3D(), c = new THREE.Color();
      let k = 0;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        dm.position.set(i - 3.5, 0.06, j - 3.5 - 1); dm.updateMatrix(); sq.setMatrixAt(k, dm.matrix);
        c.set((i + j) % 2 ? '#1a1c21' : '#5d626c'); sq.setColorAt(k++, c);
      }
      sq.castShadow = sq.receiveShadow = true; scene.add(sq);
      mesh(roundedBox(8.6, 0.16, 8.6, 0.1, 0.02), M.dark('#0b0c0f', 0.4), { pos: [0, 0.04, -1], parent: scene });
      // the AI king: black glass with glowing red seams
      const aiMat = new THREE.MeshPhysicalMaterial({ color: col('#07080a'), roughness: 0.12, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.05 });
      const ai = king(aiMat); ai.scale.setScalar(2.15); ai.position.set(1.55, 0.12, -0.6); scene.add(ai);
      const seamMat = M.glow(glowHex, 2.4);
      for (const [r, y] of [[0.5, 0.12], [0.47, 0.25], [0.3, 1.04], [0.37, 1.39]]) mesh(new THREE.TorusGeometry(r + 0.012, 0.012, 8, 96), seamMat, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], parent: ai, shadow: false });
      const aiLight = new THREE.PointLight(glowC, 6, 6, 1.8); aiLight.position.set(0.9, 2.6, 1.0); scene.add(aiLight);
      // the toppled human king (white marble) and scattered pawns
      const marble = new THREE.MeshPhysicalMaterial({ color: col('#eceff3'), roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 });
      const human = king(marble); human.scale.setScalar(0.95); scene.add(human);
      const wp = [[-1.2, 0.4], [-2.4, -0.9], [-0.2, 1.3]].map(([x, z], i) => { const pw = pawn(marble); pw.scale.setScalar(0.9); pw.position.set(x, 0.12, z); if (i === 1) { pw.rotation.z = 1.45; pw.position.y = 0.5; } scene.add(pw); return pw; });
      const bp = [[2.9, -1.6], [0.4, -2.2], [3.3, 0.6]].map(([x, z]) => { const pw = pawn(aiMat); pw.scale.setScalar(1.1); pw.position.set(x, 0.12, z); scene.add(pw); return pw; });
      anchors.hero.set(1.55, 2.6, -0.6); anchors.human = new THREE.Vector3(-0.5, 0.4, 1.1);
      upd = (f) => {
        const tp = clamp(f.tw('topple', 1, 0.3, 1.2));
        // pivot on the base edge: falls toward the camera-left
        human.position.set(0.05 - tp * 0.25, 0.12 + Math.sin(tp * Math.PI / 2) * 0.5 * 0.95, 0.5);
        human.rotation.set(0, 0.4, tp * 1.42);
        seamMat.color.copy(glowC).multiplyScalar(2.0 + 0.6 * Math.sin(f.t * 2));
      };
    }

    if (prop === 'countdown') {
      addFloor(ctx, base, { reflect: 0.3, color: '#050506' });
      const wall = mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ color: col('#0c0d10'), roughness: 0.8, metalness: 0.1 }), { pos: [0, 4, -0.6], parent: scene });
      const panel = new THREE.Group(); panel.position.set(1.1, 2.1, -0.3); scene.add(panel);
      mesh(roundedBox(5.6, 0.36, 2.5, 0.18, 0.04), M.dark('#121419', 0.35), { rot: [Math.PI / 2, 0, 0], parent: panel });
      mesh(new THREE.PlaneGeometry(5.1, 2.05), new THREE.MeshPhysicalMaterial({ color: col('#020203'), roughness: 0.05, metalness: 0.2, clearcoat: 1 }), { pos: [0, 0, 0.19], parent: panel, shadow: false });
      const onMat = new THREE.MeshBasicMaterial({ color: col('#ff0600').multiplyScalar(1.5), toneMapped: false });
      const offMat = new THREE.MeshBasicMaterial({ color: glowC.clone().multiplyScalar(0.018) });
      const digits = String(p.number ?? 365).slice(0, 4);
      const DW = 1.15, startX = -((digits.length - 1) * DW) / 2 - 0.55;
      [...digits].forEach((ch, di) => {
        const on = DIGITS[ch] || '';
        for (const [s, [x, y, h]] of Object.entries(SEG)) {
          const geo = new THREE.BoxGeometry(h ? 0.54 : 0.12, h ? 0.12 : 0.6, 0.03);
          mesh(geo, on.includes(s) ? onMat : offMat, { pos: [startX + di * DW + x, y * 0.95, 0.21], parent: panel, shadow: false });
        }
      });
      const unit = textPlane(String(p.unit ?? 'DAYS'), 1.25, { w: 512, h: 160, color: '#' + glowC.getHexString(), weight: 800, intensity: 2.2 });
      unit.position.set(1.95, -0.45, 0.22); panel.add(unit);
      const cap = textPlane(String(p.caption ?? 'AI 2027'), 1.1, { w: 512, h: 128, color: '#9aa3b0', weight: 700, letterSpacing: '10px' });
      cap.position.set(1.95, 0.55, 0.22); panel.add(cap);
      const glowLight = new THREE.PointLight(glowC, 10, 8, 1.8); glowLight.position.set(1.1, 0.3, 1.2); scene.add(glowLight);
      const edge = new THREE.PointLight(col('#9fb4ff'), 6, 9, 1.6); edge.position.set(-2.5, 4.2, 1.5); scene.add(edge);
      anchors.hero.set(0.3, 2.1, 0);
      upd = (f) => { onMat.color.set('#ff0600').multiplyScalar(1.5 + 0.15 * Math.sin(f.t * 3.1) * Math.sin(f.t * 1.3)); };
    }

    if (prop === 'stop') {
      addFloor(ctx, base, { reflect: 0.3, color: '#050506' });
      const g = new THREE.Group(); g.position.set(0.2, 0, 0); scene.add(g);
      const haz = hazardTexture();
      mesh(new THREE.CylinderGeometry(1.45, 1.55, 0.7, 96), new THREE.MeshStandardMaterial({ map: haz, roughness: 0.45, metalness: 0.1 }), { pos: [0, 0.35, 0], parent: g });
      mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.04, 96), new THREE.MeshStandardMaterial({ color: col('#f2c11b'), roughness: 0.4 }), { pos: [0, 0.72, 0], parent: g });
      const ringTex = ringLabel(String(p.label ?? 'EMERGENCY STOP').toUpperCase(), '#111111');
      mesh(new THREE.PlaneGeometry(2.9, 2.9), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true }), { pos: [0, 0.745, 0], rot: [-Math.PI / 2, 0, 0], parent: g, shadow: false });
      mesh(new THREE.CylinderGeometry(0.98, 1.02, 0.16, 96), M.metal('#a7afb9', 0.25), { pos: [0, 0.8, 0], parent: g });
      mesh(new THREE.TorusGeometry(0.96, 0.05, 16, 96), M.dark('#14161a', 0.3), { pos: [0, 0.88, 0], rot: [Math.PI / 2, 0, 0], parent: g });
      const btn = new THREE.Group(); btn.position.set(0, 0.88, 0); g.add(btn);
      const redMat = new THREE.MeshPhysicalMaterial({ color: col('#d8100c'), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, emissive: glowC.clone(), emissiveIntensity: 0.18 });
      mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.35, 64), redMat, { pos: [0, 0.17, 0], parent: btn });
      mesh(lathe([[0, 0.33], [0.88, 0.33], [0.92, 0.38], [0.9, 0.46], [0.8, 0.56], [0.6, 0.66], [0.32, 0.72], [0, 0.74]], 128), redMat, { parent: btn });
      const glowLight = new THREE.PointLight(glowC, 10, 6, 1.8); glowLight.position.set(0.2, 2.2, 1.4); scene.add(glowLight);
      anchors.hero.set(0.2, 1.5, 0);
      upd = (f) => {
        const pr = clamp(f.tw('press', 0, 0.3, 0.6));
        btn.position.y = 0.88 - pr * 0.16;
        redMat.emissiveIntensity = 0.16 + 0.1 * Math.sin(f.t * 2.4);
      };
    }

    return { scene, anchors, update(f) { dust.update(f.t); upd(f); } };
  },
};
