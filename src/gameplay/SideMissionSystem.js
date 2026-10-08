import { TransformNode, MeshBuilder, Mesh, PBRMaterial, Color3, VertexData } from '@babylonjs/core';
import { basicMaterial } from './FxKit.js';
import { Phase } from '../core/GameState.js';
import { SideMissionUI } from '../ui/SideMissionUI.js';
import { SIDE_MISSIONS, NPC_FALLBACKS, NPC_GREETINGS, createMissionRecords } from './SideMissionData.js';

const TALK_RADIUS = 2.65;
const OBJECTIVE_RADIUS = 2.1;
const horizontalDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Optional errands, kept independent from the energy-fragment story. */
export class SideMissionSystem {
  constructor({ scene, state, player, npcs, ui, input, view, graphics = null }) {
    Object.assign(this, { scene, state, player, npcs, ui, input, graphics });
    this.records = createMissionRecords();
    state.sideMissions = this.records;
    state.coins ??= 0;
    this._initialCoins = state.coins;
    this._dialogOpen = false;
    this._tracked = null;
    this._time = 0;
    this._trackerTimer = 0;
    this.objects = [];
    this.group = new TransformNode('Neighborhood side missions', scene);
    this.view = view || new SideMissionUI(ui.root || input.root, {
      onInteract: () => this.interact(), onClose: () => this.closeDialog(),
    });
    this._buildObjectives();
    this._onKeyDown = (event) => {
      if (this.dialogOpen) {
        event.stopImmediatePropagation();
        event.preventDefault();
        if (!event.repeat) this.view.handleDialogKey(event);
        return;
      }
      if (event.code !== 'KeyF' || event.repeat || !this._canInteract()) return;
      if (!this._nearest()) return;
      // Capture before MobileInput's vehicle handler: F can never do both.
      event.stopImmediatePropagation();
      event.preventDefault();
      this.input._setMode?.('mouse');
      this.interact();
    };
    globalThis.addEventListener?.('keydown', this._onKeyDown, { capture: true });
    state.on('phase', ({ phase }) => {
      if (phase !== Phase.PLAYING) this.closeDialog();
      this.view.setVisible(phase === Phase.PLAYING);
    });
    this._publish();
    this.view.setVisible(state.phase === Phase.PLAYING);
  }

  get dialogOpen() { return this._dialogOpen; }
  get missions() { return this.getJournal(); }

  getJournal() {
    return SIDE_MISSIONS.map((mission) => {
      const record = this.records[mission.id];
      const progress = record.completed.length;
      let objective;
      if (record.status === 'available') objective = `Talk to ${mission.giverName} to begin`;
      else if (record.status === 'completed') objective = `Complete · ${mission.reward} coins earned`;
      else if (record.status === 'ready') objective = `Return to ${mission.giverName} for your reward`;
      else if (mission.kind === 'delivery') objective = mission.objectives[0].label;
      else {
        const verb = { parcel: 'Collect lost parcels', garden: 'Water the garden planters', vista: 'Frame scenic postcards' }[mission.kind];
        objective = `${verb} (${progress}/${mission.objectives.length})`;
      }
      return {
        id: mission.id, title: mission.title, description: mission.description,
        status: record.status, objective, progress, total: mission.objectives.length,
        reward: mission.reward, giver: mission.giverName, giverId: mission.giver,
        color: mission.color, tracked: this._tracked === mission.id,
      };
    });
  }

  /** Map positions for quest givers, return visits and unfinished objectives. */
  getMarkers() {
    const markers = [];
    for (const mission of SIDE_MISSIONS) {
      const record = this.records[mission.id];
      if (record.status === 'completed') continue;
      if (record.status === 'available' || record.status === 'ready') {
        const p = this._npcPosition(mission.giver);
        markers.push({
          id: mission.id, x: p.x, z: p.z,
          label: `${mission.giverName} · ${record.status === 'ready' ? 'Claim reward' : mission.title}`,
          kind: record.status === 'ready' ? 'quest-ready' : 'quest',
          color: record.status === 'ready' ? '#ace7ac' : '#ffd38b',
        });
      } else {
        for (const objective of mission.objectives) {
          if (record.completed.includes(objective.id)) continue;
          const p = objective.npc ? this._npcPosition(objective.npc) : objective;
          markers.push({ id: objective.id, missionId: mission.id, x: p.x, z: p.z, label: objective.label, kind: mission.kind, color: mission.color });
        }
      }
    }
    return markers;
  }

