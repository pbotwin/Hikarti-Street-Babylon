import { ITEMS } from '../gameplay/ShopData.js';
import { ease, lerp } from './Timeline.js';
import { tone } from './Tones.js';

/**
 * Sakura Style's fitting rooms (layout.fashion.fittingRooms).
 *
 * FittingRoom: one cubicle's state: its curtain (the world's node, drawn
 * along its rail), the hook inside and what was left on it (it stays: no
 * one tidies up during the trip).
 *
 * TryOn: her visit. She walks in, the curtain closes, she hangs what she
 * brought on the hook, and the view turns to the mirror (MirrorView). The
 * panel cycles the pieces: each one is put on (ShopSystem.previewOutfit,
 * behind a moment of mist so nothing pops), "Keep" marks it to buy and
 * moves on, "Leave it here" hangs it back on the hook for good. "Done": her
 * own clothes again, the curtain opens, she takes the rest and walks out.
 */

const CURTAIN_TIME = 0.7;
// Shoes are set down and picked up by their heels' tops, LOW above the floor
// (her hand, bending over, gets there); let go, they settle in DROP s.
const LOW = 0.12, DROP = 0.12;

export class FittingRoom {
  constructor(scene, data) {
    this.data = data;
    this.inUse = false;
    this.left = [];           // units left on the hook
    // The world's curtain node: pinned at one end of the rail, the fabric
    // along its x (MallBoutique), built drawn; free rooms stand open.
    this.curtain = data.curtain ? scene.getTransformNodeByName(data.curtain) : null;
    this.closed = 0;          // 0 open … 1 drawn
    this._to = 0;
    this._pose(0);
    this.yaw = Math.atan2(data.mirror.x - data.inside.x, data.mirror.z - data.inside.z);
  }

  distance(p) { return Math.hypot(p.x - this.data.door.x, p.z - this.data.door.z); }

  /** Draw (true) or open the curtain. */
  draw(closed) { this._to = closed ? 1 : 0; }

  get moving() { return this.closed !== this._to; }

  update(dt) {
    if (this.closed === this._to) return;
    const step = dt / CURTAIN_TIME;
    this.closed = this._to > this.closed ? Math.min(this._to, this.closed + step) : Math.max(this._to, this.closed - step);
    this._pose(ease(this.closed));
  }

  /** The curtain bunched at its end of the rail (open) or across the doorway (drawn). */
  _pose(k) {
    if (this.curtain) this.curtain.scaling.x = lerp(0.15, 1, k);
  }

  /**
   * Where the i-th garment hangs on the hook (stacked, facing away from its
   * wall: into the room, square to the mirror's line), or stands below it.
   */
  spot(i, shoes, floorY) {
    const h = this.data.hook, d = this.data.inside, m = this.data.mirror;
    let nx = d.x - m.x, nz = d.z - m.z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    let vx = d.x - h[0], vz = d.z - h[2];
    const along = vx * nx + vz * nz;
    vx -= nx * along; vz -= nz * along;
    const yaw = Math.atan2(vx, vz);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    if (shoes) return { x: h[0] + fx * 0.25 + Math.cos(yaw) * 0.14 * (i % 2 ? 1 : -1), y: floorY, z: h[2] + fz * 0.25 - Math.sin(yaw) * 0.14 * (i % 2 ? 1 : -1), yaw };
    return { x: h[0] + fx * 0.035 * i, y: h[1], z: h[2] + fz * 0.035 * i, yaw };
  }
}

export class TryOn {
  constructor(fashion, room, onEnd) {
    this.f = fashion;
    this.room = room;
    this.onEnd = onEnd;
    this.items = [];          // [{ id, item, unit, status: 'new' | 'kept' | 'left' }]
    this.worn = {};           // kind → index in items
    this.current = -1;
    this.live = false;        // in front of the mirror
    this.ready = false;       // ...and no change under way: the panel takes clicks
  }

