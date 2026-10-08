import { Matrix, Mesh, PBRMaterial, Quaternion, Vector3, VertexData } from '@babylonjs/core';
import { Batch, lin } from './MallKit.js';
import { lerp } from './Timeline.js';
import { MathUtils } from '../player/math.js';

/**
 * Supermarket shopping carts: a chromed wire basket with a folding back
 * gate and child seat, a lower tray, a red handle and four swivel castors.
 * Every cart of the trip is a thin instance of the same few meshes (body,
 * gate, forks, wheels: six draws for the whole mall), written only when a
 * cart moves.
 *
 * A cart turns about its back wheels and rolls with inertia: pushed by her
 * (push(): her stick steers it, the world's collision boxes stop it, and it
 * never passes through a shelf: a move that would overlap is slid along the
 * obstacle or not taken), or placed along a path by a resident (moveTo()).
 * Castors trail behind their swivels (the contact point stays put and the
 * fork re-aims at it), so they swing round when a cart starts, turns or
 * backs up, and roll by the distance their contact point travels.
 *
 * What it carries are entries { size: { w, d, h }, put(x, y, z, yaw) }:
 * stow() packs one into the basket (on the floor first, then on top, as in
 * a real cart) and the cart moves it along with itself; while `flying` is
 * set (on its way in, carried by a hand) the cart leaves it alone. Let go
 * of above its place, a thing drops into it; taken out from under others,
 * those drop onto what is left (nothing slides about by itself).
 *
 * Frame: +z forward, +x the pusher's left, origin on the floor between the
 * axles; yaw as the player's (forward = (sin yaw, cos yaw)).
 */
export const CART = {
  grips: { l: [0.17, 0.995, -0.47], r: [-0.17, 0.995, -0.47] },   // hands on the handle
  axle: -0.3,            // rear wheels (it turns about them)
  behind: 0.89,          // the pusher's centre behind the cart's origin
  basket: { x0: -0.18, x1: 0.18, z0: -0.3, z1: 0.33, y: 0.535 },   // inside, on the wire floor
  half: { x: 0.28, z: 0.48 },
};
// Castors: [x, z] of each swivel (rear pair under the handle posts).
const CASTORS = [[0.22, -0.3], [-0.22, -0.3], [0.17, 0.33], [-0.17, 0.33]];
const MOUNT_Y = 0.13, WHEEL_R = 0.0625, TRAIL = 0.035;
const GATE = { y: 0.97, z: -0.38, nested: -1.35 };
// Pushing: top speed (a brisk walk), acceleration and braking (a loaded
// cart has weight), turn rate about the back wheels.
const MAX_SPEED = 1.6, ACCEL = 2.2, BRAKE = 3.6, TURN = 1.7, TURN_ACCEL = 7;
const RIM = 0.0075, WIRE = 0.0028, TUBE = 0.012;
const clamp = MathUtils.clamp;

const _m = new Matrix(), _m2 = new Matrix(), _m3 = new Matrix(), _q = new Quaternion(), _v = new Vector3(), _one = Vector3.One();
const _probe = { x: 0, z: 0 }, _push = { x: 0, z: 0 }, _local = { x: 0, y: 0, z: 0 };
// What collides when she pushes: three circles along the cart, and her behind its handle ([z, radius, from y, height]).
const BODY = [[-0.28, 0.27, 0.04, 0.95], [0.05, 0.27, 0.04, 0.95], [0.32, 0.25, 0.04, 0.95], [-CART.behind, 0.26, 0, 1.5]];

/** All the trip's carts: shared meshes, materials and instance buffers. */
export class CartFleet {
  /** The shopping trip's fleet (one per MallMode context, made on first use; MallShopping disposes it). */
  static for(ctx) {
    let f = fleets.get(ctx);
    if (!f) fleets.set(ctx, (f = new CartFleet(ctx.scene, ctx.collision, ctx.graphics)));
    return f;
  }

