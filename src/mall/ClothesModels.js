import { BoundingInfo, Color3, MaterialPluginBase, Matrix, Mesh, PBRMaterial, Quaternion, Vector3, VertexData } from '@babylonjs/core';
import { torus } from '../interiors/Products.js';
import { BRAND_TAG, PRINT_CELL, TAG_CELL, TAG_COLS, fabricTexture, garmentPrintTexture } from './GarmentPrint.js';
import { simplifyGeometry } from '../core/Simplify.js';
import { SHADOW_ONLY_LAYER } from '../world/City.js';

/**
 * Clothes for the Sakura Style store: one procedural model per garment type
 * (tee, hoodie, sweatshirt, blouse, shorts, jeans, skirt on their hangers,
 * a pair of sneakers), matching the garments she wears (src/player/Garments.js)
 * so what she takes off the rack is what she tries on.
 *
 * Fabric panels are "pillows": a silhouette grid whose front and back meet
 * at the edges, bulging in the middle and falling in soft folds from the
 * hanger, so a hanging tee has shoulders, a soft body and sleeves instead of
 * a box. Vertex colours carry the shading (ribbing, seams, pleats); the
 * instance colour dyes the fabric; parts with their own colour (hanger,
 * buttons, soles, laces) take it from `aOwn` instead.
 *
 * What makes a garment read as real merchandise is in the material
 * (GarmentPlugin), per unit (catalog style): the cloth's weave from a tiling
 * texture (jersey, fleece, denim, plain weave), a woven or printed pattern
 * in an accent colour (stripes, plaid, dots, pinstripe, heather, washed
 * denim), the label's print on the chest / the shoes' side / the jeans'
 * patch, contrast stitching, a printed hang tag and the size chip on the
 * hanger. One material, one draw per garment type for the whole store,
 * shadows included.
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
const RUBBER = [0.22, 0.22, 0.24];

/** Size chips on the hanger necks (S, M, L), by the unit's scale. */
const SIZE_CHIP = ['#e0574a', '#3a7bd5', '#3aa05a'];
const sizeOf = (scale) => (scale < 0.975 ? 0 : scale > 1.025 ? 2 : 1);

// Per-unit look codes (GarmentPlugin): patterns and cloths.
const PATTERN = { stripes: 1, plaid: 2, heather: 3, dots: 4, pinstripe: 5, wash: 6 };
const FABRIC = { jersey: 0, fleece: 1, denim: 2, woven: 3, twill: 4, canvas: 5 };
// Per-vertex detail codes (aPrint.z): stitched hem of a top, denim stitching, a hang tag's face.
const HEM = 1, DENIM = 2, TAG_FACE = 3;

const _m = new Matrix(), _r = new Matrix(), _c = new Color3();

/** Tint every vertex: `shade` multiplies the instance colour; `own` (sRGB 0..1) replaces it. */
function paint(vd, shade, own = null) {
  const n = vd.positions.length / 3;
  vd.colors = new Float32Array(n * 4);
  vd.own = new Float32Array(n * 4);
  vd.print = new Float32Array(n * 3).fill(-1);
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
 * (silhouette), o.t (half thickness, 0 at the edges), o.z (centre offset),
 * o.s (shade) and, on the front, o.pu / o.pv / o.pd (print uv, v up, and
 * detail code; −1: none). Front and back grids share their outline.
 */
function panel(cols, rows, at) {
  const positions = [], colors = [], print = [], indices = [];
  const o = { x: 0, y: 0, t: 0, z: 0, s: 1, pu: -1, pv: -1, pd: 0 };
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        o.z = 0; o.s = 1; o.pu = -1; o.pv = -1; o.pd = 0;
        at(-1 + (2 * i) / cols, j / rows, o);
        positions.push(o.x, o.y, o.z + side * o.t);
        colors.push(o.s, o.s, o.s, 1);
        if (side > 0) print.push(o.pu, o.pv, o.pd); else print.push(-1, -1, 0);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
        // Rows run down (−y), columns to +x: wound so the front grid shows from +z, the back from −z.
        if (side > 0) indices.push(a, b, c, b, d, c); else indices.push(a, c, b, b, c, d);
      }
    }
  }
  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = Object.assign(new VertexData(), { positions, indices, normals });
  vd.colors = Float32Array.from(colors);
  vd.own = new Float32Array((positions.length / 3) * 4);
  vd.print = Float32Array.from(print);
  return vd;
}

/** Soft cross-section: full in the middle, thin at the edges. */
const bulge = (u, p = 0.4) => Math.pow(Math.max(0, 1 - u * u), p);

