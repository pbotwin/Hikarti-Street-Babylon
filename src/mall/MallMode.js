import { Phase } from '../core/GameState.js';
import { MallWorld } from './MallWorld.js';
import { MallShopping } from './MallShopping.js';
import { MallFashion } from './MallFashion.js';
import { MallShoppers } from './MallShoppers.js';
import { TRIP_BUDGET, GROCERY_BY_ID, CLOTHES_BY_ID } from './MallCatalog.js';

/**
 * Shopping mode: a trip to Hikari Mall (see MALL.md). Started from the title
 * screen; the city is put to sleep (everything in the scene before the trip
 * is disabled, and the main loop skips the city's systems), the mall is built
 * behind the loading veil, and she arrives next to her car. The modules
 * (world, shopping, fashion, shoppers) run the trip; this owns its lifecycle,
 * the one action prompt, the trip's wallet and the receipt at the end, after
 * which her purchases go to her Bag and the game returns to the title.
 */
export class MallMode {
  constructor(deps) {
    this.deps = deps;
    this.active = false;
    this.modules = [];
    this._sleeping = [];
    this._prompt = null;
    this._starting = false;
    this._buildDom();
    deps.state.on('ui:mall', () => this.start());
    // Settings' "Leave the mall": the trip ends as if she drove off (the receipt).
    deps.state.on('ui:mall-leave', () => this.finish());
  }

  /** Controls belong to an animation (paying, trying on, loading the boot). */
  get busy() { return this.active && this.modules.some((m) => m.busy); }

  async start() {
    const d = this.deps;
    if (this.active || this._starting || d.state.phase !== Phase.TITLE) return;
    this._starting = true;
    d.ui.showLoading();
    d.ui.setLoading(0.05, 'Driving to Hikari Mall…');
    this._sleep();

    this.wallet = makeWallet(TRIP_BUDGET);
    const ctx = this.ctx = {
      ...d, wallet: this.wallet, hud: this._hud(), finish: () => this.finish(),
    };
    const world = new MallWorld(ctx);
    ctx.world = world;
    await world.init();
    ctx.layout = world.layout;
    d.ui.setLoading(0.45, 'Stocking the shelves…');
    // Shopping takes the clothing store's bags to the cart and the boot.
    const fashion = ctx.fashion = new MallFashion(ctx);
    this.modules = [world, new MallShopping(ctx), fashion, new MallShoppers(ctx)];
    await Promise.all(this.modules.slice(1).map((m) => m.init()));
    d.ui.setLoading(0.85, 'Opening the doors…');
    // Shaders and geometry finished on the GPU now, not on first sight.
    await d.graphics.warmUp(new Set(this._sleeping));

    const s = ctx.layout.spawn;
    d.player.spawn(s.x, s.z, s.yaw);
    d.cameraRig.snapBehind(d.player);
    this.active = true;
    this._starting = false;
    this.dom.hud.hidden = false;
    document.documentElement.dataset.mode = 'mall';
    this._wallet();
    d.ui.setLoading(1, 'Ready');
    d.state.setPhase(Phase.PLAYING);
  }

  update(dt) {
    if (!this.active) return;
    for (const m of this.modules) m.update(dt);
    this._choosePrompt();
    this._wallet();
  }

  /** The trip is over (she drove off): the receipt, then back to the title. */
  finish() {
    if (!this.active || this._finishing) return;
    this._finishing = true;
    const r = this.wallet.receipt, total = r.reduce((s, e) => s + e.price * e.qty, 0);
    this.dom.receipt.querySelector('.mall-receipt-items').innerHTML = r.length
      ? r.map((e) => `<li><span>${e.qty > 1 ? `${e.qty} × ` : ''}${esc(e.name)}</span><b>${e.price * e.qty}</b></li>`).join('')
      : '<li class="empty">Nothing bought this time.</li>';
    this.dom.receipt.querySelector('.mall-receipt-total').textContent = String(total);
    this.dom.receipt.querySelector('.mall-receipt-left').textContent = String(this.wallet.coins);
    this.dom.receipt.hidden = false;
    this.deps.input.setAction(null);
    this._setPrompt(null);
  }

  /** Close the receipt: purchases to her Bag, the mall goes, the city wakes. */
  _leave() {
    const d = this.deps;
    this.dom.receipt.hidden = true;
    d.shops.addMallPurchases(this.wallet.receipt);
    for (const m of [...this.modules].reverse()) m.dispose();
    this.modules = [];
    this.ctx = null;
    this.active = false;
    this._finishing = false;
    this.dom.hud.hidden = true;
    delete document.documentElement.dataset.mode;
    d.player.restrict = null;
    d.player.hold = false;
    d.animation.act.hands = null;
    this._wake();
    const s = d.world.spawn;
    d.player.spawn(s.x, s.z, s.yaw);
    d.cameraRig.snapBehind(d.player);
    d.cameraRig.targetYaw = d.cameraRig.yaw = d.player.yaw - Math.PI * 0.72;
    d.state.setPhase(Phase.TITLE);
  }

