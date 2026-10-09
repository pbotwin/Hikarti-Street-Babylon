import { Vector3 } from '@babylonjs/core';
import { CLOTHES, GROCERIES } from './MallCatalog.js';
import { CART_AHEAD, GRIPS } from './ShopperGear.js';
import { showBubble } from '../npcs/life/Acts.js';

/**
 * A shopper's trip through Hikari Mall, as a plan of steps run one after
 * another:
 *   emerge   step out of their parked car
 *   cart     take a cart (or a hand basket) from a corral
 *   shelf    at a shelf or produce table: park the cart alongside, look,
 *            reach and take a product or two into the cart / basket
 *   rack     at a clothing rack: hold a garment up, hang it back or keep it
 *   fit      try it on in a free fitting room (curtain drawn, out of sight)
 *   shop     into one of the small shops (upstairs too): look round, and
 *            maybe buy something at its till (a paper bag)
 *   queue    line up at a checkout (or the clothing till), unload onto the
 *            belt, pay, take the bags
 *   return   push the cart back into a corral
 *   car      walk back to the car and get in
 * Walking follows the mall's walk graph (MallNav), rides the escalators
 * where it goes between the floors (standing on a step), steers around
 * people and carts, waits politely while she is in the way, and gives up on
 * a step that stays blocked. Each update writes what the body should do (moving, speed,
 * facing, act and hand targets) onto the shopper for MallShoppers to animate.
 */
const WALK = 1.05, PUSH = 0.85, TAKE = 2.3, HOLD_UP = 3.2, UNLOAD = 0.9, PAY = 3.4;
// Moving the cart in beside them / out again (s), and how far along beside
// them it stands (its centre from theirs, m): its basket within arm's reach.
const PARK = 0.7, BESIDE = 0.55;
// How long they wait for her to get out of their way before going round her
// (s): waiting reset their watchdog, so a shopper stood behind her for as
// long as she stood still (for good, when she stood in a corral).
const PATIENCE = 5;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const _p = new Vector3(), _spot = { x: 0, z: 0, yaw: 0 }, _probe = { x: 0, z: 0 }, _riding = { x: 0, y: 0, z: 0, yaw: 0 };
const BROWSE = [3, 7], PAY_AT = 2.6;      // s looking round a small shop; at its till

export class ShopperMind {
  /** env: { layout, nav, escalators, collision, gear, lines, till, player, shoppers, rooms(), corrals() } */
  constructor(env) {
    this.env = env;
    const L = env.layout;
    // The layout's shelves and tables, each with its facing (the layout itself is read only).
    this.shelves = [...(L.grocery?.shelves || []), ...(L.grocery?.bins || []).map((b) => ({ ...b, bin: true }))]
      .map((sh) => ({ ...sh, f: facing(sh) }));
    this.racks = L.fashion?.racks || [];
    this.shops = L.shops || [];
    this.byAisle = {};
    for (const p of GROCERIES) (this.byAisle[p.aisle] ||= []).push(p);
    this.byRack = {};
    for (const c of CLOTHES) (this.byRack[c.rack] ||= []).push(c);
  }

