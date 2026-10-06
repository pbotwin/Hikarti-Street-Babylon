import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { GameState, Phase } from '../src/core/GameState.js';
import { SideMissionSystem } from '../src/gameplay/SideMissionSystem.js';
import { SIDE_MISSIONS } from '../src/gameplay/SideMissionData.js';
import { NPC_SPECS } from '../src/npcs/NPCDefinitions.js';

// Exercise real state, geometry and gameplay with a DOM-free presentation layer.
function createGame({ coins = 0 } = {}) {
  const state = new GameState();
  state.coins = coins;
  state.setPhase(Phase.PLAYING);
  const npcs = {
    items: NPC_SPECS.map((spec) => ({ id: spec.id, name: spec.name, spec,
      position: new Vector3(spec.x, 0, spec.z) })),
    get(id) { return this.items.find((npc) => npc.id === id); },
  };
  const player = { position: new Vector3(), grounded: true,
    collision: { groundHeight: () => 0 } };
  const input = {
    enabled: true, move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, _keys: new Set(),
    setVisible(visible) { this.enabled = visible; },
  };
  const snapshots = [], toasts = [];
  state.on('mission:changed', (snapshot) => snapshots.push(snapshot));
  const view = {
    setVisible(visible) { this.visible = visible; },
    setPrompt(prompt) { this.prompt = prompt; },
    renderTracker(tracker) { this.tracker = tracker; },
    showDialog(dialog) { this.dialog = dialog; },
    hideDialog() { this.dialog = null; },
    handleDialogKey(event) { if (event.code === 'Escape') missions.closeDialog(); },
  };
  const missions = new SideMissionSystem({ scene: new Scene(new NullEngine()), state, player, npcs, input, view,
    ui: { toast: (...message) => toasts.push(message) } });
  const goNPC = (id) => {
    assert.ok(npcs.get(id), `Mission resident ${id} must exist in the actual NPC roster`);
    player.position.copyFrom(npcs.get(id).position);
  };
  const choose = (index = 0) => {
    assert.ok(view.dialog, 'A conversation must be open before choosing a response');
    view.dialog.choices[index].action();
  };
  const accept = (definition) => {
    goNPC(definition.giver);
    assert.equal(missions.interact(), true);
    choose();
    assert.equal(state.sideMissions[definition.id].status, 'active');
  };
  const goObjective = (objective) => {
    if (objective.npc) goNPC(objective.npc);
    else player.position.set(objective.x, 0, objective.z);
  };
  const perform = (objective) => {
    goObjective(objective);
    assert.equal(missions.interact(), true);
    if (objective.npc) choose();
  };
  return { missions, state, player, input, npcs, view, snapshots, toasts, goNPC, choose, accept, goObjective, perform };
}

test('all four errands require acceptance, explicit objectives, and a return visit before paying', async (t) => {
  for (const definition of SIDE_MISSIONS) {
    await t.test(definition.title, () => {
      const game = createGame();
      const { missions, state, view } = game;
      const mission = () => missions.getJournal().find((item) => item.id === definition.id);
      assert.equal(mission().status, 'available');
      assert.equal(missions.getNPCStatuses()[definition.giver], 'available');
      assert.ok(missions.getMarkers().some((marker) => marker.id === definition.id && marker.kind === 'quest'));

      // Merely visiting the target cannot start an errand or award progress.
      for (const objective of definition.objectives) {
        game.goObjective(objective);
        missions.update(1);
        assert.equal(mission().progress, 0);
      }
      game.accept(definition);
      assert.equal(missions.getNPCStatuses()[definition.giver], 'active');

      for (const [index, objective] of definition.objectives.entries()) {
        game.goObjective(objective);
        for (let frame = 0; frame < 120; frame++) missions.update(1 / 60);
        assert.equal(mission().progress, index, 'Standing at an objective does not collect it');
        game.perform(objective);
        assert.equal(mission().progress, index + 1);
        assert.equal(state.coins, 0, 'Objectives do not pay the return reward');
        assert.ok(!missions.getMarkers().some((marker) => marker.id === objective.id));
      }

      assert.equal(mission().status, 'ready');
      assert.equal(missions.getNPCStatuses()[definition.giver], 'ready');
      assert.ok(missions.getMarkers().some((marker) => marker.id === definition.id && marker.kind === 'quest-ready'));
      game.goNPC(definition.giver);
      assert.equal(missions.interact(), true);
      assert.equal(state.coins, 0, 'Opening the reward dialogue does not claim it');
      const claimAgain = view.dialog.choices[0].action;
      game.choose();
      assert.equal(mission().status, 'completed');
      assert.equal(state.coins, definition.reward);
      assert.equal(missions.dialogOpen, false);
      assert.equal(missions.getNPCStatuses()[definition.giver], undefined);
      assert.ok(!missions.getMarkers().some((marker) => marker.id === definition.id));
      claimAgain();
      assert.equal(state.coins, definition.reward, 'A stale dialogue action cannot pay twice');
    });
  }
});

