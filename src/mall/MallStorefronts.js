import { C, lin } from './MallKit.js';
import { mulberry32 } from '../world/rng.js';
import { ROW, CONCOURSE, CEILING, UNITS, UNIT_DEPTH, UPPER, SOFFIT, UPPER_CEILING, UPPER_UNITS, UPPER_ROOMS, UPPER_TOP, SHOPS, SHOP_H } from './MallPlan.js';

/**
 * The shops along Hikari Mall's concourse, all of them walked into. On the
 * ground floor, the shop row's units (MallPlan UNITS): a shopfront each —
 * pilasters, glass in a frame round an open doorway, the roll-shutter box,
 * a fascia with the shop's sign — and behind it a lit, furnished room: a
 * bookshop, an electronics store, a drugstore, a 100-yen shop, a bakery
 * café (glazed to the lot as well), a toy shop, a shoe shop, a ramen bar
 * with its noren and food samples, a game centre with crane games. On the
 * upper floor, round the atrium, the walk-in rooms (UPPER_ROOMS: the food
 * court, the cinema's lobby, a tea house, a bag shop) and the fronts of
 * more shops seen through their glass (a picture of the shop inside a step
 * behind it). Every shop's till and display table stands where the plan
 * (SHOPS) says: MallShops sells from them.
 *
 * Shelves full of goods are boxes with a painted picture of their goods
 * across them (MallPictures, the sign atlas): two triangles a bay, one
 * material for all of them. Walls, counters and fixtures collide; the
 * rooms' ceilings stop the camera.
 */
const FRONT = ROW.z1;            // the shopfronts' line, facing +z (the concourse)
const BACK = FRONT - UNIT_DEPTH;
const H = SHOP_H;
const GLASS_TOP = 3.1;

/**
 * Per kind: floor finish (null: a plain colour, `carpet`), wall colour,
 * fascia colour (the sign's own ground), the till's counter (body, top,
 * band: C names; white, oak and pink unless given).
 */
const LOOK = {
  books: { floor: 'woodFloor', wall: '#efe6d0', band: '#26324a' },
  denki: { floor: 'marketFloor', wall: '#f4f4f2', band: '#f2c230' },
  drug: { floor: 'marketFloor', wall: '#f7f3f5', band: '#ffffff' },
  hyaku: { floor: 'marketFloor', wall: '#fbf6ee', band: '#e2574c' },
  cafe: { floor: 'woodFloor', wall: '#f6e7dc', band: '#f6dbe3' },
  toys: { floor: 'marketFloor', wall: '#e9f1fb', band: '#2f6fb3' },
  shoes: { floor: 'woodFloor', wall: '#ece8e2', band: '#3b3f46' },
  ramen: { floor: 'woodFloor', wall: '#3a2a20', band: '#7a2e2e', counter: ['walnut', 'oak', 'maroon'] },
  games: { floor: null, carpet: '#26233a', wall: '#1d1b2e', band: '#141518' },
  foodcourt: { floor: 'hallFloor', wall: '#f4ead8' },
  cinema: { floor: null, carpet: '#5a2430', wall: '#22263a', counter: ['navy', 'oak', 'gold'] },
  tea: { floor: 'woodFloor', wall: '#eef0e2', counter: ['walnut', 'oak', 'green'] },
  bags: { floor: 'woodFloor', wall: '#f3eee8' },
};
const lookCache = new Map();
const col = (hex) => { let c = lookCache.get(hex); if (!c) lookCache.set(hex, (c = lin(hex))); return c; };
const shopOf = (kind) => SHOPS.find((s) => s.kind === kind);

export function buildStorefronts(site, mats, signs) {
  // One zone with the concourse: always seen together, so separate batches would only add draws.
  const { cast, still } = site.zone('concourse');
  const ctx = { site, M: mats, signs, cast, still, y: 0 };
  for (const u of UNITS) {
    const sh = shopOf(u.kind);
    shopfront(ctx, u, sh);
    room(ctx, u);
    for (const t of sh.tills) counter(ctx, t, LOOK[u.kind].counter);
    if (sh.table) displayTable(ctx, sh.table);
    DRESS[u.kind](ctx, u, sh);
  }
  // Pilasters at every party wall (once each), stone, full height to the soffit.
  for (const x of new Set(UNITS.flatMap((u) => [u.x0, u.x1]))) {
    if (Math.abs(x) >= CONCOURSE.x1 - 0.01) continue;
    still.box(mats.satin, C.stone, x - 0.2, 0, FRONT - 0.05, x + 0.2, SOFFIT, FRONT + 0.3);
    site.collide(x - 0.2, FRONT - 0.05, x + 0.2, FRONT + 0.3, 0, SOFFIT);
  }
  upperFronts(ctx);
  const up = { ...ctx, y: UPPER };
  for (const kind of Object.keys(UPPER_ROOMS)) {
    const sh = shopOf(kind);
    upperRoom(up, sh);
    for (const t of sh.tills) counter(up, t, LOOK[kind].counter);
    if (sh.table) displayTable(up, sh.table);
    UPPER_DRESS[kind](up, sh);
  }
}

/**
 * The front: kick plate, glass with mullions either side of an open
 * doorway, a header over it, the shutter box, fascia and sign, an OPEN card.
 */
