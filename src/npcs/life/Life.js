import { places, freeSlot } from './Places.js';
import { Vector3 } from '@babylonjs/core';
import { NavGrid } from './NavGrid.js';
import { worldPosition } from '../../vehicles/VehicleKit.js';

/**
 * Resident life simulation.
 *
 * Every resident has a personality (sociable, curious, energetic, tidy), a
 * home area, a job that fits their role, and needs that grow over time:
 *   thirst  → buy a drink at a vending machine, drink it on a bench, bin it
 *   hunger  → a coffee and a snack at a café table
 *   energy  → sit down for a while (read, check the phone, doze off)
 *   social  → go and chat with a friend, or stop for a chat when passing one
 *   fun     → stroll, admire the blossoms, take photos, visit the shrine
 *   errand  → shopping (comes out with a bag), post a letter, catch a bus
 *   work    → their job (café owner wipes tables, gardener waters beds, ...)
 *   home    → go home for a while, then come back out
 *
 * Decisions score every option by need, personality, time since last done
 * and walking distance, then run as small multi-step plans. Walking follows
 * NavGrid routes (sidewalks, zebra crossings), stops at the kerb to check for
 * traffic, steps around people, and greets the heroine.
 */

const WALK = 0.95, STROLL = 0.7;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _stand = new Vector3(), _seat = new Vector3();

// Role keywords → job routine.
const JOBS = [
  [/café|cafe|baker/i, 'cafe'], [/vendor|stall|seller/i, 'stall'], [/garden|grounds/i, 'garden'],
  [/photograph|illustrator|painter|artist|sketch/i, 'photo'], [/courier/i, 'deliver'],
  [/student/i, 'study'], [/guide|planner|volunteer|librarian/i, 'guide'], [/musician/i, 'music'],
  [/repair|maintenance/i, 'repair'],
];

export class Life {
  constructor({ collision, state, minds, sakura = [] }) {
    this.minds = minds;
    this.collision = collision;
    this.state = state;
    this.nav = new NavGrid(collision);
    this.paths = 0;
    this.time = 0;
    this.views = [];
    this.sakura = sakura;
  }

