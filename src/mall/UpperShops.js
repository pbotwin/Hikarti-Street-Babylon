import { C, lin } from './MallKit.js';
import { mulberry32 } from '../world/rng.js';
import { UPPER, UPPER_TOP } from './MallPlan.js';

/**
 * The upper floor's shops she doesn't walk into, built as real rooms seen
 * through their glass (they used to be one painted picture of a shop a
 * step behind the glass, which read as a blurred print from the gallery):
 * a sports shop, a living-goods shop, a kids' shop, a clothing shop, a
 * hair salon and a furniture showroom, each a lit room a few metres deep
 * with its fixtures and goods as plain boxes, cylinders and balls in the
 * mall's vertex-coloured finishes. One closes behind a "coming soon"
 * hoarding, one behind its roll shutter (closed today), so the gallery
 * isn't a row of identical windows. Everything goes into the concourse's
 * static batch (no shadows: only the store lights reach in there), so the
 * rooms add triangles but no draws.
 *
 * Each builder gets a room frame `r` (MallStorefronts upperFronts): u runs
 * along the front (site x), d into the room from the glass (0) to its back
 * wall (DEPTH), heights above the upper floor.
 */
export const DEPTH = 4;
const H = UPPER_TOP - UPPER;
const GARMENTS = ['#26324a', '#e8e4dc', '#8d9096', '#3b3f46', '#c9b79c', '#7a2e2e', '#6f8fb3', '#f4ead8'].map(lin);
const KIDS = ['#f2c230', '#e27c9a', '#2f6fb3', '#4f9a4a', '#e8892f', '#7a5fb3', '#f6c1d1', '#a9cde6'].map(lin);
const BRIGHT = [C.red, C.blue, C.yellow, C.green, C.orange, C.purple, C.teal, C.white, C.navy];

/** The room frame: site coordinates of a point u along the front, d deep. */
export function roomFrame(b, M, x0, x1, z, f) {
  const zAt = (d) => z - f * d;
  return {
    b, M, x0, x1, f, zAt,
    /** A box between (u0, y0, d0) and (u1, y1, d1). */
    box(mat, col, u0, y0, d0, u1, y1, d1) {
      const za = zAt(d0), zb = zAt(d1);
      b.box(mat, col, Math.min(u0, u1), UPPER + y0, Math.min(za, zb), Math.max(u0, u1), UPPER + y1, Math.max(za, zb));
    },
    cyl(mat, col, u, y, d, r, h, n = 10, rTop = r) { b.cylinder(mat, col, u, UPPER + y, zAt(d), r, h, n, rTop); },
    ball(mat, col, u, y, d, r, sy = 1, seg = 6) { b.sphere(mat, col, u, UPPER + y, zAt(d), r, sy, seg); },
    rod(mat, col, [ua, ya, da], [ub, yb, db], r, n = 6) { b.rod(mat, col, [ua, UPPER + ya, zAt(da)], [ub, UPPER + yb, zAt(db)], r, n); },
    /** An upright panel at depth d facing the glass (or along the side walls: facing ±u). */
    face(mat, col, u, d, w, y0, y1, toward = [0, f], rect = null) { b.panel(mat, col, u, zAt(d), toward, w, UPPER + y0, UPPER + y1, rect); },
  };
}

/** Floor, walls, ceiling with its light panels, a skirting: the room every shop stands in. */
export function shell(r, floor, wall, floorColor = C.white) {
  const { b, M, x0, x1 } = r, w = x1 - x0, za = r.zAt(0), zb = r.zAt(DEPTH);
  const z0 = Math.min(za, zb), z1 = Math.max(za, zb);
  b.flat(floor, floorColor, x0 + 0.15, z0, x1 - 0.15, z1, UPPER + 0.005);
  r.face(M.matte, wall, (x0 + x1) / 2, DEPTH - 0.01, w - 0.3, 0, H);
  for (const [u, s] of [[x0 + 0.16, 1], [x1 - 0.16, -1]]) b.panel(M.matte, wall, u, (z0 + z1) / 2, [s, 0], DEPTH, UPPER, UPPER_TOP);
  r.box(M.satin, C.charcoal, x0 + 0.15, 0, DEPTH - 0.03, x1 - 0.15, 0.1, DEPTH - 0.01);
  b.flat(M.ceiling, C.white, x0 + 0.15, z0, x1 - 0.15, z1, UPPER_TOP, true);
  for (let u = x0 + 1.4; u < x1 - 0.8; u += 2.4) {
    for (const d of [1.1, 3.0]) { const z = r.zAt(d); b.flat(M.glow, C.light, u - 0.3, z - 0.3, u + 0.3, z + 0.3, UPPER_TOP - 0.01, true); }
  }
}

