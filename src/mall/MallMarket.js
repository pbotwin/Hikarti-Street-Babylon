import { Color3 } from '@babylonjs/core';
import { C, lin } from './MallKit.js';
import {
  SECTION, FIXTURE, LINES, RUNS, BACK_WALL, MARKET, PRODUCE_WALL_X, FREEZER_ISLAND, PRODUCE_TABLES,
  CHECKOUT_X, CHECKOUT, CORRAL, AISLE_LANES, CEILING, LEVELS, faceOf,
} from './MallPlan.js';

/**
 * The supermarket's fixtures, built from the plan: gondola shelving down
 * eight aisles, open dairy chillers, glass-door coolers (their doors are
 * MallDoors'), bakery racks, the produce wall and tables, chest freezers,
 * four checkouts with their sweet racks and the cart corral, with aisle and
 * department signs; and what makes it a shop on a busy day: price cards
 * sticking out of the shelves, promotion end caps at the runs' ends with
 * stacked cases, the autumn harvest display by the entry, special-offer
 * boards over the aisles, murals over the bakery and the produce, basket
 * stacks. Shelves are empty: MallShopping stocks them from the layout.
 */
const AISLE_TINT = { drinks: '#2f7fc1', dairy: '#5aa9d6', bakery: '#c98a4b', produce: '#4f9a4a', snacks: '#e2574c', pantry: '#d99a2b', frozen: '#6fb7d8', household: '#7a5fb3' };
const tint = Object.fromEntries(Object.entries(AISLE_TINT).map(([k, v]) => [k, lin(v)]));
// Lit cabinet backs: bright, cool, below the bloom threshold so they don't halo.
const CABINET_LIGHT = new Color3(0.62, 0.68, 0.72);
const STRIP_TILE = 0.8;
const TALKERS = ['price198', 'price98', 'newItem', 'price298'];
const CASES = [C.red, C.yellow, C.blue, C.green, C.orange, C.white];
const HARVEST = { x0: -17.2, x1: -12.8, z0: 26.4, z1: 29.2 };     // the promotion stage by the entry

/**
 * A fixture's own frame: u runs along it, d goes back from its front plane
 * (0) into the fixture, y up. Maps to the site frame for either run axis.
 */
class Frame {
  constructor(along, front, s) { Object.assign(this, { along, front, s }); }
  x(u, d) { return this.along === 'z' ? this.front - this.s * d : u; }
  z(u, d) { return this.along === 'z' ? u : this.front - this.s * d; }
  get facing() { return this.along === 'z' ? [this.s, 0] : [0, this.s]; }
  box(b, mat, color, u0, y0, d0, u1, y1, d1) {
    const xa = this.x(u0, d0), xb = this.x(u1, d1), za = this.z(u0, d0), zb = this.z(u1, d1);
    b.box(mat, color, Math.min(xa, xb), y0, Math.min(za, zb), Math.max(xa, xb), y1, Math.max(za, zb));
  }
  /** A picture or strip on a plane facing the aisle, d back from the front. */
  panel(b, mat, color, u0, u1, d, y0, y1, rect = null) {
    const um = (u0 + u1) / 2;
    b.panel(mat, color, this.x(um, d), this.z(um, d), this.facing, Math.abs(u1 - u0), y0, y1, rect);
  }
  collide(site, u0, u1, depth, h) { site.collide(this.x(u0, -0.02), this.z(u0, -0.02), this.x(u1, depth), this.z(u1, depth), 0, h); }
}