  /** Called once per resident when the system starts. */
  init(item, index) {
    const sp = item.spec;
    const h = (n) => ((Math.sin((index + 1) * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const job = JOBS.find(([re]) => re.test(sp.role || ''))?.[1] || 'none';
    item.life = {
      home: { x: sp.x, z: sp.z },
      // Mission residents stay close to where players expect to find them.
      range: sp.mission ? 9 : 55,
      job,
      traits: { social: 0.3 + h(1) * 0.7, curious: 0.3 + h(2) * 0.7, energetic: 0.3 + h(3) * 0.7, tidy: h(4) },
      needs: { thirst: h(5) * 0.6, hunger: h(6) * 0.5, energy: 0.5 + h(7) * 0.5, social: h(8) * 0.7, fun: h(9) * 0.6, errand: h(10) * 0.6, work: sp.mission ? 0.8 : h(11) * 0.4, home: h(12) * 0.3 },
      last: {},
      state: 'think', wait: index * 0.35 + 0.5,
      plan: [], step: null, path: null, pi: 0,
      act: null, actT: 0, actK: 0, seat: null, slot: null, hidden: false,
      greeted: -999, chatWith: null, chatCool: 10 + h(13) * 20, curb: null,
      friends: [],
    };
  }

  /** New game: a fresh day for this resident (off any bike, out of any seat or shop). */
  reset(item, index) {
    const L = item.life;
    if (L.riding) { L.riding.v.npcRider = null; L.riding.v.driven = false; }
    this._release(item);
    const friends = L.friends;
    this.init(item, index);
    item.life.friends = friends;
    this.hold(item, null);
  }

  /** After all residents are initialised: friends are the nearest homes. */
  link(items) {
    for (const a of items) {
      a.life.friends = items.filter((b) => b !== a)
        .sort((p, q) => Math.hypot(p.life.home.x - a.life.home.x, p.life.home.z - a.life.home.z) - Math.hypot(q.life.home.x - a.life.home.x, q.life.home.z - a.life.home.z))
        .slice(0, 3);
    }
    // Things worth looking at: blossoms, the fountain, the shrine gate.
    for (const [x, , z] of this.sakura) this.views.push({ x, z, kind: 'sakura' });
  }

  // ------------------------------------------------------------ per frame
  /**
   * Advance one resident. Returns { moving, speed, facing, act, actK, seated,
   * y } for NPCSystem to apply (position is moved in place).
   */
  update(item, dt, ctx) {
    const L = item.life;
    if (!L) return null;
    this.now = ctx.time;
    this.vehicles = ctx.vehicles;
    const n = L.needs, tr = L.traits;
    // Needs grow (per second); tuned so each resident changes activity every minute or two.
    n.thirst = clamp(n.thirst + dt * 0.0045, 0, 1);
    n.hunger = clamp(n.hunger + dt * 0.003, 0, 1);
    n.energy = clamp(n.energy - dt * 0.0035 * (1.4 - tr.energetic * 0.6) * (L.state === 'walk' ? 1.4 : 1), 0, 1);
    n.social = clamp(n.social + dt * 0.004 * tr.social, 0, 1);
    n.fun = clamp(n.fun + dt * 0.0035 * tr.curious, 0, 1);
    n.errand = clamp(n.errand + dt * 0.0025, 0, 1);
    n.work = clamp(n.work + dt * (item.spec.mission ? 0.009 : 0.003), 0, 1);
    n.home = clamp(n.home + dt * 0.0016, 0, 1);
    if (L.chatCool > 0) L.chatCool -= dt;

    const out = { moving: false, speed: 0, facing: null, act: L.act, seated: !!L.seat, y: null };
    // Notice places around them about once a second (learning the town).
    L.lookT = (L.lookT || Math.random()) - dt;
    if (L.lookT <= 0 && this.minds && !L.hidden) { L.lookT = 1; this.minds.look(item); }

    // The heroine comes close: look at her, wave once in a while.
    this._noticePlayer(item, dt, ctx, out);

    switch (L.state) {
      case 'think': {
        L.wait -= dt;
        if (L.wait > 0 || !this.nav.ready) break;
        if (this.paths >= 2) break; // spread path searches over frames
        this._decide(item, ctx);
        break;
      }
      case 'walk': this._walk(item, dt, ctx, out); break;
      case 'do': this._do(item, dt, ctx, out); break;
      case 'inside': {
        L.wait -= dt;
        if (L.wait <= 0) this._leaveInside(item);
        break;
      }
      case 'door': {
        // Walking through a doorway (in or out), no collisions.
        const D = L.door;
        D.t += dt;
        const u = Math.min(1, D.t / D.dur);
        item.position.x = D.from.x + (D.to.x - D.from.x) * u;
        item.position.z = D.from.z + (D.to.z - D.from.z) * u;
        out.moving = true; out.speed = Math.hypot(D.to.x - D.from.x, D.to.z - D.from.z) / D.dur;
        out.facing = Math.atan2(D.to.x - D.from.x, D.to.z - D.from.z);
        if (u >= 1) {
          if (D.dirIn) { L.state = 'inside'; L.wait = D.stay; L.hidden = true; L.insideDoor = D.d; }
          else { L.door = null; L.state = 'think'; L.wait = 0; this._next(item); }
        }
        break;
      }
      case 'chat': this._chat(item, dt, ctx, out); break;
      case 'ride': this._ride(item, dt, ctx, out); break;
      default: L.state = 'think';
    }
    // Pose blend weight.
    const target = L.act ? 1 : 0;
    L.actK += (target - L.actK) * (1 - Math.exp(-dt * 5));
    L.actT += dt;
    out.act = L.act || L.lastAct;
    if (L.act) L.lastAct = L.act;
    out.actK = L.actK;
    out.actT = L.actT;
    out.seated = !!L.seat;
    return out;
  }

  // ------------------------------------------------------------ deciding
  _decide(item, ctx) {
    const L = item.life, n = L.needs, tr = L.traits, p = item.position;
    // A quest marker points at them (a favor to give, follow up or receive):
    // they stay within their range of home, where the marker leads her, and
    // never go into shops or homes (Ren was found 37 m away on courier runs,
    // Aoi 21 m away at a vending machine).
    const pinned = !!item.markerStatus;
    const near = (type, max = L.range) => {
      if (pinned) max = Math.min(max, L.range);
      const list = [];
      for (const pl of places) {
        if (pl.type !== type) continue;
        // Only places they know about.
        if (item.mind && !item.mind.knows.has(pl.id)) continue;
        const d = Math.hypot(pl.x - L.home.x, pl.z - L.home.z);
        if (d > max) continue;
        if (!freeSlot(pl)) continue;
        list.push({ pl, d: Math.hypot(pl.x - p.x, pl.z - p.z) });
      }
      list.sort((a, b) => a.d - b.d);
      return list;
    };
    const since = (k) => ctx.time - (L.last[k] ?? -1e9);
    const fresh = (k, secs) => clamp(since(k) / secs, 0, 1);
    const options = [];
    const add = (name, score, build) => { if (score > 0.05) options.push({ name, score: score * rnd(0.8, 1.2), build }); };
    const dist = (d) => 1 / (1 + d / 25);

    // Drink from a vending machine (then sit and drink it, then bin the can).
    const vend = near('vending', L.range + 15)[0];
    if (vend) add('drink', n.thirst * 1.3 * dist(vend.d) * fresh('drink', 90), () => this._planDrink(item, vend.pl));
    // Café: coffee and something sweet.
    const cafe = near('cafe', L.range + 10);
    if (cafe.length) add('cafe', (n.hunger * 0.9 + n.social * 0.3) * dist(cafe[0].d) * fresh('cafe', 120), () => [
      { go: cafe[0].pl, say: '☕' }, { act: 'drink', secs: rnd(30, 60), hold: 'cup', seat: true, chatty: true }, { done: 'cafe', need: ['hunger', 'energy'] },
    ]);
    // Rest on a bench / the fountain rim.
    const seats = [...near('bench'), ...near('fountain')].sort((a, b) => a.d - b.d);
    if (seats.length) {
      const s = seats[Math.min(seats.length - 1, Math.floor(Math.random() * Math.min(3, seats.length)))];
      const pastime = tr.curious > 0.6 ? 'read' : Math.random() < 0.5 ? 'phone' : 'sit';
      add('rest', (1 - n.energy) * 1.2 * dist(s.d), () => [
        { go: s.pl, say: pastime === 'read' ? '📖' : pastime === 'phone' ? '📱' : '😌' },
        { act: pastime, secs: rnd(25, 55), hold: pastime === 'read' ? 'book' : pastime === 'phone' ? 'phone' : null, seat: true, chatty: true },
        ...(n.energy < 0.25 && Math.random() < 0.5 ? [{ act: 'doze', secs: rnd(10, 20), seat: true, say: '💤' }] : []),
        { done: 'rest', need: ['energy'], gain: 0.8 },
      ]);
    }
    // Chat with a friend who is around.
    const friend = L.friends.find((f) => f.life && !f.life.hidden && f.life.state !== 'chat' && !f.dodge && Math.hypot(f.position.x - p.x, f.position.z - p.z) < 30
      && !(pinned && this._outOfRange(item, f.position)));
    if (friend && L.chatCool <= 0) add('visit', n.social * tr.social * 1.3, () => [{ meet: friend, say: '👋' }]);
    // Shopping.
    const shop = pinned ? [] : near('shop', L.range + 20).filter((s) => s.pl.inside);
    if (shop.length) {
      const s = shop[Math.floor(Math.random() * Math.min(3, shop.length))];
      add('shop', n.errand * 1.1 * dist(s.d) * fresh('shop', 150), () => [
        { go: s.pl, say: '🛍️' }, { enter: s.pl, secs: rnd(15, 40) }, { done: 'shop', need: ['errand'], hold: 'bag', carry: true },
      ]);
    }
    // Post a letter.
    const post = near('postbox', L.range + 25)[0];
    if (post) add('post', n.errand * 0.5 * dist(post.d) * fresh('post', 300), () => [
      { go: post.pl, hold: 'letter', say: '✉️' }, { act: 'press', secs: 1.6 }, { done: 'post', need: ['errand'], gain: 0.5, hold: null },
    ]);
    // Bus stop: wait, check the time, then head off somewhere further.
    const bus = near('bus', L.range + 20)[0];
    if (bus) add('bus', n.errand * 0.45 * dist(bus.d) * fresh('bus', 400), () => [
      { go: bus.pl, say: '🚌' }, { act: 'watch', secs: rnd(25, 50), seat: 'any', chatty: true }, { done: 'bus', need: ['errand'], gain: 0.6 },
    ]);
    // Shrine visit.
    const shrine = near('shrine', L.range + 30)[0];
    if (shrine) add('shrine', n.fun * 0.7 * dist(shrine.d) * fresh('shrine', 500), () => [
      { go: shrine.pl, say: '⛩️' }, { act: 'pray', secs: 11.5 }, { done: 'shrine', need: ['fun'], gain: 0.6 },
    ]);
    // Admire the blossoms, maybe take a photo.
    const view = this.views.filter((v) => Math.hypot(v.x - L.home.x, v.z - L.home.z) < L.range + (pinned ? 0 : 20)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[Math.floor(Math.random() * 3)];
    if (view) add('view', n.fun * tr.curious * 0.9 * fresh('view', 120), () => [
      { goto: this._around(view.x, view.z, 2.2), face: view, say: '🌸' },
      { act: item.spec.camera || L.job === 'photo' ? 'photo' : 'look', secs: rnd(8, 16) },
      { done: 'view', need: ['fun'], gain: 0.7 },
    ]);
    // Stroll somewhere in the neighbourhood.
    add('stroll', (0.25 + n.fun * 0.4) * tr.energetic, () => [
      { goto: this._around(L.home.x, L.home.z, L.range * 0.8), slow: true },
      { act: Math.random() < 0.3 ? 'stretch' : 'look', secs: rnd(3, 7) },
      { done: 'stroll', need: ['fun'], gain: 0.3 },
    ]);
    // Explore a part of town they don't know yet (curious people more often).
    if (this.minds && !item.spec.mission && !pinned) {
      const unk = this.minds.unexplored(item, L.range + 40);
      if (unk) add('explore', (0.15 + n.fun * 0.6) * tr.curious * fresh('explore', 200), () => [
        { goto: this._around(unk.x, unk.z, 3), say: '🧭' },
        { act: 'look', secs: rnd(5, 9) },
        { done: 'explore', need: ['fun'], gain: 0.6 },
      ]);
    }
    // Work: the role's routine around their place.
    const work = this._workPlan(item, near);
    if (work) add('work', n.work * (item.spec.mission ? 1.6 : 0.9), () => work);
    // Go home for a while (not mission residents: players come looking for them).
    if (!item.spec.mission && !pinned) {
      const door = this._homeDoor(item);
      if (door) add('home', n.home * 0.9 * fresh('home', 300), () => [
        { go: door, say: '🏠' }, { enter: door, secs: rnd(30, 70) }, { done: 'home', need: ['home', 'energy', 'hunger'], gain: 0.9 },
      ]);
    }
    if (!options.length) { L.wait = rnd(2, 5); return; }
    options.sort((a, b) => b.score - a.score);
    const pick = options[0];
    L.intent = pick.name;
    L.plan = pick.build();
    this._next(item);
  }

  _planDrink(item, vend) {
    const L = item.life;
    const steps = [{ go: vend, say: '🥤' }, { act: 'press', secs: 2.2, hold: 'can' }];
    // Drink it sitting nearby if there's a free seat, else standing.
    const seat = places.filter((p) => (p.type === 'bench' || p.type === 'fountain') && freeSlot(p) && Math.hypot(p.x - vend.x, p.z - vend.z) < 18)
      .sort((a, b) => Math.hypot(a.x - vend.x, a.z - vend.z) - Math.hypot(b.x - vend.x, b.z - vend.z))[0];
    if (seat) steps.push({ go: seat }, { act: 'drink', secs: rnd(14, 26), seat: true, chatty: true });
    else steps.push({ act: 'drink', secs: rnd(10, 18) });
    // Tidy people put the can in a bin.
    const bin = places.filter((p) => p.type === 'trash' && Math.hypot(p.x - (seat || vend).x, p.z - (seat || vend).z) < 25)[0];
    // Thirst is quenched once it's drunk; binning the can is an extra.
    steps.push({ done: 'drink', need: ['thirst'], hold: bin && L.traits.tidy > 0.25 ? 'can' : null });
    if (bin && L.traits.tidy > 0.25) steps.push({ go: bin }, { act: 'press', secs: 1.4, hold: null });
    return steps;
  }

  _workPlan(item, near) {
    const L = item.life, j = L.job, hx = L.home.x, hz = L.home.z;
    const nearPost = (type) => near(type, 14).filter((x) => Math.hypot(x.pl.x - hx, x.pl.z - hz) < 14);
    switch (j) {
      case 'cafe': {
        const t = nearPost('cafe')[0];
        return t ? [{ goto: { x: t.pl.x + rnd(-0.5, 0.5), z: t.pl.z + 0.95 }, face: t.pl, say: '🧽' }, { act: 'wipe', secs: rnd(6, 10) }, { goto: this._around(hx, hz, 1.2) }, { act: 'look', secs: rnd(6, 12) }, { done: 'work', need: ['work'] }]
          : [{ goto: this._around(hx, hz, 2) }, { act: 'wipe', secs: 8 }, { done: 'work', need: ['work'] }];
      }
      case 'stall': return [{ goto: this._around(hx, hz, 2.5), say: '📣' }, { act: 'browse', secs: rnd(8, 14) }, { act: 'wave', secs: 2.5 }, { done: 'work', need: ['work'] }];
      case 'garden': return [{ goto: this._around(hx, hz, 4), hold: 'watering', say: '🌱' }, { act: 'crouch', secs: rnd(10, 18), low: true }, { done: 'work', need: ['work'], hold: null }];
      case 'photo': return [{ goto: this._around(hx, hz, 6), say: '📷' }, { act: 'photo', secs: rnd(6, 12) }, { done: 'work', need: ['work'] }];
      case 'deliver': {
        const doors = near('shop', 60);
        const d = doors[Math.floor(Math.random() * Math.min(4, doors.length))];
        return d ? [{ go: d.pl, hold: 'bag', say: '📦' }, { act: 'bow', secs: 2.4 }, { done: 'work', need: ['work'], hold: null }] : null;
      }
      case 'study': return [{ goto: this._around(hx, hz, 3) }, { act: 'read', secs: rnd(12, 25), hold: 'book', say: '📖' }, { done: 'work', need: ['work'], hold: null }];
      case 'guide': return [{ goto: this._around(hx, hz, 3) }, { act: 'point', secs: 2.5, say: '🗺️' }, { act: 'look', secs: rnd(6, 12) }, { done: 'work', need: ['work'] }];
      case 'music': return [{ goto: this._around(hx, hz, 3), say: '🎵' }, { act: 'listen', secs: rnd(10, 20) }, { done: 'work', need: ['work'] }];
      case 'repair': return [{ goto: this._around(hx, hz, 4), say: '🔧' }, { act: 'crouch', secs: rnd(8, 14), low: true }, { done: 'work', need: ['work'] }];
      default: return item.spec.mission ? [{ goto: this._around(hx, hz, 2) }, { act: 'look', secs: rnd(8, 14) }, { done: 'work', need: ['work'] }] : null;
    }
  }

  _homeDoor(item) {
    const L = item.life;
    if (L.homeDoor !== undefined) return L.homeDoor;
    let best = null, bd = 40;
    for (const p of places) {
      if (p.type !== 'shop' || !p.inside) continue;
      const d = Math.hypot(p.x - L.home.x, p.z - L.home.z);
      if (d < bd) { bd = d; best = p; }
    }
    L.homeDoor = best;
    return best;
  }

  /** Whether `pos` is further from this resident's home than their range (+ a little slack). */
  _outOfRange(item, pos) {
    const h = item.life.home;
    return Math.hypot(pos.x - h.x, pos.z - h.z) > item.life.range + 3;
  }

  /** A walkable point within r of (x, z). */
  _around(x, z, r) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.nav.walkable(px, pz) && !this.nav.isRoad(px, pz)) return { x: px, z: pz };
    }
    return this.nav.nearestWalkable(x, z, 4) || { x, z };
  }

  // ------------------------------------------------------------ plan steps
  _next(item) {
    const L = item.life;
    const s = L.plan.shift();
    L.step = s || null;
    if (!s) { L.state = 'think'; L.wait = rnd(0.5, 2.5); L.act = null; return; }
    if (s.say) this.say(item, s.say, 2.6);
    if ('hold' in s && !s.carry) this.hold(item, s.hold);
    // Long trip and a free bike close by: ride it there (not with a quest
    // marker over their head: the ride ends wherever there is room to park).
    if ((s.go || s.goto) && !s.byBike && !L.seat && !item.markerStatus) {
      const tx0 = s.go ? s.go.x : s.goto.x, tz0 = s.go ? s.go.z : s.goto.z;
      const far = Math.hypot(tx0 - item.position.x, tz0 - item.position.z);
      // Couriers always take a bike; others for longer trips.
      const courier = L.job === 'deliver';
      // The bike has to be well on the way: much closer than the destination.
      const bike = (far > (courier ? 8 : 20)) && (courier || Math.random() < 0.85) ? this._freeBike(item, Math.min(courier ? 30 : 22, far * 0.35)) : null;
      if (bike) {
        s.byBike = true;
        L.plan.unshift({ mount: bike, to: { x: tx0, z: tz0 } }, s);
        const side = bike.rig?.markers?.stand_L;
        const sp = side ? worldPosition(side, _stand) : { x: bike.x, z: bike.z };
        L.plan.unshift({ goto: { x: sp.x, z: sp.z }, face: bike, say: '🚲', byBike: true });
        return this._next(item);
      }
    }
    if (s.mount) {
      const v = s.mount;
      if (v.npcRider || v.driven || v.speed > 0.3) { this._next(item); return; }
      // Ride to a spot off the road near the destination.
      const park = this._around(s.to.x, s.to.z, 5);
      this.paths++;
      const path = this.nav.path(v.x, v.z, park.x, park.z, 90000, this.vehicles?.filter((o) => o !== v), true);
      if (!path) { this._next(item); return; }
      v.npcRider = item; v.driven = true; v.parked = 0;
      L.riding = { v, path, pi: 1, speed: 0, style: v.cfg.style, top: { bicycle: 4.2, scooter: 6.5, moto: 7.5 }[v.cfg.style] || 5 };
      L.state = 'ride'; L.act = 'ride'; L.actT = 0;
      return;
    }
    if (s.go || s.goto || s.meet) {
      // Stand up first if seated.
      if (L.seat) this._standUp(item);
      let tx, tz;
      if (s.go) {
        const slot = freeSlot(s.go, item.position.x, item.position.z);
        if (!slot) { L.plan = []; L.state = 'think'; L.wait = 1; return; }
        this._release(item);
        slot.by = item.id;
        L.slot = slot;
        // Seats: walk up to just in front of the seat, then step in.
        tx = slot.x; tz = slot.z;
        if (slot.pose === 'sit') { tx += Math.sin(slot.yaw) * 0.6; tz += Math.cos(slot.yaw) * 0.6; }
      } else if (s.meet) {
        const f = s.meet;
        tx = f.position.x; tz = f.position.z;
        L.meet = f;
        L.meetT = 0;
      } else { this._release(item); tx = s.goto.x; tz = s.goto.z; }
      this.paths++;
      const key = `${Math.round(tx)},${Math.round(tz)}`;
      const path = L.failed?.[key] > this.now ? null : this.nav.path(item.position.x, item.position.z, tx, tz, 90000, this.vehicles);
      if (!path) {
        // Unreachable from here: don't try this target again for a while.
        (L.failed ||= {})[key] = this.now + 120;
        this._release(item); L.plan = []; L.state = 'think'; L.wait = rnd(2, 4); return;
      }
      if (L.slot && s.go) path.push({ x: L.slot.x, z: L.slot.z, road: false });
      L.path = path; L.pi = 1; L.state = 'walk'; L.act = s.carry || item.heldKind === 'bag' ? 'carry' : null;
      L.speed = s.slow ? STROLL : WALK * (0.9 + L.traits.energetic * 0.2);
      L.prog = null;
      L.stuck = 0;
      return;
    }
    if (s.act) {
      L.state = 'do'; L.act = s.act; L.actT = 0; L.wait = s.secs;
      if (s.seat && L.slot?.pose === 'sit') this._sitDown(item);
      return;
    }
    if (s.enter) {
      // Walk in through the door; out of sight once inside.
      const d = s.enter, slot = d.slots[0], inside = d.inside || slot;
      L.state = 'door'; L.door = { t: 0, dur: 1.3, from: { x: item.position.x, z: item.position.z }, to: inside, dirIn: true, stay: s.secs, d };
      this._release(item);
      return;
    }
    if (s.done) {
      for (const k of s.need || []) L.needs[k] = Math.max(0, L.needs[k] - (s.gain ?? 1));
      if (s.done === 'rest' || s.done === 'home') L.needs.energy = 1;
      L.last[s.done] = this.now;
      // Put things down when an activity ends (bags are carried home).
      this.hold(item, 'hold' in s ? s.hold : (item.heldKind === 'bag' ? 'bag' : null));
      this._next(item);
    }
  }

  _walk(item, dt, ctx, out) {
    const L = item.life, p = item.position, path = L.path;
    if (L.waveT > 0) return; // stopped to wave at the heroine
    // Watchdog: no real progress for 8 s (blocked in some way nothing else
    // caught) → drop this trip and think again. Waiting at a kerb counts
    // too, after 20 s: the kerb state lasts until the crossing is done, so
    // exempting it let a resident stand in the road in 'walk' for minutes.
    L.prog ||= { x: p.x, z: p.z, t: 0 };
    L.prog.t += dt;
    if (L.prog.t > (L.curb ? 20 : 8)) {
      const moved = Math.hypot(p.x - L.prog.x, p.z - L.prog.z);
      L.prog.x = p.x; L.prog.z = p.z; L.prog.t = 0;
      if (moved < 0.6) { this._release(item); L.plan = []; L.meet = null; L.curb = null; L.state = 'think'; L.wait = rnd(1, 3); L.act = null; return; }
    }
    // Meeting a friend: keep heading for where they are now.
    if (L.meet) {
      const f = L.meet;
      // Don't chase a friend around town forever.
      L.meetT = (L.meetT || 0) + dt;
      if (L.meetT > 60) { L.meet = null; L.meetT = 0; this._release(item); L.plan = []; L.state = 'think'; L.wait = 1; return; }
      const d = Math.hypot(f.position.x - p.x, f.position.z - p.z);
      if (d < 1.4) {
        if (f.life.chatCool > 0 || f.life.state === 'chat' || f.life.state === 'inside') { L.meet = null; this._arrive(item); return; }
        this._startChat(item, f); return;
      }
      if (f.life.hidden || d > 40 || (item.markerStatus && this._outOfRange(item, f.position))) { L.meet = null; L.plan = []; L.state = 'think'; L.wait = 1; return; }
    }
    let wp = path[L.pi];
    if (!wp) { this._arrive(item); return; }
    // Kerb: before stepping onto the road, stop and check both ways for cars.
    if (wp.road && !this.nav.isRoad(p.x, p.z)) {
      if (!L.curb) L.curb = { t: 0 };
      L.curb.t += dt;
      const look = Math.sin(L.curb.t * 2.2) * 0.9;
      out.look = look;
      const danger = (ctx.vehicles || []).some((v) => {
        const sp = Math.abs(v.vF || 0);
        return sp > 0.8 && Math.hypot(v.x - p.x, v.z - p.z) < 6 + sp * 2.5;
      });
      if (L.curb.t < 1.1 || danger) { out.facing = Math.atan2(wp.x - p.x, wp.z - p.z); return; }
    } else if (!wp.road) L.curb = null;
    const dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
    const speed = L.speed * (this.nav.isRoad(p.x, p.z) ? 1.25 : 1);
    if (d < 0.25) { L.pi++; L.snags = 0; return; }
    let vx = dx / d, vz = dz / d;
    // Personal space: steer around other residents and the heroine.
    for (const o of ctx.items) {
      if (o === item || o.life?.hidden) continue;
      const ox = p.x - o.position.x, oz = p.z - o.position.z, od = Math.hypot(ox, oz);
      if (od > 0.01 && od < 0.9) { vx += (ox / od) * (0.9 - od) * 1.2; vz += (oz / od) * (0.9 - od) * 1.2; }
    }
    if (ctx.player) {
      const ox = p.x - ctx.player.x, oz = p.z - ctx.player.z, od = Math.hypot(ox, oz);
      if (od > 0.01 && od < 1.1) { vx += (ox / od) * (1.1 - od) * 1.6; vz += (oz / od) * (1.1 - od) * 1.6; }
    }
    const vl = Math.hypot(vx, vz) || 1;
    vx /= vl; vz /= vl;
    const step = Math.min(d, speed * dt);
    const probe = ctx.probe; probe.x = p.x + vx * step; probe.z = p.z + vz * step;
    // Last metre to a seat / counter: step straight in (seats sit inside
    // their furniture's collider).
    const final = L.pi === path.length - 1 && d < 1.3 && L.slot;
    if (final) { vx = dx / d; vz = dz / d; probe.x = p.x + vx * step; probe.z = p.z + vz * step; }
    const blocked = final ? false : this.collision.resolveCircle(probe, 0.22, p.y, 1.6, 0.3);
    const moved = Math.hypot(probe.x - p.x, probe.z - p.z);
    if (blocked && moved < step * 0.3) {
      L.stuck += dt;
      if (L.stuck > 1.5) {
        // Something new in the way (a parked car, a crowd): find another way.
        L.stuck = 0;
        L.snags = (L.snags || 0) + 1;
        const end = path[path.length - 1];
        // Sidestep first; after a few snags, give up on this plan.
        const side = (L.snags % 2 ? 1 : -1) * 0.5;
        p.x += -vz * side; p.z += vx * side;
        if (!this.nav.walkable(p.x, p.z)) { p.x -= -vz * side * 2; p.z -= vx * side * 2; }
        const np = L.snags < 4 && this.paths < 2 ? this.nav.path(p.x, p.z, end.x, end.z, 90000, ctx.vehicles) : null;
        this.paths++;
        if (np) { L.path = np; L.pi = 1; } else { L.snags = 0; this._release(item); L.plan = []; L.state = 'think'; L.wait = 1; L.act = null; }
      }
    } else L.stuck = Math.max(0, L.stuck - dt);
    p.x = probe.x; p.z = probe.z;
    // Feet follow the floor only (kerbs, steps), never furniture tops.
    p.y = this.floor(p.x, p.z, p.y);
    out.moving = true;
    out.speed = moved / Math.max(dt, 1e-4);
    out.facing = Math.atan2(vx, vz);
  }

  _arrive(item) {
    const L = item.life, s = L.step;
    L.path = null;
    if (s?.face) item.life.faceTo = Math.atan2(s.face.x - item.position.x, s.face.z - item.position.z);
    else if (L.slot) item.life.faceTo = L.slot.yaw;
    else item.life.faceTo = null;
    L.meet = null;
    this._next(item);
  }

  _do(item, dt, ctx, out) {
    const L = item.life, s = L.step;
    L.wait -= dt;
    if (L.faceTo != null) out.facing = L.faceTo;
    if (L.seat) out.y = L.seat.y;
    // Someone they know sits down beside them: have a chat.
    if (s?.chatty && L.chatCool <= 0 && L.needs.social > 0.35) {
      for (const o of ctx.items) {
        if (o === item || !o.life || o.life.state !== 'do' || !o.life.step?.chatty || o.life.chatCool > 0) continue;
        if (Math.hypot(o.position.x - item.position.x, o.position.z - item.position.z) < 1.6) {
          this._startChat(item, o, true);
          return;
        }
      }
    }
    if (L.wait <= 0) { L.act = null; this._next(item); }
  }

  // ------------------------------------------------------------ riding
  _freeBike(item, range = 25) {
    let best = null, bd = range;
    for (const v of this.vehicles || []) {
      // Not the showroom's (for sale, or hers once bought).
      if (!v.isBike || !v.rig || v.showroom || v.npcRider || v.driven || v.speed > 0.2) continue;
      const d = Math.hypot(v.x - item.position.x, v.z - item.position.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  _ride(item, dt, ctx, out) {
    const L = item.life, R = L.riding, v = R.v;
    const wp = R.path[R.pi];
    if (!wp) { this._dismount(item); return; }
    const dx = wp.x - v.x, dz = wp.z - v.z, d = Math.hypot(dx, dz);
    if (d < 0.8) { R.pi++; return; }
    // Speed: top speed on the road, gentle on pavements, slow into turns,
    // stop for people / vehicles ahead.
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    let target = this.nav.isRoad(v.x, v.z) ? R.top : Math.min(R.top, 2.4);
    const want = Math.atan2(dx, dz), turn = Math.abs(Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw)));
    target *= Math.max(0.35, 1 - turn * 0.6);
    if (R.pi >= R.path.length - 1) target = Math.min(target, 0.6 + d * 0.8);
    const ahead = (x, z, r) => { const ox = x - v.x, oz = z - v.z, along = ox * fx + oz * fz; return along > 0 && along < 2 + R.speed * 1.2 && Math.abs(ox * fz - oz * fx) < r; };
    if (ctx.player && ahead(ctx.player.x, ctx.player.z, 1.2)) target = 0;
    for (const o of ctx.items) if (o !== item && !o.life?.hidden && !o.life?.riding && ahead(o.position.x, o.position.z, 0.8)) target = 0;
    // Vehicles: only ones actually in the lane ahead.
    for (const o of ctx.vehicles || []) if (o !== v && ahead(o.x, o.z, (o.dims?.w || 1.6) / 2 + 0.35)) target = 0;
    R.speed += Math.max(-4 * dt, Math.min(2 * dt, target - R.speed));
    // Blocked for a while: off the road, park it here and walk the rest; on
    // the road, find another way to the parking spot (never park in traffic).
    // Judge "stuck" by real progress over 5 s (creeping forward a few cm at
    // a time behind people doesn't count as moving).
    R.prog ||= { x: v.x, z: v.z, t: 0 };
    R.prog.t += dt;
    R.blocked = 0;
    if (R.prog.t > 5) {
      if (Math.hypot(v.x - R.prog.x, v.z - R.prog.z) < 1.2) R.blocked = 5;
      R.prog = { x: v.x, z: v.z, t: 0 };
    }
    if (R.blocked > 4) {
      if (!this.nav.isRoad(v.x, v.z)) { this._dismount(item); return; }
      R.blocked = 0;
      const end = R.path[R.path.length - 1];
      const np = this.nav.path(v.x, v.z, end.x, end.z, 90000, ctx.vehicles?.filter((o) => o !== v), true);
      if (np) { R.path = np; R.pi = 1; }
    }
    // Steer toward the waypoint at a rate a rider could manage.
    const yaw = v.yaw + Math.max(-2.2 * dt, Math.min(2.2 * dt, Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw))));
    const step = R.speed * dt;
    v.autoDrive(dt, v.x + Math.sin(yaw) * step, v.z + Math.cos(yaw) * step, yaw, R.speed);
    // Seat her on it.
    const seat = v.rig.markers.seat_D;
    const sp = worldPosition(seat, _seat);
    item.position.set(sp.x, sp.y - (item.hipH || 0.85) + 0.02, sp.z);
    out.facing = v.yaw;
    out.snapFacing = true;
    out.lean = v.lean || 0;
    const mk = v.rig.markers;
    R.gL ||= new Vector3(); R.gR ||= new Vector3();
    worldPosition(mk.grip_L, R.gL); worldPosition(mk.grip_R, R.gR);
    out.style = { style: R.style, gripL: R.gL, gripR: R.gR };
    out.y = item.position.y;
  }

