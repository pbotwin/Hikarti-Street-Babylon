import { mulberry32 } from '../world/rng.js';

/**
 * Hikari Mall's site plan: every number that places the building, the
 * parking lot and the shops' fixtures, and the world `layout` the other
 * mall modules read (MALL.md). Plain data, no Babylon: the builders draw
 * from the same plan, so what is drawn, what collides and what the layout
 * says can't drift apart.
 *
 * Site frame (all numbers here): metres, x across the site, z from the lot
 * into the building; the glass front is z = 0, the lot lies at z < 0. The
 * game's low sun stands toward world +z, so the site is turned half round
 * in the world (local +z = world -z): the lot and the glass front face the
 * sun and the building's shadow falls behind it.
 */

export const SECTION = 4 / 3;                       // one shelf / fridge module (m)
export const CEILING = 5.5;                         // the anchor stores' ceiling
export const ROOF = 12;                             // parapet top: two storeys
export const UPPER = 5.8;                           // the upper floor (seen from the concourse, not walked)
export const SOFFIT = 5.35;                         // its underside over the concourse's walks
export const UPPER_CEILING = 10.6;
export const BUILDING = { x0: -40, x1: 40, z0: 0, z1: 59 };
/** Small shops between the front and the concourse (their fronts face it at z1), and the entrance courts through them. */
export const ROW = { z0: 0, z1: 9 };
export const CONCOURSE = { x0: -40, x1: 40, z0: 9, z1: 23 };
/** The atrium: the concourse's middle, open up to the skylight; galleries round it on the upper floor. */
export const VOID = { x0: -32, x1: 32, z0: 12.6, z1: 19.4 };
export const MARKET = { x0: -40, x1: -2, z0: 23, z1: 59 };
export const SERVICE = { x0: -2, x1: 6, z0: 23, z1: 59 };      // restrooms, staff (closed)
export const BOUTIQUE = { x0: 6, x1: 40, z0: 23, z1: 43 };
export const STOCKROOM = { x0: 6, x1: 40, z0: 43, z1: 59 };    // behind the boutique (closed)
export const SITE = { x0: -58, x1: 58, z0: -66, z1: 60 };
export const DOOR_H = 2.6;
export const ENTRANCES = [{ x: -8, w: 3.6 }, { x: 8, w: 3.6 }];
/** Entrance courts: from the doors through the shop row to the concourse. */
export const COURT_W = 6;
export const BOUTIQUE_DOOR = { x0: 16, x1: 20 };               // open shopfront
export const MARKET_ENTRY = { x0: -9, x1: -4.5 };

// ------------------------------------------------------------------ concourse
/**
 * The shop row's units, west to east (MallStorefronts dresses each by `kind`;
 * the courts lie between them), and the upper floor's fronts on both sides
 * of the atrium (seen, not entered).
 */
export const UNITS = [
  { kind: 'books', x0: -40, x1: -33 }, { kind: 'denki', x0: -33, x1: -26 }, { kind: 'drug', x0: -26, x1: -18.5 },
  { kind: 'hyaku', x0: -18.5, x1: -11 }, { kind: 'cafe', x0: -5, x1: 5 }, { kind: 'toys', x0: 11, x1: 18 },
  { kind: 'shoes', x0: 18, x1: 25 }, { kind: 'ramen', x0: 25, x1: 32 }, { kind: 'games', x0: 32, x1: 40 },
];
export const UNIT_DEPTH = 6;                        // dressed depth behind a shopfront
export const UPPER_UNITS = {
  south: [['sports', -40, -28], ['home', -28, -16], ['optical', -16, -6], ['foodcourt', -6, 14], ['kids', 14, 27], ['wear', 27, 40]],
  north: [['cinema', -40, -22], ['salon', -22, -12], ['tea', -12, -2], ['music', -2, 8], ['home2', 8, 22], ['bags', 22, 40]],
};
/** Columns round the atrium (x, on both long edges), clear of the walks across it. */
export const ATRIUM_COLUMNS = [-32, -22.4, -12.8, -3.2, 3.2, 12.8, 22.4, 32];
/**
 * What stands on the concourse floor (site rects and circles): MallConcourse
 * builds them, they collide, and the walk graph keeps its crossings clear of them.
 */
