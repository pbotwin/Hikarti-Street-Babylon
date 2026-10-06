import { UniversalCamera, Vector3 } from '@babylonjs/core';
import { MathUtils } from '../player/math.js';

/**
 * Third-person orbit camera (as in the original): drag / mouse to orbit with
 * light smoothing, a pivot that follows her with a little lag, a gentle swing
 * behind her while running, and collision casts so it never clips through
 * walls. Same yaw convention as the player (forward = (sin yaw, cos yaw)).
 */
const damp = (a, b, l, dt) => MathUtils.lerp(a, b, 1 - Math.exp(-l * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const PITCH_MIN = -0.42;
const PITCH_MAX = 1.05;
const DIST = 4.1;
const PIVOT_HEIGHT = 1.42;
const COLLISION_MARGIN = 0.28;

export class CameraController {
  constructor(camera, input, collision) {
    this.camera = camera;
    this.camera.minZ = 0.15;
    this.camera.maxZ = 1200;
    this.camera.inputs.clear();          // we drive it ourselves
    this.baseFov = 0.95;
    this.camera.fov = this.baseFov;
    this.input = input;
    this.collision = collision;
    this.yaw = 0; this.pitch = 0.22; this.targetYaw = 0; this.targetPitch = 0.22;
    this.distance = DIST;
    this.pivot = new Vector3();
    this.fovKick = 0;
    this.zoom = 1; this.zoomTarget = 1;
    this._init = false;
  }

  snapBehind(player) {
    this.targetYaw = this.yaw = player.yaw;
    this.targetPitch = this.pitch = 0.22;
    this.pivot.set(player.position.x, player.visualY + PIVOT_HEIGHT, player.position.z);
    this.distance = DIST;
    this._init = true;
  }

  update(dt, player, controlsActive) {
    const look = this.input.consumeLook();
    if (controlsActive) {
      const sens = 5.2 / Math.max(360, Math.min(innerWidth, innerHeight * 0.75));
      this.targetYaw -= look.x * sens;
      this.targetPitch += look.y * sens * 0.8;
    }
    this.targetPitch = MathUtils.clamp(this.targetPitch, PITCH_MIN, PITCH_MAX);
    const idleLook = performance.now() - (this.input.lastLookTime || 0) > 1400;
    const speed = player.speed;
    if (idleLook && speed > 0.5 && player.grounded) {
      const diff = wrap(player.yaw - this.targetYaw);
      if (Math.abs(diff) < 2.2) this.targetYaw += diff * (1 - Math.exp(-0.55 * Math.min(speed, 8) / 5 * dt));
      this.targetPitch = damp(this.targetPitch, 0.2, 0.4 * (speed / 5), dt);
    }
    this.yaw += wrap(this.targetYaw - this.yaw) * (1 - Math.exp(-22 * dt));
    this.pitch = damp(this.pitch, this.targetPitch, 22, dt);
    if (!this._init) this.snapBehind(player);

    this.zoom = damp(this.zoom, this.zoomTarget, 3, dt);
    let ty = player.visualY + PIVOT_HEIGHT;
    const g0 = player.lastGroundY ?? player.visualY;
    if (!player.grounded && player.visualY > g0) ty = g0 + PIVOT_HEIGHT + (player.visualY - g0) * 0.5;
    this.pivot.x = damp(this.pivot.x, player.position.x, 14, dt);
    this.pivot.z = damp(this.pivot.z, player.position.z, 14, dt);
    this.pivot.y = damp(this.pivot.y, ty, player.grounded ? 9 : 7, dt);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = { x: -Math.sin(this.yaw) * cp, y: sp, z: -Math.cos(this.yaw) * cp };
    const aspect = innerWidth / innerHeight;
    const near = MathUtils.clamp((aspect - 1) / 0.9, 0, 1);
    const base = DIST * (1 - near * 0.2) * this.zoom;
    const want = base * (1 - Math.max(0, this.pitch - 0.5) * 0.25) * (1 - Math.max(0, -this.pitch) * 0.5);
    let hit = this.collision.raycast(this.pivot.x, this.pivot.y, this.pivot.z, dir.x, dir.y, dir.z, want + COLLISION_MARGIN);
    const off = 0.18, right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    for (const [ox, oy] of [[off, 0], [-off, 0], [0, off], [0, -off * 0.6]]) {
      hit = Math.min(hit, this.collision.raycast(this.pivot.x + right.x * ox, this.pivot.y + oy, this.pivot.z + right.z * ox, dir.x, dir.y, dir.z, want + COLLISION_MARGIN));
    }
    const allowed = Math.max(0.6, hit - COLLISION_MARGIN);
    this.distance = allowed < this.distance ? allowed : damp(this.distance, allowed, 3.5, dt);

    const cam = this.camera;
    cam.position.set(this.pivot.x + dir.x * this.distance, Math.max(0.25, this.pivot.y + dir.y * this.distance), this.pivot.z + dir.z * this.distance);
    cam.setTarget(new Vector3(this.pivot.x, this.pivot.y + 0.32 - near * 0.5, this.pivot.z));
    // Portrait screens: a wider vertical view.
    const baseFov = aspect < 1 ? 1.08 : 0.91;
    this.fovKick = damp(this.fovKick, player.runBlend * Math.min(1, speed / 5) * 0.09, 3, dt);
    cam.fov = baseFov + this.fovKick;
  }
}
