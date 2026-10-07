import {
  AssetContainer, Color3, EngineStore, MultiMaterial, Quaternion, RawTexture, SubMesh, Texture, TransformNode, VertexBuffer, VertexData,
} from '@babylonjs/core';
import { loadVrm } from '../player/Vrm.js';
import { retonePixels } from './retonePixels.js';
import { releasePositionCaches } from '../core/Memory.js';

/**
 * Anime residents built from VRoid characters (same style as the heroine).
 *
 * Six CC0 VRoid base bodies (public/models/npc/*.vrm, see CREDITS.md) are
 * loaded once each into a template (an AssetContainer kept out of the
 * scene). Every resident is a skinned copy of one of them that shares its
 * geometry, with its own:
 *   - hair colour and clothing colours (textures re-toned in HSV, cached),
 *   - height (overall scale) and build,
 *   - lightweight procedural animation: arms down from the T-pose, idle
 *     breathing, a walk cycle, head turning toward the heroine, blinking.
 * Copies skip the VRM runtime (spring bones etc.) to stay cheap on phones:
 * dozens of residents cost little more than their draw calls.
 *
 * A resident: { root, model, bones, rest, blink, mouth, hipsRestY, outlines,
 * outlinesOn, meshes, casters, skeleton }. `root` is what callers place and
 * turn; `bones` are the raw VRoid bone nodes (linked to the skeleton unless
 * manualPose() is used); `casters` are for the shadow generator (face
 * details left out); disposeResident() frees one.
 */
export const NPC_BASES = {
  girl_bob: { file: 'girl_bob.vrm', gender: 'f' },        // short black bob, school uniform
  girl_long: { file: 'girl_long.vrm', gender: 'f' },      // long black hair, school uniform
  girl_apron: { file: 'girl_apron.vrm', gender: 'f' },    // brown bob, pinafore dress
  girl_dress: { file: 'girl_dress.vrm', gender: 'f' },    // twin tails, light dress
  boy_uniform: { file: 'boy_uniform.vrm', gender: 'm' },  // tousled hair, vest + trousers
  boy_hoodie: { file: 'boy_hoodie.vrm', gender: 'm' },    // black hair, hoodie + trousers
};

const BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot'];

// VRoid face-part materials (…_FaceMouth_00_FACE, …_EyeIris_00_EYE); not the face skin.
const FACE_DETAIL = /_(FACE|EYE)$/;

const loaded = new Map();    // base -> Promise<template>
const texCache = new Map();  // `${texture.uniqueId}|${hex}|…` -> Promise<recoloured texture>
const matCache = new Map();  // `${material.uniqueId}|${hex}` -> Promise<recoloured material>

export function loadBase(name, base = './models/npc/') {
  if (!loaded.has(name)) loaded.set(name, buildBase(EngineStore.LastCreatedScene, base + NPC_BASES[name].file));
  return loaded.get(name);
}

async function buildBase(scene, url) {
  const vrm = await loadVrm(scene, url);
  // One skeleton per character instead of one per skin (VRoid exports
  // three): every skeleton recomputes all its bone matrices each frame.
  combineSkeletons(vrm.meshes);
  const meshes = mergePrimitives(vrm.meshes);
  const boneNames = {};
  for (const b of BONES) if (vrm.bones[b]) boneNames[b] = vrm.bones[b].name;
  const outlined = meshes.filter((m) => m.renderOutline);
  const template = {
    container: new AssetContainer(scene),
    boneNames, morphs: trimMorphs(vrm.json, meshes), height: vrm.height || 1.6,
    outlined: new Set(outlined.map((m) => m.name)),
    outlineColor: outlined[0]?.outlineColor, outlineWidth: outlined[0]?.outlineWidth,
  };
  template.container.addAllAssetsToContainer(vrm.root);
  template.container.removeAllFromScene();
  return template;
}

/**
 * Point every mesh at one skin, remapping its joint indices. The chosen skin
 * is the one whose bones form a single hierarchy: VRoid's face skin starts at
 * the head (the loader warns it isn't a common root, and hangs the face mesh
 * under the neck to match). Meshes moved onto the chosen skin also move into
 * its meshes' frame. A skin is left alone if any of its joints is missing
 * there or bound differently (then it isn't the same armature).
 */
