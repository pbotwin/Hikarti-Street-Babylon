import { Mesh, VertexData, VertexBuffer, Matrix, Vector3, PBRMaterial, MaterialPluginBase, TransformNode } from '@babylonjs/core';

/**
 * Geometry tools for the drivable vehicles (Blender GLBs, see CarModel /
 * BikeModel). Source meshes are baked into vehicle space as plain arrays
 * ("parts": pos, nrm, idx, optional col / rm, material, cast) and only become
 * Babylon meshes once merged: plain surfaces of a part of the vehicle share
 * one vertex-coloured mesh, and parked vehicles away from the camera draw a
 * merged far model.
 */

const pending = new WeakMap();   // node -> parts waiting for mergeMaterials

/** Queue a baked part to become a mesh under `node` (see mergeMaterials). */
export function addPart(node, part) {
  if (!pending.has(node)) pending.set(node, []);
  pending.get(node).push(part);
}

/**
 * Bake a source mesh into another frame (`matrix`: mesh space → target
 * space). `index` replaces the mesh's own index (a simplified one); only the
 * vertices it uses are kept.
 */
export function bakePart(mesh, matrix, index = null) {
  const p = mesh.getVerticesData(VertexBuffer.PositionKind);
  const n = mesh.getVerticesData(VertexBuffer.NormalKind);
  const col = mesh.getVerticesData(VertexBuffer.ColorKind);
  const rm = mesh.getVerticesData('rm');
  const src = index || mesh.getIndices();
  // Compact: source vertex -> new vertex, in first-use order.
  const remap = new Int32Array(p.length / 3).fill(-1);
  let count = 0;
  const idx = new Uint32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (remap[v] < 0) remap[v] = count++;
    idx[i] = remap[v];
  }
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3);
  const outCol = col ? new Float32Array(count * 4) : null, outRm = rm ? new Float32Array(count * 2) : null;
  const m = matrix.m;
  for (let v = 0; v < remap.length; v++) {
    const o = remap[v];
    if (o < 0) continue;
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    pos[o * 3] = x * m[0] + y * m[4] + z * m[8] + m[12];
    pos[o * 3 + 1] = x * m[1] + y * m[5] + z * m[9] + m[13];
    pos[o * 3 + 2] = x * m[2] + y * m[6] + z * m[10] + m[14];
    const nx = n[v * 3], ny = n[v * 3 + 1], nz = n[v * 3 + 2];
    const tx = nx * m[0] + ny * m[4] + nz * m[8], ty = nx * m[1] + ny * m[5] + nz * m[9], tz = nx * m[2] + ny * m[6] + nz * m[10];
    const l = Math.hypot(tx, ty, tz) || 1;
    nrm[o * 3] = tx / l; nrm[o * 3 + 1] = ty / l; nrm[o * 3 + 2] = tz / l;
    if (outCol) for (let k = 0; k < 4; k++) outCol[o * 4 + k] = col[v * 4 + k];
    if (outRm) { outRm[o * 2] = rm[v * 2]; outRm[o * 2 + 1] = rm[v * 2 + 1]; }
  }
  return { name: mesh.name, pos, nrm, idx, col: outCol, rm: outRm, mat: mesh.material, cast: !!mesh.metadata?.cast };
}

/** One part from several with the same material and attributes. */
function concatParts(parts, mat) {
  let nv = 0, ni = 0;
  for (const q of parts) { nv += q.pos.length / 3; ni += q.idx.length; }
  const out = {
    name: parts[0].name, mat, cast: parts.some((q) => q.cast),
    pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), idx: new Uint32Array(ni),
    col: parts[0].col ? new Float32Array(nv * 4) : null, rm: parts[0].rm ? new Float32Array(nv * 2) : null,
  };
  let v = 0, i = 0;
  for (const q of parts) {
    out.pos.set(q.pos, v * 3);
    out.nrm.set(q.nrm, v * 3);
    if (out.col) out.col.set(q.col, v * 4);
    if (out.rm) out.rm.set(q.rm, v * 2);
    for (let k = 0; k < q.idx.length; k++) out.idx[i + k] = q.idx[k] + v;
    v += q.pos.length / 3;
    i += q.idx.length;
  }
  return out;
}

