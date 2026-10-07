import { TransformNode, Vector3 } from '@babylonjs/core';
import { animateResident, setMorph, syncPose } from '../npcs/NPCModels.js';
import { applyAct, makeBubble, showBubble, updateBubble } from '../npcs/life/Acts.js';
import { billboard } from '../npcs/Billboard.js';
import { MallNav } from './MallNav.js';
import { ShopperGear } from './ShopperGear.js';
import { ShopperMind } from './ShopperMind.js';
import { CheckoutLine } from './CheckoutLines.js';
import { shopperLine } from './ShopperTalk.js';

/**
 * Residents shopping at Hikari Mall (MALL.md): the same people as in the
 * city, so players recognise them. While the city sleeps its residents'
 * characters are lent to the mall (NPCSystem.lend): no second copy of any
 * model, shader or shadow caster, and nothing to load. Each shopper lives a
 * trip (ShopperMind): out of their parked car, a cart or basket, the aisles,
 * the racks, the checkout queue, back to the car; new ones arrive as others
 * drive off (a few more people than are in the mall at once, so whoever
 * comes next is someone else).
 *
 * Costs follow the city's residents: how many shop by graphics preset (and
 * fewer while the governor says the CPU is busy), hidden beyond the
 * residents' view distance, posed every frame only up close (every 2nd /
 * 4th further away), outlines only within the preset's outline distance.
 * Carts, baskets, bags and goods are shared thin instances (ShopperGear).
 */
