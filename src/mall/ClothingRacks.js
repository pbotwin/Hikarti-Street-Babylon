import { CLOTHES } from './MallCatalog.js';

/**
 * Sakura Style's racks (layout.fashion.racks), stocked from the catalog:
 * every hook gets a garment of that rack's kind, each item in a run of a few
 * neighbouring hooks (sizes S / M / L, a touch smaller or larger), a price
 * card on the rail where each run starts and tent cards by the sneakers.
 * Rails with close hooks hang clothes side-on (as on a real rail, flipped
 * through); far-apart hooks (a waterfall arm, a wall bar) hang them facing
 * the aisle. Each hook is a slot: what hangs there, where she stands and
 * which way she faces to reach it.
 */

const BY_RACK = {};
for (const c of CLOTHES) (BY_RACK[c.rack] ||= []).push(c);
const SIZES = [0.95, 1, 1.05];
const REACH = 1.15;       // m from her to a hook she can take from

export class ClothingRacks {
  constructor(racks) {
    this.slots = [];
    this.cards = [];
    this._shelfRow = 0;
    for (const rack of racks) this._plan(rack);
  }

  _plan(rack) {
    const items = BY_RACK[rack.rack];
    const hooks = rack.hooks || [];
    if (!items?.length || !hooks.length) return;
    const fx = Math.sin(rack.yaw), fz = Math.cos(rack.yaw);
    const first = hooks[0], last = hooks[hooks.length - 1];
    let rx = last[0] - first[0], rz = last[2] - first[2];
    const len = Math.hypot(rx, rz);
    const spacing = hooks.length > 1 ? len / (hooks.length - 1) : 1;
    if (len > 1e-3) { rx /= len; rz /= len; } else { rx = Math.cos(rack.yaw); rz = -Math.sin(rack.yaw); }
    const shoes = rack.rack === 'sneakers';
    const sideOn = !shoes && spacing < 0.25;
    const yaw = sideOn ? Math.atan2(rx, rz) : rack.yaw;
    // Rails: the rack's items in runs along it. Shelves: one item per shelf
    // row (hooks at one height), the catalog's items in turn from row to row.
    const run = Math.max(1, Math.floor(hooks.length / items.length));
    let item = null, k = 0;
    hooks.forEach((h, i) => {
      if (shoes) {
        if (i === 0 || h[1] !== hooks[i - 1][1]) { item = items[this._shelfRow++ % items.length]; k = 0; } else k++;
      } else {
        const n = Math.min(items.length - 1, Math.floor(i / run));
        item = items[n];
        k = i - n * run;
      }
      this.slots.push({
        rack, item: item.id, unit: null, shoes, x: h[0], y: h[1], z: h[2], yaw,
        scale: shoes ? 1 : SIZES[k % SIZES.length], fx, fz,
      });
      if (k !== 0) return;
      // The run's price card: on the rail between runs, or by the shoes.
      if (shoes) this.cards.push({ id: item.id, x: h[0] + fx * 0.15, y: h[1], z: h[2] + fz * 0.15, yaw: rack.yaw, tent: true });
      else {
        const back = sideOn && i > 0 ? spacing / 2 : 0;
        this.cards.push({ id: item.id, x: h[0] - rx * back, y: h[1], z: h[2] - rz * back, yaw: rack.yaw });
      }
    });
  }

  /** Make the garments (GarmentSet.add) for every slot; call before the set's build(). */
  stock(set, byId) {
    for (const s of this.slots) s.unit = set.add(byId[s.item].garment, byId[s.item].color, s.scale, byId[s.item].style);
  }

  /** Hang / stand a unit at its slot. */
  put(set, s, unit = s.unit) {
    s.unit = unit;
    set.place(unit, s.x, s.y, s.z, s.yaw);
  }

  /** Where she stands for a slot (on her side of the rack) and which way she faces. */
  stand(s, p, out) {
    const side = (p.x - s.x) * s.fx + (p.z - s.z) * s.fz >= 0 ? 1 : -1;
    const d = s.shoes ? 0.5 : 0.55;
    out.x = s.x + s.fx * side * d;
    out.z = s.z + s.fz * side * d;
    out.yaw = Math.atan2(s.x - out.x, s.z - out.z);
    return out;
  }

  /** The stocked slot she is looking at, in reach (or null), with its distance. */
  facing(p, yaw) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best = null, bs = Infinity;
    for (const s of this.slots) {
      if (!s.unit) continue;
      const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
      if (d > REACH) continue;
      const along = dx * fx + dz * fz;
      if (along < 0.15 || along / d < 0.55) continue;
      // The hook nearest her line of sight, then the nearest.
      const score = Math.abs(dx * fz - dz * fx) * 2 + d * 0.4;
      if (score < bs) { bs = score; best = s; }
    }
    this.distance = best ? Math.hypot(best.x - p.x, best.z - p.z) : Infinity;
    return best;
  }

  /** The free hook nearest to her on a rack of this item's kind. */
  freeFor(item, p) {
    let best = null, bd = Infinity;
    for (const s of this.slots) {
      if (s.unit || s.rack.rack !== item.rack) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
}
