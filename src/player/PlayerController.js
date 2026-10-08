import { Vector3 } from '@babylonjs/core';
import { MathUtils } from './math.js';
import { keyed } from './CharacterAnimation.js';

const WALK_SPEED = 1.75;
const RUN_SPEED = 5.4;
const RUN_THRESHOLD = 0.85;   // joystick magnitude where running starts
const ACCEL = 16;
const DECEL = 20;
const AIR_CONTROL = 0.75;
// Jump tuned for platforming: ~1.55 m apex when held, ~1.3 m on a quick tap,
// snappy fall. Total airtime ≈ 0.65 s.
// Same height for a quick tap and a hold: phone taps are short, and a
// tap-dependent jump made objects hard to climb.
const GRAVITY_UP = 26;
const GRAVITY_FALL = 34;
const MAX_FALL = 18;
const JUMP_VELOCITY = 8.4;     // ≈1.35 m apex: lively but believable, clears benches, crates and cars
const WINDUP = 0.08;          // brief crouch before liftoff (shorter when running)
const LEDGE_ASSIST = 0.6;     // airborne: pop onto ledges this far above the feet
const COYOTE = 0.12;
const JUMP_BUFFER = 0.14;
// Her collision body (also used by NPCSystem to keep her out of residents).
export const RADIUS = 0.28;
export const HEIGHT = 1.55;
// Climbing onto cars and vans: jump next to one (or touch its side in the
// air while pushing toward it) to grab the roof edge and mantle up.
const CLIMB_REACH = 0.5;      // how far ahead of the body a ledge can be grabbed from the ground
const CLIMB_AIR_REACH = 0.18; // mid-air grab distance
const CLIMB_MIN = 0.7;        // lower tops are just stepped/jumped onto
const CLIMB_MAX = 2.45;       // highest top above the feet she can reach

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Camera-relative character movement: acceleration-based for weight, but
 * with high accel values so it still feels instant on a touch screen.
 * Includes coyote time and jump buffering — tiny details that make jumping
 * feel forgiving and responsive.
 */
export class PlayerController {
  constructor({ character, animation, input, collision, cameraRig, state }) {
    // Shop treats (ShopSystem): a drink runs faster, a snack jumps higher.
    this.runBoost = 1;
    this.jumpBoost = 1;
    this.character = character;
    this.anim = animation;
    this.input = input;
    this.collision = collision;
    this.cameraRig = cameraRig;
    this.state = state;

    this.position = new Vector3();
    this.velocity = new Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.turnRate = 0;
    this.runBlend = 0;
    this.stepTimer = 0;
    this.lastFoot = 0;
    this.visualY = 0;
    this.airTime = 0;
    this.minVy = 0;
    this.climb = null;
    // Vehicle ride (VehicleSystem) takes over the body while set.
    this.ride = null;
    // Walk by herself to a point (e.g. the car door), then call done().
    this.autoWalk = null;
    // Movement limits while handling something (a shopping cart):
    // { maxSpeed (m/s), jump (allowed) }; null = free.
    this.restrict = null;
  }

