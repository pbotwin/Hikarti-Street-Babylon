import { Quaternion } from '@babylonjs/core';
import { Batch, C } from './MallKit.js';
import { DOOR_H, ENTRANCES, COURT_W } from './MallPlan.js';
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
// A leaf reaches up under the track housing (MallBuilding: DOOR_H + 0.18 up):
// stopping at the door head it left a slot of daylight over every door.
const LEAF_H = DOOR_H + 0.16;
// The leaves open as far as the side lights go, a hair short of the
// portal's piers: the 1.2 m side lights are their pockets, so the 1.8 m
// leaves part 2.3 m clear (they used to slide into the piers).
const POCKET = (COURT_W - ENTRANCES[0].w) / 2 - 0.06;
const OPEN_ANGLE = 1.75;
const _q = new Quaternion();
const ease = (k) => k * k * (3 - 2 * k);

export class MallDoors {
  constructor(scene, root, mats, origin) {
    Object.assign(this, { scene, root, mats, origin });
    this.slides = [];     // { e, leaves: [{ closed, open, yaw }], open }
    this.swings = [];     // { hinge, theta, sign, cx, cz, facing, open }
    this.meshes = [];
  }

  /** Build the entrance leaves and the cooler doors (specs from MallMarket). */
  build(coolers) {
    const M = this.mats;
    // Sliding leaf, origin at its foot centre, its meeting edge at +x: glass
    // in a slim aluminium frame (stiles, a deeper kick rail), a black rubber
    // seal on the meeting stile, and the frosted safety band at waist height
    // every Japanese automatic door carries (without it the open and shut
    // doors read the same). The right-hand leaves are the same leaf turned
    // half round, so the seals meet in the middle.
    const leaf = new Batch(this.scene, 'mall:leaf');
    const half = ENTRANCES[0].w / 4, st = 0.06, kick = 0.14, rail = 0.08, t = LEAF_T / 2;
    leaf.panel(M.glass, C.white, 0, 0, [0, -1], 2 * (half - st), kick, LEAF_H - rail);
    for (const [x0, y0, x1, y1] of [[-half, 0, half, kick], [-half, LEAF_H - rail, half, LEAF_H], [-half, kick, -half + st, LEAF_H - rail], [half - st, kick, half - 0.012, LEAF_H - rail]]) {
      leaf.box(M.metal, C.steel, x0, y0, -t, x1, y1, t);
    }
    leaf.box(M.matte, C.rubber, half - 0.012, 0.02, -t + 0.006, half, LEAF_H - 0.02, t - 0.006);
    for (const f of [-1, 1]) leaf.panel(M.matte, C.snow, 0, f * (t - 0.012), [0, f], 2 * (half - st), 1.0, 1.08);
    this.leafMeshes = leaf.build(this.root);
    for (const e of ENTRANCES) {
      const leaves = [-1, 1].map((s) => ({ closed: e.x + s * half, open: e.x + s * (half + POCKET), yaw: s > 0 ? Math.PI : 0 }));
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
    // Bounds of the closed doors, grown by an open leaf's reach so opening never
    // culls them, placed by the mesh's world matrix (without it the box sat at
    // the world's origin and every door was culled: the doorways stood empty).
    const bb = mesh.getBoundingInfo();
    bb.reConstruct(bb.minimum.subtractFromFloats(1.2, 0, 1.2), bb.maximum.addInPlaceFromFloats(1.2, 0, 1.2), mesh.getWorldMatrix());
    mesh.doNotSyncBoundingInfo = true;
  }

  _writeLeaves() {
    let i = 0;
    for (const s of this.slides) {
      const k = ease(s.open);
      for (const l of s.leaves) {
        _q.set(0, Math.sin(l.yaw / 2), 0, Math.cos(l.yaw / 2));
        writeTRS(this._leafMatrices, 16 * i++, l.closed + (l.open - l.closed) * k, 0, LEAF_Z, _q);
      }
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
   * a cooler door for someone standing at it. Indexed loops only: for…of
   * over the people for each of the 46 doors made an iterator per door per
   * frame (~10 KB of garbage a frame).
   */
  update(dt, people) {
    const ox = this.origin.x, oz = this.origin.z, n = people.length;
    let leaves = false;
    for (let i = 0; i < this.slides.length; i++) {
      const s = this.slides[i], reach = s.e.w / 2 + 1.2;
      let near = false;
      for (let k = 0; k < n && !near; k++) {
        const p = people[k];
        near = Math.abs(ox - p.x - s.e.x) < reach && Math.abs(oz - p.z) < 3.2 && p.y < 2;
      }
      if (this._ease(s, near, near ? 7 : 3.5, dt)) leaves = true;
    }
    if (leaves) {
      this._writeLeaves();
      for (let i = 0; i < this.leafMeshes.length; i++) this.leafMeshes[i].thinInstanceBufferUpdated('matrix');
    }
    let doors = false;
    for (let i = 0; i < this.swings.length; i++) {
      const d = this.swings[i];
      let near = false;
      for (let k = 0; k < n && !near; k++) {
        const p = people[k], x = ox - p.x - d.cx, z = oz - p.z - d.cz;
        near = x * x + z * z < 0.36;
      }
      if (this._ease(d, near, near ? 6 : 3, dt)) { this._writeDoor(d, i); doors = true; }
    }
    if (doors) for (let i = 0; i < this.doorMeshes.length; i++) this.doorMeshes[i].thinInstanceBufferUpdated('matrix');
  }

  /** Move a door's `open` toward 1 (someone near) or 0 at `rate`; whether it moved enough to redraw. */
  _ease(d, near, rate, dt) {
    const was = d.open;
    d.open += ((near ? 1 : 0) - d.open) * (1 - Math.exp(-rate * dt));
    return Math.abs(d.open - was) > 1e-4;
  }
}
