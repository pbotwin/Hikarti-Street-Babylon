import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newSave, parseSave, parseProfile, cleanSave, addStat, maxStat, addToSet, describeSave, statRows,
  formatDuration, formatDistance, emptyStats, SAVE_VERSION,
} from '../src/core/SaveData.js';

test('a save round-trips through JSON unchanged', () => {
  const s = newSave(1000);
  s.player = { x: 1.5, y: 0.2, z: -40, yaw: 2 };
  s.fragments = [true, false, true];
  s.portalActive = false;
  s.missions = { cafe: { status: 'active', completed: ['deliver-emi'] } };
  s.tracked = 'cafe';
  s.coins = 120;
  s.vehicles = [{ id: 3, x: 10, z: 20, yaw: 0.5 }];
  addStat(s.stats, 'walked', 250.5);
  addToSet(s.stats, 'residentsMet', 'emi');
  assert.deepEqual(parseSave(JSON.stringify(s)), s);
});

test('missing, corrupt or foreign data loads as no save', () => {
  assert.equal(parseSave(null), null);
  assert.equal(parseSave(''), null);
  assert.equal(parseSave('{not json'), null);
  assert.equal(parseSave('"hello"'), null);
  assert.equal(parseSave('{"foo": 1}'), null);
});

test('damaged fields fall back to defaults without losing the rest', () => {
  const s = cleanSave({
    version: SAVE_VERSION, coins: 'lots', player: { x: 1, y: NaN, z: 2, yaw: 0 },
    fragments: [1, 0, 'yes'], missions: { a: { status: 'bogus' }, b: { status: 'ready', completed: ['x', 5] } },
    vehicles: [{ id: 1, x: 1, z: 2, yaw: 3 }, { id: 'car' }], stats: { walked: -5, jumps: 7, residentsMet: ['a', 'a', 3] },
  });
  assert.equal(s.coins, 0);
  assert.equal(s.player, null);
  assert.deepEqual(s.fragments, [true, false, true]);
  assert.deepEqual(s.missions, { b: { status: 'ready', completed: ['x'] } });
  assert.deepEqual(s.vehicles, [{ id: 1, x: 1, z: 2, yaw: 3 }]);
  assert.equal(s.stats.walked, 0);
  assert.equal(s.stats.jumps, 7);
  assert.deepEqual(s.stats.residentsMet, ['a']);
});

test('a broken profile starts a fresh one', () => {
  const p = parseProfile('{broken');
  assert.equal(p.sessions, 0);
  assert.deepEqual(p.lifetime, emptyStats());
});

test('stat helpers', () => {
  const s = emptyStats();
  addStat(s, 'jumps'); addStat(s, 'jumps', 2);
  maxStat(s, 'topSpeed', 10); maxStat(s, 'topSpeed', 4);
  assert.equal(addToSet(s, 'districts', 'market'), true);
  assert.equal(addToSet(s, 'districts', 'market'), false);
  assert.equal(s.jumps, 3);
  assert.equal(s.topSpeed, 10);
  assert.deepEqual(s.districts, ['market']);
});

test('title summary and stats rows', () => {
  const s = newSave(0);
  s.fragments = [true, true, false];
  s.missions = { a: { status: 'completed', completed: [] } };
  s.coins = 40;
  s.stats.playTime = 3725;
  const d = describeSave(s, { fragmentsTotal: 5, favorsTotal: 6, now: 120000 });
  assert.equal(d.line, '2/5 fragments · 1/6 favors · 40 coins · 1 h 2 min');
  assert.equal(d.saved, 'Saved 2 min ago');
  assert.equal(formatDuration(42), '42 s');
  assert.equal(formatDistance(1530), '1.5 km');
  const rows = statRows(s.stats, s.stats);
  assert.ok(rows.every((r) => r.length === 3));
});

// ------------------------------------------------------------ shops
import { ITEMS, SHOPS, canBuy, DEFAULT_OUTFIT } from '../src/gameplay/ShopData.js';

test('every shop stocks real items, and every item has a sane price', () => {
  for (const [id, shop] of Object.entries(SHOPS)) {
    assert.ok(shop.stock.length, id);
    for (const item of shop.stock) assert.ok(ITEMS[item], `${id} sells unknown ${item}`);
  }
  for (const [id, it] of Object.entries(ITEMS)) assert.ok(Number.isInteger(it.price) && it.price >= 0, id);
  for (const id of Object.values(DEFAULT_OUTFIT)) assert.equal(ITEMS[id].price, 0);
});

test('buying: coins, owned things once, treats any number of times', () => {
  assert.deepEqual(canBuy('ramune', { coins: 10, owned: [] }), { ok: true, coins: 4, keeps: false });
  assert.equal(canBuy('ramune', { coins: 5, owned: [] }).reason, 'Need 1 more coins');
  assert.equal(canBuy('topSky', { coins: 100, owned: ['topSky'] }).reason, 'Owned');
  assert.equal(canBuy('keysKei', { coins: 220, owned: [] }).ok, true);
  assert.equal(canBuy('nope', { coins: 999 }).ok, false);
});

test('shop data in a save is validated', () => {
  const s = cleanSave({ version: SAVE_VERSION, shop: { owned: ['topSky', 3], inventory: { ramune: 2, bad: -1, x: 'y' }, outfit: { top: 'topSky', hair: 5 } } });
  assert.deepEqual(s.shop, { owned: ['topSky'], inventory: { ramune: 2 }, outfit: { top: 'topSky' } });
  assert.equal(cleanSave({ version: SAVE_VERSION }).shop, null);
});