function shopfront({ site, M, signs, still }, u, sh) {
  const x0 = u.x0 + 0.2, x1 = u.x1 - 0.2, cx = (u.x0 + u.x1) / 2, z = FRONT + 0.05;
  const [d0, d1] = sh.door;
  const L = LOOK[u.kind];
  for (const [a, b] of [[x0, d0], [d1, x1]]) {
    still.panel(M.glass, C.white, (a + b) / 2, z, [0, 1], b - a, 0.12, GLASS_TOP);
    still.box(M.metal, C.frame, a, 0, z - 0.05, b, 0.12, z + 0.05);
    const n = Math.max(1, Math.round((b - a) / 1.6));
    for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; still.box(M.metal, C.frame, x - 0.035, 0, z - 0.05, x + 0.035, GLASS_TOP, z + 0.05); }
  }
  site.collide(u.x0, FRONT - 0.05, d0, FRONT + 0.15, 0, H);
  site.collide(d1, FRONT - 0.05, u.x1, FRONT + 0.15, 0, H);
  // The doorway: a header over it, a stainless threshold; the transom above the glass.
  still.box(M.metal, C.frame, x0, GLASS_TOP, z - 0.05, x1, H, z + 0.05);
  still.box(M.metal, C.frame, d0, 2.4, z - 0.06, d1, GLASS_TOP, z + 0.06);
  still.box(M.metal, C.steel, d0, 0.01, z - 0.12, d1, 0.02, z + 0.12);
  site.collide(d0, FRONT - 0.05, d1, FRONT + 0.15, 2.4, H);
  still.panel(signs.material, C.white, d0 - 0.45, z + 0.012, [0, 1], 0.36, 1.55, 1.73, signs.rect('open'));
  // Shutter box, fascia, sign; a light line over the glass.
  still.box(M.satin, C.steel, x0, H, z - 0.05, x1, H + 0.22, z + 0.2);
  still.box(M.satin, col(L.band), u.x0 + 0.2, H + 0.22, FRONT - 0.05, u.x1 - 0.2, SOFFIT, FRONT + 0.25);
  const sw = Math.min(x1 - x0 - 0.8, 4.6), sh2 = sw / signs.aspect(u.kind);
  still.panel(signs.material, C.white, cx, FRONT + 0.265, [0, 1], sw, 4.28 - sh2 / 2, 4.28 + sh2 / 2, signs.rect(u.kind));
  still.flat(M.glow, C.light, x0, z + 0.2, x1, z + 0.26, H + 0.215, true);
  site.collide(u.x0, FRONT - 0.05, u.x1, FRONT + 0.25, H, SOFFIT);
}

/** The room behind the front: floor, walls, ceiling with its lights (the café runs through to the lot's window); its walls and ceiling collide. */
function room({ site, M, still }, u) {
  const L = LOOK[u.kind], back = u.kind === 'cafe' ? ROW.z0 : BACK;
  const x0 = u.x0 + 0.05, x1 = u.x1 - 0.05;
  if (L.floor) still.flat(M[L.floor], C.white, x0, back, x1, FRONT, 0.01);
  else still.flat(M.matte, col(L.carpet), x0, back, x1, FRONT, 0.01);
  const wall = col(L.wall);
  if (back > ROW.z0) {
    still.panel(M.matte, wall, (x0 + x1) / 2, back + 0.01, [0, 1], x1 - x0, 0, H);
    site.collide(u.x0, back - 0.1, u.x1, back, 0, H);
  }
  still.panel(M.matte, wall, x0 + 0.01, (back + FRONT) / 2, [1, 0], FRONT - back, 0, H);
  still.panel(M.matte, wall, x1 - 0.01, (back + FRONT) / 2, [-1, 0], FRONT - back, 0, H);
  for (const x of [u.x0, u.x1]) site.collide(x - 0.05, back, x + 0.05, FRONT, 0, H);
  still.flat(M.ceiling, C.white, x0, back, x1, FRONT, H, true);
  site.collide(u.x0, back, u.x1, FRONT, H, H + 0.1);
  const light = u.kind === 'games' ? col('#b98cff') : C.light;
  for (let x = x0 + 1.2; x < x1 - 0.6; x += 2) {
    for (let z = back + 1; z < FRONT - 0.5; z += 2) still.flat(M.glow, light, x - 0.3, z - 0.3, x + 0.3, z + 0.3, H - 0.01, true);
  }
}

// ---------------------------------------------------------------- tills and tables
/**
 * A till's counter (MallPlan till): its body and top, a band of colour and
 * a kick plate on the customer's side, the register with its screen toward
 * the clerk and the card reader by her.
 */
function counter({ site, M, signs, cast, still, y }, t, [body, top, band] = ['white', 'oak', 'pink']) {
  const c = t.counter, h = y + c.h, f = t.face, alongZ = f.x !== 0;
  cast.box(M.satin, C[body], c.x0, y, c.z0, c.x1, h - 0.05, c.z1);
  cast.box(M.satin, C[top], c.x0 - 0.03, h - 0.05, c.z0 - 0.03, c.x1 + 0.03, h, c.z1 + 0.03);
  site.collide(c.x0, c.z0, c.x1, c.z1, y, h);
  // The customer's face.
  const px = alongZ ? (f.x > 0 ? c.x1 : c.x0) + f.x * 0.005 : (c.x0 + c.x1) / 2;
  const pz = alongZ ? (c.z0 + c.z1) / 2 : (f.z > 0 ? c.z1 : c.z0) + f.z * 0.005;
  const w = alongZ ? c.z1 - c.z0 : c.x1 - c.x0;
  still.panel(M.satin, C[band], px, pz, [f.x, f.z], w, h - 0.32, h - 0.2);
  still.panel(M.matte, C.charcoal, px + f.x * 0.002, pz + f.z * 0.002, [f.x, f.z], w, y, y + 0.1);
  // Register: a base, an upright screen on the clerk's side (its picture toward the clerk), the card reader on hers.
  const [rx, rz] = t.register, ax = alongZ ? 0.02 : 0.15, az = alongZ ? 0.15 : 0.02;
  cast.box(M.gloss, C.dark, rx - 0.17, h, rz - 0.15, rx + 0.17, h + 0.08, rz + 0.15);
  const sx = rx - f.x * 0.1, sz = rz - f.z * 0.1;
  cast.box(M.gloss, C.black, sx - ax, h + 0.08, sz - az, sx + ax, h + 0.32, sz + az);
  still.panel(signs.material, C.white, sx - f.x * 0.025, sz - f.z * 0.025, [-f.x, -f.z], 0.27, h + 0.1, h + 0.3, signs.rect('screen'));
  const qx = rx + f.x * 0.24, qz = rz + f.z * 0.24;
  cast.box(M.gloss, C.black, qx - 0.05, h, qz - 0.05, qx + 0.05, h + 0.13, qz + 0.05);
}

