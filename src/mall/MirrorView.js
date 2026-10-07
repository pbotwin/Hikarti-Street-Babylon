import { Vector3 } from '@babylonjs/core';

/**
 * The fitting-room mirror: while she tries clothes on, the camera looks at
 * her from where her reflection would be seen (behind the mirror glass, at a
 * full-length distance), and the picture is flipped like a mirror. The
 * near plane is pushed past the mirror wall so the wall doesn't block the
 * view: no reflection render (a second scene draw on phones), no new pass.
 * Changes (stepping in, swapping clothes, stepping out) happen behind a
 * short soft-white "mist" so neither the camera cut nor her outfit pops.
 *
 * update() runs after the camera rig each frame and overrides its pose.
 */
const MIST_IN = 0.22, MIST_OUT = 0.32;
const _t = new Vector3();

export class MirrorView {
  constructor({ camera, engine, root }) {
    this.camera = camera;
    this.canvas = engine.getRenderingCanvas();
    this.on = false;
    this.mist = 0;
    this._mistTo = 0;
    this._hold = false;
    this.pos = new Vector3();
    this.target = new Vector3();
    this.near = 0.2;
    this._near0 = camera.minZ;
    root.insertAdjacentHTML('beforeend', `
      <div class="fitting-mirror" style="position:absolute;inset:0;pointer-events:none;display:none;box-shadow:inset 0 0 0 9px rgba(238,228,214,0.92),inset 0 0 0 11px rgba(120,96,80,0.5),inset 0 0 70px rgba(30,20,30,0.35)"></div>
      <div class="fitting-mist" style="position:absolute;inset:0;pointer-events:none;background:#fbf7f2;opacity:0;display:none"></div>`);
    this.frame = root.querySelector('.fitting-mirror');
    this.fog = root.querySelector('.fitting-mist');
  }

  /**
   * Aim at her standing at `inside` ({x, z}) facing the mirror ({x, y, z}).
   * The distance shows her whole height at the camera's field of view.
   */
  aim(inside, mirror, height = 1.62) {
    let dx = inside.x - mirror.x, dz = inside.z - mirror.z;
    const gap = Math.hypot(dx, dz) || 1;
    dx /= gap; dz /= gap;
    // Her whole height in the upper part of the picture, clear of the
    // fitting-room panel along the bottom: a little further back, aimed low.
    const full = (height * 0.78) / Math.tan(this.camera.fov / 2);
    const behind = Math.max(0.4, full - gap);
    this.pos.set(mirror.x - dx * behind, height * 0.72, mirror.z - dz * behind);
    this.target.set(inside.x, height * 0.36, inside.z);
    // Past the mirror wall (a little margin for the slight downward look).
    this.near = behind + 0.12;
  }

  /**
   * Mist up, then `fn` (the cut / the change), then the mist clears; if `fn`
   * returns a promise (her outfit re-toned off-thread) it clears once that settles.
   */
  veil(fn) {
    this._mistTo = 1;
    this._then = fn;
    this.fog.style.display = '';
  }

  /** The mist has cleared (the last change is done). */
  get clear() { return !this._mistTo && !this._hold && this.mist === 0; }

  /** Switch the mirror camera on / off (call under the veil). */
  set(on) {
    this.on = on;
    this.frame.style.display = on ? '' : 'none';
    this.canvas.style.transform = on ? 'scaleX(-1)' : '';
    this.camera.minZ = on ? this.near : this._near0;
  }

  update(dt) {
    if (this._mistTo || this.mist > 0) {
      if (this._mistTo) {
        this.mist = Math.min(1, this.mist + dt / MIST_IN);
        if (this.mist >= 1) {
          this._mistTo = 0;
          const fn = this._then;
          this._then = null;
          const job = fn?.();
          if (job?.then) { this._hold = true; job.finally(() => { this._hold = false; }); }
        }
      } else if (!this._hold) {
        this.mist = Math.max(0, this.mist - dt / MIST_OUT);
        if (this.mist === 0) this.fog.style.display = 'none';
      }
      this.fog.style.opacity = this.mist.toFixed(3);
    }
    if (!this.on) return;
    const cam = this.camera;
    cam.position.copyFrom(this.pos);
    cam.setTarget(_t.copyFrom(this.target));
  }

  dispose() {
    if (this.on) this.set(false);
    this.frame.remove();
    this.fog.remove();
  }
}
