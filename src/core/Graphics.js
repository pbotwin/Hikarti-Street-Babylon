import {
  Vector3, Color3, Color4, DirectionalLight, HemisphericLight, MeshBuilder, CascadedShadowGenerator,
  DefaultRenderingPipeline, SSAO2RenderingPipeline, SSRRenderingPipeline, ReflectionProbe, ImageProcessingConfiguration, ColorCurves,
  Constants,
} from '@babylonjs/core';
import { SkyMaterial } from '@babylonjs/materials/sky/skyMaterial';

/**
 * Everything about how the city looks, using what Babylon ships with:
 *  - procedural sky at golden hour (SkyMaterial)
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

    // Sky dome.
    const sky = MeshBuilder.CreateBox('sky', { size: 900, sideOrientation: 1 }, scene);
    const skyMat = new SkyMaterial('skyMat', scene);
    skyMat.backFaceCulling = false;
    skyMat.useSunPosition = true;
    skyMat.sunPosition = this.sunDir.scale(100);
    // Golden hour: dense, warm scattering near the low sun.
    skyMat.luminance = 1.0;
    skyMat.turbidity = 9;
    skyMat.rayleigh = 3.2;
    skyMat.mieCoefficient = 0.008;
    skyMat.mieDirectionalG = 0.88;
    sky.material = skyMat;
    sky.infiniteDistance = true;
    sky.isPickable = false;
    this.sky = sky;

    // Lights: warm sun + sky/ground fill.
    this.sun = new DirectionalLight('sun', this.sunDir.scale(-1), scene);
    this.sun.position = this.sunDir.scale(120);
    // The original's sunset rig: a strong orange sun, lilac sky fill, warm bounce.
    this.sun.diffuse = Color3.FromHexString('#ffbd80');
    this.sun.specular = Color3.FromHexString('#ffd2a6');
    this.sun.intensity = 4.2;
    this.hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    this.hemi.diffuse = Color3.FromHexString('#c9cbe6');
    this.hemi.groundColor = Color3.FromHexString('#dba57e');
    this.hemi.intensity = 0.95;
    this.hemi.specular = Color3.Black();

    // Image-based lighting from the sky (captured once).
    const probe = new ReflectionProbe('skyProbe', 128, scene, true, true);
    probe.renderList.push(sky);
    probe.refreshRate = 0;   // render once
    scene.environmentTexture = probe.cubeTexture;
    scene.environmentIntensity = 0.45;
    this.probe = probe;

    // Image processing: ACES, a touch of contrast and warmth.
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.12;
    ip.contrast = 1.16;
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
  }

  /** Apply a preset (call once at start, again when changed). */
  apply(tier) {
    const p = PRESETS[tier] || PRESETS.medium;
    this.tier = tier;
    const { scene, camera, engine } = this;
    engine.setHardwareScalingLevel(1 / (Math.min(devicePixelRatio, tier === 'ultra' ? 2 : 1.5) * p.scale));

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
    csm.darkness = 0.15;
    for (const m of this.casters) csm.addShadowCaster(m, false);
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
  }

  /** Meshes that cast shadows (kept across preset changes). */
  addCasters(meshes) {
    for (const m of meshes) {
      this.casters.push(m);
      this.shadows?.addShadowCaster(m, false);
    }
  }
}