  getNPCStatuses() {
    const statuses = {};
    for (const mission of SIDE_MISSIONS) {
      const record = this.records[mission.id];
      if (record.status === 'completed') continue;
      statuses[mission.giver] = record.status;
      if (record.status === 'active') {
        for (const objective of mission.objectives) {
          if (objective.npc && !record.completed.includes(objective.id)) statuses[objective.npc] = 'active';
        }
      }
    }
    return statuses;
  }

  track(id) {
    if (!SIDE_MISSIONS.some((mission) => mission.id === id)) return;
    this._tracked = id;
    this._publish();
  }

  /** The favor followed on the map and tracker (for saving). */
  get trackedId() { return this._tracked; }

  /**
   * Load saved progress: `records` as { [id]: { status, completed } }.
   * Favors added since the save start fresh; unknown ids are ignored.
   */
  restore(records = {}, tracked = null) {
    this.closeDialog();
    const fresh = createMissionRecords();
    for (const [id, record] of Object.entries(fresh)) {
      const saved = records[id];
      if (!saved) continue;
      const mission = SIDE_MISSIONS.find((m) => m.id === id);
      const ids = new Set(mission.objectives.map((o) => o.id));
      record.status = saved.status;
      record.completed = saved.completed.filter((o) => ids.has(o));
    }
    this.records = fresh;
    this.state.sideMissions = this.records;
    this._tracked = tracked && this.records[tracked] && this.records[tracked].status !== 'completed' ? tracked : null;
    this._syncObjects();
    this._publish();
  }

  /** Re-announce mission state (markers, tracker) after a load. */
  publish() { this._publish(); }

  reset() {
    this.closeDialog();
    this.records = createMissionRecords();
    this.state.sideMissions = this.records;
    this.state.coins = this._initialCoins;
    this._tracked = null;
    this._time = 0;
    this.view.setPrompt(null);
    this._syncObjects();
    this._publish();
  }

  update(dt) {
    this._time += dt;
    const playing = this.state.phase === Phase.PLAYING;
    this.view.setVisible(playing);
    if (this.group.isEnabled(false) !== playing) this.group.setEnabled(playing);
    for (const item of this.objects) {
      if (!item.group.isEnabled(false)) continue;
      item.ring.material.alpha = .4 + Math.sin(this._time * 2 + item.offset) * .15;
      if (item.mission.kind !== 'garden') {
        item.prop.position.y = .55 + Math.sin(this._time * 1.7 + item.offset) * .08;
        item.prop.rotation.y = this._time * .45 + item.offset;
      }
    }
    const nearest = this._canInteract() ? this._nearest() : null;
    this.view.setPrompt(nearest ? (nearest.type === 'npc' ? `Talk to ${nearest.npc.name}` : nearest.objective.action) : null);
    this._trackerTimer -= dt;
    if (this._trackerTimer <= 0) {
      this._trackerTimer = .2;
      this._renderTracker();
    }
  }

  /** Context action shared by F and the touch/click action button. */
  interact() {
    if (!this._canInteract()) return false;
    const target = this._nearest();
    if (!target) return false;
    this.input.interactPressed = false;
    if (target.type === 'npc') this._talk(target.npc);
    else this._completeObjective(target.mission, target.objective);
    return true;
  }

  closeDialog() {
    if (!this._dialogOpen) return;
    this._dialogOpen = false;
    this.npcs?.stopSpeaking?.();
    this._speaker = null;
    this.view.hideDialog();
    this._clearInput();
    this.input.setVisible(this.state.phase === Phase.PLAYING && this._restoreControls);
    this._restoreControls = false;
    this.state.emit('mission:dialog', { open: false });
  }

  _canInteract() {
    return this.state.phase === Phase.PLAYING && this.input.enabled && !this.dialogOpen &&
      !this.player.ride && !this.player.autoWalk && !this.player.climb && this.player.grounded !== false;
  }

  _npcPosition(id) {
    const npc = this.npcs.get?.(id) || this.npcs.items.find((item) => item.id === id);
    return npc?.position || npc?.root?.position || NPC_FALLBACKS[id];
  }

  _nearest() {
    const p = this.player.position;
    let nearest = null;
    let distance = Infinity;
    for (const npc of this.npcs.items) {
      // Not someone out of sight (inside a shop or home, or not shown).
      if (npc.life?.hidden || npc.shown === false) continue;
      const position = npc.position || npc.root.position;
      const d = horizontalDistance(p, position);
      if (d <= TALK_RADIUS && d < distance && Math.abs(p.y - (position.y || 0)) < 1.6) {
        nearest = { type: 'npc', npc };
        distance = d;
      }
    }
    for (const item of this.objects) {
      const record = this.records[item.mission.id];
      if (record.status !== 'active' || record.completed.includes(item.objective.id)) continue;
      const d = horizontalDistance(p, item.group.position);
      if (d <= OBJECTIVE_RADIUS && d < distance && Math.abs(p.y - item.group.position.y) < 1.6) {
        nearest = { type: 'objective', mission: item.mission, objective: item.objective };
        distance = d;
      }
    }
    return nearest;
  }

