import { TransformNode } from '@babylonjs/core';
import { ProductSet } from '../interiors/Products.js';
import { labelFor } from '../interiors/Labels.js';
import { GOODS_BY_ID } from './MallCatalog.js';
import { ITEMS } from '../gameplay/ShopData.js';
import { Batch, C, lin } from './MallKit.js';
import { CASHIERS } from './Checkout.js';
import { LOOK as STYLE_LOOK } from './ClothingTill.js';
import { Her } from './Her.js';
import { ShopTill } from './ShopTill.js';
import { Timeline } from './Timeline.js';
import { shopSounds } from './ShopSounds.js';
import { alarm, tone } from './Tones.js';

/**
 * Hikari Mall's small shops (MALL.md layout.shops): the shop row's nine and
 * the upper floor's rooms, each with its clerk behind a till (ShopTill)
 * and goods she can buy (MallCatalog SHOP_GOODS):
 *  - on a display table: "Take" — she steps up, reaches and takes it in her
 *    right hand; "Put back" sets it down where it stood; at the till "Pay"
 *    — she sets it on the counter;
 *  - behind the counter (the café's cake case, the ramen bar, the food
 *    court's stalls, the cinema's popcorn): "Order" at the counter before
 *    it — the clerk fetches it onto the counter.
 * Then the clerk bags it in a paper bag (scanned on the way), she taps her
 * card (the trip's wallet and receipt, as at the other tills) and takes the
 * bag from the clerk's hand: it hangs from her hand with the clothing
 * store's (MallFashion.addBag) and goes to the cart and the boot with them.
 * Walking out of a shop with something unpaid: the soft alarm, and back in.
 *
 * Every good on display is a thin instance of the walk-in shops' product
 * shapes (Products.js: one draw per shape), the one in a hand or on a
 * counter a pooled loose instance; the bags are made at load (one material,
 * vertex coloured), more cloned from them when a trip needs them.
 */
const SHAPE_H = { book: 0.19, magazine: 0.28, box: 0.06, dye: 0.13, jar: 0.12, bottle: 0.23, bun: 0.06, cup: 0.16, bowl: 0.1, bag: 0.2 };
const BAGS = 3;               // paper bags made at load: a trip's usual purchases
const REACH = 1.0;            // m: a good she can take, from her centre
const AT_TILL = 1.3;          // m: from where she would stand to pay
// The clerks: the supermarket's and the clothing store's uniforms (their
// recoloured materials are already made) and a navy one for the rest.
const NAVY = [
  { base: 'girl_apron', hair: '#3a2a24', top: '#26324a', bottom: '#2b2b33', height: 1.6, gender: 'f' },
  { base: 'boy_uniform', hair: '#2a2420', top: '#26324a', bottom: '#33363c', height: 1.72, gender: 'm' },
];
const CLERKS = {
  books: [NAVY[0]], denki: [NAVY[1]], drug: [CASHIERS[0]], hyaku: [CASHIERS[1]], cafe: [STYLE_LOOK], toys: [NAVY[0]], shoes: [NAVY[1]],
  ramen: [NAVY[1]], games: [CASHIERS[2]], foodcourt: [CASHIERS[0], NAVY[1]], cinema: [NAVY[0]], tea: [STYLE_LOOK], bags: [STYLE_LOOK],
};

export class MallShops {
  constructor(ctx) {
    this.ctx = ctx;
    this.her = new Her(ctx);
    this.tl = new Timeline();
    const s = shopSounds(ctx.audio);
    this.tones = { ...s, rustle: () => tone(ctx.audio, [320, 260], { dur: 0.08, type: 'triangle', gain: 0.04, gap: 0.01 }) };
    this.held = null;          // the good in her hand, not paid for yet
    this.time = 0;
    this._out = { inside: false, x: 0, z: 0 };
    const P = (icon, priority) => ({ label: '', icon, priority, distance: 0, run: null, key: null });
    this._prompts = { take: P('✋', 4), back: P('↩', 5), pay: P('💳', 6), order: P('🛍', 4) };
  }

