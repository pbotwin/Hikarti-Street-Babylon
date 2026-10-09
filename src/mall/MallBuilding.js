import { C } from './MallKit.js';
import {
  BUILDING, ROW, VOID, MARKET, SERVICE, BOUTIQUE, STOCKROOM, CEILING, ROOF, SOFFIT, UPPER_CEILING, DOOR_H,
  ENTRANCES, COURT_W, BOUTIQUE_DOOR, CANOPY, CHECKOUT_X, MARKET_ENTRY, UNITS,
} from './MallPlan.js';

/**
 * Hikari Mall's building: the two-storey shell and roof (with the atrium's
 * glazed lantern standing above it), the front toward the lot — the shop
 * row's wall with its signs and lightboxes, the café's window, the two
 * glazed entrance portals with their canopies, the big sign — the entrance
 * courts through to the concourse, the anchor stores' floors, ceilings and
 * fronts, and the service front between them. The concourse itself is
 * MallConcourse's, the shop row's fronts MallStorefronts', the fixtures
 * inside the anchors MallMarket's and MallBoutique's.
 */
const WALL = 0.3;
const PORTAL = { pier: 0.6, depth: 1.2, top: 11.2 };       // the entrance portals' frame (beyond the court's width)
const SHOWCASE = { y0: 0.5, y1: 3.4 };                      // lightboxes on the shop row's outer wall
const PRODUCE_FLOOR = { x0: -12.4, z0: 33, z1: 58.4 };

