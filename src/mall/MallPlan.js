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
export const UPPER = 5.8;                           // the upper floor (its galleries, the bridge, the walk-in rooms)
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
/**
 * The escalators' moving runs (site x): the steps come out from under the
 * landing plates at the combs, run flat to the foot / head of the incline,
 * climb it, and go under again. Two bands side by side (z: their middle),
 * the south one up (boarded at the foot), the north one down.
 */
export const RUN = { comb0: ESCALATORS.x0 + 0.7, foot: ESCALATORS.x0 + 1.5, head: ESCALATORS.x1 - 1.5, comb1: ESCALATORS.x1 - 0.7, y0: 0.12, half: 0.52 };
export const BANDS = [{ z: 15.2, up: true }, { z: 16.8, up: false }];
/** Where riders get on and off: on the landing plate below, on the bridge above. */
export const RIDE_ENDS = { foot: ESCALATORS.x0 + 0.15, head: ESCALATORS.x1 - 0.15 };
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
 * Footprints (site rects, with the height they collide to; the camera
 * passes `pass` ones: low things it looks over, the escalators' runs she
 * rides, the glass lift's shaft she rides in: stepping out of it upstairs
 * the shaft was right behind her, and the camera sat in her hair) of
 * everything standing on the concourse floor: MallConcourse's
 * collisions, and the walk graph's clearance (tested).
 */
export function concourseObstacles() {
  const out = [];
  const box = (x0, z0, x1, z1, h, pass = false) => out.push({ x0, z0, x1, z1, h, pass });
  // Round things as a cross of two rects (an octagon), close to the circle where she walks up to it.
  const round = ({ x, z, r }, h, pass) => { box(x - r, z - r * 0.62, x + r, z + r * 0.62, h, pass); box(x - r * 0.62, z - r, x + r * 0.62, z + r, h, pass); };
  const E = ESCALATORS, mid = (E.z0 + E.z1) / 2;
  // The escalators from their combs on (the landing plates before them are floor), the balustrades' feet either side of the plates.
  box(RUN.comb0, E.z0, RUN.comb1, E.z1, UPPER + 1.1, true);
  for (const [z0, z1] of [[E.z0, E.z0 + 0.2], [mid - 0.16, mid + 0.16], [E.z1 - 0.2, E.z1]]) box(E.x0 + 0.3, z0, RUN.comb0, z1, 1.1);
  round(FOUNTAIN, 0.55, true);
  round(INFO_DESK, 1.05);
  round(LIFT, UPPER_CEILING, true);
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

// ------------------------------------------------------------------ walk-in shops
export const SHOP_H = 3.2;                          // a small shop's ceiling (its fascia above, to the soffit)
export const UPPER_TOP = 9.2;                       // the upper rooms' ceiling (their fascia above)
export const SHOP_DOOR = 2.4;                       // a doorway's width
const COUNTER_H = 0.95, TABLE_H = 0.8;
const SIGN = {
  books: 'Hikari Books', denki: 'Denki Plaza', drug: 'Kirei Drug', hyaku: 'Everything ¥100', cafe: 'Sakura Bakery Café',
  toys: 'Toy Planet', shoes: 'ASHI Shoes', ramen: 'Ramen Ichiban', games: 'Game Hikari', foodcourt: 'Hikari Dining',
  cinema: 'Hikari Cinema', tea: 'Matcha Tea House', bags: 'Bag & Travel',
};
/** The upper floor's rooms she walks into (the other upper fronts stay windows): which side, how deep. */
export const UPPER_ROOMS = {
  foodcourt: { side: 'south', depth: 8, open: true },
  cinema: { side: 'north', depth: 10 },
  tea: { side: 'north', depth: 8 },
  bags: { side: 'north', depth: 8 },
};

/**
 * A counter with a clerk behind it (site frame): `face` the way from the
 * clerk to the customer; `lay` where what she buys is set down and scanned,
 * `bag` where its paper bag stands, `register` (points along the counter's
 * middle line); `goods` sold from behind it (the clerk fetches them: `pick`
 * is where the clerk stands to reach one). Points along the counter are
 * given by x (a counter along x) or z.
 */
function till(name, counter, face, at, goods = []) {
  const c = { ...counter, h: counter.h ?? COUNTER_H }, [fx, fz] = face;
  const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, half = fx ? (c.x1 - c.x0) / 2 : (c.z1 - c.z0) / 2;
  // A point on the counter's middle line at v along it, b toward the customer.
  const on = (v, b = 0) => (fx ? [cx + fx * b, v] : [v, cz + fz * b]);
  // The clerk stands half a metre behind the counter's back edge.
  const clerkAt = (v) => { const [x, z] = on(v, -(half + 0.5)); return { x, z, yaw: Math.atan2(fx, fz) }; };
  return {
    name, counter: c, face: { x: fx, z: fz }, clerk: clerkAt(at.clerk),
    lay: on(at.lay), bag: on(at.bag), register: on(at.register),
    goods: goods.map(([id, v]) => {
      const [x, z] = on(v, -half * 0.45);
      return { id, x, z, y: c.h, yaw: Math.atan2(fx, fz), staff: true, pick: clerkAt(v) };
    }),
  };
}

/** A display table of goods she takes herself (paid at the shop's till), their fronts facing `yaw` (where she stands). */
function display(table, ids, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), alongX = Math.abs(fz) > 0.5;
  const cx = (table.x0 + table.x1) / 2, cz = (table.z0 + table.z1) / 2;
  const len = alongX ? table.x1 - table.x0 : table.z1 - table.z0, step = Math.min(0.45, (len - 0.4) / Math.max(1, ids.length - 1));
  const edge = (alongX ? table.z1 - table.z0 : table.x1 - table.x0) / 2 - 0.18;
  const goods = ids.map((id, i) => {
    const a = (i - (ids.length - 1) / 2) * step;
    return { id, x: alongX ? cx + a : cx + fx * edge, z: alongX ? cz + fz * edge : cz + a, y: table.h, yaw, staff: false };
  });
  return { table, goods };
}

