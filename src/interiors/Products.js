import { Color3, MaterialPluginBase, Matrix, Mesh, PBRMaterial, Quaternion, Vector3, VertexData } from '@babylonjs/core';
import { ITEMS } from '../gameplay/ShopData.js';
import { CELLS, labelAtlas, labelFor } from './Labels.js';

/**
 * Product models for the walk-in shops: one small shared geometry per shape
 * (bottle, can, cup, onigiri, bun, box, bowl, magazine, clothes, shoes, …),
 * drawn as thin instances so a fully stocked shop is a handful of draw
 * calls. Shapes carry light/dark vertex shading (caps, lids, nori); the
 * instance colour gives each product its own colour, and printed parts
 * (labels, can bodies, covers, spines) show a design from the label atlas,
 * chosen per unit (aCell). Loose products (in her hand, the basket, on the
 * counter) are single thin instances of the same meshes, so every product
 * draws with one shader.
 */

/** How each shop item looks on the shelf. */
export const LOOKS = {
  ramune: { shape: 'bottle', color: '#7cc6e8' },
  greentea: { shape: 'bottle', color: '#7fb069' },
  canCoffee: { shape: 'can', color: '#8a5a3c' },
  latte: { shape: 'cup', color: '#f2c7d3' },
  energy: { shape: 'can', color: '#f2d43a' },
  melonSoda: { shape: 'cup', color: '#8fd18a' },
  onigiri: { shape: 'onigiri', color: '#f4f1ea' },
  melonpan: { shape: 'bun', color: '#e9c46a' },
  takoyaki: { shape: 'box', color: '#d9a066' },
  taiyaki: { shape: 'bun', color: '#c98a4b' },
  strawberries: { shape: 'box', color: '#e0525e' },
  ramenBowl: { shape: 'bowl', color: '#c8553d' },
  bento: { shape: 'box', color: '#3f6e8c' },
  walker: { shape: 'magazine', color: '#e98fa7' },
  gazette: { shape: 'magazine', color: '#9cb7c9' },
  manga: { shape: 'book', color: '#d34f5f' },
  fashion: { shape: 'magazine', color: '#c4b2e8' },
  cityguide: { shape: 'book', color: '#5f9c74' },
};
export function lookFor(itemId) {
  const item = ITEMS[itemId];
  if (LOOKS[itemId]) return { ...LOOKS[itemId], label: labelFor(itemId) };
  if (!item) return { shape: 'box', color: '#cccccc' };
  if (item.kind === 'top') return { shape: 'tee', color: item.color || '#f6f5f1' };
  if (item.kind === 'bottom') return { shape: 'folded', color: item.color || '#2b2b33' };
  if (item.kind === 'shoes') return { shape: 'shoes', color: item.color || '#f2f2f2' };
  if (item.kind === 'hair') return { shape: 'dye', color: item.color || '#6b4a35' };
  return { shape: 'box', color: '#cccccc' };
}

/** A hex colour as Babylon wants it for lit albedo (three treats hex as sRGB). */
export const linear = (hex) => Color3.FromHexString(hex).toLinearSpace();

