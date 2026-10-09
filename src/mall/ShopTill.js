import { createResident, disposeResident } from '../npcs/NPCModels.js';
import { Cashier } from './Cashier.js';

/**
 * A small shop's till (layout.shops[].tills[]): its clerk (a posed
 * resident, Cashier) and the sale, everything moved by a hand. What she
 * bought is on the counter's `lay` spot (she set it down, or the clerk
 * fetched it from behind the counter); the clerk takes a paper bag from
 * under the counter and stands it open, picks the item up, passes it over
 * the register (beep) and lowers it into the bag; she taps her card on the
 * reader (paid from the trip's wallet); the clerk lifts the bag by its
 * handles and holds it out across the counter, and she takes it.
 *
 * The clerk is shown only near her (a resident is a few dozen draws with
 * shadows and outlines): within VIEW on her floor, or while serving.
 */
const HANDLE = 0.39;          // the bag's handles above its base
const VIEW = 16;              // m: the clerk is drawn within this of her

export class ShopTill {
  /** `shops`: MallShops; `data`: the till (layout); `shop`: its shop (layout); `look`: the clerk's (createResident). */
  constructor(shops, data, shop, look) {
    Object.assign(this, { shops, data, shop, look });
    const f = data.face;
    this.out = { x: f.x, z: f.z };                 // toward her side of the counter
    this.side = { x: f.z, z: -f.x };              // along the counter
    this.yawOut = Math.atan2(f.x, f.z);
    const c = data.counter;
    this.half = Math.abs(f.x) > 0.5 ? (c.x1 - c.x0) / 2 : (c.z1 - c.z0) / 2;
    // The counter's middle line through the lay spot (points on it are measured from there).
    this.mid = { x: data.lay[0], z: data.lay[2] };
    this.clerkOff = (data.clerk.x - this.mid.x) * f.x + (data.clerk.z - this.mid.z) * f.z;   // < 0: behind
    this.cashier = null;
    this.shown = true;
    this.held = null;            // the bag held out across the counter, waiting for her hand
    this.grip = { x: 0, y: 0, z: 0 };
  }

  async init() {
    const ctx = this.shops.ctx;
    try {
      const r = await createResident(this.look);
      r.blinkSeed = Math.random();
      this.cashier = new Cashier(r, this.data.clerk, this.shop.y, this.look.gender);
      ctx.graphics.addCasters(r.casters);
    } catch (e) { console.warn('shop clerk', e); }
  }

  get busy() { return !!this.cashier?.busy || !!this.held; }

  /** Shown near her on her floor (and whenever serving); posed by Cashier's own level of detail. */
  update(dt, p) {
    const c = this.cashier;
    if (!c) return;
    const near = Math.abs(p.y - this.shop.y) < 2.5 && Math.hypot(p.x - this.data.clerk.x, p.z - this.data.clerk.z) < (this.shown ? VIEW + 2 : VIEW);
    const show = near || c.busy;
    if (show !== this.shown) { this.shown = show; c.r.root.setEnabled(show); }
    if (show) c.update(dt, p, this.shops.ctx.scene.frustumPlanes);
  }

  /** A point on the counter's top: `a` along it from the lay spot, `b` toward her side of its middle line, `y` above the top. */
  at(a, b = 0, y = 0) {
    const m = this.mid;
    return { x: m.x + this.side.x * a + this.out.x * b, y: this.data.top + y, z: m.z + this.side.z * a + this.out.z * b };
  }

  /** Along the counter: how far a world point is from the lay spot. */
  along(x, z) { return (x - this.mid.x) * this.side.x + (z - this.mid.z) * this.side.z; }

  /** Where the clerk stands to work at counter point p with her right hand. */
  clerkAt(p) {
    const a = this.along(p.x, p.z) + 0.15, q = this.at(a, this.clerkOff);
    return { x: q.x, z: q.z, yaw: this.yawOut };
  }

  /** Where she stands to reach counter point p with her right hand (facing the counter). */
  herAt(p) {
    const yaw = this.yawOut + Math.PI, q = this.at(this.along(p.x, p.z), this.half + 0.38);
    return { x: q.x + Math.cos(yaw) * 0.14, z: q.z - Math.sin(yaw) * 0.14, yaw };
  }

