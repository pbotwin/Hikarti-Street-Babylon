import { Vector3 } from '@babylonjs/core';

/**
 * The heroine as the supermarket's scripted moments use her: freezing her
 * for an animation, turning and stepping her, her right hand reaching for a
 * world point (CharacterAnimation's act layer: reach, holdR, crouch, hands),
 * and where her palm is, for whatever she holds there.
 */
const _a = new Vector3(), _b = new Vector3();
const _chain = [];

export class Her {
  constructor({ player, animation, character }) {
    Object.assign(this, { player, animation, character });
    this.reach = { x: 0, y: 0, z: 0, w: 0 };      // reused act.reach
  }

  get act() { return this.animation.act; }
  get x() { return this.player.position.x; }
  get z() { return this.player.position.z; }
  get yaw() { return this.player.yaw; }

  /** An animation owns her (no stick, no physics) or lets her go. */
  freeze(on) {
    this.player.hold = on;
    this.player.velocity.set(0, 0, 0);
  }

  /** Stand her at (x, z) facing yaw (during a scripted moment). */
  place(x, z, yaw = this.player.yaw) {
    this.player.position.x = x;
    this.player.position.z = z;
    this.player.yaw = yaw;
    this.player._sync();
  }

  /** Right hand toward a world point with weight w (0 = at rest). */
  reachTo(x, y, z, w) {
    const r = this.reach;
    r.x = x; r.y = y; r.z = z; r.w = w;
    this.act.reach = w > 0.001 ? r : null;
  }

  /** How much to crouch for a hand at height y (low shelves, the bottom of the cart). */
  static crouchFor(y) { return Math.min(1, Math.max(0, (0.95 - y) / 0.7)); }

  /** Her right palm (world, into out): between the wrist and the knuckles. */
  palm(out) {
    const hand = this.character.bone('rightHand'), mid = this.character.bone('rightMiddleProximal');
    if (!hand) return out.copyFrom(this.player.position);
    const H = worldPos(hand, _a), M = mid ? worldPos(mid, _b) : _b.copyFrom(H);
    return Vector3.LerpToRef(H, M, 0.75, out);
  }

  /** Arms back to her own (nothing held, nothing reached for). */
  rest() {
    const act = this.act;
    act.reach = null; act.hands = null; act.holdR = 0; act.crouch = 0;
  }
}

/** World position of a node, its ancestors' matrices brought up to date first. */
function worldPos(node, out) {
  _chain.length = 0;
  for (let n = node; n; n = n.parent) _chain.push(n);
  for (let i = _chain.length - 1; i >= 0; i--) _chain[i].computeWorldMatrix(true);
  return out.copyFrom(node.getAbsolutePosition());
}

/** Angle from a to b by t, the short way round (her turns). */
export function lerpAngle(a, b, t) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}
