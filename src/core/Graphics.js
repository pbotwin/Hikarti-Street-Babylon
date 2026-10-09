import {
  Vector3, Color3, Color4, DirectionalLight, HemisphericLight, ShadowGenerator,
  DefaultRenderingPipeline, ReflectionProbe, ImageProcessingConfiguration, ColorCurves,
  Constants, RenderTargetTexture,
} from '@babylonjs/core';
import { HDRFiltering } from '@babylonjs/core/Materials/Textures/Filtering/hdrFiltering.js';
import { Sky } from '../world/Sky.js';
import { InkRays } from './InkRays.js';
import { ToonPlugin } from '../player/Vrm.js';

/**
 * Everything about how the city looks, using what Babylon ships with:
 *  - the original's painted golden-hour sky and fog (world/Sky.js)
 *  - image-based lighting captured from that sky, so PBR surfaces are lit
 *    by the real sky colour (ReflectionProbe → environmentTexture)
 *  - a warm low sun with the original's shadow map: one ±22 m square that
 *    follows her, snapped to texels, holding only the casters inside it
 *  - the original's ink outlines and light rays (InkRays), then HDR post:
 *    MSAA, bloom, ACES tone mapping, contrast, vignette, sharpen
 * Presets scale shadow resolution, MSAA, post effects and render scale; a
 * switch changes them in place (see apply).
 */
// The original's shadow square (half size, m) and how far behind it the light sits.
const SHADOW_EXTENT = 22;
const SHADOW_BACK = 70;
const SHADOW_NEAR = 1, SHADOW_FAR = 140;    // the shadow camera's depth range (m from the light)

export const PRESETS = {
  // dpr / pixels: the original's render resolution, the device ratio capped
  // by both (a fixed 1.5 cap rendered 3x phones at half their resolution).
  low: { label: 'Low', dpr: 1, pixels: 1.1e6, shadow: 1024, msaa: 1, fxaa: true, bloom: false, rays: 0 },
  medium: { label: 'Medium', dpr: 1.5, pixels: 2.2e6, shadow: 2048, msaa: 2, fxaa: false, bloom: true, rays: 10 },
  high: { label: 'High', dpr: 2, pixels: 3.7e6, shadow: 2048, msaa: 4, fxaa: false, bloom: true, rays: 20 },
  ultra: { label: 'Ultra', dpr: 2.5, pixels: 8.3e6, shadow: 4096, msaa: 4, fxaa: false, bloom: true, rays: 20 },
};

/** Preset for this device from the GPU name, platform and memory. */
export function detectTier(engine) {
  const gpu = String(engine.getGlInfo?.().renderer || '').toLowerCase();
  const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent);
  if (/swiftshader|llvmpipe|software/.test(gpu)) return 'low';
  if (mobile) {
    if (/apple/.test(gpu)) return 'medium';
    const n = +(gpu.match(/adreno[^\d]*(\d{3})/)?.[1] || 0);
    return n >= 730 ? 'high' : n >= 640 ? 'medium' : 'low';
  }
  if (/rtx\s*[3-9]0[6-9]0|rtx\s*[4-9]0\d0|radeon rx\s*[6-9][7-9]\d{2}|apple m\d (pro|max|ultra)/.test(gpu)) return 'ultra';
  if (/rtx|gtx\s*1(07|08)0|gtx\s*16[6-9]0|radeon rx\s*[5-9]\d{3}|arc|apple m\d/.test(gpu)) return 'high';
  if (/gtx|geforce|radeon|iris/.test(gpu)) return 'medium';
  return 'medium';
}