  start() {
    const f = this.f, { player } = f.ctx, room = this.room, d = room.data;
    room.inUse = true;
    const walk = { x: d.inside.x, z: d.inside.z, done: () => { walk.over = true; } };
    const at = { x: 0, z: 0, yaw: 0 };
    const floorY = f.ctx.layout.building?.floorY ?? 0;
    const toHook = Math.atan2(d.hook[0] - d.inside.x, d.hook[2] - d.inside.z);
    const garments = f.carried.filter((c) => c.unit.shape !== 'sneakers'), shoes = f.carried.filter((c) => c.unit.shape === 'sneakers');
    const start = room.left.length;
    const steps = [
      { until: () => walk.over, step: (k, dt, first) => { if (first) player.autoWalk = walk; } },
      // Onto the spot, facing the mirror; the curtain closes behind her.
      { d: 0.4, step: (k, dt, first) => {
        if (first) { f.her.freeze(true); at.x = player.position.x; at.z = player.position.z; at.yaw = player.yaw; room.draw(true); this._swish(); }
        const m = ease(k);
        f.her.place(lerp(at.x, d.inside.x, m), lerp(at.z, d.inside.z, m), player.yaw);
        f.turn(at.yaw, room.yaw, k);
      } },
      { until: () => !room.moving },
    ];
    // Up to the hook; the hangers onto it, all at once off her fingers.
    steps.push(f.stepUp(d.hook[0], d.hook[1], d.hook[2], d.inside));
    if (garments.length) {
      const spot = room.spot(start, false, floorY);
      steps.push(...f.reachSteps(f.palmFor(f.carried.indexOf(garments[0]), false, spot.x, spot.y, spot.z, toHook), () => {
        for (const c of garments) {
          const sp = room.spot(start + this.items.length, false, floorY);
          this.items.push({ id: c.id, item: c.item, unit: c.unit, status: 'new' });
          f.settle(c.unit, sp.x, sp.y, sp.z, sp.yaw, { d: 0.25 });
          f.drop(c);
        }
        f._click();
      }));
    }
    // Shoes: she crouches and sets each pair down below the hook.
    for (const c of shoes) {
      const i = this.items.length + garments.length + shoes.indexOf(c), sp = room.spot(start + i, true, floorY);
      steps.push(...f.reachSteps(f.palmFor(0, true, sp.x, sp.y + LOW, sp.z, toHook), () => {
        this.items.push({ id: c.id, item: c.item, unit: c.unit, status: 'new' });
        f.drop(c);
        f.settle(c.unit, sp.x, sp.y, sp.z, sp.yaw, { d: DROP });
        f._click();
      }));
    }
    // Back to the middle, facing the mirror.
    steps.push(f.her.goTo(() => ({ x: d.inside.x, z: d.inside.z, yaw: room.yaw })));
    f.timeline.play(steps, () => {
      // The view turns to the mirror, and the first piece goes on.
      f.mirror.aim(d.inside, d.mirror);
      this.live = true;
      this._panel();
      this.wear(0, true);
    });
  }

  update() {
    const clear = this.live && this.f.mirror.clear;
    if (clear !== this.ready) { this.ready = clear; this._render(); }
  }

  /** Put the i-th piece on (behind the mist); the one it replaces goes back on its hanger. */
  wear(i, enter = false) {
    const it = this.items[i];
    if (!it || it.status === 'left') return;
    const f = this.f, set = f.set;
    this.current = i;
    this.ready = false;
    this._render();
    f.mirror.veil(() => {
      if (enter) f.mirror.set(true);
      const kind = it.item.kind, prev = this.worn[kind];
      if (prev != null) set.setVisible(this.items[prev].unit, true);
      this.worn[kind] = i;
      set.setVisible(it.unit, false);
      return this._preview();
    });
  }

  _preview() {
    const pending = {};
    for (const kind in this.worn) pending[kind] = this.items[this.worn[kind]].id;
    return this.f.ctx.shops.previewOutfit(Object.keys(pending).length ? pending : null);
  }

  /** "Keep": to buy; on to the next piece not decided yet. */
  keep() {
    const it = this.items[this.current];
    if (!it || !this.ready) return;
    it.status = 'kept';
    this._next();
  }

  /** "Leave it here": off, back on the hook, and it stays there. */
  leave() {
    const it = this.items[this.current];
    if (!it || !this.ready) return;
    it.status = 'left';
    const f = this.f, kind = it.item.kind;
    const next = this.items.findIndex((e) => e.status === 'new');
    if (this.worn[kind] === this.current) {
      // The next piece goes on in the same change, if there is one.
      this.ready = false;
      f.mirror.veil(() => {
        f.set.setVisible(it.unit, true);
        delete this.worn[kind];
        if (next >= 0) {
          const n = this.items[next], prev = this.worn[n.item.kind];
          if (prev != null) f.set.setVisible(this.items[prev].unit, true);
          this.worn[n.item.kind] = next;
          f.set.setVisible(n.unit, false);
          this.current = next;
        }
        return this._preview();
      });
    } else if (next >= 0) this.wear(next);
    this._render();
  }

  _next() {
    const next = this.items.findIndex((e) => e.status === 'new');
    if (next >= 0) this.wear(next);
    else this._render();
  }

