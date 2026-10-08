import { TransformNode, Vector3 } from '@babylonjs/core';
import { ProductSet, disposeGroceryGoods, groceryLabel } from '../interiors/Products.js';
import { CART, CartFleet } from './Cart.js';
import { ShelfStock, dims } from './ShelfStock.js';
import { Pushing } from './Pushing.js';
import { Bags, carrier } from './Bags.js';
import { Checkouts, totalOf } from './Checkout.js';
import { Boot } from './Boot.js';
import { Her, lerpAngle } from './Her.js';
import { Timeline, clamp, ease, lerp } from './Timeline.js';
import { shopSounds } from './ShopSounds.js';

/**
 * The supermarket trip, start to drive-away (MALL.md "shopping"): her car
 * in its bay (Boot), carts in the corrals, the stocked shelves; she takes a
 * cart and pushes it (Pushing), takes products off the shelves into it (or
 * into her hand without one), puts things back, checks out at a lane
 * (Checkout: belt, cashier, bags, paying), loads the bags into the boot and
 * drives off; leaving through the lot's exit ends the trip.
 *
 * Nothing moves by itself: whatever she handles is in her hand (Her.hold:
 * it follows her palm), resting on something (a shelf, the cart's basket,
 * the belt, a bag), or falling the last bit into its place when let go.
 * She walks up to what she reaches for (stepping, not sliding).
 * Loose packs are pooled thin instances (`goods`), the shelves' packs are
 * ShelfStock's, carts and bags are thin instances too.
 */
const ICON = { cart: '🛒', take: '✋', back: '↩' };
const SHAPES = ['can', 'bottle', 'bigBottle', 'carton', 'tub', 'block', 'bag', 'box', 'jar', 'loaf', 'bun', 'fruit', 'tray', 'roll', 'pack'];
const _eye = new Vector3(), _dir = new Vector3(), _v = new Vector3();
const _spot = { x: 0, z: 0 }, _local = { x: 0, y: 0, z: 0 }, _probe = { x: 0, z: 0 }, _palm = { x: 0, y: 0, z: 0 };
const NONE = [];
// Her body's centre from a shelf's front edge when she reaches into it, and
// her right shoulder from her centre (where her hand reaches from).
const STAND = 0.34, SHOULDER = 0.14;
const RIM = 0.99;   // m: a cart basket's top rim, which what goes in or out is lifted over

export class MallShopping {
  constructor(ctx) {
    this.ctx = ctx;
    this.her = new Her(ctx);
    this.tl = new Timeline();
    this.tones = shopSounds(ctx.audio);
    this.pushing = new Pushing(ctx, this.tones);
    this.mine = null;         // her cart (pushed or parked somewhere)
    this.held = null;         // an item she keeps in her right hand (no cart)
    this.hanging = [];        // more bags hanging from the same hand (the clothing store's), waiting their turn
    this.target = null;       // the shelf pack she is looking at: { f, u }
    this.time = 0;
    this._walk = null;
    this._slot = null;        // the corral slot a prompt is about
    this._handsOn = null;     // the cart her hands went back on at the end of an action
    // One prompt object per action, made once (prompt() runs every frame).
    const P = (label, icon, priority, run) => ({ label, icon, priority, distance: 0, run });
    this._prompts = {
      take: P('', ICON.take, 5, () => this.takeProduct(this.target.f, this.target.u)),
      back: P('', ICON.back, 6, () => this.putBack(this.target)),
      into: P('', ICON.cart, 6, () => this.putInCart()),
      leave: P('Leave the cart', ICON.cart, 1, () => this.leaveCart()),
      ret: P('Return the cart', ICON.cart, 3, () => this.returnCart(this._slot)),
      grab: P('Take the cart', ICON.cart, 4, () => this.takeCart(this.mine, null)),
      bags: P('Put the bags in the cart', '🛍', 6, () => this.bagsIntoCart(this.mine)),
      corral: P('Take a cart', ICON.cart, 4, () => this.takeCart(this._slot.cart, this._slot)),
    };
    this._aimAt = { f: null, u: null };
    this._seen = { cart: null, version: -1, held: null };
  }

  async init() {
    const { scene, layout, graphics } = this.ctx;
    this.root = new TransformNode('mall:shopping', scene);
    // Loose packs (hand, cart, belt, bags): a pool per shape, so nothing is made in play.
    this.goods = new ProductSet(this.root, { grocery: true, dynamic: true });
    for (const shape of SHAPES) this.goods.reserve(shape, 6);
    this.goods.build();
    this.stock = new ShelfStock(scene);
    this.stock.build(layout.grocery);
    this.fleet = CartFleet.for(this.ctx);
    this._corrals();
    this.bags = new Bags(scene, graphics, this.goods);
    this.checkouts = new Checkouts(this);
    // The staffed lanes' cashiers also serve the shoppers (MallShoppers).
    this.ctx.checkouts = this.checkouts;
    this.boot = new Boot(this);
    await Promise.all([this.checkouts.init(), this.boot.init()]);
    this._onPanel = (e) => {
      const b = e.target.closest('[data-out]');
      if (b) this.takeOut(+b.dataset.out);
    };
  }

