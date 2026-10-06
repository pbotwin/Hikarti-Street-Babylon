// Compress the exported shop interiors (raw/interior-*.glb → public/world/interior-*.opt.glb).
// Like `gltf-transform optimize`, but the pieces the game moves or re-letters
// stay separate nodes: the sliding doors (door-<i>), the motors turntable
// (with its car) and the name sign; the street-view window panel keeps its
// own material. Everything else is flattened and joined per material.
//
//   node scripts/optimize-interiors.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { clearNodeParent, dedup, join, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const KINDS = ['market', 'cafe', 'boutique', 'books', 'salon', 'motors'];
const MOVING = /^(door-\d+|turntable)$/;
const KEEP = /^(door-\d+|turntable|name-sign)$|street-view$/;

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

for (const kind of KINDS) {
  const doc = await io.read(`raw/interior-${kind}.glb`);
  const root = doc.getRoot();
  const moving = root.listNodes().filter((n) => MOVING.test(n.getName()));
  const inMoving = new Set();
  for (const s of moving) {
    const w = s.getWorldMatrix();
    // Moving parts are only translated, so a child's matrix relative to
    // them is its world matrix less their position.
    if (Math.abs(w[0] - 1) + Math.abs(w[5] - 1) + Math.abs(w[10] - 1) + Math.abs(w[1]) + Math.abs(w[2]) + Math.abs(w[4]) > 1e-6) throw new Error(`${kind}: ${s.getName()} is rotated`);
    const parts = [];
    s.traverse((n) => { if (n !== s && n.getMesh()) parts.push(n); });
    for (const n of parts) {
      const m = [...n.getWorldMatrix()];
      m[12] -= w[12]; m[13] -= w[13]; m[14] -= w[14];
      n.getParentNode()?.removeChild(n);
      n.setMatrix(m);
      s.addChild(n);
      inMoving.add(n);
    }
    clearNodeParent(s);
  }
  for (const n of root.listNodes()) {
    if (n.getMesh() && !inMoving.has(n) && !moving.includes(n)) clearNodeParent(n);
    // Only the named pieces stay apart when joining.
    if (!KEEP.test(n.getName())) { n.setName(''); n.getMesh()?.setName(''); }
  }
  // Empty group nodes left behind.
  for (const n of root.listNodes()) if (!n.getMesh() && !n.listChildren().length && !KEEP.test(n.getName())) n.dispose();
  await doc.transform(
    dedup(),
    join({ keepNamed: true }),
    weld(),
    // Keep uvs on untextured meshes: the street-view panel gets its texture at runtime.
    prune({ keepAttributes: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  await io.write(`public/world/interior-${kind}.opt.glb`, doc);
  console.log(kind, root.listNodes().length, 'nodes', root.listMeshes().length, 'meshes');
}
