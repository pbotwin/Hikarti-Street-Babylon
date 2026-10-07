import { Color3, Mesh, StandardMaterial, TransformNode, VertexData } from '@babylonjs/core';
import { GROCERIES } from './MallCatalog.js';
import { PACK_SIZE, ProductSet, groceryLabel } from '../interiors/Products.js';

/**
 * The supermarket's stock: every shelf (layout.grocery.shelves) and bin
 * (produce tables, chest freezers) filled with the catalog's groceries of
 * its aisle, in neat facings (columns two deep, flat packs stacked) with a
 * price tag on the shelf edge under each product. Packs are thin instances.
 *
 * Triangles: the store holds tens of thousands of packs, so shelves are
 * grouped in ~4 m chunks; a chunk near the camera draws its packs in full
 * (its own ProductSet), every other one draws them as far packs (front,
 * print and top quads: one ProductSet for the whole store).
 *
 * A facing is one product's block on one shelf level (or one bin section):
 * what she aims at (target()), takes the front pack of (take()) and puts
 * packs back into (restore()).
 */
const ROWS = 2;              // packs one behind the other in a facing
const CHUNK = 4.2;           // m: shelf sections grouped for the near / far switch
const NEAR = 6.5, FAR = 8;   // m from the camera to a chunk: full packs inside NEAR, far packs beyond FAR
const REACH = 1.25;          // m in front of a shelf she can take from
const AIM = Math.cos(0.42);  // the camera's view within this angle of a facing picks it

export class ShelfStock {
  constructor(scene) {
    this.scene = scene;
    this.root = new TransformNode('mall:stock', scene);
    this.far = new ProductSet(this.root, { grocery: true });
    this.tags = new ProductSet(this.root, { grocery: true });
    this.chunks = new Map();
    this.chunkList = [];       // the same, for the per-frame loops
    this.facings = [];
    this._check = 0;
  }

