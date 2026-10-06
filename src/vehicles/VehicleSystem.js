import { Vector3, Matrix, Quaternion } from '@babylonjs/core';
import { VEHICLE_TYPES } from './VehicleTypes.js';
import { buildFarModel, syncWorld } from './VehicleKit.js';
import { VehicleAssets } from './VehicleAssets.js';
import { buildCarModel } from './CarModel.js';
import { CarRide } from './CarRide.js';
import { buildBikeModel } from './BikeModel.js';
import { BikeRide } from './BikeRide.js';
import { Vehicle } from './Vehicle.js';
import { MathUtils } from '../player/math.js';

const clamp = MathUtils.clamp;
// Getting on / off plays the keyed choreography faster than real time: at
// 1x a bike took over 2 s and a car over 4 s, which felt like waiting.
const ENTER_PACE = { bike: 2, car: 1.6 };

/**
 * Every parked car, van, scooter, motorcycle and bicycle is drivable.
 *
 * Walk up to one and press E / the action button: she walks to the door (or
 * the bike's side), then a scripted get-in plays — hand on the handle, door
 * open, sit, legs in, door shut, hands to the wheel; for bikes, grab the
 * bars, lift it off the stand, swing a leg over, sit. Driving: throttle /
 * brake / reverse and steering on the stick or WASD, hand brake on jump /
 * Space. E again stops the vehicle and she gets out.
 *
 * While aboard, the body is posed by CharacterAnimation's ride layer with IK
 * pinning hands to the wheel / grips and feet to the pedals, pegs or ground.
 * Vehicles are built from the Blender GLBs (VehicleAssets, loaded first).
 */
export class VehicleSystem {
  constructor({ specs, scene, collision, player, animation, character, input, cameraRig, state, ui, collectibles, graphics }) {
    Object.assign(this, { collision, player, animation, character, input, cameraRig, state, ui, collectibles });
    this.vehicles = specs.map((sp, i) => {
      const cfg = VEHICLE_TYPES[sp.type];
      const mid = sp.model || cfg.model;
      const model = cfg.kind === 'bike' ? buildBikeModel(mid, sp.paint, scene) : buildCarModel(mid, scene);
      if (!model) throw new Error(`Vehicle model missing: ${mid}`);
      const v = new Vehicle({ id: i, type: sp.type, cfg, model, x: sp.x, z: sp.z, yaw: sp.ry, collision, scene });
      v.rig = model.rig;
      v.body = model.body;
      return v;
    });
    VehicleAssets.release();
    // Lamps, gauges, pedals, mirrors: too small to show in the shadow map,
    // yet each was a shadow draw for every vehicle near the heroine.
    const casters = [];
    for (const v of this.vehicles) {
      for (const m of v.root.getChildMeshes(false)) {
        if (m.metadata?.cast && sphereRadius(m) < 0.12) m.metadata.cast = false;
      }
      v.far = buildFarModel(v.chassis, [v.body, ...v.wheels.filter((w) => !w.mounted).map((w) => w.node)], [v.rig.detail]);
      for (const m of v.root.getChildMeshes(false)) if (m.metadata?.cast) casters.push(m);
    }
    graphics.addCasters(casters);
    // Nothing parked inside a wall, pole, tree or another vehicle.
    for (const v of this.vehicles) this._clearSpot(v);
    this.active = null;     // vehicle she is in / getting into
    this.phase = null;      // 'enter' | 'drive' | 'exit'
    this.t = 0;
    this.candidate = null;
    this.hipH = animation.hipsRest.y;
    this.rideState = { sit: 0, style: 'car', handsUp: 0, stepOver: 0, lean: 0, look: 0, hands: null, feet: null };
    this._ctl = { throttle: 0, steer: 0, handbrake: false };
    this._local = new Vector3();
    this._p = new Vector3();
    this._p2 = new Vector3();
    this._q = new Quaternion();
    this._q2 = new Quaternion();
    this._m = new Matrix();
    this._mA = new Matrix();
    this._mB = new Matrix();
    this._prevRoot = new Vector3();
    this._prevYaw = null;
    this._attachFragments();
    // The ride controller PlayerController hands the body to.
    this.ride = { update: (dt, active) => this._rideUpdate(dt, active) };
    this.carRide = new CarRide(this);
    this.bikeRide = new BikeRide(this);
    this._carPlan = new CarRide(this);
    this._bikePlan = new BikeRide(this);
    this._lodTick = 0;
  }

  get driving() { return !!this.active; }

