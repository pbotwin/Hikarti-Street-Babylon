import { Phase } from '../core/GameState.js';
import { ITEMS, SHOPS, DEFAULT_OUTFIT, WEARABLE, REWARDS, canBuy } from './ShopData.js';

/**
 * Shops: walk up to a storefront, counter or vending machine, press F (or
 * tap the button) and buy with the coins earned from favors, fragments and
 * new districts. Drinks run faster and food jumps higher for a while,
 * magazines are kept to read, clothes and hair colour change her look, and
 * Hikari Motors sells the keys to its two showroom vehicles.
 *
 * Everything bought is saved (SaveSystem calls capture / restore / reset).
 */

// Storefronts that already stood on the map (door positions, see Buildings
// faces(): door = front centre offset, 0.6 m out). Plus vending machines and
// market stalls. Hikari Plaza and Hikari Motors come from world.shopSpots.
const STOREFRONTS = [
  // Hikari Street
  { shop: 'konbini', name: 'Hikari Mart', x: 7.9, z: -12.5 },
  { shop: 'cafe', name: 'Kumo Café', x: -7.9, z: -5.5 },
  { shop: 'ramen', name: 'Ramen Akari', x: -7.9, z: 6.5 },
  { shop: 'books', name: 'Books & Records', x: -7.9, z: 23.5 },
  { shop: 'drugstore', name: 'Drugstore Midori', x: 7.9, z: 42.5 },
  { shop: 'vending', name: 'Vending machine', x: 17, z: -7.75, machine: { x: 17, z: -6.95 } },
  // Station Walk and Komorebi Market
  { shop: 'vending', name: 'Vending machine', x: -8.35, z: 66, machine: { x: -9.2, z: 66 } },
  { shop: 'cafe', name: 'Northside Coffee', x: -9.0, z: 56.5 },
  { shop: 'boutique', name: 'Studio 08', x: 9.0, z: 64.6 },
  { shop: 'market', name: 'Komorebi Local Goods', x: -39.9, z: 74.5 },
  { shop: 'books', name: 'Vinyl Days', x: -39.9, z: 89.5 },
  { shop: 'bakery', name: 'Mori Bakery', x: 39.9, z: 85.5 },
  { shop: 'boutique', name: 'Nuno Vintage', x: 39.9, z: 100.5 },
  // Open-air stalls: a vendor hands things over the counter (no interior).
  { shop: 'market', name: 'Momo Fruit', x: -24, z: 77.2, stall: true },
  { shop: 'boutique', name: 'Thread + Needle', x: 24, z: 77.2, stall: true },
  { shop: 'books', name: 'Sunday Records', x: -23, z: 97.6, stall: true },
  // The city
  { shop: 'konbini', name: 'Mori Market', x: -108, z: 156.7 },
  { shop: 'cafe', name: 'Sunday Coffee', x: -57, z: 156.7 },
  { shop: 'books', name: 'Aoba Books', x: -24, z: 156.7 },
  { shop: 'salon', name: 'Mizu Studio', x: 24, z: 156.7 },
  { shop: 'bakery', name: 'Little Bakery', x: 57, z: 156.7 },
  { shop: 'books', name: 'North Records', x: 106, z: 156.7 },
  { shop: 'ramen', name: 'Yori Kitchen', x: -11.3, z: 184.5 },
  { shop: 'cafe', name: 'Canal Coffee', x: 119.3, z: 181.5 },
  { shop: 'tea', name: 'River Goods', x: 119.3, z: 226 },
];

const REACH = 1.9;          // m from the counter
const RUN_BOOST = 1.25;     // run speed ×
const JUMP_BOOST = 1.18;    // jump velocity × (≈1.9 m apex instead of 1.35)
// Outfit parts she wears garments on (the hair is only dyed).
const GARMENT_PARTS = ['top', 'bottom', 'shoes'];

export class ShopSystem {
  constructor({ root, state, player, vehicles, missions, world, ui, input = null, specs = [], character }) {
    Object.assign(this, { root, state, player, vehicles, missions, world, ui, input, character });
    this.spots = [...STOREFRONTS, ...(world.shopSpots || [])]
      .filter((s) => SHOPS[s.shop])
      .map((s) => ({ ...s, def: SHOPS[s.shop], name: s.name || SHOPS[s.shop].name }));
    this.open = false;
    this.current = null;     // spot the prompt is for
    this.lockedNear = null;  // a showroom vehicle she is standing at
    this.boosts = { run: 0, jump: 0 };
    this._outfitJob = Promise.resolve();
    // Showroom vehicles: VehicleSystem builds one vehicle per spec, in order.
    vehicles.vehicles.forEach((v, i) => { if (specs[i]?.showroom) v.showroom = specs[i].showroom; });
    this.reset();
    this._buildDom();
    this._events();
  }

