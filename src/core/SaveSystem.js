import { Vector3 } from '@babylonjs/core';
import { Phase } from './GameState.js';
import {
  SAVE_KEY, PROFILE_KEY, newSave, parseSave, parseProfile, addStat, maxStat, addToSet, describeSave,
} from './SaveData.js';

/**
 * Saving and loading, like a normal game: an autosaved playthrough you can
 * Continue from the title screen, New Game to start over, and play stats for
 * this run and for all time (SaveData.js has the format).
 *
 * Saved: where she stands, fragments found, the portal, every favor's
 * progress, the tracked favor, coins, cars she left somewhere, and the stats.
 * Autosaves every few seconds of play, at each milestone (fragment, favor,
 * portal), and when the page is hidden or closed (phones kill background tabs).
 */
const AUTOSAVE_EVERY = 15;     // s of play
const RUN_FROM = 3.5;          // m/s on foot: faster counts as running (walk 1.75, run 5.4)

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  remove(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

export class SaveSystem {
  constructor({ state, player, cameraRig, collectibles, portal, missions, vehicles, world, collision, audio, ui, shops = null }) {
    Object.assign(this, { state, player, cameraRig, collectibles, portal, missions, vehicles, world, collision, audio, ui, shops });
    this.profile = parseProfile(storage.get(PROFILE_KEY));
    this.stored = parseSave(storage.get(SAVE_KEY));   // the save on disk at boot (or null)
    this.current = null;      // the playthrough in progress
    this.applied = false;     // whether `stored` has been put into the world
    this.lastSaved = this.stored?.savedAt || 0;
    this._timer = 0;
    this._districtTimer = 0;
    this._last = null;        // previous on-foot position, for distances
    this._safe = null;        // last position she stood still-safely on her feet
    this._dirty = false;

    this.profile.sessions++;
    this.profile.lastPlayed = Date.now();
    this._writeProfile();

    // Sound on/off lives in the profile (AudioSystem keeps it only in memory).
    if (typeof this.profile.settings.muted === 'boolean') audio?.setMuted(this.profile.settings.muted);
    if (audio) {
      const setMuted = audio.setMuted.bind(audio);
      audio.setMuted = (m) => { setMuted(m); this.profile.settings.muted = !!m; this._writeProfile(); };
    }

    this._events();
    const flush = () => { if (this.current) this.saveNow(); };
    addEventListener('pagehide', flush);
    addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  }

  /** A playthrough exists to continue (stored at boot, or one in progress). */
  get hasSave() { return !!(this.current || this.stored); }

  /** Title-screen summary of the save to continue, or null. */
  summary() {
    const save = this.current ? this._capture() : this.stored;
    if (!save) return null;
    return describeSave(save, { fragmentsTotal: this.state.fragmentsTotal, favorsTotal: this.missions.getJournal().length });
  }

  /** Continue: load the stored save into the world (once), then play. */
  continueGame() {
    if (!this.current && this.stored) {
      this._apply(this.stored);
      this.current = this.stored;
      this.applied = true;
    }
    if (!this.current) this._beginRun();
  }

  /** New Game: wipe the playthrough (lifetime stats stay) and start fresh. */
  newGame() {
    if (this.current || this.applied) {
      // The world holds a game: put everything back (game:reset → _beginRun).
      this.state.fragmentsCollected = 0;
      this.state.portalActive = false;
      this.state.emit('game:reset');
    } else this._beginRun();
  }

  /** Write the playthrough now. Returns false if storage refused it. */
  saveNow() {
    if (!this.current) return false;
    const save = this._capture();
    this.current = save;
    const ok = storage.set(SAVE_KEY, JSON.stringify(save));
    if (ok) { this.lastSaved = save.savedAt; this._dirty = false; }
    this.profile.lastPlayed = save.savedAt;
    this._writeProfile();
    this.state.emit('save:written', { ok, at: save.savedAt });
    return ok;
  }

  /** Per frame (real dt): stats, safe position and the autosave timer. */
  update(dt) {
    if (!this.current || this.state.phase !== Phase.PLAYING || document.hidden) return;
    const run = this.current.stats, life = this.profile.lifetime;
    const both = (fn, ...a) => { fn(run, ...a); fn(life, ...a); };
    both(addStat, 'playTime', dt);

    const p = this.player.position, v = this.vehicles.active;
    if (v && this.vehicles.driving) {
      const d = v.speed * dt;
      both(addStat, v.isBike ? 'cycled' : 'driven', d);
      both(maxStat, 'topSpeed', v.speed);
      if (!v.isBike) v.movedByPlayer = true;
      this._last = null;
    } else {
      if (this._last) {
        const d = Math.hypot(p.x - this._last.x, p.z - this._last.z);
        // Ignore teleports (respawn, load) and standing still.
        if (d > 0.001 && d < 12 * dt) both(addStat, d / dt > RUN_FROM ? 'ran' : 'walked', d);
      }
      this._last = { x: p.x, z: p.z };
      if (this.player.grounded && !this.player.climb && !this.player.ride) {
        this._safe = { x: p.x, y: p.y, z: p.z, yaw: this.player.yaw };
      }
    }

    if ((this._districtTimer -= dt) <= 0) {
      this._districtTimer = 1;
      const d = this.world.getDistrict?.(p);
      if (d?.id) {
        addToSet(life, 'districts', d.id);
        // First time in this district this playthrough (shops pay a reward).
        if (addToSet(run, 'districts', d.id)) this.state.emit('district:discovered', { id: d.id, name: d.name });
      }
    }

    this._timer += dt;
    if (this._timer >= AUTOSAVE_EVERY || (this._dirty && this._timer >= 1)) {
      this._timer = 0;
      this.saveNow();
    }
  }

  // ------------------------------------------------------------------ internals
  _events() {
    const { state } = this;
    const stat = (key, n = 1) => {
      if (!this.current) return;
      addStat(this.current.stats, key, n);
      addStat(this.profile.lifetime, key, n);
    };
    state.on('ui:load', () => { this.continueGame(); state.emit('ui:start'); });
    state.on('ui:new', () => { this.newGame(); state.emit('ui:start'); });
    // Started some other way (?autostart, tests): play a fresh, unsaved-yet run.
    state.on('phase', ({ phase }) => {
      if (phase === Phase.PLAYING && !this.current) this._beginRun();
      if (phase === Phase.TITLE) this.ui.setSaveInfo?.(this.summary());
    });
    // Restart (menu, completion screen) and New Game: a new playthrough.
    state.on('game:reset', () => this._beginRun());

    state.on('player:jump', () => stat('jumps'));
    state.on('player:climb', () => stat('climbs'));
    state.on('vehicle:crash', () => stat('crashes'));
    state.on('npc:dodge', () => stat('dodges'));
    state.on('npc:talk', ({ id } = {}) => {
      if (!this.current) return;
      stat('talks');
      if (id) { addToSet(this.current.stats, 'residentsMet', id); addToSet(this.profile.lifetime, 'residentsMet', id); }
    });
    state.on('fragment:collected', () => { stat('fragments'); this._dirty = true; });
    state.on('mission:completed', ({ reward = 0 } = {}) => { stat('favors'); stat('coinsEarned', reward); this._dirty = true; });
    state.on('mission:changed', () => { this._dirty = true; });
    state.on('shop:bought', ({ price = 0 } = {}) => { stat('purchases'); stat('coinsSpent', price); this._dirty = true; });
    state.on('shop:used', () => { stat('treats'); this._dirty = true; });
    state.on('shop:changed', () => { this._dirty = true; });
    state.on('shop:open', ({ name } = {}) => {
      if (!this.current || !name) return;
      addToSet(this.current.stats, 'shopsVisited', name); addToSet(this.profile.lifetime, 'shopsVisited', name);
    });
    state.on('portal:activated', () => { this._dirty = true; });
    state.on('game:complete', () => {
      if (!this.current) return;
      stat('completions');
      const t = this.current.stats.playTime;
      for (const s of [this.current.stats, this.profile.lifetime]) {
        if (!s.bestCompletion || t < s.bestCompletion) s.bestCompletion = t;
      }
      this.current.completed = true;
      this.saveNow();
    });
  }

  _beginRun() {
    this.current = newSave();
    this.applied = true;       // the world now holds this (fresh) playthrough
    this._last = this._safe = null;
    this._timer = 0;
    for (const v of this.vehicles.vehicles) v.movedByPlayer = false;
    this.profile.games++;
    // After the other game:reset listeners have put the world back.
    queueMicrotask(() => this.saveNow());
  }

  _writeProfile() { storage.set(PROFILE_KEY, JSON.stringify(this.profile)); }

  /** The current world as save data (stats carried over from `current`). */
  _capture() {
    const cur = this.current || newSave();
    const save = { ...cur, savedAt: Date.now() };
    save.player = this._playerSpot() || cur.player;
    save.fragments = this.collectibles.items.map((it) => it.collected);
    save.portalActive = !!this.state.portalActive;
    save.missions = JSON.parse(JSON.stringify(this.missions.records));
    save.tracked = this.missions.trackedId ?? null;
    save.coins = this.state.coins || 0;
    save.shop = this.shops ? this.shops.capture() : cur.shop;
    save.vehicles = this.vehicles.vehicles
      .filter((v) => v.movedByPlayer && !v.isBike && !v.npcRider)
      .map((v) => ({ id: v.id, x: v.x, z: v.z, yaw: v.yaw }));
    return save;
  }

  /** Where to stand her on load: on her feet; beside the car if driving. */
  _playerSpot() {
    if (this.interiors?.inside) return this.interiors.returnSpot();
    const v = this.vehicles.active;
    if (v) {
      const side = this.vehicles._freeSide?.(v) || -1;
      const e = this.vehicles._entry?.(v, side);
      if (e) {
        const w = v.localToWorld([e[0], 0, e[2]], new Vector3());
        if (Number.isFinite(w?.x)) return { x: w.x, y: v.y, z: w.z, yaw: v.yaw };
      }
      return this._safe;
    }
    const p = this.player.position;
    if (this.player.grounded && !this.player.climb && !this.player.ride) return { x: p.x, y: p.y, z: p.z, yaw: this.player.yaw };
    return this._safe;
  }

  /** Put a save into the freshly built world. */
  _apply(save) {
    const { state, collectibles, portal, missions, vehicles } = this;
    // Cars first, so she isn't placed inside one.
    for (const s of save.vehicles) {
      const v = vehicles.vehicles[s.id];
      if (!v || v.isBike || v.npcRider) continue;
      v.reset();
      v.x = s.x; v.z = s.z; v.yaw = s.yaw;
      v.y = this.collision.groundHeight(s.x, s.z, 0.2, 0.4, 0.4);
      v.stillTime = 0;
      v.movedByPlayer = true;
    }
    if (save.player) {
      const { x, y, z, yaw } = save.player;
      this.player.spawn(x, z, yaw);
      this.player.position.y = y;
      this.player.visualY = y;
      this.player._sync?.();
      this.cameraRig.snapBehind(this.player);
    }
    let found = 0;
    collectibles.items.forEach((it, i) => {
      if (!save.fragments[i]) return;
      collectibles.markCollected(it);
      found++;
    });
    state.fragmentsCollected = found;
    this.ui.setFragments?.(found);
    if (save.portalActive || found >= state.fragmentsTotal) {
      state.portalActive = true;
      portal.activate();
    }
    this.shops?.restore(save.shop);
    missions.restore(save.missions, save.tracked);
    state.coins = save.coins;
    missions.publish?.();
  }
}
