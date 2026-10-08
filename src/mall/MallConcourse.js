import { Matrix, Mesh, VertexData } from '@babylonjs/core';
import { C } from './MallKit.js';
import {
  CONCOURSE, VOID, UPPER, SOFFIT, UPPER_CEILING, ATRIUM_COLUMNS, ESCALATORS, FOUNTAIN, INFO_DESK, LIFT, TREE_PLANTERS,
  GACHA, PHOTO_BOOTHS, VENDING, BENCHES, KIOSK, TOTEMS, TOTEM_Z, concourseObstacles,
} from './MallPlan.js';

/**
 * Hikari Mall's concourse: the two-storey walk between the shop row and
 * the anchor stores. A polished terrazzo floor with inlaid bands; galleries
 * on the upper floor round an atrium open to a glazed lantern, with glass
 * balustrades, lit slab edges and columns; a bridge over the atrium with
 * the escalators up to it and a glass lift; the fountain under a ring
 * light; planted trees with seats round them, benches, the information
 * desk, floor guides, a crêpe stand, the capsule-toy corner, photo
 * booths, vending machines; hanging banners, wayfinding and the season's
 * decoration (autumn fair, Halloween). The shops' fronts are
 * MallStorefronts'. Static: two batches like every zone (casters and the
 * rest); the trees are the lot's tree, one more instance each
 * (`trees`: [x, z, scale]).
 */
const LANTERN = { eave: 11.8, ridge: 13.4, rib: 2.4 };
const LIFT_BRIDGE = { x0: LIFT.x - 0.9, x1: LIFT.x + 0.9 };
const TREE_SCALE = 0.42;
// Slab edges, the bridge and the lift's landing in one white: they read as one floor.
const SLAB = C.snow;

export function buildConcourse(site, mats, signs) {
  const { cast, still } = site.zone('concourse');
  const M = mats;
  floor(still, M);
  galleries(still, cast, M);
  lantern(still, M);
  for (const x of ATRIUM_COLUMNS) for (const z of [VOID.z0, VOID.z1]) column(cast, M, x, z);
  escalators(cast, still, M);
  lift(cast, still, M);
  fountain(cast, still, M);
  furniture(cast, still, M, signs);
  corners(cast, still, M, signs);
  decoration(cast, still, M, signs);
  for (const o of concourseObstacles()) site.collide(o.x0, o.z0, o.x1, o.z1, 0, o.h, o.low ? { camera: false } : undefined);
  // The galleries overhead (only the camera reaches them).
  for (const [x0, z0, x1, z1] of slabs()) site.collide(x0, z0, x1, z1, SOFFIT, UPPER);
  return { trees: TREE_PLANTERS.map((t) => [t.x, t.z, TREE_SCALE]) };
}

/** The upper floor's extent: everything over the concourse but the atrium (with the bridge and the lift's landing across it). */
function slabs() {
  const K = CONCOURSE, V = VOID, E = ESCALATORS;
  return [
    [K.x0, K.z0, K.x1, V.z0], [K.x0, V.z1, K.x1, K.z1], [K.x0, V.z0, V.x0, V.z1], [V.x1, V.z0, K.x1, V.z1],
    [E.bridge[0], V.z0, E.bridge[1], V.z1], [LIFT_BRIDGE.x0, LIFT.z + LIFT.r, LIFT_BRIDGE.x1, V.z1],
  ];
}

/** Terrazzo in bands along the concourse: a darker border at the fronts and round the atrium, warmer under it. */
function floor(b, M) {
  const K = CONCOURSE, V = VOID;
  const bands = [[K.z0, K.z0 + 0.4, C.stone], [K.z0 + 0.4, V.z0 - 0.3, C.white], [V.z0 - 0.3, V.z0 + 0.3, C.stone], [V.z0 + 0.3, V.z1 - 0.3, C.cream],
    [V.z1 - 0.3, V.z1 + 0.3, C.stone], [V.z1 + 0.3, K.z1 - 0.4, C.white], [K.z1 - 0.4, K.z1, C.stone]];
  for (const [z0, z1, c] of bands) b.flat(M.hallFloor, c, K.x0, z0, K.x1, z1, 0.01);
}