  constructor(scene, collision, graphics) {
    Object.assign(this, { scene, collision, graphics });
    this.carts = [];
    this.capacity = 0;
    const chrome = new PBRMaterial('cart:chrome', scene);
    chrome.metallic = 1; chrome.roughness = 0.22; chrome.albedoColor = lin('#ffffff');
    const plastic = new PBRMaterial('cart:plastic', scene);
    plastic.metallic = 0; plastic.roughness = 0.45; plastic.albedoColor = lin('#ffffff');
    this.materials = [chrome, plastic];
    const make = (name, build) => {
      const b = new Batch(scene, name);
      build(b, chrome, plastic);
      return b.build(null).map((m) => { m.alwaysSelectAsActiveMesh = true; return m; });
    };
    // Per part: its meshes and its instance matrices (one per cart, or four: one per castor).
    this.parts = {
      body: { meshes: make('cart:body', buildBody), per: 1 },
      gate: { meshes: make('cart:gate', buildGate), per: 1 },
      fork: { meshes: make('cart:fork', buildFork), per: 4 },
      wheel: { meshes: make('cart:wheel', buildWheel), per: 4 },
    };
    this.partList = Object.values(this.parts);
    graphics.addCasters([...this.parts.body.meshes, ...this.parts.gate.meshes]);
    this._grow(16);
    this.dirty = false;
  }

  get meshes() { return this.partList.flatMap((p) => p.meshes); }

  /** A cart standing at (x, z) facing yaw. */
  add({ x, z, yaw }) {
    if (this.carts.length >= this.capacity) this._grow(this.capacity * 2);
    const c = new Cart(this, this.carts.length, x, z, yaw);
    this.carts.push(c);
    this._count();
    return c;
  }

  remove(cart) {
    const i = this.carts.indexOf(cart);
    if (i < 0) return;
    this.collision.removeDynamic(cart.collider);
    // The last cart takes the freed instance slots.
    const last = this.carts.pop();
    if (last !== cart) { this.carts[i] = last; last.index = i; last.dirty = true; }
    this._count();
  }

  _grow(n) {
    this.capacity = n;
    for (const p of this.partList) {
      const old = p.matrices;
      p.matrices = new Float32Array(n * p.per * 16);
      if (old) p.matrices.set(old);
      for (const m of p.meshes) m.thinInstanceSetBuffer('matrix', p.matrices, 16, false);
    }
    this._count();
  }

  _count() {
    for (const p of this.partList) for (const m of p.meshes) m.thinInstanceCount = this.carts.length * p.per;
    this.dirty = true;
  }

  /** Per frame, after the carts moved: castors, gates and contents, then one upload per part. */
  update(dt) {
    for (const c of this.carts) c.update(dt);
    if (!this.dirty) return;
    this.dirty = false;
    for (const p of this.partList) for (const m of p.meshes) m.thinInstanceBufferUpdated('matrix');
  }

  dispose() {
    for (const c of this.carts) this.collision.removeDynamic(c.collider);
    this.carts.length = 0;
    this.graphics.removeCasters(this.meshes);
    for (const m of this.meshes) m.dispose();
    for (const m of this.materials) m.dispose();
    this.parts = {};
    this.partList = [];
  }
}
const fleets = new WeakMap();

