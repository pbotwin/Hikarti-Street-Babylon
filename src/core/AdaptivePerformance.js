import { watchNativeThermal } from './NativeThermal.js';

/**
 * Adaptive performance: a steady frame rate on a phone that stays cool.
 *
 * Browsers expose no temperature or thermal API, but heat shows in timing:
 * a throttling phone takes longer for the same frame. So, like the adaptive
 * performance of native games:
 *  - Frame-rate mode (Settings): Battery saver 30, Balanced 60, Max (the
 *    screen's own rate). Frames beyond the target are skipped, so the
 *    processors rest between frames: the largest single saving in heat.
 *  - A governor holds that rate, and first works out *what* is too slow from
 *    the game's own CPU time per frame:
 *      GPU-bound (CPU time well under the frame): render resolution, then
 *      light rays;
 *      CPU-bound: shadows at 30 Hz, then fewer distant residents, then a
 *      steadier, lower frame rate (60 → 40 on a 120 Hz screen, then 30),
 *      which gives the CPU real rest. Resolution is never lowered for a busy
 *      CPU: that only cost looks, and the phone stayed just as slow and hot.
 *    After lasting headroom it steps back up, waiting longer after each
 *    step-up that failed, so it settles instead of oscillating.
 *  - Early warnings: the phone's real thermal state in the Android app
 *    (NativeThermal), else Chrome's Compute Pressure API where available.
 *  - Only with every step used does the Recommended preset drop (Graphics),
 *    and only for the session.
 */
export const FPS_MODES = {
  saver: { label: 'Battery saver', fps: 30 },
  balanced: { label: 'Balanced', fps: 60 },
  max: { label: 'Max', fps: Infinity },
};

// Steps, cheapest-looking first.
const GPU_STEPS = [
  { scale: 1, rays: true },
  { scale: 0.85, rays: true },
  { scale: 0.72, rays: true },
  { scale: 0.72, rays: false },
  { scale: 0.6, rays: false },
];
const CPU_STEPS = [
  { shadowMs: 15, residents: 1, slower: 1 },      // shadowMs 15 ≈ every frame at 60 fps
  { shadowMs: 31, residents: 1, slower: 1 },      // shadows at 30 Hz
  { shadowMs: 31, residents: 0.7, slower: 1 },    // residents drawn 30% nearer
  { shadowMs: 31, residents: 0.7, slower: 1.5 },  // frame target × 1.5: 60 → 40 fps (120 Hz), → 30 (60 Hz)
  { shadowMs: 31, residents: 0.7, slower: 2 },    // × 2: 60 → 30 fps
];

const WINDOW = 2;          // s of frames judged together
const LATE = 1.2;          // a window is late when its average frame exceeds the target by this factor
const CPU_BOUND = 0.7;     // ...and CPU-bound when the game's CPU time is at least this share of the target
const DOWN_AFTER = 2;      // late windows in a row before stepping down
const UP_WAIT = 12;        // s of headroom before trying a step up; doubles after each failed try
const UP_WAIT_MAX = 120;
const KEY = 'hikari.fps';

