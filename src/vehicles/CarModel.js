import { TransformNode, Matrix, Quaternion, Color3, Mesh, PBRMaterial } from '@babylonjs/core';
import { VehicleAssets } from './VehicleAssets.js';
import { addPart, bakePart, mergeMaterials, treeMatrix, boundsOf } from './VehicleKit.js';
import { simplifyGeometry } from '../core/Simplify.js';

const MARKER = /^(seat_|stand_|foot_|grip_|handle_)/;

/**
 * Builds a drivable car from a Blender car GLB (tools/blender/cars/*): the
 * file keeps a named hierarchy (asset contract in
 * docs/superpowers/specs/2026-10-05-cars-rebuild-design.md). Static parts are
 * flattened and merged per group for draw calls; moving parts (doors,
 * steering wheel, pedals, wheels) keep their pivots, and markers stay as
 * TransformNodes so the game reads world positions straight off them.
 *
 * Returns { body, wheels, dims, rig } where rig = { doors, steer, pedals,
 * detail, markers } (doors keyed FL / FR / RL / RR).
 */
export function buildCarModel(id, scene) {
  const src = sourceTree(id);
  if (!src) return null;
  const { get } = src;
  const body = new TransformNode('body', scene);
  const pivotFor = (o, name = o.name) => pivotAt(scene, name, treeMatrix(o));

  // Wheels: parented to the Vehicle root later (below the suspension).
  const wheels = [];
  for (const key of ['FL', 'FR', 'RL', 'RR']) {
    const w = get('wheel_' + key);
    if (!w) continue;
    const node = new TransformNode('wheel_' + key, scene);
    treeMatrix(w).getTranslationToRef(node.position);
    const spin = new TransformNode('spin', scene);
    spin.parent = node;
    flattenInto(src, w, spin);
    mergeMaterials(spin);
    const bb = boundsOf(node);
    src.done.add(w);
    wheels.push({ node, spin, cx: node.position.x, cy: node.position.y, cz: node.position.z, r: (bb.max[1] - bb.min[1]) / 2, front: key[0] === 'F' });
  }

  // Doors: hinge pivots (open = rotate about Y).
  const doors = {};
  for (const k of ['FL', 'FR', 'RL', 'RR']) {
    const d = get('door_' + k);
    if (!d) continue;
    const p = pivotFor(d);
    flattenInto(src, d, p);
    mergeMaterials(p);
    src.done.add(d);
    p.parent = body;
    doors[k] = p;
  }

  // Steering: tilted frame (column) → spinning wheel (turns about local Z,
  // Blender's local Y after the glTF axis swap). Grips ride on the spin.
  let steer = null, steerFrame = null;
  const sf = get('steer');
  if (sf) {
    steerFrame = pivotFor(sf);
    const ss = src.find(sf, 'steer_spin');
    if (ss) {
      steer = new TransformNode('steer_spin', scene);
      steer.position.copyFrom(ss.position);
      steer.rotation.copyFrom((ss.rotationQuaternion || Quaternion.Identity()).toEulerAngles());
      steer.parent = steerFrame;
      flattenInto(src, ss, steer);
      mergeMaterials(steer);
      src.done.add(ss);
    }
    flattenInto(src, sf, steerFrame);
    mergeMaterials(steerFrame);
    src.done.add(sf);
    steerFrame.parent = body;
  }

  // Cabin detail (hidden at distance) with the pedals as pivots inside it.
  const detail = new TransformNode('cabin_detail', scene);
  const pedals = {};
  for (const k of ['gas', 'brake']) {
    const p = get('pedal_' + k);
    if (!p) continue;
    const pivot = pivotFor(p);
    flattenInto(src, p, pivot);
    mergeMaterials(pivot);
    src.done.add(p);
    pivot.parent = detail;
    pedals[k] = pivot;
  }
  const detailSrc = get('cabin_detail');
  if (detailSrc) {
    flattenInto(src, detailSrc, detail);
    mergeMaterials(detail);
    src.done.add(detailSrc);
  }

  // Static exterior and cabin.
  const shell = new TransformNode('shell', scene);
  if (get('body')) { flattenInto(src, get('body'), shell); src.done.add(get('body')); }
  mergeMaterials(shell);
  const cabin = new TransformNode('cabin', scene);
  if (get('cabin')) { flattenInto(src, get('cabin'), cabin); src.done.add(get('cabin')); }
  mergeMaterials(cabin);
  for (const c of cabin.getChildMeshes(false)) c.metadata.cast = false;
  for (const c of detail.getChildMeshes(false)) c.metadata.cast = false;
  for (const n of [shell, cabin, detail]) n.parent = body;

  // Remaining root markers (seat, stand, feet) into the body.
  src.walk((o) => {
    if (isGeometry(o) || !MARKER.test(o.name)) return;
    const m = new TransformNode(o.name, scene);
    treeMatrix(o).getTranslationToRef(m.position);
    m.parent = body;
  });
  const markers = {};
  for (const o of body.getDescendants(false)) if (!(o instanceof Mesh) && MARKER.test(o.name)) markers[o.name] = o;

  // Tinted glass: readable as glass against a bright street, driver visible.
  for (const m of body.getChildMeshes(false)) {
    if (!/glass/i.test(m.material.name || '')) continue;
    m.material = tinted(m.material);
    m.metadata.cast = false;
  }

  const bb = boundsOf(shell);
  const dims = { w: bb.max[0] - bb.min[0], len: bb.max[2] - bb.min[2], h: bb.max[1] };
  return { body, wheels, dims, rig: { doors, steer, steerFrame, pedals, detail, markers } };
}

