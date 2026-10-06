// Tagged city export from the original game (its dev server on :5173):
//   node scripts/export-city.mjs   then   node scripts/optimize-city.mjs
//   raw/city-cast.glb   static meshes that cast shadows
//   raw/city-nocast.glb static meshes that don't
//   raw/city-parts.glb  pieces the Babylon game treats individually, with
//                       node extras: { cast, lod: { cell, level }, shadow,
//                       wind: { strength, start } | grass, anim,
//                       instanceColor: [r, g, b, …] (linear) }
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const RAW = fileURLToPath(new URL('../raw', import.meta.url));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.text().startsWith('[x]')) console.log(m.text()); });
await page.goto('http://localhost:5173/?autostart&noadapt');
await page.waitForFunction(() => window.__game && __game.state.phase === 'playing' && __game.interiors?.ready && !__game.interiors.fronts.pending.length, null, { timeout: 300000 });
await page.evaluate(async () => {
  const g = __game; g.setPaused(true);
  const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const exp = new GLTFExporter();
  const b64 = (buf) => { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  window.__files = {};
  const root = g.world.root;

  // Animated things that are rebuilt live (as in export v2).
  const live = new Set();
  root.traverse((o) => { if ((o.isMesh || o.isPoints) && o.frustumCulled === false) live.add(o); });
  const train = root.getObjectByName('train');
  train?.traverse((o) => live.add(o));
  const scr = g.world.ambient?.scr;
  if (scr) root.traverse((o) => { if (o.material?.map === scr.tex) live.add(o); });

  // Wind parameters, read back from the shader the material would compile.
  const windOf = (m) => {
    if (!m?.onBeforeCompile) return null;
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    try { m.onBeforeCompile(sh); } catch { return null; }
    if (!sh.vertexShader.includes('uTime')) return null;
    if (sh.vertexShader.includes('uPlayer.xz')) return { grass: true };
    const start = /position\.y - ([\d.]+)/.exec(sh.vertexShader), str = /sin\(uTime \* 1\.25 \+ ph\) \* ([\d.]+)/.exec(sh.vertexShader);
    return start && str ? { wind: { strength: +str[1], start: +start[1] } } : null;
  };
  const hex = (c) => '#' + c.getHexString();
  const animOf = (o) => {
    const m = o.material, gp = o.geometry?.parameters || {};
    if (!m || Array.isArray(m)) return null;
    if (o.geometry?.type === 'PlaneGeometry' && gp.width === 0.3 && gp.height === 0.3) {
      if (hex(m.emissive) === '#ff3b30') return 'signalRed';
      if (hex(m.emissive) === '#2eff9a') return 'signalGreen';
    }
    if (o.geometry?.type === 'CircleGeometry' && gp.radius === 1.5 && m.transparent && m.opacity === 0.85) return 'fountainWater';
    if (o.geometry?.type === 'PlaneGeometry' && gp.height === 0.8 && gp.widthSegments === 8 && gp.heightSegments === 4) return 'noren';
    if (o.geometry?.type === 'SphereGeometry' && gp.radius === 0.16 && o.parent?.parent?.children.length > 10) return 'lantern';
    if (o.geometry?.type === 'CylinderGeometry' && gp.radiusTop === 0.1 && gp.height === 0.05 && hex(m.color) === '#2b1f1a') return 'lanternCap';
    if (m.name === 'canalWater') return 'canalWater';
    return null;
  };

  // LOD cells: both levels exported.
  const lodOf = new Map();
  g.world.lod.cells.forEach(({ hi, lo }, cell) => { lodOf.set(hi, { cell, level: 'hi' }); lodOf.set(lo, { cell, level: 'lo' }); });

  const meshes = [];
  root.traverse((o) => { if ((o.isMesh) && !live.has(o)) meshes.push(o); });
  const isVisiblePath = (o) => { for (let p = o; p; p = p.parent) if (!p.visible && !lodOf.has(p)) return false; return true; };
  const keep = meshes.filter((o) => lodOf.has(o) || isVisiblePath(o));
  const cls = new Map();
  const saved = new Map();
  for (const o of keep) {
    const tags = {};
    const lod = lodOf.get(o);
    if (lod) tags.lod = lod;
    if (o.material && !Array.isArray(o.material) && o.material.visible === false) tags.shadow = true;
    const w = windOf(o.material);
    if (w) Object.assign(tags, w);
    const anim = animOf(o);
    if (anim) tags.anim = anim;
    // Per-instance tints (grass blades, trees): glTF instancing carries only
    // position / rotation / scale.
    if (o.isInstancedMesh && o.instanceColor) tags.instanceColor = Array.from(o.instanceColor.array.subarray(0, o.count * 3), (v) => Math.round(v * 1e4) / 1e4);
    const part = Object.keys(tags).length > 0;
    tags.cast = !!o.castShadow;
    cls.set(o, part ? 'parts' : o.castShadow ? 'cast' : 'nocast');
    saved.set(o, { userData: o.userData, visible: o.visible, name: o.name });
    o.userData = part ? tags : {};
  }
  console.log('[x] classes', JSON.stringify([...cls.values()].reduce((a, c) => ((a[c] = (a[c] || 0) + 1), a), {})));
  for (const { hi, lo } of g.world.lod.cells) { hi.visible = true; lo.visible = true; }
  const hiddenLive = [...live].filter((o) => o.visible);
  for (const o of hiddenLive) o.visible = false;
  // Shadow-only stand-in materials are invisible in three; the exporter only
  // looks at objects, so nothing to change for them.
  const others = meshes.filter((o) => !cls.has(o));
  for (const o of others) o.visible = false;

  for (const pass of ['cast', 'nocast', 'parts']) {
    for (const [o, c] of cls) o.visible = c === pass;
    root.updateMatrixWorld(true);
    window.__files[`city-${pass}.glb`] = b64(await exp.parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 }));
    console.log('[x] exported', pass);
  }
  for (const [o, s] of saved) { o.userData = s.userData; o.visible = s.visible; o.name = s.name; }
  for (const o of hiddenLive) o.visible = true;
  for (const o of others) o.visible = true;
});
const names = await page.evaluate(() => Object.keys(window.__files));
for (const n of names) {
  const len = await page.evaluate((n) => window.__files[n].length, n);
  const parts = [];
  for (let i = 0; i < len; i += 8e6) parts.push(await page.evaluate(([n, a, b]) => window.__files[n].slice(a, b), [n, i, i + 8e6]));
  fs.writeFileSync(`${RAW}/${n}`, Buffer.from(parts.join(''), 'base64'));
  console.log('wrote', n, fs.statSync(`${RAW}/${n}`).size);
}

