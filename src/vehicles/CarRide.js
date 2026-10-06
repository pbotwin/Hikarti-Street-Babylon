import { Vector3 } from '@babylonjs/core';
import { keyed } from '../player/CharacterAnimation.js';
import { MathUtils } from '../player/math.js';
import { worldPosition } from './VehicleKit.js';

const clamp = MathUtils.clamp;
const D2R = Math.PI / 180;
const PULL = 30 * D2R, WIDE = 65 * D2R;

/**
 * Getting into and out of a Blender car (CarModel rig), driven by its markers:
 *
 *  enter  face the door → hand on the outside handle → pull it open while
 *         stepping back out of its swing → push it wide, let go → step into
 *         the opening, turn the back to the seat → sit on the edge → swing the
 *         right leg in, then the left → reach the inside handle and pull the
 *         door shut → hands to the wheel, feet to the pedals.
 *  exit   the mirror image, ending with her closing the door from outside.
 *
 * Everything is keyed on time (seconds) in the car's own space, so the hands
 * follow the handles exactly while the door swings.
 */
export class CarRide {
  constructor(sys) {
    this.sys = sys;
    this._v = new Vector3();
    // Pose output and keyframe lookup at the current time, reused every frame.
    this._out = { pos: this._v, yaw: 0 };
    this._t = 0;
    this._key = (keys) => keyed(keys, this._t);
    this._w = new Vector3();
  }