  async init() {
    const { scene, layout, graphics } = this.ctx;
    this.root = new TransformNode('mall:shops', scene);
    this.shops = layout.shops || [];
    this.display = new ProductSet(this.root);
    this.loose = new ProductSet(this.root, { dynamic: true });
    this.tills = [];
    this.spots = [];
    for (const shop of this.shops) {
      const tills = shop.tills.map((t, i) => new ShopTill(this, t, shop, CLERKS[shop.kind][i % CLERKS[shop.kind].length]));
      this.tills.push(...tills);
      const add = (g, till, staff) => {
        const good = GOODS_BY_ID[g.id], shape = good.look.shape;
        const unit = this.display.add(shape, good.look.color, g.x, g.y, g.z, g.yaw, 1, labelFor(g.id));
        this.spots.push({ ...g, shop, till, staff, good, unit, h: SHAPE_H[shape] });
      };
      for (const g of shop.goods) add(g, tills[0], false);
      tills.forEach((t, i) => { for (const g of shop.tills[i].goods) add(g, t, true); });
    }
    this.display.build();
    for (const shape of new Set(this.spots.map((s) => s.good.look.shape))) this.loose.reserve(shape, 1);
    this.loose.build();
    this._bags();
    await Promise.all(this.tills.map((t) => t.init()));
    graphics.addCasters(this.bags);
  }

  /** The paper bags: kraft with the mall's pink band, rope handles; the origin at the handles (as the clothing store's). */
  _bags() {
    const M = this.ctx.world.mats, b = new Batch(this.ctx.scene, 'mall:paperBag');
    const kraft = lin('#d8b98c'), w = 0.15, d = 0.06, base = -0.39, top = -0.05;
    b.box(M.matte, kraft, -w, base, -d, w, top, d);
    b.box(M.matte, C.pink, -w - 0.002, base + 0.08, -d - 0.002, w + 0.002, base + 0.13, d + 0.002);
    b.box(M.matte, C.white, -0.06, base + 0.17, -d - 0.003, 0.06, base + 0.27, -d);
    for (const s of [-1, 1]) {
      b.rod(M.matte, C.dark, [-0.06, top, s * d * 0.6], [-0.03, -0.005, s * d * 0.6], 0.006, 4);
      b.rod(M.matte, C.dark, [-0.03, -0.005, s * d * 0.6], [0.03, -0.005, s * d * 0.6], 0.006, 4);
      b.rod(M.matte, C.dark, [0.03, -0.005, s * d * 0.6], [0.06, top, s * d * 0.6], 0.006, 4);
    }
    this.bagTemplate = b.build(null)[0];
    this.bagTemplate.unfreezeWorldMatrix();
    this.bags = [this.bagTemplate];
    for (let i = 1; i < BAGS; i++) this.bags.push(this.bagTemplate.clone(`mall:paperBag${i}`));
    // Drawn once behind the loading veil (warm-up), then put away under the counters.
    this._stowBags = true;
  }

  /** A bag not out with her yet (another cloned when all are: same geometry and material, nothing to compile). */
  freeBag() {
    let bag = this.bags.find((m) => !m.isEnabled(false));
    if (!bag) {
      bag = this.bagTemplate.clone(`mall:paperBag${this.bags.length}`);
      this.bags.push(bag);
      this.ctx.graphics.addCasters([bag]);
    }
    return bag;
  }

  get busy() { return this.tl.running; }

  // ------------------------------------------------------------ per frame
  update(dt) {
    if (this._stowBags) {
      this._stowBags = false;
      for (const b of this.bags) b.setEnabled(false);
      this.loose.trim();
    }
    this.time += dt;
    this.tl.update(dt);
    const p = this.ctx.player.position;
    for (const t of this.tills) t.update(dt, p);
    this.her.carry();
    this.loose.flush();
    this._guard();
  }

  // ------------------------------------------------------------ goods
  /** A good (a display spot) as it is handled: its loose unit when out of its place. */
  _item(spot) {
    const item = { id: spot.id, spot, good: spot.good, h: spot.h, unit: null, at: { x: spot.x, y: spot.y, z: spot.z } };
    item.thing = { put: (x, y, z, yaw, rx = 0) => { item.at.x = x; item.at.y = y; item.at.z = z; this.loose.move(item.unit, x, y, z, yaw, rx); } };
    return item;
  }

  /** It leaves its place: the display shows it gone, a loose one is where it stood. */
  toLoose(item) {
    const s = item.spot, g = s.good;
    this.display.setVisible(s.unit, false);
    item.unit = this.loose.acquire(g.look.shape, g.look.color, labelFor(g.id));
    this.loose.move(item.unit, s.x, s.y, s.z, s.yaw);
  }

