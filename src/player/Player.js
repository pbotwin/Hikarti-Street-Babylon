import { Vector3 } from '@babylonjs/core';
import { MathUtils } from './math.js';

/**
 * The heroine's movement, the same feel as the original game: camera-relative
 * acceleration, walk / run, a short wind-up before a jump, coyote time and
 * jump buffering, separate rise / fall gravity, kerb step-ups and smooth
 * visual step heights, all against the shared box collision world.
 */
const WALK_SPEED = 1.75;
const RUN_SPEED = 5.4;
const RUN_THRESHOLD = 0.85;
const ACCEL = 16;
const DECEL = 20;
const AIR_CONTROL = 0.75;
const GRAVITY_UP = 26;
const GRAVITY_FALL = 34;
const MAX_FALL = 18;
const JUMP_VELOCITY = 8.4;
const WINDUP = 0.08;
const LEDGE_ASSIST = 0.6;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.14;
const RADIUS = 0.28;
const HEIGHT = 1.55;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Player {
  constructor({ vrm, animator, input, collision, cameraRig, state }) {
    Object.assign(this, { vrm, anim: animator, input, collision, cameraRig, state });
    this.position = new Vector3();
    this.velocity = new Vector3();
    this.yaw = 0;
    this.visualY = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.windup = 0;
    this.runBlend = 0;
    this.turnRate = 0;
    this.airTime = 0;
    this.minVy = 0;
    this.lastGroundY = 0;
  }

  get speed() { return Math.hypot(this.velocity.x, this.velocity.z); }

  spawn(x, z, yaw) {
    this.position.set(x, this.collision.groundHeight(x, z, RADIUS, 0.5, 0.6), z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.visualY = this.position.y;
    this.grounded = true;
    this._sync();
  }

  update(dt, controlsActive) {
    const mv = controlsActive ? this.input.move : { x: 0, y: 0 };
    let mag = Math.min(1, Math.hypot(mv.x, mv.y));
    if (this.input.runLock && mag > 0.15) mag = 1;

    const cy = this.cameraRig.yaw;
    const fx = Math.sin(cy), fz = Math.cos(cy);
    const rx = -Math.cos(cy), rz = Math.sin(cy);
    let dx = fx * mv.y + rx * mv.x;
    let dz = fz * mv.y + rz * mv.x;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; }

    let targetSpeed = 0, run = 0;
    if (mag > 0.02) {
      if (mag < RUN_THRESHOLD) targetSpeed = MathUtils.lerp(0.7, WALK_SPEED, mag / RUN_THRESHOLD);
      else { run = 1; targetSpeed = RUN_SPEED; }
    }
    this.runBlend = MathUtils.lerp(this.runBlend, run, 1 - Math.exp(-5 * dt));

    const tvx = dx * targetSpeed, tvz = dz * targetSpeed;
    const control = this.grounded ? 1 : AIR_CONTROL;
    const rate = (targetSpeed > this.speed ? ACCEL : DECEL) * control;
    const ax = tvx - this.velocity.x, az = tvz - this.velocity.z;
    const al = Math.hypot(ax, az);
    const step = Math.min(al, rate * dt * Math.max(1, targetSpeed / 2));
    if (al > 1e-5) { this.velocity.x += (ax / al) * step; this.velocity.z += (az / al) * step; }

    const prevYaw = this.yaw;
    if (mag > 0.05) {
      const want = Math.atan2(dx, dz);
      this.yaw += wrapAngle(want - this.yaw) * (1 - Math.exp(-(this.grounded ? 11 : 5) * dt));
    }
    const tr = wrapAngle(this.yaw - prevYaw) / Math.max(dt, 1e-4);
    this.turnRate = MathUtils.lerp(this.turnRate, tr, 1 - Math.exp(-12 * dt));

    if (controlsActive && this.input.consumeJump()) this.jumpBuffer = JUMP_BUFFER;
    this.jumpBuffer -= dt;
    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0 && !(this.windup > 0)) {
      this.jumpBuffer = 0;
      if (this.grounded) { this.windup = this.speed > 3 ? WINDUP * 0.55 : WINDUP; this.anim.windup(this.windup); }
      else this._launch();
    }
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0 || !this.grounded) { this.windup = 0; this._launch(); }
    }

    const g = this.velocity.y > 0 ? GRAVITY_UP : GRAVITY_FALL;
    this.velocity.y = Math.max(-MAX_FALL, this.velocity.y - g * dt);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    if (this.velocity.y > 0) {
      const ceil = this.collision.ceilingHeight(this.position.x, this.position.z, RADIUS, this.position.y, HEIGHT);
      if (ceil < this.position.y + HEIGHT) { this.position.y = ceil - HEIGHT; this.velocity.y = 0; }
    }

    const before = { x: this.position.x, z: this.position.z };
    const stepUp = !this.grounded && this.velocity.y < 3 ? LEDGE_ASSIST : 0.35;
    if (this.collision.resolveCircle(this.position, RADIUS, this.position.y, HEIGHT, stepUp)) {
      const nx = this.position.x - before.x, nz = this.position.z - before.z, nl = Math.hypot(nx, nz);
      if (nl > 1e-6) {
        const ux = nx / nl, uz = nz / nl, vn = this.velocity.x * ux + this.velocity.z * uz;
        if (vn < 0) { this.velocity.x -= vn * ux; this.velocity.z -= vn * uz; }
      }
    }

    const ground = this.collision.groundHeight(this.position.x, this.position.z, RADIUS, this.position.y, stepUp);
    const wasGrounded = this.grounded;
    if (!this.grounded) { this.airTime += dt; this.minVy = Math.min(this.minVy, this.velocity.y); }
    if (this.position.y <= ground) {
      this.position.y = ground;
      if (!wasGrounded) {
        const impact = MathUtils.clamp((-this.minVy - 7) / 9, 0, 1);
        this.anim.land(impact);
        this.state?.emit('player:land', { impact });
      }
      this.velocity.y = 0;
      this.grounded = true;
      this.lastGroundY = this.position.y;
    } else if (this.grounded && this.position.y - ground < 0.4 && this.velocity.y <= 0) {
      this.position.y = ground;
      this.velocity.y = 0;
    } else this.grounded = false;
    if (!this.grounded && wasGrounded && this.velocity.y <= 0) { this.airTime = 0; this.minVy = 0; }

    const dy = this.position.y - this.visualY;
    this.visualY = this.grounded && dy > 0 && dy < 0.6 ? this.visualY + dy * (1 - Math.exp(-18 * dt)) : this.position.y;
    this._sync();

    this.anim.update(dt, {
      speed: this.grounded ? this.speed : 0,
      runBlend: this.runBlend * MathUtils.clamp((this.speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED) * 1.4, 0, 1),
      grounded: this.grounded,
      vy: this.velocity.y,
      airSpeed: this.grounded ? 0 : this.speed,
      turnRate: this.turnRate,
    });
  }

  _launch() {
    this.velocity.y = JUMP_VELOCITY;
    this.grounded = false;
    this.coyote = 0;
    this.airTime = 0;
    this.minVy = 0;
    this.anim.takeoff();
    this.state?.emit('player:jump', {});
  }

  _sync() {
    const root = this.vrm.root;
    root.position.set(this.position.x, this.visualY, this.position.z);
    root.rotation.y = this.yaw;
  }
}
