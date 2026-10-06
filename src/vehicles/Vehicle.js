import { TransformNode, MeshBuilder, PBRMaterial, Color3, Vector3, Matrix } from '@babylonjs/core';
import { MathUtils } from '../player/math.js';
import { syncWorld, applyEnvironment } from './VehicleKit.js';

const G = 9.81;
const RIDER = 55;          // kg added while ridden
const SUBSTEP = 1 / 240;
const clamp = MathUtils.clamp;
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

/**
 * One drivable vehicle: model (body + wheels), physics state and its moving
 * collider. Local frame: +Z forward, +X left; yaw rotates about +Y (positive
 * = turning left), so forward is (sin yaw, cos yaw) and left (cos yaw, -sin yaw).
 *
 * Cars use a dynamic bicycle model: per-axle slip angles with a saturating
 * (tanh) tyre curve scaled by load, load transfer under acceleration, power-
 * limited drive, brakes, rolling resistance and aero drag; below walking pace
 * it blends to kinematic steering so it never jitters at rest. Two-wheelers
 * use a kinematic bicycle model with a lateral-grip limit and the real lean
 * angle for the turn (tan φ = v·ω / g).
 *
 * Root and chassis rotate pitch / yaw / roll in YXZ order, Babylon's own.
 */
export class Vehicle {
  constructor({ id, type, cfg, model, x, z, yaw, collision, scene }) {
    Object.assign(this, { id, type, cfg, collision });
    this.kind = cfg.kind;
    this.isBike = cfg.kind === 'bike';
    this.home = { x, z, yaw };
    this.dims = model.dims;

    this.root = new TransformNode(`vehicle:${type}`, scene);
    // Suspension / lean lives on the chassis so wheels stay on the road.
    this.chassis = new TransformNode('chassis', scene);
    this.chassis.parent = this.root;
    model.body.parent = this.chassis;
    this.wheels = model.wheels;
    // Mounted wheels (a rigged bike's front wheel) already sit in the steering assembly.
    for (const w of this.wheels) if (!w.mounted) w.node.parent = this.isBike ? this.chassis : this.root;
    this.rigModel = model.rig || null;

    // Geometry for the physics from the actual model.
    const fz = this.wheels.filter((w) => w.front).map((w) => w.cz);
    const rz = this.wheels.filter((w) => !w.front).map((w) => w.cz);
    const avg = (a, d) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : d);
    this.zf = avg(fz, this.dims.len * 0.3);
    this.zr = avg(rz, -this.dims.len * 0.3);
    this.wheelbase = Math.max(0.6, this.zf - this.zr);
    this.track = Math.max(0.3, ...this.wheels.map((w) => Math.abs(w.cx) * 2), 0);
    this.wheelR = avg(this.wheels.map((w) => w.r), 0.3);

    const p = cfg.physics;
    this.p = p;
    this.collider = collision.addDynamic({
      x, z, yaw, y0: 0, hx: this.dims.w / 2, hz: this.dims.len / 2, h: this.dims.h,
      climb: !this.isBike, camera: !this.isBike, owner: this,
    });
    // Collision circles along the body (radius = half width).
    const rad = this.isBike ? 0.32 : this.dims.w / 2 * 0.98;
    const half = this.dims.len / 2 - rad;
    const n = Math.max(2, Math.ceil((half * 2) / rad) + 1);
    this.circles = Array.from({ length: n }, (_, i) => -half + (2 * half * i) / (n - 1));
    this.circleR = rad;

