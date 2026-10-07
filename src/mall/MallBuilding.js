import { C, planter } from './MallKit.js';
import {
  BUILDING, HALL, MARKET, SERVICE, BOUTIQUE, STOCKROOM, CEILING, ROOF, DOOR_H, ENTRANCES, BOUTIQUE_DOOR, CANOPY,
  HALL_COLUMNS, HALL_BENCHES, HALL_PLANTERS, CHECKOUT_X, MARKET_ENTRY,
} from './MallPlan.js';

/**
 * Hikari Mall's building: the glass front with its entrance canopies and
 * the big sign, the outer walls, floors, ceilings with their light panels,
 * the hall (columns, benches, planters, the floor guide) and the two
 * shopfronts on it. Fixtures inside the shops are MallMarket / MallBoutique.
 */
const WALL = 0.3;

export function buildBuilding(site, mats, signs) {
  const { cast, still } = site.zone('building');
  const M = mats;
  const B = BUILDING;

  // ---------------------------------------------------------------- floors and ceilings
  still.flat(M.hallFloor, C.white, HALL.x0, HALL.z0, HALL.x1, HALL.z1, 0.01);
  still.flat(M.marketFloor, C.white, MARKET.x0, MARKET.z0, MARKET.x1, MARKET.z1, 0.01);
  still.flat(M.woodFloor, C.white, BOUTIQUE.x0, BOUTIQUE.z0, BOUTIQUE.x1, BOUTIQUE.z1, 0.01);
  for (const r of [HALL, MARKET, BOUTIQUE]) still.flat(M.ceiling, C.white, r.x0, r.z0, r.x1, r.z1, CEILING, true);
  lights(still, M);

  // ---------------------------------------------------------------- outer walls
  const top = ROOF;
  still.box(M.cladding, C.white, B.x0 - WALL, 0, B.z0, B.x0, top, B.z1 + WALL);
  still.box(M.cladding, C.white, B.x1, 0, B.z0, B.x1 + WALL, top, B.z1 + WALL);
  still.box(M.cladding, C.white, B.x0, 0, B.z1, B.x1, top, B.z1 + WALL);
  // A pink band and a metal cap run round the top.
  for (const [x0, z0, x1, z1] of [[B.x0 - WALL - 0.02, B.z0 - WALL - 0.02, B.x0 - WALL, B.z1 + WALL + 0.02], [B.x1 + WALL, B.z0 - WALL - 0.02, B.x1 + WALL + 0.02, B.z1 + WALL + 0.02], [B.x0 - WALL, B.z1 + WALL, B.x1 + WALL, B.z1 + WALL + 0.02]]) {
    still.box(M.satin, C.pink, x0, top - 0.75, z0, x1, top - 0.45, z1);
  }
  still.box(M.metal, C.steel, B.x0 - WALL - 0.04, top, B.z0 - WALL - 0.04, B.x1 + WALL + 0.04, top + 0.12, B.z1 + WALL + 0.04);
  site.collide(B.x0 - WALL, B.z0, B.x0, B.z1 + WALL, 0, top);
  site.collide(B.x1, B.z0, B.x1 + WALL, B.z1 + WALL, 0, top);
  site.collide(B.x0, B.z1, B.x1, B.z1 + WALL, 0, top);
  // Inside faces.
  // A hair in front of the wall it covers (the cladding's inner face is in the same plane).
  const paint = (x0, z0, x1, z1, facing, color = C.paint) => {
    const cx = (x0 + x1) / 2 + facing[0] * 0.01, cz = (z0 + z1) / 2 + facing[1] * 0.01, w = Math.hypot(x1 - x0, z1 - z0);
    still.panel(M.matte, color, cx, cz, facing, w, 0, CEILING);
  };
  paint(B.x0, HALL.z0, B.x0, MARKET.z1, [1, 0]);
  paint(B.x1, HALL.z0, B.x1, BOUTIQUE.z1, [-1, 0]);
  paint(MARKET.x0, MARKET.z1, MARKET.x1, MARKET.z1, [0, -1]);

  // ---------------------------------------------------------------- glass front
  front(site, still, M, signs);

  // ---------------------------------------------------------------- closed blocks behind the hall
  for (const r of [SERVICE, STOCKROOM]) site.collide(r.x0, r.z0, r.x1, r.z1, 0, CEILING);
  paint(SERVICE.x0, MARKET.z0, SERVICE.x0, MARKET.z1, [-1, 0]);
  paint(SERVICE.x1, BOUTIQUE.z0, SERVICE.x1, BOUTIQUE.z1, [1, 0]);
  paint(SERVICE.x0, SERVICE.z0, SERVICE.x1, SERVICE.z0, [0, -1], C.warm);
  // Restroom doors and their sign on the service front.
  for (const x of [-0.6, 2.6]) {
    still.box(M.satin, C.walnut, x - 0.5, 0, SERVICE.z0 - 0.04, x + 0.5, 2.2, SERVICE.z0);
    still.box(M.metal, C.steel, x + 0.3, 1.0, SERVICE.z0 - 0.07, x + 0.34, 1.25, SERVICE.z0 - 0.04);
  }
  still.panel(signs.material, C.white, 2, SERVICE.z0 - 0.02, [0, -1], 3.2, 2.5, 3.3, signs.rect('restrooms'));
  // The boutique's back wall (its mirror wall is MallBoutique's) and the stockroom.
  paint(BOUTIQUE.x0, BOUTIQUE.z1, BOUTIQUE.x1, BOUTIQUE.z1, [0, -1], C.blush);

  // ---------------------------------------------------------------- shopfronts on the hall
  // Supermarket: open below a bulkhead with its name.
  still.box(M.matte, C.paint, MARKET.x0, 3.4, HALL.z1 - 0.15, MARKET.x1, CEILING, HALL.z1 + 0.15);
  still.box(M.satin, C.green, MARKET.x0, 3.4, HALL.z1 - 0.17, MARKET.x1, 3.62, HALL.z1 - 0.15);
  still.panel(signs.material, C.white, -21, HALL.z1 - 0.18, [0, -1], 8.8, 3.75, 5.25, signs.rect('market'));
  site.collide(MARKET.x0, HALL.z1 - 0.15, MARKET.x1, HALL.z1 + 0.15, 3.4, CEILING);
  // Rails beside the checkouts (customers leave through the lanes) and up to the entry.
  const railZ = HALL.z1 + 0.6;
  for (const [x0, x1] of [[MARKET.x0, CHECKOUT_X[0] - 1.4], [CHECKOUT_X[3] + 2.25, MARKET_ENTRY.x0]]) {
    rail(cast, M, x0, x1, railZ);
    site.collide(x0, railZ - 0.05, x1, railZ + 0.05, 0, 1.05);
  }
  // Boutique: glass shopfront with an open doorway and a pink bulkhead.
  const BZ = BOUTIQUE.z0;
  for (const [x0, x1] of [[BOUTIQUE.x0, BOUTIQUE_DOOR.x0], [BOUTIQUE_DOOR.x1, BOUTIQUE.x1]]) {
    still.panel(M.glass, C.white, (x0 + x1) / 2, BZ, [0, -1], x1 - x0, 0.12, 3.2);
    still.box(M.metal, C.frame, x0, 0, BZ - 0.06, x1, 0.12, BZ + 0.06);
    for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 1.6))) still.box(M.metal, C.frame, x - 0.04, 0, BZ - 0.06, x + 0.04, 3.2, BZ + 0.06);
    site.collide(x0, BZ - 0.08, x1, BZ + 0.08, 0, 3.2);
  }
  still.box(M.matte, C.paint, BOUTIQUE.x0, 3.2, BZ - 0.15, BOUTIQUE.x1, CEILING, BZ + 0.15);
  still.box(M.satin, C.pink, BOUTIQUE.x0, 3.2, BZ - 0.17, BOUTIQUE.x1, 3.4, BZ - 0.15);
  still.panel(signs.material, C.white, 28, BZ - 0.18, [0, -1], 8.8, 3.55, 5.05, signs.rect('style'));
  site.collide(BOUTIQUE.x0, BZ - 0.15, BOUTIQUE.x1, BZ + 0.15, 3.2, CEILING);

  hall(site, cast, still, M, signs);
}