  /** Controls belong to an action (walking to the cart, taking, paying, loading). */
  get busy() { return this.tl.running || !!this._walk || !!this.pushing.auto; }

  // ------------------------------------------------------------ carts in the corrals
  /** Carts nested in each corral's slots (the layout's count of them). */
  _corrals() {
    this.slots = [];
    for (const c of this.ctx.layout.cartCorrals) {
      c.slots.forEach((s, i) => this.slots.push({ ...s, corral: c, cart: i < c.count ? this.fleet.add(s) : null }));
    }
    this._nest();
  }

  /** The slot right behind (dir -1) / in front of (+1) a slot: nesting runs along the carts' facing. */
  _neighbour(slot, dir) {
    const fx = Math.sin(slot.yaw), fz = Math.cos(slot.yaw);
    for (const o of this.slots) {
      if (o === slot || o.corral !== slot.corral) continue;
      const dx = o.x - slot.x, dz = o.z - slot.z, along = (dx * fx + dz * fz) * dir;
      if (along > 0.15 && along < 0.6 && Math.abs(dx * fz - dz * fx) < 0.2) return o;
    }
    return null;
  }

  /**
   * How far a cart in `slot` is pulled back to be clear of its corral: to
   * the open end's slot and a cart length beyond. (A fixed 55 cm left a cart
   * taken from the back of a near-empty corral inside its rails: carts don't
   * reverse, so she was stuck with it.)
   */
  _mouth(slot) {
    let end = slot;
    for (let o = this._neighbour(end, -1); o; o = this._neighbour(end, -1)) end = o;
    return Math.hypot(end.x - slot.x, end.z - slot.z) + CART.half.z * 2;
  }

  /** A cart lifts the back gate of the one it is nested into. */
  _nest() {
    for (const s of this.slots) if (s.cart) s.cart.setNested(!!this._neighbour(s, -1)?.cart);
  }

  /**
   * The cart at the open end of a nest nearest her (or, `ret`, the free slot
   * to return hers to): kept in _slot; returns how far she is from it (Infinity: none).
   */
  _corralTarget(ret) {
    let best = null, bd = 3.2;
    for (const s of this.slots) {
      if (ret ? s.cart : !s.cart) continue;
      if (!ret && this._neighbour(s, -1)?.cart) continue;          // nested in: not the end one
      if (ret) {
        // Behind the last cart of the nest (or the front slot of an empty corral).
        const ahead = this._neighbour(s, 1);
        const empty = !this.slots.some((o) => o.corral === s.corral && o.cart);
        if (empty ? !!ahead : !ahead?.cart) continue;
      }
      const d = Math.hypot(s.x - Math.sin(s.yaw) * CART.behind - this.her.x, s.z - Math.cos(s.yaw) * CART.behind - this.her.z);
      if (d < bd) { bd = d; best = s; }
    }
    this._slot = best;
    return best ? bd : Infinity;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    // The loose-pack pool was drawn whole for the warm-up; now only what's in use.
    if (this.time === 0) this.goods.trim();
    this.time += dt;
    this.tl.update(dt);
    this.checkouts.update(dt);
    this.boot.update(dt);
    this.fleet.update(dt);
    this._carryInHand();
    this.goods.flush();
    this.bags.update();
    this.stock.update(dt, this.ctx.camera.position);
    this._aim();
    this._panel();
  }

  /** What her hand holds follows her palm; bags waiting their turn hang beside it. */
  _carryInHand() {
    const her = this.her;
    her.carry();
    if (!this.hanging.length) return;
    const yaw = her.yaw;
    her.palm(_v);
    for (let i = 0; i < this.hanging.length; i++) {
      const e = this.hanging[i], o = (i + 1) * 0.02;
      e.put(_v.x + Math.cos(yaw) * o, _v.y - e.handle + 0.015, _v.z - Math.sin(yaw) * o, yaw + Math.PI / 2);
    }
  }

  // ------------------------------------------------------------ the clothing store's bags
  /** She carries clothes from the store's racks (its own business: hers are busy). */
  get clothes() { return (this.ctx.fashion?.carried?.length || 0) > 0; }