export class Graphics {
  constructor(engine, scene, camera, { sunDir }) {
    Object.assign(this, { engine, scene, camera });
    scene.clearColor = new Color4(0.93, 0.78, 0.66, 1);
    scene.ambientColor = new Color3(0.3, 0.3, 0.32);

    // Sun direction (toward the sun) as in the original game: low, warm.
    this.sunDir = new Vector3(sunDir[0], sunDir[1], sunDir[2]).normalize();

    // The original's painted sky and haze (world/Sky.js), also what the
    // environment probe captures.
    this.skyDome = new Sky(scene, { sunDir: this.sunDir });
    const sky = this.skyDome.mesh;
    this.sky = sky;

    // Lights: warm sun + sky/ground fill.
    this.sun = new DirectionalLight('sun', this.sunDir.scale(-1), scene);
    this.sun.position = this.sunDir.scale(120);
    // The original's sunset rig (Lighting.js): a strong orange sun, lilac sky
    // fill, warm bounce, with its numbers: colours in linear space as three
    // used them, and world materials lit like three's (world/CelLighting.js).
    this.sun.diffuse = Color3.FromHexString('#ffbd80').toLinearSpace();
    this.sun.specular = this.sun.diffuse;
    this.sun.intensity = 4.6;
    this.hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    this.hemi.diffuse = Color3.FromHexString('#c9cbe6').toLinearSpace();
    this.hemi.groundColor = Color3.FromHexString('#dba57e').toLinearSpace();
    this.hemi.intensity = 1.15;
    this.hemi.specular = Color3.Black();
    // Toon-shaded characters take the same light, Lambert-scaled as three
    // lit the original's MToon: the warm low sun and the average sky fill.
    ToonPlugin.sun.copyFrom(this.sun.diffuse).scaleInPlace(this.sun.intensity / Math.PI);
    ToonPlugin.sunDir = this.sunDir;
    ToonPlugin.ambient.copyFrom(this.hemi.diffuse).addInPlace(this.hemi.groundColor).scaleInPlace(0.5 * this.hemi.intensity / Math.PI);

    // Image-based lighting from the sky (captured once).
    // Linear HDR (float, linearSpace): flagged as gamma space, every
    // reflection was linearised a second time and metal went near-black.
    const probe = new ReflectionProbe('skyProbe', 128, scene, true, true, true);
    // In a right-handed scene the probe captured ±Y the wrong way round:
    // upward surfaces reflected the ground-side haze and downward ones the
    // dark zenith (black rims, orange glints on car edges).
    probe._invertYAxis = true;
    probe.renderList.push(sky);
    probe.refreshRate = 0;   // render once
    // Then GGX-prefiltered once, like the original's PMREM: unfiltered, every
    // roughness sampled the sharp mip (mirror clouds on rough car paint).
    // Run after the first frame (which captured it), outside any render pass.
    scene.onAfterRenderObservable.addOnce(() => {
      new HDRFiltering(engine, { hdrScale: 1, quality: Constants.TEXTURE_FILTERING_QUALITY_HIGH }).prefilter(probe.cubeTexture)
        // Frozen materials keep their bound reflection info until told.
        .then(() => scene.markAllMaterialsAsDirty(Constants.MATERIAL_TextureDirtyFlag));
    });
    scene.environmentTexture = probe.cubeTexture;
    scene.environmentIntensity = 0.45;
    this.probe = probe;

    // Image processing: ACES, a touch of contrast and warmth.
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    // three's ACESFilmic divides by 0.6 before the curve; Babylon's doesn't.
    ip.exposure = 1 / 0.6;
    ip.contrast = 1.1;
    // Grade like the original: saturated, warm highlights, cool shadows.
    const curves = new ColorCurves();
    curves.globalSaturation = 22;
    curves.highlightsHue = 35; curves.highlightsDensity = 22; curves.highlightsSaturation = 10;
    curves.shadowsHue = 235; curves.shadowsDensity = 18; curves.shadowsSaturation = 8;
    ip.colorCurvesEnabled = true;
    ip.colorCurves = curves;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.6;
    ip.vignetteColor = new Color4(0.12, 0.08, 0.12, 0);
    ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    this.casters = [];
    // Shadow square around her (the original's Lighting): light-space basis
    // (rebuilt when the sun turns, as it does inside the shops), and the
    // casters inside the square at the last redraw.
    this._basis = { fwd: new Vector3(), right: new Vector3(), up: new Vector3() };
    this._shadowCenter = new Vector3();
    this._shadowList = [];

    // Quality governor hooks (AdaptivePerformance): render scale, the costly
    // screen effects, and how often the shadow maps are redrawn.
    this.quality = 1;
    this._raysAllowed = true;
    this.shadowInterval = 15;          // ms; 15 ≈ every frame at 60 fps, 31 = 30 Hz
    this._shadowAt = -Infinity;
    this._scaleDirty = false;
    // The pixel budget depends on the window (rotation, resizing).
    addEventListener('resize', () => { this._scaleDirty = true; });
    // Draw calls of the last frame (shadow maps and post passes included).
    const counter = engine._drawCalls;
    this._calls = 0;
    scene.onBeforeAnimationsObservable.add(() => counter?.fetchNewFrame());
    scene.onAfterRenderObservable.add(() => { this._calls = counter?.current ?? 0; });
    scene.onBeforeRenderObservable.add(() => {
      // A new render scale is applied right before drawing: resizing the
      // drawing buffer between frames would show a cleared canvas (a flash).
      if (this._scaleDirty) this._applyScale();
      // Shadows are redrawn on a timer (≤60 Hz), never every frame on a 120 Hz screen.
      const now = performance.now();
      if (this.shadows && now - this._shadowAt >= this.shadowInterval) {
        this._shadowAt = now;
        this._cullShadowCasters();
        this.shadows.getShadowMap()?.resetRefreshCounter();
      }
    });
  }