/** Ceiling lights: panels over the supermarket, a downlight grid in the boutique, light lines down the hall. */
function lights(b, M) {
  const y = CEILING - 0.012;
  for (let x = MARKET.x0 + 2; x < MARKET.x1 - 1; x += 3) {
    for (let z = MARKET.z0 + 2; z < MARKET.z1 - 1; z += 3) {
      b.flat(M.glow, C.light, x - 0.3, z - 0.6, x + 0.3, z + 0.6, y, true);
      b.box(M.metal, C.steel, x - 0.34, y + 0.006, z - 0.64, x + 0.34, CEILING, z + 0.64);
    }
  }
  for (let x = BOUTIQUE.x0 + 1.6; x < BOUTIQUE.x1 - 1; x += 2.4) {
    for (let z = BOUTIQUE.z0 + 1.6; z < BOUTIQUE.z1 - 1; z += 2.4) b.cylinder(M.glow, C.light, x, y - 0.02, z, 0.12, 0.02, 12);
  }
  for (const z of [2.4, 7.6]) {
    b.flat(M.glow, C.light, HALL.x0 + 0.5, z - 0.08, HALL.x1 - 0.5, z + 0.08, y, true);
    b.box(M.metal, C.steel, HALL.x0 + 0.45, y + 0.006, z - 0.12, HALL.x1 - 0.45, CEILING, z + 0.12);
  }
  for (let x = HALL.x0 + 4; x < HALL.x1 - 2; x += 4) {
    for (const z of [5]) b.flat(M.glow, C.light, x - 0.6, z - 0.6, x + 0.6, z + 0.6, y, true);
  }
}

