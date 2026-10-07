import { LoadAssetContainerAsync } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { simplifierReady } from '../core/Simplify.js';

/**
 * The Blender vehicle GLBs (public/models/vehicles), loaded once before the
 * VehicleSystem builds its vehicles from them (the original preloads them in
 * World.build). Each stays an asset container, never added to the scene:
 * the models are baked from it, then `release` frees the source geometry.
 *
 * A model can be loaded again later for a vehicle made at runtime (her car
 * on a shopping trip). The materials a model's vehicles ended up drawing
 * with are kept and handed to the reloaded copy by name, so the new vehicle
 * shares them: no new shaders, and nothing left behind when it goes.
 */
const IDS = ['car_sedan', 'car_minivan', 'car_kei_pink', 'car_kei_grey', 'car_kei_tall', 'car_delivery', 'bike_scooter', 'bike_moto', 'bike_bicycle'];
const cache = new Map();
const kept = new Map();   // model id -> Map(material name -> scene material its vehicles draw with)

export const VehicleAssets = {
  async load(scene, base = './models/vehicles/', ids = IDS) {
    await simplifierReady;
    await Promise.all(ids.map(async (id) => {
      if (cache.has(id)) return;
      try {
        const c = await LoadAssetContainerAsync(`${base}${id}.glb`, scene);
        const mats = kept.get(id);
        if (mats) for (const m of c.meshes) if (m.material && mats.has(m.material.name)) m.material = mats.get(m.material.name);
        cache.set(id, c);
      } catch (e) {
        console.warn('asset missing:', id, e?.message || e);
      }
    }));
  },

  has(id) { return cache.has(id); },
  get(id) { return cache.get(id); },

  /**
   * Free the sources once every vehicle is built. Materials the vehicles use
   * were added to the scene (see VehicleKit) and are kept for reloads; the
   * rest go too.
   */
  release() {
    for (const [id, c] of cache) {
      const scene = c.scene, mats = kept.get(id) || new Map();
      for (const m of c.meshes) if (m.material && scene.materials.includes(m.material)) mats.set(m.material.name, m.material);
      if (mats.size) kept.set(id, mats);
      for (const m of c.meshes) m.dispose(true, false);
      for (const g of c.geometries) g.dispose();
      for (const m of c.materials) if (!scene.materials.includes(m)) m.dispose();
    }
    cache.clear();
  },
};
