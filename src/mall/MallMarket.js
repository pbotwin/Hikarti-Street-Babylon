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
 * four checkouts and the cart corral, with aisle and department signs.
 * Shelves are empty: MallShopping stocks them from the layout.
 */
const AISLE_TINT = { drinks: '#2f7fc1', dairy: '#5aa9d6', bakery: '#c98a4b', produce: '#4f9a4a', snacks: '#e2574c', pantry: '#d99a2b', frozen: '#6fb7d8', household: '#7a5fb3' };
const tint = Object.fromEntries(Object.entries(AISLE_TINT).map(([k, v]) => [k, lin(v)]));
// Lit cabinet backs: bright, cool, below the bloom threshold so they don't halo.
const CABINET_LIGHT = new Color3(0.62, 0.68, 0.72);
const STRIP_TILE = 0.8;

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
  const ctx = { site, cast, still, M: mats, doors };

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
  return doors;
}

/** One side of a fixture line: shelving, chiller, cooler, bakery rack or produce crates. */
function fixture({ site, cast, still, M, doors }, f, kind, aisle, levels, u0, u1) {
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
  still.box(M.satin, C.green, x1, 0.6, K.z0, x1 + 0.005, 0.7, K.z1);
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
  still.panel(signs.material, C.white, MARKET.x1 - 0.02, 30.25, [-1, 0], 5, 2.2, 3.45, signs.rect('deptProduce'));
  // Green band round the walls above the fixtures.
  still.panel(M.satin, C.green, MARKET.x0 + 0.01, (MARKET.z0 + MARKET.z1) / 2, [1, 0], MARKET.z1 - MARKET.z0, 3.75, 4.0);
  still.panel(M.satin, C.green, (MARKET.x0 + MARKET.x1) / 2, MARKET.z1 - 0.01, [0, -1], MARKET.x1 - MARKET.x0, 3.75, 4.0);
  still.panel(M.satin, C.green, MARKET.x1 - 0.01, (MARKET.z0 + MARKET.z1) / 2, [-1, 0], MARKET.z1 - MARKET.z0, 3.75, 4.0);
}
