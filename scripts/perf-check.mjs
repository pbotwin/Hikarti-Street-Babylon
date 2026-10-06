// Performance, stutter and leak check on a phone-sized screen.
//
//   npm run dev                        # then, in another terminal:
//   node scripts/perf-check.mjs [url]  # default http://127.0.0.1:5180/
//
// Runs desktop Chrome on the real GPU with a 390×844 @3x viewport and the CPU
// slowed 4× (roughly a flagship phone), and reports:
//   1. frame time and draw calls per graphics preset at four spots;
//   2. stutters: frames over 50 ms on a fresh tour of every district and a
//      ride (each one is a shader, upload or allocation problem);
//   3. leaks: geometries / materials / textures / shader programs and JS heap that keep
//      growing on a second, identical lap.
// Exits with code 1 when stutters or leaks are found. Compare frame times
// before and after a change on the same machine; absolute numbers vary.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = (process.argv[2] || 'http://127.0.0.1:5180/').replace(/\/?(\?.*)?$/, '/');
const chrome = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && fs.existsSync(p));
const gpuArgs = process.platform === 'win32' ? ['--use-angle=d3d11'] : [];
const browser = await chromium.launch({
  executablePath: chrome, headless: false,
  args: [...gpuArgs, '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-precise-memory-info'],
});
const SPOTS = [[0, 40, 0], [0, 78, 0], [0, 115, Math.PI], [0, 250, 0]];
const TOUR = [[0, 20], [0, 78], [0, 115], [0, 160], [0, 250], [0, 340], [-100, 250], [100, 250], [118, 220], [-60, 300], [0, 0]];
let failed = false;

async function open(preset, throttle) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  page.on('pageerror', (e) => { console.log('  page error:', e.message); failed = true; });
  // noadapt: measure the preset itself, without the frame cap or the
  // adaptive governor changing resolution mid-measurement.
  await page.goto(`${base}?autostart&noadapt&gfx=${preset}`);
  await page.waitForFunction(() => window.__game, null, { timeout: 180000 });
  // Residents stream in after the start; let them finish.
  await page.waitForFunction(() => window.__game.npcs.items.every((n) => n.vrm), null, { timeout: 120000 }).catch(() => {});
  if (throttle > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
  return page;
}

// 1. Frame time per preset: best of five 12-frame blocks per spot (robust to
//    background load), with draw calls.
console.log('Frame time, phone screen, CPU 4× slower (best of 5 blocks):');
for (const preset of ['high', 'medium', 'low']) {
  const page = await open(preset, 4);
  const rows = [];
  for (const spot of SPOTS) {
    rows.push(await page.evaluate(async ([x, z, yaw]) => {
      const g = window.__game, gl = g.engine._gl;
      g.player.spawn(x, z, yaw); g.cameraRig.snapBehind(g.player);
      await new Promise((res) => setTimeout(res, 1500));
      g.setPaused(true);
      const frame = () => { g.simulate(1 / 60); g.render(); };
      for (let i = 0; i < 10; i++) frame();
      gl.finish();
      let best = Infinity;
      for (let b = 0; b < 5; b++) {
        const t = performance.now();
        for (let i = 0; i < 12; i++) frame();
        gl.finish();
        best = Math.min(best, (performance.now() - t) / 12);
      }
      g.render(); const calls = g.graphics.drawCalls();   // counts are per whole frame
      g.setPaused(false);
      return [best, calls];
    }, spot));
  }
  const ms = rows.map((r) => r[0]), calls = rows.map((r) => r[1]);
  console.log(`  ${preset.padEnd(7)} ${(ms.reduce((a, b) => a + b) / ms.length).toFixed(1)} ms avg (${ms.map((m) => m.toFixed(1)).join(' / ')}), draw calls ${Math.min(...calls)}–${Math.max(...calls)}`);
  await page.close();
}

// 2 + 3. Stutters and leaks: two identical laps of every district and a ride.
const page = await open('high', 1);
await page.evaluate(() => {
  const rec = window.__rec = { label: '', hitches: [] };
  let last = performance.now();
  const tick = () => { const now = performance.now(); if (now - last > 50) rec.hitches.push(`${rec.label} ${Math.round(now - last)} ms`); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
// Garbage collected first: otherwise the heap figure includes whatever the
// lap left for the collector, and a lap can look like a leak when it isn't.
const cdp = await page.context().newCDPSession(page);
const counts = async () => (await cdp.send('HeapProfiler.collectGarbage'), page.evaluate(() => {
  const { scene, engine } = window.__game;
  return {
    geometries: scene.geometries.length, materials: scene.materials.length, textures: scene.textures.length,
    programs: Object.keys(engine._compiledEffects).length, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
  };
}));
const laps = [];
for (let lap = 1; lap <= 2; lap++) {
  for (const [x, z] of TOUR) {
    await page.evaluate(([x, z, lap]) => { window.__rec.label = `lap ${lap} at ${x},${z}:`; const g = window.__game; g.player.spawn(x, z, 0); g.cameraRig.snapBehind(g.player); }, [x, z, lap]);
    await page.keyboard.down('w'); await page.waitForTimeout(2500); await page.keyboard.up('w');
  }
  await page.evaluate((lap) => {
    window.__rec.label = `lap ${lap} ride:`;
    const g = window.__game, v = g.vehicles.vehicles[0], s = Math.sin(v.yaw), c = Math.cos(v.yaw), off = v.dims.w / 2 + 0.6;
    g.player.spawn(v.x + off * c, v.z - off * s, 0); g.cameraRig.snapBehind(g.player);
  }, lap);
  await page.waitForTimeout(600); await page.keyboard.press('e'); await page.waitForTimeout(4000);
  await page.keyboard.down('w'); await page.waitForTimeout(2500); await page.keyboard.up('w');
  await page.keyboard.press('e'); await page.waitForTimeout(3500);
  laps.push(await counts());
}
const hitches = await page.evaluate(() => window.__rec.hitches);
console.log(`\nStutters over 50 ms on the tour: ${hitches.length ? hitches.join(', ') : 'none'}`);
if (hitches.length) failed = true;
const [a, b] = laps;
const grew = Object.keys(a).filter((k) => k !== 'heapMB' && b[k] > a[k]);
console.log(`GPU objects after lap 1 → lap 2: ${Object.keys(a).filter((k) => k !== 'heapMB').map((k) => `${k} ${a[k]} → ${b[k]}`).join(', ')}`);
console.log(`JS heap after lap 1 → lap 2: ${a.heapMB} → ${b.heapMB} MB`);
if (grew.length) { console.log(`LEAK: ${grew.join(', ')} keep growing on an identical lap`); failed = true; }
if (b.heapMB - a.heapMB > 60) { console.log('LEAK: JS heap grew by more than 60 MB on an identical lap'); failed = true; }

await browser.close();
console.log(failed ? '\nperf-check: FAILED' : '\nperf-check: OK');
process.exit(failed ? 1 : 0);