  /** Paid bags in her hand: the clothing store's, or ones handed over to this module. */
  get bagsInHand() { return this.hanging.length > 0 || (!!this.ctx.fashion?.handsFull && !this.clothes); }

  /**
   * The next bag from her hand to put somewhere: the clothing store's bags
   * are taken over (as carriers of their meshes, which stay the store's) and
   * the first goes to her palm. null when there are none.
   */
  nextCarried() {
    if (this.ctx.fashion?.handsFull && !this.clothes) {
      for (const b of this.ctx.fashion.takeBags()) this.hanging.push(storeBag(b.mesh));
    }
    const e = this.hanging.shift();
    if (e) this.her.hold(e, e.x, e.y, e.z, e.yaw);
    return e || null;
  }

  /** The bags in her hand, one by one, into her (parked) cart; then `then`. */
  bagsIntoCart(cart, then = null) {
    const her = this.her;
    her.freeze(true);
    const next = () => {
      const e = this.nextCarried();
      if (!e) { this._after(); then?.(); return; }
      this.tl.play(this._intoCart(() => e, cart, false), next);
    };
    next();
  }

  /** The pack she would take (or put back) now, under the camera's aim; and its marker. */
  _aim() {
    const pl = this.ctx.player, t = this._aimAt;
    t.f = t.u = null;
    if (!this.busy && !this.ctx.vehicles.driving && (!pl.ride || this.pushing.active)) {
      const rig = this.ctx.cameraRig, cp = Math.cos(rig.pitch);
      _eye.copyFrom(this.ctx.camera.position);
      _dir.set(Math.sin(rig.yaw) * cp, -Math.sin(rig.pitch), Math.cos(rig.yaw) * cp);
      const id = this.held?.id || null;
      t.f = this.stock.target(_eye, _dir, pl.position.x, pl.position.z, id);
      t.u = t.f && (id ? this.stock.spot(t.f, this.held.from.u) : this.stock.next(t.f, pl.position.x, pl.position.z));
    }
    this.target = t.u ? t : null;
    this.stock.mark(this.target && !this.held ? t.u : null, t.f, this.time);
  }

  // ------------------------------------------------------------ prompt
  prompt() {
    if (this.busy || this.ctx.vehicles.driving || (this.ctx.player.ride && !this.pushing.active) || this.clothes) return null;
    const P = this._prompts;
    const boot = this.boot.prompt();
    if (boot) return boot;
    if (this.bagsInHand && !this.pushing.active) {
      const d = this.mine ? this._cartDistance(this.mine) : Infinity;
      if (d < 1.4) return this._show(P.bags, d);
    }
    if (this.pushing.active) {
      const lane = this.checkouts.prompt();
      if (lane) return lane;
      if (this.target) return this._take();
      const ret = this.mine.contents.length ? Infinity : this._corralTarget(true);
      if (ret < Infinity) return this._show(P.ret, ret);
      return this._show(P.leave, 2);
    }
    if (this.held || this.bagsInHand) {
      if (!this.held) return null;
      if (P.back.item !== this.held) {
        P.back.item = P.into.item = this.held;
        P.back.label = `Put back ${this.held.p.name}`;
        P.into.label = `Put ${this.held.p.name} in the cart`;
      }
      if (this.target) return this._show(P.back, 0.5);
      const d = this.mine ? this._cartDistance(this.mine) : Infinity;
      return d < 1.4 ? this._show(P.into, d) : null;
    }
    // Right at her cart's handle, taking hold of it comes first.
    const near = this.mine ? this._cartDistance(this.mine) : Infinity;
    if (near < 0.8) return this._show(P.grab, near, 6);
    if (this.target) return this._take();
    if (near < 1.3) return this._show(P.grab, near, 4);
    if (!this.mine?.contents.length) {
      const d = this._corralTarget(false);
      if (d < Infinity) return this._show(P.corral, d);
    }
    return null;
  }

  _show(p, distance, priority = p.priority) {
    p.distance = distance;
    p.priority = priority;
    return p;
  }

  _take() {
    const P = this._prompts.take, f = this.target.f;
    if (P.facing !== f) { P.facing = f; P.label = `Take ${f.p.name} · ${f.p.price} ◈`; }
    return this._show(P, 0.6);
  }

  /** How far she is from where she would take hold of a cart. */
  _cartDistance(cart) {
    cart.pusher(_spot);
    return Math.hypot(_spot.x - this.her.x, _spot.z - this.her.z);
  }

