import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial } from '@babylonjs/core';

/**
 * Camera-facing labels drawn on a canvas (residents' names, quest markers,
 * thought bubbles): the Babylon stand-in for three.js sprites. Every
 * billboard shares one unit quad; each look is a canvas texture on an unlit,
 * blended material, cached by its owner and shared by everyone showing it.
 */
let quad = null;

/** Unlit, non-fogged, alpha-blended material showing a w×h canvas drawn by `draw(ctx)`. */
export function billboardMaterial(scene, name, w, h, draw) {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true);
  tex.hasAlpha = true;
  const c = tex.getContext();
  c.clearRect(0, 0, w, h);
  draw(c);
  tex.update();
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.emissiveTexture = tex;
  m.opacityTexture = tex;
  m.disableLighting = true;
  m.fogEnabled = false;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  return m;
}

/** A billboard of `material`, sx × sy metres, under `parent`. Starts hidden. */
export function billboard(scene, material, sx, sy, parent) {
  if (!quad || quad.isDisposed()) {
    quad = MeshBuilder.CreatePlane('billboard', { size: 1 }, scene);
    quad.isVisible = false;
    quad.isPickable = false;
  }
  const b = quad.clone(material.name, parent);
  b.material = material;
  b.billboardMode = Mesh.BILLBOARDMODE_ALL;
  b.scaling.set(sx, sy, 1);
  b.isPickable = false;
  b.isVisible = false;
  return b;
}

/** Free the shared quad (after every billboard made from it is gone). */
export function disposeBillboards() {
  quad?.dispose();
  quad = null;
}
