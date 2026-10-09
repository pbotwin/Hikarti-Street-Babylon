import { Matrix, VertexData } from '@babylonjs/core';
import { C } from './MallKit.js';
import { FOUNTAIN } from './MallPlan.js';

/**
 * The atrium's fountain, drawn the way anime draws one: a white two-tier
 * fountain in a round pool with a wide coping to sit on, light-blue tiles
 * under clear blue water. The water moves: ripple rings run out across
 * the pool and the bowls, a crown of water rises from the top and falls
 * back, clear sheets pour over both bowls' lips, a ring of jets leaps in
 * the pool, and white splash rings spread where water lands. All of it is
 * still geometry; the movement is the water materials' scrolling textures
 * (MallMaterials `water`, `spray`), so it costs no updates.
 *
 * Surfaces of revolution are built from profiles of [r, y] (lathe): u runs
 * round them, v along the profile in metres, which is the way the water
 * flows (and the way its streaks scroll). A profile faces to its left
 * (its normal is (−dy, dr)): walls are drawn downward, tops outward.
 */
const F = FOUNTAIN;
const POOL = 0.36;                     // the water's level in the pool
const INNER = F.r - 0.22;              // the coping's inner edge
const SEGMENTS = 28;
const JETS = 8, JET_R = 1.86;

/**
 * A lathe: one strip per profile segment (crisp edges between them), u round
 * it `around` times, v the distance along the profile. `shade(r)` darkens
 * rings by radius (vertex colours), for the water by the pool's wall.
 */
function lathe(profile, { n = SEGMENTS, around = 4, shade = null } = {}) {
  const positions = [], normals = [], uvs = [], indices = [], colors = [];
  let v = 0;
  for (let s = 1; s < profile.length; s++) {
    const [ra, ya] = profile[s - 1], [rb, yb] = profile[s], len = Math.hypot(rb - ra, yb - ya), base = positions.length / 3;
    const nr = -(yb - ya) / len, ny = (rb - ra) / len;
    for (const [r, y, vv] of [[ra, ya, v], [rb, yb, v + len]]) {
      const k = shade ? shade(r) : 1;
      for (let i = 0; i <= n; i++) {
        const a = i / n * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        positions.push(c * r, y, sn * r);
        normals.push(c * nr, ny, sn * nr);
        uvs.push(i / n * around, vv);
        colors.push(k, k, k, 1);
      }
    }
    // Wound so the face toward the profile's left is the front (MallKit Batch's convention).
    for (let i = 0; i < n; i++) {
      const a = base + i, b = base + n + 1 + i;
      indices.push(a, b + 1, a + 1, a, b, b + 1);
    }
    v += len;
  }
  const vd = new VertexData();
  Object.assign(vd, { positions, normals, uvs, indices, colors });
  return vd;
}

export function buildFountain(cast, still, M) {
  const at = (x, y, z) => Matrix.Translation(F.x + x, y, F.z + z);
  const here = at(0, 0, 0);
  // The pool: a stone wall, the coping (inner face, wide top, outer lip), tiles inside, the water.
  cast.shape(M.satin, C.stone, lathe([[F.r, 0.44], [F.r, 0]]), here);
  cast.shape(M.satin, C.snow, lathe([[INNER, POOL], [INNER, 0.54], [F.r + 0.06, 0.54], [F.r + 0.06, 0.44], [F.r, 0.44]], { n: 40 }), here);
  still.shape(M.water, C.white, lathe([[0, POOL], [INNER, POOL]], { n: 40, around: 6, shade: (r) => 1 - 0.18 * (r / INNER) ** 2 }), here);

  // The fountain: a fluted pedestal, the wide lower bowl, a stem, the small upper bowl, each bowl full.
  cast.shape(M.gloss, C.snow, lathe([[0.24, 1.08], [0.2, 0.9], [0.3, 0.5], [0.34, POOL]]), here);
  cast.shape(M.gloss, C.snow, lathe([[0.98, 1.38], [1.06, 1.38], [1.0, 1.3], [0.7, 1.2], [0.24, 1.08]], { n: 32 }), here);
  still.shape(M.water, C.white, lathe([[0, 1.35], [0.98, 1.35]], { n: 32, around: 3, shade: (r) => 1 - 0.12 * r }), here);
  cast.shape(M.gloss, C.snow, lathe([[0.14, 1.88], [0.1, 1.75], [0.13, 1.35]], { n: 14 }), here);
  cast.shape(M.gloss, C.snow, lathe([[0.5, 2.06], [0.55, 2.06], [0.4, 1.98], [0.14, 1.88]], { n: 24 }), here);
  still.shape(M.water, C.white, lathe([[0, 2.04], [0.5, 2.04]], { n: 24, around: 2 }), here);

  // Water: the crown rising from the top bowl and falling back into it, the sheets over both lips.
  still.shape(M.spray, C.white, lathe([[0.02, 2.04], [0.03, 2.45], [0.05, 2.66], [0.11, 2.74], [0.2, 2.66], [0.3, 2.4], [0.4, 2.06]], { n: 16, around: 3 }), here);
  still.shape(M.spray, C.white, lathe([[0.55, 2.06], [0.6, 1.92], [0.68, 1.66], [0.75, 1.36]], { n: 24, around: 5 }), here);
  still.shape(M.spray, C.white, lathe([[1.06, 1.38], [1.13, 1.18], [1.2, 0.85], [1.25, POOL + 0.01]], { n: 32, around: 8 }), here);
  // Where it lands: splash rings in the lower bowl and the pool.
  still.shape(M.spray, C.white, lathe([[0.75, 1.36], [0.95, 1.36]], { n: 24, around: 6 }), here);
  still.shape(M.spray, C.white, lathe([[1.25, POOL + 0.012], [1.55, POOL + 0.012]], { n: 32, around: 10 }), here);
  // The ring of leaping jets in the pool, each with its crown and splash ring.
  const jet = lathe([[0.015, POOL], [0.025, 0.86], [0.04, 0.95], [0.07, 0.91], [0.1, 0.72], [0.12, POOL + 0.01]], { n: 10, around: 2 });
  const splash = lathe([[0.12, POOL + 0.012], [0.26, POOL + 0.012]], { n: 12, around: 3 });
  for (let i = 0; i < JETS; i++) {
    const a = (i + 0.5) * Math.PI * 2 / JETS, x = Math.cos(a) * JET_R, z = Math.sin(a) * JET_R;
    still.shape(M.spray, C.white, jet, at(x, 0, z));
    still.shape(M.spray, C.white, splash, at(x, 0, z));
    cast.cylinder(M.metal, C.steel, F.x + x, POOL - 0.04, F.z + z, 0.04, 0.05, 8);
  }
}
