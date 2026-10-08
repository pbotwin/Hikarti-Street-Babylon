import { statRows, emptyStats, formatAgo } from '../core/SaveData.js';
import { PRESETS, TIERS } from '../core/GraphicsSettings.js';
import { FPS_MODES } from '../core/AdaptivePerformance.js';
import { offerAndroidApp, ANDROID_APP_PAGE } from '../core/platform.js';

/**
 * Right-hand HUD furniture from the key art: the town's time + name (top right),
 * a vertical menu (Settings / Bag / Quests / Map) under the minimap, and the
 * small glass sheets those buttons open.
 */
/** A shopping trip is running (MallMode sets the document's mode). */
const inMall = () => document.documentElement.dataset.mode === 'mall';

const ICONS = {
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/></g></svg>',
  gear: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.8 1.7 1l.4 2.5h4l.4-2.5c.6-.2 1.2-.6 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 7V6a4 4 0 0 1 8 0v1h2.2a1 1 0 0 1 1 .9l1 12A1.6 1.6 0 0 1 18.6 21H5.4a1.6 1.6 0 0 1-1.6-1.1l1-12A1 1 0 0 1 5.8 7zm2 0h4V6a2 2 0 0 0-4 0z"/></svg>',
  quest: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 3h6a1 1 0 0 1 1 1h2a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1-1zm0 2v1h6V5zM8 10v2h8v-2zm0 4v2h6v-2z"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z"/></svg>',
};

/** Where each fragment is (same order as World.fragmentSpots). */
const FRAGMENT_HINTS = [
  'Park — on the fountain\'s pedestal',
  'Konbini forecourt',
  'Shrine alley — on top of the torii',
  'North crosswalk — jump for it!',
  'Delivery van — climb onto its roof',
];

export class HudMenu {
  constructor(root, { state, collectibles, audio, minimap, missions, input, graphics, adaptive, saves, shops }) {
    Object.assign(this, { state, collectibles, audio, minimap, missions, input, graphics, adaptive, saves, shops });
    const hud = root.querySelector('.hud');
    hud.insertAdjacentHTML('beforeend', `
      <div class="clock"><span class="sun">${ICONS.sun}</span><div><b class="time">--:--</b><span class="city">Hikari</span></div></div>
      <nav class="side-menu">
        <button data-panel="settings" class="round" aria-label="Settings">${ICONS.gear}</button>
        <button data-panel="bag">${ICONS.bag}<span>Bag</span></button>
        <button data-panel="quests">${ICONS.quest}<span>Quests</span></button>
        <button data-panel="map">${ICONS.map}<span>Map</span></button>
      </nav>`);
    root.insertAdjacentHTML('beforeend', '<div class="sheet hidden" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-card"><button class="sheet-x" aria-label="Close">×</button><h2 id="sheet-title"></h2><div class="sheet-body"></div></div></div>');
    this.timeEl = hud.querySelector('.clock .time');
    this.sheet = root.querySelector('.sheet');
    this.sheetTitle = this.sheet.querySelector('h2');
    this.sheetBody = this.sheet.querySelector('.sheet-body');
    this.open = null;
    minimap.onClose = () => this.close();
    minimap.onOpen = () => this.toggle('map');

    this._tick();
    setInterval(() => this._tick(), 15000);

    hud.querySelectorAll('.side-menu button').forEach((b) => {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => this.toggle(b.dataset.panel));
    });
    this.sheet.addEventListener('click', (e) => { if (e.target === this.sheet || e.target.closest('.sheet-x')) this.close(); });
    this.sheet.addEventListener('pointerdown', (e) => e.stopPropagation());
    state.on('fragment:collected', () => this.open && this.open !== 'map' && this._render(this.open));
    state.on('mission:changed', () => this.open && this.open !== 'map' && this._render(this.open));
    state.on('phase', () => this.close());

