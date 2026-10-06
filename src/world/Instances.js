/**
 * Thin-instance matrix helpers for the animated world (butterflies, birds,
 * petals, lanterns, signals). They write straight into the instance buffer,
 * so moving dozens of copies every frame allocates nothing. The memory
 * layout is the same as three's Matrix4.compose and Babylon's Matrix.
 */

/** Quaternion for a three.js-style XYZ Euler rotation (Babylon's own helpers use YXZ). */
export function quatXYZ(x, y, z, q) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  q.x = s1 * c2 * c3 + c1 * s2 * s3;
  q.y = c1 * s2 * c3 - s1 * c2 * s3;
  q.z = c1 * c2 * s3 + s1 * s2 * c3;
  q.w = c1 * c2 * c3 - s1 * s2 * s3;
  return q;
}

/** Write translation · rotation (quaternion q) · scale into m[o .. o+15]. */
export function writeTRS(m, o, px, py, pz, q, sx = 1, sy = 1, sz = 1) {
  const { x, y, z, w } = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[o] = (1 - (yy + zz)) * sx; m[o + 1] = (xy + wz) * sx; m[o + 2] = (xz - wy) * sx; m[o + 3] = 0;
  m[o + 4] = (xy - wz) * sy; m[o + 5] = (1 - (xx + zz)) * sy; m[o + 6] = (yz + wx) * sy; m[o + 7] = 0;
  m[o + 8] = (xz + wy) * sz; m[o + 9] = (yz - wx) * sz; m[o + 10] = (1 - (xx + yy)) * sz; m[o + 11] = 0;
  m[o + 12] = px; m[o + 13] = py; m[o + 14] = pz; m[o + 15] = 1;
}

/**
 * Thin instances on `mesh` from a matrix buffer that the caller rewrites
 * each frame (call mesh.thinInstanceBufferUpdated('matrix') after). Always
 * drawn: copies spread over the city move every frame, and recomputing their
 * bounds would cost more than the few triangles they are.
 */
export function animatedInstances(mesh, count, colors = null) {
  const matrices = new Float32Array(count * 16);
  mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
  if (colors) mesh.thinInstanceSetBuffer('color', colors, 4, true);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  mesh.doNotSyncBoundingInfo = true;
  return matrices;
}