export const ESCALATORS = { x0: -25.6, x1: -12, z0: 14.4, z1: 17.6, bridge: [-12, -8] };
export const FOUNTAIN = { x: 0, z: 16, r: 2.4 };
export const INFO_DESK = { x: 13.6, z: 16, r: 1.2 };
export const LIFT = { x: 24, z: 15.6, r: 1.15 };
export const TREE_PLANTERS = [{ x: -30, z: 16, r: 1.95 }, { x: 31, z: 16, r: 1.95 }];   // r: the seat round the planter
export const BENCHES = [[-35, 13.3], [-18, 13.3], [33.5, 13.3], [-35, 18.7], [-18, 18.7], [33.5, 18.7]];  // 1.8 × 0.5, along x
export const KIOSK = { x: -35.5, z: 16, w: 2.2, d: 1.6 };                // the crêpe stand
export const TOTEMS = [-10.5, 10.5];                                    // floor guides at the atrium's south edge
export const TOTEM_Z = 13.05;
export const GACHA = { x0: -40, x1: -39.25, z0: 11.4, z1: 20.6 };      // capsule machines along the west end wall
export const PHOTO_BOOTHS = { x0: 37.6, x1: 40, z0: 12.2, z1: 19.8 };  // purikura along the east end wall
export const VENDING = { x0: -1.8, x1: 1.2, z: 23 };                    // on the service front, by the restrooms
/**
 * Footprints (site rects, with the height they collide to; `low` ones let
 * the camera pass over) of everything standing on the concourse floor:
 * MallConcourse's collisions, and the walk graph's clearance (tested).
 */
export function concourseObstacles() {
  const out = [];
  const box = (x0, z0, x1, z1, h, low = false) => out.push({ x0, z0, x1, z1, h, low });
  // Round things as a cross of two rects (an octagon), close to the circle where she walks up to it.
  const round = ({ x, z, r }, h, low) => { box(x - r, z - r * 0.62, x + r, z + r * 0.62, h, low); box(x - r * 0.62, z - r, x + r * 0.62, z + r, h, low); };
  const E = ESCALATORS;
  box(E.x0, E.z0, E.x1, E.z1, UPPER + 1.1);
  round(FOUNTAIN, 0.55, true);
  round(INFO_DESK, 1.05);
  round(LIFT, UPPER_CEILING);
  for (const t of TREE_PLANTERS) round(t, 0.9, true);
  box(GACHA.x0, GACHA.z0, GACHA.x1, GACHA.z1, 1.75);
  box(PHOTO_BOOTHS.x0, PHOTO_BOOTHS.z0, PHOTO_BOOTHS.x1, PHOTO_BOOTHS.z1, 2.4);
  box(VENDING.x0, VENDING.z - 0.8, VENDING.x1, VENDING.z, 1.85);
  for (const [x, z] of BENCHES) box(x - 0.9, z - 0.25, x + 0.9, z + 0.25, 0.48, true);
  box(KIOSK.x - KIOSK.w / 2, KIOSK.z - KIOSK.d / 2, KIOSK.x + KIOSK.w / 2, KIOSK.z + KIOSK.d / 2, 2.5);
  for (const x of TOTEMS) box(x - 0.55, TOTEM_Z - 0.12, x + 0.55, TOTEM_Z + 0.12, 2.1);
  for (const x of ATRIUM_COLUMNS) for (const z of [VOID.z0, VOID.z1]) box(x - 0.36, z - 0.36, x + 0.36, z + 0.36, UPPER);
  return out;
}

/** The two walks along the concourse (z) and where the walks across it run (x). */
export const WALK_S = 11, WALK_N = 20.6;
export const CROSSINGS = [-37.5, -8, 8, 18, 27.2, 36.2];

