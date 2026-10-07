import { BoundingInfo, Color3, MaterialPluginBase, Matrix, Mesh, PBRMaterial, Quaternion, Vector3, VertexData } from '@babylonjs/core';
import { torus } from '../interiors/Products.js';

/**
 * Clothes for the Sakura Style store: one procedural model per garment type
 * (tee, hoodie, sweatshirt, blouse, shorts, jeans, skirt on their hangers,
 * a pair of sneakers), matching the garments she wears (src/player/Garments.js)
 * so what she takes off the rack is what she tries on.
 *
 * Fabric panels are "pillows": a silhouette grid whose front and back meet
 * at the edges, bulging in the middle, so a hanging tee has shoulders, a
 * soft body and sleeves instead of a box. Vertex colours carry the shading
 * (ribbing, seams, pleats); the instance colour dyes the fabric; parts with
 * their own colour (hanger, buttons, soles, laces, price tag) take it from
 * `aOwn` instead (one material, one draw per garment type for the whole
 * store, shadows included).
 *
 * Every garment in the store is a thin instance of its type's mesh, also
 * while she carries it, while it hangs in a fitting room and on the till:
 * moving one is a matrix write (GarmentSet.place), nothing is created in play.
 * Hanging shapes have the hanger's hook top at the origin and face +z;
 * sneakers stand on y = 0, toes to +z.
 */

// Own colours (sRGB 0..1): charcoal plastic hangers, card tags, rubber soles, pearl buttons.
const HANGER = [0.16, 0.16, 0.17];
const TAG = [0.96, 0.95, 0.92];
const SOLE = [0.95, 0.94, 0.91];
const PEARL = [0.93, 0.91, 0.86];

const _m = new Matrix(), _r = new Matrix(), _c = new Color3();

/** Tint every vertex: `shade` multiplies the instance colour; `own` (sRGB 0..1) replaces it. */
function paint(vd, shade, own = null) {
  const n = vd.positions.length / 3;
  vd.colors = new Float32Array(n * 4);
  vd.own = new Float32Array(n * 4);
  if (own) _c.set(own[0], own[1], own[2]).toLinearSpaceToRef(_c);
  for (let i = 0; i < n; i++) {
    vd.colors.set([shade, shade, shade, 1], i * 4);
    if (own) vd.own.set([_c.r * shade, _c.g * shade, _c.b * shade, 1], i * 4);
  }
  vd.uvs = null;
  return vd;
}

/** Rotate (XYZ Euler, three's convention as in Products) and move a part. */
function xf(vd, x, y, z, rx = 0, ry = 0, rz = 0) {
  Matrix.RotationZToRef(rz, _m);
  _m.multiplyToRef(Matrix.RotationYToRef(ry, _r), _m);
  _m.multiplyToRef(Matrix.RotationXToRef(rx, _r), _m);
  _m.setTranslationFromFloats(x, y, z);
  return vd.transform(_m);
}

/** A primitive part: shaded fabric, or its own colour. */
const solid = (vd, shade, own, x, y, z, rx, ry, rz) => paint(xf(vd, x, y, z, rx, ry, rz), shade, own);

/**
 * A pillow panel. `at(u, v, o)` (u −1..1 across, v 0..1 down) sets o.x, o.y
 * (silhouette), o.t (half thickness, 0 at the edges), o.z (centre offset)
 * and o.s (shade). Front and back grids share their outline.
 */
function panel(cols, rows, at) {
  const positions = [], colors = [], indices = [];
  const o = { x: 0, y: 0, t: 0, z: 0, s: 1 };
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        o.z = 0; o.s = 1;
        at(-1 + (2 * i) / cols, j / rows, o);
        positions.push(o.x, o.y, o.z + side * o.t);
        colors.push(o.s, o.s, o.s, 1);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
        // Rows run down (−y), columns to +x: this order faces +z on the front.
        if (side > 0) indices.push(a, c, b, b, c, d); else indices.push(a, b, c, b, d, c);
      }
    }
  }
  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = Object.assign(new VertexData(), { positions, indices, normals });
  vd.colors = Float32Array.from(colors);
  vd.own = new Float32Array((positions.length / 3) * 4);
  return vd;
}