// ---------------------------------------------------------------- geometry
// Primitives with three.js's parameters (radius, not diameter; Y up).
const cyl = (rt, rb, h, n, open = false) => VertexData.CreateCylinder({ diameterTop: rt * 2, diameterBottom: rb * 2, height: h, tessellation: n, cap: open ? Mesh.NO_CAP : Mesh.CAP_ALL });
const cube = (w, h, d) => VertexData.CreateBox({ width: w, height: h, depth: d });
/** A flat print (w × h) facing +z, uv 0..1 up its face. */
const plane = (w, h) => Object.assign(new VertexData(), {
  positions: [-w / 2, h / 2, 0, w / 2, h / 2, 0, -w / 2, -h / 2, 0, w / 2, -h / 2, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  uvs: [0, 1, 1, 1, 0, 0, 1, 0],
  indices: [0, 1, 2, 2, 1, 3],
});

/**
 * three.js TorusGeometry: a ring of `radius` in the XY plane, `arc` long
 * (a half ring for hooks and handles), wound for Babylon (the reverse of three's).
 */
export function torus(radius, tube, radial, tubular, arc = Math.PI * 2) {
  const positions = [], normals = [], indices = [];
  for (let j = 0; j <= radial; j++) {
    for (let i = 0; i <= tubular; i++) {
      const u = (i / tubular) * arc, v = (j / radial) * Math.PI * 2;
      const cx = radius * Math.cos(u), cy = radius * Math.sin(u);
      const x = (radius + tube * Math.cos(v)) * Math.cos(u), y = (radius + tube * Math.cos(v)) * Math.sin(u), z = tube * Math.sin(v);
      positions.push(x, y, z);
      const l = Math.hypot(x - cx, y - cy, z) || 1;
      normals.push((x - cx) / l, (y - cy) / l, z / l);
    }
  }
  for (let j = 1; j <= radial; j++) {
    for (let i = 1; i <= tubular; i++) {
      const a = (tubular + 1) * j + i - 1, b = (tubular + 1) * (j - 1) + i - 1, c = (tubular + 1) * (j - 1) + i, d = (tubular + 1) * j + i;
      indices.push(a, d, b, b, d, c);
    }
  }
  return Object.assign(new VertexData(), { positions, normals, indices });
}

const _m = new Matrix(), _r = new Matrix();
/**
 * Rotate (three.js XYZ Euler) and move a part; tint its vertices by `value`.
 * A printed part keeps its uvs as the label uv (carried in uvs2 through the
 * merge; -1 = unprinted).
 */
function part(vd, value, x, y, z, ry = 0, rx = 0, rz = 0, print = false) {
  // Column-vector Rx·Ry·Rz is Rz·Ry·Rx with Babylon's row vectors.
  Matrix.RotationZToRef(rz, _m);
  _m.multiplyToRef(Matrix.RotationYToRef(ry, _r), _m);
  _m.multiplyToRef(Matrix.RotationXToRef(rx, _r), _m);
  _m.setTranslationFromFloats(x, y, z);
  vd.transform(_m);
  const n = vd.positions.length / 3;
  vd.colors = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) vd.colors.set([value, value, value, 1], i * 4);
  vd.uvs2 = print ? Float32Array.from(vd.uvs) : new Float32Array(n * 2).fill(-1);
  vd.uvs = null;
  return vd;
}
const printed = (vd, x, y, z) => part(vd, 1, x, y, z, 0, 0, 0, true);
const merge = (parts) => { const [first, ...rest] = parts; return first.merge(rest, true); };