// ------------------------------------------------------------------ supermarket
/** Gondola runs along z (6 sections each); the gap between them is the middle cross aisle. */
export const RUNS = [[34, 42], [44.5, 52.5]];
export const LEVELS = {
  shelf: [0.16, 0.52, 0.88, 1.24, 1.6],
  tall: [0.16, 0.62, 1.08, 1.54],          // big bottles
  cold: [0.22, 0.6, 0.98, 1.36, 1.74],     // chillers, glass-door coolers
  bakery: [0.35, 0.75, 1.15, 1.55],
  crate: [0.45, 0.85, 1.25],
};
/** Fixture depth (m) and height by kind. */
export const FIXTURE = {
  shelf: { depth: 0.6, h: 1.95 },
  chiller: { depth: 0.9, h: 2.15 },        // open multideck (dairy)
  cooler: { depth: 0.9, h: 2.2 },          // glass doors (drinks, frozen)
  bakery: { depth: 0.55, h: 1.9 },
  crate: { depth: 0.6, h: 1.55 },          // produce wall
};
/**
 * Fixture lines across the supermarket, west to east: their x span and what
 * each side holds (the aisle it faces and the fixture kind). Eight aisles
 * between them: drinks, snacks, pantry, household, bakery, dairy, frozen,
 * and the open produce hall.
 */
export const LINES = [
  { x0: -40, x1: -39.4, east: ['drinks', 'shelf', 'tall'] },
  { x0: -36.9, x1: -35.7, west: ['drinks', 'shelf', 'tall'], east: ['snacks', 'shelf'] },
  { x0: -33.3, x1: -32.1, west: ['snacks', 'shelf'], east: ['pantry', 'shelf'] },
  { x0: -29.7, x1: -28.5, west: ['pantry', 'shelf'], east: ['household', 'shelf', 'tall'] },
  { x0: -26.1, x1: -24.9, west: ['household', 'shelf', 'tall'], east: ['bakery', 'shelf'] },
  { x0: -22.5, x1: -21.0, west: ['bakery', 'shelf'], east: ['dairy', 'chiller', 'cold'] },
  { x0: -18.4, x1: -16.6, west: ['dairy', 'chiller', 'cold'], east: ['frozen', 'cooler', 'cold'] },
];
/** A line side as { aisle, kind, levels (a LEVELS key) }. */
export function faceOf([aisle, kind, levels = kind === 'shelf' ? 'shelf' : 'cold']) { return { aisle, kind, levels }; }

/** Aisles: number, catalog aisle and the x of its walkway centre. */
export const AISLE_LANES = [
  { n: 1, aisle: 'drinks', x: -38.15 }, { n: 2, aisle: 'snacks', x: -34.5 }, { n: 3, aisle: 'pantry', x: -30.9 },
  { n: 4, aisle: 'household', x: -27.3 }, { n: 5, aisle: 'bakery', x: -23.7 }, { n: 6, aisle: 'dairy', x: -19.7 },
  { n: 7, aisle: 'frozen', x: -15.75 }, { n: 8, aisle: 'produce', x: -7.3 },
];
/** Along the back wall (faces the shop): bakery racks and drinks coolers. */
export const BACK_WALL = [
  { x0: -39, n: 9, aisle: 'bakery', kind: 'bakery', levels: 'bakery' },
  { x0: -25.5, n: 10, aisle: 'drinks', kind: 'cooler', levels: 'cold' },
];
/** Produce wall along the service wall (faces west), in the runs. */
export const PRODUCE_WALL_X = -2;
export const FREEZER_ISLAND = { x0: -14.9, x1: -13.7, len: 2 };       // chest freezers, 4 per run
export const PRODUCE_TABLES = { xs: [-9.2, -5.4], zs: [37, 40.6, 46.2, 49.8], w: 2.4, d: 1.2, y: 0.82 };
/** Checkout counters: x of each counter's centre line; customers walk down the lane east of it. */
export const CHECKOUT_X = [-33.2, -29.6, -26.0, -22.4];
export const CHECKOUT = { z0: 24.2, z1: 29.8, w: 0.9, h: 0.9, register: 26.2, beltFrom: 29.5, beltTo: 26.8, bag: 24.65, lane: 1.15 };
export const CORRAL = { x0: -18, x1: -13.4, z: 22.25, count: 10, slots: 12 };   // carts nest facing the entry