export function buildBuilding(site, mats, signs) {
  const { cast, still } = site.zone('building');
  const M = mats;
  const B = BUILDING;

  // ---------------------------------------------------------------- floors and ceilings (anchors, courts)
  // The supermarket's floor, warmer in the produce hall (split, not layered: layers fought from afar).
  const P = PRODUCE_FLOOR;
  still.flat(M.marketFloor, C.white, MARKET.x0, MARKET.z0, P.x0, MARKET.z1, 0.01);
  still.flat(M.marketFloor, C.white, P.x0, MARKET.z0, MARKET.x1, P.z0, 0.01);
  still.flat(M.marketFloor, C.white, P.x0, P.z1, MARKET.x1, MARKET.z1, 0.01);
  still.flat(M.marketFloor, C.cream, P.x0, P.z0, MARKET.x1, P.z1, 0.01);
  still.flat(M.woodFloor, C.white, BOUTIQUE.x0, BOUTIQUE.z0, BOUTIQUE.x1, BOUTIQUE.z1, 0.01);
  for (const r of [MARKET, BOUTIQUE]) still.flat(M.ceiling, C.white, r.x0, r.z0, r.x1, r.z1, CEILING, true);
  lights(still, M);

  // ---------------------------------------------------------------- outer walls and roof
  still.box(M.cladding, C.white, B.x0 - WALL, 0, B.z0, B.x0, ROOF, B.z1 + WALL);
  still.box(M.cladding, C.white, B.x1, 0, B.z0, B.x1 + WALL, ROOF, B.z1 + WALL);
  still.box(M.cladding, C.white, B.x0, 0, B.z1, B.x1, ROOF, B.z1 + WALL);
  // A pink band and a metal cap run round the top; a plinth at the foot.
  for (const [x0, z0, x1, z1] of [[B.x0 - WALL - 0.02, B.z0 - WALL - 0.02, B.x0 - WALL, B.z1 + WALL + 0.02], [B.x1 + WALL, B.z0 - WALL - 0.02, B.x1 + WALL + 0.02, B.z1 + WALL + 0.02], [B.x0 - WALL, B.z1 + WALL, B.x1 + WALL, B.z1 + WALL + 0.02]]) {
    still.box(M.satin, C.pink, x0, ROOF - 0.75, z0, x1, ROOF - 0.45, z1);
    still.box(M.matte, C.charcoal, x0, 0, z0, x1, 0.45, z1);
  }
  still.box(M.metal, C.steel, B.x0 - WALL - 0.04, ROOF, B.z0 - WALL - 0.04, B.x1 + WALL + 0.04, ROOF + 0.12, B.z1 + WALL + 0.04);
  site.collide(B.x0 - WALL, B.z0, B.x0, B.z1 + WALL, 0, ROOF);
  site.collide(B.x1, B.z0, B.x1 + WALL, B.z1 + WALL, 0, ROOF);
  site.collide(B.x0, B.z1, B.x1, B.z1 + WALL, 0, ROOF);
  // The mall's name on both side walls, by the front, for the lot's far corners.
  for (const s of [-1, 1]) {
    const x = s > 0 ? B.x1 + WALL + 0.03 : B.x0 - WALL - 0.03;
    still.box(M.matte, C.navy, x - (s > 0 ? 0.02 : -0.02), 8.6, 3, x, 10.9, 15);
    still.panel(signs.material, C.white, x + s * 0.015, 9, [s, 0], 11.2, 8.7, 10.8, signs.rect('logo'));
  }
  roof(still, M);
  // Inside faces of the anchors' outer walls (a hair in front: the cladding's inner face is in the same plane).
  const paint = (x0, z0, x1, z1, facing, color = C.paint, y1 = CEILING) => {
    const cx = (x0 + x1) / 2 + facing[0] * 0.01, cz = (z0 + z1) / 2 + facing[1] * 0.01, w = Math.hypot(x1 - x0, z1 - z0);
    still.panel(M.matte, color, cx, cz, facing, w, 0, y1);
  };
  paint(B.x0, MARKET.z0, B.x0, MARKET.z1, [1, 0]);
  paint(B.x1, BOUTIQUE.z0, B.x1, BOUTIQUE.z1, [-1, 0]);
  paint(MARKET.x0, MARKET.z1, MARKET.x1, MARKET.z1, [0, -1]);

  front(site, cast, still, M, signs);
  courts(site, cast, still, M, signs);

  // ---------------------------------------------------------------- closed blocks between and behind the anchors
  for (const r of [SERVICE, STOCKROOM]) site.collide(r.x0, r.z0, r.x1, r.z1, 0, CEILING);
  paint(SERVICE.x0, MARKET.z0, SERVICE.x0, MARKET.z1, [-1, 0]);
  paint(SERVICE.x1, BOUTIQUE.z0, SERVICE.x1, BOUTIQUE.z1, [1, 0]);
  paint(SERVICE.x0, SERVICE.z0, SERVICE.x1, SERVICE.z0, [0, -1], C.warm, SOFFIT);
  // Restroom doors and their sign on the service front.
  // Each door in a steel frame (a bare slab on the wall read as painted on), a kick plate and a push plate.
  const z = SERVICE.z0;
  for (const x of [2.6, 4.6]) {
    still.box(M.metal, C.steel, x - 0.56, 0, z - 0.05, x + 0.56, 2.26, z);
    still.box(M.satin, C.walnut, x - 0.48, 0, z - 0.07, x + 0.48, 2.18, z - 0.05);
    still.box(M.metal, C.steel, x - 0.46, 0.02, z - 0.075, x + 0.46, 0.24, z - 0.07);
    still.box(M.metal, C.steel, x - 0.38, 1.0, z - 0.08, x - 0.3, 1.35, z - 0.07);
  }
  still.panel(signs.material, C.white, 3.6, SERVICE.z0 - 0.02, [0, -1], 3.2, 2.5, 3.3, signs.rect('restrooms'));
  // The boutique's back wall (its mirror wall is MallBoutique's).
  paint(BOUTIQUE.x0, BOUTIQUE.z1, BOUTIQUE.x1, BOUTIQUE.z1, [0, -1], C.blush);

  anchorFronts(site, cast, still, M, signs);
}

/** Ceiling lights: panels over the supermarket, a downlight grid in the boutique. */
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
}

