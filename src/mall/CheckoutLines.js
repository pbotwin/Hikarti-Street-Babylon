/**
 * Orderly queues at the supermarket checkouts and the clothing till for the
 * mall's shoppers. A line runs back from where the next customer unloads
 * (beside the start of the belt) away from the register; each member stands
 * a body (and a cart) behind the one ahead. The front member unloads, then
 * steps up to the register to pay while the next one starts unloading.
 * Goods put on a belt ride it to the scanner and are gone.
 */
const BELT_SPEED = 0.32;   // m/s

export class CheckoutLine {
  /** `spot` from the layout: a checkout ({ stop, belt, exit }) or the till ({ stand }). */
  constructor(spot, gear) {
    this.gear = gear;
    this.id = spot.id ?? 'till';
    const stop = spot.stop || spot.stand;
    this.stop = { x: stop.x, z: stop.z, yaw: stop.yaw };
    const b = spot.belt;
    // Along the line, toward the register: the belt's direction, else the stop's facing.
    let dx = b ? b.to[0] - b.from[0] : Math.sin(stop.yaw), dz = b ? b.to[2] - b.from[2] : Math.cos(stop.yaw);
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    this.dir = { x: dx, z: dz, yaw: Math.atan2(dx, dz) };
    // Unloading beside the belt, just past its start; goods go down onto the belt there.
    const back = b ? Math.max(0.6, (stop.x - b.from[0]) * dx + (stop.z - b.from[2]) * dz - 0.5) : 0;
    this.unload = { x: stop.x - dx * back, z: stop.z - dz * back };
    if (b) {
      const t = Math.min(0.5, 0.5 / len);
      this.belt = { from: b.from, to: b.to, len, t0: t, at: [b.from[0] + (b.to[0] - b.from[0]) * t, b.from[1], b.from[2] + (b.to[2] - b.from[2]) * t] };
    } else this.belt = null;
    this.exit = spot.exit || { x: stop.x + dx * 2.5, z: stop.z + dz * 2.5 };
    this.members = [];      // waiting, front first (the front one unloads)
    this.paying = null;     // at the register
    this.riding = [];       // goods on the belt: { g, t }
    this.blocked = false;   // she is using this checkout (set by the shoppers each frame)
  }

  /** People in it, for choosing the shortest line. */
  get size() { return this.members.length + (this.paying ? 1 : 0) + (this.blocked ? 2 : 0); }

  join(s) { if (!this.members.includes(s)) this.members.push(s); }

  leave(s) {
    const k = this.members.indexOf(s);
    if (k >= 0) this.members.splice(k, 1);
    if (this.paying === s) this.paying = null;
  }

  /** The front member is done unloading: to the register. */
  toRegister(s) {
    this.leave(s);
    this.paying = s;
  }

  /** May `s` step up to unload now (front of the line, register free enough)? */
  canUnload(s) { return this.members[0] === s && !this.blocked; }

  /** Where member `s` should stand (into `out`, with the facing). */
  spotOf(s, out) {
    let back = 0;
    for (const m of this.members) {
      if (m === s) break;
      back += m.kind === 'cart' ? 1.9 : 1.05;
    }
    // Behind someone still unloading at the front.
    const lead = this.members[0] === s ? 0 : 0.35;
    out.x = this.unload.x - this.dir.x * (back + lead);
    out.z = this.unload.z - this.dir.z * (back + lead);
    out.yaw = this.dir.yaw;
    return out;
  }

  /** A good leaves the shopper's hand onto the belt (at belt.at). */
  onBelt(g) {
    this.riding.push({ g, t: this.belt.t0 });
  }

  /** Belt goods ride to the scanner. */
  update(dt) {
    const b = this.belt;
    for (let k = this.riding.length - 1; k >= 0; k--) {
      const r = this.riding[k];
      r.t += dt * BELT_SPEED / b.len;
      if (r.t >= 1) { this.gear.drop(r.g); this.riding.splice(k, 1); continue; }
      this.gear.moveGood(r.g, b.from[0] + (b.to[0] - b.from[0]) * r.t, b.from[1] + (b.to[1] - b.from[1]) * r.t + 0.05,
        b.from[2] + (b.to[2] - b.from[2]) * r.t, this.dir.yaw + r.g.spin);
    }
  }

  /** Everything on the belt is gone (the shopper is leaving / the trip ends). */
  clear() {
    for (const r of this.riding) this.gear.drop(r.g);
    this.riding.length = 0;
    this.members.length = 0;
    this.paying = null;
  }
}
