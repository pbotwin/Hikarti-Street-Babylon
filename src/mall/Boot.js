import { Vector3 } from '@babylonjs/core';
import { BAG } from './Bags.js';
import { Her, lerpAngle } from './Her.js';
import { ease, lerp } from './Timeline.js';

/**
 * Her car for the trip and its boot: a drivable car (VehicleSystem.add) in
 * her bay with an opening tailgate (CarModel's boot lid). She opens it by
 * the handle and steps back as it rises on its struts, lifts each shopping
 * bag out of her cart and sets it on the boot floor, and pulls the lid down
 * until it drops shut. The bags ride along in the boot; she gets in with the
 * normal vehicle entry and drives off: entering the lot's exit ends the
 * trip. The car stays locked while she pushes a cart or the boot is open.
 */
const OPEN_Z = -2.05;            // car space: where she stands to open / load (behind the bumper)
const BACK_Z = -3.25;            // clear of the lid's swing (closing)
const SLOTS = [[0.34, -1.38], [0, -1.38], [-0.34, -1.38], [0.34, -1.12], [0, -1.12], [-0.34, -1.12]];   // bags on the boot floor
const _a = [0, 0, 0], _w = new Vector3(), _h = new Vector3();
const _p = { x: 0, z: 0 };
const NONE = [];

export class Boot {
  constructor(shop) {
    this.shop = shop;
    this.ctx = shop.ctx;
    this.car = null;
    this.k = 0;              // lid 0 shut .. 1 open
    this.loaded = [];        // bags in the boot: { bag, slot }
    this.finished = false;
    const P = (label, icon, priority, run) => ({ label, icon, priority, distance: 0, run });
    this._prompts = {
      open: P('Open the boot', '🚗', 7, () => this.open()),
      load: P('Load the bags', '🛍', 7, () => this.load()),
      close: P('Close the boot', '🚗', 6, () => this.close()),
    };
  }

  async init() {
    const c = this.ctx.layout.car;
    this.car = await this.ctx.vehicles.add({ type: 'keiCar', model: c.model, x: c.x, z: c.z, yaw: c.yaw, boot: true });
  }

  /** A car-space point in the world (into out). */
  _world(x, y, z, out) {
    _a[0] = x; _a[1] = y; _a[2] = z;
    return this.car.localToWorld(_a, out);
  }

  /** The lid's handle (its lower edge) in the world with the lid at k. */
  _handle(k, out) {
    const b = this.car.boot, a = k * b.open;
    const hx = b.node.position.x, hy = b.node.position.y, hz = b.node.position.z;
    const ry = b.handle[1] - hy, rz = b.handle[2] - hz;
    return this._world(hx, hy + ry * Math.cos(a) - rz * Math.sin(a), hz + ry * Math.sin(a) + rz * Math.cos(a), out);
  }

  _setLid(k) {
    this.k = k;
    this.car.setBoot(k);
  }

  update() {
    const car = this.car, shop = this.shop, v = this.ctx.vehicles;
    if (!car) return;
    car.locked = shop.pushing.active || this.k > 0.01 || shop.busy;
    // The bags ride in the boot.
    for (const { bag, slot } of this.loaded) {
      this._world(slot[0], car.boot.floor.y, slot[1], _w);
      this.shop.bags.put(bag, _w.x, _w.y, _w.z, car.yaw + Math.PI / 2);
    }
    if (!this.finished && v.active === car && v.phase === 'drive') {
      const e = this.ctx.layout.exit;
      if (car.x > e.x0 && car.x < e.x1 && car.z > e.z0 && car.z < e.z1) {
        this.finished = true;
        this.ctx.finish();
      }
    }
  }

  /** How many bags are in her cart. */
  _bagCount() {
    let n = 0;
    for (const e of this.shop.mine?.contents || NONE) if (e.bag) n++;
    return n;
  }

  /** Open / load / close, when she is at the back of her car. */
  prompt() {
    const car = this.car, shop = this.shop;
    if (!car || shop.held) return null;
    this._world(0, 0, OPEN_Z, _w);
    const d = Math.hypot(shop.her.x - _w.x, shop.her.z - _w.z);
    if (d > (this.k > 0.5 ? 2.2 : 1.6)) return null;
    const P = this._prompts;
    if (this.k < 0.5) return shop._show(P.open, d);
    const cart = shop.mine;
    const cartNear = cart && Math.hypot(cart.x - _w.x, cart.z - _w.z) < 4;
    if (cartNear && this._bagCount() && this.loaded.length < SLOTS.length) return shop._show(P.load, d);
    return shop._show(P.close, d);
  }