  // ------------------------------------------------------------ carts
  /** Walk to a cart's handle and take hold (pulling it out of its nest in a corral). */
  takeCart(cart, slot) {
    cart.pusher(_spot);
    this.walkTo(_spot.x, _spot.z, () => {
      const her = this.her;
      her.freeze(true);
      const yaw0 = her.yaw, x0 = her.x, z0 = her.z;
      const out = slot ? this._mouth(slot) : 0, sx = cart.x, sz = cart.z;
      this.tl.play([
        { d: 0.4, step: (k) => {
          cart.pusher(_spot);
          her.place(lerp(x0, _spot.x, ease(k)), lerp(z0, _spot.z, ease(k)), lerpAngle(yaw0, cart.yaw, ease(k)));
          this._hands(cart, ease(k));
        } },
        // Out of the nest: pulled straight back, past the corral's open end.
        { d: out ? 0.4 + out * 0.45 : 0, step: (k) => {
          const m = ease(k) * out;
          cart.moveTo(sx - Math.sin(cart.yaw) * m, sz - Math.cos(cart.yaw) * m, cart.yaw);
          cart.pusher(_spot);
          her.place(_spot.x, _spot.z, cart.yaw);
          this._hands(cart, 1);
        }, done: () => {
          if (!slot) return;
          slot.cart = null;
          this._nest();
          cart.setNested(false);
          this.tones.rattle(0.6);
        } },
      ], () => {
        this.mine = cart;
        // Bags in her hand go into the basket before she pushes off.
        if (this.bagsInHand) this.bagsIntoCart(cart, () => this.takeCart(cart, null));
        else { her.freeze(false); this.pushing.start(cart); }
      });
    });
  }

  /** Let go of the cart where it stands. */
  leaveCart() {
    const cart = this.mine;
    this.pushing.stop();
    this.her.freeze(true);
    this.tl.play([{ d: 0.3, step: (k) => this._hands(cart, 1 - ease(k)) }], () => {
      this.ctx.animation.act.hands = null;
      this.her.freeze(false);
    });
  }

  /** Push the empty cart into the back of a corral's nest and let go. */
  returnCart(slot) {
    const cart = this.mine;
    this.pushing.drive(slot.x - Math.sin(slot.yaw) * 0.7, slot.z - Math.cos(slot.yaw) * 0.7, () => {
      this.pushing.stop();
      this.her.freeze(true);
      const x0 = cart.x, z0 = cart.z, y0 = cart.yaw;
      this.tl.play([
        { d: 0.8, step: (k) => {
          const m = ease(k);
          cart.moveTo(lerp(x0, slot.x, m), lerp(z0, slot.z, m), lerpAngle(y0, slot.yaw, m));
          cart.pusher(_spot);
          this.her.place(_spot.x, _spot.z, cart.yaw);
          this._hands(cart, 1);
        }, done: () => { slot.cart = cart; this._nest(); this.tones.rattle(0.8); } },
        { d: 0.35, step: (k) => this._hands(cart, 1 - ease(k)) },
      ], () => {
        this.ctx.animation.act.hands = null;
        this.mine = null;
        this.her.freeze(false);
      });
    });
  }

  /** Steps: she lets go of the cart's handle (her hands back to her sides). */
  _handsOff(cart) {
    return [{ d: 0.3, step: (k) => this._hands(cart, 1 - ease(k)) }];
  }

  /** Both hands on a cart's handle with weight w. */
  _hands(cart, w) {
    const h = this.pushing.hands;
    cart.grips(h.l, h.r);
    h.wl = h.wr = w;
    this.ctx.animation.act.hands = w > 0.001 ? h : null;
  }

  /** She walks somewhere by herself (controls off), then `done`. */
  walkTo(x, z, done) {
    this._walk = { x, z };
    this.ctx.player.autoWalk = { x, z, done: () => { this._walk = null; done(); } };
  }

  // ------------------------------------------------------------ her moves
  /** A step walking her to the pose `to()` gives when it starts (Her.goTo). */
  _go(to, each = null) { return this.her.goTo(to, each); }

  /**
   * Her hand brings what she holds to her waist, in front of her right hip,
   * as she moves (eased there from wherever it was: no jump).
   */
  _front(dt) {
    const her = this.her, r = her.reach, s = Math.sin(her.yaw), c = Math.cos(her.yaw);
    if (!her.act.reach) her.reachFromHand();
    const x = r.x, y = r.y, z = r.z, k = 1 - Math.exp(-10 * dt);
    her.palmTo(her.x + s * 0.3 - c * 0.14, 0.92, her.z + c * 0.3 + s * 0.14, 1);
    her.reachTo(lerp(x, r.x, k), lerp(y, r.y, k), lerp(z, r.z, k), 1);
  }