  _dismount(item) {
    const L = item.life, v = L.riding.v;
    v.autoDrive(1 / 60, v.x, v.z, v.yaw, 0);
    // Its home stays where the town parks it: a new game puts it back there.
    v.npcRider = null; v.driven = false; v.parked = 1;
    v.vF = 0; v.r = 0;
    // Step off to the bike's left.
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    item.position.set(v.x + c * 0.65, this.collision.groundHeight(v.x + c * 0.65, v.z - s * 0.65, 0.22, v.y + 0.3, 0.4), v.z - s * 0.65);
    L.riding = null; L.act = null;
    L.state = 'think'; L.wait = 0;
    this._next(item);
  }

  // ------------------------------------------------------------ chatting
  _startChat(a, b, seated = false) {
    if (a.life.state === 'chat' || b.life.state === 'chat') return;
    const secs = rnd(10, 22);
    for (const [x, y] of [[a, b], [b, a]]) {
      const L = x.life;
      L.resume = L.state === 'do' && seated ? { act: L.act, wait: L.wait, step: L.step } : null;
      // Carry on afterwards (a visit is done once they've met).
      if (L.state === 'walk' && !seated) L.resumePlan = [L.step, ...L.plan].filter((s) => s && !s.meet);
      L.state = 'chat'; L.chatWith = y; L.wait = secs; L.actT = 0; L.chatEnd = this.now + secs;
      L.talkTurn = x === a;
      L.chatSeated = seated && !!L.seat;
      if (!L.seat && !seated) this._release(x);
      L.chatCool = 60 + rnd(0, 60);
      L.needs.social = 0;
    }
    this.say(a, '💬', 2.5);
    // News travels: places they know, and what they know about her.
    const shared = this.minds?.gossip(a, b);
    if (shared?.length) this.say(b, '❗', 2.2);
  }