/** Wall shelving at depth d (against the back wall) from u0 to u1: uprights, boards, and `fill(u, y, w)` on each board. */
function wallShelves(r, u0, u1, d, levels, frame, fill) {
  const { M } = r, top = levels[levels.length - 1] + 0.45;
  r.box(M.matte, frame, u0, 0, d - 0.04, u1, top, d);
  const n = Math.max(1, Math.round((u1 - u0) / 1.2)), bw = (u1 - u0) / n;
  for (let i = 0; i <= n; i++) { const u = u0 + i * bw; r.box(M.satin, frame, u - 0.02, 0, d - 0.4, u + 0.02, top, d - 0.04); }
  for (const y of levels) {
    r.box(M.satin, frame, u0, y - 0.025, d - 0.4, u1, y, d - 0.04);
    for (let i = 0; i < n; i++) fill(u0 + i * bw + 0.06, y, bw - 0.12);
  }
}

/** A clothes rail along u at depth d: two uprights, the bar, garments on hangers (slabs edge-on to the glass). */
function rail(r, u0, u1, d, y, colors, rnd, len = 0.75) {
  const { M } = r;
  for (const u of [u0, u1]) { r.rod(M.metal, C.steel, [u, 0, d], [u, y + 0.08, d], 0.018, 6); r.box(M.metal, C.steel, u - 0.03, 0, d - 0.25, u + 0.03, 0.03, d + 0.25); }
  r.rod(M.chrome, C.steel, [u0, y, d], [u1, y, d], 0.014, 6);
  for (let u = u0 + 0.12; u < u1 - 0.08; u += 0.085) {
    const h = len * (0.8 + rnd() * 0.25);
    r.box(M.fabric, rnd.pick(colors), u - 0.022, y - 0.05 - h, d - 0.22, u + 0.022, y - 0.05, d + 0.22);
  }
}

/** A garment folded on a table or shelf: a flat stack. */
function stack(r, u, y, d, w, n, col) {
  r.box(r.M.fabric, col, u - w / 2, y, d - 0.16, u + w / 2, y + n * 0.045, d + 0.16);
}

/** A potted plant: pot and a round crown. */
function plant(r, u, d, s = 1) {
  r.cyl(r.M.satin, C.cream, u, 0, d, 0.2 * s, 0.4 * s, 10, 0.24 * s);
  for (const [du, dy, dd, rr] of [[0, 0.75, 0, 0.32], [0.14, 0.6, 0.1, 0.22], [-0.14, 0.62, -0.08, 0.22]]) r.ball(r.M.matte, C.leaf, u + du * s, dy * s, d + dd * s, rr * s, 0.9, 6);
}

/** A pendant lamp: cord, shade, the glowing bulb under it. */
function pendant(r, u, d, y, col) {
  r.rod(r.M.metal, C.dark, [u, y + 0.2, d], [u, H, d], 0.005, 3);
  r.cyl(r.M.satin, col, u, y, d, 0.24, 0.22, 12, 0.07);
  r.ball(r.M.glow, C.light, u, y + 0.02, d, 0.08, 0.6, 6);
}

