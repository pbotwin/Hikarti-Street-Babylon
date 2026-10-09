import { Quaternion, Vector3 } from '@babylonjs/core';
import { CLOTHES_BY_ID } from './MallCatalog.js';
import { ITEMS } from '../gameplay/ShopData.js';
import { GarmentSet } from './ClothesModels.js';
import { FashionPrint } from './FashionPrint.js';
import { ClothingRacks } from './ClothingRacks.js';
import { FittingRoom, TryOn } from './FittingRoom.js';
import { ClothingTill } from './ClothingTill.js';
import { MirrorView } from './MirrorView.js';
import { Timeline, clamp, ease, lerp, wrap } from './Timeline.js';
import { alarm, tone } from './Tones.js';
import { Her } from './Her.js';

/**
 * Sakura Style, the mall's clothing store (MALL.md, layout.fashion):
 *  - racks stocked with the catalog's clothes on hangers, sneakers on shelves;
 *  - "Take": she reaches, unhooks the garment and carries it on its hanger
 *    from her right hand (up to three; the panel's ✕ hangs one back on the
 *    nearest free hook of its kind);
 *  - fitting rooms: she steps in, the curtain closes, the mirror shows her
 *    trying each piece on (FittingRoom.js);
 *  - the till: the cashier folds everything into a Sakura Style bag, she
 *    pays and carries the bag (ClothingTill.js); `takeBags()` hands the bags
 *    to the shopping module (cart, car boot);
 *  - leaving the store with unpaid clothes: a soft alarm and she turns back.
 * Every garment, also in her hand, is a thin instance of the store's garment
 * meshes moved by matrix writes, and the bags are prebuilt (another one, on
 * the same warmed-up material, only once every bag has gone out with her).
 */

export const MAX_CARRY = 3;
// Her body's centre from what she reaches for (for something above 1.6 m:
// REACH_HIGH), and her right shoulder from her centre: arm's reach (m).
const REACH = 0.36, REACH_HIGH = 0.24, SHOULDER = 0.14;
const BAG_POOL = 3;          // bags made at load: a trip's usual purchases
// The sneakers' heel top (pair space): it sits in her palm when she carries them.
const HEEL = new Vector3(0, 0.06, -0.125);
const _c = new Vector3(), _d = new Vector3();
const _q = new Quaternion();
const plural = (n) => `${n} item${n > 1 ? 's' : ''}`;

export class MallFashion {
  constructor(ctx) {
    this.ctx = ctx;
    this.her = new Her(ctx);
    this.timeline = new Timeline();
    this.carried = [];        // [{ id, item, unit, kept, blend }] on hangers in her right hand
    this.bags = [];           // [{ mesh, items }] paid, hanging from her right hand
    this.settling = [];       // units easing onto a hook / the counter / into a bag
    this.handFree = false;    // an action has her right hand (reaching)
    this.session = null;      // the fitting room she is in (TryOn)
    this._carryW = 0;
    this._sway = { on: false, a: 0, v: 0, px: 0, pz: 0, vx: 0, vz: 0 };
    this._palm = new Vector3();
    const prompt = (icon, priority) => ({ label: '', icon, priority, distance: 0, run: null, key: null });
    this._prompts = { take: prompt('🧥', 2), full: prompt('✋', 1), room: prompt('🚪', 3), pay: prompt('🛍', 3) };
    this._inStore = false;
    this._lastIn = { x: 0, z: 0 };
    this._ver = 0;            // bumped when what she carries changes (the panel redraws)
    this._panelKey = -1;
  }

  async init() {
    const { scene, layout, engine, camera } = this.ctx;
    const fashion = layout.fashion || {};
    this.zone = fashion.zone;
    this.set = new GarmentSet(scene);
    this.print = new FashionPrint(scene);
    this.racks = new ClothingRacks(fashion.racks || []);
    this.racks.stock(this.set, CLOTHES_BY_ID);
    this.rooms = (fashion.fittingRooms || []).map((d) => new FittingRoom(scene, d));
    this.till = fashion.till ? new ClothingTill(this, fashion.till) : null;
    // Pooled for the till: one folded garment per item she can carry.
    this.folded = Array.from({ length: MAX_CARRY }, () => this.set.add('folded', '#ffffff'));
    this.set.build(this._bounds(fashion));
    for (const s of this.racks.slots) this.racks.put(this.set, s);
    for (const u of this.folded) { this.set.setVisible(u, false); this.set.place(u, 0, -1, 0, 0); }
    this.set.flush();
    this.print.cards(this.racks.cards);
    this.bagPool = Array.from({ length: BAG_POOL }, (_, i) => this.print.bag(`mall:fashionBag${i}`));
    this.mirror = new MirrorView({ camera, engine, root: document.getElementById('ui') });
    await this.till?.init();
    this.ctx.graphics.addCasters([...this.set.casters, ...this.bagPool]);
  }

