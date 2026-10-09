import { Quaternion, TransformNode, Vector3 } from '@babylonjs/core';
import { Batch, C } from './MallKit.js';
import { LIFT, UPPER } from './MallPlan.js';
import { writeTRS } from '../world/Instances.js';
import { Ride } from './Ride.js';
import { Timeline, ease, lerp } from './Timeline.js';
import { tone } from './Tones.js';

/**
 * The atrium's glass lift (the shaft is MallConcourse's): its car and the
 * shaft's sliding doors, south on the ground floor and north upstairs.
 * Before a door she calls it ("Lift"): the car comes to her floor if it
 * isn't there, the doors part, she steps in, they close, the car rises (or
 * sinks) with her in it, the doors on the far side part and she steps out
 * onto the other floor. The doors' leaves are thin instances of one leaf
 * (their matrices written only while they move); the car is one node,
 * frozen while it stands.
 */
const DOOR_H = 2.3;
const SPEED = 1.5;            // the car, m/s at most
const _q = Quaternion.Identity();

export class GlassLift {
  /** `T`: the site transform; meshes go under `root` (the site frame); `floors`: layout.lift.floors. */
  constructor(ctx, root, mats, T, floors) {
    Object.assign(this, { ctx, root, mats, T, floors });
    this.ride = new Ride(ctx);
    this.tl = new Timeline();
    this.y = 0;                                  // the car's floor
    this.open = [0, 0];                          // how far each floor's doors are open
    this._prompt = { label: '', icon: '🛗', priority: 4, distance: 0, run: () => this.call() };
    this._her = { x: 0, y: 0, z: 0, yaw: 0, speed: 0 };
  }

  build() {
    const M = this.mats, L = LIFT, a = L.r * Math.cos(Math.PI / 8);
    // The car: floor, roof with its light, corner posts, glass sides with a handrail.
    this.car = new TransformNode('mall:liftCar', this.ctx.scene);
    this.car.parent = this.root;
    this.car.position.set(L.x, 0, L.z);
    const b = new Batch(this.ctx.scene, 'mall:liftCar');
    b.box(M.gloss, C.snow, -0.7, -0.15, -0.7, 0.7, 0, 0.7);
    b.box(M.matte, C.charcoal, -0.6, 0, -0.6, 0.6, 0.008, 0.6);
    b.box(M.gloss, C.snow, -0.7, DOOR_H, -0.7, 0.7, DOOR_H + 0.15, 0.7);
    b.flat(M.glow, C.light, -0.5, -0.5, 0.5, 0.5, DOOR_H - 0.01, true);
    for (const dx of [-0.66, 0.66]) for (const dz of [-0.66, 0.66]) b.box(M.metal, C.steel, dx - 0.04, 0, dz - 0.04, dx + 0.04, DOOR_H, dz + 0.04);
    for (const s of [-1, 1]) {
      b.panel(M.glass, C.white, s * 0.66, 0, [-s, 0], 1.24, 0.05, DOOR_H - 0.05);
      b.rod(M.chrome, C.steel, [s * 0.6, 0.95, -0.5], [s * 0.6, 0.95, 0.5], 0.02, 6);
    }
    this.carMeshes = b.build(this.car);
    // The doors: per floor two leaves of glass in a white frame, parting sideways.
    const lw = a * Math.tan(Math.PI / 8), d = new Batch(this.ctx.scene, 'mall:liftDoor');
    d.panel(M.glass, C.white, 0, 0, [0, 1], lw - 0.06, 0.06, DOOR_H - 0.06);
    for (const [x0, y0, x1, y1] of [[-lw / 2, 0, lw / 2, 0.06], [-lw / 2, DOOR_H - 0.06, lw / 2, DOOR_H], [-lw / 2, 0, -lw / 2 + 0.04, DOOR_H], [lw / 2 - 0.04, 0, lw / 2, DOOR_H]]) {
      d.box(M.metal, C.white, x0, y0, -0.015, x1, y1, 0.015);
    }
    this.doorMeshes = d.build(this.root);
    this.doors = [{ y: 0, z: L.z - a - 0.04 }, { y: UPPER, z: L.z + a + 0.04 }].map((door) => ({ ...door, w: lw }));
    this._matrices = new Float32Array(4 * 16);
    this._writeDoors();
    for (const m of this.doorMeshes) {
      m.thinInstanceSetBuffer('matrix', this._matrices, 16, false);
      m.getBoundingInfo().reConstruct(new Vector3(L.x - 1.6, -0.1, L.z - 1.4), new Vector3(L.x + 1.6, UPPER + DOOR_H + 0.1, L.z + 1.4), m.getWorldMatrix());
      m.doNotSyncBoundingInfo = true;
    }
    return { meshes: [...this.carMeshes, ...this.doorMeshes], casters: this.carMeshes.filter((m) => m.material !== M.glass && m.material !== M.glow) };
  }