  /** True if v's footprint (+ margin) at (x, z) overlaps scenery or a placed vehicle. */
  _blocked(v, x, z, margin) {
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    const hx = v.dims.w / 2 + margin, hz = v.dims.len / 2 + margin;
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const list = this.collision._query(x - ex, z - ez, x + ex, z + ez, []);
    // Sample the footprint: corners, edges and inside.
    for (let i = -1; i <= 1.001; i += 0.25) {
      for (let j = -1; j <= 1.001; j += 0.25) {
        const lx = i * hx, lz = j * hz;
        const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
        for (const b of list) {
          // Ignore ground-level slabs (road, kerbs, pavement) and the vehicle's own box.
          if (b.maxY < 0.3 || b.minY > v.dims.h) continue;
          if (px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ) return true;
        }
        for (const o of this.vehicles) {
          if (o === v || !o._placed) continue;
          const dx = px - o.x, dz = pz - o.z, oc = Math.cos(o.yaw), os = Math.sin(o.yaw);
          if (Math.abs(dx * oc - dz * os) < o.dims.w / 2 && Math.abs(dx * os + dz * oc) < o.dims.len / 2) return true;
        }
      }
    }
    return false;
  }

  /** Slide a parked vehicle along / across its axis to the nearest clear spot. */
  _clearSpot(v) {
    const margin = v.isBike ? 0.08 : 0.12;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    let best = null;
    if (!this._blocked(v, v.x, v.z, margin)) best = [0, 0];
    for (let d = 0.1; !best && d <= 3; d += 0.1) {
      for (const [a, b] of [[0, d], [0, -d], [d * 0.5, 0], [-d * 0.5, 0], [d * 0.4, d], [-d * 0.4, d], [d * 0.4, -d], [-d * 0.4, -d]]) {
        const x = v.x + a * c + b * s, z = v.z - a * s + b * c;
        if (!this._blocked(v, x, z, margin)) { best = [x - v.x, z - v.z]; break; }
      }
    }
    if (best && (best[0] || best[1])) {
      v.home.x = v.x + best[0];
      v.home.z = v.z + best[1];
      v.reset();
    }
    v._placed = true;
  }

  // ------------------------------------------------------------ per frame
  update(dt, playing) {
    const inp = this.input;
    const interact = playing && inp.consumeInteract();
    if (interact) this._interact();

    const ctl = this._ctl;
    for (const v of this.vehicles) {
      if (v.npcRider) continue; // a resident is riding it (Life.js drives it)
      let driver = false;
      if (v === this.active && this.phase === 'drive' && playing) {
        driver = true;
        ctl.throttle = inp.move.y; ctl.steer = inp.move.x; ctl.handbrake = inp.jumpHeld;
        if (this.wantExit) {
          // Stopping to get out: brake to a halt, then step out.
          ctl.throttle = Math.abs(v.vF) > 0.4 ? -Math.sign(v.vF) : 0; ctl.steer = 0; ctl.handbrake = true;
          if (Math.abs(v.vF) < 0.5) this._beginExit();
        }
      }
      if (v === this.active && this.phase !== 'drive') {
        driver = true;
        ctl.throttle = 0; ctl.steer = 0; ctl.handbrake = true;
      }
      v.update(dt, driver ? ctl : null);
      // Parked and settled: freeze its node matrices (see Vehicle.pause).
      const still = v !== this.active && v.speed < 0.01
        && Math.abs(v.pitchV) + Math.abs(v.rollV) + Math.abs(v.leanV) < 1e-3;
      v.stillTime = still ? (v.stillTime || 0) + dt : 0;
      v.pause(v.stillTime >= 0.5);
      if (v.lastImpact) {
        this.state.emit('player:land', { impact: clamp(v.lastImpact / 8, 0, 1), position: new Vector3(v.x, v.y, v.z) });
        v.lastImpact = 0;
      }
    }
    this._updateFragments();
    // Parked vehicles away from the camera draw their merged far model.
    const cam = this.cameraRig.camera.position;
    for (const v of this.vehicles) {
      const far = v !== this.active && v.speed < 0.05 && Math.hypot(cam.x - v.x, cam.z - v.z) > 15;
      if (far === v.far.isEnabled(false)) continue;
      v.far.setEnabled(far);
      v.body.setEnabled(!far);
      for (const w of v.wheels) if (!w.mounted) w.node.setEnabled(!far);
    }
    // Cabin detail only near the camera.
    if (--this._lodTick <= 0) {
      this._lodTick = 10;
      for (const v of this.vehicles) {
        const near = Math.hypot(cam.x - v.x, cam.z - v.z) < 15 || v === this.active;
        if (v.rig.detail && v.rig.detail.isEnabled(false) !== near) v.rig.detail.setEnabled(near);
      }
    }

    // What can she get into right now?
    let label = null;
    this.candidate = null;
    if (this.active) label = this.phase === 'drive' ? 'Get out' : null;
    else if (playing && !this.player.climb && !this.player.autoWalk && this.player.grounded) {
      const c = this._nearest();
      if (c) { this.candidate = c; label = c.kind === 'car' ? 'Drive' : 'Ride'; }
    }
    inp.setAction(label);
  }

