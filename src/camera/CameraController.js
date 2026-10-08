import { Vector3 } from '@babylonjs/core';
import { MathUtils } from '../player/math.js';

const damp = (a, b, l, dt) => MathUtils.lerp(a, b, 1 - Math.exp(-l * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const PITCH_MIN = -0.42;   // looking up
const PITCH_MAX = 1.05;    // looking down
const DIST = 4.1;
const PIVOT_HEIGHT = 1.42;
const COLLISION_MARGIN = 0.28;
const ROOF_MARGIN = 0.3;   // camera clearance around the car she is in
const DEG = Math.PI / 180;
// Placed somewhere new (spawn, a shop door, a load), the camera starts
// behind her if it has this much room there; else it turns to the nearest
// direction that has (leaving a shop it sat 0.6 m from her, jammed in the
// door's alcove). Offsets from behind her, nearest first.
const SNAP_CLEAR = 1.5;
const SNAP_TRY = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.1, -2.1, Math.PI];
// Standing with a wall right behind her (the camera pressed to its 0.6 m
// minimum), it swings round to open space while she isn't steering it.
const JAMMED = 0.9;
// Ray offsets (right, up) round the centre ray: together they approximate a
// sphere swept from the pivot.
const SWEEP = [[0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.108]];
const _o = { x: 0, y: 0, z: 0 };

/**
 * Third-person orbit camera (GTA / Genshin style).
 *  - drag to orbit, with light smoothing so it feels fluid but never laggy
 *  - pivot follows the hero with a little lag (more vertical lag when jumping)
 *  - gently swings behind the hero while running if the player isn't steering it
 *  - ray-casts against the city so it never clips through walls
 */
export class CameraController {
  constructor(camera, input, collision) {
    this.camera = camera;
    this.input = input;
    this.collision = collision;

    this.yaw = 0;
    this.pitch = 0.22;
    this.targetYaw = 0;
    this.targetPitch = 0.22;
    this.distance = DIST;
    this.pivot = new Vector3();
    // Vertical field of view in degrees, as in the original (wider on portrait screens).
    this.baseFov = 52;
    this._target = new Vector3();
    this.fovKick = 0;
    this._dir = new Vector3();
    this._initialized = false;
    // Vehicle chase view (set by the VehicleSystem): distance multiplier,
    // pivot lift, stronger swing-behind, and the vehicle's own collider,
    // which the camera rays ignore.
    this.zoom = 1; this.zoomTarget = 1;
    this.lift = 0; this.liftTarget = 0;
    this.followBoost = 1;
    this.ignoreCollider = null;
    // The car she is in ({ x, y, z, yaw, dims }): the camera never ends up
    // inside its body (see update).
    this.avoid = null;
    this.roofLift = 0;
    this._unjamT = 0; this._unjamYaw = 0;
  }

  snapBehind(player) {
    this.pivot.set(player.position.x, player.visualY + PIVOT_HEIGHT, player.position.z);
    this.targetYaw = this.yaw = this._clearYaw(player.yaw);
    this.targetPitch = this.pitch = 0.22;
    this.distance = DIST;
    this._initialized = true;
  }

  /** Turn (smoothly) to look over her shoulder, where there is room: she turned to do something. */
  turnBehind(player) {
    this.targetYaw = this._clearYaw(player.yaw);
    this.targetPitch = 0.22;
  }

  /** The view direction nearest `yaw` with room for the camera behind the pivot (else the roomiest). */
  _clearYaw(yaw) {
    const cp = Math.cos(0.22), sp = Math.sin(0.22);
    let best = yaw, room = -1;
    for (const off of SNAP_TRY) {
      const a = yaw + off;
      this._dir.set(-Math.sin(a) * cp, sp, -Math.cos(a) * cp);
      const free = this._sweep(a, SNAP_CLEAR + COLLISION_MARGIN) - COLLISION_MARGIN;
      if (free >= SNAP_CLEAR) return a;
      if (free > room) { room = free; best = a; }
    }
    return best;
  }

  update(dt, player, controlsActive) {
    // ---- Look input ----
    if (controlsActive) {
      const look = this.input.consumeLook();
      // Normalise by screen width so sensitivity feels the same on all phones.
      const sens = 5.2 / Math.max(360, Math.min(innerWidth, innerHeight * 0.75));
      this.targetYaw -= look.x * sens;
      this.targetPitch += look.y * sens * 0.8;
    } else {
      this.input.consumeLook();
    }
    this.targetPitch = MathUtils.clamp(this.targetPitch, PITCH_MIN, PITCH_MAX);

    // ---- Auto-follow: drift behind the hero while moving ----
    const idleLook = performance.now() - this.input.lastLookTime > 1400;
    const speed = player.speed;
    if (idleLook && speed > 0.5 && player.grounded) {
      const behind = player.yaw;
      const diff = wrap(behind - this.targetYaw);
      // Only nudge when the hero is running roughly away/sideways — never
      // fight the player by swinging around when they walk toward the camera.
      if (Math.abs(diff) < 2.2) {
        this.targetYaw += diff * (1 - Math.exp(-0.55 * this.followBoost * Math.min(speed, 8) / 5 * dt));
      }
      this.targetPitch = damp(this.targetPitch, 0.2, 0.4 * (speed / 5), dt);
    }

    if (idleLook && speed < 0.5 && !this.avoid && this.distance < JAMMED) {
      // Re-aimed twice a second: the rays are only cast while jammed.
      if ((this._unjamT -= dt) <= 0) { this._unjamT = 0.5; this._unjamYaw = this._clearYaw(this.yaw); }
      this.targetYaw += wrap(this._unjamYaw - this.targetYaw) * (1 - Math.exp(-2 * dt));
    } else this._unjamT = 0;

    // Light smoothing on rotation.
    this.yaw += wrap(this.targetYaw - this.yaw) * (1 - Math.exp(-22 * dt));
    this.pitch = damp(this.pitch, this.targetPitch, 22, dt);

    // ---- Pivot follow ----
    const tx = player.position.x, tz = player.position.z;
    // While airborne the view follows only half of the jump's height (and
    // all of any drop below the take-off level), so jumps don't bounce the
    // whole screen up and down.
    this.zoom = damp(this.zoom, this.zoomTarget, 3, dt);
    this.lift = damp(this.lift, this.liftTarget, 3, dt);
    let ty = player.visualY + PIVOT_HEIGHT + this.lift;
    const g0 = player.lastGroundY ?? player.visualY;
    if (!player.grounded && player.visualY > g0) ty = g0 + PIVOT_HEIGHT + (player.visualY - g0) * 0.5;
    if (!this._initialized) this.snapBehind(player);
    this.pivot.x = damp(this.pivot.x, tx, 14, dt);
    this.pivot.z = damp(this.pivot.z, tz, 14, dt);
    // Softer vertical follow so jumps read as jumps on screen.
    this.pivot.y = damp(this.pivot.y, ty, player.grounded ? 9 : 7, dt);

    // ---- Desired position on the orbit sphere ----
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._dir.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    // Pull in a little when looking down from above, push out a little when
    // looking up — keeps the hero framed nicely at every angle.
    // Landscape screens are short: come in closer so she isn't a tiny figure.
    const aspect = innerWidth / innerHeight;
    const near = MathUtils.clamp((aspect - 1) / 0.9, 0, 1);
    const base = DIST * (1 - near * 0.2) * this.zoom;
    const want = base * (1 - Math.max(0, this.pitch - 0.5) * 0.25) * (1 - Math.max(0, -this.pitch) * 0.5);

    // ---- Collision ----
    const hit = this._sweep(this.yaw, want + COLLISION_MARGIN);
    const allowed = Math.max(0.6, hit - COLLISION_MARGIN);
    // Snap in instantly (never show the inside of a wall), ease back out.
    this.distance = allowed < this.distance ? allowed : damp(this.distance, allowed, 3.5, dt);

    const cam = this.camera;
    cam.position.set(
      this.pivot.x + this._dir.x * this.distance,
      Math.max(0.25, this.pivot.y + this._dir.y * this.distance),
      this.pivot.z + this._dir.z * this.distance,
    );
    // The rays ignore the car she is in (they start inside it), so a wall
    // behind or a low angle could put the camera inside the car: her legs
    // and see-through panels. Rise smoothly over the roof instead.
    this.roofLift = damp(this.roofLift, this._roofClearance(cam.position), 10, dt);
    cam.position.y += this.roofLift;
    // Aim slightly above the pivot so the hero sits in the lower-middle of
    // the portrait frame, leaving the street visible ahead.
    // ...and aim a little lower so her feet stay in the short frame.
    cam.setTarget(this._target.set(this.pivot.x, this.pivot.y + 0.32 - near * 0.5, this.pivot.z));

    // Subtle FOV widening when sprinting.
    this.fovKick = damp(this.fovKick, player.runBlend * Math.min(1, speed / 5) * 5, 3, dt);
    const fov = (cam.metadata?.baseFov ?? (aspect < 1 ? 62 : this.baseFov)) + this.fovKick;
    cam.fov = fov * DEG;
  }

  /** How far the camera must rise to clear the roof of the car it is inside (0 if outside). */
  _roofClearance(p) {
    const v = this.avoid;
    if (!v) return 0;
    const dx = p.x - v.x, dz = p.z - v.z, s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const roof = v.y + v.dims.h + ROOF_MARGIN;
    const inside = Math.abs(lx) < v.dims.w / 2 + ROOF_MARGIN && Math.abs(lz) < v.dims.len / 2 + ROOF_MARGIN;
    return inside && p.y < roof ? roof - p.y : 0;
  }

  /** Free distance from the pivot along `_dir` (the view at `yaw`), up to `max`: the centre ray and the SWEEP rays. */
  _sweep(yaw, max) {
    let hit = this._cast(this.pivot, this._dir, max);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const [ox, oy] of SWEEP) {
      _o.x = this.pivot.x + rx * ox; _o.y = this.pivot.y + oy; _o.z = this.pivot.z + rz * ox;
      hit = Math.min(hit, this._cast(_o, this._dir, max));
    }
    return hit;
  }

  _cast(o, d, max) {
    this.collision.ignore = this.ignoreCollider;
    const t = this.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, max);
    this.collision.ignore = null;
    return t;
  }
}