/** A sleeve: a pillow tube from (x, y) along `angle` (radians below +x), `len` long. */
function sleeve(x, y, angle, len, w0, w1, t, cuff = 0, z = 0) {
  const vd = panel(4, 5, (u, v, o) => {
    const w = w0 + (w1 - w0) * v;
    o.x = u * w / 2; o.y = -v * len; o.t = t * bulge(u, 0.5) * (v < 0.05 ? 0.6 + v * 8 : 1);
    // A fold across the elbow of long sleeves; the cuff band.
    o.z = len > 0.3 ? 0.006 * Math.sin(v * Math.PI * 3) : 0;
    o.s = cuff && v > 1 - cuff ? 0.82 : 0.97 - 0.05 * v;
  });
  // The panel hangs along −y; turn it to the sleeve's angle, its top at the shoulder.
  return xf(vd, x, y, z, 0, 0, Math.PI / 2 - angle);
}

/** The size chip on a hanger's neck (dyed by the hanger unit's colour). */
const chip = (y) => solid(VertexData.CreateBox({ width: 0.026, height: 0.014, depth: 0.016 }), 1, null, 0, y, 0);

/** Hanger for tops: hook, neck with its size chip and two sloping arms. */
function topHanger() {
  return [
    solid(torus(0.022, 0.0032, 4, 8, Math.PI), 1, HANGER, 0, -0.022, 0),
    solid(VertexData.CreateCylinder({ diameter: 0.007, height: 0.03, tessellation: 4 }), 1, HANGER, 0, -0.037, 0),
    chip(-0.045),
    solid(VertexData.CreateBox({ width: 0.22, height: 0.014, depth: 0.012 }), 1, HANGER, -0.1, -0.09, 0, 0, 0, 0.27),
    solid(VertexData.CreateBox({ width: 0.22, height: 0.014, depth: 0.012 }), 1, HANGER, 0.1, -0.09, 0, 0, 0, -0.27),
  ];
}

/** Clip hanger for bottoms: hook, a straight bar and two clips on the waistband. */
function clipHanger(clips = true) {
  const parts = [
    solid(torus(0.022, 0.0032, 4, 8, Math.PI), 1, HANGER, 0, -0.022, 0),
    solid(VertexData.CreateCylinder({ diameter: 0.007, height: 0.04, tessellation: 4 }), 1, HANGER, 0, -0.042, 0),
    chip(-0.05),
    solid(VertexData.CreateBox({ width: 0.38, height: 0.016, depth: 0.012 }), 1, HANGER, 0, -0.068, 0),
  ];
  if (clips) for (const x of [-0.15, 0.15]) parts.push(solid(VertexData.CreateBox({ width: 0.03, height: 0.04, depth: 0.03 }), 1, HANGER, x, -0.085, 0));
  return parts;
}

/** The label's hang tag on its string: a printed card (the unit's label) with a plain back. */
function tag(x, y, z, a = 0.12) {
  const w = 0.034, h = 0.058;
  const face = Object.assign(new VertexData(), {
    positions: [-w / 2, h / 2, 0.0012, w / 2, h / 2, 0.0012, -w / 2, -h / 2, 0.0012, w / 2, -h / 2, 0.0012],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    indices: [0, 1, 2, 2, 1, 3],
  });
  paint(face, 1);
  face.print.set([0, 1, TAG_FACE, 1, 1, TAG_FACE, 0, 0, TAG_FACE, 1, 0, TAG_FACE]);
  return [
    xf(face, x, y, z, 0, 0, a),
    solid(VertexData.CreateBox({ width: w, height: h, depth: 0.002 }), 1, TAG, x, y, z, 0, 0, a),
    solid(VertexData.CreateBox({ width: 0.0015, height: 0.03, depth: 0.0015 }), 1, TAG, x - Math.sin(a) * 0.04, y + 0.04, z),
  ];
}

const SHOULDER = -0.08;   // a top's print box: from the shoulder line down 0.62 m, 0.5 m wide (GarmentPrint's aspect)