  /** Back in its place (put back), or in a bag (the shop has more: its place is filled again). */
  _restock(item) {
    this.loose.release(item.unit);
    item.unit = null;
    this.display.setVisible(item.spot.unit, true);
  }

  bagged(item) { this._restock(item); }

  // ------------------------------------------------------------ prompt
  prompt() {
    const { player, vehicles, animation, fashion } = this.ctx;
    if (this.busy || vehicles?.driving || player.ride || animation.act.hands || fashion?.carried?.length) return null;
    const p = player.position, P = this._prompts, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const item = this.held;
    if (item) {
      const t = item.spot.till, stand = t.herAt(t.at(0)), d = Math.hypot(p.x - stand.x, p.z - stand.z);
      if (d < AT_TILL && Math.abs(p.y - item.spot.shop.y) < 1) return this._show(P.pay, `Pay for ${item.good.name} · ${item.good.price} ◈`, d, () => this.pay());
      const s = item.spot, ds = Math.hypot(p.x - s.x, p.z - s.z);
      if (ds < REACH && ((s.x - p.x) * fx + (s.z - p.z) * fz) / (ds || 1) > 0.3) return this._show(P.back, `Put back ${item.good.name}`, ds, () => this.putBack());
      return null;
    }
    let best = null, bd = Infinity, order = false;
    for (const s of this.spots) {
      if (Math.abs(p.y - s.shop.y) > 1) continue;
      if (s.staff) {
        // Ordered across the counter: she stands before it, facing it.
        const at = s.till.herAt(s), d = Math.hypot(p.x - at.x, p.z - at.z);
        if (d < 0.8 && d < bd && -(fx * s.till.out.x + fz * s.till.out.z) > 0.3 && !s.till.busy) { best = s; bd = d; order = true; }
        continue;
      }
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < REACH && d < bd && ((s.x - p.x) * fx + (s.z - p.z) * fz) / (d || 1) > 0.35) { best = s; bd = d; order = false; }
    }
    if (!best) return null;
    const g = best.good;
    return order
      ? this._show(P.order, `Order ${g.name} · ${g.price} ◈`, bd, () => this.order(P.order.key), best)
      : this._show(P.take, `Take ${g.name} · ${g.price} ◈`, bd, () => this.take(P.take.key), best);
  }

  _show(p, label, distance, run, key = null) {
    if (p.label !== label) { p.label = label; p.icon = key ? ITEMS[key.id]?.icon || p.icon : p.icon; }
    p.distance = distance;
    p.key = key;
    p.run ||= run;
    return p;
  }

  // ------------------------------------------------------------ actions
  /** She steps up to a display table and takes the good in her right hand. */
  take(spot) {
    if (!spot || this.busy || this.held) return;
    const her = this.her, f = this.ctx.fashion, item = this._item(spot), to = { x: 0, y: 0, z: 0 };
    her.freeze(true);
    this.tl.play([
      f.stepUp(spot.x, spot.y + spot.h * 0.5, spot.z),
      { d: 0, done: () => { to.x = spot.x; to.y = spot.y + spot.h * 0.55; to.z = spot.z; } },
      ...f.reachSteps(to, () => {
        this.toLoose(item);
        her.hold(item.thing, spot.x, spot.y, spot.z, spot.yaw);
        this.tones.click();
      }, { lift: 0.04 }),
    ], () => { her.freeze(false); this.held = item; this._out.inside = false; });
  }

  /** The good in her hand back where it stood. */
  putBack() {
    const item = this.held;
    if (!item || this.busy) return;
    const her = this.her, f = this.ctx.fashion, s = item.spot, to = { x: 0, y: 0, z: 0 };
    this.held = null;
    her.freeze(true);
    this.tl.play([
      f.stepUp(s.x, s.y + s.h * 0.5, s.z),
      { d: 0, done: () => { her.carry(); Object.assign(to, her.palmFor(s.x, s.y, s.z, {})); } },
      ...f.reachSteps(to, () => {
        her.letGo();
        this._restock(item);
        this.tones.drop();
      }, { lift: 0.06 }),
    ], () => her.freeze(false));
  }

  /** "Pay": she sets the good down on the till's counter; it is bagged, she pays and takes the bag. */
  pay() {
    const item = this.held, till = item?.spot.till;
    if (!item || this.busy || !till.cashier || !this._afford(item)) return;
    const her = this.her, f = this.ctx.fashion, lay = till.at(0), to = { x: 0, y: 0, z: 0 }, bag = this.freeBag();
    this.held = null;
    her.freeze(true);
    this.tl.play([
      her.goTo(() => till.herAt(lay)),
      { d: 0, done: () => { her.carry(); Object.assign(to, her.palmFor(lay.x, lay.y, lay.z, {})); } },
      ...f.reachSteps(to, () => {
        her.letGo();
        this.loose.move(item.unit, lay.x, lay.y, lay.z, till.yawOut + Math.PI);
        item.at.x = lay.x; item.at.y = lay.y; item.at.z = lay.z;
        this.tones.drop();
        till.cashier.tl.play(till.bagIt(item, bag));
      }, { lift: 0.05 }),
      ...this._settle(till, item, bag),
    ], () => her.freeze(false));
  }

  /** "Order": the clerk fetches it from behind the counter and bags it; she pays and takes the bag. */
  order(spot) {
    const till = spot?.till;
    if (!spot || this.busy || this.held || !till.cashier || till.busy) return;
    const item = this._item(spot);
    if (!this._afford(item)) return;
    const her = this.her, bag = this.freeBag();
    her.freeze(true);
    till.cashier.tl.play([...till.fetch(item), ...till.bagIt(item, bag)]);
    this.ctx.hud.toast(item.good.name, `${till.data.name} · coming right up`);
    this.tl.play([her.goTo(() => till.herAt(till.at(0))), ...this._settle(till, item, bag)], () => her.freeze(false));
  }

  _afford(item) {
    const { wallet, hud } = this.ctx;
    if (wallet.coins >= item.good.price) return true;
    hud.toast(`${item.good.price} ◈ — you have ${wallet.coins}`, 'Not enough on the gift card');
    return false;
  }

  /** Her steps once it is bagged: her card on the reader (paid), then the bag from the clerk's hand. */
  _settle(till, item, bag) {
    const f = this.ctx.fashion, { wallet, hud } = this.ctx, g = item.good;
    const reader = till.at(till.along(till.data.register[0], till.data.register[2]), 0.24, 0.1);
    return [
      { d: 0, until: () => !till.cashier.busy },
      this.her.goTo(() => till.herAt(reader)),
      ...f.reachSteps(reader, () => {
        wallet.spend(g.price);
        wallet.add(g.id);
        this.tones.card();
        hud.toast(`Paid ${g.price} ◈`, 'Arigatou gozaimashita!');
        till.cashier.tl.play(till.offer(bag));
      }, { lift: 0.04 }),
      { d: 0, until: () => !!till.held },
      this.her.goTo(() => till.herAt(till.grip)),
      ...f.reachSteps(till.grip, () => {
        till.handOver();
        f.addBag(bag, [g.id]);
        this.tones.click();
      }, { lift: 0.04 }),
    ];
  }

  // ------------------------------------------------------------ the shop's way out
  /** Leaving its shop with the good unpaid: the alarm, and she turns back in by a step. */
  _guard() {
    const item = this.held;
    if (!item || this.busy) return;
    const p = this.ctx.player.position, z = item.spot.shop.zone, o = this._out;
    if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && Math.abs(p.y - item.spot.shop.y) < 1) {
      o.inside = true; o.x = p.x; o.z = p.z;
      return;
    }
    if (!o.inside) return;
    o.inside = false;
    alarm(this.ctx.audio);
    this.ctx.hud.toast('Pay at the till first', `${item.good.name} isn’t paid for yet`);
    const dx = o.x - p.x, dz = o.z - p.z, l = Math.hypot(dx, dz) || 1;
    const walk = { x: o.x + (dx / l) * 1.0, z: o.z + (dz / l) * 1.0, done: () => { walk.over = true; } };
    this.tl.play([{ until: () => walk.over, step: (k, dt, first) => { if (first) this.ctx.player.autoWalk = walk; } }]);
  }

  dispose() {
    const { player, graphics } = this.ctx;
    this.tl.clear();
    if (this.held || this.her.held) this.her.rest();
    player.hold = false;
    for (const t of this.tills) t.dispose();
    graphics.removeCasters(this.bags || []);
    for (const b of this.bags || []) b.dispose();
    this.display?.dispose();
    this.loose?.dispose();
    this.root?.dispose();
    this.held = null;
  }
}
