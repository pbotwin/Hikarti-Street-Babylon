import { L } from './Layout.js';

/**
 * Ground surface types, resolved from the district layout (the same numbers
 * that build the streets), never from mesh or material names.
 *
 *   asphalt  wet-look road: no dust, firm steps
 *   concrete sidewalks, alley slab, kerbs
 *   stone    park plaza paving, fountain rim
 *   gravel   park path ring and entrance path
 *   grass    park lawn and flower beds
 *   sand     playground sandpit
 *   wood     benches, crates (when standing on them)
 *   metal    vehicle roofs and other raised props
 *
 * Each type carries the small physical/FX traits the footstep system reads.
 */
export const SURFACE = {
  asphalt: { dust: 0, hard: 1, wet: true, color: [0.36, 0.36, 0.4] },
  concrete: { dust: 0, hard: 1, color: [0.72, 0.7, 0.66] },
  stone: { dust: 0.1, hard: 1, color: [0.7, 0.66, 0.6] },
  gravel: { dust: 0.55, hard: 0.7, pebbles: true, color: [0.7, 0.6, 0.48] },
  dirt: { dust: 0.8, hard: 0.5, color: [0.66, 0.54, 0.4] },
  grass: { dust: 0, hard: 0.3, blades: true, color: [0.36, 0.55, 0.26] },
  sand: { dust: 1, hard: 0.15, grains: true, prints: true, color: [0.86, 0.76, 0.58] },
  wood: { dust: 0, hard: 0.8, color: [0.5, 0.36, 0.24] },
  metal: { dust: 0, hard: 1, color: [0.5, 0.52, 0.56] },
};

/** Playground sandpit in the park (centre, half size); built in Streets.js. */
export const SANDPIT = { x: -13.2, z: -21.6, hx: 1.25, hz: 1.25 };

// Park centre, derived exactly as Streets.js lays the park out.
let parkCenter = { x: (-L.walkOuter + L.park.x0) / 2, z: (L.park.z0 + L.park.z1) / 2 };
/** Called by the world builder with the built park centre (keeps them in sync). */
export function setParkCenter(pc) { parkCenter = { x: pc.x, z: pc.z }; }

/**
 * Surface under a point. `elevated` = the feet stand on something above the
 * local floor (a prop / vehicle top) rather than on the ground itself.
 */
export function surfaceAt(x, z, elevated = false) {
  const R = L.roadHalf, W = L.walkOuter, P = L.park, A = L.alley;
  const inPark = x < -W && x > P.x0 && z > P.z0 && z < P.z1;
  if (elevated) {
    if (inPark) return 'wood';                                    // benches
    if (x > W && z > A.z0 && z < A.z1) return 'wood';             // crates, shrine
    return 'metal';                                               // cars, vans, bins
  }
  if (Math.abs(x - SANDPIT.x) < SANDPIT.hx && Math.abs(z - SANDPIT.z) < SANDPIT.hz) return 'sand';
  if (inPark && parkCenter) {
    const d = Math.hypot(x - parkCenter.x, z - parkCenter.z);
    if (d < 3.25) return 'stone';                                // plaza and fountain rim
    if (d > 4.55 && d < 6.25) return 'gravel';                    // path ring
    if (x > -W - 2.25 && Math.abs(z - parkCenter.z) < 3.05) return 'gravel'; // entrance path
    return 'grass';
  }
  if (x > W && x < A.x1 && z > A.z0 && z < A.z1) return 'concrete'; // alley slab
  // The new city shares its surface rectangles with the builder and map.
  if (L.city && x >= L.city.x0 && x <= L.city.x1 && z >= L.city.z0 && z <= L.city.z1) {
    const contains = (r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
    for (let i = (L.citySurfaces?.length || 0) - 1; i >= 0; i--) {
      const surface = L.citySurfaces[i];
      if (contains(surface)) return SURFACE[surface.type] ? surface.type : 'concrete';
    }
    if (L.cityRoads?.some(contains)) return 'asphalt';
    return 'concrete';
  }
  // Northern districts (Expansion.js): market courts and Sakura Gardens.
  const ax = Math.abs(x);
  if (L.garden && ax > W && ax < L.garden.x1 + 1 && z > L.garden.z0 && z < L.garden.z1) {
    if (x > -29.5 && x < -20.5 && z > 123 && z < 129) return 'wood';                  // tea pavilion deck
    if ([111, 120, 132].some((c) => Math.abs(z - c) < 1.6)) return 'gravel';           // cross paths
    if ([14, 32].some((c) => Math.abs(ax - c) < 1.4)) return 'gravel';
    return ax < 38.5 ? 'grass' : 'concrete';
  }
  if (L.market && ax > W && ax < L.market.x1 && z > L.market.z0 && z < L.market.z1) return 'stone'; // tiled courts
  if (Math.abs(x) < R) return 'asphalt';
  if (z < -44 && z > -52) return 'asphalt';                       // cross street
  return 'concrete';
}