// ------------------------------------------------------------------ boutique
export const FLOOR_RACKS = [
  ['tees', 22.5, 28.2], ['tees', 27, 28.2], ['shorts', 31.5, 28.2], ['shorts', 36, 28.2],
  ['blouses', 22.5, 33.2], ['blouses', 27, 33.2], ['skirts', 31.5, 33.2], ['skirts', 36, 33.2],
];
export const RAIL = { len: 1.5, y: 1.45, hookStep: 0.1 };
export const WALL_RACKS = { x: 39.65, y: 1.62, len: 1.6, z0: 25.4, sets: [['hoodies', 5], ['jeans', 5]] };
export const SHOE_WALL = { x0: 16, n: 6, z: 42.72, depth: 0.5, levels: [0.45, 0.85, 1.25, 1.65], spots: [-0.44, 0, 0.44] };
export const MIRROR_WALL = { x0: 25.5, x1: 38.5 };
export const FITTING = { xs: [7.3, 9.8, 12.3], w: 2.4, front: 40.35, back: 43, open: 1.4, wallH: 2.4, rail: 2.15 };
export const TILL = { x0: 9, x1: 9.8, z0: 28, z1: 32, h: 1.0 };
export const WINDOW_STAGES = [{ x0: 6.4, x1: 15.2, mannequins: [8, 10.8, 13.6] }, { x0: 20.8, x1: 26, mannequins: [22.2, 24.6] }];
export const STAGE = { z0: 23.4, z1: 25.2, h: 0.18 };

// ------------------------------------------------------------------ parking lot
export const BAY = { w: 2.6, d: 5.2, cols: 16, x0: 2 };       // bays from x0 out, both sides of the walkway
/** Rows of bays: z span and which way a parked car's nose points (local z). */
export const ROWS = [
  { z0: -19.2, z1: -14, nose: -1 }, { z0: -24.4, z1: -19.2, nose: 1 },
  { z0: -36.6, z1: -31.4, nose: -1 }, { z0: -41.8, z1: -36.6, nose: 1 },
  { z0: -54, z1: -48.8, nose: -1 },
];
export const DRIVES = [{ z0: -14, z1: -7 }, { z0: -31.4, z1: -24.4 }, { z0: -48.8, z1: -41.8 }];
export const LANE_X = 49.5;                                    // perimeter lanes (both sides), 7 m wide
export const ASPHALT = { x0: -53, x1: 53, z0: -56, z1: -7 };
export const SIDEWALK = { x0: -46, x1: 46, z0: -7, z1: 0 };
export const WALKWAY = { x0: -2, x1: 2 };                      // raised island through the rows
export const END_ISLAND = { x0: 43.6, x1: 46 };
export const ISLAND_SPANS = [[-24.4, -14], [-41.8, -31.4], [-54, -48.8]];
export const EXIT_ROAD = { x0: 46, x1: 53, z0: -66, z1: -56 };
export const KERB_H = 0.14;
export const CANOPY = { d: 4, w: 5.6, y: 3.5, t: 0.28 };
const HER_BAY = { row: 0, col: -1 };                           // west of the walkway, nearest the building
const CART_RETURN_BAY = { row: 1, col: 1 };
const ACCESSIBLE = [{ row: 0, col: 1 }, { row: 0, col: 2 }];
export const PARKED_MODELS = ['sedan', 'minivan', 'keiCar', 'keiVan'];

/** Centre of a bay: row index, signed column (±1 = nearest the walkway). */
function bayCentre(row, col) {
  const r = ROWS[row];
  const s = Math.sign(col), i = Math.abs(col) - 1;
  return { x: s * (BAY.x0 + BAY.w * (i + 0.5)), z: (r.z0 + r.z1) / 2, yaw: r.nose > 0 ? 0 : Math.PI };
}

