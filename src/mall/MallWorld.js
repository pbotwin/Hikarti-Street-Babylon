// PLACEHOLDER: replaced by the mall world (see MALL.md).
import { MeshBuilder, TransformNode } from '@babylonjs/core';

export class MallWorld {
  constructor(ctx) { this.ctx = ctx; }

  async init() {
    const o = { x: 2600, z: 2600 };
    this.root = new TransformNode('mall', this.ctx.scene);
    const ground = MeshBuilder.CreateGround('mallGround', { width: 160, height: 160 }, this.ctx.scene);
    ground.position.set(o.x, 0, o.z);
    ground.parent = this.root;
    this.layout = {
      origin: o, bounds: { x0: o.x - 80, z0: o.z - 80, x1: o.x + 80, z1: o.z + 80 },
      building: { x0: o.x - 40, z0: o.z, x1: o.x + 40, z1: o.z + 60, floorY: 0, ceilingY: 6 },
      spawn: { x: o.x, z: o.z - 30, yaw: 0 }, car: { x: o.x + 3, z: o.z - 30, yaw: 0, model: 'car_kei_pink' },
      exit: { x0: o.x - 80, z0: o.z - 80, x1: o.x + 80, z1: o.z - 75 },
      entrances: [], cartCorrals: [], grocery: { zone: null, shelves: [], bins: [] }, checkouts: [],
      fashion: { zone: null, racks: [], fittingRooms: [], till: null }, nav: { nodes: [], links: [] }, lot: { bays: [], walkways: [] },
    };
  }

  update() {}
  prompt() { return null; }
  get busy() { return false; }
  dispose() { this.root.dispose(); }
}
