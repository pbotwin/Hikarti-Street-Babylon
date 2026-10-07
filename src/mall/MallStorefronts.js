import { C, lin } from './MallKit.js';
import { mulberry32 } from '../world/rng.js';
import { ROW, CONCOURSE, UNITS, UNIT_DEPTH, UPPER, SOFFIT, UPPER_CEILING, UPPER_UNITS } from './MallPlan.js';

/**
 * The shops along Hikari Mall's concourse. On the ground floor, the shop
 * row's units (MallPlan UNITS): a shopfront each — pilasters, glass in a
 * frame with its doors, the roll-shutter box, a fascia with the shop's
 * sign — and behind the glass a lit, furnished room as deep as the
 * concourse shows: a bookshop, an electronics store, a drugstore, a
 * 100-yen shop, a bakery café (glazed to the lot as well), a toy shop, a
 * shoe shop, a ramen bar with its noren and food samples, a game centre.
 * Shoppers see in, nobody goes in: the fronts collide. On the upper floor,
 * both sides of the atrium, the fronts of more shops (seen, not reached):
 * glass, a sign, and a picture of the shop inside a step behind the glass.
 *
 * Shelves full of goods are boxes with a painted picture of their goods
 * across them (MallPictures, the sign atlas): two triangles a bay, one
 * material for all of them.
 */
const FRONT = ROW.z1;            // the shopfronts' line, facing +z (the concourse)
const BACK = FRONT - UNIT_DEPTH;
const H = 3.2;                   // a shop's ceiling (the fascia above it, up to the soffit)
const GLASS_TOP = 3.1;

/** Per kind: floor finish, wall colour, fascia colour (the sign's own ground). */
const LOOK = {
  books: { floor: 'woodFloor', wall: '#efe6d0', band: '#26324a' },
  denki: { floor: 'marketFloor', wall: '#f4f4f2', band: '#f2c230' },
  drug: { floor: 'marketFloor', wall: '#f7f3f5', band: '#ffffff' },
  hyaku: { floor: 'marketFloor', wall: '#fbf6ee', band: '#e2574c' },
  cafe: { floor: 'woodFloor', wall: '#f6e7dc', band: '#f6dbe3' },
  toys: { floor: 'marketFloor', wall: '#e9f1fb', band: '#2f6fb3' },
  shoes: { floor: 'woodFloor', wall: '#ece8e2', band: '#3b3f46' },
  ramen: { floor: 'woodFloor', wall: '#3a2a20', band: '#7a2e2e' },
  games: { floor: null, wall: '#1d1b2e', band: '#141518' },
};
const lookCache = new Map();
const col = (hex) => { let c = lookCache.get(hex); if (!c) lookCache.set(hex, (c = lin(hex))); return c; };

export function buildStorefronts(site, mats, signs) {
  // One zone with the concourse: always seen together, so separate batches would only add draws.
  const { cast, still } = site.zone('concourse');
  const ctx = { site, M: mats, signs, cast, still };
  for (const u of UNITS) {
    shopfront(ctx, u);
    room(ctx, u);
    DRESS[u.kind](ctx, u);
  }
  // Pilasters at every party wall (once each), stone, full height to the soffit.
  for (const x of new Set(UNITS.flatMap((u) => [u.x0, u.x1]))) {
    if (Math.abs(x) >= CONCOURSE.x1 - 0.01) continue;
    still.box(mats.satin, C.stone, x - 0.2, 0, FRONT - 0.05, x + 0.2, SOFFIT, FRONT + 0.3);
    site.collide(x - 0.2, FRONT - 0.05, x + 0.2, FRONT + 0.3, 0, SOFFIT);
  }
  upperFronts(ctx);
}