  // ------------------------------------------------------------ the clerk's steps
  /** Clerk steps: fetch `good` (its display unit) from behind the counter onto the lay spot. */
  fetch(item) {
    const c = this.cashier, hand = c.hand, g = item.spot, lay = this.at(0, -0.05);
    return [
      c.go(() => g.pick),
      ...c.move(false, () => ({ x: g.x, y: g.y + item.h * 0.6, z: g.z }), { lean: 0.35 }),
      { d: 0, done: () => {
        this.shops.toLoose(item);
        hand.hold(item.thing, g.x, g.y, g.z, g.yaw);
      } },
      c.go(() => this.clerkAt(lay)),
      ...c.move(true, () => lay, { lift: 0.1, lean: 0.3, d: 0.4 }),
      { d: 0, done: () => { hand.letGo(); item.at.x = lay.x; item.at.y = lay.y; item.at.z = lay.z; this.shops.tones.drop(); } },
      c.rest(0.2),
    ];
  }

  /** Clerk steps: a bag from under the counter stood open; the item scanned and into it. */
  bagIt(item, bag) {
    const c = this.cashier, hand = c.hand, thing = bagThing(bag);
    const spot = { x: this.data.bag[0], y: this.data.top + HANDLE, z: this.data.bag[2] };
    const under = { x: spot.x - this.out.x * 0.25, y: this.data.top - 0.45 + HANDLE, z: spot.z - this.out.z * 0.25 };
    const scan = { x: this.data.register[0] - this.out.x * 0.05, y: this.data.top + 0.12, z: this.data.register[2] - this.out.z * 0.05 };
    return [
      c.go(() => this.clerkAt(spot)),
      { d: 0, done: () => { bag.setEnabled(true); thing.put(under.x, under.y, under.z, this.yawOut); } },
      ...c.move(false, () => under, { lean: 0.45, lift: 0 }),
      { d: 0, done: () => hand.hold(thing, under.x, under.y, under.z, this.yawOut) },
      ...c.move(true, () => spot, { lift: 0.12, lean: 0.25, d: 0.4 }),
      { d: 0, done: () => { hand.letGo(); this.shops.tones.rustle(); } },
      c.go(() => this.clerkAt(item.at)),
      ...c.move(false, () => ({ x: item.at.x, y: item.at.y + item.h * 0.6, z: item.at.z }), { lean: 0.35 }),
      { d: 0, done: () => hand.hold(item.thing, item.at.x, item.at.y, item.at.z, this.yawOut + Math.PI) },
      c.go(() => this.clerkAt(scan)),
      ...c.move(true, () => scan, { lift: 0.06, lean: 0.3, d: 0.3 }),
      { d: 0.12, done: () => this.shops.tones.beep() },
      c.go(() => this.clerkAt(spot)),
      ...c.move(true, () => ({ x: spot.x, y: spot.y - HANDLE + 0.32, z: spot.z }), { lift: 0.12, lean: 0.3, d: 0.35 }),
      ...c.move(true, () => ({ x: spot.x, y: spot.y - HANDLE + 0.08, z: spot.z }), { lift: 0, lean: 0.3, d: 0.25 }),
      { d: 0, done: () => { hand.letGo(); this.shops.bagged(item); this.shops.tones.rustle(); } },
      c.rest(0.2),
    ];
  }

  /** Clerk steps: the bag lifted by its handles and held out across the counter until she takes it. */
  offer(bag) {
    const c = this.cashier, hand = c.hand, thing = bagThing(bag);
    const over = this.at(this.along(bag.position.x, bag.position.z), 0.05, HANDLE + 0.03);
    return [
      c.go(() => this.clerkAt(bag.position)),
      ...c.move(false, () => ({ x: bag.position.x, y: bag.position.y, z: bag.position.z }), { lean: 0.25, d: 0.35 }),
      { d: 0, done: () => hand.hold(thing, bag.position.x, bag.position.y, bag.position.z, bag.rotation.y) },
      ...c.move(true, () => over, { lift: 0.08, lean: 0.4, d: 0.35 }),
      { d: 0, done: () => {
        // Her hand goes on the handles beside the clerk's.
        const g = this.grip;
        g.x = bag.position.x - this.side.x * 0.05; g.y = bag.position.y - 0.01; g.z = bag.position.z - this.side.z * 0.05;
        this.held = bag;
      } },
      { d: 0, until: () => !hand.held },
      c.rest(0.25),
    ];
  }

  /** She took the bag from the clerk's hand. */
  handOver() {
    this.cashier.hand.letGo();
    this.held = null;
    this.cashier.bow();
  }

  /** A short bow for a shopper paying here. */
  thank() { this.cashier?.bow(); }

  dispose() {
    if (!this.cashier) return;
    this.cashier.tl.clear();
    this.shops.ctx.graphics.removeCasters(this.cashier.r.casters);
    disposeResident(this.cashier.r);
    this.cashier = null;
  }
}

/** A paper bag as a thing a hand holds: by its handles (its origin). */
function bagThing(bag) {
  return { put: (x, y, z, yaw) => { bag.position.set(x, y, z); bag.rotation.set(0, yaw, 0); } };
}