/** Parked cars (deterministic): busier near the building; her bay, the one ahead of it (she drives through), the cart return and the accessible bays kept clear. */
export function parkedCars() {
  const rnd = mulberry32(2607);
  const keep = new Set([HER_BAY, { row: 1, col: HER_BAY.col }, CART_RETURN_BAY, ...ACCESSIBLE].map(key));
  const fill = [0.42, 0.34, 0.24, 0.2, 0.12];
  const cars = [];
  ROWS.forEach((r, row) => {
    for (let c = 1; c <= BAY.cols; c++) {
      for (const col of [c, -c]) {
        if (keep.has(key({ row, col })) || rnd() > fill[row] * (1.25 - c / BAY.cols * 0.5)) continue;
        const b = bayCentre(row, col);
        // Some reverse in; none sit dead centre.
        const yaw = b.yaw + (rnd() < 0.25 ? Math.PI : 0) + rnd.range(-0.04, 0.04);
        cars.push({ x: b.x + rnd.range(-0.15, 0.15), z: b.z + rnd.range(-0.25, 0.25), yaw, model: rnd.pick(PARKED_MODELS) });
      }
    }
  });
  // The accessible bays: one taken.
  const a = bayCentre(ACCESSIBLE[1].row, ACCESSIBLE[1].col);
  cars.push({ x: a.x, z: a.z, yaw: a.yaw, model: 'minivan' });
  return cars;
}
const key = ({ row, col }) => `${row}:${col}`;

export const ACCESSIBLE_BAYS = ACCESSIBLE.map(({ row, col }) => bayCentre(row, col));
export const CART_RETURN = (() => {
  const b = bayCentre(CART_RETURN_BAY.row, CART_RETURN_BAY.col);
  const r = ROWS[CART_RETURN_BAY.row];
  return { x: b.x, z0: r.z0 + 0.35, z1: r.z1 - 0.35, w: 1.3, slots: 10, count: 2 };
})();

// ------------------------------------------------------------------ the layout
/**
 * The world layout (MALL.md) for the site centred at `origin` (world x, z).
 * Extra fields beyond MALL.md: shelves' `kind`, racks' `along` / `front`,
 * bays' `free`.
 */
export function planLayout(origin) {
  const T = siteTransform(origin);
  const { p, yaw, rect, v3 } = T;
  const lay = {
    origin: { x: origin.x, z: origin.z },
    bounds: rect(SITE),
    building: { ...rect(BUILDING), floorY: 0, ceilingY: CEILING },
    entrances: ENTRANCES.map((e) => ({ ...p(e.x, 0), yaw: yaw(Math.PI), w: e.w })),
    exit: rect({ x0: EXIT_ROAD.x0, x1: EXIT_ROAD.x1, z0: EXIT_ROAD.z0, z1: EXIT_ROAD.z0 + 5 }),
  };

  // Her car, and her next to it on the driver's (right-hand drive: the car's right) side, facing the building.
  const her = bayCentre(HER_BAY.row, HER_BAY.col);
  lay.car = { ...p(her.x, her.z), yaw: yaw(her.yaw), model: 'car_kei_pink' };
  lay.spawn = { ...p(WALKWAY.x0 + 0.9, her.z + 0.6), yaw: yaw(0) };

  // Carts: the corral by the supermarket entry, the cart return in the lot.
  const slots = [];
  for (let i = 0; i < CORRAL.slots; i++) slots.push({ ...p(CORRAL.x0 + 0.35 + i * 0.36, CORRAL.z), yaw: yaw(Math.PI / 2) });
  const ret = [];
  for (let i = 0; i < CART_RETURN.slots; i++) ret.push({ ...p(CART_RETURN.x, CART_RETURN.z1 - 0.5 - i * 0.4), yaw: yaw(0) });
  lay.cartCorrals = [
    { ...p((CORRAL.x0 + CORRAL.x1) / 2, CORRAL.z), yaw: yaw(Math.PI / 2), count: CORRAL.count, slots },
    { ...p(CART_RETURN.x, (CART_RETURN.z0 + CART_RETURN.z1) / 2), yaw: yaw(0), count: CART_RETURN.count, slots: ret },
  ];

  // The concourse, and a spot in front of each shop's window (standing at it, facing in).
  lay.concourse = {
    zone: rect(CONCOURSE), atrium: rect(VOID),
    storefronts: UNITS.map((u) => ({ kind: u.kind, ...p((u.x0 + u.x1) / 2, ROW.z1 + 1.2), yaw: yaw(Math.PI), w: u.x1 - u.x0 })),
  };
  lay.grocery = { zone: rect(MARKET), shelves: marketShelves(T), bins: marketBins(T) };
  lay.checkouts = CHECKOUT_X.map((cx, i) => {
    const lx = cx + CHECKOUT.lane, C = CHECKOUT;
    return {
      id: `lane${i + 1}`,
      stop: { ...p(lx, C.register), yaw: yaw(Math.PI) },
      belt: { from: v3(cx, C.h + 0.02, C.beltFrom), to: v3(cx, C.h + 0.02, C.beltTo) },
      register: v3(cx - 0.12, C.h + 0.1, C.register),
      cashier: { ...p(cx - 0.95, C.register), yaw: yaw(Math.PI / 2) },
      bagging: v3(cx + 0.05, C.h - 0.06, C.bag),
      exit: p(lx, WALK_N),
    };
  });
  lay.fashion = { zone: rect(BOUTIQUE), racks: boutiqueRacks(T), fittingRooms: fittingRooms(T), till: {
    stand: { ...p(TILL.x1 + 0.75, 30), yaw: yaw(-Math.PI / 2) },
    register: v3((TILL.x0 + TILL.x1) / 2, TILL.h + 0.08, 30.4),
    cashier: { ...p(TILL.x0 - 0.85, 30), yaw: yaw(Math.PI / 2) },
  } };
  lay.nav = navGraph(T);
  lay.lot = {
    bays: ROWS.flatMap((r, row) => [...Array(BAY.cols * 2)].map((_, i) => {
      const col = i < BAY.cols ? i + 1 : BAY.cols - i - 1;
      const b = bayCentre(row, col);
      return { ...p(b.x, b.z), yaw: yaw(b.yaw), free: !TAKEN.has(key({ row, col })) };
    })),
    walkways: [SIDEWALK, ...ISLAND_SPANS.map(([z0, z1]) => ({ ...WALKWAY, z0, z1 })), ...DRIVES.map((d) => ({ ...WALKWAY, z0: d.z0, z1: d.z1 }))].map(rect),
  };
  return lay;
}