/** A sofa facing the glass, its back toward the back wall, centred on u at depth d. */
function sofa(r, u, d, w, col) {
  const { M } = r;
  r.box(M.fabric, col, u - w / 2, 0.12, d - 0.45, u + w / 2, 0.45, d + 0.45);
  r.box(M.fabric, col, u - w / 2, 0.45, d + 0.22, u + w / 2, 0.9, d + 0.45);
  for (const s of [-1, 1]) r.box(M.fabric, col, u + s * w / 2 - (s > 0 ? 0.18 : 0), 0.12, d - 0.45, u + s * w / 2 + (s > 0 ? 0 : 0.18), 0.62, d + 0.45);
  for (let i = 0; i < 3; i++) { const cu = u - w / 3 + i * w / 3; r.box(M.fabric, C.cream, cu - w / 6 + 0.04, 0.45, d - 0.4, cu + w / 6 - 0.04, 0.55, d + 0.2); }
  r.box(M.satin, C.walnut, u - w / 2, 0, d - 0.42, u + w / 2, 0.12, d + 0.42);
}

/** A table on four legs: top at y, w along u, depth `dp`. */
function table(r, u, d, w, dp, y, top, legs = C.walnut) {
  const { M } = r;
  r.box(M.satin, top, u - w / 2, y - 0.04, d - dp / 2, u + w / 2, y, d + dp / 2);
  for (const su of [-1, 1]) for (const sd of [-1, 1]) r.box(M.satin, legs, u + su * (w / 2 - 0.08) - 0.025, 0, d + sd * (dp / 2 - 0.08) - 0.025, u + su * (w / 2 - 0.08) + 0.025, y - 0.04, d + sd * (dp / 2 - 0.08) + 0.025);
}

/** A chair at (u, d), its back on the side `s` (+1: toward the back wall). */
function chair(r, u, d, s, col) {
  const { M } = r;
  r.box(M.satin, col, u - 0.21, 0.42, d - 0.2, u + 0.21, 0.47, d + 0.2);
  r.box(M.satin, col, u - 0.21, 0.47, d + s * 0.17, u + 0.21, 0.9, d + s * 0.21);
  for (const su of [-1, 1]) for (const sd of [-1, 1]) r.box(M.satin, C.walnut, u + su * 0.17 - 0.02, 0, d + sd * 0.16 - 0.02, u + su * 0.17 + 0.02, 0.42, d + sd * 0.16 + 0.02);
}