export function buildMarket(site, mats, signs) {
  const { cast, still } = site.zone('market');
  const doors = [];
  const ctx = { site, cast, still, M: mats, doors, signs };

  // Fixture lines down the aisles, in both runs.
  for (const line of LINES) {
    for (const [z0, z1] of RUNS) {
      let h = 0;
      for (const side of ['west', 'east']) {
        const f = line[side];
        if (!f) continue;
        const { aisle, kind, levels } = faceOf(f);
        const s = side === 'east' ? 1 : -1;
        fixture(ctx, new Frame('z', s > 0 ? line.x1 : line.x0, s), kind, aisle, LEVELS[levels], z0, z1);
        h = Math.max(h, FIXTURE[kind].h);
      }
      // End panels close the run.
      for (const [a, b] of [[z0 - 0.03, z0], [z1, z1 + 0.03]]) cast.box(mats.satin, C.shelf, line.x0, 0, a, line.x1, h, b);
    }
    // Promotion end caps where the runs meet the front and back cross aisles (not in the narrow middle one).
    if (line.west && line.east) {
      endCap(ctx, line, RUNS[0][0], -1, 'tokubai');
      endCap(ctx, line, RUNS[1][1], 1, 'harvest');
    }
  }
  // Along the back wall: bakery racks and drinks coolers.
  for (const w of BACK_WALL) {
    const depth = FIXTURE[w.kind].depth;
    fixture(ctx, new Frame('x', MARKET.z1 - depth, -1), w.kind, w.aisle, LEVELS[w.levels], w.x0, w.x0 + w.n * SECTION);
  }
  // Produce wall on the service side.
  for (const [z0, z1] of RUNS) fixture(ctx, new Frame('z', PRODUCE_WALL_X - FIXTURE.crate.depth, -1), 'crate', 'produce', LEVELS.crate, z0, z1);

  freezers(ctx);
  produceTables(ctx);
  CHECKOUT_X.forEach((cx, i) => checkout(ctx, cx, i, signs));
  corral(ctx);
  marketSigns(ctx, signs);
  promotions(ctx);
  return doors;
}

