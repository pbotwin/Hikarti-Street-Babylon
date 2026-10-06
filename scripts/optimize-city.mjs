// Compress the exported city (raw/city-*.glb → public/world/city-*.opt.glb).
//   cast / nocast: full optimisation (instancing, palette, join) for few draw calls.
//   parts: node names and extras (the export's tags) kept: no flatten, join,
//     palette or instancing changes.
// Positions are never quantized: 16-bit over the city is ~6 mm, which broke
// the mm-scale layers (lawn / paving / decals).
//
//   node scripts/optimize-city.mjs
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import * as F from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

for (const name of ['cast', 'nocast', 'parts']) {
  const input = `raw/city-${name}.glb`, output = `public/world/city-${name}.opt.glb`;
  const doc = await io.read(input);
  // Cut-out and see-through textures stay lossless: lossy alpha noise turned
  // leaf canopies into speckles once alpha-tested at 0.5.
  for (const m of doc.getRoot().listMaterials()) {
    const t = m.getAlphaMode() !== 'OPAQUE' && m.getBaseColorTexture();
    if (t && !t.getName().startsWith('alpha:')) t.setName(`alpha:${t.getName()}`);
  }
  const steps = [F.dedup(), F.prune({ keepExtras: true })];
  if (name !== 'parts') steps.push(F.instance({ min: 5 }), F.palette({ min: 5 }), F.flatten(), F.join());
  steps.push(
    F.weld(), F.resample(), F.prune({ keepExtras: true }), F.sparse(),
    F.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], pattern: /^alpha:/, lossless: true }),
    F.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], pattern: /^(?!alpha:)/ }),
    F.reorder({ encoder: MeshoptEncoder }),
    F.quantize({ pattern: /^(?!POSITION$).*/ }),
  );
  await doc.transform(...steps);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(output, doc);
  console.log(output, fs.statSync(output).size);
}