/** A top's body: shoulders sloping from the neck, hanging to `hem`, falling in folds below the hanger's ends. */
function body({ hem, shoulder = 0.2, chest = 0.215, waist = 0.215, hemW = 0.225, t = 0.03, neck = 0.07, rib = 0, placket = false, drape = 0.008 }) {
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
    // Folds hang from where the hanger's arms end, deepening to the hem.
    o.z = drape * Math.sin(u * Math.PI * 2.5 + 0.6) * Math.min(1, v * 1.6);
    // A darker underside; ribbed hem band.
    o.s = 0.95 - 0.05 * v;
    if (rib && v > 1 - rib) o.s *= 0.84;
    if (placket && a < 0.06) { o.s *= 0.9; o.t *= 1.04; }
    o.pu = (o.x + 0.25) / 0.5; o.pv = 1 - (SHOULDER - o.y) / 0.62; o.pd = rib ? 0 : HEM;
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
    ...tag(0.03, -0.14, 0.036),
  ],
  hoodie: () => [
    body({ hem: -0.64, shoulder: 0.22, chest: 0.235, waist: 0.235, hemW: 0.23, t: 0.045, neck: 0.085, rib: 0.08, drape: 0.006 }),
    sleeve(-0.2, -0.14, Math.PI - 1.4, 0.56, 0.15, 0.11, 0.032, 0.12, 0.02),
    sleeve(0.2, -0.14, 1.4, 0.56, 0.15, 0.11, 0.032, 0.12, 0.02),
    // The hood lies folded down the back, its rim round the neck.
    panel(6, 5, (u, v, o) => { o.x = u * 0.15 * Math.sqrt(1 - 0.85 * v * v); o.y = -0.07 - v * 0.26; o.t = 0.04 * bulge(u); o.z = -0.045; o.s = 0.9 - 0.06 * v; }),
    solid(torus(0.085, 0.016, 4, 10, Math.PI), 0.92, null, 0, -0.085, 0.02, 0, 0, Math.PI),
    // Kangaroo pocket and drawstrings with their metal tips.
    panel(4, 2, (u, v, o) => { o.x = u * (0.15 - 0.02 * (1 - v)); o.y = -0.42 - v * 0.15; o.t = 0.006; o.z = 0.047 * (1 - 0.3 * Math.abs(u)); o.s = 0.9; }),
    solid(VertexData.CreateCylinder({ diameter: 0.007, height: 0.15, tessellation: 3 }), 1, PEARL, -0.035, -0.18, 0.06),
    solid(VertexData.CreateCylinder({ diameter: 0.007, height: 0.13, tessellation: 3 }), 1, PEARL, 0.035, -0.17, 0.06),
    solid(VertexData.CreateCylinder({ diameter: 0.009, height: 0.02, tessellation: 4 }), 1, [0.7, 0.68, 0.64], -0.035, -0.265, 0.06),
    solid(VertexData.CreateCylinder({ diameter: 0.009, height: 0.02, tessellation: 4 }), 1, [0.7, 0.68, 0.64], 0.035, -0.245, 0.06),
    ...tag(0.03, -0.14, 0.05),
  ],
  sweatshirt: () => [
    body({ hem: -0.62, shoulder: 0.22, chest: 0.23, waist: 0.23, hemW: 0.22, t: 0.04, neck: 0.075, rib: 0.08, drape: 0.006 }),
    sleeve(-0.2, -0.14, Math.PI - 1.4, 0.54, 0.145, 0.11, 0.03, 0.12, 0.02),
    sleeve(0.2, -0.14, 1.4, 0.54, 0.145, 0.11, 0.03, 0.12, 0.02),
    solid(torus(0.075, 0.012, 4, 10, Math.PI), 0.84, null, 0, -0.09, 0.02, 0, 0, Math.PI),     // crew-neck rib
    ...tag(0.03, -0.14, 0.044),
  ],
  blouse: () => {
    const parts = [
      body({ hem: -0.62, shoulder: 0.195, chest: 0.2, waist: 0.185, hemW: 0.215, t: 0.022, neck: 0.06, placket: true, drape: 0.01 }),
      sleeve(-0.18, -0.13, Math.PI - 1.3, 0.4, 0.13, 0.09, 0.02, 0.1, 0.012),
      sleeve(0.18, -0.13, 1.3, 0.4, 0.13, 0.09, 0.02, 0.1, 0.012),
    ];
    // Collar points lying on the shoulders.
    for (const s of [-1, 1]) parts.push(xf(panel(2, 2, (u, v, o) => { o.x = u * 0.035 * (1 - v * 0.6); o.y = -v * 0.07; o.t = 0.004; o.z = 0.026; o.s = 1.05; }), s * 0.04, -0.095, 0, 0, 0, s * 0.55));
    for (let i = 0; i < 5; i++) parts.push(solid(VertexData.CreateCylinder({ diameter: 0.011, height: 0.004, tessellation: 5 }), 1, PEARL, 0, -0.15 - i * 0.1, 0.024, Math.PI / 2));
    parts.push(...tag(0.025, -0.13, 0.028));
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
      // The print box runs from the waistband down, as wide as the shorts (the patch's aspect).
      o.pu = (o.x + 0.22) / 0.44; o.pv = 1 - (-0.09 - o.y) / 1.01; o.pd = DENIM;
    }),
    ...tag(0.12, -0.13, 0.03),
  ],
  jeans: () => [
    // Folded over the bar: both legs hang as one long panel on each side.
    panel(6, 9, (u, v, o) => {
      o.x = u * (0.13 - 0.025 * v); o.y = -0.072 - v * 0.56;
      o.t = 0.04 * bulge(u, 0.3) * Math.min(1, 0.4 + v * 8);
      // Side seams, the line between the two legs, the hem.
      o.s = 0.95 - 0.05 * v + (Math.abs(u) > 0.82 || Math.abs(u) < 0.06 ? -0.1 : 0) + (v > 0.94 ? -0.08 : 0);
      o.pu = (o.x + 0.13) / 0.26; o.pv = 1 - (-0.072 - o.y) / 0.6; o.pd = DENIM;
    }),
    solid(VertexData.CreateCylinder({ diameter: 0.05, height: 0.26, tessellation: 7 }), 0.98, null, 0, -0.072, 0, 0, 0, Math.PI / 2),   // the fold
    ...tag(0.1, -0.11, 0.045),
  ],
  skirt: () => [
    panel(28, 5, (u, v, o) => {
      const pleat = Math.cos(u * Math.PI * 7);
      o.x = u * (0.17 + 0.11 * v); o.y = -0.09 - v * 0.43;
      o.t = (0.022 + 0.01 * v) * bulge(u, 0.25);
      o.z = 0.012 * pleat * v;
      o.s = v < 0.1 ? 0.84 : 0.93 + 0.07 * pleat * Math.min(1, v * 3);
    }),
    ...tag(0.12, -0.13, 0.03),
  ],
  sneakers: () => {
    const parts = [];
    for (const s of [-1, 1]) {
      const x = s * 0.062, ry = -s * 0.06;
      const upper = solid(VertexData.CreateSphere({ segments: 8, diameterX: 0.088, diameterY: 0.11, diameterZ: 0.25, slice: 0.5 }), 1, null, 0, 0.024, -0.005);
      // The upper's sides carry the label's mark (projected along x: both sides, the ink only where it is drawn).
      for (let i = 0, n = upper.positions.length / 3; i < n; i++) upper.print.set([(upper.positions[i * 3 + 2] + 0.13) / 0.26, (upper.positions[i * 3 + 1] - 0.012) / 0.091, 0], i * 3);
      const shoe = [
        solid(VertexData.CreateCylinder({ diameter: 1, height: 0.012, tessellation: 14 }), 1, RUBBER, 0, 0.006, 0),     // outsole
        solid(VertexData.CreateCylinder({ diameter: 1, height: 0.02, tessellation: 14 }), 1, SOLE, 0, 0.021, 0),       // midsole
        upper,
        solid(VertexData.CreateSphere({ segments: 6, diameterX: 0.09, diameterY: 0.05, diameterZ: 0.09, slice: 0.5 }), 1, SOLE, 0, 0.024, 0.075),   // toe cap
        solid(VertexData.CreateCylinder({ diameter: 1, height: 0.008, tessellation: 8 }), 0.35, [0.22, 0.22, 0.24], 0, 0.073, -0.065),   // opening
        solid(VertexData.CreateTorus({ diameter: 1, thickness: 0.18, tessellation: 10 }), 0.95, null, 0, 0.074, -0.065),              // padded collar
        solid(VertexData.CreateBox({ width: 0.04, height: 0.006, depth: 0.05 }), 1.05, null, 0, 0.078, -0.022, -0.35),                    // tongue
        solid(VertexData.CreateBox({ width: 0.05, height: 0.035, depth: 0.012 }), 0.82, null, 0, 0.055, -0.128),                         // heel tab
      ];
      // The soles and the opening are unit shapes: squash them to the footprint.
      squash(shoe[0], 0.098, 0.264);
      squash(shoe[1], 0.096, 0.262);
      squash(shoe[4], 0.055, 0.08);
      squash(shoe[5], 0.06, 0.088, 0.08);
      for (let i = 0; i < 4; i++) {
        const z = 0.005 + i * 0.022, y = 0.024 + 0.055 * Math.sqrt(Math.max(0, 1 - ((z + 0.005) / 0.125) ** 2)) + 0.002;
        shoe.push(solid(VertexData.CreateBox({ width: 0.05, height: 0.005, depth: 0.007 }), 1, SOLE, 0, y, z, -0.3 - i * 0.12));
      }
      for (const p of shoe) parts.push(xf(p, x, 0, 0, 0, ry, 0));
    }
    parts.push(...tag(0, 0.06, 0.12, 0));
    return parts;
  },
};

