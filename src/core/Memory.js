/**
 * Babylon keeps an array of Vector3 objects (one per vertex) on a mesh each
 * time its bounding box is refreshed (loading, cloning, thin instances), for
 * mesh picking and its own collision system. The game uses neither (its
 * collision world is CollisionWorld; meshes are not pickable), and across the
 * city, vehicles and residents these caches were ~4.4 million vectors, about
 * half the JS heap (766 MB against the original's 392 MB).
 */
export function releasePositionCaches(meshes) {
  for (const m of meshes) {
    const info = m._internalAbstractMeshDataInfo;
    if (info?._positions) info._positions = null;
  }
}