/**
 * Per-vertex roughness / metalness for the merged material: the shader reads
 * them from the `rm` attribute instead of the material's uniforms.
 */
class VertexRoughMetal extends MaterialPluginBase {
  constructor(material) {
    super(material, 'VertexRoughMetal', 200, { VERTEX_RM: false }, true, true);
  }

  prepareDefines(defines) { defines.VERTEX_RM = true; }

  getClassName() { return 'VertexRoughMetal'; }

  getAttributes(attributes) { attributes.push('rm'); }

  getCustomCode(shaderType) {
    return shaderType === 'vertex'
      ? { CUSTOM_VERTEX_DEFINITIONS: 'attribute vec2 rm;\nvarying vec2 vRM;', CUSTOM_VERTEX_MAIN_END: 'vRM = rm;' }
      : { CUSTOM_FRAGMENT_DEFINITIONS: 'varying vec2 vRM;', CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: 'metallicRoughness = vec2(vRM.y, vRM.x);' };
  }
}

/**
 * Sky reflections like the city: glossy surfaces (glass, paint, metal, or
 * smooth) reflect the sky strongly, matte ones take a soft ambient.
 */
export function applyEnvironment(mat) {
  const glossy = /glass|carPaint|metal|satin|chrome/i.test(mat.name) || (mat.roughness ?? 1) < 0.3;
  mat.environmentIntensity = glossy ? 0.9 : 0.35;
}

/**
 * One material for every plain (untextured, opaque, non-glowing) surface of
 * a part: base colour goes into vertex colours and roughness / metalness
 * into a per-vertex attribute the shader reads, so paint stays glossy and
 * tyres matte while the part draws in one call instead of ten or more.
 */
const _merged = new Map();
function mergedMaterial(doubleSided, scene) {
  if (_merged.has(doubleSided)) return _merged.get(doubleSided);
  const m = new PBRMaterial('carPaint', scene);
  m.metallic = 1;
  m.roughness = 1;
  m.backFaceCulling = !doubleSided;
  m.twoSidedLighting = doubleSided;
  new VertexRoughMetal(m);
  applyEnvironment(m);
  _merged.set(doubleSided, m);
  return m;
}

const mergeable = (q) => !q.rm && q.mat instanceof PBRMaterial && !q.mat.albedoTexture
  && q.mat.alpha >= 1 && !q.mat.needAlphaBlending() && !(q.mat.emissiveColor.toLuminance() > 0 && q.mat.emissiveIntensity > 0);

/** Plain parts → one vertex-coloured part per sidedness (two or more only); others unchanged. */
function mergePlain(parts, scene) {
  const out = [], groups = new Map();
  for (const q of parts) {
    if (!mergeable(q)) { out.push(q); continue; }
    const ds = !q.mat.backFaceCulling;
    if (!groups.has(ds)) groups.set(ds, []);
    groups.get(ds).push(q);
  }
  for (const [ds, list] of groups) {
    if (list.length < 2) { out.push(...list); continue; }
    for (const q of list) {
      const n = q.pos.length / 3, c = q.mat.albedoColor;
      q.col = new Float32Array(n * 4);
      q.rm = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        q.col[i * 4] = c.r; q.col[i * 4 + 1] = c.g; q.col[i * 4 + 2] = c.b; q.col[i * 4 + 3] = 1;
        q.rm[i * 2] = q.mat.roughness ?? 1; q.rm[i * 2 + 1] = q.mat.metallic ?? 1;
      }
    }
    out.push(concatParts(list, mergedMaterial(ds, scene)));
  }
  return out;
}

/** A Babylon mesh for a part, under `parent`. */
function meshFromPart(q, parent, scene) {
  const mesh = new Mesh(q.name, scene);
  const vd = new VertexData();
  vd.positions = q.pos;
  vd.normals = q.nrm;
  vd.indices = q.idx;
  if (q.col) vd.colors = q.col;
  vd.applyToMesh(mesh);
  if (q.rm) mesh.setVerticesData('rm', q.rm, false, 2);
  mesh.material = q.mat;
  // Source materials come from an asset container: register them with the scene.
  if (!scene.materials.includes(q.mat)) { scene.addMaterial(q.mat); applyEnvironment(q.mat); }
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.metadata = { cast: q.cast };
  return mesh;
}