  _writeDoors() {
    this.doors.forEach((d, i) => {
      for (const s of [-1, 1]) {
        const x = LIFT.x + s * d.w * (0.5 + 0.92 * ease(this.open[i]));
        writeTRS(this._matrices, (i * 2 + (s > 0 ? 1 : 0)) * 16, x, d.y, d.z, _q);
      }
    });
    for (const m of this.doorMeshes || []) m.thinInstanceBufferUpdated('matrix');
  }

  /** Controls are the lift's while she rides it. */
  get busy() { return this.tl.running && this.ride.active; }

  update(dt) { this.tl.update(dt); }

  prompt() {
    if (this.tl.running) return null;
    const pl = this.ctx.player;
    if (pl.ride || pl.hold) return null;
    for (let i = 0; i < 2; i++) {
      const f = this.floors[i], d = Math.hypot(pl.position.x - f.x, pl.position.z - f.z);
      if (d < 1.2 && Math.abs(pl.position.y - f.y) < 1) {
        const p = this._prompt;
        p.label = i ? 'Lift ↓ 1F' : 'Lift ↑ 2F';
        p.distance = d;
        p.from = i;
        return p;
      }
    }
    return null;
  }

  // ------------------------------------------------------------ a ride
  /** She calls the lift on her floor and rides it to the other. */
  call() {
    const from = this._prompt.from, to = 1 - from, L = this.T.p(LIFT.x, LIFT.z), her = this._her, pl = this.ctx.player;
    her.x = pl.position.x; her.y = pl.position.y; her.z = pl.position.z; her.yaw = pl.yaw; her.speed = 0;
    this.ride.begin((dt) => this.ride.place(dt, her.x, her.y, her.z, her.yaw, her.speed), () => her.y);
    const steps = [];
    if (Math.abs(this.y - this.floors[from].y) > 0.01) steps.push(this._travel(this.floors[from].y, false));
    steps.push(
      this._doors(from, 1),
      this._walk(() => ({ x: L.x, z: L.z })),
      this._doors(from, 0),
      this._travel(this.floors[to].y, true),
      this._doors(to, 1),
      this._walk(() => this.floors[to]),
    );
    this.tl.play(steps, () => {
      this.ride.end();
      this.tl.play([{ d: 0.6 }, this._doors(to, 0)]);
    });
  }

  /** Step: she walks to `to()` (world x, z) at a calm pace, facing the way she goes. */
  _walk(to) {
    const h = this._her;
    let x0 = 0, z0 = 0, goal = null, d = 1;
    return { d: 1.1, step: (k, dt, first) => {
      if (first) {
        x0 = h.x; z0 = h.z; goal = to();
        d = Math.hypot(goal.x - x0, goal.z - z0);
        h.yaw = Math.atan2(goal.x - x0, goal.z - z0);
      }
      const m = ease(k);
      h.x = lerp(x0, goal.x, m); h.z = lerp(z0, goal.z, m);
      h.speed = k < 1 ? d / 1.1 * 1.5 * Math.sin(k * Math.PI) : 0;
    } };
  }

  /** Step: floor i's doors part (1) or close (0). */
  _doors(i, target) {
    let from = 0;
    return { d: 0.7, step: (k, dt, first) => {
      if (first) { from = this.open[i]; if (target) tone(this.ctx.audio, [1175, 880], { dur: 0.18, type: 'sine', gain: 0.05, gap: 0.04 }); }
      this.open[i] = lerp(from, target, k);
      this._writeDoors();
    } };
  }

  /** Step: the car to floor height y (with her in it). */
  _travel(y, withHer) {
    let y0 = 0;
    const h = this._her;
    // Eased: its top speed is 1.5 × the average, SPEED at most.
    return { d: UPPER / SPEED * 1.5, step: (k, dt, first) => {
      if (first) { y0 = this.y; for (const m of this.carMeshes) m.unfreezeWorldMatrix(); }
      this.y = lerp(y0, y, ease(k));
      this.car.position.y = this.y;
      if (withHer) { h.y = this.y; h.speed = 0; }
    }, done: () => { for (const m of this.carMeshes) m.freezeWorldMatrix(); } };
  }

  /** Its meshes are MallWorld's (under the site's root, as the car). */
  dispose() {
    this.tl.clear();
    this.ride.end();
  }
}
