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
export const CEILING = 5.5;
export const ROOF = 8;                              // parapet top
export const BUILDING = { x0: -40, x1: 40, z0: 0, z1: 46 };
export const HALL = { x0: -40, x1: 40, z0: 0, z1: 10 };
export const MARKET = { x0: -40, x1: -2, z0: 10, z1: 46 };
export const SERVICE = { x0: -2, x1: 6, z0: 10, z1: 46 };      // restrooms, staff (closed)
export const BOUTIQUE = { x0: 6, x1: 40, z0: 10, z1: 30 };
export const STOCKROOM = { x0: 6, x1: 40, z0: 30, z1: 46 };    // behind the boutique (closed)
export const SITE = { x0: -58, x1: 58, z0: -66, z1: 47 };
export const DOOR_H = 2.6;
export const ENTRANCES = [{ x: -8, w: 3.6 }, { x: 8, w: 3.6 }];
export const BOUTIQUE_DOOR = { x0: 16, x1: 20 };               // open shopfront
export const MARKET_ENTRY = { x0: -9, x1: -4.5 };

// ------------------------------------------------------------------ supermarket
/** Gondola runs along z (6 sections each); the gap between them is the middle cross aisle. */
export const RUNS = [[21, 29], [31.5, 39.5]];
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
export const PRODUCE_TABLES = { xs: [-9.2, -5.4], zs: [24, 27.6, 33.2, 36.8], w: 2.4, d: 1.2, y: 0.82 };
/** Checkout counters: x of each counter's centre line; customers walk down the lane east of it. */
export const CHECKOUT_X = [-33.2, -29.6, -26.0, -22.4];
export const CHECKOUT = { z0: 11.2, z1: 16.8, w: 0.9, h: 0.9, register: 13.2, beltFrom: 16.5, beltTo: 13.8, bag: 11.65, lane: 1.15 };
export const CORRAL = { x0: -18, x1: -13.4, z: 9.25, count: 10, slots: 12 };   // carts nest facing the entry

// ------------------------------------------------------------------ boutique
export const FLOOR_RACKS = [
  ['tees', 22.5, 15.2], ['tees', 27, 15.2], ['shorts', 31.5, 15.2], ['shorts', 36, 15.2],
  ['blouses', 22.5, 20.2], ['blouses', 27, 20.2], ['skirts', 31.5, 20.2], ['skirts', 36, 20.2],
];
export const RAIL = { len: 1.5, y: 1.45, hookStep: 0.1 };
export const WALL_RACKS = { x: 39.65, y: 1.62, len: 1.6, z0: 12.4, sets: [['hoodies', 5], ['jeans', 5]] };
export const SHOE_WALL = { x0: 16, n: 6, z: 29.72, depth: 0.5, levels: [0.45, 0.85, 1.25, 1.65], spots: [-0.44, 0, 0.44] };
export const MIRROR_WALL = { x0: 25.5, x1: 38.5 };
export const FITTING = { xs: [7.3, 9.8, 12.3], w: 2.4, front: 27.35, back: 30, open: 1.4, wallH: 2.4, rail: 2.15 };
export const TILL = { x0: 9, x1: 9.8, z0: 15, z1: 19, h: 1.0 };
export const WINDOW_STAGES = [{ x0: 6.4, x1: 15.2, mannequins: [8, 10.8, 13.6] }, { x0: 20.8, x1: 26, mannequins: [22.2, 24.6] }];
export const STAGE = { z0: 10.4, z1: 12.2, h: 0.18 };

// ------------------------------------------------------------------ hall
export const HALL_COLUMNS = [-30, -20, 0, 20, 30];
export const HALL_BENCHES = [-25, -13, 13, 25];
export const HALL_PLANTERS = [-35, 35];

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
export const CANOPY = { d: 4, w: 7.4, y: 3.5, t: 0.28 };
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
      exit: p(lx, 7.6),
    };
  });
  lay.fashion = { zone: rect(BOUTIQUE), racks: boutiqueRacks(T), fittingRooms: fittingRooms(T), till: {
    stand: { ...p(TILL.x1 + 0.75, 17), yaw: yaw(-Math.PI / 2) },
    register: v3((TILL.x0 + TILL.x1) / 2, TILL.h + 0.08, 17.4),
    cashier: { ...p(TILL.x0 - 0.85, 17), yaw: yaw(Math.PI / 2) },
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

  // Hall: two lines either side of the columns and benches, joined between them; the doors.
  const lanes = CHECKOUT_X.map((x) => x + CHECKOUT.lane);
  const HALL_A = 2.5, HALL_B = 7.6, entry = AISLE_LANES[7].x;
  along([-37.5, -25, -17, -8, 0, 8, 18, 25, 37.5], HALL_A);
  along([-37.5, ...lanes, -17, -12.6, -8, entry, 0, 8, 18, 25, 37.5], HALL_B);
  for (const x of [-37.5, -17, -8, 8, 18, 37.5]) down(x, [HALL_A, HALL_B]);
  for (const e of ENTRANCES) down(e.x, [SIDE_Z, HALL_A]);

  // Supermarket: the entry, checkout lanes, cross aisles front / middle / back, every aisle.
  const ZF = 19, ZM = (RUNS[0][1] + RUNS[1][0]) / 2, ZB = 42.3;
  const aisleXs = [...AISLE_LANES.map((a) => a.x), -11.8, -3.6];
  down(entry, [HALL_B, 13, ZF]);
  for (const x of lanes) down(x, [HALL_B, 11, 15, ZF]);
  along([...aisleXs, ...lanes], ZF);
  along(aisleXs, ZM);
  along(aisleXs, ZB);
  const mid = RUNS.map(([a, b]) => (a + b) / 2);
  for (const x of aisleXs) down(x, [ZF, mid[0], ZM, mid[1], ZB]);

  // Boutique: the door, lines between the rack rows, the till, fitting rooms, shoe and mirror walls.
  const BX = [18, 24.75, 29.25, 33.75, 38.3];
  const BZ = [13, 17, 22.6, 25.6];
  down(18, [HALL_B, ...BZ]);
  along(BX, 13);
  along([TILL.x1 + 0.75, ...BX], 17);
  along(BX, 22.6);
  along([...FITTING.xs, ...BX], 25.6);
  for (const x of BX.slice(1)) down(x, BZ);
  for (const x of FITTING.xs) down(x, [25.6, FITTING.front - 0.95]);
  line([[18, 25.6], [20, 27.6], [24.75, 25.6]]);
  for (const x of [29.25, 33.75]) down(x, [25.6, 28.4]);
  along([29.25, 33.75], 28.4);
  return { nodes, links };
}