/** One side of a fixture line: shelving, chiller, cooler, bakery rack or produce crates. */
function fixture({ site, cast, still, M, doors, signs }, f, kind, aisle, levels, u0, u1) {
  const { depth: D, h: H } = FIXTURE[kind];
  const n = Math.round((u1 - u0) / SECTION);
  const strip = (y, d = 0) => {
    const len = u1 - u0;
    f.panel(still, M.strip, C.white, u0, u1, d - 0.004, y - 0.05, y, [0, 0, len / STRIP_TILE, 1]);
  };
  const boundaries = (fn) => { for (let k = 0; k <= n; k++) fn(u0 + k * SECTION); };
  f.collide(site, u0, u1, D, H);

  if (kind === 'shelf') {
    f.box(cast, M.matte, C.shelf, u0, 0.12, D - 0.03, u1, H, D);                      // pegboard back
    f.box(cast, M.satin, C.dark, u0, 0, 0.04, u1, 0.12, D - 0.03);                     // kick plate
    f.box(cast, M.satin, C.shelf, u0, 0.12, 0, u1, levels[0], D - 0.03);               // base deck
    strip(levels[0]);
    for (const y of levels.slice(1)) {
      f.box(cast, M.satin, C.shelf, u0, y - 0.022, 0.02, u1, y, D - 0.03);
      strip(y, 0.02);
    }
    boundaries((u) => f.box(cast, M.metal, C.steel, u - 0.02, 0.12, D - 0.06, u + 0.02, H, D - 0.03));
    f.box(cast, M.satin, tint[aisle], u0, H - 0.06, D - 0.12, u1, H, D);                // coloured top rail
    // Shelf talkers: a price card sticking out into the aisle every few sections.
    for (let k = 0; k < n; k++) {
      if ((k + Math.round(Math.abs(f.front) * 3)) % 3) continue;
      talker(still, signs, f, u0 + SECTION * (k + 0.5), levels[1 + (k % (levels.length - 2))], TALKERS[k % TALKERS.length]);
    }
  } else if (kind === 'bakery') {
    f.box(cast, M.satin, C.walnut, u0, 0, D - 0.03, u1, H, D);
    f.box(cast, M.satin, C.walnut, u0, 0, 0.02, u1, levels[0] - 0.03, D - 0.03);
    for (const y of levels) f.box(cast, M.wood, C.white, u0, y - 0.03, 0, u1, y, D - 0.03);
    boundaries((u) => f.box(cast, M.wood, C.white, u - 0.025, 0, 0, u + 0.025, H, D - 0.03));
    f.box(cast, M.satin, C.walnut, u0, H - 0.06, 0, u1, H, D);
  } else if (kind === 'crate') {
    f.box(cast, M.satin, C.green, u0, 0, D - 0.03, u1, H, D);
    f.box(cast, M.satin, C.dark, u0, 0, 0.04, u1, levels[0] - 0.06, D - 0.03);
    for (const y of levels) {
      f.box(cast, M.wood, C.white, u0, y - 0.06, 0, u1, y, D - 0.03);
      f.box(cast, M.wood, C.white, u0, y, 0, u1, y + 0.07, 0.03);                        // crate lip
    }
    boundaries((u) => f.box(cast, M.wood, C.white, u - 0.02, 0, 0, u + 0.02, H - 0.1, D - 0.03));
  } else {
    // Refrigerated cabinets: shell, lit back, wire shelves; coolers get glass doors.
    const cooler = kind === 'cooler';
    const deck = levels[0] - 0.02;
    f.box(cast, M.gloss, C.snow, u0, 0, D - 0.05, u1, H, D);                          // back
    f.box(cast, M.gloss, C.snow, u0, 0, 0.06, u1, deck, D - 0.05);                    // base
    f.box(cast, M.satin, C.dark, u0, 0, 0, u1, deck, 0.06);                            // grille
    f.box(cast, M.metal, C.steel, u0, deck, 0.1, u1, levels[0], D - 0.05);             // deck
    // Lit back a centimetre off the shell: at 1 mm it z-fought with it from a few metres away.
    f.panel(still, M.glow, CABINET_LIGHT, u0, u1, D - 0.06, deck, H - 0.25);
    for (const y of levels.slice(1)) {
      f.box(cast, M.metal, C.steel, u0, y - 0.02, 0.12, u1, y, D - 0.06);
      strip(y, 0.12);
    }
    f.box(cast, M.gloss, C.snow, u0, H - 0.22, 0, u1, H, D - 0.05);                   // canopy / header
    f.panel(still, M.satin, tint[aisle], u0, u1, -0.006, H - 0.18, H - 0.05);
    f.box(still, M.glow, C.cold, u0, H - 0.235, 0.04, u1, H - 0.22, 0.12);             // light under the canopy
    for (const u of [u0, u1]) f.box(cast, M.gloss, C.snow, u - 0.03, 0, 0, u + 0.03, H, D);
    if (cooler) {
      // Door frames: a post at every door edge, rails top and bottom; the doors themselves swing (MallDoors).
      const dw = SECTION / 2;
      for (let k = 0; k <= n * 2; k++) f.box(cast, M.metal, C.black, u0 + k * dw - 0.025, deck, 0, u0 + k * dw + 0.025, H - 0.22, 0.06);
      f.box(cast, M.metal, C.black, u0, deck, 0, u1, deck + 0.04, 0.06);
      f.box(cast, M.metal, C.black, u0, H - 0.26, 0, u1, H - 0.22, 0.06);
      for (let k = 0; k < n * 2; k++) {
        const left = k % 2 === 0;                                                     // pairs open from the middle post outward
        const hu = u0 + (left ? k : k + 1) * dw, fu = u0 + (left ? k + 1 : k) * dw;
        doors.push({ hinge: [f.x(hu, -0.015), f.z(hu, -0.015)], free: [f.x(fu, -0.015), f.z(fu, -0.015)], facing: f.facing, y0: deck + 0.04, y1: H - 0.26 });
      }
    } else {
      f.box(cast, M.metal, C.steel, u0, deck, 0, u1, deck + 0.1, 0.1);                  // air-curtain lip
    }
  }
}

/** Chest freezers down the frozen aisle: white tubs, glass lids, a rim. */
function freezers({ site, cast, still, M }) {
  const F = FREEZER_ISLAND, top = 0.86;
  for (const [z0, z1] of RUNS) {
    cast.box(M.gloss, C.snow, F.x0, 0.12, z0, F.x0 + 0.08, top, z1);
    cast.box(M.gloss, C.snow, F.x1 - 0.08, 0.12, z0, F.x1, top, z1);
    cast.box(M.satin, C.dark, F.x0 + 0.02, 0, z0 + 0.02, F.x1 - 0.02, 0.12, z1 - 0.02);
    for (let z = z0; z <= z1 + 1e-6; z += F.len) cast.box(M.gloss, C.snow, F.x0, 0.12, z - 0.04, F.x1, top, z + 0.04);
    still.flat(M.matte, C.cold, F.x0 + 0.08, z0, F.x1 - 0.08, z1, 0.4);
    still.flat(M.glass, C.white, F.x0 + 0.08, z0, F.x1 - 0.08, z1, top - 0.01);
    for (const x of [F.x0, F.x1 - 0.03]) cast.box(M.metal, C.steel, x, top, z0, x + 0.03, top + 0.02, z1);
    site.collide(F.x0, z0, F.x1, z1, 0, top + 0.02);
  }
}

