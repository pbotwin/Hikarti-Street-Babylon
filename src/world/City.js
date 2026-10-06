import { SceneLoader, MeshoptCompression, Color3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CollisionWorld } from './CollisionWorld.js';

/**
 * The Hikari Street city: geometry exported once from the original game's
 * procedural builders (scripts/export-city), compressed (meshopt + WebP) to
 * ~9 MB, plus the same collision boxes and layout data (city.json).
 */
MeshoptCompression.Configuration = { decoder: { url: './meshopt_decoder.js' } };

export async function loadCity(scene, graphics, onProgress) {
  const data = await (await fetch('./world/city.json')).json();
  const result = await SceneLoader.ImportMeshAsync('', './world/', 'city.opt.glb', scene, (e) => {
    if (e.lengthComputable) onProgress?.(e.loaded / e.total);
  });
  const casters = [];
  for (const m of result.meshes) {
    if (!m.getTotalVertices || m.getTotalVertices() === 0) continue;
    m.receiveShadows = true;
    m.isPickable = false;
    m.alwaysSelectAsActiveMesh = false;
    // Small meshes and glass don't need to cast; buildings, trees and props do.
    const mat = m.material;
    if (mat && !(mat.alpha < 1 || mat.transparencyMode === 2)) casters.push(m);
    if (mat) {
      mat.environmentIntensity = /glass|metal|carPaint/i.test(mat.name) ? 0.9 : 0.35;
      // Exported standard materials are fully rough; give painted / glossy
      // things a little sheen so the sky and SSR show in them.
      if (mat.roughness !== undefined && /glass|metal|carPaint|satin|paint/i.test(mat.name)) mat.roughness = Math.min(mat.roughness ?? 1, /glass/i.test(mat.name) ? 0.05 : 0.45);
    }
    m.freezeWorldMatrix();
  }
  graphics.addCasters(casters);

  // Same collision world as the original game.
  const collision = new CollisionWorld();
  for (const [x0, y0, z0, x1, y1, z1, cam, climb] of data.boxes) collision.addBox(x0, y0, z0, x1, y1, z1, { camera: !!cam, climb: !!climb });
  return { data, collision, meshes: result.meshes };
}

export { Color3 };
