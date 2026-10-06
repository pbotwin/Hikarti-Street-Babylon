import { TransformNode, Vector3 } from '@babylonjs/core';
import { loadCity } from './City.js';
import { L } from './Layout.js';

/**
 * The district. Static geometry comes from the exported city (City.js);
 * animated pieces (train, signals, lanterns, petals, butterflies, birds, the
 * LED screen, wind…) register as updaters, just like the original World.
 */
export class World {
  constructor(scene, graphics) {
    this.scene = scene;
    this.graphics = graphics;
    this.lighting = graphics;
    this.updaters = [];
    this.districts = L.districts;
    this.root = new TransformNode('World', scene);
  }

  async build(onProgress) {
    const city = await loadCity(this.scene, this.graphics, onProgress);
    for (const m of city.meshes) if (!m.parent) m.parent = this.root;
    this.city = city;
    this.meshes = city.meshes;
    this.data = city.data;
    this.collision = city.collision;
    const d = city.data;
    this.spawn = { ...d.spawn };
    this.fragmentSpots = d.fragments.map(([x, y, z]) => new Vector3(x, y, z));
    this.portalSpot = { position: new Vector3(d.portal.x, 0, d.portal.z), yaw: d.portal.yaw };
    this.parkCenter = d.parkCenter;
    this.shopSpots = d.shopSpots;
    this.places = d.places;
    this.rooms = d.rooms;
    // Same shape as the original's build context (vehicles read the specs from it).
    this._ctx = { vehicleSpecs: d.vehicles.map((v) => ({ ...v })), trainX: 0 };
    return this;
  }

  /** Whether (x, z) is inside the play area (any district, with a margin). */
  inPlayArea(p, margin = 2) {
    return this.districts.some((d) => p.x >= d.x0 - margin && p.x <= d.x1 + margin && p.z >= d.z0 - margin && p.z <= d.z1 + margin);
  }

  getDistrict(position) {
    return this.districts.find((d) => position.x >= d.x0 && position.x <= d.x1 && position.z >= d.z0 && position.z < d.z1)
      || this.districts[0];
  }

  update(dt, camera, player) {
    for (const u of this.updaters) u.update(dt, camera, player);
    this.trainX = this._ctx.trainX;
  }
}
