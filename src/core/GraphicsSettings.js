/**
 * Graphics presets with device detection: the Settings-level manager. The
 * Babylon renderer itself is core/Graphics.js, driven through apply(tier).
 *
 * "Recommended" (the default) picks a preset from the GPU, platform and
 * memory, then keeps an eye on frame times while playing: if the game stays
 * slow it steps down one preset for the rest of the session. Players
 * can also pick a preset in Settings; that choice is saved.
 *
 * Every preset keeps the anime look (cel shading, ink outlines, shadows);
 * lower ones trade resolution, shadow softness, ambient occlusion, bloom,
 * shadows of heavy decoration and how far away residents are drawn.
 *
 * Residents' outline shells (a second draw of every mesh) are drawn only
 * close up (npcOutlines, metres). Shells everywhere cost ~6 ms a frame on a
 * phone CPU.
 */
export const PRESETS = {
  low: {
    label: 'Low', dpr: 1, pixels: 1.1e6, shadowSize: 1024, softShadows: false,
    rays: 0, bloom: false, npcDistance: 38, npcOutlines: 0, detailShadows: false,
  },
  medium: {
    label: 'Medium', dpr: 1.5, pixels: 2.2e6, shadowSize: 2048, softShadows: false,
    rays: 10, bloom: true, npcDistance: 50, npcOutlines: 0, detailShadows: false,
  },
  high: {
    label: 'High', dpr: 2, pixels: 3.7e6, shadowSize: 2048, softShadows: true,
    rays: 20, bloom: true, npcDistance: 66, npcOutlines: 10, detailShadows: true,
  },
  ultra: {
    label: 'Ultra', dpr: 2.5, pixels: 8.3e6, shadowSize: 4096, softShadows: true,
    rays: 20, bloom: true, npcDistance: 90, npcOutlines: 30, detailShadows: true,
  },
};
export const TIERS = ['low', 'medium', 'high', 'ultra'];

const KEY_MODE = 'hikari.graphics';          // 'auto' | tier name

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/** GPU name as reported by the browser (unmasked when allowed). */
function gpuName(engine) {
  try {
    const gl = engine._gl;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return String(engine.getGlInfo().renderer || '');
  } catch { return ''; }
}

/** Best preset for this device, from what the browser tells us. */
export function detectTier(engine) {
  const gpu = gpuName(engine).toLowerCase();
  const ua = navigator.userAgent || '';
  const mobile = /android|iphone|ipad|ipod|mobile/i.test(ua)
    || (navigator.maxTouchPoints > 1 && /mac/i.test(navigator.platform || ''));   // iPadOS
  const mem = navigator.deviceMemory || 0;      // Chrome only, capped at 8
  const cores = navigator.hardwareConcurrency || 4;
  const num = (re) => +(gpu.match(re)?.[1] || 0);

  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/.test(gpu)) return 'low';

  if (mobile) {
    if (/apple/.test(gpu) || /iphone|ipad/i.test(ua)) return cores >= 6 ? 'high' : 'medium';
    if (/adreno/.test(gpu)) {
      const n = num(/adreno[^\d]*(\d{3})/);
      return n >= 730 ? 'high' : n >= 640 ? 'medium' : 'low';
    }
    if (/immortalis/.test(gpu)) return 'high';
    if (/mali/.test(gpu)) {
      const n = num(/mali-g(\d+)/);
      return n >= 710 ? 'medium' : n >= 76 && n < 100 ? 'medium' : 'low';
    }
    if (/xclipse/.test(gpu)) return 'medium';
    return mem >= 6 ? 'medium' : 'low';
  }

  // Desktop / laptop.
  if (/rtx\s*[3-9]0[6-9]0|rtx\s*[4-9]0\d0|rtx\s*a[4-9]|radeon rx\s*[6-9][7-9]\d{2}|apple m\d (pro|max|ultra)/.test(gpu)) return 'ultra';
  if (/rtx|gtx\s*1(07|08)0|gtx\s*16[6-9]0|radeon rx\s*[5-9]\d{3}|radeon pro|arc|apple m\d|apple gpu/.test(gpu)) return 'high';
  if (/gtx|geforce|quadro|radeon rx|radeon (r9|r7|hd [7-9])/.test(gpu)) return 'medium';
  if (/iris|radeon\(tm\) graphics|radeon graphics|vega|780m|680m/.test(gpu)) return 'medium';
  if (/intel/.test(gpu)) return mem && mem < 8 ? 'low' : 'medium';
  return 'medium';
}

export class GraphicsSettings {
  constructor({ gfx, lighting, npcs }) {
    Object.assign(this, { gfx, lighting, npcs });
    this.gpu = gpuName(gfx.engine);
    this.detected = detectTier(gfx.engine);
    // A lower preset chosen in a slow session lasts that session only: kept
    // for good, one hot spell left a phone on worse graphics forever.
    this.recommended = this.detected;
    const forced = new URLSearchParams(location.search).get('gfx');
    const saved = store.get(KEY_MODE);
    this.mode = TIERS.includes(forced) ? forced : (TIERS.includes(saved) ? saved : 'auto');
    this._listeners = new Set();
    this._resetWatch();
    this.apply();
  }

  /** The preset in use right now. */
  get tier() { return this.mode === 'auto' ? this.recommended : this.mode; }
  get preset() { return PRESETS[this.tier]; }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  /** 'auto' or a tier name (from the Settings menu). */
  setMode(mode) {
    if (mode !== 'auto' && !TIERS.includes(mode)) return;
    this.mode = mode;
    store.set(KEY_MODE, mode);
    this._resetWatch();
    this.apply();
  }

  apply() {
    const p = this.preset;
    // Renderer: resolution, shadows and post effects (rebuilt only when the tier changes).
    this.gfx.apply(this.tier);
    if (this.npcs) { this.npcs.viewDistance = p.npcDistance; this.npcs.outlineDistance = p.npcOutlines; }
    for (const fn of this._listeners) fn(this);
  }

  _resetWatch() {
    this._watch = { t: 0, frames: 0, slow: 0, settle: 6 };
  }

  /**
   * Called every frame with the real frame time. In Recommended mode, if the
   * game runs below ~45 fps for several seconds in a row, step down a preset
   * (for this session only).
   */
  update(rawDt, playing, slowMs = 22) {
    if (this.mode !== 'auto' || !playing || document.hidden) return;
    const w = this._watch;
    if (rawDt > 0.25) return;                    // tab switch, loading hitch
    if (w.settle > 0) { w.settle -= rawDt; return; }
    w.t += rawDt; w.frames++;
    if (w.t < 3) return;
    const avgMs = (w.t / w.frames) * 1000;
    w.slow = avgMs > slowMs ? w.slow + 1 : 0;
    w.t = 0; w.frames = 0;
    const i = TIERS.indexOf(this.recommended);
    if (w.slow >= 2 && i > 0) {
      this.recommended = TIERS[i - 1];
      console.info(`[graphics] running slow (${avgMs.toFixed(1)} ms/frame), switching to ${this.recommended}`);
      this._resetWatch();
      this.apply();
    }
  }
}