/**
 * The upper floor round the atrium: soffits with downlights over the walks,
 * lit slab edges, glass balustrades, the floor and ceiling up there (seen
 * through the atrium), a few planters on the galleries.
 */
function galleries(still, cast, M) {
  const V = VOID, E = ESCALATORS;
  for (const [x0, z0, x1, z1] of slabs()) {
    still.flat(M.ceiling, C.white, x0, z0, x1, z1, SOFFIT, true);
    still.flat(M.hallFloor, C.white, x0, z0, x1, z1, UPPER);
    still.flat(M.ceiling, C.white, x0, z0, x1, z1, UPPER_CEILING, true);
  }
  // Downlights under the galleries (both floors) and the bridge.
  for (let x = CONCOURSE.x0 + 1.4; x < CONCOURSE.x1; x += 2.4) {
    for (const z of [10.8, 21.2]) for (const y of [SOFFIT, UPPER_CEILING]) still.cylinder(M.glow, C.light, x, y - 0.02, z, 0.12, 0.02, 8);
  }
  for (const z of [14, 16, 18]) still.cylinder(M.glow, C.light, (E.bridge[0] + E.bridge[1]) / 2, SOFFIT - 0.02, z, 0.12, 0.02, 8);
  // Edges round the atrium: [x0, z0, x1, z1, which way the atrium lies (unit x, z)], with the balustrade's gaps.
  const LB = LIFT_BRIDGE, lz = LIFT.z + LIFT.r;
  const edges = [
    [V.x0, V.z0, E.bridge[0], V.z0, [0, 1]], [E.bridge[1], V.z0, V.x1, V.z0, [0, 1]],
    [V.x0, V.z1, E.bridge[0], V.z1, [0, -1]], [E.bridge[1], V.z1, LB.x0, V.z1, [0, -1]], [LB.x1, V.z1, V.x1, V.z1, [0, -1]],
    [V.x0, V.z0, V.x0, V.z1, [1, 0]], [V.x1, V.z0, V.x1, V.z1, [-1, 0]],
    [E.bridge[1], V.z0, E.bridge[1], V.z1, [1, 0]], [E.bridge[0], V.z0, E.bridge[0], V.z1, [-1, 0], [E.z0, E.z1]],
    [LB.x0, lz, LB.x0, V.z1, [-1, 0]], [LB.x1, lz, LB.x1, V.z1, [1, 0]],
  ];
  for (const [x0, z0, x1, z1, f, gap] of edges) {
    // Fascia flush with the edge, on the slab's side; a light line under its lip.
    const [a0, b0, a1, b1] = beside(x0, z0, x1, z1, f, 0, 0.3);
    still.box(M.gloss, SLAB, a0, SOFFIT - 0.12, b0, a1, UPPER + 0.1, b1);
    const [c0, d0, c1, d1] = beside(x0, z0, x1, z1, f, 0.05, 0.13);
    still.flat(M.glow, C.light, c0, d0, c1, d1, SOFFIT - 0.135, true);
    const spans = gap ? [[z0, gap[0]], [gap[1], z1]].map(([a, c]) => [x0, a, x1, c]) : [[x0, z0, x1, z1]];
    for (const [a0, b0, a1, b1] of spans) balustrade(still, M, a0 + f[0] * 0.08, b0 + f[1] * 0.08, a1 + f[0] * 0.08, b1 + f[1] * 0.08);
  }
  // Planters along the galleries' fronts.
  for (const x of [-27, -17, 6, 17, 28]) for (const z of [V.z0 - 0.9, V.z1 + 0.9]) {
    cast.box(M.satin, C.charcoal, x - 0.7, UPPER, z - 0.3, x + 0.7, UPPER + 0.55, z + 0.3);
    for (const dx of [-0.4, 0, 0.4]) cast.sphere(M.matte, C.leaf, x + dx, UPPER + 0.75, z, 0.32, 0.9, 6);
  }
}

/** The strip along an axis-aligned edge between offsets a and b (m) on the side away from `f`: [x0, z0, x1, z1]. */
function beside(x0, z0, x1, z1, f, a, b) {
  const ox = -f[0], oz = -f[1];
  return [Math.min(x0 + ox * a, x0 + ox * b, x1), Math.min(z0 + oz * a, z0 + oz * b, z1), Math.max(x1 + ox * a, x1 + ox * b, x0), Math.max(z1 + oz * a, z1 + oz * b, z0)];
}

