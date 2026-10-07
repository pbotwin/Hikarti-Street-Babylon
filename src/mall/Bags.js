import { Matrix, PBRMaterial, Quaternion, Vector3 } from '@babylonjs/core';
import { Batch, lin } from './MallKit.js';
import { torus } from '../interiors/Products.js';

/**
 * Hikari Mall's paper carrier bags, filled at the checkout: kraft paper,
 * the mall's pink band, twisted paper handles. Every bag is a thin
 * instance of one mesh (one draw); the goods inside are the trip's loose
 * packs, stacked in the bag (tall ones stick out of the top) and moved
 * with it, so a bag in the cart, in her hand or in the boot carries them.
 *
 * Bag frame: base centre on y = 0, its width along x, handles on the long
 * sides; put() places that base in the world.
 */
export const BAG = { w: 0.3, d: 0.16, h: 0.33, handle: 0.385, hold: 8 };   // handle: top of the handles above the base; hold: items at most
const INNER = { w: 0.27, d: 0.13 };
const _m = new Matrix(), _q = new Quaternion(), _v = new Vector3(), _one = Vector3.One();

export class Bags {
  constructor(scene, graphics, goods) {
    Object.assign(this, { graphics, goods });
    this.list = [];
    this.material = new PBRMaterial('mall:bag', scene);
    this.material.roughness = 0.85;
    this.material.metallic = 0;
    this.material.albedoColor = lin('#ffffff');
    // Seen from inside too (an open bag).
    this.material.backFaceCulling = false;
    this.material.twoSidedLighting = true;
    const b = new Batch(scene, 'mall:bags');
    buildBag(b, this.material);
    [this.mesh] = b.build(null);
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.matrices = new Float32Array(8 * 16);
    this.mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    this.mesh.thinInstanceCount = 0;
    graphics.addCasters([this.mesh]);
    this.dirty = false;
  }

  /** A new, empty bag (hidden until placed). */
  add() {
    const n = this.list.length;
    if ((n + 1) * 16 > this.matrices.length) {
      const m = new Float32Array(this.matrices.length * 2);
      m.set(this.matrices);
      this.matrices = m;
      this.mesh.thinInstanceSetBuffer('matrix', m, 16, false);
    }
    const bag = { index: n, items: [], x: 0, y: -50, z: 0, yaw: 0, heights: new Float32Array(14 * 7) };
    this.list.push(bag);
    this.mesh.thinInstanceCount = this.list.length;
    this.put(bag, 0, -50, 0, 0);
    return bag;
  }

  /**
   * Where `item` (a goods unit with its pack size) goes in the bag: on the
   * lowest spot it fits, upright; flat packs may go on top of others while
   * they stay below the rim. Returns its bag-space pose (kept with the
   * item), or null when it doesn't fit (a new bag then).
   */
  pack(bag, item, size) {
    if (bag.items.length >= BAG.hold) return null;
    const H = bag.heights, cols = 14, rows = 7, cw = INNER.w / cols, rd = INNER.d / rows;
    // Packs too long for the bag stand on end.
    const w = Math.min(size.w, INNER.w), d = Math.min(size.d, INNER.d);
    const nc = Math.max(1, Math.ceil(w / cw)), nr = Math.max(1, Math.ceil(d / rd));
    let best = null;
    for (let r0 = 0; r0 + nr <= rows; r0++) {
      for (let c0 = 0; c0 + nc <= cols; c0++) {
        let base = 0;
        for (let r = r0; r < r0 + nr; r++) for (let c = c0; c < c0 + nc; c++) base = Math.max(base, H[r * cols + c]);
        if (!best || base < best.base - 0.005) best = { base, c0, r0 };
      }
    }
    if (best.base > 0.005 && best.base + size.h > BAG.h + 0.04) return null;
    for (let r = best.r0; r < best.r0 + nr; r++) for (let c = best.c0; c < best.c0 + nc; c++) H[r * cols + c] = best.base + size.h;
    const local = {
      x: -INNER.w / 2 + (best.c0 + nc / 2) * cw, y: 0.012 + best.base, z: -INNER.d / 2 + (best.r0 + nr / 2) * rd,
      yaw: (bag.items.length % 2 ? 0.1 : -0.08),
    };
    bag.items.push({ item, local });
    return local;
  }

