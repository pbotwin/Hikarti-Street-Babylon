import { Mesh, TransformNode, VertexData } from '@babylonjs/core';
import { C, planter } from './MallKit.js';
import {
  BOUTIQUE, SECTION, FLOOR_RACKS, RAIL, WALL_RACKS, SHOE_WALL, MIRROR_WALL, FITTING, TILL, WINDOW_STAGES, STAGE,
} from './MallPlan.js';

/**
 * Sakura Style, the clothing store: chrome floor rails and wall rails (the
 * racks), the shoe wall, the mirror wall, window stages with mannequins,
 * three fitting rooms with curtains and mirrors, and the till. Racks are
 * empty: MallFashion hangs the clothes on the layout's hooks. Each fitting
 * room's curtain hangs from its own node (named in the layout): at its
 * rail's west end, the fabric running along +x; MallFashion draws it by
 * scaling x (1 closed, ~0.15 drawn back).
 */
export function buildBoutique(site, mats, signs) {
  const { cast, still } = site.zone('boutique');
  const M = mats;

  // Floor rails: an H frame, one rail.
  for (const [, x, z] of FLOOR_RACKS) {
    const h = RAIL.len / 2;
    for (const dx of [-h, h]) {
      cast.rod(M.chrome, C.steel, [x + dx, 0.03, z - 0.28], [x + dx, 0.03, z + 0.28], 0.018);
      cast.rod(M.chrome, C.steel, [x + dx, 0.03, z], [x + dx, RAIL.y, z], 0.016);
    }
    cast.rod(M.chrome, C.steel, [x - h - 0.04, RAIL.y, z], [x + h + 0.04, RAIL.y, z], 0.014);
    site.collide(x - h - 0.05, z - 0.3, x + h + 0.05, z + 0.3, 0, RAIL.y);
  }

  // Wall rails on the east wall: standards, brackets, one long rail, a display shelf above.
  const W = WALL_RACKS, wx = BOUTIQUE.x1, z1 = W.z0 + W.len * W.sets.reduce((n, [, k]) => n + k, 0);
  for (let z = W.z0; z <= z1 + 1e-6; z += W.len) {
    cast.box(M.metal, C.frame, wx - 0.03, 0.3, z - 0.02, wx, 2.5, z + 0.02);
    cast.rod(M.chrome, C.steel, [wx - 0.02, W.y, z], [W.x, W.y, z], 0.012);
    cast.box(M.metal, C.frame, wx - 0.4, 2.12, z - 0.015, wx - 0.03, 2.16, z + 0.015);
  }
  cast.rod(M.chrome, C.steel, [W.x, W.y, W.z0], [W.x, W.y, z1], 0.014);
  cast.box(M.gloss, C.snow, wx - 0.42, 2.16, W.z0, wx - 0.03, 2.19, z1);
  site.collide(W.x - 0.3, W.z0, wx, z1, 0, 2.2);

  // Shoe wall: open shelves on a blush back panel.
  const S = SHOE_WALL, sx1 = S.x0 + S.n * SECTION, back = BOUTIQUE.z1;
  cast.box(M.satin, C.blush, S.x0, 0, back - 0.03, sx1, 2.1, back);
  for (const y of S.levels) cast.box(M.gloss, C.snow, S.x0, y - 0.025, back - S.depth, sx1, y, back - 0.03);
  for (let k = 0; k <= S.n; k++) cast.box(M.gloss, C.snow, S.x0 + k * SECTION - 0.02, 0, back - S.depth, S.x0 + k * SECTION + 0.02, 2.1, back - 0.03);
  cast.box(M.satin, C.dark, S.x0, 0, back - S.depth + 0.03, sx1, S.levels[0] - 0.025, back - 0.03);
  site.collide(S.x0, back - S.depth, sx1, back, 0, 2.1);

  // Mirror wall.
  const MW = MIRROR_WALL, mz = BOUTIQUE.z1;
  still.panel(M.mirror, C.white, (MW.x0 + MW.x1) / 2, mz - 0.02, [0, -1], MW.x1 - MW.x0, 0.15, 2.6);
  cast.box(M.metal, C.frame, MW.x0 - 0.05, 0.1, mz - 0.04, MW.x1 + 0.05, 0.15, mz);
  cast.box(M.metal, C.frame, MW.x0 - 0.05, 2.6, mz - 0.04, MW.x1 + 0.05, 2.65, mz);
  for (let x = MW.x0; x <= MW.x1 + 1e-6; x += (MW.x1 - MW.x0) / 6) cast.box(M.metal, C.frame, x - 0.025, 0.15, mz - 0.04, x + 0.025, 2.6, mz);
  // A cheval mirror among the racks.
  const cm = { x: 19.6, z: 24.2 };
  still.panel(M.mirror, C.white, cm.x, cm.z - 0.03, [0, -1], 0.6, 0.25, 1.85);
  cast.box(M.satin, C.oak, cm.x - 0.34, 0.2, cm.z - 0.02, cm.x + 0.34, 1.9, cm.z + 0.03);
  cast.box(M.satin, C.oak, cm.x - 0.3, 0, cm.z - 0.3, cm.x + 0.3, 0.05, cm.z + 0.3);
  site.collide(cm.x - 0.35, cm.z - 0.3, cm.x + 0.35, cm.z + 0.3, 0, 1.9);

  // Window stages with mannequins facing the hall; posters.
  for (const st of WINDOW_STAGES) {
    cast.box(M.gloss, C.snow, st.x0, 0, STAGE.z0, st.x1, STAGE.h, STAGE.z1);
    site.collide(st.x0, STAGE.z0, st.x1, STAGE.z1, 0, STAGE.h);
    for (const x of st.mannequins) mannequin(cast, M, x, (STAGE.z0 + STAGE.z1) / 2, STAGE.h);
  }
  still.panel(signs.material, C.white, BOUTIQUE.x0 + 0.02, 22.5, [1, 0], 1.0, 1.0, 2.5, signs.rect('season'));
  still.panel(signs.material, C.white, 15.4, BOUTIQUE.z0 + 2.6, [0, -1], 0.8, 0.9, 2.1, signs.rect('sale'));
  still.panel(signs.material, C.white, 15.4, BOUTIQUE.z0 + 2.62, [0, 1], 0.8, 0.9, 2.1, signs.rect('sale'));
  cast.box(M.metal, C.frame, 15.0, 0, BOUTIQUE.z0 + 2.55, 15.8, 0.04, BOUTIQUE.z0 + 2.67);
  site.collide(15.0, BOUTIQUE.z0 + 2.55, 15.8, BOUTIQUE.z0 + 2.67, 0, 2.1, { camera: false });

  // Display tables with flowers, a bench by the fitting rooms, plants in the corners.
  for (const x of [27, 31.5, 36]) {
    const z = 24.1;
    cast.box(M.satin, C.oak, x - 0.8, 0.72, z - 0.4, x + 0.8, 0.76, z + 0.4);
    for (const [dx, dz] of [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]) cast.box(M.metal, C.snow, x + dx - 0.02, 0, z + dz - 0.02, x + dx + 0.02, 0.72, z + dz + 0.02);
    cast.cylinder(M.gloss, C.snow, x + 0.45, 0.76, z, 0.08, 0.22, 12, 0.06);
    cast.sphere(M.matte, C.pink, x + 0.45, 1.06, z, 0.13, 0.8, 8);
    site.collide(x - 0.8, z - 0.4, x + 0.8, z + 0.4, 0, 0.76);
  }
  cast.box(M.satin, C.blush, 9, 0.12, 23.6, 11.6, 0.45, 24.2);
  cast.box(M.metal, C.frame, 9.1, 0, 23.65, 11.5, 0.12, 24.15);
  site.collide(9, 23.6, 11.6, 24.2, 0, 0.45, { camera: false });
  for (const [x, z] of [[38.9, 11.3], [6.7, 22.5]]) {
    planter(cast, M, x, z, 0.4, 0.45);
    site.collide(x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0, 0.45, { camera: false });
  }

  till(site, cast, still, M, signs);
  const curtains = fittingRooms(site, cast, still, M, signs);
  return curtains;
}

