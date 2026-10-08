import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { SIDE_MISSIONS } from '../src/gameplay/SideMissionData.js';
import { REWARDS } from '../src/gameplay/ShopData.js';

const url = process.argv[2] || 'http://127.0.0.1:5180/?autostart';
const out = 'shots/exploration';
fs.mkdirSync(out, { recursive: true });
const executablePath = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].find((path) => path && fs.existsSync(path));
const browser = await chromium.launch({ executablePath, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: true });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__game || document.querySelector('.fatal'), null, { timeout: 180000 });
  assert.equal(await page.locator('.fatal').count(), 0, 'Game must boot');
  await page.evaluate(() => { window.__game.setPaused(true); window.__game.input._setMode('mouse'); });
  const go = async (x, z) => page.evaluate(({ x, z }) => {
    const g = window.__game;
    g.player.spawn(x, z, 0);
    for (let i = 0; i < 8; i++) g.simulate(1 / 60);
    g.cameraRig.snapBehind(g.player);
    g.cameraRig.update(1 / 60, g.player, false);
    g.render();
  }, { x, z });
  const npc = async (id) => page.evaluate((id) => {
    const n = window.__game.npcs.get(id); return { x: n.position.x, z: n.position.z };
  }, id);
  const talk = async (id) => {
    const p = await npc(id); await go(p.x + .75, p.z);
    await page.keyboard.press('f');
    assert.equal(await page.evaluate(() => window.__game.missions.dialogOpen), true, `Talk to ${id}`);
  };
  const status = (id) => page.evaluate((id) => window.__game.state.sideMissions[id].status, id);
  const snapshot = async (name) => { await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' }); };
  const population = await page.evaluate(() => ({ count: window.__game.npcs.items.length,
    styles: new Set(window.__game.npcs.items.map((n) => n.spec.style)).size }));
  assert.ok(population.count >= 32, 'Residents populate the larger city'); assert.ok(population.styles >= 7);

  await page.keyboard.press('m');
  assert.equal(await page.evaluate(() => window.__game.minimap.expanded), true);
  await snapshot('desktop-map');
  const overviewZoom = await page.evaluate(() => window.__game.minimap.zoom);
  await page.locator('[data-map-action="in"]').click();
  assert.ok(await page.evaluate((zoom) => window.__game.minimap.zoom > zoom, overviewZoom), 'Expanded map zooms');
  await page.evaluate(() => { window.__game.minimap.focusPlayer(); window.__game.minimap.update(1); });
  await snapshot('map-player-focus');
  const canvasBounds = await page.locator('.minimap.big canvas').boundingBox();
  const centerBeforeDrag = await page.evaluate(() => ({ ...window.__game.minimap._center }));
  await page.mouse.move(canvasBounds.x + canvasBounds.width / 2, canvasBounds.y + canvasBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBounds.x + canvasBounds.width / 2 + 60, canvasBounds.y + canvasBounds.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  const centerAfterDrag = await page.evaluate(() => ({ ...window.__game.minimap._center }));
  assert.ok(Math.hypot(centerAfterDrag.x - centerBeforeDrag.x, centerAfterDrag.z - centerBeforeDrag.z) > 1, 'Drag pans expanded map');
  await page.evaluate(() => window.__game.minimap.showOverview());
  await page.keyboard.press('Escape');
  await go(0, 78); await snapshot('market');
  await go(0, 110); await snapshot('garden');

  for (const mission of SIDE_MISSIONS) {
    await talk(mission.giver);
    if (mission.kind === 'delivery') await snapshot('conversation');
    await page.keyboard.press('Enter');
    assert.equal(await status(mission.id), 'active');
    for (const objective of mission.objectives) {
      if (objective.npc) { await talk(objective.npc); await page.keyboard.press('Enter'); }
      else { await go(objective.x, objective.z); await page.keyboard.press('f'); }
    }
    assert.equal(await status(mission.id), 'ready', `${mission.id} objectives`);
    await talk(mission.giver); await page.keyboard.press('Enter');
    assert.equal(await status(mission.id), 'completed', `${mission.id} reward`);
  }
  // The four favors pay 305; every district discovered on the way pays too.
  const districts = await page.evaluate(() => window.__game.saves.current.stats.districts.length);
  const expected = 305 + REWARDS.district * districts;
  assert.equal(await page.evaluate(() => window.__game.state.coins), expected);
  const story = await page.evaluate(() => {
    const g = window.__game;
    for (const item of g.collectibles.items) {
      g.player.position.copyFrom(item.base); g.player.position.y -= .8;
      g.player.visualY = g.player.position.y;
      g.collectibles.update(1 / 60, g.player);
    }
    return { count: g.state.fragmentsCollected, portal: g.state.portalActive };
  });
  assert.deepEqual(story, { count: 5, portal: true }, 'Original fragment story still unlocks portal');
  await page.keyboard.press('q');
  assert.equal(await page.locator('.journal-quest.completed').count(), 4);
  await snapshot('completed-journal');
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  assert.match(await page.locator('.wallet').innerText(), new RegExp(String(expected)));
  await page.keyboard.press('Escape');

  // Reset must clean up progress and restore both input and the mission props.
  await page.evaluate(() => { const g = window.__game; g.state.reset(); g.simulate(1 / 60); });
  assert.deepEqual(await page.evaluate(() => ({ coins: window.__game.state.coins,
    status: Object.values(window.__game.state.sideMissions).map((m) => m.status),
    enabled: window.__game.input.enabled })), { coins: 0, status: Array(4).fill('available'), enabled: true });

  // Check actual movement through the previous map boundary and to the north gate.
  await go(0, 39);
  await page.keyboard.down('Shift'); await page.keyboard.down('w');
  await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 1080; i++) g.simulate(1 / 60); });
  await page.keyboard.up('w'); await page.keyboard.up('Shift');
  assert.ok(await page.evaluate(() => window.__game.player.position.z > 130), 'Walk from old street to north garden');

  // The previous north boundary must lead to the city, with clear street loops.
  await go(0, 136);
  const cityAudit = await page.evaluate(async () => {
    const g = window.__game;
    const { L } = await import('/src/world/Layout.js');
    const issues = [];
    const clear = (x, z, radius = .3) => {
      const y = g.collision.groundHeight(x, z, radius, .3, .05);
      const probe = { x, z };
      g.collision.resolveCircle(probe, radius, y, 1.55, .3);
      return Math.hypot(x - probe.x, z - probe.z) < .025;
    };
    // Swept road centers also catch the former north wall and scenery towers.
    for (const road of L.cityRoads) {
      const horizontal = road.x1 - road.x0 > road.z1 - road.z0;
      const start = horizontal ? road.x0 : road.z0, end = horizontal ? road.x1 : road.z1;
      for (let v = start + 5; v <= end - 5; v += 1) {
        const x = horizontal ? v : (road.x0 + road.x1) / 2;
        const z = horizontal ? (road.z0 + road.z1) / 2 : v;
        if (!clear(x, z, 1.05)) issues.push(`${road.id} at ${x},${z}`);
      }
    }
    for (const npc of g.npcs.items.filter((n) => n.spec.z >= L.city.z0)) {
      for (const [x, z] of npc.spec.route || [[npc.spec.x, npc.spec.z]]) {
        if (!clear(x, z)) issues.push(`Resident ${npc.id} at ${x},${z}`);
      }
    }
    g.input._keys.add('ShiftLeft'); g.input._keys.add('KeyW'); g.input.update();
    for (let i = 0; i < 2500; i++) g.player.update(1 / 60, true);
    g.input._keys.clear(); g.input.update();
    return { issues, north: g.player.position.z, roads: L.cityRoads.length,
      blocks: L.cityBlocks.length, area: (L.city.x1 - L.city.x0) * (L.city.z1 - L.city.z0) };
  });
  assert.deepEqual(cityAudit.issues, [], 'City roads and resident routes are clear');
  assert.ok(cityAudit.north > 350, `North boundary opens to entire city: ${cityAudit.north}`);
  assert.ok(cityAudit.area >= 50000 && cityAudit.blocks >= 20, 'Substantial populated city expansion');
  await go(-80, 192); await snapshot('residential-quarter');
  await go(86, 205); await snapshot('canal-district');
  await go(0, 286); await snapshot('civic-park');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__game.input._setMode('touch'));
  await go(0, 79); await snapshot('phone-market');
  await page.locator('[data-panel="map"]').tap();
  await snapshot('phone-map');
  await page.locator('[data-map-action="player"]').tap();
  assert.ok(await page.evaluate(() => window.__game.minimap.zoom >= 2.5), 'Touch Find me zooms to player');
  await page.locator('[data-map-action="overview"]').tap();
  assert.equal(await page.evaluate(() => window.__game.minimap.zoom), 1, 'Touch Overview restores city extent');
  const bounds = await page.locator('.minimap.big').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 845);
  await page.locator('.map-close').tap();
  await page.locator('[data-panel="quests"]').tap();
  await snapshot('phone-journal');
  // A real touch gesture must reach the lower missions in the long journal.
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 165, y: 650 }] });
  for (let i = 1; i <= 10; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 165, y: 650 - i * 35 }] });
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  assert.ok(await page.locator('.sheet-card').evaluate((el) => el.scrollTop > 80), 'Touch-scroll quest journal');
  await session.detach();
  await page.locator('.sheet-x').tap();
  const aoi = await npc('aoi'); await go(aoi.x + .75, aoi.z);
  await page.locator('.mission-action').tap();
  await snapshot('phone-dialogue');
  await page.locator('.mission-choice.primary').tap();
  assert.equal(await status('cafe-delivery'), 'active');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('[data-panel="map"]').tap();
  await snapshot('landscape-map');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(`PASS: ${population.count} NPCs; 4 missions; ${expected} coins; reset; ${cityAudit.blocks} city buildings; ${cityAudit.roads} clear roads; full north traversal; map zoom; touch journal; desktop, portrait and landscape UI.`);
  console.log(`Screenshots: ${out}`);
} finally { await browser.close(); }