  /** Steps: her hand from the reach down to her side (act.bag), what she holds hanging from it. */
  _toSide() {
    const her = this.her, act = this.ctx.animation.act, r = her.reach;
    let from = null;
    return [{ d: 0.4, step: (k, dt, first) => {
      if (first) from = { x: r.x, y: r.y, z: r.z, crouch: act.crouch };
      her.side(_v);
      const m = ease(k);
      her.reachTo(lerp(from.x, _v.x, m), lerp(from.y, _v.y, m), lerp(from.z, _v.z, m), 1);
      act.crouch = from.crouch * (1 - m);
    }, done: () => { act.bag = 1; act.reach = null; act.crouch = 0; } }];
  }

  /** Steps: her empty hand back from the reach, unbending. */
  _handBack(lift = 0.12) {
    const her = this.her, act = this.ctx.animation.act, r = her.reach;
    let from = null;
    return [{ d: 0.35, step: (k, dt, first) => {
      if (first) from = { x: r.x, y: r.y, z: r.z, crouch: act.crouch };
      const m = ease(k);
      her.reachTo(from.x, from.y + lift * m, from.z, 1 - m);
      act.crouch = from.crouch * (1 - m);
    }, done: () => { act.reach = null; act.crouch = 0; } }];
  }

  /**
   * Steps: her palm (`hand` false) or what she holds (true) from where it is
   * to a world pose (`at()` when the step starts: { x, y, z, yaw?, rx? },
   * yaw turning the held thing in her fingers), arcing over `lift`,
   * crouching (bending in) as far as her palm needs to get there (at least
   * `crouch`); then held
   * there a moment so the hand settles (the arm's solve lags its target by a
   * frame).
   */
  _move(hand, at, crouch, lift, d) {
    const her = this.her, act = this.ctx.animation.act;
    let from = null, to = null, c = 0;
    const put = (x, y, z) => (hand ? her.holdTo(x, y, z, 1) : her.palmTo(x, y, z, 1));
    return [
      { d, step: (k, dt, first) => {
        if (first) {
          if (!act.reach) her.reachFromHand();
          if (hand) { her.carry(); her.heldAt(_v); } else her.palm(_v);
          from = { x: _v.x, y: _v.y, z: _v.z, crouch: act.crouch };
          to = at();
          const p = hand ? her.palmFor(to.x, to.y, to.z, _palm) : to;
          c = Math.max(crouch, her.crouchTo(p.x, p.y, p.z));
        }
        const m = ease(k);
        act.crouch = lerp(from.crouch, c, m);
        if (hand && to.yaw !== undefined) her.turnHeld(to.yaw, to.rx || 0, Math.min(1, dt * 8));
        put(lerp(from.x, to.x, m), lerp(from.y, to.y, m) + Math.sin(m * Math.PI) * lift, lerp(from.z, to.z, m));
      } },
      { d: 0.12, step: () => {
        if (hand && to.yaw !== undefined) her.turnHeld(to.yaw, to.rx || 0, 0.5);
        put(to.x, to.y, to.z);
      } },
    ];
  }

  // ------------------------------------------------------------ where she stands
  /** Where she stands to take pack u of facing f with her right hand ({ x, z, yaw } into out). */
  _shelfStance(f, u, out) {
    const her = this.her, bin = f.kind === 'bin';
    // A bin is reached from whichever side she is on.
    const side = bin && (her.x - f.x) * f.nx + (her.z - f.z) * f.nz < 0 ? -1 : 1;
    const nx = f.nx * side, nz = f.nz * side;
    const along = (u.x - f.x) * f.ax + (u.z - f.z) * f.az;
    const yaw = Math.atan2(-nx, -nz), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const off = (bin ? f.depth / 2 : 0) + STAND;
    out.x = f.x + f.ax * along + nx * off - rx * SHOULDER;
    out.z = f.z + f.az * along + nz * off - rz * SHOULDER;
    out.yaw = yaw;
    return out;
  }

  /** Where her palm takes hold of pack u: on its front (shelves), on top (bins). */
  _gripOn(f, u, out) {
    if (f.kind === 'bin') {
      out.x = u.x; out.y = f.y + f.h + 0.012; out.z = u.z;
      return out;
    }
    const d = dims(f.p);
    out.x = u.x + f.nx * (d.d / 2 + 0.015);
    out.y = u.y + Math.min(d.h * 0.5, 0.12);
    out.z = u.z + f.nz * (d.d / 2 + 0.015);
    return out;
  }