const COUNT = { low: 6, medium: 9, high: 12, ultra: 14 };
const SPARE = 4;
const TALK_R = 2.2, GREET_R = 3.2, LABEL_R = 9;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class MallShoppers {
  constructor(ctx) {
    this.ctx = ctx;
    this.shoppers = [];
    this.time = 0;
    this.frame = 0;
    this._player = { x: 0, y: 0, z: 0 };
    this._prompt = { label: '', icon: '💬', priority: 1, distance: 0, run: () => this._talk() };
    this._talkTo = null;
  }

  async init() {
    const { scene, layout, npcs, collision, graphics } = this.ctx;
    this.max = COUNT[graphics.tier] ?? COUNT.medium;
    // Who shops today: residents whose characters are loaded, in random order.
    const ids = shuffle(npcs.items.filter((i) => i.vrm && !i.lent).map((i) => i.id)).slice(0, this.max + SPARE);
    this.gear = new ShopperGear(this.ctx, ids.length);
    this.nav = new MallNav(layout.nav, collision, layout.building.floorY);
    this.lines = (layout.checkouts || []).map((c) => new CheckoutLine(c, this.gear));
    this.till = layout.fashion?.till ? new CheckoutLine(layout.fashion.till, this.gear) : null;
    this.cars = parkedCars(layout);
    this.group = new TransformNode('mall shoppers', scene);
    this.group.freezeWorldMatrix();
    this.mind = new ShopperMind({ layout, nav: this.nav, collision, gear: this.gear, lines: this.lines, till: this.till, player: this._player, shoppers: this.shoppers,
      // The clothing store's fitting rooms (shared with her: `inUse` while someone is in one).
      rooms: () => this.ctx.fashion?.rooms || [] });
    for (const id of ids) {
      const item = npcs.lend(id);
      if (item) this.shoppers.push(this._shopper(item, this.shoppers.length));
    }
    // The automatic doors open for them too.
    this.ctx.world.walkers?.push(...this.shoppers);
    // The mall is already busy when she arrives; the rest drive in over the first minute.
    const now = Math.round(this.max * 0.7);
    this.shoppers.forEach((s, k) => {
      if (k < now) this._begin(s, true);
      else if (k < this.max) s.arriveT = rnd(4, 60);
    });
    this.arriveT = 0;
  }

  _shopper(item, index) {
    const scene = this.ctx.scene;
    const root = new TransformNode(`shopper-${item.id}`, scene);
    root.parent = this.group;
    root.setEnabled(false);
    item.vrm.root.parent = root;
    const label = billboard(scene, item.label.material, 1.45, 0.36, root);
    label.position.y = item.look.height + 0.42;
    const s = {
      index, item, id: item.id, name: item.name, look: item.look, vrm: item.vrm, root, label, position: root.position,
      away: true, shown: false, done: false, arriveT: Infinity, awayT: 0, bay: null,
      want: null, kind: null, room: null, hidden: false, clothes: false, stage: 'arrive', plan: [], step: null, t: 0, sub: 0, k: 0, wait: 0,
      route: Object.assign([], { count: 0 }), ri: 0, prog: { x: 0, z: 0, t: 0 }, snags: 0,
      facing: 0, facingTarget: 0, moving: false, moveSpeed: 0, speed: 0, walkPhase: 0, lookYaw: 0, pace: rnd(0.88, 1.1),
      act: null, actK: 0, hands: { l: null, r: null, lean: 0, pitch: 0 },
      handL: new Vector3(), handR: new Vector3(), reachAt: new Vector3(), dropAt: new Vector3(), carryAt: new Vector3(),
      reaching: false, good: null, carryGood: null, bag: null, paid: 0, line: null, parked: false,
      park: { x0: 0, z0: 0, yaw0: 0, x: 0, z: 0, yaw: 0 }, cart: { x: 0, z: 0, yaw: 0 },
      duck: 0, yieldT: 0, smiled: false, talkT: 0, waveT: 0, greeted: -999, mouth: 0, distance: Infinity,
      phase: index * 1.73,
    };
    makeBubble(s);
    return s;
  }

  /** Send `s` shopping (`midway`: already part-way through the trip). */
  _begin(s, midway = false) {
    s.bay = this._freeCar();
    s.away = false;
    s.done = false;
    s.duck = midway ? 0 : 1;
    s.talkT = 0; s.waveT = 0; s.yieldT = 0; s.smiled = false;
    s.parked = false;
    s.position.set(s.bay.x, this.ctx.collision.groundHeight(s.bay.x, s.bay.z, 0.2, 0, 0.3), s.bay.z);
    s.facing = s.facingTarget = s.bay.door.yaw;
    this.mind.plan(s, midway);
  }

  /** A parked car nobody is using (any one when all are). */
  _freeCar() {
    const used = new Set(this.shoppers.map((s) => (s.away ? null : s.bay)));
    const free = this.cars.filter((c) => !used.has(c));
    const list = free.length ? free : this.cars;
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Into their car: gone until it's their turn again. */
  _leave(s) {
    const gear = this.gear;
    s.line?.leave(s);
    s.line = null;
    this.mind.leaveRoom(s);
    if (s.good) { gear.drop(s.good); s.good = null; }
    if (s.carryGood) { gear.drop(s.carryGood); s.carryGood = null; }
    if (s.bag) { gear.releaseBag(s.bag); s.bag = null; }
    gear.setKind(s.index, null);
    s.kind = null;
    s.away = true;
    s.awayT = this.time;
    s.duck = 0;
    s.vrm.root.position.y = 0;
    this._show(s, false);
  }

  _show(s, on) {
    if (s.shown === on) return;
    s.shown = on;
    s.root.setEnabled(on);
  }

  update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.time += dt;
    this.frame++;
    const { player, npcs } = this.ctx;
    const pl = this._player, pp = player.position;
    pl.x = pp.x; pl.y = pp.y; pl.z = pp.z;
    for (const l of this.lines) { l.blocked = herAt(l, pl); l.update(dt); }
    if (this.till) this.till.blocked = herAt(this.till, pl);
    // Fewer shoppers while the governor says the CPU is busy (it draws residents nearer).
    const scale = npcs.distanceScale ?? 1, range = npcs.viewDistance * scale;
    this._arrivals(dt, Math.round(this.max * Math.min(1, scale)));
    const outlines = npcs.outlineDistance;
    for (let i = 0; i < this.shoppers.length; i++) {
      const s = this.shoppers[i];
      if (s.away) continue;
      this.mind.update(s, dt);
      if (s.done) { this._leave(s); continue; }
      const dx = pl.x - s.position.x, dz = pl.z - s.position.z, d = Math.hypot(dx, dz);
      s.distance = d;
      // 3 m of hysteresis, as the city's residents: no popping at the edge.
      this._show(s, !s.hidden && d < (s.shown ? range + 3 : range));
      if (!s.shown) continue;
      const toHer = Math.atan2(dx, dz);
      // Greeting her as she comes by: a wave and a smile, now and then.
      if (d < GREET_R && this.time - s.greeted > 40 && !s.duck) {
        s.greeted = this.time;
        showBubble(s, '👋', 2.2);
        s.waveT = 2.2;
      }
      if (s.talkT > 0) s.facingTarget = toHer;
      s.facing += wrap(s.facingTarget - s.facing) * (1 - Math.exp(-dt * (s.moving ? 7 : 5)));
      s.root.rotation.y = s.facing;
      s.vrm.root.position.y = -s.duck * 0.55;
      s.label.isVisible = d < LABEL_R;
      updateBubble(s, dt, d < 22);
      if (s.waveT > 0) s.waveT -= dt;
      // Distant shoppers skip their outlines (a second full draw of the character).
      const shells = d < (s.vrm.outlinesOn ? outlines + 3 : outlines);
      if (s.vrm.outlinesOn !== shells) {
        for (const m of s.vrm.outlines) m.renderOutline = shells;
        s.vrm.outlinesOn = shells;
      }
      this._animate(s, dt, d, toHer, i);
    }
    this.gear.commit();
  }

  /** Fill the mall back up: one arrival every few seconds while fewer than `target` shop. */
  _arrivals(dt, target) {
    let active = 0;
    for (const s of this.shoppers) if (!s.away) active++;
    // The first ones, driving in over the first minute.
    for (const s of this.shoppers) {
      if (!s.away || s.arriveT === Infinity) continue;
      s.arriveT -= dt;
      if (s.arriveT <= 0 && active < target) { s.arriveT = Infinity; this._begin(s); active++; }
    }
    this.arriveT -= dt;
    if (active >= target || this.arriveT > 0) return;
    // Then whoever has been away longest (not straight back out of the car they just got into).
    let next = null;
    for (const s of this.shoppers) if (s.away && s.arriveT === Infinity && (!next || s.awayT < next.awayT)) next = s;
    if (next && this.time - next.awayT > 20) {
      this._begin(next);
      this.arriveT = rnd(6, 16);
    }
  }

  _animate(s, dt, d, toHer, i) {
    const r = s.vrm, voices = this.ctx.npcs.voices;
    // Talking: the mouth follows the voice.
    if (r.mouth) {
      const lv = voices.speaking ? voices.level(s.id) : 0;
      s.mouth += (lv - s.mouth) * Math.min(1, dt * 18);
      setMorph(r.mouth, s.mouth);
    }
    s.speed += ((s.moving ? Math.min(1.25, s.moveSpeed / 0.85) : 0) - s.speed) * (1 - Math.exp(-dt * 7));
    if (s.moving) s.walkPhase = (s.walkPhase + s.moveSpeed * dt / 1.25) % 1;
    const look = d < 4 ? clamp(wrap(toHer - s.facing), -1.1, 1.1) : 0;
    s.lookYaw += (look - s.lookYaw) * (1 - Math.exp(-dt * 4));
    // Animation level of detail (staggered): every frame up close, every 2nd / 4th further away,
    // every 8th off screen (only their shadows show it). Inside, nearly everyone is within
    // 25 m: posing them all every frame was ~70% of this module's time (4× CPU throttle).
    const planes = this.ctx.scene.frustumPlanes;
    const seen = !planes || s.vrm.casters[0].isInFrustum(planes);
    const every = !seen ? 8 : d < 8 ? 1 : d < 18 ? 2 : 4;
    if ((this.frame + i) % every) return;
    const t = this.time + s.phase;
    animateResident(r, t, { walk: s.speed, phase: s.walkPhase, look: s.lookYaw, gender: s.look.gender });
    if (s.act) applyAct(r, s.act, s.act === 'talk' ? t : s.t, s.actK, false, s.hands);
    // Ducking into / out of the car.
    if (s.duck > 0) applyAct(r, 'bow', 1.1, s.duck, false);
    // Waving back (not while a hand is busy with a product or a garment).
    if (s.waveT > 0 && !s.reaching) applyAct(r, 'wave', t, Math.min(1, s.waveT * 2), false);
    syncPose(r);
  }

  // ------------------------------------------------------------ talking
  prompt() {
    const { player } = this.ctx;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    let best = null, bd = TALK_R;
    for (const s of this.shoppers) {
      if (!s.shown || s.duck > 0 || s.distance >= bd) continue;
      const dx = s.position.x - player.position.x, dz = s.position.z - player.position.z;
      // She is facing them.
      if ((dx * fx + dz * fz) / (s.distance || 1) < 0.45) continue;
      best = s; bd = s.distance;
    }
    this._talkTo = best;
    if (!best) return null;
    const p = this._prompt;
    if (p.name !== best.name) { p.name = best.name; p.label = `Talk to ${best.name}`; }
    p.distance = bd;
    return p;
  }

  get busy() { return false; }

  _talk() {
    const s = this._talkTo;
    if (!s) return;
    const line = shopperLine(s);
    s.talkT = 4.5;
    s.greeted = this.time;
    showBubble(s, '💬', 2);
    this.ctx.hud.toast(s.name, line);
    this.ctx.npcs.speak(s.item, line);
  }

  dispose() {
    const { npcs, world } = this.ctx;
    for (const l of this.lines) l.clear();
    this.till?.clear();
    npcs.stopSpeaking();
    const walkers = world.walkers || [];
    for (let k = walkers.length - 1; k >= 0; k--) if (this.shoppers.includes(walkers[k])) walkers.splice(k, 1);
    for (const s of this.shoppers) {
      this.mind.leaveRoom(s);
      s.vrm.root.position.y = 0;
      npcs.giveBack(s.item);
      s.label.dispose();
      s.bubble.dispose();
    }
    this.shoppers.length = 0;
    this.gear.dispose();
    this.group.dispose();
  }
}

/** She stands at this checkout (at the register or where the next one unloads): shoppers wait for her. */
function herAt(line, p) {
  return Math.hypot(p.x - line.stop.x, p.z - line.stop.z) < 1.3 || Math.hypot(p.x - line.unload.x, p.z - line.unload.z) < 1.3;
}

/**
 * Shoppers' cars: the lot's taken bays (a parked car stands there) except
 * hers and the cart return. The door is on the car's right, facing in.
 */
function parkedCars(layout) {
  const corrals = layout.cartCorrals || [];
  const bays = (layout.lot?.bays || []).filter((b) => b.free === false
    && Math.hypot(b.x - layout.car.x, b.z - layout.car.z) > 1.5
    && !corrals.some((c) => Math.hypot(b.x - c.x, b.z - c.z) < 2));
  const list = bays.length ? bays : [layout.spawn];
  return list.map((b) => {
    const rx = Math.cos(b.yaw || 0), rz = -Math.sin(b.yaw || 0);
    return { x: b.x, z: b.z, door: { x: b.x + rx * 1.25, z: b.z + rz * 1.25, yaw: Math.atan2(-rx, -rz) } };
  });
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
