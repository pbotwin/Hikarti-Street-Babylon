import { Vector3 } from '@babylonjs/core';

/**
 * A right hand that holds things: the heroine's (Her) and the mall staff's
 * and shoppers' (ResidentHand). Nothing a hand handles moves by itself:
 * hold() takes a thing where it is, relative to the palm, and carry() (every
 * frame, after the body is posed) keeps it there, turning with the body.
 * holdTo() aims the hand so the held thing goes to a world point (setting it
 * down exactly where it belongs); palmTo() puts the palm itself on a point
 * (taking hold of something). Arm IK aims the wrist, so both take off the
 * palm's (and the thing's) offset from it as posed this frame; what is left
 * is one frame of change, which the next frame corrects.
 *
 * A subclass gives `yaw` (the body's facing), aim(x, y, z, w) (the wrist's
 * target, weight w) and _hand() (fills _wrist and _palm, world, as posed).
 * A thing is { put(x, y, z, yaw, rx) }, placed by its base.
 */
const _c = new Vector3();

export class Grip {
  constructor() {
    this.held = null;   // { thing, lx, ly, lz, yaw, rx }: offset from the palm in the body's frame
    this._palm = new Vector3();
    this._wrist = new Vector3();
  }

  /** The palm onto a world point with weight w. */
  palmTo(x, y, z, w) {
    this._hand();
    const P = this._palm, W = this._wrist;
    this.aim(x - (P.x - W.x), y - (P.y - W.y), z - (P.z - W.z), w);
  }

  /** The palm as posed now (world, into out). */
  palm(out) {
    this._hand();
    return out.copyFrom(this._palm);
  }

  /** The hand closes on `thing`, whose base is at (x, y, z) turned yaw (tipped rx) now. */
  hold(thing, x, y, z, yaw, rx = 0) {
    this._hand();
    const P = this._palm, s = Math.sin(this.yaw), c = Math.cos(this.yaw), dx = x - P.x, dz = z - P.z;
    this.held = { thing, lx: c * dx - s * dz, ly: y - P.y, lz: s * dx + c * dz, yaw: yaw - this.yaw, rx };
    return this.held;
  }

  /** Let go of what it holds (it stays where it is: whoever takes it moves it on from there). */
  letGo() {
    const h = this.held;
    this.held = null;
    return h?.thing || null;
  }

  /** Where the held thing's base is (as of the last _hand(); into out, an { x, y, z }); returns its yaw. */
  heldAt(out) {
    const h = this.held, P = this._palm, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    out.x = P.x + c * h.lx + s * h.lz; out.y = P.y + h.ly; out.z = P.z - s * h.lx + c * h.lz;
    return this.yaw + h.yaw;
  }

  /** Where the palm is with the held thing's base at (x, y, z) (into out, an { x, y, z }). */
  palmFor(x, y, z, out) {
    const h = this.held, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    out.x = x - (c * h.lx + s * h.lz); out.y = y - h.ly; out.z = z - (-s * h.lx + c * h.lz);
    return out;
  }

  /** The hand moves so the held thing's base goes to (x, y, z), with weight w. */
  holdTo(x, y, z, w) {
    const p = this.palmFor(x, y, z, _c);
    this.palmTo(p.x, p.y, p.z, w);
  }

  /** The wrist turns the held thing toward world yaw (and tip rx), k (0..1) of the way from where it is. */
  turnHeld(yaw, rx, k) {
    const h = this.held, want = yaw - this.yaw;
    h.yaw += Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw)) * k;
    h.rx += (rx - h.rx) * k;
  }

  /** Per frame, after the body is posed (and placed): the held thing follows the palm. */
  carry() {
    if (!this.held) return;
    this._hand();
    const yaw = this.heldAt(_c);
    this.held.thing.put(_c.x, _c.y, _c.z, yaw, this.held.rx);
  }
}

const _chain = [];
/** World position of a node, its ancestors' matrices brought up to date first. */
export function worldPos(node, out) {
  _chain.length = 0;
  for (let n = node; n; n = n.parent) _chain.push(n);
  for (let i = _chain.length - 1; i >= 0; i--) _chain[i].computeWorldMatrix(true);
  return out.copyFrom(node.getAbsolutePosition());
}

/**
 * A resident's right hand (posed with Poses' 'hands' act: `target` is the
 * wrist's). The palm is three quarters of the way from the wrist to the
 * middle finger's root (the hand node's child of that name), or, on a model
 * without one, a hand's length on along the forearm.
 */
export class ResidentHand extends Grip {
  constructor(r) {
    super();
    this.r = r;
    this.target = new Vector3();
    this.w = 0;
    this.finger = r.bones.rightHand.getChildren((n) => /middle/i.test(n.name), true)[0] || null;
    this._elbow = new Vector3();
  }

  get yaw() { return this.r.root.rotation.y; }

  aim(x, y, z, w) {
    this.target.set(x, y, z);
    this.w = w;
  }

  _hand() {
    // One pass down the chain (to the finger, or the wrist): the nodes above are current after it.
    const b = this.r.bones;
    if (this.finger) {
      worldPos(this.finger, this._palm);
      Vector3.LerpToRef(this._wrist.copyFrom(b.rightHand.getAbsolutePosition()), this._palm, 0.75, this._palm);
      return;
    }
    const W = worldPos(b.rightHand, this._wrist), E = this._elbow.copyFrom(b.rightLowerArm.getAbsolutePosition());
    W.subtractToRef(E, this._palm).normalize().scaleInPlace(0.065).addInPlace(W);
  }
}
