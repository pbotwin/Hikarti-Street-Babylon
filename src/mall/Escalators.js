import { Vector3 } from '@babylonjs/core';
import { Batch, C } from './MallKit.js';
import { BANDS, ESCALATORS, RUN, UPPER } from './MallPlan.js';
import { Ride } from './Ride.js';

/**
 * The atrium's escalators, running (MallPlan RUN, BANDS): steps come out
 * from under the comb, run flat, climb the incline and go under again at
 * the far comb, the south band up, the north one down. Every step is a
 * thin instance of one step mesh (two draws for all of them), moved only
 * while the camera is near enough to see them move. The meshes are
 * MallWorld's (under the site's root).
 *
 * She rides by walking onto a band's landing plate toward it: she steps
 * on, stands on her step as it carries her (her right hand on the
 * handrail), and steps off at the far end; pushing the stick along it, she
 * walks up (or down) the steps meanwhile. Shoppers ride the same steps
 * (rider() / carry()), standing.
 */
const P = 0.4;                // step pitch along the run (m)
const SPEED = 0.7;            // m/s along the run (≈0.8 m/s along the incline: a brisk mall escalator; at 0.55 a ride took 24 s)
const WALK = 0.75;            // her walking on the steps, on top of it
const BEND = 0.6;             // half length of the rounded bends at the incline's foot and head
const STEPS = Math.ceil((RUN.comb1 - RUN.comb0) / P) + 1;
const LOOP = STEPS * P;
const SLOPE = (UPPER - RUN.y0) / (RUN.head - RUN.foot);
const OFF = 0.45;             // past the far comb (m) where a rider has stepped off
const SEEN = 60;              // the steps are moved within this of the camera (m)
const _m = new Float32Array(16);
// Scratch points in / out of the site frame (one per use: _feet runs inside _carry's place()).
const _s = { x: 0, z: 0 }, _f = { x: 0, z: 0 }, _w = { x: 0, z: 0 }, _r = { x: 0, z: 0 };
const mod = (a, n) => a - Math.floor(a / n) * n;

/** The treads' height along the run (site x): the plates' level, the incline, rounded where they meet. */
function runHeight(x) {
  const { foot, head, y0 } = RUN;
  if (x <= foot - BEND) return y0;
  if (x >= head + BEND) return UPPER;
  if (x < foot + BEND) return y0 + SLOPE * (x - foot + BEND) ** 2 / (4 * BEND);
  if (x > head - BEND) return UPPER - SLOPE * (head + BEND - x) ** 2 / (4 * BEND);
  return y0 + SLOPE * (x - foot);
}

export class Escalators {
  /** `T`: the site transform (MallPlan siteTransform); meshes go under `root` (the site frame). */
  constructor(ctx, root, mats, T) {
    Object.assign(this, { ctx, root, mats, T });
    this.bands = BANDS.map((b) => ({ z: b.z, dir: b.up ? 1 : -1, phase: 0, yaw: T.yaw(b.up ? Math.PI / 2 : -Math.PI / 2) }));
    this.ride = new Ride(ctx);
    this.her = null;           // her ride: { band, x, z, t, walk, hand }
    this._reach = { x: 0, y: 0, z: 0, w: 0 };
    const c = T.p((ESCALATORS.x0 + ESCALATORS.x1) / 2, (ESCALATORS.z0 + ESCALATORS.z1) / 2);
    this._centre = new Vector3(c.x, UPPER / 2, c.z);
    this._o = T.p(0, 0);
  }