  /**
   * Where she stands at her cart to reach into its basket at cart-space z:
   * beside it (`side` in cart space, or her side first, the other if
   * something is in the way), facing it, the spot just to her right; behind
   * the handle when both sides are blocked. Coming from the other side or
   * the handle, she goes round the handle end (`via`).
   */
  _cartStance(cart, lz, out, side = 0) {
    const her = this.her, col = this.ctx.collision, y = this.ctx.player.position.y;
    cart.toLocal(her.x, 0, her.z, _local);
    const first = _local.x >= 0 ? 1 : -1, z = clamp(lz, -0.22, 0.24);
    if (!side) {
      col.ignore = cart.collider;
      for (const s of [first, -first]) {
        cart.toWorld(s * 0.5, 0, z, _probe);
        if (!col.resolveCircle(_probe, 0.17, y, 1.5, 0.3)) { side = s; break; }
      }
      col.ignore = null;
    }
    if (!side) {
      cart.toWorld(0, 0, -0.72, out);
      out.yaw = cart.yaw;
      return out;
    }
    cart.toWorld(side * 0.5, 0, z, out);
    out.yaw = cart.yaw - side * Math.PI / 2;
    // The spot to her right: she stands a little to its left.
    out.x += Math.cos(out.yaw) * SHOULDER * 0.6;
    out.z -= Math.sin(out.yaw) * SHOULDER * 0.6;
    out.via = this._round(cart, out.x, out.z);
    return out;
  }

  /**
   * The corners she walks round to get from where she is to (x, z) without
   * passing through the cart (null: the way is clear): round its handle end
   * or its nose, whichever is shorter.
   */
  _round(cart, x, z) {
    const a = cart.toLocal(this.her.x, 0, this.her.z, {}), b = cart.toLocal(x, 0, z, {});
    const HX = CART.half.x + 0.2, HZ = CART.half.z + 0.2;
    // Does the straight way cross the cart (with room for her body)? The segment clipped to that box.
    let t0 = 0, t1 = 1;
    for (const [p, q, h] of [[a.x, b.x, HX], [a.z, b.z, HZ]]) {
      const d = q - p;
      if (Math.abs(d) < 1e-6) { if (Math.abs(p) > h) return null; continue; }
      const u = (-h - p) / d, v = (h - p) / d;
      t0 = Math.max(t0, Math.min(u, v)); t1 = Math.min(t1, Math.max(u, v));
      if (t0 > t1) return null;
    }
    const sa = a.x >= 0 ? 1 : -1, sb = b.x >= 0 ? 1 : -1, X = HX + 0.05;
    let best = null, bestLen = Infinity;
    for (const end of [-1, 1]) {
      const Z = end * (HZ + 0.05);
      const via = sa === sb ? [[sa * X, Z]] : [[sa * X, Z], [sb * X, Z]];
      let len = 0, px = a.x, pz = a.z;
      for (const [vx, vz] of via) { len += Math.hypot(vx - px, vz - pz); px = vx; pz = vz; }
      len += Math.hypot(b.x - px, b.z - pz);
      if (len < bestLen) { bestLen = len; best = via; }
    }
    return best.map(([vx, vz]) => cart.toWorld(vx, 0, vz, {}));
  }

  // ------------------------------------------------------------ products
  /** A loose pack of product p where shelf pack u stood (a cart entry: size, put). */
  _item(p, f, u) {
    const unit = this.goods.acquire(p.look.shape, p.look.color, groceryLabel(p.id), p.look.size || 1);
    this.goods.move(unit, u.x, u.y, u.z, u.ry, u.rx);
    const item = { id: p.id, p, size: dims(p), unit, from: { f, u }, flying: false };
    item.put = (x, y, z, yaw, rx = 0) => this.goods.move(unit, x, y, z, yaw, rx);
    return item;
  }

  /**
   * Take a pack off the shelf: she lets go of her cart (if pushing), steps
   * up to the shelf, reaches (crouching for low shelves), her hand closes on
   * the pack and draws it out; then into her cart's basket (and back to the
   * handle), or she keeps it in her hand.
   */
  takeProduct(f, u) {
    const pushing = this.pushing.active;
    // Her cart: the one she pushes, or hers standing within reach.
    const cart = pushing || (this.mine && Math.hypot(this.mine.x - this.her.x, this.mine.z - this.her.z) < 1.5) ? this.mine : null;
    if (cart && !cart.fits(dims(f.p))) { this.ctx.hud.toast('The cart is full', 'Check out what you have'); return; }
    if (pushing) this.pushing.stop();
    const her = this.her, bin = f.kind === 'bin';
    her.freeze(true);
    const grip = this._gripOn(f, u, {});
    let item = null;
    const steps = [
      this._go(() => this._shelfStance(f, u, {}), pushing ? (m) => this._hands(cart, 1 - ease(m * 2.5)) : null),
      ...this._move(false, () => grip, 0, 0.04, 0.5),
      // Her fingers close on it; she draws it out of its row (lifts it off the pile), turning it to her.
      { d: 0, done: () => {
        this.stock.take(f, u);
        item = this._item(f.p, f, u);
        her.hold(item, u.x, u.y, u.z, u.ry, u.rx);
        this.tones.click();
      } },
      ...this._move(true, () => ({ x: u.x + f.nx * (bin ? 0.04 : 0.2), y: u.y + (bin ? 0.16 : 0.05), z: u.z + f.nz * (bin ? 0.04 : 0.2), yaw: her.yaw + Math.PI }), 0, 0, 0.35),
    ];
    if (cart) steps.push(...this._intoCart(() => item, cart, pushing));
    else steps.push(...this._toSide());
    this.tl.play(steps, () => {
      if (!cart) this.held = item;
      this._after();
    });
  }

