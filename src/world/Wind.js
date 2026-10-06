import { MaterialPluginBase, Vector3 } from '@babylonjs/core';
import { CelLighting } from './CelLighting.js';
import { exclusive } from './CityParts.js';

/**
 * GPU wind for the vegetation exported in the city (the original's
 * Vegetation addWind): trees, hedges and shrubs sway from `start` metres up,
 * grass blades wave in gusts and part around her feet, darker at the root.
 * One shared clock; every sway runs in the vertex shader, so it costs
 * nothing on the CPU. Same formulas and numbers as the original (the export
 * tags each wind material with its addWind strength / start).
 */
export class Wind {
  constructor() {
    this.time = 0;
    // Player feet for the grass; far below the ground means nobody is there.
    this.player = new Vector3(0, -99, 0);
    this.materials = [];
  }

  /** Put the tagged parts in the wind: parts.wind [{ mesh, strength, start }], parts.grass. */
  plant(scene, { wind, grass }) {
    const groups = new Map();   // material → { meshes, strength, start }
    for (const { mesh, strength, start } of wind) {
      if (!groups.has(mesh.material)) groups.set(mesh.material, { meshes: [], strength, start });
      groups.get(mesh.material).meshes.push(mesh);
    }
    for (const [source, { meshes, strength, start }] of groups) {
      const material = exclusive(scene, source, meshes, this.materials);
      new WindPlugin(material, this, { strength, start, grass: false });
      // Leaves, hedges and shrubs light as soft painted masses (SOFT_CEL);
      // bark (0.02 from 2 m, the original's barkMat) keeps the crisp ramp.
      if (!(strength === 0.02 && start === 2)) CelLighting.get(material).soft = true;
      // Leaf cards light the same on both faces (the original's
      // NO_NORMAL_FLIP): with flipped back-face normals half the leaves of a
      // canopy went dark and it read as noise.
      if (material.needAlphaTesting()) material.twoSidedLighting = false;
    }
    if (grass) {
      const material = exclusive(scene, grass.material, [grass], this.materials);
      new WindPlugin(material, this, { strength: 0, start: 0, grass: true });
      CelLighting.get(material).soft = true;
    }
  }

  update(dt, camera, player) {
    this.time += dt;
    if (player) this.player.copyFrom(player.position);
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
  }
}

const VERTEX = /* glsl */ `
#ifdef WIND
{
  #ifdef INSTANCES
  mat4 windInstance = mat4(world0, world1, world2, world3);
  vec3 ip = windInstance[3].xyz;
  #else
  vec3 ip = vec3(0.0);
  #endif
  float ph = ip.x * 0.31 + ip.z * 0.23;
  #ifdef WIND_GRASS
  vGrassH = positionUpdated.y;
  float h = positionUpdated.y * positionUpdated.y;
  float gust = sin(windTime * 0.9 + ip.x * 0.15 + ip.z * 0.1) * 0.5 + 0.5;
  positionUpdated.x += (sin(windTime * 2.2 + ph * 3.0) * 0.12 + gust * 0.18) * h;
  positionUpdated.z += cos(windTime * 1.7 + ph * 2.0) * 0.08 * h;
  #ifdef INSTANCES
  {
    // Feet part the grass: blades near her lean away from her and flatten
    // a little, most at the tip.
    vec2 away = ip.xz - windPlayer.xz;
    float d = length(away);
    float near = (1.0 - smoothstep(0.12, 0.55, d)) * step(abs(ip.y - windPlayer.y), 0.4);
    vec3 push = vec3(away.x, 0.0, away.y) / max(d, 1e-3);
    vec3 lp = inverse(mat3(windInstance)) * push;
    positionUpdated.xz += lp.xz * near * h * 0.55;
    positionUpdated.y -= near * vGrassH * 0.35;
  }
  #endif
  #else
  float s = windParams.x;
  float h = max(positionUpdated.y - windParams.y, 0.0);
  positionUpdated.x += (sin(windTime * 1.25 + ph) * s + sin(windTime * 3.3 + ph * 2.0 + positionUpdated.y * 1.7) * s * 0.3) * h;
  positionUpdated.z += (cos(windTime * 1.05 + ph * 1.3) * s * 0.7 + sin(windTime * 2.9 + positionUpdated.x * 2.0) * s * 0.25) * h;
  #endif
}
#endif
`;

class WindPlugin extends MaterialPluginBase {
  constructor(material, wind, { strength, start, grass }) {
    super(material, 'Wind', 200, { WIND: false, WIND_GRASS: false });
    this.wind = wind;
    this.strength = strength;
    this.start = start;
    this.grass = grass;
    this.registerForExtraEvents = true;   // uniforms bound per draw, frozen or shared material
    this.doNotSerialize = true;
    this._enable(true);
  }

  getClassName() { return 'WindPlugin'; }

  isCompatible(shaderLanguage) { return shaderLanguage === 0; }   // GLSL (WebGL)

  prepareDefines(defines) {
    defines.WIND = true;
    defines.WIND_GRASS = this.grass;
  }

  getUniforms() {
    return { externalUniforms: ['windTime', 'windPlayer', 'windParams'] };
  }

  hardBindForSubMesh(ubo, scene, engine, subMesh) {
    const effect = subMesh.effect;
    if (!effect) return;
    const w = this.wind;
    effect.setFloat('windTime', w.time);
    effect.setFloat3('windPlayer', w.player.x, w.player.y, w.player.z);
    effect.setFloat2('windParams', this.strength, this.start);
  }

  getCustomCode(shaderType) {
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `
          #ifdef WIND
          uniform float windTime;
          uniform vec3 windPlayer;
          uniform vec2 windParams;
          #endif
          #ifdef WIND_GRASS
          varying float vGrassH;
          #endif`,
        CUSTOM_VERTEX_UPDATE_POSITION: VERTEX,
      };
    }
    if (shaderType === 'fragment') {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: `
          #ifdef WIND_GRASS
          varying float vGrassH;
          #endif`,
        // Darker roots, lighter tips.
        CUSTOM_FRAGMENT_UPDATE_ALPHA: `
          #ifdef WIND_GRASS
          surfaceAlbedo *= mix(0.45, 1.15, vGrassH);
          #endif`,
      };
    }
    return null;
  }
}
