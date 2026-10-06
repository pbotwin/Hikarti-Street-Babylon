import { Engine, Scene, UniversalCamera, Vector3 } from '@babylonjs/core';
import { Graphics } from './core/Graphics.js';
import { GraphicsSettings } from './core/GraphicsSettings.js';
import { SaveSystem } from './core/SaveSystem.js';
import { ShopSystem } from './gameplay/ShopSystem.js';
import { InteriorSystem } from './interiors/InteriorSystem.js';
import { GameState, Phase } from './core/GameState.js';
import { MobileInput } from './input/MobileInput.js';
import { Character } from './player/Character.js';
import { CharacterAnimation } from './player/CharacterAnimation.js';
import { PlayerController } from './player/PlayerController.js';
import { CameraController } from './camera/CameraController.js';
import { World } from './world/World.js';
import { CollectibleSystem } from './gameplay/CollectibleSystem.js';
import { PortalSystem } from './gameplay/PortalSystem.js';
import { Effects } from './gameplay/Effects.js';
import { UI } from './ui/UI.js';
import { Minimap } from './ui/Minimap.js';
import { HudMenu } from './ui/HudMenu.js';
import { FpsMeter } from './ui/FpsMeter.js';
import { AdaptivePerformance } from './core/AdaptivePerformance.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { VehicleSystem } from './vehicles/VehicleSystem.js';
import { VehicleAssets } from './vehicles/VehicleAssets.js';
import { TyreFX } from './vehicles/TyreFX.js';
import { CarLights } from './vehicles/CarLights.js';
import { NPCSystem } from './npcs/NPCSystem.js';
import { SideMissionSystem } from './gameplay/SideMissionSystem.js';
import './ui/missions.css';
import './ui/exploration.css';

/**
 * Hikari Street on Babylon.js: the same game as the three.js original, wired
 * the same way. ?gfx=low|medium|high|ultra forces a preset; I opens the
 * Babylon Inspector.
 */
const params = new URLSearchParams(location.search);

