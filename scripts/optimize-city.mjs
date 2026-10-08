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

/**
 * Wrap a palette step so layered materials (extras.offset: road paint,
 * tactile paving…) keep their own material: palette ignores extras and merged
 * them into plain colours, dropping the polygon offset. Palette skips
 * primitives without a material, so theirs is detached around it.
 */
function keepLayers(palette) {
  const held = new Map();
  const detach = (doc) => {
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
      const m = prim.getMaterial();
      if (m?.getExtras().offset) { held.set(prim, m); prim.setMaterial(null); }
    }
  };
  const attach = () => { for (const [prim, m] of held) prim.setMaterial(m); held.clear(); };
  return [detach, palette, attach];
}

// Meshes under SPLIT_MIN triangles are not worth a draw call per chunk or
// cell: kept city-wide, chunks and cells cost ~60 more draws for little.
const SPLIT_MIN = 20000;

/**
 * Wrap flatten and join so big meshes keep the original's culling chunks
 * (the neighbourhood's `City:x:z` groups): flatten moves every mesh to the
 * scene root, and join then merged each material across the whole city into
 * one mesh (`neighborhood:matte`, 246k triangles, drawn and shadowed from
 * anywhere). Each chunk's meshes go back under one group per chunk, so join
 * merges within a chunk only and Babylon culls the chunks as three did; what
 * stays small (signs, windows, wood) is joined city-wide again.
 */
function keepChunks(flatten, join) {
  const chunkOf = new Map();
  const record = (doc) => {
    for (const scene of doc.getRoot().listScenes()) scene.traverse((node) => {
      if (!node.getMesh()) return;
      for (let p = node.getParentNode(); p; p = p.getParentNode()) {
        if (/^City:\d+:\d+$/.test(p.getName())) { chunkOf.set(node, p.getName()); break; }
      }
    });
  };
  const regroup = (doc) => {
    for (const scene of doc.getRoot().listScenes()) {
      const groups = new Map();
      for (const node of scene.listChildren()) {
        const chunk = chunkOf.get(node);
        if (!chunk) continue;
        if (!groups.has(chunk)) { const g = doc.createNode(chunk); scene.addChild(g); groups.set(chunk, g); }
        scene.removeChild(node);
        groups.get(chunk).addChild(node);
      }
    }
  };
  const ungroupSmall = (doc) => {
    for (const scene of doc.getRoot().listScenes()) {
      for (const group of scene.listChildren()) {
        if (!/^City:\d+:\d+$/.test(group.getName())) continue;
        for (const node of group.listChildren()) {
          if (triangles(node.getMesh()) >= SPLIT_MIN) continue;
          group.removeChild(node);
          scene.addChild(node);
        }
      }
    }
  };
  return [record, flatten, regroup, join, ungroupSmall, join];
}

const triangles = (mesh) => (mesh ? mesh.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0) : 0);

/**
 * Split big meshes at the scene root that span the city (the original's main
 * street was one batch per material: `city:satin`, 138k triangles from
 * z = -74 to 480, drawn and shadowed from anywhere) into CELL-metre squares
 * by triangle centre, so Babylon culls them like the chunks. Each cell keeps
 * only the vertices its triangles use. Meshes under SPLIT_MIN triangles stay
 * whole (splitting every small material cost ~140 more draw calls).
 */
const CELL = 80;
function splitCells(doc) {
  for (const scene of doc.getRoot().listScenes()) for (const node of scene.listChildren()) {
    const mesh = node.getMesh();
    if (!mesh || node.getExtension('EXT_mesh_gpu_instancing')) continue;
    const m = node.getWorldMatrix();
    const cells = new Map();   // cell key -> new mesh
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), index = prim.getIndices();
      if (!index || prim.getMode() !== 4 || index.getCount() < SPLIT_MIN * 3) continue;
      const p = pos.getArray(), idx = index.getArray();
      const tris = new Map();   // cell key -> triangle corners
      for (let t = 0; t < idx.length; t += 3) {
        let x = 0, z = 0;
        for (let k = 0; k < 3; k++) {
          const v = idx[t + k] * 3;
          x += m[0] * p[v] + m[4] * p[v + 1] + m[8] * p[v + 2] + m[12];
          z += m[2] * p[v] + m[6] * p[v + 1] + m[10] * p[v + 2] + m[14];
        }
        const key = `${Math.floor(x / 3 / CELL)}:${Math.floor(z / 3 / CELL)}`;
        if (!tris.has(key)) tris.set(key, []);
        tris.get(key).push(idx[t], idx[t + 1], idx[t + 2]);
      }
      if (tris.size < 2) continue;
      for (const [key, corners] of tris) {
        if (!cells.has(key)) {
          const part = doc.createMesh(mesh.getName());
          cells.set(key, part);
          scene.addChild(doc.createNode(node.getName()).setMatrix(node.getMatrix()).setMesh(part).setExtras(node.getExtras()));
        }
        cells.get(key).addPrimitive(subsetPrimitive(doc, prim, corners));
      }
      mesh.removePrimitive(prim);
    }
  }
}

/** A copy of `prim` drawing only the triangles `corners` (vertex indices), with just the vertices they use. */
function subsetPrimitive(doc, prim, corners) {
  const remap = new Map();
  const index = new Uint32Array(corners.length);
  corners.forEach((v, i) => {
    if (!remap.has(v)) remap.set(v, remap.size);
    index[i] = remap.get(v);
  });
  const out = doc.createPrimitive().setMode(prim.getMode()).setMaterial(prim.getMaterial())
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(index).setBuffer(prim.getIndices().getBuffer()));
  for (const semantic of prim.listSemantics()) {
    const src = prim.getAttribute(semantic), size = src.getElementSize(), a = src.getArray();
    const dst = new a.constructor(remap.size * size);
    for (const [from, to] of remap) for (let k = 0; k < size; k++) dst[to * size + k] = a[from * size + k];
    out.setAttribute(semantic, doc.createAccessor().setType(src.getType()).setArray(dst).setNormalized(src.getNormalized()).setBuffer(src.getBuffer()));
  }
  return out;
}

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
  if (name !== 'parts') steps.push(F.instance({ min: 5 }), ...keepLayers(F.palette({ min: 5 })), ...keepChunks(F.flatten(), F.join()), splitCells);
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