  _chat(item, dt, ctx, out) {
    const L = item.life, o = L.chatWith;
    L.wait -= dt;
    if (L.seat) out.y = L.seat.y;
    if (o) out.facing = L.chatSeated ? (L.seat?.yaw ?? null) : Math.atan2(o.position.x - item.position.x, o.position.z - item.position.z);
    if (L.chatSeated && o) out.look = clamp(wrap(Math.atan2(o.position.x - item.position.x, o.position.z - item.position.z) - item.root.rotation.y), -1.1, 1.1);
    // Take turns talking (every ~4 s), laugh now and then.
    const turn = Math.floor(L.actT / 4) % 2 === (L.talkTurn ? 0 : 1);
    L.act = turn ? 'talk' : 'listen';
    if (Math.random() < dt * 0.06) this.say(item, ['😄', '💬', '🎵', '❓', '😊'][Math.floor(Math.random() * 5)], 2);
    if (L.wait <= 0 || this.now > L.chatEnd || !o || o.life.state !== 'chat' || o.life.chatWith !== item) {
      L.chatWith = null;
      if (L.resume) { L.state = 'do'; L.act = L.resume.act; L.wait = Math.max(3, L.resume.wait); L.step = L.resume.step; L.resume = null; }
      else if (L.resumePlan?.length) { L.plan = L.resumePlan; L.resumePlan = null; L.state = 'think'; L.wait = 0.3; this._next(item); }
      else { L.act = null; L.state = 'think'; L.wait = rnd(0.5, 2); if (L.seat) this._standUp(item); }
      this.say(item, '👋', 1.6);
    }
  }