/** Produce tables: oak tables with wooden crates. */
function produceTables({ site, cast, M }) {
  const T = PRODUCE_TABLES;
  for (const x of T.xs) {
    for (const z of T.zs) {
      const x0 = x - T.d / 2, x1 = x + T.d / 2, z0 = z - T.w / 2, z1 = z + T.w / 2;
      cast.box(M.satin, C.walnut, x0 + 0.05, 0, z0 + 0.05, x1 - 0.05, 0.72, z1 - 0.05);
      cast.box(M.wood, C.white, x0, 0.72, z0, x1, 0.76, z1);
      for (const [cx0, cx1] of [[x0, x], [x, x1]]) {
        for (const [cz0, cz1] of [[z0, z], [z, z1]]) {
          const i = 0.02;
          cast.box(M.wood, C.white, cx0 + i, 0.76, cz0 + i, cx1 - i, T.y, cz1 - i);
          for (const [a, b, c, d] of [[cx0 + i, cz0 + i, cx1 - i, cz0 + i + 0.03], [cx0 + i, cz1 - i - 0.03, cx1 - i, cz1 - i], [cx0 + i, cz0 + i, cx0 + i + 0.03, cz1 - i], [cx1 - i - 0.03, cz0 + i, cx1 - i, cz1 - i]]) {
            cast.box(M.wood, C.white, a, T.y, b, c, T.y + 0.08, d);
          }
        }
      }
      site.collide(x0, z0, x1, z1, 0, T.y + 0.08);
    }
  }
}