function combineSkeletons(meshes) {
  const skeletons = [...new Set(meshes.map((m) => m.skeleton).filter(Boolean))];
  if (skeletons.length < 2) return;
  const roots = (s) => s.bones.filter((b) => !b.getParent()).length;
  const main = skeletons.reduce((a, b) => (roots(b) < roots(a) || (roots(b) === roots(a) && b.bones.length > a.bones.length) ? b : a));
  const byNode = new Map(main.bones.map((b) => [b.getTransformNode(), b]));
  const frame = meshes.find((m) => m.skeleton === main);
  for (const s of skeletons) {
    if (s === main) continue;
    const remap = new Float32Array(s.bones.length);
    const same = s.bones.every((b) => {
      if (b._index === -1) return true;
      const m = byNode.get(b.getTransformNode());
      if (!m || m._index === -1) return false;
      const x = b.getAbsoluteInverseBindMatrix().m, y = m.getAbsoluteInverseBindMatrix().m;
      for (let i = 0; i < 16; i++) if (Math.abs(x[i] - y[i]) > 1e-4) return false;
      remap[b._index] = m._index;
      return true;
    });
    if (!same) continue;
    for (const mesh of meshes) {
      if (mesh.skeleton !== s) continue;
      for (const kind of [VertexBuffer.MatricesIndicesKind, VertexBuffer.MatricesIndicesExtraKind]) {
        const data = mesh.getVerticesData(kind, true, true);
        if (!data) continue;
        for (let i = 0; i < data.length; i++) data[i] = remap[data[i]];
        mesh.setVerticesData(kind, data, false, 4);
      }
      mesh.skeleton = main;
      mesh.parent = frame.parent;
      mesh.position.copyFrom(frame.position);
      mesh.rotationQuaternion = frame.rotationQuaternion?.clone() ?? null;
      mesh.scaling.copyFrom(frame.scaling);
    }
    s.dispose();
  }
}

/**
 * VRoid exports every hair strand and face part as its own primitive (~65
 * meshes per character, each with its own draw overhead, the face parts each
 * with their own copy of the expressions). Like the original's merge:
 *   1. primitives drawing from one shared vertex buffer become one mesh whose
 *      index ranges are submeshes: same-material parts merge outright, the
 *      face parts (morphed, never recoloured) keep one submesh per material
 *      and share a single set of morph targets;
 *   2. same-material strands with their own buffers are merged into one.
 * Meshes are grouped so outlined / shadow-casting parts stay apart from the
 * face details that are neither. Returns the remaining meshes.
 */