/** The front: kick plate, glass with mullions and a pair of doors, transom, shutter box, fascia and sign, an OPEN card. */
function shopfront({ site, M, signs, still }, u) {
  const x0 = u.x0 + 0.2, x1 = u.x1 - 0.2, w = x1 - x0, cx = (u.x0 + u.x1) / 2, z = FRONT + 0.05;
  const L = LOOK[u.kind];
  still.panel(M.glass, C.white, cx, z, [0, 1], w, 0.12, GLASS_TOP);
  still.box(M.metal, C.frame, x0, 0, z - 0.05, x1, 0.12, z + 0.05);
  still.box(M.metal, C.frame, x0, GLASS_TOP, z - 0.05, x1, H, z + 0.05);
  // Doors in the middle: a frame round a pair of leaves, long handles.
  const d0 = cx - 0.9, d1 = cx + 0.9;
  const posts = [x0, d0, cx, d1, x1];
  for (let x = x0 + 1.6; x < d0 - 0.6; x += 1.6) posts.push(x);
  for (let x = x1 - 1.6; x > d1 + 0.6; x -= 1.6) posts.push(x);
  for (const x of posts) still.box(M.metal, C.frame, x - 0.035, 0, z - 0.05, x + 0.035, GLASS_TOP, z + 0.05);
  still.box(M.metal, C.frame, d0, 2.3, z - 0.05, d1, 2.36, z + 0.05);
  for (const s of [-1, 1]) still.box(M.chrome, C.steel, cx + s * 0.12 - 0.015, 0.8, z + 0.05, cx + s * 0.12 + 0.015, 1.5, z + 0.09);
  still.panel(signs.material, C.white, cx - 0.5, z + 0.012, [0, 1], 0.36, 1.55, 1.73, signs.rect('open'));
  site.collide(u.x0, FRONT - 0.05, u.x1, FRONT + 0.15, 0, H);
  // Shutter box, fascia, sign; a light line over the glass.
  still.box(M.satin, C.steel, x0, H, z - 0.05, x1, H + 0.22, z + 0.2);
  still.box(M.satin, col(L.band), u.x0 + 0.2, H + 0.22, FRONT - 0.05, u.x1 - 0.2, SOFFIT, FRONT + 0.25);
  const sw = Math.min(w - 0.8, 4.6), sh = sw / signs.aspect(u.kind);
  still.panel(signs.material, C.white, cx, FRONT + 0.265, [0, 1], sw, 4.28 - sh / 2, 4.28 + sh / 2, signs.rect(u.kind));
  still.flat(M.glow, C.light, x0, z + 0.2, x1, z + 0.26, H + 0.215, true);
  site.collide(u.x0, FRONT - 0.05, u.x1, FRONT + 0.25, H, SOFFIT);
}

/** The room behind the glass: floor, walls, ceiling with its lights (the café runs through to the lot's window). */
function room({ M, still }, u) {
  const L = LOOK[u.kind], back = u.kind === 'cafe' ? ROW.z0 : BACK;
  const x0 = u.x0 + 0.05, x1 = u.x1 - 0.05;
  if (L.floor) still.flat(M[L.floor], C.white, x0, back, x1, FRONT, 0.01);
  else still.flat(M.matte, col('#26233a'), x0, back, x1, FRONT, 0.01);
  const wall = col(L.wall);
  if (back > ROW.z0) still.panel(M.matte, wall, (x0 + x1) / 2, back + 0.01, [0, 1], x1 - x0, 0, H);
  still.panel(M.matte, wall, x0 + 0.01, (back + FRONT) / 2, [1, 0], FRONT - back, 0, H);
  still.panel(M.matte, wall, x1 - 0.01, (back + FRONT) / 2, [-1, 0], FRONT - back, 0, H);
  still.flat(M.ceiling, C.white, x0, back, x1, FRONT, H, true);
  const light = u.kind === 'games' ? col('#b98cff') : C.light;
  for (let x = x0 + 1.2; x < x1 - 0.6; x += 2) {
    for (let z = back + 1; z < FRONT - 0.5; z += 2) still.flat(M.glow, light, x - 0.3, z - 0.3, x + 0.3, z + 0.3, H - 0.01, true);
  }
}

// ---------------------------------------------------------------- fixtures
/**
 * A wall bay of goods: a carcass `depth` deep standing against a wall,
 * its picture across the front, a board lip at every shelf the picture
 * shows. `f` is the way it faces (unit x or z); (cx, cz) the centre of its front.
 */