/** A checkout: counter with belt, scanner, register and screens, bagging end, cashier booth, lane light. */
function checkout({ site, cast, still, M }, cx, i, signs) {
  const K = CHECKOUT, x0 = cx - K.w / 2, x1 = cx + K.w / 2;
  cast.box(M.gloss, C.snow, x0, 0.1, K.z0, x1, K.h - 0.04, K.z1);
  cast.box(M.satin, C.dark, x0 + 0.03, 0, K.z0 + 0.03, x1 - 0.03, 0.1, K.z1 - 0.03);
  still.box(M.satin, C.green, x1, 0.6, K.z0, x1 + 0.012, 0.7, K.z1);    // 5 mm proud fought with the counter from across the store
  cast.box(M.metal, C.steel, x0, K.h - 0.04, K.z0, x1, K.h, K.z1);
  // Belt between metal ledges; the divider bar rests on the ledge.
  still.box(M.matte, C.rubber, cx - 0.28, K.h, K.beltTo, cx + 0.28, K.h + 0.015, K.beltFrom);
  for (const x of [cx - 0.32, cx + 0.28]) cast.box(M.metal, C.steel, x, K.h, K.beltTo, x + 0.04, K.h + 0.04, K.beltFrom);
  cast.box(M.gloss, C.grey, cx + 0.28, K.h + 0.04, K.beltFrom - 0.6, cx + 0.32, K.h + 0.08, K.beltFrom - 0.2);
  // Scanner window, register (cashier's screen), customer display and card reader.
  still.flat(M.gloss, C.black, cx - 0.2, K.register + 0.25, cx + 0.2, K.register + 0.5, K.h + 0.006);
  cast.box(M.gloss, C.dark, cx - 0.36, K.h, K.register - 0.18, cx - 0.06, K.h + 0.1, K.register + 0.18);
  cast.box(M.gloss, C.dark, cx - 0.32, K.h + 0.1, K.register - 0.02, cx - 0.28, K.h + 0.38, K.register + 0.02);
  cast.box(M.gloss, C.dark, cx - 0.36, K.h + 0.36, K.register - 0.2, cx - 0.32, K.h + 0.62, K.register + 0.2);
  still.panel(signs.material, C.white, cx - 0.365, K.register, [-1, 0], 0.38, K.h + 0.38, K.h + 0.6, signs.rect('screen'));
  cast.box(M.gloss, C.dark, cx + 0.3, K.h, K.register - 0.25, cx + 0.42, K.h + 0.12, K.register - 0.1);
  still.panel(signs.material, C.white, cx + 0.421, K.register - 0.175, [1, 0], 0.12, K.h + 0.04, K.h + 0.11, signs.rect('screen'));
  // Bagging end: a lower shelf with the bag rack.
  cast.box(M.metal, C.steel, x0, K.h - 0.12, K.z0 - 0.5, x1, K.h - 0.08, K.z0);
  cast.rod(M.chrome, C.steel, [x0 + 0.1, K.h - 0.08, K.z0 - 0.45], [x0 + 0.1, K.h + 0.3, K.z0 - 0.45], 0.012);
  cast.rod(M.chrome, C.steel, [x1 - 0.1, K.h - 0.08, K.z0 - 0.45], [x1 - 0.1, K.h + 0.3, K.z0 - 0.45], 0.012);
  cast.rod(M.chrome, C.steel, [x0 + 0.1, K.h + 0.3, K.z0 - 0.45], [x1 - 0.1, K.h + 0.3, K.z0 - 0.45], 0.012);
  // Cashier booth: a partition toward the previous lane and a stool.
  cast.box(M.gloss, C.snow, cx - 1.45, 0, K.z0 + 0.8, cx - 1.4, 1.1, K.z0 + 3.4);
  cast.cylinder(M.metal, C.frame, cx - 0.95, 0, K.register + 1.0, 0.03, 0.62, 8);
  cast.cylinder(M.satin, C.dark, cx - 0.95, 0.62, K.register + 1.0, 0.2, 0.06, 14);
  // Lane light: a pole at the belt's start with the lit number both ways.
  const lz = K.z1 - 0.12, lx = cx + 0.3;
  cast.cylinder(M.metal, C.steel, lx, K.h, lz, 0.025, 1.4, 8);
  cast.box(M.gloss, C.dark, lx - 0.18, K.h + 1.4, lz - 0.04, lx + 0.18, K.h + 1.76, lz + 0.04);
  for (const [fz, d] of [[1, 0.041], [-1, -0.041]]) still.panel(signs.material, C.white, lx, lz + d, [0, fz], 0.32, K.h + 1.42, K.h + 1.74, signs.rect(`lane${i + 1}`));
  site.collide(x0, K.z0 - 0.5, x1, K.z1, 0, K.h + 0.05);
  site.collide(cx - 1.45, K.z0 + 0.8, cx - 1.4, K.z0 + 3.4, 0, 1.1);
  // The sweet rack at the lane's start, facing the queue.
  const r0 = K.z1 + 0.05, r1 = K.z1 + 0.95;
  cast.box(M.satin, C.red, cx - 0.2, 0, r0, cx + 0.2, 1.32, r1);
  for (const [y0, y1] of [[0.18, 0.62], [0.68, 1.12]]) still.panel(signs.print, C.white, cx + 0.205, (r0 + r1) / 2, [1, 0], r1 - r0 - 0.06, y0, y1, signs.rect('candy'));
  site.collide(cx - 0.2, r0, cx + 0.2, r1, 0, 1.32);
}

/** The cart corral in the hall: two chrome rails and an end stop (MallShopping parks the carts in its slots). */
function corral({ site, cast, M }) {
  const K = CORRAL, y = 0.85;
  for (const dz of [-0.42, 0.42]) {
    const z = K.z + dz;
    cast.rod(M.chrome, C.steel, [K.x0, y, z], [K.x1, y, z], 0.025);
    cast.rod(M.chrome, C.steel, [K.x0, 0.35, z], [K.x1, 0.35, z], 0.02);
    for (const x of [K.x0, (K.x0 + K.x1) / 2, K.x1]) cast.cylinder(M.chrome, C.steel, x, 0, z, 0.03, y, 8);
    site.collide(K.x0, z - 0.04, K.x1, z + 0.04, 0, y);
  }
  cast.rod(M.chrome, C.steel, [K.x0, y, K.z - 0.42], [K.x0, y, K.z + 0.42], 0.025);
  site.collide(K.x0 - 0.04, K.z - 0.42, K.x0 + 0.04, K.z + 0.42, 0, y);
}

