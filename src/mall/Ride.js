/**
 * Her body carried by something that moves her (an escalator's step, the
 * lift's car), as PlayerController's ride (the hook the vehicles and the
 * cart use): no physics; each frame the carrier says where she is and how
 * fast she walks, and she is posed there with her feet on its floor
 * (`ground`: the floor's height under a point, the step under each foot).
 */
export class Ride {
  constructor({ player, animation }) {
    Object.assign(this, { player, animation });
    this.anim = { speed: 0, runBlend: 0, grounded: true, vy: 0, airSpeed: 0, turnRate: 0, rootY: 0, footGround: null };
    this.hook = { update: (dt, active) => this._step(dt, active) };
    this._update = null;
  }

  get active() { return this.player.ride === this.hook; }

  /**
   * She is carried from now on: `update(dt, controlsActive)` runs each frame
   * and calls place(); `ground(x, z)` gives the floor under her feet.
   */
  begin(update, ground) {
    this._update = update;
    this.anim.footGround = ground;
    this.player.ride = this.hook;
    this.player.velocity.set(0, 0, 0);
  }

  /** She walks on by herself again, at (vx, vz) m/s. */
  end(vx = 0, vz = 0) {
    if (!this.active) return;
    this.player.ride = null;
    this.player.velocity.set(vx, 0, vz);
    this.player.grounded = true;
    this._update = null;
  }

  /** Pose her this frame: at (x, y, z) facing yaw, her legs walking at `speed` (m/s, 0: standing). */
  place(dt, x, y, z, yaw, speed) {
    const pl = this.player, a = this.anim;
    a.turnRate = dt > 0 ? Math.max(-6, Math.min(6, Math.atan2(Math.sin(yaw - pl.yaw), Math.cos(yaw - pl.yaw)) / dt)) : 0;
    pl.position.set(x, y, z);
    pl.visualY = y;
    pl.yaw = yaw;
    pl.grounded = true;
    // Her own pace (footsteps follow it), not the carrier's.
    pl.velocity.set(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
    pl._sync();
    a.speed = speed;
    a.rootY = y;
    this.animation.update(dt, a);
    pl._footsteps();
  }

  _step(dt, active) {
    if (this._update) this._update(dt, active);
    else this.end();
  }
}
