import { Color3 } from '@babylonjs/core';
import { retone } from '../npcs/NPCModels.js';

/**
 * One of her materials as loaded, dyed to an outfit colour and back. A
 * textured piece (shorts, hair) gets a re-toned copy of its texture
 * (off-thread, cached by colour, so its painted folds stay); a plain one
 * (the tee, the sneakers' uppers) takes the colour directly.
 */
export class Dye {
  /**
   * @param {import('@babylonjs/core').PBRMaterial} material
   * @param {{ whites?: boolean, shade?: 'ratio' | 'keep' }} options
   *   whites: near-white texels (prints, stitching) stay white.
   *   shade: 'ratio' (a light plain piece) scales its toon shade with the
   *   colour so the shadow keeps its hue relation; 'keep' leaves it (a dark
   *   piece has no ratio to keep).
   */
  constructor(material, { whites = false, shade = 'ratio' } = {}) {
    this.material = material;
    this.toon = material.pluginManager?.getPlugin('Toon') || null;
    this.color = material.albedoColor.clone();
    this.shade = this.toon?.shade.clone() || null;
    this.map = material.albedoTexture;
    this.whites = whites;
    this.keepShade = shade === 'keep';
  }

  /** Dye to `hex` (null: as loaded). Resolves once the colour shows. */
  async apply(hex) {
    const m = this.material, toon = this.toon;
    if (this.map) {
      m.albedoTexture = hex ? await retone(this.map, hex, { srgb: true, whites: this.whites }) : this.map;
      return;
    }
    if (!hex) {
      m.albedoColor.copyFrom(this.color);
      if (toon) toon.shade.copyFrom(this.shade);
      return;
    }
    Color3.FromHexString(hex).toLinearSpaceToRef(m.albedoColor);
    if (toon && !this.keepShade) {
      const c = m.albedoColor, o = this.color, s = this.shade;
      toon.shade.set(c.r * s.r / Math.max(o.r, 0.05), c.g * s.g / Math.max(o.g, 0.05), c.b * s.b / Math.max(o.b, 0.05));
    }
  }
}
