import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { createResident, animateResident, disposeResident, eulerToRef } from '../npcs/NPCModels.js';
import { ease, lerp } from './Timeline.js';
import { tone } from './Tones.js';

/**
 * Sakura Style's till (layout.fashion.till). She lays the clothes on the
 * counter; the cashier (a resident in the store's pink) scans each one,
 * slips it off its hanger, folds it (sides in, then in half) and lifts it
 * into a Sakura Style bag; she pays from the trip's wallet and takes the bag
 * by its handles. Not enough money: the cashier says so and nothing moves.
 */

const LOOK = { base: 'girl_dress', hair: '#2b2b33', top: '#f2a7bd', bottom: '#f6f0ea', height: 1.6, gender: 'f' };
const FOLD_LEN = 0.4;     // a folded garment's length, of the hanging one
const _q = new Quaternion(), _s = new Vector3(), _p = new Vector3(), _m = new Matrix();

export class ClothingTill {
  constructor(fashion, data) {
    this.f = fashion;
    this.data = data;
    this.time = 0;
    this.work = 0;          // cashier's arms over the counter (0..1)
    this._work = 0;
    this.bow = 0;
    this.lookYaw = 0;
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
      const r = this.cashier = await createResident(LOOK);
      r.blinkSeed = Math.random();
      r.root.position.set(c.x, ctx.layout.building?.floorY ?? 0, c.z);
      r.root.rotation.y = c.yaw;
      ctx.graphics.addCasters(r.casters);
    } catch (e) { console.warn('fashion cashier', e); }
  }

  distance(p) { return Math.hypot(p.x - this.data.stand.x, p.z - this.data.stand.z); }

  /** A point on the counter: `a` along it, `b` toward her side (m). */
  at(a, b, y = 0) {
    const r = this.data.register;
    return { x: r[0] + this.side.x * a + this.out.x * b, y: (this.top ?? r[1]) + y, z: r[2] + this.side.z * a + this.out.z * b };
  }

  update(dt) {
    this.time += dt;
    const r = this.cashier;
    if (!r) return;
    const p = this.f.ctx.player.position;
    const dx = p.x - r.root.position.x, dz = p.z - r.root.position.z, d = Math.hypot(dx, dz);
    // Out of sight across the mall: no posing (LOD).
    if (d > 30) return;
    const look = Math.max(-1, Math.min(1, Math.atan2(dx, dz) - r.root.rotation.y));
    this.lookYaw = lerp(this.lookYaw, d < 6 ? look * (1 - this.work * 0.7) : 0, 1 - Math.exp(-4 * dt));
    this.work = lerp(this.work, this._work, 1 - Math.exp(-6 * dt));
    animateResident(r, this.time, { look: this.lookYaw, gender: 'f' });
    // She steps up to the counter while serving.
    const c = this.data.cashier;
    r.root.position.x = c.x + this.out.x * 0.45 * this.work;
    r.root.position.z = c.z + this.out.z * 0.45 * this.work;
    if (this.work > 0.01) {
      // Both hands forward over the counter, busy folding.
      const w = this.work, t = this.time * 7;
      r.bones.leftUpperArm?.rotationQuaternion.multiplyInPlace(eulerToRef(-1.0 * w + Math.sin(t) * 0.1 * w, 0, 0.35 * w, 'XYZ', _q));
      r.bones.rightUpperArm?.rotationQuaternion.multiplyInPlace(eulerToRef(-1.0 * w + Math.sin(t + 1.3) * 0.1 * w, 0, -0.35 * w, 'XYZ', _q));
      r.bones.leftLowerArm?.rotationQuaternion.multiplyInPlace(eulerToRef(0, 0.5 * w, 0, 'XYZ', _q));
      r.bones.rightLowerArm?.rotationQuaternion.multiplyInPlace(eulerToRef(0, -0.5 * w, 0, 'XYZ', _q));
      r.bones.spine?.rotationQuaternion.multiplyInPlace(eulerToRef(0.15 * w, 0, 0, 'XYZ', _q));
    }
    if (this.bow > 0) {
      this.bow = Math.max(0, this.bow - dt);
      const k = Math.sin((1 - this.bow / 1.2) * Math.PI);
      eulerToRef(0.5 * k, 0, 0, 'XYZ', _q);
      r.bones.spine?.rotationQuaternion.multiplyInPlace(_q);
      r.bones.chest?.rotationQuaternion.multiplyInPlace(_q);
    }
  }

  /** "Pay for N items": counter, scan, fold, bag, pay, the bag to her. */
  pay() {
    const f = this.f, { wallet, hud, player } = f.ctx;
    const total = f.total();
    if (!f.carried.length || f.busy) return;
    if (wallet.coins < total) {
      hud.toast(`${total} ◈ — you have ${wallet.coins}`, 'Hang something back (✕) to pay for less');
      return;
    }
    const bag = f.freeBag();
    if (!bag) { hud.toast('Your hands are full of bags', 'Put them in the cart first'); return; }
    player.hold = true;
    const items = f.carried.slice();
    const r = this.data.register;
    const faceTill = { yaw: Math.atan2(r[0] - player.position.x, r[2] - player.position.z) };
    const bagAt = this.at(0.45, 0.05), across = this.at(0.05, 0.4);
    const grip = { x: 0, y: 0, z: 0 };
    const steps = [
      // She lays them on the counter, side by side.
      ...f.reachSteps(this.at(-0.75, 0.32, 0.12), () => {
        items.forEach((c, i) => this._lay(c.unit, this.at(-0.8 - i * 0.05, 0.2, 0.02 + i * 0.03), { d: 0.35, arc: 0.06 }));
        f.drop();
        f._click();
      }, { turn: faceTill }),
      // The cashier opens a bag on the counter.
      { d: 0.35, step: (k, dt, first) => {
        if (first) { this._work = 1; bag.setEnabled(true); bag.position.set(bagAt.x, bagAt.y, bagAt.z); bag.rotation.set(0, this.yawOut, 0); }
        const s = lerp(0.08, 1, ease(k));
        bag.scaling.set(1, s, 1);
        bag.position.y = bagAt.y + 0.39 * s;
      } },
    ];
    items.forEach((c, i) => steps.push(...this._fold(c, i, bagAt)));
    steps.push(
      { d: 0.25, done: () => {
        wallet.spend(total);
        for (const c of items) wallet.add(c.id);
        this._work = 0;
        tone(f.ctx.audio, [1318, 1568, 2093], { dur: 0.1, type: 'triangle', gain: 0.07 });
        hud.toast(`Paid ${total} ◈`, 'Arigatou gozaimashita!');
      } },
      // The cashier slides the bag across; she takes it by the handles.
      { d: 0.45, step: (k, dt, first) => {
        if (first) { grip.x = bag.position.x; grip.z = bag.position.z; }
        const m = ease(k);
        bag.position.x = lerp(grip.x, across.x, m); bag.position.z = lerp(grip.z, across.z, m);
      }, done: () => { grip.x = bag.position.x; grip.y = bag.position.y; grip.z = bag.position.z; } },
      ...f.reachSteps(grip, () => {
        f.bags.push({ mesh: bag, items: items.map((c) => c.id) });
        this.bow = 1.2;
      }, { turn: faceTill }),
    );
    f.timeline.play(steps, () => { player.hold = false; });
  }

  /**
   * Lay a garment flat on the counter centred on `p`, lengthwise along it
   * (collar toward the register); sneakers stand there, toes to her.
   */
  _lay(u, p, opts) {
    const flat = u.shape !== 'sneakers', sd = this.side, half = flat ? 0.33 * u.scale : 0;
    this.f.settle(u, p.x + sd.x * half, p.y, p.z + sd.z * half, flat ? this.yawAlong : this.yawOut, { ...opts, pitch: flat ? -Math.PI / 2 : 0 });
  }

  /** Scan, off the hanger, fold in two moves, into the bag. */
  _fold(c, i, bagAt) {
    const f = this.f, set = f.set, u = c.unit;
    const pile = this.at(-0.3, -0.3, -0.25);   // hangers: onto the shelf under the counter
    const folded = f.folded[i];
    const shoes = u.shape === 'sneakers';
    const steps = [
      // Over the scanner: beep.
      { d: 0.4, step: (k, dt, first) => { if (first) this._lay(u, this.at(-0.32, 0.2, 0.02), { d: 0.4, arc: 0.08 }); },
        done: () => tone(f.ctx.audio, [1760], { dur: 0.09, type: 'square', gain: 0.05 }) },
    ];
    if (!shoes) {
      steps.push(
        // The hanger comes off and goes under the counter.
        { d: 0.3, step: (k, dt, first) => {
          if (!first) return;
          u.onHanger = false;
          f.settle(u.hanger, pile.x, pile.y, pile.z, this.yawAlong, { d: 0.3, arc: 0.05, done: () => set.setVisible(u.hanger, false) });
        } },
        // Sides in, then in half: the garment's matrix, scaled about its collar.
        { d: 0.6, step: (k) => {
          const a = ease(Math.min(1, k * 2)), b = ease(Math.max(0, k * 2 - 1));
          Quaternion.RotationYawPitchRollToRef(u.yaw, u.pitch, 0, _q);
          Matrix.ComposeToRef(_s.set(u.scale * lerp(1, 0.66, a), u.scale * lerp(1, FOLD_LEN, b), u.scale * (1 + b)), _q, _p.set(u.x, u.y + Math.sin(b * Math.PI) * 0.04, u.z), _m);
          set.placeMatrix(u, _m);
        }, done: () => {
          // Folded: the pooled stack in its colour takes over where it lies.
          const len = 0.66 * FOLD_LEN * 0.5 * u.scale;
          set.recolor(folded, c.item.color);
          set.setVisible(folded, true);
          set.place(folded, u.x - this.side.x * len, u.y - 0.01, u.z - this.side.z * len, this.yawOut);
          set.setVisible(u, false);
        } },
      );
    }
    const item = shoes ? u : folded;
    steps.push({ d: 0.45, step: (k, dt, first) => {
      if (first) f.settle(item, bagAt.x, bagAt.y + 0.12, bagAt.z, item.yaw, { d: 0.45, arc: 0.18, done: () => { set.setVisible(item, false); this._rustle(); } });
    } });
    return steps;
  }

  _rustle() { tone(this.f.ctx.audio, [320, 260], { dur: 0.08, type: 'triangle', gain: 0.04, gap: 0.01 }); }

  dispose() {
    if (!this.cashier) return;
    this.f.ctx.graphics.removeCasters(this.cashier.casters);
    disposeResident(this.cashier);
    this.cashier = null;
  }
}