/** Aisle boards hanging over each aisle's front end, department boards, the green band on the walls. */
function marketSigns({ still, M }, signs) {
  const z = RUNS[0][0] - 0.6, y0 = 3.2, y1 = 3.8;
  for (const a of AISLE_LANES) {
    const r = signs.rect(`aisle${a.n}`);
    still.panel(signs.material, C.white, a.x, z - 0.012, [0, -1], 2.4, y0, y1, r);
    still.panel(signs.material, C.white, a.x, z + 0.012, [0, 1], 2.4, y0, y1, r);
    still.box(M.satin, C.snow, a.x - 1.22, y0 - 0.02, z - 0.01, a.x + 1.22, y1 + 0.02, z + 0.01);
    for (const dx of [-1, 1]) still.rod(M.metal, C.steel, [a.x + dx, y1, z], [a.x + dx, CEILING, z], 0.006, 4);
  }
  still.panel(signs.material, C.white, -33, MARKET.z1 - 0.02, [0, -1], 4, 2.55, 3.55, signs.rect('deptBakery'));
  still.panel(signs.material, C.white, -18.8, MARKET.z1 - 0.02, [0, -1], 4, 2.55, 3.55, signs.rect('deptDrinks'));
  still.panel(signs.material, C.white, MARKET.x1 - 0.02, (RUNS[0][0] + RUNS[1][1]) / 2, [-1, 0], 5, 2.2, 3.45, signs.rect('deptProduce'));
  // Green band round the walls above the fixtures.
  still.panel(M.satin, C.green, MARKET.x0 + 0.01, (MARKET.z0 + MARKET.z1) / 2, [1, 0], MARKET.z1 - MARKET.z0, 3.75, 4.0);
  still.panel(M.satin, C.green, (MARKET.x0 + MARKET.x1) / 2, MARKET.z1 - 0.01, [0, -1], MARKET.x1 - MARKET.x0, 3.75, 4.0);
  still.panel(M.satin, C.green, MARKET.x1 - 0.01, (MARKET.z0 + MARKET.z1) / 2, [-1, 0], MARKET.z1 - MARKET.z0, 3.75, 4.0);
}

/** A price card hanging under a shelf edge, sticking out into the aisle (seen from down the aisle, both ways). */
function talker(b, signs, f, u, y, id) {
  const cx = f.x(u, -0.07), cz = f.z(u, -0.07), p = [f.facing[1], -f.facing[0]];
  for (const s of [-1, 1]) b.panel(signs.print, C.white, cx + p[0] * s * 0.002, cz + p[1] * s * 0.002, [p[0] * s, p[1] * s], 0.12, y - 0.22, y - 0.06, signs.rect(id));
}

/**
 * A promotion end cap closing a run toward a cross aisle (`s`: the aisle
 * lies at -z or +z): a low deck of stacked cases, a header board over it.
 */
function endCap({ site, cast, still, M, signs }, line, z, s, sign) {
  const d = 0.55, za = s < 0 ? z - d - 0.03 : z + 0.03, zb = s < 0 ? z - 0.03 : z + d + 0.03;
  cast.box(M.satin, C.shelf, line.x0, 0, za, line.x1, 0.3, zb);
  const w = line.x1 - line.x0, cols = Math.max(2, Math.round(w / 0.4)), cw = w / cols, fz = s < 0 ? za : zb;
  for (let t = 0; t < 3; t++) {
    for (let c = t % 2; c < cols - (t % 2); c++) {
      const x = line.x0 + c * cw, y = 0.3 + t * 0.3;
      cast.box(M.satin, CASES[(c + t + Math.round(-line.x0)) % CASES.length], x + 0.02, y, za + 0.04, x + cw - 0.02, y + 0.28, zb - 0.04);
      still.panel(M.matte, C.white, x + cw / 2, fz - s * 0.03, [0, s], cw * 0.6, y + 0.08, y + 0.2);
    }
  }
  // Posts 1 cm inside the board's faces (flush, their faces fought with it).
  for (const x of [line.x0 + 0.06, line.x1 - 0.06]) cast.box(M.metal, C.steel, x - 0.02, 0.3, Math.min(fz - s * 0.05, fz - s * 0.03), x + 0.02, 2.25, Math.max(fz - s * 0.05, fz - s * 0.03));
  cast.box(M.satin, C.red, line.x0, 1.85, Math.min(fz - s * 0.06, fz - s * 0.02), line.x1, 2.3, Math.max(fz - s * 0.06, fz - s * 0.02));
  still.panel(signs.material, C.white, (line.x0 + line.x1) / 2, fz - s * 0.008, [0, s], Math.min(w - 0.1, 1.15), 1.88, 2.27, signs.rect(sign));
  site.collide(line.x0, za, line.x1, zb, 0, 1.2);
}

