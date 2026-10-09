import { createResident, disposeResident } from '../npcs/NPCModels.js';
import { BAG } from './Bags.js';
import { CART } from './Cart.js';
import { Cashier } from './Cashier.js';
import { lerp } from './Timeline.js';

/**
 * The supermarket checkouts (layout.checkouts): a cashier at each staffed
 * lane and the whole checkout with her cart, as at a real till, every thing
 * moved by a hand or the belt:
 *  - she pushes the cart up beside the belt, steps round to its belt side,
 *    takes each item out of the basket and sets it down on the belt;
 *  - the belt carries it to the cashier, who picks it up, passes it over the
 *    scanner (beep) and packs it into a paper bag she took from under the
 *    counter (stepping along the counter between the scanner and the bags);
 *  - she pushes the cart on to the register and taps the card reader;
 *  - the cashier lifts each bag by its handles across the counter, she takes
 *    it and lowers it into the cart; then she pushes off.
 * If the total is more than she has, nothing starts: she takes something out
 * first. Shoppers already ahead of her in the lane's queue (`queue`, their
 * CheckoutLine) go first; she waits her turn.
 */
export const STAFFED = 3;     // lanes with a cashier, the first ones (the others are closed)
const BELT_SPEED = 0.85;      // m/s (brisker than a real belt: its 2.7 m in ~3 s; at 0.5 the cashier stood waiting)
const GAP = 0.035;            // m between things on the belt
const EDGE = 0.55;            // m from the belt's line to her, standing at the counter (its half width, 0.45 m, and her body)
const LEAN = 0.3;             // her crouch (her back bending in) reaching across the counter
const RIM = 0.99;             // a cart basket's top rim, which what comes out is lifted over
export const CASHIERS = [
  { base: 'girl_apron', hair: '#3a2a24', top: '#2f8f5b', bottom: '#2b2b33', height: 1.6, gender: 'f' },
  { base: 'boy_uniform', hair: '#2a2420', top: '#2f8f5b', bottom: '#33363c', height: 1.72, gender: 'm' },
  { base: 'girl_bob', hair: '#1f1b1a', top: '#2f8f5b', bottom: '#2b2b33', height: 1.58, gender: 'f' },
];
const _p = { x: 0, y: 0, z: 0 };

export class Checkouts {
  constructor(shop) {
    this.shop = shop;
    this.ctx = shop.ctx;
    this.lanes = this.ctx.layout.checkouts.map((spot, i) => lane(spot, i));
  }

  async init() {
    const { graphics, layout } = this.ctx;
    const floor = layout.building?.floorY ?? 0;
    await Promise.all(this.lanes.slice(0, STAFFED).map(async (l, i) => {
      const look = CASHIERS[i % CASHIERS.length];
      const r = await createResident(look);
      r.blinkSeed = i * 0.37;
      graphics.addCasters(r.casters);
      l.cashier = new Cashier(r, l.spot.cashier, floor, look.gender);
    }));
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const her = this.shop.her.player.position, planes = this.ctx.scene.frustumPlanes;
    for (const l of this.lanes) {
      this._belt(l, dt);
      if (!l.cashier) continue;
      if (!l.cashier.busy) this._serve(l);
      l.cashier.update(dt, her, planes);
    }
  }

  /** Things on the belt ride to its end and queue there, each as it was set down. */
  _belt(l, dt) {
    const B = l.belt;
    let limit = B.len - 0.03;
    for (const e of l.riding) {
      e.s = Math.min(e.s + BELT_SPEED * dt, limit - e.len / 2);
      limit = e.s - e.len / 2 - GAP;
      const k = e.s / B.len;
      e.item.put(lerp(B.from[0], B.to[0], k) + l.n.x * e.lat, l.beltY, lerp(B.from[2], B.to[2], k) + l.n.z * e.lat, e.yaw);
    }
  }

  /** A world point of lane l: `along` it from the register stop, `lat` from its line toward the belt (and on), at height y. */
  _point(l, along, lat, y = 0) {
    return { x: l.line.x + l.d.x * along + l.n.x * lat, y, z: l.line.z + l.d.z * along + l.n.z * lat };
  }

