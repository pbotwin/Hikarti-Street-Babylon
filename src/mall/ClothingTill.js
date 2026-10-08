import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { createResident, disposeResident } from '../npcs/NPCModels.js';
import { Cashier } from './Cashier.js';
import { ease, lerp } from './Timeline.js';
import { tone } from './Tones.js';

/**
 * Sakura Style's till (layout.fashion.till), everything moved by a hand.
 * She steps up to the counter and lays the clothes on it one by one (each
 * swings down off her fingers where her hand puts it); the cashier (a
 * resident in the store's pink, Cashier) takes a Sakura Style bag from under
 * the counter, then for each piece picks it up, passes it over the scanner
 * (beep), lays it down, slips the hanger out and puts it under the counter,
 * folds it with both hands (sides in, then in half) and lowers it into the
 * bag. She taps her card on the register (paid from the trip's wallet); the
 * cashier holds the bag out across the counter by its handles and she takes
 * it. Not enough money: the cashier says so and nothing moves. Shoppers
 * already ahead of her in the till's queue (`queue`, their CheckoutLine)
 * are served first.
 */

const LOOK = { base: 'girl_dress', hair: '#2b2b33', top: '#f2a7bd', bottom: '#f6f0ea', height: 1.6, gender: 'f' };
const FOLD_LEN = 0.4;     // a folded garment's length, of the hanging one
const HANDLE = 0.39;      // the bag's handles' top above its base (FashionPrint.bag)
// Across the counter (m from the register, toward her): she stands at its
// edge on her side, the cashier at hers; what passes between them lies just
// on the cashier's half (residents' arms reach ~0.45 m, hers a little more).
const HER = 0.5, CASHIER = -0.5, MID = -0.05;
const _q = new Quaternion(), _s = new Vector3(), _p = new Vector3(), _m = new Matrix();

export class ClothingTill {
  constructor(fashion, data) {
    this.f = fashion;
    this.data = data;
    this.cashier = null;
    this.held = null;                        // the bag the cashier holds out, waiting for her hand
    this.her = null;                         // her position while she queues / pays here
    this.queue = null;                       // the shoppers' queue (CheckoutLine, set by MallShoppers)
    this.grip = { x: 0, y: 0, z: 0 };       // where her palm takes it
    this.left = new Vector3();               // the cashier's left hand, folding
    const r = data.register, st = data.stand;
    // Counter frame: toward her (out) and along the counter (side).
    let ox = st.x - r[0], oz = st.z - r[2];
    const l = Math.hypot(ox, oz) || 1;
    ox /= l; oz /= l;
    this.out = { x: ox, z: oz };
    this.side = { x: oz, z: -ox };
    this.yawOut = Math.atan2(ox, oz);
    this.yawAlong = Math.atan2(-oz, ox);   // along the counter, away from the register
    // The counter's surface beside the register (the layout gives the register's own height).
    const side = this.at(-0.6, 0.2);
    this.top = fashion.ctx.collision.groundHeight(side.x, side.z, 0.05, r[1] + 1, 0) || r[1];
  }

  async init() {
    const c = this.data.cashier, ctx = this.f.ctx;
    try {
      const r = await createResident(LOOK);
      r.blinkSeed = Math.random();
      this.cashier = new Cashier(r, c, ctx.layout.building?.floorY ?? 0, 'f');
      ctx.graphics.addCasters(r.casters);
    } catch (e) { console.warn('fashion cashier', e); }
  }

  distance(p) { return Math.hypot(p.x - this.data.stand.x, p.z - this.data.stand.z); }

  /** A point on the counter: `a` along it, `b` toward her side (m), `y` above its top. */
  at(a, b, y = 0) {
    const r = this.data.register;
    return { x: r[0] + this.side.x * a + this.out.x * b, y: (this.top ?? r[1]) + y, z: r[2] + this.side.z * a + this.out.z * b };
  }

  /** Where the cashier stands to work at `a` along the counter with her right hand. */
  _stand(a) {
    const p = this.at(a + 0.15, CASHIER);
    return { x: p.x, z: p.z, yaw: this.yawOut };
  }

