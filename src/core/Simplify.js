import { VertexBuffer } from '@babylonjs/core';
import { MeshoptSimplifier } from 'meshoptimizer';

/** Resolves once the simplifier (WebAssembly) is usable; await before simplifying. */
export const simplifierReady = MeshoptSimplifier.ready;

const cache = new WeakMap();   // source geometry -> { key -> simplified index | null }

/**
 * Fewer triangles for an indexed Babylon geometry (meshoptimizer): returns
 * a new index into the source's own vertices, so the vertex data is shared.
 * `error` is the allowed deviation relative to the mesh's size; `ratio` the
 * triangle share to aim for (0 = as few as the error allows); `prune` also
 * drops small disconnected bits; `normals` (a weight) keeps triangles where
 * the surface normal changes, so shading and reflections stay as they were
 * (needed for anything seen up close). Returns null when the mesh can't be
 * reduced by at least `minGain` (e.g. loose leaf cards). Cached per source
 * geometry and settings.
 */
export function simplifyGeometry(geometry, { ratio = 0, error = 0.01, prune = false, normals = 0, minGain = 0.3 } = {}) {
  const key = `${ratio}|${error}|${prune}|${normals}|${minGain}`;
  let byKey = cache.get(geometry);
  if (!byKey) cache.set(geometry, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key);

  let result = null;
  const src = geometry.getIndices();
  const pos = geometry.getVerticesData(VertexBuffer.PositionKind);
  if (src?.length && pos) {
    const index = new Uint32Array(src);
    const position = Float32Array.from(pos);
    const target = Math.floor(index.length * ratio / 3) * 3;
    const flags = prune ? ['Prune'] : [];
    const nrm = normals ? geometry.getVerticesData(VertexBuffer.NormalKind) : null;
    const [lod] = nrm
      ? MeshoptSimplifier.simplifyWithAttributes(index, position, 3, Float32Array.from(nrm), 3, [normals, normals, normals], null, target, error, flags)
      : MeshoptSimplifier.simplify(index, position, 3, target, error, flags);
    if (lod.length <= index.length * (1 - minGain)) result = lod;
  }
  byKey.set(key, result);
  return result;
}