/** Scale a part's x and z (a unit shape to an oval footprint), and its height about its centre. */
function squash(vd, sx, sz, sy = 1) {
  const p = vd.positions;
  let y0 = 0;
  for (let i = 1; i < p.length; i += 3) y0 += p[i];
  y0 /= p.length / 3;
  for (let i = 0; i < p.length; i += 3) { p[i] *= sx; p[i + 1] = y0 + (p[i + 1] - y0) * sy; p[i + 2] *= sz; }
}

/** The hanger each garment hangs on (sneakers stand on the shelf). */
export const HANGER_OF = { tee: 'hanger', hoodie: 'hanger', sweatshirt: 'hanger', blouse: 'hanger', shorts: 'clipHanger', skirt: 'clipHanger', jeans: 'barHanger' };
const HANGERS = new Set(Object.values(HANGER_OF));

/**
 * The garments' look in the shader. Per vertex: aOwn (own colour × weight
 * replaces the dye), aPrint (print uv, v up, and a detail code). Per unit:
 * aStyle (print cell, label's tag, pattern, cloth) and aAccent (the
 * pattern's / mark's colour; a = 1: the print is inked in it).
 */
class GarmentPlugin extends MaterialPluginBase {
  constructor(material, prints, cloth) {
    super(material, 'Garment', 200, { GARMENT: false });
    this._prints = prints;
    this._cloth = cloth;
    this._enable(true);
  }
  prepareDefines(defines) { defines.GARMENT = true; }
  getClassName() { return 'GarmentPlugin'; }
  getAttributes(attributes) { attributes.push('aOwn', 'aPrint', 'aStyle', 'aAccent'); }
  getSamplers(samplers) { samplers.push('garmentPrint', 'garmentCloth'); }
  bindForSubMesh(ubo) {
    ubo.setTexture('garmentPrint', this._prints);
    ubo.setTexture('garmentCloth', this._cloth);
  }
  getCustomCode(type) {
    const varyings = 'varying vec4 vOwn;\nvarying vec3 vPrint;\nvarying vec4 vStyle;\nvarying vec4 vAccent;\nvarying vec3 vCloth;\nvarying float vShadeG;';
    if (type === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `attribute vec4 aOwn;\nattribute vec3 aPrint;\nattribute vec4 aStyle;\nattribute vec4 aAccent;\n${varyings}`,
        CUSTOM_VERTEX_MAIN_END: `
          vOwn = aOwn; vPrint = aPrint; vStyle = aStyle; vAccent = aAccent; vShadeG = color.r;
          // Cloth coordinates in metres of the garment, projected along its main axis.
          vec3 an = abs(normal);
          vCloth = vec3(an.y > 0.75 ? position.xz : an.x > an.z ? position.zy : position.xy, position.y);`,
      };
    }
    const c = (n) => `vec2(${(n % 4).toFixed(1)}, ${Math.floor(n / 4).toFixed(1)})`;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `uniform sampler2D garmentPrint;\nuniform sampler2D garmentCloth;\n${varyings}
        float blur(float k) {
          // 0 while a pattern of frequency k is sharp on screen, 1 once a period is under ~2 px (show its average: no moiré).
          return clamp(fwidth(k) * 2.0 - 0.5, 0.0, 1.0);
        }
        float stitch(float d, float along, float px) {
          // A dashed thread line at distance d, faded out when thinner than a pixel.
          float w = 0.0035;
          return smoothstep(w, w * 0.4, abs(d)) * step(0.45, fract(along)) * smoothstep(w * 2.0, w * 0.8, px);
        }`,
      CUSTOM_FRAGMENT_UPDATE_ALPHA: `
        float shade = max(vShadeG, 0.001), pat = vStyle.z, fab = vStyle.w;
        vec3 dye = surfaceAlbedo / shade, acc = vAccent.rgb;
        vec2 p = vCloth.xy;
        vec4 f = texture2D(garmentCloth, p / 0.06);
        // Woven and printed patterns, sized in metres of cloth.
        if (pat > 0.5 && pat < 1.5) dye = mix(dye, acc, mix(step(0.58, fract(vCloth.z * 33.0)), 0.42, blur(vCloth.z * 33.0)));
        else if (pat > 1.5 && pat < 2.5) {
          float a = step(0.62, fract(p.x * 12.5)), b = step(0.62, fract(p.y * 12.5));
          dye = mix(dye, acc, 0.42 * (a + b));
          dye = mix(dye, vec3(0.8, 0.68, 0.25), 0.7 * (step(0.96, fract(p.x * 12.5 + 0.3)) + step(0.96, fract(p.y * 12.5 + 0.3))));
        }
        else if (pat > 2.5 && pat < 3.5) dye = mix(dye * (0.88 + 0.24 * f.r), vec3(0.88), step(0.8, f.a) * 0.35);
        else if (pat > 3.5 && pat < 4.5) dye = mix(dye, acc, mix(smoothstep(0.17, 0.13, length(fract(p * 40.0) - 0.5)), 0.07, blur(p.x * 40.0)));
        else if (pat > 4.5 && pat < 5.5) dye = mix(dye, acc, mix(smoothstep(0.06, 0.0, abs(fract(p.x * 100.0) - 0.5) - 0.42), 0.14, blur(p.x * 100.0)));
        else if (pat > 5.5 && vPrint.x > -0.5) dye = mix(dye, dye * 1.6 + 0.05, 0.6 * smoothstep(0.3, 0.0, abs(fract(vPrint.x * 2.0) - 0.5)) * smoothstep(0.95, 0.4, vPrint.y));
        // The weave, faint: cloth reads as flat anime colour with a hint of
        // its fabric. At full strength (±10–15 % in a 6 cm repeat) it showed
        // as grain up close and greyed the dye once filtered far away.
        float w = fab < 0.5 ? f.r : fab < 1.5 ? f.a : fab < 2.5 ? f.g : fab < 3.5 ? f.b : fab < 4.5 ? f.g : f.b;
        if (fab > 1.5 && fab < 2.5) dye = mix(dye * 0.84, mix(dye, vec3(0.75, 0.78, 0.84), 0.25), w);
        else dye *= fab < 0.5 ? mix(0.92, 1.04, w) : fab < 1.5 ? mix(0.94, 1.03, w) : fab < 4.5 ? mix(0.95, 1.025, w) : mix(0.96, 1.02, w);
        vec3 col = dye * shade;
        if (vPrint.x > -0.5) {
          vec2 q = clamp(vPrint.xy, 0.01, 0.99);
          if (vPrint.z > 2.5) {
            // The hang tag: the unit's label in the tag cell (${TAG_COLS} × 2 slots).
            vec2 slot = vec2(mod(vStyle.y, ${TAG_COLS.toFixed(1)}), 1.0 - floor(vStyle.y / ${TAG_COLS.toFixed(1)}));
            col = toLinearSpace(texture2D(garmentPrint, (${c(TAG_CELL)} + (slot + q) * vec2(${(1 / TAG_COLS).toFixed(4)}, 0.5)) / 4.0).rgb) * shade;
          } else {
            if (vStyle.x > -0.5) {
              vec4 pr = texture2D(garmentPrint, (vec2(mod(vStyle.x, 4.0), floor(vStyle.x / 4.0)) + q) / 4.0);
              vec3 ink = vAccent.a > 0.5 ? acc * pr.rgb : toLinearSpace(pr.rgb);
              col = mix(col, ink * shade * mix(0.9, 1.04, w), pr.a);
            }
            // Stitching: a top's double-needle hem; denim's contrast thread at the waistband, side seams and hem.
            float px = length(fwidth(vPrint.xy));
            vec3 thread = vPrint.z > 1.5 ? vec3(0.62, 0.42, 0.14) : dye * 0.62;
            float s = 0.0;
            if (vPrint.z > 0.5 && vPrint.z < 1.5) s = stitch(vPrint.y - 0.035, vPrint.x * 90.0, px) + stitch(vPrint.y - 0.05, vPrint.x * 90.0, px);
            else if (vPrint.z > 1.5) s = stitch(vPrint.y - 0.935, vPrint.x * 60.0, px) + stitch(vPrint.y - 0.985, vPrint.x * 60.0, px)
              + stitch(vPrint.x - 0.035, vPrint.y * 60.0, px) + stitch(vPrint.x - 0.965, vPrint.y * 60.0, px) + stitch(vPrint.y - 0.03, vPrint.x * 60.0, px);
            col = mix(col, thread * shade, min(s, 1.0) * 0.85);
          }
        }
        surfaceAlbedo = mix(col, vOwn.rgb, vOwn.a);`,
    };
  }
}

