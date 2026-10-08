import { Vector3 } from '@babylonjs/core';
import { Her } from './Her.js';
import { ease, lerp } from './Timeline.js';

/**
 * Her car for the trip and its boot: a drivable car (VehicleSystem.add) in
 * her bay with an opening tailgate (CarModel's boot lid). She opens it by
 * the handle and steps back as it rises on its struts, lifts each shopping
 * bag out of her cart and sets it on the boot floor, and pulls the lid down
 * until it drops shut. Bags in her hand (the clothing store's) go straight
 * in: her left hand opens the lid then. The bags ride along in the boot;
 * she gets in with the normal vehicle entry and drives off: entering the
 * lot's exit ends the trip. The car stays locked while she pushes a cart or
 * the boot is open (the prompt says so by its doors).
 */
const OPEN_Z = -2.05;            // car space: where she stands to open / load (behind the bumper)
const BACK_Z = -3.25;            // clear of the lid's swing (closing)
const RIM = 0.99;                // a cart basket's top rim, which a bag is lifted over
const SLOTS = [[0.34, -1.38], [0, -1.38], [-0.34, -1.38], [0.34, -1.12], [0, -1.12], [-0.34, -1.12]];   // bags on the boot floor
const _a = [0, 0, 0], _w = new Vector3(), _h = new Vector3(), _c = new Vector3(), _o = new Vector3(), _ax = new Vector3(), _ay = new Vector3(), _az = new Vector3();
const NONE = [];

