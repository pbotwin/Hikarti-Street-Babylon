import { TransformNode, Matrix, Vector3, Color3, Mesh, VertexBuffer } from '@babylonjs/core';
import { mergeMaterials, treeMatrix, boundsOf } from './VehicleKit.js';
import { sourceTree, pivotAt, flattenInto } from './CarModel.js';

const MARKER = /^(seat_|stand_|foot_|grip_|ground_|pedal_)/;

/**
 * Builds a rideable two-wheeler from a Blender bike GLB
 * (tools/blender/bikes/bike.py): frame (static, merged), steering assembly
 * on the tilted head-tube axis (turns about its local Y) carrying the front
 * wheel and the grips, rear wheel, crank with pedals (bicycle), kickstand,
 * and rider markers. `paint` recolours the body paint for this bike.
 *
 * Returns { body, wheels, dims, rig } like buildCarModel; rig = { steer,
 * crank, kickstand, markers }. Front wheel entries are `mounted` (they live
 * inside the steering assembly, so the Vehicle only spins them).
 */
export function buildBikeModel(id, paint, scene) {
  const src = sourceTree(id);
  if (!src) return null;
  const { get } = src;
  const body = new TransformNode('body', scene);
  const wheels = [];
  const wheelFrom = (w, parent, front) => {
    // Wheel node in `parent`'s frame; the spinning meshes go in node.spin.
    const node = new TransformNode(w.name, scene);
    const world = treeMatrix(w).getTranslation();
    Vector3.TransformCoordinatesToRef(world, Matrix.Invert(treeMatrix(parent)), node.position);
    node.parent = parent;
    const spin = new TransformNode('spin', scene);
    spin.parent = node;
    flattenInto(src, w, spin);
    mergeMaterials(spin);
    const bb = boundsOf(spin);
    src.done.add(w);
    wheels.push({ node, spin, cx: world.x, cy: world.y, cz: world.z, r: (bb.max[1] - bb.min[1]) / 2, front, mounted: parent !== body });
  };

  // Steering assembly: tilted frame → spin (turns about local Y).
  let steer = null;
  const sf = get('steer');
  if (sf) {
    const frame = pivotAt(scene, sf.name, treeMatrix(sf));
    frame.parent = body;
    steer = new TransformNode('steer_spin', scene);
    steer.parent = frame;
    const ss = src.find(sf, 'steer_spin');
    const wf = src.find(ss, 'wheel_F');
    if (wf) wheelFrom(wf, steer, true);
    flattenInto(src, ss, steer);
    mergeMaterials(steer);
    src.done.add(sf);
  }
  const wr = get('wheel_R');
  if (wr) wheelFrom(wr, body, false);

  // Crank (bicycle) and kickstand pivots.
  const pivot = (name) => {
    const o = get(name);
    if (!o) return null;
    const p = pivotAt(scene, name, treeMatrix(o));
    flattenInto(src, o, p);
    mergeMaterials(p);
    src.done.add(o);
    p.parent = body;
    return p;
  };
  const crank = pivot('crank');
  const kickstand = pivot('kickstand');

  const shell = new TransformNode('shell', scene);
  if (get('frame')) { flattenInto(src, get('frame'), shell); src.done.add(get('frame')); }
  mergeMaterials(shell);
  shell.parent = body;

  src.walk((o) => {
    if (o instanceof Mesh || !MARKER.test(o.name)) return;
    const m = new TransformNode(o.name, scene);
    treeMatrix(o).getTranslationToRef(m.position);
    m.parent = body;
  });
  const markers = {};
  for (const o of body.getDescendants(false)) if (!(o instanceof Mesh) && MARKER.test(o.name) && !markers[o.name]) markers[o.name] = o;

  // Per-bike colour: paint lives in vertex colours of the merged meshes and
  // in unmerged 'paint' materials; tint both.
  if (paint) recolour(body, Color3.FromHexString(paint).toLinearSpace());
  for (const m of body.getChildMeshes(false)) m.metadata.cast = true;

  const bb = boundsOf(body);
  const dims = { w: Math.min(0.7, bb.max[0] - bb.min[0]), len: bb.max[2] - bb.min[2], h: bb.max[1] };
  return { body, wheels, dims, rig: { steer, crank, kickstand, markers } };
}

/** Swap the model's grey paint (#8e9299 at export) for `c` everywhere. */
function recolour(body, c) {
  const base = Color3.FromHexString('#8e9299').toLinearSpace();
  const tol = 0.02;
  for (const m of body.getChildMeshes(false)) {
    if (m.material.name === 'paint') {
      m.material = m.material.clone('paint');
      m.material.albedoColor = c.clone();
      continue;
    }
    const col = m.getVerticesData(VertexBuffer.ColorKind);
    if (!col) continue;
    for (let i = 0; i < col.length; i += 4) {
      if (Math.abs(col[i] - base.r) < tol && Math.abs(col[i + 1] - base.g) < tol && Math.abs(col[i + 2] - base.b) < tol) {
        col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
      }
    }
    m.setVerticesData(VertexBuffer.ColorKind, col, false, 4);
  }
}