  /**
   * The mission line this resident would say right now, or null when they
   * have no mission business with her (then they talk from memory).
   */
  _missionText(npc) {
    const delivery = SIDE_MISSIONS.find((mission) => this.records[mission.id].status === 'active' &&
      mission.objectives.some((objective) => objective.npc === npc.id && !this.records[mission.id].completed.includes(objective.id)));
    if (delivery) return 'Is that from Aoi’s café? I haven’t had a moment to leave the stalls. That smells wonderful!';
    const mission = SIDE_MISSIONS.find((item) => item.giver === npc.id);
    if (!mission) return null;
    const record = this.records[mission.id];
    if (record.status === 'available') return mission.offer;
    if (record.status === 'ready') return mission.thanks;
    if (record.status === 'active') {
      const journal = this.getJournal().find((item) => item.id === mission.id);
      return `Thanks again for helping! ${journal.objective}. Your map marks the places to visit. Come back when you’re finished.`;
    }
    return null;
  }

  /** What `npc` would say if she talked to them now (so their voice can be prepared). */
  previewText(npc) { return this._missionText(npc); }

  _talk(npc) {
    this._speaker = npc;
    this.state.emit('npc:talk', { id: npc.id });
    const close = { label: 'See you around', action: () => this.closeDialog() };
    const missionText = this._missionText(npc);
    if (missionText) this.npcs?.noteTalk?.(npc);
    const base = {
      name: npc.name, role: npc.spec?.role || NPC_FALLBACKS[npc.id]?.role || npc.spec?.style,
      title: 'A moment in Hikari',
      // Residents remember her and talk about what they know (npcs/life/Talk.js).
      text: missionText || this.npcs?.talkLine?.(npc) || NPC_GREETINGS[npc.id] || npc.spec?.greeting || 'It’s a beautiful day to explore the neighborhood. The market and garden are just up the street.',
      choices: [close],
    };
    // A hand-off takes priority over a casual greeting.
    const delivery = SIDE_MISSIONS.find((mission) => this.records[mission.id].status === 'active' &&
      mission.objectives.some((objective) => objective.npc === npc.id && !this.records[mission.id].completed.includes(objective.id)));
    if (delivery) {
      const objective = delivery.objectives.find((item) => item.npc === npc.id);
      this._showDialog({ ...base, title: delivery.title, color: delivery.color,
        text: missionText,
        choices: [{ label: 'Hand over the café order', action: () => {
          if (this._canFinishDialogue(npc)) this._completeObjective(delivery, objective);
          this.closeDialog();
        } }, { label: 'A moment…', action: () => this.closeDialog() }],
      });
      return;
    }
    const mission = SIDE_MISSIONS.find((item) => item.giver === npc.id);
    if (mission) {
      const record = this.records[mission.id];
      Object.assign(base, { title: mission.title, color: mission.color });
      if (record.status === 'available') {
        Object.assign(base, { reward: mission.reward, choices: [
          { label: 'I’ll help', action: () => { if (this._canFinishDialogue(npc)) this._accept(mission); this.closeDialog(); } },
          { label: 'Maybe later', action: () => this.closeDialog() },
        ] });
      } else if (record.status === 'ready') {
        Object.assign(base, { reward: mission.reward, choices: [
          { label: `Complete mission · ${mission.reward} coins`, action: () => { if (this._canFinishDialogue(npc)) this._claim(mission); this.closeDialog(); } },
          { label: 'I’ll be right back', action: () => this.closeDialog() },
        ] });
      }
      // Finished missions: they talk from memory (they remember her help).
    }
    this._showDialog(base);
  }

  _canFinishDialogue(npc) {
    return this.dialogOpen && this.state.phase === Phase.PLAYING &&
      horizontalDistance(this.player.position, npc.position || npc.root.position) <= TALK_RADIUS;
  }

  _showDialog(dialog) {
    this._restoreControls = this.input.enabled;
    this._dialogOpen = true;
    this._clearInput();
    this.input.setVisible(false);
    this.view.showDialog(dialog);
    // The resident says it out loud in their own voice.
    if (this._speaker) this.npcs?.speak?.(this._speaker, dialog.text);
    this.state.emit('mission:dialog', { open: true });
  }

