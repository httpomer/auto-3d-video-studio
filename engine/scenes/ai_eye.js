// A machine eye: a heavy lens assembly with a glowing iris that stares at the
// viewer, floating in front of distant city or server lights. Works as a
// thumbnail hero ("AI is watching") and as an in-video shot for surveillance,
// control or "the AI notices" moments.
import * as THREE from 'three';
import { createBase, addDust, M, mesh, canvasTex, col } from '../core/kit.js';
import { clamp, hash1, noise1, anim, ease } from '../core/util.js';

const EYE_Y = 2.2;

function irisTexture(hex) {
  return canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
    const base = g.createRadialGradient(c, c, w * 0.06, c, c, w * 0.5);
    base.addColorStop(0, '#fff1c2'); base.addColorStop(0.1, '#ffb347'); base.addColorStop(0.26, hex); base.addColorStop(0.7, hex); base.addColorStop(0.88, '#200000'); base.addColorStop(1, '#000000');
    g.fillStyle = base; g.beginPath(); g.arc(c, c, w * 0.5, 0, Math.PI * 2); g.fill();
    // radial fibres
    for (let i = 0; i < 260; i++) {
      const a = (i / 260) * Math.PI * 2 + hash1(i) * 0.02, r0 = w * (0.12 + hash1(i + 7) * 0.05), r1 = w * (0.36 + hash1(i + 3) * 0.12);
      g.strokeStyle = `rgba(${hash1(i + 11) > 0.5 ? '255,235,200' : '0,0,0'},${0.12 + hash1(i + 5) * 0.25})`;
      g.lineWidth = 1 + hash1(i + 9) * 3;
      g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.stroke();
    }
    // segmented inner ring (mechanical look)
    g.lineWidth = w * 0.006; g.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.beginPath(); g.arc(c, c, w * 0.3, a, a + 0.18); g.stroke(); }
    g.lineWidth = w * 0.006; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(c, c, w * 0.43, 0, Math.PI * 2); g.stroke();
  });
}