  /** "Done": her own clothes, the curtain opens, she takes the rest and walks out. */
  done() {
    if (!this.ready) return;
    const f = this.f, { player, cameraRig } = f.ctx, room = this.room, d = room.data;
    this.ready = false;
    this.live = false;
    this._close();
    f.mirror.veil(() => {
      for (const kind in this.worn) f.set.setVisible(this.items[this.worn[kind]].unit, true);
      this.worn = {};
      f.mirror.set(false);
      // The camera outside the cubicle, looking in at her.
      cameraRig.yaw = cameraRig.targetYaw = Math.atan2(d.inside.x - d.door.x, d.inside.z - d.door.z);
      room.draw(false);
      this._swish();
      return f.ctx.shops.previewOutfit(null);
    });
    const walk = { x: d.door.x, z: d.door.z, done: () => { walk.over = true; } };
    const toHook = Math.atan2(d.hook[0] - d.inside.x, d.hook[2] - d.inside.z);
    const take = this.items.filter((it) => it.status !== 'left');
    for (const it of this.items) if (it.status === 'left') room.left.push(it.unit);
    const steps = [{ until: () => f.mirror.clear }, f.stepUp(d.hook[0], d.hook[1], d.hook[2], d.inside)];
    // The hangers off the hook together, then each pair of shoes from the floor.
    const hung = take.filter((it) => it.unit.shape !== 'sneakers'), shoes = take.filter((it) => it.unit.shape === 'sneakers');
    if (hung.length) {
      const u = hung[0].unit;
      steps.push(...f.reachSteps(f.palmFor(f.carried.length, false, u.x, u.y, u.z, toHook), () => {
        for (const it of hung) f.attach(it.id, it.unit, { kept: it.status === 'kept' });
        f._click();
      }));
    }
    for (const it of shoes) {
      steps.push(...f.reachSteps({ x: it.unit.x, y: it.unit.y + LOW, z: it.unit.z }, () => {
        f.attach(it.id, it.unit, { kept: it.status === 'kept' });
        f._click();
      }));
    }
    steps.push(
      { d: 0, done: () => f.her.freeze(false) },
      { until: () => walk.over, step: (k, dt, first) => { if (first) player.autoWalk = walk; } },
    );
    f.timeline.play(steps, () => this._end());
  }

  _end() {
    this.room.inUse = false;
    this.onEnd();
  }

  /** The trip ends while she is inside (dispose): everything back at once. */
  abort() {
    const f = this.f;
    this._close();
    if (f.mirror.on) f.mirror.set(false);
    this.room.inUse = false;
  }

  _swish() { tone(this.f.ctx.audio, [210, 160], { dur: 0.22, type: 'sine', gain: 0.035, gap: 0 }); }

  // ------------------------------------------------------------ panel
  _panel() {
    const root = document.getElementById('ui');
    root.insertAdjacentHTML('beforeend', '<aside class="seat-panel fitting-panel"><b class="seat-title"></b><div class="seat-options"></div><div class="seat-options"><button class="pill" data-act="keep" type="button">✓ Keep</button><button class="pill" data-act="leave" type="button">Leave it here</button><button class="pill seat-up" data-act="done" type="button">Done</button></div></aside>');
    const el = this.el = root.lastElementChild;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.try != null) { const i = +b.dataset.try; if (i !== this.current && this.ready) this.wear(i); }
      else if (b.dataset.act === 'keep') this.keep();
      else if (b.dataset.act === 'leave') this.leave();
      else if (b.dataset.act === 'done') this.done();
    });
    this._render();
  }

  _render() {
    const el = this.el;
    if (!el) return;
    const it = this.items[this.current];
    const kept = this.items.filter((e) => e.status === 'kept').length;
    el.querySelector('.seat-title').textContent = it ? `🪞 ${it.item.name} · ${it.item.price} ◈${kept ? ` · keeping ${kept}` : ''}` : '🪞 Fitting room';
    el.querySelector('.seat-options').innerHTML = this.items.map((e, i) => {
      // Compact chips (the mirror needs the screen): the name is in the title.
      const tag = e.status === 'kept' ? ' ✓' : e.status === 'left' ? ' ✕' : '';
      return `<button class="pill ${i === this.current ? 'on' : ''}" data-try="${i}" type="button" title="${e.item.name}" ${e.status === 'left' || !this.ready ? 'disabled' : ''}>${ITEMS[e.id].icon}<i class="swatch" style="background:${e.item.color}"></i>${tag}</button>`;
    }).join('');
    const [keep, leave, done] = el.querySelectorAll('[data-act]');
    keep.disabled = !this.ready || !it || it.status !== 'new';
    leave.disabled = !this.ready || !it || it.status === 'left';
    done.disabled = !this.ready;
  }

  _close() {
    this.el?.remove();
    this.el = null;
  }
}
