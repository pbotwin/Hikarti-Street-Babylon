import { TransformNode } from '@babylonjs/core';
import { NPC_SPECS } from './NPCDefinitions.js';
import { createResident, animateResident, loadBase, disposeResident, setMorph, manualPose, syncPose } from './NPCModels.js';
import { billboard, billboardMaterial, disposeBillboards } from './Billboard.js';
import { Life } from './life/Life.js';
import { Minds } from './life/Mind.js';
import { loadPlaces } from './life/Places.js';
import { lineFor } from './life/Talk.js';
import { SIDE_MISSIONS } from '../gameplay/SideMissionData.js';
import { Voices } from '../audio/voice/Voices.js';
import { applyAct, holdProp, makeBubble, showBubble, updateBubble, warmActs, disposeActs } from './life/Acts.js';

// Residents are anime characters like the heroine: each spec gets a VRoid
// base body (by gender and outfit style), its own hair / clothing colours
// and height.
const MALE = new Set(['ren', 'kenji', 'daichi', 'haru', 'riku', 'tomo', 'jun', 'teppei', 'shun', 'kaito', 'asahi', 'makoto']);
function lookFor(spec, index) {
  const m = MALE.has(spec.id);
  const alt = index % 2;
  const base = m
    ? ({ uniform: 'boy_uniform', smart: alt ? 'boy_uniform' : 'boy_hoodie', artist: alt ? 'boy_hoodie' : 'boy_uniform' }[spec.style] || 'boy_hoodie')
    : ({ uniform: alt ? 'girl_long' : 'girl_bob', apron: 'girl_apron', vendor: 'girl_apron', overalls: 'girl_apron',
      kimono: 'girl_dress', artist: alt ? 'girl_dress' : 'girl_bob', smart: alt ? 'girl_long' : 'girl_bob', hoodie: 'girl_long' }[spec.style] || 'girl_long');
  return {
    base, gender: m ? 'm' : 'f', hair: spec.hair, top: spec.top, bottom: spec.bottom,
    dress: spec.style === 'kimono' ? spec.top : spec.accent && spec.top, accessory: spec.accent,
    // Real heights: ~1.58 m women, ~1.72 m men, varied per person by spec.scale.
    height: (m ? 1.72 : 1.58) * (1 + ((spec.scale || 1) - 1) * 1.5),
  };
}

const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Bring a node's world matrix (and its parents') up to date. */
function sync(n) {
  if (n.parent) sync(n.parent);
  n.computeWorldMatrix(true);
}

function labelMaterial(scene, text, tint = '#f8eace', symbol = false) {
  const w = symbol ? 96 : 384;
  return billboardMaterial(scene, `label-${text}`, w, 96, (c) => {
    c.fillStyle = '#292b3be6';
    if (symbol) {
      c.beginPath(); c.arc(48, 48, 40, 0, Math.PI * 2); c.fill();
      c.strokeStyle = tint; c.lineWidth = 4; c.stroke();
      c.font = '700 58px system-ui, sans-serif';
    } else {
      c.beginPath(); c.roundRect(4, 14, 376, 68, 24); c.fill();
      c.font = '600 36px system-ui, sans-serif';
    }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = tint;
    c.fillText(text, w / 2, 50);
  });
}

/** Lightweight townspeople. Mission residents hold their positions so quests
 * remain easy to find; other residents pause nearby and walk between local stops. */