/**
 * The shop row's usual plan (front at ROW.z1, the room toward the lot):
 * the till across the back right, a display table of goods to the left of
 * the way in, shelves round the walls.
 */
function rowShop(u, goods) {
  const cx = (u.x0 + u.x1) / 2, x1 = u.x1;
  return {
    tills: [till(SIGN[u.kind], { x0: x1 - 3.0, x1: x1 - 0.95, z0: 4.4, z1: 5.0 }, [0, 1], { clerk: x1 - 1.9, lay: x1 - 2.4, bag: x1 - 1.85, register: x1 - 1.3 })],
    ...display({ x0: cx - 2.5, x1: cx - 0.9, z0: 5.6, z1: 6.3, h: TABLE_H }, goods, 0),
    browse: [[u.x0 + 1.05, 6.6, -Math.PI / 2], [cx - 1.7, 6.85, Math.PI], [cx + 0.6, 6.6, Math.PI / 2]],
    buy: [x1 - 2.75, 5.6, Math.PI],
    walk: [[[cx, 7.4], [u.x0 + 1.05, 7.4]], [[cx, 7.4], [x1 - 2.75, 7.4], [x1 - 2.75, 5.6]]],
  };
}

/** Per kind: the shop row's plans (the café, the ramen bar and the game centre are their own). */
const ROW_SHOPS = {
  books: (u) => rowShop(u, ['mallManga', 'mallArtBook', 'mallMagazine']),
  denki: (u) => rowShop(u, ['mallEarbuds', 'mallPhoneCase', 'mallBattery']),
  drug: (u) => rowShop(u, ['mallLotion', 'mallSunscreen', 'mallVitaminDrink']),
  hyaku: (u) => rowShop(u, ['mallNotebook', 'mallStickers', 'mallLunchBox']),
  toys: (u) => rowShop(u, ['mallRobotKit', 'mallPuzzle', 'mallCapsuleFigure']),
  shoes: (u) => rowShop(u, ['mallInsoles', 'mallShoeCare']),
  // The counter along the east wall with the cake case on it; tables toward the lot's window.
  cafe: (u) => ({
    tills: [till(SIGN.cafe, { x0: u.x1 - 1.85, x1: u.x1 - 1.05, z0: 1.2, z1: 7.4, h: 1.05 }, [-1, 0], { clerk: 6.0, lay: 5.6, bag: 6.15, register: 6.7 },
      [['mallShortcake', 3.3], ['mallCroissant', 4.0], ['mallCafeLatte', 4.7]])],
    goods: [], table: null,
    browse: [[1.6, 2.6, Math.PI / 2], [-1.0, 7.3, Math.PI]],
    buy: [2.4, 4.6, Math.PI / 2],
    walk: [[[0, 7.6], [1.6, 7.6], [1.6, 4.6], [1.6, 2.6]], [[1.6, 4.6], [2.4, 4.6]]],
  }),
  // The long counter before the kitchen, stools along it; take-away at its east end.
  ramen: (u) => ({
    tills: [till(SIGN.ramen, { x0: u.x0 + 0.4, x1: u.x1 - 0.4, z0: 5.2, z1: 5.6, h: 1.06 }, [0, 1], { clerk: u.x1 - 1.4, lay: u.x1 - 1.3, bag: u.x1 - 0.95, register: u.x1 - 0.7 },
      [['mallGyozaBox', u.x1 - 2.3], ['mallRamenTakeout', u.x1 - 1.85]])],
    goods: [], table: null,
    browse: [[u.x0 + 1.4, 6.9, Math.PI]],
    buy: [u.x1 - 2.1, 6.3, Math.PI],
    walk: [[[(u.x0 + u.x1) / 2, 7.4], [u.x0 + 1.4, 7.4]], [[(u.x0 + u.x1) / 2, 7.4], [u.x1 - 2.1, 7.4], [u.x1 - 2.1, 6.3]]],
  }),
  // Crane games either side of the aisle, the prize counter at its end.
  games: (u) => {
    const cx = (u.x0 + u.x1) / 2;
    return {
      tills: [till(SIGN.games, { x0: cx - 1.0, x1: cx + 1.0, z0: 4.4, z1: 5.0 }, [0, 1], { clerk: cx, lay: cx - 0.05, bag: cx + 0.35, register: cx + 0.7 },
        [['mallPrizeFigure', cx - 0.75], ['mallGameCard', cx - 0.45]])],
      goods: [], table: null,
      browse: [[cx - 0.6, 6.75, -Math.PI / 2], [cx + 0.6, 6.75, Math.PI / 2]],
      buy: [cx - 0.6, 5.6, Math.PI],
      walk: [[[cx, 7.4], [cx, 6.0]]],
    };
  },
};