async function boot() {
  const state = new GameState();
  const ui = new UI(document.getElementById('ui'), state);
  ui.setLoading(0.02, 'Preparing the street…');

  const canvas = document.getElementById('app');
  const engine = new Engine(canvas, false, { stencil: true, antialias: false, powerPreference: 'high-performance' }, true);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;     // same coordinates as the original game
  scene.skipPointerMovePicking = true;
  addEventListener('resize', () => engine.resize());
  const camera = new UniversalCamera('camera', new Vector3(0, 2, -5), scene);
  camera.minZ = 0.15;
  camera.maxZ = 1200;
  camera.inputs.clear();

  const input = new MobileInput(document.getElementById('ui'));
  input.setVisible(false);

  const graphics = new Graphics(engine, scene, camera, { sunDir: [-0.12, 0.23, 0.97] });
  const gfx = graphics;
  const lighting = graphics;
  const world = new World(scene, graphics);
  const charPromise = Character.load(scene, './models/heroine.vrm');
  // The drivable vehicles' Blender models (the original loads them in World.build).
  const vehicleModels = VehicleAssets.load(scene);
  await world.build((p) => ui.setLoading(0.05 + p * 0.5, 'Preparing the street…'));
  const collision = world.collision;
  ui.setLoading(0.6, 'Loading heroine…');
  const character = await charPromise;
  graphics.addCasters(character.meshes);
  ui.setLoading(0.9, 'Lighting the lamps…');

  const cameraRig = new CameraController(camera, input, collision);
  const animation = new CharacterAnimation(character);
  const player = new PlayerController({ character, animation, input, collision, cameraRig, state });
  const collectibles = new CollectibleSystem(scene, state, world.fragmentSpots,
    (x, z, y) => collision.groundHeight(x, z, 0.3, y, 0));
  const effects = new Effects(scene, state, collision);
  const portal = new PortalSystem(scene, state, world.portalSpot);
  await vehicleModels;
  const vehicles = new VehicleSystem({
    ctx: world._ctx, specs: world._ctx.vehicleSpecs, scene, collision, player, animation, character,
    input, cameraRig, state, ui, collectibles, graphics,
  });
  const audio = new AudioSystem(state);
  const tyreFX = new TyreFX(scene, state);
  const carLights = new CarLights(scene, state);
  const npcs = new NPCSystem({ scene, state, collision, gfx, world });
  // Graphics preset: detected for this device, selectable in Settings.
  const settings = new GraphicsSettings({ gfx, lighting, npcs });
  // Frame-rate mode and quality governor (?noadapt turns both off, for tests).
  const adaptive = new AdaptivePerformance(gfx, { npcs, enabled: !params.has('noadapt') });
  const missions = new SideMissionSystem({ scene, state, player, npcs, ui, input, graphics });
  const minimap = new Minimap(document.getElementById('ui'), { player, cameraRig, collectibles, portal, missions, npcs, world });
  const fps = new FpsMeter(document.getElementById('ui'), () => ({
    calls: graphics.drawCalls(), triangles: graphics.triangles(), width: engine.getRenderWidth(), height: engine.getRenderHeight(),
    dpr: 1 / engine.getHardwareScalingLevel(),
    preset: `${settings.preset.label}${settings.mode === 'auto' ? ' (auto)' : ''}`,
    shadowSize: graphics.shadowSize(), gpu: settings.gpu, adaptive: adaptive.describe(),
  }));
  // Save game: Continue / New game, autosave, play stats.
  // Shops: storefronts, Hikari Plaza and Hikari Motors; coins buy treats, clothes, keys.
  const shops = new ShopSystem({ root: document.getElementById('ui'), state, player, vehicles, missions, world, ui, input, specs: world._ctx.vehicleSpecs, character });
  minimap.extraMarkers = () => shops.markers();
  // Walk-in shop interiors (built once the residents' models are in, below).
  const interiors = new InteriorSystem({ scene, collision, state, player, animation, character, cameraRig, lighting, gfx, shops, ui, input, audio, minimap, vehicles, carLights, npcs, world });
  shops.interiors = interiors;
  const saves = new SaveSystem({ state, player, cameraRig, collectibles, portal, missions, vehicles, world, collision, audio, ui, shops });
  const hudMenu = new HudMenu(document.getElementById('ui'), { state, collectibles, audio, minimap, missions, input, graphics: settings, adaptive, saves, shops });
  // Resident voices: settings toggle, and the game's mute switch.
  hudMenu.voices = npcs.voices;
  // What residents can tell her about: fragments, open missions, the portal.
  npcs.game = { collectibles, missions, portal };
  npcs.voices.isMuted = () => audio.muted;
  npcs.voices.onStatus = (t) => console.info('[voices]', t);
  const updateQuestMarkers = () => npcs.setQuestMarkers(missions.getNPCStatuses());
  state.on('mission:changed', updateQuestMarkers);
  updateQuestMarkers();

  const spawn = () => {
    player.spawn(world.spawn.x, world.spawn.z, world.spawn.yaw);
    cameraRig.snapBehind(player);
  };
  spawn();

  state.on('fragment:collected', () => animation.celebrate());
  state.on('game:reset', () => {
    vehicles.reset();
    missions.reset();
    collectibles.reset();
    portal.reset();
    spawn();
  });
  state.on('phase', ({ phase }) => {
    input.setVisible(phase === Phase.PLAYING);
    graphics.setFade(0);
  });
  state.on('ui:start', () => {
    audio.start();
    // Swing the camera back behind her for play.
    cameraRig.targetYaw = player.yaw;
    cameraRig.targetPitch = 0.22;
    state.setPhase(Phase.PLAYING);
  });
  state.on('ui:continue', () => state.setPhase(Phase.PLAYING));
  state.on('ui:restart', () => state.reset());
  // Quit to title (game already saved): back to the title orbit.
  state.on('ui:quit', () => {
    cameraRig.targetYaw = player.yaw - Math.PI * 0.72;
    state.setPhase(Phase.TITLE);
  });

  npcs.onProgress = (n, total) => ui.setLoading(0.9 + 0.08 * n / total, `Waking up the neighbours… ${n}/${total}`);
  await npcs.ready;
  ui.setLoading(0.985, 'Opening the shops…');
  await interiors.init();
  saves.interiors = interiors;
  await scene.whenReadyAsync();
  ui.setLoading(1, 'Ready');

  if (params.has('continue')) state.emit('ui:load');
  else if (params.has('autostart')) state.emit('ui:start');
  else {
    // Start the title orbit from the front so her face greets the player.
    cameraRig.targetYaw = cameraRig.yaw = player.yaw - Math.PI * 0.72;
    state.setPhase(Phase.TITLE);
    audio.start();
    const unlock = () => {
      audio.start();
      if (audio.ctx?.state === 'running') ['pointerdown', 'keydown', 'touchend'].forEach((e) => removeEventListener(e, unlock, true));
    };
    ['pointerdown', 'keydown', 'touchend'].forEach((e) => addEventListener(e, unlock, true));
  }

  // Babylon Inspector (live scene / material / post-process editing).
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyI' || e.repeat || !e.shiftKey) return;
    if (scene.debugLayer.isVisible()) scene.debugLayer.hide();
    else scene.debugLayer.show({ embedMode: true });
  });

  // ---- Main loop -------------------------------------------------------
  let titleTime = 0;
  let last = performance.now();

  window.__game = { engine, scene, camera, state, player, cameraRig, input, collectibles, portal, world, animation, character, gfx, graphics, settings, collision, vehicles, npcs, missions, minimap, hudMenu, adaptive, saves, shops, interiors, tyreFX, carLights, audio, effects, ui };

  // ?fixedstep (testing): simulate in exact 1/60 s steps however slowly
  // frames render, so physics/animation match a real 60 fps phone.
  const fixedStep = params.has('fixedstep');
  let simDebt = 0;

  const loop = () => {
    const now = performance.now();
    if (!adaptive.shouldRender(now)) return;
    const rawDt = Math.min((now - last) / 1000, 0.5);
    last = now;
    const cpuStart = performance.now();
    if (fixedStep) {
      simDebt = Math.min(simDebt + rawDt, 0.5);
      while (simDebt >= 1 / 60) { simDebt -= 1 / 60; update(1 / 60); }
    } else update(Math.min(rawDt, 1 / 20));
    scene.render();
    const cpuMs = performance.now() - cpuStart;
    adaptive.update(rawDt, cpuMs);
    saves.update(Math.min(rawDt, 0.25));
    settings.update(rawDt, state.phase === Phase.PLAYING && adaptive.exhausted, adaptive.targetMs * 1.2);
    fps.update(rawDt, cpuMs);
  };
  engine.runRenderLoop(loop);
  // Test hooks: pause the real loop / step the simulation directly.
  window.__game.setPaused = (p) => { engine.stopRenderLoop(); if (!p) { last = performance.now(); engine.runRenderLoop(loop); } };
  window.__game.simulate = update;
  window.__game.render = () => scene.render();

  // Safety net behind the boundary walls: on foot outside every district
  // (or fallen through the ground), she is put back where she last stood.
  let lastInside = null;
  function keepInPlayArea() {
    if (vehicles.driving || player.ride || player.climb || interiors.inside) return;
    const p = player.position;
    const inside = world.inPlayArea(p) && p.y > -5;
    if (inside) {
      if (player.grounded) lastInside = { x: p.x, y: p.y, z: p.z, yaw: player.yaw };
    } else {
      const to = lastInside || { ...world.spawn, y: 0 };
      player.spawn(to.x, to.z, to.yaw);
      player.position.y = player.visualY = to.y || 0;
      cameraRig.snapBehind(player);
    }
  }

  function update(dt) {
    const playing = state.phase === Phase.PLAYING;
    const controlsActive = playing && !missions.dialogOpen && !hudMenu.open && !shops.open && !interiors.busy && !interiors.seated;
    input.update();
    if (state.phase === Phase.TITLE) {
      // Gentle showcase sway in front of the heroine (street side, never into shopfronts).
      titleTime += dt;
      cameraRig.targetYaw = player.yaw - Math.PI * 0.72 + Math.sin(titleTime * 0.25) * 0.35;
      cameraRig.targetPitch = 0.04;
    }
    vehicles.update(dt, controlsActive);
    player.update(dt, controlsActive);
    keepInPlayArea();
    audio.engine(vehicles.engine());
    cameraRig.update(dt, player, controlsActive);
    lighting.update?.(dt, player.position, camera);
    world.update(dt, camera, player);
    npcs.update(dt, player, vehicles.vehicles);
    audio.skid(tyreFX.update(dt, vehicles.vehicles).skid);
    carLights.update(dt, vehicles.vehicles, vehicles.phase === 'drive' ? vehicles.active : null);
    missions.update(dt);
    shops.update(dt);
    interiors.update(dt);
    collectibles.update(dt, player);
    effects.update(dt, player);
    portal.update(dt, player, gfx);
    character.update(dt);
    audio.update(dt, player, camera, world);
    ui.update(dt, player, world);
    minimap.update(dt);
  }
}

// Offline / installable (production builds only).
// (Not in the Android app: it ships its files and has no use for one.)
if (import.meta.env.PROD && 'serviceWorker' in navigator && !window.Capacitor?.isNativePlatform?.()) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {}));
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById('ui');
  el.innerHTML = `<div class="fatal">Something went wrong while loading.<br><small>${String(err.message || err)}</small></div>`;
});