export default {
  name: 'ai_eye',
  description: 'A machine eye: heavy dark lens assembly with concentric steel rings and a glowing iris that stares straight at the viewer, floating in front of out-of-focus city or server lights. Strong thumbnail hero ("AI is watching") and an in-video shot for surveillance, control or "the AI notices" moments.',
  params: {
    color: 'Iris colour: theme key ("danger" default, "accent", "accent2", "warm") or a hex colour',
    background: '"city" (default — distant night city lights) | "servers" (rows of LEDs) | "none"',
    gaze: 'World point [x,y,z] the eye looks at (default straight ahead at the camera axis). For eye contact use the camera position.',
    intensity: '0..1 iris brightness (default 0.85, tweens)',
    open: '0..1 aperture opening of the iris (default 1; tween from 0 to "wake up" the eye)',
  },
  sample: { color: 'danger', background: 'city' },
  framings: {
    close: { pos: [0.5, 2.35, 4.6], target: [0.2, EYE_Y, 0], fov: 34 },
    hero: { pos: [1.4, 2.6, 7], target: [0.4, EYE_Y, 0], fov: 32 },
    wide: { pos: [0, 2.6, 12], target: [0, EYE_Y, 0], fov: 34 },
    side: { pos: [5.2, 2.5, 4.2], target: [0, EYE_Y, 0], fov: 32 },
    low: { pos: [0.8, 0.6, 6.5], target: [0.2, EYE_Y + 0.3, 0], fov: 34 },
    right_third: { pos: [-1.0, 2.3, 6.6], target: [-1.5, EYE_Y, 0], fov: 34 },
    left_third: { pos: [1.0, 2.3, 6.6], target: [1.5, EYE_Y, 0], fov: 34 },
  },
  defaultCamera: { from: 'wide', to: 'close' },
  look: { bloom: 0.4, bloomThreshold: 1.15, bloomRadius: 0.45, vignette: 0.8 },

  build(ctx, p) {
    const { theme } = ctx;
    const iris = col(p.color === 'danger' || !p.color ? '#ff2418' : (theme[p.color] || p.color));
    const irisHex = '#' + iris.getHexString();
    const base = createBase(ctx, { fog: 0.02, glow: 0.02, shadows: false, key: 1.2, rim: 0.5, env: 0.9 });
    const { scene } = base;
    scene.environmentIntensity = 1.0;

    /* ---------- background lights (become bokeh with depth of field) ---------- */
    const bg = p.background || 'city';
    if (bg !== 'none') {
      const n = bg === 'servers' ? 2600 : 1800;
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(bg === 'servers' ? 0.05 : 0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
      const dm = new THREE.Object3D(), c = new THREE.Color();
      const warm = col('#ffb15c'), cool = col('#8fc4ff'), white = col('#fff2dd');
      for (let i = 0; i < n; i++) {
        const z = -18 - hash1(i * 3) * 40;
        let x, y;
        if (bg === 'servers') { const row = Math.floor(hash1(i * 5) * 6); x = (row - 2.5) * 6 + (hash1(i * 7) - 0.5) * 1.2; y = 0.3 + hash1(i * 11) * 4.5; }
        else { x = (hash1(i * 5) - 0.5) * 90; y = Math.pow(hash1(i * 7), 2.2) * 22 * (0.4 + 0.6 * hash1(Math.floor(x / 3) + 99)) - 1; }
        dm.position.set(x, y, z); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix);
        const r = hash1(i * 13);
        c.copy(bg === 'servers' ? (r > 0.8 ? iris : r > 0.4 ? cool : col('#5fe08c')) : (r > 0.7 ? cool : r > 0.15 ? warm : white)).multiplyScalar(0.4 + hash1(i * 17) * 1.0);
        inst.setColorAt(i, c);
      }
      scene.add(inst);
    }
    const dust = addDust(ctx, scene, { count: 260, extent: [10, 6, 8], color: irisHex, alpha: 0.35 });

    /* ---------- the eye ---------- */
    const eye = new THREE.Group(); eye.position.set(0, EYE_Y, 0); scene.add(eye);
    const zAxis = (geo) => { geo.rotateX(Math.PI / 2); return geo; };
    const housing = new THREE.MeshPhysicalMaterial({ color: col('#0b0d11'), metalness: 0.85, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.2 });
    // open-fronted housing: side wall + back plate + front bezel face (the iris sits inside)
    mesh(zAxis(new THREE.CylinderGeometry(1.62, 1.75, 0.7, 96, 1, true)), housing, { pos: [0, 0, -0.32], parent: eye });
    mesh(new THREE.CircleGeometry(1.75, 96), housing, { pos: [0, 0, -0.67], rot: [0, Math.PI, 0], parent: eye });
    mesh(new THREE.RingGeometry(1.36, 1.62, 128), housing, { pos: [0, 0, 0.03], parent: eye });
    mesh(new THREE.CircleGeometry(1.4, 96), new THREE.MeshBasicMaterial({ color: 0x020203 }), { pos: [0, 0, -0.3], parent: eye, shadow: false });
    mesh(new THREE.TorusGeometry(1.62, 0.085, 24, 160), M.metal('#9aa2ad', 0.22), { pos: [0, 0, 0.04], parent: eye });
    mesh(new THREE.TorusGeometry(1.5, 0.03, 12, 160), M.metal('#5c636d', 0.35), { pos: [0, 0, 0.06], parent: eye });
    // bolts around the bezel
    const bolts = new THREE.InstancedMesh(zAxis(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 12)), M.metal('#b9bec6', 0.3), 16);
    const dm = new THREE.Object3D();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; dm.position.set(Math.cos(a) * 1.72, Math.sin(a) * 1.72, -0.05); dm.updateMatrix(); bolts.setMatrixAt(i, dm.matrix); }
    eye.add(bolts);
    // stepped lens barrel
    const rings = [];
    [[1.38, 0.06, 0.0], [1.2, 0.05, -0.08], [1.02, 0.045, -0.15], [0.86, 0.04, -0.21]].forEach(([r, tube, z], i) => {
      const m = mesh(new THREE.TorusGeometry(r, tube, 16, 140), i % 2 ? M.metal('#2a2f37', 0.3) : M.dark('#14171c', 0.35), { pos: [0, 0, z], parent: eye });
      mesh(zAxis(new THREE.CylinderGeometry(r, r, 0.08, 96, 1, true)), new THREE.MeshStandardMaterial({ color: col('#07080a'), metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }), { pos: [0, 0, z - 0.04], parent: eye });
      rings.push(m);
    });
    // thin glowing tracer rings in the iris colour
    const glowRings = [0.95, 0.74].map((r) => mesh(new THREE.TorusGeometry(r, 0.008, 8, 180), M.glow(irisHex, 1.2), { pos: [0, 0, -0.17], parent: eye, shadow: false }));
    // iris + pupil
    const irisMat = new THREE.MeshBasicMaterial({ map: irisTexture(irisHex), toneMapped: false, color: col('#ffffff').multiplyScalar(1.1) });
    const irisDisc = mesh(new THREE.CircleGeometry(0.7, 96), irisMat, { pos: [0, 0, -0.24], parent: eye, shadow: false });
    const pupil = mesh(new THREE.CircleGeometry(0.17, 64), new THREE.MeshBasicMaterial({ color: 0x000000 }), { pos: [0, 0, -0.235], parent: eye, shadow: false });
    const pupilRing = mesh(new THREE.TorusGeometry(0.18, 0.006, 8, 96), M.glow('#ffb347', 1.4), { pos: [0, 0, -0.232], parent: eye, shadow: false });
    // glass dome catches studio reflections
    const dome = mesh(new THREE.SphereGeometry(1.36, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: col('#ffffff'), metalness: 0, roughness: 0.04, transparent: true, opacity: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }), { parent: eye, shadow: false });
    dome.rotation.x = Math.PI / 2; dome.scale.set(1, 0.3, 1); dome.position.z = -0.12;
    const irisLight = new THREE.PointLight(iris, 1.6, 4, 2); irisLight.position.set(0, 0, -0.05); eye.add(irisLight);
    const fill = new THREE.PointLight(iris, 2.5, 14, 1.8); fill.position.set(0, -1.5, 3.5); scene.add(fill);

    const gaze = new THREE.Vector3(...(p.gaze || [0, EYE_Y, 20]));
    const tgt = new THREE.Vector3();
    const anchors = { eye: new THREE.Vector3(0, EYE_Y, 0.1), iris: new THREE.Vector3(0, EYE_Y, -0.2), rim: new THREE.Vector3(1.2, EYE_Y + 1.15, 0) };

    return {
      scene, anchors,
      update(f) {
        const t = f.t;
        dust.update(t);
        const I = clamp(f.tw('intensity', 0.85, 0.2, 1.2));
        const open = clamp(f.tw('open', 1, 0.3, 1.4, ease.outBack));
        // look at the gaze point with tiny mechanical saccades
        tgt.copy(gaze);
        tgt.x += noise1(t * 0.6, 3) * 0.25; tgt.y += noise1(t * 0.5, 7) * 0.15;
        eye.lookAt(tgt);
        rings.forEach((r, i) => { r.rotation.z = t * (i % 2 ? -0.08 : 0.05) * (i + 1); });
        const pulse = 0.92 + 0.08 * Math.sin(t * 2.1) + 0.03 * Math.sin(t * 7.3);
        irisMat.color.setScalar(1.1 * I * pulse);
        irisDisc.scale.setScalar(Math.max(0.05, open));
        irisDisc.rotation.z = t * 0.05;
        const dil = 1 + 0.12 * Math.sin(t * 0.9);
        pupil.scale.setScalar(dil * Math.max(0.05, open)); pupilRing.scale.setScalar(dil * Math.max(0.05, open));
        glowRings.forEach((g, i) => g.material.color.copy(iris).multiplyScalar((0.7 + 0.6 * Math.sin(t * 1.6 + i * 2)) * I));
        irisLight.intensity = 1.6 * I * pulse * open;
        fill.intensity = 2.5 * I;
      },
    };
  },
};