  /** The step mesh (a tread with yellow edges, its top at y = 0, centred), instanced along both bands. */
  build() {
    const M = this.mats, h = RUN.half, b = new Batch(this.ctx.scene, 'mall:step');
    b.box(M.metal, C.charcoal, -P / 2 + 0.006, -0.24, -h, P / 2 - 0.006, 0, h);
    b.box(M.matte, C.yellow, -P / 2 + 0.006, -0.003, -h, -P / 2 + 0.05, 0.002, h);
    for (const z of [-h, h - 0.04]) b.box(M.matte, C.yellow, -P / 2 + 0.006, -0.003, z, P / 2 - 0.006, 0.002, z + 0.04);
    this.meshes = b.build(this.root);
    this._matrices = new Float32Array(this.bands.length * STEPS * 16);
    this._write();
    const E = ESCALATORS;
    for (const m of this.meshes) {
      m.thinInstanceSetBuffer('matrix', this._matrices, 16, false);
      m.getBoundingInfo().reConstruct(new Vector3(E.x0, -0.3, E.z0), new Vector3(E.x1, UPPER + 0.1, E.z1), m.getWorldMatrix());
      m.doNotSyncBoundingInfo = true;
    }
    return this.meshes;
  }

  /** Every step's matrix (site frame): along its band, cut off where it goes under a comb. */
  _write() {
    const out = this._matrices;
    let i = 0;
    for (const band of this.bands) {
      for (let k = 0; k < STEPS; k++, i++) {
        const a = RUN.comb0 + mod(band.phase + k * P, LOOP);
        const s0 = Math.max(a, RUN.comb0), s1 = Math.min(a + P, RUN.comb1), w = s1 - s0;
        _m.fill(0);
        if (w > 0.01) {
          _m[0] = w / P; _m[5] = 1; _m[10] = 1; _m[15] = 1;
          _m[12] = (s0 + s1) / 2; _m[13] = runHeight(a + P / 2); _m[14] = band.z;
        }
        out.set(_m, i * 16);
      }
    }
  }

  /** The tread's height under site x on a band (the plates' beyond the combs). */
  tread(band, x) {
    if (x <= RUN.comb0) return RUN.y0;
    if (x >= RUN.comb1) return UPPER + 0.02;
    return runHeight(x - mod(x - RUN.comb0 - band.phase, P) + P / 2);
  }

  /** World (x, z) to the site frame or back (the same half turn about the origin), into `out`. */
  _site(x, z, out) {
    out.x = this._o.x - x; out.z = this._o.z - z;
    return out;
  }

  /** Is she riding (her controls are hers: she may walk on the steps). */
  get riding() { return !!this.her; }

  update(dt) {
    for (const b of this.bands) b.phase = mod(b.phase + b.dir * SPEED * dt, LOOP);
    if (Vector3.Distance(this.ctx.camera.position, this._centre) < SEEN) {
      this._write();
      for (const m of this.meshes) m.thinInstanceBufferUpdated('matrix');
    }
    if (!this.her) this._boarding();
  }

  // ------------------------------------------------------------ her ride
  /** She walks onto a band's landing plate, toward the steps: she rides. */
  _boarding() {
    const pl = this.ctx.player;
    if (pl.ride || pl.hold || pl.climb || pl.autoWalk || !pl.grounded) return;
    // (The site frame is half a turn about the origin: velocities just turn round.)
    const s = this._site(pl.position.x, pl.position.z, _s), vx = -pl.velocity.x, vz = -pl.velocity.z;
    for (const band of this.bands) {
      if (Math.abs(s.z - band.z) > RUN.half - 0.12 || vx * band.dir < 0.4 || Math.abs(vz) > Math.abs(vx)) continue;
      const up = band.dir > 0;
      const onPlate = up ? s.x > ESCALATORS.x0 && s.x < RUN.comb0 + 0.05 && pl.position.y < 1 : s.x < ESCALATORS.x1 && s.x > RUN.comb1 - 0.05 && pl.position.y > UPPER - 1;
      if (!onPlate) continue;
      this.her = { band, x: s.x, z: s.z, t: 0, y: pl.position.y, walk: 0, hand: 0 };
      this.ride.begin((dt, active) => this._carry(dt, active), (x, z) => this._feet(x, z));
      return;
    }
  }

  /** The floor under her feet: the step there (or the plate). */
  _feet(x, z) {
    const r = this.her, s = this._site(x, z, _f);
    return r ? this.tread(r.band, s.x) : 0;
  }

