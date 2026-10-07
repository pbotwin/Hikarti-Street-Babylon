import { Quaternion } from '@babylonjs/core';
import { animateResident, createResident, disposeResident, eulerToRef } from '../npcs/NPCModels.js';
import { Her, lerpAngle } from './Her.js';
import { BAG } from './Bags.js';
import { CART } from './Cart.js';
import { Timeline, ease, lerp } from './Timeline.js';

/**
 * The supermarket checkouts (layout.checkouts): a cashier at each staffed
 * lane and the whole checkout with her cart, as at a real till. She pushes
 * the cart up beside the belt, lifts each item out onto it, the belt carries
 * them to the cashier, who scans each one (beep) and packs it into the
 * mall's paper bags; she moves up to the register and pays with the gift
 * card (if the total is more than she has, nothing starts: she takes
 * something out first); then she puts the bags into her cart and goes.
 */
const STAFFED = 3;            // lanes with a cashier (the others are closed)
const BELT_SPEED = 0.3;       // m/s
const GAP = 0.035;            // m between things on the belt
const CASHIERS = [
  { base: 'girl_apron', hair: '#3a2a24', top: '#2f8f5b', bottom: '#2b2b33', height: 1.6, gender: 'f' },
  { base: 'boy_uniform', hair: '#2a2420', top: '#2f8f5b', bottom: '#33363c', height: 1.72, gender: 'm' },
  { base: 'girl_bob', hair: '#1f1b1a', top: '#2f8f5b', bottom: '#2b2b33', height: 1.58, gender: 'f' },
];
const _q = new Quaternion();
const _p = { x: 0, y: 0, z: 0 };

export class Checkouts {
  constructor(shop) {
    this.shop = shop;
    this.ctx = shop.ctx;
    this.time = 0;
    this.lanes = this.ctx.layout.checkouts.map((spot, i) => lane(spot, i));
  }

  async init() {
    const { graphics } = this.ctx;
    await Promise.all(this.lanes.slice(0, STAFFED).map(async (l, i) => {
      const look = CASHIERS[i % CASHIERS.length];
      const r = await createResident(look);
      r.blinkSeed = i * 0.37;
      r.gender = look.gender;
      r.root.position.set(l.spot.cashier.x, 0, l.spot.cashier.z);
      r.root.rotation.y = l.spot.cashier.yaw;
      graphics.addCasters(r.casters);
      l.cashier = r;
    }));
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.time += dt;
    const her = this.shop.her;
    for (const l of this.lanes) {
      l.tl.update(dt);
      this._belt(l, dt);
      const r = l.cashier;
      if (!r) continue;
      // Idle, glancing at her when she is near; scanning arm on top.
      const dx = her.x - r.root.position.x, dz = her.z - r.root.position.z, d = Math.hypot(dx, dz);
      if (d > 30) continue;
      const look = Math.max(-1, Math.min(1, Math.atan2(dx, dz) - r.root.rotation.y));
      r.lookYaw = lerp(r.lookYaw || 0, d < 5 ? look : 0, 1 - Math.exp(-4 * dt));
      animateResident(r, this.time, { look: r.lookYaw, gender: r.gender });
      if (l.arm > 0.001) {
        r.bones.rightUpperArm?.rotationQuaternion.multiplyInPlace(eulerToRef(-0.9 * l.arm, 0, -0.5 * l.arm, 'XYZ', _q));
        r.bones.rightLowerArm?.rotationQuaternion.multiplyInPlace(eulerToRef(0, -0.5 * l.arm, 0, 'XYZ', _q));
      }
      if (l.bow > 0) {
        l.bow = Math.max(0, l.bow - dt);
        const k = Math.sin((1 - l.bow / 1.2) * Math.PI);
        eulerToRef(0.5 * k, 0, 0, 'XYZ', _q);
        r.bones.spine?.rotationQuaternion.multiplyInPlace(_q);
        r.bones.chest?.rotationQuaternion.multiplyInPlace(_q);
      }
    }
  }