  // ------------------------------------------------------------ seats, doors, hands
  _sitDown(item) {
    const L = item.life, s = L.slot;
    if (!s) return;
    item.position.x = s.x; item.position.z = s.z;
    L.seat = { y: s.seatY + 0.07 - (item.hipH || 0.85), yaw: s.yaw };
    L.faceTo = s.yaw;
  }

  _standUp(item) {
    const L = item.life;
    L.seat = null;
    // Step forward off the seat onto the floor in front of it.
    if (L.slot) {
      item.position.x += Math.sin(L.slot.yaw) * 0.45;
      item.position.z += Math.cos(L.slot.yaw) * 0.45;
    }
    // The walk map knows the floor height here (seats are blocked cells, so
    // use the nearest floor cell's height).
    const fl = this.nav.nearestWalkable(item.position.x, item.position.z, 1.5);
    if (fl) { item.position.x = fl.x; item.position.z = fl.z; }
    const ci = this.nav.cell(item.position.x, item.position.z);
    item.position.y = ci >= 0 ? this.nav.y[ci] : 0.15;
  }

  _release(item) {
    const L = item.life;
    if (L.slot && L.slot.by === item.id) L.slot.by = null;
    L.slot = null;
  }

  _leaveInside(item) {
    const L = item.life, d = L.insideDoor;
    L.hidden = false;
    const slot = d?.slots?.[0];
    if (!slot) { L.state = 'think'; L.wait = 0; this._next(item); return; }
    // Appear just inside and walk out through the door.
    const inside = d.inside || slot;
    item.position.x = inside.x; item.position.z = inside.z;
    item.root.rotation.y = item.facing = slot.yaw + Math.PI;
    const outX = slot.x + Math.sin(slot.yaw + Math.PI) * 0.6, outZ = slot.z + Math.cos(slot.yaw + Math.PI) * 0.6;
    L.state = 'door'; L.door = { t: 0, dur: 1.4, from: { x: inside.x, z: inside.z }, to: { x: outX, z: outZ }, dirIn: false };
  }

