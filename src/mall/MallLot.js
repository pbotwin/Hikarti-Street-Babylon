import { LoadAssetContainerAsync, PBRMaterial, Quaternion } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { C, planter, shrub } from './MallKit.js';
import {
  SITE, BUILDING, ASPHALT, SIDEWALK, WALKWAY, END_ISLAND, ISLAND_SPANS, EXIT_ROAD, DRIVES, ROWS, BAY, KERB_H, LANE_X,
  CART_RETURN, ACCESSIBLE_BAYS, ENTRANCES,
} from './MallPlan.js';
import { writeTRS } from '../world/Instances.js';
import { simplifierReady, simplifyGeometry } from '../core/Simplify.js';
import { MallCars } from './MallCars.js';
import { mulberry32 } from '../world/rng.js';
import { CelLighting } from '../world/CelLighting.js';

/**
 * Hikari Mall's grounds: the parking lot (asphalt, painted bays, crossings,
 * arrows, raised walkway and planted end islands), the sidewalk with its
 * bollards and planters, lamp posts, trees, the cart return, parked cars
 * (MallCars), the hedge round the site, the exit road out and the pylon
 * sign by it, and the fields beyond. Trees are thin instances of one model.
 */
// Paint over the asphalt (and the accessible bays 4 mm under it): thinner
// layers z-fought across the lot from the far rows.
const PAINT_Y = 0.008;
const FAR = 420;               // the fields reach the fog
const _q = new Quaternion();

/** `indoorTrees`: more trees ([x, z, scale]) for the building's planters, as instances of the same tree. */
export async function buildLot(site, mats, signs, vehicles, indoorTrees = []) {
  const { cast, still } = site.zone('lot');
  const M = mats;

  // ---------------------------------------------------------------- ground
  const cx = (SITE.x0 + SITE.x1) / 2, cz = (SITE.z0 + SITE.z1) / 2;
  still.flat(M.grass, C.white, cx - FAR, cz - FAR, cx + FAR, cz + FAR, -0.04);
  still.flat(M.asphalt, C.white, ASPHALT.x0, ASPHALT.z0, ASPHALT.x1, ASPHALT.z1, 0);
  still.flat(M.asphalt, C.white, EXIT_ROAD.x0, cz - FAR, EXIT_ROAD.x1, ASPHALT.z0, 0);
  still.flat(M.paving, C.white, SIDEWALK.x0, SIDEWALK.z0, SIDEWALK.x1, SIDEWALK.z1, 0.02);
  still.flat(M.matte, C.yellow, SIDEWALK.x0, SIDEWALK.z0, SIDEWALK.x1, SIDEWALK.z0 + 0.12, 0.024);
  // Raised walkway through the rows, planted islands at the row ends.
  for (const [z0, z1] of ISLAND_SPANS) {
    cast.box(M.paving, C.white, WALKWAY.x0, 0, z0, WALKWAY.x1, KERB_H, z1);
    site.collide(WALKWAY.x0, z0, WALKWAY.x1, z1, 0, KERB_H, { camera: false });
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? END_ISLAND.x0 : -END_ISLAND.x1, x1 = s > 0 ? END_ISLAND.x1 : -END_ISLAND.x0;
      cast.box(M.matte, C.concrete, x0, 0, z0, x1, KERB_H, z1);
      still.flat(M.grass, C.white, x0 + 0.15, z0 + 0.15, x1 - 0.15, z1 - 0.15, KERB_H + 0.008);
      for (const z of [z0 + 1.6, z1 - 1.6]) shrub(cast, M, (x0 + x1) / 2, KERB_H, z, 0.65, C.yellow);
      site.collide(x0, z0, x1, z1, 0, KERB_H, { camera: false });
    }
  }
  paint(still, M, signs);

  // ---------------------------------------------------------------- lamps, bollards, planters, hedge
  const lamps = [];
  for (const z of [-19.2, -36.6, -51.4]) {
    lamps.push([1.4, z], [-1.4, z]);
    for (const s of [-1, 1]) lamps.push([s * (END_ISLAND.x0 + END_ISLAND.x1) / 2, z]);
  }
  const sidewalkLamps = [-34, -20, 20, 34].map((x) => [x, SIDEWALK.z0 + 0.5]);
  lamps.push(...sidewalkLamps);
  for (const s of [-1, 1]) for (const z of [-12, -30, -46]) lamps.push([s * (LANE_X + 4.3), z]);
  for (const [x, z] of lamps) lamp(cast, still, M, x, z, Math.abs(x) > LANE_X ? -Math.sign(x) : 0);
  for (const [x, z] of lamps) site.collide(x - 0.12, z - 0.12, x + 0.12, z + 0.12, 0, 7.5, { camera: false });
  sidewalkLamps.forEach(([x, z], i) => banners(cast, still, M, signs, x, z, i));

  const crossings = [-26.4, -8.8, 0, 8.8, 26.4, ...ENTRANCES.map((e) => e.x)];
  for (let x = SIDEWALK.x0 + 1; x < SIDEWALK.x1 - 0.5; x += 3.6) {
    if (crossings.some((c) => Math.abs(c - x) < 2.2)) continue;
    const z = SIDEWALK.z0 + 0.35;
    cast.cylinder(M.satin, C.dark, x, 0, z, 0.09, 0.85, 10);
    still.cylinder(M.glow, C.light, x, 0.86, z, 0.07, 0.03, 10);
    site.collide(x - 0.1, z - 0.1, x + 0.1, z + 0.1, 0, 0.9, { camera: false });
  }
  const planters = [-36, -28, -16, 16, 28, 36].map((x) => [x, SIDEWALK.z0 + 2.4]);
  for (const [x, z] of planters) {
    planter(cast, M, x, z, 0.8, 0.5);
    site.collide(x - 0.8, z - 0.8, x + 0.8, z + 0.8, 0, 0.5, { camera: false });
  }
  hedge(site, cast, M);
  cartReturn(site, cast, still, M, signs);
  pylon(site, cast, still, M, signs);

  // ---------------------------------------------------------------- trees and parked cars
  const trees = [];
  for (const [z0, z1] of ISLAND_SPANS) for (const s of [-1, 1]) trees.push([s * (END_ISLAND.x0 + END_ISLAND.x1) / 2, (z0 + z1) / 2]);
  trees.push(...planters);
  for (let z = 6; z < SITE.z1 - 4; z += 9) for (const s of [-1, 1]) trees.push([s * 49, z]);
  for (let x = SITE.x0 + 6; x < EXIT_ROAD.x0 - 3; x += 10) trees.push([x, ASPHALT.z0 - 4.5]);
  const forest = await treeModel(site.scene, [trees, indoorTrees], site.root);
  const cars = new MallCars(site, vehicles);
  const all = forest.sets.flat();
  return {
    cars,
    meshes: [...all, ...cars.meshes],
    casters: [...all, ...cars.casters],
    // The trees outside: one set, so it can be switched off with the lot (MallVisibility); the indoor ones stay on.
    outdoorTrees: forest.sets[0],
    dispose: () => forest.container.dispose(),
  };
}

