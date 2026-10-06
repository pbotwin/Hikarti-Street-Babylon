import { Color3, MeshBuilder, PBRMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { billboard, billboardMaterial } from '../Billboard.js';

/** Residents' hand props and thought bubbles (poses live in Poses.js). */

export { applyAct } from './Poses.js';

// ---------------------------------------------------------------- hand props
// One hidden template mesh per prop part; a held prop is a group of instances
// of them (no new geometry or materials while playing).
let kit = null;

function makeKit(scene) {
  const mat = (name, hex, roughness, metallic = 0, emissive = null, intensity = 1) => {
    const m = new PBRMaterial(`prop-${name}`, scene);
    m.albedoColor = Color3.FromHexString(hex).toLinearSpace();
    m.roughness = roughness;
    m.metallic = metallic;
    if (emissive) m.emissiveColor = Color3.FromHexString(emissive).toLinearSpace().scale(intensity);
    return m;
  };
  const M = {
    can: mat('can', '#d8423b', 0.35, 0.6),
    cup: mat('cup', '#f4efe6', 0.6),
    sleeve: mat('sleeve', '#8a5d3b', 0.8),
    phone: mat('phone', '#1a1c22', 0.3, 0.4, '#2a4a70', 0.25),
    book: mat('book', '#4f6f9a', 0.8),
    page: mat('page', '#f1ead8', 0.9),
    bag: mat('bag', '#f6f3ec', 0.9),
    bagLogo: mat('bagLogo', '#4a9b6f', 0.8),
    watering: mat('watering', '#4c8f6a', 0.5, 0.3),
    letter: mat('letter', '#fbf7ef', 0.9),
  };
  const cyl = (rt, rb, h, n) => MeshBuilder.CreateCylinder('prop', { diameterTop: rt * 2, diameterBottom: rb * 2, height: h, tessellation: n }, scene);
  const box = (w, h, d) => MeshBuilder.CreateBox('prop', { width: w, height: h, depth: d }, scene);
  // Half ring (the bag's handle), in the XY plane like three's TorusGeometry arc.
  const arc = [];
  for (let i = 0; i <= 12; i++) arc.push(new Vector3(Math.cos(i / 12 * Math.PI) * 0.06, Math.sin(i / 12 * Math.PI) * 0.06, 0));
  const parts = {
    can: [cyl(0.03, 0.03, 0.115, 12), M.can],
    cup: [cyl(0.04, 0.032, 0.11, 12), M.cup],
    sleeve: [cyl(0.041, 0.036, 0.04, 12), M.sleeve],
    phone: [box(0.07, 0.008, 0.14), M.phone],
    book: [box(0.15, 0.03, 0.21), M.book],
    pages: [box(0.14, 0.032, 0.2), M.page],
    bag: [box(0.26, 0.3, 0.1), M.bag],
    handle: [MeshBuilder.CreateTube('prop', { path: arc, radius: 0.006, tessellation: 4 }, scene), M.bag],
    logo: [box(0.1, 0.1, 0.102), M.bagLogo],
    wcan: [box(0.16, 0.14, 0.09), M.watering],
    spout: [cyl(0.008, 0.012, 0.18, 6), M.watering],
    letter: [box(0.11, 0.004, 0.16), M.letter],
  };
  const meshes = {};
  for (const [name, [mesh, material]] of Object.entries(parts)) {
    mesh.name = `prop-${name}`;
    mesh.material = material;
    mesh.isVisible = false;
    mesh.isPickable = false;
    meshes[name] = mesh;
  }
  return { meshes, materials: Object.values(M) };
}

// kind → parts: [part, x, y, z, rx, ry]
const PROPS = {
  can: [['can', 0, -0.02, 0.03]],
  cup: [['cup', 0, -0.02, 0.035], ['sleeve', 0, -0.025, 0.035]],
  phone: [['phone', 0, -0.03, 0.04, 0.2]],
  book: [['book', 0, -0.03, 0.06], ['pages', 0.004, -0.03, 0.06]],
  bag: [['bag', 0, -0.2, 0], ['handle', 0, -0.04, 0, 0, Math.PI / 2], ['logo', 0, -0.18, 0]],
  watering: [['wcan', 0, -0.1, 0.02], ['spout', 0, -0.08, 0.13, Math.PI / 2.6]],
  letter: [['letter', 0, -0.02, 0.06, 0.3]],
};

function makeProp(scene, kind) {
  const parts = PROPS[kind];
  if (!parts) return null;
  const g = new TransformNode(`held-${kind}`, scene);
  for (const [part, x, y, z, rx = 0, ry = 0] of parts) {
    const m = kit.meshes[part].createInstance(`held-${part}`);
    m.parent = g;
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    m.isPickable = false;
  }
  return g;
}

/** Put `kind` in the resident's right hand (null = empty hand). */
export function holdProp(item, kind) {
  if (item.heldKind === kind) return;
  item.heldKind = kind;
  if (item.held) { item.held.dispose(); item.held = null; }
  const hand = item.vrm?.bones?.rightHand;
  if (!kind || !hand) return;
  const p = makeProp(hand.getScene(), kind);
  if (!p) return;
  // Undo the hand's world scale so props keep their real size on any body.
  const up = (n) => { if (n.parent) up(n.parent); n.computeWorldMatrix(true); };
  up(hand);
  const s = hand.absoluteScaling;
  p.scaling.set(1 / (s.x || 1), 1 / (s.y || 1), 1 / (s.z || 1));
  p.parent = hand;
  item.held = p;
}

// ---------------------------------------------------------------- thought bubbles
const ICONS = ['☕', '🥤', '📖', '📱', '😌', '💤', '👋', '🛍️', '✉️', '🚌', '⛩️', '🌸', '🧽', '📣', '🌱', '📷', '📦', '🗺️', '🎵', '🔧', '🏠', '💬', '😄', '❓', '😊', '❗', '🚲', '🧭', '😠'];
const bubbleCache = new Map();
function bubbleMaterial(scene, icon) {
  if (bubbleCache.has(icon)) return bubbleCache.get(icon);
  const m = billboardMaterial(scene, `bubble-${icon}`, 96, 96, (g) => {
    g.fillStyle = '#fffaf2f0';
    g.beginPath(); g.arc(48, 44, 38, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(36, 76); g.lineTo(30, 92); g.lineTo(52, 80); g.fill();
    g.strokeStyle = '#3a3448aa'; g.lineWidth = 3; g.beginPath(); g.arc(48, 44, 38, 0, Math.PI * 2); g.stroke();
    g.font = '44px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, 48, 46);
  });
  bubbleCache.set(icon, m);
  return m;
}

/** The resident's (hidden) thought bubble, made with the resident so nothing is created during play. */
export function makeBubble(item) {
  const scene = item.root.getScene();
  item.bubble = billboard(scene, bubbleMaterial(scene, ICONS[0]), 0.42, 0.42, item.root);
  item.bubbleT = 0;
}

/** Show `icon` above the resident for `secs` (null hides). */
export function showBubble(item, icon, secs = 3) {
  if (!icon) { item.bubble.isVisible = false; item.bubbleT = 0; return; }
  item.bubble.material = bubbleMaterial(item.root.getScene(), icon);
  item.bubble.position.y = (item.look?.height || 1.6) + 0.32;
  item.bubble.isVisible = true;
  item.bubbleT = secs;
}

export function updateBubble(item, dt, near) {
  if (!item.bubble.isVisible) return;
  item.bubbleT -= dt;
  const s = 0.42 * Math.min(1, item.bubbleT * 3, 1);
  item.bubble.scaling.set(s, s, 1);
  if (item.bubbleT <= 0 || !near) item.bubble.isVisible = false;
}

/**
 * Draw every bubble icon and build the hand props up front, and compile
 * their shaders behind the loading screen (the first draw of an emoji is
 * slow, a first-time shader compile a visible hitch).
 */
export async function warmActs(scene) {
  kit ||= makeKit(scene);
  const icons = ICONS.map((i) => bubbleMaterial(scene, i));
  const probe = billboard(scene, icons[0], 1, 1, null);
  await Promise.all([
    icons[0].forceCompilationAsync(probe),
    ...Object.values(kit.meshes).map((m) => m.material.forceCompilationAsync(m, { useInstances: true })),
  ]);
  // The ambient-occlusion pass's variant (it needs the material ready first).
  const geometry = scene.geometryBufferRenderer;
  for (const m of Object.values(kit.meshes)) for (const sm of m.subMeshes) geometry?.isReady(sm, true);
  probe.dispose();
}

/** Free the shared props and bubble icons (the game is going away). */
export function disposeActs() {
  for (const m of bubbleCache.values()) { m.emissiveTexture.dispose(); m.dispose(); }
  bubbleCache.clear();
  if (!kit) return;
  for (const m of Object.values(kit.meshes)) m.dispose();
  for (const m of kit.materials) m.dispose();
  kit = null;
}