/** A display mannequin (abstract, gloss white) standing at (x, z) on a floor at y, facing the hall. */
function mannequin(b, M, x, z, y) {
  const w = C.snow;
  b.cylinder(M.metal, C.steel, x, y, z, 0.2, 0.02, 20);
  b.cylinder(M.metal, C.steel, x, y, z - 0.05, 0.012, 0.7, 6);
  for (const dx of [-0.09, 0.09]) b.cylinder(M.gloss, w, x + dx, y + 0.03, z, 0.05, 0.85, 10, 0.075);
  b.sphere(M.gloss, w, x, y + 0.95, z, 0.17, 0.75, 12);
  b.cylinder(M.gloss, w, x, y + 0.95, z, 0.15, 0.45, 14, 0.19);
  b.sphere(M.gloss, w, x, y + 1.38, z, 0.2, 0.55, 12);
  b.cylinder(M.gloss, w, x, y + 1.42, z, 0.045, 0.14, 8);
  b.sphere(M.gloss, w, x, y + 1.66, z - 0.01, 0.105, 1.25, 12);
  for (const s of [-1, 1]) b.rod(M.gloss, w, [x + s * 0.2, y + 1.4, z], [x + s * 0.27, y + 0.86, z - 0.04], 0.04, 8);
}

/** The till: a counter with register and screen, a back shelf for bags, the logo behind. */
function till(site, cast, still, M, signs) {
  const T = TILL, mid = (T.z0 + T.z1) / 2;
  cast.box(M.gloss, C.snow, T.x0, 0.08, T.z0, T.x1, T.h - 0.04, T.z1);
  cast.box(M.satin, C.dark, T.x0 + 0.04, 0, T.z0 + 0.04, T.x1 - 0.04, 0.08, T.z1 - 0.04);
  still.panel(M.satin, C.pink, T.x1 + 0.002, mid, [1, 0], T.z1 - T.z0, 0.2, T.h - 0.12);
  cast.box(M.satin, C.oak, T.x0 - 0.04, T.h - 0.04, T.z0 - 0.04, T.x1 + 0.04, T.h, T.z1 + 0.04);
  const rz = 17.4, rx = (T.x0 + T.x1) / 2;
  cast.box(M.gloss, C.dark, rx - 0.2, T.h, rz - 0.18, rx + 0.12, T.h + 0.08, rz + 0.18);
  cast.box(M.gloss, C.dark, rx - 0.2, T.h + 0.08, rz - 0.02, rx - 0.16, T.h + 0.3, rz + 0.02);
  cast.box(M.gloss, C.dark, rx - 0.24, T.h + 0.28, rz - 0.2, rx - 0.2, T.h + 0.52, rz + 0.2);
  still.panel(signs.material, C.white, rx - 0.245, rz, [-1, 0], 0.36, T.h + 0.3, T.h + 0.5, signs.rect('screen'));
  site.collide(T.x0 - 0.04, T.z0 - 0.04, T.x1 + 0.04, T.z1 + 0.04, 0, T.h);
  // Back shelf (bags, tissue) and the shop's name on the pink wall behind.
  const bx = BOUTIQUE.x0;
  still.panel(M.satin, C.pink, bx + 0.012, mid, [1, 0], T.z1 - T.z0 + 1.6, 0, 3.2);
  for (const y of [0.9, 1.35, 1.8]) cast.box(M.satin, C.oak, bx, y - 0.03, T.z0 - 0.4, bx + 0.42, y, T.z1 + 0.4);
  for (const z of [T.z0 - 0.4, T.z1 + 0.4]) cast.box(M.satin, C.oak, bx, 0, z - 0.02, bx + 0.42, 1.8, z + 0.02);
  still.panel(signs.material, C.white, bx + 0.015, mid, [1, 0], 3.6, 2.2, 2.82, signs.rect('style'));
  site.collide(bx, T.z0 - 0.42, bx + 0.42, T.z1 + 0.42, 0, 1.8);
}