/** Soft cross-section: full in the middle, thin at the edges. */
const bulge = (u, p = 0.4) => Math.pow(Math.max(0, 1 - u * u), p);

/** A sleeve: a pillow tube from (x, y) along `angle` (radians below +x), `len` long. */
function sleeve(x, y, angle, len, w0, w1, t, cuff = 0, z = 0) {
  const vd = panel(4, 5, (u, v, o) => {
    const w = w0 + (w1 - w0) * v;
    o.x = u * w / 2; o.y = -v * len; o.t = t * bulge(u, 0.5) * (v < 0.05 ? 0.6 + v * 8 : 1);
    o.s = cuff && v > 1 - cuff ? 0.82 : 0.97 - 0.05 * v;
  });
  // The panel hangs along −y; turn it to the sleeve's angle, its top at the shoulder.
  return xf(vd, x, y, z, 0, 0, Math.PI / 2 - angle);
}

/** Hanger for tops: hook, neck and two sloping arms. */
function topHanger() {
  return [
    solid(torus(0.022, 0.0032, 4, 8, Math.PI), 1, HANGER, 0, -0.022, 0),
    solid(VertexData.CreateCylinder({ diameter: 0.007, height: 0.03, tessellation: 4 }), 1, HANGER, 0, -0.037, 0),
    solid(VertexData.CreateBox({ width: 0.22, height: 0.014, depth: 0.012 }), 1, HANGER, -0.1, -0.09, 0, 0, 0, 0.27),
    solid(VertexData.CreateBox({ width: 0.22, height: 0.014, depth: 0.012 }), 1, HANGER, 0.1, -0.09, 0, 0, 0, -0.27),
  ];
}

/** Clip hanger for bottoms: hook, a straight bar and two clips on the waistband. */
function clipHanger(clips = true) {
  const parts = [
    solid(torus(0.022, 0.0032, 4, 8, Math.PI), 1, HANGER, 0, -0.022, 0),
    solid(VertexData.CreateCylinder({ diameter: 0.007, height: 0.04, tessellation: 4 }), 1, HANGER, 0, -0.042, 0),
    solid(VertexData.CreateBox({ width: 0.38, height: 0.016, depth: 0.012 }), 1, HANGER, 0, -0.068, 0),
  ];
  if (clips) for (const x of [-0.15, 0.15]) parts.push(solid(VertexData.CreateBox({ width: 0.03, height: 0.04, depth: 0.03 }), 1, HANGER, x, -0.085, 0));
  return parts;
}

/** The little price tag on a string, hanging at the neck label. */
const tag = (x, y, z) => solid(VertexData.CreateBox({ width: 0.035, height: 0.05, depth: 0.002 }), 1, TAG, x, y, z, 0, 0, 0.12);

/** A top's body: shoulders sloping from the neck, hanging to `hem`. */
function body({ hem, shoulder = 0.2, chest = 0.215, waist = 0.215, hemW = 0.225, t = 0.03, neck = 0.07, rib = 0, placket = false }) {
  return panel(10, 10, (u, v, o) => {
    const a = Math.abs(u);
    // Neckline scoop in the middle of the shoulder line.
    const top = -0.085 - 0.055 * Math.pow(a, 1.3) - (a < neck / shoulder ? 0.035 * (1 - (a * shoulder) / neck) ** 2 : 0);
    const hw = v < 0.25 ? shoulder + (chest - shoulder) * (v / 0.25)
      : v < 0.6 ? chest + (waist - chest) * ((v - 0.25) / 0.35)
        : waist + (hemW - waist) * ((v - 0.6) / 0.4);
    o.x = u * hw;
    o.y = top + (hem - top) * v;
    o.t = t * bulge(u) * (0.55 + 0.45 * Math.min(1, v * 6)) * (1 - 0.25 * v);
    // Soft vertical folds and a darker underside; ribbed hem band.
    o.s = 0.94 + 0.05 * Math.cos(u * 9) - 0.04 * v;
    if (rib && v > 1 - rib) o.s *= 0.84;
    if (placket && a < 0.06) { o.s *= 0.9; o.t *= 1.04; }
  });
}