/** The fabric material shared by every garment, with its print and cloth textures (made per set, freed with it). */
function fabric(scene, prints, cloth) {
  const m = new PBRMaterial('mall:fabric', scene);
  m.metallic = 0;
  m.roughness = 0.88;
  m.environmentIntensity = 0.6;
  new GarmentPlugin(m, prints, cloth);   // registers itself with the material
  return m;
}

/** A mesh with a garment shape's vertex data (shapeData) and its own colour / print attributes. */
function shapeMesh(scene, vd, own, print) {
  const mesh = new Mesh('', scene);
  vd.applyToMesh(mesh);
  mesh.setVerticesData('aOwn', own, false, 4);
  mesh.setVerticesData('aPrint', print, false, 3);
  return mesh;
}

/** The vertices `index` uses of a garment shape's data (shapeData), compacted. */
function subsetData(vd, own, print, index) {
  const remap = new Int32Array(vd.positions.length / 3).fill(-1);
  let n = 0;
  const indices = new Uint32Array(index.length);
  for (let i = 0; i < index.length; i++) {
    const v = index[i];
    if (remap[v] < 0) remap[v] = n++;
    indices[i] = remap[v];
  }
  const pick = (src, stride) => {
    if (!src) return null;
    const out = new Float32Array(n * stride);
    for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) for (let k = 0; k < stride; k++) out[remap[v] * stride + k] = src[v * stride + k];
    return out;
  };
  const out = new VertexData();
  out.positions = pick(vd.positions, 3);
  out.normals = pick(vd.normals, 3);
  out.uvs = pick(vd.uvs, 2);
  out.colors = pick(vd.colors, 4);
  out.indices = indices;
  return { vd: out, own: pick(own, 4), print: pick(print, 3) };
}