const _tinted = new Map();
function tinted(mat) {
  if (_tinted.has(mat)) return _tinted.get(mat);
  const g = mat.clone(mat.name);
  g.albedoColor = Color3.FromHexString('#22303e').toLinearSpace();
  g.alpha = 0.62;
  g.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  g.roughness = 0.05;
  g.metallic = 0.3;
  g.disableDepthWrite = true;
  _tinted.set(mat, g);
  return g;
}

const isGeometry = (o) => o instanceof Mesh && o.getTotalVertices() > 0;

/**
 * A loaded vehicle GLB as a source tree: name lookup like three's
 * getObjectByName, and a `done` set standing in for removing a subtree once
 * it has been built (the source is shared by every vehicle of that model).
 */
export function sourceTree(id) {
  const c = VehicleAssets.get(id);
  if (!c) return null;
  const done = new Set();
  const walk = (fn, nodes = c.rootNodes) => {
    for (const n of nodes) {
      if (done.has(n)) continue;
      if (fn(n) === true) return true;
      if (walk(fn, n.getChildren())) return true;
    }
    return false;
  };
  const find = (root, name) => {
    let hit = null;
    walk((n) => { if (n.name === name) { hit = n; return true; } return false; }, [root]);
    return hit;
  };
  const get = (name) => { for (const r of c.rootNodes) { const h = find(r, name); if (h) return h; } return null; };
  return { done, walk, find, get };
}

/** A pivot (Euler-rotatable, like three's) at a source node's vehicle-space transform. */
export function pivotAt(scene, name, matrix) {
  const p = new TransformNode(name, scene);
  const q = new Quaternion();
  matrix.decompose(p.scaling, q, p.position);
  p.rotation.copyFrom(q.toEulerAngles());
  return p;
}

/**
 * Bake every mesh below `node` into `dst` (relative to dst) as queued parts
 * for mergeMaterials. Empties without children (markers) are re-created at
 * their relative pose. Subtrees already built (src.done) are left out.
 */
export function flattenInto(src, node, dst) {
  const inv = Matrix.Invert(treeMatrix(dst));
  const rel = new Matrix();
  const scene = dst.getScene();
  const visit = (o) => {
    for (const c of o.getChildren()) {
      if (src.done.has(c)) continue;
      treeMatrix(c).multiplyToRef(inv, rel);
      if (isGeometry(c)) {
        // The Blender bodies are densely tessellated (a 40-70k triangle shell,
        // drawn again for its shadow). Within 0.1% of a part's size (~5 mm on
        // a car body), keeping every change in surface normal so reflections
        // look the same, they simplify three to five times.
        const index = simplifyGeometry(c.geometry, { error: 0.001, normals: 1 });
        addPart(dst, { ...bakePart(c, rel, index), cast: true });
      } else if (c.getChildren().length === 0) {
        const e = new TransformNode(c.name, scene);
        e.rotationQuaternion = new Quaternion();
        rel.decompose(e.scaling, e.rotationQuaternion, e.position);
        e.parent = dst;
      }
      visit(c);
    }
  };
  visit(node);
}
