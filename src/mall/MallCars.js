import { Mesh, Quaternion } from '@babylonjs/core';
import { parkedCars, PARKED_MODELS } from './MallPlan.js';
import { simplifyGeometry } from '../core/Simplify.js';
import { writeTRS } from '../world/Instances.js';

/**
 * The parked cars in Hikari Mall's lot: the city's own parked models (their
 * merged far models, same materials, so no new shaders) simplified again,
 * one thin instance per car, in two levels of detail. As they were, forty
 * cars drew 3.6 million triangles (bodies ~44k, lamp lenses ~26k each).
 * Near the camera a body keeps its shape within ~4 mm (~12k triangles);
 * beyond NEAR m it is a ~2k-triangle silhouette with its lamps. The clear
 * lamp lenses are left out (they resist simplifying and show nothing).
 * Cars are re-sorted between the levels when the camera has moved a little;
 * a car turns detailed within NEAR and simple again only beyond FAR, so one
 * near the line doesn't swap back and forth as the camera sways.
 */
const NEAR = 22, FAR = 26;
const RESORT = 2;            // camera travel (m) before re-sorting
// Simplification per level (relative error; lamps get 2.5× the body's) and the parts left out.
const LEVELS = [
  { error: 0.004, normals: 1, skip: /lensGlass/ },
  { error: 0.02, normals: 0, skip: /lensGlass|tailLens/ },
];
const _q = new Quaternion();

export class MallCars {
  /** `vehicles`: the city's VehicleSystem; `site`: the SiteBuilder (frame, collisions). */
  constructor(site, vehicles) {
    this.root = site.root;
    this.models = [];
    this.meshes = [];
    this.casters = [];
    this._at = { x: Infinity, z: Infinity };
    const list = parkedCars();
    for (const type of PARKED_MODELS) {
      const v = vehicles.vehicles.find((c) => c.type === type && c.far);
      const cars = list.filter((c) => c.model === type);
      if (!v || !cars.length) continue;
      for (const c of cars) {
        const ca = Math.abs(Math.cos(c.yaw)), sa = Math.abs(Math.sin(c.yaw));
        const hx = (v.dims.w * ca + v.dims.len * sa) / 2, hz = (v.dims.w * sa + v.dims.len * ca) / 2;
        site.collide(c.x - hx, c.z - hz, c.x + hx, c.z + hz, 0, v.dims.h, { climb: true });
      }
      const model = { cars, levels: [] };
      LEVELS.forEach(({ error, normals, skip }, li) => {
        // Every car in each level's buffer to begin with (the bounds, the warm-up draw); update() splits them.
        const matrices = new Float32Array(cars.length * 16);
        cars.forEach((c, i) => {
          _q.set(0, Math.sin(c.yaw / 2), 0, Math.cos(c.yaw / 2));
          writeTRS(matrices, i * 16, c.x, 0, c.z, _q);
        });
        const meshes = [];
        for (const src of v.far.getChildMeshes(false)) {
          const name = src.material?.name || '';
          if (!src.getTotalVertices() || skip.test(name)) continue;
          const body = name === 'carPaint';
          const m = lowPoly(src, `mall:parked:${type}:${li}:${name}`, { error: body ? error : error * 2.5, normals, prune: true });
          if (!m) continue;
          m.parent = this.root;
          m.thinInstanceSetBuffer('matrix', matrices, 16, false);
          m.thinInstanceRefreshBoundingInfo(false);
          m.doNotSyncBoundingInfo = true;
          m.computeWorldMatrix(true);
          m.freezeWorldMatrix();
          meshes.push(m);
          // The body casts; glass and lamps are too small or clear to.
          if (body) this.casters.push(m);
        }
        model.levels.push({ meshes, matrices });
        this.meshes.push(...meshes);
      });
      this.models.push(model);
    }
  }

  /** Per frame: near cars detailed, the rest simple (`eye` in world coordinates). */
  update(eye, origin) {
    const x = origin.x - eye.x, z = origin.z - eye.z;
    if (Math.abs(x - this._at.x) < RESORT && Math.abs(z - this._at.z) < RESORT) return;
    this._at.x = x; this._at.z = z;
    for (const model of this.models) {
      const [near, far] = model.levels;
      let n = 0, f = 0;
      for (const c of model.cars) {
        const r = c.near ? FAR : NEAR;
        c.near = (c.x - x) ** 2 + (c.z - z) ** 2 < r * r;
        const lvl = c.near ? near : far;
        _q.set(0, Math.sin(c.yaw / 2), 0, Math.cos(c.yaw / 2));
        writeTRS(lvl.matrices, (lvl === near ? n++ : f++) * 16, c.x, 0, c.z, _q);
      }
      for (const m of near.meshes) { m.thinInstanceCount = n; m.thinInstanceBufferUpdated('matrix'); }
      for (const m of far.meshes) { m.thinInstanceCount = f; m.thinInstanceBufferUpdated('matrix'); }
    }
  }
}

/**
 * A simplified copy of a mesh (its material, every vertex attribute it has),
 * keeping only the vertices the simplified triangles use (null if nothing is left).
 */
function lowPoly(src, name, opts) {
  const index = simplifyGeometry(src.geometry, { ...opts, minGain: 0 }) || src.getIndices();
  if (!index.length) return null;               // pruned away: too small to show
  const remap = new Map(), order = [];
  const indices = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i++) {
    let v = remap.get(index[i]);
    if (v === undefined) { v = order.length; remap.set(index[i], v); order.push(index[i]); }
    indices[i] = v;
  }
  const mesh = new Mesh(name, src.getScene());
  for (const kind of src.getVerticesDataKinds()) {
    const data = src.getVerticesData(kind), size = src.getVertexBuffer(kind).getSize();
    const out = new Float32Array(order.length * size);
    order.forEach((o, i) => { for (let k = 0; k < size; k++) out[i * size + k] = data[o * size + k]; });
    mesh.setVerticesData(kind, out, false, size);
  }
  mesh.setIndices(indices);
  mesh.material = src.material;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}
