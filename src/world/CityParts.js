/**
 * Helpers for the tagged parts of the exported city (City.js parts). The
 * export merges identical materials, so a part that gets its own shader
 * plugin or animated colour may share its material with things that must
 * stay as they are.
 */

/** `material` for `meshes` alone: itself if nothing else uses it, else a clone (pushed to `owned`). */
export function exclusive(scene, material, meshes, owned) {
  if (!scene.meshes.some((m) => m.material === material && !meshes.includes(m))) return material;
  const copy = material.clone(`${material.name}-own`);
  for (const m of meshes) m.material = copy;
  owned.push(copy);
  return copy;
}