  /** Engine sound for the audio system: { rpm, load, idle, max } or null. */
  engine() {
    return this.active && this.phase !== 'exit' ? this.active.engineState() : null;
  }

  reset() {
    if (this.active) this._finishExit(true);
    for (const v of this.vehicles) v.reset();
    this._attachFragments();
  }

  // ------------------------------------------------------------ get in / out
  _nearest() {
    const p = this.player.position;
    let best = null, bd = Infinity;
    for (const v of this.vehicles) {
      if (v.speed > 0.5 || v.npcRider || v.locked) continue;   // locked: for sale at Hikari Motors
      // Distance from her to the vehicle's footprint.
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
      const dx = p.x - v.x, dz = p.z - v.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const ox = Math.max(0, Math.abs(lx) - v.dims.w / 2), oz = Math.max(0, Math.abs(lz) - v.dims.len / 2);
      const d = Math.hypot(ox, oz);
      const reach = v.isBike ? 0.9 : 1.2;
      if (d < reach && d < bd && Math.abs(p.y - v.y) < 0.6) { bd = d; best = v; }
    }
    return best;
  }

  _interact() {
    if (this.active) {
      // Pressed while still getting in: get out as soon as she's seated.
      if (this.phase === 'drive' || this.phase === 'enter') this.wantExit = true;
      return;
    }
    const v = this.candidate;
    if (!v) return;
    // Get in on the side she is standing on (+1 = the vehicle's left).
    const local = v.worldToLocal(this.player.position, this._local);
    const side = this._freeSide(v, Math.abs(local.x) > 0.1 ? Math.sign(local.x) : null);
    if (side === 0) { this.ui?.toast('No room', 'Something is blocking the way in'); return; }
    const e = this._entry(v, side);
    // Walk around the vehicle rather than into it: from the other side, past
    // the nearer end; from in front / behind, out to the side line first.
    const route = [];
    const endZ = v.dims.len / 2 + 0.6;
    if (Math.sign(local.x) === -Math.sign(e[0]) && Math.abs(local.x) > 0.1) {
      // The nearer end, unless only the other one is clear (bikes in a rack).
      let z = (local.z < 0 ? -1 : 1) * endZ;
      if (!this._clear(v, 0, z) && this._clear(v, 0, -z)) z = -z;
      route.push([local.x, z], [e[0], z]);
    } else if (Math.abs(local.z) > v.dims.len / 2 && Math.abs(local.x) < Math.abs(e[0])) {
      route.push([e[0], local.z]);
    }
    route.push([e[0], e[2]]);
    const next = (i) => {
      const w = v.localToWorld([route[i][0], 0, route[i][1]], this._p);
      const last = i === route.length - 1;
      this.player.autoWalk = {
        x: w.x, z: w.z,
        done: (dist) => {
          if (!last) next(i + 1);
          else if (dist < 0.6) this._beginEnter(v, side);
        },
      };
    };
    next(0);
  }

  /** Where to get in from: the side she is on if clear, else the other. 0 = nowhere. */
  _freeSide(v, near = null) {
    // The side she is on, else bikes from the left, RHD cars from the right.
    const pref = near ?? (v.isBike ? 1 : -1);
    for (const side of [pref, -pref]) {
      const e = this._entry(v, side);
      if (this._clear(v, e[0], e[2])) return side;
    }
    return 0;
  }

  /** Whether she could stand at (x, z) in vehicle space. */
  _clear(v, x, z) {
    const w = v.localToWorld([x, 0, z], this._p);
    const probe = { x: w.x, z: w.z };
    this.collision.ignore = v.collider;
    const blocked = this.collision.resolveCircle(probe, 0.26, v.y + 0.2, 1.3, 0.3);
    this.collision.ignore = null;
    return !blocked && Math.hypot(probe.x - w.x, probe.z - w.z) < 0.05;
  }