export class AdaptivePerformance {
  constructor(gfx, { npcs = null, enabled = true } = {}) {
    this.gfx = gfx;
    this.npcs = npcs;
    this.enabled = enabled;
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* private mode */ }
    this.mode = FPS_MODES[saved] ? saved : 'balanced';
    this.gpu = 0;
    this.cpu = 0;
    this._last = null;              // 'gpu' | 'cpu': the kind of step taken last
    this.refreshMs = 1000 / 60;     // the screen's refresh interval, learned from animation ticks
    this._lastRender = -Infinity;
    this._lastTick = -Infinity;
    this._skipped = false;
    this._bound = null;             // what the last late frames were bound by
    this._ticks = [];
    this._win = { t: 0, n: 0, cpu: 0 };
    this._late = 0;
    this._good = 0;
    this._upWait = UP_WAIT;
    this._sinceUp = Infinity;
    this.pressure = 'nominal';
    this._watchPressure();
  }

  /** Frame time the game aims for (ms): the mode's rate, never faster than the screen. */
  get targetMs() {
    return Math.max(1000 / FPS_MODES[this.mode].fps, this.refreshMs) * CPU_STEPS[this.cpu].slower;
  }

  /** True when the governor has nothing left to lower (Graphics may drop the preset then). */
  get exhausted() {
    const cpuDone = this.cpu === CPU_STEPS.length - 1;
    return !this.enabled || (cpuDone && (this._bound === 'cpu' || this.gpu === GPU_STEPS.length - 1));
  }

  setMode(mode) {
    if (!FPS_MODES[mode]) return;
    this.mode = mode;
    try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
    this._late = this._good = 0;
  }

  /**
   * Call at the top of each animation frame: false means skip this one (too
   * soon for the target rate). Rendered frames land on whole screen
   * refreshes, so the rate stays even (60 on a 120 Hz screen = every other).
   */
  shouldRender(now) {
    if (!this.enabled) return true;
    // The gap after a skipped tick is pure screen refresh (no game work in
    // between); its median is the refresh interval. Gaps after rendered
    // frames stretch when the game is slow, and would pass for a slow screen.
    if (this._skipped) {
      const tick = now - this._lastTick;
      if (tick > 3 && tick < 60 && this._ticks.length < 1000) this._ticks.push(tick);
    }
    this._lastTick = now;
    const step = Math.max(1, Math.round(this.targetMs / this.refreshMs)) * this.refreshMs;
    this._skipped = now - this._lastRender < step - this.refreshMs * 0.5;
    if (this._skipped) return false;
    this._lastRender = now;
    return true;
  }

  /** After each rendered frame: real time since the previous one (s), the game's CPU time for it (ms). */
  update(rawDt, cpuMs) {
    if (!this.enabled || document.hidden || rawDt > 0.25) return;   // tab switch, load hitch
    const w = this._win;
    w.t += rawDt; w.n++; w.cpu += cpuMs;
    this._sinceUp += rawDt;
    if (w.t < WINDOW) return;
    if (this._ticks.length >= 10) this.refreshMs = this._ticks.sort((a, b) => a - b)[this._ticks.length >> 1];
    this._ticks.length = 0;
    const target = this.targetMs;
    const frame = (w.t / w.n) * 1000, cpu = w.cpu / w.n;
    this._win = { t: 0, n: 0, cpu: 0 };
    const hot = this.pressure === 'serious' || this.pressure === 'critical';
    if (frame > target * LATE || hot) {
      this._good = 0;
      if (++this._late >= DOWN_AFTER || this.pressure === 'critical') {
        // Heat or a busy CPU: CPU steps; a GPU that can't keep up: GPU steps.
        this._down(cpu >= target * CPU_BOUND || hot ? 'cpu' : 'gpu');
      }
    } else {
      this._late = 0;
      this._good += WINDOW;
      if (this._good >= this._upWait) this._up();
    }
  }

  _down(kind) {
    const max = { gpu: GPU_STEPS.length - 1, cpu: CPU_STEPS.length - 1 };
    this._bound = kind;
    this._late = this._good = 0;
    // A slow GPU with its steps used up: a lower frame rate (CPU steps) helps
    // it too. A busy CPU never falls back to GPU steps (see above).
    if (kind === 'gpu' && this.gpu === max.gpu) kind = 'cpu';
    if (this[kind] === max[kind]) return;
    // The last step up couldn't hold: wait longer before trying again.
    if (this._sinceUp < 3 * WINDOW + 1) this._upWait = Math.min(UP_WAIT_MAX, this._upWait * 2);
    this[kind]++;
    this._last = kind;
    this.apply();
  }

  _up() {
    this._late = this._good = 0;
    // Undo the most recent kind of step first.
    const kind = this._last && this[this._last] > 0 ? this._last : this.gpu > 0 ? 'gpu' : this.cpu > 0 ? 'cpu' : null;
    if (!kind) return;
    this[kind]--;
    this._sinceUp = 0;
    this.apply();
  }

  /** Push the current steps to the renderer and residents (also after a preset change). */
  apply() {
    const g = GPU_STEPS[this.enabled ? this.gpu : 0], c = CPU_STEPS[this.enabled ? this.cpu : 0];
    this.gfx.setQuality(g.scale);
    this.gfx.raysAllowed = g.rays;
    this.gfx.shadowInterval = c.shadowMs;
    if (this.npcs) this.npcs.distanceScale = c.residents;
  }

  /** Short description for the diagnostics readout. */
  describe() {
    const g = GPU_STEPS[this.gpu], c = CPU_STEPS[this.cpu];
    const fps = Math.round(1000 / (Math.max(1, Math.round(this.targetMs / this.refreshMs)) * this.refreshMs));
    const parts = [`res ${Math.round(g.scale * 100)}%`];
    if (!g.rays) parts.push('no rays');
    if (c.shadowMs > 20) parts.push('shadows 30 Hz');
    if (c.residents < 1) parts.push('residents nearer');
    const heat = this.thermal ? ` · thermal ${this.thermal.status ?? '-'}/${this.thermal.headroom?.toFixed(2) ?? '-'}` : '';
    return `${FPS_MODES[this.mode].label} → ${fps} fps · GPU ${this.gpu} CPU ${this.cpu} (${parts.join(', ')})${this.pressure !== 'nominal' ? ` · ${this.pressure}` : ''}${heat}`;
  }

  _watchPressure() {
    // The Android app reports the real thermal state; browsers may report CPU pressure.
    if (watchNativeThermal((state, raw) => { this.pressure = state; this.thermal = raw; })) return;
    if (typeof PressureObserver === 'undefined') return;
    try {
      const observer = new PressureObserver((records) => { this.pressure = records[records.length - 1].state; });
      observer.observe('cpu', { sampleInterval: 2000 }).catch(() => {});
    } catch { /* not allowed here */ }
  }
}
