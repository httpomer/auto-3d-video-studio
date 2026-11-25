// Third-party 3D assets that are not committed to git (licensing / size): downloaded on first use.
// The human characters come from the three.js example models (Mixamo characters and a Ready Player Me
// avatar). They are used only rendered into video frames, never redistributed as files.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ensureDir } from './paths.js';

const BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/';
const HUMANS = ['Michelle.glb', 'readyplayer.me.glb', 'Soldier.glb'];

export async function ensureAssets({ log = console.log } = {}) {
  const dir = ensureDir(path.join(ROOT, 'engine', 'assets', 'humans'));
  for (const f of HUMANS) {
    const file = path.join(dir, f);
    if (fs.existsSync(file) && fs.statSync(file).size > 1000) continue;
    log(`  downloading 3D character ${f}`);
    const res = await fetch(BASE + f);
    if (!res.ok) throw new Error(`could not download ${f}: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
}