/** A glass balustrade between two points on the upper floor: base shoe, glass, chrome handrail. */
function balustrade(b, M, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.05) return;
  const fx = (z1 - z0) / len, fz = -(x1 - x0) / len;
  b.panel(M.glass, C.white, (x0 + x1) / 2, (z0 + z1) / 2, [fx, fz], len, UPPER + 0.12, UPPER + 1.02);
  b.box(M.metal, C.steel, Math.min(x0, x1) - 0.04, UPPER + 0.1, Math.min(z0, z1) - 0.04, Math.max(x0, x1) + 0.04, UPPER + 0.16, Math.max(z0, z1) + 0.04);
  b.rod(M.chrome, C.steel, [x0, UPPER + 1.06, z0], [x1, UPPER + 1.06, z1], 0.03, 6);
}

/** A round column: base ring, shaft through both floors, a capital under the soffit and the ceiling. */
function column(b, M, x, z) {
  b.cylinder(M.metal, C.steel, x, 0, z, 0.38, 0.14, 16);
  b.cylinder(M.gloss, C.snow, x, 0.14, z, 0.33, UPPER_CEILING - 0.14, 16);
  for (const y of [SOFFIT - 0.3, UPPER_CEILING - 0.3]) b.cylinder(M.satin, C.stone, x, y, z, 0.4, 0.3, 16, 0.36);
}

/**
 * The atrium's lantern: a clerestory of glass on a white beam round the
 * opening, a pitched glass roof on white ribs, glass gables, tie rods.
 */
function lantern(b, M) {
  const V = VOID, L = LANTERN, mz = (V.z0 + V.z1) / 2, top = UPPER_CEILING + 0.4;
  // Ring beam and clerestory.
  for (const [x0, z0, x1, z1] of [[V.x0, V.z0 - 0.3, V.x1, V.z0], [V.x0, V.z1, V.x1, V.z1 + 0.3], [V.x0 - 0.3, V.z0 - 0.3, V.x0, V.z1 + 0.3], [V.x1, V.z0 - 0.3, V.x1 + 0.3, V.z1 + 0.3]]) {
    b.box(M.gloss, C.snow, x0, UPPER_CEILING - 0.05, z0, x1, top, z1);
    b.box(M.satin, C.white, x0, L.eave - 0.12, z0, x1, L.eave, z1);
  }
  b.panel(M.glass, C.white, 0, V.z0 - 0.15, [0, 1], V.x1 - V.x0, top, L.eave - 0.12);
  b.panel(M.glass, C.white, 0, V.z1 + 0.15, [0, -1], V.x1 - V.x0, top, L.eave - 0.12);
  for (const s of [-1, 1]) b.panel(M.glass, C.white, s > 0 ? V.x1 + 0.15 : V.x0 - 0.15, mz, [-s, 0], V.z1 - V.z0, top, L.eave - 0.12);
  // Roof: two slopes of glass, a rib every 2.4 m, the ridge; gables.
  const dz = mz - V.z0, rise = L.ridge - L.eave, len = V.x1 - V.x0;
  b.face(M.glass, C.white, [V.x0, L.eave, V.z0], [len, 0, 0], [0, rise, dz]);
  b.face(M.glass, C.white, [V.x0, L.eave, V.z1], [0, rise, -dz], [len, 0, 0]);
  for (let x = V.x0; x <= V.x1 + 1e-6; x += L.rib) {
    for (const z of [V.z0, V.z1]) b.rod(M.satin, C.white, [x, L.eave, z], [x, L.ridge, mz], 0.07, 6);
    b.rod(M.metal, C.steel, [x, L.eave - 0.05, V.z0], [x, L.eave - 0.05, V.z1], 0.02, 4);
  }
  b.box(M.satin, C.white, V.x0, L.ridge - 0.06, mz - 0.1, V.x1, L.ridge + 0.1, mz + 0.1);
  for (const x of [V.x0, V.x1]) b.tri(M.glass, C.white, [x, L.eave, V.z0], [x, L.ridge, mz], [x, L.eave, V.z1]);
}