  /** Fill the layout's shelves and bins (behind the loading screen). */
  build(grocery) {
    const byAisle = new Map();
    for (const p of GROCERIES) {
      if (!byAisle.has(p.aisle)) byAisle.set(p.aisle, []);
      byAisle.get(p.aisle).push(p);
    }
    // Every shelf level of an aisle is a slot; its products go round them,
    // so neighbouring levels and sections hold different things.
    const slots = new Map();
    const shelves = [...grocery.shelves].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const s of shelves) {
      const lv = [...s.levels].sort((a, b) => a - b);
      lv.forEach((y, i) => {
        if (!slots.has(s.aisle)) slots.set(s.aisle, []);
        slots.get(s.aisle).push({ s, y, gap: (lv[i + 1] ?? y + 0.36) - y });
      });
    }
    for (const [aisle, list] of slots) {
      const products = byAisle.get(aisle) || [];
      if (!products.length) continue;
      const per = Math.min(3, Math.max(1, Math.ceil(products.length / list.length)));
      list.forEach((slot, k) => {
        const picks = [];
        for (let j = 0; picks.length < per && j < products.length; j++) {
          const p = products[(k * per + j) % products.length];
          if (dims(p).h < slot.gap - 0.03 && !picks.includes(p)) picks.push(p);
        }
        picks.forEach((p, j) => this._shelfFacing(slot.s, slot.y, slot.gap, p, j, picks.length));
      });
    }
    const bins = [...grocery.bins].sort((a, b) => (a.id < b.id ? -1 : 1));
    const binCount = new Map();
    for (const b of bins) {
      const products = byAisle.get(b.aisle) || [];
      if (!products.length) continue;
      const k = binCount.get(b.aisle) || 0;
      binCount.set(b.aisle, k + 1);
      const n = Math.min(2, products.length);
      for (let j = 0; j < n; j++) this._binFacing(b, products[(k * n + j) % products.length], j, n);
    }
    this.far.build();
    this.tags.build();
    this.chunkList = [...this.chunks.values()];
    for (const c of this.chunkList) { c.set.build(); for (const m of c.set.meshes) m.setEnabled(false); }
    this.marker = buildMarker(this.scene, this.root);
  }

  _chunk(x, z) {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let c = this.chunks.get(key);
    if (!c) {
      c = { set: new ProductSet(this.root, { grocery: true }), x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, near: false, facings: [] };
      this.chunks.set(key, c);
    }
    c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.z0 = Math.min(c.z0, z); c.z1 = Math.max(c.z1, z);
    return c;
  }

  /** A pack of product p in facing f at a world pose, in the chunk's set and the far set. */
  _unit(f, x, y, z, ry, rx) {
    const p = f.p, label = groceryLabel(p.id), s = p.look.size || 1;
    const u = f.chunk.set.add(p.look.shape, p.look.color, x, y, z, ry, s, label);
    u.rx = rx;
    u.twin = this.far.add(`far:${p.look.shape}`, p.look.color, x, y, z, ry, s, label);
    u.twin.rx = rx;
    u.taken = false;
    f.units.push(u);
    return u;
  }

  /** One product's block on a shelf level: columns, two rows deep, flat packs stacked. */
  _shelfFacing(s, y, gap, p, j, n) {
    const nx = s.face.x, nz = s.face.z, ax = nz, az = -nx;
    const fx = s.x + nx * s.depth / 2, fz = s.z + nz * s.depth / 2;
    const bw = s.w / n, u0 = -s.w / 2 + bw * (j + 0.5);
    const d = dims(p);
    const cols = Math.max(1, Math.floor((bw - 0.03) / (d.w + 0.008)));
    const rows = Math.max(1, Math.min(ROWS, Math.floor((s.depth - 0.03) / (d.d + 0.006))));
    const layers = d.h < 0.08 ? Math.max(1, Math.min(3, Math.floor((gap - 0.05) / d.h))) : 1;
    const cx = fx + ax * u0, cz = fz + az * u0;
    const f = { p, kind: 'shelf', x: cx, z: cz, nx, nz, ax, az, y, h: d.h * layers, half: bw / 2, units: [], chunk: this._chunk(cx, cz), left: 0 };
    // Pick order: front row first, top of a stack first.
    for (let r = 0; r < rows; r++) {
      const back = 0.015 + d.d / 2 + r * (d.d + 0.006);
      for (let l = layers - 1; l >= 0; l--) {
        for (let c = 0; c < cols; c++) {
          const u = u0 + (c - (cols - 1) / 2) * (bw / cols);
          this._unit(f, fx + ax * u - nx * back, y + l * d.h, fz + az * u - nz * back, s.yaw, 0);
        }
      }
    }
    f.left = f.units.length;
    f.chunk.facings.push(f);
    this.facings.push(f);
    this.tags.add('tag', '#ffffff', cx + nx * 0.012, y - 0.021, cz + nz * 0.012, s.yaw, 1, groceryLabel(p.id));
  }

  /** One product's section of a bin: a grid over its surface (freezer packs lie flat, print up). */
  _binFacing(b, p, j, n) {
    const ny = b.yaw, nx = Math.sin(ny), nz = Math.cos(ny), ax = nz, az = -nx;
    const bw = b.w / n, u0 = -b.w / 2 + bw * (j + 0.5);
    const d = dims(p);
    const lie = b.aisle === 'frozen' || p.look.shape === 'bag';
    const fw = d.w, fd = lie ? d.h : d.d, fh = lie ? d.d : d.h;
    const cols = Math.max(1, Math.floor((bw - 0.04) / (fw + 0.01)));
    const rows = Math.max(1, Math.min(6, Math.floor((b.depth - 0.04) / (fd + 0.01))));
    const cx = b.x + ax * u0, cz = b.z + az * u0;
    const f = { p, kind: 'bin', x: cx, z: cz, nx, nz, ax, az, y: b.y, h: fh, half: bw / 2, depth: b.depth, units: [], chunk: this._chunk(cx, cz), left: 0 };
    for (let r = 0; r < rows; r++) {
      const v = (r - (rows - 1) / 2) * (b.depth / rows);
      for (let c = 0; c < cols; c++) {
        const u = u0 + (c - (cols - 1) / 2) * (bw / cols) + Math.sin(r * 3.1 + c) * 0.006;
        // Lying packs: turned onto their backs (print up), re-centred on the cell.
        const x = b.x + ax * u + nx * v + (lie ? nx * fd / 2 : 0), z = b.z + az * u + nz * v + (lie ? nz * fd / 2 : 0);
        this._unit(f, x, b.y + (lie ? fh / 2 : 0), z, b.yaw + Math.sin(r + c * 2.3) * 0.08, lie ? -Math.PI / 2 : 0);
      }
    }
    f.left = f.units.length;
    f.chunk.facings.push(f);
    this.facings.push(f);
    this.tags.add('tag', '#ffffff', cx + nx * (b.depth / 2 + 0.012), b.y - 0.035, cz + nz * (b.depth / 2 + 0.012), b.yaw, 1, groceryLabel(p.id));
  }

  // ------------------------------------------------------------ per frame
  /** Near chunks show full packs, the rest far ones (checked a few times a second). */
  update(dt, camera) {
    this._check -= dt;
    if (this._check > 0) return;
    this._check = 0.2;
    const cx = camera.x, cz = camera.z;
    let changed = false;
    for (const c of this.chunkList) {
      const dx = Math.max(c.x0 - cx, 0, cx - c.x1), dz = Math.max(c.z0 - cz, 0, cz - c.z1);
      const d = Math.hypot(dx, dz);
      const near = c.near ? d < FAR : d < NEAR;
      if (near === c.near) continue;
      c.near = near;
      changed = true;
      for (const m of c.set.meshes) m.setEnabled(near);
      for (const f of c.facings) for (const u of f.units) {
        const t = u.twin;
        this.far.move(t, t.x, t.y, t.z, t.ry, t.rx, !near && !u.taken);
      }
    }
    if (changed) this.far.flush();
  }

  /**
   * The facing she is looking at (camera ray `eye` + `dir`, unit) from where
   * she stands (px, pz): near enough, in front of it, the camera aimed at it.
   * `id`: only facings of that product with room for one more (putting back).
   */
  target(eye, dir, px, pz, id = null) {
    let best = null, bestCos = AIM;
    for (const c of this.chunkList) {
      if (!c.near) continue;
      for (const f of c.facings) {
        if (id ? f.p.id !== id || f.left >= f.units.length : f.left === 0) continue;
        const rx = px - f.x, rz = pz - f.z;
        const along = Math.abs(rx * f.ax + rz * f.az);
        let front = rx * f.nx + rz * f.nz;
        if (f.kind === 'bin') front = Math.abs(front) - f.depth / 2;
        if (front < 0.05 || front > REACH || along > f.half + 0.55) continue;
        const vx = f.x - eye.x, vy = f.y + f.h / 2 - eye.y, vz = f.z - eye.z;
        const cos = (vx * dir.x + vy * dir.y + vz * dir.z) / (Math.hypot(vx, vy, vz) || 1);
        if (cos > bestCos) { bestCos = cos; best = f; }
      }
    }
    return best;
  }

  /** The pack she would take from a facing: the front one (shelves), the nearest (bins). */
  next(f, px, pz) {
    let best = null, bd = Infinity;
    for (const u of f.units) {
      if (u.taken) continue;
      if (f.kind === 'shelf') return u;
      const d = (u.x - px) ** 2 + (u.z - pz) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  /** The free place a pack goes back to: where it came from if free, else the front-most free one. */
  spot(f, prefer = null) {
    if (prefer && prefer.taken && f.units.includes(prefer)) return prefer;
    return f.units.find((u) => u.taken) || null;
  }

  /** Take a pack off its shelf (its place shows empty). */
  take(f, u) {
    u.taken = true;
    f.left--;
    f.chunk.set.setVisible(u, false);
    this.far.setVisible(u.twin, false);
  }

  /** A pack is back in its place. */
  restore(f, u) {
    u.taken = false;
    f.left++;
    f.chunk.set.setVisible(u, true);
    if (!f.chunk.near) this.far.setVisible(u.twin, true);
  }

  /** The bobbing marker over the pack she would take (null: none). */
  mark(u, f, t) {
    const m = this.marker;
    m.setEnabled(!!u);
    if (!u) return;
    const top = f.kind === 'bin' ? f.h : dims(f.p).h;
    m.position.set(u.x, u.y + top + 0.07 + Math.sin(t * 5) * 0.012, u.z);
    m.rotation.y = t * 1.5;
  }

  dispose() {
    this.far.dispose();
    this.tags.dispose();
    for (const c of this.chunks.values()) c.set.dispose();
    this.chunks.clear();
    this.facings.length = 0;
    this.marker?.material.dispose();
    this.root.dispose();
  }
}

/** A product's pack size (catalog size scales it). */
export function dims(p) {
  const s = p.look.size || 1, d = PACK_SIZE[p.look.shape] || PACK_SIZE.pack;
  return { w: d.w * s, d: d.d * s, h: d.h * s };
}

/** A small glowing arrow pointing down at the pack she would take. */
function buildMarker(scene, parent) {
  const m = new Mesh('mall:pickMarker', scene);
  VertexData.CreateCylinder({ height: 0.05, diameterTop: 0.04, diameterBottom: 0, tessellation: 4 }).applyToMesh(m);
  const mat = new StandardMaterial('mall:pickMarker', scene);
  mat.disableLighting = true;
  mat.emissiveColor = Color3.FromHexString('#ffe9a8');
  m.material = mat;
  m.parent = parent;
  m.isPickable = false;
  m.setEnabled(false);
  return m;
}
