import { TransformNode, Vector3 } from '@babylonjs/core';
import { ProductSet, disposeGroceryGoods, groceryLabel } from '../interiors/Products.js';
import { CART, CartFleet } from './Cart.js';
import { ShelfStock, dims } from './ShelfStock.js';
import { Pushing } from './Pushing.js';
import { Bags, BAG } from './Bags.js';
import { Checkouts, totalOf } from './Checkout.js';
import { Boot } from './Boot.js';
import { Her, lerpAngle } from './Her.js';
import { Timeline, ease, lerp } from './Timeline.js';
import { shopSounds } from './ShopSounds.js';

/**
 * The supermarket trip, start to drive-away (MALL.md "shopping"): her car
 * in its bay (Boot), carts in the corrals, the stocked shelves; she takes a
 * cart and pushes it (Pushing), takes products off the shelves into it (or
 * into her hand without one), puts things back, checks out at a lane
 * (Checkout: belt, cashier, bags, paying), loads the bags into the boot and
 * drives off; leaving through the lot's exit ends the trip.
 *
 * Everything she handles moves smoothly from where it is (shelf, cart,
 * belt, bag) along an arc to her hand and on to where it goes; nothing pops.
 * Loose packs are pooled thin instances (`goods`), the shelves' packs are
 * ShelfStock's, carts and bags are thin instances too.
 */
const ICON = { cart: '🛒', take: '✋', back: '↩' };
const SHAPES = ['can', 'bottle', 'bigBottle', 'carton', 'tub', 'block', 'bag', 'box', 'jar', 'loaf', 'bun', 'fruit', 'tray', 'roll', 'pack'];
const _eye = new Vector3(), _dir = new Vector3(), _v = new Vector3();
const _spot = { x: 0, z: 0 }, _local = { x: 0, y: 0, z: 0 };
const NONE = [];

export class MallShopping {
  constructor(ctx) {
    this.ctx = ctx;
    this.her = new Her(ctx);
    this.tl = new Timeline();
    this.tones = shopSounds(ctx.audio);
    this.pushing = new Pushing(ctx, this.tones);
    this.mine = null;         // her cart (pushed or parked somewhere)
    this.held = null;         // an item in her right hand (no cart)
    this.inHand = null;       // what her palm carries during an action: an item, or { bag }
    this.target = null;       // the shelf pack she is looking at: { f, u }
    this.time = 0;
    this._walk = null;
    this._slot = null;        // the corral slot a prompt is about
    // One prompt object per action, made once (prompt() runs every frame).
    const P = (label, icon, priority, run) => ({ label, icon, priority, distance: 0, run });
    this._prompts = {
      take: P('', ICON.take, 5, () => this.takeProduct(this.target.f, this.target.u)),
      back: P('', ICON.back, 6, () => this.putBack(this.target)),
      into: P('', ICON.cart, 6, () => this.putInCart()),
      leave: P('Leave the cart', ICON.cart, 1, () => this.leaveCart()),
      ret: P('Return the cart', ICON.cart, 3, () => this.returnCart(this._slot)),
      grab: P('Take the cart', ICON.cart, 4, () => this.takeCart(this.mine, null)),
      corral: P('Take a cart', ICON.cart, 4, () => this.takeCart(this._slot.cart, this._slot)),
    };
    this._aimAt = { f: null, u: null };
    this._seen = { cart: null, version: -1, held: null, coins: -1 };
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
    this._carryInHand(dt);
    this.goods.flush();
    this.bags.update();
    this.stock.update(dt, this.ctx.camera.position);
    this._aim();
    this._panel();
  }

  /** What her palm carries follows it (blending in from where it was picked up). */
  _carryInHand(dt) {
    const h = this.inHand;
    if (!h) return;
    this.her.palm(_v);
    _v.y -= h.bag ? BAG.handle - 0.015 : h.size.h / 2;
    if (h.blend < 1) {
      h.blend = Math.min(1, h.blend + dt / 0.14);
      const k = ease(h.blend), f = h.grab;
      _v.set(lerp(f.x, _v.x, k), lerp(f.y, _v.y, k), lerp(f.z, _v.z, k));
    }
    const yaw = this.her.yaw;
    if (h.bag) this.bags.put(h.bag, _v.x, _v.y, _v.z, yaw + Math.PI / 2);
    else this.goods.move(h.unit, _v.x, _v.y, _v.z, yaw);
  }