/**
 * The escalators to the bridge (set dressing: she walks the ground floor):
 * a truss clad in steel, steps with yellow nosings, glass balustrades with
 * black handrails, landing plates; the bridge they land on.
 */
function escalators(cast, still, M) {
  const E = ESCALATORS, V = VOID, land = 1.5;
  const xa = E.x0 + land, xb = E.x1 - land, y0 = 0.12;
  const mid = (E.z0 + E.z1) / 2;
  for (const [z0, z1] of [[E.z0, mid], [mid, E.z1]]) {
    cast.slope(M.satin, C.steel, xa, y0, xb, UPPER, z0 + 0.02, z1 - 0.02, 1.1);
    cast.box(M.metal, C.steel, E.x0, 0, z0 + 0.02, xa, y0, z1 - 0.02);
    cast.box(M.metal, C.steel, xb, UPPER - 0.45, z0 + 0.02, E.x1, UPPER + 0.02, z1 - 0.02);
    // Steps: a tread and riser per step, a comb plate at each end.
    const zi0 = z0 + 0.28, zi1 = z1 - 0.28, n = 26, run = (xb - xa) / n, rise = (UPPER - y0) / n;
    for (let k = 0; k < n; k++) {
      const x = xa + k * run, y = y0 + (k + 1) * rise;
      cast.box(M.metal, C.charcoal, x, y - rise, zi0, x + run, y, zi1);
      still.box(M.matte, C.yellow, x, y - 0.01, zi0, x + 0.04, y + 0.003, zi1);
    }
    for (const [x, y] of [[xa - 0.1, y0], [xb, UPPER + 0.02]]) still.box(M.metal, C.yellow, x, y, zi0, x + 0.1, y + 0.01, zi1);
    // Balustrades on both sides: skirt, glass, handrail (round at the ends).
    for (const z of [z0 + 0.14, z1 - 0.14]) {
      still.face(M.glass, C.white, [xa, y0 + 0.15, z], [xb - xa, UPPER - y0, 0], [0, 0.85, 0]);
      still.panel(M.glass, C.white, (E.x0 + 0.4 + xa) / 2, z, [0, 1], xa - E.x0 - 0.4, y0 + 0.15, y0 + 1.0);
      still.panel(M.glass, C.white, (xb + E.x1 - 0.2) / 2, z, [0, 1], E.x1 - 0.2 - xb, UPPER + 0.15, UPPER + 1.0);
      cast.slope(M.metal, C.steel, xa, y0 + 0.16, xb, UPPER + 0.16, z - 0.07, z + 0.07, 0.16);
      const rail = [[E.x0 + 0.4, y0 + 0.4], [E.x0 + 0.25, y0 + 0.8], [E.x0 + 0.45, y0 + 1.04], [xa, y0 + 1.04], [xb, UPPER + 1.04], [E.x1 - 0.2, UPPER + 1.04]];
      for (let i = 1; i < rail.length; i++) cast.rod(M.satin, C.black, [rail[i - 1][0], rail[i - 1][1], z], [rail[i][0], rail[i][1], z], 0.04, 6);
    }
  }
  // The bridge: the upper floor across the atrium, white fascias (galleries()), a soffit.
  const [b0, b1] = E.bridge;
  still.box(M.gloss, SLAB, b0, SOFFIT + 0.01, V.z0, b1, UPPER - 0.01, V.z1);
}