export class Cart {
  constructor(fleet, index, x, z, yaw) {
    this.fleet = fleet;
    this.index = index;
    this.x = x; this.z = z; this.yaw = yaw;
    this.speed = 0;          // forward m/s (her pushing)
    this.turn = 0;           // yaw rate about the back wheels
    this.gateK = 0; this.gateTarget = 0;
    this.contents = [];      // stowed entries
    this.collider = fleet.collision.addDynamic({ x, z, yaw, y0: 0, hx: CART.half.x, hz: CART.half.z, h: 1.0, camera: false, owner: this });
    // Castors: swivel point and trailing contact (world), wheel spin. Parked
    // carts' castors point every which way.
    this.castors = CASTORS.map(([cx, cz], i) => {
      const a = yaw + Math.sin(index * 2.3 + i * 1.7) * 2.2;
      const sx = x + Math.cos(yaw) * cx + Math.sin(yaw) * cz, sz = z - Math.sin(yaw) * cx + Math.cos(yaw) * cz;
      return { lx: cx, lz: cz, cx: sx - Math.sin(a) * TRAIL, cz: sz - Math.cos(a) * TRAIL, heading: a, spin: 0 };
    });
    // A 2 cm height map over the basket floor for stacking what goes in.
    const B = CART.basket;
    this.cols = Math.round((B.x1 - B.x0) / 0.02); this.rows = Math.round((B.z1 - B.z0) / 0.02);
    this.heights = new Float32Array(this.cols * this.rows);
    this.version = 0;        // bumped whenever what it carries changes
    this.moved = true;
    this.dirty = true;
  }