/** The display table she takes goods from (its top at the plan's height above the floor). */
function displayTable({ site, M, cast, y }, t) {
  const top = y + t.h;
  cast.box(M.satin, C.oak, t.x0, top - 0.05, t.z0, t.x1, top, t.z1);
  cast.box(M.satin, C.white, t.x0 + 0.08, y, t.z0 + 0.08, t.x1 - 0.08, top - 0.05, t.z1 - 0.08);
  site.collide(t.x0, t.z0, t.x1, t.z1, y, top);
}

// ---------------------------------------------------------------- fixtures
/**
 * A wall bay of goods: a carcass `depth` deep standing against a wall,
 * its picture across the front, a board lip at every shelf the picture
 * shows. `f` is the way it faces (unit x or z); (cx, cz) the centre of its front.
 */
function bay({ site, M, signs, cast, still, y: fy }, id, rows, cx, cz, f, w, y0, y1, depth, frame = C.walnut) {
  const rx = Math.abs(f[1]), rz = Math.abs(f[0]);                // the front's run (x or z)
  const bx = cx - f[0] * depth / 2, bz = cz - f[1] * depth / 2;
  const sx = rx * w + rz * depth, sz = rz * w + rx * depth;
  cast.box(M.satin, frame, bx - sx / 2, fy, bz - sz / 2, bx + sx / 2, fy + y1 + 0.06, bz + sz / 2);
  site.collide(bx - sx / 2, bz - sz / 2, bx + sx / 2, bz + sz / 2, fy, fy + y1 + 0.06);
  still.panel(signs.print, C.white, cx + f[0] * 0.008, cz + f[1] * 0.008, f, w - 0.06, fy + y0, fy + y1, signs.rect(id));
  for (let k = 0; k <= rows; k++) {
    const y = fy + y0 + (y1 - y0) * k / rows;
    const lx = cx + f[0] * 0.02, lz = cz + f[1] * 0.02;
    still.box(M.satin, frame, lx - (rx * w + rz * 0.04) / 2, y - 0.02, lz - (rz * w + rx * 0.04) / 2, lx + (rx * w + rz * 0.04) / 2, y + 0.005, lz + (rz * w + rx * 0.04) / 2);
  }
}

/** A double-sided island run along z (gondola): goods both sides, a coloured header. */
function gondola(ctx, id, rows, x, z0, z1, h, frame, header) {
  const { M, cast } = ctx, len = z1 - z0, cz = (z0 + z1) / 2;
  for (const s of [-1, 1]) bay(ctx, id, rows, x + s * 0.3, cz, [s, 0], len, 0.15, h, 0.3, frame);
  cast.box(M.satin, header, x - 0.32, h + 0.06, z0, x + 0.32, h + 0.26, z1);
}

const PALETTE = [C.red, C.blue, C.yellow, C.pink, C.green, C.orange, C.purple, C.teal, C.white, C.navy];

/** Back wall and both side walls lined with bays of one picture. */
function lined(ctx, u, id, rows, y1, frame) {
  const x0 = u.x0 + 0.05, x1 = u.x1 - 0.05, w = x1 - x0;
  const n = Math.max(1, Math.round(w / 1.3));
  for (let i = 0; i < n; i++) bay(ctx, id, rows, x0 + w * (i + 0.5) / n, BACK + 0.45, [0, 1], w / n, 0.15, y1, 0.45, frame);
  for (const [x, f] of [[x0 + 0.45, 1], [x1 - 0.45, -1]]) {
    for (let k = 0; k < 3; k++) bay(ctx, id, rows, x, BACK + 0.6 + 1.3 * (k + 0.5), [f, 0], 1.3, 0.15, y1, 0.45, frame);
  }
}

/** A round table on the floor at y, `seats` stools round it at r. */
function cafeTable({ site, M, cast }, x, y, z, top, seats, r = 0.6) {
  cast.cylinder(M.metal, C.dark, x, y, z, 0.05, 0.72, 8);
  cast.cylinder(M.satin, top, x, y + 0.72, z, 0.4, 0.04, 16);
  site.collide(x - 0.4, z - 0.4, x + 0.4, z + 0.4, y, y + 0.76, { camera: false });
  for (let i = 0; i < seats; i++) {
    const a = i * Math.PI * 2 / seats, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
    cast.cylinder(M.metal, C.dark, sx, y, sz, 0.03, 0.45, 6);
    cast.cylinder(M.satin, C.oak, sx, y + 0.45, sz, 0.2, 0.04, 12);
  }
}

/** A crane game facing f (±1 in z): cabinet, glass case with its picture, a lit pink top. */
function crane({ site, M, signs, cast, still }, x, z, f) {
  cast.box(M.gloss, C.snow, x - 0.45, 0, z - 0.45, x + 0.45, 0.8, z + 0.45);
  still.panel(M.glass, C.white, x, z + f * 0.45, [0, f], 0.86, 0.8, 1.85);
  still.panel(signs.material, C.white, x, z - f * 0.1, [0, f], 0.86, 0.05, 1.9, signs.rect('crane'));
  cast.box(M.gloss, C.pink, x - 0.47, 1.85, z - 0.47, x + 0.47, 2.1, z + 0.47);
  still.box(M.glow, col('#ffb3e6'), x - 0.47, 2.1, z - 0.47, x + 0.47, 2.14, z + 0.47);
  site.collide(x - 0.47, z - 0.47, x + 0.47, z + 0.47, 0, 2.14);
}