export class Boot {
  constructor(shop) {
    this.shop = shop;
    this.ctx = shop.ctx;
    this.car = null;
    this.k = 0;              // lid 0 shut .. 1 open
    this.loaded = [];        // bags in the boot: { e, x, y, z, yaw } (car space, where she set them down)
    this.finished = false;
    this._left = { wl: 0, wr: 0, l: [0, 0, 0], r: [0, 0, 0] };   // her left hand on the lid (act.hands) while the right holds bags
    const P = (label, icon, priority, run) => ({ label, icon, priority, distance: 0, run });
    this._prompts = {
      open: P('Open the boot', '🚗', 7, () => this.open()),
      load: P('Load the bags', '🛍', 7, () => this.load()),
      close: P('Close the boot', '🚗', 6, () => this.close()),
      stow: P('Put the bags in the boot', '🛍', 7, () => this.stowCarried()),
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

  /** A world point in car space (the inverse of _world: the same frame, the body's), into out. */
  _toCar(p, out) {
    const o = this._world(0, 0, 0, _o), x = this._world(1, 0, 0, _ax).subtractInPlace(o);
    const y = this._world(0, 1, 0, _ay).subtractInPlace(o), z = this._world(0, 0, 1, _az).subtractInPlace(o);
    const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z;
    return out.set(dx * x.x + dy * x.y + dz * x.z, dx * y.x + dy * y.y + dz * y.z, dx * z.x + dy * z.y + dz * z.z);
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
    for (const b of this.loaded) {
      this._world(b.x, b.y, b.z, _w);
      b.e.put(_w.x, _w.y, _w.z, car.yaw + b.yaw);
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
    for (const e of this.shop.mine?.contents || NONE) if (e.carrier) n++;
    return n;
  }

  /** Open / load / close, when she is at the back of her car; by its doors with the boot open, why it won't start. */
  prompt() {
    const car = this.car, shop = this.shop;
    if (!car || shop.held || shop.clothes) return null;
    this._world(0, 0, OPEN_Z, _w);
    const d = Math.hypot(shop.her.x - _w.x, shop.her.z - _w.z);
    const P = this._prompts, bags = shop.bagsInHand;
    if (d > (this.k > 0.5 ? 2.2 : 1.6)) {
      if (this.k < 0.01) return null;
      const p = this._toCar(this.ctx.player.position, _c);
      return Math.abs(p.x) < car.dims.w / 2 + 1 && Math.abs(p.z) < car.dims.len / 2 + 1
        ? shop.hint('Close the boot first', 'The car won’t start with its boot open', d) : null;
    }
    if (this.k < 0.5) return shop._show(bags ? P.stow : P.open, d);
    if (bags && this.loaded.length < SLOTS.length) return shop._show(P.stow, d);
    const cart = shop.mine;
    const cartNear = cart && Math.hypot(cart.x - _w.x, cart.z - _w.z) < 4;
    if (cartNear && this._bagCount() && this.loaded.length < SLOTS.length) return shop._show(P.load, d);
    return shop._show(P.close, d);
  }

  /** Walk to car-space (0, z) behind the car, then `then` (frozen, facing the car). */
  _goBehind(z, x, then) {
    const shop = this.shop, cart = shop.mine;
    if (shop.pushing.active) {
      // Let go of the cart first.
      shop.pushing.stop();
      shop.her.freeze(true);
      shop.tl.play(shop._handsOff(cart), () => {
        shop.her.freeze(false);
        this._goBehind(z, x, then);
      });
      return;
    }
    // The last steps scripted (round her cart if it stands in the way); a walk there first from afar.
    const near = () => {
      shop.her.freeze(true);
      shop.tl.play([shop._go(() => {
        this._world(x, 0, z, _w);
        return { x: _w.x, z: _w.z, yaw: this.car.yaw, via: cart ? shop._round(cart, _w.x, _w.z) : null };
      })], then);
    };
    this._world(x, 0, z, _w);
    if (Math.hypot(_w.x - shop.her.x, _w.z - shop.her.z) > 2.5) shop.walkTo(_w.x, _w.z, near);
    else near();
  }


  /**
   * Unlatch by the handle, lift a little, step back as the struts take it
   * up; then `then`. With bags in her right hand, her left hand does it.
   */
  open(then = null) {
    const shop = this.shop, her = shop.her, act = this.ctx.animation.act, left = shop.bagsInHand;
    // Her palm on the handle with weight w: the right hand's reach, or the left on its own.
    const palm = (x, y, z, w) => {
      if (!left) { her.palmTo(x, y, z, w); return; }
      const h = this._left;
      h.l[0] = x; h.l[1] = y; h.l[2] = z; h.wl = w;
      act.hands = w > 0.001 ? h : null;
    };
    this._goBehind(OPEN_Z, 0, () => {
      const crouch = Her.crouchFor(this.car.boot.handle[1]) * 0.7;
      let x0 = 0, z0 = 0;
      shop.tl.play([
        { d: 0.3, step: (k) => {
          this._handle(0, _h);
          act.crouch = crouch * ease(k);
          palm(_h.x, _h.y + 0.02, _h.z, ease(k));
        }, done: () => shop.tones.click() },
        { d: 0.3, step: (k) => {
          this._setLid(0.09 * ease(k));
          this._handle(this.k, _h);
          act.crouch = crouch * (1 - ease(k));
          palm(_h.x, _h.y + 0.02, _h.z, 1);
        }, done: () => { x0 = her.x; z0 = her.z; this._world(0, 0, BACK_Z + 0.15, _w); } },
        // Struts: slow off the latch, quick through the middle, easing to the stop.
        { d: 1.1, step: (k) => {
          this._setLid(0.09 + 0.91 * ease(Math.min(1, k * 1.05)) + Math.sin(Math.min(1, k * 1.05) * Math.PI) * 0.02);
          this._handle(this.k, _h);
          palm(_h.x, _h.y + 0.02, _h.z, 1 - ease(k / 0.25));
          const m = ease(k / 0.5);
          her.place(lerp(x0, _w.x, m), lerp(z0, _w.z, m), this.car.yaw);
        }, done: () => { this._setLid(1); shop.tones.lid(); } },
      ], () => { this._done(); then?.(); });
    });
  }

  /** Every bag from her cart into the boot, one by one. */
  load() {
    const bags = this.shop.mine.contents.filter((e) => e.carrier);
    const next = () => {
      const e = bags.shift();
      if (!e || this.loaded.length >= SLOTS.length) { this._done(); return; }
      this._loadOne(e, next);
    };
    next();
  }

  /** One bag: to the cart, take it by the handles, lift it out, carry it round, set it in the boot. */
  _loadOne(e, then) {
    const shop = this.shop, her = shop.her, cart = shop.mine;
    const pushing = shop.pushing.active;
    if (pushing) shop.pushing.stop();
    her.freeze(true);
    shop.tl.play([
      ...(pushing ? shop._handsOff(cart) : []),
      shop._go(() => shop._cartStance(cart, e.cur.z, {})),
      ...shop._move(false, () => ({ x: e.x, y: Math.max(RIM, e.y + e.handle) + 0.06, z: e.z }), 0.1, 0.04, 0.3),
      ...shop._move(false, () => ({ x: e.x, y: e.y + e.handle, z: e.z }), 0, 0, 0.2),
      { d: 0, done: () => {
        cart.unstow(e);
        her.hold(e, e.x, e.y, e.z, e.yaw);
        shop.tones.click();
      } },
      // Lifted out over the side, then hanging at her side as she walks.
      ...shop._move(true, () => ({ x: e.x, y: RIM + 0.04, z: e.z }), 0, 0.03, 0.3),
      ...shop._toSide(),
      // Round the cart to the back of the car.
      shop._go(() => {
        this._world(SLOTS[this.loaded.length][0] * 0.6, 0, OPEN_Z, _w);
        return { x: _w.x, z: _w.z, yaw: this.car.yaw, via: shop._round(cart, _w.x, _w.z) };
      }),
    ], () => this._setIn(SLOTS[this.loaded.length], then));
  }

  /** The bags she carries in her hand (from the clothing store) straight into the boot (opened first). */
  stowCarried() {
    const shop = this.shop;
    const next = () => {
      if (!shop.nextCarried() || this.loaded.length >= SLOTS.length) { this._done(); return; }
      this._setIn(SLOTS[this.loaded.length], next);
    };
    // (Opening it, she steps back from the rising lid: then up to the sill again.)
    const toSill = () => this._goBehind(OPEN_Z, 0, next);
    if (this.k < 0.5) this.open(toSill);
    else toSill();
  }

  /**
   * At the back of the car with a bag in her hand: she faces the boot, lifts
   * it over the sill, lowers it onto the boot floor and lets go; it rides
   * there (in the car's frame) where she set it down.
   */
  _setIn(slot, then) {
    const shop = this.shop, her = shop.her, car = this.car;
    her.freeze(true);
    const at = () => this._world(slot[0], car.boot.floor.y, slot[1], new Vector3());
    shop.tl.play([
      shop._go(() => ({ x: her.x, z: her.z, yaw: car.yaw })),
      ...shop._move(true, () => { const p = at(); p.y += 0.32; return p; }, 0.2, 0.2, 0.4),
      ...shop._move(true, () => at(), 0, 0, 0.25),
      { d: 0, done: () => {
        her.carry();
        const yaw = her.heldAt(_h), e = her.letGo();
        this._toCar(_h, _w);
        this.loaded.push({ e, x: _w.x, y: _w.y, z: _w.z, yaw: yaw - car.yaw });
        shop.tones.drop();
      } },
      ...shop._handBack(0.2),
    ], () => { her.freeze(false); then(); });
  }

  /** Reach up to the open lid's edge, pull it down, let it drop shut. */
  close() {
    const shop = this.shop, her = shop.her;
    this._goBehind(BACK_Z, 0, () => {
      shop.tl.play([
        { d: 0.35, step: (k) => {
          this._handle(1, _h);
          her.palmTo(_h.x, _h.y - 0.02, _h.z, ease(k));
        } },
        { d: 0.6, step: (k) => {
          this._setLid(1 - 0.55 * ease(k));
          this._handle(this.k, _h);
          her.palmTo(_h.x, _h.y - 0.02, _h.z, 1);
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
    if (act.hands === this._left) act.hands = null;
    this.shop.her.freeze(false);
  }

  dispose() {
    if (this.car) this.ctx.vehicles.remove(this.car);
    this.car = null;
    this.loaded.length = 0;
  }
}
