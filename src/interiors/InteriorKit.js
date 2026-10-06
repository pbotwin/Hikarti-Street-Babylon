import { DynamicTexture, SceneLoader, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { ProductSet } from './Products.js';
import { FONT } from './Labels.js';

/**
 * Walk-in shop interiors, runtime side. The rooms themselves (shell,
 * fixtures, lights, with the original's realistic surfaces: textures, the
 * floor's baked contact shadows, wall AO) were built by the original game's
 * templates and exported once (public/world/interior-<kind>.opt.glb); their
 * layout comes with them (city.json `rooms`), and so do the decorative
 * goods, as data, built here as printed products. Each room sits in its own
 * group (local x across, z inward; the entrance is at z = 0 facing +z) at a
 * world origin far outside the city; its colliders are in the city's
 * collision boxes. What can be done where:
 *   slots     shelf facings that hold one product line (category: drink,
 *             food, read, top, bottom, shoes) — stocked per shop on entry
 *   counter   where she pays (stand point, register, cashier spot)
 *   seats     chairs / stools / the salon chair (stand point, seat, facing)
 *   doors     sliding glass door panels; `exit` is the trigger inside the door
 */

export const ROOM_H = 3.3;   // ceiling height
// Metal is the ceiling's light-panel trims (their shadow mottled every wall
// and fridge) plus handles and legs too thin to matter.
const NO_CAST = /floor|ceiling|wall|light|glow|glass|mirror|metal|sign|street-view/;

/** Walk-in templates by shop kind. */
export const TEMPLATE_OF = {
  konbini: 'market', market: 'market', drugstore: 'market',
  cafe: 'cafe', bakery: 'cafe', ramen: 'cafe', foodhall: 'cafe', tea: 'cafe',
  boutique: 'boutique', books: 'books', salon: 'salon', motors: 'motors',
};

/**
 * Load one room: its group (disabled until she walks in), the moving parts
 * (doors, turntable), the name sign, the street-view panel, and the layout.
 * `casters` receives meshes that should cast shadows.
 */
export async function loadRoom(scene, data, { casters }) {
  const { kind, origin } = data;
  const group = new TransformNode(`interior:${kind}`, scene);
  group.position.set(origin.x, 0, origin.z);
  group.computeWorldMatrix(true);
  const res = await SceneLoader.ImportMeshAsync('', './world/', `interior-${kind}.opt.glb`, scene);
  const gltfRoot = res.meshes.find((m) => m.name === '__root__');
  for (const n of [...gltfRoot.getChildren()]) n.setParent(group);
  gltfRoot.dispose();
  const node = (re) => [...res.transformNodes, ...res.meshes].find((n) => !n.isDisposed() && re.test(n.name));
  const doors = data.doors.map((d, i) => {
    const door = node(new RegExp(`^door-${i}$`));
    door.metadata = { closedX: d.closedX, openX: d.openX };
    return door;
  });
  const turntable = data.turntable ? node(/^turntable$/) : null;
  const moving = new Set([...doors, turntable].filter(Boolean));
  const movingPart = (m) => { for (let p = m.parent; p; p = p.parent) if (moving.has(p)) return p; return null; };
  for (const m of res.meshes) {
    if (m.isDisposed() || !m.getTotalVertices()) continue;
    m.isPickable = false;
    m.receiveShadows = true;
    const mat = m.material;
    // Lit by the room's own photo inside (the original's envMapIntensity: glass 1.6, the rest 1).
    if (mat) mat.environmentIntensity = /glass/.test(mat.name) ? 1.6 : 1;
    // Glass reflections fade with its opacity, as in the original (Babylon
    // keeps them at full strength by default: fridge doors looked misted).
    if (mat?.alpha < 1) mat.useRadianceOverAlpha = mat.useSpecularOverAlpha = false;
    // Fixtures and the car on show cast (shadows straight down under shelves
    // and tables); the shell, lights, glass and signs don't, like the original.
    const part = movingPart(m);
    if (!part || part === turntable) { if (!NO_CAST.test(mat?.name || '') && mat?.alpha === 1) casters.push(m); }
    if (!part) m.freezeWorldMatrix();
  }
  const nameSign = node(/^name-sign$/);
  const view = node(/street-view$/);
  const room = {
    ...data, group, doors, turntable, nameSign,
    viewMat: view.material,
    goods: null, filler: null,
    meshes: res.meshes.filter((m) => !m.isDisposed() && m.getTotalVertices() > 0),
  };
  const onMesh = (m) => { casters.push(m); room.meshes.push(m); };
  room.goods = new ProductSet(group, { onMesh });
  // Decorative goods (never interactive), printed like the stock.
  room.filler = new ProductSet(group, { onMesh });
  for (const [shape, color, x, y, z, ry, scale, label] of data.filler) room.filler.add(shape, color, x, y, z, ry, scale, label);
  room.filler.build();
  for (const g of room.filler.groups.values()) g.mesh.freezeWorldMatrix();
  group.setEnabled(false);
  return room;
}

// ---------------------------------------------------------------- signs
/** Paint a shop sign (the original's Textures.sign, centred layout). */
function paintSign(g, { text, sub = '', bg, fg, accent, w, h, font }) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  g.fillRect(0, h - h * 0.14, w, h * 0.14);
  g.fillRect(0, 0, w, h * 0.06);
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  // Fit the title to the available width.
  let fs = font;
  g.font = `800 ${fs}px ${FONT}`;
  const maxW = w * 0.86;
  if (g.measureText(text).width > maxW) { fs *= maxW / g.measureText(text).width; g.font = `800 ${fs}px ${FONT}`; }
  g.textAlign = 'center';
  g.fillText(text, w / 2, sub ? h * 0.4 : h * 0.47);
  if (sub) {
    g.font = `700 ${fs * 0.34}px ${FONT}`;
    g.globalAlpha = 0.8;
    g.fillText(sub, w / 2, h * 0.74);
    g.globalAlpha = 1;
  }
}

/**
 * Re-letter a room's name sign for the shop she walked into. One canvas
 * texture per room, repainted (the exported sign texture is replaced once).
 */
export function letter(room, name, sub, color) {
  const mat = room.nameSign.material;
  if (!room.signTex) {
    const tex = new DynamicTexture(`sign:${room.kind}`, { width: 1024, height: 224 }, room.group.getScene(), true);
    tex.anisotropicFilteringLevel = 4;
    for (const k of ['albedoTexture', 'emissiveTexture']) { if (mat[k] && mat[k] !== tex) mat[k].dispose(); mat[k] = tex; }
    room.signTex = tex;
  }
  const tex = room.signTex;
  paintSign(tex.getContext(), { text: name.toUpperCase(), sub, bg: color, fg: '#fff6df', accent: '#f6d3a0', w: 1024, h: 224, font: 86 });
  tex.update();
}
