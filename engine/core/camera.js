// Camera direction. Each scene template exposes named framings (wide, hero,
// close, top, low ...). A shot picks a start and end framing; the camera moves
// between them on a smooth arc with a touch of organic drift, so no shot is static.
import * as THREE from 'three';
import { clamp, ease, lerp, noise1 } from './util.js';

const PRE = 0.7, POST = 0.7; // movement continues through transition handles

const sph = new THREE.Spherical(), v = new THREE.Vector3();
function toSph(pos, target) {
  v.set(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
  sph.setFromVector3(v);
  return { r: sph.radius, phi: sph.phi, theta: sph.theta };
}

function getFraming(framings, f, fallback) {
  if (!f) return fallback;
  if (typeof f === 'string') return framings[f] || fallback;
  return { fov: 35, ...f };
}

export function shotCameraSpec(tpl, params, cam) {
  const framings = typeof tpl.framings === 'function' ? tpl.framings(params) : (tpl.framings || {});
  const names = Object.keys(framings);
  const first = framings[names[0]] || { pos: [0, 3, 10], target: [0, 1, 0], fov: 35 };
  let spec = cam ?? tpl.defaultCamera ?? { from: names[0], to: names[1] ?? names[0] };
  if (typeof spec === 'string') spec = { from: spec, to: spec };
  const from = getFraming(framings, spec.from, first);
  const to = getFraming(framings, spec.to ?? spec.from, from);
  return { from, to, orbit: spec.orbit ?? (from === to ? 10 : 0), push: spec.push ?? (from === to ? 0.07 : 0), rise: spec.rise ?? 0, ease: spec.ease ?? 'drift', drift: spec.drift ?? 1 };
}

export function applyCamera(camera, spec, t, dur, seed = 0, aspect = 16 / 9) {
  const p0 = clamp((t + PRE) / (dur + PRE + POST));
  const p = (ease[spec.ease] || ease.drift)(p0);
  const A = spec.from, B = spec.to;
  const tx = lerp(A.target[0], B.target[0], p), ty = lerp(A.target[1], B.target[1], p), tz = lerp(A.target[2], B.target[2], p);
  const a = toSph(A.pos, A.target), b = toSph(B.pos, B.target);
  let dTheta = b.theta - a.theta;
  if (dTheta > Math.PI) dTheta -= 2 * Math.PI; else if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
  let r = lerp(a.r, b.r, p) * (1 - spec.push * p);
  let phi = lerp(a.phi, b.phi, p) - (spec.rise * Math.PI / 180) * (p - 0.5);
  let theta = a.theta + dTheta * p + (spec.orbit * Math.PI / 180) * (p - 0.5);
  // organic drift (very low frequency, tiny amplitude)
  const d = spec.drift;
  theta += noise1(t * 0.13, seed + 1) * 0.012 * d;
  phi += noise1(t * 0.11, seed + 2) * 0.008 * d;
  r *= 1 + noise1(t * 0.09, seed + 3) * 0.006 * d;
  phi = clamp(phi, 0.05, Math.PI - 0.05);
  sph.set(r, phi, theta); v.setFromSpherical(sph);
  camera.position.set(tx + v.x, ty + v.y, tz + v.z);
  camera.up.set(0, 1, 0);
  camera.lookAt(tx, ty, tz);
  camera.fov = lerp(A.fov ?? 35, B.fov ?? 35, p);
  camera.aspect = aspect;
  camera.near = 0.05; camera.far = 800;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