const SHAPES = {
  hanger: () => topHanger(),
  clipHanger: () => clipHanger(),
  barHanger: () => clipHanger(false),
  // A garment folded for the bag: a soft stack with a rounded fold at the front.
  folded: () => [
    xf(panel(4, 4, (u, v, o) => { o.x = u * 0.15; o.y = -v * 0.24; o.t = 0.03 * bulge(u, 0.15) * bulge(2 * v - 1, 0.15); o.s = 0.95 - 0.06 * v; }), 0, 0.03, 0.12, Math.PI / 2),
    solid(VertexData.CreateCylinder({ diameter: 0.055, height: 0.3, tessellation: 7 }), 0.9, null, 0, 0.03, 0.12, 0, 0, Math.PI / 2),
  ],
  tee: () => [
    body({ hem: -0.66 }),
    sleeve(-0.19, -0.13, Math.PI - 0.95, 0.17, 0.15, 0.13, 0.024),
    sleeve(0.19, -0.13, 0.95, 0.17, 0.15, 0.13, 0.024),
    solid(torus(0.07, 0.008, 4, 8, Math.PI), 0.88, null, 0, -0.088, 0.012, 0, 0, Math.PI),   // neck rib
    tag(0.02, -0.12, 0.034),
  ],
  hoodie: () => [
    body({ hem: -0.64, shoulder: 0.22, chest: 0.235, waist: 0.235, hemW: 0.23, t: 0.045, neck: 0.085, rib: 0.08 }),
    sleeve(-0.2, -0.14, Math.PI - 1.4, 0.56, 0.15, 0.11, 0.032, 0.12, 0.02),
    sleeve(0.2, -0.14, 1.4, 0.56, 0.15, 0.11, 0.032, 0.12, 0.02),
    // The hood lies folded down the back, its rim round the neck.
    panel(6, 5, (u, v, o) => { o.x = u * 0.15 * Math.sqrt(1 - 0.85 * v * v); o.y = -0.07 - v * 0.26; o.t = 0.04 * bulge(u); o.z = -0.045; o.s = 0.9 - 0.06 * v; }),
    solid(torus(0.085, 0.016, 4, 10, Math.PI), 0.92, null, 0, -0.085, 0.02, 0, 0, Math.PI),
    // Kangaroo pocket and drawstrings.
    panel(4, 2, (u, v, o) => { o.x = u * (0.15 - 0.02 * (1 - v)); o.y = -0.4 - v * 0.15; o.t = 0.006; o.z = 0.047 * (1 - 0.3 * Math.abs(u)); o.s = 0.9; }),
    solid(VertexData.CreateCylinder({ diameter: 0.007, height: 0.15, tessellation: 3 }), 1, PEARL, -0.035, -0.18, 0.06),
    solid(VertexData.CreateCylinder({ diameter: 0.007, height: 0.13, tessellation: 3 }), 1, PEARL, 0.035, -0.17, 0.06),
    tag(0.03, -0.13, 0.05),
  ],
  sweatshirt: () => [
    body({ hem: -0.62, shoulder: 0.22, chest: 0.23, waist: 0.23, hemW: 0.22, t: 0.04, neck: 0.075, rib: 0.08 }),
    sleeve(-0.2, -0.14, Math.PI - 1.4, 0.54, 0.145, 0.11, 0.03, 0.12, 0.02),
    sleeve(0.2, -0.14, 1.4, 0.54, 0.145, 0.11, 0.03, 0.12, 0.02),
    solid(torus(0.075, 0.012, 4, 10, Math.PI), 0.84, null, 0, -0.09, 0.02, 0, 0, Math.PI),     // crew-neck rib
    tag(0.03, -0.13, 0.044),
  ],
  blouse: () => {
    const parts = [
      body({ hem: -0.62, shoulder: 0.195, chest: 0.2, waist: 0.185, hemW: 0.215, t: 0.022, neck: 0.06, placket: true }),
      sleeve(-0.18, -0.13, Math.PI - 1.3, 0.4, 0.13, 0.09, 0.02, 0.1, 0.012),
      sleeve(0.18, -0.13, 1.3, 0.4, 0.13, 0.09, 0.02, 0.1, 0.012),
    ];
    // Collar points lying on the shoulders.
    for (const s of [-1, 1]) parts.push(xf(panel(2, 2, (u, v, o) => { o.x = u * 0.035 * (1 - v * 0.6); o.y = -v * 0.07; o.t = 0.004; o.z = 0.026; o.s = 1.05; }), s * 0.04, -0.095, 0, 0, 0, s * 0.55));
    for (let i = 0; i < 5; i++) parts.push(solid(VertexData.CreateCylinder({ diameter: 0.011, height: 0.004, tessellation: 5 }), 1, PEARL, 0, -0.15 - i * 0.1, 0.024, Math.PI / 2));
    parts.push(tag(0.025, -0.12, 0.026));
    return parts;
  },
  shorts: () => [
    panel(12, 7, (u, v, o) => {
      const a = Math.abs(u);
      // Two legs: the hem rises to the crotch in the middle.
      const hem = -0.4 + 0.13 * Math.max(0, 1 - a / 0.14);
      const hw = 0.18 + 0.04 * v;
      o.x = u * hw; o.y = -0.09 + (hem + 0.09) * v;
      o.t = 0.028 * bulge(u, 0.3) * (a < 0.14 && v > 0.6 ? 0.6 : 1);
      o.s = (v < 0.1 ? 0.84 : 0.96) - 0.04 * v + (a > 0.5 && a < 0.56 ? -0.06 : 0);
    }),
    tag(0.12, -0.12, 0.03),
  ],
  jeans: () => [
    // Folded over the bar: both legs hang as one long panel on each side.
    panel(6, 9, (u, v, o) => {
      o.x = u * (0.13 - 0.025 * v); o.y = -0.072 - v * 0.56;
      o.t = 0.04 * bulge(u, 0.3) * Math.min(1, 0.4 + v * 8);
      // Side seams, the line between the two legs, the hem.
      o.s = 0.95 - 0.05 * v + (Math.abs(u) > 0.82 || Math.abs(u) < 0.06 ? -0.1 : 0) + (v > 0.94 ? -0.08 : 0);
    }),
    solid(VertexData.CreateCylinder({ diameter: 0.05, height: 0.26, tessellation: 7 }), 0.98, null, 0, -0.072, 0, 0, 0, Math.PI / 2),   // the fold
    tag(0.1, -0.1, 0.045),
  ],
  skirt: () => [
    panel(28, 5, (u, v, o) => {
      const pleat = Math.cos(u * Math.PI * 7);
      o.x = u * (0.17 + 0.11 * v); o.y = -0.09 - v * 0.43;
      o.t = (0.022 + 0.01 * v) * bulge(u, 0.25);
      o.z = 0.012 * pleat * v;
      o.s = v < 0.1 ? 0.84 : 0.93 + 0.07 * pleat * Math.min(1, v * 3);
    }),
    tag(0.12, -0.12, 0.03),
  ],
  sneakers: () => {
    const parts = [];
    for (const s of [-1, 1]) {
      const x = s * 0.062, ry = -s * 0.06;
      const shoe = [
        solid(VertexData.CreateCylinder({ diameter: 1, height: 0.026, tessellation: 12 }), 1, SOLE, 0, 0.013, 0),
        solid(VertexData.CreateSphere({ segments: 6, diameterX: 0.088, diameterY: 0.11, diameterZ: 0.25, slice: 0.5 }), 1, null, 0, 0.024, -0.005),
        solid(VertexData.CreateCylinder({ diameter: 1, height: 0.008, tessellation: 8 }), 0.35, [0.22, 0.22, 0.24], 0, 0.073, -0.065),   // opening
        solid(VertexData.CreateBox({ width: 0.04, height: 0.006, depth: 0.05 }), 1.05, null, 0, 0.078, -0.022, -0.35),                    // tongue
        solid(VertexData.CreateBox({ width: 0.05, height: 0.035, depth: 0.012 }), 0.82, null, 0, 0.055, -0.128),                         // heel tab
      ];
      // The sole and opening are unit cylinders: squash them to the footprint.
      squash(shoe[0], 0.096, 0.262);
      squash(shoe[2], 0.055, 0.08);
      for (let i = 0; i < 4; i++) {
        const z = 0.005 + i * 0.022, y = 0.024 + 0.055 * Math.sqrt(Math.max(0, 1 - ((z + 0.005) / 0.125) ** 2)) + 0.002;
        shoe.push(solid(VertexData.CreateBox({ width: 0.05, height: 0.005, depth: 0.007 }), 1, SOLE, 0, y, z, -0.3 - i * 0.12));
      }
      for (const p of shoe) parts.push(xf(p, x, 0, 0, 0, ry, 0));
    }
    parts.push(tag(0, 0.06, 0.12));
    return parts;
  },
};