/** The glass front (z = 0): curtain wall, entrances, the band above with the big sign, canopies. */
function front(site, b, M, signs) {
  const B = BUILDING, top = 5.2;
  const doors = ENTRANCES.map((e) => [e.x - e.w / 2, e.x + e.w / 2]);
  // Glass between the doors, the transoms over them.
  const spans = [];
  let x = B.x0;
  for (const [d0, d1] of doors) { spans.push([x, d0]); x = d1; }
  spans.push([x, B.x1]);
  for (const [x0, x1] of spans) {
    b.panel(M.glass, C.white, (x0 + x1) / 2, 0, [0, -1], x1 - x0, 0.1, top);
    site.collide(x0, -0.12, x1, 0.12, 0, top);
  }
  for (const [d0, d1] of doors) {
    b.panel(M.glass, C.white, (d0 + d1) / 2, 0, [0, -1], d1 - d0, DOOR_H + 0.18, top);
    b.box(M.metal, C.frame, d0 - 0.08, DOOR_H, -0.12, d1 + 0.08, DOOR_H + 0.18, 0.12);
    // Door track housing and the sensor over it.
    b.box(M.metal, C.dark, d0 - 1.9, DOOR_H + 0.18, -0.28, d1 + 1.9, DOOR_H + 0.4, -0.12);
    b.box(M.gloss, C.black, (d0 + d1) / 2 - 0.14, DOOR_H + 0.1, -0.32, (d0 + d1) / 2 + 0.14, DOOR_H + 0.18, -0.22);
  }
  // Mullions every ~2 m (and at every door jamb), transoms, sill.
  const posts = new Set(doors.flat().map((v) => +v.toFixed(2)));
  for (const [x0, x1] of spans) {
    const n = Math.max(1, Math.round((x1 - x0) / 2));
    for (let i = 0; i <= n; i++) posts.add(+(x0 + (x1 - x0) * i / n).toFixed(2));
  }
  for (const px of posts) b.box(M.metal, C.frame, px - 0.05, 0, -0.1, px + 0.05, top, 0.1);
  for (const [x0, x1] of spans) {
    b.box(M.metal, C.frame, x0, 0, -0.1, x1, 0.1, 0.1);
    b.box(M.metal, C.frame, x0, 2.75, -0.08, x1, 2.83, 0.08);
  }
  b.box(M.metal, C.frame, B.x0, top - 0.08, -0.12, B.x1, top, 0.12);
  // The band above: cladding, pink stripe, metal cap; the big sign and the two shop names.
  b.box(M.cladding, C.white, B.x0 - 0.3, top, -0.3, B.x1 + 0.3, ROOF, 0);
  b.box(M.satin, C.pink, B.x0 - 0.3, ROOF - 0.75, -0.32, B.x1 + 0.3, ROOF - 0.45, -0.3);
  b.box(M.matte, C.navy, -6.4, 5.45, -0.5, 6.4, 7.75, -0.3);
  b.panel(signs.material, C.white, 0, -0.51, [0, -1], 11.6, 5.55, 7.65, signs.rect('logo'));
  b.panel(signs.material, C.white, -24, -0.31, [0, -1], 7.2, 5.6, 6.84, signs.rect('market'));
  b.panel(signs.material, C.white, 24, -0.31, [0, -1], 7.2, 5.6, 6.84, signs.rect('style'));
  site.collide(B.x0 - 0.3, -0.3, B.x1 + 0.3, 0, top, ROOF);
  // Canopies over the entrances, on two posts, downlights under.
  for (const e of ENTRANCES) {
    const x0 = e.x - CANOPY.w / 2, x1 = e.x + CANOPY.w / 2, z0 = -CANOPY.d;
    b.box(M.matte, C.navy, x0, CANOPY.y, z0, x1, CANOPY.y + CANOPY.t, -0.3);
    b.box(M.metal, C.steel, x0 - 0.02, CANOPY.y - 0.02, z0 - 0.02, x1 + 0.02, CANOPY.y + 0.04, -0.3);
    b.panel(signs.material, C.white, e.x, z0 - 0.025, [0, -1], 1.6, CANOPY.y + 0.05, CANOPY.y + 0.25, signs.rect('welcome'));
    for (const px of [x0 + 0.35, x1 - 0.35]) {
      b.cylinder(M.metal, C.frame, px, 0, z0 + 0.3, 0.09, CANOPY.y, 12);
      site.collide(px - 0.1, z0 + 0.2, px + 0.1, z0 + 0.4, 0, CANOPY.y, { camera: false });
    }
    for (const dx of [-2.2, 0, 2.2]) b.cylinder(M.glow, C.light, e.x + dx, CANOPY.y - 0.01, z0 / 2, 0.14, 0.012, 12);
    site.collide(x0, z0, x1, -0.3, CANOPY.y, CANOPY.y + CANOPY.t);
  }
}