/** The upper rooms' plans (site frame; their floor is UPPER). */
const UPPER_SHOPS = {
  // Two stalls along the back, tables before them, open to the gallery.
  foodcourt: () => ({
    tills: [
      till('Tako Tako', { x0: -4.5, x1: 1.5, z0: 3.0, z1: 3.6, h: 1.0 }, [0, 1], { clerk: -1.5, lay: 0.1, bag: 0.55, register: 1.05 }, [['mallTakoyaki', -3.6], ['mallBubbleTea', -3.0]]),
      till('Udon Kaze', { x0: 6.5, x1: 12.5, z0: 3.0, z1: 3.6, h: 1.0 }, [0, 1], { clerk: 9.5, lay: 11.1, bag: 11.55, register: 12.05 }, [['mallUdon', 7.4], ['mallMelonSoda', 8.0]]),
    ],
    goods: [], table: null,
    browse: [[-5.2, 6.4, -Math.PI / 2], [4.4, 6.4, Math.PI], [13.2, 6.4, Math.PI / 2]],
    buy: [-2.2, 4.2, Math.PI],
    walk: [[[4, 8.2], [4, 4.5]], [[-5.2, 4.5], [4, 4.5], [13.2, 4.5]]],
  }),
  // The lobby: the concession stand across the back, ticket machines, posters, benches.
  cinema: () => ({
    tills: [till('Hikari Cinema', { x0: -35, x1: -29, z0: 29.6, z1: 30.2, h: 1.0 }, [0, -1], { clerk: -32, lay: -30.6, bag: -30.1, register: -29.5 },
      [['mallPopcorn', -34.2], ['mallCinemaSoda', -33.6], ['mallPamphlet', -33.0]])],
    goods: [], table: null,
    browse: [[-38.4, 26.5, -Math.PI / 2], [-23.4, 27.5, Math.PI / 2]],
    buy: [-31.6, 29.0, 0],
    walk: [[[-31, 24.6], [-31, 27.6]], [[-38.4, 27.6], [-31, 27.6], [-23.4, 27.6]]],
  }),
  tea: () => ({
    tills: [till(SIGN.tea, { x0: -11.2, x1: -8.4, z0: 28.4, z1: 29.0, h: 1.0 }, [0, -1], { clerk: -9.8, lay: -9.4, bag: -9.0, register: -8.7 },
      [['mallParfait', -10.9], ['mallMatchaLatte', -10.45], ['mallTaiyaki', -10.0]])],
    goods: [], table: null,
    browse: [[-3.2, 27.4, Math.PI / 2]],
    buy: [-10.0, 27.8, 0],
    walk: [[[-7, 24.6], [-7, 26.9]], [[-10.0, 26.9], [-7, 26.9], [-3.2, 26.9]]],
  }),
  bags: () => ({
    tills: [till(SIGN.bags, { x0: 35.0, x1: 38.0, z0: 28.4, z1: 29.0 }, [0, -1], { clerk: 36.5, lay: 36.1, bag: 36.6, register: 37.4 })],
    ...display({ x0: 27.0, x1: 29.4, z0: 26.0, z1: 26.8, h: TABLE_H }, ['mallTote', 'mallHairClip', 'mallKeychain'], Math.PI),
    browse: [[23.2, 27.0, -Math.PI / 2], [33.0, 27.6, Math.PI / 2]],
    buy: [35.6, 27.8, 0],
    walk: [[[31, 24.6], [31, 25.3]], [[23.2, 25.3], [31, 25.3], [33.0, 25.3], [33.0, 27.6], [35.6, 27.6]]],
  }),
};