/** Scale a part's x and z (a unit cylinder to an oval footprint). */
function squash(vd, sx, sz) {
  const p = vd.positions;
  for (let i = 0; i < p.length; i += 3) { p[i] *= sx; p[i + 2] *= sz; }
}

/** The hanger each garment hangs on (sneakers stand on the shelf). */
export const HANGER_OF = { tee: 'hanger', hoodie: 'hanger', sweatshirt: 'hanger', blouse: 'hanger', shorts: 'clipHanger', skirt: 'clipHanger', jeans: 'barHanger' };
const HANGERS = new Set(Object.values(HANGER_OF));

/** `aOwn` (own colour × weight) replaces the dyed colour on hangers, tags, soles. */
class OwnColorPlugin extends MaterialPluginBase {
  constructor(material) {
    super(material, 'OwnColor', 200, { OWN_COLOR: false });
    this._enable(true);
  }
  prepareDefines(defines) { defines.OWN_COLOR = true; }
  getClassName() { return 'OwnColorPlugin'; }
  getAttributes(attributes) { attributes.push('aOwn'); }
  getCustomCode(type) {
    if (type === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: 'attribute vec4 aOwn;\nvarying vec4 vOwn;',
        CUSTOM_VERTEX_MAIN_END: 'vOwn = aOwn;',
      };
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'varying vec4 vOwn;',
      CUSTOM_FRAGMENT_UPDATE_ALPHA: 'surfaceAlbedo = mix(surfaceAlbedo, vOwn.rgb, vOwn.a);',
    };
  }
}

