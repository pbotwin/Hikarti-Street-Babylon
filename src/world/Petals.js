import { Mesh, PBRMaterial, Color3, Quaternion, CreatePlaneVertexData } from '@babylonjs/core';
import { L } from './Layout.js';
import { mulberry32 } from './rng.js';
import { animatedInstances, quatXYZ, writeTRS } from './Instances.js';

/**
 * Sakura petals drifting down: around the park's cherry trees (the
 * original's Vegetation._petals, 140 petals) and over Sakura Gardens
 * (Expansion.js, a 70-petal drift). One thin-instanced card mesh each.
 */
const _q = new Quaternion();

/** Cherry trees planted by the original's Vegetation (park and behind its wall). */
function parkSakura(pc) {
  const P = L.park, W = L.walkOuter;
  const park = [
    [P.x0 + 2.5, P.z0 + 3], [P.x0 + 2.8, P.z1 - 2.8], [P.x0 + 2.2, (P.z0 + P.z1) / 2 + 1],
    [-W - 3.2, P.z0 + 2.2], [-W - 3.0, P.z1 - 2.4], [pc.x - 1.5, P.z0 + 1.6], [pc.x + 2.0, P.z1 - 1.5],
  ];
  // Every third park tree is a round summer tree.
  const sakura = park.filter((_, i) => i % 3 !== 2).map(([x, z]) => [x, 0.15, z]);
  sakura.push([pc.x - 7.5, 0.15, pc.z - 5.5], [P.x0 - 2.2, 0.15, -19]);
  return sakura;
}

/** The Sakura Gardens grove (first 14 trees of Expansion.js's list). */
const GARDEN_SAKURA = [
  [-36, 108], [-10.5, 113], [-36, 119], [-19, 116], [-10, 129], [-34.5, 135], [-29, 137.5],
  [36, 108], [10.5, 113], [35, 121], [20, 122.8], [10.5, 129], [34.5, 135], [29, 137.5],
];

function petalMesh(scene, name, w, h, color, alpha, count) {
  const mesh = new Mesh(name, scene);
  CreatePlaneVertexData({ width: w, height: h, sideOrientation: Mesh.DOUBLESIDE }).applyToMesh(mesh);
  const mat = new PBRMaterial(name, scene);
  mat.unlit = true;
  mat.albedoColor = Color3.FromHexString(color).toLinearSpace();
  mat.alpha = alpha;
  mat.freeze();
  mesh.material = mat;
  return { mesh, mat, matrices: animatedInstances(mesh, count) };
}

export class Petals {
  constructor(scene, { parkCenter }) {
    this.t = 0;
    // Park: petals fall from the crowns and drift east on the breeze.
    const sakura = parkSakura(parkCenter);
    this.park = petalMesh(scene, 'petals', 0.06, 0.04, '#ffd0dc', 0.9, 140);
    this.parkData = [];
    for (let i = 0; i < 140; i++) {
      const t = sakura[i % sakura.length];
      this.parkData.push({
        origin: t, x: t[0] + (Math.random() - 0.5) * 4, y: Math.random() * 5, z: t[2] + (Math.random() - 0.5) * 4,
        s: Math.random() * 10, v: 0.3 + Math.random() * 0.4,
      });
    }
    // Sakura Gardens: a slow drift circling each tree.
    const rnd = mulberry32(140);
    this.garden = petalMesh(scene, 'gardenPetals', 0.07, 0.045, '#f8c9df', 1, 70);
    this.gardenData = Array.from({ length: 70 }, (_, i) => ({
      x: GARDEN_SAKURA[i % 14][0], z: GARDEN_SAKURA[i % 14][1], phase: rnd() * 6.28, y: rnd.range(0.3, 5),
    }));
    this.update(0);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const pm = this.park.matrices;
    for (let i = 0; i < this.parkData.length; i++) {
      const p = this.parkData[i];
      p.y -= p.v * dt;
      p.x += (0.35 + Math.sin(t * 0.7 + p.s) * 0.3) * dt;
      p.z += Math.cos(t * 0.9 + p.s) * 0.2 * dt;
      if (p.y < 0.17) {
        p.y = 3 + Math.random() * 2;
        p.x = p.origin[0] + (Math.random() - 0.5) * 3.5;
        p.z = p.origin[2] + (Math.random() - 0.5) * 3.5;
      }
      writeTRS(pm, i * 16, p.x, p.y, p.z, quatXYZ(t * 2 + p.s, t * 1.3 + p.s * 2, 0, _q));
    }
    this.park.mesh.thinInstanceBufferUpdated('matrix');

    const gm = this.garden.matrices, H = L.curbH;
    for (let i = 0; i < this.gardenData.length; i++) {
      const d = this.gardenData[i];
      d.y -= dt * 0.32;
      if (d.y < H) d.y = 4.8;
      writeTRS(gm, i * 16, d.x + Math.sin(t * 0.35 + d.phase) * 2.5, d.y, d.z + Math.cos(t * 0.23 + d.phase) * 1.8,
        quatXYZ(t + d.phase, t * 0.6, d.phase, _q));
    }
    this.garden.mesh.thinInstanceBufferUpdated('matrix');
  }

  dispose() {
    for (const { mesh, mat } of [this.park, this.garden]) { mesh.dispose(); mat.dispose(); }
  }
}