export class NPCSystem {
  constructor({ scene, state, collision, gfx = null, world = null }) {
    this.scene = scene; this.state = state; this.collision = collision;
    this.gfx = gfx;
    this.group = new TransformNode('Neighborhood residents', scene);
    this.group.freezeWorldMatrix();   // never moves
    this.time = 0;
    this.viewDistance = 66;   // set by the graphics preset
    this.distanceScale = 1;   // set by AdaptivePerformance when the CPU can't keep up
    this.outlineDistance = Infinity;   // outlines drawn within this range
    // The town's usable places (benches, cafés, shop doors...), exported with the city.
    loadPlaces(world?.places || []);
    this.markerMaterials = {
      available: labelMaterial(scene, '!', '#f4ce82', true),
      active: labelMaterial(scene, '•', '#9bdad5', true),
      ready: labelMaterial(scene, '✓', '#b3e7b6', true),
    };
    this.items = NPC_SPECS.map((spec, index) => {
      const root = new TransformNode(`resident-${spec.id}`, scene);
      const floor = collision.groundHeight(spec.x, spec.z, 0.25, 0, 0.4);
      root.position.set(spec.x, floor, spec.z); root.rotation.y = spec.yaw || 0;
      root.parent = this.group;
      const label = billboard(scene, labelMaterial(scene, spec.name), 1.45, 0.36, root);
      label.position.y = 2.08 * (spec.scale || 1);
      const marker = billboard(scene, this.markerMaterials.available, 0.35, 0.35, root);
      marker.position.y = 2.48 * (spec.scale || 1);
      return {
        id: spec.id, name: spec.name, role: spec.role, position: root.position, root, spec,
        label, marker, markerStatus: null, routeIndex: 1, wait: index * 0.23,
        phase: index * 1.73, speed: 0, facing: spec.yaw || 0, distance: Infinity, nearby: false, shown: true,
      };
    });
    this.items.forEach(makeBubble);
    this.byId = new Map(this.items.map((item) => [item.id, item]));
    // Their lives: needs, plans, places, routes (see life/Life.js).
    this.minds = new Minds(state);
    // Each resident's own voice (audio/voice/Voices.js).
    this.voices = new Voices();
    this.life = new Life({ collision, state, minds: this.minds, sakura: world?.sakura });
    this.items.forEach((item, i) => this.life.init(item, i));
    this.items.forEach((item) => this.minds.init(item));
    this._unsubscribe = [];
    this._mindEvents(state);
    this.life.link(this.items);
    this._lifeCtx = { time: 0, items: this.items, player: { x: 0, y: 0, z: 0 }, vehicles: null, probe: { x: 0, z: 0 } };
    // Resolves when every resident's model is in (main.js waits for it
    // behind the loading screen); onProgress(loaded, total) reports progress.
    this.onProgress = null;
    this.ready = this._loadModels();
    this._probe = { x: 0, z: 0 };
    if (state) this._unsubscribe.push(state.on('game:reset', () => this.reset()));
  }

  /**
   * Build each resident's anime character. They all stay enabled until the
   * first update, so the scene's readiness check behind the loading screen
   * compiles every shader they use (a resident first seen during play
   * otherwise froze the game while its shaders compiled).
   */
  async _loadModels() {
    // One resident per frame: building all of them at once froze the page.
    const nextFrame = () => new Promise((res) => requestAnimationFrame(() => res()));
    const looks = this.items.map((item, i) => lookFor(item.spec, i));
    for (const base of new Set(looks.map((l) => l.base))) loadBase(base).catch(() => {});
    for (const [i, item] of this.items.entries()) {
      if (this.disposed) return;
      const look = looks[i];
      item.look = look;
      await createResident(look).then((r) => {
        if (this.disposed) { disposeResident(r); return; }
        r.blinkSeed = (i * 0.37) % 1;
        manualPose(r);
        item.vrm = r;
        item.walkPhase = 0;
        r.root.parent = item.root;
        this.gfx?.addCasters(r.casters);
        this._warm(r);
        // Hip height above the feet (for sitting on seats of any height).
        const hips = r.bones.hips;
        if (hips) sync(hips);
        item.hipH = hips ? hips.absolutePosition.y - item.root.position.y : look.height * 0.53;
        // Name / quest marker sit above this character's actual head.
        const top = look.height;
        item.label.position.y = top + 0.42; item.markerY = top + 0.8;
      }).catch((e) => console.warn('resident model failed', item.id, e));
      this.onProgress?.(i + 1, this.items.length);
      await nextFrame();
    }
    // Last: by now the render passes' shader code has loaded.
    await warmActs(this.scene);
  }

  /**
   * Start compiling the shader variants the scene's readiness check doesn't
   * cover (outlines, the ambient-occlusion geometry pass: one per base body
   * and morph / alpha-test combination), so they aren't built when a
   * resident first comes near during play.
   */
  _warm(r) {
    const outlines = this.scene.getOutlineRenderer?.(), geometry = this.scene.geometryBufferRenderer;
    for (const m of r.meshes) {
      for (const sm of m.subMeshes) {
        if (m.renderOutline) outlines?.isReady(sm, false);
        geometry?.isReady(sm, false);
      }
    }
  }

  get(id) { return this.byId.get(id); }

  /** Speak a line as this resident (their own voice, mouth moving). */
  speak(npc, text) {
    const item = this.byId.get(npc.id || npc);
    if (item) this.voices.speak(item, text);
  }

  stopSpeaking() { this.voices.stop(); }