function mergePrimitives(meshes) {
  const gone = new Set();
  const group = (list, keyOf) => {
    const groups = new Map();
    for (const m of list) {
      const key = keyOf(m);
      if (key == null) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  };
  const buffer = (m) => m.getVertexBuffer(VertexBuffer.PositionKind).getWrapperBuffer().uniqueId;
  const place = (m) => [m.parent?.uniqueId, m.skeleton?.uniqueId, m.position.asArray(), m.rotationQuaternion?.asArray(), m.scaling.asArray()].join('|');
  const drop = (m) => { m.morphTargetManager?.dispose(); m.dispose(); gone.add(m); };
  // 1. Shared vertex buffers: one mesh, index ranges as submeshes.
  for (const list of group(meshes, (m) => [buffer(m), place(m), m.renderOutline, FACE_DETAIL.test(m.material.name),
    m.morphTargetManager ? 'morph' : m.material.uniqueId].join('#'))) {
    const [first] = list;
    const mats = [...new Set(list.map((m) => m.material))];
    const parts = mats.map((mat) => list.filter((m) => m.material === mat).map((m) => m.getIndices()));
    const indices = new Uint32Array(parts.flat().reduce((n, a) => n + a.length, 0));
    const ranges = [];
    let at = 0;
    for (const p of parts) {
      const start = at;
      for (const a of p) { indices.set(a, at); at += a.length; }
      ranges.push([start, at - start]);
    }
    const vertices = first.getTotalVertices();
    first.setIndices(indices, vertices);
    if (mats.length > 1) {
      const multi = new MultiMaterial(`${first.name}-parts`, first.getScene());
      multi.subMaterials = mats;
      first.material = multi;
    }
    first.subMeshes = [];
    ranges.forEach(([start, count], i) => new SubMesh(i, 0, vertices, start, count, first));
    for (const m of list) if (m !== first) drop(m);
  }
  // 2. Same-material strands with buffers of their own: merged vertex data.
  const kept = meshes.filter((m) => !gone.has(m));
  const users = new Map();
  for (const m of kept) users.set(buffer(m), (users.get(buffer(m)) || 0) + 1);
  for (const [first, ...rest] of group(kept, (m) => (m.morphTargetManager || m.material.subMaterials || users.get(buffer(m)) > 1 ? null
    : [place(m), m.material.uniqueId, m.getVerticesDataKinds().sort()].join('#')))) {
    const data = VertexData.ExtractFromMesh(first, true, true);
    data.merge(rest.map((m) => VertexData.ExtractFromMesh(m, true, true)), true);
    data.applyToMesh(first);
    for (const m of rest) drop(m);
  }
  return meshes.filter((m) => !gone.has(m));
}

/**
 * Residents only blink and move their mouth: keep those two morph targets
 * (the VRM's `blink` and `a` expressions) and drop the other ~40 each face
 * primitive carries, so every copy's morph data stays small. Returns
 * mesh name -> { blink, mouth } target indices (-1: none).
 */
function trimMorphs(json, meshes) {
  const groups = json.extensions?.VRM?.blendShapeMaster?.blendShapeGroups || [];
  const binds = (preset) => (groups.find((g) => g.presetName === preset)?.binds || [])
    .flatMap((b) => json.nodes.filter((n) => n.mesh === b.mesh).map((n) => ({ node: n.name, index: b.index })));
  const blinks = binds('blink'), mouths = binds('a');
  const of = (m, list) => list.find((k) => m.name === k.node || m.name.startsWith(`${k.node}_primitive`));
  // A target that doesn't move this primitive (the mouth shape on an eye)
  // would still cost a morph texture per resident.
  const moves = (m, t) => {
    const base = m.getVerticesData(VertexBuffer.PositionKind), pos = t?.getPositions();
    if (!pos) return false;
    for (let i = 0; i < pos.length; i++) if (Math.abs(pos[i] - base[i]) > 1e-5) return true;
    return false;
  };
  const morphs = new Map();
  for (const m of meshes) {
    const mgr = m.morphTargetManager;
    if (!mgr) continue;
    const blink = of(m, blinks), mouth = of(m, mouths);
    const keep = [blink && mgr.getTarget(blink.index), mouth && mgr.getTarget(mouth.index)].map((t) => (moves(m, t) ? t : null));
    for (let i = mgr.numTargets - 1; i >= 0; i--) {
      const t = mgr.getTarget(i);
      if (!keep.includes(t)) mgr.removeTarget(t);
    }
    if (!mgr.numTargets) { m.morphTargetManager = null; mgr.dispose(); continue; }
    const index = (t) => { for (let i = 0; i < mgr.numTargets; i++) if (t && mgr.getTarget(i) === t) return i; return -1; };
    morphs.set(m.name, { blink: index(keep[0]), mouth: index(keep[1]) });
  }
  return morphs;
}

// ---------------------------------------------------------------- recolouring
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  }
  return [((h / 6) + 1) % 1, mx > 0 ? d / mx : 0, mx];
}
// Re-toning runs in a worker (it took ~30 ms per resident on the main thread).
let worker = null, jobId = 0;
const jobs = new Map();
function retoneOffThread(px, th, ts, tv, opts) {
  if (worker === null) {
    try {
      worker = new Worker(new URL('./retoneWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { jobs.get(data.id)?.(data.px); jobs.delete(data.id); };
      worker.onerror = () => { worker = false; for (const [id, done] of jobs) { done(null); jobs.delete(id); } };
    } catch { worker = false; }
  }
  if (!worker) return Promise.resolve(retonePixels(px, th, ts, tv, opts));
  const id = ++jobId;
  return new Promise((res) => {
    jobs.set(id, (out) => res(out || retonePixels(px.slice(0), th, ts, tv, opts)));
    // Keep a copy for the fallback in case the worker dies mid-job.
    worker.postMessage({ id, px: px.slice(0), th, ts, tv, opts });
  });
}

/**
 * A copy of `tex` re-toned toward `hex`: hue set to the target, saturation and
 * brightness scaled so the painted pixels' averages match it. Shading, folds
 * and highlights painted into the texture are preserved.
 */
export function retone(tex, hex, { srgb = false, whites = false } = {}) {
  const key = `${tex.uniqueId}|${hex}|${srgb}|${whites}`;
  if (!texCache.has(key)) texCache.set(key, retoneTexture(tex, hex, srgb, whites));
  return texCache.get(key);
}

async function retoneTexture(tex, hex, srgb, whites) {
  await new Promise((res) => Texture.WhenAllReady([tex], res));
  const { width: w, height: h } = tex.getSize();
  // The texels as uploaded (GPU row order); the copy is uploaded the same way.
  const px = new Uint8Array((await tex.readPixels()).buffer);
  // Residents' colours were tuned against linear values; `srgb` matches the
  // target to the texture's own (sRGB) pixels, so a pastel stays a pastel.
  const c = Color3.FromHexString(hex);
  const t = srgb ? c : c.toLinearSpace(true);   // exact sRGB curve, as three converts hex colours
  const [th, ts, tv] = rgb2hsv(t.r, t.g, t.b);
  const data = await retoneOffThread(px, th, ts, tv, { whites });
  const out = RawTexture.CreateRGBATexture(data, w, h, tex.getScene(), true, false, Texture.TRILINEAR_SAMPLINGMODE);
  out.name = `${tex.name}|${hex}`;
  out.gammaSpace = tex.gammaSpace;
  out.wrapU = tex.wrapU; out.wrapV = tex.wrapV;
  out.anisotropicFilteringLevel = 4;
  // Once on the GPU the CPU copy (kept for context-loss restore) is dead
  // weight: ~200 MB for all residents, too much for iOS Safari.
  out.getInternalTexture()._bufferView = null;
  return out;
}

async function retoneMaterial(mat, hex) {
  const map = await retone(mat.albedoTexture, hex);
  // Cloned without its colour map: cloning a texture loaded from the glTF
  // would reload it from its (already revoked) blob URL.
  const src = mat.albedoTexture;
  mat.albedoTexture = null;
  const m = mat.clone(`${mat.name}|${hex}`);
  mat.albedoTexture = src;
  m.albedoTexture = map;
  // The map is re-toned to the target itself: the model's own colour factor
  // would tint it again (boy_uniform's hair factors are lilac and peach, so
  // "dark brown" hair came out purple).
  const lit = luminance(mat.albedoColor);
  m.albedoColor.set(1, 1, 1);
  // The toon plugin's settings aren't serialized, so the clone starts at defaults.
  const from = mat.pluginManager?.getPlugin('Toon'), to = m.pluginManager?.getPlugin('Toon');
  if (from && to) {
    // Shade in the target's hue, as much darker than the lit colour as the model's was.
    const dark = lit > 1e-3 ? Math.min(1, luminance(from.shade) / lit) : 1;
    Color3.FromHexString(hex).toLinearSpaceToRef(to.shade, true).scaleInPlace(dark);
    to.params = [...from.params]; to.isEnabled = from.isEnabled;
  }
  return m;
}

const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

// ---------------------------------------------------------------- residents
const slot = (name) => {
  if (/_HAIR/.test(name)) return 'hair';
  if (/Tops/.test(name)) return 'top';
  if (/Bottoms/.test(name)) return 'bottom';
  if (/Onepice/.test(name)) return 'dress';
  if (/Shoes/.test(name)) return 'shoes';
  if (/Accessory/.test(name)) return 'accessory';
  return null;
};

/**
 * Build a resident from a look: { base, hair, top, bottom, dress, shoes, height }.
 * Colours are hex strings; omitted parts keep the base model's colours.
 */
export async function createResident(look) {
  const base = await loadBase(look.base);
  const copy = base.container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
  const model = copy.rootNodes[0];
  const meshes = model.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0);
  const casters = [], outlines = [], blink = [], mouth = [];
  await Promise.all(meshes.map(async (m) => {
    const mat = m.material;
    // Eyes, brows, lashes and mouth sit inside the head's silhouette: their
    // shadow draws (8 per resident) add nothing.
    if (!FACE_DETAIL.test((mat.subMaterials?.[0] ?? mat).name)) casters.push(m);
    m.receiveShadows = true;
    m.isPickable = false;
    if (base.outlined.has(m.name)) {
      m.renderOutline = true;
      m.outlineColor = base.outlineColor;
      m.outlineWidth = base.outlineWidth;
      outlines.push(m);
    }
    const mt = base.morphs.get(m.name);
    if (mt) {
      // Both targets always active: one shader, and nothing recompiled or
      // reallocated when a blink starts or stops (setting the maximum also
      // syncs the manager now, so load-time compiles see the final variant).
      const mgr = m.morphTargetManager;
      mgr.optimizeInfluencers = false;
      mgr.numMaxInfluencers = mgr.numTargets;
      if (mt.blink >= 0) blink.push(mgr.getTarget(mt.blink));
      if (mt.mouth >= 0) mouth.push(mgr.getTarget(mt.mouth));
    }
    const hex = look[slot(mat.name)];
    if (!hex || !mat.albedoTexture) return;
    const key = `${mat.uniqueId}|${hex}`;
    if (!matCache.has(key)) matCache.set(key, retoneMaterial(mat, hex));
    m.material = await matCache.get(key);
  }));
  const nodes = new Map(model.getChildTransformNodes(false).map((n) => [n.name, n]));
  const bones = {}, rest = {};
  for (const [b, n] of Object.entries(base.boneNames)) {
    const node = nodes.get(n);
    if (!node) continue;
    bones[b] = node;
    rest[b] = node.rotationQuaternion.clone();
  }
  const root = new TransformNode(`resident:${look.base}`, base.container.scene);
  model.parent = root;
  // look.height is in metres (head top); bases differ a lot in size.
  model.scaling.setAll((look.height || 1.6) / base.height);
  releasePositionCaches(meshes);
  return {
    root, model, bones, rest, skeleton: copy.skeletons[0], meshes, casters, outlines, outlinesOn: true,
    blink: blink.length ? blink : null, mouth: mouth.length ? mouth : null,
    hipsRestY: bones.hips?.position.y ?? 0,
  };
}

/**
 * Drive this resident's skeleton only when it is posed. Linked bones copy
 * their nodes into the skeleton every frame, which then recomputes all
 * ~150 bone matrices and re-uploads them, whether anything moved or not;
 * unlinked, only frames that call syncPose() do (distant residents are posed
 * every 2nd / 4th frame, beyond 40 m not at all). The bone nodes stay the
 * pose's working copy (Poses.js reads their world matrices, props hang on
 * the hand).
 */
export function manualPose(r) {
  r.posed = [];
  for (const bone of r.skeleton.bones) {
    const node = bone.getTransformNode();
    bone.linkTransformNode(null);
    if (node && Object.values(r.bones).includes(node)) r.posed.push([node, bone]);
  }
}

/** Copy the posed bone nodes into a manualPose() resident's skeleton. */
export function syncPose(r) {
  for (const [node, bone] of r.posed) {
    bone.setRotationQuaternion(node.rotationQuaternion);
    if (node === r.bones.hips) bone.position = node.position;
  }
}

/** Free a resident made by createResident (its recoloured materials stay cached for others). */
export function disposeResident(r) {
  for (const m of r.meshes) m.morphTargetManager?.dispose();
  r.skeleton?.dispose();
  r.root.dispose(false, false);
}

/** Weight of a resident's blink / mouth morph targets (null: the model has none). */
export function setMorph(targets, w) {
  if (targets) for (const t of targets) t.influence = w;
}

/**
 * three.js Euler angles (intrinsic, order 'XYZ' or 'XZY') as a quaternion in
 * `out`: the original game's poses are tuned in these.
 */
export function eulerToRef(x, y, z, order, out) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return order === 'XZY'
    ? out.copyFromFloats(s1 * c2 * c3 - c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3)
    : out.copyFromFloats(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3);
}