  /** Render resolution: the device ratio capped by the preset's ratio and pixel budget, times the adaptive scale. */
  _applyScale() {
    const p = PRESETS[this.tier] || PRESETS.medium;
    this._scaleDirty = false;
    const budget = Math.sqrt(p.pixels / Math.max(1, innerWidth * innerHeight));
    const level = 1 / Math.max(0.75, Math.min(devicePixelRatio, p.dpr, budget) * this.quality);
    // Only on a change: setting it resizes the engine, which asks for this again.
    if (level !== this.engine.getHardwareScalingLevel()) this.engine.setHardwareScalingLevel(level);
  }

  /** Render-scale multiplier (1 = the preset's resolution), applied on the next frame. */
  setQuality(scale) {
    if (scale === this.quality) return;
    this.quality = scale;
    this._scaleDirty = true;
  }

  /** Light rays: what a GPU that can't keep up drops first (AdaptivePerformance, shops). */
  get raysAllowed() { return this._raysAllowed; }
  set raysAllowed(on) {
    this._raysAllowed = on;
    if (this.inkRays) this.inkRays.raysAllowed = on;
  }

  /** Ink outline strength (0 inside the shops, which are meant to look like real rooms). */
  get ink() { return this.inkRays?.strength ?? 0; }
  set ink(v) { if (this.inkRays) this.inkRays.strength = v; }

  /** Draw calls in the last rendered frame. */
  drawCalls() { return this._calls; }

  /** Triangles drawn by the main camera in the last frame. */
  triangles() { return this.scene.getActiveIndices() / 3; }

  /** Shadow-map resolution of the current preset. */
  shadowSize() { return (PRESETS[this.tier] || PRESETS.medium).shadow; }

  /**
   * Fade the 3D view toward white (the portal ending), 0..1. The original
   * mixed white into its grading pass; here a page layer between the canvas
   * and the HUD does it with no extra full-screen GPU pass.
   */
  setFade(v, color = '#e8e8e8') {
    if (!this._fade) {
      if (!v) return;
      this._fade = document.createElement('div');
      this._fade.style.cssText = 'position:fixed;inset:0;opacity:0;pointer-events:none';
      this.engine.getRenderingCanvas().after(this._fade);
    }
    if (v && this._fadeColor !== color) { this._fadeColor = color; this._fade.style.background = color; }
    const o = String(Math.round(v * 1000) / 1000);
    if (this._fade.style.opacity !== o) this._fade.style.opacity = o;
  }

  /**
   * Per frame (main loop's lighting.update): the clouds drift, and the shadow
   * square stays centred on her, snapped to whole shadow-map texels in light
   * space (without the snap, shadow edges crawl and shimmer as she walks).
   */
  update(dt, focus) {
    this.skyDome.update(dt);
    if (!focus) return;
    const { right, up, fwd } = this._basis;
    this.sunDir.scaleToRef(-1, fwd);
    Vector3.CrossToRef(fwd, Vector3.UpReadOnly, right);
    right.normalize();
    Vector3.CrossToRef(right, fwd, up);
    up.normalize();
    const texel = (SHADOW_EXTENT * 2) / this.shadowSize();
    const u = Math.round(Vector3.Dot(focus, right) / texel) * texel;
    const v = Math.round(Vector3.Dot(focus, up) / texel) * texel;
    const w = Vector3.Dot(focus, fwd);
    const c = this._shadowCenter.set(right.x * u + up.x * v + fwd.x * w, right.y * u + up.y * v + fwd.y * w, right.z * u + up.z * v + fwd.z * w);
    this.sun.position.set(c.x + this.sunDir.x * SHADOW_BACK, c.y + this.sunDir.y * SHADOW_BACK, c.z + this.sunDir.z * SHADOW_BACK);
  }