const DRESS = {
  books(ctx, u) {
    lined(ctx, u, 'shelfBooks', 5, 2.5, C.walnut);
    const cx = (u.x0 + u.x1) / 2;
    // A magazine rack in the window, faces out; a "new" board by the door.
    bay(ctx, 'shelfBooks', 3, cx + 2.2, FRONT - 0.5, [0, 1], 1.4, 0.3, 1.3, 0.3, C.walnut);
    ctx.cast.box(ctx.M.metal, C.frame, cx - 2.22, 0, FRONT - 0.33, cx - 2.18, 1.0, FRONT - 0.31);
    ctx.still.panel(ctx.signs.print, C.white, cx - 2.2, FRONT - 0.3, [0, 1], 0.55, 1.0, 1.73, ctx.signs.rect('newItem'));
  },
  denki(ctx, u) {
    const { M, signs, cast, still, site } = ctx, cx = (u.x0 + u.x1) / 2;
    // The TV wall: screens lit on a dark wall; gadgets along the side walls.
    cast.box(M.satin, C.dark, u.x0 + 0.3, 0, BACK, u.x1 - 0.3, 2.9, BACK + 0.2);
    site.collide(u.x0 + 0.3, BACK, u.x1 - 0.3, BACK + 0.2, 0, 2.9);
    still.panel(signs.material, C.white, cx, BACK + 0.212, [0, 1], u.x1 - u.x0 - 1, 0.7, 2.7, signs.rect('screens'));
    for (const [x, f] of [[u.x0 + 0.5, 1], [u.x1 - 0.5, -1]]) for (let k = 0; k < 3; k++) bay(ctx, 'screens', 2, x, BACK + 3.0 + 1.3 * k, [f, 0], 1.2, 0.9, 2.1, 0.4, C.white);
    // A big screen on a stand in the window.
    cast.box(M.metal, C.dark, cx + 1.9 - 0.06, 0, FRONT - 0.6, cx + 1.9 + 0.06, 1.0, FRONT - 0.5);
    cast.box(M.gloss, C.black, cx + 1.9 - 0.9, 1.0, FRONT - 0.62, cx + 1.9 + 0.9, 2.05, FRONT - 0.56);
    still.panel(signs.material, C.white, cx + 1.9, FRONT - 0.548, [0, 1], 1.72, 1.04, 2.01, signs.rect('adScreen'));
    site.collide(cx + 1.0, FRONT - 0.62, cx + 2.8, FRONT - 0.5, 0, 2.05);
  },
  drug(ctx, u) {
    const { M, signs, cast, still, site } = ctx, cx = (u.x0 + u.x1) / 2;
    lined(ctx, u, 'shelfCosmetics', 5, 2.3, C.white);
    gondola(ctx, 'shelfCosmetics', 5, cx + 1.9, 5.8, 7.0, 1.55, C.white, C.blue);
    still.panel(signs.print, C.white, cx + 1.9, 7.03, [0, 1], 0.24, 1.25, 1.55, signs.rect('price198'));
    // A stack of baskets by the door.
    for (let k = 0; k < 6; k++) cast.box(M.satin, C.red, cx - 2.65, 0.02 + k * 0.08, FRONT - 0.75, cx - 2.2, 0.1 + k * 0.08, FRONT - 0.42);
    site.collide(cx - 2.65, FRONT - 0.75, cx - 2.2, FRONT - 0.42, 0, 0.5);
  },
  hyaku(ctx, u) {
    const { signs, still } = ctx, cx = (u.x0 + u.x1) / 2;
    lined(ctx, u, 'shelfHyaku', 5, 2.4, C.white);
    gondola(ctx, 'shelfHyaku', 5, cx + 1.9, 5.8, 7.0, 1.65, C.white, C.red);
    // Price cards hanging over the way in.
    for (const x of [cx - 0.6, cx + 0.6]) for (const f of [-1, 1]) still.panel(signs.print, C.white, x, 7.8 + f * 0.003, [0, f], 0.45, 2.3, 2.9, signs.rect('price98'));
  },
  cafe(ctx, u, sh) {
    const { M, signs, cast, still, site } = ctx;
    const x0 = u.x0 + 0.05, x1 = u.x1 - 0.05, c = sh.tills[0].counter, cx = (c.x0 + c.x1) / 2;
    // The cake case on the counter, the coffee machine; menus over it, bread racks behind.
    still.panel(signs.print, C.white, c.x0 - 0.01, 4.0, [-1, 0], 2.6, 0.15, 0.95, signs.rect('pastry'));
    cast.box(M.metal, C.steel, cx - 0.35, c.h, 2.0, cx + 0.3, c.h + 0.45, 2.6);
    still.panel(M.glass, C.white, c.x0 - 0.02, 4.0, [-1, 0], 2.6, c.h, c.h + 0.4);
    still.flat(M.glass, C.white, c.x0 - 0.02, 2.7, cx + 0.05, 5.3, c.h + 0.4);
    for (const z of [2.2, 4.0, 5.8]) still.panel(signs.material, C.white, x1 - 0.02, z, [-1, 0], 1.6, 2.1, 2.9, signs.rect('cafeMenu'));
    for (const z of [2.3, 5.7]) bay(ctx, 'breadRack', 3, x1 - 0.3, z, [-1, 0], 1.6, 0.2, 1.6, 0.3, C.walnut);
    // A banquette along the west wall, round tables and chairs, pendants over them.
    cast.box(M.fabric, C.pink, x0, 0, 1.0, x0 + 0.55, 0.45, 8.2);
    cast.box(M.fabric, C.pink, x0, 0.45, 1.0, x0 + 0.15, 1.05, 8.2);
    site.collide(x0, 1.0, x0 + 0.55, 8.2, 0, 0.45, { camera: false });
    for (const [x, z] of [[x0 + 1.2, 2.0], [x0 + 1.2, 4.3], [x0 + 1.2, 6.6], [x0 + 3.4, 3.1], [x0 + 3.4, 5.6]]) {
      cafeTable(ctx, x, 0, z, C.cream, x > x0 + 2 ? 2 : 0);
      cast.cylinder(M.gloss, C.white, x - 0.12, 0.76, z + 0.1, 0.05, 0.08, 8);
      still.rod(M.metal, C.dark, [x, 2.7, z], [x, H, z], 0.006, 3);
      still.sphere(M.glow, C.light, x, 2.62, z, 0.13, 0.8, 8);
      cast.cylinder(M.satin, C.cream, x, 2.62, z, 0.2, 0.12, 12, 0.06);
    }
    // A chalkboard by the door and flowers.
    cast.turned(M.satin, C.walnut, x0 + 3.2, 0.55, FRONT - 0.5, 0.6, 1.1, 0.04, 0, 0.12);
    still.panel(signs.print, C.white, x0 + 3.2, FRONT - 0.47, [0, 1], 0.5, 0.15, 0.95, signs.rect('cafeMenu'));
    cast.cylinder(M.gloss, C.white, cx, c.h, 7.15, 0.07, 0.2, 10);
    cast.sphere(M.matte, C.pink, cx, c.h + 0.28, 7.15, 0.14, 0.8, 6);
  },
  toys(ctx, u) {
    const { M, cast, site } = ctx, cx = (u.x0 + u.x1) / 2;
    lined(ctx, u, 'shelfToys', 4, 2.4, C.white);
    // A giant bear on a round stage in the window, balloons over it.
    const bx = cx + 2.15, by = 0.3, bz = FRONT - 0.95, fur = col('#c98a4b'), s = 0.7;
    cast.cylinder(M.gloss, C.yellow, bx, 0, bz, 0.62, 0.3, 24);
    site.collide(bx - 0.62, bz - 0.62, bx + 0.62, bz + 0.62, 0, 1.6);
    cast.sphere(M.matte, fur, bx, by + 0.55 * s, bz, 0.55 * s, 1.0, 10);
    cast.sphere(M.matte, fur, bx, by + 1.35 * s, bz, 0.38 * s, 0.95, 10);
    for (const k of [-1, 1]) {
      cast.sphere(M.matte, fur, bx + k * 0.3 * s, by + 1.68 * s, bz, 0.13 * s, 1, 6);
      cast.sphere(M.matte, fur, bx + k * 0.5 * s, by + 0.75 * s, bz + 0.15 * s, 0.17 * s, 1.4, 6);
      cast.sphere(M.matte, fur, bx + k * 0.28 * s, by + 0.12 * s, bz + 0.25 * s, 0.2 * s, 0.8, 6);
    }
    cast.sphere(M.matte, C.cream, bx, by + 1.28 * s, bz + 0.33 * s, 0.14 * s, 0.8, 6);
    cast.box(M.satin, C.red, bx - 0.2 * s, by + 1.02 * s, bz + 0.3 * s, bx + 0.2 * s, by + 1.1 * s, bz + 0.38 * s);
    for (let i = 0; i < 5; i++) {
      const x = bx - 0.4 + i * 0.2, z = bz - 0.2 + (i % 2) * 0.3, y = 2.3 + (i % 2) * 0.25;
      ctx.still.rod(M.metal, C.white, [bx, 1.5, bz], [x, y - 0.18, z], 0.004, 3);
      cast.sphere(M.gloss, PALETTE[i], x, y, z, 0.18, 1.15, 8);
    }
  },
  shoes(ctx, u) {
    const { M, cast, site } = ctx, cx = (u.x0 + u.x1) / 2, rnd = mulberry32(9);
    lined(ctx, u, 'shelfShoes', 4, 2.3, C.white);
    // A fitting bench, display plinths in the window, a low mirror.
    cast.box(M.fabric, C.charcoal, cx + 1.3, 0.05, 6.1, cx + 2.5, 0.45, 6.55);
    cast.box(M.metal, C.steel, cx + 1.35, 0, 6.15, cx + 2.45, 0.05, 6.5);
    site.collide(cx + 1.3, 6.1, cx + 2.5, 6.55, 0, 0.45, { camera: false });
    for (const [x, z, h] of [[cx - 2.3, FRONT - 0.6, 0.35], [cx - 1.6, FRONT - 0.5, 0.6], [cx + 2.1, FRONT - 0.6, 0.45]]) {
      cast.box(M.gloss, C.snow, x - 0.3, 0, z - 0.3, x + 0.3, h, z + 0.3);
      cast.box(M.satin, PALETTE[Math.floor(rnd() * PALETTE.length)], x - 0.14, h, z - 0.06, x + 0.16, h + 0.1, z + 0.06);
      site.collide(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, h + 0.1);
    }
    ctx.still.panel(M.mirror, C.white, u.x0 + 0.06, 5.0, [1, 0], 0.5, 0.05, 0.6);
  },
  ramen(ctx, u, sh) {
    const { M, signs, cast, still, site } = ctx, cx = (u.x0 + u.x1) / 2;
    const x0 = u.x0 + 0.05, x1 = u.x1 - 0.05, c = sh.tills[0].counter;
    // The kitchen behind the counter: steel wall, pots on the range, menu boards lit over it.
    cast.box(M.metal, C.steel, x0, 0, BACK, x1, 2.2, BACK + 0.6);
    for (let i = 0; i < 4; i++) cast.cylinder(M.metal, C.steel, x0 + 1.2 + i * 1.3, 0.9, BACK + 1.2, 0.22, 0.4, 14);
    cast.box(M.metal, C.steel, x0 + 0.6, 0, BACK + 0.9, x1 - 0.6, 0.9, BACK + 1.5);
    site.collide(x0, BACK, x1, BACK + 1.5, 0, 2.2);
    for (const s of [-1, 1]) still.panel(signs.material, C.white, cx + s * 1.6, BACK + 0.62, [0, 1], 2.8, 2.25, 2.95, signs.rect('ramenMenu'));
    // Stools along the counter, bowls on it; its take-away end left clear.
    for (let x = x0 + 0.9; x < x1 - 2.6; x += 0.75) {
      cast.cylinder(M.metal, C.dark, x, 0, 6.0, 0.03, 0.7, 6);
      cast.cylinder(M.satin, C.red, x, 0.7, 6.0, 0.19, 0.06, 12);
      site.collide(x - 0.19, 5.81, x + 0.19, 6.19, 0, 0.76, { camera: false });
      cast.cylinder(M.gloss, C.black, x, c.h, 5.45, 0.11, 0.06, 10, 0.08);
    }
    // Red lanterns either side of the door, the noren over it, the sample case in the window.
    for (const s of [-1, 1]) {
      cast.sphere(M.gloss, C.red, cx + s * 1.5, 2.55, FRONT - 0.35, 0.22, 1.3, 10);
      still.rod(M.metal, C.dark, [cx + s * 1.5, 2.83, FRONT - 0.35], [cx + s * 1.5, H, FRONT - 0.35], 0.006, 3);
    }
    for (let i = 0; i < 4; i++) still.panel(M.fabric, C.navy, cx - 0.66 + i * 0.44, FRONT - 0.12, [0, 1], 0.4, 2.0, 2.4);
    const sx = cx + 2.1;
    cast.box(M.satin, C.walnut, sx - 0.9, 0, FRONT - 0.7, sx + 0.9, 0.8, FRONT - 0.2);
    still.panel(signs.print, C.white, sx, FRONT - 0.42, [0, 1], 1.7, 0.82, 1.42, signs.rect('samples'));
    still.panel(M.glass, C.white, sx, FRONT - 0.2, [0, 1], 1.8, 0.8, 1.5);
    still.flat(M.glow, C.light, sx - 0.85, FRONT - 0.68, sx + 0.85, FRONT - 0.22, 1.5, true);
    site.collide(sx - 0.9, FRONT - 0.7, sx + 0.9, FRONT - 0.2, 0, 1.5);
  },
  games(ctx, u) {
    const { M, signs, cast, still, site } = ctx, cx = (u.x0 + u.x1) / 2;
    const x0 = u.x0 + 0.05, x1 = u.x1 - 0.05;
    // Crane games either side of the aisle in two rows, rhythm cabinets at the back, neon on the ceiling.
    for (const dx of [-3, -2, 2, 3]) { crane(ctx, cx + dx, FRONT - 1.1, 1); crane(ctx, cx + dx, 5.6, 1); }
    for (const x of [x0 + 1.5, x1 - 1.5]) {
      cast.box(M.gloss, C.black, x - 0.6, 0, BACK + 0.1, x + 0.6, 2.4, BACK + 0.9);
      still.panel(signs.material, C.white, x, BACK + 0.912, [0, 1], 1.1, 0.4, 2.3, signs.rect('rhythm'));
      site.collide(x - 0.6, BACK + 0.1, x + 0.6, BACK + 0.9, 0, 2.4);
    }
    // Prizes on shelves behind the prize counter.
    bay(ctx, 'shelfToys', 3, cx, BACK + 0.25, [0, 1], 2.2, 0.6, 2.2, 0.25, C.black);
    for (const [c, z] of [['#ff5ad1', 4.2], ['#4fe3ff', 6.4]]) still.box(M.glow, col(c), x0 + 0.3, H - 0.06, z, x1 - 0.3, H - 0.02, z + 0.05);
    still.box(M.matte, col('#5b2a86'), cx - 0.7, 0.01, 5.2, cx + 0.7, 0.02, FRONT - 0.2);
  },
};