  /** Bag-space point to world (for an item on its way in). */
  toWorld(bag, lx, ly, lz, out) {
    const s = Math.sin(bag.yaw), c = Math.cos(bag.yaw);
    out.x = bag.x + c * lx + s * lz; out.y = bag.y + ly; out.z = bag.z - s * lx + c * lz;
    return out;
  }

  /** Place a bag (its base centre) and everything in it. */
  put(bag, x, y, z, yaw) {
    bag.x = x; bag.y = y; bag.z = z; bag.yaw = yaw;
    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, _q);
    Matrix.ComposeToRef(_one, _q, _v.set(x, y, z), _m);
    _m.copyToArray(this.matrices, bag.index * 16);
    this.dirty = true;
    for (const { item, local } of bag.items) {
      if (item.flying) continue;
      this.toWorld(bag, local.x, local.y, local.z, _v);
      this.goods.move(item.unit, _v.x, _v.y, _v.z, yaw + local.yaw);
    }
  }

  /** The bag as a carrier (in her hand, a cart, the boot), made once per bag. */
  entry(bag) {
    if (!bag.carrier) {
      bag.carrier = carrier({ w: BAG.w, d: BAG.d, h: BAG.h }, BAG.handle, (x, y, z, yaw) => this.put(bag, x, y, z, yaw));
      Object.assign(bag.carrier, { x: bag.x, y: bag.y, z: bag.z, yaw: bag.yaw });
    }
    return bag.carrier;
  }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.thinInstanceBufferUpdated('matrix');
  }

  dispose() {
    this.graphics.removeCasters([this.mesh]);
    this.mesh.dispose();
    this.material.dispose();
    this.list.length = 0;
  }
}

/**
 * A carried bag (one of these, or the clothing store's): its size, the
 * height of its handles above its base, its base pose (x, y, z, yaw) and
 * put(), which moves it there. A cart stows it, her palm carries it, the
 * boot holds it, whoever made it.
 */
export function carrier(size, handle, place) {
  const c = {
    carrier: true, size, handle, x: 0, y: 0, z: 0, yaw: 0, flying: false,
    put(x, y, z, yaw) { c.x = x; c.y = y; c.z = z; c.yaw = yaw; place(x, y, z, yaw); },
  };
  return c;
}

/** The bag: open-topped kraft body, a folded rim, the mall's band and logo, two handles. */
function buildBag(b, mat) {
  const kraft = lin('#c89a63'), rim = lin('#b98a55'), pink = lin('#e27c9a'), white = lin('#fbf6ef');
  const { w, d, h } = BAG, x0 = -w / 2, z0 = -d / 2;
  // Walls (no lid), the bottom, and the inside face of the rim fold.
  b.face(mat, kraft, [x0, 0, z0 + d], [w, 0, 0], [0, h, 0]);
  b.face(mat, kraft, [x0 + w, 0, z0], [-w, 0, 0], [0, h, 0]);
  b.face(mat, kraft, [x0, 0, z0], [0, 0, d], [0, h, 0]);
  b.face(mat, kraft, [x0 + w, 0, z0 + d], [0, 0, -d], [0, h, 0]);
  b.face(mat, rim, [x0, 0.004, z0], [w, 0, 0], [0, 0, d]);
  // Pink band and a white roundel on both long sides.
  for (const s of [1, -1]) {
    const z = s * (d / 2 + 0.002);
    b.panel(mat, pink, 0, z, [0, s], w, h * 0.52, h * 0.7);
    b.panel(mat, white, 0, z + s * 0.001, [0, s], 0.07, h * 0.24, h * 0.44);
    b.panel(mat, rim, 0, z, [0, s], w, h - 0.025, h);
    // Twisted paper handle: an arch over the opening.
    b.shape(mat, rim, torus(0.055, 0.0045, 5, 12, Math.PI), Matrix.Translation(0, h, s * (d / 2 - 0.012)));
  }
}