/** Bay lines, rear lines, crossings, arrows, accessible bays and the exit sign. */
function paint(b, M, signs) {
  const y = PAINT_Y, w = 0.1;
  for (const r of ROWS) {
    for (let k = 0; k <= BAY.cols; k++) {
      for (const s of [-1, 1]) {
        const x = s * (BAY.x0 + k * BAY.w);
        b.flat(M.matte, C.paintLine, x - w / 2, r.z0 + 0.15, x + w / 2, r.z1 - 0.15, y);
      }
    }
    // The line between nose-to-nose rows.
    const rear = r.nose < 0 ? r.z0 : r.z1;
    for (const s of [-1, 1]) b.flat(M.matte, C.paintLine, s > 0 ? BAY.x0 : -BAY.x0 - BAY.cols * BAY.w, rear - w / 2, s > 0 ? BAY.x0 + BAY.cols * BAY.w : -BAY.x0, rear + w / 2, y);
  }
  for (const d of DRIVES) {
    for (let x = WALKWAY.x0 + 0.2; x < WALKWAY.x1; x += 0.8) b.flat(M.matte, C.paintLine, x, d.z0 + 0.4, x + 0.45, d.z1 - 0.4, y);
    const zc = (d.z0 + d.z1) / 2;
    for (const x of [-30, 30]) arrow(b, signs, x, zc, y);
  }
  for (const a of ACCESSIBLE_BAYS) {
    b.flat(M.matte, C.blue, a.x - BAY.w / 2 + 0.1, a.z - BAY.d / 2 + 0.2, a.x + BAY.w / 2 - 0.1, a.z + BAY.d / 2 - 0.2, y - 0.004);
    b.face(signs.material, C.white, [a.x - 0.6, y, a.z - 0.6], [0, 0, 1.2], [1.2, 0, 0], signs.rect('accessible'));
  }
  // Lane centre line out of the site and EXIT painted at the road's start.
  for (let z = EXIT_ROAD.z1 - 2; z > EXIT_ROAD.z0 - 300; z -= 6) b.flat(M.matte, C.paintLine, (EXIT_ROAD.x0 + EXIT_ROAD.x1) / 2 - 0.06, z - 3, (EXIT_ROAD.x0 + EXIT_ROAD.x1) / 2 + 0.06, z, y);
}