  /** Walk to car-space (0, z) behind the car, then `then` (frozen, facing the car). */
  _goBehind(z, x, then) {
    const shop = this.shop;
    if (shop.pushing.active) {
      // Let go of the cart first.
      const cart = shop.mine;
      shop.pushing.stop();
      shop.her.freeze(true);
      shop.tl.play([{ d: 0.3, step: (k) => shop._hands(cart, 1 - ease(k)) }], () => {
        this.ctx.animation.act.hands = null;
        shop.her.freeze(false);
        this._goBehind(z, x, then);
      });
      return;
    }
    this._world(x, 0, z, _w);
    shop.walkTo(_w.x, _w.z, () => {
      shop.her.freeze(true);
      const her = shop.her, yaw0 = her.yaw, x0 = her.x, z0 = her.z;
      this._world(x, 0, z, _w);
      const tx = _w.x, tz = _w.z;
      shop.tl.play([{ d: 0.35, step: (k) => her.place(lerp(x0, tx, ease(k)), lerp(z0, tz, ease(k)), lerpAngle(yaw0, this.car.yaw, ease(k))) }], then);
    });
  }

  /** Unlatch by the handle, lift a little, step back as the struts take it up. */
  open() {
    const shop = this.shop, her = shop.her, act = this.ctx.animation.act;
    this._goBehind(OPEN_Z, 0, () => {
      const crouch = Her.crouchFor(this.car.boot.handle[1]) * 0.7;
      let x0 = 0, z0 = 0;
      shop.tl.play([
        { d: 0.4, step: (k) => {
          this._handle(0, _h);
          act.crouch = crouch * ease(k);
          her.reachTo(_h.x, _h.y + 0.02, _h.z, ease(k));
        }, done: () => shop.tones.click() },
        { d: 0.35, step: (k) => {
          this._setLid(0.09 * ease(k));
          this._handle(this.k, _h);
          act.crouch = crouch * (1 - ease(k));
          her.reachTo(_h.x, _h.y + 0.02, _h.z, 1);
        }, done: () => { x0 = her.x; z0 = her.z; this._world(0, 0, BACK_Z + 0.15, _w); } },
        // Struts: slow off the latch, quick through the middle, easing to the stop.
        { d: 1.3, step: (k) => {
          this._setLid(0.09 + 0.91 * ease(Math.min(1, k * 1.05)) + Math.sin(Math.min(1, k * 1.05) * Math.PI) * 0.02);
          this._handle(this.k, _h);
          her.reachTo(_h.x, _h.y + 0.02, _h.z, 1 - ease(k / 0.25));
          const m = ease(k / 0.5);
          her.place(lerp(x0, _w.x, m), lerp(z0, _w.z, m), this.car.yaw);
        }, done: () => { this._setLid(1); shop.tones.lid(); } },
      ], () => this._done());
    });
  }

  /** Every bag from her cart into the boot, one by one. */
  load() {
    const bags = this.shop.mine.contents.filter((e) => e.bag);
    const next = () => {
      const e = bags.shift();
      if (!e || this.loaded.length >= SLOTS.length) { this._done(); return; }
      this._loadOne(e, next);
    };
    next();
  }