/** The fabric material shared by every garment (made once per scene, freed with the set). */
function fabric(scene) {
  const m = new PBRMaterial('mall:fabric', scene);
  m.metallic = 0;
  m.roughness = 0.88;
  m.environmentIntensity = 0.6;
  new OwnColorPlugin(m);   // registers itself with the material
  return m;
}

function shapeData(shape) {
  const parts = SHAPES[shape]();
  const own = parts.map((p) => p.own);
  for (const p of parts) p.own = null;
  const vd = parts[0].merge(parts.slice(1), true);
  // merge() keeps only standard attributes: own colours are concatenated in order.
  const flat = new Float32Array(vd.positions.length / 3 * 4);
  let o = 0;
  for (const a of own) { flat.set(a, o); o += a.length; }
  return { vd, own: flat };
}

const _q = new Quaternion(), _s = new Vector3(), _p = new Vector3(), _mat = new Matrix();

/**
 * Every garment of the store as thin instances: per type one mesh, its units
 * added at stocking time (build() once), then moved with place() / hidden;
 * flush() uploads the changed buffers once per frame.
 */
export class GarmentSet {
  constructor(scene) {
    this.scene = scene;
    this.material = fabric(scene);
    this.groups = new Map();   // shape -> { mesh, units, matrices, colors, dirty }
  }

  /**
   * A new unit of `shape` in `hex` (call before build()). A hanging garment
   * gets its hanger as a unit of its own (it comes off at the till), moved
   * with the garment while `u.onHanger`.
   */
  add(shape, hex, scale = 1) {
    if (!this.groups.has(shape)) this.groups.set(shape, { units: [] });
    const g = this.groups.get(shape);
    const u = { shape, hex, scale, index: g.units.length, visible: true, x: null, hanger: null, onHanger: false };
    g.units.push(u);
    if (HANGER_OF[shape]) { u.hanger = this.add(HANGER_OF[shape], '#ffffff'); u.onHanger = true; }
    return u;
  }