  /** Things on the belt ride to its end and queue there; the cashier takes the front one. */
  _belt(l, dt) {
    const B = l.belt, goods = this.shop.goods;
    let limit = B.len - 0.03;
    for (const e of l.riding) {
      e.s = Math.min(e.s + BELT_SPEED * dt, limit - e.len / 2);
      limit = e.s - e.len / 2 - GAP;
      const k = e.s / B.len;
      goods.move(e.item.unit, lerp(B.from[0], B.to[0], k), B.from[1], lerp(B.from[2], B.to[2], k), l.faceYaw);
    }
    const front = l.riding[0];
    if (front && l.cashier && !l.tl.running && front.s >= B.len - 0.03 - front.len / 2 - 0.01) this._scan(l, l.riding.shift());
  }

  /** The cashier takes it off the belt end, over the scanner (beep) and into a bag. */
  _scan(l, e) {
    const { bags, goods, tones } = this.shop;
    const item = e.item, u = item.unit;
    const from = { x: u.x, y: u.y, z: u.z };
    const reg = l.spot.register;
    // Into the open bag if it fits; else a fresh bag beside it.
    let bag = l.bags[l.bags.length - 1];
    let local = bag && bags.pack(bag, item, item.size);
    if (!local) {
      bag = bags.add();
      const k = l.bags.length, b = l.spot.bagging;
      bags.put(bag, b[0] + l.d.x * (k * 0.34 - 0.17), b[1], b[2] + l.d.z * (k * 0.34 - 0.17), l.yaw + Math.PI / 2);
      l.bags.push(bag);
      local = bags.pack(bag, item, item.size);
    }
    item.flying = true;
    const to = bags.toWorld(bag, local.x, local.y, local.z, { x: 0, y: 0, z: 0 });
    l.tl.play([
      { d: 0.4, step: (k) => {
        l.arm = Math.sin(k * Math.PI / 2);
        const m = ease(k);
        goods.move(u, lerp(from.x, reg[0], m), lerp(from.y, reg[1] + 0.05, m) + Math.sin(k * Math.PI) * 0.08, lerp(from.z, reg[2], m), l.faceYaw + m * Math.PI);
      }, done: () => { tones.beep(); l.scanned.push(item); } },
      { d: 0.45, step: (k) => {
        const m = ease(k);
        l.arm = 1 - m * 0.4;
        goods.move(u, lerp(reg[0], to.x, m), lerp(reg[1] + 0.05, to.y, m) + Math.sin(k * Math.PI) * 0.2, lerp(reg[2], to.z, m), l.faceYaw + Math.PI + m * 0.6);
      }, done: () => {
        item.flying = false;
        bags.put(bag, bag.x, bag.y, bag.z, bag.yaw);
        tones.drop();
      } },
      { d: 0.25, step: (k) => { l.arm = 0.6 * (1 - ease(k)); } },
    ]);
  }

  // ------------------------------------------------------------ her checkout
  /** "Check out" when she pushes a cart with unpaid goods up a staffed lane. */
  prompt() {
    const shop = this.shop, items = shop.unpaid;
    if (!items.length) return null;
    for (const l of this.lanes) {
      if (!l.cashier || l.busy) continue;
      const dx = shop.her.x - l.unload.x, dz = shop.her.z - l.unload.z;
      const along = dx * l.d.x + dz * l.d.z, across = Math.abs(dx * l.n.x + dz * l.n.z);
      if (along < -2.2 || along > 0.8 || across > 0.6) continue;
      const p = l.prompt || (l.prompt = { label: '', icon: '💳', priority: 7, distance: 0, run: () => this.run(l), items: null });
      if (p.items !== items) {
        p.items = items;
        p.label = `Check out · ${items.length} item${items.length > 1 ? 's' : ''} · ${totalOf(items)} ◈`;
      }
      return shop._show(p, Math.hypot(dx, dz));
    }
    return null;
  }