  /**
   * Standing point beside the vehicle (vehicle space) for a side (+1 = its
   * left): in front of the door's outside handle / beside the bike's stand.
   */
  _entry(v, side) {
    // A separate planner: asking (autosave, exit checks) must not re-plan the ride in progress.
    const rd = v.isBike ? this._bikePlan : this._carPlan;
    rd.plan(v, side, null, null);
    const S0 = rd.exit.exitPos;
    return [S0.x, 0, S0.z];
  }

  _ride(v) { return v.isBike ? this.bikeRide : this.carRide; }

  _beginEnter(v, side) {
    this.active = v;
    this.phase = 'enter';
    this.t = 0;
    this.side = side;
    this.wantExit = false;
    v.driven = true;
    v.footDown = 1;
    // Start the path from wherever she actually stopped (in vehicle space).
    const start = v.worldToLocal(this.player.position, new Vector3());
    const startYaw = wrap(this.player.yaw - v.yaw);
    this._ride(v).plan(v, side, start, startYaw);
    this.player.ride = this.ride;
    this.player.velocity.set(0, 0, 0);
    this.character.hairRigid = true;
    this.input.setDriving(true);
    this.cameraRig.ignoreCollider = v.collider;
    // Open bikes can't hide the camera inside them; cars can.
    this.cameraRig.avoid = v.isBike ? null : v;
  }

  _beginExit() {
    this.phase = 'exit';
    this.t = 0;
    this.wantExit = false;
    const side = this._freeSide(this.active);
    if (side === 0) {
      this.phase = 'drive';
      this.ui?.toast('No room to get out', 'Move somewhere more open');
      return;
    }
    this.side = side;
    this._ride(this.active).plan(this.active, side, null, null);
  }

  _finishExit(instant = false) {
    const v = this.active;
    const pl = this.player;
    const e = this._entry(v, this.side || -1);
    const w = v.localToWorld([e[0], 0, e[2]], this._p);
    pl.ride = null;
    this.character.hairRigid = false;
    this.character.hairWind.set(0, 0, 0);
    pl.position.set(w.x, v.y, w.z);
    pl.visualY = v.y;
    pl.yaw = v.yaw + this._ride(v).exit.exitYaw;
    v.parked = null;
    pl.velocity.set(0, 0, 0);
    pl.grounded = true;
    // Back to the plain yaw rotation PlayerController drives.
    const root = this.character.root;
    root.rotationQuaternion = null;
    root.rotation.set(0, pl.yaw, 0);
    pl._sync?.();
    // She is placed beside the vehicle and upright again in one step: settle
    // the hair there instead of letting the jump and the vehicle's turn whip it.
    this.character.resetSecondaryMotion();
    v.driven = false;
    this.active = null;
    this.phase = null;
    this._prevYaw = null;
    this.input.setDriving(false);
    this.cameraRig.ignoreCollider = null;
    this.cameraRig.avoid = null;
    this.cameraRig.zoomTarget = 1;
    this.cameraRig.liftTarget = 0;
    this.cameraRig.followBoost = 1;
    if (instant) this.rideState.sit = 0;
  }