/** Bays that are not free: parked cars, hers, the cart return. */
const TAKEN = new Set([key(HER_BAY), key(CART_RETURN_BAY)]);
for (const c of parkedCars()) {
  for (let row = 0; row < ROWS.length; row++) {
    if (c.z < ROWS[row].z0 || c.z > ROWS[row].z1) continue;
    const col = Math.sign(c.x) * (Math.floor((Math.abs(c.x) - BAY.x0) / BAY.w) + 1);
    TAKEN.add(key({ row, col }));
  }
}

/** Site frame → world: points, yaws, rectangles, directions (half a turn about the origin). */
export function siteTransform(origin) {
  const ox = origin.x, oz = origin.z;
  // In (-π, π], rounded so a quarter turn reads as exactly that.
  const wrap = (a) => Math.round(Math.atan2(Math.sin(a), Math.cos(a)) * 1e9) / 1e9;
  return {
    p: (x, z) => ({ x: ox - x, z: oz - z }),
    v3: (x, y, z) => [ox - x, y, oz - z],
    yaw: (a) => wrap(a + Math.PI),
    dir: (x, z) => ({ x: -x, z: -z }),
    rect: (r) => ({ x0: ox - r.x1, z0: oz - r.z1, x1: ox - r.x0, z1: oz - r.z0 }),
  };
}

/** One shelf record per fixture section and side (products stand on `levels`). */
function marketShelves({ p, yaw, dir }) {
  const out = [];
  const add = (id, aisle, kind, levels, cx, cz, fx, fz, w, depth) => out.push({
    id, aisle, kind, ...p(cx, cz), yaw: yaw(Math.atan2(fx, fz)), w, depth, levels: LEVELS[levels], face: dir(fx, fz),
  });
  LINES.forEach((line, li) => {
    for (const side of ['west', 'east']) {
      const f = line[side];
      if (!f) continue;
      const { aisle, kind, levels } = faceOf(f);
      const s = side === 'east' ? 1 : -1;
      const front = s > 0 ? line.x1 : line.x0;
      const depth = FIXTURE[kind].depth - 0.12;
      RUNS.forEach(([z0], ri) => {
        for (let k = 0; k < 6; k++) add(`L${li}${side[0]}-${ri}-${k}`, aisle, kind, levels, front - s * depth / 2, z0 + SECTION * (k + 0.5), s, 0, SECTION, depth);
      });
    }
  });
  for (const b of BACK_WALL) {
    const depth = FIXTURE[b.kind].depth - 0.12;
    for (let k = 0; k < b.n; k++) add(`back-${b.aisle}-${k}`, b.aisle, b.kind, b.levels, b.x0 + SECTION * (k + 0.5), MARKET.z1 - depth / 2 - 0.04, 0, -1, SECTION, depth);
  }
  const depth = FIXTURE.crate.depth - 0.12;
  RUNS.forEach(([z0], ri) => {
    for (let k = 0; k < 6; k++) add(`produce-${ri}-${k}`, 'produce', 'crate', 'crate', PRODUCE_WALL_X - depth / 2 - 0.04, z0 + SECTION * (k + 0.5), -1, 0, SECTION, depth);
  });
  return out;
}

