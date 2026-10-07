import { Color3, MaterialPluginBase, Matrix, Mesh, PBRMaterial, Quaternion, Vector3, VertexData } from '@babylonjs/core';
import { ITEMS } from '../gameplay/ShopData.js';
import { GROCERIES, GROCERY_BY_ID } from '../mall/MallCatalog.js';
import { CELLS, PRINT_V, disposeGroceryAtlas, groceryAtlas, labelAtlas, labelFor } from './Labels.js';

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
 *
 * The mall's groceries (MallCatalog) are real-sized packs (PACKS: carton,
 * bottle, can, tub, block, bag, box, jar, loaf, …) printed with their own
 * brand and name from the grocery atlas, and a shelf-edge price tag; they
 * draw with a second material (same shader, that atlas) made per trip.
 * Their neutral parts (caps, lids, trays, cans' silver) keep their own grey
 * whatever the pack's colour: a vertex shade of 2 + g draws grey g.
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

// ---------------------------------------------------------------- grocery packs
/** Grey g (linear) whatever the instance colour (see the doc comment). */
const grey = (g) => 2 + g;
const SILVER = grey(0.55), WHITE = grey(0.8), CLEAR = grey(0.62);
/** A printed pack part: its uvs into the cell's print area (above the price tag). */
const pack = (vd, x, y, z, ry = 0, rx = 0) => {
  const p = part(vd, 1, x, y, z, ry, rx, 0, true);
  for (let i = 1; i < p.uvs2.length; i += 2) p.uvs2[i] = 1 - PRINT_V + PRINT_V * p.uvs2[i];
  return p;
};
const UP = -Math.PI / 2;   // rx turning a +z print to face up
// Pack parts are open-ended (bottoms are never seen; tops close only where they show).
const side = (rt, rb, h, n) => VertexData.CreateCylinder({ diameterTop: rt * 2, diameterBottom: rb * 2, height: h, tessellation: n, cap: Mesh.NO_CAP });
const topped = (rt, rb, h, n) => VertexData.CreateCylinder({ diameterTop: rt * 2, diameterBottom: rb * 2, height: h, tessellation: n, cap: Mesh.CAP_END });
const ball = (r) => VertexData.CreateIcoSphere({ radius: r, subdivisions: 1, flat: false });

/**
 * Grocery packs, real sizes in metres: each stands on y = 0 with its print
 * facing +z (the aisle). Round packs wrap their print (painted twice per
 * cell). Kept lean (16-90 triangles): a stocked supermarket shows
 * thousands of them up close.
 */
const PACKS = {
  can: () => merge([                                                    // 350 ml
    pack(side(0.0332, 0.03, 0.112, 10), 0, 0.056, 0),
    part(side(0.028, 0.0332, 0.01, 10), SILVER, 0, 0.117, 0),
    part(topped(0.028, 0.028, 0.004, 10), SILVER, 0, 0.124, 0),
  ]),
  bottle: () => merge([                                                 // 500 ml PET
    part(side(0.033, 0.031, 0.11, 10), 1, 0, 0.055, 0),
    pack(side(0.0345, 0.0345, 0.072, 10), 0, 0.094, 0),
    part(side(0.015, 0.033, 0.05, 10), 1.15, 0, 0.155, 0),
    part(topped(0.017, 0.016, 0.032, 8), WHITE, 0, 0.196, 0),            // neck and cap
  ]),
  bigBottle: () => merge([                                              // 1.5-2 L
    part(side(0.049, 0.047, 0.2, 10), 1, 0, 0.1, 0),
    pack(side(0.0505, 0.0505, 0.11, 10), 0, 0.13, 0),
    part(side(0.02, 0.049, 0.07, 10), 1.15, 0, 0.235, 0),
    part(topped(0.021, 0.02, 0.038, 8), WHITE, 0, 0.289, 0),
  ]),
  carton: () => merge([                                                 // 1 L gable top
    part(cube(0.07, 0.19, 0.07), 1, 0, 0.095, 0),
    pack(plane(0.07, 0.19), 0, 0.095, 0.0352),
    pack(plane(0.07, 0.19), 0, 0.095, -0.0352, Math.PI),
    part(cyl(0.0404, 0.0404, 0.07, 3), 1, 0, 0.2102, 0, 0, 0, Math.PI / 2), // gable roof (apex up)
    part(cube(0.07, 0.018, 0.005), 1.1, 0, 0.255, 0),                     // top fin
  ]),
  tub: () => merge([                                                    // yogurt, margarine, miso
    part(side(0.052, 0.046, 0.06, 10), 1, 0, 0.03, 0),
    pack(side(0.0523, 0.0468, 0.042, 10), 0, 0.03, 0),
    part(topped(0.055, 0.055, 0.009, 10), 1.25, 0, 0.0645, 0),
    pack(plane(0.07, 0.07), 0, 0.0692, 0, 0, UP),                        // printed lid
  ]),
  block: () => merge([                                                  // butter 200 g
    part(cube(0.1, 0.036, 0.065), 1, 0, 0.018, 0),
    pack(plane(0.1, 0.036), 0, 0.018, 0.0327),
    pack(plane(0.1, 0.065), 0, 0.0362, 0, 0, UP),
  ]),
  bag: () => merge([                                                    // crisps, carrots, rice
    part(cube(0.15, 0.19, 0.05), 1, 0, 0.105, 0),
    part(cube(0.13, 0.03, 0.056), 1, 0, 0.11, 0),                         // filled belly
    pack(plane(0.15, 0.19), 0, 0.105, 0.0305),
    pack(plane(0.15, 0.19), 0, 0.105, -0.0305, Math.PI),
    part(cube(0.152, 0.016, 0.01), 1.12, 0, 0.207, 0),                    // crimped seal
  ]),
  box: () => merge([                                                    // sweets, roux, frozen
    part(cube(0.11, 0.17, 0.04), 1, 0, 0.085, 0),
    pack(plane(0.11, 0.17), 0, 0.085, 0.0202),
    pack(plane(0.11, 0.17), 0, 0.085, -0.0202, Math.PI),
  ]),
  jar: () => merge([                                                    // jam, honey
    part(side(0.036, 0.036, 0.09, 10), 1, 0, 0.045, 0),
    pack(side(0.0365, 0.0365, 0.05, 10), 0, 0.042, 0),
    part(topped(0.035, 0.035, 0.016, 10), SILVER, 0, 0.099, 0),
  ]),
  loaf: () => merge([                                                   // bread in its bag, lying along z
    part(cube(0.115, 0.1, 0.22), 1, 0, 0.05, 0),
    part(cyl(0.0575, 0.0575, 0.22, 8), 1, 0, 0.1, 0, 0, Math.PI / 2),
    pack(plane(0.09, 0.06), 0, 0.075, 0.1105),
  ]),
  bun: () => merge([                                                    // melon pan in a clear bag
    part(side(0.05, 0.056, 0.022, 8), 0.8, 0, 0.011, 0),
    part(topped(0.024, 0.05, 0.03, 8), 1, 0, 0.037, 0),                    // the dome
    pack(plane(0.05, 0.034), 0, 0.034, 0.047, 0, -0.75),                  // sticker
  ]),
  fruit: () => merge([                                                  // three on a pulp tray
    part(cube(0.15, 0.014, 0.12), WHITE, 0, 0.007, 0),
    part(ball(0.037), 1, -0.037, 0.05, 0.024),
    part(ball(0.037), 1, 0.037, 0.05, 0.024),
    part(ball(0.037), 0.9, 0, 0.05, -0.03),
    pack(plane(0.11, 0.014), 0, 0.007, 0.0605),                           // band on the tray edge
  ]),
  tray: () => merge([                                                   // eggs, strawberry punnet
    part(cube(0.26, 0.04, 0.105), 1, 0, 0.02, 0),
    ...[-0.025, 0.025].map((z) => part(side(0.022, 0.022, 0.25, 6), 1.08, 0, 0.04, z, 0, 0, Math.PI / 2)),   // the rows of cups
    pack(plane(0.2, 0.034), 0, 0.02, 0.0528),
  ]),
  roll: () => merge([                                                   // green onions, lying along z
    ...[[-0.013, 0.012], [0.013, 0.012], [0, 0.034]].map(([x, y]) => part(side(0.012, 0.012, 0.3, 5), 1, x, y, 0.06, 0, Math.PI / 2)),
    ...[[-0.013, 0.012], [0.013, 0.012], [0, 0.034]].map(([x, y]) => part(side(0.01, 0.008, 0.16, 5), 0.55, x, y, -0.17, 0, Math.PI / 2)),
    pack(side(0.032, 0.032, 0.03, 6), 0, 0.022, 0.1, 0, Math.PI / 2),    // band
  ]),
  pack: () => merge([                                                   // wrapped multipacks
    part(cube(0.2, 0.12, 0.12), 1, 0, 0.06, 0),
    pack(plane(0.2, 0.12), 0, 0.06, 0.0605),
    pack(plane(0.2, 0.12), 0, 0.1205, 0, 0, UP),
    part(cube(0.205, 0.012, 0.125), CLEAR, 0, 0.114, 0),                  // film fold
  ]),
  tag: () => {                                                          // shelf-edge price tag
    const p = part(plane(0.09, 0.03), 1, 0, 0, 0, 0, -0.12, 0, true);
    for (let i = 1; i < p.uvs2.length; i += 2) p.uvs2[i] *= 1 - PRINT_V;
    return p;
  },
};

/** A pack's footprint along its row (w), depth (d) and height (h), for stocking and stacking. */
export const PACK_SIZE = {
  can: { w: 0.068, d: 0.068, h: 0.126 }, bottle: { w: 0.07, d: 0.07, h: 0.212 }, bigBottle: { w: 0.1, d: 0.1, h: 0.308 },
  carton: { w: 0.072, d: 0.072, h: 0.264 }, tub: { w: 0.112, d: 0.112, h: 0.069 }, block: { w: 0.1, d: 0.065, h: 0.036 },
  bag: { w: 0.155, d: 0.065, h: 0.215 }, box: { w: 0.11, d: 0.042, h: 0.17 }, jar: { w: 0.074, d: 0.074, h: 0.107 },
  loaf: { w: 0.118, d: 0.24, h: 0.158 }, bun: { w: 0.115, d: 0.115, h: 0.055 }, fruit: { w: 0.15, d: 0.12, h: 0.088 },
  tray: { w: 0.26, d: 0.105, h: 0.063 }, roll: { w: 0.05, d: 0.48, h: 0.046 }, pack: { w: 0.2, d: 0.12, h: 0.122 },
};

/**
 * Far level of detail for the packs (a stocked shelf seen down an aisle):
 * the front as a quad in the pack colour, its print as a second just in
 * front ([y0, y1, share of the width]; round packs show one of their two
 * wrapped labels), and the top: 6 triangles instead of ~100.
 */
const FAR_PRINT = {
  can: [0.01, 0.112, 1], bottle: [0.058, 0.13, 1], bigBottle: [0.075, 0.185, 1], carton: [0, 0.19, 1], tub: [0.009, 0.051, 1],
  block: [0, 0.036, 1], bag: [0.01, 0.2, 1], box: [0, 0.17, 1], jar: [0.017, 0.067, 1], loaf: [0.045, 0.105, 0.78],
  bun: [0.017, 0.051, 0.45], fruit: [0, 0.014, 0.75], tray: [0.003, 0.037, 0.77], roll: null, pack: [0, 0.12, 1],
};
const ROUND = new Set(['can', 'bottle', 'bigBottle', 'tub', 'jar']);
for (const [shape, band] of Object.entries(FAR_PRINT)) {
  const { w, d, h } = PACK_SIZE[shape];
  PACKS[`far:${shape}`] = () => {
    const parts = [part(plane(w, h), 1, 0, h / 2, d / 2 - 0.003), part(plane(w, d), 0.92, 0, h, 0, 0, UP)];
    if (band) {
      const p = pack(plane(w * band[2], band[1] - band[0]), 0, (band[0] + band[1]) / 2, d / 2);
      if (ROUND.has(shape)) for (let i = 0; i < p.uvs2.length; i += 2) p.uvs2[i] = 0.5 + 0.5 * p.uvs2[i];
      parts.push(p);
    }
    return merge(parts);
  };
}

/** A grocery's atlas cell (its catalog position). */
export const groceryLabel = (id) => GROCERIES.indexOf(GROCERY_BY_ID[id]);

// One hidden template mesh per shape: every product mesh shares its geometry.
const templates = new Map();
function template(scene, shape, grocery = false) {
  const set = grocery ? PACKS : SHAPES;
  const name = set[shape] ? shape : grocery ? 'pack' : 'box';
  const key = grocery ? `pack:${name}` : name;
  let t = templates.get(key);
  if (!t) {
    const vd = set[name]();
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
 * instance colour, keeping the part's shade (its vertex colour). `atlas`
 * gives the texture; `neutral`: shades of 2 + g draw grey g (grocery packs).
 */
class PrintPlugin extends MaterialPluginBase {
  constructor(material, atlas, neutral = false) {
    super(material, 'Print', 200, { PRINTED: false, PRINT_NEUTRAL: false });
    this._atlas = atlas;
    this._neutral = neutral;
    this._enable(true);
  }
  prepareDefines(defines) { defines.PRINTED = true; defines.PRINT_NEUTRAL = this._neutral; }
  getClassName() { return 'PrintPlugin'; }
  getAttributes(attributes) { attributes.push('aLabelUv', 'aCell'); }
  getSamplers(samplers) { samplers.push('labelAtlas'); }
  bindForSubMesh(ubo, scene) { ubo.setTexture('labelAtlas', this._atlas(scene)); }
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
      CUSTOM_FRAGMENT_UPDATE_ALPHA: 'if (vPrinted > 0.5) surfaceAlbedo = toLinearSpace(texture2D(labelAtlas, vLabelUv).rgb) * vShade;\n'
        + '#ifdef PRINT_NEUTRAL\nelse if (vShade > 1.95) surfaceAlbedo = vec3(vShade - 2.0);\n#endif\n',
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
    new PrintPlugin(productMaterial, labelAtlas);   // registers itself with the material
  }
  return productMaterial;
}

/** The grocery packs' material (the grocery atlas, neutral parts); made per trip. */
let groceryMaterial = null;
export function groceryMat(scene) {
  if (!groceryMaterial) {
    groceryMaterial = new PBRMaterial('grocery', scene);
    groceryMaterial.metallic = 0;
    groceryMaterial.roughness = 0.4;
    groceryMaterial.environmentIntensity = 1;
    new PrintPlugin(groceryMaterial, (sc) => groceryAtlas(sc, GROCERIES), true);
  }
  return groceryMaterial;
}

/** The trip is over: the grocery material, its atlas and the pack templates go (ProductSets dispose their own meshes). */
export function disposeGroceryGoods() {
  for (const [key, t] of templates) if (key.startsWith('pack:')) { t.dispose(); templates.delete(key); }
  groceryMaterial?.dispose();
  groceryMaterial = null;
  disposeGroceryAtlas();
}

const _q = new Quaternion(), _s = new Vector3(), _p = new Vector3(), _mat = new Matrix();
const cellOf = (label, out, i) => { out[i * 2] = label % CELLS; out[i * 2 + 1] = Math.floor(label / CELLS); };

/**
 * A product shape mesh; it draws its units as thin instances (matrix, colour,
 * label cell). Each gets its own copy of the shape's few hundred vertices:
 * meshes sharing a geometry also share its cached vertex-array objects in
 * the shadow pass, which then drew one mesh's instances with another's
 * buffers (wrong shadows, and GL errors when the counts differ).
 */
let copies = 0;
function shapeMesh(scene, name, shape, grocery = false) {
  const m = new Mesh(name, scene);
  template(scene, shape, grocery).geometry.copy(`${name}:${copies++}`).applyToMesh(m);
  m.material = grocery ? groceryMat(scene) : productMat(scene);
  m.isPickable = false;
  m.receiveShadows = true;
  return m;
}

/**
 * All products of one interior: per shape a thin-instanced mesh, rebuilt as
 * units are added. A unit can be hidden (taken) and shown again (put back).
 * Meshes are made once per shape and reused across restocks.
 *
 * `grocery`: the mall's packs (PACKS, the grocery atlas; label = groceryLabel).
 * `dynamic`: units that travel (in her hand, the cart, on the belt, in bags):
 * a pool per shape (acquire / release), placed with move() and sent to the
 * GPU once per frame by flush(); never culled, as they go anywhere.
 */
export class ProductSet {
  constructor(parent, { onMesh = null, grocery = false, dynamic = false } = {}) {
    this.parent = parent;
    this.scene = parent.getScene();
    this.onMesh = onMesh;      // new shape mesh (to register as a shadow caster)
    this.grocery = grocery;
    this.dynamic = dynamic;
    this.groups = new Map();   // shape -> { mesh, units: [], matrices, colors, cells, dirty }
  }

  /** Queue a unit; call build() once all are added. Returns a handle. */
  add(shape, color, x, y, z, ry = 0, scale = 1, label = labelFor(`${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`)) {
    if (!this.groups.has(shape)) this.groups.set(shape, { units: [], dirty: false });
    const g = this.groups.get(shape);
    const u = { shape, color, x, y, z, ry, rx: 0, scale, label, index: g.units.length, visible: true, free: false };
    g.units.push(u);
    return u;
  }

  build() {
    for (const [shape, g] of this.groups) this._build(shape, g);
  }

  _build(shape, g) {
    if (!g.mesh) {
      g.mesh = shapeMesh(this.scene, `products:${shape}`, shape, this.grocery);
      g.mesh.parent = this.parent;
      if (this.dynamic) g.mesh.alwaysSelectAsActiveMesh = true;
      this.onMesh?.(g.mesh);
    }
    const n = g.units.length;
    g.matrices = new Float32Array(Math.max(1, n) * 16);
    g.colors = new Float32Array(Math.max(1, n) * 4);
    g.cells = new Float32Array(Math.max(1, n) * 2);
    for (const u of g.units) { this._write(g, u); this._paint(g, u); }
    g.mesh.thinInstanceSetBuffer('matrix', g.matrices, 16, false);
    g.mesh.thinInstanceSetBuffer('color', g.colors, 4, !this.dynamic);
    g.mesh.thinInstanceSetBuffer('aCell', g.cells, 2, !this.dynamic);
    g.mesh.thinInstanceCount = n;
    if (!this.dynamic) g.mesh.thinInstanceRefreshBoundingInfo(false);
    g.mesh.setEnabled(n > 0);
    g.dirty = false;
  }

  _write(g, u) {
    const s = u.visible ? u.scale : 0;
    Quaternion.RotationYawPitchRollToRef(u.ry, u.rx, 0, _q);
    Matrix.ComposeToRef(_s.setAll(s), _q, _p.set(u.x, u.y, u.z), _mat);
    _mat.copyToArray(g.matrices, u.index * 16);
  }

  _paint(g, u) {
    const c = Color3.FromHexString(u.color).toLinearSpace();
    const i = u.index * 4;
    g.colors[i] = c.r; g.colors[i + 1] = c.g; g.colors[i + 2] = c.b; g.colors[i + 3] = 1;
    cellOf(u.label, g.cells, u.index);
  }

  setVisible(u, visible) {
    const g = this.groups.get(u.shape);
    u.visible = visible;
    if (!g?.mesh) return;
    this._write(g, u);
    g.mesh.thinInstanceBufferUpdated('matrix');
  }

  /** Pool `n` hidden units of a shape (dynamic sets): acquiring them later allocates nothing. */
  reserve(shape, n) {
    for (let i = 0; i < n; i++) Object.assign(this.add(shape, '#ffffff', 0, 0, 0, 0, 1, 0), { visible: false, free: true });
  }

  /** A free pooled unit (dynamic sets) dressed as a product; shown by its first move(). */
  acquire(shape, color, label, scale = 1) {
    let g = this.groups.get(shape);
    let u = g?.units.find((v) => v.free);
    if (!u) {
      // Pool exhausted: grow it (an allocation on an event, never per frame).
      this.reserve(shape, Math.max(4, g?.units.length || 0));
      g = this.groups.get(shape);
      this._build(shape, g);
      u = g.units.find((v) => v.free);
    }
    u.free = false;
    u.color = color; u.label = label; u.scale = scale;
    this._paint(g, u);
    g.mesh.thinInstanceBufferUpdated('color');
    g.mesh.thinInstanceBufferUpdated('aCell');
    if (u.index >= g.mesh.thinInstanceCount) this._count(g);
    return u;
  }

  /** Back to the pool, hidden. */
  release(u) {
    u.free = true;
    this.move(u, 0, 0, 0, 0, 0, false);
    this._count(this.groups.get(u.shape));
  }

  /**
   * A dynamic set draws its whole pool until trimmed (so the warm-up draws
   * every shape once); from then on only up to the last unit in use.
   */
  trim() { for (const g of this.groups.values()) this._count(g); }

  _count(g) {
    let n = g.units.length;
    while (n > 0 && g.units[n - 1].free) n--;
    g.mesh.thinInstanceCount = n;
    g.mesh.setEnabled(n > 0);
  }

  /** Place a unit (call flush() once after this frame's moves). */
  move(u, x, y, z, ry = u.ry, rx = 0, visible = true) {
    const g = this.groups.get(u.shape);
    u.x = x; u.y = y; u.z = z; u.ry = ry; u.rx = rx; u.visible = visible;
    this._write(g, u);
    g.dirty = true;
  }

  /** Send this frame's moves to the GPU (one upload per shape that changed). */
  flush() {
    for (const g of this.groups.values()) {
      if (!g.dirty) continue;
      g.dirty = false;
      g.mesh.thinInstanceBufferUpdated('matrix');
    }
  }

  /** Remove every unit (restocking with a different shop's goods); meshes are kept. */
  clear() {
    for (const g of this.groups.values()) {
      g.units = [];
      if (g.mesh) { g.mesh.thinInstanceCount = 0; g.mesh.setEnabled(false); }
    }
  }

  /** Every shape mesh this set made. */
  get meshes() { return [...this.groups.values()].map((g) => g.mesh).filter(Boolean); }

  dispose() {
    for (const m of this.meshes) m.dispose();
    this.groups.clear();
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