  _carry(dt, active) {
    const r = this.her, band = r.band, pl = this.ctx.player, input = this.ctx.input;
    r.t += dt;
    // Walking on: the stick along the band (camera-relative, as she walks).
    let want = 0;
    if (active) {
      const mv = input.move, cy = this.ctx.cameraRig.yaw;
      const dx = Math.sin(cy) * mv.y - Math.cos(cy) * mv.x, dz = Math.cos(cy) * mv.y + Math.sin(cy) * mv.x;
      want = Math.max(0, dx * Math.sin(band.yaw) + dz * Math.cos(band.yaw));
      input.consumeJump();
    }
    // The first half second she is still stepping on.
    const on = Math.max(0, 1 - r.t / 0.5) * 0.9;
    r.walk += (want * WALK - r.walk) * (1 - Math.exp(-6 * dt));
    const pace = on + r.walk;
    r.x += band.dir * (SPEED + pace) * dt;
    // Over to the right of the step, by the handrail she holds.
    r.z += (band.z + band.dir * 0.12 - r.z) * (1 - Math.exp(-4 * dt));
    const ty = this.tread(band, r.x);
    r.y = pace > 0.05 ? r.y + (ty - r.y) * (1 - Math.exp(-14 * dt)) : ty;
    const w = this._site(r.x, r.z, _w), yaw = pl.yaw + Math.atan2(Math.sin(band.yaw - pl.yaw), Math.cos(band.yaw - pl.yaw)) * (1 - Math.exp(-8 * dt));
    this.ride.place(dt, w.x, r.y, w.z, yaw, pace);
    // Her right hand on the handrail while she is on the steps, the wrist just over
    // it (not with bags in that hand: act.bag). At 0.85 of the arm's pose, below
    // the rail's line, it hung in the air a hand short of it.
    const act = this.ctx.animation.act;
    const along = band.dir > 0 ? r.x - RUN.comb0 : RUN.comb1 - r.x, left = band.dir > 0 ? RUN.comb1 - r.x : r.x - RUN.comb0;
    r.hand += ((along > 0.8 && left > 1.0 && act.bag < 0.01 ? 1 : 0) - r.hand) * (1 - Math.exp(-5 * dt));
    if (r.hand > 0.01) {
      const rail = this._site(r.x + band.dir * 0.2, band.z + band.dir * 0.64, _r), R = this._reach;
      R.x = rail.x; R.y = runHeight(Math.min(Math.max(r.x, RUN.foot), RUN.head)) + 1.09; R.z = rail.z; R.w = r.hand;
      act.reach = R;
    } else if (act.reach === this._reach) act.reach = null;
    // Off at the far end: on the plate, walking on.
    if (left < -OFF) {
      if (act.reach === this._reach) act.reach = null;
      pl.position.y = pl.visualY = band.dir > 0 ? UPPER + 0.02 : RUN.y0;
      const f = Math.max(0.8, pace);
      this.ride.end(Math.sin(band.yaw) * f, Math.cos(band.yaw) * f);
      this.her = null;
    }
  }

  // ------------------------------------------------------------ shoppers
  /** A shopper boards band i at world (x, z): their ride's state (reuse `into`). */
  rider(i, x, z, into = {}) {
    const s = this._site(x, z, _s);
    into.band = this.bands[i]; into.x = s.x; into.z = s.z;
    return into;
  }

  /**
   * The rider one frame on: standing on the step (the first moment
   * stepping on), into `out` (world x, y, z) and its yaw; true once off at
   * the far end.
   */
  carry(r, dt, out) {
    const band = r.band;
    r.x += band.dir * SPEED * dt;
    r.z += (band.z - band.dir * 0.12 - r.z) * (1 - Math.exp(-4 * dt));
    const w = this._site(r.x, r.z, _w);
    out.x = w.x; out.z = w.z; out.y = this.tread(band, r.x);
    out.yaw = band.yaw;
    return (band.dir > 0 ? RUN.comb1 - r.x : r.x - RUN.comb0) < -OFF;
  }

  dispose() {
    if (this.her) {
      if (this.ctx.animation.act.reach === this._reach) this.ctx.animation.act.reach = null;
      this.ride.end();
      this.her = null;
    }
  }
}
