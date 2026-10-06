import { LoadAssetContainerAsync } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { simplifierReady } from '../core/Simplify.js';

/**
 * The Blender vehicle GLBs (public/models/vehicles), loaded once before the
 * VehicleSystem builds its vehicles from them (the original preloads them in
 * World.build). Each stays an asset container, never added to the scene:
 * the models are baked from it, then `release` frees the source geometry.
 */
const IDS = ['car_sedan', 'car_minivan', 'car_kei_pink', 'car_kei_grey', 'car_kei_tall', 'car_delivery', 'bike_scooter', 'bike_moto', 'bike_bicycle'];
const cache = new Map();

export const VehicleAssets = {
  async load(scene, base = './models/vehicles/') {
    await simplifierReady;
    await Promise.all(IDS.map(async (id) => {
      try {
        cache.set(id, await LoadAssetContainerAsync(`${base}${id}.glb`, scene));
      } catch (e) {
        console.warn('asset missing:', id, e?.message || e);
      }
    }));
  },

  has(id) { return cache.has(id); },
  get(id) { return cache.get(id); },

  /**
   * Free the sources once every vehicle is built. Materials the vehicles use
   * were added to the scene (see VehicleKit); the rest go too.
   */
  release() {
    for (const c of cache.values()) {
      for (const m of c.meshes) m.dispose(true, false);
      for (const g of c.geometries) g.dispose();
      for (const m of c.materials) if (!m.getScene().materials.includes(m)) m.dispose();
    }
    cache.clear();
  },
};