  /** What this resident says now (memory, gossip, activity, tips). */
  talkLine(npc) {
    const item = this.byId.get(npc.id || npc);
    if (!item?.mind) return null;
    // The line prepared while she walked up (its voice is already synthesised).
    const fresh = item.nextLine && this.time - item.nextLine.t < 45;
    const line = fresh ? item.nextLine.text : this._compose(item);
    item.nextLine = null;
    this.minds.talked(item);
    return line;
  }

  /** She talked with them about a mission: remember it (no casual line used). */
  noteTalk(npc) {
    const item = this.byId.get(npc.id || npc);
    if (!item?.mind) return;
    this.minds.talked(item);
    item.nextLine = null;
  }

  _compose(item) {
    return lineFor(item, this.minds, { byId: this.byId, game: this.game, missionsData: SIDE_MISSIONS });
  }

  /** She's walking up to `item`: decide what they'll say and voice it now. */
  _prepareTalk(item) {
    if (item.nextLine && this.time - item.nextLine.t < 40) return;
    // Mission residents say their mission text; others their own line.
    const text = this.game?.missions?.previewText?.(item) || this._compose(item);
    item.nextLine = { text, t: this.time };
    this.voices.prepare(item, text);
  }

  /** Things residents notice and remember about the heroine. */
  _mindEvents(state) {
    if (!state) return;
    const near = (pos, r) => this.items.filter((it) => Math.hypot(it.position.x - pos.x, it.position.z - pos.z) < r);
    this._unsubscribe.push(state.on('mission:completed', ({ id }) => {
      const m = SIDE_MISSIONS.find((x) => x.id === id);
      const giver = m && this.byId.get(m.giver);
      if (!giver) return;
      this.minds.helped(giver, m);
      // The giver tells people; anyone close by saw it too.
      const fact = `helped:${m.giver}:${m.title}`;
      this.minds.hear(giver, { kind: 'helped', about: 'player', text: fact, from: 'self' });
      this.minds.witness(near(giver.position, 12).filter((x) => x !== giver), giver.position, 'helped', 12, fact, 0.1);
    }));
    this._unsubscribe.push(state.on('npc:dodge', ({ id }) => {
      const it = this.byId.get(id);
      if (!it) return;
      this.minds.witness([it], it.position, 'reckless', 1, `reckless:${id}`, -0.35);
      this.minds.witness(near(it.position, 15).filter((x) => x !== it), it.position, 'reckless', 15, `reckless:${id}`, -0.1);
    }));
    this._unsubscribe.push(state.on('fragment:collected', () => {
      const p = this._lifeCtx.player;
      this.minds.witness(near(p, 18), p, 'fragment', 18, 'fragment', 0.05);
    }));
    this._unsubscribe.push(state.on('game:reset', () => this.minds.wipe()));
  }

  nearest(position, radius = 2.8) {
    const p = position?.position || position;
    if (!p) return null;
    let best = null, distance = radius;
    for (const item of this.items) {
      if (Math.abs(p.y - item.position.y) > 2) continue;
      const d = Math.hypot(p.x - item.position.x, p.z - item.position.z);
      if (d < distance) { best = item; distance = d; }
    }
    return best;
  }

  setQuestMarkers(statusById = {}) {
    for (const item of this.items) {
      const status = statusById instanceof Map ? statusById.get(item.id) : statusById[item.id];
      item.markerStatus = this.markerMaterials[status] ? status : null;
      item.marker.isVisible = !!item.markerStatus && item.distance < 45;
      if (item.markerStatus) item.marker.material = this.markerMaterials[status];
    }
  }

  reset() {
    this.time = 0;
    for (const [i, item] of this.items.entries()) {
      const { spec } = item;
      item.position.set(spec.x, this.collision.groundHeight(spec.x, spec.z, 0.25, 0, 0.4), spec.z);
      item.root.rotation.y = item.facing = spec.yaw || 0;
      item.routeIndex = 1; item.wait = i * 0.23; item.speed = 0;
    }
  }

  /** Show / hide a resident's whole subtree (hidden ones cost nothing to draw or update). */
  _show(item, on) {
    if (item.shown === on) return;
    item.shown = on;
    item.root.setEnabled(on);
  }

