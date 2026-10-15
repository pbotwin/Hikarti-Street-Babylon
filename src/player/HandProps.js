import { Vector3 } from '@babylonjs/core';

/**
 * Things in the heroine's right hand: a shop's bag or the car keys
 * (InteriorSystem), a mission's order, watering can or camera
 * (SideMissionSystem). The hand moves with her animation, so what it holds
 * is put at the palm every frame after she is posed (one frame behind the
 * pose, which the next frame corrects).
 *
 *   palm   centred in the palm, turned with her (tipped by `tilt` about her
 *          sideways axis: a can pouring)
 *   hang   its handles in her hand, hanging below it (a bag, a can at her side)
 */
const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _chain = [];

/** World position of a node, with its ancestors' matrices brought up to date first. */
export function worldPos(node, out) {
  _chain.length = 0;
  for (let n = node; n; n = n.parent) _chain.push(n);
  for (let i = _chain.length - 1; i >= 0; i--) _chain[i].computeWorldMatrix(true);
  return out.copyFrom(node.getAbsolutePosition());
}

export function placeInHand(character, mesh, mode, yaw, tilt = 0) {
  const hand = character.bone('rightHand'), mid = character.bone('rightMiddleProximal');
  if (!hand) return;
  const H = worldPos(hand, _a), M = mid ? worldPos(mid, _b) : _b.copyFrom(H);
  const palm = Vector3.LerpToRef(H, M, 0.75, _c);
  if (mode === 'hang') {
    mesh.position.set(palm.x, palm.y - 0.36, palm.z);
    mesh.rotation.set(0, yaw + Math.PI / 2, 0);
    return;
  }
  const bb = mesh.getBoundingInfo?.().boundingBox;
  const half = bb ? (bb.maximum.y + bb.minimum.y) / 2 * mesh.scaling.y : 0;
  mesh.position.set(palm.x, palm.y - half, palm.z);   // centred in the palm
  mesh.rotation.set(tilt, yaw, 0);
}