  // ------------------------------------------------------------ the cashier
  /**
   * A shopper's good at lane l's belt end, for its cashier (CheckoutLine):
   * she takes it by its top, scans it and puts it down into the shopper's
   * bag behind the counter; then `done` (it is gone).
   */
  server(l) {
    return (g, done) => l.shoppers.push({ g, done, thing: { put: (x, y, z, yaw) => g.set.move(g.unit, x, y, z, yaw) } });
  }

  /**
   * The cashier's next job: a shopper's goods until it is her turn; then a
   * bag ready as soon as she starts unloading, the item at the belt's end (a
   * new bag when it doesn't fit), the bags across the counter once she has
   * paid.
   */
  _serve(l) {
    const front = l.riding[0];
    if (!l.turn && l.shoppers.length) this._scanShopper(l, l.shoppers.shift());
    else if (l.turn && !l.paid && !l.bags.length) this._fetchBag(l);
    else if (front && front.s >= l.belt.len - 0.03 - front.len / 2 - 0.01) {
      const bag = l.bags[l.bags.length - 1];
      if (bag && this.shop.bags.fits(bag, front.item.size)) this._scan(l, l.riding.shift(), bag);
      else this._fetchBag(l);
    } else if (l.paid && l.bags.length && !l.offered) this._offer(l);
  }

  /**
   * Where the cashier stands behind the counter to work at `along` with her
   * right hand (she faces the lane, her right toward the belt's start),
   * `back` from the belt's line: against the counter's edge (0.45 m), as
   * residents' arms reach ~0.45 m.
   */
  _stand(l, along, back = 0.5) {
    const p = this._point(l, along + 0.15, l.L + back);
    return { x: p.x, z: p.z, yaw: Math.atan2(-l.n.x, -l.n.z) };
  }

  /** A fresh paper bag from the shelf under the counter (her side of it), stood open on the counter. */
  _fetchBag(l) {
    const { bags, tones } = this.shop, c = l.cashier, hand = c.hand;
    const bag = bags.add(), e = bags.entry(bag);
    // Bags stand in a row along the counter past the register.
    bag.at = l.bagAt + l.bags.length * (BAG.w + 0.04);
    l.bags.push(bag);
    const under = this._point(l, bag.at, l.L + 0.5, l.top - 0.42), spot = this._point(l, bag.at, l.L + 0.1, l.top);
    bags.put(bag, under.x, under.y, under.z, l.yaw + Math.PI / 2);
    c.tl.play([
      c.go(() => this._stand(l, bag.at)),
      ...c.move(false, () => ({ x: under.x, y: under.y + BAG.handle, z: under.z }), { lean: 0.45, lift: 0 }),
      { d: 0, done: () => hand.hold(e, bag.x, bag.y, bag.z, bag.yaw) },
      ...c.move(true, () => spot, { lift: 0.1, lean: 0.2, d: 0.35 }),
      { d: 0, done: () => { hand.letGo(); tones.drop(); } },
      c.rest(0.15),
    ]);
  }

  /** Off the belt's end by its top, over the scanner (beep), along the counter and down into the bag. */
  _scan(l, e, bag) {
    const { bags, tones } = this.shop, c = l.cashier, hand = c.hand, item = e.item, u = item.unit;
    const scan = this._point(l, l.scanAt, l.L, l.top + 0.04);
    let local = null;
    c.tl.play([
      c.go(() => this._stand(l, l.belt.end)),
      ...c.move(false, () => ({ x: u.x, y: u.y + item.size.h + 0.01, z: u.z }), { lean: 0.45, d: 0.25 }),
      { d: 0, done: () => {
        hand.hold(item, u.x, u.y, u.z, u.ry);
        local = bags.pack(bag, item, item.size);
        item.flying = true;
      } },
      ...c.move(true, () => scan, { lift: 0.08, lean: 0.35, d: 0.25 }),
      { d: 0.1, done: () => { tones.beep(); l.scanned.push(item); } },
      c.go(() => this._stand(l, bag.at)),
      ...c.move(true, () => ({ ...bags.toWorld(bag, local.x, local.y + 0.14, local.z, _p) }), { lift: 0.06, lean: 0.35, d: 0.25 }),
      ...c.move(true, () => ({ ...bags.toWorld(bag, local.x, local.y, local.z, _p) }), { lift: 0, lean: 0.4, d: 0.2 }),
      { d: 0, done: () => {
        hand.letGo();
        item.flying = false;
        bags.put(bag, bag.x, bag.y, bag.z, bag.yaw);
        tones.drop();
      } },
      c.rest(0.15),
    ]);
  }

