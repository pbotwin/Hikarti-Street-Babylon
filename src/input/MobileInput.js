/**
 * Unified input: touch (virtual joystick, look-drag, jump button) on phones
 * and tablets, keyboard + pointer-locked mouse look in desktop browsers.
 * The active mode is mirrored to <html data-input="touch|mouse"> so CSS can
 * show the matching controls and hints; it follows whatever was used last.
 *
 * Consumers read:
 *   move  {x, y}  joystick vector, |v| <= 1 (y = forward)
 *   look  {x, y}  accumulated look delta in pixels since last consumeLook()
 *   jumpPressed   edge-triggered, cleared by consumeJump()
 */
const JOY_RADIUS = 62; // px — knob travel
const DEADZONE = 0.12;

export class MobileInput {
  constructor(root) {
    this.root = root;
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.jumpPressed = false;
    this.jumpHeld = false;
    // E drives vehicles; F is reserved for residents and side missions.
    this.interactPressed = false;
    // While driving, keys give full ±1 axes (no walk/run scaling).
    this.driving = false;
    this.enabled = false;
    this.lastLookTime = 0;

    this._joyId = null;
    this._lookId = null;
    this._lookLast = { x: 0, y: 0 };
    this._joyOrigin = { x: 0, y: 0 };
    this._keys = new Set();
    this._mouseDown = false;

    this._buildDom();
    this._bindTouch();
    this._bindMouse();
    this._bindKeyboard();
    this._setMode(matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse');
  }

  _setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    document.documentElement.dataset.input = mode;
    if (mode === 'touch') this.unlockPointer();
  }