    if (this.isBike) {
      // Kickstand, shown while parked.
      const ks = MeshBuilder.CreateCylinder('kickstand', { height: 0.34, diameter: 0.024, tessellation: 6 }, scene);
      ks.material = kickstandMaterial(scene);
      ks.position.set(0.16, 0.16, -0.05);
      ks.rotation.z = -0.55;
      ks.parent = this.chassis;
      ks.isPickable = false;
      ks.receiveShadows = true;
      ks.metadata = { cast: true };
      this.kickstand = ks;
    }
    this.crank = model.rig?.crank || null;
    this.paused = false;
    this.reset();
  }

  reset() {
    const h = this.home;
    this.x = h.x; this.z = h.z; this.yaw = h.yaw;
    this.y = this.collision.groundHeight(h.x, h.z, 0.2, 0.4, 0.4);
    this.vF = 0; this.vL = 0; this.r = 0;
    this.steer = 0; this.throttle = 0; this.brake = 0; this.handbrake = 0;
    this.ax = 0; this.ay = 0;
    this.pitch = 0; this.pitchV = 0; this.roll = 0; this.rollV = 0;
    this.tPitch = 0; this.tRoll = 0;
    this.lean = this.isBike ? 0.12 : 0; this.leanV = 0;
    this.spin = 0; this.crankA = 0;
    this.driven = false;
    this.parked = null;
    this.footDown = 1;
    this.rpm = 0; this.gear = 1; this.load = 0;
    this.slipF = 0; this.slipR = 0;
    this.lastImpact = 0;
    // Moved home while parked: its frozen matrices must follow.
    this.stillTime = 0;
    this.pause(false);
    this._apply();
  }

  get speed() { return Math.hypot(this.vF, this.vL); }
  get forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }

  /** World position of a vehicle-space point (on the chassis, including lean / suspension). */
  localToWorld(v, out = new Vector3()) {
    return Vector3.TransformCoordinatesFromFloatsToRef(v[0], v[1], v[2], syncWorld(this.chassis), out);
  }

  /** A world point in the vehicle's root frame (no lean / suspension). */
  worldToLocal(p, out = new Vector3()) {
    const inv = (this._inv ||= new Matrix());
    syncWorld(this.root).invertToRef(inv);
    return Vector3.TransformCoordinatesToRef(p, inv, out);
  }

  /**
   * Parked and settled: freeze the world matrices of its ~70 nodes so the
   * renderer skips them (the original's Pausable); moving again: unfreeze.
   */
  pause(on) {
    if (on === this.paused) return;
    this.paused = on;
    const nodes = [this.root, ...this.root.getDescendants(false)];
    for (const n of nodes) {
      if (on) n.freezeWorldMatrix();
      else n.unfreezeWorldMatrix();
    }
  }

  /**
   * @param {number} dt
   * @param {{throttle:number, steer:number, handbrake:boolean}|null} ctl
   *   driver input (null = nobody aboard: parking brake on)
   */
  update(dt, ctl) {
    const moving = this.speed > 0.02 || ctl;
    if (moving) {
      let t = dt;
      while (t > 1e-6) {
        const h = Math.min(SUBSTEP, t);
        if (this.isBike) this._stepBike(h, ctl); else this._stepCar(h, ctl);
        t -= h;
      }
      this._collide();
    }
    this._ground(dt);
    this._visuals(dt, ctl);
  }

  /**
   * Driven by a resident (no physics): place the vehicle on the route and
   * let wheels, lean, suspension and collider follow.
   */
  autoDrive(dt, x, z, yaw, speed) {
    const dy = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.r = clamp(dy / Math.max(dt, 1e-3), -2.5, 2.5);
    this.x = x; this.z = z; this.yaw = yaw;
    this.vF = speed; this.vL = 0;
    this.steer = clamp(Math.atan2(this.r * this.wheelbase, Math.max(speed, 0.6)), -0.5, 0.5);
    this.throttle = speed > 0.3 ? 0.4 : 0;
    this.ay = speed * this.r;
    this.pause(false);
    this._ground(dt);
    this._visuals(dt, speed > 0.3 ? { throttle: 0.4, steer: 0, handbrake: false } : null);
    // Markers (seat, grips, stand) are read straight after: keep them current
    // even when nobody renders this bike.
    syncWorld(this.chassis);
  }

  // ---------------------------------------------------------------- cars
  _controls(ctl, dt) {
    const v = this.vF;
    let throttle = 0, brake = 0;
    if (ctl) {
      const a = ctl.throttle;
      // Pedal logic: pushing against the direction of travel brakes first,
      // then (almost stopped) engages reverse.
      if (a > 0.02) { if (v < -0.4) brake = a; else throttle = a; }
      else if (a < -0.02) { if (v > 0.4) brake = -a; else throttle = a; }
      this.handbrake = ctl.handbrake ? 1 : 0;
    } else {
      this.handbrake = 1;
    }
    this.throttle = damp(this.throttle, throttle, 8, dt);
    this.brake = damp(this.brake, brake, 12, dt);
    // Steering: rate-limited, and the lock narrows with speed (as a driver
    // would steer at speed), which also keeps it stable.
    const sp = Math.abs(v);
    const lock = (this.isBike ? 0.55 : 0.62) / (1 + (sp / (this.isBike ? 7 : 11)) ** 2);
    const target = (ctl ? -ctl.steer : 0) * lock;
    const rate = this.isBike ? 3.2 : 2.6;
    this.steer += clamp(target - this.steer, -rate * dt, rate * dt);
  }

  _driveForce(sign) {
    const p = this.p, v = Math.abs(this.vF);
    // Power-limited, with a soft governor at the top speed.
    const f = Math.min(p.maxForce, p.power / Math.max(v, 0.5)) * (1 - clamp(v / p.top, 0, 1) ** 6);
    // Reverse is a single slow gear.
    return sign < 0 ? -Math.min(p.maxForce * 0.6, f) * (v > 6 ? 0 : 1) : f;
  }

  _stepCar(dt, ctl) {
    const p = this.p;
    this._controls(ctl, dt);
    const m = p.mass + (this.driven ? RIDER : 0);
    const L = this.wheelbase;
    const cgz = (this.zf + this.zr) / 2;
    const aF = this.zf - cgz, bR = cgz - this.zr;
    const I = m * (L * L + this.track * this.track) / 12 * 1.2;
    const vF = this.vF, vL = this.vL, r = this.r;
    const sp = Math.abs(vF);

    // Axle loads with longitudinal load transfer.
    const wF = m * G * bR / L - m * this.ax * p.cgH / L;
    const wR = m * G * aF / L + m * this.ax * p.cgH / L;
    const mu = p.grip;
    // Longitudinal: drive / brake / resistance.
    let Fdrive = this.throttle >= 0 ? this.throttle * this._driveForce(1) : -this.throttle * this._driveForce(-1);
    const driveLoad = p.drive === 'front' ? wF : wR;
    Fdrive = clamp(Fdrive, -mu * driveLoad, mu * driveLoad);
    const brakeMax = p.brake * m * G;
    let Fbrake = -Math.sign(vF) * this.brake * brakeMax;
    // Parking / hand brake on the rear axle.
    if (this.handbrake) Fbrake += -Math.sign(vF) * Math.min(mu * wR * 0.9, m * G * 0.6);
    if (sp < 0.3 && (this.brake > 0.05 || this.handbrake) && Math.abs(this.throttle) < 0.05) Fbrake = -vF * m / Math.max(dt, 1e-3) * 0.5;
    const Fres = -vF * m * 0.012 * G / Math.max(1, sp) - 0.42 * vF * sp;

    // Lateral: slip angles (low-speed safe) and saturating tyre forces.
    const vx = Math.max(sp, 1.5);
    const sgn = vF >= 0 ? 1 : -1;
    const alphaF = Math.atan2(vL + aF * r, vx) - this.steer * sgn;
    const alphaR = Math.atan2(vL - bR * r, vx);
    // Rear grip is shared with drive / braking (friction circle); the hand
    // brake locks the rear wheels and lets the tail slide.
    const rearUse = clamp(Math.abs(p.drive === 'front' ? 0 : Fdrive) / Math.max(mu * wR, 1), 0, 0.95);
    const rearK = (this.handbrake ? 0.35 : 1) * Math.sqrt(1 - rearUse * rearUse);
    const FyF = tyre(alphaF, wF, mu);
    const FyR = tyre(alphaR, wR, mu * rearK);
    // Tyre slip 0..1 per axle (for smoke / skid marks): sideways slip past
    // the grip peak, locked wheels, wheelspin.
    const spin = clamp((Math.abs(Fdrive) / Math.max(mu * driveLoad, 1) - 0.85) / 0.15, 0, 1) * (this.throttle > 0.5 ? 1 : 0);
    const lock = (this.handbrake ? 1 : 0) * clamp((sp - 1) / 3, 0, 1);
    this.slipF = Math.max(lateralSlip(alphaF, sp), p.drive === 'front' ? spin : 0);
    this.slipR = Math.max(lateralSlip(alphaR, sp), p.drive === 'front' ? 0 : spin, lock, this.brake > 0.9 && sp > 8 ? 0.6 : 0);

    const Fx = Fdrive + Fbrake + Fres - FyF * Math.sin(this.steer);
    const Fy = FyR + FyF * Math.cos(this.steer);
    const dvF = Fx / m + vL * r;
    const dvL = Fy / m - vF * r;
    const dr = (aF * FyF * Math.cos(this.steer) - bR * FyR) / I;
    this.ax = damp(this.ax, Fx / m, 10, dt);
    this.ay = damp(this.ay, (Fy / m), 10, dt);

    let nvF = vF + dvF * dt;
    // Brakes stop the car; they never push it backwards.
    if (Math.sign(nvF) !== Math.sign(vF) && vF !== 0 && Math.abs(this.throttle) < 0.05) nvF = 0;
    let nvL = vL + dvL * dt;
    let nr = r + dr * dt;
    // Below walking pace blend to kinematic steering (no tyre-model jitter).
    const k = clamp((sp - 0.8) / 2.5, 0, 1);
    const rKin = nvF * Math.tan(this.steer) / L;
    nr = rKin + (nr - rKin) * k;
    nvL *= k + (1 - k) * Math.exp(-20 * dt);
    this.vF = nvF; this.vL = nvL; this.r = nr;
    this._integrate(dt);
  }

  // ---------------------------------------------------------------- bikes
  _stepBike(dt, ctl) {
    const p = this.p;
    this._controls(ctl, dt);
    const m = p.mass + (this.driven ? RIDER : 0);
    const v = this.vF, sp = Math.abs(v);
    let F = 0;
    if (this.throttle > 0) F = this.throttle * this._driveForce(1);
    // Two-wheelers have no reverse: paddle it backwards slowly with the feet.
    else if (this.throttle < 0 && v < 0.3) F = this.throttle * m * 1.2 * (v > -0.9 ? 1 : 0);
    F = clamp(F, -p.grip * m * G, p.grip * m * G * 0.6);
    let Fb = -Math.sign(v) * this.brake * p.brake * m * G;
    if (this.handbrake && !ctl) Fb = -Math.sign(v) * m * G * 0.5;
    if (sp < 0.25 && (this.brake > 0.05 || !ctl) && Math.abs(this.throttle) < 0.05) Fb = -v * m / Math.max(dt, 1e-3) * 0.5;
    const Fres = -v * m * 0.01 * G / Math.max(1, sp) - (p.power < 1000 ? 0.25 : 0.3) * v * sp;
    let nv = v + ((F + Fb + Fres) / m) * dt;
    if (Math.sign(nv) !== Math.sign(v) && v !== 0 && Math.abs(this.throttle) < 0.05) nv = 0;
    this.ax = damp(this.ax, (nv - v) / dt, 10, dt);
    // Yaw from steering, limited by tyre grip (lateral accel ≤ μg).
    let r = nv * Math.tan(this.steer) / this.wheelbase;
    const aLat = Math.abs(nv * r);
    if (aLat > p.grip * G) r *= (p.grip * G) / aLat;
    this.vF = nv; this.vL = 0; this.r = r;
    this.ay = damp(this.ay, nv * r, 6, dt);
    this._integrate(dt);
  }

  _integrate(dt) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // forward (s, c), left (c, -s)
    this.x += (s * this.vF + c * this.vL) * dt;
    this.z += (c * this.vF - s * this.vL) * dt;
    this.yaw += this.r * dt;
  }

  // ---------------------------------------------------------------- world
  _collide() {
    const col = this.collision;
    col.ignore = this.collider;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const m = this.p.mass + (this.driven ? RIDER : 0);
    const L = this.dims.len, W = this.dims.w;
    const I = m * (L * L + W * W) / 12;
    let impact = 0;
    const pos = (this._pos ||= { x: 0, z: 0 });
    for (let iter = 0; iter < 2; iter++) {
      for (const oz of this.circles) {
        const cx = this.x + s * oz, cz = this.z + c * oz;
        pos.x = cx; pos.z = cz;
        if (!col.resolveCircle(pos, this.circleR, this.y + 0.28, Math.max(0.5, this.dims.h - 0.45), 0)) continue;
        const px = pos.x - cx, pz = pos.z - cz;
        const d = Math.hypot(px, pz);
        if (d < 1e-6) continue;
        this.x += px; this.z += pz;
        const nx = px / d, nz = pz / d;
        // Contact point relative to the centre, and its velocity.
        const rx = s * oz - nx * this.circleR, rz = c * oz - nz * this.circleR;
        let vx = s * this.vF + c * this.vL, vz = c * this.vF - s * this.vL;
        // ω × r with ω = (0, r, 0): (r·rz, 0, -r·rx)
        const pvx = vx + this.r * rz, pvz = vz - this.r * rx;
        const vn = pvx * nx + pvz * nz;
        if (vn >= 0) continue;
        const rn = rz * nx - rx * nz;
        const e = 0.25;
        const j = (-(1 + e) * vn) / (1 / m + (rn * rn) / I);
        vx += (j * nx) / m; vz += (j * nz) / m;
        // Scrape: lose some speed along the wall too.
        const vt = vx * -nz + vz * nx;
        vx -= -nz * vt * 0.12; vz -= nx * vt * 0.12;
        this.r += (rn * j) / I * (this.isBike ? 0.3 : 1);
        this.vF = vx * s + vz * c;
        this.vL = this.isBike ? 0 : vx * c - vz * s;
        impact = Math.max(impact, -vn);
      }
    }
    col.ignore = null;
    if (impact > 1.2) this.lastImpact = impact;
  }

  _ground(dt) {
    const col = this.collision;
    col.ignore = this.collider;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const hw = this.isBike ? 0 : this.track / 2;
    const fl = this._groundAt(hw, this.zf, s, c), fr = this._groundAt(-hw, this.zf, s, c);
    const rl = this._groundAt(hw, this.zr, s, c), rr = this._groundAt(-hw, this.zr, s, c);
    col.ignore = null;
    const y = (fl + fr + rl + rr) / 4;
    // Kerbs: ease the body up/down instead of popping.
    this.y = damp(this.y, y, 14, dt);
    this.tPitch = damp(this.tPitch, -Math.atan2((fl + fr) / 2 - (rl + rr) / 2, this.wheelbase), 14, dt);
    this.tRoll = this.isBike ? 0 : damp(this.tRoll, Math.atan2((fl + rl) / 2 - (fr + rr) / 2, this.track || 1), 14, dt);
    this.collider.x = this.x; this.collider.z = this.z; this.collider.yaw = this.yaw; this.collider.y0 = this.y;
  }

  /** Ground height under a vehicle-space point (lx, lz). */
  _groundAt(lx, lz, s, c) {
    return this.collision.groundHeight(this.x + c * lx + s * lz, this.z - s * lx + c * lz, 0.15, this.y + 0.25, 0.3);
  }

  _visuals(dt, ctl) {
    // Suspension: body pitches with longitudinal and rolls with lateral
    // acceleration (spring-damper, so it settles with a little overshoot).
    if (!this.isBike) {
      const k = 90, c = 11;
      const pt = clamp(-this.ax * 0.0075 * (this.p.cgH / 0.55), -0.07, 0.07);
      const rt = clamp(this.ay * 0.009 * (this.p.cgH / 0.55), -0.08, 0.08);
      this.pitchV += ((pt - this.pitch) * k - this.pitchV * c) * dt;
      this.pitch += this.pitchV * dt;
      this.rollV += ((rt - this.roll) * k - this.rollV * c) * dt;
      this.roll += this.rollV * dt;
    } else {
      // Lean into the turn (tan φ = v·ω / g); parked / stopped: on the
      // kickstand or the rider's foot.
      const sp = Math.abs(this.vF);
      const turn = Math.atan(clamp(this.vF * this.r / G, -1.2, 1.2));
      const up = clamp((sp - 0.6) / 2.2, 0, 1);
      // parked 1 = on its stand (set by the ride while getting on / off).
      const parked = this.parked ?? (this.driven ? 0 : 1);
      const rest = 0.12 * parked + 0.07 * this.footDown * (1 - parked);
      const target = turn * up + rest * (1 - up);
      const k = 60, c = 13;
      this.leanV += ((target - this.lean) * k - this.leanV * c) * dt;
      this.lean += this.leanV * dt;
      this.pitch = damp(this.pitch, clamp(-this.ax * 0.004, -0.05, 0.05), 8, dt);
      if (this.kickstand && this.kickstand.isEnabled(false) === this.driven) this.kickstand.setEnabled(!this.driven);
      const ks = this.rigModel?.kickstand;
      if (ks) ks.rotation.x = (1 - parked) * 1.45;
    }
    // Wheels: roll by distance; fronts steer.
    this.spin += (this.vF * dt) / this.wheelR;
    for (const w of this.wheels) {
      w.spin.rotation.x = this.spin * (this.wheelR / w.r);
      if (w.front && !w.mounted) w.node.rotation.y = this.steer;
    }
    if (this.crank) {
      // Pedalling: crank turns with the rear wheel (fixed gear ratio) while
      // pedalling; freewheels when coasting.
      const pedal = ctl && ctl.throttle > 0.05 ? 1 : 0;
      this.pedaling = damp(this.pedaling || 0, pedal, 6, dt);
      if (this.pedaling > 0.05) this.crankA += (Math.max(0, this.vF) * dt / this.wheelR) / 2.2 * Math.max(this.pedaling, 0.3) + 0.6 * dt * pedal;
      this.crank.rotation.x = this.crankA;
    }
    this._apply();
  }

  _apply() {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(this.tPitch, this.yaw, this.tRoll);
    // Lean is about the contact line (rotate the chassis about Z at ground level).
    this.chassis.rotation.set(this.pitch, 0, this.isBike ? -this.lean : this.roll);
    this.collider.x = this.x; this.collider.z = this.z; this.collider.yaw = this.yaw; this.collider.y0 = this.y;
  }

  /** Engine sound parameters: rpm 0..1, load 0..1, on. */
  engineState() {
    const e = this.cfg.engine;
    if (!e) return null;
    const v = Math.abs(this.vF);
    const span = this.p.top / e.gears;
    const gear = Math.min(e.gears, Math.floor(v / span) + 1);
    const inGear = (v - (gear - 1) * span) / span;
    const rpm = clamp(0.12 + (gear === 1 ? inGear * 0.8 : 0.35 + inGear * 0.6), 0, 1);
    this.rpm = damp(this.rpm, this.driven ? Math.max(rpm, Math.abs(this.throttle) * 0.25 + 0.1) : 0, 6, 1 / 60);
    return { rpm: this.rpm, load: Math.abs(this.throttle), idle: e.idle, max: e.max };
  }
}

/** Saturating (tanh) lateral tyre force; `muK` = friction � the axle's grip share. */
function tyre(alpha, load, muK) {
  const cap = muK * load;
  return -cap * Math.tanh((7.5 * load * alpha) / Math.max(cap, 1));
}

/** Sideways slip past the grip peak, 0..1 (smoke / skid marks), fading in above 2 m/s. */
function lateralSlip(alpha, sp) {
  return clamp((Math.abs(alpha) - 0.12) / 0.25, 0, 1) * clamp((sp - 2) / 4, 0, 1);
}

let _kickstand = null;
function kickstandMaterial(scene) {
  if (_kickstand) return _kickstand;
  _kickstand = new PBRMaterial('kickstand', scene);
  _kickstand.albedoColor = Color3.FromHexString('#2b2d33').toLinearSpace();
  _kickstand.roughness = 0.5;
  _kickstand.metallic = 0.6;
  applyEnvironment(_kickstand);
  return _kickstand;
}