function shapeData(shape) {
  const parts = SHAPES[shape]();
  const n = parts.reduce((k, p) => k + p.positions.length / 3, 0);
  const own = new Float32Array(n * 4), print = new Float32Array(n * 3);
  // merge() keeps only standard attributes: own colours and print uvs are concatenated in order.
  let o = 0;
  for (const p of parts) { own.set(p.own, o * 4); print.set(p.print, o * 3); o += p.positions.length / 3; p.own = p.print = null; }
  const vd = parts[0].merge(parts.slice(1), true);
  return { vd, own, print };
}

const _q = new Quaternion(), _s = new Vector3(), _p = new Vector3(), _mat = new Matrix();
const NO_LOOK = {};

// Level of detail: with the camera more than FAR_NEAR metres outside the
// store's bounds every garment draws a simplified copy (FAR_ERROR: 2% of a
// garment's size, ~6 mm on a sneaker), and every garment's shadow comes from
// that copy. In full detail the 72 sneaker pairs alone were 162k triangles,
// drawn and shadowed from the car park. FAR_HYSTERESIS keeps a camera at
// the threshold from flipping between the two.
const FAR_ERROR = 0.02;
const FAR_NEAR = 3;
const FAR_HYSTERESIS = 1;
const INSTANCE_BUFFERS = [['matrix', 16], ['color', 4], ['aStyle', 4], ['aAccent', 4]];