/** Each shape stands on y = 0, facing +z (its label side). */
const SHAPES = {
  bottle: () => merge([
    part(cyl(0.032, 0.034, 0.17, 12), 1, 0, 0.085, 0),
    printed(cyl(0.0345, 0.0345, 0.07, 12, true), 0, 0.08, 0),         // label
    part(cyl(0.014, 0.03, 0.045, 12), 1, 0, 0.19, 0),
    part(cyl(0.015, 0.015, 0.02, 10), 0.25, 0, 0.22, 0),             // cap
  ]),
  can: () => merge([
    part(cyl(0.033, 0.033, 0.12, 14), 1, 0, 0.06, 0),
    printed(cyl(0.0335, 0.0335, 0.1, 14, true), 0, 0.06, 0),          // printed body
    part(cyl(0.029, 0.033, 0.008, 14), 1.6, 0, 0.124, 0),            // silver lid (bright)
  ]),
  cup: () => merge([
    part(cyl(0.045, 0.034, 0.12, 14), 1.25, 0, 0.06, 0),
    printed(cyl(0.0455, 0.04, 0.04, 14, true), 0, 0.06, 0),           // sleeve
    part(cyl(0.047, 0.047, 0.012, 14), 1.6, 0, 0.126, 0),            // lid
    part(cyl(0.004, 0.004, 0.07, 6), 0.3, 0.012, 0.16, 0, 0, 0, 0.15), // straw
  ]),
  onigiri: () => merge([
    part(cyl(0.06, 0.06, 0.035, 3), 1.2, 0, 0.05, 0, Math.PI / 2, Math.PI / 2, 0),
    part(cube(0.045, 0.05, 0.037), 0.12, 0, 0.025, 0),                 // nori
  ]),
  bun: () => merge([
    part(VertexData.CreateSphere({ diameter: 0.12, segments: 7, slice: 0.5 }), 1, 0, 0, 0),
    part(cyl(0.06, 0.06, 0.01, 14), 0.7, 0, 0.005, 0),
  ]),
  box: () => merge([
    part(cube(0.18, 0.05, 0.12), 1, 0, 0.025, 0),
    part(cube(0.185, 0.012, 0.125), 1.5, 0, 0.052, 0),                 // clear lid
    printed(cube(0.06, 0.054, 0.126), 0.04, 0.026, 0),                 // label
  ]),
  bowl: () => merge([
    part(cyl(0.085, 0.05, 0.07, 16), 1, 0, 0.035, 0),
    part(cyl(0.078, 0.078, 0.008, 16), 1.45, 0, 0.066, 0),           // broth
    part(cube(0.005, 0.005, 0.2), 0.5, 0.03, 0.09, 0, 0, 0.2, 0),      // chopsticks
  ]),
  magazine: () => merge([
    part(cube(0.21, 0.28, 0.012), 1, 0, 0.14, 0),
    printed(plane(0.21, 0.28), 0, 0.14, 0.0065),                        // cover
  ]),
  book: () => merge([
    part(cube(0.13, 0.19, 0.025), 1, 0, 0.095, 0),
    printed(plane(0.13, 0.19), 0, 0.095, 0.0128),                       // jacket
  ]),
  tee: () => merge([                                                    // on a hanger, facing +z
    part(cube(0.42, 0.5, 0.03), 1, 0, -0.3, 0),
    part(cube(0.16, 0.16, 0.03), 0.95, -0.25, -0.13, 0, 0, 0, 0.5),
    part(cube(0.16, 0.16, 0.03), 0.95, 0.25, -0.13, 0, 0, 0, -0.5),
    part(torus(0.03, 0.006, 6, 12, Math.PI), 0.35, 0, 0.02, 0),        // hook
    part(cube(0.38, 0.012, 0.012), 0.35, 0, -0.05, 0),                 // hanger bar
  ]),
  folded: () => merge([
    part(cube(0.3, 0.05, 0.26), 1, 0, 0.025, 0),
    part(cube(0.3, 0.012, 0.03), 0.75, 0, 0.05, 0.11),                 // waistband
  ]),
  shoes: () => merge([
    part(cube(0.09, 0.07, 0.25), 1, -0.055, 0.045, 0),
    part(cube(0.09, 0.07, 0.25), 1, 0.055, 0.045, 0),
    part(cube(0.095, 0.022, 0.26), 1.6, -0.055, 0.011, 0),             // white soles
    part(cube(0.095, 0.022, 0.26), 1.6, 0.055, 0.011, 0),
  ]),
  dye: () => merge([
    part(cube(0.08, 0.13, 0.04), 1, 0, 0.065, 0),
    printed(plane(0.08, 0.13), 0, 0.065, 0.0205),
  ]),
  // Filler only: chip bags, cereal boxes, jars, spines.
  bag: () => merge([part(cube(0.15, 0.2, 0.05), 1, 0, 0.1, 0), printed(plane(0.15, 0.2), 0, 0.1, 0.0255)]),
  carton: () => merge([part(cube(0.12, 0.24, 0.07), 1, 0, 0.12, 0), printed(plane(0.12, 0.24), 0, 0.12, 0.0355)]),
  jar: () => merge([part(cyl(0.04, 0.04, 0.1, 12), 1, 0, 0.05, 0), printed(cyl(0.0405, 0.0405, 0.06, 12, true), 0, 0.05, 0), part(cyl(0.042, 0.042, 0.025, 12), 0.35, 0, 0.11, 0)]),
  spine: () => merge([part(cube(0.035, 0.22, 0.16), 1, 0, 0.11, 0), printed(plane(0.035, 0.22), 0, 0.11, 0.0805)]),
};