  update(dt) {
    this.cashier?.update(dt, this.f.ctx.player.position, this.f.ctx.scene.frustumPlanes);
  }

  /** "Pay for N items": she lays them down, the cashier scans, folds and bags them, she pays and takes the bag. */
  pay() {
    const f = this.f, { wallet, hud, player } = f.ctx, c = this.cashier;
    const total = f.total();
    if (!f.carried.length || f.busy || !c) return;
    if (wallet.coins < total) {
      hud.toast(`${total} ◈ — you have ${wallet.coins}`, 'Hang something back (✕) to pay for less');
      return;
    }
    const bag = f.freeBag();
    const her = f.her, items = f.carried.slice(), face = this.yawOut + Math.PI;
    const from = { x: 0, z: 0, yaw: 0 };
    her.freeze(true);
    this.her = player.position;
    if (this.queue?.aheadOf(player.position)) hud.toast('Waiting for your turn', 'The cashier is serving the customer ahead');
    const steps = [
      { d: 0, until: () => !this.queue?.aheadOf(player.position) },
      // Up to the counter's edge.
      { d: 0.35, step: (k, dt, first) => {
        if (first) { from.x = player.position.x; from.z = player.position.z; from.yaw = player.yaw; }
        const to = this.at(0.1, HER), m = ease(k);
        her.place(lerp(from.x, to.x, m), lerp(from.z, to.z, m), player.yaw);
        f.turn(from.yaw, face, k);
      } },
    ];
    // Each piece laid down where her hand puts it (its hook, at the collar end, goes there first).
    items.forEach((g, i) => {
      const spot = this._laySpot(g.unit, i);
      steps.push(this._step(spot));
      steps.push(...f.reachSteps(f.palmFor(0, g.unit.shape === 'sneakers', spot.x, spot.y + 0.02, spot.z, face), () => {
        f.drop(g);
        this._lay(g.unit, spot);
        f._click();
      }, { lift: 0.04, back: i === items.length - 1 ? 0.35 : 0.25 }));
    });
    // The cashier's work (her own timeline): a bag, then each piece.
    steps.push({ d: 0, done: () => {
      c.tl.play(this._fetchBag(bag));
      items.forEach((g, i) => c.tl.play(this._serve(g, i)));
    } });
    // Once it is all in the bag, her card to the register; then she takes the bag from the cashier's hand.
    steps.push(
      { d: 0, until: () => !c.busy },
      this._step(this.at(0, 0.2)),
      ...f.reachSteps(this.at(0, 0.2, 0.05), () => {
        wallet.spend(total);
        for (const g of items) wallet.add(g.id);
        tone(f.ctx.audio, [1318, 1568, 2093], { dur: 0.1, type: 'triangle', gain: 0.07 });
        hud.toast(`Paid ${total} ◈`, 'Arigatou gozaimashita!');
        c.tl.play(this._offer(bag));
      }, { lift: 0.04 }),
      { d: 0, until: () => !!this.held },
      this._step(this.grip),
      ...f.reachSteps(this.grip, () => {
        c.hand.letGo();
        this.held = null;
        f.bags.push({ mesh: bag, items: items.map((g) => g.id) });
        c.bow();
      }, { lift: 0.04 }),
    );
    f.timeline.play(steps, () => { this.her = null; her.freeze(false); });
  }

  /** A step: along her side of the counter to work at `p` (a counter point) with her right hand. */
  _step(p) {
    const face = this.yawOut + Math.PI, r = this.data.register;
    return this.f.her.goTo(() => {
      const a = (p.x - r[0]) * this.side.x + (p.z - r[2]) * this.side.z, q = this.at(a, HER);
      // Her right hand toward the end the counter's `side` points away from.
      return { x: q.x + Math.cos(face) * 0.14, z: q.z - Math.sin(face) * 0.14, yaw: face };
    });
  }