/** The hall's furniture: columns, benches, planters, the floor guide, a poster. */
function hall(site, cast, still, M, signs) {
  const z = (HALL.z0 + HALL.z1) / 2;
  for (const x of HALL_COLUMNS) {
    cast.box(M.matte, C.paint, x - 0.35, 0, z - 0.35, x + 0.35, CEILING, z + 0.35);
    cast.box(M.metal, C.steel, x - 0.37, 0, z - 0.37, x + 0.37, 0.12, z + 0.37);
    site.collide(x - 0.37, z - 0.37, x + 0.37, z + 0.37, 0, CEILING);
  }
  // Info desk round the middle column.
  cast.cylinder(M.gloss, C.snow, 0, 0, z, 1.2, 1.0, 24);
  cast.cylinder(M.satin, C.oak, 0, 1.0, z, 1.26, 0.05, 24);
  site.collide(-1.2, z - 1.2, 1.2, z + 1.2, 0, 1.05);
  for (const x of HALL_BENCHES) {
    cast.box(M.satin, C.oak, x - 0.9, 0.42, z - 0.25, x + 0.9, 0.48, z + 0.25);
    for (const lx of [x - 0.75, x + 0.75]) cast.box(M.metal, C.frame, lx - 0.04, 0, z - 0.22, lx + 0.04, 0.42, z + 0.22);
    site.collide(x - 0.9, z - 0.25, x + 0.9, z + 0.25, 0, 0.48, { camera: false });
  }
  for (const x of HALL_PLANTERS) planter(cast, M, x, z, 0.8);
  for (const x of HALL_PLANTERS) site.collide(x - 0.8, z - 0.8, x + 0.8, z + 0.8, 0, 0.6, { camera: false });
  // The floor guide by the east entrance, a poster by the west one.
  const gx = 12, gz = 3.2;
  cast.box(M.metal, C.frame, gx - 0.6, 0, gz - 0.08, gx + 0.6, 1.9, gz + 0.08);
  still.panel(signs.material, C.white, gx, gz - 0.085, [0, -1], 1.05, 0.25, 1.82, signs.rect('directory'));
  still.panel(signs.material, C.white, gx, gz + 0.085, [0, 1], 1.05, 0.25, 1.82, signs.rect('directory'));
  site.collide(gx - 0.6, gz - 0.08, gx + 0.6, gz + 0.08, 0, 1.9);
  still.panel(signs.material, C.white, -1.2, SERVICE.z0 - 0.02, [0, -1], 1.0, 0.9, 2.4, signs.rect('fresh'));
  // Banners hanging over the hall, one for each shop.
  for (const [x, id] of [[-16, 'fresh'], [16, 'season']]) {
    for (const f of [-1, 1]) still.panel(signs.material, C.white, x, z + f * 0.006, [0, f], 1.4, 3.1, 5.2, signs.rect(id));
    still.rod(M.metal, C.steel, [x - 0.75, 5.22, z], [x + 0.75, 5.22, z], 0.015, 6);
    for (const dx of [-0.6, 0.6]) still.rod(M.metal, C.steel, [x + dx, 5.22, z], [x + dx, CEILING, z], 0.005, 4);
  }
}

/** A chrome barrier rail along x at z: posts, top and middle bars. */
function rail(b, M, x0, x1, z) {
  const n = Math.max(1, Math.round((x1 - x0) / 1.5));
  for (let i = 0; i <= n; i++) b.cylinder(M.chrome, C.steel, x0 + (x1 - x0) * i / n, 0, z, 0.03, 1.0, 8);
  for (const y of [1.0, 0.55]) b.rod(M.chrome, C.steel, [x0, y, z], [x1, y, z], 0.022);
}
