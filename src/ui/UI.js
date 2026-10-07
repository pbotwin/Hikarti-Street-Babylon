import { Phase } from '../core/GameState.js';
import { offerAndroidApp, ANDROID_APP_PAGE } from '../core/platform.js';

/**
 * Minimal DOM UI: loading veil, title card, fragment counter, toasts and the
 * completion screen. Pure HTML/CSS (crisp text at any DPI, cheap to render).
 */
export class UI {
  constructor(root, state) {
    this.root = root;
    this.state = state;
    root.insertAdjacentHTML('beforeend', `
      <div class="hud hidden">
        <div class="place-card"><b>HIKARI STREET</b><span>Meet residents. Discover their stories.</span></div>
        <div class="counter">
          <span class="gem"></span>
          <span class="label">Energy Fragments</span>
          <span class="count"><b class="n">0</b><i>/</i><span class="total">5</span></span>
        </div>
        <div class="pips"></div>
      </div>
      <div class="toast"><div class="toast-inner"><span class="toast-title"></span><span class="toast-sub"></span></div></div>
      <div class="screen loading">
        <div class="brand"><div class="logo">光<span>HIKARI STREET</span></div></div>
        <div class="bar"><div class="fill"></div></div>
        <div class="status">Loading…</div>
      </div>
      <div class="screen title hidden">
        <div class="petals">${Array.from({ length: 16 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${6 + (i % 5) * 1.7}s;--delay:${-((i * 1.3) % 9)}s;--s:${0.6 + (i % 4) * 0.25}"></i>`).join('')}</div>
        <button class="btn mall-mode" aria-label="Shopping mode: Hikari Mall"><span class="mall-ico">🛒</span><span class="mall-text"><b>Shopping mode</b><small>Hikari Mall</small></span><span class="chev">›</span></button>
        <div class="title-card">
          <div class="title-top">
            <div class="kanji-wrap">
              <svg class="orbit" viewBox="0 0 300 120" aria-hidden="true"><defs><linearGradient id="og" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffe9c4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><ellipse cx="150" cy="60" rx="140" ry="34" fill="none" stroke="url(#og)" stroke-width="2.2" transform="rotate(-12 150 60)"/></svg>
              <span class="kanji">光</span>
              <span class="spark s1">✦</span><span class="spark s2">✦</span><span class="spark s3">✧</span>
            </div>
            <div class="title-en">HIKARI STREET</div>
            <div class="title-jp"><i></i>ヒカリストリート<i></i></div>
            <p class="tagline">Find the light. Meet the neighbourhood.</p>
          </div>
          <div class="title-bottom">
            <button class="btn primary start"><span class="sakura a">✿</span><span class="only-touch">Tap to start</span><span class="only-mouse">Click to start</span><span class="chev">›</span><span class="sakura b">✿</span></button>
            <div class="save-actions" hidden>
              <button class="btn primary load"><span class="sakura a">✿</span><span>Continue</span><span class="chev">›</span><span class="sakura b">✿</span></button>
              <p class="save-line"><b></b><span></span></p>
              <button class="btn new-game">New game</button>
            </div>
            <div class="hint-row only-touch">
              <div><span class="ico joy"></span><p><b>Left thumb</b> move<br>Push further to run</p></div>
              <div><span class="ico drag"></span><p><b>Right side</b> drag<br>to look</p></div>
              <div><span class="ico jump">⤒</span><p><b>Jump</b><br>&nbsp;</p></div>
            </div>
            <div class="hint-row only-mouse">
              <div><span class="ico key">W</span><p><b>WASD</b> move<br><b>Shift</b> to run</p></div>
              <div><span class="ico mouse"></span><p><b>Mouse</b><br>to look</p></div>
              <div><span class="ico key wide">␣</span><p><b>Space</b> jump<br>&amp; climb</p></div>
            </div>
            <a class="get-app" hidden>Get the Android app <span>›</span></a>
          </div>
        </div>
      </div>
      <div class="screen complete hidden">
        <div class="complete-card">
          <div class="sparkle">✦</div>
          <h1>Exploration Complete</h1>
          <p class="time"></p>
          <div class="buttons">
            <button class="btn primary continue">Continue</button>
            <button class="btn restart">Restart</button>
          </div>
        </div>
      </div>
      <div class="build${new URLSearchParams(location.search).has('debug') ? ' debug' : ''}">build ${typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev'}</div>
    `);
    this.hud = root.querySelector('.hud');
    this.countEl = root.querySelector('.count .n');
    this.counter = root.querySelector('.counter');
    this.pips = root.querySelector('.pips');
    this.toastEl = root.querySelector('.toast');
    this.loading = root.querySelector('.loading');
    this.titleScreen = root.querySelector('.title');
    this.completeScreen = root.querySelector('.complete');
    this.fill = root.querySelector('.bar .fill');
    this.status = root.querySelector('.status');

    root.querySelector('.total').textContent = state.fragmentsTotal;
    for (let i = 0; i < state.fragmentsTotal; i++) this.pips.insertAdjacentHTML('beforeend', '<i></i>');

    // Android browsers: link to the app download page (not inside the app).
    const getApp = root.querySelector('.get-app');
    getApp.href = ANDROID_APP_PAGE;
    getApp.hidden = !offerAndroidApp;

    // Start (no save yet) / Continue / New game. SaveSystem loads or resets
    // the world on ui:load / ui:new, then starts play.
    root.querySelector('.start').addEventListener('click', () => {
      this._fullscreen();
      state.emit('ui:new');
    });
    root.querySelector('.load').addEventListener('click', () => {
      this._fullscreen();
      state.emit('ui:load');
    });
    // Shopping mode: a trip to Hikari Mall (MallMode), from the title screen.
    root.querySelector('.mall-mode').addEventListener('click', () => {
      this._fullscreen();
      state.emit('ui:mall');
    });
    const newGame = root.querySelector('.new-game');
    newGame.addEventListener('click', () => {
      // Replacing a save takes a second tap (no browser dialogs).
      if (!newGame.classList.contains('confirm')) {
        newGame.classList.add('confirm');
        newGame.textContent = 'Start over? Tap again';
        clearTimeout(this._confirmTimer);
        this._confirmTimer = setTimeout(() => { newGame.classList.remove('confirm'); newGame.textContent = 'New game'; }, 4000);
        return;
      }
      clearTimeout(this._confirmTimer);
      newGame.classList.remove('confirm'); newGame.textContent = 'New game';
      this._fullscreen();
      state.emit('ui:new');
    });
    // Desktop: Enter starts / continues.
    addEventListener('keydown', (e) => {
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      if (state.phase === Phase.TITLE) root.querySelector(this._hasSave ? '.load' : '.start').click();
      else if (state.phase === Phase.COMPLETE) root.querySelector('.continue').click();
    });
    root.querySelector('.continue').addEventListener('click', () => state.emit('ui:continue'));
    root.querySelector('.restart').addEventListener('click', () => state.emit('ui:restart'));

    this.buildEl = root.querySelector('.build');
    state.on('phase', ({ phase }) => this._onPhase(phase));
    // A shopping trip is not the story's start: no fragments greeting.
    state.on('ui:mall', () => { this._trip = true; });
    state.on('fragment:collected', ({ count, total }) => this._onFragment(count, total));
    state.on('portal:activated', () => setTimeout(() => this.toast('Portal Activated', 'A gate has opened on the main street'), 900));
    state.on('game:reset', () => this._resetCounter());
    this.startTime = 0;
  }

  /** Title screen: Continue + New game for a save ({ line, saved }), else Start. */
  setSaveInfo(info) {
    this._hasSave = !!info;
    const box = this.titleScreen.querySelector('.save-actions');
    box.hidden = !info;
    this.titleScreen.querySelector('.start').hidden = !!info;
    if (info) {
      box.querySelector('.save-line b').textContent = info.line;
      box.querySelector('.save-line span').textContent = info.saved;
    }
  }

  /** Show `count` fragments found without the pickup animation (loaded game). */
  setFragments(count) {
    this.countEl.textContent = count;
    [...this.pips.children].forEach((p, i) => p.classList.toggle('on', i < count));
    this.counter.classList.toggle('done', count >= this.state.fragmentsTotal);
    this._resumed = true;
  }

  setLoading(p, text) {
    this.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
    if (text) this.status.textContent = text;
  }

  /** The loading veil again after boot (a shopping trip loading); the next phase change hides it. */
  showLoading() {
    this.setLoading(0, '');
    this.loading.classList.remove('hidden');
    this.titleScreen.classList.add('hidden');
  }

  _onPhase(phase) {
    this.loading.classList.add('hidden');
    this.buildEl.classList.toggle('hidden', phase === Phase.PLAYING);
    this.titleScreen.classList.toggle('hidden', phase !== Phase.TITLE);
    this.hud.classList.toggle('hidden', phase !== Phase.PLAYING);
    if (phase === Phase.TITLE) this._trip = false;
    if (phase === Phase.PLAYING && !this.startTime && !this._trip) {
      this.startTime = performance.now();
      setTimeout(() => (this._resumed
        ? this.toast('Welcome back', 'Your progress has been loaded')
        : this.toast('Find the Energy Fragments', 'Follow the beams of light')), 600);
    }
    if (phase === Phase.COMPLETE) {
      const s = Math.round((performance.now() - this.startTime) / 1000);
      this.completeScreen.querySelector('.time').textContent =
        `5 / 5 fragments · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      this.completeScreen.classList.remove('hidden');
      requestAnimationFrame(() => this.completeScreen.classList.add('show'));
    } else {
      this.completeScreen.classList.remove('show');
      this.completeScreen.classList.add('hidden');
    }
  }

  _onFragment(count) {
    this.countEl.textContent = count;
    this.counter.classList.remove('bump');
    void this.counter.offsetWidth; // restart CSS animation
    this.counter.classList.add('bump');
    this.pips.children[count - 1]?.classList.add('on');
    if (count === this.state.fragmentsTotal) this.counter.classList.add('done');
  }

  _resetCounter() {
    clearTimeout(this._toastTimer);
    this.toastEl.classList.remove('show');
    this.countEl.textContent = '0';
    this.counter.classList.remove('done', 'bump');
    [...this.pips.children].forEach((p) => p.classList.remove('on'));
    this.startTime = performance.now();
    this._resumed = false;
  }

  toast(title, sub = '') {
    this.toastEl.querySelector('.toast-title').textContent = title;
    this.toastEl.querySelector('.toast-sub').textContent = sub;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 3200);
  }

  _fullscreen() {
    const el = document.documentElement;
    if (matchMedia('(pointer: coarse)').matches && el.requestFullscreen && !document.fullscreenElement) {
      // No orientation lock: the game plays in portrait and landscape.
      el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
  }

  update(dt, player, world) {
    const district = world?.getDistrict(player.position);
    if (!district || district.id === this._district) return;
    this._district = district.id;
    this.hud.querySelector('.place-card b').textContent = district.name.toUpperCase();
    this.hud.querySelector('.place-card span').textContent = district.description || 'Meet residents. Discover their stories.';
    const card = this.hud.querySelector('.place-card');
    card.classList.add('show');
    clearTimeout(this._cardTimer);
    this._cardTimer = setTimeout(() => card.classList.remove('show'), 4500);
  }
}