  /**
   * Make the meshes. `bounds` ({ min, max } world points) covers everywhere a
   * garment can go (racks, her hands, fitting rooms, the till): culling
   * then never needs a bounding refresh while one moves.
   */
  build(bounds) {
    for (const [shape, g] of this.groups) {
      const { vd, own } = shapeData(shape);
      const mesh = new Mesh(`mall:garment:${shape}`, this.scene);
      vd.applyToMesh(mesh);
      mesh.setVerticesData('aOwn', own, false, 4);
      mesh.material = this.material;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      const n = g.units.length;
      g.matrices = new Float32Array(n * 16);
      g.colors = new Float32Array(n * 4);
      for (const u of g.units) {
        Color3.FromHexString(u.hex).toLinearSpaceToRef(_c);
        g.colors.set([_c.r, _c.g, _c.b, 1], u.index * 4);
      }
      mesh.thinInstanceSetBuffer('matrix', g.matrices, 16, false);
      mesh.thinInstanceSetBuffer('color', g.colors, 4, false);
      mesh.setBoundingInfo(new BoundingInfo(bounds.min, bounds.max));
      mesh.doNotSyncBoundingInfo = true;
      mesh.freezeWorldMatrix();   // units move in the instance buffer, the mesh never does
      g.mesh = mesh;
    }
  }

  get meshes() { return [...this.groups.values()].map((g) => g.mesh).filter(Boolean); }

  /** The garments' meshes: shadow casters (hangers and the folded pieces are too thin to matter). */
  get casters() { return [...this.groups].filter(([shape, g]) => g.mesh && !HANGERS.has(shape) && shape !== 'folded').map(([, g]) => g.mesh); }

  /** Put a unit at a world point, turned by yaw, tipped by `roll` (sway about its hook) and `pitch`. */
  place(u, x, y, z, yaw, roll = 0, pitch = 0) {
    const g = this.groups.get(u.shape);
    Quaternion.RotationYawPitchRollToRef(yaw, pitch, roll, _q);
    Matrix.ComposeToRef(_s.setAll(u.visible ? u.scale : 0), _q, _p.set(x, y, z), _mat);
    _mat.copyToArray(g.matrices, u.index * 16);
    u.x = x; u.y = y; u.z = z; u.yaw = yaw; u.roll = roll; u.pitch = pitch;
    g.dirty = true;
    if (u.onHanger) this.place(u.hanger, x, y, z, yaw, roll, pitch);
  }

  /** Place with a full matrix (lying flat on the till, folding). */
  placeMatrix(u, m) {
    const g = this.groups.get(u.shape);
    m.copyToArray(g.matrices, u.index * 16);
    g.dirty = true;
  }

  /** Show / hide a unit alone (worn: the empty hanger stays on the hook). */
  setVisible(u, visible) {
    if (u.visible === visible) return;
    u.visible = visible;
    if (u.x == null) return;
    const on = u.onHanger;
    u.onHanger = false;
    this.place(u, u.x, u.y, u.z, u.yaw, u.roll, u.pitch);
    u.onHanger = on;
  }

  /** A pooled unit takes another garment's colour (the folded one at the till). */
  recolor(u, hex) {
    const g = this.groups.get(u.shape);
    Color3.FromHexString(hex).toLinearSpaceToRef(_c);
    g.colors.set([_c.r, _c.g, _c.b, 1], u.index * 4);
    g.mesh.thinInstanceBufferUpdated('color');
  }

  /** Upload what moved this frame. */
  flush() {
    for (const g of this.groups.values()) {
      if (!g.dirty || !g.mesh) continue;
      g.dirty = false;
      g.mesh.thinInstanceBufferUpdated('matrix');
    }
  }

  dispose() {
    for (const g of this.groups.values()) g.mesh?.dispose();
    this.groups.clear();
    this.material.dispose(true, false);
  }
}