  /** The whole checkout at lane l. */
  run(l) {
    const shop = this.shop, { wallet, hud } = this.ctx;
    const items = shop.unpaid, total = totalOf(items);
    if (total > wallet.coins) {
      hud.toast(`${total} ◈ — you have ${wallet.coins}`, 'Take something out of the cart (✕) and put it back');
      return;
    }
    const cart = shop.mine, her = shop.her, act = this.ctx.animation.act;
    l.busy = true;
    // 1. Up beside the belt: her at the unload spot, the cart ahead of her down the lane.
    let arrived = false, from = null;
    const at = (p) => ({ x: p.x + l.d.x * CART.behind, z: p.z + l.d.z * CART.behind });
    const unload = at(l.unload);
    shop.pushing.drive(unload.x, unload.z, () => { arrived = true; });
    const steps = [{ d: 0, until: () => arrived }];
    steps.push({ d: 0.35, step: (k, dt, first) => {
      if (first) { shop.pushing.stop(); her.freeze(true); from = { x: cart.x, z: cart.z, yaw: cart.yaw }; }
      const m = ease(k);
      cart.moveTo(lerp(from.x, unload.x, m), lerp(from.z, unload.z, m), lerpAngle(from.yaw, l.yaw, m));
      cart.pusher(_p);
      her.place(_p.x, _p.z, cart.yaw);
      shop._hands(cart, 1);
    } });
    // 2. Every item onto the belt, the highest in the cart first.
    const order = [...items].sort((a, b) => b.cur.y - a.cur.y);
    order.forEach((item, i) => steps.push(...this._unloadSteps(l, cart, item, i === 0)));
    steps.push({ d: 0.4, step: (k, dt, first) => {
      if (first) from = her.yaw;
      her.reachTo(her.reach.x, her.reach.y, her.reach.z, 1 - ease(k));
      her.place(l.unload.x, l.unload.z, lerpAngle(from, l.yaw, ease(k)));
      shop._hands(cart, ease((k - 0.3) / 0.7));
    }, done: () => { act.reach = null; act.crouch = 0; } });
    // 3. Scanned: up to the register with the cart.
    steps.push({ d: 0, until: () => !l.riding.length && !l.tl.running && l.scanned.length >= order.length });
    steps.push(...this._pushTo(at(l.spot.stop), () => hud.toast(`Total ${total} ◈`, 'Pay with your gift card')));
    // 4. Pay: the card to the reader, a double beep, the till.
    const reg = l.spot.register;
    const reader = { x: reg[0] - l.n.x * 0.3, y: reg[1] + 0.05, z: reg[2] - l.n.z * 0.3 };
    steps.push({ d: 0.55, step: (k) => {
      shop._hands(cart, 1 - ease(k * 2));
      her.place(her.x, her.z, lerpAngle(l.yaw, Math.atan2(reader.x - her.x, reader.z - her.z), ease(k)));
      her.reachTo(reader.x, reader.y, reader.z, ease((k - 0.3) / 0.7));
    }, done: () => {
      shop.tones.card();
      wallet.spend(total);
      for (const e of order) wallet.add(e.id);
    } });
    steps.push({ d: 0.5, step: (k) => her.reachTo(reader.x, reader.y + 0.08 * k, reader.z, 1 - ease(k)), done: () => {
      shop.tones.till();
      l.bow = 1.2;
      hud.toast(`Paid ${total} ◈`, 'Arigatou gozaimashita! Your bags are ready');
    } });
    // 5. On to the packing shelf; the bags into the cart, then on her way.
    const b = l.spot.bagging, tb = (b[0] - l.spot.stop.x) * l.d.x + (b[2] - l.spot.stop.z) * l.d.z;
    steps.push({ d: 0.3, step: (k) => shop._hands(cart, ease(k)) });
    steps.push(...this._pushTo(at({ x: l.spot.stop.x + l.d.x * tb, z: l.spot.stop.z + l.d.z * tb })));
    // The bags were filled while she paid: their steps are made now.
    shop.tl.play(steps, () => {
      const bags = l.bags.flatMap((bag) => this._bagSteps(l, cart, bag));
      bags.push({ d: 0.35, step: (k, dt, first) => {
        if (first) from = her.yaw;
        cart.pusher(_p);
        her.place(_p.x, _p.z, lerpAngle(from, cart.yaw, ease(k)));
        shop._hands(cart, ease(k));
      } });
      shop.tl.play(bags, () => {
        act.reach = null; act.holdR = 0;
        her.freeze(false);
        shop.pushing.start(cart);
        l.bags = [];
        l.scanned = [];
        l.busy = false;
      });
    });
  }