/** Produce tables and chest freezers: goods lie on a surface at `y`. */
function marketBins({ p, yaw }) {
  const out = [];
  const T = PRODUCE_TABLES;
  T.xs.forEach((x, i) => T.zs.forEach((z, j) => out.push({ id: `produce-table-${i}-${j}`, aisle: 'produce', ...p(x, z), yaw: yaw(-Math.PI / 2), w: T.w, depth: T.d, y: T.y })));
  const F = FREEZER_ISLAND;
  RUNS.forEach(([z0], ri) => {
    for (let k = 0; k < 4; k++) out.push({ id: `freezer-${ri}-${k}`, aisle: 'frozen', ...p((F.x0 + F.x1) / 2, z0 + F.len * (k + 0.5)), yaw: yaw(Math.PI / 2), w: F.len - 0.1, depth: F.x1 - F.x0 - 0.14, y: 0.42 });
  });
  return out;
}

function boutiqueRacks({ p, v3, yaw, dir }) {
  const out = [];
  const R = RAIL;
  FLOOR_RACKS.forEach(([rack, x, z], i) => {
    const hooks = [];
    for (let s = -R.len / 2 + 0.05; s <= R.len / 2 - 0.05 + 1e-6; s += R.hookStep) hooks.push(v3(x + s, R.y, z));
    // Side-hung: garments face along the rail (toward the shop's entrance end).
    out.push({ id: `rack-${i}`, rack, ...p(x, z), yaw: yaw(-Math.PI / 2), w: R.len, hooks, along: dir(1, 0), front: p(x, z - 1.1) });
  });
  const W = WALL_RACKS;
  let z0 = W.z0, n = 0;
  for (const [rack, count] of W.sets) {
    for (let k = 0; k < count; k++, z0 += W.len, n++) {
      const hooks = [];
      for (let s = 0.1; s <= W.len - 0.1 + 1e-6; s += R.hookStep) hooks.push(v3(W.x, W.y, z0 + s));
      out.push({ id: `wall-${n}`, rack, ...p(W.x, z0 + W.len / 2), yaw: yaw(Math.PI), w: W.len, hooks, along: dir(0, 1), front: p(W.x - 1.3, z0 + W.len / 2) });
    }
  }
  const S = SHOE_WALL;
  for (let k = 0; k < S.n; k++) {
    const cx = S.x0 + SECTION * (k + 0.5);
    const hooks = S.levels.flatMap((y) => S.spots.map((s) => v3(cx + s, y, S.z)));
    out.push({ id: `shoes-${k}`, rack: 'sneakers', ...p(cx, S.z), yaw: yaw(Math.PI), w: SECTION, hooks, along: dir(1, 0), front: p(cx, S.z - 1.4) });
  }
  return out;
}

function fittingRooms({ p, v3, yaw }) {
  const F = FITTING;
  return F.xs.map((x, i) => ({
    id: `fitting${i + 1}`,
    door: { ...p(x, F.front - 0.95), yaw: yaw(0) },
    inside: { ...p(x, F.front + 1.25), yaw: yaw(0) },
    mirror: { ...p(x, F.back - 0.04), y: 1.25, yaw: yaw(Math.PI) },
    hook: v3(x + F.w / 2 - 0.08, 1.75, F.front + 0.75),
    curtain: `mallCurtain${i + 1}`,
  }));
}

/**
 * The walk graph: polylines along every walkway (nodes shared where they
 * meet), so shoppers and carts keep to the aisles, lanes and paths.
 */