  /** A shopper's good off the belt's end, over the scanner (beep) and down behind the counter. */
  _scanShopper(l, w) {
    const c = l.cashier, hand = c.hand, u = w.g.unit, h = w.g.entry.size.h;
    const scan = this._point(l, l.scanAt, l.L, l.top + 0.04), down = this._point(l, l.bagAt, l.L + 0.45, l.top - 0.3);
    c.tl.play([
      c.go(() => this._stand(l, l.belt.end)),
      ...c.move(false, () => ({ x: u.x, y: u.y + h + 0.01, z: u.z }), { lean: 0.45, d: 0.3 }),
      { d: 0, done: () => hand.hold(w.thing, u.x, u.y, u.z, u.ry) },
      ...c.move(true, () => scan, { lift: 0.08, lean: 0.35, d: 0.3 }),
      { d: 0.1, done: () => this.shop.tones.beep() },
      c.go(() => this._stand(l, l.bagAt)),
      ...c.move(true, () => down, { lift: 0.05, lean: 0.3, d: 0.3 }),
      { d: 0, done: () => { hand.letGo(); w.done(); } },
      c.rest(0.25),
    ]);
  }

  /** The next bag lifted by its handles and held out across the counter, until she takes it. */
  _offer(l) {
    const { bags } = this.shop, c = l.cashier, hand = c.hand;
    const bag = l.bags[0], e = bags.entry(bag);
    l.offered = e;
    c.tl.play([
      c.go(() => this._stand(l, bag.at)),
      ...c.move(false, () => ({ x: bag.x, y: bag.y + BAG.handle, z: bag.z }), { lean: 0.2, d: 0.25 }),
      { d: 0, done: () => hand.hold(e, bag.x, bag.y, bag.z, bag.yaw) },
      c.go(() => this._stand(l, l.handover, 0.47)),
      ...c.move(true, () => this._point(l, l.handover, l.L - 0.05, l.top + 0.06), { lift: 0.12, lean: 0.45, d: 0.3 }),
      { d: 0, done: () => { l.held = e; } },
      { d: 0, until: () => !hand.held },
      c.rest(0.25),
      { d: 0, done: () => { l.bags.shift(); l.offered = null; } },
    ]);
  }