  /** Everywhere a garment can be: the store's zone, its racks, rooms and till (for culling). */
  _bounds(f) {
    const xs = [], zs = [];
    const add = (x, z) => { if (Number.isFinite(x) && Number.isFinite(z)) { xs.push(x); zs.push(z); } };
    if (f.zone) { add(f.zone.x0, f.zone.z0); add(f.zone.x1, f.zone.z1); }
    for (const s of this.racks.slots) add(s.x, s.z);
    for (const r of f.fittingRooms || []) { add(r.door.x, r.door.z); add(r.inside.x, r.inside.z); add(r.mirror.x, r.mirror.z); }
    if (f.till) { add(f.till.stand.x, f.till.stand.z); add(f.till.register[0], f.till.register[2]); }
    if (!xs.length) add(0, 0);
    const pad = 1.5;   // her reach and the walk back from the door
    return {
      min: new Vector3(Math.min(...xs) - pad, -1.2, Math.min(...zs) - pad),
      max: new Vector3(Math.max(...xs) + pad, 3, Math.max(...zs) + pad),
    };
  }

  /** Controls belong to an animation: taking, the fitting room, paying, the walk back in. */
  get busy() { return this.timeline.running || !!this.session; }

  /** She has clothes or a paid bag in her right hand. */
  get handsFull() { return this.carried.length > 0 || this.bags.length > 0; }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.timeline.update(dt);
    for (const r of this.rooms) r.update(dt);
    this.till?.update(dt);
    this.session?.update(dt);
    this.mirror.update(dt);
    this._hand(dt);
    this._settle(dt);
    this.set.flush();
    this._guardDoor();
    this._renderPanel();
  }

  /** Her right hand: the carry pose's weight, and what hangs from her palm. */
  _hand(dt) {
    const act = this.ctx.animation.act;
    const own = this.handsFull;
    if (own || this._carryW > 0) {
      const target = own && !this.handFree ? 1 : 0;
      this._carryW = this.handFree ? 0 : lerp(this._carryW, target, 1 - Math.exp(-8 * dt));
      if (this._carryW < 0.002 && !target) this._carryW = 0;
      act.bag = this._carryW;
      // Fingers closed on the hangers / handles whenever there is something in them.
      act.holdR = own ? 1 : this._carryW;
    }
    const s = this._sway;
    if (!own) { s.on = false; return; }
    const palm = this.palm(this._palm);
    const yaw = this.ctx.player.yaw, rx = -Math.cos(yaw), rz = Math.sin(yaw);
    // A soft pendulum: the hangers swing back as she sets off and forward as she stops.
    if (!s.on) { s.on = true; s.px = palm.x; s.pz = palm.z; s.vx = s.vz = s.a = s.v = 0; }
    if (dt > 0) {
      const vx = (palm.x - s.px) / dt, vz = (palm.z - s.pz) / dt;
      const acc = ((vx - s.vx) * Math.sin(yaw) + (vz - s.vz) * Math.cos(yaw)) / dt;
      s.vx = vx; s.vz = vz;
      s.v += (-60 * s.a - 5 * s.v - clamp(acc, -30, 30) * 0.9) * dt;
      s.a = clamp(s.a + s.v * dt, -0.5, 0.5);
    }
    s.px = palm.x; s.pz = palm.z;
    for (let i = 0; i < this.bags.length; i++) {
      const m = this.bags[i].mesh;
      m.position.set(palm.x + rx * 0.015 * i, palm.y + 0.01, palm.z + rz * 0.015 * i);
      m.rotation.set(0, yaw + Math.PI / 2, -s.a * 0.6);
    }
    for (let i = 0; i < this.carried.length; i++) {
      const c = this.carried[i], out = this._out(i);
      let x, y, z, cy, roll = 0, pitch = 0;
      if (c.unit.shape === 'sneakers') {
        // Held by the heels, toes down, the pair along her stride.
        cy = yaw + Math.PI / 2; pitch = -Math.PI / 2;
        Quaternion.RotationYawPitchRollToRef(cy, pitch, 0, _q);
        HEEL.rotateByQuaternionToRef(_q, _c);
        x = palm.x + rx * (out + 0.04) - _c.x; y = palm.y - _c.y; z = palm.z + rz * (out + 0.04) - _c.z;
      } else {
        // The hook through her fingers, the garment's face to her right.
        cy = yaw - Math.PI / 2 + i * 0.07; roll = s.a * (1 - i * 0.15);
        x = palm.x + rx * out; y = palm.y + 0.015; z = palm.z + rz * out;
      }
      const b = c.blend;
      if (b) {
        b.t += dt;
        const k = ease(b.t / b.d);
        x = lerp(b.x, x, k); y = lerp(b.y, y, k); z = lerp(b.z, z, k);
        cy = b.yaw + wrap(cy - b.yaw) * k; roll = lerp(b.roll, roll, k); pitch = lerp(b.pitch, pitch, k);
        if (b.t >= b.d) c.blend = null;
      }
      this.set.place(c.unit, x, y, z, cy, roll, pitch);
    }
  }

  /** How far out along her fingers the i-th thing she carries hangs: hangers outside the bag handles, each further out. */
  _out(i) {
    let out = this.bags.length ? 0.07 : 0.02;
    for (let k = 0; k < i; k++) out += this.carried[k].unit.shape === 'sneakers' ? 0.12 : 0.04;
    return out;
  }

  /**
   * Where her palm goes for the i-th thing she carries (a hanger's hook, a
   * pair's heels) to be at (x, y, z), her facing yaw: so a garment comes off
   * its hook (or goes back on) where her hand is, not across the air.
   */
  palmFor(i, shoes, x, y, z, yaw) {
    const out = this._out(i), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    if (shoes) return { x: x - rx * (out + 0.04), y: y + 0.06, z: z - rz * (out + 0.04) };
    return { x: x - rx * out, y: y - 0.015, z: z - rz * out };
  }

  /** Units easing from where they were to a hook, the counter, the bag. */
  _settle(dt) {
    for (let i = 0; i < this.settling.length; i++) {
      const e = this.settling[i];
      e.t += dt;
      const k = ease(e.t / e.d), f = e.from, to = e.to;
      this.set.place(e.unit, lerp(f.x, to.x, k), lerp(f.y, to.y, k) + Math.sin(k * Math.PI) * e.arc, lerp(f.z, to.z, k),
        f.yaw + wrap(to.yaw - f.yaw) * k, lerp(f.roll, to.roll, k), lerp(f.pitch, to.pitch, k));
      if (e.t >= e.d) { this.settling.splice(i--, 1); e.done?.(); }
    }
  }

  /** Ease a unit from its current pose to a resting one (set up when an action step starts). */
  settle(unit, x, y, z, yaw, { roll = 0, pitch = 0, d = 0.3, arc = 0, done = null } = {}) {
    this._unsettle(unit);
    this.settling.push({
      unit, t: 0, d, arc, done,
      from: { x: unit.x ?? x, y: unit.y ?? y, z: unit.z ?? z, yaw: unit.yaw ?? yaw, roll: unit.roll || 0, pitch: unit.pitch || 0 },
      to: { x, y, z, yaw, roll, pitch },
    });
  }

  _unsettle(unit) {
    const i = this.settling.findIndex((e) => e.unit === unit);
    if (i >= 0) this.settling.splice(i, 1);
  }

  /** A garment comes into her hand, easing from where it hung. */
  attach(id, unit, extra = null) {
    this._unsettle(unit);
    const c = { id, item: CLOTHES_BY_ID[id], unit, kept: false, ...extra };
    c.blend = { t: 0, d: 0.3, x: unit.x, y: unit.y, z: unit.z, yaw: unit.yaw, roll: unit.roll || 0, pitch: unit.pitch || 0 };
    this.carried.push(c);
    this._ver++;
    return c;
  }

  /** A garment leaves her hand (onto a hook, the counter): `c`, or all of them. */
  drop(c = null) {
    if (!c) this.carried.length = 0;
    else this.carried.splice(this.carried.indexOf(c), 1);
    this._ver++;
  }

  /** Her palm (between the wrist and the knuckles), world space. */
  palm(out) { return this.her.palm(out); }

  /**
   * A step: she steps up to within arm's reach of (x, y, z), facing it, the
   * point to her right hand's side (from where `from` is, or she is); closer
   * for what hangs high (her arm reaches up less far out).
   */
  stepUp(x, y, z, from = null) {
    const her = this.her, reach = y > 1.6 ? REACH_HIGH : REACH;
    return her.goTo(() => {
      const fx = from?.x ?? her.x, fz = from?.z ?? her.z;
      const yaw = Math.atan2(x - fx, z - fz), sx = Math.sin(yaw), sz = Math.cos(yaw);
      return { x: x - sx * reach + Math.cos(yaw) * SHOULDER, z: z - sz * reach - Math.sin(yaw) * SHOULDER, yaw };
    });
  }

  /** Turn her from yaw0 to yaw as k goes 0 → 1. */
  turn(yaw0, yaw, k) {
    const p = this.ctx.player;
    p.yaw = yaw0 + wrap(yaw - yaw0) * ease(k);
    p._sync?.();
  }

  /**
   * Her right hand from where it is to `to` ({ x, y, z }: where her palm
   * goes) and back: steps for a reach (`act.reach`), with `at` run when it
   * arrives. She crouches (bends in) as far as it takes (at least `crouch`). Back to her side when she carries something (the carry pose's
   * wrist point, where act.bag takes over), else down to rest.
   */
  reachSteps(to, at, { out = 0.4, back = 0.35, lift = 0.06, crouch = 0, turn = null } = {}) {
    const act = this.ctx.animation.act, her = this.her;
    const from = { x: 0, y: 0, z: 0 };
    let c = 0;
    return [
      { d: out, step: (k, dt, first) => {
        if (first) {
          if (!act.reach) her.reachFromHand();
          her.palm(_d);
          from.x = _d.x; from.y = _d.y; from.z = _d.z;
          this.handFree = true;
          if (turn) turn.yaw0 = this.ctx.player.yaw;
          c = Math.max(crouch, her.crouchTo(to.x, to.y, to.z));
        }
        const m = ease(k);
        if (turn) this.turn(turn.yaw0, turn.yaw, k);
        her.palmTo(lerp(from.x, to.x, m), lerp(from.y, to.y, m) + Math.sin(m * Math.PI) * lift, lerp(from.z, to.z, m), 1);
        act.crouch = c * m;
      } },
      // The hand settles on it (the arm's solve lags its target by a frame).
      { d: 0.06, step: () => her.palmTo(to.x, to.y, to.z, 1), done: at },
      { d: back, step: (k, dt, first) => {
        const r = her.reach;
        if (first) { from.x = r.x; from.y = r.y; from.z = r.z; }
        const m = ease(k);
        if (this.handsFull) {
          // Back to the carry pose's point, where the reach hands over to it.
          her.side(_d);
          her.reachTo(lerp(from.x, _d.x, m), lerp(from.y, _d.y, m) + Math.sin(m * Math.PI) * lift, lerp(from.z, _d.z, m), 1);
        } else her.reachTo(from.x, from.y + 0.1 * m, from.z, 1 - m);
        act.crouch = c * (1 - m);
      }, done: () => {
        act.reach = null; act.crouch = 0;
        this.handFree = false;
        if (this.handsFull) this._carryW = 1;
      } },
    ];
  }

  // ------------------------------------------------------------ prompt
  prompt() {
    const { player, animation, vehicles } = this.ctx;
    // Her hands on a cart (act.hands): park it first.
    if (this.busy || vehicles?.driving || animation.act.hands) return null;
    const p = player.position, P = this._prompts, n = this.carried.length;
    // The till and the fitting rooms come before the racks around them.
    if (this.till && n) {
      const d = this.till.distance(p);
      if (d < 1.1) {
        const total = this.total(), key = n * 1e6 + total;
        if (P.pay.key !== key) { P.pay.key = key; P.pay.label = `Pay for ${plural(n)} · ${total} ◈`; }
        P.pay.distance = d;
        P.pay.run ||= () => this.till.pay();
        return P.pay;
      }
    }
    if (n) {
      for (const r of this.rooms) {
        const dr = r.distance(p);
        if (dr < 1.0 && !r.inUse) {
          if (P.room.key !== n) { P.room.key = n; P.room.label = `Try on · ${plural(n)}`; }
          P.room.distance = dr;
          P.room.target = r;
          P.room.run ||= () => this.tryOn(P.room.target);
          return P.room;
        }
      }
    }
    const s = this.racks.facing(p, player.yaw);
    if (!s) return null;
    if (n >= MAX_CARRY) {
      P.full.label ||= `Hands full · ${MAX_CARRY} items`;
      P.full.distance = this.racks.distance;
      P.full.run ||= () => this.ctx.hud.toast(`You can carry ${MAX_CARRY} items`, 'Try them on, pay, or hang one back (✕)');
      return P.full;
    }
    if (P.take.key !== s || P.take.item !== s.item) {
      const it = CLOTHES_BY_ID[s.item];
      P.take.key = s; P.take.item = s.item;
      P.take.icon = ITEMS[s.item].icon;
      P.take.label = `Take ${it.name} · ${it.price} ◈`;
    }
    P.take.distance = this.racks.distance;
    P.take.run ||= () => this.take(P.take.key);
    return P.take;
  }

  total() { return this.carried.reduce((s, c) => s + c.item.price, 0); }

  // ------------------------------------------------------------ actions
  /** Reach for the garment on that hook, lift it off the rail, bring it to her side. */
  take(s) {
    if (!s?.unit || this.carried.length >= MAX_CARRY || this.busy) return;
    const her = this.her;
    her.freeze(true);
    const id = s.item, unit = s.unit;
    // Her hand closes on the hanger's hook (the shoes' heels) where it will hang in her hand.
    const to = { x: 0, y: 0, z: 0 };
    this.timeline.play([
      this.stepUp(s.x, s.y, s.z),
      { d: 0, done: () => Object.assign(to, this.palmFor(this.carried.length, !!s.shoes, s.x, s.y, s.z, her.yaw)) },
      ...this.reachSteps(to, () => {
        s.unit = null;
        this.attach(id, unit);
        this._click();
      }, { lift: 0.04 }),
    ], () => her.freeze(false));
  }

  /**
   * ✕ in the panel: she walks to the nearest free hook of its kind (round
   * the tables and racks in the way: Her.goTo) and hangs it back.
   */
  putBack(index) {
    const c = this.carried[index];
    if (!c || this.busy) return;
    const { player, hud } = this.ctx;
    const s = this.racks.freeFor(c.item, player.position);
    if (!s) { hud.toast('No free hook', `The ${c.item.name} stays with you`); return; }
    const her = this.her, to = { x: 0, y: 0, z: 0 };
    her.freeze(true);
    // Her hand brings its hook onto the rail; it turns on its hook to hang square.
    this.timeline.play([
      her.goTo(() => this.racks.stand(s, player.position, { x: 0, z: 0, yaw: 0 })),
      this.stepUp(s.x, s.y, s.z),
      { d: 0, done: () => Object.assign(to, this.palmFor(this.carried.indexOf(c), c.unit.shape === 'sneakers', s.x, s.y, s.z, her.yaw)) },
      ...this.reachSteps(to, () => {
        this.drop(c);
        s.item = c.id;
        s.unit = c.unit;
        this.settle(c.unit, s.x, s.y, s.z, s.yaw, { d: 0.2 });
        this._click();
      }, { lift: 0.08 }),
    ], () => her.freeze(false));
  }

  /** Step into a fitting room and try the clothes on (FittingRoom.js). */
  tryOn(room) {
    if (this.busy || room.inUse || !this.carried.length) return;
    this.session = new TryOn(this, room, () => { this.session = null; });
    this.session.start();
  }

  /**
   * The paid Sakura Style bags, handed over to another module (the cart, the
   * car boot): [{ mesh, items: [catalog ids] }]. They leave her hand; the
   * meshes stay owned (and disposed) by this module, so the taker may move
   * and reparent them but must not dispose them.
   */
  takeBags() {
    const bags = this.bags;
    this.bags = [];
    return bags;
  }

  /**
   * A paid bag from another of the mall's shops (MallShops) into her right
   * hand, with the store's: it hangs and goes to the cart and the boot as
   * theirs do (`mesh` stays its shop's to dispose).
   */
  addBag(mesh, items) {
    this.bags.push({ mesh, items });
    this._ver++;
  }

  /**
   * An unused bag from the till's stack. Bags that went out stay out (in her
   * hand, a cart, the boot), so when all are, another is made: three made
   * the fourth purchase of a trip impossible.
   */
  freeBag() {
    let bag = this.bagPool.find((m) => !m.isEnabled(false));
    if (!bag) {
      bag = this.print.bag(`mall:fashionBag${this.bagPool.length}`);
      this.bagPool.push(bag);
      this.ctx.graphics.addCasters([bag]);
    }
    return bag;
  }

  // ------------------------------------------------------------ store door
  /** Leaving the store with unpaid clothes: a soft alarm and she turns back. */
  _guardDoor() {
    const z = this.zone;
    if (!z) return;
    const p = this.ctx.player.position;
    if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1) {
      this._inStore = true; this._lastIn.x = p.x; this._lastIn.z = p.z;
      return;
    }
    if (!this._inStore) return;
    this._inStore = false;
    if (!this.carried.length || this.busy) return;
    alarm(this.ctx.audio);
    this.ctx.hud.toast('Pay at the till first', 'These clothes aren’t paid for yet');
    // Back in by a step, the way she came out.
    const dx = this._lastIn.x - p.x, dz = this._lastIn.z - p.z, l = Math.hypot(dx, dz) || 1;
    const walk = { x: this._lastIn.x + (dx / l) * 1.0, z: this._lastIn.z + (dz / l) * 1.0, done: () => { walk.over = true; } };
    this.timeline.play([{ until: () => walk.over, step: (k, dt, first) => { if (first) this.ctx.player.autoWalk = walk; } }]);
  }

  _click() { tone(this.ctx.audio, [520, 780], { dur: 0.05, type: 'triangle', gain: 0.06 }); }

  // ------------------------------------------------------------ panel
  /** The clothes she carries, with ✕ to hang one back. */
  _renderPanel() {
    const busy = this.busy, show = this.carried.length > 0 && !this.session;
    const key = show ? this._ver * 2 + (busy ? 1 : 0) : -1;
    if (key === this._panelKey) return;
    this._panelKey = key;
    if (!show) { this.ctx.hud.panel('fashion', null); this._panelEl = null; return; }
    const rows = this.carried.map((c, i) => `<div class="basket-item"><span>${ITEMS[c.id].icon}</span><b><i class="swatch" style="background:${c.item.color}"></i> ${c.item.name}${c.kept ? ' ✓' : ''}</b><i>${c.item.price} ◈</i><button class="put" data-put="${i}" aria-label="Hang it back" ${busy ? 'disabled' : ''}>✕</button></div>`).join('');
    const el = this.ctx.hud.panel('fashion', `<div class="basket-head"><b>🧥 Sakura Style</b><span>${this.carried.length}/${MAX_CARRY} · ${this.total()} ◈</span></div>${rows}<small style="display:block;margin-top:6px;opacity:0.65;font-size:10.5px">Try on in a fitting room · pay at the till · ✕ hangs it back</small>`);
    if (el !== this._panelEl) {
      this._panelEl = el;
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => { const b = e.target.closest('[data-put]'); if (b) this.putBack(+b.dataset.put); });
    }
  }

  dispose() {
    const { player, shops, graphics, hud } = this.ctx;
    this.session?.abort();
    this.session = null;
    this.timeline.clear();
    this.her.rest();
    player.hold = false;
    player.autoWalk = null;
    shops.previewOutfit(null);
    hud.panel('fashion', null);
    this.mirror?.dispose();
    this.till?.dispose();
    if (this.set) { graphics.removeCasters([...this.set.casters, ...this.bagPool]); this.set.dispose(); }
    this.print?.dispose();
    this.carried = []; this.bags = []; this.settling = [];
  }
}