function navGraph({ p }) {
  const nodes = [], links = [], index = new Map();
  const node = (x, z) => {
    const k = `${x.toFixed(2)},${z.toFixed(2)}`;
    if (!index.has(k)) { index.set(k, nodes.length); const w = p(x, z); nodes.push([+w.x.toFixed(3), +w.z.toFixed(3)]); }
    return index.get(k);
  };
  const line = (pts) => { for (let i = 1; i < pts.length; i++) links.push([node(...pts[i - 1]), node(...pts[i])]); };
  const along = (xs, z) => line([...new Set(xs)].sort((a, b) => a - b).map((x) => [x, z]));
  const down = (x, zs) => line([...new Set(zs)].sort((a, b) => a - b).map((z) => [x, z]));

  // Lot: sidewalk, the walkway through the rows, drive aisles, perimeter lanes, the cart return.
  const SIDE_Z = -3.5, aisleZ = DRIVES.map((d) => (d.z0 + d.z1) / 2);
  const crossings = [-26.4, -8.8, 0, 8.8, 26.4];
  along([-37.5, -26.4, -17, -8.8, -8, 0, 8, 8.8, 18, 26.4, 37.5], SIDE_Z);
  const lotXs = [-LANE_X, -44, -35.2, -26.4, -17.6, -8.8, bayCentre(HER_BAY.row, HER_BAY.col).x, 0, CART_RETURN.x, 8.8, 17.6, 26.4, 35.2, 44, LANE_X];
  for (const z of aisleZ) along(lotXs, z);
  for (const x of crossings) down(x, [SIDE_Z, aisleZ[0]]);
  down(0, [aisleZ[0], ...ROWS.map((r) => (r.z0 + r.z1) / 2), ...aisleZ]);
  for (const s of [-1, 1]) down(s * LANE_X, aisleZ);
  down(CART_RETURN.x, [aisleZ[1], CART_RETURN.z0 - 0.4]);

  // Concourse: a walk along each row of shopfronts, joined across the atrium
  // where nothing stands on it (CROSSINGS); the courts out to the doors.
  const lanes = CHECKOUT_X.map((x) => x + CHECKOUT.lane), entry = AISLE_LANES[7].x;
  along([...CROSSINGS, -27, -17, 0], WALK_S);
  along([...CROSSINGS, ...lanes, -17, -12.6, entry, 0], WALK_N);
  for (const x of CROSSINGS) down(x, [WALK_S, WALK_N]);
  for (const e of ENTRANCES) down(e.x, [SIDE_Z, WALK_S]);

  // Supermarket: the entry, checkout lanes, cross aisles front / middle / back, every aisle.
  const ZF = 32, ZM = (RUNS[0][1] + RUNS[1][0]) / 2, ZB = 55.3;
  const aisleXs = [...AISLE_LANES.map((a) => a.x), -11.8, -3.6];
  down(entry, [WALK_N, 26, ZF]);
  for (const x of lanes) down(x, [WALK_N, 24, 28, ZF]);
  along([...aisleXs, ...lanes], ZF);
  along(aisleXs, ZM);
  along(aisleXs, ZB);
  const mid = RUNS.map(([a, b]) => (a + b) / 2);
  for (const x of aisleXs) down(x, [ZF, mid[0], ZM, mid[1], ZB]);

  // Boutique: the door, lines between the rack rows, the till, fitting rooms, shoe and mirror walls.
  const BX = [18, 24.75, 29.25, 33.75, 38.3];
  const BZ = [26, 30, 35.6, 38.6];
  down(18, [WALK_N, ...BZ]);
  along(BX, 26);
  along([TILL.x1 + 0.75, ...BX], 30);
  along(BX, 35.6);
  along([...FITTING.xs, ...BX], 38.6);
  for (const x of BX.slice(1)) down(x, BZ);
  for (const x of FITTING.xs) down(x, [38.6, FITTING.front - 0.95]);
  line([[18, 38.6], [20, 40.6], [24.75, 38.6]]);
  for (const x of [29.25, 33.75]) down(x, [38.6, 41.4]);
  along([29.25, 33.75], 41.4);
  return { nodes, links };
}