  /** Steps pushing her cart (hands on its handle) until its centre is at p, then holding still. */
  _pushTo(p, then = null) {
    const shop = this.shop, her = shop.her;
    let arrived = false;
    return [
      { d: 0, done: () => {
        then?.();
        her.freeze(false);
        shop.pushing.start(shop.mine);
        shop.pushing.drive(p.x, p.z, () => { arrived = true; });
      } },
      { d: 0, until: () => arrived, done: () => { shop.pushing.stop(); her.freeze(true); } },
    ];
  }

  /** One item: reach into the cart, lift it out, over onto the start of the belt. */
  _unloadSteps(l, cart, item, first) {
    const shop = this.shop, her = shop.her, act = this.ctx.animation.act;
    const B = l.belt;
    let pos = null, drop = null, from = null;
    return [
      { d: first ? 0.55 : 0.45, step: (k, dt, start) => {
        if (start) {
          pos = cart.toWorld(item.cur.x, item.cur.y, item.cur.z, { x: 0, y: 0, z: 0 });
          from = { yaw: her.yaw, x: act.reach ? her.reach.x : her.x, y: act.reach ? her.reach.y : 1.0, z: act.reach ? her.reach.z : her.z, w: act.reach ? her.reach.w : 0 };
        }
        const m = ease(k);
        if (first) shop._hands(cart, 1 - ease(k * 2));
        her.place(l.unload.x, l.unload.z, lerpAngle(from.yaw, Math.atan2(pos.x - her.x, pos.z - her.z), m));
        act.crouch = Her.crouchFor(pos.y + item.size.h) * 0.7 * m;
        her.reachTo(lerp(from.x, pos.x, m), lerp(from.y, pos.y + Math.min(0.08, item.size.h * 0.6), m) + Math.sin(k * Math.PI) * 0.1, lerp(from.z, pos.z, m), Math.max(from.w, ease(k / 0.6)));
      }, done: () => {
        cart.unstow(item, false);
        shop.grip(item, item.unit.x, item.unit.y, item.unit.z);
        shop.tones.click();
      } },
      // Wait for room at the start of the belt, then over onto it.
      { d: 0, until: () => !l.riding.length || l.riding[l.riding.length - 1].s - l.riding[l.riding.length - 1].len / 2 > 0.12 + item.size.w + GAP },
      { d: 0.5, step: (k, dt, start) => {
        if (start) drop = { x: lerp(B.from[0], B.to[0], (0.06 + item.size.w / 2) / B.len), y: B.from[1], z: lerp(B.from[2], B.to[2], (0.06 + item.size.w / 2) / B.len) };
        const m = ease(k);
        act.crouch = Her.crouchFor(pos.y + item.size.h) * 0.7 * (1 - m);
        her.place(l.unload.x, l.unload.z, lerpAngle(Math.atan2(pos.x - her.x, pos.z - her.z), Math.atan2(drop.x - her.x, drop.z - her.z), m));
        her.reachTo(lerp(pos.x, drop.x, m), lerp(pos.y, drop.y, m) + 0.08 + Math.sin(k * Math.PI) * 0.18, lerp(pos.z, drop.z, m), 1);
      }, done: () => {
        shop.inHand = null;
        act.holdR = 0;
        l.riding.push({ item, s: 0.06 + item.size.w / 2, len: item.size.w });
        shop.tones.drop();
      } },
    ];
  }