/** Size of a shape's footprint along its row, for spacing products. */
export const SHAPE_W = { bottle: 0.09, can: 0.08, cup: 0.11, onigiri: 0.13, bun: 0.14, box: 0.2, bowl: 0.19, magazine: 0.23, book: 0.15,
  tee: 0.44, folded: 0.33, shoes: 0.26, dye: 0.1, bag: 0.17, carton: 0.14, jar: 0.1, spine: 0.04 };

// One hidden template mesh per shape: every product mesh shares its geometry.
const templates = new Map();
function template(scene, shape) {
  const key = SHAPES[shape] ? shape : 'box';
  let t = templates.get(key);
  if (!t) {
    const vd = SHAPES[key]();
    const labelUv = vd.uvs2;
    vd.uvs2 = null;
    t = new Mesh(`product:${key}`, scene);
    vd.applyToMesh(t);
    t.setVerticesData('aLabelUv', labelUv, false, 2);
    t.setEnabled(false);
    t.isPickable = false;
    templates.set(key, t);
  }
  return t;
}

/**
 * Printed parts take their colour from the unit's atlas cell instead of the
 * instance colour, keeping the part's shade (its vertex colour).
 */
class PrintPlugin extends MaterialPluginBase {
  constructor(material) {
    super(material, 'Print', 200, { PRINTED: false });
    this._enable(true);
  }
  prepareDefines(defines) { defines.PRINTED = true; }
  getClassName() { return 'PrintPlugin'; }
  getAttributes(attributes) { attributes.push('aLabelUv', 'aCell'); }
  getSamplers(samplers) { samplers.push('labelAtlas'); }
  bindForSubMesh(ubo, scene) { ubo.setTexture('labelAtlas', labelAtlas(scene)); }
  getCustomCode(type) {
    if (type === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: 'attribute vec2 aLabelUv;\nattribute vec2 aCell;\nvarying vec2 vLabelUv;\nvarying float vPrinted;\nvarying float vShade;',
        CUSTOM_VERTEX_MAIN_END: `
          vPrinted = step(0.0, aLabelUv.x);
          vLabelUv = (aCell + clamp(aLabelUv, 0.0, 1.0) * 0.94 + 0.03) / ${CELLS.toFixed(1)};
          vShade = color.r;`,
      };
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'uniform sampler2D labelAtlas;\nvarying vec2 vLabelUv;\nvarying float vPrinted;\nvarying float vShade;',
      CUSTOM_FRAGMENT_UPDATE_ALPHA: 'if (vPrinted > 0.5) surfaceAlbedo = toLinearSpace(texture2D(labelAtlas, vLabelUv).rgb) * vShade;',
    };
  }
}

/** The one product material: vertex shading × instance colour, printed parts from the atlas. */
let productMaterial = null;
export function productMat(scene) {
  if (!productMaterial) {
    productMaterial = new PBRMaterial('product', scene);
    productMaterial.metallic = 0;
    productMaterial.roughness = 0.45;
    productMaterial.environmentIntensity = 1;
    new PrintPlugin(productMaterial);   // registers itself with the material
  }
  return productMaterial;
}

const _q = new Quaternion(), _s = new Vector3(), _p = new Vector3(), _mat = new Matrix(), _col = new Color3();
const cellOf = (label, out, i) => { out[i * 2] = label % CELLS; out[i * 2 + 1] = Math.floor(label / CELLS); };

/**
 * A product shape mesh; it draws its units as thin instances (matrix, colour,
 * label cell). Each gets its own copy of the shape's few hundred vertices:
 * meshes sharing a geometry also share its cached vertex-array objects in
 * the shadow pass, which then drew one mesh's instances with another's
 * buffers (wrong shadows, and GL errors when the counts differ).
 */
let copies = 0;
function shapeMesh(scene, name, shape) {
  const m = new Mesh(name, scene);
  template(scene, shape).geometry.copy(`${name}:${copies++}`).applyToMesh(m);
  m.material = productMat(scene);
  m.isPickable = false;
  m.receiveShadows = true;
  return m;
}