  /** World point of a cart-space point (into `out`, an { x, y, z } or Vector3). */
  toWorld(lx, ly, lz, out) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    out.x = this.x + c * lx + s * lz; out.y = ly; out.z = this.z - s * lx + c * lz;
    return out;
  }

  /** Cart-space point of a world point (into `out`). */
  toLocal(x, y, z, out) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw), dx = x - this.x, dz = z - this.z;
    out.x = c * dx - s * dz; out.y = y; out.z = s * dx + c * dz;
    return out;
  }

  /** Her hands' points on the handle (world, into arrays [x, y, z]). */
  grips(l, r) {
    this.toWorld(CART.grips.l[0], CART.grips.l[1], CART.grips.l[2], _v); l[0] = _v.x; l[1] = _v.y; l[2] = _v.z;
    this.toWorld(CART.grips.r[0], CART.grips.r[1], CART.grips.r[2], _v); r[0] = _v.x; r[1] = _v.y; r[2] = _v.z;
  }

  /** Where the pusher stands (world x, z into out). */
  pusher(out) { return this.toWorld(0, 0, -CART.behind, out); }

  /** Put it somewhere (no physics): parking, a resident's path. Castors follow. */
  moveTo(x, z, yaw) {
    if (x === this.x && z === this.z && yaw === this.yaw) return;
    this.x = x; this.z = z; this.yaw = yaw;
    this.moved = true;
  }

  /** Back gate up (another cart nested into it) or down. */
  setNested(on) { this.gateTarget = on ? 1 : 0; }

  /**
   * Her pushing for dt: steer toward `heading` (world yaw) with `amount`
   * 0..1 of the stick; she (behind the handle) is kept out of walls with
   * it. Returns how hard it hit something (0: clear).
   */
  push(dt, heading, amount) {
    const off = Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw));
    const on = amount > 0.08;
    // Facing well away from where she wants to go: she swings it round first.
    const want = on ? amount * MAX_SPEED * Math.max(0, Math.cos(off)) ** 1.5 : 0;
    const wantTurn = on ? clamp(off * 3, -TURN, TURN) * Math.min(1, amount * 1.6) : 0;
    this.speed += clamp(want - this.speed, -BRAKE * dt, ACCEL * dt);
    this.turn += clamp(wantTurn - this.turn, -TURN_ACCEL * dt, TURN_ACCEL * dt);
    if (Math.abs(this.speed) < 1e-4 && Math.abs(this.turn) < 1e-4) { this.speed = this.turn = 0; return 0; }
    // Turn about the back axle, then roll along the new heading.
    const yaw = this.yaw + this.turn * dt;
    const ax = this.x + Math.sin(this.yaw) * CART.axle, az = this.z + Math.cos(this.yaw) * CART.axle;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let x = ax - fx * CART.axle + fx * this.speed * dt, z = az - fz * CART.axle + fz * this.speed * dt;
    const pushOut = this._overlap(x, z, yaw);
    if (pushOut === 0) { this.moveTo(x, z, yaw); return 0; }
    // Against something: slide along it if that is clear, else stay put.
    x += _probe.x; z += _probe.z;
    const hit = Math.abs(this.speed) + Math.abs(this.turn) * 0.4;
    if (this._overlap(x, z, yaw) === 0) {
      this.speed *= 0.6;
      this.moveTo(x, z, yaw);
    } else {
      this.speed = 0; this.turn = 0;
    }
    return hit;
  }

  /**
   * How far the cart (three circles along it) and its pusher overlap the
   * world at a pose: 0 when clear; otherwise the summed push-out is left in
   * _probe.
   */
  _overlap(x, z, yaw) {
    const col = this.fleet.collision, s = Math.sin(yaw), c = Math.cos(yaw);
    col.ignore = this.collider;
    _push.x = _push.z = 0;
    for (const b of BODY) {
      const cx = x + s * b[0], cz = z + c * b[0];
      _probe.x = cx; _probe.z = cz;
      if (col.resolveCircle(_probe, b[1], b[2], b[3], 0.16)) { _push.x += _probe.x - cx; _push.z += _probe.z - cz; }
    }
    col.ignore = null;
    _probe.x = _push.x; _probe.z = _push.z;
    const d = Math.hypot(_push.x, _push.z);
    return d < 1e-4 ? 0 : d;
  }

  // ------------------------------------------------------------ contents
  /**
   * Pack an entry into the basket: the lowest spot its footprint fits
   * (turned square on if that is lower), front first. Returns false when full.
   */
  stow(e) {
    const best = this._spotFor(e.size), B = CART.basket, cols = this.cols, H = this.heights;
    if (!best) return false;
    for (let r = best.r0; r < best.r0 + best.nr; r++) for (let c = best.c0; c < best.c0 + best.nc; c++) H[r * cols + c] = best.base + e.size.h;
    e.slot = {
      x: B.x0 + (best.c0 + best.nc / 2) * 0.02, y: B.y + best.base, z: B.z0 + (best.r0 + best.nr / 2) * 0.02,
      // Print facing the pusher, or turned a quarter; a little askew, as things land.
      yaw: (best.turned ? Math.PI / 2 : Math.PI) + Math.sin(this.contents.length * 2.7) * 0.12,
      c0: best.c0, r0: best.r0, nc: best.nc, nr: best.nr,
    };
    e.cur = { x: e.slot.x, y: e.slot.y, z: e.slot.z, yaw: e.slot.yaw };
    e.vy = 0;
    this.contents.push(e);
    this.version++;
    this.moved = true;
    return true;
  }

  /** Is there room in the basket for something this size? */
  fits(size) { return !!this._spotFor(size); }

  /** The lowest spot a footprint fits (turned square on if that is lower), front first; null: full. */
  _spotFor(size) {
    const cols = this.cols, rows = this.rows, H = this.heights;
    let best = null;
    for (const turned of [false, true]) {
      const w = turned ? size.d : size.w, d = turned ? size.w : size.d;
      const nc = Math.min(cols, Math.ceil(w / 0.02)), nr = Math.min(rows, Math.ceil(d / 0.02));
      for (let r0 = rows - nr; r0 >= 0; r0--) {
        for (let c0 = 0; c0 + nc <= cols; c0++) {
          let base = 0;
          for (let r = r0; r < r0 + nr; r++) for (let c = c0; c < c0 + nc; c++) base = Math.max(base, H[r * cols + c]);
          if (!best || base < best.base - 0.005) best = { base, c0, r0, nc, nr, turned };
        }
      }
    }
    return best && best.base + size.h <= 0.75 ? best : null;
  }

  /**
   * Take an entry out: what lay on it drops onto whatever is under it now
   * (bottom up, each where it lies).
   */
  unstow(e) {
    const i = this.contents.indexOf(e);
    if (i < 0) return;
    this.contents.splice(i, 1);
    this.version++;
    const H = this.heights, cols = this.cols, B = CART.basket;
    H.fill(0);
    const rest = this.contents.slice().sort((a, b) => a.slot.y - b.slot.y);
    for (const o of rest) {
      const s = o.slot;
      let base = 0;
      for (let r = s.r0; r < s.r0 + s.nr; r++) for (let c = s.c0; c < s.c0 + s.nc; c++) base = Math.max(base, H[r * cols + c]);
      for (let r = s.r0; r < s.r0 + s.nr; r++) for (let c = s.c0; c < s.c0 + s.nc; c++) H[r * cols + c] = base + o.size.h;
      s.y = B.y + base;
    }
  }

  /**
   * A hand lets go of a stowed entry at world (x, y, z) turned yaw: it stays
   * where the hand put it (its place in the basket is there now) and drops
   * the last bit onto what is under it.
   */
  release(e, x, y, z, yaw) {
    this.toLocal(x, y, z, _local);
    const s = e.slot;
    s.x = _local.x; s.z = _local.z; s.yaw = yaw - this.yaw;
    const c = e.cur;
    c.x = s.x; c.y = Math.max(y, s.y); c.z = s.z; c.yaw = s.yaw;
    e.vy = 0;
    e.flying = false;
    this.moved = true;
  }

  /** Cart-space pose an entry will have once stowed (before it is), for aiming a hand at it. */
  slotWorld(e, out) { return this.toWorld(e.slot.x, e.slot.y, e.slot.z, out); }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const gate = this.gateK !== this.gateTarget;
    if (gate) this.gateK += clamp(this.gateTarget - this.gateK, -dt * 2.5, dt * 2.5);
    let settling = false;
    for (const e of this.contents) {
      const c = e.cur, s = e.slot;
      if (e.flying || c.y <= s.y) continue;
      // Falling into its place: gravity (as anything let go of).
      e.vy += 9.8 * dt;
      c.y = Math.max(s.y, c.y - e.vy * dt);
      if (c.y === s.y) e.vy = 0;
      settling = true;
    }
    if (!this.moved && !gate && !settling && !this.dirty) return;
    if (this.moved) this._castors();
    const col = this.collider;
    col.x = this.x; col.z = this.z; col.yaw = this.yaw;
    if (this.moved || settling) {
      for (const e of this.contents) {
        if (e.flying) continue;   // still on its way in (placed by whoever carries it)
        this.toWorld(e.cur.x, e.cur.y, e.cur.z, _v);
        e.put(_v.x, _v.y, _v.z, this.yaw + e.cur.yaw);
      }
    }
    this._write();
    this.moved = false;
    this.dirty = false;
    this.fleet.dirty = true;
  }

  /** Swivels re-aim at their trailing contacts; wheels roll by how far those went. */
  _castors() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    for (const w of this.castors) {
      const sx = this.x + c * w.lx + s * w.lz, sz = this.z - s * w.lx + c * w.lz;
      const dx = sx - w.cx, dz = sz - w.cz, d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      const hx = dx / d, hz = dz / d;
      const nx = sx - hx * TRAIL, nz = sz - hz * TRAIL;
      w.spin += ((nx - w.cx) * hx + (nz - w.cz) * hz) / WHEEL_R;
      w.cx = nx; w.cz = nz;
      w.heading = Math.atan2(hx, hz);
    }
  }

  /** Instance matrices: body and gate, then a fork and a wheel per castor. */
  _write() {
    const P = this.fleet.parts;
    Quaternion.RotationYawPitchRollToRef(this.yaw, 0, 0, _q);
    Matrix.ComposeToRef(_one, _q, _v.set(this.x, 0, this.z), _m);
    _m.copyToArray(P.body.matrices, this.index * 16);
    // Gate: hinged at the top of the basket's back.
    Matrix.RotationXToRef(GATE.nested * this.gateK, _m2);
    _m2.setTranslationFromFloats(0, GATE.y, GATE.z);
    _m2.multiplyToRef(_m, _m3);
    _m3.copyToArray(P.gate.matrices, this.index * 16);
    for (let i = 0; i < 4; i++) {
      const w = this.castors[i], slot = (this.index * 4 + i) * 16;
      // Fork: at its mount, turned to its heading (world yaw).
      Quaternion.RotationYawPitchRollToRef(w.heading, 0, 0, _q);
      this.toWorld(w.lx, MOUNT_Y, w.lz, _v);
      Matrix.ComposeToRef(_one, _q, _v, _m2);
      _m2.copyToArray(P.fork.matrices, slot);
      // Wheel: on the fork's axle, rolling.
      Matrix.RotationXToRef(w.spin, _m3);
      _m3.setTranslationFromFloats(0, WHEEL_R - MOUNT_Y, -TRAIL);
      _m3.multiplyToRef(_m2, _m);
      _m.copyToArray(P.wheel.matrices, slot);
    }
  }

  dispose() { this.fleet.remove(this); }
}