  _clearInput() {
    this.input._keys?.clear();
    this.input.move.x = this.input.move.y = 0;
    this.input.look.x = this.input.look.y = 0;
    this.input.jumpPressed = this.input.jumpHeld = this.input.interactPressed = false;
  }

  _accept(mission) {
    const record = this.records[mission.id];
    if (record.status !== 'available') return;
    record.status = 'active';
    this._tracked = mission.id;
    this._syncObjects();
    this._publish();
    this.ui.toast('Side mission started', mission.title);
  }

  _completeObjective(mission, objective) {
    const record = this.records[mission.id];
    if (record.status !== 'active' || record.completed.includes(objective.id)) return;
    record.completed.push(objective.id);
    this._tracked = mission.id;
    if (record.completed.length === mission.objectives.length) record.status = 'ready';
    this._syncObjects();
    this._publish();
    const text = record.status === 'ready' ? `Return to ${mission.giverName}` : `${record.completed.length} / ${mission.objectives.length} · ${mission.title}`;
    const title = { delivery: 'Café order delivered', parcel: 'Parcel recovered', garden: 'Flowers watered', vista: 'Postcard framed' }[mission.kind];
    this.ui.toast(title, text);
    this.state.emit('mission:objective', { missionId: mission.id, objectiveId: objective.id, position: this.player.position.clone() });
  }

  _claim(mission) {
    const record = this.records[mission.id];
    if (record.status !== 'ready') return;
    record.status = 'completed';
    this.state.coins += mission.reward;
    if (this._tracked === mission.id) this._tracked = null;
    this._syncObjects();
    this._publish();
    this.ui.toast('Side mission complete', `${mission.title} · +${mission.reward} coins`);
    this.state.emit('mission:completed', { id: mission.id, reward: mission.reward, coins: this.state.coins });
  }

  _publish() {
    const missions = this.getJournal();
    this.state.emit('mission:changed', {
      missions, coins: this.state.coins,
      completed: missions.filter((mission) => mission.status === 'completed').length,
      active: missions.filter((mission) => mission.status === 'active' || mission.status === 'ready').length,
    });
    this._renderTracker();
  }

  _renderTracker() {
    const journal = this.getJournal();
    const active = journal.filter((mission) => mission.status === 'active' || mission.status === 'ready');
    const tracked = journal.find((mission) => mission.id === this._tracked && mission.status !== 'completed');
    const mission = tracked || active[0];
    const markers = mission ? this.getMarkers().filter((marker) => marker.id === mission.id || marker.missionId === mission.id) : [];
    const distance = markers.length ? Math.min(...markers.map((marker) => horizontalDistance(this.player.position, marker))) : null;
    this.view.renderTracker({ mission, completed: journal.filter((item) => item.status === 'completed').length,
      total: journal.length, coins: this.state.coins, distance, activeCount: active.length });
  }

