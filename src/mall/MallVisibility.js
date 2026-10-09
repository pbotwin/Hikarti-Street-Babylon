import { BoundingBox, Vector3 } from '@babylonjs/core';

/**
 * Rooms of Hikari Mall that can't be seen from most of it, switched off
 * while they can't: the parking lot from inside the building, the
 * supermarket from everywhere but its own floor and the views into it.
 *
 * Frustum culling alone kept them: the lot's merged ground and its parked
 * cars (thin instances across the whole lot) and the shelf stock are each
 * one bounding box so large that some corner of it was always in view,
 * through the walls. A room shows while the camera is in it or one of its
 * openings (door glass, a window, an open front) is in the camera's view;
 * walls in between aren't considered, so nothing that could show is ever
 * off. With the shadow casters' view culling (Graphics) this took the
 * concourse on High from ~458 draw calls and 2.9M triangles (shadows
 * included) to ~311 and 1.8M, a shop from ~370 / 2.5M to ~220 / 1.4M.
 *
 * Only meshes and nodes nobody else switches are given to a room (the
 * site's merged zones, the parked cars, the shelf stock's root), so an
 * owner's own setEnabled never fights this one. Switching builds nothing:
 * every member was drawn by the warm-up at load.
 */
export class MallVisibility {
  /** `building`: { x0, z0, x1, z1, top } (world); the camera's planes come from `gfx.viewPlanes`. */
  constructor(gfx, building) {
    this.gfx = gfx;
    this.building = building;
    this.rooms = [];
  }

  /**
   * A room: `box` { x0, z0, x1, z1, y0, y1 } (world; the camera inside it
   * always sees it, null for "outside the building"), `openings` world
   * boxes [x0, y0, z0, x1, y1, z1] it is seen through, `nodes` it owns.
   */
  room(box, openings, nodes = []) {
    const r = {
      box, nodes: [...nodes], shown: true,
      openings: openings.map(([x0, y0, z0, x1, y1, z1]) => new BoundingBox(new Vector3(x0, y0, z0), new Vector3(x1, y1, z1))),
    };
    this.rooms.push(r);
    return r;
  }

  /** More nodes for a room (made by other modules after it). */
  add(room, ...nodes) {
    room.nodes.push(...nodes);
    if (!room.shown) for (const n of nodes) n.setEnabled(false);
  }

  /** Static meshes wholly inside a rectangle (world x/z, up to `y1`), for a room's `nodes`. */
  static within(meshes, { x0, z0, x1, z1 }, y1 = Infinity) {
    return meshes.filter((m) => {
      const b = m.getBoundingInfo().boundingBox, lo = b.minimumWorld, hi = b.maximumWorld;
      return lo.x >= x0 && hi.x <= x1 && lo.z >= z0 && hi.z <= z1 && hi.y <= y1;
    });
  }

  /** Static meshes wholly outside a rectangle (world x/z). */
  static outside(meshes, { x0, z0, x1, z1 }) {
    return meshes.filter((m) => {
      const b = m.getBoundingInfo().boundingBox, lo = b.minimumWorld, hi = b.maximumWorld;
      return hi.x <= x0 || lo.x >= x1 || hi.z <= z0 || lo.z >= z1;
    });
  }

  /** Per frame, before drawing (Graphics has the camera's planes of this frame by then). */
  update(eye) {
    const B = this.building, planes = this.gfx.viewPlanes;
    const inBuilding = eye.x > B.x0 && eye.x < B.x1 && eye.z > B.z0 && eye.z < B.z1 && eye.y < B.top;
    for (const r of this.rooms) {
      const b = r.box;
      let show = b ? eye.x > b.x0 && eye.x < b.x1 && eye.z > b.z0 && eye.z < b.z1 && eye.y > b.y0 && eye.y < b.y1 : !inBuilding;
      for (let i = 0; !show && i < r.openings.length; i++) show = r.openings[i].isInFrustum(planes);
      if (show === r.shown) continue;
      r.shown = show;
      for (const n of r.nodes) if (!n.isDisposed()) n.setEnabled(show);
    }
  }

  /** Everything back on (before the owners dispose it). */
  dispose() {
    for (const r of this.rooms) {
      if (!r.shown) for (const n of r.nodes) if (!n.isDisposed()) n.setEnabled(true);
    }
    this.rooms.length = 0;
  }
}
