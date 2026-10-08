import { DynamicTexture, Matrix, Mesh, PBRMaterial, VertexData } from '@babylonjs/core';
import { CLOTHES, FASHION_BRANDS } from './MallCatalog.js';
import { fitFont, logo } from './FashionBrands.js';
import { torus } from '../interiors/Products.js';

/**
 * Sakura Style's printed things, from one 1024² atlas painted once: a price
 * card per catalog garment (its label's logo, name, price and sizes,
 * clipped on the rails and as tent cards by the sneakers) and the store's
 * branded paper bag (FashionBrands' logos). Cards are
 * merged into one static mesh; the bags are a few prebuilt meshes (made at
 * load, reused), so nothing is created in play.
 */

const COLS = 4, ROWS = 8, S = 1024, CW = S / COLS, CH = S / ROWS;
const LOGO = 28, PAPER = 29, ROPE = 30, TISSUE = 31;
const PINK = '#f2a7bd', ROSE = '#b8486a';
export const BRAND = 'Sakura Style';

const CELL_OF = Object.fromEntries(CLOTHES.map((c, i) => [c.id, i]));

/** u0, v0, u1, v1 of a cell (v up the canvas: the texture is flipped on upload). */
function rect(cell) {
  const col = cell % COLS, row = Math.floor(cell / COLS);
  return [col / COLS, 1 - (row + 1) / ROWS, (col + 1) / COLS, 1 - row / ROWS];
}

function paintAtlas(scene) {
  const tex = new DynamicTexture('mall:fashionPrint', { width: S, height: S }, scene, true);
  tex.anisotropicFilteringLevel = 4;
  const g = tex.getContext();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  CLOTHES.forEach((c, i) => {
    // A price card: the label's band and logo, the name, the price, the sizes.
    const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH, B = FASHION_BRANDS[c.style.brand];
    g.fillStyle = '#fbf8f3'; g.fillRect(x, y, CW, CH);
    g.fillStyle = B.ink; g.fillRect(x, y, CW, 32);
    logo(g, c.style.brand, x + CW / 2, y + 16, CW * 0.62, 26, '#ffffff');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#3a2f36'; fitFont(g, c.name, CW - 28, 24, 700); g.fillText(c.name, x + CW / 2, y + 52);
    g.fillStyle = ROSE; fitFont(g, `${c.price} coins`, CW * 0.55, 34, 800); g.fillText(`${c.price} coins`, x + CW * 0.66, y + 96);
    g.fillStyle = '#8a7f86'; fitFont(g, '税込', 30, 13, 700); g.fillText('税込', x + CW * 0.66, y + 117);
    g.strokeStyle = '#8a7f86'; g.lineWidth = 1.5;
    (c.kind === 'shoes' ? ['23', '24', '25'] : ['S', 'M', 'L']).forEach((z, k) => {
      const bx = x + 16 + k * 24, by = y + 84;
      g.strokeRect(bx, by, 20, 20);
      fitFont(g, z, 16, 14, 700); g.fillText(z, bx + 10, by + 11);
    });
    g.strokeStyle = '#e6dcd2'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, CW - 3, CH - 3);
  });
  // The bag's print: the store's logo in white on rose-pink paper; the paper strewn with blossoms.
  const lx = (LOGO % COLS) * CW, ly = Math.floor(LOGO / COLS) * CH;
  g.fillStyle = PINK; g.fillRect(lx, ly, CW, CH);
  logo(g, BRAND, lx + CW / 2, ly + CH / 2, CW * 0.86, CH * 0.6, '#ffffff');
  const px = (PAPER % COLS) * CW, py = Math.floor(PAPER / COLS) * CH;
  g.fillStyle = PINK; g.fillRect(px, py, CW, CH);
  g.globalAlpha = 0.35;
  for (let k = 0; k < 18; k++) blossom(g, px + ((k * 53) % CW), py + ((k * 37) % CH), 7 + (k % 3) * 3, '#ffffff');
  g.globalAlpha = 1;
  for (const [cell, hex] of [[ROPE, ROSE], [TISSUE, '#fbfaf7']]) {
    g.fillStyle = hex; g.fillRect((cell % COLS) * CW, Math.floor(cell / COLS) * CH, CW, CH);
  }
  tex.update();
  return tex;
}

/** A small five-petal blossom (the bag paper's pattern). */
function blossom(g, x, y, r, fill) {
  g.fillStyle = fill;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath(); g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.45, 0, Math.PI * 2); g.fill();
  }
}