const SHOPS = {
  /** Hikari Sports: a shoe wall at the back, jerseys on a rail, a bin of balls, a bench to try shoes on. */
  sports(r) {
    const { M, x0, x1 } = r, rnd = mulberry32(31);
    shell(r, M.woodFloor, lin('#eef3f6'));
    r.face(M.matte, C.teal, (x0 + x1) / 2, DEPTH - 0.02, x1 - x0 - 0.3, 2.6, 2.9);
    wallShelves(r, x0 + 0.6, x1 - 3.2, DEPTH - 0.02, [0.45, 0.9, 1.35, 1.8], C.white, (u, y, w) => {
      for (let k = 0; k < Math.floor(w / 0.36); k++) {
        const c = rnd.pick(BRIGHT), cu = u + 0.18 + k * 0.36;
        for (const s of [-1, 1]) r.box(M.satin, c, cu + s * 0.06 - 0.05, y, DEPTH - 0.32, cu + s * 0.06 + 0.05, y + 0.1, DEPTH - 0.08);
      }
    });
    rail(r, x1 - 2.8, x1 - 0.6, 2.9, 1.45, [C.teal, C.navy, C.red, C.white, C.yellow, C.blue], rnd, 0.65);
    // A wire bin of balls by the glass, a low bench to try shoes on.
    const bu = x0 + 2.2;
    r.cyl(M.metal, C.steel, bu, 0, 1.3, 0.55, 0.5, 14);
    r.cyl(M.matte, C.dark, bu, 0.48, 1.3, 0.5, 0.02, 14);
    [[0, 0, C.orange], [0.25, 0.2, C.white], [-0.25, 0.15, C.yellow], [0.1, -0.25, C.orange], [-0.15, -0.2, C.white]].forEach(([du, dd, c], i) => r.ball(M.satin, c, bu + du, 0.62 + (i % 2) * 0.1, 1.3 + dd, 0.12, 1, 6));
    r.box(M.fabric, C.navy, x0 + 4.0, 0.1, 1.8, x0 + 6.2, 0.42, 2.2);
    r.box(M.metal, C.steel, x0 + 4.05, 0, 1.85, x0 + 6.15, 0.1, 2.15);
    plant(r, x1 - 0.6, 0.7);
  },
  /** Living & Home: a sofa on a rug before shelves of homeware, a coffee table, lamps. */
  home(r) {
    const { M, x0, x1 } = r, rnd = mulberry32(37), mu = (x0 + x1) / 2;
    shell(r, M.woodFloor, lin('#f3ece0'));
    r.box(M.matte, lin('#c9b79c'), mu - 2.2, 0.006, 1.2, mu + 2.2, 0.012, 3.4);
    sofa(r, mu, 2.9, 2.4, lin('#8fa58a'));
    table(r, mu, 1.9, 1.2, 0.6, 0.42, C.oak);
    r.cyl(M.gloss, C.white, mu - 0.3, 0.42, 1.9, 0.07, 0.12, 10);
    wallShelves(r, x0 + 0.5, mu - 2.6, DEPTH - 0.02, [0.5, 1.1, 1.7], C.oak, (u, y, w) => {
      for (let cu = u + 0.12; cu < u + w - 0.1; cu += 0.32) {
        if (rnd() < 0.5) r.cyl(M.gloss, rnd.pick([C.cream, C.teal, C.white, C.blush]), cu, y, DEPTH - 0.22, 0.07, 0.18 + rnd() * 0.14, 10, 0.05);
        else r.box(M.satin, rnd.pick([C.oak, C.cream, C.walnut, C.white]), cu - 0.11, y, DEPTH - 0.32, cu + 0.11, y + 0.16, DEPTH - 0.12);
      }
    });
    wallShelves(r, mu + 2.6, x1 - 0.5, DEPTH - 0.02, [0.5, 1.1, 1.7], C.oak, (u, y, w) => {
      for (let cu = u + 0.1; cu < u + w - 0.1; cu += 0.2) r.box(M.fabric, rnd.pick([C.cream, C.blush, C.sky, C.white]), cu - 0.08, y, DEPTH - 0.34, cu + 0.08, y + 0.08 + rnd() * 0.08, DEPTH - 0.1);
    });
    // A floor lamp by the sofa, pendants over the rug.
    r.rod(M.metal, C.dark, [mu + 1.6, 0, 3.0], [mu + 1.6, 1.5, 3.0], 0.015);
    r.cyl(M.satin, C.cream, mu + 1.6, 1.4, 3.0, 0.22, 0.28, 12, 0.15);
    for (const du of [-1.2, 1.2]) pendant(r, mu + du, 1.6, 2.2, C.cream);
    plant(r, x0 + 0.6, 0.7);
    plant(r, x1 - 0.6, 0.7, 0.8);
  },
  /** Kids Park: a play mat with big soft blocks, racks of small clothes, toy shelves, a plush bear. */
  kids(r) {
    const { M, x0, x1 } = r, rnd = mulberry32(41), mu = (x0 + x1) / 2;
    shell(r, M.woodFloor, lin('#fdf4e3'));
    r.face(M.matte, C.yellow, mu, DEPTH - 0.02, x1 - x0 - 0.3, 2.3, 2.5);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) r.box(M.matte, KIDS[(i + k) % KIDS.length], mu - 2 + i, 0.006, 0.9 + k, mu - 1 + i, 0.014, 1.9 + k);
    [[-1.4, 1.3, 0.3], [-0.9, 1.5, 0.22], [0.8, 2.2, 0.34], [1.3, 1.4, 0.26]].forEach(([du, d, s], i) => r.box(M.satin, KIDS[i * 2], mu + du - s, 0.01, d - s, mu + du + s, 0.01 + s * 1.6, d + s));
    rail(r, x0 + 0.6, x0 + 3.4, 2.7, 1.1, KIDS, rnd, 0.45);
    rail(r, x1 - 3.4, x1 - 0.6, 2.7, 1.1, KIDS, rnd, 0.45);
    wallShelves(r, mu - 2.2, mu + 2.2, DEPTH - 0.02, [0.5, 1.0, 1.5], C.white, (u, y, w) => {
      for (let cu = u + 0.15; cu < u + w - 0.12; cu += 0.3) r.box(M.satin, rnd.pick(KIDS), cu - 0.12, y, DEPTH - 0.32, cu + 0.12, y + 0.18 + rnd() * 0.12, DEPTH - 0.12);
    });
    // A plush bear on the mat.
    const fur = lin('#c98a4b'), bu = mu + 0.1, bd = 2.6;
    r.ball(M.matte, fur, bu, 0.32, bd, 0.32, 1, 8);
    r.ball(M.matte, fur, bu, 0.78, bd, 0.22, 0.95, 8);
    for (const s of [-1, 1]) { r.ball(M.matte, fur, bu + s * 0.17, 0.97, bd, 0.08, 1, 6); r.ball(M.matte, fur, bu + s * 0.26, 0.35, bd - 0.1, 0.1, 1.4, 6); }
    r.ball(M.matte, C.cream, bu, 0.74, bd - 0.19, 0.08, 0.8, 6);
  },
  /** basics wear: rails along the side walls, tables of folded stacks, cubes of folded goods at the back. */
  wear(r) {
    const { M, x0, x1 } = r, rnd = mulberry32(43), mu = (x0 + x1) / 2;
    shell(r, M.woodFloor, lin('#f4f2ee'));
    rail(r, x0 + 0.6, x0 + 3.6, 1.6, 1.5, GARMENTS, rnd);
    rail(r, x1 - 3.6, x1 - 0.6, 1.6, 1.5, GARMENTS, rnd);
    for (const du of [-1.1, 1.1]) {
      table(r, mu + du, 1.5, 1.6, 0.8, 0.75, C.white, C.white);
      for (let k = 0; k < 4; k++) stack(r, mu + du - 0.6 + k * 0.4, 0.75, 1.5, 0.32, 2 + (k % 3), rnd.pick(GARMENTS));
    }
    wallShelves(r, x0 + 0.5, x1 - 0.5, DEPTH - 0.02, [0.4, 0.8, 1.2, 1.6, 2.0], C.white, (u, y, w) => {
      for (let cu = u + 0.2; cu < u + w - 0.15; cu += 0.36) stack(r, cu, y, DEPTH - 0.22, 0.3, 3, rnd.pick(GARMENTS));
    });
  },
  /** Hair Salon Rin: styling chairs before mirrors along the back, a reception counter, a sofa to wait on. */
  salon(r) {
    const { M, x0, x1 } = r, mu = (x0 + x1) / 2;
    shell(r, M.woodFloor, lin('#f8eef0'));
    for (let i = 0; i < 4; i++) {
      const u = x0 + 1.4 + i * 1.9;
      if (u > x1 - 2.8) break;
      r.box(M.satin, C.white, u - 0.6, 0, DEPTH - 0.45, u + 0.6, 0.8, DEPTH - 0.02);
      r.box(M.metal, C.gold, u - 0.48, 0.92, DEPTH - 0.05, u + 0.48, 2.13, DEPTH - 0.03);
      r.face(M.mirror, C.white, u, DEPTH - 0.055, 0.9, 0.95, 2.1);
      // The chair: a chrome foot, a seat and back in pink leather.
      r.cyl(M.chrome, C.steel, u, 0, DEPTH - 1.1, 0.26, 0.04, 14);
      r.cyl(M.chrome, C.steel, u, 0.04, DEPTH - 1.1, 0.05, 0.36, 8);
      r.box(M.satin, C.pink, u - 0.26, 0.4, DEPTH - 1.35, u + 0.26, 0.52, DEPTH - 0.85);
      r.box(M.satin, C.pink, u - 0.24, 0.52, DEPTH - 0.92, u + 0.24, 1.15, DEPTH - 0.82);
      pendant(r, u, DEPTH - 1.1, 2.3, C.blush);
    }
    r.box(M.satin, C.white, x1 - 2.4, 0, 0.9, x1 - 0.8, 1.0, 1.4);
    r.box(M.satin, C.oak, x1 - 2.45, 1.0, 0.85, x1 - 0.75, 1.04, 1.45);
    r.box(M.gloss, C.dark, x1 - 1.9, 1.04, 1.25, x1 - 1.5, 1.3, 1.29);
    sofa(r, x1 - 1.6, 3.2, 1.4, C.blush);
    plant(r, mu, 0.7, 0.9);
  },
  /** Nordic Living: a dining set under pendants, a sideboard, an armchair, a rug, plants. */
  home2(r) {
    const { M, x0, x1 } = r, rnd = mulberry32(47), mu = (x0 + x1) / 2;
    shell(r, M.woodFloor, lin('#eef0ec'));
    r.face(M.matte, lin('#9fb4a6'), mu - 2.5, DEPTH - 0.02, 5, 0, H);
    table(r, mu - 2.5, 2.0, 1.8, 0.9, 0.74, C.oak, C.oak);
    for (const du of [-0.5, 0.5]) { chair(r, mu - 2.5 + du, 2.75, 1, C.cream); chair(r, mu - 2.5 + du, 1.25, -1, C.cream); }
    for (const du of [-0.5, 0.5]) pendant(r, mu - 2.5 + du, 2.0, 1.85, C.white);
    r.box(M.satin, C.walnut, mu + 0.6, 0, DEPTH - 0.5, mu + 2.8, 0.75, DEPTH - 0.04);
    for (let k = 0; k < 3; k++) r.cyl(M.gloss, rnd.pick([C.white, C.teal, C.cream]), mu + 1.0 + k * 0.5, 0.75, DEPTH - 0.27, 0.07, 0.2 + k * 0.08, 10, 0.05);
    r.box(M.matte, lin('#d9cfc0'), mu + 3.4, 0.006, 1.1, mu + 5.8, 0.012, 3.1);
    sofa(r, mu + 4.6, 2.6, 1.0, lin('#c9a227'));
    r.cyl(M.satin, C.oak, mu + 3.7, 0, 1.7, 0.25, 0.48, 14);
    plant(r, x0 + 0.6, 3.2, 1.3);
    plant(r, x1 - 0.6, 3.2, 1.2);
  },
};

