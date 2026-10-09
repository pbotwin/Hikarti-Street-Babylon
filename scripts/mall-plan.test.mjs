import test from 'node:test';
import assert from 'node:assert/strict';
import { planLayout, parkedCars, siteTransform, concourseObstacles } from '../src/mall/MallPlan.js';
import { AISLES, RACKS, SHOP_GOODS, GOODS_BY_ID } from '../src/mall/MallCatalog.js';

// Hikari Mall's layout is the contract the shopping, fashion and shopper
// modules build on (MALL.md): check it is complete and self-consistent.
const origin = { x: 2600, z: 2600 };
const lay = planLayout(origin);
const inRect = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

test('layout has every MALL.md field', () => {
  for (const k of ['origin', 'bounds', 'building', 'spawn', 'car', 'exit', 'entrances', 'cartCorrals', 'grocery', 'checkouts', 'fashion', 'nav', 'lot', 'concourse', 'shops', 'upper', 'rides', 'lift']) assert.ok(lay[k], k);
  assert.equal(lay.car.model, 'car_kei_pink');
  assert.ok(lay.building.ceilingY > lay.building.floorY);
});

test('site frame turns half round about the origin', () => {
  const T = siteTransform(origin);
  assert.deepEqual(T.p(3, 4), { x: 2597, z: 2596 });
  assert.ok(Math.abs(T.yaw(0) - Math.PI) < 1e-9 || Math.abs(T.yaw(0) + Math.PI) < 1e-9);
});

test('everything sits where it belongs', () => {
  const B = lay.building;
  assert.ok(inRect(lay.bounds, lay.spawn.x, lay.spawn.z) && !inRect(B, lay.spawn.x, lay.spawn.z));
  assert.ok(Math.hypot(lay.spawn.x - lay.car.x, lay.spawn.z - lay.car.z) < 3, 'spawn next to her car');
  assert.ok(!inRect(B, (lay.exit.x0 + lay.exit.x1) / 2, (lay.exit.z0 + lay.exit.z1) / 2));
  for (const e of lay.entrances) assert.ok(Math.abs(e.z - B.z1) < 1e-6 || Math.abs(e.z - B.z0) < 1e-6, 'entrance on the front');
  for (const s of lay.grocery.shelves) {
    assert.ok(inRect(lay.grocery.zone, s.x, s.z), s.id);
    assert.ok(AISLES[s.aisle], s.id);
    assert.ok(s.levels.length >= 3 && s.levels.length <= 5, s.id);
    assert.ok(Math.abs(Math.hypot(s.face.x, s.face.z) - 1) < 1e-9);
    assert.ok(Math.abs(Math.sin(s.yaw) - s.face.x) < 1e-9 && Math.abs(Math.cos(s.yaw) - s.face.z) < 1e-9, `${s.id} yaw faces the walkway`);
  }
  for (const b of lay.grocery.bins) assert.ok(inRect(lay.grocery.zone, b.x, b.z) && AISLES[b.aisle], b.id);
  assert.equal(new Set(lay.grocery.shelves.map((s) => s.aisle)).size, Object.keys(AISLES).length, 'every aisle stocked somewhere');
  assert.equal(lay.checkouts.length, 4);
  for (const r of lay.fashion.racks) {
    assert.ok(RACKS[r.rack] && r.hooks.length > 0, r.id);
    for (const [x, , z] of r.hooks) assert.ok(inRect(lay.fashion.zone, x, z), r.id);
  }
  assert.deepEqual([...new Set(lay.fashion.racks.map((r) => r.rack))].sort(), Object.keys(RACKS).sort());
  assert.equal(lay.fashion.fittingRooms.length, 3);
  for (const f of lay.fashion.fittingRooms) assert.ok(inRect(lay.fashion.zone, f.inside.x, f.inside.z) && f.curtain);
  for (const c of lay.cartCorrals) assert.ok(c.slots.length >= c.count);
  assert.ok(lay.cartCorrals[0].count >= 10);
});

test('parked cars stay out of her bay and the one she drives through', () => {
  // The bay ahead is one bay length further along her car's nose.
  const ahead = { x: lay.car.x + Math.sin(lay.car.yaw) * 5.2, z: lay.car.z + Math.cos(lay.car.yaw) * 5.2 };
  for (const c of parkedCars()) {
    const w = siteTransform(origin).p(c.x, c.z);
    for (const b of [lay.car, ahead]) assert.ok(Math.hypot(w.x - b.x, w.z - b.z) > 2, 'clear of her bay and the bay ahead');
  }
  const free = lay.lot.bays.filter((b) => b.free);
  assert.ok(free.length > 20 && free.length < lay.lot.bays.length);
});