const _q = new Quaternion();
function pose(r, bone, x, y, z, order = 'XYZ') {
  const n = r.bones[bone];
  if (!n) return;
  r.rest[bone].multiplyToRef(eulerToRef(x, y, z, order, _q), n.rotationQuaternion);
}

/**
 * Procedural body animation (model-space conventions of VRoid VRM 0.x bones:
 * the body faces -Z in its own frame, character-left is +X).
 *   walk  0…1 blend, phase advanced by the caller by distance
 *   look  head yaw toward something (radians, + = toward character-left)
 */
export function animateResident(r, t, { walk = 0, phase = 0, look = 0, gender = 'f', kimono = false, hop = 0 }) {
  const s = Math.sin(phase * Math.PI * 2), c = Math.cos(phase * Math.PI * 2);
  const breathe = Math.sin(t * 1.9) * 0.012;
  const stride = (kimono ? 0.22 : 0.42) * walk;
  // Legs: thigh swings (+X = forward). A knee bends while its thigh swings
  // forward (left: c > 0, right: c < 0), lifting that foot; the other leg is
  // straight and planted, sweeping back as she moves. (Bending on the
  // backward sweep instead made the planted foot slide forward: moonwalking.)
  pose(r, 'leftUpperLeg', s * stride, 0, 0);
  pose(r, 'rightUpperLeg', -s * stride, 0, 0);
  pose(r, 'leftLowerLeg', -Math.max(0, c) * 0.75 * walk - 0.03, 0, 0);
  pose(r, 'rightLowerLeg', -Math.max(0, -c) * 0.75 * walk - 0.03, 0, 0);
  pose(r, 'leftFoot', -s * 0.18 * walk, 0, 0);
  pose(r, 'rightFoot', s * 0.18 * walk, 0, 0);
  // Arms down from the T-pose (+Z on the left, −Z on the right), relaxed
  // elbows, swinging opposite to the legs.
  const down = gender === 'm' ? 1.3 : 1.33;
  const swing = s * 0.32 * walk;
  pose(r, 'leftUpperArm', -swing + 0.05, 0, down, 'XZY');
  pose(r, 'rightUpperArm', swing + 0.05, 0, -down, 'XZY');
  pose(r, 'leftLowerArm', 0, 0.25 + Math.max(0, swing) * 0.6, 0);
  pose(r, 'rightLowerArm', 0, -0.25 - Math.max(0, -swing) * 0.6, 0);
  pose(r, 'leftHand', 0, 0, -0.12);
  pose(r, 'rightHand', 0, 0, 0.12);
  // Torso: breathing, a little counter-twist while walking.
  pose(r, 'spine', breathe + 0.02 * walk, s * 0.05 * walk, 0);
  pose(r, 'chest', breathe * 0.6, -s * 0.07 * walk, 0);
  pose(r, 'neck', 0, look * 0.4, 0);
  pose(r, 'head', -0.02 + Math.sin(t * 0.6) * 0.02, look * 0.6, Math.sin(t * 0.71) * 0.02);
  if (r.bones.hips) r.bones.hips.position.y = r.hipsRestY + Math.abs(c) * 0.02 * walk - 0.012 * walk + breathe * 0.2;
  // Leaping clear of a car: knees tucked, arms flung up and out.
  if (hop > 0) {
    pose(r, 'leftUpperLeg', 0.9 * hop, 0, 0); pose(r, 'rightUpperLeg', 0.6 * hop, 0, 0);
    pose(r, 'leftLowerLeg', -1.3 * hop, 0, 0); pose(r, 'rightLowerLeg', -1.0 * hop, 0, 0);
    pose(r, 'leftUpperArm', -0.6 * hop, 0, down * (1 - hop * 0.8), 'XZY');
    pose(r, 'rightUpperArm', -0.6 * hop, 0, -down * (1 - hop * 0.8), 'XZY');
  }
  // Blink every few seconds.
  if (r.blink) {
    const k = (t * 0.31 + r.blinkSeed) % 1;
    setMorph(r.blink, k < 0.035 ? Math.sin((k / 0.035) * Math.PI) : 0);
  }
}