  /**
   * Steps taking what her hand holds into a cart's basket: she steps beside
   * the basket, lifts it over the side, lowers it into its place and lets go
   * (it drops the last bit); then (`handle`) back to the handle, pushing.
   * `side`: the cart's side she works from (0: whichever is free).
   */
  _intoCart(getThing, cart, handle, side = 0) {
    let e = null;
    const slot = { x: 0, y: 0, z: 0 };
    const place = (above) => () => {
      cart.slotWorld(e, slot);
      return { x: slot.x, y: above ? Math.max(RIM, slot.y) + 0.06 : slot.y + 0.01, z: slot.z, yaw: cart.yaw + e.slot.yaw };
    };
    const steps = [
      this._go(() => {
        e = getThing();
        e.flying = true;
        cart.stow(e);
        return this._cartStance(cart, e.slot.z, {}, side);
      }, (m, dt) => this._front(dt)),
      // Over the basket's rim, turned the way it will lie; down into its place.
      ...this._move(true, place(true), 0.15, 0.08, 0.45),
      ...this._move(true, place(false), 0, 0, 0.4),
      { d: 0, done: () => this._release(cart) },
      ...this._handBack(0.2),
    ];
    if (handle) steps.push(...this._toHandle(cart));
    return steps;
  }

  /** She lets go of what she holds over the cart: it stays where her hand put it, and drops into its place. */
  _release(cart) {
    const her = this.her, e = her.held.thing;
    her.carry();
    const yaw = her.heldAt(_v);
    her.letGo();
    cart.release(e, _v.x, _v.y, _v.z, yaw);
    this.tones.drop();
  }

  /** Steps: back behind the cart's handle (round its corner from beside it), both hands on it (then pushing, see _after). */
  _toHandle(cart) {
    return [this._go(() => {
      cart.pusher(_spot);
      return { x: _spot.x, z: _spot.z, yaw: cart.yaw, via: this._round(cart, _spot.x, _spot.z) };
    }, (m) => this._hands(cart, ease((m - 0.6) / 0.4))), { d: 0, done: () => { this._handsOn = cart; } }];
  }

  /** Back to pushing her cart (if her hands went back on it) or free. */
  _after() {
    const act = this.her.act, cart = this._handsOn;
    this._handsOn = null;
    act.reach = null;
    act.crouch = 0;
    this.her.freeze(false);
    if (cart) this.pushing.start(cart);
  }

  /** The item in her hand into her (parked) cart. */
  putInCart() {
    const cart = this.mine, item = this.held;
    if (!cart.fits(item.size)) { this.ctx.hud.toast('The cart is full', 'Check out what you have'); return; }
    this.held = null;
    this.her.freeze(true);
    this.tl.play(this._intoCart(() => item, cart, false), () => this._after());
  }

  /** The item in her hand back in its place on the shelf: carried in, set down exactly where it stood. */
  putBack({ f, u }) {
    const item = this.held, her = this.her, bin = f.kind === 'bin';
    this.held = null;
    her.freeze(true);
    const out = bin ? 0.04 : 0.2, up = bin ? 0.16 : 0.04;
    this.tl.play([
      this._go(() => this._shelfStance(f, u, {}), (m, dt) => this._front(dt)),
      // In front of its place, turned the way it stood; then into it.
      ...this._move(true, () => ({ x: u.x + f.nx * out, y: u.y + up, z: u.z + f.nz * out, yaw: u.ry, rx: u.rx }), 0, 0.06, 0.5),
      ...this._move(true, () => ({ x: u.x, y: u.y, z: u.z, yaw: u.ry, rx: u.rx }), 0, 0, 0.3),
      { d: 0, done: () => {
        // Set down in its place: the shelf shows it again, the loose pack goes.
        her.letGo();
        this.goods.release(item.unit);
        this.stock.restore(f, u);
        this.tones.drop();
      } },
      ...this._handBack(0.1),
    ], () => this._after());
  }