  /** Where the i-th piece lies on the counter (its origin: the collar end), on the cashier's half. */
  _laySpot(u, i) {
    const p = this.at(-0.8 - i * 0.05, MID, 0.005 + i * 0.03);
    if (u.shape !== 'sneakers') { p.x += this.side.x * 0.33 * u.scale; p.z += this.side.z * 0.33 * u.scale; }
    return p;
  }

  /** Lay a garment flat (lengthwise along the counter, collar toward the register; sneakers stand, toes to her) at its spot. */
  _lay(u, p) {
    const flat = u.shape !== 'sneakers';
    this.f.settle(u, p.x, p.y, p.z, flat ? this.yawAlong : this.yawOut, { d: 0.3, pitch: flat ? -Math.PI / 2 : 0 });
  }

  /** A garment (its hanger, a folded stack) as a thing a hand holds: placed by its origin, tipped by its pitch. */
  _thing(u) {
    const set = this.f.set;
    return { put: (x, y, z, yaw, pitch) => set.place(u, x, y, z, yaw, 0, pitch) };
  }

  /** The bag as a thing a hand holds (by its handles: its origin). */
  _bag(bag) {
    return { put: (x, y, z, yaw) => { bag.position.set(x, y, z); bag.rotation.set(0, yaw, 0); } };
  }

  /** Cashier steps: a bag from the shelf under the counter, stood open on the counter by the register. */
  _fetchBag(bag) {
    const c = this.cashier, hand = c.hand, thing = this._bag(bag);
    const under = this.at(0.45, CASHIER + 0.05, HANDLE - 0.45), spot = this.at(0.45, MID, HANDLE);
    return [
      c.go(() => this._stand(0.45)),
      { d: 0, done: () => { bag.setEnabled(true); thing.put(under.x, under.y, under.z, this.yawOut); } },
      ...c.move(false, () => under, { lean: 0.45, lift: 0 }),
      { d: 0, done: () => hand.hold(thing, under.x, under.y, under.z, this.yawOut) },
      ...c.move(true, () => spot, { lift: 0.12, lean: 0.25, d: 0.4 }),
      { d: 0, done: () => { hand.letGo(); this._rustle(); } },
      c.rest(0.2),
    ];
  }

  /** Cashier steps for one piece: scan it, the hanger out and under the counter, fold it, into the bag. */
  _serve(g, i) {
    const f = this.f, set = f.set, u = g.unit, c = this.cashier, hand = c.hand, o = c.opts;
    const shoes = u.shape === 'sneakers', folded = f.folded[i];
    const scan = this.at(-0.32, MID, 0.08), fold = this.at(-0.4, MID, 0.005), into = this.at(0.45, MID, 0.25);
    const steps = [
      c.go(() => this._stand(-0.8 - i * 0.05)),
      ...c.move(false, () => ({ x: u.x, y: u.y + 0.02, z: u.z }), { lean: 0.4 }),
      { d: 0, done: () => hand.hold(this._thing(u), u.x, u.y, u.z, u.yaw, u.pitch) },
      c.go(() => this._stand(-0.32)),
      ...c.move(true, () => scan, { lift: 0.05, lean: 0.35, d: 0.3 }),
      { d: 0.1, done: () => tone(f.ctx.audio, [1760], { dur: 0.09, type: 'square', gain: 0.05 }) },
    ];
    if (!shoes) {
      const pile = this.at(-0.4, CASHIER + 0.08, -0.3);
      steps.push(
        // Down flat to fold; the hanger slipped out and put away under the counter.
        ...c.move(true, () => ({ x: fold.x + this.side.x * 0.33 * u.scale, y: fold.y, z: fold.z + this.side.z * 0.33 * u.scale }), { lift: 0, lean: 0.35, d: 0.3 }),
        { d: 0, done: () => {
          hand.letGo();
          u.onHanger = false;
          hand.hold(this._thing(u.hanger), u.x, u.y, u.z, u.yaw, u.pitch);
        } },
        ...c.move(true, () => pile, { lift: 0.08, lean: 0.4, d: 0.35 }),
        { d: 0, done: () => { hand.letGo(); set.setVisible(u.hanger, false); } },
        // Sides in, then in half, both hands on it: the garment's matrix scaled about its collar.
        { d: 0.2, step: (k, dt, first) => {
          if (first) o.l = this.left;
          this._hands(u, ease(k), 0);
        } },
        { d: 0.45, step: (k) => {
          const a = ease(Math.min(1, k * 2)), b = ease(Math.max(0, k * 2 - 1));
          Quaternion.RotationYawPitchRollToRef(u.yaw, u.pitch, 0, _q);
          Matrix.ComposeToRef(_s.set(u.scale * lerp(1, 0.66, a), u.scale * lerp(1, FOLD_LEN, b), u.scale * (1 + b)), _q, _p.set(u.x, u.y + Math.sin(b * Math.PI) * 0.04, u.z), _m);
          set.placeMatrix(u, _m);
          this._hands(u, 1, b);
        }, done: () => {
          // Folded: the pooled stack in its colour takes over where it lies.
          const len = 0.66 * FOLD_LEN * 0.5 * u.scale;
          set.recolor(folded, g.item.color);
          set.setVisible(folded, true);
          set.place(folded, u.x - this.side.x * len, u.y - 0.005, u.z - this.side.z * len, this.yawOut);
          set.setVisible(u, false);
          o.l = null;
        } },
      );
    }
    const item = shoes ? u : folded;
    steps.push(
      ...c.move(false, () => ({ x: item.x, y: item.y + 0.04, z: item.z }), { lift: 0.04, lean: 0.35, d: 0.25 }),
      { d: 0, done: () => hand.hold(this._thing(item), item.x, item.y, item.z, item.yaw, item.pitch || 0) },
      c.go(() => this._stand(0.45)),
      ...c.move(true, () => into, { lift: 0.12, lean: 0.3, d: 0.35 }),
      { d: 0, done: () => { hand.letGo(); set.setVisible(item, false); this._rustle(); } },
      c.rest(0.2),
    );
    return steps;
  }