// ---------------------------------------------------------------- upper floor
/**
 * The upper floor's shops on both sides of the atrium. The walk-in rooms
 * (UPPER_ROOMS) get a glass front round a doorway (the food court's is
 * open); the others a frame and glass, and a step behind the glass the
 * shop itself (a picture of its inside, lit, with a floor and ceiling
 * before it). The fronts are the galleries' edge on that side: they collide.
 */
const ROOMS = { sports: 'roomShelves', home: 'roomShelves', optical: 'roomShelves', kids: 'roomShelves', wear: 'roomRacks', salon: 'roomRacks', music: 'roomShelves', home2: 'roomShelves' };
const TINTS = ['#ffffff', '#fff3ea', '#eef6ff', '#f7ffef'];
function upperFronts({ site, M, signs, still }) {
  const sides = [[UPPER_UNITS.south, CONCOURSE.z0, 1], [UPPER_UNITS.north, CONCOURSE.z1, -1]];
  const top = UPPER_TOP, depth = 1.3;
  let n = 0;
  for (const [units, z, f] of sides) {
    for (const [kind, x0, x1] of units) {
      const cx = (x0 + x1) / 2, w = x1 - x0, zb = z - f * depth, sh = UPPER_ROOMS[kind] ? shopOf(kind) : null;
      if (!sh) {
        // Shop: floor, ceiling with a light line, the picture across its back.
        still.flat(M.hallFloor, C.white, x0, Math.min(z, zb), x1, Math.max(z, zb), UPPER + 0.005);
        still.flat(M.ceiling, C.white, x0, Math.min(z, zb), x1, Math.max(z, zb), top, true);
        still.flat(M.glow, C.light, x0 + 0.3, Math.min(z, zb) + 0.5, x1 - 0.3, Math.min(z, zb) + 0.65, top - 0.01, true);
        const bays = Math.max(1, Math.round(w / 6.4));
        for (let i = 0; i < bays; i++) {
          still.panel(signs.material, col(TINTS[(n + i) % TINTS.length]), x0 + w * (i + 0.5) / bays, zb + f * 0.01, [0, f], w / bays, UPPER, top, signs.rect(ROOMS[kind]));
        }
      }
      // Front: glass (either side of the doorway), frame and mullions; the fascia and sign above.
      const spans = !sh ? [[x0 + 0.2, x1 - 0.2]] : sh.door ? [[x0 + 0.2, sh.door[0]], [sh.door[1], x1 - 0.2]] : [];
      for (const [a, b] of spans) {
        still.panel(M.glass, C.white, (a + b) / 2, z + f * 0.02, [0, f], b - a, UPPER + 0.08, top);
        const m = Math.max(1, Math.round((b - a) / 1.6));
        for (let i = 0; i <= m; i++) { const x = a + (b - a) * i / m; still.box(M.metal, C.frame, x - 0.035, UPPER, z - 0.04, x + 0.035, top, z + 0.04); }
        still.box(M.metal, C.frame, a, UPPER, z - 0.05, b, UPPER + 0.1, z + 0.05);
        site.collide(a === x0 + 0.2 ? x0 : a, z - 0.06, b === x1 - 0.2 ? x1 : b, z + 0.06, UPPER, top);
      }
      if (sh?.door) {
        still.box(M.metal, C.frame, sh.door[0], UPPER + 2.4, z - 0.05, sh.door[1], top, z + 0.05);
        site.collide(sh.door[0], z - 0.06, sh.door[1], z + 0.06, UPPER + 2.4, top);
      }
      still.box(M.satin, C.snow, x0, top, Math.min(z, z + f * 0.25), x1, UPPER_CEILING, Math.max(z, z + f * 0.25));
      site.collide(x0, Math.min(z, z + f * 0.25), x1, Math.max(z, z + f * 0.25), top, UPPER_CEILING);
      const sw = Math.min(w - 1.2, 5.2), sh2 = sw / signs.aspect(kind);
      still.panel(signs.material, C.white, cx, z + f * 0.265, [0, f], sw, (top + UPPER_CEILING) / 2 - sh2 / 2, (top + UPPER_CEILING) / 2 + sh2 / 2, signs.rect(kind));
      // Party walls between shops.
      still.box(M.satin, C.stone, x0 - 0.15, UPPER, Math.min(z, zb) - (f < 0 ? 0.3 : 0), x0 + 0.15, UPPER_CEILING, Math.max(z, zb) + (f > 0 ? 0.3 : 0));
      n++;
    }
  }
}