    // Desktop shortcuts: M map, B bag, Q quests, Esc closes.
    const keys = { KeyM: 'map', KeyB: 'bag', KeyQ: 'quests' };
    addEventListener('keydown', (e) => {
      if (e.repeat || hud.classList.contains('hidden')) return;
      // Map, Bag and Quests are the city's; a shopping trip has only Settings.
      if (keys[e.code] && !inMall()) this.toggle(keys[e.code]);
      else if (e.code === 'Escape') this.close();
    });
  }

  /**
   * In-world clock: the district is always at golden hour. From 17:20 it
   * runs ever slower toward sunset (a minute per ~35 s at first, 18:04 after
   * 40 minutes, never 18:30): it never jumps back (it used to wrap 17:59 →
   * 17:20) nor reads night under an evening sun.
   */
  _tick() {
    this._t0 ??= performance.now();
    const s = (performance.now() - this._t0) / 1000;
    const m = 17 * 60 + 20 + Math.floor(70 * (1 - Math.exp(-s / 2400)));
    this.timeEl.textContent = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  }

  toggle(name) {
    if (this.missions.dialogOpen || this.state.phase !== 'playing') return;
    if (this.open === name) return this.close();
    this.close();
    this.open = name;
    this.input.setVisible(false);
    if (name === 'map') { this.minimap.setExpanded(true); return; }
    this._render(name);
    this.sheet.classList.remove('hidden');
    this.sheet.querySelector('.sheet-x').focus({ preventScroll: true });
    // Free the mouse so the sheet can be clicked.
    if (document.pointerLockElement) document.exitPointerLock();
  }

  close() {
    if (!this.open) return;
    if (this.open === 'map') this.minimap.setExpanded(false);
    this.open = null;
    this.sheet.classList.add('hidden');
    this.input.setVisible(this.state.phase === 'playing' && !this.missions.dialogOpen);
  }

  /** Graphics preset picker: Recommended (detected for this device) or a fixed preset. */
  _graphicsRow() {
    const g = this.graphics;
    const opts = [['auto', 'Auto', PRESETS[g.recommended].label], ...TIERS.map((t) => [t, PRESETS[t].label, ''])];
    return `<div class="row gfx">
      <div class="gfx-head"><span>Graphics</span><small>${g.mode === 'auto' ? 'Recommended for this device' : 'Fixed preset'}</small></div>
      <div class="gfx-options">${opts.map(([mode, label, sub]) => `<button data-mode="${mode}" class="${g.mode === mode ? 'on' : ''}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`).join('')}</div>
      <p class="gfx-note">${g.mode === 'auto'
        ? `Using ${PRESETS[g.recommended].label}. Lowers itself automatically if the game runs slowly.`
        : `Recommended for this device: ${PRESETS[g.recommended].label}.`}</p>
    </div>`;
  }

  /** Frame-rate mode: a lower target keeps the phone cooler (see AdaptivePerformance). */
  _fpsRow() {
    const a = this.adaptive;
    const notes = {
      saver: 'Steady 30 fps. Coolest and longest battery life.',
      balanced: 'Steady 60 fps. Smooth and stays cool.',
      max: 'As fast as the screen allows. Phones get warm.',
    };
    return `<div class="row gfx">
      <div class="gfx-head"><span>Frame rate</span><small>Quality adapts to hold it</small></div>
      <div class="gfx-options fps-options">${Object.entries(FPS_MODES).map(([mode, m]) => `<button data-fps="${mode}" class="${a.mode === mode ? 'on' : ''}">${m.label}<small>${Number.isFinite(m.fps) ? `${m.fps} fps` : 'screen rate'}</small></button>`).join('')}</div>
      <p class="gfx-note">${notes[a.mode]}</p>
    </div>`;
  }

  _savedText() {
    const t = this.saves.lastSaved;
    return t ? `Autosaves · last saved ${formatAgo(t)}` : 'Autosaves as you play';
  }

  /** Play stats: this game and all time. */
  _statsTable() {
    const run = this.saves.current?.stats || emptyStats(), life = this.saves.profile.lifetime;
    return `<div class="stats"><div class="stats-head"><h3>Your story</h3><span>This game</span><span>All time</span></div>
      ${statRows(run, life).map(([label, a, b]) => `<div class="stat"><span>${label}</span><b>${a}</b><b>${b}</b></div>`).join('')}
      <p class="muted">Playing since ${new Date(this.saves.profile.firstPlayed).toLocaleDateString()} · ${this.saves.profile.games} games · ${this.saves.profile.sessions} sessions</p></div>`;
  }

  _render(name) {
    const items = this.collectibles.items;
    const got = items.filter((i) => i.collected).length;
    const journal = this.missions.getJournal();
    const finished = journal.filter((m) => m.status === 'completed').length;
    if (name === 'bag') {
      this.sheetTitle.textContent = 'Bag';
      this.sheetBody.innerHTML = `
        <div class="wallet"><span>Neighborhood coins</span><b>${this.state.coins || 0} <small>◈</small></b></div>
        <div class="bag-grid">${items.map((it) => `<div class="slot ${it.collected ? 'on' : ''}"><i class="gem"></i></div>`).join('')}</div>
        <p class="muted">${got} / ${items.length} energy fragments · ${finished} / ${journal.length} favors completed</p>
        <p class="muted">Help residents to earn coins. Accepted missions and their objectives appear in your journal.</p>
        ${this.saves ? this._statsTable() : ''}`;
      if (this.shops) {
        // Items, reading, wardrobe and keys, above the stats.
        const holder = document.createElement('div');
        const rerender = () => this._render('bag');
        rerender.close = () => this.close();
        this.shops.renderBag(holder, rerender);
        this.sheetBody.querySelector('.stats')?.before(holder);
      }
    } else if (name === 'quests') {
      this.sheetTitle.textContent = 'Quests';
      this.sheetBody.innerHTML = `
        <div class="quest main"><b>Gather the light</b><span>Find the ${items.length} energy fragments (${got}/${items.length})</span></div>
        <ul class="quest-list">${items.map((it, i) => `<li class="${it.collected ? 'done' : ''}"><i></i>${FRAGMENT_HINTS[i] || 'Somewhere in the district'}</li>`).join('')}</ul>
        <div class="quest ${got === items.length ? '' : 'locked'}"><b>The open gate</b><span>${got === items.length ? 'Step into the portal on the main street' : 'Unlocks when all fragments glow'}</span></div>
        <div class="journal-heading"><h3>Neighborhood stories</h3><span>${finished} / ${journal.length}</span></div>
        <p class="muted journal-intro">Find the ! markers and talk to residents to accept a favor.</p>
        ${journal.map((m) => `<article class="journal-quest ${m.status}">
          <div class="journal-quest-top"><b>${m.title}</b><span class="quest-status">${({ available: 'Available', active: 'In progress', ready: 'Return', completed: 'Complete' })[m.status] || m.status}</span></div>
          <p>${m.description}</p><strong>${m.objective}</strong>
          <div class="journal-quest-bottom"><span>${m.progress} / ${m.total} · ${m.giver}</span><span>◈ ${m.reward} coins</span></div>
          ${m.status !== 'completed' ? `<button class="track-mission" data-mission="${m.id}">${m.tracked ? 'Keep tracking' : 'Track this favor'}</button>` : ''}
        </article>`).join('')}`;
      this.sheetBody.querySelectorAll('.track-mission').forEach((button) => {
        button.addEventListener('click', () => { this.missions.track(button.dataset.mission); this.close(); });
      });
    } else if (name === 'settings') {
      this.sheetTitle.textContent = 'Settings';
      const muted = this.audio.muted;
      this.sheetBody.innerHTML = `
        ${this.graphics ? this._graphicsRow() : ''}
        ${this.adaptive ? this._fpsRow() : ''}
        ${offerAndroidApp ? `<div class="row"><span>Android app<small class="row-sub">Full screen, stays cooler</small></span><a class="pill" href="${ANDROID_APP_PAGE}">Get it</a></div>` : ''}
        <div class="row"><span>Sound</span><button class="pill sound">${muted ? 'Off' : 'On'}</button></div>
        <div class="row"><span>Voices</span><button class="pill voices">${({ natural: 'Natural', device: 'Device', off: 'Off' })[this.voices?.mode] || 'Natural'}</button></div>
        ${inMall() ? `<div class="row"><span>Leave the mall<small class="row-sub">End the trip: the receipt, then the title</small></span><button class="pill leave-mall">Leave</button></div>` : `
        ${this.saves ? `<div class="row"><span>Game<small class="row-sub save-when">${this._savedText()}</small></span><button class="pill save-now">Save now</button></div>
        <div class="row"><span>Quit to title<small class="row-sub">Your game is saved first</small></span><button class="pill quit-title">Quit</button></div>` : ''}
        <div class="row"><span>New game<small class="row-sub">Start the exploration over</small></span><button class="pill restart-now">Restart</button></div>`}`;
      // Voices: Natural (neural, best) → Device (built-in, light) → Off.
      this.sheetBody.querySelector('.voices')?.addEventListener('click', (e) => {
        if (!this.voices) return;
        const next = { natural: 'device', device: 'off', off: 'natural' }[this.voices.mode];
        this.voices.setMode(next);
        e.currentTarget.textContent = { natural: 'Natural', device: 'Device', off: 'Off' }[next];
      });
      this.sheetBody.querySelector('.sound').addEventListener('click', (e) => {
        this.audio.setMuted(!this.audio.muted);
        e.currentTarget.textContent = this.audio.muted ? 'Off' : 'On';
      });
      this.sheetBody.querySelectorAll('.gfx-options button[data-mode]').forEach((b) => b.addEventListener('click', () => {
        this.graphics.setMode(b.dataset.mode);
        this._render('settings');
      }));
      this.sheetBody.querySelectorAll('.gfx-options button[data-fps]').forEach((b) => b.addEventListener('click', () => {
        this.adaptive.setMode(b.dataset.fps);
        this._render('settings');
      }));
      this.sheetBody.querySelector('.leave-mall')?.addEventListener('click', () => { this.close(); this.state.emit('ui:mall-leave'); });
      this.sheetBody.querySelector('.restart-now')?.addEventListener('click', (e) => {
        // Starting over replaces the save: ask with a second tap.
        const b = e.currentTarget;
        if (!b.classList.contains('confirm')) { b.classList.add('confirm'); b.textContent = 'Sure?'; return; }
        this.close(); this.state.emit('ui:restart');
      });
      this.sheetBody.querySelector('.save-now')?.addEventListener('click', (e) => {
        const ok = this.saves.saveNow();
        e.currentTarget.textContent = ok ? 'Saved ✓' : 'Failed';
        this.sheetBody.querySelector('.save-when').textContent = ok ? this._savedText() : 'Storage is full or blocked';
      });
      this.sheetBody.querySelector('.quit-title')?.addEventListener('click', () => {
        this.saves.saveNow();
        this.close();
        this.state.emit('ui:quit');
      });
    }
  }
}