  /** Her palm takes something (an item, or { bag }) from where it is now (its base). */
  grip(thing, x, y, z) {
    thing.grab = { x, y, z };
    thing.blend = 0;
    this.inHand = thing;
    this.her.act.holdR = 1;
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
    if (this.busy || this.ctx.vehicles.driving || (this.ctx.player.ride && !this.pushing.active)) return null;
    const P = this._prompts;
    const boot = this.boot.prompt();
    if (boot) return boot;
    if (this.pushing.active) {
      const lane = this.checkouts.prompt();
      if (lane) return lane;
      if (this.target) return this._take();
      const ret = this.mine.contents.length ? Infinity : this._corralTarget(true);
      if (ret < Infinity) return this._show(P.ret, ret);
      return this._show(P.leave, 2);
    }
    if (this.held) {
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
      const out = slot ? 0.55 : 0, sx = cart.x, sz = cart.z;
      this.tl.play([
        { d: 0.4, step: (k) => {
          cart.pusher(_spot);
          her.place(lerp(x0, _spot.x, ease(k)), lerp(z0, _spot.z, ease(k)), lerpAngle(yaw0, cart.yaw, ease(k)));
          this._hands(cart, ease(k));
        } },
        // Out of the nest: pulled straight back.
        { d: out ? 0.6 : 0, step: (k) => {
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
        her.freeze(false);
        this.pushing.start(cart);
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

  // ------------------------------------------------------------ products
  /** A loose pack of product p where shelf pack u stood (a cart entry: size, put). */
  _item(p, f, u) {
    const unit = this.goods.acquire(p.look.shape, p.look.color, groceryLabel(p.id), p.look.size || 1);
    this.goods.move(unit, u.x, u.y, u.z, u.ry, u.rx);
    const item = { id: p.id, p, size: dims(p), unit, from: { f, u }, flying: false };
    item.put = (x, y, z, yaw) => this.goods.move(unit, x, y, z, yaw);
    return item;
  }

  /**
   * Take a pack off the shelf: she lets go of her cart (if pushing), turns
   * and leans in (crouching for low shelves), takes it and puts it in the
   * cart's basket, or keeps it in her hand; then back to the handle.
   */
  takeProduct(f, u) {
    const pushing = this.pushing.active;
    // Her cart: the one she pushes, or hers standing within reach.
    const cart = pushing || (this.mine && Math.hypot(this.mine.x - this.her.x, this.mine.z - this.her.z) < 1.5) ? this.mine : null;
    if (pushing) this.pushing.stop();
    const her = this.her, act = this.ctx.animation.act;
    her.freeze(true);
    const x0 = her.x, z0 = her.z, yaw0 = her.yaw;
    const face = Math.atan2(u.x - x0, u.z - z0);
    const h = f.kind === 'bin' ? f.h : dims(f.p).h;
    const crouch = Her.crouchFor(u.y + h), lean = 0.08 + 0.16 * crouch;
    const hy = u.y + Math.min(0.08, h * 0.6);
    let item = null;
    const steps = [
      // Hands off the handle while she turns and leans in.
      { d: 0.45, step: (k) => {
        const m = ease(k);
        if (pushing) this._hands(cart, 1 - ease(k * 2));
        her.place(x0 + Math.sin(face) * lean * m, z0 + Math.cos(face) * lean * m, lerpAngle(yaw0, face, m));
        act.crouch = crouch * m;
        her.reachTo(u.x, hy, u.z, ease((k - 0.25) / 0.75));
      }, done: () => {
        this.stock.take(f, u);
        item = this._item(f.p, f, u);
        this.grip(item, u.x, u.y, u.z);
        this.tones.click();
      } },
    ];
    if (cart) steps.push(...this._intoCart(() => item, cart, { x: x0, z: z0, yaw: yaw0 }, pushing));
    else {
      steps.push({ d: 0.55, step: (k) => {
        const m = ease(k);
        act.crouch = crouch * (1 - m);
        her.place(x0 + Math.sin(face) * lean * (1 - m), z0 + Math.cos(face) * lean * (1 - m), face);
        her.reachTo(lerp(u.x, x0 + Math.sin(face) * 0.3, m), lerp(hy, 1.0, m) + Math.sin(k * Math.PI) * 0.08,
          lerp(u.z, z0 + Math.cos(face) * 0.3, m), 1 - ease((k - 0.55) / 0.45));
      } });
    }
    this.tl.play(steps, () => {
      if (!cart) this.held = item;
      this._after(pushing ? cart : null);
    });
  }

  /**
   * Steps taking what her palm holds into a cart's basket: turn to its slot,
   * over the basket, down, let go (the cart settles it in), and (`handle`)
   * back to the handle at `back` ({ x, z, yaw }).
   */
  _intoCart(getItem, cart, back, handle) {
    const her = this.her, act = this.ctx.animation.act;
    let from = null, slot = null, item = null;
    const toSlot = () => Math.atan2(slot.x - back.x, slot.z - back.z);
    return [
      { d: 0.5, step: (k, dt, first) => {
        if (first) {
          item = getItem();
          from = { x: her.x, z: her.z, yaw: her.yaw, crouch: act.crouch, rx: her.reach.x, ry: her.reach.y, rz: her.reach.z };
          item.flying = true;
          if (!cart.stow(item)) this.ctx.hud.toast('The cart is full', 'Check out what you have');
          slot = cart.slotWorld(item, { x: 0, y: 0, z: 0 });
        }
        const m = ease(k);
        her.place(lerp(from.x, back.x, m), lerp(from.z, back.z, m), lerpAngle(from.yaw, toSlot(), m));
        act.crouch = lerp(from.crouch, 0, m);
        her.reachTo(lerp(from.rx, slot.x, m), lerp(from.ry, slot.y + item.size.h + 0.12, m) + Math.sin(k * Math.PI) * 0.12, lerp(from.rz, slot.z, m), 1);
      } },
      { d: 0.25, step: (k) => {
        act.crouch = Her.crouchFor(slot.y + item.size.h) * 0.5 * ease(k);
        her.reachTo(slot.x, slot.y + item.size.h + 0.12 - 0.1 * ease(k), slot.z, 1);
      }, done: () => this._release(item, cart) },
      { d: 0.45, step: (k) => {
        const m = ease(k);
        act.crouch = Her.crouchFor(slot.y + item.size.h) * 0.5 * (1 - m);
        her.reachTo(slot.x, slot.y + item.size.h + 0.02 + 0.2 * m, slot.z, 1 - m);
        her.place(back.x, back.z, lerpAngle(toSlot(), back.yaw, m));
        if (handle) this._hands(cart, ease((k - 0.4) / 0.6));
      } },
    ];
  }

  /** Let go of an item over the cart: it drops into its slot from where it is. */
  _release(item, cart) {
    this.inHand = null;
    this.her.act.holdR = 0;
    const u = item.unit;
    cart.toLocal(u.x, u.y, u.z, _local);
    item.cur = { x: _local.x, y: _local.y, z: _local.z, yaw: u.ry - cart.yaw };
    item.flying = false;
    cart.moved = true;
    this.tones.drop();
  }

  /** Back to pushing her cart (if she was) or free. */
  _after(cart) {
    const act = this.her.act;
    act.reach = null;
    act.crouch = 0;
    if (!this.held && !this.inHand) act.holdR = 0;
    this.her.freeze(false);
    if (cart) this.pushing.start(cart);
  }

  /** The item in her hand into her (parked) cart. */
  putInCart() {
    const cart = this.mine, item = this.held;
    this.held = null;
    this.her.freeze(true);
    const her = this.her;
    this.tl.play(this._intoCart(() => item, cart, { x: her.x, z: her.z, yaw: her.yaw }, false), () => this._after(null));
  }

  /** The item in her hand back in its place on the shelf. */
  putBack({ f, u }) {
    const item = this.held, her = this.her, act = this.ctx.animation.act;
    this.held = null;
    her.freeze(true);
    const x0 = her.x, z0 = her.z, yaw0 = her.yaw;
    const face = Math.atan2(u.x - x0, u.z - z0);
    const crouch = Her.crouchFor(u.y + item.size.h), lean = 0.08 + 0.16 * crouch;
    const hy = u.y + Math.min(0.08, item.size.h * 0.6);
    this.tl.play([
      { d: 0.6, step: (k) => {
        const m = ease(k);
        her.place(x0 + Math.sin(face) * lean * m, z0 + Math.cos(face) * lean * m, lerpAngle(yaw0, face, m));
        act.crouch = crouch * m;
        her.reachTo(lerp(x0 + Math.sin(face) * 0.3, u.x, m), lerp(1.0, hy, m) + Math.sin(k * Math.PI) * 0.1, lerp(z0 + Math.cos(face) * 0.3, u.z, m), ease(k / 0.4));
      }, done: () => {
        // Set down in its place: the shelf shows it again, the loose pack goes.
        this.inHand = null;
        this.goods.release(item.unit);
        this.stock.restore(f, u);
        act.holdR = 0;
        this.tones.drop();
      } },
      { d: 0.45, step: (k) => {
        const m = ease(k);
        act.crouch = crouch * (1 - m);
        her.place(x0 + Math.sin(face) * lean * (1 - m), z0 + Math.cos(face) * lean * (1 - m), face);
        her.reachTo(u.x, hy + 0.15 * m, u.z, 1 - m);
      } },
    ], () => this._after(null));
    // In her palm until it is set down.
    this.grip(item, item.unit.x, item.unit.y, item.unit.z);
  }

  /** ✕ in the cart panel: she takes that item out of the cart into her hand (to put it back). */
  takeOut(index) {
    const cart = this.mine, item = this.unpaid[index];
    if (this.held) { this.ctx.hud.toast('Hands full', `Put ${this.held.p.name} back first`); return; }
    if (!item || this.busy || this.ctx.vehicles.driving) return;
    const pushing = this.pushing.active;
    if (pushing) this.pushing.stop();
    const her = this.her, act = this.ctx.animation.act;
    her.freeze(true);
    const x0 = her.x, z0 = her.z, yaw0 = her.yaw;
    const pos = cart.toWorld(item.cur.x, item.cur.y, item.cur.z, { x: 0, y: 0, z: 0 });
    const face = Math.atan2(pos.x - x0, pos.z - z0);
    const crouch = Her.crouchFor(pos.y + item.size.h) * 0.6;
    const hy = pos.y + Math.min(0.08, item.size.h * 0.6);
    this.tl.play([
      { d: 0.5, step: (k) => {
        const m = ease(k);
        if (pushing) this._hands(cart, 1 - ease(k * 2));
        her.place(x0, z0, lerpAngle(yaw0, face, m));
        act.crouch = crouch * m;
        her.reachTo(pos.x, hy + 0.1 * (1 - m), pos.z, ease((k - 0.2) / 0.8));
      }, done: () => {
        cart.unstow(item);
        this.grip(item, item.unit.x, item.unit.y, item.unit.z);
        this.tones.click();
      } },
      { d: 0.5, step: (k) => {
        const m = ease(k);
        act.crouch = crouch * (1 - m);
        her.reachTo(lerp(pos.x, x0 + Math.sin(face) * 0.3, m), lerp(hy, 1.0, m) + Math.sin(k * Math.PI) * 0.1, lerp(pos.z, z0 + Math.cos(face) * 0.3, m), 1 - ease((k - 0.5) / 0.5));
      } },
    ], () => {
      this.held = item;
      this._after(null);
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
    const seen = this._seen, held = this.held, coins = this.ctx.wallet.coins, cart = this.mine;
    if (seen.cart === cart && seen.version === (cart?.version ?? -1) && seen.held === held && seen.coins === coins) return;
    seen.cart = cart; seen.version = cart?.version ?? -1; seen.held = held; seen.coins = coins;
    const items = this.unpaid, hud = this.ctx.hud;
    if (!items.length && !held) { hud.panel('cart', null); this._panelEl = null; return; }
    const total = totalOf(items);
    const el = hud.panel('cart', `
      <div class="basket-head"><b>🛒 Cart · ${items.length}</b><span>${total} ◈ · you have ${coins}</span></div>
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