test('four simultaneous missions retain independent progress and award exactly 305 coins', () => {
  const game = createGame();
  const { missions, state, snapshots, view } = game;
  for (const definition of SIDE_MISSIONS) game.accept(definition);
  assert.equal(snapshots.at(-1).active, 4);
  assert.equal(missions.getNPCStatuses().emi, 'active', 'The delivery recipient is marked on acceptance');
  for (const definition of SIDE_MISSIONS) {
    for (const objective of definition.objectives) game.perform(objective);
    game.goNPC(definition.giver);
    missions.interact();
    game.choose();
  }
  assert.equal(state.coins, 305);
  assert.equal(view.tracker.completed, 4);
  assert.equal(snapshots.at(-1).completed, 4);
  assert.equal(snapshots.at(-1).active, 0);
  assert.deepEqual(missions.getMarkers(), []);
  assert.deepEqual(missions.getNPCStatuses(), {});
  assert.equal(snapshots[0].missions.every((mission) => mission.status === 'available'), true,
    'Earlier journal snapshots remain valid after later progress');
  const visible = missions.objects.filter((item) => item.group.isEnabled(false));
  assert.equal(visible.length, 3);
  assert.ok(visible.every((item) => item.flowers?.isEnabled(false) && !item.ring.isEnabled(false)),
    'Watered flowers remain in bloom after their mission is complete');
});

test('mission transitions reject duplicate objectives, premature rewards, and repeat claims', () => {
  const game = createGame();
  const { missions, state } = game;
  const definition = SIDE_MISSIONS.find((mission) => mission.kind === 'parcel');
  missions._completeObjective(definition, definition.objectives[0]);
  missions._claim(definition);
  assert.equal(state.sideMissions[definition.id].completed.length, 0);
  assert.equal(state.coins, 0);
  game.accept(definition);
  game.perform(definition.objectives[0]);
  missions._completeObjective(definition, definition.objectives[0]);
  missions._accept(definition);
  assert.equal(state.sideMissions[definition.id].completed.length, 1);
  missions._claim(definition);
  assert.equal(state.coins, 0, 'One of three parcels is not sufficient for the reward');
  for (const objective of definition.objectives.slice(1)) game.perform(objective);
  game.goNPC(definition.giver);
  missions.interact(); game.choose();
  missions._claim(definition);
  missions._accept(definition);
  assert.equal(state.coins, definition.reward);
  assert.equal(state.sideMissions[definition.id].status, 'completed');
});

test('declining an offer and closing a conversation leave missions available', () => {
  const game = createGame();
  game.goNPC('aoi');
  game.missions.interact(); game.choose(1);
  assert.equal(game.state.sideMissions['cafe-delivery'].status, 'available');
  game.missions.interact(); game.missions.closeDialog();
  assert.equal(game.state.sideMissions['cafe-delivery'].status, 'available');
  assert.equal(game.input.enabled, true);
});

test('menus, non-playing phases, vehicles, climbing, airborne players and distant targets block interaction', async (t) => {
  const cases = [
    ['menu open', ({ input }) => { input.enabled = false; }],
    ['title screen', ({ state }) => { state.setPhase(Phase.TITLE); }],
    ['completion screen', ({ state }) => { state.setPhase(Phase.COMPLETE); }],
    ['vehicle ride', ({ player }) => { player.ride = {}; }],
    ['vehicle approach', ({ player }) => { player.autoWalk = {}; }],
    ['climb', ({ player }) => { player.climb = {}; }],
    ['airborne', ({ player }) => { player.grounded = false; }],
    ['another floor', ({ player }) => { player.position.y += 3; }],
    ['out of range', ({ player }) => { player.position.x += 100; }],
  ];
  for (const [label, change] of cases) {
    await t.test(label, () => {
      const game = createGame(); game.goNPC('aoi'); change(game);
      assert.equal(game.missions.interact(), false);
      assert.equal(game.missions.dialogOpen, false);
      assert.equal(game.state.sideMissions['cafe-delivery'].status, 'available');
    });
  }
});