/** A glass lift: a round shaft on steel posts, the car at the bottom, the machine on top, a landing to the north gallery. */
function lift(cast, still, M) {
  const L = LIFT, top = UPPER_CEILING + 0.6;
  still.cylinder(M.glass, C.white, L.x, 0.05, L.z, L.r, top - 0.05, 24);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    cast.cylinder(M.metal, C.white, L.x + Math.cos(a) * L.r, 0, L.z + Math.sin(a) * L.r, 0.05, top, 8);
  }
  for (const y of [0, UPPER - 0.1, UPPER_CEILING - 0.2]) cast.cylinder(M.satin, C.white, L.x, y, L.z, L.r + 0.06, y ? 0.35 : 0.12, 24);
  cast.cylinder(M.satin, C.white, L.x, top, L.z, L.r + 0.06, 0.3, 24);
  // The car: a white frame with glass sides, lit inside, its door to the south.
  cast.box(M.gloss, C.snow, L.x - 0.7, 0.12, L.z - 0.7, L.x + 0.7, 0.24, L.z + 0.7);
  cast.box(M.gloss, C.snow, L.x - 0.7, 2.3, L.z - 0.7, L.x + 0.7, 2.45, L.z + 0.7);
  for (const dx of [-0.66, 0.66]) for (const dz of [-0.66, 0.66]) cast.box(M.metal, C.steel, L.x + dx - 0.04, 0.24, L.z + dz - 0.04, L.x + dx + 0.04, 2.3, L.z + dz + 0.04);
  still.flat(M.glow, C.light, L.x - 0.5, L.z - 0.5, L.x + 0.5, L.z + 0.5, 2.29, true);
  cast.box(M.metal, C.steel, L.x - 0.45, 0.24, L.z - 0.7, L.x + 0.45, 2.3, L.z - 0.66);
  still.box(M.gloss, SLAB, LIFT_BRIDGE.x0, SOFFIT + 0.01, L.z + L.r, LIFT_BRIDGE.x1, UPPER - 0.01, VOID.z1);
}

/** The fountain: a tiled basin with a stone rim, water, a column with a bowl, jets; the ring light over it. */
function fountain(cast, still, M) {
  const F = FOUNTAIN;
  // Basin: tiled wall, water a little below its rounded stone rim.
  cast.cylinder(M.gloss, C.teal, F.x, 0, F.z, F.r, 0.42, 32);
  still.cylinder(M.gloss, C.water, F.x, 0.42, F.z, F.r - 0.08, 0.02, 32);
  cast.shape(M.satin, C.stone, VertexData.CreateTorus({ diameter: F.r * 2 - 0.1, thickness: 0.18, tessellation: 40 }), Matrix.Translation(F.x, 0.46, F.z));
  // Column and bowl, its water.
  cast.cylinder(M.gloss, C.stone, F.x, 0.44, F.z, 0.32, 0.88, 16, 0.22);
  cast.cylinder(M.gloss, C.stone, F.x, 1.32, F.z, 0.35, 0.14, 20, 1.0);
  still.cylinder(M.gloss, C.water, F.x, 1.46, F.z, 0.9, 0.015, 20);
  // Water: a tall jet from the bowl and a ring of low jets inside the rim (bright, unlit), the clear sheet falling off the bowl's lip.
  const jet = C.cold.scale(0.9);
  still.cylinder(M.glow, jet, F.x, 1.47, F.z, 0.05, 1.5, 8, 0.015);
  still.shape(M.glass, C.water, VertexData.CreateCylinder({ height: 1.0, diameterTop: 2.04, diameterBottom: 2.3, tessellation: 28, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE }), Matrix.Translation(F.x, 0.94, F.z));
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, r = F.r - 0.45;
    still.cylinder(M.glow, jet, F.x + Math.cos(a) * r, 0.44, F.z + Math.sin(a) * r, 0.035, 0.55 + (i % 2) * 0.25, 6, 0.012);
  }
  // The ring light over it, on three wires from the lantern.
  const ring = VertexData.CreateTorus({ diameter: 6, thickness: 0.16, tessellation: 40 });
  still.shape(M.glow, C.light, ring, Matrix.Translation(F.x, 8.6, F.z));
  still.shape(M.satin, C.white, VertexData.CreateTorus({ diameter: 6.1, thickness: 0.2, tessellation: 40 }), Matrix.Translation(F.x, 8.72, F.z));
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    still.rod(M.metal, C.steel, [F.x + Math.cos(a) * 3, 8.75, F.z + Math.sin(a) * 3], [F.x + Math.cos(a) * 1.5, LANTERN.eave, F.z + Math.sin(a) * 1.5], 0.008, 4);
  }
}