/**
 * The shop on a busy day: the autumn harvest stage by the entry, special-
 * offer boards hanging over the aisles' middle, murals over the bakery and
 * the produce wall, basket stacks at the entry.
 */
function promotions({ site, cast, still, M, signs }) {
  // Harvest stage: a wooden deck, crates of pumpkins, sweet potatoes and apples, the fair's board over it.
  const H = HARVEST, hx = (H.x0 + H.x1) / 2, hz = (H.z0 + H.z1) / 2;
  cast.box(M.wood, C.white, H.x0, 0, H.z0, H.x1, 0.25, H.z1);
  const fill = [[C.orange, 0.13, false], [lin('#7a3b6e'), 0.09, true], [C.red, 0.075, false]];
  for (let i = 0; i < 6; i++) {
    const cx = H.x0 + 0.75 + (i % 3) * 1.45, cz = H.z0 + 0.7 + Math.floor(i / 3) * 1.4, [color, r, long] = fill[i % 3];
    cast.box(M.wood, C.white, cx - 0.6, 0.25, cz - 0.5, cx + 0.6, 0.55, cz + 0.5);
    for (let k = 0; k < 9; k++) {
      const px = cx - 0.4 + (k % 3) * 0.4, pz = cz - 0.32 + Math.floor(k / 3) * 0.32;
      cast.sphere(M.satin, color, px, 0.55 + r * 0.6, pz, r, 0.75, 6);
      if (long) cast.sphere(M.satin, color, px + r * 0.6, 0.55 + r * 0.5, pz, r * 0.8, 0.75, 5);
    }
  }
  for (const x of [H.x0 + 0.2, H.x1 - 0.2]) cast.cylinder(M.metal, C.steel, x, 0.25, hz, 0.025, 2.2, 6);
  cast.box(M.satin, C.orange, H.x0 + 0.15, 1.75, hz - 0.03, H.x1 - 0.15, 2.45, hz + 0.03);
  // Prints a centimetre off the board (2 mm fought with it).
  for (const f of [-1, 1]) still.panel(signs.material, C.white, hx, hz + f * 0.04, [0, f], H.x1 - H.x0 - 0.4, 1.78, 2.42, signs.rect('harvest'));
  site.collide(H.x0, H.z0, H.x1, H.z1, 0, 0.6);
  // Special offers over the middle cross aisle.
  const mz = (RUNS[0][1] + RUNS[1][0]) / 2;
  for (const a of AISLE_LANES.slice(0, 5)) {
    for (const f of [-1, 1]) still.panel(signs.material, C.white, a.x, mz + f * 0.006, [0, f], 1.1, 2.75, 3.16, signs.rect('tokubai'));
    for (const dx of [-0.45, 0.45]) still.rod(M.metal, C.steel, [a.x + dx, 3.16, mz], [a.x + dx, CEILING, mz], 0.005, 3);
  }
  // Murals over the bakery and the produce wall.
  still.panel(signs.print, C.white, -33, MARKET.z1 - 0.02, [0, -1], 3.84, 4.1, 5.3, signs.rect('muralBakery'));
  still.panel(signs.print, C.white, PRODUCE_WALL_X - 0.02, (RUNS[0][0] + RUNS[1][1]) / 2, [-1, 0], 3.84, 4.1, 5.3, signs.rect('muralProduce'));
  // Basket stacks by the entry.
  for (const z of [24.3, 24.95]) {
    for (let k = 0; k < 7; k++) cast.box(M.satin, C.red, -4.2, 0.03 + k * 0.075, z - 0.24, -3.7, 0.1 + k * 0.075, z + 0.24);
    cast.box(M.metal, C.steel, -4.25, 0, z - 0.27, -3.65, 0.03, z + 0.27);
  }
  site.collide(-4.25, 24.03, -3.65, 25.22, 0, 0.6);
}