/** A painted arrow on the asphalt pointing +x (traffic runs toward the exit side). */
function arrow(b, signs, x, z, y) {
  b.face(signs.material, C.white, [x - 1.2, y, z + 0.8], [0, 0, -1.6], [2.4, 0, 0], signs.rect('arrow'));
}

/** A lot light: pole, arm(s) and lit heads; `side` 0 = two arms, ±1 = one arm toward -x / +x. */
function lamp(cast, still, M, x, z, side) {
  const H = 7.2;
  cast.cylinder(M.metal, C.frame, x, 0, z, 0.11, H, 10, 0.07);
  cast.cylinder(M.satin, C.dark, x, 0, z, 0.2, 0.5, 10);
  const arms = side === 0 ? [-1, 1] : [side];
  for (const s of arms) {
    const hx = x + s * 1.3;
    cast.rod(M.metal, C.frame, [x, H - 0.1, z], [hx, H, z], 0.04, 6);
    cast.box(M.metal, C.frame, hx - 0.35, H - 0.08, z - 0.18, hx + 0.35, H + 0.06, z + 0.18);
    still.flat(M.glow, C.light, hx - 0.3, z - 0.14, hx + 0.3, z + 0.14, H - 0.085, true);
  }
}

/** A pair of the season's banners on a lamp post, on arms either side of it, printed both faces. */
function banners(cast, still, M, signs, x, z, i) {
  const ids = i % 2 ? ['halloween', 'autumn'] : ['autumn', 'halloween'];
  for (const [s, id] of [[-1, ids[0]], [1, ids[1]]]) {
    const bx = x + s * 0.4;
    for (const y of [3.35, 5.0]) cast.rod(M.metal, C.frame, [x, y, z], [x + s * 0.7, y, z], 0.015, 4);
    for (const f of [-1, 1]) still.panel(signs.material, C.white, bx, z + f * 0.006, [0, f], 0.55, 3.4, 4.95, signs.rect(id));
  }
}

/** Hedge round the site (a gap where the exit road leaves) and the invisible end of the road. */
function hedge(site, b, M) {
  const S = SITE, t = 0.8, h = 1.1;
  const runs = [
    [S.x0, S.z0, S.x0 + t, S.z1], [S.x1 - t, S.z0, S.x1, S.z1], [S.x0, S.z1 - t, S.x1, S.z1],
    [S.x0, S.z0, EXIT_ROAD.x0 - 0.6, S.z0 + t], [EXIT_ROAD.x1 + 0.6, S.z0, S.x1, S.z0 + t],
  ];
  for (const [x0, z0, x1, z1] of runs) {
    // Clipped: a darker body, a lighter top a little set in.
    b.box(M.matte, C.leaf, x0, 0, z0, x1, h - 0.12, z1);
    b.box(M.matte, C.leafLight, x0 + 0.06, h - 0.12, z0 + 0.06, x1 - 0.06, h, z1 - 0.06);
    site.collide(x0, z0, x1, z1, 0, h, { camera: false });
  }
  site.collide(EXIT_ROAD.x0 - 0.6, S.z0 - 0.4, EXIT_ROAD.x1 + 0.6, S.z0, 0, 2.5, { camera: false });
  // Behind the building the hedge would sit against the wall: a service yard wall instead.
  site.collide(BUILDING.x0, BUILDING.z1, BUILDING.x1, S.z1, 0, 2.5, { camera: false });
}