/**
 * Three fitting rooms in a row: partitions, a front wall with a curtained
 * doorway each, a mirror, a hook, a bench and a light inside; the sign
 * above. Returns the curtain nodes (and the meshes they carry).
 */
function fittingRooms(site, cast, still, M, signs) {
  const F = FITTING, half = F.w / 2, fz = F.front, t = 0.06;
  const x0 = F.xs[0] - half - 0.1, x1 = F.xs[F.xs.length - 1] + half + 0.1;
  // Partitions between and beside the rooms, the front wall either side of each doorway.
  for (const x of [x0, ...F.xs.slice(1).map((c) => c - half - 0.05), x1 - 0.1]) {
    cast.box(M.gloss, C.snow, x, 0, fz, x + 0.1, F.wallH, F.back);
    site.collide(x, fz, x + 0.1, F.back, 0, F.wallH);
  }
  for (const c of F.xs) {
    for (const [a, b] of [[c - half - 0.05, c - F.open / 2], [c + F.open / 2, c + half + 0.05]]) {
      cast.box(M.gloss, C.snow, a, 0, fz - t / 2, b, F.wallH, fz + t / 2);
      site.collide(a, fz - t / 2, b, fz + t / 2, 0, F.wallH);
    }
    cast.box(M.gloss, C.snow, c - F.open / 2, F.rail + 0.06, fz - t / 2, c + F.open / 2, F.wallH, fz + t / 2);
    // Inside: mirror with a light over it, the hook, a bench.
    still.panel(M.mirror, C.white, c, F.back - 0.035, [0, -1], 0.7, 0.4, 2.05);
    cast.box(M.metal, C.frame, c - 0.38, 0.36, F.back - 0.03, c + 0.38, 2.09, F.back - 0.01);
    still.box(M.glow, C.light, c - 0.35, 2.12, F.back - 0.06, c + 0.35, 2.16, F.back - 0.02);
    cast.rod(M.chrome, C.steel, [c + half - 0.02, 1.75, fz + 0.75], [c + half - 0.12, 1.78, fz + 0.75], 0.01);
    cast.box(M.satin, C.oak, c - half + 0.02, 0.42, fz + 1.1, c - half + 0.42, 0.46, F.back - 0.1);
    cast.box(M.metal, C.frame, c - half + 0.05, 0, fz + 1.15, c - half + 0.39, 0.42, F.back - 0.15);
    still.rod(M.chrome, C.steel, [c - F.open / 2 - 0.04, F.rail, fz], [c + F.open / 2 + 0.04, F.rail, fz], 0.012);
  }
  still.panel(signs.material, C.white, (x0 + x1) / 2, fz - t / 2 - 0.01, [0, -1], 2.6, F.wallH + 0.05, F.wallH + 0.62, signs.rect('fitting'));
  still.box(M.gloss, C.snow, x0, F.wallH, fz - t / 2, x1, F.wallH + 0.04, fz + t / 2);

  // Curtains: one pleated fabric shared by all three (instances), each on its own node.
  const fabric = new Mesh('mall:curtain', site.scene);
  pleats(F.open, F.rail - 0.08).applyToMesh(fabric);
  fabric.material = M.fabric;
  fabric.isPickable = false;
  fabric.receiveShadows = true;
  const nodes = F.xs.map((c, i) => {
    const node = new TransformNode(`mallCurtain${i + 1}`, site.scene);
    node.parent = site.root;
    node.position.set(c - F.open / 2, 0, fz - 0.02);
    const m = i === 0 ? fabric : fabric.createInstance(`mall:curtain${i + 1}`);
    m.parent = node;
    return { node, mesh: m };
  });
  return { nodes: nodes.map((n) => n.node), meshes: nodes.map((n) => n.mesh) };
}

/** Pleated curtain fabric: w wide along +x, hanging from y top to just off the floor, waved in z. */
function pleats(w, top) {
  const n = 28, positions = [], normals = [], uvs = [], indices = [], colors = [];
  const col = C.navy.add(C.pink).scale(0.5);
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = u * w, z = Math.sin(u * Math.PI * 14) * 0.035;
    const nz = Math.cos(u * Math.PI * 14);
    for (const y of [0.04, top]) {
      positions.push(x, y, z);
      const l = Math.hypot(-nz * 0.5, 1);
      normals.push(-nz * 0.5 / l, 0, 1 / l);
      uvs.push(u, y / top);
      colors.push(col.r, col.g, col.b, 1);
    }
    if (i < n) { const b = i * 2; indices.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
  }
  return Object.assign(new VertexData(), { positions, normals, uvs, indices, colors });
}