/** Seats, planted trees, the information desk, floor guides, the crêpe stand. */
function furniture(cast, still, M, signs) {
  for (const [x, z] of BENCHES) {
    cast.box(M.satin, C.oak, x - 0.9, 0.42, z - 0.25, x + 0.9, 0.48, z + 0.25);
    for (const lx of [x - 0.75, x + 0.75]) cast.box(M.metal, C.frame, lx - 0.04, 0, z - 0.22, lx + 0.04, 0.42, z + 0.22);
  }
  // Trees in round planters, a wooden seat round each.
  for (const t of TREE_PLANTERS) {
    cast.cylinder(M.satin, C.stone, t.x, 0, t.z, t.r, 0.4, 28);
    cast.cylinder(M.satin, C.oak, t.x, 0.4, t.z, t.r + 0.02, 0.06, 28);
    cast.cylinder(M.gloss, C.charcoal, t.x, 0.46, t.z, t.r - 0.45, 0.44, 24);
    // Soil sunk 1.5 cm into the rim: level with its top (0.9 m) the two fought.
    still.cylinder(M.matte, C.soil, t.x, 0.865, t.z, t.r - 0.5, 0.02, 24);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.3;
      cast.sphere(M.matte, C.leaf, t.x + Math.cos(a) * (t.r - 0.8), 1.05, t.z + Math.sin(a) * (t.r - 0.8), 0.32, 0.7, 6);
    }
  }
  // Information desk: a round counter, a screen, the sign on a pole.
  const D = INFO_DESK;
  cast.cylinder(M.gloss, C.snow, D.x, 0, D.z, D.r, 1.0, 28);
  cast.cylinder(M.satin, C.oak, D.x, 1.0, D.z, D.r + 0.06, 0.05, 28);
  still.cylinder(M.satin, C.blue, D.x, 0.62, D.z, D.r + 0.005, 0.12, 28);
  cast.box(M.gloss, C.dark, D.x - 0.3, 1.05, D.z + 0.2, D.x + 0.3, 1.45, D.z + 0.26);
  cast.cylinder(M.metal, C.steel, D.x, 1.05, D.z, 0.035, 1.6, 8);
  cast.box(M.matte, C.blue, D.x - 0.75, 2.4, D.z - 0.03, D.x + 0.75, 2.98, D.z + 0.03);
  for (const f of [-1, 1]) still.panel(signs.material, C.white, D.x, D.z + f * 0.032, [0, f], 1.42, 2.43, 2.95, signs.rect('info'));
  // Floor guides at the atrium's south edge, facing both ways.
  for (const x of TOTEMS) {
    cast.box(M.matte, C.navy, x - 0.55, 0, TOTEM_Z - 0.12, x + 0.55, 2.1, TOTEM_Z + 0.12);
    for (const f of [-1, 1]) still.panel(signs.material, C.white, x, TOTEM_Z + f * 0.132, [0, f], 0.96, 0.5, 1.78, signs.rect('guide'));
    still.box(M.glow, C.light, x - 0.5, 2.0, TOTEM_Z - 0.125, x + 0.5, 2.04, TOTEM_Z + 0.125);
  }
  // The crêpe stand: a pink counter under a little roof with its name all round.
  const K = KIOSK, kx0 = K.x - K.w / 2, kx1 = K.x + K.w / 2, kz0 = K.z - K.d / 2, kz1 = K.z + K.d / 2;
  cast.box(M.gloss, C.blush, kx0, 0.1, kz0, kx1, 1.0, kz1);
  cast.box(M.satin, C.dark, kx0 + 0.04, 0, kz0 + 0.04, kx1 - 0.04, 0.1, kz1 - 0.04);
  cast.box(M.satin, C.oak, kx0 - 0.05, 1.0, kz0 - 0.05, kx1 + 0.05, 1.05, kz1 + 0.05);
  for (const dx of [-0.45, 0.45]) cast.cylinder(M.gloss, C.dark, K.x + dx, 1.05, K.z + 0.2, 0.22, 0.06, 16);
  still.panel(M.glass, C.white, K.x, kz0 + 0.12, [0, -1], K.w - 0.2, 1.05, 1.35);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cast.cylinder(M.metal, C.white, K.x + dx * (K.w / 2 - 0.08), 1.05, K.z + dz * (K.d / 2 - 0.08), 0.03, 1.3, 6);
  cast.box(M.satin, C.pink, kx0 - 0.2, 2.35, kz0 - 0.2, kx1 + 0.2, 2.75, kz1 + 0.2);
  for (const f of [-1, 1]) still.panel(signs.material, C.white, K.x, K.z + f * (K.d / 2 + 0.215), [0, f], K.w, 2.38, 2.72, signs.rect('crepe'));
  still.panel(signs.print, C.white, kx1 + 0.012, K.z, [1, 0], 1.2, 0.35, 0.95, signs.rect('cafeMenu'));
  still.flat(M.glow, C.light, kx0, kz0, kx1, kz1, 2.345, true);
}

