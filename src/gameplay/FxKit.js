import { DynamicTexture, StandardMaterial, Color3, Constants, Material, Texture, MeshBuilder, Matrix } from '@babylonjs/core';

/**
 * Small shared pieces for the gameplay effects: the soft round glow sprite
 * (fragments, the portal, contact shadows, fake light pools) and an unlit
 * material that behaves like three's MeshBasicMaterial (colour × map,
 * opacity, normal or additive blending), plus the faceted crystal shape.
 */
const glows = new WeakMap();

/** Round soft sprite texture, one per scene. */
export function glowTexture(scene) {
  let t = glows.get(scene);
  if (t) return t;
  const S = 128;
  t = new DynamicTexture('glow', { width: S, height: S }, scene, true);
  const g = t.getContext();
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  t.hasAlpha = true;
  t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE;
  t.update(false);
  glows.set(scene, t);
  return t;
}

/**
 * Unlit material: `color` (sRGB hex, like the original's) times `map`.
 * StandardMaterial converts its output to linear itself when the post
 * pipeline does the image processing, so colours stay in sRGB here.
 */
export function basicMaterial(scene, name, {
  color = '#ffffff', map = null, opacity = 1, transparent = false, additive = false,
  depthWrite = true, doubleSided = false, wireframe = false,
} = {}) {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveColor = Color3.FromHexString(color);
  if (map) {
    // Lighting off: output = emissive × diffuse texture (rgb and alpha).
    m.diffuseTexture = map;
    m.useAlphaFromDiffuseTexture = true;
  }
  m.alpha = opacity;
  if (transparent || additive || map) m.transparencyMode = Material.MATERIAL_ALPHABLEND;
  if (additive) m.alphaMode = Constants.ALPHA_ADD;
  m.disableDepthWrite = !depthWrite;
  m.backFaceCulling = !doubleSided;
  m.wireframe = wireframe;
  return m;
}

/** Flat-shaded octahedron of radius `r` (points on the axes), stretched `sy` tall. */
export function octahedron(name, scene, r, sy = 1) {
  const m = MeshBuilder.CreatePolyhedron(name, { type: 1, size: r / Math.SQRT2 }, scene);
  m.bakeTransformIntoVertices(Matrix.Scaling(1, sy, 1));
  return m;
}