  _buildDom() {
    const el = document.createElement('div');
    el.className = 'controls';
    el.innerHTML = `
      <div class="joy-zone"></div>
      <div class="look-zone"></div>
      <div class="joy-base"><div class="joy-ring"><i class="tick t"></i><i class="tick r"></i><i class="tick b"></i><i class="tick l"></i></div><div class="joy-knob"></div></div>
      <button class="run-btn" aria-label="Sprint">
        <svg viewBox="0 0 24 24"><circle cx="14.5" cy="4.2" r="2.2" fill="currentColor"/><path d="M10.2 8.2l3.6-.9c.7-.2 1.4.1 1.8.7l1.6 2.6 2.6.6-.4 1.7-3.3-.7-1-1.5-1.1 3.4 2.5 2.3-.9 5.1-1.8-.3.7-4.2-2.6-2.1-1.4 3.6-4.7 1.2-.5-1.7 3.8-1 2.4-6.6-1.5.4-1.4 2.6-1.6-.8z" fill="currentColor"/></svg>
      </button>
      <button class="jump-btn" aria-label="Jump">
        <svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 5l-6 7h4v6h4v-6h4z" fill="currentColor"/></svg>
      </button>
      <button class="act-btn hidden" aria-label="Get in"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 11l1.6-4.4A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.6L19 11a2 2 0 0 1 1 1.7V17a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0h-4a2 2 0 0 1-4 0H5a1 1 0 0 1-1-1v-4.3A2 2 0 0 1 5 11zm2.1 0h9.8l-1.2-3.4a.5.5 0 0 0-.5-.3h-6.4a.5.5 0 0 0-.5.3z"/></svg><span></span></button>
      <div class="act-hint only-mouse hidden"><kbd>E</kbd> <span></span></div>
      <div class="lock-hint only-mouse">Click to look around with the mouse</div>
      <div class="key-legend only-mouse">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
        <span><kbd>Shift</kbd> run</span>
        <span><kbd>Space</kbd> jump · climb</span>
        <span><kbd>M</kbd> map</span>
        <span><kbd>F</kbd> talk</span>
        <span><kbd>Q</kbd> quests</span>
        <span><kbd>Esc</kbd> free cursor</span>
      </div>
      <div class="key-legend drive-legend only-mouse">
        <span><kbd>W</kbd><kbd>S</kbd> throttle · brake</span>
        <span><kbd>A</kbd><kbd>D</kbd> steer</span>
        <span><kbd>Space</kbd> handbrake</span>
        <span><kbd>E</kbd> get out</span>
      </div>`;
    this.root.appendChild(el);
    this.dom = el;
    this.joyZone = el.querySelector('.joy-zone');
    this.lookZone = el.querySelector('.look-zone');
    this.joyBase = el.querySelector('.joy-base');
    this.joyKnob = el.querySelector('.joy-knob');
    this.jumpBtn = el.querySelector('.jump-btn');
    this.runBtn = el.querySelector('.run-btn');
    this.actBtn = el.querySelector('.act-btn');
    this.actHint = el.querySelector('.act-hint');
    this.actBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.enabled) this.interactPressed = true;
    });
    this.runLock = false;
    this.runBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.runLock = !this.runLock;
      this.runBtn.classList.toggle('on', this.runLock);
    });
    this._placeBaseHome();
    addEventListener('resize', () => this._joyId === null && this._placeBaseHome());
  }

  _placeBaseHome() {
    const css = getComputedStyle(document.documentElement);
    const safeBottom = parseFloat(css.getPropertyValue('--sab')) || 0;
    const safeLeft = parseFloat(css.getPropertyValue('--sal')) || 0;
    // Short landscape screens: sit the stick lower so it clears the HUD.
    this._home = { x: 96 + safeLeft, y: innerHeight - Math.min(150, innerHeight * 0.32) - safeBottom };
    this._setBase(this._home.x, this._home.y);
    this._setKnob(0, 0);
  }

  _setBase(x, y) {
    this._joyOrigin.x = x; this._joyOrigin.y = y;
    this.joyBase.style.transform = `translate(${x}px, ${y}px)`;
  }

  _setKnob(dx, dy) {
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  _bindTouch() {
    const opts = { passive: false };

    // Joystick: floating — the base jumps to where the thumb lands, which is
    // far more comfortable on phones of different sizes.
    this.joyZone.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this._joyId !== null) return;
      e.preventDefault();
      this._joyId = e.pointerId;
      capture(this.joyZone, e.pointerId);
      this._setBase(e.clientX, e.clientY);
      this.joyBase.classList.add('active');
      this._updateJoy(e.clientX, e.clientY);
    }, opts);
    this.joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._joyId) return;
      e.preventDefault();
      this._updateJoy(e.clientX, e.clientY);
    }, opts);
    const endJoy = (e) => {
      if (e.pointerId !== this._joyId) return;
      this._joyId = null;
      this.move.x = this.move.y = 0;
      this.joyBase.classList.remove('active', 'run');
      this._placeBaseHome();
    };
    this.joyZone.addEventListener('pointerup', endJoy);
    this.joyZone.addEventListener('pointercancel', endJoy);

    // Look: drag anywhere on the right side (mouse: any drag on canvas area).
    this.lookZone.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this._lookId !== null) return;
      e.preventDefault();
      this._lookId = e.pointerId;
      capture(this.lookZone, e.pointerId);
      this._lookLast.x = e.clientX; this._lookLast.y = e.clientY;
    }, opts);
    this.lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._lookId || this.pointerLocked) return;
      e.preventDefault();
      this.look.x += e.clientX - this._lookLast.x;
      this.look.y += e.clientY - this._lookLast.y;
      this._lookLast.x = e.clientX; this._lookLast.y = e.clientY;
      this.lastLookTime = performance.now();
    }, opts);
    const endLook = (e) => { if (e.pointerId === this._lookId) this._lookId = null; };
    this.lookZone.addEventListener('pointerup', endLook);
    this.lookZone.addEventListener('pointercancel', endLook);

    this.jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled) return;
      this.jumpPressed = true;
      this.jumpHeld = true;
      this.jumpBtn.classList.add('pressed');
      navigator.vibrate?.(8);
    }, opts);
    const up = () => { this.jumpHeld = false; this.jumpBtn.classList.remove('pressed'); };
    this.jumpBtn.addEventListener('pointerup', up);
    this.jumpBtn.addEventListener('pointercancel', up);
    this.jumpBtn.addEventListener('pointerleave', up);

    // Stop iOS rubber-banding / double-tap zoom on the game surface.
    document.addEventListener('touchmove', (e) => {
      if (e.target.closest?.('.sheet-card, .mission-dialog')) return;
      e.preventDefault();
    }, opts);
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  /** Desktop: click the view to lock the pointer, then the mouse looks around. */
  _bindMouse() {
    // Whatever the player last touched decides which controls are shown.
    addEventListener('pointerdown', (e) => this._setMode(e.pointerType === 'mouse' ? 'mouse' : 'touch'), { capture: true });
    this.lookZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || !this.enabled || this.pointerLocked) return;
      try { this.lookZone.requestPointerLock?.()?.catch?.(() => {}); } catch { /* unsupported: drag to look */ }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.enabled) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
      this.lastLookTime = performance.now();
    });
    document.addEventListener('pointerlockchange', () => this.dom.classList.toggle('locked', this.pointerLocked));
  }

  get pointerLocked() { return document.pointerLockElement === this.lookZone; }

  unlockPointer() { if (this.pointerLocked) document.exitPointerLock?.(); }

  _updateJoy(x, y) {
    let dx = x - this._joyOrigin.x;
    let dy = y - this._joyOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
    this._setKnob(dx, dy);
    let mx = dx / JOY_RADIUS, my = -dy / JOY_RADIUS;
    const m = Math.hypot(mx, my);
    if (m < DEADZONE) { mx = my = 0; }
    else {
      // Rescale past the deadzone so small pushes still give fine control.
      const s = (m - DEADZONE) / (1 - DEADZONE) / m;
      mx *= s; my *= s;
    }
    this.move.x = mx; this.move.y = my;
    this.joyBase.classList.toggle('run', Math.hypot(mx, my) > 0.85);
  }

  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (!e.repeat && /^(Key[WASD]|Arrow|Space|Shift)/.test(e.code)) this._setMode('mouse');
      this._keys.add(e.code);
      if (e.code === 'Space' && this.enabled && !e.repeat) { this.jumpPressed = true; this.jumpHeld = true; }
      if (e.code === 'KeyE' && this.enabled && !e.repeat) this.interactPressed = true;
    });
    addEventListener('keyup', (e) => { this._keys.delete(e.code); if (e.code === 'Space') this.jumpHeld = false; });
    addEventListener('blur', () => this._keys.clear());
  }

  /** Called once per frame before gameplay reads input. */
  update() {
    if (!this.enabled) { this.move.x = this.move.y = 0; return; }
    if (this._joyId !== null) return;
    const k = this._keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    // Keyboard: walk by default, run with Shift (mirrors full joystick push).
    // Driving: independent full axes (throttle and steering at once).
    const mag = this.driving ? 1 : len ? ((k.has('ShiftLeft') || k.has('ShiftRight')) ? 1 : 0.6) / len : 0;
    this.move.x = x * mag; this.move.y = y * mag;
  }

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    return l;
  }

  consumeInteract() {
    const i = this.interactPressed;
    this.interactPressed = false;
    return i;
  }

  /** Context action (e.g. "Drive", "Ride", "Get out"); null hides it. */
  setAction(label) {
    if (label === this._action) return;
    this._action = label;
    this.actBtn.classList.toggle('hidden', !label);
    this.actHint.classList.toggle('hidden', !label);
    if (label) {
      this.actBtn.querySelector('span').textContent = label;
      this.actHint.querySelector('span').textContent = label;
    }
  }

  setDriving(on) {
    this.driving = on;
    this.dom.classList.toggle('driving', on);
  }

  consumeJump() {
    const j = this.jumpPressed;
    this.jumpPressed = false;
    return j;
  }

  setVisible(v) {
    this.dom.classList.toggle('hidden', !v);
    this.enabled = v;
    if (!v) {
      this.move.x = this.move.y = this.look.x = this.look.y = 0;
      this.jumpPressed = this.jumpHeld = this.interactPressed = false;
      this._keys.clear();
      this._joyId = this._lookId = null;
      this.joyBase.classList.remove('active', 'run');
      this.jumpBtn.classList.remove('pressed');
      this._placeBaseHome();
      this.unlockPointer();
    }
  }
}

/**
 * Keep a drag's events on `el` even when the finger leaves it. Best effort: a
 * touch that has already ended makes setPointerCapture throw, which left the
 * stick (or look drag) holding that touch, ignoring every later one.
 */
function capture(el, pointerId) {
  try { el.setPointerCapture(pointerId); } catch { /* touch already over */ }
}