  /** One bag: to the cart, take it by the handles, carry it round, lift it in, set it down. */
  _loadOne(e, then) {
    const shop = this.shop, her = shop.her, act = this.ctx.animation.act, cart = shop.mine;
    // Beside the cart where the bag is, on the side nearer the car.
    this._world(0, 0, OPEN_Z, _w);
    const side = (cart.toLocal(_w.x, 0, _w.z, { x: 0, y: 0, z: 0 }).x > 0 ? 1 : -1);
    cart.toWorld(side * 0.62, 0, e.cur.z, _p);
    const go = () => shop.walkTo(_p.x, _p.z, () => {
      her.freeze(true);
      const bag = e.bag, yaw0 = her.yaw;
      const slot = SLOTS[this.loaded.length];
      shop.tl.play([
        { d: 0.5, step: (k) => {
          her.place(her.x, her.z, lerpAngle(yaw0, Math.atan2(bag.x - her.x, bag.z - her.z), ease(k)));
          act.crouch = 0.3 * ease(k);
          her.reachTo(bag.x, bag.y + BAG.handle, bag.z, ease((k - 0.2) / 0.8));
        }, done: () => {
          cart.unstow(e);
          shop.grip({ bag }, bag.x, bag.y, bag.z);
          shop.tones.click();
        } },
        // Lift it out and let it hang at her side.
        { d: 0.45, step: (k) => {
          act.crouch = 0.3 * (1 - ease(k));
          her.reachTo(bag.x, bag.y + BAG.handle + 0.25 * ease(k), bag.z, 1 - ease(k));
          act.bag = ease(k);
        }, done: () => {
          her.freeze(false);
          this._world(slot[0] * 0.6, 0, OPEN_Z, _w);
          shop.walkTo(_w.x, _w.z, () => this._setIn(bag, slot, then));
        } },
      ]);
    });
    if (shop.pushing.active) this._goBehind(OPEN_Z, 0, go); else go();
  }

  /** At the back of the car with a bag: lift it over the sill and set it on the boot floor. */
  _setIn(bag, slot, then) {
    const shop = this.shop, her = shop.her, act = this.ctx.animation.act, car = this.car;
    her.freeze(true);
    const yaw0 = her.yaw;
    let from = null;
    shop.tl.play([
      { d: 0.75, step: (k, dt, first) => {
        if (first) {
          shop.her.palm(_h);
          from = { x: _h.x, y: _h.y, z: _h.z };
        }
        const m = ease(k);
        her.place(her.x, her.z, lerpAngle(yaw0, car.yaw, ease(k * 2)));
        act.bag = 1 - ease(k * 3);
        this._world(slot[0], car.boot.floor.y, slot[1], _w);
        act.crouch = 0.55 * Math.sin(k * Math.PI / 2);
        her.reachTo(lerp(from.x, _w.x, m), lerp(from.y, _w.y + BAG.handle, m) + Math.sin(k * Math.PI) * 0.3, lerp(from.z, _w.z, m), ease(k / 0.3));
      }, done: () => {
        shop.inHand = null;
        act.holdR = 0;
        this.loaded.push({ bag, slot });
        shop.tones.drop();
      } },
      { d: 0.45, step: (k) => {
        act.crouch = 0.55 * (1 - ease(k));
        this._world(slot[0], car.boot.floor.y, slot[1], _w);
        her.reachTo(_w.x, _w.y + BAG.handle + 0.2 * k, _w.z, 1 - ease(k));
      } },
    ], () => { act.reach = null; act.crouch = 0; her.freeze(false); then(); });
  }

  /** Reach up to the open lid's edge, pull it down, let it drop shut. */
  close() {
    const shop = this.shop, her = shop.her, act = this.ctx.animation.act;
    this._goBehind(BACK_Z, 0, () => {
      shop.tl.play([
        { d: 0.45, step: (k) => {
          this._handle(1, _h);
          her.reachTo(_h.x, _h.y - 0.02, _h.z, ease(k));
        } },
        { d: 0.8, step: (k) => {
          this._setLid(1 - 0.55 * ease(k));
          this._handle(this.k, _h);
          her.reachTo(_h.x, _h.y - 0.02, _h.z, 1);
        } },
        // Let go: it falls the rest of the way, faster as it goes.
        { d: 0.32, step: (k) => {
          this._setLid(0.45 * (1 - k * k));
          her.reachTo(her.reach.x, her.reach.y, her.reach.z, 1 - ease(k / 0.6));
        }, done: () => { this._setLid(0); shop.tones.lid(); } },
      ], () => this._done());
    });
  }

  _done() {
    const act = this.ctx.animation.act;
    act.reach = null; act.crouch = 0; act.bag = 0;
    if (!this.shop.inHand) act.holdR = 0;
    this.shop.her.freeze(false);
  }

  dispose() {
    if (this.car) this.ctx.vehicles.remove(this.car);
    this.car = null;
    this.loaded.length = 0;
  }
}