test('conversations clear held controls and refuse stale choices after moving away', () => {
  const game = createGame();
  const { input, missions, player } = game;
  game.goNPC('aoi');
  input._keys.add('KeyW'); input.move.y = 1; input.look.x = 100;
  input.jumpHeld = input.jumpPressed = input.interactPressed = true;
  missions.interact();
  assert.equal(missions.dialogOpen, true);
  assert.equal(input.enabled, false);
  assert.equal(input._keys.size, 0);
  assert.deepEqual(input.move, { x: 0, y: 0 });
  assert.deepEqual(input.look, { x: 0, y: 0 });
  assert.equal(input.interactPressed || input.jumpHeld || input.jumpPressed, false);
  player.position.x += 20;
  game.choose();
  assert.equal(game.state.sideMissions['cafe-delivery'].status, 'available');
  assert.equal(input.enabled, true);
  assert.equal(missions.dialogOpen, false);
});

test('F opens a conversation without passing through to vehicle input; Escape closes it', () => {
  const game = createGame(); game.goNPC('aoi');
  const event = (code, repeat = false) => ({ code, repeat, stopped: false, prevented: false,
    stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } });
  const drive = event('KeyE');
  game.missions._onKeyDown(drive);
  assert.equal(drive.stopped, false, 'Vehicle key remains available');
  assert.equal(game.missions.dialogOpen, false);
  const repeat = event('KeyF', true);
  game.missions._onKeyDown(repeat);
  assert.equal(game.missions.dialogOpen, false, 'A held key cannot repeatedly open dialogues');
  const talk = event('KeyF');
  game.missions._onKeyDown(talk);
  assert.equal(talk.stopped && talk.prevented, true);
  assert.equal(game.missions.dialogOpen, true);
  assert.equal(game.input.interactPressed, false);
  game.missions._onKeyDown(event('Escape'));
  assert.equal(game.missions.dialogOpen, false);
  assert.equal(game.input.enabled, true);
});

test('phase changes close conversations without re-enabling controls over the completion screen', () => {
  const game = createGame(); game.goNPC('aoi'); game.missions.interact();
  game.state.setPhase(Phase.COMPLETE);
  assert.equal(game.missions.dialogOpen, false);
  assert.equal(game.view.dialog, null);
  assert.equal(game.input.enabled, false);
  assert.equal(game.view.visible, false);
});

test('restart clears completed and partial missions, flowers, markers and earned coins', () => {
  const game = createGame({ coins: 17 });
  const { missions, state, view } = game;
  const garden = SIDE_MISSIONS.find((mission) => mission.kind === 'garden');
  const parcels = SIDE_MISSIONS.find((mission) => mission.kind === 'parcel');
  game.accept(garden);
  for (const objective of garden.objectives) game.perform(objective);
  game.goNPC(garden.giver); missions.interact(); game.choose();
  game.accept(parcels); game.perform(parcels.objectives[0]);
  game.goNPC('aoi'); missions.interact();
  assert.equal(missions.dialogOpen, true);
  missions.reset();
  assert.equal(state.coins, 17, 'Restart removes only the coins earned during this visit');
  assert.equal(missions.dialogOpen, false);
  assert.equal(game.input.enabled, true);
  assert.equal(view.dialog, null);
  assert.equal(view.tracker.completed, 0);
  assert.equal(missions.getMarkers().length, 4);
  assert.ok(missions.getMarkers().every((marker) => marker.kind === 'quest'));
  assert.ok(missions.getJournal().every((mission) => mission.status === 'available' && mission.progress === 0));
  assert.ok(missions.objects.every((item) => !item.group.isEnabled(false) && !item.flowers?.isEnabled(false)));
  // New-run dialogue callbacks must use the fresh record map.
  game.accept(parcels); game.perform(parcels.objectives[0]);
  assert.equal(state.sideMissions[parcels.id].completed.length, 1);
});