  // ------------------------------------------------------------ planning
  /**
   * A whole trip for `s` (its car at `s.bay`). `midway` puts them part-way
   * through it (the mall is already busy when she arrives): standing at one
   * of their stops, the earlier products already in the cart.
   */
  plan(s, midway) {
    // What they shop with (`kind` is what they hold now: none until they take it);
    // some only stroll round the small shops, upstairs too.
    const roll = Math.random();
    const stroll = this.shops.length && roll > 0.6 && roll < 0.8;
    s.want = stroll || (this.racks.length && (roll > 0.78 || !this.shelves.length)) ? null : roll < 0.42 ? 'cart' : 'basket';
    if (!s.want && !stroll && !this.racks.length) s.want = 'basket';
    s.clothes = !s.want && !stroll;
    const plan = [{ type: 'emerge' }];
    if (stroll) {
      for (const shop of this._stops(this.shops, 2 + Math.floor(Math.random() * 2))) {
        const b = pick(shop.browse);
        plan.push({ type: 'shop', shop, x: b.x, z: b.z, yaw: b.yaw, y: shop.y, buy: Math.random() < 0.55, wait: rnd(BROWSE[0], BROWSE[1]) });
      }
      plan.push(this._at({ type: 'car' }, s));
      s.plan = plan;
      s.stage = 'arrive';
      if (midway) this._skipAhead(s);
      this._next(s);
      return;
    }
    // Carts from the corral nearest their car (the last one of its nest: the slots run from
    // its closed end, and one deeper in has carts behind it), back into it on the way out.
    const corral = this._nearestCorral(s.bay), slots = corral?.slots?.length ? corral.slots : corral ? [corral] : [];
    const stacked = Math.max(1, Math.min(corral?.count ?? slots.length, slots.length));
    if (s.want && corral) plan.push(this._at({ type: 'cart', corral, slot: slots[stacked - 1] }));
    if (s.want) {
      const n = s.want === 'cart' ? 3 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 2);
      for (const shelf of this._stops(this.shelves, n)) plan.push(this._at({ type: 'shelf', shelf, n: s.want === 'cart' ? 1 + Math.floor(Math.random() * 2) : 1 }));
    } else {
      const racks = this._stops(this.racks, 2 + Math.floor(Math.random() * 3));
      racks.forEach((rack, k) => plan.push(this._at({ type: 'rack', rack, keep: k === racks.length - 1 || Math.random() < 0.25 })));
      // Half of them try on what they picked.
      if (Math.random() < 0.5) plan.push({ type: 'fit' });
    }
    if (s.want ? this.env.lines.length : this.env.till) plan.push({ type: 'queue' });
    if (s.want === 'cart' && corral) plan.push(this._at({ type: 'return', corral, slot: slots[Math.min(stacked, slots.length - 1)] }));
    plan.push(this._at({ type: 'car' }, s));
    s.plan = plan;
    s.stage = 'arrive';
    if (midway) this._skipAhead(s);
    this._next(s);
  }

  /** `n` stops in walking order: start anywhere, then one of the nearest unvisited (people wander). */
  _stops(list, n) {
    if (!list.length) return [];
    const left = [...list], out = [];
    let cur = left.splice(Math.floor(Math.random() * left.length), 1)[0];
    out.push(cur);
    while (out.length < n && left.length) {
      left.sort((a, b) => Math.hypot(a.x - cur.x, a.z - cur.z) - Math.hypot(b.x - cur.x, b.z - cur.z));
      cur = left.splice(Math.floor(Math.random() * Math.min(3, left.length)), 1)[0];
      out.push(cur);
    }
    return out;
  }

  _nearestCorral(p) {
    let best = null, bd = Infinity;
    for (const c of this.env.layout.cartCorrals || []) {
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** Where to stand for a step: { x, z, yaw } on it. */
  _at(st, s) {
    if (st.type === 'cart' || st.type === 'return') {
      // Behind the corral slot, facing along it (pulling a cart out / pushing one in).
      const { x, z, yaw = 0 } = st.slot;
      st.x = x - Math.sin(yaw) * CART_AHEAD; st.z = z - Math.cos(yaw) * CART_AHEAD; st.yaw = yaw;
    } else if (st.type === 'shelf') {
      // Close enough to reach the shelf's front (residents' arms reach ~0.45 m).
      const f = st.shelf.f, front = (st.shelf.depth || 0.5) / 2 + 0.42;
      st.u = (Math.random() - 0.5) * Math.max(0, (st.shelf.w || 1) - 0.5);
      st.x = st.shelf.x + f.x * front + f.z * st.u;
      st.z = st.shelf.z + f.z * front - f.x * st.u;
      st.yaw = Math.atan2(-f.x, -f.z);
    } else if (st.type === 'rack') {
      // In front of the rack (its `front` spot when the layout has one), a little to one side, facing it.
      const r = st.rack, fx0 = r.front ? r.front.x - r.x : Math.sin(r.yaw || 0), fz0 = r.front ? r.front.z - r.z : Math.cos(r.yaw || 0);
      const fl = Math.hypot(fx0, fz0) || 1, fx = fx0 / fl, fz = fz0 / fl, d = r.front ? Math.min(fl, 1) : 0.65, off = (Math.random() - 0.5) * 0.5;
      st.x = r.x + fx * d + fz * off; st.z = r.z + fz * d - fx * off;
      st.yaw = Math.atan2(-fx, -fz);
    } else if (st.type === 'car') {
      st.x = s.bay.door.x; st.z = s.bay.door.z; st.yaw = s.bay.door.yaw;
    }
    return st;
  }

  _skipAhead(s) {
    const gear = this.env.gear;
    const stops = [];
    s.plan.forEach((st, k) => { if (st.type === 'shelf' || st.type === 'rack' || st.type === 'shop') stops.push(k); });
    if (!stops.length) return;
    const k = pick(stops), st = s.plan[k];
    const before = s.plan.slice(0, k).filter((x) => x.type === 'shelf');
    s.plan = s.plan.slice(k);
    s.position.set(st.x, st.y ?? this.env.layout.building.floorY ?? 0, st.z);
    s.facing = s.facingTarget = st.yaw;
    s.stage = 'shop';
    if (!s.want) return;
    s.kind = s.want;
    gear.setKind(s.index, s.kind, st.x + Math.sin(st.yaw) * CART_AHEAD, st.z + Math.cos(st.yaw) * CART_AHEAD, st.yaw);
    if (s.kind === 'cart') this._cartAt(s, st.x + Math.sin(st.yaw) * CART_AHEAD, st.z + Math.cos(st.yaw) * CART_AHEAD, st.yaw);
    this._carry(s, 0);
    for (const b of before) {
      for (let n = 0; n < b.n; n++) {
        const g = gear.good(this._product(b.shelf));
        if (gear.aim(s.index, g, _p)) gear.land(g); else gear.drop(g);
      }
    }
  }

  _product(shelf) { return pick(this.byAisle[shelf.aisle] || GROCERIES); }

  _next(s) {
    const st = s.step = s.plan.shift() || null;
    s.t = 0;
    s.sub = 0;
    s.route.count = 0;
    s.ri = 0;
    s.snags = 0;
    if (!st) return;
    // A corral's open end is where it is now (she and the others have taken and returned carts since the plan).
    const end = (st.type === 'cart' || st.type === 'return') && this.env.corrals()?.end(st.corral, st.type === 'cart');
    if (end) { st.slot = end; this._at(st); }
    if (st.slot && st.corral) {
      // Into the corral along its rails, from before its open end (the corral's last slot):
      // straight at a slot from the side, their cart caught on the rails for good.
      const { x, z, yaw = 0 } = st.corral.slots[st.corral.slots.length - 1], back = CART_AHEAD + 1.2;
      st.via = { x: x - Math.sin(yaw) * back, z: z - Math.cos(yaw) * back };
    }
    if (st.type === 'queue') this._joinLine(s);
    else if (st.type === 'fit') this._toRoom(s, st);
    else if (st.type !== 'emerge') this.routeTo(s, st.x, st.z, st.y);
  }

  /** Plan the walk to (x, z) on the floor at y (the ground floor unless given) on the walk graph. */
  routeTo(s, x, z, y = 0) {
    const p = s.position;
    s.ri = 0;
    s.ride = null;
    s.prog.x = p.x; s.prog.z = p.z; s.prog.t = 0;
    const via = s.step?.via, r = s.route;
    this.env.nav.path(p.x, p.z, via?.x ?? x, via?.z ?? z, r, p.y, y);
    if (!via) return;
    // On from there to the goal itself.
    const last = r[r.count] || (r[r.count] = { x: 0, z: 0, ride: -1 });
    last.x = x; last.z = z; last.ride = -1;
    r.count++;
  }

  // ------------------------------------------------------------ per frame
  update(s, dt) {
    s.moving = false;
    s.steering = false;
    s.act = null;
    s.actK = 0;
    const st = s.step;
    if (!st) { s.done = true; return; }
    s.t += dt;
    if (s.talkT > 0) {
      // Talking with her: everything waits.
      s.talkT -= dt;
      s.act = 'talk';
      s.actK = 1;
      this._carry(s, dt);
      return;
    }
    switch (st.type) {
      case 'emerge': this._emerge(s); break;
      case 'cart': if (this._walkTo(s, st, dt)) this._takeCart(s, st); break;
      case 'shelf': if (this._walkTo(s, st, dt)) this._shelf(s, st, dt); break;
      case 'rack': if (this._walkTo(s, st, dt)) this._rack(s, st); break;
      case 'fit': if (this._walkTo(s, st, dt)) this._fit(s, st); break;
      case 'queue': this._queue(s, dt); break;
      case 'return': if (this._walkTo(s, st, dt)) this._returnCart(s, st); break;
      case 'car': if (this._walkTo(s, st, dt)) this._getIn(s); break;
      case 'shop': if (this._walkTo(s, st, dt)) this._shop(s, st); break;
      default: this._next(s);
    }
    this._pose(s);
  }

  /** Walk the planned route; true once standing at the step's spot (then turning to its yaw). */
  _walkTo(s, st, dt) {
    if (s.ri < s.route.count) {
      this._walk(s, dt);
      if (s.ri < s.route.count) return false;
      s.t = 0;
    }
    if (st.yaw != null) s.facingTarget = st.yaw;
    this._carry(s, dt);
    return true;
  }

  _walk(s, dt) {
    const env = this.env, p = s.position, route = s.route;
    const wp = route[s.ri], last = s.ri === route.count - 1;
    if (wp.ride >= 0 && env.escalators) { this._ride(s, wp, dt); return; }
    let dx = wp.x - p.x, dz = wp.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < (last ? 0.15 : 0.45)) { s.ri++; this._carry(s, dt); return; }
    dx /= d; dz /= d;
    // Watchdog: no progress for 6 s → plan the way again; after a few, skip the step.
    s.prog.t += dt;
    if (s.prog.t > 6) {
      const moved = Math.hypot(p.x - s.prog.x, p.z - s.prog.z);
      s.prog.x = p.x; s.prog.z = p.z; s.prog.t = 0;
      if (moved < 0.8) {
        // Stuck for good, or still behind her past their patience: on to the next step.
        if ((++s.snags > 2 || s.yieldT >= PATIENCE) && s.step.type !== 'car' && s.step.type !== 'queue') { this._drop(s); this._next(s); return; }
        // Half a minute short of their car's door: they are gone (not walking into a car for the rest of the trip).
        if (s.step.type === 'car' && s.snags > 4) { s.done = true; return; }
        const goal = route[route.count - 1];
        this.routeTo(s, goal.x, goal.z, s.step.y);
        return;
      }
    }
    const reach = s.kind === 'cart' ? 1.2 + CART_AHEAD : 1.2;
    // She is in the way: wait for her (with a smile after a moment), then go round her.
    const pl = env.player;
    const hx = pl.x - p.x, hz = pl.z - p.z, near = Math.abs(pl.y - p.y) < 1.5;
    const ahead = hx * dx + hz * dz, side = Math.abs(hx * dz - hz * dx);
    const inWay = near && ahead > 0 && ahead < reach && side < 0.8;
    if (inWay && s.yieldT < PATIENCE) {
      s.yieldT += dt;
      if (s.yieldT > 1.2 && !s.smiled) { s.smiled = true; showBubble(s, '😊', 2); }
      s.facingTarget = Math.atan2(dx, dz);
      s.prog.t = 0;
      this._carry(s, dt);
      return;
    }
    if (!inWay) s.yieldT = 0;
    if (s.smiled && Math.hypot(hx, hz) > 4) s.smiled = false;
    // Others: keep some space, pass what's ahead on the right, slow down behind it.
    this._vx = dx; this._vz = dz; this._slow = 1;
    for (const o of env.shoppers) {
      if (o === s || o.away) continue;
      this._avoid(s, o.position.x, o.position.z, dx, dz, reach);
      if (o.kind === 'cart') this._avoid(s, o.cart.x, o.cart.z, dx, dz, reach);
    }
    // Out of patience with her: passing her as anyone else.
    if (inWay) this._avoid(s, pl.x, pl.z, dx, dz, reach);
    let vx = this._vx, vz = this._vz;
    if (near) {
      const ox = -hx, oz = -hz, od = Math.hypot(ox, oz);
      if (od > 0.01 && od < 1.2) { vx += (ox / od) * (1.2 - od) * 1.6; vz += (oz / od) * (1.2 - od) * 1.6; }
    }
    const vl = Math.hypot(vx, vz) || 1;
    vx /= vl; vz /= vl;
    const speed = (s.kind === 'cart' ? PUSH : WALK) * s.pace * this._slow * (last ? clamp(d / 0.6, 0.35, 1) : 1);
    const step = Math.min(d, speed * dt);
    _probe.x = p.x + vx * step; _probe.z = p.z + vz * step;
    const c = env.collision;
    c.ignore = env.gear.cart(s.index)?.collider ?? null;
    c.resolveCircle(_probe, 0.24, p.y, 1.5, 0.3);
    c.ignore = null;
    const moved = Math.hypot(_probe.x - p.x, _probe.z - p.z);
    p.x = _probe.x; p.z = _probe.z;
    p.y = c.groundHeight(p.x, p.z, 0.18, p.y, 0.2);
    s.moving = true;
    s.moveSpeed = moved / Math.max(dt, 1e-4);
    s.facingTarget = Math.atan2(vx, vz);
    this._carry(s, dt);
  }

  /**
   * On an escalator (the route's next point is its far end): stepping on
   * where they are, standing on the step as it carries them, off at the
   * far end, on along the route.
   */
  _ride(s, wp, dt) {
    const p = s.position;
    s.ride ||= this.env.escalators.rider(wp.ride, p.x, p.z, s.rideState || (s.rideState = {}));
    const off = this.env.escalators.carry(s.ride, dt, _riding);
    p.x = _riding.x; p.y = _riding.y; p.z = _riding.z;
    s.facingTarget = _riding.yaw;
    s.moving = false;
    s.prog.t = 0;
    this._carry(s, dt);
    if (off) { s.ride = null; s.ri++; }
  }

  /** Personal space from a body or cart at (ox, oz), into this._vx / _vz / _slow. */
  _avoid(s, ox, oz, dx, dz, reach) {
    const p = s.position, rx = p.x - ox, rz = p.z - oz, rd = Math.hypot(rx, rz);
    if (rd > reach + 1) return;
    if (rd > 0.01 && rd < 0.95) { this._vx += (rx / rd) * (0.95 - rd) * 1.3; this._vz += (rz / rd) * (0.95 - rd) * 1.3; }
    const ahead = -(rx * dx + rz * dz), lat = rx * dz - rz * dx;
    if (ahead < 0.1 || ahead > reach || Math.abs(lat) > 0.7) return;
    // Pass on the right (to the left if it's already on the right).
    const sideK = (lat >= 0 ? 1 : -1) * (1 - ahead / reach) * 0.9;
    this._vx += dz * sideK; this._vz -= dx * sideK;
    this._slow = Math.min(this._slow, clamp((ahead - 0.3) / reach, 0.25, 1));
  }

  /** Cart or basket follows the body. */
  _carry(s, dt) {
    const env = this.env, p = s.position;
    if (s.kind === 'basket') {
      // Hanging from the left hand, beside the hip.
      const f = s.facing;
      env.gear.place(s.index, p.x - Math.cos(f) * 0.21 + Math.sin(f) * 0.06, p.y + s.look.height * 0.43, p.z + Math.sin(f) * 0.21 + Math.cos(f) * 0.06, f);
      return;
    }
    if (s.kind !== 'cart') return;
    const c = s.cart;
    if (!s.parked) {
      // Like a trailer: turns toward where it's pushed and rolls in front.
      c.yaw += wrap(s.facing - c.yaw) * (1 - Math.exp(-dt * (s.moving ? 6 : 3)));
      _probe.x = p.x + Math.sin(c.yaw) * CART_AHEAD;
      _probe.z = p.z + Math.cos(c.yaw) * CART_AHEAD;
      env.collision.ignore = env.gear.cart(s.index).collider;
      env.collision.resolveCircle(_probe, 0.28, p.y, 1, 0.3);
      env.collision.ignore = null;
      c.yaw = Math.atan2(_probe.x - p.x, _probe.z - p.z);
      c.x = p.x + Math.sin(c.yaw) * CART_AHEAD; c.z = p.z + Math.cos(c.yaw) * CART_AHEAD;
    }
    this._cartAt(s, c.x, c.z, c.yaw);
  }

  _cartAt(s, x, z, yaw) {
    const c = s.cart;
    c.x = x; c.z = z; c.yaw = yaw;
    this.env.gear.place(s.index, x, s.position.y, z, yaw);
  }

  /** The default pose when the step set none: hands on the cart, the basket on the left arm, a garment over the right. */
  _pose(s) {
    const gear = this.env.gear, h = s.hands;
    // The hand's place for a garment over the arm / a bag by the hip (what
    // it holds follows the posed hand: MallShoppers).
    if (s.carryGood) {
      const p = s.position, f = s.facing;
      s.carryAt.set(p.x + Math.cos(f) * 0.2 + Math.sin(f) * 0.22, p.y + s.look.height * 0.56, p.z - Math.sin(f) * 0.2 + Math.cos(f) * 0.22);
    } else if (s.bag) {
      const p = s.position, f = s.facing;
      s.carryAt.set(p.x + Math.cos(f) * 0.24 + Math.sin(f) * 0.04, p.y + s.look.height * 0.44, p.z - Math.sin(f) * 0.24 + Math.cos(f) * 0.04);
    }
    if (s.act) return;
    h.lean = 0; h.pitch = 0; h.l = null; h.r = s.carryGood || s.bag ? s.carryAt : null;
    if (s.kind === 'cart' && (!s.parked || s.steering)) {
      h.l = gear.point(s.index, GRIPS.cart.l, s.handL);
      h.r = gear.point(s.index, GRIPS.cart.r, s.handR);
      h.lean = 0.12;
    } else if (s.kind === 'basket') h.l = gear.point(s.index, GRIPS.basket, s.handL);
    if (h.l || h.r) { s.act = 'hands'; s.actK = 1; }
  }

  /** Free whatever loose good is in their hands (a step given up, the trip over). */
  _drop(s) {
    if (s.good) { this.env.gear.drop(s.good); s.good = null; }
    s.held = null;
    s.reaching = false;
  }

  // ------------------------------------------------------------ steps
  /** Out of the car: rise from inside it and step out to the door. */
  _emerge(s) {
    const b = s.bay, u = smooth(s.t / 1.2), k = 0.55 + u * 0.45;
    s.position.x = b.x + (b.door.x - b.x) * k;
    s.position.z = b.z + (b.door.z - b.z) * k;
    s.duck = 1 - u;
    s.facing = s.facingTarget = b.door.yaw + Math.PI;
    if (s.t > 1.2) { s.duck = 0; this._next(s); }
  }

  _takeCart(s, st) {
    if (s.t < 0.6) return;
    // The corral's own end cart when there is one (a new one when she has just taken the last).
    const cart = s.want === 'cart' ? this.env.corrals()?.lend(st.corral) : null;
    const { x, z, yaw = 0 } = cart || st.slot;
    s.kind = s.want;
    this.env.gear.setKind(s.index, s.kind, x, z, yaw, cart);
    if (s.kind === 'cart') this._cartAt(s, x, z, yaw);
    s.parked = false;
    s.stage = 'shop';
    this._carry(s, 0);
    this._next(s);
  }

  /** At a shelf: park the cart alongside, look along it, take `n` products, turn back to the cart. */
  _shelf(s, st, dt) {
    const f = st.shelf.f;
    if (s.sub === 0) {
      if (s.kind === 'cart') {
        // The cart along the shelf, the way it was going, pulled in beside them
        // (its basket within arm's reach), a little back from the shelf.
        const along = Math.atan2(f.z, -f.x), yaw = Math.cos(wrap(along - s.cart.yaw)) > 0 ? along : along + Math.PI;
        const q = s.park;
        q.x0 = s.cart.x; q.z0 = s.cart.z; q.yaw0 = s.cart.yaw;
        q.x = s.position.x + Math.sin(yaw) * BESIDE + f.x * 0.25; q.z = s.position.z + Math.cos(yaw) * BESIDE + f.z * 0.25; q.yaw = yaw;
        s.parked = true;
      }
      s.sub = 1; s.t = 0; s.k = 0; s.wait = rnd(1, 2.4);
    }
    // Their hands on the handle while the cart moves (_pose).
    s.steering = s.parked && s.t < PARK && (s.sub === 1 || s.sub === 3);
    if (s.steering) {
      const q = s.park, u = smooth(s.t / PARK), back = s.sub === 3;
      const x0 = back ? q.x : q.x0, z0 = back ? q.z : q.z0, y0 = back ? q.yaw : q.yaw0;
      const x1 = back ? s.position.x + Math.sin(q.yaw) * CART_AHEAD : q.x, z1 = back ? s.position.z + Math.cos(q.yaw) * CART_AHEAD : q.z;
      this._cartAt(s, x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, y0 + wrap(q.yaw - y0) * u);
      if (back) s.facingTarget = q.yaw;
      return;
    }
    if (s.sub === 1) {
      s.act = 'browse'; s.actK = smooth((s.t - (s.parked ? PARK : 0)) / 0.4);
      if (s.t > s.wait + (s.parked ? PARK : 0)) { s.sub = 2; s.t = 0; }
    } else if (s.sub === 2) {
      if (this._take(s, st, f)) {
        s.t = 0;
        if (++s.k >= st.n || !this.env.gear.room(s.index)) s.sub = 3;
      }
    } else {
      // Back behind the handle (the cart rolled out ahead of them again, above), and on.
      s.facingTarget = s.kind === 'cart' ? s.cart.yaw : st.yaw;
      if (s.t >= PARK) { s.parked = false; this._next(s); }
    }
  }

  /**
   * One product: the right hand reaches a shelf level within reach, takes it
   * and brings it to the cart / basket. True when done.
   */
  _take(s, st, f) {
    const gear = this.env.gear, sh = st.shelf, h = s.look.height, u = s.t / TAKE, T = s.reachAt, D = s.dropAt;
    if (!s.reaching) {
      s.reaching = true;
      const levels = sh.bin ? null : (sh.levels || []).filter((y) => y > 0.25 && y < h + 0.1);
      const y = sh.bin ? sh.y + 0.08 : levels.length ? pick(levels) + 0.08 : h * 0.6;
      const front = (sh.depth || 0.5) / 2 - 0.08, along = st.u + (Math.random() - 0.5) * 0.4;
      T.set(sh.x + f.x * front + f.z * along, y, sh.z + f.z * front - f.x * along);
      // The product now, its place in the cart / basket kept for it.
      s.good = gear.good(this._product(sh));
      if (!gear.aim(s.index, s.good, D)) { this._drop(s); return true; }
      D.y += 0.12;
    }
    const hd = s.hands;
    // Low shelves: bend over; high ones: look up.
    hd.lean = clamp((h * 0.55 - T.y) * 0.9, 0, 0.7) * smooth(u / 0.35);
    hd.pitch = clamp((h * 0.9 - T.y) * 0.6, -0.4, 0.6);
    hd.l = s.kind === 'basket' ? gear.point(s.index, GRIPS.basket, s.handL) : null;
    hd.r = s.handR;
    s.act = 'hands'; s.actK = 1;
    if (u < 0.4) restToward(s, T, smooth(u / 0.4));
    else if (u < 0.8) {
      // In the hand from the shelf's front to above its place in the cart / basket.
      const v = smooth((u - 0.4) / 0.4);
      s.held = s.good; s.heldShow = false;
      s.handR.set(T.x + (D.x - T.x) * v, T.y + (D.y - T.y) * v + Math.sin(v * Math.PI) * 0.12, T.z + (D.z - T.z) * v);
    } else {
      // Let go: it drops into its place.
      if (s.good) { gear.letGo(s.good); s.good = null; s.held = null; }
      restToward(s, D, 1 - smooth((u - 0.8) / 0.2));
    }
    if (u < 1) return false;
    s.reaching = false;
    return true;
  }

  /** At a rack: browse, hold a garment up in front of themselves, hang it back or keep it. */
  _rack(s, st) {
    const gear = this.env.gear, p = s.position;
    if (s.sub === 0) {
      s.act = 'browse'; s.actK = smooth(s.t / 0.4);
      if (s.t > 1.6) { s.sub = 1; s.t = 0; }
      return;
    }
    const T = s.reachAt;
    if (!s.reaching) {
      s.reaching = true;
      // A hook within arm's reach (the nearest few, one of them).
      const hooks = st.rack.hooks?.length ? st.rack.hooks : [[st.rack.x, 1.45, st.rack.z]];
      const near = hooks.filter(([x, , z]) => Math.hypot(x - p.x, z - p.z) < 1.25);
      const [x, y, z] = pick(near.length ? near : hooks);
      T.set(x, y - 0.1, z);
      s.good = gear.good(pick(this.byRack[st.rack.rack] || CLOTHES));
    }
    const u = s.t, f = s.facing, rx = Math.cos(f), rz = -Math.sin(f);
    // Held up by the hanger at shoulder height (front toward them), then back to the hook.
    const v = u < 0.6 ? 0 : u < 1.2 ? smooth((u - 0.6) / 0.6) : u < 1.2 + HOLD_UP ? 1 : 1 - smooth((u - 1.2 - HOLD_UP) / 0.6);
    _p.set(p.x + Math.sin(f) * 0.42, p.y + s.look.height * 0.78, p.z + Math.cos(f) * 0.42);
    const cx = T.x + (_p.x - T.x) * v, cy = T.y + (_p.y - T.y) * v, cz = T.z + (_p.z - T.z) * v;
    s.act = 'hands';
    s.actK = u < 0.6 ? smooth(u / 0.6) : u > 1.8 + HOLD_UP ? 1 - smooth((u - 1.8 - HOLD_UP) / 0.4) : 1;
    const hd = s.hands;
    hd.l = s.handL.set(cx - rx * 0.15, cy, cz - rz * 0.15);
    hd.r = s.handR.set(cx + rx * 0.15, cy, cz + rz * 0.15);
    hd.lean = 0; hd.pitch = 0.3 * v;
    // Held up between both hands (turned this way and that: MallShoppers) from when they reach it.
    if (u > 0.6) { s.held = s.good; s.heldShow = true; s.heldTurn = v * Math.sin(u * 1.4) * 0.25; }
    if (st.keep && u > 1.2 + HOLD_UP * 0.7) {
      // Kept: carried over the arm (to the till, or the queue).
      s.carryGood = s.good;
      s.good = null;
      s.held = null;
      s.reaching = false;
      this._next(s);
    } else if (u > 2.2 + HOLD_UP) {
      this._drop(s);
      this._next(s);
    }
  }

  /**
   * In a small shop: look round (at its shelves or tables); then, if they
   * buy something, to its till, pay (a paper bag), and on.
   */
  _shop(s, st) {
    if (s.sub === 0) {
      s.act = 'browse'; s.actK = smooth(s.t / 0.4);
      if (s.t < st.wait) return;
      if (!st.buy) { this._next(s); return; }
      const b = st.shop.buy;
      st.x = b.x; st.z = b.z; st.yaw = b.yaw;
      s.sub = 1; s.t = 0;
      this.routeTo(s, b.x, b.z, st.y);
      return;
    }
    s.act = 'press'; s.actK = smooth(s.t / 0.3);
    if (s.t < PAY_AT) return;
    if (!s.bag) s.bag = this.env.gear.takeBag();
    showBubble(s, '🛍️', 2);
    this._next(s);
  }

  /** Head for the nearest free fitting room (none free: skip it). */
  _toRoom(s, st) {
    let best = null, bd = Infinity;
    for (const r of this.env.rooms()) {
      const d = r.inUse ? Infinity : Math.hypot(r.data.door.x - s.position.x, r.data.door.z - s.position.z);
      if (d < bd) { bd = d; best = r; }
    }
    if (!best) { this._next(s); return; }
    st.room = best;
    st.x = best.data.door.x; st.z = best.data.door.z; st.yaw = best.data.door.yaw;
    this.routeTo(s, st.x, st.z);
  }

  /**
   * In the fitting room: claim it (she can't use it meanwhile; if she just
   * did, move on), step in, the curtain closes, a while out of sight, out.
   */
  _fit(s, st) {
    const room = st.room, d = room.data;
    if (s.sub === 0) {
      if (room.inUse) { this._next(s); return; }
      room.inUse = true;
      s.room = room;
      s.sub = 1; s.t = 0; s.wait = rnd(6, 11);
    }
    const inside = s.sub === 2;
    const u = s.sub === 1 ? smooth(s.t / 1.2) : s.sub === 3 ? 1 - smooth(s.t / 1.2) : 1;
    s.position.x = d.door.x + (d.inside.x - d.door.x) * u;
    s.position.z = d.door.z + (d.inside.z - d.door.z) * u;
    s.moving = s.sub !== 2;
    s.moveSpeed = s.moving ? 0.8 : 0;
    s.facingTarget = s.sub === 3 ? d.door.yaw + Math.PI : d.inside.yaw;
    s.hidden = inside;
    if (s.sub === 1 && s.t > 1.2) { room.draw(true); s.sub = 2; s.t = 0; }
    else if (s.sub === 2 && s.t > s.wait) { room.draw(false); s.sub = 3; s.t = 0; }
    else if (s.sub === 3 && s.t > 1.2) { this.leaveRoom(s); this._next(s); }
  }

  /** Out of the fitting room (also when the trip ends with them inside). */
  leaveRoom(s) {
    if (!s.room) return;
    s.room.draw(false);
    s.room.inUse = false;
    s.room = null;
    s.hidden = false;
  }

  _joinLine(s) {
    const env = this.env;
    const lines = s.want ? env.lines : [env.till];
    // The shortest line (roughly: people misjudge, and don't walk far for one).
    let best = null, bs = Infinity;
    for (const l of lines) {
      const score = l.size + Math.random() * 0.8 + Math.hypot(l.unload.x - s.position.x, l.unload.z - s.position.z) * 0.03;
      if (score < bs) { bs = score; best = l; }
    }
    s.line = best;
    best.join(s);
    s.stage = 'queue';
    best.spotOf(s, _spot);
    this.routeTo(s, _spot.x, _spot.z);
  }

  /** Queue, unload onto the belt, pay, bag up, out past the register. */
  _queue(s, dt) {
    const line = s.line, gear = this.env.gear;
    if (s.sub === 0) {
      // Waiting: keep up with the line.
      line.spotOf(s, _spot);
      const goal = s.route[s.route.count - 1];
      if (Math.hypot(goal.x - _spot.x, goal.z - _spot.z) > 0.3) this.routeTo(s, _spot.x, _spot.z);
      if (s.ri < s.route.count) { this._walk(s, dt); return; }
      s.facingTarget = _spot.yaw;
      this._carry(s, dt);
      if (line.canUnload(s)) {
        s.sub = 1; s.t = 0; s.paid = 0;
        // With a cart: they leave it standing and step in between it and the belt.
        s.k = s.kind === 'cart' && line.belt ? 0 : 1;
        if (!s.k) {
          const q = s.park, c = s.cart, B = line.belt.at, d = line.dir;
          const bx = B[0] - c.x, bz = B[2] - c.z, a = bx * d.x + bz * d.z, nl = Math.hypot(bx - d.x * a, bz - d.z * a) || 1;
          q.x0 = s.position.x; q.z0 = s.position.z;
          q.x = c.x + (bx - d.x * a) / nl * 0.5; q.z = c.z + (bz - d.z * a) / nl * 0.5;
          s.parked = true;
        }
      }
      return;
    }
    if (s.sub === 1) {
      // Unloading: product after product from the cart / basket onto the belt.
      s.facingTarget = line.dir.yaw;
      if (s.k !== 1) {
        // Into the gap beside the cart (k 0) / back behind its handle (k 2).
        const q = s.park, back = s.k === 2, u = smooth(s.t / PARK);
        const x0 = back ? q.x : q.x0, z0 = back ? q.z : q.z0, x1 = back ? q.x0 : q.x, z1 = back ? q.z0 : q.z;
        s.position.x = x0 + (x1 - x0) * u; s.position.z = z0 + (z1 - z0) * u;
        s.moving = s.t < PARK; s.moveSpeed = Math.hypot(x1 - x0, z1 - z0) / PARK;
        this._carry(s, dt);
        if (s.t < PARK) return;
        if (back) { s.parked = false; line.toRegister(s); s.sub = 2; s.t = 0; this.routeTo(s, line.stop.x, line.stop.z); return; }
        s.k = 1; s.t = 0;
      }
      this._carry(s, dt);
      if (!s.good) {
        s.good = line.belt ? gear.unstow(s.index) : null;
        if (!s.good) {
          if (s.parked) { s.k = 2; s.t = 0; return; }
          line.toRegister(s); s.sub = 2; s.t = 0; this.routeTo(s, line.stop.x, line.stop.z); return;
        }
        s.reachAt.set(s.good.unit.x, s.good.unit.y + s.good.entry.size.h, s.good.unit.z);
        s.t = 0;
      }
      // The hand to it in the cart / basket, then it is in the hand, over and down onto the belt.
      const u = s.t / UNLOAD, F = s.reachAt, B = line.belt.at, top = B[1] + s.good.entry.size.h * 0.5 + 0.03;
      if (u < 0.3) restToward(s, F, smooth(u / 0.3));
      else {
        const v = smooth((u - 0.3) / 0.7);
        s.held = s.good; s.heldShow = false;
        s.handR.set(F.x + (B[0] - F.x) * v, F.y + (top - F.y) * v + Math.sin(v * Math.PI) * 0.15, F.z + (B[2] - F.z) * v);
      }
      if (s.parked) s.facingTarget = Math.atan2((u < 0.3 ? F.x : B[0]) - s.position.x, (u < 0.3 ? F.z : B[2]) - s.position.z);
      const hd = s.hands;
      s.act = 'hands'; s.actK = 0.4 + Math.sin(clamp(u, 0, 1) * Math.PI) * 0.6;
      hd.l = s.kind === 'basket' ? gear.point(s.index, GRIPS.basket, s.handL) : null;
      hd.r = s.handR; hd.lean = 0.2; hd.pitch = 0.4;
      if (u >= 1) { line.onBelt(s.good); s.good = null; s.held = null; s.paid++; }
      return;
    }
    if (s.sub === 2) {
      // At the register: pay once everything has been scanned.
      if (s.ri < s.route.count) { this._walk(s, dt); s.t = 0; return; }
      s.facingTarget = line.stop.yaw;
      this._carry(s, dt);
      s.act = 'press'; s.actK = 1;
      if (s.t < PAY || line.riding.length) return;
      showBubble(s, '🛍️', 2);
      // Bags: in the cart, or in the hand (the basket stays at the till).
      if (s.kind === 'cart') gear.bagCart(s.index, Math.ceil(Math.max(1, s.paid) / 6));
      else {
        if (s.kind === 'basket') { gear.setKind(s.index, null); s.kind = null; }
        s.bag = gear.takeBag();
      }
      if (s.carryGood) { gear.drop(s.carryGood); s.carryGood = null; }
      line.leave(s);
      s.line = null;
      s.stage = 'leave';
      if (!line.exit) { this._next(s); return; }
      s.sub = 3;
      this.routeTo(s, line.exit.x, line.exit.z);
      return;
    }
    if (s.ri < s.route.count) { this._walk(s, dt); return; }
    this._next(s);
  }

  _returnCart(s, st) {
    if (s.t < 0.5) return;
    // The bags come out of the cart into a hand; the cart nests in the corral (gone if it is full).
    const gear = this.env.gear, cart = gear.leaveCart(s.index);
    if (cart && !this.env.corrals()?.nestBack(st.corral, cart)) cart.dispose();
    s.kind = null;
    s.bag = this.env.gear.takeBag();
    this._next(s);
  }

  /** Into the car: duck in through the door, gone. */
  _getIn(s) {
    const b = s.bay, u = smooth(s.t / 1.1);
    s.facingTarget = b.door.yaw;
    s.position.x = b.door.x + (b.x - b.door.x) * u * 0.5;
    s.position.z = b.door.z + (b.z - b.door.z) * u * 0.5;
    s.duck = u;
    if (s.t > 1.15) s.done = true;
  }
}

/** A shelf's facing (unit vector into the aisle): from `face` (a point in front, or a direction), else its yaw. */
function facing(sh) {
  if (sh.face) {
    const fx = sh.face.x - sh.x, fz = sh.face.z - sh.z, l = Math.hypot(fx, fz), dl = Math.hypot(sh.face.x, sh.face.z);
    if (dl > 0.9 && dl < 1.1) return { x: sh.face.x / dl, z: sh.face.z / dl };
    if (l > 0.05) return { x: fx / l, z: fz / l };
  }
  return { x: Math.sin(sh.yaw || 0), z: Math.cos(sh.yaw || 0) };
}

/** The right hand's target `k` of the way from its resting spot by the hip to `T` (into s.handR). */
function restToward(s, T, k) {
  const p = s.position, f = s.facing;
  const rx = p.x + Math.cos(f) * 0.2, ry = p.y + s.look.height * 0.45, rz = p.z - Math.sin(f) * 0.2;
  s.handR.set(rx + (T.x - rx) * k, ry + (T.y - ry) * k, rz + (T.z - rz) * k);
}