  /** One bag: she leans to the packing shelf, takes it by its handles and lifts it into the cart ahead. */
  _bagSteps(l, cart, bag) {
    const shop = this.shop, her = shop.her, act = this.ctx.animation.act;
    const e = shop.bags.entry(bag), b = { x: bag.x, y: bag.y, z: bag.z };
    let slot = null, x0 = 0, z0 = 0, yaw0 = 0;
    return [
      { d: 0.55, step: (k, dt, first) => {
        if (first) { x0 = her.x; z0 = her.z; yaw0 = her.yaw; }
        const m = ease(k);
        shop._hands(cart, 1 - ease(k * 2));
        her.place(x0 + l.n.x * 0.18 * m, z0 + l.n.z * 0.18 * m, lerpAngle(yaw0, Math.atan2(b.x - x0, b.z - z0), m));
        her.reachTo(b.x, b.y + BAG.handle, b.z, ease((k - 0.25) / 0.75));
      }, done: () => shop.grip(e, b.x, b.y, b.z) },
      // Lifted round and down into the basket.
      { d: 0.75, step: (k, dt, first) => {
        if (first) {
          e.flying = true;
          cart.stow(e);
          slot = cart.slotWorld(e, { x: 0, y: 0, z: 0 });
        }
        const m = ease(k);
        her.place(lerp(x0 + l.n.x * 0.18, x0 + l.d.x * 0.15, m), lerp(z0 + l.n.z * 0.18, z0 + l.d.z * 0.15, m),
          lerpAngle(Math.atan2(b.x - x0, b.z - z0), Math.atan2(slot.x - x0, slot.z - z0), m));
        act.crouch = 0.35 * Math.sin(k * Math.PI / 2);
        her.reachTo(lerp(b.x, slot.x, m), lerp(b.y, slot.y, m) + BAG.handle + Math.sin(k * Math.PI) * 0.22, lerp(b.z, slot.z, m), 1);
      }, done: () => shop._release(e, cart) },
      { d: 0.4, step: (k) => {
        const m = ease(k);
        act.crouch = 0.35 * (1 - m);
        her.place(lerp(x0 + l.d.x * 0.15, x0, m), lerp(z0 + l.d.z * 0.15, z0, m), her.yaw);
        her.reachTo(slot.x, slot.y + BAG.handle + 0.15 * m, slot.z, 1 - m);
      } },
    ];
  }

  dispose() {
    for (const l of this.lanes) {
      l.tl.clear();
      if (l.cashier) { this.ctx.graphics.removeCasters(l.cashier.casters); disposeResident(l.cashier); }
    }
    this.lanes.length = 0;
  }
}

/** A lane's frame: along it toward the register (d), across toward the counter (n), where she unloads. */
function lane(spot, i) {
  const b = spot.belt;
  let dx = b.to[0] - b.from[0], dz = b.to[2] - b.from[2];
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  // Across: from the lane's line to the belt.
  const ox = b.from[0] - spot.stop.x, oz = b.from[2] - spot.stop.z;
  const side = (ox * dz - oz * dx) > 0 ? 1 : -1;
  const n = { x: dz * side, z: -dx * side };
  // Her unload spot: on the lane's line, level with the start of the belt.
  const t = ox * dx + oz * dz;
  return {
    id: spot.id ?? `lane${i + 1}`, spot, d: { x: dx, z: dz }, n, yaw: Math.atan2(dx, dz),
    faceYaw: Math.atan2(-n.x, -n.z),   // goods on the belt show their print to the lane
    belt: { from: b.from, to: b.to, len },
    unload: { x: spot.stop.x + dx * (t - 0.15), z: spot.stop.z + dz * (t - 0.15) },
    riding: [], scanned: [], bags: [], tl: new Timeline(), cashier: null, arm: 0, bow: 0, busy: false, prompt: null,
  };
}

/** What a list of items costs. */
export function totalOf(items) {
  let t = 0;
  for (const e of items) t += e.p.price;
  return t;
}
