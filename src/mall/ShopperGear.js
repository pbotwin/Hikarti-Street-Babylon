import { BoundingInfo, Color3, Mesh, PBRMaterial, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import { PACK_SIZE, ProductSet, groceryLabel } from '../interiors/Products.js';
import { labelFor } from '../interiors/Labels.js';
import { CART, CartFleet } from './Cart.js';
import { BAG, Bags } from './Bags.js';
import { GROCERIES } from './MallCatalog.js';

/**
 * What the mall's shoppers push and carry, made with the shopping module's
 * own pieces so theirs look like hers: carts from the trip's CartFleet,
 * the mall's paper bags (Bags), grocery packs as dynamic ProductSet units,
 * plus hand baskets (one thin-instanced mesh for all shoppers). Everything
 * is pooled at load: during play units are only claimed, moved (matrix
 * writes, uploaded once per frame by commit()) and given back.
 *
 * A container (one per shopper) is a cart, a basket or nothing, with a
 * world pose (place()) and its goods. A good is loose (in a hand, on the
 * belt: moveGood()) until it lands in the container: aim() reserves its
 * place there and says where that is, land() puts it in.
 */
// Basket: slots in its frame (origin at the grip, the basket hanging below it).
const BASKET_SLOTS = [[-0.09, -0.36, -0.06], [0.09, -0.36, 0.06], [0.09, -0.36, -0.06], [-0.09, -0.36, 0.06], [0, -0.3, 0]];
export const GRIPS = { cart: CART.grips, basket: [0, 0, 0] };
/** From the pusher's feet to the cart's origin. */
export const CART_AHEAD = CART.behind;
const GARMENT_SHAPES = ['tee', 'folded', 'shoes'];
const GARMENT_SIZE = { w: 0.3, d: 0.26, h: 0.06 };
const CART_GOODS = 24, BAGS_EACH = 2;
const _v = new Vector3();

export class ShopperGear {
  constructor(ctx, count) {
    const { scene, graphics, layout } = ctx;
    this.graphics = graphics;
    this.root = new TransformNode('mall:shopperGear', scene);
    this.fleet = CartFleet.for(ctx);
    // Packs and garments, pooled per shape (a pool that runs dry grows: an allocation, never per frame).
    this.packs = new ProductSet(this.root, { grocery: true, dynamic: true });
    for (const shape of new Set(GROCERIES.map((p) => p.look.shape))) this.packs.reserve(shape, 4 + count);
    this.packs.build();
    this.garments = new ProductSet(this.root, { dynamic: true });
    for (const shape of GARMENT_SHAPES) this.garments.reserve(shape, 2 + Math.ceil(count / 3));
    this.garments.build();
    // Paper bags, all made now (Bags grows by reallocating its buffer).
    this.bags = new Bags(scene, graphics, this.packs);
    this.freeBags = Array.from({ length: count * BAGS_EACH }, () => this.bags.add());
    // Baskets: one mesh, a unit per shopper.
    this.basket = buildBasket(scene);
    this.basketMatrices = new Float32Array(count * 16);
    for (let i = 0; i < count; i++) write(this.basketMatrices, i, 0, 0, 0, 0, 0);
    this.basket.thinInstanceSetBuffer('matrix', this.basketMatrices, 16, false);
    this.basket.doNotSyncBoundingInfo = true;
    const b = layout.bounds;
    this.basket.setBoundingInfo(new BoundingInfo(new Vector3(b.x0, -1, b.z0), new Vector3(b.x1, 4, b.z1)));
    graphics.addCasters([this.basket]);
    this.basketDirty = false;
    this.boxes = Array.from({ length: count }, () => ({ kind: null, cart: null, x: 0, y: 0, z: 0, yaw: 0, goods: [], bags: [] }));
  }

  // ------------------------------------------------------------ containers
  /** Give shopper `i` a cart (standing at x, z, yaw), a basket or nothing (what was in it goes). */
  setKind(i, kind, x = 0, z = 0, yaw = 0) {
    const b = this.boxes[i];
    if (b.kind === kind) return;
    while (b.goods.length) this.drop(b.goods[b.goods.length - 1]);
    while (b.bags.length) this.releaseBag(b.bags.pop());
    if (b.cart) { b.cart.dispose(); b.cart = null; }
    if (b.kind === 'basket') { write(this.basketMatrices, i, 0, 0, 0, 0, 0); this.basketDirty = true; }
    b.kind = kind;
    if (kind === 'cart') b.cart = this.fleet.add({ x, z, yaw });
    if (kind) this.place(i, x, b.y, z, yaw);
  }

  /** The cart shopper `i` pushes (null: none). */
  cart(i) { return this.boxes[i].cart; }

  /** Move shopper `i`'s container (and what's in it) to a world pose (a cart's origin, a basket's grip). */
  place(i, x, y, z, yaw) {
    const b = this.boxes[i];
    b.x = x; b.y = y; b.z = z; b.yaw = yaw;
    if (b.cart) { b.cart.moveTo(x, z, yaw); return; }
    if (b.kind !== 'basket') return;
    write(this.basketMatrices, i, 1, x, y, z, yaw);
    this.basketDirty = true;
    for (let k = 0; k < b.goods.length; k++) if (!b.goods[k].flying) this._toSlot(b, b.goods[k], BASKET_SLOTS[k]);
  }

  _toSlot(b, g, [lx, ly, lz]) {
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    this.moveGood(g, b.x + lx * c + lz * s, b.y + ly, b.z - lx * s + lz * c, b.yaw + g.spin);
  }

  /** A world point in shopper `i`'s container frame (into `out`). */
  point(i, [lx, ly, lz], out) {
    const b = this.boxes[i];
    if (b.cart) return b.cart.toWorld(lx, ly, lz, out);
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    return out.set(b.x + lx * c + lz * s, b.y + ly, b.z - lx * s + lz * c);
  }

  /** How many goods shopper `i` has in their container. */
  count(i) { return this.boxes[i].goods.length; }

  /** Room for another good? */
  room(i) {
    const b = this.boxes[i];
    return b.kind === 'cart' ? b.goods.length < CART_GOODS : b.kind === 'basket' && b.goods.length < BASKET_SLOTS.length;
  }

  // ------------------------------------------------------------ goods
  /**
   * A new loose good: a catalog grocery, or a garment ({ id, kind, color }).
   * Not shown until moved; whoever holds it owns it until it lands or is dropped.
   */
  good(item) {
    const grocery = !!item.look;
    const set = grocery ? this.packs : this.garments;
    const shape = grocery ? item.look.shape : item.kind === 'shoes' ? 'shoes' : item.kind === 'bottom' ? 'folded' : 'tee';
    const unit = set.acquire(shape, grocery ? item.look.color : item.color, grocery ? groceryLabel(item.id) : labelFor(item.id), item.look?.size || 1);
    const size = grocery ? sizeOf(item) : GARMENT_SIZE;
    return { set, unit, shape, box: null, flying: false, spin: (Math.random() - 0.5) * 0.5, entry: { size, put: (x, y, z, yaw) => set.move(unit, x, y, z, yaw), flying: false } };
  }

  moveGood(g, x, y, z, yaw) { g.set.move(g.unit, x, y, z, yaw); }

  /** Reserve the good's place in shopper `i`'s container; its world spot into `out`. False when full. */
  aim(i, g, out) {
    const b = this.boxes[i];
    if (!this.room(i)) return false;
    g.flying = g.entry.flying = true;
    if (b.cart && !b.cart.stow(g.entry)) { g.flying = g.entry.flying = false; return false; }
    g.box = b;
    b.goods.push(g);
    if (b.cart) b.cart.slotWorld(g.entry, out);
    else this.point(i, BASKET_SLOTS[b.goods.length - 1], out);
    return true;
  }

  /** A hand lets go of the good above its place (aim()): into a cart it drops from where it is; into a basket. */
  letGo(g) {
    const b = g.box;
    if (!b.cart) { this.land(g); return; }
    g.flying = false;
    b.cart.release(g.entry, g.unit.x, g.unit.y, g.unit.z, g.unit.ry);
  }

  /** The good is in its container (put straight in its place). */
  land(g) {
    const b = g.box;
    g.flying = g.entry.flying = false;
    if (!b.cart) { this._toSlot(b, g, BASKET_SLOTS[b.goods.indexOf(g)]); return; }
    b.cart.slotWorld(g.entry, _v);
    g.entry.put(_v.x, _v.y, _v.z, b.cart.yaw + g.entry.slot.yaw);
  }

  /** Take the last good out of shopper `i`'s container: loose again, the caller's. */
  unstow(i) {
    const b = this.boxes[i], g = b.goods.pop();
    if (!g) return null;
    b.cart?.unstow(g.entry);
    g.box = null;
    return g;
  }

  /** The good is gone (hung back, scanned). */
  drop(g) {
    const b = g.box;
    if (b) {
      b.goods.splice(b.goods.indexOf(g), 1);
      b.cart?.unstow(g.entry);
      g.box = null;
    }
    g.set.release(g.unit);
  }

  // ------------------------------------------------------------ bags
  /** `n` full bags into shopper `i`'s cart. */
  bagCart(i, n) {
    const b = this.boxes[i];
    for (let k = 0; k < n && this.freeBags.length; k++) {
      const bag = this.freeBags.pop();
      b.bags.push(bag);
      b.cart.stow(this.bags.entry(bag));
    }
  }

  /** A bag for a hand (null if none is left). */
  takeBag() { return this.freeBags.pop() || null; }

  /** Hang a carried bag from a hand at (x, y, z). */
  carryBag(bag, x, y, z, yaw) { this.bags.put(bag, x, y - BAG.handle, z, yaw); }

  releaseBag(bag) {
    this.bags.put(bag, 0, -50, 0, 0);
    this.freeBags.push(bag);
  }

  /** Upload what moved this frame (one buffer update per mesh; the carts are the fleet's). */
  commit() {
    this.packs.flush();
    this.garments.flush();
    this.bags.update();
    if (this.basketDirty) {
      this.basketDirty = false;
      this.basket.thinInstanceBufferUpdated('matrix');
    }
  }

  dispose() {
    for (let i = 0; i < this.boxes.length; i++) this.setKind(i, null);
    this.graphics.removeCasters([this.basket]);
    this.basket.material.dispose();
    this.basket.dispose();
    this.bags.dispose();
    this.packs.dispose();
    this.garments.dispose();
    this.root.dispose();
  }
}

const sizeOf = (p) => {
  const s = p.look.size || 1, d = PACK_SIZE[p.look.shape] || PACK_SIZE.pack;
  return { w: d.w * s, d: d.d * s, h: d.h * s };
};

/** A yaw-only transform (Babylon's row-major layout) at scale `k` into slot `i`. */
function write(m, i, k, x, y, z, yaw) {
  const c = Math.cos(yaw) * k, s = Math.sin(yaw) * k, o = i * 16;
  m[o] = c; m[o + 1] = 0; m[o + 2] = -s; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = k; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = s; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
}

/** A red plastic hand basket hanging from its grip (the origin): boxes merged into one vertex-coloured mesh. */
function buildBasket(scene) {
  const W = 0.42, D = 0.3, top = -0.15, bot = -0.37, t = 0.012, RED = '#c8323a', DARK = '#2a2b30';
  const list = [[0, bot, 0, W, t, D, RED]];
  for (const x of [-W / 2, W / 2]) list.push([x, (top + bot) / 2, 0, t, top - bot, D, RED]);
  for (const z of [-D / 2, D / 2]) list.push([0, (top + bot) / 2, z, W, top - bot, t, RED]);
  // The two handles meet at the grip.
  for (const z of [-0.07, 0.07]) list.push([0, top + 0.07, z * 0.5, 0.03, 0.15, 0.02, DARK]);
  list.push([0, 0, 0, 0.1, 0.025, 0.06, DARK]);
  const parts = list.map(([x, y, z, w, h, d, hex]) => {
    const vd = VertexData.CreateBox({ width: w, height: h, depth: d });
    for (let k = 0; k < vd.positions.length; k += 3) { vd.positions[k] += x; vd.positions[k + 1] += y; vd.positions[k + 2] += z; }
    const c = Color3.FromHexString(hex).toLinearSpace();
    vd.colors = new Float32Array(vd.positions.length / 3 * 4);
    for (let k = 0; k < vd.colors.length; k += 4) { vd.colors[k] = c.r; vd.colors[k + 1] = c.g; vd.colors[k + 2] = c.b; vd.colors[k + 3] = 1; }
    return vd;
  });
  const mesh = new Mesh('mall:shopperBaskets', scene);
  parts[0].merge(parts.slice(1), true).applyToMesh(mesh);
  const mat = new PBRMaterial('mall:shopperBasket', scene);
  mat.metallic = 0;
  mat.roughness = 0.55;
  mesh.material = mat;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}
