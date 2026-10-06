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
  }

  snapBehind(player) {
    this.targetYaw = this.yaw = player.yaw;
    this.targetPitch = this.pitch = 0.22;
    this.pivot.set(player.position.x, player.visualY + PIVOT_HEIGHT, player.position.z);
    this.distance = DIST;
    this._initialized = true;
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

    // ---- Collision: centre ray + 4 offset rays approximate a sphere sweep ----
    let hit = this._cast(this.pivot, this._dir, want + COLLISION_MARGIN);
    const off = 0.18;
    for (const [ox, oy] of [[off, 0], [-off, 0], [0, off], [0, -off * 0.6]]) {
      const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
      const o = {
        x: this.pivot.x + right.x * ox,
        y: this.pivot.y + oy,
        z: this.pivot.z + right.z * ox,
      };
      hit = Math.min(hit, this._cast(o, this._dir, want + COLLISION_MARGIN));
    }
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

  _cast(o, d, max) {
    this.collision.ignore = this.ignoreCollider;
    const t = this.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, max);
    this.collision.ignore = null;
    return t;
  }
}