  /**
   * Babylon draws every caster into the shadow map with no culling; like
   * three's shadow camera, keep only those inside its box (the square and its depth).
   */
  _cullShadowCasters() {
    const { right, up, fwd } = this._basis, c = this._shadowCenter, list = this._shadowList;
    list.length = 0;
    for (const m of this.casters) {
      if (m.isDisposed() || !m.isEnabled()) continue;
      const s = m.getBoundingInfo().boundingSphere, p = s.centerWorld, rs = s.radiusWorld, r = rs + SHADOW_EXTENT;
      const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
      if (Math.abs(dx * right.x + dy * right.y + dz * right.z) >= r || Math.abs(dx * up.x + dy * up.y + dz * up.z) >= r) continue;
      // And within the camera's depth: with the sun low along the street,
      // everything down it overlapped the square and was drawn.
      const depth = SHADOW_BACK + dx * fwd.x + dy * fwd.y + dz * fwd.z;
      if (depth + rs > SHADOW_NEAR && depth - rs < SHADOW_FAR) list.push(m);
    }
  }

  /**
   * Apply a preset (call once at start, again when changed). The first call
   * builds the shadow map and the post chain; a switch changes them in place.
   * Rebuilding the pipeline froze the game for 1.5–2 s (14–30 s at CPU 4×):
   * every build disposes and re-creates its image-processing pass, which
   * flips the scene's applyByPostProcess, and each of ~900 materials then
   * walks all ~2,300 meshes to mark its shaders dirty, twice per build and
   * several builds per switch.
   */
  apply(tier) {
    if (tier === this.tier) return;
    const p = PRESETS[tier] || PRESETS.medium;
    this.tier = tier;
    this._applyScale();
    if (!this.shadows) this._build(p);
    if (this.shadows.mapSize !== p.shadow) {
      // A new map texture: the old one's render list and timer go with it.
      this.shadows.mapSize = p.shadow;
      this._hookShadowMap();
    }
    this.inkRays.configure({ samples: p.msaa, rays: p.rays });
    this._postEffects(p);
  }

  /** The shadow generator and post chain, made once for every preset. */
  _build(p) {
    const { scene, camera, sun } = this;
    // Shadows (the original's numbers): one map, a ±22 m square, 1–140 m deep.
    sun.autoUpdateExtends = false;
    sun.orthoLeft = -SHADOW_EXTENT; sun.orthoRight = SHADOW_EXTENT;
    sun.orthoTop = SHADOW_EXTENT; sun.orthoBottom = -SHADOW_EXTENT;
    sun.shadowMinZ = SHADOW_NEAR; sun.shadowMaxZ = SHADOW_FAR;
    const sg = new ShadowGenerator(p.shadow, sun);
    sg.bias = 0.0008;
    sg.normalBias = 0.02;
    // PCF at Babylon's default (high) quality on every preset: the quality is
    // part of every lit material's shader, so a per-preset one recompiled
    // them all at a switch.
    sg.usePercentageCloserFiltering = true;
    sg.darkness = 0;   // shade is lit by the sky fill only, as in the original
    for (const m of this.casters) sg.addShadowCaster(m, false);
    this.shadows = sg;
    this._hookShadowMap();

    // Post-processing: ink and rays first (they take the MSAA scene and its
    // depth), then Babylon's pipeline, built once with every effect a preset
    // may use (so their shaders compile at load) and never rebuilt (see apply).
    this.inkRays = new InkRays(scene, camera, this.sunDir, { samples: p.msaa, rays: p.rays });
    this.inkRays.raysAllowed = this._raysAllowed;
    const pipe = new DefaultRenderingPipeline('post', true, scene, [camera], false);
    pipe.fxaaEnabled = true;
    pipe.bloomEnabled = true;
    pipe.bloomThreshold = 0.92;
    pipe.bloomWeight = 0.22;
    pipe.bloomKernel = 64;
    pipe.bloomScale = 0.5;
    pipe.sharpenEnabled = true;
    pipe.sharpen.edgeAmount = 0.22;
    pipe.imageProcessingEnabled = true;
    pipe.prepare();
    // Babylon re-sizes the bloom blur with the render scale, and each size is
    // a new shader: compiled mid-play whenever the governor or a preset
    // changed the resolution. The blur keeps its load-time size instead.
    this.engine.onResizeObservable.remove(pipe._resizeObserver);
    this.pipeline = pipe;
  }

