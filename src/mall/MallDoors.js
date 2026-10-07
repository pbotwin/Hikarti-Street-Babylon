import { Quaternion } from '@babylonjs/core';
import { Batch, C } from './MallKit.js';
import { DOOR_H, ENTRANCES } from './MallPlan.js';
import { writeTRS } from '../world/Instances.js';

/**
 * Hikari Mall's moving doors: the automatic sliding doors at the entrances
 * (they part for her and for any shopper near them) and the cooler doors in
 * the supermarket (one swings open while someone stands right in front of
 * it, and closes behind them). Every leaf of a kind is a thin instance of
 * one glass and one frame mesh, so all doors are four draws; matrices are
 * rewritten only while a door moves. The meshes (`meshes`) belong to MallWorld.
 */
const LEAF_T = 0.04, LEAF_Z = -0.2;       // leaves run just outside the glass line, in the track
const OPEN_ANGLE = 1.75;
const _q = new Quaternion();
const ease = (k) => k * k * (3 - 2 * k);

export class MallDoors {
  constructor(scene, root, mats, origin) {
    Object.assign(this, { scene, root, mats, origin });
    this.slides = [];     // { e, leaves: [{ closed, open }], open }
    this.swings = [];     // { hinge, theta, sign, cx, cz, facing, open }
    this.meshes = [];
  }

  /** Build the entrance leaves and the cooler doors (specs from MallMarket). */
  build(coolers) {
    const M = this.mats;
    const lw = ENTRANCES[0].w / 2 + 0.04;
    // Sliding leaf: glass in an aluminium frame with a push bar, origin at its foot centre.
    const leaf = new Batch(this.scene, 'mall:leaf');
    leaf.panel(M.glass, C.white, 0, 0, [0, -1], lw - 0.08, 0.08, DOOR_H - 0.08);
    for (const [x0, y0, x1, y1] of [[-lw / 2, 0, lw / 2, 0.08], [-lw / 2, DOOR_H - 0.08, lw / 2, DOOR_H], [-lw / 2, 0, -lw / 2 + 0.05, DOOR_H], [lw / 2 - 0.05, 0, lw / 2, DOOR_H]]) {
      leaf.box(M.metal, C.frame, x0, y0, -LEAF_T / 2, x1, y1, LEAF_T / 2);
    }
    this.leafMeshes = leaf.build(this.root);
    for (const e of ENTRANCES) {
      const leaves = [-1, 1].map((s) => ({ closed: e.x + s * (lw / 2 - 0.02), open: e.x + s * (lw / 2 - 0.02 + lw - 0.1) }));
      this.slides.push({ e, leaves, open: 0 });
    }
    this._leafMatrices = new Float32Array(this.slides.length * 2 * 16);
    this._writeLeaves();
    for (const m of this.leafMeshes) this._instance(m, this._leafMatrices);

    // Cooler door: glass in a black frame with a long handle, hinge at x = 0.
    if (coolers.length) {
      const c0 = coolers[0], w = Math.hypot(c0.free[0] - c0.hinge[0], c0.free[1] - c0.hinge[1]), h = c0.y1 - c0.y0;
      const door = new Batch(this.scene, 'mall:coolerDoor');
      door.panel(M.glass, C.white, w / 2, 0, [0, 1], w - 0.08, 0.05, h - 0.05);
      for (const [x0, y0, x1, y1] of [[0, 0, w, 0.05], [0, h - 0.05, w, h], [0, 0, 0.04, h], [w - 0.04, 0, w, h]]) door.box(M.metal, C.black, x0, y0, -0.015, x1, y1, 0.015);
      door.box(M.chrome, C.steel, w - 0.1, h * 0.3, 0.015, w - 0.08, h * 0.75, 0.05);
      this.doorMeshes = door.build(this.root);
      for (const c of coolers) {
        const ax = (c.free[0] - c.hinge[0]) / w, az = (c.free[1] - c.hinge[1]) / w;
        const theta = Math.atan2(-az, ax);
        // +angle swings the free edge toward the door's -z; open toward the aisle.
        const sign = Math.sin(theta) * c.facing[0] + Math.cos(theta) * c.facing[1] < 0 ? 1 : -1;
        this.swings.push({ hinge: c.hinge, y0: c.y0, theta, sign, cx: (c.hinge[0] + c.free[0]) / 2 + c.facing[0] * 0.45, cz: (c.hinge[1] + c.free[1]) / 2 + c.facing[1] * 0.45, open: 0 });
      }
      this._doorMatrices = new Float32Array(this.swings.length * 16);
      this.swings.forEach((d, i) => this._writeDoor(d, i));
      for (const m of this.doorMeshes) this._instance(m, this._doorMatrices);
    }
    this.meshes = [...this.leafMeshes, ...(this.doorMeshes || [])];
  }

  _instance(mesh, matrices) {
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
    mesh.thinInstanceRefreshBoundingInfo(false);
    // Bounds of the closed doors, grown by an open leaf's reach so opening never culls them.
    const bb = mesh.getBoundingInfo();
    bb.reConstruct(bb.minimum.subtractFromFloats(1, 0, 1), bb.maximum.addInPlaceFromFloats(1, 0, 1));
    mesh.doNotSyncBoundingInfo = true;
  }

  _writeLeaves() {
    _q.set(0, 0, 0, 1);
    let i = 0;
    for (const s of this.slides) {
      const k = ease(s.open);
      for (const l of s.leaves) writeTRS(this._leafMatrices, 16 * i++, l.closed + (l.open - l.closed) * k, 0, LEAF_Z, _q);
    }
  }

  _writeDoor(d, i) {
    const a = d.theta + d.sign * OPEN_ANGLE * ease(d.open);
    _q.set(0, Math.sin(a / 2), 0, Math.cos(a / 2));
    writeTRS(this._doorMatrices, 16 * i, d.hinge[0], d.y0, d.hinge[1], _q);
  }

  /**
   * Per frame: `people` are world positions (her first, then shoppers).
   * Entrance doors open for anyone within ~3 m of the doorway, either side;
   * a cooler door for someone standing at it.
   */
  update(dt, people) {
    const ox = this.origin.x, oz = this.origin.z;
    let leaves = false;
    for (const s of this.slides) {
      let near = false;
      for (const p of people) {
        const x = ox - p.x, z = oz - p.z;
        if (Math.abs(x - s.e.x) < s.e.w / 2 + 1.2 && Math.abs(z) < 3.2 && p.y < 2) { near = true; break; }
      }
      const was = s.open;
      s.open += ((near ? 1 : 0) - s.open) * (1 - Math.exp(-(near ? 7 : 3.5) * dt));
      if (Math.abs(s.open - was) > 1e-4) leaves = true;
    }
    if (leaves) {
      this._writeLeaves();
      for (const m of this.leafMeshes) m.thinInstanceBufferUpdated('matrix');
    }
    let doors = false;
    for (let i = 0; i < this.swings.length; i++) {
      const d = this.swings[i];
      let near = false;
      for (const p of people) {
        const x = ox - p.x, z = oz - p.z;
        if ((x - d.cx) ** 2 + (z - d.cz) ** 2 < 0.36) { near = true; break; }
      }
      const was = d.open;
      d.open += ((near ? 1 : 0) - d.open) * (1 - Math.exp(-(near ? 6 : 3) * dt));
      if (Math.abs(d.open - was) > 1e-4) { this._writeDoor(d, i); doors = true; }
    }
    if (doors) for (const m of this.doorMeshes) m.thinInstanceBufferUpdated('matrix');
  }
}