  /** ✕ in the cart panel: she takes that item out of the cart into her hand (to put it back). */
  takeOut(index) {
    const cart = this.mine, item = this.unpaid[index];
    if (this.held) { this.ctx.hud.toast('Hands full', `Put ${this.held.p.name} back first`); return; }
    if (!item || this.busy || this.ctx.vehicles.driving) return;
    const pushing = this.pushing.active;
    if (pushing) this.pushing.stop();
    const her = this.her;
    her.freeze(true);
    const at = { x: 0, y: 0, z: 0 };
    const top = (above) => () => {
      cart.toWorld(item.cur.x, item.cur.y, item.cur.z, at);
      return { x: at.x, y: above ? Math.max(RIM, at.y + item.size.h) + 0.08 : at.y + item.size.h + 0.012, z: at.z };
    };
    this.tl.play([
      this._go(() => this._cartStance(cart, item.cur.z, {}), pushing ? (m) => this._hands(cart, 1 - ease(m * 2.5)) : null),
      // Over it, down onto its top, and it comes up in her hand.
      ...this._move(false, top(true), 0.15, 0.05, 0.4),
      ...this._move(false, top(false), 0, 0, 0.35),
      { d: 0, done: () => {
        cart.unstow(item);
        her.hold(item, at.x, at.y, at.z, cart.yaw + item.cur.yaw);
        this.tones.click();
      } },
      ...this._move(true, () => ({ x: at.x, y: Math.max(RIM, at.y) + 0.12, z: at.z }), 0, 0.02, 0.4),
      ...this._toSide(),
    ], () => {
      this.held = item;
      this._after();
      this.ctx.hud.toast(item.p.name, 'Put it back on its shelf, or back in the cart');
    });
  }

  /** What's in her cart and not paid for (products, not bags); remade only when the cart's contents change. */
  get unpaid() {
    const c = this.mine;
    if (!c) return NONE;
    if (this._unpaidOf !== c || this._unpaidV !== c.version) {
      this._unpaidOf = c;
      this._unpaidV = c.version;
      this._unpaid = c.contents.filter((e) => e.id);
    }
    return this._unpaid;
  }

  // ------------------------------------------------------------ cart panel
  _panel() {
    const seen = this._seen, held = this.held, cart = this.mine;
    if (seen.cart === cart && seen.version === (cart?.version ?? -1) && seen.held === held) return;
    seen.cart = cart; seen.version = cart?.version ?? -1; seen.held = held;
    const items = this.unpaid, hud = this.ctx.hud;
    if (!items.length && !held) { hud.panel('cart', null); this._panelEl = null; return; }
    const total = totalOf(items);
    const el = hud.panel('cart', `
      <div class="basket-head">${items.length ? `<b>🛒 Cart · ${items.length}</b><span>${total} ◈</span>` : `<b>✋ ${esc(held.p.name)}</b><span>${held.p.price} ◈</span>`}</div>
      <div class="basket-items">${items.map((e, i) => `<div class="basket-item"><span>${ICON.take}</span><b>${esc(e.p.name)}</b><i>${e.p.price} ◈</i><button class="put" data-out="${i}" aria-label="Take out">✕</button></div>`).join('')}</div>
      <small>${held ? `In your hand: ${esc(held.p.name)} · back on its shelf, or in the cart` : 'Pay at a checkout · ✕ takes it out'}</small>`);
    if (el !== this._panelEl) {
      this._panelEl = el;
      el.addEventListener('click', this._onPanel);
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  }

  dispose() {
    const { player, hud } = this.ctx;
    this.tl.clear();
    this.pushing.stop();
    if (this._walk) player.autoWalk = null;
    player.hold = false;
    this.her.rest();
    hud.panel('cart', null);
    this.hanging.length = 0;
    this.ctx.checkouts = null;
    this.boot.dispose();
    this.checkouts.dispose();
    this.bags.dispose();
    this.fleet.dispose();
    this.stock.dispose();
    this.goods.dispose();
    this.root.dispose();
    disposeGroceryGoods();
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/**
 * The clothing store's paper bag as a carrier: its mesh hangs from its
 * handles (origin), the paper's base 0.39 m below them.
 */
function storeBag(mesh) {
  const HANDLE = 0.39;
  const c = carrier({ w: 0.3, d: 0.12, h: 0.34 }, HANDLE, (x, y, z, yaw) => {
    mesh.position.set(x, y + HANDLE, z);
    mesh.rotation.set(0, yaw, 0);
  });
  Object.assign(c, { x: mesh.position.x, y: mesh.position.y - HANDLE, z: mesh.position.z, yaw: mesh.rotation.y });
  return c;
}