  /** Plan the path for vehicle v from side (-1 driver / right, +1 left). */
  plan(v, side, start, startYaw) {
    const rig = v.rig, mk = rig.markers;
    const dk = side < 0 ? 'FR' : 'FL';
    const door = rig.doors[dk];
    // Handle markers live in the door's frame; bring them to vehicle space with the door closed.
    const hOut = mk['handle_out_' + dk].position.multiply(door.scaling).addInPlace(door.position);
    const H = door.position;
    const Lh = Math.hypot(hOut.x - H.x, hOut.z - H.z);
    const seatSide = mk[side < 0 ? 'seat_D' : 'seat_P'].position;
    const seat = mk.seat_D.position;
    const hipH = this.sys.hipH;
    // Handle position (vehicle space) with the door open by angle a.
    const handleAt = (a) => new Vector3(H.x + side * Lh * Math.sin(a), hOut.y, H.z - Lh * Math.cos(a));
    const h30 = handleAt(PULL), h65 = handleAt(WIDE);
    const faceCar = -side * Math.PI / 2, faceAway = side * Math.PI / 2;
    // Close enough that the arm reaches the handle without stretching.
    const S0 = new Vector3(hOut.x + side * 0.3, 0, hOut.z - 0.04);
    const S1 = new Vector3(h30.x + side * 0.27, 0, h30.z - 0.12);
    const Pps = new Vector3(seatSide.x + side * 0.6, 0, seatSide.z + 0.02);
    // Getting out: step up to the wide-open door's handle to swing it shut.
    const S2 = new Vector3(h65.x + side * 0.28, 0, h65.z - 0.1);
    const edge = new Vector3(seatSide.x + side * 0.1, seatSide.y - hipH, seatSide.z);
    const seated = new Vector3(seat.x, seat.y - hipH, seat.z);
    const st = start || S0;
    let y0 = startYaw ?? faceCar;
    y0 = faceCar + wrap(y0 - faceCar);
    const P = (t, p) => [t, p];
    // Root path keys per component (time in seconds).
    const path = (pairs) => ({
      x: pairs.map(([t, p]) => [t, p.x]), y: pairs.map(([t, p]) => [t, p.y]), z: pairs.map(([t, p]) => [t, p.z]),
    });
    this.side = side;
    this.doorKey = dk;
    this.v = v;
    this.enter = {
      dur: 4.25,
      pos: path([P(0, st), P(0.3, S0), P(0.42, S0), P(0.88, S1), P(1.2, S1), P(1.72, Pps), P(1.9, Pps), P(2.4, edge), P(2.45, edge), P(3.05, seated)]),
      yaw: [[0, y0], [0.32, faceCar], [1.42, faceCar], [1.9, faceAway], [2.45, faceAway], [3.05, 0]],
      sit: [[0, 0], [1.9, 0], [2.4, 1]],
      lean: [[1.85, 0], [2.15, 0.42], [2.45, 0.08], [3.0, 0], [3.25, 0.15], [3.7, 0.1], [3.95, 0]],
      leanSide: [[2.95, 0], [3.28, 1], [3.6, 0.6], [3.9, 0]],
      door: [[0, 0], [0.42, 0], [0.88, PULL], [1.25, WIDE], [2.98, WIDE], [3.24, 0.5], [3.8, 0.12], [3.92, 0]],
      // Right hand: outside handle while pulling / pushing, inside handle while closing.
      handOut: [[0, 0], [0.12, 0], [0.4, 1], [1.12, 1], [1.32, 0]],
      handIn: [[2.95, 0], [3.3, 1], [3.82, 1], [3.98, 0]],
      grips: [[3.85, 0], [4.25, 1]],
      feet: [[2.9, 0], [3.25, 1]],
      legR: [[2.42, 0], [2.6, 1], [2.85, 0]],
      legL: [[2.62, 0], [2.82, 1], [3.05, 0]],
      walk: [[1.2, 0], [1.3, 1], [1.62, 1], [1.72, 0]],
    };
    // Exit: inside handle → push open → legs out → stand → step back → close.
    this.exit = {
      dur: 3.6,
      pos: path([P(0, seated), P(0.85, seated), P(1.5, edge), P(1.6, edge), P(2.1, Pps), P(2.15, Pps), P(2.6, S2), P(2.9, S2), P(3.2, S1), P(3.45, S0)]),
      yaw: [[0, 0], [0.85, 0], [1.5, faceAway], [2.15, faceAway], [2.6, faceCar]],
      sit: [[0, 1], [1.6, 1], [2.1, 0]],
      lean: [[0, 0], [0.4, 0.12], [0.8, 0], [1.6, 0.05], [1.85, 0.42], [2.1, 0]],
      leanSide: [[0, 0], [0.3, 0.7], [0.75, 0.8], [0.95, 0]],
      door: [[0, 0], [0.3, 0], [0.62, 0.42], [1.0, WIDE], [2.9, WIDE], [3.4, 0.14], [3.5, 0]],
      handOut: [[2.55, 0], [2.85, 1], [3.38, 1], [3.55, 0]],
      handIn: [[0, 0], [0.28, 1], [0.6, 1], [0.78, 0]],
      grips: [[0, 1], [0.25, 0]],
      feet: [[0, 1], [0.7, 0]],
      legR: [[0.95, 0], [1.15, 1], [1.4, 0]],
      legL: [[1.15, 0], [1.35, 1], [1.55, 0]],
      walk: [[2.1, 0], [2.2, 1], [2.5, 1], [2.6, 0]],
      exitPos: S0, exitYaw: faceCar,
    };
    this.sway = { x: 0, vx: 0, z: 0, vz: 0 };
  }

  /**
   * Pose for time t of the timeline `tl` (or the seated driving pose when tl
   * is null). Writes the ride state; returns { pos, yaw } in vehicle space.
   */
  pose(tl, t, dt, r) {
    const v = this.v, rig = v.rig, k = this._key, out = this._out;
    const seatD = rig.markers.seat_D.position;
    this._t = t;
    if (tl) { this._v.set(k(tl.pos.x), k(tl.pos.y), k(tl.pos.z)); out.yaw = k(tl.yaw); }
    else { this._v.set(seatD.x, seatD.y - this.sys.hipH, seatD.z); out.yaw = 0; }
    r.style = 'car';
    r.sit = tl ? k(tl.sit) : 1;
    r.stepOver = 0;
    r.legR = tl ? k(tl.legR) : 0;
    r.legL = tl ? k(tl.legL) : 0;
    const grips = tl ? k(tl.grips) : 1;
    r.handsUp = grips;
    // Door angle (driven by the timeline only while getting in / out).
    const door = rig.doors[this.doorKey];
    if (tl && door) door.rotation.y = -this.side * k(tl.door);

    // Torso sway from the car's accelerations (damped spring), plus lean.
    const sw = this.sway, a = clamp(-v.ay * 0.022, -0.22, 0.22), f = clamp(v.ax * 0.018, -0.18, 0.18);
    sw.vx += ((a - sw.x) * 60 - sw.vx * 10) * dt; sw.x += sw.vx * dt;
    sw.vz += ((f - sw.z) * 60 - sw.vz * 10) * dt; sw.z += sw.vz * dt;
    r.swayX = sw.x * r.sit;
    r.swayZ = sw.z * r.sit;
    r.lean = tl ? k(tl.lean) : 0;
    // Leaning out toward the door (spine bends to the driver's side).
    const ls = tl && tl.leanSide ? k(tl.leanSide) : 0;
    r.leanSide = ls * -this.side * 0.38;
    // ...and the hips slide a little toward the door with it.
    out.pos.x += this.side * 0.07 * ls;
    r.look = tl ? 0 : clamp(v.steer * 1.1, -0.45, 0.45) + sw.x * 0.5;
    this.walk = tl ? k(tl.walk) : 0;
    this.handOut = tl ? k(tl.handOut) : 0;
    this.handIn = tl ? k(tl.handIn) : 0;
    this.grips = grips;
    this.feet = tl ? k(tl.feet) : 1;
    return out;
  }