/**
 * A walk-in room upstairs: its floor (and the slab under it, walked on),
 * walls both sides and at the back, the ceiling with its lights, all colliding.
 */
function upperRoom({ site, M, still }, sh) {
  const L = LOOK[sh.kind], y = UPPER, top = UPPER_TOP, f = sh.out;
  const x0 = sh.x0 + 0.15, x1 = sh.x1 - 0.15, back = f > 0 ? sh.z0 : sh.z1;
  if (L.floor) still.flat(M[L.floor], C.white, x0, sh.z0, x1, sh.z1, y + 0.005);
  else still.flat(M.matte, col(L.carpet), x0, sh.z0, x1, sh.z1, y + 0.005);
  // The slab: over the shop row's rooms (south) or the anchors' ceilings (north).
  site.collide(sh.x0, sh.z0, sh.x1, sh.z1, f > 0 ? SOFFIT : CEILING, y);
  const wall = col(L.wall), d = sh.z1 - sh.z0, mz = (sh.z0 + sh.z1) / 2;
  still.panel(M.matte, wall, (x0 + x1) / 2, back + f * 0.01, [0, f], x1 - x0, y, top);
  still.panel(M.matte, wall, x0 + 0.01, mz, [1, 0], d, y, top);
  still.panel(M.matte, wall, x1 - 0.01, mz, [-1, 0], d, y, top);
  for (const x of [sh.x0, sh.x1]) {
    still.box(M.satin, C.stone, x - 0.15, y, sh.z0, x + 0.15, top, sh.z1);
    site.collide(x - 0.15, sh.z0, x + 0.15, sh.z1, y, top);
  }
  site.collide(sh.x0, back - (f > 0 ? 0.2 : 0), sh.x1, back + (f > 0 ? 0 : 0.2), y, top);
  still.flat(M.ceiling, C.white, x0, sh.z0, x1, sh.z1, top, true);
  site.collide(sh.x0, sh.z0, sh.x1, sh.z1, top, top + 0.1);
  for (let x = x0 + 1.4; x < x1 - 0.8; x += 2.4) {
    for (let z = sh.z0 + 1.2; z < sh.z1 - 0.6; z += 2.4) still.flat(M.glow, C.light, x - 0.3, z - 0.3, x + 0.3, z + 0.3, top - 0.01, true);
  }
}