/** A w × h print facing +z, mapped to a cell. */
function quad(w, h, cell) {
  const [u0, v0, u1, v1] = rect(cell);
  return Object.assign(new VertexData(), {
    positions: [-w / 2, h / 2, 0, w / 2, h / 2, 0, -w / 2, -h / 2, 0, w / 2, -h / 2, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [u0, v1, u1, v1, u0, v0, u1, v0],
    indices: [0, 1, 2, 2, 1, 3],
  });
}

/** A primitive's own uvs squeezed into a cell (a patterned surface). */
function mapped(vd, cell) {
  const [u0, v0, u1, v1] = rect(cell);
  for (let i = 0; i < vd.uvs.length; i += 2) { vd.uvs[i] = u0 + (u1 - u0) * vd.uvs[i]; vd.uvs[i + 1] = v0 + (v1 - v0) * vd.uvs[i + 1]; }
  return vd;
}

/** A primitive in one flat colour (all its uvs at the middle of a plain cell). */
function plain(vd, cell) {
  const [u0, v0, u1, v1] = rect(cell);
  const n = vd.positions.length / 3;
  vd.uvs = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { vd.uvs[i * 2] = (u0 + u1) / 2; vd.uvs[i * 2 + 1] = (v0 + v1) / 2; }
  return vd;
}

const _m = new Matrix(), _r = new Matrix();
function at(vd, x, y, z, ry = 0, rx = 0) {
  Matrix.RotationXToRef(rx, _m);
  _m.multiplyToRef(Matrix.RotationYToRef(ry, _r), _m);
  _m.setTranslationFromFloats(x, y, z);
  return vd.transform(_m);
}

/** Front and back of a card (the back mirrors the front). */
const card = (w, h, cell) => [quad(w, h, cell), at(quad(w, h, cell), 0, 0, 0, Math.PI)];

export class FashionPrint {
  constructor(scene) {
    this.scene = scene;
    this.texture = paintAtlas(scene);
    const m = this.material = new PBRMaterial('mall:print', scene);
    m.albedoTexture = this.texture;
    m.metallic = 0;
    m.roughness = 0.8;
    m.environmentIntensity = 0.5;
    this.meshes = [];
  }

  /**
   * One static mesh of every price card: `cards` = [{ id, x, y, z, yaw, tent }]
   * (rail cards stand on the rail at y; tent cards sit on a shelf at y).
   */
  cards(list) {
    if (!list.length) return null;
    const parts = [];
    for (const c of list) {
      const cell = CELL_OF[c.id], local = [];
      if (c.tent) {
        // An A-frame on the shelf: two cards leaning on each other.
        for (const ry of [0, Math.PI]) for (const p of card(0.09, 0.045, cell)) local.push(at(at(p, 0, 0.0215, 0.012, 0, -0.3), 0, 0, 0, ry));
      } else {
        for (const p of card(0.11, 0.055, cell)) local.push(at(p, 0, 0.0575, 0));
        local.push(at(plain(VertexData.CreateBox({ width: 0.006, height: 0.03, depth: 0.006 }), ROPE), 0, 0.015, 0));
      }
      for (const p of local) parts.push(at(p, c.x, c.y, c.z, c.yaw));
    }
    const mesh = this._mesh('mall:priceCards', parts);
    mesh.freezeWorldMatrix();
    mesh.setEnabled(true);
    return mesh;
  }

  /** A branded paper bag, its handles' top at the origin (it hangs from a hand there). */
  bag(name) {
    const W = 0.3, H = 0.34, D = 0.12, top = -0.05;   // the handles rise 5 cm above the paper
    const parts = [
      at(mapped(VertexData.CreateBox({ width: W, height: H, depth: D }), PAPER), 0, top - H / 2, 0),
      at(quad(W * 0.86, W * 0.43, LOGO), 0, top - H * 0.42, D / 2 + 0.001),
      at(quad(W * 0.86, W * 0.43, LOGO), 0, top - H * 0.42, -D / 2 - 0.001, Math.PI),
      // Tissue paper peeking out of the top.
      at(plain(VertexData.CreateBox({ width: W * 0.8, height: 0.035, depth: D * 0.7 }), TISSUE), 0, top + 0.01, 0),
    ];
    for (const z of [D / 2 - 0.004, -D / 2 + 0.004]) parts.push(at(plain(torus(0.06, 0.005, 5, 12, Math.PI), ROPE), 0, top - 0.015, z));
    const mesh = this._mesh(name, parts);
    mesh.setEnabled(false);
    return mesh;
  }

  _mesh(name, parts) {
    const mesh = new Mesh(name, this.scene);
    parts[0].merge(parts.slice(1), true).applyToMesh(mesh);
    mesh.material = this.material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.meshes.push(mesh);
    return mesh;
  }

  dispose() {
    for (const m of this.meshes) m.dispose();
    this.meshes = [];
    this.material.dispose();
    this.texture.dispose();
  }
}