  _buildObjectives() {
    const { scene } = this;
    const material = (color) => {
      const m = new PBRMaterial(`mission ${color}`, scene);
      m.albedoColor = Color3.FromHexString(color).toLinearSpace();
      m.metallic = 0;
      m.roughness = .8;
      return m;
    };
    const cardboard = material('#b98754');
    const ribbon = material('#fff1c7');
    const soil = material('#664731');
    const pot = material('#c78768');
    const leaf = material('#75a569');
    const petal = material('#ffdc96');
    const camera = material('#574d6d');
    const lens = material('#b8e6e3');
    // Every prop part is an instance of a hidden shape × material source, so
    // all the objectives together cost a handful of draw calls.
    const shapes = {
      box: MeshBuilder.CreateBox('mission box', { size: 1 }, scene),
      planter: MeshBuilder.CreateCylinder('mission planter', { diameterTop: .74, diameterBottom: .56, height: .4, tessellation: 10 }, scene),
      dirt: MeshBuilder.CreateCylinder('mission soil', { diameter: .68, height: .02, tessellation: 10 }, scene),
      bloom: MeshBuilder.CreateSphere('mission bloom', { diameter: .26, segments: 3 }, scene),
      lens: MeshBuilder.CreateCylinder('mission lens', { diameter: .26, height: .12, tessellation: 16 }, scene),
    };
    for (const s of Object.values(shapes)) { s.isVisible = false; s.isPickable = false; }
    const sources = new Map();
    const casters = [];
    const part = (shape, mat, parent, castShadow) => {
      const key = `${shape}|${mat.name}`;
      let source = sources.get(key);
      if (!source) {
        source = shapes[shape].clone(key);
        source.material = mat;
        source.receiveShadows = true;
        sources.set(key, source);
        if (castShadow) casters.push(source);
      }
      const mesh = source.createInstance(key);
      mesh.parent = parent;
      if (castShadow) casters.push(mesh);
      return mesh;
    };
    const ring = flatRing(.68, .8, 40);
    // three's torus stands in the XY plane; Babylon's lies flat, so it is turned up.
    const frameShape = MeshBuilder.CreateTorus('mission frame', { diameter: 1.16, thickness: .044, tessellation: 32 }, scene);
    frameShape.isVisible = false;
    for (const mission of SIDE_MISSIONS) {
      let frameSource = null;
      for (const objective of mission.objectives) {
        if (objective.npc) continue;
        const group = new TransformNode(objective.label, scene);
        group.parent = this.group;
        const ground = this.player.collision?.groundHeight(objective.x, objective.z, .3, 2, 0) || 0;
        group.position.set(objective.x, ground + .035, objective.z);
        // Each ring pulses on its own beat: its own material.
        const marker = new Mesh(`${objective.label} ring`, scene);
        ring.applyToMesh(marker);
        marker.material = basicMaterial(scene, `${objective.label} ring`, { color: mission.color, opacity: .5, transparent: true, depthWrite: false, doubleSided: true });
        marker.isPickable = false;
        marker.parent = group;
        const prop = new TransformNode(`${objective.label} prop`, scene);
        prop.parent = group;
        const addBox = (w, h, d, x, y, z, mat) => {
          const mesh = part('box', mat, prop, true);
          mesh.scaling.set(w, h, d); mesh.position.set(x, y, z);
          return mesh;
        };
        let flowers = null;
        if (mission.kind === 'parcel') {
          addBox(.56, .43, .4, 0, 0, 0, cardboard);
          addBox(.1, .442, .414, 0, 0, 0, ribbon);
          addBox(.573, .08, .414, 0, 0, 0, ribbon);
        } else if (mission.kind === 'garden') {
          part('planter', pot, prop, true).position.y = .2;
          part('dirt', soil, prop, false).position.y = .405;
          flowers = new TransformNode(`${objective.label} flowers`, scene);
          for (let i = 0; i < 3; i++) {
            const angle = i * Math.PI * 2 / 3;
            const x = Math.cos(angle) * .18, z = Math.sin(angle) * .18;
            addBox(.04, .38, .04, x, .58, z, leaf);
            const bloom = part('bloom', petal, flowers, false);
            bloom.position.set(x, .81, z); bloom.scaling.y = .6;
            const foliage = addBox(.21, .035, .085, x + .055, .59, z, leaf);
            foliage.rotation.z = .4;
          }
          flowers.parent = prop;
          flowers.setEnabled(false);
        } else {
          addBox(.58, .36, .19, 0, .2, 0, camera);
          addBox(.2, .1, .16, -.1, .42, 0, camera);
          const glass = part('lens', lens, prop, false);
          glass.rotation.x = Math.PI / 2; glass.position.set(.06, .2, .14);
          if (!frameSource) {
            frameSource = frameShape.clone(`${mission.id} frame`);
            frameSource.material = basicMaterial(scene, `${mission.id} frame`, { color: mission.color });
          }
          const frame = frameSource.createInstance(`${objective.label} frame`);
          frame.rotation.x = Math.PI / 2;
          frame.position.y = .2; frame.parent = prop;
        }
        if (mission.kind !== 'garden') prop.position.y = .55;
        this.objects.push({ group, prop, ring: marker, flowers, mission, objective, offset: this.objects.length * 1.2 });
      }
      if (frameSource) frameSource.isVisible = false;
    }
    this.graphics?.addCasters(casters);
    this._syncObjects();
  }

  _syncObjects() {
    for (const item of this.objects) {
      const record = this.records[item.mission.id];
      const done = record.completed.includes(item.objective.id);
      // Watered flowers stay in bloom for the rest of the visit.
      item.group.setEnabled((record.status === 'active' && !done) || (item.mission.kind === 'garden' && done));
      item.ring.setEnabled(!done);
      item.flowers?.setEnabled(done);
    }
  }
}

/** Flat ring facing up (inner, outer radius), like three's RingGeometry laid on the ground. */
function flatRing(inner, outer, segments) {
  const positions = [], indices = [], normals = [], uvs = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    positions.push(c * inner, 0, -s * inner, c * outer, 0, -s * outer);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(i / segments, 0, i / segments, 1);
    if (i < segments) {
      const k = i * 2;
      indices.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }
  return Object.assign(new VertexData(), { positions, indices, normals, uvs });
}