/** The cart return in its bay: side rails, a closed end, posts with the sign on top. */
function cartReturn(site, cast, still, M, signs) {
  const R = CART_RETURN, hw = R.w / 2, y = 0.95, H = 2.4;
  for (const s of [-1, 1]) {
    const x = R.x + s * hw;
    for (const yy of [y, 0.4]) cast.rod(M.chrome, C.steel, [x, yy, R.z0], [x, yy, R.z1], 0.025);
    for (const z of [R.z0, R.z1]) cast.cylinder(M.metal, C.green, x, 0, z, 0.045, H, 8);
    site.collide(x - 0.04, R.z0, x + 0.04, R.z1, 0, y);
  }
  cast.rod(M.chrome, C.steel, [R.x - hw, y, R.z1], [R.x + hw, y, R.z1], 0.025);
  site.collide(R.x - hw, R.z1 - 0.04, R.x + hw, R.z1 + 0.04, 0, y);
  cast.box(M.metal, C.green, R.x - hw - 0.05, H, R.z0 - 0.05, R.x + hw + 0.05, H + 0.08, R.z1 + 0.05);
  const sz = R.z0 + 0.02;
  cast.box(M.satin, C.green, R.x - 1.0, H + 0.08, sz - 0.03, R.x + 1.0, H + 0.62, sz + 0.03);
  still.panel(signs.material, C.white, R.x, sz - 0.032, [0, -1], 1.9, H + 0.1, H + 0.6, signs.rect('cartReturn'));
  still.panel(signs.material, C.white, R.x, sz + 0.032, [0, 1], 1.9, H + 0.1, H + 0.6, signs.rect('cartReturn'));
}

/** The pylon by the exit road and the EXIT sign over its start. */
function pylon(site, cast, still, M, signs) {
  const x = EXIT_ROAD.x1 + 2.6, z = EXIT_ROAD.z1 + 3, w = 1.7, h = 5.2;
  cast.box(M.matte, C.navy, x - w / 2 - 0.1, 0, z - 0.3, x + w / 2 + 0.1, h + 0.2, z + 0.3);
  for (const f of [-1, 1]) still.panel(signs.material, C.white, x, z + f * 0.31, [0, f], w, h - w * 2, h, signs.rect('pylon'));
  site.collide(x - w / 2 - 0.1, z - 0.3, x + w / 2 + 0.1, z + 0.3, 0, h);
  const ex = EXIT_ROAD.x0 - 0.8, ez = EXIT_ROAD.z1 - 1;
  cast.cylinder(M.metal, C.frame, ex, 0, ez, 0.05, 2.6, 8);
  still.panel(signs.material, C.white, ex, ez + 0.04, [0, 1], 1.2, 2.0, 2.6, signs.rect('exit'));
  cast.box(M.metal, C.frame, ex - 0.6, 2.0, ez - 0.03, ex + 0.6, 2.6, ez + 0.03);
  site.collide(ex - 0.06, ez - 0.06, ex + 0.06, ez + 0.06, 0, 2.6, { camera: false });
}

/**
 * Trees (the city's summer tree, loaded here): bark simplified, leaves as
 * alpha-tested cards lit as soft masses like the city's foliage; one thin
 * instance per tree. `groups` are lists of spots, each its own set of
 * meshes (clones sharing geometry and materials): the outdoor trees and the
 * indoor ones were one set, its bounds the whole site, so all 122k
 * triangles drew (and cast) in every view inside the building.
 */
async function treeModel(scene, groups, root) {
  const [container] = await Promise.all([LoadAssetContainerAsync('./models/props/tree_summer.glb', scene), simplifierReady]);
  container.addAllToScene();
  const rnd = mulberry32(77);
  const base = [];
  for (const m of container.meshes) {
    if (!m.getTotalVertices()) continue;
    m.setParent(null);
    m.bakeCurrentTransformIntoVertices();
    m.parent = root;
    m.isPickable = false;
    m.receiveShadows = true;
    const mat = m.material;
    if (mat.needAlphaBlending()) {
      // Cards: alpha-tested, so the many leaf layers sort themselves (blended, they flickered).
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
      mat.alphaCutOff = 0.45;
      mat.useAlphaFromAlbedoTexture = true;
      mat.twoSidedLighting = false;
      CelLighting.get(mat).soft = true;
    } else {
      const index = simplifyGeometry(m.geometry, { error: 0.01 });
      if (index) m.setIndices(index);
    }
    base.push(m);
  }
  const sets = groups.map((spots, g) => base.map((m) => {
    const mesh = g ? m.clone(`${m.name}:${g}`, root) : m;
    const matrices = new Float32Array(spots.length * 16);
    spots.forEach(([x, z, scale = 1], i) => {
      const yaw = rnd() * Math.PI * 2, s = (0.8 + rnd() * 0.35) * scale;
      _q.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
      writeTRS(matrices, i * 16, x, 0, z, _q, s, s, s);
    });
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
    mesh.thinInstanceRefreshBoundingInfo(false);
    mesh.computeWorldMatrix(true);
    mesh.freezeWorldMatrix();
    return mesh;
  }));
  for (const n of container.transformNodes) n.dispose();
  for (const m of container.meshes) if (!base.includes(m)) m.dispose();
  return { sets, container };
}