/** Build a furnished room behind an upper shop's glass. */
export function upperShop(b, M, kind, x0, x1, z, f) {
  SHOPS[kind](roomFrame(b, M, x0, x1, z, f));
}

/**
 * A front closed off: a roll shutter pulled down behind the glass line (its
 * slats, the bottom bar and handle, a notice taped on), or a "coming soon"
 * hoarding with the shop's name — both at the glass line, whole width.
 */
export function closedFront(b, M, signs, kind, x0, x1, z, f, how) {
  const r = roomFrame(b, M, x0, x1, z, f), w = x1 - x0 - 0.4, mu = (x0 + x1) / 2;
  if (how === 'shutter') {
    // The curtain, a rib every 9 cm: the slats read from across the atrium.
    r.box(M.metal, C.steel, x0 + 0.2, 0.12, 0.03, x1 - 0.2, H, 0.05);
    for (let y = 0.2; y < H - 0.05; y += 0.09) r.box(M.metal, C.grey, x0 + 0.2, y, 0.022, x1 - 0.2, y + 0.016, 0.03);
    r.box(M.metal, C.frame, x0 + 0.2, 0.02, 0.0, x1 - 0.2, 0.12, 0.06);
    for (const du of [-1.5, 1.5]) r.box(M.metal, C.dark, mu + du - 0.12, 0.13, -0.01, mu + du + 0.12, 0.17, 0.02);
    r.face(signs.print, C.white, mu, -0.005, 0.6, 1.2, 1.95, [0, f], signs.rect('closedToday'));
  } else {
    r.box(M.matte, C.white, x0 + 0.2, 0, 0.02, x1 - 0.2, H, 0.08);
    r.face(signs.material, C.white, mu, -0.004, Math.min(w - 0.6, 6), 0.7, 0.7 + Math.min(w - 0.6, 6) / signs.aspect(`soon:${kind}`), [0, f], signs.rect(`soon:${kind}`));
  }
}