// Layout data, merged into city.json (keys exported elsewhere, e.g. the
// interiors' rooms, are kept).
const data = await page.evaluate(async () => {
  const g = __game;
  // The game's own module instances (after hot updates their URLs carry a
  // ?t= stamp; a plain import would load a fresh, empty copy).
  const live = (path) => import(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes(path)).pop() || path);
  const { places } = await live('/src/npcs/life/Places.js');
  const { plantedSakura } = await live('/src/world/Vegetation.js');
  const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) !== Object.prototype && !x.isVector3 ? undefined : x)));
  const train = g.world.root.getObjectByName('train');
  return {
    places: plain(places),
    train: { y: train.position.y, z: train.position.z },
    boxes: g.collision.boxes.map((b) => [b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, b.camera ? 1 : 0, b.climb ? 1 : 0]),
    spawn: g.world.spawn,
    fragments: g.world.fragmentSpots.map((v) => [v.x, v.y, v.z]),
    portal: { x: g.world.portalSpot.position.x, z: g.world.portalSpot.position.z, yaw: g.world.portalSpot.yaw },
    shops: g.shops.spots.map((s) => ({ shop: s.shop, name: s.name, x: s.x, z: s.z, stall: !!s.stall, machine: s.machine || null })),
    shopSpots: g.world.shopSpots,
    vehicles: g.world._ctx.vehicleSpecs.map((v) => ({ type: v.type, x: v.x, z: v.z, ry: v.ry, model: v.model, paint: v.paint || null, showroom: v.showroom || null })),
    districts: g.world.districts,
    sun: g.graphics.lighting.sunDir.toArray(),
    parkCenter: g.world.parkCenter,
    sakura: plantedSakura.map(([x, y, z]) => [x, y, z]),
  };
});
const jsonPath = fileURLToPath(new URL('../public/world/city.json', import.meta.url));
fs.writeFileSync(jsonPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(jsonPath, 'utf8')), ...data }));
console.log('merged', Object.keys(data).join(' '), 'into city.json');
await browser.close();
