/**
 * Lightweight static collision world made of axis-aligned boxes.
 *
 * A city block is overwhelmingly boxes (walls, benches, kerbs, cars), so this
 * gives exact, cheap collision for the character and the camera without a
 * physics engine. Boxes are bucketed into a coarse XZ grid for queries.
 */
const CELL = 8;

export class CollisionWorld {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this._seen = new Set();
    // Movable oriented boxes (vehicles): few, so checked by brute force.
    this.dynamic = [];
    // Set while a vehicle queries the world, so it doesn't hit itself.
    this.ignore = null;
  }

  /**
   * Oriented box that can move every frame (a vehicle body). Local frame:
   * forward +Z rotated by `yaw` about Y; half extents hx (width) and hz
   * (length), from y0 up to y0 + h. Update x / z / yaw / y0 in place.
   */
  addDynamic({ x = 0, z = 0, yaw = 0, y0 = 0, hx, hz, h, climb = false, camera = true, owner = null }) {
    const d = { x, z, yaw, y0, hx, hz, h, climb, camera, owner };
    this.dynamic.push(d);
    return d;
  }

  /** Take a box made by addDynamic out of the world (its owner went away). */
  removeDynamic(d) {
    const i = this.dynamic.indexOf(d);
    if (i >= 0) this.dynamic.splice(i, 1);
    if (this.ignore === d) this.ignore = null;
  }

  /** Dynamic boxes near (x, z), with cached cos/sin and local bounds. */
  _dyn(x, z, r) {
    const out = this._dynOut || (this._dynOut = []);
    out.length = 0;
    for (const d of this.dynamic) {
      if (d === this.ignore) continue;
      const R = Math.hypot(d.hx, d.hz) + r;
      if (Math.abs(x - d.x) > R || Math.abs(z - d.z) > R) continue;
      d.c = Math.cos(d.yaw); d.s = Math.sin(d.yaw);
      d.minX = -d.hx; d.maxX = d.hx; d.minZ = -d.hz; d.maxZ = d.hz;
      d.minY = d.y0; d.maxY = d.y0 + d.h;
      out.push(d);
    }
    return out;
  }

  /** World (x, z) into a dynamic box's frame (call after _dyn). */
  static toLocal(d, x, z, out) {
    const dx = x - d.x, dz = z - d.z;
    out.x = dx * d.c - dz * d.s;
    out.z = dx * d.s + dz * d.c;
    return out;
  }

  static toWorld(d, lx, lz, out) {
    out.x = d.x + lx * d.c + lz * d.s;
    out.z = d.z - lx * d.s + lz * d.c;
    return out;
  }

  /**
   * @param {number} minX @param {number} minY @param {number} minZ
   * @param {number} maxX @param {number} maxY @param {number} maxZ
   * @param {{camera?: boolean, climb?: boolean}} opts camera:false lets the camera pass
   *   through small props (lamp posts, signs) instead of snapping in;
   *   climb:true lets the player mantle onto the top (cars, vans).
   */
  addBox(minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
    const box = { minX, minY, minZ, maxX, maxY, maxZ, camera: opts.camera !== false, climb: !!opts.climb };
    this.boxes.push(box);
    this._cells(box, (k) => {
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(box);
    });
    return box;
  }

  /**
   * Take boxes out of the world again (scenery that is built and torn down
   * at runtime, like the mall of a shopping trip).
   */
  removeBoxes(boxes) {
    const gone = new Set(boxes);
    this.boxes = this.boxes.filter((b) => !gone.has(b));
    for (const box of gone) {
      this._cells(box, (k) => {
        const list = this.grid.get(k);
        if (!list) return;
        const rest = list.filter((b) => b !== box);
        if (rest.length) this.grid.set(k, rest); else this.grid.delete(k);
      });
    }
  }

  /** Grid cell keys a box covers. */
  _cells(box, fn) {
    for (let gx = Math.floor(box.minX / CELL); gx <= Math.floor(box.maxX / CELL); gx++) {
      for (let gz = Math.floor(box.minZ / CELL); gz <= Math.floor(box.maxZ / CELL); gz++) fn(gx + ',' + gz);
    }
  }

  /** Box centred at (x, z) with footprint w×d, rotated by 0/90° only. */
  addCentered(x, z, w, d, y0, y1, opts) {
    return this.addBox(x - w / 2, y0, z - d / 2, x + w / 2, y1, z + d / 2, opts);
  }

  _query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    this._seen.clear();
    for (let gx = Math.floor(minX / CELL); gx <= Math.floor(maxX / CELL); gx++) {
      for (let gz = Math.floor(minZ / CELL); gz <= Math.floor(maxZ / CELL); gz++) {
        const cell = this.grid.get(gx + ',' + gz);
        if (!cell) continue;
        for (const box of cell) {
          if (this._seen.has(box)) continue;
          this._seen.add(box);
          out.push(box);
        }
      }
    }
    return out;
  }

  /**
   * Highest walkable surface under a circle, ignoring anything higher than
   * feetY + stepUp (so you can't snap onto a wall top from the street).
   */
  groundHeight(x, z, radius, feetY, stepUp = 0.35) {
    const list = this._query(x - radius, z - radius, x + radius, z + radius, this._tmp || (this._tmp = []));
    let h = 0;
    const r = radius * 0.6;
    for (const b of list) {
      if (b.maxY > feetY + stepUp) continue;
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
      if (b.maxY > h) h = b.maxY;
    }
    const l = this._l || (this._l = { x: 0, z: 0 });
    for (const d of this._dyn(x, z, radius)) {
      if (d.maxY > feetY + stepUp || d.maxY <= h) continue;
      CollisionWorld.toLocal(d, x, z, l);
      if (Math.abs(l.x) - r > d.hx || Math.abs(l.z) - r > d.hz) continue;
      h = d.maxY;
    }
    return h;
  }

  /** Lowest box bottom above the head that the circle is under (Infinity if none). */
  ceilingHeight(x, z, radius, feetY, height) {
    const list = this._query(x - radius, z - radius, x + radius, z + radius, this._tmp4 || (this._tmp4 = []));
    let c = Infinity;
    const r = radius * 0.7;
    for (const b of list) {
      // Only boxes whose underside is above the body's mid-height count.
      if (b.minY <= feetY + height * 0.5 || b.minY >= c) continue;
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue;
      c = b.minY;
    }
    const l = this._l || (this._l = { x: 0, z: 0 });
    for (const d of this._dyn(x, z, radius)) {
      if (d.minY <= feetY + height * 0.5 || d.minY >= c) continue;
      CollisionWorld.toLocal(d, x, z, l);
      if (Math.abs(l.x) - r > d.hx || Math.abs(l.z) - r > d.hz) continue;
      c = d.minY;
    }
    return c;
  }

  /**
   * Push a vertical capsule (approximated as a circle over [feetY, feetY+height])
   * out of every overlapping box. Mutates pos (x, z). Returns true if blocked.
   */
  resolveCircle(pos, radius, feetY, height, stepUp = 0.35) {
    const list = this._query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, this._tmp2 || (this._tmp2 = []));
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of list) {
        // Boxes we can step onto, or that are entirely above our head, don't block.
        if (b.maxY <= feetY + stepUp || b.minY >= feetY + height) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          // Centre inside the box: push out along the shallowest axis.
          const pen = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z];
          const m = Math.min(...pen);
          if (m === pen[0]) pos.x = b.minX - radius;
          else if (m === pen[1]) pos.x = b.maxX + radius;
          else if (m === pen[2]) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
      }
      // Oriented (vehicle) boxes: the same test in each box's own frame.
      const l = this._l2 || (this._l2 = { x: 0, z: 0 });
      for (const d of this._dyn(pos.x, pos.z, radius)) {
        if (d.maxY <= feetY + stepUp || d.minY >= feetY + height) continue;
        CollisionWorld.toLocal(d, pos.x, pos.z, l);
        const cx = Math.max(-d.hx, Math.min(l.x, d.hx)), cz = Math.max(-d.hz, Math.min(l.z, d.hz));
        const dx = l.x - cx, dz = l.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        hit = true;
        if (d2 > 1e-8) {
          const dd = Math.sqrt(d2);
          l.x = cx + (dx / dd) * radius; l.z = cz + (dz / dd) * radius;
        } else if (d.hx - Math.abs(l.x) < d.hz - Math.abs(l.z)) {
          l.x = Math.sign(l.x || 1) * (d.hx + radius);
        } else {
          l.z = Math.sign(l.z || 1) * (d.hz + radius);
        }
        CollisionWorld.toWorld(d, l.x, l.z, pos);
      }
    }
    return hit;
  }

  /**
   * Climbable ledge in front of a circle at (x, z) moving along (dx, dz).
   * Looks for the nearest climb-tagged box whose side is within `reach` of
   * the circle's edge and whose top is between minH and maxH above the feet,
   * with room to stand on top. Returns the box top, where to hang against the
   * side (wx, wz), where to stand on top (lx, lz) and the yaw facing the side.
   */
  findLedge(x, z, dx, dz, radius, feetY, height, reach, minH, maxH) {
    const far = radius + reach;
    const list = this._query(x - far, z - far, x + far, z + far, this._tmp5 || (this._tmp5 = []));
    let best = null;
    // Boxes are tested in their own frame (identity for the static grid).
    const consider = (b, px, pz, ddx, ddz, d) => {
      if (!b.climb || b.minY > feetY + 0.5) return;
      const h = b.maxY - feetY;
      if (h < minH || h > maxH) return;
      // 2D slab test from the circle centre (inflated by a little so a
      // glancing approach along the side still finds it).
      const ix = 1 / (ddx || 1e-9), iz = 1 / (ddz || 1e-9);
      const m = radius * 0.5;
      const tx1 = (b.minX - m - px) * ix, tx2 = (b.maxX + m - px) * ix;
      const tz1 = (b.minZ - m - pz) * iz, tz2 = (b.maxZ + m - pz) * iz;
      const txn = Math.min(tx1, tx2), tzn = Math.min(tz1, tz2);
      const tmin = Math.max(txn, tzn), tmax = Math.min(Math.max(tx1, tx2), Math.max(tz1, tz2));
      if (tmax < Math.max(tmin, 0) || tmin > (best ? best.t : far)) return;
      best = { b, t: Math.max(tmin, 0), xFace: txn > tzn, px, pz, ddx, ddz, d };
    };
    for (const b of list) consider(b, x, z, dx, dz, null);
    const l = { x: 0, z: 0 };
    for (const d of this._dyn(x, z, far)) {
      CollisionWorld.toLocal(d, x, z, l);
      consider(d, l.x, l.z, dx * d.c - dz * d.s, dx * d.s + dz * d.c, d);
    }
    if (!best) return null;
    const { b, xFace, px, pz, ddx, ddz, d } = best;
    const top = b.maxY;
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    let nx = 0, nz = 0, wx, wz, lx, lz;
    // Hang square-on to the face we hit; stand a step in from its edge.
    if (xFace) {
      nx = ddx > 0 ? -1 : 1;
      const face = nx < 0 ? b.minX : b.maxX;
      wz = lz = clamp(pz, b.minZ + radius * 0.5, b.maxZ - radius * 0.5);
      wx = face + nx * (radius + 0.03);
      lx = clamp(face - nx * (radius + 0.3), b.minX + radius, b.maxX - radius);
      lz = clamp(lz, b.minZ + radius, b.maxZ - radius);
    } else {
      nz = ddz > 0 ? -1 : 1;
      const face = nz < 0 ? b.minZ : b.maxZ;
      wx = lx = clamp(px, b.minX + radius * 0.5, b.maxX - radius * 0.5);
      wz = face + nz * (radius + 0.03);
      lz = clamp(face - nz * (radius + 0.3), b.minZ + radius, b.maxZ - radius);
      lx = clamp(lx, b.minX + radius, b.maxX - radius);
    }
    let yaw = Math.atan2(-nx, -nz);
    if (d) {
      const w = { x: 0, z: 0 };
      CollisionWorld.toWorld(d, wx, wz, w); wx = w.x; wz = w.z;
      CollisionWorld.toWorld(d, lx, lz, w); lx = w.x; lz = w.z;
      yaw += d.yaw;
    }
    // Room to stand: nothing on the roof that would block or hit the head.
    if (this.ceilingHeight(lx, lz, radius, top, height) < top + height) return null;
    const probe = { x: lx, z: lz };
    if (this.resolveCircle(probe, radius, top, height)) return null;
    return { top, wx, wz, lx, lz, yaw, owner: d ? d.owner : null };
  }

  /**
   * Ray vs boxes (slab test). Used by the camera to avoid clipping into
   * buildings. Returns distance to first hit or maxDist.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    const list = this._query(Math.min(ox, ex) - 1, Math.min(oz, ez) - 1, Math.max(ox, ex) + 1, Math.max(oz, ez) + 1, this._tmp3 || (this._tmp3 = []));
    let best = maxDist;
    const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
    for (const b of list) {
      if (!b.camera) continue;
      let t1 = (b.minX - ox) * ix, t2 = (b.maxX - ox) * ix;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      t1 = (b.minY - oy) * iy; t2 = (b.maxY - oy) * iy;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (b.minZ - oz) * iz; t2 = (b.maxZ - oz) * iz;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax >= Math.max(tmin, 0) && tmin < best && tmin > 0) best = tmin;
    }
    const l = this._l3 || (this._l3 = { x: 0, z: 0 });
    for (const d of this._dyn((ox + ex) / 2, (oz + ez) / 2, maxDist / 2 + 1)) {
      if (!d.camera) continue;
      CollisionWorld.toLocal(d, ox, oz, l);
      const ldx = dx * d.c - dz * d.s, ldz = dx * d.s + dz * d.c;
      const jx = 1 / (ldx || 1e-9), jz = 1 / (ldz || 1e-9);
      let t1 = (-d.hx - l.x) * jx, t2 = (d.hx - l.x) * jx;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      t1 = (d.minY - oy) * iy; t2 = (d.maxY - oy) * iy;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (-d.hz - l.z) * jz; t2 = (d.hz - l.z) * jz;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax >= Math.max(tmin, 0) && tmin < best && tmin > 0) best = tmin;
    }
    return best;
  }
}
