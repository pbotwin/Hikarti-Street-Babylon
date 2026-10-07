import test from 'node:test';
import assert from 'node:assert/strict';
import { planLayout, parkedCars, siteTransform } from '../src/mall/MallPlan.js';
import { AISLES, RACKS } from '../src/mall/MallCatalog.js';

// Hikari Mall's layout is the contract the shopping, fashion and shopper
// modules build on (MALL.md): check it is complete and self-consistent.
const origin = { x: 2600, z: 2600 };
const lay = planLayout(origin);
const inRect = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

test('layout has every MALL.md field', () => {
  for (const k of ['origin', 'bounds', 'building', 'spawn', 'car', 'exit', 'entrances', 'cartCorrals', 'grocery', 'checkouts', 'fashion', 'nav', 'lot']) assert.ok(lay[k], k);
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

test('walk graph is one connected piece with no zero-length links', () => {
  const { nodes, links } = lay.nav;
  const adj = nodes.map(() => []);
  for (const [a, b] of links) {
    assert.notEqual(a, b);
    assert.ok(Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]) > 0.1);
    adj[a].push(b); adj[b].push(a);
  }
  const seen = new Set([0]), stack = [0];
  while (stack.length) for (const n of adj[stack.pop()]) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  assert.equal(seen.size, nodes.length);
  for (const [x, z] of nodes) assert.ok(inRect(lay.bounds, x, z));
});
