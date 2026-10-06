import { SceneLoader, TransformNode, Quaternion, Vector3, Color3, MaterialPluginBase, PBRMaterial, RegisterMaterialPlugin } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

/**
 * VRM characters (VRM 1.0 and 0.x) in Babylon: the glTF loader reads the
 * meshes and skeleton; the VRM data (humanoid bone map, expressions, MToon
 * shading values) is read here from the file's own JSON.
 *
 *  - HumanoidRig: a "normalized" humanoid like three-vrm's — every bone
 *    takes rotations in one shared frame (she faces +Z, her left is +X), so
 *    the hand-tuned animation from the original game works unchanged.
 *  - Toon shading: Babylon lights the character fully (sun, sky, cascaded
 *    shadows), then a material plugin turns that light into anime cel bands
 *    using each material's MToon shade colour.
 *  - Outlines: Babylon's outline renderer.
 */

// ---------------------------------------------------------------- toon plugin
class ToonPlugin extends MaterialPluginBase {
  constructor(material) {
    super(material, 'Toon', 300, { TOON: false });
    this.shade = new Color3(0.8, 0.7, 0.75);
    this.params = [1.35, 0.18, 1.0, 0.86];   // band centre, band softness, lit gain, shade gain
    this.enabled = false;
  }
  get isEnabled() { return this.enabled; }
  set isEnabled(v) { if (this.enabled !== v) { this.enabled = v; this.markAllDefinesAsDirty(); this._enable(v); } }
  prepareDefines(defines) { defines.TOON = this.enabled; }
  getClassName() { return 'ToonPlugin'; }
  getUniforms() {
    return {
      ubo: [{ name: 'toonShade', size: 3, type: 'vec3' }, { name: 'toonParams', size: 4, type: 'vec4' }],
      fragment: '#ifdef TOON\nuniform vec3 toonShade;\nuniform vec4 toonParams;\n#endif',
    };
  }
  bindForSubMesh(ubo) {
    if (!this.enabled) return;
    ubo.updateColor3('toonShade', this.shade);
    ubo.updateFloat4('toonParams', this.params[0], this.params[1], this.params[2], this.params[3]);
  }
  getCustomCode(type) {
    if (type !== 'fragment') return null;
    return {
      // Light → cel bands: how bright the PBR result is relative to the bare
      // albedo is the light received (sun, sky, shadows); above the band
      // centre she's lit, below it in her MToon shade colour.
      CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
        #ifdef TOON
          float tLum = dot(finalColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float tAlb = max(dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722)), 0.02);
          float tK = smoothstep(toonParams.x - toonParams.y, toonParams.x + toonParams.y, tLum / tAlb);
          vec3 tLit = surfaceAlbedo * toonParams.z;
          vec3 tShade = surfaceAlbedo * toonShade * toonParams.w;
          finalColor.rgb = mix(tShade, tLit, tK) + finalColor.rgb * 0.08;
        #endif
      `,
    };
  }
}
RegisterMaterialPlugin('Toon', (material) => (material instanceof PBRMaterial ? new ToonPlugin(material) : null));

// ---------------------------------------------------------------- rig
const quatXYZ = (x, y, z, out = new Quaternion()) => {
  // three.js Euler 'XYZ' (R = Rx · Ry · Rz) as a quaternion.
  const qx = Quaternion.RotationAxis(Vector3.Right(), x), qy = Quaternion.RotationAxis(Vector3.Up(), y), qz = Quaternion.RotationAxis(new Vector3(0, 0, 1), z);
  return qx.multiplyToRef(qy, out).multiplyInPlace(qz);
};

export class HumanoidRig {
  constructor(bones, frame) {
    // bones: { name → TransformNode }, frame: model-space rotation that makes
    // the model face +Z (identity for VRM 1, 180° about Y for VRM 0).
    this.nodes = bones;
    this.rest = {};
    this.P = {};
    this.Pinv = {};
    const worldRest = new Map();
    const restOf = (node) => {
      if (worldRest.has(node)) return worldRest.get(node);
      const parent = node.parent;
      const q = (node.rotationQuaternion || Quaternion.Identity()).clone();
      const pq = parent && parent.__rigRoot !== true ? restOf(parent) : frame.clone();
      const w = pq.multiply(q);
      worldRest.set(node, w);
      return w;
    };
    for (const [name, node] of Object.entries(bones)) {
      if (!node.rotationQuaternion) node.rotationQuaternion = Quaternion.FromEulerVector(node.rotation);
      this.rest[name] = node.rotationQuaternion.clone();
      const parent = node.parent;
      const P = parent && parent.__rigRoot !== true ? restOf(parent) : frame.clone();
      this.P[name] = P;
      this.Pinv[name] = Quaternion.Inverse(P);
    }
    const hips = bones.hips;
    this.hipsRest = hips.position.clone();
    this._q = new Quaternion();
    this._t = new Quaternion();
  }

  /** Normalized rotation (three.js XYZ Euler) for a humanoid bone. */
  setEuler(name, x, y, z) {
    const n = this.nodes[name];
    if (!n) return;
    quatXYZ(x, y, z, this._q);
    // raw = P⁻¹ · q · P · rest
    this.Pinv[name].multiplyToRef(this._q, this._t);
    this._t.multiplyInPlace(this.P[name]).multiplyInPlace(this.rest[name]);
    n.rotationQuaternion.copyFrom(this._t);
  }

  /** Hips offset (normalized frame, metres) from rest. */
  setHips(x, y, z) {
    const n = this.nodes.hips;
    const v = new Vector3(x, y, z).applyRotationQuaternion(this.Pinv.hips);
    n.position.copyFrom(this.hipsRest).addInPlace(v);
  }
}

// ---------------------------------------------------------------- loading
/**
 * Load a VRM: returns { root, rig, meshes, expressions, json, height }.
 * root faces +Z; move / turn root for the character.
 */
export async function loadVrm(scene, file, { outline = true } = {}) {
  let json = null;
  const obs = SceneLoader.OnPluginActivatedObservable.add((plugin) => {
    if (plugin.name === 'gltf') plugin.onParsedObservable.addOnce((d) => { json = d.json; });
  });
  const dir = file.slice(0, file.lastIndexOf('/') + 1), name = file.slice(dir.length);
  const res = await SceneLoader.ImportMeshAsync('', dir, name, scene, undefined, '.glb');
  SceneLoader.OnPluginActivatedObservable.remove(obs);
  const vrm1 = !!json.extensions?.VRMC_vrm;
  const gltfRoot = res.meshes[0];            // loader's __root__

  // Character root: what the game moves and turns.
  const root = new TransformNode(`vrm:${name}`, scene);
  gltfRoot.parent = root;
  gltfRoot.__rigRoot = true;

  // Humanoid bone map → transform nodes (by glTF node index).
  // glTF node index → Babylon node, by name (VRoid node names are unique).
  const byNodeName = new Map();
  for (const t of [...res.transformNodes, ...res.meshes]) if (!byNodeName.has(t.name)) byNodeName.set(t.name, t);
  const nodeByIndex = { get: (i) => byNodeName.get(json.nodes[i]?.name) };
  const byName = (n) => res.transformNodes.find((t) => t.name === n);
  const human = vrm1
    ? Object.entries(json.extensions.VRMC_vrm.humanoid.humanBones).map(([bone, v]) => ({ bone, node: v.node }))
    : json.extensions.VRM.humanoid.humanBones;
  const bones = {};
  for (const { bone, node } of human) {
    const t = nodeByIndex.get(node) || byName(json.nodes[node].name);
    if (t) bones[bone] = t;
  }
  // VRM 1.0 node constraints (VRMC_node_constraint): aim / rotation nodes
  // carry e.g. the T-shirt sleeves along the upper arms; Babylon doesn't
  // evaluate them, so such a node simply follows its source bone (kept where
  // it is in the rest pose, so the skin binding is unchanged).
  json.nodes.forEach((n, i) => {
    const c = n.extensions?.VRMC_node_constraint?.constraint;
    let source = null;
    // Aiming at the elbow / knee = following the upper arm / thigh.
    if (c?.aim) source = nodeByIndex.get(c.aim.source)?.parent;
    else if (c?.rotation) source = nodeByIndex.get(c.rotation.source);
    const node = nodeByIndex.get(i);
    if (node && source && node !== source && node.parent !== source) node.setParent(source);
  });
  // VRM 0.x models face -Z; VRM 1.0 face +Z.
  const frame = vrm1 ? Quaternion.Identity() : Quaternion.RotationAxis(Vector3.Up(), Math.PI);
  if (!vrm1) gltfRoot.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI).multiply(gltfRoot.rotationQuaternion || Quaternion.Identity());
  const rig = new HumanoidRig(bones, frame);

  // Materials: lit (not unlit) + toon bands from MToon values; outlines.
  const mtoon = (i) => (vrm1 ? json.materials[i]?.extensions?.VRMC_materials_mtoon : null);
  const vrm0props = !vrm1 ? json.extensions.VRM.materialProperties : null;
  const meshes = res.meshes.filter((m) => m.getTotalVertices?.() > 0);
  for (const m of meshes) {
    const mats = m.material?.subMaterials || [m.material];
    for (const mat of mats) {
      if (!(mat instanceof PBRMaterial)) continue;
      const gi = json.materials.findIndex((x) => x.name === mat.name);
      const mt = mtoon(gi);
      mat.unlit = false;
      mat.metallic = 0;
      mat.roughness = 1;
      mat.environmentIntensity = 0.35;
      mat.specularIntensity = 0;
      const toon = mat.pluginManager?.getPlugin('Toon');
      if (toon) {
        let shade = [0.82, 0.72, 0.78];
        if (mt?.shadeColorFactor) shade = mt.shadeColorFactor;
        else if (vrm0props?.[gi]?.vectorProperties?._ShadeColor) shade = vrm0props[gi].vectorProperties._ShadeColor;
        // The sample shade colours are near-white (flat-looking); like the
        // original, give hair, skin and clothes proper anime shadow tones.
        const tone = /HAIR/.test(mat.name) ? '#9a86a8' : /Body_00_SKIN/.test(mat.name) ? '#d6909a' : /CLOTH/.test(mat.name) ? '#8c90bd' : null;
        toon.shade = tone ? Color3.FromHexString(tone).toLinearSpace() : new Color3(shade[0], shade[1], shade[2]);
        toon.isEnabled = true;
      }
      if (mat.transparencyMode == null && json.materials[gi]?.alphaMode === 'MASK') mat.transparencyMode = 1;
    }
    m.receiveShadows = true;
    m.isPickable = false;
    if (outline && !/Eye|Face(Mouth|Brow|Eyeline|Eyelash)|Highlight/i.test(m.name + (m.material?.name || ''))) {
      m.renderOutline = true;
      m.outlineColor = Color3.FromHexString('#3a2a33');
      m.outlineWidth = 0.0035;
    }
  }

  // Expressions (blink, happy, …): morph target binds.
  const expressions = {};
  const presets = vrm1 ? json.extensions.VRMC_vrm.expressions?.preset || {} : null;
  const addExpr = (key, binds) => {
    expressions[key] = binds.map(({ node, mesh, index, weight }) => {
      let targetMeshes;
      if (node != null) {
        const nn = json.nodes[node]?.name;
        targetMeshes = res.meshes.filter((x) => x.name === nn || x.parent?.name === nn || x.name.startsWith(nn + '_primitive'));
      } else {
        // VRM 0.x binds by mesh index: the nodes that use that mesh.
        const names = json.nodes.filter((n) => n.mesh === mesh).map((n) => n.name);
        targetMeshes = res.meshes.filter((x) => names.includes(x.name) || names.includes(x.parent?.name) || names.some((n) => x.name.startsWith(n + '_primitive')));
      }
      return { meshes: targetMeshes.filter((x) => x.morphTargetManager), index, weight: weight ?? 1 };
    });
  };
  if (presets) for (const [k, v] of Object.entries(presets)) addExpr(k, v.morphTargetBinds || []);
  else for (const g of json.extensions.VRM.blendShapeMaster?.blendShapeGroups || []) addExpr((g.presetName || g.name).toLowerCase(), (g.binds || []).map((b) => ({ mesh: b.mesh, index: b.index, weight: (b.weight ?? 100) / 100 })));
  const setExpression = (key, w) => {
    for (const b of expressions[key] || []) for (const m of b.meshes) { const t = m.morphTargetManager.getTarget(b.index); if (t) t.influence = w * b.weight; }
  };

  // Standing height (head top).
  root.computeWorldMatrix(true);
  let maxY = 0;
  for (const m of meshes) { m.computeWorldMatrix(true); const bb = m.getBoundingInfo().boundingBox; maxY = Math.max(maxY, bb.maximumWorld.y); }
  return { root, rig, meshes, json, setExpression, height: maxY, bones };
}
