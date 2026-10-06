import { Engine, Scene, Vector3 } from '@babylonjs/core';
import { GameState, Phase } from './core/GameState.js';
import { Graphics, PRESETS, detectTier } from './core/Graphics.js';
import { loadCity } from './world/City.js';
import { loadVrm } from './player/Vrm.js';
import { Animator } from './player/Animator.js';
import { Player } from './player/Player.js';
import { CameraRig } from './camera/CameraRig.js';
import { MobileInput } from './input/MobileInput.js';
import { UI } from './ui/UI.js';

/**
 * Hikari Street, rebuilt on Babylon.js.
 * ?gfx=low|medium|high|ultra forces a preset; I opens the Babylon Inspector.
 */
const params = new URLSearchParams(location.search);

async function boot() {
  const state = new GameState();
  const ui = new UI(document.getElementById('ui'), state);
  ui.setLoading(0.03, 'Starting Babylon…');

  const canvas = document.getElementById('app');
  const engine = new Engine(canvas, false, { stencil: true, antialias: false, powerPreference: 'high-performance' }, true);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;     // same coordinates as the original game
  scene.skipPointerMovePicking = true;
  addEventListener('resize', () => engine.resize());

  const input = new MobileInput(document.getElementById('ui'));
  input.setVisible(false);

  // City first (its collision is shared by player and camera).
  const sunDir = [-0.12, 0.23, 0.97];
  const cameraRig = new CameraRig(scene, input, null);
  const graphics = new Graphics(engine, scene, cameraRig.camera, { sunDir });
  ui.setLoading(0.08, 'Building the street…');
  const city = await loadCity(scene, graphics, (p) => ui.setLoading(0.08 + p * 0.5, 'Building the street…'));
  cameraRig.collision = city.collision;
  const tier = PRESETS[params.get('gfx')] ? params.get('gfx') : detectTier(engine);
  graphics.apply(tier);

  ui.setLoading(0.65, 'Loading heroine…');
  const vrm = await loadVrm(scene, './models/heroine.vrm');
  graphics.addCasters(vrm.meshes);
  const animator = new Animator(vrm);
  const player = new Player({ vrm, animator, input, collision: city.collision, cameraRig, state });
  const spawn = city.data.spawn;
  player.spawn(spawn.x, spawn.z, spawn.yaw);
  cameraRig.snapBehind(player);

  ui.setLoading(0.95, 'Lighting the lamps…');
  await scene.whenReadyAsync();
  ui.setLoading(1, 'Ready');

  state.on('phase', ({ phase }) => input.setVisible(phase === Phase.PLAYING));
  state.on('ui:start', () => { cameraRig.targetYaw = player.yaw; cameraRig.targetPitch = 0.22; state.setPhase(Phase.PLAYING); });
  state.on('ui:new', () => state.emit('ui:start'));
  state.on('ui:load', () => state.emit('ui:start'));
  if (params.has('autostart')) state.emit('ui:start');
  else {
    cameraRig.targetYaw = cameraRig.yaw = player.yaw - Math.PI * 0.72;
    state.setPhase(Phase.TITLE);
  }

  // Babylon Inspector (live scene / material / post-process editing).
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyI' || e.repeat) return;
    if (scene.debugLayer.isVisible()) scene.debugLayer.hide();
    else scene.debugLayer.show({ embedMode: true });
  });

  let titleTime = 0;
  const update = (dt) => {
    const playing = state.phase === Phase.PLAYING;
    input.update();
    if (state.phase === Phase.TITLE) {
      titleTime += dt;
      cameraRig.targetYaw = player.yaw - Math.PI * 0.72 + Math.sin(titleTime * 0.25) * 0.35;
      cameraRig.targetPitch = 0.04;
    }
    player.update(dt, playing);
    cameraRig.update(dt, player, playing);
  };
  window.__game = { engine, scene, graphics, player, cameraRig, city, vrm, animator, state, update, input };
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 1 / 20);
    update(dt);
    scene.render();
  });
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('ui').innerHTML = `<div class="fatal">Something went wrong while loading.<br><small>${String(err.message || err)}</small></div>`;
});

export { Vector3 };