  // ------------------------------------------------------------ state / save
  /** Fresh playthrough: nothing bought, her own clothes. */
  reset() {
    this.owned = new Set(Object.values(DEFAULT_OUTFIT));
    this.inventory = {};
    this.outfit = { ...DEFAULT_OUTFIT };
    this.boosts.run = this.boosts.jump = 0;
    this._applyBoosts();
    this._syncLocks();
    this._applyOutfit();
  }

  capture() {
    return { owned: [...this.owned], inventory: { ...this.inventory }, outfit: { ...this.outfit } };
  }

  restore(data) {
    this.reset();
    if (!data) return;
    for (const id of data.owned || []) if (ITEMS[id]) this.owned.add(id);
    for (const [id, n] of Object.entries(data.inventory || {})) if (ITEMS[id] && n > 0) this.inventory[id] = Math.floor(n);
    for (const part of Object.keys(DEFAULT_OUTFIT)) {
      const id = data.outfit?.[part];
      if (id && ITEMS[id]?.kind === part && this.owned.has(id)) this.outfit[part] = id;
    }
    this._syncLocks();
    this._applyOutfit();
  }

  // ------------------------------------------------------------ buying / using
  buy(itemId) {
    const item = ITEMS[itemId];
    const r = canBuy(itemId, { coins: this.state.coins || 0, owned: [...this.owned] });
    if (!r.ok) return r;
    this.state.coins = r.coins;
    if (r.keeps) this.owned.add(itemId);
    else this.inventory[itemId] = (this.inventory[itemId] || 0) + 1;
    if (item.kind === 'vehicle') this._syncLocks();
    if (WEARABLE.has(item.kind)) this.wear(itemId);
    this.state.emit('shop:bought', { id: itemId, price: item.price, shop: this.current?.name });
    this.missions.publish?.();   // wallet on the tracker
    return r;
  }

  /** A shopping trip's receipt (Hikari Mall): clothes to the wardrobe, goods to the Bag. */
  addMallPurchases(receipt) {
    for (const { id, qty } of receipt) {
      const item = ITEMS[id];
      if (!item) continue;
      if (WEARABLE.has(item.kind)) this.owned.add(id);
      else this.inventory[id] = (this.inventory[id] || 0) + qty;
    }
    if (receipt.length) this.state.emit('shop:bought', { id: 'mall', price: 0, shop: 'Hikari Mall' });
  }

  use(itemId) {
    const item = ITEMS[itemId];
    if (!item?.boost || !(this.inventory[itemId] > 0)) return false;
    if (--this.inventory[itemId] <= 0) delete this.inventory[itemId];
    if (item.boost.run) this.boosts.run = Math.max(this.boosts.run, item.boost.run);
    if (item.boost.jump) this.boosts.jump = Math.max(this.boosts.jump, item.boost.jump);
    this._applyBoosts();
    const what = [item.boost.run && 'run faster', item.boost.jump && 'jump higher'].filter(Boolean).join(' and ');
    this.ui.toast(`${item.icon} ${item.name}`, `You ${what} for a while`);
    this.state.emit('shop:used', { id: itemId });
    return true;
  }

  /**
   * Try clothes on without owning them (walk-in boutique): `pending` maps
   * part → itemId; null returns to her own outfit.
   */
  previewOutfit(pending = null) {
    this._preview = pending;
    return this._applyOutfit();
  }

  /** Total price of a list of items (a basket). */
  priceOf(ids) { return ids.reduce((sum, id) => sum + (ITEMS[id]?.price || 0), 0); }

  /**
   * Pay for a basket at a walk-in shop's register. All or nothing: returns
   * { ok, reason }. Kept items already owned are skipped (not charged).
   */
  buyMany(ids, shopName) {
    const owned = (id) => this.owned.has(id) && !['drink', 'food'].includes(ITEMS[id]?.kind);
    const list = ids.filter((id) => ITEMS[id] && !owned(id));
    const total = this.priceOf(list);
    if ((this.state.coins || 0) < total) return { ok: false, reason: `Need ${total - (this.state.coins || 0)} more coins`, total };
    const prev = this.current;
    this.current = { name: shopName };
    for (const id of list) this.buy(id);
    this.current = prev;
    return { ok: true, total };
  }