  // ------------------------------------------------------------ the ride
  _rideUpdate(dt) {
    const v = this.active;
    if (!v) { this.player.ride = null; return; }
    const pl = this.player, r = this.rideState;
    let exitDone = false;
    const cr = this._ride(v);
    const pace = v.isBike ? ENTER_PACE.bike : ENTER_PACE.car;
    // Time-keyed choreography with door handles / grips (CarRide, BikeRide).
    let tl = null;
    if (this.phase === 'enter' || this.phase === 'exit') {
      this.t += dt * pace;
      tl = this.phase === 'enter' ? cr.enter : cr.exit;
      if (this.phase === 'enter' && this.t >= tl.dur) { this.phase = 'drive'; tl = null; }
      else if (this.phase === 'exit' && this.t >= tl.dur) exitDone = true;
    }
    const o = cr.pose(tl, Math.min(this.t, tl ? tl.dur : 0), dt, r);
    const lyaw = o.yaw;
    cr.controls(dt);

    // Root transform: vehicle frame (no lean) while standing, chassis frame
    // (with lean / suspension) once seated, so standing beside a parked bike
    // she isn't tilted with it.
    const local = Matrix.RotationYToRef(lyaw, this._m);
    local.setTranslationFromFloats(o.pos.x, o.pos.y, o.pos.z);
    local.multiplyToRef(syncWorld(v.root), this._mA);
    local.multiplyToRef(syncWorld(v.chassis), this._mB);
    const pA = this._p, pB = this._p2, qA = this._q, qB = this._q2;
    this._mA.decompose(undefined, qA, pA);
    this._mB.decompose(undefined, qB, pB);
    const w = r.sit;
    const root = this.character.root;
    // Walking speed / turning between the keyed points drive the leg cycle.
    const prev = this._prevRoot;
    if (this._prevYaw === null) prev.copyFrom(root.position);
    const prevYaw = this._prevYaw ?? lyaw;
    Vector3.LerpToRef(pA, pB, w, root.position);
    root.rotationQuaternion ||= new Quaternion();
    Quaternion.SlerpToRef(qA, qB, w, root.rotationQuaternion);
    const walkSpeed = (1 - w) * Math.hypot(root.position.x - prev.x, root.position.z - prev.z) / Math.max(dt, 1e-3);
    const turnRate = (1 - w) * wrap(lyaw - prevYaw) / Math.max(dt, 1e-3);
    prev.copyFrom(root.position);
    this._prevYaw = lyaw;

    // Player state the camera / pickups / audio read.
    const cx = MathUtils.lerp(root.position.x, v.x, w), cz = MathUtils.lerp(root.position.z, v.z, w);
    pl.position.set(cx, v.y + (1 - w) * (root.position.y - v.y), cz);
    pl.visualY = pl.position.y;
    pl.lastGroundY = v.y;
    pl.yaw = v.yaw + lyaw * (1 - w);
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    pl.velocity.set(s * v.vF + c * v.vL, 0, c * v.vF - s * v.vL);
    pl.grounded = true;
    pl.runBlend = 0;
    const cam = v.cfg.cam;
    this.cameraRig.zoomTarget = 1 + (cam.zoom - 1) * w;
    this.cameraRig.liftTarget = cam.lift * w;
    this.cameraRig.followBoost = 1 + 3 * w;

    // Open vehicles: a breeze blows the hair back with speed (none in a car).
    const wind = v.isBike ? clamp(Math.abs(v.vF) / 12, 0, 1) * 0.9 * Math.sign(v.vF) : 0;
    this.character.hairWind.set(-Math.sin(v.yaw) * wind, 0.15 * Math.abs(wind), -Math.cos(v.yaw) * wind);

    // Limbs.
    cr.ik(r);

    const a = (this._animIn ||= { speed: 0, runBlend: 0, grounded: true, vy: 0, airSpeed: 0, turnRate: 0, ride: r });
    a.speed = walkSpeed < 0.15 ? 0 : Math.min(walkSpeed, 1.6);
    a.turnRate = clamp(turnRate, -6, 6);
    this.animation.update(dt, a);

    if (this.phase === 'exit' && exitDone) this._finishExit();
  }

  // ------------------------------------------------------------ fragments
  /** Crystals sitting on a vehicle (the delivery van roof) travel with it. */
  _attachFragments() {
    const items = this.collectibles?.items || [];
    this.riders = [];
    for (const it of items) {
      for (const v of this.vehicles) {
        const s = Math.sin(v.home.yaw), c = Math.cos(v.home.yaw);
        const dx = it.base.x - v.home.x, dz = it.base.z - v.home.z;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < v.dims.w / 2 + 0.2 && Math.abs(lz) < v.dims.len / 2 + 0.2 && it.base.y > v.dims.h - 0.2) {
          it.home ||= it.base.clone();
          it.base.copyFrom(it.home);
          this.riders.push({ it, v, local: [lx, it.home.y, lz] });
        }
      }
    }
  }

  _updateFragments() {
    for (const f of this.riders) {
      const v = f.v, s = Math.sin(v.yaw), c = Math.cos(v.yaw);
      const [lx, y, lz] = f.local;
      f.it.base.set(v.x + lx * c + lz * s, y + v.y, v.z - lx * s + lz * c);
      f.it.halo.position.set(f.it.base.x, v.y + v.dims.h + 0.03, f.it.base.z);
      f.it.beam.position.set(f.it.base.x, 0, f.it.base.z);
    }
  }
}

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

/** Bounding sphere radius about the box centre, measured on the vertices (as three computes it). */
function sphereRadius(mesh) {
  const c = mesh.getBoundingInfo().boundingBox.center, p = mesh.getVerticesData('position');
  let r2 = 0;
  for (let i = 0; i < p.length; i += 3) r2 = Math.max(r2, (p[i] - c.x) ** 2 + (p[i + 1] - c.y) ** 2 + (p[i + 2] - c.z) ** 2);
  return Math.sqrt(r2);
}