  spawn(x, z, yaw) {
    this.position.set(x, 0, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.visualY = 0;
    this.grounded = true;
    this.climb = null;
    this._sync();
    this.character.resetSecondaryMotion();
  }

  get speed() { return Math.hypot(this.velocity.x, this.velocity.z); }

  update(dt, controlsActive) {
    // A walk asked for while she can't walk (riding, held, climbing) ends at
    // once where she is: it never ran or finished otherwise, and its caller
    // (a mall action) kept the controls off for good.
    if (this.autoWalk && (this.ride || this.hold || this.climb)) {
      const a = this.autoWalk;
      this.autoWalk = null;
      a.done(Math.hypot(a.x - this.position.x, a.z - this.position.z));
    }
    if (this.ride) { this.ride.update(dt, controlsActive); return; }
    // Held in place by a shop action (taking a product, paying, sitting):
    // no physics, so a chair's collider doesn't push her off it.
    if (this.hold) {
      this.velocity.set(0, 0, 0);
      this._sync();
      this.anim.update(dt, {
        speed: 0, runBlend: 0, grounded: true, vy: 0, airSpeed: 0, turnRate: 0, rootY: this.visualY,
        // Feet stay planted on the floor (crouching at a shelf, paying).
        footGround: this._footGround || (this._footGround = (x, z) => this.collision.groundHeight(x, z, 0.05, this.position.y, 0.3)),
      });
      return;
    }
    if (this.climb) { this._updateClimb(dt, controlsActive); return; }
    const mv = controlsActive && !this.autoWalk ? this.input.move : { x: 0, y: 0 };
    let mag = Math.min(1, Math.hypot(mv.x, mv.y));
    // Sprint toggle: any deliberate push runs.
    if (this.input.runLock && mag > 0.15) mag = 1;

    // Camera-relative direction. Camera yaw 0 looks toward +Z.
    const cy = this.cameraRig.yaw;
    const fx = Math.sin(cy), fz = Math.cos(cy);       // camera forward (flat)
    const rx = -Math.cos(cy), rz = Math.sin(cy);      // camera right
    let dx = fx * mv.y + rx * mv.x;
    let dz = fz * mv.y + rz * mv.x;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-4) { dx /= dl; dz /= dl; }

    if (this.autoWalk) {
      // Brisk walk to the target, slowing for the last half metre.
      const a = this.autoWalk;
      const ex = a.x - this.position.x, ez = a.z - this.position.z, d = Math.hypot(ex, ez);
      a.t = (a.t || 0) + dt;
      // No progress for 0.4 s: she is up against something (the vehicle).
      if (!(d > (a.best ?? Infinity) - 0.01)) { a.best = d; a.bestT = a.t; }
      const stuck = a.t - a.bestT > 0.4;
      // 20 cm is close enough: the get-in path blends from where she stops.
      // (A 7 cm goal was rarely reached beside the vehicle's collider, so
      // getting in waited out the 3.5 s timeout.)
      if (d < 0.2 || stuck || a.t > 3.5) { this.autoWalk = null; a.done(d); }
      else { dx = ex / d; dz = ez / d; mag = Math.min(0.75, 0.3 + d * 0.8); }
    }

    let targetSpeed = 0;
    let run = 0;
    if (mag > 0.02) {
      if (mag < RUN_THRESHOLD) targetSpeed = MathUtils.lerp(0.7, WALK_SPEED, mag / RUN_THRESHOLD);
      else { run = 1; targetSpeed = RUN_SPEED * this.runBoost; }
      if (this.restrict) { targetSpeed = Math.min(targetSpeed, this.restrict.maxSpeed); if (targetSpeed <= WALK_SPEED) run = 0; }
    }
    this.runBlend = MathUtils.lerp(this.runBlend, run, 1 - Math.exp(-5 * dt));

    // Horizontal velocity toward target.
    const tvx = dx * targetSpeed, tvz = dz * targetSpeed;
    const control = this.grounded ? 1 : AIR_CONTROL;
    const rate = (targetSpeed > this.speed ? ACCEL : DECEL) * control;
    const ax = tvx - this.velocity.x, az = tvz - this.velocity.z;
    const al = Math.hypot(ax, az);
    const step = Math.min(al, rate * dt * Math.max(1, targetSpeed / 2));
    if (al > 1e-5) {
      this.velocity.x += (ax / al) * step;
      this.velocity.z += (az / al) * step;
    }

    // Facing: turn toward the intended direction (fast, but not instant).
    const prevYaw = this.yaw;
    if (mag > 0.05) {
      const want = Math.atan2(dx, dz);
      const diff = wrapAngle(want - this.yaw);
      const turnSpeed = this.grounded ? 11 : 5;
      this.yaw += diff * (1 - Math.exp(-turnSpeed * dt));
    }
    const tr = wrapAngle(this.yaw - prevYaw) / Math.max(dt, 1e-4);
    this.turnRate = MathUtils.lerp(this.turnRate, tr, 1 - Math.exp(-12 * dt));

    // ---- Jump (buffer + coyote) ----
    if (controlsActive && this.input.consumeJump() && !this.autoWalk && !(this.restrict && !this.restrict.jump)) this.jumpBuffer = JUMP_BUFFER;
    this.jumpBuffer -= dt;
    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    // Climb instead of jumping when there's a car/van roof right in front.
    // In the air, pushing into one near/after the apex grabs its edge.
    const cdx = mag > 0.2 ? dx : Math.sin(this.yaw), cdz = mag > 0.2 ? dz : Math.cos(this.yaw);
    if (this.jumpBuffer > 0 && this.grounded && !(this.windup > 0) && this._tryClimb(cdx, cdz, CLIMB_REACH)) {
      this.jumpBuffer = 0;
      return;
    }
    if (!this.grounded && mag > 0.2 && this.velocity.y < 3 && this._tryClimb(dx, dz, CLIMB_AIR_REACH)) return;
    if (this.jumpBuffer > 0 && this.coyote > 0 && !(this.windup > 0)) {
      this.jumpBuffer = 0;
      if (this.grounded) {
        // Anticipation: a quick crouch, then launch. Gives the jump weight.
        this.windup = this.speed > 3 ? WINDUP * 0.55 : WINDUP;
        this.anim.windup(this.windup);
      } else this._launch(); // coyote jump off a ledge: launch immediately
    }
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0 || !this.grounded) { this.windup = 0; this._launch(); }
    }

    // ---- Integrate ----
    const rising = this.velocity.y > 0;
    const g = rising ? GRAVITY_UP : GRAVITY_FALL;
    this.velocity.y = Math.max(-MAX_FALL, this.velocity.y - g * dt);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // Ceiling (checked before walls so overhead roofs stop the jump rather
    // than shoving the player sideways): bump your head instead of passing through roofs and awnings.
    if (this.velocity.y > 0) {
      const ceil = this.collision.ceilingHeight(this.position.x, this.position.z, RADIUS, this.position.y, HEIGHT);
      if (ceil < this.position.y + HEIGHT) {
        this.position.y = ceil - HEIGHT;
        this.velocity.y = 0;
      }
    }

    // Horizontal collision; remove velocity into walls so we slide along them.
    const before = { x: this.position.x, z: this.position.z };
    // In the air (near/after the apex) we let ledges slightly above the feet
    // through, so a jump that's just short still lands on the platform.
    const stepUp = !this.grounded && this.velocity.y < 3 ? LEDGE_ASSIST : 0.35;
    if (this.collision.resolveCircle(this.position, RADIUS, this.position.y, HEIGHT, stepUp)) {
      const nx = this.position.x - before.x, nz = this.position.z - before.z;
      const nl = Math.hypot(nx, nz);
      if (nl > 1e-6) {
        const ux = nx / nl, uz = nz / nl;
        const vn = this.velocity.x * ux + this.velocity.z * uz;
        if (vn < 0) { this.velocity.x -= vn * ux; this.velocity.z -= vn * uz; }
      }
    }

    // Ground.
    const ground = this.collision.groundHeight(this.position.x, this.position.z, RADIUS, this.position.y, stepUp);
    const wasGrounded = this.grounded;
    if (!this.grounded) { this.airTime += dt; this.minVy = Math.min(this.minVy, this.velocity.y); }
    if (this.position.y <= ground) {
      this.position.y = ground;
      if (!wasGrounded) {
        const impact = MathUtils.clamp((-this.minVy - 7) / 9, 0, 1);
        this.anim.land(impact);
        this.state.emit('player:land', { impact, position: this.position.clone() });
      }
      this.velocity.y = 0;
      this.grounded = true;
      this.lastGroundY = this.position.y;
    } else if (this.grounded && this.position.y - ground < 0.4 && this.velocity.y <= 0) {
      // Stay glued when walking down a kerb instead of "falling" 15cm.
      this.position.y = ground;
      this.velocity.y = 0;
    } else {
      this.grounded = false;
    }
    if (!this.grounded && wasGrounded && this.velocity.y <= 0) { this.airTime = 0; this.minVy = 0; }

    // Smooth step-ups visually.
    const dy = this.position.y - this.visualY;
    this.visualY = this.grounded && dy > 0 && dy < 0.6
      ? this.visualY + dy * (1 - Math.exp(-18 * dt))
      : this.position.y;

    this._footsteps(dt);
    this._sync();

    this.anim.update(dt, {
      speed: this.grounded ? this.speed : 0,
      runBlend: this.runBlend * MathUtils.clamp((this.speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED) * 1.4, 0, 1),
      grounded: this.grounded,
      vy: this.velocity.y,
      airSpeed: this.grounded ? 0 : this.speed,
      turnRate: this.turnRate,
      // Foot IK: floor height under a point near the feet (kerbs, sandpit
      // frame, roofs), ignoring anything more than a step above the body.
      footGround: this._footGround || (this._footGround = (x, z) =>
        this.collision.groundHeight(x, z, 0.05, this.position.y, 0.3)),
      rootY: this.visualY,
    });
  }

  /** Start a climb if a climbable ledge is within reach along (dx, dz). */
  _tryClimb(dx, dz, reach) {
    const p = this.position;
    const ledge = this.collision.findLedge(p.x, p.z, dx, dz, RADIUS, p.y, HEIGHT, reach, CLIMB_MIN, CLIMB_MAX);
    if (!ledge) return false;
    const h = ledge.top - p.y;
    const fx = Math.sin(ledge.yaw), fz = Math.cos(ledge.yaw);
    // Feet height while hanging with arms up on the edge (a hop for tall
    // vans, barely off the ground for a saloon).
    const top = ledge.top, hang = Math.min(top - 0.7, Math.max(p.y + 0.12, top - 1.72));
    // A mid-air grab joins the timeline at the hang.
    const u0 = this.grounded ? 0 : 0.22;
    const c = this.climb = {
      u: u0, u0,
      // Taller climbs take a little longer.
      dur: 0.72 + h * 0.18,
      // Low roofs (feet barely leave the ground) skip most of the hang.
      hangRate: MathUtils.clamp(1 + (1.9 - h) * 3, 1, 3),
      sx: p.x, sy: p.y, sz: p.z, ...ledge,
      // Feet height over the climb (see CharacterAnimation CLIMB phases).
      yKeys: this.grounded
        ? [[0, p.y], [0.12, p.y], [0.22, hang + 0.08], [0.3, hang], [0.42, hang], [0.66, top - 0.62], [0.8, top - 0.18], [0.88, top]]
        : [[u0, p.y], [0.32, Math.max(hang, p.y - 0.2)], [0.42, Math.max(hang, p.y - 0.2)], [0.66, top - 0.62], [0.8, top - 0.18], [0.88, top]],
      // Grip points on the roof edge, shoulder width apart.
      ik: {
        w: 0,
        hands: [0, 0, 0, 0, 0, 0],
        pole: [-fx, -0.35, -fz],
        side: [fz, 0, -fx],
      },
    };
    const ex = ledge.wx + fx * (RADIUS + 0.12), ez = ledge.wz + fz * (RADIUS + 0.12);
    c.ik.hands.splice(0, 6, ex + fz * 0.19, top + 0.03, ez - fx * 0.19, ex - fz * 0.19, top + 0.03, ez + fx * 0.19);
    this.velocity.set(0, 0, 0);
    this.windup = 0;
    this.jumpBuffer = 0;
    this.grounded = false;
    this.anim.climb();
    this.state.emit('player:climb', { position: p.clone(), height: h });
    return true;
  }

  /**
   * Scripted mantle: crouch and hop up to grab the roof edge, hang, pull
   * up, swing a knee over and stand. Feet follow a fixed path (no physics)
   * while the arms are pinned to the edge by IK.
   */
  _updateClimb(dt, controlsActive) {
    const c = this.climb;
    const inHang = c.u > 0.24 && c.u < 0.42;
    const u = c.u = Math.min(1, c.u + (dt / c.dur) * (inHang ? c.hangRate : 1));
    const s = (a, b) => { const x = Math.min(1, Math.max(0, (u - a) / (b - a))); return x * x * (3 - 2 * x); };
    const toWall = s(c.u0 * 0.9, c.u0 + 0.16), over = s(0.66, 0.96);
    const L = MathUtils.lerp;
    this.position.x = L(L(c.sx, c.wx, toWall), c.lx, over);
    this.position.z = L(L(c.sz, c.wz, toWall), c.lz, over);
    this.position.y = keyed(c.yKeys, u);
    this.yaw += wrapAngle(c.yaw - this.yaw) * (1 - Math.exp(-18 * dt));
    this.visualY = this.position.y;
    this.turnRate = 0;
    this.runBlend = 0;
    // Hands on the edge from the grab until she's up on her knee.
    c.ik.w = s(0.17, 0.24) * (1 - s(0.78, 0.88));
    // Buffered jump presses during the climb shouldn't fire on the roof.
    if (controlsActive) this.input.consumeJump();

    if (u >= 1) {
      this.climb = null;
      this.position.y = this.lastGroundY = c.top;
      this.grounded = true;
      this.coyote = COYOTE;
      this.airTime = 0;
      this.minVy = 0;
    }
    this._sync();
    this.anim.update(dt, {
      speed: 0, runBlend: 0, grounded: true, vy: 0, airSpeed: 0, turnRate: 0,
      climb: this.climb ? u : null,
      climbIK: this.climb ? c.ik : null,
    });
  }

  _launch() {
    this.velocity.y = JUMP_VELOCITY * this.jumpBoost;
    this.grounded = false;
    this.coyote = 0;
    this.airTime = 0;
    this.minVy = 0;
    this.anim.takeoff();
    this.state.emit('player:jump', { position: this.position.clone(), speed: this.speed });
  }

  _footsteps() {
    if (!this.grounded || this.speed < 0.4) return;
    // Two footfalls per animation cycle, at contact (phase 0.25 / 0.75).
    const foot = Math.floor((this.anim.phase + 0.25) * 2) % 2;
    if (foot !== this.lastFoot) {
      this.lastFoot = foot;
      this.state.emit('player:footstep', { run: this.runBlend > 0.5, speed: this.speed });
    }
  }

  _sync() {
    const root = this.character.root;
    root.position.set(this.position.x, this.visualY, this.position.z);
    root.rotation.y = this.yaw;
  }
}