  wear(itemId) {
    const item = ITEMS[itemId];
    if (!item || !WEARABLE.has(item.kind) || !this.owned.has(itemId)) return;
    this.outfit[item.kind] = itemId;
    this._applyOutfit();
    this.state.emit('shop:changed');
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const playing = this.state.phase === Phase.PLAYING;
    // Boost timers (only while playing).
    if (playing && (this.boosts.run > 0 || this.boosts.jump > 0)) {
      this.boosts.run = Math.max(0, this.boosts.run - dt);
      this.boosts.jump = Math.max(0, this.boosts.jump - dt);
      this._applyBoosts();
    }
    this._renderChips();

    // Nearest counter in reach.
    let best = null, bd = REACH;
    const p = this.player.position;
    if (playing && !this.vehicles.driving && !this.player.climb && !this.open && !this.interiors?.inside) {
      for (const s of this.spots) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < bd && Math.abs(p.y - (s.y || 0)) < 1.6) { bd = d; best = s; }
      }
    }
    this.current = best;
    // A showroom vehicle still locked: point her to the dealer.
    this.lockedNear = null;
    if (playing && !best && !this.vehicles.driving && !this.open) {
      for (const v of this.vehicles.vehicles) {
        if (v.locked && Math.hypot(p.x - v.x, p.z - v.z) < (v.isBike ? 1.6 : 2.4)) { this.lockedNear = v; break; }
      }
    }
    const missionBusy = this.missions.dialogOpen || !!this.missions.view?._prompt;
    const label = missionBusy ? null
      : best ? (best.def.kind === 'vending' ? 'Buy a drink' : `${this.interiors?.hasInterior(best) ? 'Enter' : 'Shop'} · ${best.name}`)
        : this.lockedNear ? 'For sale · see Hikari Motors' : null;
    if (label !== this._label) {
      this._label = label;
      this.prompt.classList.toggle('hidden', !label);
      if (label) this.prompt.querySelector('.mission-action-label').textContent = label;
    }
  }

  // ------------------------------------------------------------ internals
  _events() {
    const { state } = this;
    state.on('game:reset', () => { this.close(); this.reset(); });
    state.on('phase', ({ phase }) => { if (phase !== Phase.PLAYING) this.close(); });
    // Exploring pays too.
    state.on('fragment:collected', () => this._earn(REWARDS.fragment, 'Energy fragment'));
    state.on('district:discovered', ({ name }) => this._earn(REWARDS.district, `Discovered ${name}`));
    addEventListener('keydown', (e) => {
      if (this.open) {
        if (e.code === 'Escape') { e.preventDefault(); this.close(); }
        return;
      }
      if (e.code !== 'KeyF' || e.repeat || !this._label) return;
      if (this.vehicles.candidate) return;   // F gets her into the car first
      e.stopImmediatePropagation();
      e.preventDefault();
      this._interact();
    }, { capture: true });
  }

  _interact() {
    if (this.current && this.interiors?.hasInterior(this.current)) this.interiors.enter(this.current);
    else if (this.current) this.show(this.current);
    else if (this.lockedNear) {
      const motors = this.spots.find((s) => s.shop === 'motors');
      if (this.interiors?.hasInterior(motors)) this.interiors.enter(motors); else this.show(motors);
    }
  }

  _earn(n, why) {
    this.state.coins = (this.state.coins || 0) + n;
    this.missions.publish?.();
    this.coinPop.textContent = `+${n} ◈  ${why}`;
    this.coinPop.classList.remove('show');
    void this.coinPop.offsetWidth;
    this.coinPop.classList.add('show');
  }

  _applyBoosts() {
    this.player.runBoost = this.boosts.run > 0 ? RUN_BOOST : 1;
    this.player.jumpBoost = this.boosts.jump > 0 ? JUMP_BOOST : 1;
  }

  _syncLocks() {
    for (const v of this.vehicles.vehicles) {
      if (!v.showroom) continue;
      const keys = Object.entries(ITEMS).find(([, it]) => it.vehicle === v.showroom)?.[0];
      v.locked = !(keys && this.owned?.has(keys));
    }
  }

  /**
   * Dress her for the current outfit (plus any try-on): each part's garment
   * (a city boutique item has none: her own tee / shorts / sneakers) in the
   * item's colour, and her hair's dye. Re-toned textures are made
   * off-thread; changes apply in order.
   */
  _applyOutfit() {
    const outfit = { ...this.outfit, ...(this._preview || {}) };
    const c = this.character;
    this._outfitJob = this._outfitJob.then(() => Promise.all([
      ...GARMENT_PARTS.map((part) => {
        const item = ITEMS[outfit[part]];
        return c.setGarment(part, item?.garment || null, item?.color || null);
      }),
      c.setHairColor(ITEMS[outfit.hair]?.color || null),
    ])).catch((err) => console.warn('outfit', err));
    return this._outfitJob;
  }

  // ------------------------------------------------------------ DOM
  _buildDom() {
    this.root.insertAdjacentHTML('beforeend', `
      <button class="mission-action shop-action hidden" type="button"><kbd class="only-mouse">F</kbd><span class="mission-action-icon" aria-hidden="true">◈</span><span class="mission-action-label"></span></button>
      <div class="boost-chips"></div>
      <div class="coin-pop"></div>
      <div class="sheet shop-sheet hidden" role="dialog" aria-modal="true" aria-labelledby="shop-title"><div class="sheet-card"><button class="sheet-x" aria-label="Close">×</button><h2 id="shop-title"></h2><div class="sheet-body"></div></div></div>`);
    this.prompt = this.root.querySelector('.shop-action');
    this.chips = this.root.querySelector('.boost-chips');
    this.coinPop = this.root.querySelector('.coin-pop');
    this.sheet = this.root.querySelector('.shop-sheet');
    this.title = this.sheet.querySelector('h2');
    this.body = this.sheet.querySelector('.sheet-body');
    this.prompt.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.prompt.addEventListener('click', (e) => { e.stopPropagation(); this._interact(); });
    this.sheet.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.sheet.addEventListener('click', (e) => { if (e.target === this.sheet || e.target.closest('.sheet-x')) this.close(); });
  }

  show(spot) {
    if (!spot) return;
    this.open = true;
    this._spot = spot;
    this.state.emit('shop:open', { shop: spot.shop, name: spot.name });
    this.input?.setVisible(false);
    if (document.pointerLockElement) document.exitPointerLock();
    this._renderShop();
    this.sheet.classList.remove('hidden');
    this.prompt.classList.add('hidden'); this._label = null;
  }

  /** Read a magazine / book from the Bag. */
  read(itemId) {
    const item = ITEMS[itemId];
    if (!item?.pages || !this.owned.has(itemId)) return;
    this.open = true;
    this._spot = null;
    this.input?.setVisible(false);
    if (document.pointerLockElement) document.exitPointerLock();
    this.title.textContent = `${item.icon} ${item.name}`;
    this.body.innerHTML = `<div class="reader">${item.pages.map((p) => `<p>${p}</p>`).join('')}</div>`;
    this.sheet.classList.remove('hidden');
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.sheet.classList.add('hidden');
    this.input?.setVisible(this.state.phase === Phase.PLAYING);
  }

  _renderShop() {
    const spot = this._spot, def = spot.def;
    const coins = this.state.coins || 0;
    this.title.textContent = spot.name;
    const row = (id) => {
      const it = ITEMS[id];
      const owned = this.owned.has(id);
      const have = this.inventory[id] || 0;
      let action;
      if (WEARABLE.has(it.kind) && owned) {
        action = this.outfit[it.kind] === id ? '<button class="pill on" disabled>Wearing</button>' : `<button class="pill" data-wear="${id}">Wear</button>`;
      } else if (it.kind === 'read' && owned) action = `<button class="pill" data-read="${id}">Read</button>`;
      else if (it.kind === 'vehicle' && owned) action = '<button class="pill on" disabled>Yours</button>';
      else {
        const r = canBuy(id, { coins, owned: [...this.owned] });
        action = `<button class="pill buy" data-buy="${id}" ${r.ok ? '' : 'disabled'} title="${r.ok ? '' : r.reason}">${it.price} ◈</button>`;
      }
      const use = have ? `<button class="pill use" data-use="${id}">Use · ${have}</button>` : '';
      const swatch = it.color ? `<i class="swatch" style="background:${it.color}"></i>` : '';
      return `<div class="shop-item"><span class="shop-ico">${it.icon}</span><div class="shop-txt"><b>${swatch}${it.name}</b><small>${it.text}</small></div><div class="shop-act">${use}${action}</div></div>`;
    };
    this.body.innerHTML = `
      <div class="shop-head"><span>${def.greet}</span><b>${coins} ◈</b></div>
      ${def.stock.map(row).join('')}
      <p class="muted">${def.kind === 'motors' ? 'Bought vehicles unlock on the lot outside.' : 'Drinks and food go to your Bag: use them any time.'} Earn coins from favors, fragments and new districts.</p>`;
    this.body.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      // Vending machines and stalls: the purchase is acted out in the street.
      const spot = this._spot;
      if (this.interiors && (spot?.machine || spot?.stall)) {
        const id = b.dataset.buy;
        const r = canBuy(id, { coins: this.state.coins || 0, owned: [...this.owned] });
        if (!r.ok) { this._renderShop(); return; }
        this.close();
        if (spot.machine) this.interiors.vend(spot, id); else this.interiors.stallBuy(spot, id);
        return;
      }
      const r = this.buy(b.dataset.buy);
      if (r.ok) {
        const it = ITEMS[b.dataset.buy];
        this.ui.toast(`${it.icon} ${it.name}`, it.kind === 'vehicle' ? 'Unlocked — it’s waiting on the lot' : WEARABLE.has(it.kind) ? 'Looking good!' : it.kind === 'read' ? 'Read it from your Bag' : 'In your Bag');
      }
      this._renderShop();
    }));
    this.body.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => { this.use(b.dataset.use); this._renderShop(); }));
    this.body.querySelectorAll('[data-wear]').forEach((b) => b.addEventListener('click', () => { this.wear(b.dataset.wear); this._renderShop(); }));
    this.body.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', () => this.read(b.dataset.read)));
  }

  /** Bag sections: items to use, reading, wardrobe and keys. */
  renderBag(el, rerender) {
    const ids = (pred) => Object.keys(ITEMS).filter((id) => pred(ITEMS[id], id));
    const items = ids((it, id) => this.inventory[id] > 0 && it.kind !== 'pantry');
    const pantry = ids((it, id) => this.inventory[id] > 0 && it.kind === 'pantry');
    const reading = ids((it, id) => it.kind === 'read' && this.owned.has(id));
    const wardrobe = ids((it, id) => WEARABLE.has(it.kind) && this.owned.has(id));
    const keys = ids((it, id) => it.kind === 'vehicle' && this.owned.has(id));
    const chip = (id, btn) => { const it = ITEMS[id]; return `<div class="bag-item"><span>${it.icon}</span><b>${it.color ? `<i class="swatch" style="background:${it.color}"></i>` : ''}${it.name}${this.inventory[id] > 1 ? ` ×${this.inventory[id]}` : ''}</b>${btn}</div>`; };
    el.insertAdjacentHTML('beforeend', `
      <div class="bag-section"><h3>Items</h3>${items.length ? items.map((id) => chip(id, `<button class="pill" data-use="${id}">${ITEMS[id].kind === 'drink' ? 'Drink' : 'Eat'}</button>`)).join('') : '<p class="muted">Buy drinks and snacks at shops and vending machines.</p>'}</div>
      ${pantry.length ? `<div class="bag-section"><h3>Pantry</h3>${pantry.map((id) => chip(id, '<span class="muted">From Hikari Mall</span>')).join('')}</div>` : ''}
      ${reading.length ? `<div class="bag-section"><h3>Reading</h3>${reading.map((id) => chip(id, `<button class="pill" data-read="${id}">Read</button>`)).join('')}</div>` : ''}
      <div class="bag-section"><h3>Wardrobe</h3>${wardrobe.map((id) => chip(id, this.outfit[ITEMS[id].kind] === id ? '<button class="pill on" disabled>Wearing</button>' : `<button class="pill" data-wear="${id}">Wear</button>`)).join('')}</div>
      ${keys.length ? `<div class="bag-section"><h3>Keys</h3>${keys.map((id) => chip(id, '<span class="muted">On the Hikari Motors lot</span>')).join('')}</div>` : ''}`);
    el.querySelectorAll('.bag-section [data-use]').forEach((b) => b.addEventListener('click', () => { this.use(b.dataset.use); rerender(); }));
    el.querySelectorAll('.bag-section [data-wear]').forEach((b) => b.addEventListener('click', () => { this.wear(b.dataset.wear); rerender(); }));
    el.querySelectorAll('.bag-section [data-read]').forEach((b) => b.addEventListener('click', () => { rerender.close?.(); this.read(b.dataset.read); }));
  }

  /** Minimap markers (the big map shows every shop by name). */
  markers() {
    return this.spots.filter((s) => s.shop !== 'vending').map((s) => ({ x: s.x, z: s.z, color: s.def.color, label: s.name }));
  }

  _renderChips() {
    const parts = [];
    const fmt = (s) => { const t = Math.ceil(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
    if (this.boosts.run > 0) parts.push(`<span>🏃 Faster ${fmt(this.boosts.run)}</span>`);
    if (this.boosts.jump > 0) parts.push(`<span>⤒ Higher jumps ${fmt(this.boosts.jump)}</span>`);
    const html = parts.join('');
    if (html !== this._chipsHtml) { this._chipsHtml = html; this.chips.innerHTML = html; }
  }
}
