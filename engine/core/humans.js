// Realistic human figures for crowd scenes. Rigged characters (glTF) are loaded once, posed
// (an idle animation frame, or arms lowered out of a T-/A-pose) and BAKED into static geometry,
// normalised to stand 1 unit tall with the feet at y = 0, facing +Z. Scenes then instance the baked
// parts cheaply (hundreds of people at once). Models live in engine/assets/humans/ (pipeline/assets.js
// downloads them when missing).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export const HUMANS = {
  // Mixamo "Michelle" — woman in casual clothes (T-pose with the arms lowered)
  michelle: { file: 'Michelle.glb', clip: 'TPose', time: 0, arms: true },
  // Ready Player Me avatar — man in casual clothes (A-pose with the arms lowered)
  casual: { file: 'readyplayer.me.glb', arms: true },
  // Mixamo "Vanguard" — armoured soldier (not in the default mix; ask for it explicitly)
  soldier: { file: 'Soldier.glb', clip: 'Idle', time: 0.6, rotY: Math.PI, optional: true },
};
/** Characters used when a scene doesn't name any (ordinary people in everyday clothes). */
export const DEFAULT_PEOPLE = Object.keys(HUMANS).filter((k) => !HUMANS[k].optional);

const baked = new Map();

/** Load + bake the requested characters (cached). Call before building a scene that uses them. */
export async function preloadHumans(names = DEFAULT_PEOPLE) {
  const draco = new DRACOLoader().setDecoderPath('/node_modules/three/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  await Promise.all(names.filter((n) => HUMANS[n] && !baked.has(n)).map(async (n) => {
    const def = HUMANS[n];
    const gltf = await loader.loadAsync(`/engine/assets/humans/${def.file}`);
    baked.set(n, bake(gltf, def));
  }));
}

/** Baked parts [{ geometry, material }] of a character, or null when not loaded. */
export const getHuman = (name) => baked.get(name) || null;

const v = new THREE.Vector3(), n = new THREE.Vector3(), tmp = new THREE.Vector3();
const m4 = new THREE.Matrix4(), m3 = new THREE.Matrix3(), acc = new THREE.Matrix4();

function lowerArms(root) {
  // rig-agnostic: rotate each upper arm so it points down along the body (slightly out and forward)
  root.updateMatrixWorld(true);
  const bones = [];
  root.traverse((o) => { if (o.isBone) bones.push(o); });
  for (const side of ['Left', 'Right']) {
    const arm = bones.find((b) => new RegExp(`${side}Arm$`).test(b.name));
    const fore = bones.find((b) => new RegExp(`${side}ForeArm$`).test(b.name));
    if (!arm || !fore) continue;
    const a = new THREE.Vector3().setFromMatrixPosition(arm.matrixWorld);
    const f = new THREE.Vector3().setFromMatrixPosition(fore.matrixWorld);
    const cur = f.clone().sub(a).normalize();
    const out = Math.sign(cur.x) || (side === 'Left' ? 1 : -1);
    const want = new THREE.Vector3(out * 0.2, -1, 0.06).normalize();
    const qw = new THREE.Quaternion().setFromUnitVectors(cur, want);
    // world-space delta → local: q_local' = parentWorld^-1 * qw * boneWorld
    const pw = new THREE.Quaternion(); arm.parent.getWorldQuaternion(pw);
    const bw = new THREE.Quaternion(); arm.getWorldQuaternion(bw);
    arm.quaternion.copy(pw.clone().invert().multiply(qw).multiply(bw));
    arm.updateMatrixWorld(true);
    // a slight natural bend at the elbow
    const hand = bones.find((b) => new RegExp(`${side}Hand$`).test(b.name));
    if (hand) {
      fore.updateMatrixWorld(true);
      const f2 = new THREE.Vector3().setFromMatrixPosition(fore.matrixWorld), h2 = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
      const c2 = h2.sub(f2).normalize(), w2 = new THREE.Vector3(out * 0.12, -1, 0.3).normalize();
      const q2 = new THREE.Quaternion().setFromUnitVectors(c2, w2);
      const pw2 = new THREE.Quaternion(); fore.parent.getWorldQuaternion(pw2);
      const bw2 = new THREE.Quaternion(); fore.getWorldQuaternion(bw2);
      fore.quaternion.copy(pw2.clone().invert().multiply(q2).multiply(bw2));
      fore.updateMatrixWorld(true);
    }
  }
}

function bakeMesh(mesh) {
  const src = mesh.geometry, pos = src.attributes.position, nor = src.attributes.normal;
  const count = pos.count, P = new Float32Array(count * 3), N = new Float32Array(count * 3);
  const world = mesh.matrixWorld, nWorld = new THREE.Matrix3().getNormalMatrix(world);
  const skinned = mesh.isSkinnedMesh;
  const si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
  for (let i = 0; i < count; i++) {
    if (skinned) {
      mesh.getVertexPosition(i, v);
      if (nor) {
        // skin the normal with the same blended bone matrices
        acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k); if (!w) continue;
          const b = si.getComponent(i, k);
          m4.multiplyMatrices(mesh.skeleton.bones[b].matrixWorld, mesh.skeleton.boneInverses[b]);
          for (let e = 0; e < 16; e++) acc.elements[e] += m4.elements[e] * w;
        }
        m4.multiplyMatrices(mesh.bindMatrixInverse, acc).multiply(mesh.bindMatrix);
        m3.setFromMatrix4(m4);
        n.fromBufferAttribute(nor, i).applyMatrix3(m3);
      }
    } else { v.fromBufferAttribute(pos, i); if (nor) n.fromBufferAttribute(nor, i); }
    v.applyMatrix4(world);
    P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    if (nor) { n.applyMatrix3(nWorld).normalize(); N[i * 3] = n.x; N[i * 3 + 1] = n.y; N[i * 3 + 2] = n.z; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (nor) g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv.clone());
  if (src.index) g.setIndex(src.index.clone());
  if (!nor) g.computeVertexNormals();
  return g;
}

function bake(gltf, def) {
  const root = gltf.scene;
  if (def.clip) {
    const clip = gltf.animations.find((a) => a.name === def.clip);
    if (clip) { const mixer = new THREE.AnimationMixer(root); mixer.clipAction(clip).play(); mixer.setTime(def.time ?? 0); }
  }
  root.updateMatrixWorld(true);
  if (def.arms) lowerArms(root);
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || (def.onlySkinned && !o.isSkinnedMesh)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const geo = bakeMesh(o);
    if (mats.length === 1) parts.push({ geometry: geo, material: mats[0] });
    else mats.forEach((mat, gi) => { const g2 = geo.clone(); g2.clearGroups(); const gr = o.geometry.groups[gi]; if (gr) g2.setDrawRange(gr.start, gr.count); parts.push({ geometry: g2, material: mat }); });
  });
  // normalise: 1 unit tall, feet on y = 0, centred on the origin
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const size = box.getSize(tmp.set(0, 0, 0)), s = 1 / size.y;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  for (const p of parts) {
    p.geometry.translate(-cx, -box.min.y, -cz); p.geometry.scale(s, s, s);
    if (def.rotY) p.geometry.rotateY(def.rotY);
    p.geometry.computeBoundingBox(); p.geometry.computeBoundingSphere();
    const mat = p.material.clone();
    if (mat.isMeshStandardMaterial) { mat.envMapIntensity = 0.9; }
    p.material = mat;
  }
  return parts;
}