/** The flat roof round the atrium's lantern, behind its parapet, with plant on it (seen from the lot's far side). */
function roof(b, M) {
  const B = BUILDING, y = ROOF - 0.6, V = VOID;
  for (const [x0, z0, x1, z1] of [[B.x0, B.z0, B.x1, V.z0], [B.x0, V.z1, B.x1, B.z1], [B.x0, V.z0, V.x0, V.z1], [V.x1, V.z0, B.x1, V.z1]]) {
    b.flat(M.matte, C.concrete, x0, z0, x1, z1, y);
  }
  // Parapet's inner face.
  b.box(M.matte, C.concrete, B.x0, y, B.z0 - 0.3, B.x1, ROOF, B.z0);
  for (const [x, z, w, d, h] of [[-30, 36, 4, 3, 1.6], [-18, 46, 3, 3, 1.4], [16, 34, 5, 3, 1.8], [28, 50, 3, 4, 1.4], [0, 52, 6, 2.5, 1.2]]) {
    b.box(M.metal, C.steel, x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
    b.cylinder(M.metal, C.grey, x - w / 4, y + h, z, d * 0.3, 0.25, 12);
  }
}

/**
 * The front toward the lot (z = 0): the shop row's wall, solid up to the
 * parapet, with lightboxes at ground level and each shop's sign; a dark
 * ribbon of upper-floor windows; the café's glass; the two entrance portals
 * (glass in a deep navy frame, the doors at their foot, a canopy); the big
 * sign over the café.
 */
function front(site, cast, b, M, signs) {
  const B = BUILDING;
  const courts = ENTRANCES.map((e) => [e.x - COURT_W / 2, e.x + COURT_W / 2]);
  const cafe = UNITS.find((u) => u.kind === 'cafe');
  // Wall segments (x spans) between the portals; the café's span has a window below.
  const walls = [[B.x0 - WALL, courts[0][0] - PORTAL.pier], [courts[0][1] + PORTAL.pier, courts[1][0] - PORTAL.pier], [courts[1][1] + PORTAL.pier, B.x1 + WALL]];
  // The café's window, within its stretch of wall.
  const [w0, w1] = walls.map(([x0, x1]) => [x0 + 0.4, x1 - 0.4]).find(([x0, x1]) => x0 < (cafe.x0 + cafe.x1) / 2 && x1 > (cafe.x0 + cafe.x1) / 2);
  for (const [x0, x1] of walls) {
    if (x0 < w0 && x1 > w1) {
      b.box(M.cladding, C.white, x0, 0, -WALL, w0, ROOF, 0);
      b.box(M.cladding, C.white, w1, 0, -WALL, x1, ROOF, 0);
      b.box(M.cladding, C.white, w0, 3.8, -WALL, w1, ROOF, 0);
      b.box(M.matte, C.charcoal, w0, 0, -WALL, w1, 0.3, 0);
    } else b.box(M.cladding, C.white, x0, 0, -WALL, x1, ROOF, 0);
    site.collide(x0, -WALL, x1, 0, 0, ROOF);
    b.box(M.matte, C.charcoal, x0, 0, -WALL - 0.04, x1, 0.45, -WALL);
    b.box(M.satin, C.pink, x0, ROOF - 0.75, -WALL - 0.02, x1, ROOF - 0.45, -WALL);
    // The upper floor's window ribbon: dark glass in a frame, mullions every 1.5 m.
    const r0 = x0 + 1.2, r1 = x1 - 1.2;
    b.box(M.gloss, C.tinted, r0, 6.6, -WALL - 0.02, r1, 9.6, -WALL);
    for (const y of [6.55, 9.6]) b.box(M.metal, C.frame, r0 - 0.05, y, -WALL - 0.08, r1 + 0.05, y + 0.08, -WALL);
    const n = Math.round((r1 - r0) / 1.5);
    for (let i = 0; i <= n; i++) { const x = r0 + (r1 - r0) * i / n; b.box(M.metal, C.frame, x - 0.03, 6.6, -WALL - 0.06, x + 0.03, 9.6, -WALL); }
  }
  b.box(M.metal, C.steel, B.x0 - WALL - 0.04, ROOF, -WALL - 0.04, B.x1 + WALL + 0.04, ROOF + 0.12, 0);

  // Each shop of the row: a lightbox poster and its sign facing the lot, a fin at each party wall.
  for (const u of UNITS) {
    const cx = (u.x0 + u.x1) / 2, w = Math.min(u.x1 - u.x0 - 1.6, 5.2);
    b.box(M.matte, C.dark, cx - w / 2 - 0.08, 4.0, -WALL - 0.22, cx + w / 2 + 0.08, 4.95, -WALL);
    b.panel(signs.material, C.white, cx, -WALL - 0.235, [0, -1], w, 4.06, 4.89, signs.rect(u.kind));
    if (u.kind === 'cafe') continue;
    b.box(M.metal, C.frame, cx - 1.05, SHOWCASE.y0 - 0.06, -WALL - 0.12, cx + 1.05, SHOWCASE.y1 + 0.06, -WALL);
    b.panel(signs.material, C.white, cx, -WALL - 0.135, [0, -1], 1.96, SHOWCASE.y0, SHOWCASE.y1, signs.rect(POSTER[u.kind]));
  }
  // Fins at the party walls, up to the parapet's band; under the anchors' names they stop below them (they cut through the boards).
  for (const x of [...new Set(UNITS.flatMap((u) => [u.x0, u.x1]))]) {
    if (Math.abs(Math.abs(x) - 40) < 0.01 || courts.some(([a, c]) => Math.abs(x - a) < 0.1 || Math.abs(x - c) < 0.1)) continue;
    const top = ANCHOR_NAMES.some(([cx]) => Math.abs(x - cx) < 4.6) ? 9.75 : ROOF - 0.75;
    b.box(M.cladding, C.white, x - 0.25, 0, -WALL - 0.35, x + 0.25, top, -WALL);
  }
  // The café's window: glass in a dark frame from the plinth up, an awning over it.
  const cw = w1 - w0;
  b.panel(M.glass, C.white, (w0 + w1) / 2, -0.15, [0, -1], cw, 0.3, 3.8);
  for (let i = 0; i <= 4; i++) { const x = w0 + cw * i / 4; b.box(M.metal, C.frame, x - 0.05, 0.3, -0.2, x + 0.05, 3.8, -0.1); }
  b.box(M.metal, C.frame, w0, 0.25, -0.2, w1, 0.32, -0.1);
  b.box(M.metal, C.frame, w0, 3.72, -0.2, w1, 3.8, -0.1);
  b.turned(M.fabric, C.pink, (w0 + w1) / 2, 3.55, -0.75, cw + 0.2, 0.06, 1.3, 0, -0.35);
  // The anchors' names high on the front, over their halves of the mall.
  for (const [x, id] of ANCHOR_NAMES) {
    b.box(M.matte, C.white, x - 4.5, 9.85, -WALL - 0.2, x + 4.5, 11.55, -WALL);
    b.panel(signs.material, C.white, x, -WALL - 0.215, [0, -1], 8.8, 9.9, 11.5, signs.rect(id));
  }
  // The big sign over the café.
  b.box(M.matte, C.navy, -6.4, 9.6, -0.55, 6.4, 11.85, -0.3);
  b.panel(signs.material, C.white, 0, -0.565, [0, -1], 11.6, 9.7, 11.75, signs.rect('logo'));

  // Entrance portals: piers and a head in navy round a glass wall; the doors at the foot.
  courts.forEach(([c0, c1], i) => {
    const e = ENTRANCES[i], d0 = e.x - e.w / 2, d1 = e.x + e.w / 2, P = PORTAL;
    for (const [x0, x1] of [[c0 - P.pier, c0], [c1, c1 + P.pier]]) {
      b.box(M.matte, C.navy, x0, 0, -P.depth, x1, P.top, 0);
      site.collide(x0, -P.depth, x1, 0, 0, P.top);
    }
    b.box(M.matte, C.navy, c0, UPPER_CEILING, -P.depth, c1, P.top, 0);
    b.box(M.metal, C.steel, c0 - P.pier - 0.02, P.top, -P.depth - 0.02, c1 + P.pier + 0.02, P.top + 0.08, 0);
    b.panel(signs.material, C.white, e.x, -P.depth - 0.01, [0, -1], 4.8, UPPER_CEILING + 0.05, P.top - 0.05, signs.rect(i ? 'eastDoor' : 'westDoor'));
    // Glass: side lights beside the doors, over them up to the courts' ceiling; tinted above, in front of the upper floor.
    for (const [x0, x1] of [[c0, d0], [d1, c1]]) {
      b.panel(M.glass, C.white, (x0 + x1) / 2, 0, [0, -1], x1 - x0, 0.1, SOFFIT);
      site.collide(x0, -0.12, x1, 0.12, 0, SOFFIT);
    }
    b.panel(M.glass, C.white, e.x, 0, [0, -1], d1 - d0, DOOR_H + 0.18, SOFFIT);
    b.box(M.gloss, C.tinted, c0, SOFFIT, -0.06, c1, UPPER_CEILING, 0);
    // Frame: posts at the portal's sides and the door jambs, a mullion over
    // the doors only (one used to run down the middle of the doorway, through
    // the leaves), sills under the side lights alone (across the doorway the
    // sill was a 10 cm kerb), the transom the leaves' track hangs from.
    for (const x of [c0, d0, d1, c1]) b.box(M.metal, C.frame, x - 0.05, 0, -0.12, x + 0.05, UPPER_CEILING, 0.06);
    b.box(M.metal, C.frame, e.x - 0.05, DOOR_H + 0.18, -0.12, e.x + 0.05, UPPER_CEILING, 0.06);
    for (const [x0, x1] of [[c0, d0], [d1, c1]]) b.box(M.metal, C.frame, x0, 0, -0.12, x1, 0.1, 0.06);
    for (const y of [SOFFIT - 0.05, 8]) b.box(M.metal, C.frame, c0, y, -0.12, c1, y + 0.1, 0.06);
    b.box(M.metal, C.frame, c0, DOOR_H, -0.12, c1, DOOR_H + 0.18, 0.12);
    // Door track housing over the leaves' whole run (they part behind the side lights), the sensor under it, the floor track.
    b.box(M.metal, C.frame, c0, DOOR_H + 0.18, -0.3, c1, DOOR_H + 0.4, -0.12);
    b.box(M.gloss, C.black, e.x - 0.14, DOOR_H + 0.12, -0.36, e.x + 0.14, DOOR_H + 0.18, -0.24);
    b.box(M.metal, C.steel, c0, 0.02, -0.3, c1, 0.028, -0.1);
    // Mats at the door, inside and out (a centimetre thick: flat on the floor they fought it from afar).
    b.box(M.matte, C.charcoal, d0 - 0.2, 0.02, -1.6, d1 + 0.2, 0.032, -0.3);
    b.box(M.matte, C.charcoal, d0 - 0.2, 0.01, 0.15, d1 + 0.2, 0.022, 1.8);
    canopy(site, cast, b, M, signs, e);
  });
}

/** The anchors' names high on the front: [x, sign]. */
const ANCHOR_NAMES = [[-25, 'market'], [25, 'style']];

/** Lightbox posters on the shop row's wall, one per shop kind. */
const POSTER = { books: 'shelfBooks', denki: 'screens', drug: 'shelfCosmetics', hyaku: 'shelfHyaku', toys: 'shelfToys', shoes: 'shelfShoes', ramen: 'ramenMenu', games: 'purikura' };

/** A canopy over an entrance, on two posts, downlights under. */
function canopy(site, cast, b, M, signs, e) {
  const x0 = e.x - CANOPY.w / 2, x1 = e.x + CANOPY.w / 2, z0 = -CANOPY.d, z1 = -PORTAL.depth;
  b.box(M.matte, C.navy, x0, CANOPY.y, z0, x1, CANOPY.y + CANOPY.t, z1);
  b.box(M.metal, C.steel, x0 - 0.02, CANOPY.y - 0.02, z0 - 0.02, x1 + 0.02, CANOPY.y + 0.04, z1);
  b.panel(signs.material, C.white, e.x, z0 - 0.025, [0, -1], 1.6, CANOPY.y + 0.05, CANOPY.y + 0.25, signs.rect('welcome'));
  for (const px of [x0 + 0.35, x1 - 0.35]) {
    cast.cylinder(M.metal, C.frame, px, 0, z0 + 0.3, 0.09, CANOPY.y, 12);
    site.collide(px - 0.1, z0 + 0.2, px + 0.1, z0 + 0.4, 0, CANOPY.y, { camera: false });
  }
  for (const dx of [-1.6, 0, 1.6]) b.cylinder(M.glow, C.light, e.x + dx, CANOPY.y - 0.01, (z0 + z1) / 2, 0.14, 0.012, 12);
  site.collide(x0, z0, x1, z1, CANOPY.y, CANOPY.y + CANOPY.t);
}

/**
 * The courts from the doors to the concourse: side walls (the next shops'
 * party walls) with a floor guide, lockers and posters, a terrazzo floor,
 * the ceiling with its lights, and a wayfinding blade at the concourse end.
 */
function courts(site, cast, b, M, signs) {
  ENTRANCES.forEach((e, i) => {
    const c0 = e.x - COURT_W / 2, c1 = e.x + COURT_W / 2;
    b.flat(M.hallFloor, C.white, c0, ROW.z0, c1, ROW.z1, 0.01);
    b.flat(M.ceiling, C.white, c0, ROW.z0, c1, ROW.z1, SOFFIT, true);
    for (let z = 1.5; z < ROW.z1; z += 2.2) for (const dx of [-1.4, 1.4]) b.cylinder(M.glow, C.light, e.x + dx, SOFFIT - 0.02, z, 0.13, 0.02, 12);
    for (const [x, f] of [[c0, 1], [c1, -1]]) {
      b.box(M.satin, C.cream, x - (f > 0 ? WALL : 0), 0, ROW.z0, x + (f > 0 ? 0 : WALL), SOFFIT, ROW.z1);
      const s0 = f > 0 ? x : x - 0.02;
      b.box(M.satin, C.walnut, s0, 0, ROW.z0, s0 + 0.02, 0.12, ROW.z1);
      site.collide(x - (f > 0 ? WALL : 0), ROW.z0, x + (f > 0 ? 0 : WALL), ROW.z1, 0, SOFFIT);
    }
    // West wall: the floor guide and two posters; east wall: coin lockers and an ad screen.
    const gx = c0 + 0.03;
    cast.box(M.metal, C.frame, gx, 0.4, 4.2, gx + 0.12, 2.3, 5.6);
    b.panel(signs.material, C.white, gx + 0.135, 4.9, [1, 0], 1.3, 0.5, 2.2, signs.rect('guide'));
    for (const [z, id, w, y0, y1] of [[1.9, i ? 'halloween' : 'autumn', 0.68, 0.75, 2.55], [7.2, 'fashionPoster', 1.0, 0.9, 2.4]]) {
      b.box(M.metal, C.frame, gx, y0 - 0.05, z - w / 2 - 0.05, gx + 0.06, y1 + 0.05, z + w / 2 + 0.05);
      b.panel(signs.material, C.white, gx + 0.075, z, [1, 0], w, y0, y1, signs.rect(id));
    }
    const lx = c1 - 0.03;
    for (let k = 0; k < 4; k++) {
      const z0 = 1.2 + k * 0.62;
      for (let r = 0; r < 4; r++) {
        cast.box(M.gloss, k % 2 ? C.blue : C.snow, lx - 0.5, 0.2 + r * 0.45, z0, lx, 0.62 + r * 0.45, z0 + 0.6);
        b.box(M.metal, C.steel, lx - 0.52, 0.5 + r * 0.45, z0 + 0.45, lx - 0.5, 0.56 + r * 0.45, z0 + 0.52);
      }
    }
    site.collide(lx - 0.5, 1.2, lx, 3.7, 0, 2.0);
    b.box(M.gloss, C.black, lx - 0.08, 1.3, 5.6, lx, 2.6, 7.8);
    b.panel(signs.material, C.white, lx - 0.095, 6.7, [-1, 0], 2.1, 1.35, 2.55, signs.rect('adScreen'));
    // Wayfinding over the court's inner end, both ways.
    const wz = ROW.z1 - 0.5, sign = i ? 'wayStyle' : 'wayMarket';
    for (const f of [-1, 1]) b.panel(signs.material, C.white, e.x, wz + f * 0.03, [0, f], 2.6, 4.2, 4.77, signs.rect(f > 0 ? 'wayExit' : sign));
    b.box(M.matte, C.navy, e.x - 1.32, 4.18, wz - 0.025, e.x + 1.32, 4.79, wz + 0.025);
    for (const dx of [-1.1, 1.1]) b.rod(M.metal, C.steel, [e.x + dx, 4.79, wz], [e.x + dx, SOFFIT, wz], 0.008, 4);
  });
}

/**
 * The anchors' fronts on the concourse (z = MARKET.z0): the supermarket open
 * below its bulkhead (rails beside the checkouts), the boutique's glass
 * shopfront with an open doorway.
 */
function anchorFronts(site, cast, still, M, signs) {
  const MZ = MARKET.z0;
  // Supermarket: open below a bulkhead with its name; green pilasters; the entry marked.
  still.box(M.matte, C.paint, MARKET.x0, 3.4, MZ - 0.15, MARKET.x1, CEILING, MZ + 0.15);
  still.box(M.satin, C.green, MARKET.x0, 3.4, MZ - 0.17, MARKET.x1, 3.62, MZ - 0.15);
  still.panel(signs.material, C.white, -21, MZ - 0.18, [0, -1], 8.8, 3.75, 5.25, signs.rect('market'));
  still.panel(signs.material, C.white, (MARKET_ENTRY.x0 + MARKET_ENTRY.x1) / 2, MZ - 0.18, [0, -1], 3.6, 2.75, 3.35, signs.rect('marketEntry'));
  site.collide(MARKET.x0, MZ - 0.15, MARKET.x1, MZ + 0.15, 3.4, CEILING);
  for (const x of [MARKET.x1 - 0.5, MARKET_ENTRY.x0 - 0.5]) {
    cast.box(M.satin, C.green, x - 0.25, 0, MZ - 0.25, x + 0.25, 3.4, MZ + 0.15);
    site.collide(x - 0.25, MZ - 0.25, x + 0.25, MZ + 0.15, 0, 3.4);
  }
  // Rails beside the checkouts (customers leave through the lanes) and up to the entry.
  const railZ = MZ + 0.6;
  for (const [x0, x1] of [[MARKET.x0, CHECKOUT_X[0] - 1.4], [CHECKOUT_X[3] + 2.25, MARKET_ENTRY.x0 - 0.75]]) {
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
  for (const x of [BOUTIQUE_DOOR.x0 - 0.2, BOUTIQUE_DOOR.x1 + 0.2]) still.box(M.gloss, C.blush, x - 0.2, 0, BZ - 0.22, x + 0.2, 3.2, BZ - 0.08);
  site.collide(BOUTIQUE.x0, BZ - 0.15, BOUTIQUE.x1, BZ + 0.15, 3.2, CEILING);
}

/** A chrome barrier rail along x at z: posts, top and middle bars. */
function rail(b, M, x0, x1, z) {
  const n = Math.max(1, Math.round((x1 - x0) / 1.5));
  for (let i = 0; i <= n; i++) b.cylinder(M.chrome, C.steel, x0 + (x1 - x0) * i / n, 0, z, 0.03, 1.0, 8);
  for (const y of [1.0, 0.55]) b.rod(M.chrome, C.steel, [x0, y, z], [x1, y, z], 0.022);
}