  /** Everything in the scene before the trip sleeps (her and the camera stay). */
  _sleep() {
    const { scene, character, camera } = this.deps;
    const keep = new Set([character.root, camera, this.deps.graphics.sky]);
    this._sleeping = scene.rootNodes.filter((n) => !keep.has(n) && n.isEnabled?.() && n.setEnabled && !n.getClassName?.().includes('Light'));
    for (const n of this._sleeping) n.setEnabled(false);
  }

  _wake() {
    for (const n of this._sleeping) if (!n.isDisposed?.()) n.setEnabled(true);
    this._sleeping = [];
  }

  // ------------------------------------------------------------ prompt
  _choosePrompt() {
    let best = null;
    if (!this.busy && !this._finishing) {
      for (const m of this.modules) {
        const p = m.prompt();
        if (p && (!best || p.priority > best.priority || (p.priority === best.priority && p.distance < best.distance))) best = p;
      }
    }
    this._setPrompt(best);
  }

  _setPrompt(p) {
    this._prompt = p;
    const el = this.dom.prompt, label = p ? p.label : null;
    if (el.dataset.label === (label || '')) return;
    el.dataset.label = label || '';
    el.classList.toggle('hidden', !label);
    if (label) {
      el.querySelector('.mission-action-label').textContent = label;
      el.querySelector('.mission-action-icon').textContent = p.icon || '✋';
    }
  }

  _act() {
    if (this.active && this._prompt && !this.busy) this._prompt.run();
  }

  // ------------------------------------------------------------ DOM
  _wallet() {
    const c = String(this.wallet?.coins ?? 0);
    if (this.dom.coins.textContent !== c) this.dom.coins.textContent = c;
  }

  _hud() {
    const root = this.dom.panels;
    return {
      toast: (title, sub = '') => this.deps.ui.toast(title, sub),
      /**
       * A named side panel; null removes it. Its first child is the header:
       * on touch screens a panel shows only that (a chip) until tapped, as
       * the open lists covered her and the look area on phones.
       */
      panel: (name, html) => {
        let el = root.querySelector(`[data-panel="${name}"]`);
        if (html == null) { el?.remove(); return null; }
        if (!el) {
          el = document.createElement('aside');
          el.className = 'mall-panel';
          el.dataset.panel = name;
          el.classList.toggle('open', document.documentElement.dataset.input !== 'touch');
          root.append(el);
        }
        el.innerHTML = html;
        return el;
      },
    };
  }

  _buildDom() {
    const root = document.getElementById('ui');
    root.insertAdjacentHTML('beforeend', `
      <div class="mall-hud" hidden>
        <div class="mall-wallet"><span>🛍 Hikari Mall</span><b><i class="mall-coins">0</i> coins</b></div>
        <div class="mall-panels"></div>
      </div>
      <button class="mission-action interior-action mall-action hidden" type="button"><kbd class="only-mouse">F</kbd><span class="mission-action-icon" aria-hidden="true">✋</span><span class="mission-action-label"></span></button>
      <div class="screen mall-receipt" hidden>
        <div class="mall-receipt-card">
          <h2>Thank you for shopping<br><small>Hikari Mall</small></h2>
          <ul class="mall-receipt-items"></ul>
          <p class="mall-receipt-sum"><span>Total</span><b class="mall-receipt-total">0</b></p>
          <p class="mall-receipt-sum light"><span>Left on the gift card</span><b class="mall-receipt-left">0</b></p>
          <p class="mall-receipt-note">Everything you bought is in your Bag.</p>
          <button class="btn primary mall-receipt-ok">Back to Hikari Street ›</button>
        </div>
      </div>`);
    this.dom = {
      hud: root.querySelector('.mall-hud'),
      coins: root.querySelector('.mall-coins'),
      panels: root.querySelector('.mall-panels'),
      prompt: root.querySelector('.mall-action'),
      receipt: root.querySelector('.mall-receipt'),
    };
    // A panel's header opens or folds it (its buttons do their own thing).
    this.dom.panels.addEventListener('click', (e) => {
      const head = e.target.closest('.mall-panel > :first-child');
      if (head && !e.target.closest('button')) head.parentElement.classList.toggle('open');
    });
    this.dom.prompt.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.dom.prompt.addEventListener('click', (e) => { e.stopPropagation(); this._act(); });
    this.dom.receipt.querySelector('.mall-receipt-ok').addEventListener('click', () => this._leave());
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && this.active && this._prompt) { e.stopImmediatePropagation(); e.preventDefault(); this._act(); }
    }, true);
  }
}

/** The trip's money and its receipt. */
function makeWallet(coins) {
  return {
    coins,
    receipt: [],
    /** Pay `n`: false (and nothing taken) if there isn't enough. */
    spend(n) {
      if (n > this.coins) return false;
      this.coins -= n;
      return true;
    },
    /** A bought item on the receipt (by catalog id). */
    add(id, qty = 1) {
      const item = GROCERY_BY_ID[id] || CLOTHES_BY_ID[id];
      if (!item) return;
      const line = this.receipt.find((e) => e.id === id);
      if (line) line.qty += qty;
      else this.receipt.push({ id, name: item.name, price: item.price, qty });
    },
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