/** The concourse's ends: capsule toys along the west wall, photo booths along the east wall, vending machines by the restrooms; the end walls. */
function corners(cast, still, M, signs) {
  const K = CONCOURSE;
  for (const [x, f] of [[K.x0, 1], [K.x1, -1]]) {
    still.panel(M.matte, C.cream, x + f * 0.01, (K.z0 + K.z1) / 2, [f, 0], K.z1 - K.z0, 0, SOFFIT);
    still.panel(M.matte, C.cream, x + f * 0.01, (K.z0 + K.z1) / 2, [f, 0], K.z1 - K.z0, UPPER, UPPER_CEILING);
    still.box(M.gloss, C.black, x + (f > 0 ? 0 : -0.06), 2.95, 14.2, x + (f > 0 ? 0.06 : 0), 5.05, 17.8);
    still.panel(signs.material, C.white, x + f * 0.075, 16, [f, 0], 3.4, 3.03, 4.97, signs.rect('adScreen'));
  }
  // Capsule toys: two tiers of machines, the corner's sign over them.
  const G = GACHA, n = Math.floor((G.z1 - G.z0) / 0.575), w = (G.z1 - G.z0) / n;
  const colors = [C.red, C.blue, C.yellow, C.pink, C.green, C.orange];
  for (let i = 0; i < n; i++) {
    const z0 = G.z0 + i * w;
    for (let t = 0; t < 2; t++) {
      const y0 = t * 0.86;
      cast.box(M.gloss, colors[(i + t * 3) % colors.length], G.x0, y0, z0 + 0.01, G.x1, y0 + 0.84, z0 + w - 0.01);
      still.panel(signs.print, C.white, G.x1 + 0.012, z0 + w / 2, [1, 0], w - 0.08, y0 + 0.04, y0 + 0.8, signs.rect('gacha'));
    }
  }
  still.panel(signs.material, C.white, K.x0 + 0.02, (G.z0 + G.z1) / 2, [1, 0], 4.2, 2.0, 2.79, signs.rect('gachaSign'));
  // Photo booths: a printed side, a curtained door, a lit header; the game centre's sign above.
  const P = PHOTO_BOOTHS, bw = (P.z1 - P.z0) / 3, px = P.x0 + 0.2;
  for (let i = 0; i < 3; i++) {
    const z0 = P.z0 + i * bw + 0.05, z1 = z0 + bw - 0.1;
    cast.box(M.gloss, i % 2 ? C.purple : C.pink, px, 0, z0, P.x1, 2.3, z1);
    still.panel(signs.material, C.white, px - 0.012, z0 + (z1 - z0) * 0.3, [-1, 0], (z1 - z0) * 0.56, 0.2, 2.1, signs.rect('purikura'));
    still.panel(M.fabric, C.blush, px - 0.01, z0 + (z1 - z0) * 0.79, [-1, 0], (z1 - z0) * 0.36, 0.45, 2.05);
    still.box(M.glow, C.light, px - 0.04, 2.24, z0, px, 2.3, z1);
  }
  // Vending machines on the service front.
  const V = VENDING, vn = 3, vw = (V.x1 - V.x0) / vn;
  for (let i = 0; i < vn; i++) {
    const x0 = V.x0 + i * vw + 0.03, x1 = x0 + vw - 0.06;
    cast.box(M.gloss, [C.snow, C.red, C.blue][i], x0, 0, V.z - 0.78, x1, 1.83, V.z - 0.02);
    still.panel(signs.material, C.white, (x0 + x1) / 2, V.z - 0.792, [0, -1], x1 - x0 - 0.08, 0.1, 1.78, signs.rect('vending'));
  }
}

/**
 * The season: autumn fair and Halloween banners hanging in the atrium,
 * pennant strings along the balustrades, pumpkins round the trees and the
 * fountain; wayfinding blades under the galleries.
 */