/**
 * Every shop she walks into besides the anchors: the shop row's units and
 * the upper rooms, as { kind, name, y (floor), x0, x1, z0, z1 (the room),
 * front (its front line's z), out (the concourse's side of it: +1 / -1 in
 * z), door ([x0, x1] of the doorway; null: an open front), tills, goods
 * (she takes them from `table` herself), browse / buy (where shoppers
 * look round / pay: [x, z, yaw]), walk (its walk graph: polylines of
 * [x, z], the first point just inside the doorway, later lines starting
 * on an earlier one's point) }.
 */
export const SHOPS = [
  ...UNITS.map((u) => {
    const cx = (u.x0 + u.x1) / 2;
    return { kind: u.kind, name: SIGN[u.kind], y: 0, x0: u.x0, x1: u.x1, z0: u.kind === 'cafe' ? ROW.z0 : ROW.z1 - UNIT_DEPTH, z1: ROW.z1,
      front: ROW.z1, out: 1, door: [cx - SHOP_DOOR / 2, cx + SHOP_DOOR / 2], ...ROW_SHOPS[u.kind](u) };
  }),
  ...Object.entries(UPPER_ROOMS).map(([kind, r]) => {
    const [, x0, x1] = UPPER_UNITS[r.side].find(([k]) => k === kind), south = r.side === 'south';
    const front = south ? CONCOURSE.z0 : CONCOURSE.z1, cx = (x0 + x1) / 2;
    return { kind, name: SIGN[kind], y: UPPER, x0, x1, z0: south ? front - r.depth : front, z1: south ? front : front + r.depth, front, out: south ? 1 : -1,
      door: r.open ? null : [cx - SHOP_DOOR / 2, cx + SHOP_DOOR / 2], ...UPPER_SHOPS[kind]() };
  }),
];

