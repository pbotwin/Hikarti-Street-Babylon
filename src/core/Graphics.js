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
 * Presets scale shadow resolution and softness, post effects and render scale.
 */
// The original's shadow square (half size, m) and how far behind it the light sits.
const SHADOW_EXTENT = 22;
const SHADOW_BACK = 70;

export const PRESETS = {
  low: { label: 'Low', scale: 0.75, shadow: 1024, softShadows: false, msaa: 1, fxaa: true, bloom: false, rays: 0 },
  medium: { label: 'Medium', scale: 1, shadow: 2048, softShadows: false, msaa: 2, fxaa: false, bloom: true, rays: 10 },
  high: { label: 'High', scale: 1, shadow: 2048, softShadows: true, msaa: 4, fxaa: false, bloom: true, rays: 20 },
  ultra: { label: 'Ultra', scale: 1, shadow: 4096, softShadows: true, msaa: 4, fxaa: false, bloom: true, rays: 20 },
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

  _applyScale() {
    const p = PRESETS[this.tier] || PRESETS.medium;
    this._scaleDirty = false;
    this.engine.setHardwareScalingLevel(1 / (Math.min(devicePixelRatio, this.tier === 'ultra' ? 2 : 1.5) * p.scale * this.quality));
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
   * three's shadow camera, keep only those overlapping the shadow square.
   */
  _cullShadowCasters() {
    const { right, up } = this._basis, c = this._shadowCenter, list = this._shadowList;
    list.length = 0;
    for (const m of this.casters) {
      if (m.isDisposed() || !m.isEnabled()) continue;
      const s = m.getBoundingInfo().boundingSphere, p = s.centerWorld, r = s.radiusWorld + SHADOW_EXTENT;
      const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
      if (Math.abs(dx * right.x + dy * right.y + dz * right.z) < r && Math.abs(dx * up.x + dy * up.y + dz * up.z) < r) list.push(m);
    }
  }

  /** Apply a preset (call once at start, again when changed). */
  apply(tier) {
    if (tier === this.tier && this.shadows) return;
    const p = PRESETS[tier] || PRESETS.medium;
    this.tier = tier;
    const { scene, camera } = this;
    this._applyScale();

    // Shadows (the original's numbers): one map, a ±22 m square, 1–140 m deep.
    this.shadows?.dispose();
    const sun = this.sun;
    sun.autoUpdateExtends = false;
    sun.orthoLeft = -SHADOW_EXTENT; sun.orthoRight = SHADOW_EXTENT;
    sun.orthoTop = SHADOW_EXTENT; sun.orthoBottom = -SHADOW_EXTENT;
    sun.shadowMinZ = 1; sun.shadowMaxZ = 140;
    const sg = new ShadowGenerator(p.shadow, sun);
    sg.bias = 0.0008;
    sg.normalBias = 0.02;
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = p.softShadows ? Constants.TEXTURE_FILTERING_QUALITY_HIGH : Constants.TEXTURE_FILTERING_QUALITY_LOW;
    sg.darkness = 0;   // shade is lit by the sky fill only, as in the original
    for (const m of this.casters) sg.addShadowCaster(m, false);
    const map = sg.getShadowMap();
    map.getCustomRenderList = () => this._shadowList;
    // Drawn when the shadow timer says so (see the constructor), not every frame.
    map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this._shadowAt = -Infinity;
    this.shadows = sg;

    // Post-processing: ink and rays first (they take the MSAA scene and its
    // depth), then Babylon's pipeline.
    const ink = this.inkRays?.strength ?? 0.6;
    this.pipeline?.dispose();
    this.inkRays?.dispose();
    this.inkRays = new InkRays(scene, camera, this.sunDir, { samples: p.msaa, rays: p.rays });
    this.inkRays.strength = ink;
    this.inkRays.raysAllowed = this._raysAllowed;
    const pipe = new DefaultRenderingPipeline('post', true, scene, [camera]);
    pipe.fxaaEnabled = p.fxaa;
    pipe.bloomEnabled = p.bloom;
    pipe.bloomThreshold = 0.92;
    pipe.bloomWeight = 0.22;
    pipe.bloomKernel = 64;
    pipe.bloomScale = 0.5;
    pipe.sharpenEnabled = true;
    pipe.sharpen.edgeAmount = 0.22;
    pipe.imageProcessingEnabled = true;
    this.pipeline = pipe;

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
    this.shadows?.getShadowMap()?.resetRefreshCounter();
    scene.incrementRenderId();
    await scene.whenReadyAsync();
    scene.render();
    this.engine._gl?.finish();
    this._shadowList = list;
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
