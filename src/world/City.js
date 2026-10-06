import { SceneLoader, MeshoptCompression, Color3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CollisionWorld } from './CollisionWorld.js';

/**
 * The Hikari Street city: geometry exported once from the original game's
 * procedural builders, compressed with meshopt + WebP, plus the same
 * collision boxes and layout data (city.json). Three files:
 *  - city-cast / city-nocast: static meshes, merged for few draw calls,
 *    split by whether the original let them cast shadows
 *  - city-parts: pieces handled one by one, tagged by the export (glTF node
 *    extras): distance LOD cells and their shadow stand-ins, wind / grass,
 *    and the animated props (anim: signalRed, lantern, fountainWater…)
 * Positions are not quantized (mm-scale layers: lawn, paving, decals).
 */
MeshoptCompression.Configuration = { decoder: { url: './meshopt_decoder.js' } };

const FILES = [['city-cast.opt.glb', 0.55], ['city-nocast.opt.glb', 0.2], ['city-parts.opt.glb', 0.25]];
// Drawn into the shadow map only: cameras see layers 0x0FFFFFFF.
export const SHADOW_ONLY_LAYER = 0x10000000;

/**
 * Load the city. Returns its meshes, the shadow casters (World registers
 * them once the living city has taken its pieces), the tagged parts and the
 * LOD switcher (update it with the camera every frame).
 */
export async function loadCity(scene, onProgress) {
  const data = await (await fetch('./world/city.json')).json();
  let done = 0;
  const results = await Promise.all(FILES.map(([file, weight]) => SceneLoader.ImportMeshAsync('', './world/', file, scene, (e) => {
    if (e.lengthComputable) onProgress?.(Math.min(1, done + weight * (e.loaded / e.total)));
  }).then((r) => { done += weight; return { file, meshes: r.meshes }; })));

  const meshes = [], casters = [];
  const parts = { anim: {}, wind: [], grass: null, shadow: [] };
  const lod = new CityLod();
  for (const { file, meshes: list } of results) {
    for (const m of list) {
      if (!m.getTotalVertices || m.getTotalVertices() === 0) continue;
      meshes.push(m);
      m.receiveShadows = true;
      m.isPickable = false;
      tuneMaterial(m.material);
      if (file === 'city-cast.opt.glb') casters.push(m);
      const tags = file === 'city-parts.opt.glb' ? (m.metadata?.gltf?.extras || m.parent?.metadata?.gltf?.extras || {}) : {};
      if (m.thinInstanceCount > 0) m.thinInstanceRefreshBoundingInfo(false);
      if (tags.shadow) { m.layerMask = SHADOW_ONLY_LAYER; parts.shadow.push(m); }
      if (tags.cast || tags.shadow) casters.push(m);
      if (tags.lod) lod.add(m, tags.lod);
      if (tags.wind) parts.wind.push({ mesh: m, ...tags.wind });
      if (tags.grass) parts.grass = m;
      if (tags.anim) (parts.anim[tags.anim] ||= []).push(m);
      // Animated props move; everything else never does.
      else m.freezeWorldMatrix();
    }
  }

  // Same collision world as the original game.
  const collision = new CollisionWorld();
  for (const [x0, y0, z0, x1, y1, z1, cam, climb] of data.boxes) collision.addBox(x0, y0, z0, x1, y1, z1, { camera: !!cam, climb: !!climb });
  return { data, collision, meshes, casters, parts, lod };
}

function tuneMaterial(mat) {
  if (!mat) return;
  // Sky reflections for glossy surfaces only, as in the original: on matte
  // ground and walls the sky light read as a grey, washed-out sheen.
  mat.environmentIntensity = /glass|metal|carPaint/i.test(mat.name) ? 0.9 : 0;
  // Exported standard materials are fully rough; give painted / glossy
  // things a little sheen so the sky and SSR show in them.
  if (mat.roughness !== undefined && /glass|metal|carPaint|satin|paint/i.test(mat.name)) mat.roughness = Math.min(mat.roughness ?? 1, /glass/i.test(mat.name) ? 0.05 : 0.45);
}

/**
 * Distance level of detail, as the original's InstanceLod: trees and balcony
 * cells draw full detail within NEAR of the camera and their simplified twin
 * further away. A cell turns detailed inside NEAR and back only beyond
 * NEAR + HYSTERESIS (the camera sways a little even standing still, and a
 * cell at the threshold flickered between its versions).
 */
const NEAR = 35;
const HYSTERESIS = 4;

class CityLod {
  constructor() {
    this.cells = new Map();
  }

  add(mesh, { cell, level }) {
    let c = this.cells.get(cell);
    if (!c) this.cells.set(cell, (c = { hi: [], lo: [], near: true, sphere: null }));
    c[level].push(mesh);
    if (level === 'hi' && !c.sphere) c.sphere = mesh.getBoundingInfo().boundingSphere;
    mesh.setEnabled(level === 'hi');
  }

  update(camera) {
    const p = camera.position;
    for (const c of this.cells.values()) {
      const s = c.sphere;
      if (!s) continue;
      const d = Math.hypot(p.x - s.centerWorld.x, p.y - s.centerWorld.y, p.z - s.centerWorld.z) - s.radiusWorld;
      const near = c.near ? d < NEAR + HYSTERESIS : d < NEAR;
      if (near === c.near) continue;
      c.near = near;
      for (const m of c.hi) m.setEnabled(near);
      for (const m of c.lo) m.setEnabled(!near);
    }
  }
}

export { Color3 };