test('walk graph is one connected piece with no zero-length links, both floors joined by the escalators', () => {
  const { nodes, links, rides } = lay.nav;
  const fwd = nodes.map(() => []), back = nodes.map(() => []);
  for (const [a, b] of links) {
    assert.notEqual(a, b);
    assert.ok(Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]) > 0.1);
    assert.equal(nodes[a][2], nodes[b][2], 'a walk stays on its floor');
    fwd[a].push(b); fwd[b].push(a); back[a].push(b); back[b].push(a);
  }
  // Rides go one way: every node reachable from the lot, and the lot from every node.
  for (const [a, b, i] of rides) {
    const r = lay.rides[i];
    assert.ok(r && Math.hypot(nodes[a][0] - r.from.x, nodes[a][1] - r.from.z) < 1e-6 && nodes[a][2] === r.from.y, `ride ${i} starts at its node`);
    assert.ok(Math.hypot(nodes[b][0] - r.to.x, nodes[b][1] - r.to.z) < 1e-6 && nodes[b][2] === r.to.y, `ride ${i} ends at its node`);
    fwd[a].push(b); back[b].push(a);
  }
  for (const adj of [fwd, back]) {
    const seen = new Set([0]), stack = [0];
    while (stack.length) for (const n of adj[stack.pop()]) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    assert.equal(seen.size, nodes.length);
  }
  assert.deepEqual([...new Set(nodes.map((n) => n[2]))].sort(), [0, lay.upper.y]);
  assert.deepEqual(lay.rides.map((r) => r.up), [true, false], 'one escalator up, one down');
  for (const [x, z] of nodes) assert.ok(inRect(lay.bounds, x, z));
});

test('walk-in shops: tills, goods and the walk graph inside every one', () => {
  assert.ok(lay.shops.filter((s) => !s.y).length >= 9 && lay.shops.filter((s) => s.y).length >= 4);
  const sold = new Set();
  const { nodes } = lay.nav;
  for (const s of lay.shops) {
    assert.ok(s.tills.length >= 1, s.kind);
    assert.ok(s.y === 0 || s.y === lay.upper.y, s.kind);
    const inZone = (x, z) => inRect(s.zone, x, z), Z = s.zone;
    assert.ok(Math.abs(s.door.z - Z.z0) < 1e-6 || Math.abs(s.door.z - Z.z1) < 1e-6, `${s.kind} door on its front`);
    for (const t of s.tills) {
      for (const p of [t.clerk, { x: t.lay[0], z: t.lay[2] }, { x: t.register[0], z: t.register[2] }]) assert.ok(inZone(p.x, p.z), `${s.kind} till`);
      assert.ok(Math.abs(Math.hypot(t.face.x, t.face.z) - 1) < 1e-9 && t.top > s.y);
      for (const g of t.goods) { sold.add(g.id); assert.equal(GOODS_BY_ID[g.id]?.shop, s.kind, g.id); assert.ok(inZone(g.x, g.z) && inZone(g.pick.x, g.pick.z), g.id); }
    }
    for (const g of s.goods) {
      sold.add(g.id);
      assert.equal(GOODS_BY_ID[g.id]?.shop, s.kind, g.id);
      assert.ok(inRect(s.table, g.x, g.z), `${g.id} on its table`);
    }
    for (const b of [...s.browse, s.buy]) assert.ok(inZone(b.x, b.z), `${s.kind} spot`);
    assert.ok(nodes.filter(([x, z, y]) => y === s.y && inZone(x, z)).length >= 2, `${s.kind} on the walk graph`);
  }
  assert.deepEqual([...sold].sort(), SHOP_GOODS.map((g) => g.id).sort(), 'every good sold somewhere, once');
});

test('the concourse: shops along it, the walk graph on it and clear of what stands there', () => {
  const C = lay.concourse;
  assert.ok(C.storefronts.length >= 8);
  for (const f of C.storefronts) assert.ok(inRect(C.zone, f.x, f.z), f.kind);
  const { nodes, links } = lay.nav;
  assert.ok(nodes.filter(([x, z, y]) => !y && inRect(C.zone, x, z)).length >= 20, 'the graph covers the concourse');
  assert.ok(nodes.filter(([x, z, y]) => y && inRect(C.zone, x, z)).length >= 12, 'and the galleries over it');
  // Every walk keeps 0.45 m (a shopper, a cart's half width) from everything standing on the concourse floor.
  const T = siteTransform(origin), rects = concourseObstacles().map((o) => T.rect(o));
  const gap = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
  for (const [a, b] of links) {
    if (nodes[a][2]) continue;   // the upper floor's walks are above it all
    const [x0, z0] = nodes[a], [x1, z1] = nodes[b], n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
      for (const r of rects) assert.ok(gap(r, x, z) > 0.45, `link ${a}-${b} passes ${gap(r, x, z).toFixed(2)} m from an obstacle`);
    }
  }
});
