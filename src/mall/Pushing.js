import { MathUtils } from '../player/math.js';
import { PULL_BACK } from './Cart.js';

/**
 * Her pushing a shopping cart, as PlayerController's ride (the hook the
 * vehicles use): the stick steers the cart (camera-relative, as she walks),
 * the cart moves with its own inertia and collisions, and she is placed
 * behind its handle with both hands on it, walking at its speed. The cart
 * owns her pose here rather than following her: her hands are set on the
 * handle in the same frame the cart moves (no lag behind it), she turns as
 * the cart turns about its back wheels, and where the cart can't go, she
 * can't either. Pulled straight back, it rolls back slowly. No jumping
 * while pushing.
 *
 * drive(x, z, done) pushes (or pulls back) the cart's centre to a point by
 * itself (along the checkout lane, into a corral).
 */
const _l = [0, 0, 0], _r = [0, 0, 0];
const clamp = MathUtils.clamp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _p = { x: 0, z: 0 };

export class Pushing {
  constructor({ player, animation, input, cameraRig, collision }, tones) {
    Object.assign(this, { player, animation, input, cameraRig, collision, tones });
    this.cart = null;
    this.auto = null;
    this.hands = { wl: 0, wr: 0, l: _l, r: _r };
    this.anim = { speed: 0, runBlend: 0, grounded: true, vy: 0, airSpeed: 0, turnRate: 0, rootY: 0, footGround: null };
    this.ride = { update: (dt, active) => this._update(dt, active) };
    this._bump = 0;
  }

  get active() { return !!this.cart; }

  /** Start pushing `cart` (she is behind its handle, hands already on it). */
  start(cart) {
    this.cart = cart;
    this.auto = null;
    const pl = this.player;
    this.anim.footGround = (x, z) => this.collision.groundHeight(x, z, 0.05, pl.position.y, 0.3);
    this.hands.wl = this.hands.wr = 1;
    this.animation.act.hands = this.hands;
    pl.ride = this.ride;
  }

  /** Let go (the cart rolls to a stop on its own). */
  stop() {
    if (!this.cart) return;
    const c = this.cart;
    this.cart = null;
    this.auto = null;
    c.speed = 0; c.turn = 0;
    this.player.ride = null;
    this.player.velocity.set(0, 0, 0);
  }

  /**
   * Push the cart to (x, z) by itself (controls off), then done(arrived):
   * false when something kept it from getting there (no closer for a second).
   */
  drive(x, z, done) { this.auto = { x, z, done, t: 0, best: Infinity, bestT: 0 }; }

  _update(dt, active) {
    const cart = this.cart, pl = this.player;
    if (!cart) { pl.ride = null; return; }
    // Where she wants to go: the stick, camera-relative (as PlayerController reads it).
    let heading = cart.yaw, amount = 0;
    if (this.auto) {
      const a = this.auto;
      cart.pusher(_p);
      const hx = cart.x - _p.x, hz = cart.z - _p.z;   // her pushing direction
      const ex = a.x - cart.x, ez = a.z - cart.z, d = Math.hypot(ex, ez);
      a.t += dt;
      if (d < a.best - 0.01) { a.best = d; a.bestT = a.t; }
      if (d < 0.08 || a.t - a.bestT > 1.5) {
        this.auto = null;
        cart.speed = 0; cart.turn = 0;
        a.done(d < 0.08);
      } else {
        heading = Math.atan2(ex, ez);
        // Ease into the stop; a brisk push (a slow one made the lane's last
        // metres to the register take 6 s), gentler while it swings round.
        const c = Math.cos(heading - Math.atan2(hx, hz));
        amount = clamp(d * 1.8, 0.2, 1) * (c > 0.36 || c < PULL_BACK ? 1 : 0.4);
      }
    } else if (active) {
      const mv = this.input.move, cy = this.cameraRig.yaw;
      const fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
      const dx = fx * mv.y + rx * mv.x, dz = fz * mv.y + rz * mv.x;
      amount = Math.min(1, Math.hypot(mv.x, mv.y));
      if (amount > 0.02) heading = Math.atan2(dx, dz);
      // No jumping while pushing (and no stale press when she lets go).
      this.input.consumeJump();
    }
    const x0 = pl.position.x, z0 = pl.position.z, yaw0 = pl.yaw;
    const hit = cart.push(dt, heading, amount);
    if (hit > 0.5 && this._bump <= 0) { this.tones.rattle(Math.min(1, hit)); this._bump = 0.4; }
    this._bump -= dt;
    cart.pusher(_p);
    pl.position.x = _p.x;
    pl.position.z = _p.z;
    pl.position.y = pl.visualY = this.collision.groundHeight(_p.x, _p.z, 0.28, pl.position.y, 0.35);
    pl.yaw = cart.yaw;
    pl.grounded = true;
    const vx = (_p.x - x0) / Math.max(dt, 1e-4), vz = (_p.z - z0) / Math.max(dt, 1e-4);
    pl.velocity.set(vx, 0, vz);
    pl._sync();
    // Hands on the handle, set before the arms are solved this frame.
    cart.grips(_l, _r);
    const a = this.anim;
    a.speed = Math.hypot(vx, vz);
    a.turnRate = clamp(wrap(cart.yaw - yaw0) / Math.max(dt, 1e-4), -6, 6);
    a.rootY = pl.visualY;
    this.animation.update(dt, a);
    pl._footsteps();
  }
}
