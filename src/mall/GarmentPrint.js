import { Constants, DynamicTexture, RawTexture, Texture } from '@babylonjs/core';
import { FASHION_BRANDS } from './MallCatalog.js';
import { PRINTS, hangTag } from './FashionBrands.js';

/**
 * The garments' two textures (ClothesModels' material):
 *  - the print atlas, 1024² in 4 × 4 cells: one per print (FashionBrands
 *    PRINTS: chest graphics, the sneakers' side, the jeans' patch) on a
 *    transparent ground, and a cell of hang tags, one per label;
 *  - the cloth, 512² and tiling: four weaves in its four channels (r jersey
 *    knit, g denim twill, b plain weave, a fleece), so one sample gives any
 *    garment its fabric (3 MB with mips for both, against ~3 KB of
 *    triangles per stitch if it were geometry).
 */
const S = 1024, CELLS = 4, C = S / CELLS;
export const PRINT_KEYS = Object.keys(PRINTS);
/** Atlas cell of each print, and of the hang tags (TAG_CELL, BRAND_TAGS per row). */
export const PRINT_CELL = Object.fromEntries(PRINT_KEYS.map((k, i) => [k, i]));
export const TAG_CELL = CELLS * CELLS - 1;
export const TAG_COLS = 4;
export const BRAND_TAG = Object.fromEntries(Object.keys(FASHION_BRANDS).map((b, i) => [b, i]));

/**
 * Height ÷ width of the surface a print covers, painted in those
 * proportions so it isn't stretched on the garment: a top's front (shoulder
 * line to hem), a shoe's side, the jeans' panel.
 */
const ASPECT = { kaze: 0.35, patch: 2.3 };
const TOP = 1.24;

/** Paint the print atlas onto a 1024² canvas context (transparent where nothing is printed). */
export function paintGarmentPrints(g) {
  g.clearRect(0, 0, S, S);
  PRINT_KEYS.forEach((key, i) => {
    // Cell (i, j) is sampled from the bottom of the canvas up (flipped upload).
    const x = (i % CELLS) * C, y = (CELLS - 1 - Math.floor(i / CELLS)) * C, a = ASPECT[key] || TOP;
    g.save();
    g.beginPath(); g.rect(x, y, C, C); g.clip();
    g.translate(x, y); g.scale(1, 1 / a);
    PRINTS[key](g, C, C * a);
    g.restore();
  });
  const tx = (TAG_CELL % CELLS) * C, ty = (CELLS - 1 - Math.floor(TAG_CELL / CELLS)) * C;
  const tw = C / TAG_COLS, th = C / 2;
  Object.keys(FASHION_BRANDS).forEach((b, i) => {
    g.save();
    g.beginPath(); g.rect(tx + (i % TAG_COLS) * tw, ty + Math.floor(i / TAG_COLS) * th, tw, th); g.clip();
    hangTag(g, b, tx + (i % TAG_COLS) * tw + 1, ty + Math.floor(i / TAG_COLS) * th + 1, tw - 2, th - 2);
    g.restore();
  });
}

export function garmentPrintTexture(scene) {
  const tex = new DynamicTexture('mall:garmentPrint', { width: S, height: S }, scene, true);
  tex.hasAlpha = true;
  tex.anisotropicFilteringLevel = 4;
  paintGarmentPrints(tex.getContext());
  tex.update();
  return tex;
}

// ---------------------------------------------------------------- cloth
const F = 512;
/** Smooth periodic value noise (period p cells over the tile), 0..1. */
function noise(x, y, p, seed) {
  const h = (i, j) => {
    let n = (((i % p) + p) % p) * 374761393 + (((j % p) + p) % p) * 668265263 + seed * 69069;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const fx = (x / F) * p, fy = (y / F) * p, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (h(i, j) * (1 - su) + h(i + 1, j) * su) * (1 - sv) + (h(i, j + 1) * (1 - su) + h(i + 1, j + 1) * su) * sv;
}

/** The four weaves, tiling over 512² (the material repeats it every 6 cm). */
export function paintFabric() {
  const d = new Uint8Array(F * F * 4);
  for (let y = 0; y < F; y++) {
    for (let x = 0; x < F; x++) {
      const o = (y * F + x) * 4;
      // Jersey: columns of V-shaped stitches (16 px ≈ 1.9 mm).
      const cx = (x % 16) / 16, cy = (y % 16) / 16, edge = Math.abs(cx - 0.5) * 2;
      const loop = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (cy + edge * 0.45));
      d[o] = 120 + 110 * loop * (1 - edge * 0.7) + 20 * noise(x, y, 64, 1);
      // Denim: a 3/1 twill running up to the right, with slubby weft rows.
      const tw = ((x + y) % 8) / 8, slub = noise(x * 0.25, y, 32, 2);
      d[o + 1] = (tw < 0.62 ? 150 : 60) + 80 * slub * (tw < 0.62 ? 1 : 0.4) + 25 * noise(x, y, 128, 3);
      // Plain weave: alternating warp / weft floats, rounded.
      const wx = (x % 6) / 6, wy = (y % 6) / 6, over = (Math.floor(x / 6) + Math.floor(y / 6)) % 2;
      d[o + 2] = 140 + 90 * (over ? Math.sin(Math.PI * wx) : Math.sin(Math.PI * wy)) - 30 * noise(x, y, 64, 4);
      // Fleece: soft pills at two scales.
      d[o + 3] = 70 + 120 * noise(x, y, 64, 5) + 60 * noise(x, y, 16, 6);
    }
  }
  return d;
}

export function fabricTexture(scene) {
  const tex = RawTexture.CreateRGBATexture(paintFabric(), F, F, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  tex.name = 'mall:fabric';
  tex.wrapU = tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}
