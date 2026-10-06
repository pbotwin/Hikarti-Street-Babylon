import {
  Vector3, Color3, Color4, DirectionalLight, HemisphericLight, CascadedShadowGenerator,
  DefaultRenderingPipeline, SSAO2RenderingPipeline, SSRRenderingPipeline, ReflectionProbe, ImageProcessingConfiguration, ColorCurves,
  Constants, RenderTargetTexture,
} from '@babylonjs/core';
import { HDRFiltering } from '@babylonjs/core/Materials/Textures/Filtering/hdrFiltering.js';
import { Sky } from '../world/Sky.js';
import { ToonPlugin } from '../player/Vrm.js';

/**
 * Everything about how the city looks, using what Babylon ships with:
 *  - the original's painted golden-hour sky and fog (world/Sky.js)
 *  - image-based lighting captured from that sky, so PBR surfaces are lit
 *    by the real sky colour (ReflectionProbe → environmentTexture)
 *  - a warm low sun with cascaded shadow maps (sharp near her, soft far)
 *  - HDR post: MSAA, bloom, ACES tone mapping, contrast, vignette, sharpen
 *  - SSAO2 ambient occlusion (contact shadows in corners and under things)
 *  - screen-space reflections on High / Ultra
 * Presets scale shadow resolution, AO, reflections and render scale.
 */
export const PRESETS = {
  low: { label: 'Low', scale: 0.75, shadow: 1024, cascades: 2, ssao: false, ssr: false, msaa: 1, fxaa: true, bloom: false },
  medium: { label: 'Medium', scale: 1, shadow: 2048, cascades: 3, ssao: true, ssr: false, msaa: 2, fxaa: false, bloom: true },
  high: { label: 'High', scale: 1, shadow: 2048, cascades: 3, ssao: true, ssr: false, msaa: 4, fxaa: false, bloom: true },
  ultra: { label: 'Ultra', scale: 1, shadow: 4096, cascades: 4, ssao: true, ssr: true, msaa: 4, fxaa: false, bloom: true },
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

  /** Ambient occlusion and reflections: what a GPU that can't keep up drops first. */
  get raysAllowed() { return this._raysAllowed; }
  set raysAllowed(on) {
    if (on === this._raysAllowed) return;
    this._raysAllowed = on;
    this._attachScreenEffects();
  }

  _attachScreenEffects() {
    const manager = this.scene.postProcessRenderPipelineManager;
    for (const pipe of [this.ssao, this.ssr]) {
      if (!pipe) continue;
      if (this._raysAllowed) manager.attachCamerasToRenderPipeline(pipe.name, this.camera);
      else manager.detachCamerasFromRenderPipeline(pipe.name, this.camera);
    }
  }

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
  setFade(v) {
    if (!this._fade) {
      if (!v) return;
      this._fade = document.createElement('div');
      this._fade.style.cssText = 'position:fixed;inset:0;background:#e8e8e8;opacity:0;pointer-events:none';
      this.engine.getRenderingCanvas().after(this._fade);
    }
    const o = String(Math.round(v * 1000) / 1000);
    if (this._fade.style.opacity !== o) this._fade.style.opacity = o;
  }

  /** Per frame (main loop's lighting.update): the clouds drift. */
  update(dt) {
    this.skyDome.update(dt);
  }

  /** Apply a preset (call once at start, again when changed). */
  apply(tier) {
    if (tier === this.tier && this.shadows) return;
    const p = PRESETS[tier] || PRESETS.medium;
    this.tier = tier;
    const { scene, camera } = this;
    this._applyScale();

    // Shadows: cascades sized to the street, re-made on a preset change.
    this.shadows?.dispose();
    const csm = new CascadedShadowGenerator(p.shadow, this.sun);
    csm.numCascades = p.cascades;
    csm.lambda = 0.82;
    csm.shadowMaxZ = 140;
    csm.stabilizeCascades = true;
    csm.cascadeBlendPercentage = 0.08;
    csm.depthClamp = true;
    csm.bias = 0.004;
    csm.normalBias = 0.02;
    csm.usePercentageCloserFiltering = true;
    csm.filteringQuality = tier === 'low' ? Constants.TEXTURE_FILTERING_QUALITY_LOW : Constants.TEXTURE_FILTERING_QUALITY_HIGH;
    csm.darkness = 0;   // shade is lit by the sky fill only, as in the original
    for (const m of this.casters) csm.addShadowCaster(m, false);
    // Drawn when the shadow timer says so (see the constructor), not every frame.
    csm.getShadowMap().refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    this._shadowAt = -Infinity;
    this.shadows = csm;

    // Post-processing.
    this.pipeline?.dispose();
    const pipe = new DefaultRenderingPipeline('post', true, scene, [camera]);
    pipe.samples = p.msaa;
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

    this.ssao?.dispose();
    this.ssao = null;
    if (p.ssao) {
      const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: tier === 'ultra' ? 1 : 0.5, blurRatio: 1 }, [camera], true);
      ssao.radius = 1.2;
      ssao.totalStrength = 1.1;
      ssao.base = 0.12;
      ssao.samples = tier === 'ultra' ? 24 : 12;
      ssao.maxZ = 120;
      ssao.expensiveBlur = tier === 'ultra';
      this.ssao = ssao;
    }

    this.ssr?.dispose();
    this.ssr = null;
    if (p.ssr) {
      const ssr = new SSRRenderingPipeline('ssr', scene, [camera], false, Constants.TEXTURETYPE_UNSIGNED_BYTE);
      ssr.strength = 0.6;
      ssr.reflectionSpecularFalloffExponent = 2.5;
      ssr.maxDistance = 60;
      ssr.step = tier === 'ultra' ? 1 : 2;
      ssr.thickness = 0.4;
      ssr.blurDispersionStrength = 0.03;
      ssr.roughnessFactor = 0.2;
      ssr.selfCollisionNumSkip = 2;
      ssr.enableAutomaticThicknessComputation = false;
      this.ssr = ssr;
    }
    if (!this._raysAllowed) this._attachScreenEffects();
  }

  /** Meshes that cast shadows (kept across preset changes). */
  addCasters(meshes) {
    for (const m of meshes) {
      this.casters.push(m);
      this.shadows?.addShadowCaster(m, false);
    }
  }
}