  /** The shadow map draws the culled casters, when the shadow timer says so (see the constructor). */
  _hookShadowMap() {
    const map = this.shadows.getShadowMap();
    map.getCustomRenderList = () => this._shadowList;
    map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this._shadowAt = -Infinity;
  }

  /** The pipeline's optional effects on or off, without a rebuild. */
  _postEffects({ fxaa, bloom }) {
    const mgr = this.scene.postProcessRenderPipelineManager, pipe = this.pipeline;
    for (const [effect, on] of [[pipe.FxaaPostProcessId, fxaa], [pipe.bloom._name, bloom]]) {
      if (on) mgr.enableEffectInPipeline(pipe.name, effect, this.camera);
      else mgr.disableEffectInPipeline(pipe.name, effect, this.camera);
    }
  }

  /** Meshes that cast shadows (kept across preset changes). */
  addCasters(meshes) {
    for (const m of meshes) {
      this.casters.push(m);
      this.shadows?.addShadowCaster(m, false);
    }
  }

  /**
   * Swap the scene's environment (the sky ↔ a shop's photo). Babylon's
   * setter marks every material dirty, walking every mesh for each material:
   * ~1 s with this city, a freeze at every shop door. Here only `meshes`
   * (what draws while it is set) re-read their shader settings; everything
   * else keeps the ones it had, which are right again once it's swapped back.
   */
  setEnvironment(texture, meshes) {
    const scene = this.scene;
    if (scene.environmentTexture === texture) return;
    scene._environmentTexture = texture;
    for (const m of meshes) for (const sm of m.subMeshes || []) sm.materialDefines?.markAsTexturesDirty();
  }

  /**
   * Draw everything once behind the loading screen, unculled and into the
   * shadow map (the original's warmUp): drivers finish a shader on its first
   * draw (up to ~0.4 s, even when compiled ahead) and upload geometry then,
   * so whatever is first seen in play (a car's cabin, a far model, a shop)
   * stuttered.
   */
  async warmUp(asleep = null) {
    const scene = this.scene, saved = [];
    for (const n of [...scene.transformNodes, ...scene.meshes]) {
      // Sleeping roots (the city during a shopping trip) keep their subtree off.
      if (n.isDisposed() || asleep?.has(n)) continue;
      saved.push([n, n.isEnabled(false), n.isVisible, n.alwaysSelectAsActiveMesh]);
      n.setEnabled(true);
      if (n.getTotalVertices) { n.isVisible = true; n.alwaysSelectAsActiveMesh = true; }
    }
    const list = this._shadowList;
    this._shadowList = this.casters.filter((m) => !m.isDisposed());
    // Every post effect too, so a later preset switch draws nothing new.
    this._postEffects({ fxaa: true, bloom: true });
    this.shadows?.getShadowMap()?.resetRefreshCounter();
    scene.incrementRenderId();
    await scene.whenReadyAsync();
    scene.render();
    this.engine._gl?.finish();
    this._shadowList = list;
    this._postEffects(PRESETS[this.tier] || PRESETS.medium);
    for (const [n, enabled, visible, always] of saved) {
      n.setEnabled(enabled);
      if (n.getTotalVertices) { n.isVisible = visible; n.alwaysSelectAsActiveMesh = always; }
    }
    this._shadowAt = -Infinity;
  }

  /** Stop meshes casting (call before disposing them). */
  removeCasters(meshes) {
    const gone = new Set(meshes);
    this.casters = this.casters.filter((m) => !gone.has(m));
    for (const m of meshes) this.shadows?.removeShadowCaster(m, false);
  }
}