  // ------------------------------------------------------------ her checkout
  /**
   * "Check out" when she pushes a cart with unpaid goods up a staffed lane:
   * from a few metres before the belt to well along it (her cart is pushed
   * or pulled back to the belt's start from there).
   */
  prompt() {
    const shop = this.shop, items = shop.unpaid;
    if (!items.length) return null;
    for (const l of this.lanes) {
      if (!l.cashier || l.busy) continue;
      const u = this._point(l, l.belt.start - CART.behind + 0.15, 0);
      const dx = shop.her.x - u.x, dz = shop.her.z - u.z;
      const along = dx * l.d.x + dz * l.d.z, across = Math.abs(dx * l.n.x + dz * l.n.z);
      if (along < -2.4 || along > 1.6 || across > 0.75) continue;
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
    const cart = shop.mine, her = shop.her.player.position;
    l.busy = true;
    l.paid = false;
    // In the lane's queue: whoever is ahead of her first.
    l.her = her;
    if (l.queue?.aheadOf(her)) hud.toast('Waiting for your turn', 'The cashier is serving the customer ahead');
    // Her cart beside the start of the belt; she works from its belt side.
    const side = cart.toLocal(cart.x + l.n.x, 0, cart.z + l.n.z, _p).x > 0 ? 1 : -1;
    const steps = [
      { d: 0, until: () => !l.queue?.aheadOf(her), done: () => { l.turn = true; } },
      ...this._pushTo(this._point(l, l.belt.start + 0.15, 0)), ...shop._handsOff(cart),
    ];
    // Every item onto the belt, the highest in the cart first.
    const order = [...items].sort((a, b) => b.cur.y - a.cur.y);
    for (const item of order) steps.push(...this._unload(l, cart, item, side));
    // Back to the handle and on to the register; she pays once all is scanned.
    steps.push(...shop._toHandle(cart), { d: 0, done: () => { shop._handsOn = null; } });
    steps.push(...this._pushTo(this._point(l, CART.behind, 0)));
    steps.push({ d: 0, until: () => !l.riding.length && l.scanned.length >= order.length && !l.cashier.busy,
      done: () => hud.toast(`Total ${total} ◈`, 'Pay with your gift card') });
    // Pay: beside the cart, her card to the reader: a double beep, the till.
    const reader = this._point(l, l.readerAt, l.readerLat, l.top + 0.14), face = Math.atan2(l.n.x, l.n.z);
    steps.push(
      ...shop._handsOff(cart),
      shop._go(() => ({ ...this._point(l, l.readerAt - 0.15, l.L - EDGE), yaw: face })),
      ...shop._move(false, () => ({ x: reader.x, y: reader.y + 0.06, z: reader.z }), LEAN * 0.5, 0.04, 0.3),
      ...shop._move(false, () => reader, LEAN * 0.5, 0, 0.15),
      { d: 0.25, done: () => {
        shop.tones.card();
        wallet.spend(total);
        for (const e of order) wallet.add(e.id);
        l.paid = true;
      } },
      ...shop._handBack(0.08),
      { d: 0, done: () => { shop.tones.till(); l.cashier.bow(); hud.toast(`Paid ${total} ◈`, 'Arigatou gozaimashita! Your bags are ready'); } },
      { d: 0, until: () => !l.bags.length || l.held },
    );
    shop.tl.play(steps, () => this._takeBags(l, cart, side));
  }

  /** The bags the cashier holds out, one after another, into her cart; then she pushes off. */
  _takeBags(l, cart, side) {
    const shop = this.shop, her = shop.her;
    if (!l.bags.length) {
      shop.tl.play(shop._toHandle(cart), () => {
        l.busy = l.turn = false;
        l.her = null;
        l.scanned.length = 0;
        shop._after();
      });
      return;
    }
    const at = { x: 0, y: 0, z: 0 };
    shop.tl.play([
      shop._go(() => ({ ...this._point(l, l.handover - 0.15, l.L - EDGE), yaw: Math.atan2(l.n.x, l.n.z) })),
      { d: 0, until: () => !!l.held },
      // Her hand on the handles beside the cashier's; she takes it.
      ...shop._move(false, () => {
        const e = l.held;
        return { x: e.x - l.d.x * 0.04, y: e.y + BAG.handle, z: e.z - l.d.z * 0.04 };
      }, LEAN, 0.04, 0.3),
      { d: 0, done: () => {
        const e = l.held;
        l.held = null;
        l.cashier.hand.letGo();
        her.hold(e, e.x, e.y, e.z, e.yaw);
        at.x = e.x; at.y = e.y; at.z = e.z;
      } },
      ...shop._move(true, () => ({ x: at.x - l.n.x * 0.2, y: at.y + 0.05, z: at.z - l.n.z * 0.2 }), 0, 0.03, 0.2),
      ...shop._intoCart(() => her.held.thing, cart, false, side),
    ], () => this._takeBags(l, cart, side));
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

  /**
   * One item: she steps to where it lies in the basket, takes it by its top,
   * lifts it out over the side, turns to the belt and sets it down on it
   * (once there is room at the belt's start), print to the lane.
   */
  _unload(l, cart, item, side) {
    const shop = this.shop, her = shop.her, at = { x: 0, y: 0, z: 0 }, drop = { x: 0, y: 0, z: 0, yaw: l.faceYaw };
    const where = () => cart.toWorld(item.cur.x, item.cur.y, item.cur.z, at);
    const s = 0.06 + item.size.w / 2;
    return [
      shop._go(() => shop._cartStance(cart, item.cur.z, {}, side)),
      ...shop._move(false, () => { where(); return { x: at.x, y: Math.max(RIM, at.y + item.size.h) + 0.08, z: at.z }; }, 0.15, 0.05, 0.3),
      ...shop._move(false, () => { where(); return { x: at.x, y: at.y + item.size.h + 0.012, z: at.z }; }, 0, 0, 0.2),
      { d: 0, done: () => {
        cart.unstow(item);
        her.hold(item, at.x, at.y, at.z, cart.yaw + item.cur.yaw);
        shop.tones.click();
      } },
      ...shop._move(true, () => ({ x: at.x, y: Math.max(RIM, at.y) + 0.1, z: at.z }), 0, 0.02, 0.2),
      // A step round to the belt, up to the counter's edge (once there is room at the belt's start).
      shop._go(() => {
        const off = l.L - EDGE - ((her.x - l.line.x) * l.n.x + (her.z - l.line.z) * l.n.z);
        return { x: her.x + l.n.x * off, z: her.z + l.n.z * off, yaw: Math.atan2(l.n.x, l.n.z) };
      }, (m, dt) => shop._front(dt)),
      { d: 0, until: () => {
        const last = l.riding[l.riding.length - 1];
        return !last || last.s - last.len / 2 > s + item.size.w / 2 + GAP;
      } },
      ...shop._move(true, () => {
        Object.assign(drop, this._point(l, l.belt.start + s, l.L, l.beltY));
        return { x: drop.x, y: drop.y + 0.06, z: drop.z, yaw: drop.yaw };
      }, LEAN, 0.06, 0.3),
      ...shop._move(true, () => drop, LEAN, 0, 0.15),
      { d: 0, done: () => {
        her.carry();
        const yaw = her.heldAt(_p);
        her.letGo();
        l.riding.push({ item, s, len: item.size.w, lat: 0, yaw });
        shop.tones.drop();
      } },
      ...shop._handBack(0.1),
    ];
  }

  dispose() {
    for (const l of this.lanes) {
      l.shoppers.length = 0;
      if (!l.cashier) continue;
      l.cashier.tl.clear();
      this.ctx.graphics.removeCasters(l.cashier.r.casters);
      disposeResident(l.cashier.r);
    }
    this.lanes.length = 0;
  }
}

/**
 * A lane's frame: along it toward the register (d) and across from its line
 * toward the belt and on to the cashier (n); distances along it are measured
 * from the register stop.
 */
function lane(spot, i) {
  const b = spot.belt, reg = spot.register;
  let dx = b.to[0] - b.from[0], dz = b.to[2] - b.from[2];
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  const line = { x: spot.stop.x, z: spot.stop.z };
  const ox = b.from[0] - line.x, oz = b.from[2] - line.z;
  const side = (ox * dz - oz * dx) > 0 ? 1 : -1;
  const n = { x: dz * side, z: -dx * side };
  const along = (p) => (p[0] - line.x) * dx + (p[2] - line.z) * dz;
  const lat = (p) => (p[0] - line.x) * n.x + (p[2] - line.z) * n.z;
  return {
    id: spot.id ?? `lane${i + 1}`, spot, line, d: { x: dx, z: dz }, n, L: lat(b.from), yaw: Math.atan2(dx, dz),
    faceYaw: Math.atan2(-n.x, -n.z),   // goods on the belt show their print to the lane
    belt: { from: b.from, to: b.to, len, start: along(b.from), end: along(b.to) },
    beltY: b.from[1] - 0.005,
    top: b.from[1] - 0.02,             // the counter's surface
    // The scanner window between the belt's end and the register; the card
    // reader on her side of the register (MallMarket's counter: 0.48 m toward
    // her, 0.175 m on); the bags in a row past the register; where a bag
    // changes hands.
    scanAt: (along(b.to) + along(reg)) / 2,
    readerAt: along(reg) + 0.175, readerLat: lat(reg) - 0.48,
    bagAt: along(reg) + 0.45,
    handover: along(reg) + 0.2,
    riding: [], scanned: [], bags: [], shoppers: [], cashier: null, busy: false, paid: false, offered: null, held: null, prompt: null,
    // Her position while she queues / checks out here, and whether her turn
    // has come; the shoppers' queue (CheckoutLine, set by MallShoppers).
    her: null, turn: false, queue: null,
  };
}

/** What a list of items costs. */
export function totalOf(items) {
  let t = 0;
  for (const e of items) t += e.p.price;
  return t;
}