/**
 * Every garment of the store as thin instances: per type one mesh, its units
 * added at stocking time (build() once), then moved with place() / hidden;
 * flush() uploads the changed buffers once per frame and picks the level of
 * detail (a simplified copy and shadow stand-in sharing the instance data).
 */
export class GarmentSet {
  constructor(scene) {
    this.scene = scene;
    this.prints = garmentPrintTexture(scene);
    this.cloth = fabricTexture(scene);
    this.material = fabric(scene, this.prints, this.cloth);
    this.groups = new Map();   // shape -> { mesh, far, shadow, meshes, units, matrices, colors, styles, accents, dirty }
    this._near = true;
  }

  /**
   * A new unit of `shape` in `hex` (call before build()) in a catalog
   * style (print, label, pattern, cloth; none for plain units). A hanging
   * garment gets its hanger as a unit of its own (it comes off at the till),
   * moved with the garment while `u.onHanger`; its size chip shows the
   * garment's size (scale).
   */
  add(shape, hex, scale = 1, look = null) {
    if (!this.groups.has(shape)) this.groups.set(shape, { units: [] });
    const g = this.groups.get(shape);
    const u = { shape, hex, look: look || NO_LOOK, scale, index: g.units.length, visible: true, x: null, hanger: null, onHanger: false };
    g.units.push(u);
    if (HANGER_OF[shape]) { u.hanger = this.add(HANGER_OF[shape], SIZE_CHIP[sizeOf(scale)]); u.onHanger = true; }
    return u;
  }

