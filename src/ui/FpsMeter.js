/**
 * Frames-per-second readout in the top-left corner. Counts frames and only
 * writes to the DOM twice a second, so it costs nothing per frame. Green at
 * 55+ fps, amber at 30+, red below.
 *
 * Tap it for diagnostics: frame time (average / worst), the game's own CPU
 * time per frame (when it is far below the frame time, the GPU is the limit),
 * draw calls, triangles, preset, render size and GPU. A screenshot of it
 * tells a developer what a phone is actually doing.
 */
export class FpsMeter {
  /** @param {() => object} stats extra figures for the diagnostics view (see main.js) */
  constructor(root, stats) {
    this.stats = stats;
    this.el = document.createElement('div');
    this.el.className = 'fps';
    // Its own tap: never start a look / move gesture underneath.
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.el.classList.toggle('open');
      this._render();
    });
    root.appendChild(this.el);
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
    this.cpu = 0;
  }

  /** Once per rendered frame: real frame time (s) and the game's CPU time for it (ms). */
  update(rawDt, cpuMs) {
    this.frames++;
    this.time += rawDt;
    this.worst = Math.max(this.worst, rawDt);
    this.cpu += cpuMs;
    if (this.time < 0.5) return;
    this._render();
    this.frames = 0;
    this.time = 0;
    this.worst = 0;
    this.cpu = 0;
  }

  _render() {
    if (!this.frames) return;
    const fps = Math.round(this.frames / this.time);
    this.el.dataset.level = fps >= 55 ? 'good' : fps >= 30 ? 'ok' : 'low';
    if (!this.el.classList.contains('open')) { this.el.textContent = `${fps} FPS`; return; }
    const s = this.stats();
    const ms = (v) => v.toFixed(1);
    this.el.textContent = [
      `${fps} FPS · frame ${ms(this.time / this.frames * 1000)} ms (worst ${ms(this.worst * 1000)})`,
      `CPU ${ms(this.cpu / this.frames)} ms · ${s.calls} draws · ${(s.triangles / 1e6).toFixed(2)}M tris`,
      `${s.preset} · ${s.width}×${s.height} (×${s.dpr.toFixed(2)}) · shadows ${s.shadowSize}`,
      s.adaptive,
      s.gpu,
    ].join('\n');
  }
}