/** The two walks along the concourse (z) and where the walks across it run (x). */
export const WALK_S = 11, WALK_N = 20.6;
/** The upper floor's walks along its galleries (z), over the concourse's. */
export const GALLERY_S = 10.8, GALLERY_N = 21.2;
/** Where she waits for the glass lift (site z, at its x): before its door below, on its landing above. */
export const LIFT_DOORS = { ground: LIFT.z - LIFT.r - 0.7, upper: LIFT.z + LIFT.r + 0.75 };
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
export const CORRAL = { x0: -18, x1: -13.4, z: 22.25, count: 10, slots: 12 };   // carts nest from x0 (its closed end), taken out at x1

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

  // Carts: the corral by the supermarket entry, the cart return in the lot. Slots
  // from the closed end back to the open one, as carts nest (the first `count`
  // are full; the shoppers take the last of those and return to the next).
  // The corral's carts faced away from its closed end (its rail across x0,
  // MallMarket): she pulled one out through that rail, and none could be
  // pushed back in (the rail stopped it short of its slot).
  const slots = [];
  for (let i = 0; i < CORRAL.slots; i++) slots.push({ ...p(CORRAL.x0 + 0.35 + i * 0.36, CORRAL.z), yaw: yaw(-Math.PI / 2) });
  const ret = [];
  for (let i = 0; i < CART_RETURN.slots; i++) ret.push({ ...p(CART_RETURN.x, CART_RETURN.z1 - 0.5 - i * 0.4), yaw: yaw(0) });
  lay.cartCorrals = [
    { ...p((CORRAL.x0 + CORRAL.x1) / 2, CORRAL.z), yaw: yaw(-Math.PI / 2), count: CORRAL.count, slots },
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
  lay.shops = SHOPS.map((sh) => shopLayout(T, sh));
  // The upper floor: its galleries round the atrium (the void), the bridge, the rooms (shops with y > 0).
  lay.upper = { y: UPPER, ceilingY: UPPER_CEILING, zone: rect(CONCOURSE), void: rect(VOID) };
  lay.rides = BANDS.map((b, i) => {
    const lo = { ...p(RIDE_ENDS.foot, b.z), y: 0 }, hi = { ...p(RIDE_ENDS.head, b.z), y: UPPER };
    return { id: `escalator${i + 1}`, up: b.up, from: b.up ? lo : hi, to: b.up ? hi : lo, yaw: yaw(b.up ? Math.PI / 2 : -Math.PI / 2) };
  });
  lay.lift = {
    shaft: { ...p(LIFT.x, LIFT.z), r: LIFT.r },
    floors: [{ y: 0, ...p(LIFT.x, LIFT_DOORS.ground), yaw: yaw(0) }, { y: UPPER, ...p(LIFT.x, LIFT_DOORS.upper), yaw: yaw(Math.PI) }],
  };
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

/**
 * A shop in world terms (MALL.md layout.shops): its room, floor and
 * doorway, its tills (counter top, points on it, the clerk's and the
 * customer's side), the goods on its display table, the shoppers' spots.
 */
function shopLayout({ p, v3, yaw, dir, rect }, sh) {
  const y = sh.y, at = ([x, z], dy = 0) => v3(x, y + dy, z);
  const spot = ([x, z, a]) => ({ ...p(x, z), yaw: yaw(a) });
  const cx = sh.door ? (sh.door[0] + sh.door[1]) / 2 : (sh.x0 + sh.x1) / 2;
  return {
    kind: sh.kind, name: sh.name, y, zone: rect(sh),
    door: { ...p(cx, sh.front), yaw: yaw(sh.out > 0 ? 0 : Math.PI), w: sh.door ? sh.door[1] - sh.door[0] : sh.x1 - sh.x0 },
    tills: sh.tills.map((t) => ({
      name: t.name, top: y + t.counter.h, counter: rect(t.counter), face: dir(t.face.x, t.face.z),
      clerk: { ...p(t.clerk.x, t.clerk.z), yaw: yaw(t.clerk.yaw) },
      lay: at(t.lay, t.counter.h), bag: at(t.bag, t.counter.h), register: at(t.register, t.counter.h),
      goods: t.goods.map((g) => ({ id: g.id, ...p(g.x, g.z), y: y + g.y, yaw: yaw(g.yaw), pick: { ...p(g.pick.x, g.pick.z), yaw: yaw(g.pick.yaw) } })),
    })),
    goods: sh.goods.map((g) => ({ id: g.id, ...p(g.x, g.z), y: y + g.y, yaw: yaw(g.yaw) })),
    table: sh.table && { ...rect(sh.table), top: y + sh.table.h },
    browse: sh.browse.map(spot), buy: spot(sh.buy),
  };
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
 * meet), so shoppers and carts keep to the aisles, lanes and paths. Nodes
 * are [x, z, y] (y: the floor they are on); `rides` are the escalators,
 * one way: [from node, to node, index in layout.rides].
 */
function navGraph({ p }) {
  const nodes = [], links = [], rides = [], index = new Map();
  let level = 0;
  const node = (x, z) => {
    const k = `${x.toFixed(2)},${z.toFixed(2)},${level}`;
    if (!index.has(k)) { index.set(k, nodes.length); const w = p(x, z); nodes.push([+w.x.toFixed(3), +w.z.toFixed(3), level]); }
    return index.get(k);
  };
  const line = (pts) => { for (let i = 1; i < pts.length; i++) links.push([node(...pts[i - 1]), node(...pts[i])]); };
  const along = (xs, z) => line([...new Set(xs)].sort((a, b) => a - b).map((x) => [x, z]));
  const down = (x, zs) => line([...new Set(zs)].sort((a, b) => a - b).map((z) => [x, z]));
  const doorX = (sh) => (sh.door ? (sh.door[0] + sh.door[1]) / 2 : sh.walk[0][0][0]);
  // A shop's own walks, and the way in from the walk along its front (at z).
  const shop = (sh, z) => {
    line([[doorX(sh), z], sh.walk[0][0]]);
    for (const w of sh.walk) line(w);
  };

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
  // where nothing stands on it (CROSSINGS); the courts out to the doors, the
  // shops along it, the escalators' feet.
  const lanes = CHECKOUT_X.map((x) => x + CHECKOUT.lane), entry = AISLE_LANES[7].x;
  const row = SHOPS.filter((sh) => !sh.y), foot = -26.3;
  along([...CROSSINGS, -27, -17, 0, foot, ...row.map(doorX)], WALK_S);
  along([...CROSSINGS, ...lanes, -17, -12.6, entry, 0, foot], WALK_N);
  for (const x of CROSSINGS) down(x, [WALK_S, WALK_N]);
  for (const e of ENTRANCES) down(e.x, [SIDE_Z, WALK_S]);
  for (const sh of row) shop(sh, WALK_S);
  down(foot, [WALK_S, ...BANDS.map((b) => b.z), WALK_N]);
  for (const b of BANDS) line([[foot, b.z], [RIDE_ENDS.foot, b.z]]);
  const feet = BANDS.map((b) => node(RIDE_ENDS.foot, b.z));

  // The upper floor: both galleries, joined at the ends and over the bridge
  // (the escalators' heads on it); the rooms along them.
  level = UPPER;
  const up = SHOPS.filter((sh) => sh.y), bridge = (ESCALATORS.bridge[0] + ESCALATORS.bridge[1]) / 2;
  const ends = [CONCOURSE.x0 + 4, CONCOURSE.x1 - 4];
  along([...ends, bridge, ...up.filter((sh) => sh.out > 0).map(doorX)], GALLERY_S);
  along([...ends, bridge, LIFT.x, ...up.filter((sh) => sh.out < 0).map(doorX)], GALLERY_N);
  for (const x of ends) down(x, [GALLERY_S, GALLERY_N]);
  down(bridge, [GALLERY_S, ...BANDS.map((b) => b.z), GALLERY_N]);
  for (const b of BANDS) line([[RIDE_ENDS.head, b.z], [bridge, b.z]]);
  down(LIFT.x, [LIFT_DOORS.upper, GALLERY_N]);
  for (const sh of up) shop(sh, sh.out > 0 ? GALLERY_S : GALLERY_N);
  const heads = BANDS.map((b) => node(RIDE_ENDS.head, b.z));
  level = 0;
  BANDS.forEach((b, i) => rides.push(b.up ? [feet[i], heads[i], i] : [heads[i], feet[i], i]));

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
  return { nodes, links, rides };
}