function bay({ M, signs, cast, still }, id, rows, cx, cz, f, w, y0, y1, depth, frame = C.walnut) {
  const rx = Math.abs(f[1]), rz = Math.abs(f[0]);                // the front's run (x or z)
  const bx = cx - f[0] * depth / 2, bz = cz - f[1] * depth / 2;
  const sx = rx * w + rz * depth, sz = rz * w + rx * depth;
  cast.box(M.satin, frame, bx - sx / 2, 0, bz - sz / 2, bx + sx / 2, y1 + 0.06, bz + sz / 2);
  still.panel(signs.print, C.white, cx + f[0] * 0.008, cz + f[1] * 0.008, f, w - 0.06, y0, y1, signs.rect(id));
  for (let k = 0; k <= rows; k++) {
    const y = y0 + (y1 - y0) * k / rows;
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

/** A table with things on it (boxes in colours). */
function table(ctx, x, z, w, d, h, top, things, rnd) {
  const { M, cast } = ctx;
  cast.box(M.satin, top, x - w / 2, h - 0.05, z - d / 2, x + w / 2, h, z + d / 2);
  cast.box(M.satin, top, x - w / 2 + 0.06, 0, z - d / 2 + 0.06, x + w / 2 - 0.06, h - 0.05, z + d / 2 - 0.06);
  for (let i = 0; i < things; i++) {
    const tx = x - w / 2 + 0.12 + (w - 0.24) * (i + 0.5) / things, tw = 0.14 + rnd() * 0.12, th = 0.03 + rnd() * 0.12;
    cast.box(M.satin, PALETTE[Math.floor(rnd() * PALETTE.length)], tx - tw / 2, h, z - 0.1 - rnd() * 0.1, tx + tw / 2, h + th, z + 0.12);
  }
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

const DRESS = {
  books(ctx, u) {
    const rnd = mulberry32(1);
    lined(ctx, u, 'shelfBooks', 5, 2.5, C.walnut);
    const cx = (u.x0 + u.x1) / 2;
    table(ctx, cx - 1.2, 6.2, 1.6, 0.9, 0.75, C.oak, 7, rnd);
    table(ctx, cx + 1.3, 5.0, 1.4, 0.9, 0.75, C.oak, 6, rnd);
    // A magazine rack in the window, faces out.
    bay(ctx, 'shelfBooks', 3, cx + 2.2, FRONT - 0.5, [0, 1], 1.4, 0.3, 1.3, 0.3, C.walnut);
    ctx.cast.box(ctx.M.metal, C.frame, cx - 2.22, 0, FRONT - 0.33, cx - 2.18, 1.0, FRONT - 0.31);
    ctx.still.panel(ctx.signs.print, C.white, cx - 2.2, FRONT - 0.3, [0, 1], 0.55, 1.0, 1.73, ctx.signs.rect('newItem'));
  },
  denki(ctx, u) {
    const { M, signs, cast, still } = ctx, cx = (u.x0 + u.x1) / 2;
    // The TV wall: screens lit on a dark wall.
    cast.box(M.satin, C.dark, u.x0 + 0.3, 0, BACK, u.x1 - 0.3, 2.9, BACK + 0.2);
    still.panel(signs.material, C.white, cx, BACK + 0.212, [0, 1], u.x1 - u.x0 - 1, 0.7, 2.7, signs.rect('screens'));
    for (const [x, f] of [[u.x0 + 0.5, 1], [u.x1 - 0.5, -1]]) for (let k = 0; k < 3; k++) bay(ctx, 'screens', 2, x, BACK + 1.3 + 1.3 * k, [f, 0], 1.2, 0.9, 2.1, 0.4, C.white);
    // Display tables with laptops (open, screens lit) and phones.
    for (const [x, z] of [[cx - 1.4, 6.3], [cx + 1.4, 6.3], [cx, 4.6]]) {
      cast.box(M.gloss, C.snow, x - 0.8, 0, z - 0.45, x + 0.8, 0.85, z + 0.45);
      for (const dx of [-0.45, 0.05, 0.55]) {
        cast.box(M.metal, C.steel, x + dx - 0.17, 0.85, z - 0.05, x + dx + 0.17, 0.87, z + 0.2);
        cast.turned(M.gloss, C.dark, x + dx, 0.99, z - 0.06, 0.34, 0.24, 0.015, 0, -0.25);
        still.panel(signs.material, C.white, x + dx, z - 0.01, [0, 1], 0.3, 0.88, 1.08, signs.rect('screen'));
      }
    }
    // A big screen on a stand in the window.
    cast.box(M.metal, C.dark, cx + 1.9 - 0.06, 0, FRONT - 0.6, cx + 1.9 + 0.06, 1.0, FRONT - 0.5);
    cast.box(M.gloss, C.black, cx + 1.9 - 0.9, 1.0, FRONT - 0.62, cx + 1.9 + 0.9, 2.05, FRONT - 0.56);
    still.panel(signs.material, C.white, cx + 1.9, FRONT - 0.548, [0, 1], 1.72, 1.04, 2.01, signs.rect('adScreen'));
  },
  drug(ctx, u) {
    const { M, signs, cast, still } = ctx, cx = (u.x0 + u.x1) / 2;
    lined(ctx, u, 'shelfCosmetics', 5, 2.3, C.white);
    for (const x of [cx - 1.4, cx + 1.4]) gondola(ctx, 'shelfCosmetics', 5, x, 4.4, 7.0, 1.55, C.white, C.blue);
    // A promotion table by the door, price cards, a stack of baskets.
    const rnd = mulberry32(3);
    table(ctx, cx, 7.9, 1.2, 0.6, 0.8, C.pink, 5, rnd);
    for (const [x, id] of [[cx - 1.4, 'price198'], [cx + 1.4, 'price98']]) still.panel(signs.print, C.white, x, 7.03, [0, 1], 0.24, 1.25, 1.55, signs.rect(id));
    for (let k = 0; k < 6; k++) cast.box(M.satin, C.red, cx + 2.2, 0.02 + k * 0.08, FRONT - 0.75, cx + 2.65, 0.1 + k * 0.08, FRONT - 0.42);
  },
  hyaku(ctx, u) {
    const { signs, still } = ctx, cx = (u.x0 + u.x1) / 2;
    lined(ctx, u, 'shelfHyaku', 5, 2.4, C.white);
    for (const x of [cx - 2.1, cx, cx + 2.1]) gondola(ctx, 'shelfHyaku', 5, x, 4.2, 7.4, 1.65, C.white, C.red);
    // Price cards hanging over the aisles.
    for (const x of [cx - 1.05, cx + 1.05]) for (const f of [-1, 1]) still.panel(signs.print, C.white, x, 5.6 + f * 0.003, [0, f], 0.45, 2.3, 2.9, signs.rect('price98'));
  },
  cafe(ctx, u) {
    const { M, signs, cast, still } = ctx;
    const x0 = u.x0 + 0.05, x1 = u.x1 - 0.05;
    // Counter along the east wall: a lit cake case, the coffee machine, the till; menus over it, bread racks behind.
    const cx = x1 - 1.4;
    cast.box(M.satin, C.walnut, cx - 0.4, 0, 1.2, cx + 0.4, 1.0, 7.4);
    cast.box(M.satin, C.oak, cx - 0.45, 1.0, 1.15, cx + 0.45, 1.05, 7.45);
    still.panel(signs.print, C.white, cx - 0.41, 4.0, [-1, 0], 2.6, 0.15, 0.95, signs.rect('pastry'));
    cast.box(M.metal, C.steel, cx - 0.35, 1.05, 2.0, cx + 0.3, 1.5, 2.6);
    cast.box(M.gloss, C.dark, cx - 0.3, 1.05, 6.4, cx + 0.1, 1.3, 6.8);
    still.panel(M.glass, C.white, cx - 0.42, 4.0, [-1, 0], 2.6, 1.05, 1.45);
    for (const z of [2.2, 4.0, 5.8]) still.panel(signs.material, C.white, x1 - 0.02, z, [-1, 0], 1.6, 2.1, 2.9, signs.rect('cafeMenu'));
    for (const z of [2.3, 5.7]) bay(ctx, 'breadRack', 3, x1 - 0.3, z, [-1, 0], 1.6, 0.2, 1.6, 0.3, C.walnut);
    // A banquette along the west wall, round tables and chairs, pendants over them.
    cast.box(M.fabric, C.pink, x0, 0, 1.0, x0 + 0.55, 0.45, 8.2);
    cast.box(M.fabric, C.pink, x0, 0.45, 1.0, x0 + 0.15, 1.05, 8.2);
    for (const [x, z] of [[x0 + 1.2, 2.0], [x0 + 1.2, 4.3], [x0 + 1.2, 6.6], [x0 + 3.4, 3.1], [x0 + 3.4, 5.6]]) {
      cast.cylinder(M.metal, C.dark, x, 0, z, 0.05, 0.72, 8);
      cast.cylinder(M.satin, C.cream, x, 0.72, z, 0.4, 0.04, 16);
      cast.cylinder(M.gloss, C.white, x - 0.12, 0.76, z + 0.1, 0.05, 0.08, 8);
      if (x > x0 + 2) for (const dx of [-0.6, 0.6]) {
        cast.cylinder(M.metal, C.dark, x + dx, 0, z, 0.03, 0.45, 6);
        cast.cylinder(M.satin, C.oak, x + dx, 0.45, z, 0.2, 0.04, 12);
      }
      still.rod(M.metal, C.dark, [x, 2.7, z], [x, H, z], 0.006, 3);
      still.sphere(M.glow, C.light, x, 2.62, z, 0.13, 0.8, 8);
      cast.cylinder(M.satin, C.cream, x, 2.62, z, 0.2, 0.12, 12, 0.06);
    }
    // A chalkboard by the door and flowers.
    cast.turned(M.satin, C.walnut, x0 + 3.2, 0.55, FRONT - 0.5, 0.6, 1.1, 0.04, 0, 0.12);
    still.panel(signs.print, C.white, x0 + 3.2, FRONT - 0.47, [0, 1], 0.5, 0.15, 0.95, signs.rect('cafeMenu'));
    cast.cylinder(M.gloss, C.white, x1 - 0.5, 1.05, 7.2, 0.07, 0.2, 10);
    cast.sphere(M.matte, C.pink, x1 - 0.5, 1.33, 7.2, 0.14, 0.8, 6);
  },
  toys(ctx, u) {
    const { M, cast } = ctx, cx = (u.x0 + u.x1) / 2, rnd = mulberry32(7);
    lined(ctx, u, 'shelfToys', 4, 2.4, C.white);
    // A giant bear on a round stage, a table of boxed toys, balloons at the door.
    cast.cylinder(M.gloss, C.yellow, cx - 0.8, 0, 5.5, 0.9, 0.3, 24);
    const bx = cx - 0.8, by = 0.3, bz = 5.5, fur = col('#c98a4b');
    cast.sphere(M.matte, fur, bx, by + 0.55, bz, 0.55, 1.0, 10);
    cast.sphere(M.matte, fur, bx, by + 1.35, bz, 0.38, 0.95, 10);
    for (const s of [-1, 1]) {
      cast.sphere(M.matte, fur, bx + s * 0.3, by + 1.68, bz, 0.13, 1, 6);
      cast.sphere(M.matte, fur, bx + s * 0.5, by + 0.75, bz + 0.15, 0.17, 1.4, 6);
      cast.sphere(M.matte, fur, bx + s * 0.28, by + 0.12, bz + 0.25, 0.2, 0.8, 6);
    }
    cast.sphere(M.matte, C.cream, bx, by + 1.28, bz + 0.33, 0.14, 0.8, 6);
    cast.box(M.satin, C.red, bx - 0.2, by + 1.02, bz + 0.3, bx + 0.2, by + 1.1, bz + 0.38);
    table(ctx, cx + 1.6, 6.4, 1.6, 0.9, 0.7, C.white, 6, rnd);
    for (let i = 0; i < 6; i++) {
      const x = cx + 2.2 + (i % 3) * 0.28, z = FRONT - 0.6 - Math.floor(i / 3) * 0.25, y = 2.2 + (i % 2) * 0.25;
      ctx.still.rod(M.metal, C.white, [x, 0.9, z], [x, y - 0.18, z], 0.004, 3);
      cast.sphere(M.gloss, PALETTE[i], x, y, z, 0.18, 1.15, 8);
    }
  },
  shoes(ctx, u) {
    const { M, cast } = ctx, cx = (u.x0 + u.x1) / 2, rnd = mulberry32(9);
    lined(ctx, u, 'shelfShoes', 4, 2.3, C.white);
    for (const x of [cx - 1.3, cx + 1.3]) {
      cast.box(M.fabric, C.charcoal, x - 0.7, 0.05, 5.2, x + 0.7, 0.45, 5.7);
      cast.box(M.metal, C.steel, x - 0.65, 0, 5.25, x + 0.65, 0.05, 5.65);
    }
    for (const [x, z, h] of [[cx - 1.8, 7.6, 0.35], [cx - 1.0, 7.8, 0.6], [cx + 1.5, 7.6, 0.45]]) {
      cast.box(M.gloss, C.snow, x - 0.3, 0, z - 0.3, x + 0.3, h, z + 0.3);
      cast.box(M.satin, PALETTE[Math.floor(rnd() * PALETTE.length)], x - 0.14, h, z - 0.06, x + 0.16, h + 0.1, z + 0.06);
    }
    ctx.still.panel(M.mirror, C.white, cx, BACK + 1.0, [0, 1], 0.5, 0.05, 0.6);
  },
  ramen(ctx, u) {
    const { M, signs, cast, still } = ctx, cx = (u.x0 + u.x1) / 2;
    const x0 = u.x0 + 0.05, x1 = u.x1 - 0.05;
    // The kitchen behind a long counter: steel wall, pots on the range, menu boards lit over it.
    cast.box(M.metal, C.steel, x0, 0, BACK, x1, 2.2, BACK + 0.6);
    for (let i = 0; i < 4; i++) cast.cylinder(M.metal, C.steel, x0 + 1.2 + i * 1.3, 0.9, BACK + 1.2, 0.22, 0.4, 14);
    cast.box(M.metal, C.steel, x0 + 0.6, 0, BACK + 0.9, x1 - 0.6, 0.9, BACK + 1.5);
    for (const s of [-1, 1]) still.panel(signs.material, C.white, cx + s * 1.6, BACK + 0.62, [0, 1], 2.8, 2.25, 2.95, signs.rect('ramenMenu'));
    cast.box(M.satin, C.walnut, x0 + 0.4, 0, 4.9, x1 - 0.4, 1.0, 5.3);
    cast.box(M.satin, C.oak, x0 + 0.3, 1.0, 4.8, x1 - 0.3, 1.06, 5.5);
    for (let x = x0 + 0.9; x < x1 - 0.6; x += 0.75) {
      cast.cylinder(M.metal, C.dark, x, 0, 6.0, 0.03, 0.7, 6);
      cast.cylinder(M.satin, C.red, x, 0.7, 6.0, 0.19, 0.06, 12);
      cast.cylinder(M.gloss, C.black, x, 1.06, 5.1, 0.11, 0.06, 10, 0.08);
    }
    // Red lanterns either side of the door, the noren over it, the sample case in the window.
    for (const s of [-1, 1]) {
      cast.sphere(M.gloss, C.red, cx + s * 1.3, 2.55, FRONT - 0.35, 0.22, 1.3, 10);
      still.rod(M.metal, C.dark, [cx + s * 1.3, 2.83, FRONT - 0.35], [cx + s * 1.3, H, FRONT - 0.35], 0.006, 3);
    }
    for (let i = 0; i < 4; i++) still.panel(M.fabric, C.navy, cx - 0.66 + i * 0.44, FRONT - 0.12, [0, 1], 0.4, 1.8, 2.32);
    const sx = cx + 2.1;
    cast.box(M.satin, C.walnut, sx - 0.9, 0, FRONT - 0.7, sx + 0.9, 0.8, FRONT - 0.2);
    still.panel(signs.print, C.white, sx, FRONT - 0.42, [0, 1], 1.7, 0.82, 1.42, signs.rect('samples'));
    still.panel(M.glass, C.white, sx, FRONT - 0.2, [0, 1], 1.8, 0.8, 1.5);
    still.flat(M.glow, C.light, sx - 0.85, FRONT - 0.68, sx + 0.85, FRONT - 0.22, 1.5, true);
  },
  games(ctx, u) {
    const { M, signs, cast, still } = ctx;
    const x0 = u.x0 + 0.05, x1 = u.x1 - 0.05;
    // Crane games in two rows, a dance cabinet at the back, neon on the ceiling.
    const crane = (x, z, f) => {
      cast.box(M.gloss, C.snow, x - 0.45, 0, z - 0.45, x + 0.45, 0.8, z + 0.45);
      still.panel(M.glass, C.white, x, z + f * 0.45, [0, f], 0.86, 0.8, 1.85);
      still.panel(signs.material, C.white, x, z - f * 0.1, [0, f], 0.86, 0.05, 1.9, signs.rect('crane'));
      cast.box(M.gloss, C.pink, x - 0.47, 1.85, z - 0.47, x + 0.47, 2.1, z + 0.47);
      still.box(M.glow, col('#ffb3e6'), x - 0.47, 2.1, z - 0.47, x + 0.47, 2.14, z + 0.47);
    };
    for (let x = x0 + 0.8; x < x1 - 0.5; x += 1.05) { crane(x, FRONT - 1.1, 1); crane(x, BACK + 2.4, 1); }
    for (const x of [x0 + 1.5, x1 - 1.5]) {
      cast.box(M.gloss, C.black, x - 0.6, 0, BACK + 0.1, x + 0.6, 2.4, BACK + 0.9);
      still.panel(signs.material, C.white, x, BACK + 0.912, [0, 1], 1.1, 0.4, 2.3, signs.rect('rhythm'));
    }
    for (const [c, z] of [['#ff5ad1', 4.2], ['#4fe3ff', 6.4]]) still.box(M.glow, col(c), x0 + 0.3, H - 0.06, z, x1 - 0.3, H - 0.02, z + 0.05);
    still.box(M.matte, col('#5b2a86'), x0 + 0.6, 0.01, FRONT - 2.2, x1 - 0.6, 0.02, FRONT - 1.8);
  },
};

/**
 * The upper floor's shops on both sides of the atrium: a frame and glass,
 * the sign on a fascia, and a step behind the glass the shop itself (a
 * picture of its inside, lit, with a floor and ceiling before it).
 */
const ROOMS = { sports: 'roomShelves', home: 'roomShelves', optical: 'roomShelves', foodcourt: 'roomFood', kids: 'roomShelves', wear: 'roomRacks', cinema: 'roomCinema', salon: 'roomRacks', tea: 'roomFood', music: 'roomShelves', home2: 'roomShelves', bags: 'roomRacks' };
const TINTS = ['#ffffff', '#fff3ea', '#eef6ff', '#f7ffef'];
function upperFronts({ M, signs, still }) {
  const sides = [[UPPER_UNITS.south, CONCOURSE.z0, 1], [UPPER_UNITS.north, CONCOURSE.z1, -1]];
  const top = 9.2, room = 1.3;
  let n = 0;
  for (const [units, z, f] of sides) {
    for (const [kind, x0, x1] of units) {
      const cx = (x0 + x1) / 2, w = x1 - x0, zb = z - f * room;
      // Shop: floor, ceiling with a light line, the picture across its back.
      still.flat(M.hallFloor, C.white, x0, Math.min(z, zb), x1, Math.max(z, zb), UPPER + 0.005);
      still.flat(M.ceiling, C.white, x0, Math.min(z, zb), x1, Math.max(z, zb), top, true);
      still.flat(M.glow, C.light, x0 + 0.3, Math.min(z, zb) + 0.5, x1 - 0.3, Math.min(z, zb) + 0.65, top - 0.01, true);
      const bays = Math.max(1, Math.round(w / 6.4));
      for (let i = 0; i < bays; i++) {
        still.panel(signs.material, col(TINTS[(n + i) % TINTS.length]), x0 + w * (i + 0.5) / bays, zb + f * 0.01, [0, f], w / bays, UPPER, top, signs.rect(ROOMS[kind]));
      }
      // Front: glass, frame and mullions; the fascia and sign above.
      still.panel(M.glass, C.white, cx, z + f * 0.02, [0, f], w - 0.4, UPPER + 0.08, top);
      const m = Math.max(1, Math.round((w - 0.4) / 1.6));
      for (let i = 0; i <= m; i++) { const x = x0 + 0.2 + (w - 0.4) * i / m; still.box(M.metal, C.frame, x - 0.035, UPPER, z - 0.04, x + 0.035, top, z + 0.04); }
      still.box(M.metal, C.frame, x0 + 0.2, UPPER, z - 0.05, x1 - 0.2, UPPER + 0.1, z + 0.05);
      still.box(M.satin, C.snow, x0, top, Math.min(z, z + f * 0.25), x1, UPPER_CEILING, Math.max(z, z + f * 0.25));
      const sw = Math.min(w - 1.2, 5.2), sh = sw / signs.aspect(kind);
      still.panel(signs.material, C.white, cx, z + f * 0.265, [0, f], sw, (top + UPPER_CEILING) / 2 - sh / 2, (top + UPPER_CEILING) / 2 + sh / 2, signs.rect(kind));
      // Party walls between shops.
      still.box(M.satin, C.stone, x0 - 0.15, UPPER, Math.min(z, zb) - (f < 0 ? 0.3 : 0), x0 + 0.15, UPPER_CEILING, Math.max(z, zb) + (f > 0 ? 0.3 : 0));
      n++;
    }
  }
}