// ---------------------------------------------------------------- geometry
/** An open-ended bar from a to b ([x, y, z]): wires never show their ends. */
function bar(b, mat, color, a, c, r, n) {
  const d = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const len = d.length();
  const q = Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, d.normalize(), new Quaternion());
  const m = Matrix.Compose(_one, q, new Vector3((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2));
  b.shape(mat, color, VertexData.CreateCylinder({ height: len, diameter: r * 2, tessellation: n, cap: Mesh.NO_CAP }), m);
}
const RED = lin('#c8242e'), GREY = lin('#3a3c40'), STEEL = lin('#dfe3e8'), TYRE = lin('#2a2b2e'), HUB = lin('#c9ccd1');
// The basket: top rim and floor outline at a share s (0 back .. 1 front) of its length.
const top = (s) => ({ z: lerp(-0.38, 0.43, s), hw: lerp(0.27, 0.235, s), y: 0.97 });
const bot = (s) => ({ z: lerp(-0.33, 0.36, s), hw: lerp(0.21, 0.18, s), y: lerp(0.52, 0.55, s) });
const at = (s, t, side) => {
  const a = bot(s), b = top(s);
  return [side * lerp(a.hw, b.hw, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t)];
};

function buildBody(b, chrome, plastic) {
  const wire = (p, q) => bar(b, chrome, STEEL, p, q, WIRE, 4);
  const rim = (p, q) => bar(b, chrome, STEEL, p, q, RIM, 6);
  const tube = (p, q) => bar(b, chrome, STEEL, p, q, TUBE, 6);
  for (const side of [1, -1]) {
    // Side panels: uprights every ~5 cm, two rails along.
    for (let i = 0; i <= 15; i++) wire(at(i / 15, 0, side), at(i / 15, 1, side));
    for (const t of [0.34, 0.68]) wire(at(0, t, side), at(1, t, side));
    rim(at(0, 1, side), at(1, 1, side));
    rim(at(0, 0, side), at(1, 0, side));
  }
  // Front panel, slanted like the nose of a nesting cart.
  for (let i = 0; i <= 8; i++) { const u = i / 8 * 2 - 1; wire([u * bot(1).hw, bot(1).y, bot(1).z], [u * top(1).hw, top(1).y, top(1).z]); }
  for (const t of [0.34, 0.68]) wire(at(1, t, -1), at(1, t, 1));
  rim(at(1, 1, -1), at(1, 1, 1));
  rim(at(0, 1, -1), at(0, 1, 1));
  // Wire floor.
  for (let i = 0; i <= 7; i++) { const u = i / 7 * 2 - 1; wire([u * bot(0).hw, bot(0).y, bot(0).z], [u * bot(1).hw, bot(1).y, bot(1).z]); }
  for (let i = 1; i < 10; i++) wire(at(i / 10, 0, -1), at(i / 10, 0, 1));
  // Chassis: handle posts from the back castors, base rails, basket struts.
  for (const side of [1, -1]) {
    tube([side * 0.22, MOUNT_Y, -0.3], [side * 0.255, 0.99, -0.47]);
    tube([side * 0.22, MOUNT_Y, -0.3], [side * 0.17, MOUNT_Y, 0.33]);
    tube([side * 0.17, MOUNT_Y + 0.01, 0.31], [side * 0.17, 0.55, 0.35]);
    tube([side * 0.205, MOUNT_Y, -0.02], [side * 0.2, 0.535, -0.02]);
    tube([side * 0.235, 0.6, -0.36], [side * 0.27, 0.95, -0.38]);   // posts to the rim
  }
  tube([-0.22, MOUNT_Y, -0.3], [0.22, MOUNT_Y, -0.3]);
  tube([-0.17, MOUNT_Y, 0.33], [0.17, MOUNT_Y, 0.33]);
  // Lower tray.
  for (let i = 0; i <= 5; i++) { const x = -0.16 + i * 0.064; wire([x, 0.2, -0.24], [x, 0.2, 0.27]); }
  for (const z of [-0.24, 0.015, 0.27]) rim([-0.17, 0.2, z], [0.17, 0.2, z]);
  for (const side of [1, -1]) { wire([side * 0.17, 0.2, -0.24], [side * 0.21, MOUNT_Y, -0.24]); wire([side * 0.17, 0.2, 0.27], [side * 0.17, MOUNT_Y, 0.27]); }
  // Handle: the red grip bar, end caps, the corner bumpers and castor plates.
  bar(b, plastic, RED, [-0.265, 0.995, -0.47], [0.265, 0.995, -0.47], 0.017, 10);
  for (const side of [1, -1]) {
    b.sphere(plastic, RED, side * 0.268, 0.995, -0.47, 0.02, 1, 5);
    b.cube(plastic, RED, side * 0.2, 0.555, 0.37, 0.05, 0.05, 0.035);
  }
  b.cube(plastic, RED, 0, 0.97, 0.44, 0.2, 0.03, 0.02);    // front rim guard
  for (const [x, z] of CASTORS) b.cube(plastic, GREY, x, MOUNT_Y + 0.008, z, 0.06, 0.012, 0.06);
}