  /**
   * Residents leap out of the way of an approaching vehicle: if a car or bike
   * moving faster than a jog will pass through them within ~1.4 s, they jump
   * sideways (away from its path) in a short arc, then stand startled.
   */
  _dodge(item, dt, vehicles) {
    const pos = item.position;
    if (item.dodge) {
      const d = item.dodge;
      d.t += dt;
      const u = Math.min(1, d.t / d.dur);
      const probe = this._probe;
      probe.x = d.x0 + d.dx * u; probe.z = d.z0 + d.dz * u;
      // Never leap into walls or props.
      if (this.collision.resolveCircle(probe, 0.26, d.y0 + 0.3, 1.4, 0.3)) { d.dx = probe.x - d.x0; d.dz = probe.z - d.z0; }
      pos.x = probe.x; pos.z = probe.z;
      d.hop = Math.sin(u * Math.PI) * 0.55;
      pos.y = d.y0 + d.hop;           // position is the root's own position
      if (u >= 1) {
        pos.y = this.collision.groundHeight(pos.x, pos.z, 0.25, d.y0, 0.35);
        item.dodge = null; item.wait = 1.6; item.startled = 1.6;
        return false;
      }
      return true;
    }
    if (!vehicles) return false;
    for (const v of vehicles) {
      const sp = Math.hypot(v.vF || 0, v.vL || 0);
      if (sp < 3) continue;
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw), dir = (v.vF || 0) >= 0 ? 1 : -1;
      const rx = pos.x - v.x, rz = pos.z - v.z;
      const fwd = (rx * s + rz * c) * dir;            // ahead of the vehicle along its travel
      const lat = rx * c - rz * s;                    // sideways offset
      const half = (v.collider?.hx ?? (v.dims?.w || 1.8) / 2) + 0.7;
      if (fwd > 0 && fwd < Math.min(14, sp * 1.4) && Math.abs(lat) < half) {
        const side = Math.abs(lat) > 0.15 ? Math.sign(lat) : (Math.random() < 0.5 ? -1 : 1);
        const dist = half - Math.abs(lat) + 0.9;
        item.dodge = { t: 0, dur: 0.5, x0: pos.x, z0: pos.z, y0: pos.y, dx: c * side * dist, dz: -s * side * dist, hop: 0 };
        item.facing = Math.atan2(v.x - pos.x, v.z - pos.z);   // look at the car while jumping clear
        this.state?.emit('npc:dodge', { id: item.id });
        return true;
      }
    }
    return false;
  }

  update(dt, player, vehicles) {
    dt = Math.min(Math.max(dt, 0), 0.05);
    this.time += dt;
    const p = player?.position || player;
    if (!p) return;
    this.frame = (this.frame || 0) + 1;
    // Life: build the town's walk map a slice at a time, then plan routes.
    if (!this.life.nav.ready) this.life.nav.buildSlice(3);
    this.life.paths = 0;
    const lc = this._lifeCtx;
    lc.time = this.time; lc.vehicles = vehicles;
    // Where she has been (residents recommend places she hasn't seen).
    if ((this.frame & 31) === 0) this.minds.playerAt(p.x, p.z);
    this.minds.tick(dt);
    lc.player.x = p.x; lc.player.y = p.y || 0; lc.player.z = p.z;
    for (let index = 0; index < this.items.length; index++) {
      const item = this.items[index];
      const { spec, position, root } = item;
      if (item.shown && this._dodge(item, dt, vehicles)) {
        root.rotation.y += wrap(item.facing - root.rotation.y) * (1 - Math.exp(-dt * 12));
        if (item.vrm) {
          animateResident(item.vrm, this.time + item.phase, { walk: 0, phase: 0, look: 0, gender: item.look?.gender, hop: item.dodge.hop / 0.55 });
          syncPose(item.vrm);
        }
        continue;
      }
      if (item.startled > 0) item.startled -= dt;
      const dx = p.x - position.x, dz = p.z - position.z;
      const distance = Math.hypot(dx, dz); item.distance = distance;
      item.nearby = distance < 3.1 && Math.abs((p.y || 0) - position.y) < 2;
      // Distant residents have neither animation nor labels, saving mobile GPU work.
      // 3 m of hysteresis: a resident hovering at the edge (or the camera
      // swaying) no longer pops in and out every few frames. Residents
      // inside a shop or home are hidden whatever the distance.
      const range = this.viewDistance * this.distanceScale;
      item.inView = distance < (item.inView ? range + 3 : range);
      this._show(item, item.inView && !item.life.hidden);
      // Animation level of detail: residents beyond 15 m are posed every
      // 2nd frame, beyond 40 m every 4th (staggered by index).
      const every = distance < 15 ? 1 : distance < 40 ? 2 : 4;
      const tick = (this.frame + index) % every === 0;
      item.label.isVisible = distance < 9;
      item.marker.isVisible = !!item.markerStatus && distance < 45;
      if (!item.shown) {
        // Far away: life goes on (cheaply), no animation.
        if (!item.life.hidden) {
          const o = this.life.update(item, dt, this._lifeCtx);
          if (o?.y != null) position.y = o.y;
          if (o?.facing != null) root.rotation.y = item.facing = o.facing;
        } else this.life.update(item, dt, this._lifeCtx);
        continue;
      }
      // Distant residents skip their outlines (a second full draw of the character).
      const shells = distance < (item.vrm?.outlinesOn ? this.outlineDistance + 3 : this.outlineDistance);
      if (item.vrm && item.vrm.outlinesOn !== shells) {
        for (const m of item.vrm.outlines) m.renderOutline = shells;
        item.vrm.outlinesOn = shells;
      }
      // ---- Life: decide, walk, sit, chat (life/Life.js) ----
      const ctx = this._lifeCtx;
      const L = item.life;
      // Mission residents stop what they're doing when she comes to talk.
      const attend = spec.mission && item.nearby;
      const o = attend ? null : this.life.update(item, dt, ctx);
      if (L.hidden) { this._show(item, false); continue; }
      const moving = !!o?.moving;
      if (o?.y != null) position.y = o.y;
      if (o?.facing != null) item.facing = o.facing;
      if (o?.snapFacing) root.rotation.y = item.facing;
      // Lean with the bike (Babylon's rotation order is already yaw, then lean).
      root.rotation.z = o?.lean ? -o.lean : 0;
      if ((attend || (item.nearby && L.state === 'think')) && distance > 0.2) item.facing = Math.atan2(dx, dz);
      root.rotation.y += wrap(item.facing - root.rotation.y) * (1 - Math.exp(-dt * (moving ? 7 : 5)));
      const walkSpeed = moving ? o.speed : 0;
      item.speed += ((moving ? Math.min(1.25, walkSpeed / 0.85) : 0) - item.speed) * (1 - Math.exp(-dt * 7));
      const t = this.time + item.phase;
      if (!item.vrm) continue;
      // Talking: open the mouth with the voice's loudness.
      if (item.vrm.mouth) {
        const lv = this.voices.speaking ? this.voices.level(item.id) : 0;
        item.mouthOpen = (item.mouthOpen || 0) + (lv - (item.mouthOpen || 0)) * Math.min(1, dt * 18);
        setMorph(item.vrm.mouth, item.mouthOpen);
      }
      // About to talk to someone: start fetching the natural voices, and
      // prepare what the closest resident will say.
      if (distance < 6 && !this._voicePrefetch) { this._voicePrefetch = true; this.voices.prefetch(); }
      if (distance < 5 && this.voices.ready && !this.game?.missions?.dialogOpen) this._prepareTalk(item);
      // Things in hand and thought bubbles.
      if (L.wantHold !== undefined) { holdProp(item, L.wantHold); L.wantHold = undefined; }
      if (L.say) { showBubble(item, L.say.icon, L.say.secs); L.say = null; }
      updateBubble(item, dt, distance < 22);
      // Animate only residents close enough to read the motion.
      if (distance < 40) {
        item.walkPhase = (item.walkPhase + walkSpeed * dt / 1.25) % 1;
        let look = Math.sin(t * 0.47) * 0.25;
        if (o?.look != null) look = o.look;
        else if (item.nearby) look = clamp(wrap(Math.atan2(dx, dz) - root.rotation.y), -1.1, 1.1);
        item.lookYaw = (item.lookYaw ?? 0) + (look - (item.lookYaw ?? 0)) * (1 - Math.exp(-dt * 4));
        if (tick) {
          animateResident(item.vrm, t, { walk: item.speed, phase: item.walkPhase, look: item.lookYaw,
            gender: item.look.gender, kimono: spec.style === 'kimono' });
          const seated = !!o?.seated;
          if (o?.act) applyAct(item.vrm, o.act, o.actT, o.actK, seated, o.style);
          else if (seated) applyAct(item.vrm, 'sit', t, 1, true);
          if (o?.waving) applyAct(item.vrm, 'wave', t, 1, seated);
          syncPose(item.vrm);
        }
      }
      item.marker.position.y = (item.markerY || 2.48) + Math.sin(t * 2.7) * 0.045;
    }
  }

  dispose() {
    this.disposed = true;
    for (const off of this._unsubscribe) off();
    this.voices.stop();
    for (const item of this.items) {
      if (item.vrm) disposeResident(item.vrm);
      item.label.material.emissiveTexture.dispose();
      item.label.material.dispose();
    }
    for (const material of Object.values(this.markerMaterials)) { material.emissiveTexture.dispose(); material.dispose(); }
    this.group.dispose();
    disposeActs();
    disposeBillboards();
  }
}