const UPPER_DRESS = {
  /** Two stalls along the back (kitchens, signs over them), tables with stools before them. */
  foodcourt(ctx, sh) {
    const { M, signs, cast, still, site, y } = ctx;
    sh.tills.forEach((t, i) => {
      const c = t.counter, ky = y + 0.9;
      // The kitchen: a steel bench, pots, the back wall's menu, a lit canopy over the counter.
      cast.box(M.metal, C.steel, c.x0, y, sh.z0 + 0.05, c.x1, ky, sh.z0 + 0.65);
      site.collide(c.x0, sh.z0, c.x1, sh.z0 + 0.65, y, ky);
      for (let k = 0; k < 3; k++) cast.cylinder(M.metal, C.steel, c.x0 + 1.2 + k * 1.6, ky, sh.z0 + 0.35, 0.2, 0.3, 12);
      still.panel(signs.material, C.white, (c.x0 + c.x1) / 2, sh.z0 + 0.02, [0, 1], c.x1 - c.x0 - 1, y + 1.5, y + 2.4, signs.rect(i ? 'ramenMenu' : 'cafeMenu'));
      cast.box(M.satin, i ? C.navy : C.orange, c.x0 - 0.1, y + 2.5, c.z0 - 0.3, c.x1 + 0.1, y + 2.85, c.z1 + 0.2);
      still.panel(signs.material, C.white, (c.x0 + c.x1) / 2, c.z1 + 0.205, [0, 1], 3.2, y + 2.53, y + 2.82, signs.rect(i ? 'ramenMenu' : 'samples'));
      still.flat(M.glow, C.light, c.x0, c.z0 - 0.25, c.x1, c.z1 + 0.15, y + 2.49, true);
      // Partitions either side of the stall.
      for (const x of [c.x0 - 0.1, c.x1 + 0.1]) {
        cast.box(M.satin, C.white, x - 0.06, y, sh.z0, x + 0.06, y + 2.5, c.z1);
        site.collide(x - 0.06, sh.z0, x + 0.06, c.z1, y, y + 2.5);
      }
    });
    for (const x of [-3.0, -0.6, 1.8, 6.4, 8.8, 11.2]) for (const z of [5.8, 7.6]) cafeTable(ctx, x, y, z, C.white, 4, 0.62);
  },
  /** The lobby: concession stand, popcorn machine, menu boards, ticket machines, posters, benches. */
  cinema(ctx, sh) {
    const { M, signs, cast, still, site, y } = ctx;
    const back = sh.z1, c = sh.tills[0].counter;
    for (const x of [-33.6, -31.0]) still.panel(signs.material, C.white, x, back - 0.02, [0, -1], 2.2, y + 1.7, y + 2.6, signs.rect('cinemaMenu'));
    still.panel(signs.material, C.white, -25.0, back - 0.02, [0, -1], 4.0, y + 0.3, y + 2.9, signs.rect('roomCinema'));
    // Behind the counter: the popcorn machine (a lit glass box), the drinks machine.
    cast.box(M.satin, C.red, -35.3, y, back - 0.7, -34.3, y + 1.0, back - 0.1);
    still.box(M.glow, col('#ffe7a0'), -35.2, y + 1.0, back - 0.62, -34.4, y + 1.6, back - 0.18);
    cast.box(M.gloss, C.dark, -33.2, y, back - 0.6, -32.2, y + 1.6, back - 0.1);
    site.collide(-35.3, back - 0.7, -32.2, back, y, y + 1.6);
    still.box(M.glow, col('#ffd36a'), c.x0, y + 2.9, c.z0, c.x1, y + 2.95, c.z1);
    // Ticket machines on the west wall, posters on the east.
    for (let k = 0; k < 3; k++) {
      const z = 25.2 + k * 1.0;
      cast.box(M.gloss, C.snow, sh.x0 + 0.15, y, z - 0.35, sh.x0 + 0.65, y + 1.6, z + 0.35);
      still.panel(signs.material, C.white, sh.x0 + 0.66, z, [1, 0], 0.5, y + 0.95, y + 1.4, signs.rect('screen'));
    }
    site.collide(sh.x0, 24.85, sh.x0 + 0.65, 27.55, y, y + 1.6);
    ['autumn', 'halloween', 'sakuraWeek', 'season'].forEach((id, k) => {
      const z = 24.6 + k * 1.3;
      cast.box(M.metal, C.gold, sh.x1 - 0.2, y + 0.9, z - 0.42, sh.x1 - 0.15, y + 2.5, z + 0.42);
      still.panel(signs.material, C.white, sh.x1 - 0.205, z, [-1, 0], 0.76, y + 0.98, y + 2.42, signs.rect(id));
    });
    for (const x of [-36, -26.5]) {
      cast.box(M.fabric, C.maroon, x - 0.8, y + 0.4, 25.1, x + 0.8, y + 0.48, 25.55);
      cast.box(M.metal, C.frame, x - 0.75, y, 25.2, x + 0.75, y + 0.4, 25.45);
      site.collide(x - 0.8, 25.1, x + 0.8, 25.55, y, y + 0.48, { camera: false });
    }
  },
  /** A tea house: the counter's glass case, shelves of sweets, small tables, a plant. */
  tea(ctx, sh) {
    const { M, signs, cast, still, y } = ctx;
    const c = sh.tills[0].counter, back = sh.z1;
    still.panel(M.glass, C.white, (c.x0 + c.x1) / 2 - 0.4, c.z0 - 0.02, [0, -1], 1.6, y + c.h, y + c.h + 0.35);
    still.panel(signs.material, C.white, -9.8, back - 0.02, [0, -1], 2.6, y + 1.7, y + 2.6, signs.rect('cafeMenu'));
    bay(ctx, 'candy', 4, -6.8, back - 0.3, [0, -1], 2.4, 0.2, 2.2, 0.3, C.walnut);
    still.panel(signs.print, C.white, sh.x1 - 0.17, 27.0, [-1, 0], 2.4, y + 0.3, y + 1.1, signs.rect('pastry'));
    for (const [x, z] of [[-5.0, 29.8], [-3.0, 29.8], [-10.4, 24.9]]) cafeTable(ctx, x, y, z, C.oak, 2, 0.55);
    cast.cylinder(M.satin, C.charcoal, sh.x1 - 0.6, y, 24.0, 0.25, 0.5, 10);
    cast.sphere(M.matte, C.leaf, sh.x1 - 0.6, y + 0.9, 24.0, 0.4, 1.2, 8);
  },
  /** The bag shop: totes on wall shelves, pictures of the collection, the display table. */
  bags(ctx, sh) {
    const { M, signs, cast, still, site, y } = ctx;
    const back = sh.z1, colors = [C.navy, C.pink, C.cream, C.teal, C.red, C.oak];
    for (let k = 0; k < 4; k++) still.panel(signs.material, C.white, 24.5 + k * 3.2, back - 0.02, [0, -1], 2.6, y + 0.4, y + 2.8, signs.rect('roomRacks'));
    // Wall shelves of totes along the west wall.
    for (let k = 0; k < 3; k++) {
      const z = 24.6 + k * 1.4;
      cast.box(M.satin, C.white, sh.x0 + 0.15, y, z - 0.6, sh.x0 + 0.55, y + 2.2, z + 0.6);
      [0.5, 1.2, 1.9].forEach((sy, j) => {
        cast.box(M.fabric, colors[(k * 3 + j) % colors.length], sh.x0 + 0.3, y + sy, z - 0.25, sh.x0 + 0.5, y + sy + 0.35, z + 0.25);
        still.rod(M.metal, C.dark, [sh.x0 + 0.4, y + sy + 0.35, z - 0.12], [sh.x0 + 0.4, y + sy + 0.48, z], 0.008, 4);
      });
    }
    site.collide(sh.x0, 23.9, sh.x0 + 0.55, 27.9, y, y + 2.2);
    cast.cylinder(M.satin, C.charcoal, sh.x1 - 0.7, y, 24.2, 0.25, 0.5, 10);
    cast.sphere(M.matte, C.leaf, sh.x1 - 0.7, y + 0.9, 24.2, 0.4, 1.2, 8);
  },
};