  /** The cashier's hands on a garment lying on the counter, one each side of its middle (b: how far the fold has gone). */
  _hands(u, w, b) {
    const hand = this.cashier.hand, len = 0.33 * u.scale * (1 - 0.6 * b), ax = Math.sin(u.yaw), az = Math.cos(u.yaw);
    const mx = u.x + ax * len, mz = u.z + az * len, ox = this.out.x * 0.12, oz = this.out.z * 0.12;
    this.left.set(mx + ox, u.y + 0.03, mz + oz);
    hand.aim(mx - ox, u.y + 0.03, mz - oz, Math.max(hand.w, w));
  }

  /** Cashier steps: the bag lifted by its handles and held out across the counter, until she takes it. */
  _offer(bag) {
    const c = this.cashier, hand = c.hand, thing = this._bag(bag), over = this.at(0.25, 0, HANDLE + 0.02);
    return [
      c.go(() => this._stand(0.45)),
      ...c.move(false, () => ({ x: bag.position.x, y: bag.position.y, z: bag.position.z }), { lean: 0.25, d: 0.35 }),
      { d: 0, done: () => hand.hold(thing, bag.position.x, bag.position.y, bag.position.z, bag.rotation.y) },
      c.go(() => this._stand(0.25)),
      ...c.move(true, () => over, { lift: 0.08, lean: 0.4, d: 0.35 }),
      { d: 0, done: () => {
        // Her hand goes on the handles beside the cashier's.
        const g = this.grip;
        g.x = bag.position.x - this.side.x * 0.05; g.y = bag.position.y - 0.01; g.z = bag.position.z - this.side.z * 0.05;
        this.held = bag;
      } },
      { d: 0, until: () => !hand.held },
      c.rest(0.25),
    ];
  }

  _rustle() { tone(this.f.ctx.audio, [320, 260], { dur: 0.08, type: 'triangle', gain: 0.04, gap: 0.01 }); }

  dispose() {
    if (!this.cashier) return;
    this.cashier.tl.clear();
    this.f.ctx.graphics.removeCasters(this.cashier.r.casters);
    disposeResident(this.cashier.r);
    this.cashier = null;
  }
}