  /**
   * Make the meshes. `bounds` ({ min, max } world points) covers everywhere a
   * garment can go (racks, her hands, fitting rooms, the till): culling
   * then never needs a bounding refresh while one moves.
   */
  build(bounds) {
    this.bounds = bounds;
    for (const [shape, g] of this.groups) {
      const { vd, own, print } = shapeData(shape);
      const n = g.units.length;
      g.matrices = new Float32Array(n * 16);
      g.colors = new Float32Array(n * 4);
      g.styles = new Float32Array(n * 4);
      g.accents = new Float32Array(n * 4);
      for (const u of g.units) this._dress(g, u);
      g.mesh = this._mesh(`mall:garment:${shape}`, g, shapeMesh(this.scene, vd, own, print));
      g.meshes = [g.mesh];
      const index = simplifyGeometry(g.mesh.geometry, { error: FAR_ERROR });
      if (!index) continue;
      const far = subsetData(vd, own, print, index);
      g.far = this._mesh(`mall:garment:${shape}:far`, g, shapeMesh(this.scene, far.vd, far.own, far.print));
      g.far.setEnabled(false);
      // Same geometry as the far copy, drawn into the shadow map only.
      const shadow = new Mesh('', this.scene);
      g.far.geometry.applyToMesh(shadow);
      g.shadow = this._mesh(`mall:garment:${shape}:shadow`, g, shadow);
      g.shadow.layerMask = SHADOW_ONLY_LAYER;
      g.meshes.push(g.far, g.shadow);
    }
  }

  /** Set up `mesh` to draw group g's units (their instance buffers, the store's bounds). */
  _mesh(name, g, mesh) {
    mesh.name = name;
    mesh.material = this.material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    const data = { matrix: g.matrices, color: g.colors, aStyle: g.styles, aAccent: g.accents };
    for (const [kind, stride] of INSTANCE_BUFFERS) mesh.thinInstanceSetBuffer(kind, data[kind], stride, false);
    mesh.setBoundingInfo(new BoundingInfo(this.bounds.min, this.bounds.max));
    mesh.doNotSyncBoundingInfo = true;
    mesh.freezeWorldMatrix();   // units move in the instance buffer, the mesh never does
    return mesh;
  }

  /** Write a unit's dye and look into its group's instance buffers. */
  _dress(g, u) {
    const L = u.look, i = u.index * 4;
    Color3.FromHexString(u.hex).toLinearSpaceToRef(_c);
    g.colors.set([_c.r, _c.g, _c.b, 1], i);
    g.styles.set([PRINT_CELL[L.print] ?? -1, BRAND_TAG[L.brand] ?? 0, PATTERN[L.pattern] || 0, FABRIC[L.fabric] || 0], i);
    Color3.FromHexString(L.accent || '#ffffff').toLinearSpaceToRef(_c);
    g.accents.set([_c.r, _c.g, _c.b, L.print === 'kaze' ? 1 : 0], i);
  }

  get meshes() { return [...this.groups.values()].flatMap((g) => g.meshes || []); }

  /** Shadow casters: the stand-ins, else the garment itself (hangers and the folded pieces are too thin to matter). */
  get casters() { return [...this.groups].filter(([shape, g]) => g.mesh && !HANGERS.has(shape) && shape !== 'folded').map(([, g]) => g.shadow || g.mesh); }

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

  /**
   * A pooled unit takes another garment's colour (the folded one at the
   * till): a catalog item (its colour and style: pattern, cloth) or a hex.
   */
  recolor(u, item) {
    const g = this.groups.get(u.shape);
    if (typeof item === 'string') { u.hex = item; u.look = NO_LOOK; } else { u.hex = item.color; u.look = item.style || NO_LOOK; }
    this._dress(g, u);
    for (const m of g.meshes) {
      m.thinInstanceBufferUpdated('color');
      m.thinInstanceBufferUpdated('aStyle');
      m.thinInstanceBufferUpdated('aAccent');
    }
  }

  /** Per frame: the level of detail for the camera, then upload what moved. */
  flush() {
    this._pickDetail();
    for (const g of this.groups.values()) {
      if (!g.dirty || !g.mesh) continue;
      g.dirty = false;
      for (const m of g.meshes) m.thinInstanceBufferUpdated('matrix');
    }
  }

  /** Full detail with the camera inside (or within FAR_NEAR of) the store's bounds, the simplified copies beyond. */
  _pickDetail() {
    const cam = this.scene.activeCamera, b = this.bounds;
    if (!cam || !b) return;
    const p = cam.globalPosition;
    const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x), dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y), dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
    const d = Math.hypot(dx, dy, dz);
    const near = this._near ? d < FAR_NEAR + FAR_HYSTERESIS : d < FAR_NEAR;
    if (near === this._near) return;
    this._near = near;
    for (const g of this.groups.values()) {
      if (!g.far) continue;
      g.mesh.setEnabled(near);
      g.far.setEnabled(!near);
    }
  }

  dispose() {
    for (const g of this.groups.values()) for (const m of g.meshes || []) m.dispose();
    this.groups.clear();
    this.material.dispose(true, false);
    this.prints.dispose();
    this.cloth.dispose();
  }
}