  /** Floor height: pavement / kerb / steps (≤ 0.2 m up), never seats or tables. */
  floor(x, z, feetY) {
    // At most a kerb's height up from where the feet are.
    return this.collision.groundHeight(x, z, 0.18, feetY, 0.2);
  }

  hold(item, kind) {
    item.life.wantHold = kind;
  }

  say(item, icon, secs) { item.life.say = { icon, secs }; }

  // ------------------------------------------------------------ the heroine
  _noticePlayer(item, dt, ctx, out) {
    const L = item.life, pl = ctx.player;
    if (!pl || L.hidden) return;
    const dx = pl.x - item.position.x, dz = pl.z - item.position.z, d = Math.hypot(dx, dz);
    // Climbing on things nearby: they look up at her, surprised.
    const high = pl.y - item.position.y > 1.2 && d < 12;
    if (high) {
      out.look = clamp(wrap(Math.atan2(dx, dz) - item.root.rotation.y), -1.2, 1.2);
      if (!L.sawClimb) { L.sawClimb = true; this.say(item, '❗', 2.5); }
    } else if (d > 14) L.sawClimb = false;
    const P = item.mind?.player;
    // Remember seeing her climb on things.
    if (high && !L.sawClimbLogged) { L.sawClimbLogged = true; this.minds?.witness([item], item.position, 'climb', 99, 'climb', 0.02); }
    if (!high) L.sawClimbLogged = false;
    // Wary of her (she drove at them): keep a little distance.
    if (P && P.affinity < -0.2 && d < 2.6 && (L.state === 'think' || L.state === 'do') && !L.seat) {
      if (Math.random() < dt * 0.6) { this.say(item, '😠', 2); L.plan = []; L.state = 'think'; L.wait = 0; L.act = null; }
    }
    // Friends notice her from further away, and sometimes come over to say hi.
    const greetR = P?.met ? 3.2 + Math.max(0, P.affinity) * 6 : 3.2;
    if (P?.met && P.affinity > 0.35 && d < 14 && d > 3 && L.state === 'think' && L.needs.social > 0.4 && ctx.time - L.greeted > 90 && Math.random() < dt * 0.4) {
      L.greeted = ctx.time;
      L.plan = [{ goto: { x: pl.x + (item.position.x - pl.x) / d * 1.6, z: pl.z + (item.position.z - pl.z) / d * 1.6 }, say: '😊' }, { act: 'wave', secs: 2.5 }, { done: 'hello', need: ['social'], gain: 0.5 }];
      L.intent = 'hello';
      this._next(item);
    }
    // Greeting when she walks up (not while busy with someone else).
    if (d < greetR && L.state !== 'chat' && L.state !== 'inside' && ctx.time - L.greeted > 40) {
      L.greeted = ctx.time;
      this.say(item, P?.met ? (P.affinity > 0.3 ? '😊' : '👋') : '👋', 2.2);
      if (L.state === 'walk' || L.state === 'think') {
        L.waveT = 2.2;
      }
    }
    if (L.waveT > 0) {
      L.waveT -= dt;
      out.waving = true;
      out.facing = Math.atan2(dx, dz);
    }
  }

}