function decoration(cast, still, M, signs) {
  const V = VOID, mz = (V.z0 + V.z1) / 2;
  [[-29, 'autumn'], [-19, 'halloween'], [-4.6, 'sakuraWeek'], [4.6, 'autumn'], [17, 'halloween'], [28, 'sakuraWeek']].forEach(([x, id]) => {
    for (const f of [-1, 1]) still.panel(signs.material, C.white, x, mz + f * 0.006, [0, f], 1.2, 6.95, 10.15, signs.rect(id));
    still.rod(M.metal, C.steel, [x - 0.65, 10.2, mz], [x + 0.65, 10.2, mz], 0.02, 6);
    for (const dx of [-0.55, 0.55]) still.rod(M.metal, C.steel, [x + dx, 10.2, mz], [x + dx, LANTERN.eave, mz], 0.006, 4);
  });
  // Pennants: a string between each pair of columns, along both long edges (atrium side).
  const flags = [C.orange, C.purple, C.black, C.yellow];
  for (const [z, f] of [[V.z0, 1], [V.z1, -1]]) {
    for (let i = 1; i < ATRIUM_COLUMNS.length; i++) {
      const a = ATRIUM_COLUMNS[i - 1] + 0.4, c = ATRIUM_COLUMNS[i] - 0.4, n = Math.round((c - a) / 0.42);
      const zz = z + f * 0.12, y = (u) => UPPER + 0.98 - Math.sin(u * Math.PI) * 0.45;
      for (let k = 0; k < n; k++) {
        const u0 = k / n, u1 = (k + 1) / n, x0 = a + (c - a) * u0, x1 = a + (c - a) * u1;
        still.tri(M.fabric, flags[k % flags.length], [x0, y(u0), zz], [x1, y(u1), zz], [(x0 + x1) / 2, (y(u0) + y(u1)) / 2 - 0.34, zz]);
      }
      still.rod(M.metal, C.dark, [a, y(0), zz], [(a + c) / 2, y(0.5), zz], 0.006, 3);
      still.rod(M.metal, C.dark, [(a + c) / 2, y(0.5), zz], [c, y(1), zz], 0.006, 3);
    }
  }
  // Pumpkins.
  const piles = [...TREE_PLANTERS.flatMap((t) => [[t.x + t.r + 0.25, t.z - 0.5], [t.x + t.r + 0.3, t.z + 0.3], [t.x - t.r - 0.3, t.z + 0.4]]),
    [FOUNTAIN.x - 1.2, FOUNTAIN.z - FOUNTAIN.r - 0.35], [FOUNTAIN.x + 1.3, FOUNTAIN.z + FOUNTAIN.r + 0.35], [INFO_DESK.x - 1.0, INFO_DESK.z - 1.15]];
  piles.forEach(([x, z], i) => pumpkin(cast, M, x, z, 0.2 + (i % 3) * 0.05));
  // Wayfinding blades under the south gallery and over the north walk.
  for (const [x, z, a, b] of [[-24, 10.4, 'wayUp', 'wayWC'], [22, 10.4, 'wayUp', 'wayWC'], [-26, 21.6, 'wayExit', 'wayUp'], [26, 21.6, 'wayExit', 'wayStyle']]) {
    still.box(M.matte, C.navy, x - 1.32, 4.18, z - 0.025, x + 1.32, 4.79, z + 0.025);
    still.panel(signs.material, C.white, x, z - 0.03, [0, -1], 2.6, 4.2, 4.77, signs.rect(a));
    still.panel(signs.material, C.white, x, z + 0.03, [0, 1], 2.6, 4.2, 4.77, signs.rect(b));
    for (const dx of [-1.1, 1.1]) still.rod(M.metal, C.steel, [x + dx, 4.79, z], [x + dx, SOFFIT, z], 0.008, 4);
  }
}

/** A pumpkin on the floor: a squat ribbed ball and its stalk. */
function pumpkin(b, M, x, z, r) {
  b.sphere(M.satin, C.orange, x, r * 0.72, z, r, 0.72, 8);
  b.sphere(M.satin, C.orange, x + r * 0.35, r * 0.62, z, r * 0.7, 0.85, 6);
  b.cylinder(M.matte, C.leaf, x, r * 1.35, z, r * 0.12, r * 0.3, 5, r * 0.08);
}
