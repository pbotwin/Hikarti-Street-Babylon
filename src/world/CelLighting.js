import { MaterialPluginBase, PBRMaterial, RegisterMaterialPlugin } from '@babylonjs/core';

/**
 * The original's anime environment lighting (AnimeShading.installCelLighting),
 * for every lit PBR material that isn't a toon-shaded character:
 *  - the sun's diffuse term becomes a soft two-tone ramp (lit / shade with
 *    a narrow transition) plus a faint warm band at the terminator; under the
 *    low sun this is what keeps roads and walls golden instead of dim
 *  - foliage (`soft`) gets a broad transition so canopies read as masses
 *  - the sky / ground fill is Lambertian like three's HemisphereLight
 *    (Babylon's hemispheric light skips the 1/π), so the original's light
 *    intensities apply unchanged
 * Specular keeps Babylon's physically based term, as the original did.
 */
const DIRECT = /return diffuseTerm\*info\.attenuation\*info\.NdotL\*lightColor;/;
const HEMI = /\{return mix\(groundColor,lightColor,info\.NdotL\);\}/;

export class CelLighting extends MaterialPluginBase {
  static get(material) { return material.pluginManager?.getPlugin('CelLighting') || null; }

  constructor(material) {
    super(material, 'CelLighting', 250, { CEL_LIGHTING: false, CEL_SOFT: false });
    this.doNotSerialize = true;
    this._soft = false;
    this._enable(true);
  }

  /** Foliage ramp (leaves, grass, hedges). */
  get soft() { return this._soft; }
  set soft(v) { if (v !== this._soft) { this._soft = v; this.markAllDefinesAsDirty(); } }

  getClassName() { return 'CelLighting'; }

  isCompatible(shaderLanguage) { return shaderLanguage === 0; }

  prepareDefines(defines) {
    // Characters have their own cel bands (Vrm.js ToonPlugin).
    defines.CEL_LIGHTING = !this._material.pluginManager.getPlugin('Toon')?.isEnabled && !this._material.unlit;
    defines.CEL_SOFT = this._soft;
    // three's standard material has no radiance occlusion; with it, sky
    // reflections on metal (car rims, chrome) dropped to a fifth.
    defines.RADIANCEOCCLUSION = false;
  }

  getCustomCode(shaderType) {
    if (shaderType !== 'fragment') return null;
    return {
      [`!${DIRECT.source}`]: `
#ifdef CEL_LIGHTING
{
  float celX = clamp(info.NdotLUnclamped, -1.0, 1.0);
  #ifdef CEL_SOFT
  float celLit = smoothstep(-0.2, 0.5, celX);
  #else
  float celLit = smoothstep(0.0, 0.1, celX);
  #endif
  celLit *= 0.86 + 0.14 * clamp(celX, 0.0, 1.0);
  float celBand = smoothstep(0.0, 0.04, celX) * (1.0 - smoothstep(0.04, 0.22, celX));
  return info.attenuation * lightColor * (celLit + vec3(0.22, 0.07, 0.0) * celBand) / PI;
}
#else
return diffuseTerm*info.attenuation*info.NdotL*lightColor;
#endif
`,
      [`!${HEMI.source}`]: `{
#ifdef CEL_LIGHTING
return mix(groundColor,lightColor,info.NdotL)/PI;
#else
return mix(groundColor,lightColor,info.NdotL);
#endif
}`,
    };
  }
}

RegisterMaterialPlugin('CelLighting', (material) => (material instanceof PBRMaterial ? new CelLighting(material) : null));
