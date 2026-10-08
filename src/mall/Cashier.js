import { Quaternion, Vector3 } from '@babylonjs/core';
import { animateResident, eulerToRef } from '../npcs/NPCModels.js';
import { applyAct } from '../npcs/life/Acts.js';
import { ResidentHand } from './Grip.js';
import { Timeline, ease, lerp, wrap } from './Timeline.js';

/**
 * A member of staff behind a counter (the supermarket's checkouts, the
 * clothing store's till): a posed resident who steps along the counter
 * (legs walking), reaches with the right hand (Poses' 'hands' IK) and holds
 * what she handles in it (ResidentHand): nothing she serves moves except in
 * her hand. Her actions are Timeline steps made by the step helpers here;
 * update() poses her and carries what she holds.
 */
const _q = new Quaternion(), _p = new Vector3();

export class Cashier {
  /** `r` a resident (createResident), standing at `spot` ({ x, z, yaw }) on the floor at y. */
  constructor(r, spot, y, gender) {
    Object.assign(this, { r, gender, y });
    this.home = { x: spot.x, z: spot.z, yaw: spot.yaw };
    this.at = { x: spot.x, z: spot.z, yaw: spot.yaw };
    this.hand = new ResidentHand(r);
    this.tl = new Timeline();
    this.opts = { l: null, r: this.hand.target, lean: 0, pitch: 0 };   // Poses' 'hands' (reused)
    this.speed = 0;
    this.phase = 0;
    this.lookYaw = 0;
    this.bowT = 0;
    this.time = 0;
    this.frame = 0;
    this._was = { x: spot.x, z: spot.z };
    this._place();
    animateResident(r, 0, { gender });
  }

  get busy() { return this.tl.running; }

  /** A thank-you bow. */
  bow() { this.bowT = 1.2; }

  // ------------------------------------------------------------ steps
  /** Step: she walks to `to()` ({ x, z, yaw } when the step starts). */
  go(to) {
    let from = null, goal = null, t = 0, d = Infinity;
    return {
      until: () => t >= d,
      step: (k, dt, first) => {
        if (first) {
          goal = to();
          from = { x: this.at.x, z: this.at.z, yaw: this.at.yaw };
          t = 0;
          // A practised step along her counter (~2.4 m/s at most, eased: at
          // ~1.8 she kept customers waiting at the end of the belt).
          d = Math.max(0.2, Math.hypot(goal.x - from.x, goal.z - from.z) / 1.6, Math.abs(wrap(goal.yaw - from.yaw)) / 6);
        }
        t += dt;
        const m = ease(t / d);
        this.at.x = lerp(from.x, goal.x, m);
        this.at.z = lerp(from.z, goal.z, m);
        this.at.yaw = from.yaw + wrap(goal.yaw - from.yaw) * m;
      },
    };
  }

  /**
   * Steps: her palm (`held` false) or what she holds (true) to a world
   * point (`to()` when the step starts), arcing over `lift`, leaning `lean`;
   * held there a moment for the arm to settle.
   */
  move(held, to, { lift = 0.04, d = 0.35, lean = 0.15 } = {}) {
    const hand = this.hand, o = this.opts;
    let from = null, goal = null;
    const put = (x, y, z) => (held ? hand.holdTo(x, y, z, 1) : hand.palmTo(x, y, z, 1));
    return [
      { d, step: (k, dt, first) => {
        if (first) {
          if (held) { hand.carry(); hand.heldAt(_p); } else hand.palm(_p);
          from = { x: _p.x, y: _p.y, z: _p.z, lean: o.lean, w: hand.w };
          goal = to();
        }
        const m = ease(k);
        o.lean = lerp(from.lean, lean, m);
        put(lerp(from.x, goal.x, m), lerp(from.y, goal.y, m) + Math.sin(m * Math.PI) * lift, lerp(from.z, goal.z, m));
        hand.w = Math.max(from.w, Math.min(1, k * 3));
      } },
      { d: 0.06, step: () => put(goal.x, goal.y, goal.z) },
    ];
  }

  /** Step: her hand back down to her side. */
  rest(d = 0.35) {
    const hand = this.hand, o = this.opts;
    let w0 = 0, lean0 = 0;
    return { d, step: (k, dt, first) => {
      if (first) { w0 = hand.w; lean0 = o.lean; }
      hand.w = w0 * (1 - ease(k));
      o.lean = lean0 * (1 - ease(k));
    } };
  }

  // ------------------------------------------------------------ per frame
  /**
   * Pose her (looking at `p`, the heroine, when near) and carry what she
   * holds. Level of detail as the shoppers': posed every frame up close,
   * every 2nd / 4th further away, every 8th off screen, not at all beyond
   * 30 m unless she holds something (her hands' IK with what they carry was
   * most of the checkouts' time, 4x CPU).
   */
  update(dt, p, planes) {
    this.time += dt;
    this.tl.update(dt);
    this._place();
    const r = this.r, root = r.root.position;
    const moved = Math.hypot(root.x - this._was.x, root.z - this._was.z);
    this._was.x = root.x; this._was.z = root.z;
    this.speed = lerp(this.speed, dt > 0 ? Math.min(1, moved / dt / 0.9) : 0, 1 - Math.exp(-10 * dt));
    this.phase = (this.phase + moved / 1.25) % 1;
    const dx = p.x - root.x, dz = p.z - root.z, d = Math.hypot(dx, dz);
    if (d > 30 && !this.hand.held) return;
    const seen = !planes || r.casters[0].isInFrustum(planes);
    if (++this.frame % (!seen ? 8 : d < 8 ? 1 : d < 18 ? 2 : 4)) return;
    const look = Math.max(-1, Math.min(1, wrap(Math.atan2(dx, dz) - r.root.rotation.y)));
    this.lookYaw = lerp(this.lookYaw, d < 5 && this.hand.w < 0.1 ? look : 0, 1 - Math.exp(-4 * dt));
    animateResident(r, this.time, { walk: this.speed, phase: this.phase, look: this.lookYaw, gender: this.gender });
    // A bow first: her hands' IK then reaches from the bowed body.
    if (this.bowT > 0) {
      this.bowT = Math.max(0, this.bowT - dt);
      const k = Math.sin((1 - this.bowT / 1.2) * Math.PI);
      eulerToRef(0.5 * k, 0, 0, 'XYZ', _q);
      r.bones.spine?.rotationQuaternion.multiplyInPlace(_q);
      r.bones.chest?.rotationQuaternion.multiplyInPlace(_q);
    }
    if (this.hand.w > 0.001) {
      // She looks down at her hands while they work.
      this.opts.pitch = 0.35 * this.hand.w;
      applyAct(r, 'hands', this.time, this.hand.w, false, this.opts);
    }
    this.hand.carry();
  }

  _place() {
    const root = this.r.root;
    root.position.set(this.at.x, this.y, this.at.z);
    root.rotation.y = this.at.yaw;
  }
}