  /** Hand / foot IK targets (world space), after the root is placed. */
  ik(r) {
    const v = this.v, rig = v.rig, mk = rig.markers;
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const left = [c, 0, -s], fwd = [s, 0, c];
    // reach: the wheel rim / door handle sits in her palm, past the wrist.
    const H = (this._H ||= { wl: 0, wr: 0, hands: [0, 0, 0, 0, 0, 0], pole: [0, -1, 0], side: [0, 0, 0], spread: 0.9, reach: 0.065 });
    const F = (this._F ||= { wl: 0, wr: 0, hands: [0, 0, 0, 0, 0, 0], pole: [0, 0.3, 0], side: [0, 0, 0], spread: 0.25, palm: false });
    H.side[0] = left[0]; H.side[2] = left[2];
    F.side[0] = left[0]; F.side[2] = left[2];
    const p = this._w;
    // Left hand: wheel only. Right hand: wheel, or a door handle.
    worldPosition(mk.grip_L, p);
    H.hands[0] = p.x; H.hands[1] = p.y; H.hands[2] = p.z;
    let rName = 'grip_R', rw = this.grips;
    if (this.handOut > 0.001) { rName = 'handle_out_' + this.doorKey; rw = this.handOut; }
    else if (this.handIn > 0.001) { rName = 'handle_in_' + this.doorKey; rw = this.handIn; }
    worldPosition(mk[rName], p);
    H.hands[3] = p.x; H.hands[4] = p.y; H.hands[5] = p.z;
    H.wl = this.grips;
    H.wr = rw;
    // Elbows: down and out on the wheel; toward the door when reaching for it.
    H.pole[0] = -fwd[0] * 0.3; H.pole[1] = -1; H.pole[2] = -fwd[2] * 0.3;
    // Feet: right on the gas or brake pedal (by input), left on the rest.
    const braking = v.brake > 0.05 || (this.sys.input.move.y < -0.1 && v.vF > 0.3);
    worldPosition(mk[braking ? 'foot_brake' : 'foot_gas'], p);
    F.hands[3] = p.x; F.hands[4] = p.y; F.hands[5] = p.z;
    worldPosition(mk.foot_rest, p);
    F.hands[0] = p.x; F.hands[1] = p.y; F.hands[2] = p.z;
    F.pole[0] = fwd[0]; F.pole[1] = 0.4; F.pole[2] = fwd[2];
    F.wl = F.wr = this.feet;
    r.hands = H;
    r.feet = F;
  }

  /** Steering wheel and pedals follow the car's controls. */
  controls() {
    const v = this.v, rig = v.rig;
    if (rig.steer) rig.steer.rotation.z = v.steer * 2.6;
    if (rig.pedals.gas) rig.pedals.gas.rotation.x = -clamp(v.throttle, 0, 1) * 0.35;
    if (rig.pedals.brake) rig.pedals.brake.rotation.x = -clamp(v.brake, 0, 1) * 0.3;
  }
}

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
