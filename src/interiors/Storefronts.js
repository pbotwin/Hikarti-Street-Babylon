import { Effect, Matrix, Mesh, PBRMaterial, ReflectionProbe, ShaderMaterial, TransformNode, VertexData } from '@babylonjs/core';
import { linear } from './Products.js';
import { ROOM_H } from './InteriorKit.js';

/**
 * Shopfronts for every walk-in shop, seen from the street:
 *  - Glass windows that look INTO the shop. Each interior is photographed
 *    once into a cubemap (a ReflectionProbe in the middle of the room); the
 *    windows use "interior mapping": per pixel, the view ray is traced
 *    through a box the size of the real room and the cubemap is sampled
 *    where it lands. You see the actual shelves, fridges, tables or cars,
 *    with depth and parallax as you walk past, for the cost of one texture
 *    per shop type.
 *  - Glass sliding doors that glide open when she (or a resident) comes
 *    near, showing the shop through the opening. Walking through the open
 *    doors takes her inside.
 * The new front sits a hair in front of the old facade's ground floor, so
 * the painted windows and black door behind it are covered.
 */

Effect.ShadersStore.storefrontVertexShader = /* glsl */ `
  precision highp float;
  attribute vec3 position;
  uniform mat4 world;
  uniform mat4 viewProjection;
  uniform vec3 cameraPosition;
  varying vec3 vPos;
  varying vec3 vCam;
  void main() {
    vPos = position;
    vCam = (inverse(world) * vec4(cameraPosition, 1.0)).xyz;
    gl_Position = viewProjection * world * vec4(position, 1.0);
  }
`;
Effect.ShadersStore.storefrontFragmentShader = /* glsl */ `
  precision highp float;
  uniform samplerCube tCube;
  uniform vec3 uRoom;      // half width, height, depth of the room behind the glass
  uniform float uEye;      // height the cubemap was taken from
  uniform vec3 uTint;      // warm cast of the lit room through the glass
  uniform vec3 uSky;       // what the glass reflects above / below the horizon
  uniform vec3 uStreet;
  uniform float uReady;
  varying vec3 vPos;
  varying vec3 vCam;
  void main() {
    vec3 dir = normalize(vPos - vCam);
    // Exit point of the ray from the glass through the room box
    // x in [-w, w], y in [0, h], z in [-d, 0] (z = 0 is the glass).
    vec3 lo = vec3(-uRoom.x, 0.0, -uRoom.z), hi = vec3(uRoom.x, uRoom.y, 0.0);
    vec3 inv = 1.0 / dir;
    vec3 t1 = (lo - vPos) * inv, t2 = (hi - vPos) * inv;
    vec3 tf = max(t1, t2);
    float t = min(min(tf.x, tf.y), tf.z);
    vec3 hit = vPos + dir * t;
    // From the photo's position (room centre at eye height), into the
    // interior's own axes (its x and z run the other way).
    vec3 c = hit - vec3(0.0, uEye, -0.5 * uRoom.z);
    // Floor right behind the glass: look at it more steeply from the photo's
    // position (seen from the room centre it was smeared into streaks).
    if (hit.y < 0.02) c.xz *= 0.45;
    // Room axes and a right-handed ReflectionProbe's face layout together
    // make the lookup (x, -y, z), matched to the original's windows seen
    // from the same camera.
    vec3 col = textureCube(tCube, vec3(c.x, -c.y, c.z)).rgb;
    col = mix(vec3(0.55, 0.52, 0.5), col, uReady);
    // Glass: ~12% of the light is lost through it, and it reflects the
    // street (Schlick Fresnel: a little head-on, most of it at grazing
    // angles). The reflected ray keeps the view ray's height: rays heading
    // up see the sky, down the pavement, with a darker band of facades
    // across the horizon. A faint waviness breaks the mirror-flat look.
    col *= 0.88 * uTint;
    float up = dir.y + 0.015 * sin(vPos.x * 3.1 + sin(vPos.y * 1.7) * 2.0);
    vec3 refl = mix(uStreet, uSky, smoothstep(-0.25, 0.35, up));
    refl *= 1.0 - 0.45 * exp(-abs(up - 0.04) * 9.0);
    float fres = 0.08 + 0.92 * pow(1.0 - abs(dir.z), 5.0);
    col = mix(col, refl, fres);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const NONE = [];
const DOOR_W = 1.9, DOOR_H = 2.35, WIN_TOP = 2.55, HEADER = 0.42, SIDE = 2.7;

/** Boxes (w, h, d at x, y, z) merged into one geometry. */
function boxes(list) {
  const parts = list.map(([w, h, d, x, y, z]) => VertexData.CreateBox({ width: w, height: h, depth: d }).transform(Matrix.Translation(x, y, z)));
  const [first, ...rest] = parts;
  return first.merge(rest, true);
}

/** Quads facing +z (x0..x1, y0..y1 at z = 0) merged into one geometry. */
function quads(list) {
  const positions = [], indices = [];
  for (const [x0, x1, y0, y1] of list) {
    const i = positions.length / 3;
    positions.push(x0, y1, 0, x1, y1, 0, x0, y0, 0, x1, y0, 0);
    indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);   // front faces +z (Babylon's winding)
  }
  return Object.assign(new VertexData(), { positions, indices, normals: list.flatMap(() => [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]) });
}

export class Storefronts {
  constructor({ scene, collision, graphics }) {
    Object.assign(this, { scene, collision, graphics });
    this.fronts = [];
    this.cubes = {};       // template -> { probe, room }
    this.pending = [];     // templates whose photo for the windows is still to be taken
    this.materials = {};   // template -> ShaderMaterial (shared by its fronts)
    this.frameMat = new PBRMaterial('storefront:frame', scene);
    this.frameMat.albedoColor = linear('#3a3d42');
    this.frameMat.roughness = 0.4;
    this.frameMat.metallic = 0.5;
    this.glassMat = new PBRMaterial('storefront:glass', scene);
    this.glassMat.albedoColor = linear('#cfe3ec');
    this.glassMat.roughness = 0.05;
    this.glassMat.metallic = 0.2;
    this.glassMat.alpha = 0.16;
    this.glassMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    this.glassMat.environmentIntensity = 0.9;
    // Door leaves are the same everywhere: one geometry each, instanced.
    this._leafGlass = this._template('storefront:leafGlass', boxes([[DOOR_W / 2, DOOR_H - 0.06, 0.02, 0, DOOR_H / 2, 0]]), this.glassMat);
    this._leafFrames = [-1, 1].map((s) => this._template(`storefront:leafFrame${s}`, boxes([
      [DOOR_W / 2, 0.05, 0.04, 0, DOOR_H - 0.03, 0], [DOOR_W / 2, 0.05, 0.04, 0, 0.03, 0],
      [0.05, DOOR_H, 0.04, -DOOR_W / 4, DOOR_H / 2, 0], [0.05, DOOR_H, 0.04, DOOR_W / 4, DOOR_H / 2, 0],
      [0.03, 0.5, 0.05, -s * (DOOR_W / 4 - 0.12), 1.05, 0.03],   // push bar
    ]), this.frameMat));
    graphics.addCasters(this._leafFrames);
  }

  /** A source mesh for instances (itself never drawn). */
  _template(name, vd, mat) {
    const m = new Mesh(name, this.scene);
    vd.applyToMesh(m);
    m.material = mat;
    m.isVisible = false;
    m.isPickable = false;
    m.receiveShadows = true;
    return m;
  }

  /** The interior-mapped glass material for a template's room. */
  material(kind, room) {
    if (this.materials[kind]) return this.materials[kind];
    // HDR, linear (image processing happens after, on screen), mipmapped.
    const probe = new ReflectionProbe(`storefront:${kind}`, 256, this.scene, true, true, true);
    probe.refreshRate = 0;
    this.scene.removeReflectionProbe(probe);   // rendered by hand, once (capture)
    const m = new ShaderMaterial(`storefront:${kind}`, this.scene, 'storefront', {
      attributes: ['position'],
      uniforms: ['world', 'viewProjection', 'cameraPosition', 'uRoom', 'uEye', 'uTint', 'uSky', 'uStreet', 'uReady'],
      samplers: ['tCube'],
    });
    m.setTexture('tCube', probe.cubeTexture);
    m.setVector3('uRoom', { x: room.w / 2, y: ROOM_H, z: room.d });
    m.setFloat('uEye', 1.55);
    m.setColor3('uTint', linear('#fff1e2'));
    m.setColor3('uSky', linear('#e9c3a8'));      // the sunset horizon (fog colour)
    m.setColor3('uStreet', linear('#5a524c'));
    m.setFloat('uReady', 0);
    this.cubes[kind] = { probe, room };
    this.pending.push(kind);
    this.materials[kind] = m;
    return m;
  }

  /**
   * Photograph one interior from the middle of its room (into its cubemap).
   * `prepare` readies the room (stock, lights, staff) and returns the meshes
   * to draw; `restore` undoes it. Returns false (try again next frame) while
   * the room's shaders are still compiling.
   */
  capture(kind, prepare, restore) {
    const { probe, room } = this.cubes[kind];
    const meshes = prepare(room);
    const ready = meshes.every((m) => !m.isEnabled() || m.isReady(true));
    if (ready) {
      probe.position.set(room.origin.x, 1.55, room.origin.z + room.d / 2);
      probe.renderList.length = 0;
      probe.renderList.push(...meshes);
      // Outside the frame loop, for a room the main camera never drew: its
      // world matrices are computed here (parents first), and a new render id
      // makes the lights upload the shop lighting `prepare` set (they are
      // cached once per render id).
      for (const n of [room.group, ...room.group.getDescendants(false)]) n.computeWorldMatrix(true);
      this.scene.incrementRenderId();
      probe.cubeTexture.render();
      // From now on a plain cube texture: as the scene environment inside,
      // PBR materials would otherwise redraw it every frame (from inside the
      // room, sampling itself). Read as an environment, its z runs the
      // usual way (with the probe's invertZ the salon mirrors showed the
      // back wall instead of the shop floor).
      probe.cubeTexture.isRenderTarget = false;
      probe.cubeTexture.invertZ = false;
      this.materials[kind].setFloat('uReady', 1);
      this.pending.splice(this.pending.indexOf(kind), 1);
    }
    restore(room);
    return ready;
  }

  /**
   * Build the shopfront for `spot` whose door is at `door` (x, z) with the
   * street side `out` (unit x, z). Returns the front record.
   */
  add(spot, kind, room, door, out) {
    const c = this.collision;
    // Find the facade line: walk in from the door until we're inside the building.
    let depth = 0;
    for (let s = 0; s < 2.5; s += 0.05) {
      if (c.groundHeight(door.x - out.x * s, door.z - out.z * s, 0.02, 99, 999) > 2.2) { depth = s; break; }
    }
    // In front of whatever is drawn there. The old shopfronts stand proud of
    // the wall (collider) by a fixed amount per kind of building, which the
    // door's distance from the wall tells apart (measured with rays):
    //   city blocks (door 0.75 m out): windows 9 cm out of a 5 cm inset face
    //   street buildings (door 0.6 m out): frames, glass and piers to ~30 cm
    //   market halls (door 0.1 m out): flush
    const proud = depth > 0.7 ? 0.17 : depth > 0.45 ? 0.33 : 0.12;
    const fx = door.x - out.x * (depth - proud), fz = door.z - out.z * (depth - proud);
    const right = { x: out.z, z: -out.x };
    // How far the facade runs either side of the door (stop at a corner).
    const extent = (sgn) => {
      let e = 0;
      for (let s = 0.2; s <= SIDE + DOOR_W / 2 + 0.05; s += 0.1) {
        const px = fx - out.x * 0.25 + right.x * s * sgn, pz = fz - out.z * 0.25 + right.z * s * sgn;
        if (c.groundHeight(px, pz, 0.02, 99, 999) < 2.2) break;
        e = s;
      }
      return e;
    };
    // The whole shopfront of this building: its own collision box (each
    // building has one, so neighbours' fronts are left alone), less the
    // corner piers; capped at 8 m either side of the door.
    let eL = Math.min(extent(-1), SIDE + DOOR_W / 2), eR = Math.min(extent(1), SIDE + DOOR_W / 2);
    const px = fx - out.x * (proud + 0.3), pz = fz - out.z * (proud + 0.3);   // just inside the wall
    const box = c.boxes.filter((b) => b.maxY > 2.5 && px > b.minX && px < b.maxX && pz > b.minZ && pz < b.maxZ
      && b.maxX - b.minX > 3 && b.maxZ - b.minZ > 3).sort((a, b) => (a.maxX - a.minX) * (a.maxZ - a.minZ) - (b.maxX - b.minX) * (b.maxZ - b.minZ))[0];
    if (box) {
      // Box ends along the facade, measured from the door along `right`.
      const ends = [[box.minX, box.minZ], [box.maxX, box.maxZ]].map(([x, z]) => (x - fx) * right.x + (z - fz) * right.z);
      const lo = Math.min(...ends), hi = Math.max(...ends);
      eL = Math.min(8, Math.max(DOOR_W / 2, -lo - 0.5));
      eR = Math.min(8, Math.max(DOOR_W / 2, hi - 0.5));
    }

    const g = new TransformNode(`storefront:${spot.name}`, this.scene);
    g.position.set(fx, 0, fz);
    g.rotation.y = Math.atan2(out.x, out.z);
    g.computeWorldMatrix(true);
    const mat = this.material(kind, room);

    // Glass that looks into the room: windows either side + the doorway.
    const panes = [[-eL, -DOOR_W / 2 - 0.06, 0.32, WIN_TOP], [DOOR_W / 2 + 0.06, eR, 0.32, WIN_TOP], [-DOOR_W / 2, DOOR_W / 2, 0.0, DOOR_H]]
      .filter(([x0, x1]) => x1 - x0 >= 0.25);
    const win = new Mesh(`storefront:${spot.name}:glass`, this.scene);
    quads(panes).applyToMesh(win);
    win.material = mat;
    win.parent = g;
    win.position.z = 0.012;
    // Frame: kick plates, mullions, door frame, header band over the old glass.
    const bars = [];
    const bar = (w, h, x, y, d = 0.08) => { if (w > 0.01) bars.push([w, h, d, x, y, 0.03]); };
    const span = eL + eR;
    bar(span, HEADER, (eR - eL) / 2, WIN_TOP + HEADER / 2);
    bar(eL - DOOR_W / 2, 0.32, (-eL - DOOR_W / 2) / 2, 0.16);
    bar(eR - DOOR_W / 2, 0.32, (eR + DOOR_W / 2) / 2, 0.16);
    for (const x of [-eL, -DOOR_W / 2 - 0.03, DOOR_W / 2 + 0.03, eR]) bar(0.07, WIN_TOP, x, WIN_TOP / 2);
    bar(DOOR_W + 0.1, WIN_TOP - DOOR_H, 0, (WIN_TOP + DOOR_H) / 2);
    for (let x = -eL + 1.3; x < -DOOR_W / 2 - 0.5; x += 1.3) bar(0.05, WIN_TOP - 0.32, x, (WIN_TOP + 0.32) / 2, 0.06);
    for (let x = DOOR_W / 2 + 1.3; x < eR - 0.5; x += 1.3) bar(0.05, WIN_TOP - 0.32, x, (WIN_TOP + 0.32) / 2, 0.06);
    const frame = new Mesh(`storefront:${spot.name}:frame`, this.scene);   // one draw for the whole frame
    boxes(bars).applyToMesh(frame);
    frame.material = this.frameMat;
    frame.parent = g;
    frame.receiveShadows = true;
    for (const m of [win, frame]) { m.isPickable = false; m.freezeWorldMatrix(); }
    this.graphics.addCasters([frame]);
    // Sliding doors: two glass leaves with frames and push bars.
    const leaves = [-1, 1].map((s, i) => {
      const leaf = new TransformNode(`storefront:${spot.name}:leaf${i}`, this.scene);
      leaf.parent = g;
      for (const src of [this._leafGlass, this._leafFrames[i]]) src.createInstance(`${leaf.name}:${src.name}`).parent = leaf;
      const closed = s * DOOR_W / 4;
      leaf.position.set(closed, 0, 0.07);
      leaf.metadata = { closed, open: s * (DOOR_W * 0.75 + 0.02) };
      return leaf;
    });
    const front = { spot, kind, group: g, leaves, open: 0, out, right, door: { x: fx, z: fz }, proud, depth };
    this.fronts.push(front);
    return front;
  }

  /**
   * Per frame: doors open for anyone near (`others`: residents, with a
   * position); returns the front she is walking into (doors open, at the threshold, heading in), if any.
   */
  update(dt, player, others = NONE) {
    let walkIn = null;
    const p = player.position;
    for (const f of this.fronts) {
      const dx = p.x - f.door.x, dz = p.z - f.door.z;
      const along = dx * f.right.x + dz * f.right.z, outD = dx * f.out.x + dz * f.out.z;
      let near = outD > -0.2 && outD < 3.2 && Math.abs(along) < 1.8 && Math.abs(p.y) < 1.5;
      if (!near) {
        for (const { position: o } of others) {
          const ox = o.x - f.door.x, oz = o.z - f.door.z;
          if (Math.abs(ox * f.right.x + oz * f.right.z) < 1.4 && Math.abs(ox * f.out.x + oz * f.out.z) < 2.2) { near = true; break; }
        }
      }
      const target = near ? 1 : 0;
      const was = f.open;
      f.open += (target - f.open) * (1 - Math.exp(-(near ? 7 : 4) * dt));
      if (Math.abs(f.open - was) > 1e-5) {
        const k = f.open * f.open * (3 - 2 * f.open);
        for (const l of f.leaves) l.position.x = l.metadata.closed + (l.metadata.open - l.metadata.closed) * k;
      }
      // Walking in: at the threshold, doors open, moving toward the shop.
      // (Her intent, not her speed: the wall stops her at the threshold.)
      const mv = player.input?.move;
      const pushing = mv && Math.hypot(mv.x, mv.y) > 0.3;
      const facingIn = -(Math.sin(player.yaw) * f.out.x + Math.cos(player.yaw) * f.out.z);
      if (f.open > 0.75 && outD < 1.0 && Math.abs(along) < DOOR_W / 2 - 0.05 && pushing && facingIn > 0.5) walkIn = f;
    }
    return walkIn;
  }
}