/**
 * All products of one interior: per shape a thin-instanced mesh, rebuilt as
 * units are added. A unit can be hidden (taken) and shown again (put back).
 * Meshes are made once per shape and reused across restocks.
 */
export class ProductSet {
  constructor(parent, { onMesh = null } = {}) {
    this.parent = parent;
    this.scene = parent.getScene();
    this.onMesh = onMesh;      // new shape mesh (to register as a shadow caster)
    this.groups = new Map();   // shape -> { mesh, units: [], matrices, colors, cells }
  }

  /** Queue a unit; call build() once all are added. Returns a handle. */
  add(shape, color, x, y, z, ry = 0, scale = 1, label = labelFor(`${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`)) {
    if (!this.groups.has(shape)) this.groups.set(shape, { units: [] });
    const g = this.groups.get(shape);
    const u = { shape, color, x, y, z, ry, scale, label, index: g.units.length, visible: true };
    g.units.push(u);
    return u;
  }

  build() {
    for (const [shape, g] of this.groups) {
      if (!g.mesh) {
        g.mesh = shapeMesh(this.scene, `products:${shape}`, shape);
        g.mesh.parent = this.parent;
        this.onMesh?.(g.mesh);
      }
      const n = g.units.length;
      g.matrices = new Float32Array(Math.max(1, n) * 16);
      g.colors = new Float32Array(Math.max(1, n) * 4);
      g.cells = new Float32Array(Math.max(1, n) * 2);
      for (const u of g.units) { this._write(g, u); cellOf(u.label, g.cells, u.index); }
      g.mesh.thinInstanceSetBuffer('matrix', g.matrices, 16, false);
      g.mesh.thinInstanceSetBuffer('color', g.colors, 4, true);
      g.mesh.thinInstanceSetBuffer('aCell', g.cells, 2, true);
      g.mesh.thinInstanceCount = n;
      g.mesh.thinInstanceRefreshBoundingInfo(false);
      g.mesh.setEnabled(n > 0);
    }
  }

  _write(g, u) {
    const s = u.visible ? u.scale : 0;
    Quaternion.RotationAxisToRef(Vector3.UpReadOnly, u.ry, _q);
    Matrix.ComposeToRef(_s.setAll(s), _q, _p.set(u.x, u.y, u.z), _mat);
    _mat.copyToArray(g.matrices, u.index * 16);
    Color3.FromHexString(u.color).toLinearSpaceToRef(_col);
    g.colors.set([_col.r, _col.g, _col.b, 1], u.index * 4);
  }

  setVisible(u, visible) {
    const g = this.groups.get(u.shape);
    u.visible = visible;
    if (!g?.mesh) return;
    this._write(g, u);
    g.mesh.thinInstanceBufferUpdated('matrix');
  }

  /** Remove every unit (restocking with a different shop's goods); meshes are kept. */
  clear() {
    for (const g of this.groups.values()) {
      g.units = [];
      if (g.mesh) { g.mesh.thinInstanceCount = 0; g.mesh.setEnabled(false); }
    }
  }
}

const IDENTITY = Matrix.Identity().toArray();
/** A standalone product mesh (in her hand, in the basket, on the counter): one thin instance. */
export function productMesh(scene, itemIdOrShape, color) {
  const look = ITEMS[itemIdOrShape] || LOOKS[itemIdOrShape] ? lookFor(itemIdOrShape) : { shape: itemIdOrShape, color };
  const m = shapeMesh(scene, `held:${look.shape}`, look.shape);
  const c = Color3.FromHexString(color || look.color).toLinearSpace();
  const cell = new Float32Array(2);
  cellOf(look.label ?? labelFor(itemIdOrShape), cell, 0);
  m.thinInstanceSetBuffer('matrix', Float32Array.from(IDENTITY), 16, true);
  m.thinInstanceSetBuffer('color', new Float32Array([c.r, c.g, c.b, 1]), 4, true);
  m.thinInstanceSetBuffer('aCell', cell, 2, true);
  return m;
}