function buildGate(b, chrome, plastic) {
  // Hinged at its top (origin); hangs to the back of the basket floor.
  const low = [0, bot(0).y - GATE.y, bot(0).z - GATE.z];
  const hwT = top(0).hw - 0.012, hwB = bot(0).hw - 0.012;
  for (let i = 0; i <= 9; i++) { const u = i / 9 * 2 - 1; bar(b, chrome, STEEL, [u * hwT, -0.01, 0.005], [u * hwB, low[1], low[2]], WIRE, 4); }
  bar(b, chrome, STEEL, [-hwB, low[1], low[2]], [hwB, low[1], low[2]], RIM, 6);
  for (const side of [1, -1]) bar(b, chrome, STEEL, [side * hwT, -0.01, 0.005], [side * hwB, low[1], low[2]], RIM, 6);
  // Child seat: the plastic backrest with its leg holes.
  b.turned(plastic, RED, 0, -0.13, 0.02, 0.36, 0.17, 0.012, 0, -Math.atan2(low[2], -low[1]));
  b.turned(plastic, GREY, 0, -0.24, 0.032, 0.3, 0.025, 0.012, 0, -Math.atan2(low[2], -low[1]));
}

function buildFork(b, chrome, plastic) {
  b.cube(plastic, GREY, 0, -0.004, 0, 0.045, 0.008, 0.045);
  b.cylinder(chrome, STEEL, 0, -0.022, 0, 0.012, 0.016, 8);
  for (const x of [0.019, -0.019]) bar(b, chrome, STEEL, [x, -0.02, 0], [x, WHEEL_R - MOUNT_Y, -TRAIL], 0.004, 4);
}

function buildWheel(b, chrome, plastic) {
  const axis = Matrix.RotationZ(Math.PI / 2);
  b.shape(plastic, TYRE, VertexData.CreateCylinder({ height: 0.03, diameter: WHEEL_R * 2, tessellation: 10 }), axis);
  b.shape(plastic, HUB, VertexData.CreateCylinder({ height: 0.034, diameter: 0.05, tessellation: 8 }), axis);
}