/** Turn the parts queued for `parent` into meshes, plain surfaces merged into one. */
export function mergeMaterials(parent) {
  const parts = pending.get(parent);
  if (!parts) return [];
  pending.delete(parent);
  const scene = parent.getScene();
  return mergePlain(parts, scene).map((q) => meshFromPart(q, parent, scene));
}

/** Fresh world matrix of a node (and its ancestors): Babylon caches them per frame. */
export function syncWorld(node) {
  if (node.parent) syncWorld(node.parent);
  return node.computeWorldMatrix(true);
}

/** World position of a node, current this frame. */
export function worldPosition(node, out) {
  return syncWorld(node).getTranslationToRef(out);
}

/** Local transforms of a node chained up to the top of its tree (vehicle space while building). */
export function treeMatrix(node, out = new Matrix()) {
  const l = new Matrix();
  out.copyFrom(Matrix.IdentityReadOnly);
  for (let n = node; n; n = n.parent) {
    const q = n.rotationQuaternion;
    if (q) Matrix.ComposeToRef(n.scaling, q, n.position, l);
    else Matrix.ComposeToRef(n.scaling, n.rotation.toQuaternion(), n.position, l);
    out.multiplyToRef(l, out);
  }
  return out;
}

/**
 * Far level of detail: body and wheels baked into chassis space and merged,
 * one draw per material instead of ~25 (doors, wheels and steering are
 * separate meshes so they can move). Shown for parked vehicles away from the
 * camera, where nothing moves, so it looks identical. `skip` subtrees (cabin
 * detail, already hidden at distance) are left out.
 */
export function buildFarModel(chassis, roots, skip = []) {
  const scene = chassis.getScene();
  const inv = Matrix.Invert(syncWorld(chassis));
  const skipSet = new Set(skip.filter(Boolean));
  const rel = new Matrix();
  const parts = [];
  const visit = (o) => {
    if (skipSet.has(o) || !o.isEnabled(false)) return;
    o.computeWorldMatrix(true);
    if (o instanceof Mesh && o.getTotalVertices() > 0) {
      o.getWorldMatrix().multiplyToRef(inv, rel);
      parts.push(bakePart(o, rel));
    }
    for (const c of o.getChildren()) visit(c);
  };
  for (const r of roots) { syncWorld(r); visit(r); }
  // Plain surfaces → one vertex-coloured part (parts already merged that way
  // carry per-vertex roughness / metalness and are not re-baked); then
  // everything merged per material.
  const byMat = new Map();
  for (const q of mergePlain(parts, scene)) {
    if (!byMat.has(q.mat)) byMat.set(q.mat, []);
    byMat.get(q.mat).push(q);
  }
  const far = new TransformNode('far', scene);
  far.parent = chassis;
  const attrs = (q) => `${!!q.col}${!!q.rm}`;
  for (const [mat, list] of byMat) {
    const groups = list.length > 1 && list.every((q) => attrs(q) === attrs(list[0])) ? [concatParts(list, mat)] : list;
    for (const q of groups) meshFromPart(q, far, scene);
  }
  far.setEnabled(false);
  return far;
}

/**
 * Bounding box of every mesh below `node`, in the space at the top of its
 * tree (vehicle space while building): mesh boxes transformed, as three's
 * Box3.setFromObject does.
 */
export function boundsOf(node) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const m = new Matrix();
  for (const mesh of node.getChildMeshes(false)) {
    if (!mesh.getTotalVertices()) continue;
    treeMatrix(mesh, m);
    for (const c of mesh.getBoundingInfo().boundingBox.vectors) {
      const p = Vector3.TransformCoordinates(c, m);
      min[0] = Math.min(min[0], p.x); min[1] = Math.min(min[1], p.y); min[2] = Math.min(min[2], p.z);
      max[0] = Math.max(max[0], p.x); max[1] = Math.max(max[1], p.y); max[2] = Math.max(max[2], p.z);
    }
  }
  return { min, max };
}
