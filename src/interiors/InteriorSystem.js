import {
  Camera, Color3, Constants, Matrix, Mesh, PBRMaterial, Quaternion, RenderTargetTexture, StandardMaterial,
  TargetCamera, TransformNode, Vector3, VertexData,
} from '@babylonjs/core';
import { Phase } from '../core/GameState.js';
import { ITEMS, SHOPS, WEARABLE } from '../gameplay/ShopData.js';
import { ROOM_H, TEMPLATE_OF, letter, loadRoom } from './InteriorKit.js';
import { linear, lookFor, productMesh, SHAPE_W, torus } from './Products.js';
import { createResident, animateResident, eulerToRef } from '../npcs/NPCModels.js';
import { BASKET_HAND } from '../player/CharacterAnimation.js';
import { ToonPlugin } from '../player/Vrm.js';
import { Storefronts } from './Storefronts.js';

/**
 * Walk-in shops, like a shop simulator:
 *  - At a storefront, "Enter" (F / tap): the sliding doors part, a chime,
 *    and she is inside (the city is hidden meanwhile; nothing outside is
 *    drawn, so it costs less than the street).
 *  - Walk the aisles; at a shelf, "Take" makes her reach for that exact
 *    product (arm IK), lift it and drop it into the basket on her arm.
 *    Clothes are tried on as she takes them.
 *  - At the register the basket goes on the counter, the cashier scans each
 *    item (beep), bags them and bows; she takes the bag. Unpaid items can't
 *    leave the shop (put them back from the basket list).
 *  - Cafés: sit at a table or the window bar and eat / drink what you
 *    bought (hand to mouth, bites); that is when the treat's boost starts.
 *    Bookshop: read in the armchair. Salon: sit, pick a colour, and the
 *    stylist works on her hair.
 * The basket, bag, keys and sparkle are made once and reused; products in
 * her hand share the shelf products' geometry and materials.
 */

const CAT_OF = { drink: 'drink', food: 'food', read: 'read', top: 'top', bottom: 'bottom', shoes: 'shoes' };
const _a = new Vector3(), _b = new Vector3(), _c = new Vector3();
const _q = new Quaternion();
const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** three.js Euler 'XYZ' as a quaternion (scratch: use before the next call). */
const eulerXYZ = (x, y, z) => eulerToRef(x, y, z, 'XYZ', _q);

/** World position of a node, with its ancestors' matrices brought up to date first. */
const _chain = [];
function worldPos(node, out) {
  _chain.length = 0;
  for (let n = node; n; n = n.parent) _chain.push(n);
  for (let i = _chain.length - 1; i >= 0; i--) _chain[i].computeWorldMatrix(true);
  return out.copyFrom(node.getAbsolutePosition());
}

const CASHIER_LOOKS = {
  market: { base: 'girl_apron', hair: '#3a2a24', top: '#59b37a', bottom: '#2b2b33', height: 1.6 },
  cafe: { base: 'boy_uniform', hair: '#2a2420', top: '#f2ede4', bottom: '#5b4636', height: 1.72 },
  boutique: { base: 'girl_dress', hair: '#c98a6a', top: '#e79ab4', bottom: '#f6f0ea', height: 1.62 },
  books: { base: 'boy_hoodie', hair: '#3b3330', top: '#738698', bottom: '#33363c', height: 1.7 },
  salon: { base: 'girl_long', hair: '#8f7cc0', top: '#2b2b33', bottom: '#2b2b33', height: 1.64 },
  motors: { base: 'boy_uniform', hair: '#2a2420', top: '#3b4a6b', bottom: '#2b2b33', height: 1.74 },
};
// Market stall vendors (street): stall centre, front direction, and look.
const STALL_VENDORS = {
  'Momo Fruit': { x: -24, z: 74.8, yaw: 0, look: { base: 'girl_apron', hair: '#5a3a2a', top: '#e0525e', bottom: '#5b4636', height: 1.58 } },
  'Thread + Needle': { x: 24, z: 74.8, yaw: 0, look: { base: 'girl_dress', hair: '#2b2b33', top: '#6e94a1', bottom: '#d8c3a5', height: 1.6 } },
  'Sunday Records': { x: -23, z: 100, yaw: Math.PI, look: { base: 'boy_hoodie', hair: '#3b3330', top: '#d89270', bottom: '#33363c', height: 1.72 } },
};

export class InteriorSystem {
  constructor({ scene, collision, state, player, animation, character, cameraRig, lighting, gfx, shops, ui, input, audio, minimap, vehicles = null, carLights = null, npcs = null, world = null }) {
    Object.assign(this, { scene, collision, state, player, animation, character, cameraRig, lighting, gfx, shops, ui, input, audio, minimap, vehicles, carLights, npcs, world });
    this.vendors = {};
    this.rooms = {};
    this.inside = null;       // { room, kind, spot, back: {x,z,yaw} }
    this.busy = false;        // an action is playing (controls off)
    this.seated = null;
    this.basket = [];         // [{ id, unit, mesh }]
    this.bag = null;          // paid shopping bag in her right hand
    this.anims = [];          // running timelines
    this.held = null;         // product in her right palm: { mesh }
    this.heldBag = null;      // paid bag hanging from her right hand
    this.time = 0;
    this.ready = false;
    this._buildDom();
    this._events();
  }

  /** Load every interior (call once the residents' models are loaded). */
  async init() {
    const casters = [];
    const rooms = await Promise.all(Object.values(this.world.rooms).map((data) => loadRoom(this.scene, data, { casters })));
    for (const room of rooms) this.rooms[room.kind] = room;
    // Staff: a resident behind each counter.
    await Promise.all(rooms.map(async (room) => {
      const look = CASHIER_LOOKS[room.kind];
      try {
        const r = await createResident({ ...look, gender: /boy/.test(look.base) ? 'm' : 'f' });
        r.blinkSeed = Math.random();
        room.staff = r;
        const c = room.counter.cashier;
        r.root.parent = room.group;
        r.root.position.set(c.x, 0, c.z);
        r.root.rotation.y = c.yaw;
        room.staffHome = { x: c.x, z: c.z, yaw: c.yaw };
        casters.push(...r.casters);
      } catch (e) { console.warn('shop staff', e); }
    }));
    // Market stall vendors stand behind their counters in the street.
    await Promise.all(Object.entries(STALL_VENDORS).map(async ([name, v]) => {
      try {
        const r = await createResident({ ...v.look, gender: /boy/.test(v.look.base) ? 'm' : 'f' });
        r.blinkSeed = Math.random();
        this.gfx.addCasters(r.casters);
        const bx = -Math.sin(v.yaw) * 0.55, bz = -Math.cos(v.yaw) * 0.55;
        r.root.position.set(v.x + bx, 0.15, v.z + bz);
        r.root.rotation.y = v.yaw;
        this.vendors[name] = { r, stall: v };
      } catch (e) { console.warn('stall vendor', e); }
    }));
    this.gfx.addCasters(casters);
    this._props();
    this._buildFronts();
    await this._warmUp();
    this.ready = true;
  }

  /**
   * Shopfronts at every walk-in shop's real door (from the places registry),
   * then one photo of each interior for the windows.
   */
  _buildFronts() {
    this.fronts = new Storefronts({ scene: this.scene, collision: this.collision, graphics: this.gfx });
    const doors = this.world.places.filter((p) => p.type === 'shop' && p.inside);
    const sample = {};
    for (const spot of this.shops.spots) {
      const kind = TEMPLATE_OF[spot.shop];
      if (!kind || spot.stall || !this.rooms[kind]) continue;
      const door = doors.map((d) => ({ d, k: Math.hypot(d.x - spot.x, d.z - spot.z) })).sort((a, b) => a.k - b.k)[0];
      if (!door || door.k > 5) continue;
      let ox = door.d.x - door.d.inside.x, oz = door.d.z - door.d.inside.z;
      const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
      // The prompt, the doors and the way in are all at the real door.
      spot.x = door.d.x; spot.z = door.d.z;
      spot.front = this.fronts.add(spot, kind, this.rooms[kind], { x: door.d.x, z: door.d.z }, { x: ox, z: oz });
      sample[kind] ||= spot;
    }
    this._sample = sample;
  }

  _staffMeshes(room) { return room.staff ? room.staff.meshes : []; }

  /**
   * Compile every shader the shops will use while the loading screen is up
   * (rooms stocked as the window photos will show them, staff, the things
   * she carries), so nothing compiles in play.
   */
  async _warmUp() {
    const jobs = [];
    const compile = (m) => { if (m.material && m.getTotalVertices() > 0) jobs.push(m.material.forceCompilationAsync(m, { useInstances: m.hasThinInstances || m.hasInstances })); };
    for (const room of Object.values(this.rooms)) {
      const spot = this._sample[room.kind];
      if (spot) this._stock(room, spot);
      room.group.setEnabled(true);
      for (const m of [...room.meshes, ...this._staffMeshes(room)]) compile(m);
    }
    const held = productMesh(this.scene, 'ramune');
    for (const m of [held, ...this._basketNode.getChildMeshes(), ...this._bagNode.getChildMeshes(), ...this._keysNode.getChildMeshes(), this._sparkleMesh]) compile(m);
    await Promise.all(jobs);
    held.dispose();
    for (const room of Object.values(this.rooms)) room.group.setEnabled(false);
  }

  /**
   * Window photos are taken after loading, one shop type per frame. The same
   * photo becomes the room's reflection and bounce light (scene environment
   * while she is inside); the shaders that use it are started here, not on
   * her first step inside.
   */
  _capturePending() {
    const kind = this.fronts?.pending[0];
    // Not before the first frames are drawn: until then the lights' shader
    // data isn't set up and the photo comes out unlit.
    if (!kind || this.scene.getFrameId() < 3) return;
    const room = this.rooms[kind];
    const show = (on) => {
      if (on) {
        const spot = this._sample[room.kind];
        if (spot) this._stock(room, spot);
      }
      room.group.setEnabled(on);
      this._indoor(on, room);
    };
    const meshes = [...room.meshes, ...this._staffMeshes(room)];
    const done = this.fronts.capture(kind, () => {
      show(true);
      // The cascades follow the street camera: out here every surface would
      // read as shadowed. The photo is lit by the shop lights alone.
      this.gfx.shadows.darkness = 1;
      return meshes;
    }, () => {
      this.gfx.shadows.darkness = this._light.darkness;
      show(false);
    });
    if (!done) return;
    room.env = this.fronts.cubes[kind].probe.cubeTexture;
    show(true);
    for (const m of [...meshes, ...this.character.meshes]) m.isReady(true);
    show(false);
  }

  /** Whether this shop kind has a walk-in interior. */
  hasInterior(spot) { return this.ready && !!TEMPLATE_OF[spot?.shop] && !spot.stall; }

  /** Interior bounds (world), so the play-area safety net leaves her alone. */
  contains(p) {
    return Object.values(this.rooms).some((r) => Math.abs(p.x - r.origin.x) < r.w / 2 + 1 && p.z > r.origin.z - 1 && p.z < r.origin.z + r.d + 1);
  }

  /** Where she should be if the game is saved while inside: back on the street. */
  returnSpot() { return this.inside?.back || null; }

  // ------------------------------------------------------------ enter / leave
  enter(spot) {
    const kind = TEMPLATE_OF[spot.shop];
    const room = this.rooms[kind];
    if (!room || this.inside || this._fading) return;
    const p = this.player.position;
    const back = { x: p.x, y: p.y, z: p.z, yaw: this.player.yaw + Math.PI };
    this._fade(() => {
      this._captureView(room, back);
      this.inside = { room, kind, spot, back, def: SHOPS[spot.shop] };
      this._stock(room, spot);
      letter(room, spot.name, this._subtitle(spot), SHOPS[spot.shop].color);
      this._hideWorld(true);
      room.group.setEnabled(true);
      for (const d of room.doors) d.position.x = d.metadata.openX;
      this._indoor(true, room);
      const e = room.entry;
      this._place(room.origin.x + e.x, room.origin.z + e.z, e.yaw);
      this.cameraRig.zoomTarget = 0.72;
      document.documentElement.dataset.interior = kind;
      this.hint.textContent = `${spot.name} · walk back out through the door to leave`;
      this._chime();
      this.state.emit('shop:open', { shop: spot.shop, name: spot.name });
      this.state.emit('interior:enter', { name: spot.name, kind });
    });
  }

  leave(instant = false) {
    if (!this.inside) return;
    const go = () => {
      const { room, back } = this.inside;
      this._standUp(true);
      this._dropBasket();
      if (this.bag) this._putBagAway(true);
      this.shops.previewOutfit(null);
      room.group.setEnabled(false);
      this._hideWorld(false);
      this._indoor(false);
      this.cameraRig.zoomTarget = 1;
      this._place(back.x, back.z, back.yaw, back.y);
      delete document.documentElement.dataset.interior;
      if (this._unlock) { const v = this._unlock; this._unlock = null; setTimeout(() => this._chirp(v), 700); }
      this.inside = null;
      this.busy = false;
      this.anims.length = 0;
      this.state.emit('interior:leave');
    };
    if (instant) go(); else this._fade(go);
  }

  /**
   * Photograph the street from just outside the door, looking out, onto the
   * room's shopfront windows (one render, while the screen is faded).
   */
  _captureView(room, back) {
    const scene = this.scene;
    const aspect = room.w / ROOM_H;
    const W = 1024, H = Math.round(W / aspect);
    if (!this._viewRT) {
      // HDR and linear like the screen buffer: the post pipeline grades it with the rest.
      this._viewRT = new RenderTargetTexture('streetView', { width: W, height: H }, scene, false, true, Constants.TEXTURETYPE_HALF_FLOAT);
      this._viewRT.gammaSpace = false;
      this._viewCam = new TargetCamera('streetView', Vector3.Zero(), scene, false);
      this._viewRT.activeCamera = this._viewCam;
    }
    if (this._viewRT.getSize().height !== H) this._viewRT.resize({ width: W, height: H });
    const cam = this._viewCam;
    cam.freezeProjectionMatrix(Matrix.PerspectiveFovRH(48 * Math.PI / 180, aspect, 0.2, 420, scene.getEngine().isNDCHalfZRange));
    const fx = Math.sin(back.yaw), fz = Math.cos(back.yaw);
    // A step out from the door (never back into the building's own walls).
    cam.position.set(back.x + fx * 0.35, (back.y || 0) + 1.55, back.z + fz * 0.35);
    cam.setTarget(_a.set(cam.position.x + fx, cam.position.y - 0.04, cam.position.z + fz));
    const root = this.character.root;
    const was = root.isEnabled(false);
    root.setEnabled(false);
    this._viewRT.renderList = scene.meshes.filter((m) => m.isEnabled() && m.isVisible && m.getTotalVertices() > 0);
    this._viewRT.render();
    this._viewRT.renderList = [];
    root.setEnabled(was);
    room.viewMat.albedoTexture = this._viewRT;
    room.viewMat.albedoColor = Color3.White();
  }

  _subtitle(spot) {
    return { konbini: 'OPEN 24 HOURS', market: 'FRESH · LOCAL', drugstore: 'HEALTH · DRINKS', cafe: 'COFFEE · SWEETS', bakery: 'FRESH EVERY MORNING',
      ramen: 'RAMEN · RICE', foodhall: 'TAKOYAKI · BENTO', tea: 'DRINKS + FLOATS', boutique: 'CLOTHES · SHOES', books: 'BOOKS · MAGAZINES', salon: 'HAIR COLOUR' }[spot.shop] || '';
  }

  _place(x, z, yaw, y = 0) {
    const pl = this.player;
    pl.spawn(x, z, yaw);
    pl.position.y = pl.visualY = y;
    pl._sync?.();
    this.cameraRig.snapBehind(pl);
  }

  /** Fade to white, run `mid`, fade back (the graphics' screen fade). */
  _fade(mid) {
    this._fading = true;
    const fade = (k) => this.gfx.setFade(k, '#fff8ef');
    this.anims.push({ t: 0, d: 0.32, step: (k) => fade(ease(k)), done: () => {
      mid();
      this.anims.push({ t: 0, d: 0.4, step: (k) => fade(1 - ease(k)), done: () => { fade(0); this._fading = false; } });
    } });
  }

  /** Inside, nothing of the city is drawn: every top-level node but her, the rooms, lights and cameras is switched off. */
  _hideWorld(hide) {
    if (hide) {
      const keep = new Set([this.character.root, ...Object.values(this.rooms).map((r) => r.group)]);
      this._hidden = [];
      for (const o of this.scene.rootNodes) {
        if (keep.has(o) || o instanceof Camera || o.getClassName().endsWith('Light') || !o.isEnabled(false)) continue;
        o.setEnabled(false);
        this._hidden.push(o);
      }
    } else {
      for (const o of this._hidden || []) o.setEnabled(true);
      this._hidden = null;
    }
  }

  /**
   * Shop lighting, restored on leaving: the ceiling panels as a near-vertical
   * key light (shadows straight down under shelves and tables), the room's
   * own photo as reflections and bounce light (once taken), and no ink
   * outlines: the shop is meant to look like a real room.
   */
  _indoor(on, room = null) {
    const L = this.lighting, scene = this.scene;
    if (on) {
      this._light = {
        dir: L.sunDir.clone(), color: L.sun.diffuse, spec: L.sun.specular, i: L.sun.intensity, sky: L.hemi.diffuse, ground: L.hemi.groundColor, hi: L.hemi.intensity,
        toonSun: ToonPlugin.sun.clone(), toonAmb: ToonPlugin.ambient.clone(),
        rays: this.gfx.raysAllowed, env: scene.environmentTexture, envI: scene.environmentIntensity, darkness: this.gfx.shadows.darkness,
        ink: this.character.meshes.filter((m) => m.renderOutline),
      };
      L.sunDir.set(0.12, 0.97, 0.2).normalize();
      // The original's shop rig, in linear colours like Graphics' sunset rig.
      L.sun.diffuse = Color3.FromHexString('#fff4e8').toLinearSpace();
      L.hemi.diffuse = Color3.FromHexString('#f6f7ff').toLinearSpace(); L.hemi.groundColor = Color3.FromHexString('#d9d1c4').toLinearSpace();
      // Without a reflection map yet, the hemisphere light carries the fill.
      const env = room?.env || null;
      L.sun.intensity = env ? 1.9 : 2.2;
      L.hemi.intensity = env ? 0.55 : 1.5;
      L.sun.specular = L.sun.diffuse;
      // Her toon bands take the shop light too (as Graphics derives them from its rig).
      ToonPlugin.sun.copyFrom(L.sun.diffuse).scaleInPlace(L.sun.intensity / Math.PI);
      ToonPlugin.ambient.copyFrom(L.hemi.diffuse).addInPlace(L.hemi.groundColor).scaleInPlace(0.5 * L.hemi.intensity / Math.PI);
      // No photo yet: no reflections (the sky's would light the room orange).
      if (env) scene.environmentTexture = env;
      scene.environmentIntensity = env ? 0.85 : 0;
      for (const m of this._light.ink) m.renderOutline = false;
      this.gfx.raysAllowed = false;
    } else if (this._light) {
      const s = this._light;
      L.sunDir.copyFrom(s.dir); L.sun.diffuse = s.color; L.sun.specular = s.spec; L.sun.intensity = s.i;
      ToonPlugin.sun.copyFrom(s.toonSun); ToonPlugin.ambient.copyFrom(s.toonAmb);
      L.hemi.diffuse = s.sky; L.hemi.groundColor = s.ground; L.hemi.intensity = s.hi;
      scene.environmentTexture = s.env; scene.environmentIntensity = s.envI;
      for (const m of s.ink) m.renderOutline = true;
      this.gfx.raysAllowed = s.rays;
      this._light = null;
    }
    // The light shines along -sunDir, from far out along it (shadow frustum).
    L.sunDir.scaleToRef(-1, L.sun.direction);
    L.sunDir.scaleToRef(120, L.sun.position);
  }

  /** Put this shop's goods on the room's shelves (decor fills the rest). */
  _stock(room, spot) {
    room.goods.clear();
    const stock = SHOPS[spot.shop].stock.filter((id) => ITEMS[id]);
    const byCat = {};
    for (const id of stock) (byCat[CAT_OF[ITEMS[id].kind]] ||= []).push(id);
    const counters = {};
    for (const s of room.slots) {
      s.units = [];
      const list = byCat[s.cat];
      s.item = list?.length ? list[(counters[s.cat] = (counters[s.cat] ?? -1) + 1) % list.length] : null;
      if (!s.item) continue;
      const look = lookFor(s.item);
      const w = SHAPE_W[look.shape] || 0.15;
      const n = Math.max(1, Math.min(12, Math.floor(s.len / (w + s.gap))));
      const ax = Math.cos(s.ry), az = -Math.sin(s.ry), nx = Math.sin(s.ry), nz = Math.cos(s.ry);
      const ox = room.origin.x, oz = room.origin.z;
      for (let i = 0; i < n; i++) {
        const u = (i - (n - 1) / 2) * (s.len / n);
        for (let k = 0; k < s.depth; k++) {
          const back = -k * 0.13;
          const unit = room.goods.add(look.shape, look.color, s.x + ax * u + nx * back, s.y, s.z + az * u + nz * back, s.ry);
          unit.world = { x: ox + s.x + ax * u + nx * back, y: s.y, z: oz + s.z + az * u + nz * back };
          unit.row = k;
          s.units.push(unit);
        }
      }
    }
    room.goods.build();
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.time += dt;
    // Timelines (fades, picks, checkout).
    for (let i = 0; i < this.anims.length; i++) {
      const a = this.anims[i];
      a.t += dt;
      a.step?.(Math.min(1, a.t / a.d), dt);
      if (a.t >= a.d) { this.anims.splice(i--, 1); a.done?.(); }
    }
    // Stall vendors (street): idle, glancing at her when she's near.
    for (const name in this.vendors) {
      const { r, stall } = this.vendors[name];
      if (r.busy) continue;
      const p = this.player.position;
      const dx = p.x - r.root.position.x, dz = p.z - r.root.position.z, d = Math.hypot(dx, dz);
      if (d > 45) continue;
      const look = clamp(Math.atan2(dx, dz) - stall.yaw, -1, 1);
      r.lookYaw = lerp(r.lookYaw || 0, d < 6 ? look : 0, 1 - Math.exp(-4 * dt));
      animateResident(r, this.time, { look: r.lookYaw, gender: 'f' });
      if (r.bow > 0) this._bow(r, dt);
    }
    if (this.inside?.room.turntable) this.inside.room.turntable.rotation.y += dt * 0.25;
    // Shopfront doors slide open for her and passing residents; walking
    // through an open door takes her in.
    if (this.fronts && !this.inside && !this._fading) this._capturePending();
    if (this.fronts && !this.inside) {
      const walkIn = this.fronts.update(dt, this.player, this.npcs?.items);
      if (walkIn && !this.busy && !this._fading && this.state.phase === Phase.PLAYING && !this.vehicles?.driving && !this.player.climb) this.enter(walkIn.spot);
    }
    const act = this.animation.act;
    // Basket on her arm whenever it holds something; the bag at her side.
    const carry = this.basket.length && !this._basketDown ? 1 : 0;
    act.carry = lerp(act.carry, carry, 1 - Math.exp(-8 * dt));
    act.bag = lerp(act.bag, this.bag && !this._bagFree ? 1 : 0, 1 - Math.exp(-8 * dt));
    if (this.bag) act.holdR = Math.max(act.holdR, act.bag);
    this._placeHeld();
    if (!this.inside) { act.carry = 0; act.bag = 0; this._setPrompt(null); this._renderBasket(); return; }
    const room = this.inside.room;

    // Doors slide open while she is near them.
    const p = this.player.position;
    const lx = p.x - room.origin.x, lz = p.z - room.origin.z;
    const near = lz < 2.4 && Math.abs(lx) < 2.2;
    for (const d of room.doors) d.position.x = lerp(d.position.x, near ? d.metadata.openX : d.metadata.closedX, 1 - Math.exp(-6 * dt));

    // Staff: idle, looking at her.
    if (room.staff && !room.staffBusy) {
      const s = room.staff;
      const dx = p.x - (room.origin.x + s.root.position.x), dz = p.z - (room.origin.z + s.root.position.z);
      const look = clamp(Math.atan2(dx, dz) - s.root.rotation.y, -1, 1);
      s.lookYaw = lerp(s.lookYaw || 0, Math.hypot(dx, dz) < 6 ? look : 0, 1 - Math.exp(-4 * dt));
      animateResident(s, this.time, { look: s.lookYaw, gender: 'f' });
      if (s.bow > 0) this._bow(s, dt);
    }

    // Leaving: walking out through the doorway.
    const playing = this.state.phase === Phase.PLAYING;
    if (playing && !this.busy && !this.seated && !this._fading && lz < room.exit.z + 0.25 && Math.abs(lx) < 1.1) {
      if (this.basket.length) {
        this._toast('Not paid yet', 'Pay at the register, or put things back from your basket');
        this._place(p.x, room.origin.z + 1.4, 0);
      } else this.leave();
      return;
    }

    // What can she do here?
    let prompt = null;
    if (playing && !this.busy && !this._fading && !this.seated) {
      const target = this._target(room);
      this._targetCache = target;
      if (target?.type === 'slot') {
        const it = ITEMS[target.slot.item];
        const tried = room.kind === 'boutique' ? 'Try on' : 'Take';
        prompt = `${tried} · ${it.name}  ${it.price} ◈`;
      } else if (target?.type === 'counter') {
        prompt = this.basket.length ? `Pay · ${this.basket.length} item${this.basket.length > 1 ? 's' : ''} · ${this._total()} ◈` : null;
      } else if (target?.type === 'seat') {
        prompt = target.seat.desk ? 'Sit at the desk' : target.seat.salon ? 'Sit · hair colour' : target.seat.read ? 'Sit and read' : 'Sit down';
      }
    }
    this._setPrompt(prompt);
    this._renderBasket();

    // Seated: moving the stick stands her up.
    if (this.seated && !this.busy && playing && Math.hypot(this.input.move.x, this.input.move.y) > 0.6) this._standUp();
  }

  _target(room) {
    const p = this.player.position;
    const lx = p.x - room.origin.x, lz = p.z - room.origin.z;
    const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
    let best = null, bd = Infinity;
    const consider = (type, x, z, payload, reach, faceX, faceZ) => {
      const d = Math.hypot(lx - x, lz - z);
      if (d > reach) return;
      // Facing it (roughly), so she takes what she's looking at.
      if (faceX != null) {
        const vx = faceX - lx, vz = faceZ - lz, vl = Math.hypot(vx, vz) || 1;
        if ((vx * fx + vz * fz) / vl < 0.2) return;
      }
      if (d < bd) { bd = d; best = { type, ...payload }; }
    };
    for (const s of room.slots) {
      if (!s.item || !s.units.some((u) => u.visible)) continue;
      consider('slot', s.front.x, s.front.z, { slot: s }, 0.75, s.x, s.z);
    }
    const c = room.counter;
    consider('counter', c.stand.x, c.stand.z, {}, 1.0, c.register.x, c.register.z);
    for (const seat of room.seats) consider('seat', seat.stand.x, seat.stand.z, { seat }, 0.7);
    return best;
  }

  // ------------------------------------------------------------ actions
  interact() {
    if (!this.inside || this.busy || this._fading) return;
    const t = this._targetCache;
    if (!t) return;
    if (t.type === 'slot') this._take(t.slot);
    else if (t.type === 'counter') this._checkout();
    else if (t.type === 'seat') this._sit(t.seat);
  }

  /** Reach for the front-most product of a line and drop it in the basket. */
  _take(slot) {
    const room = this.inside.room;
    const unit = slot.units.filter((u) => u.visible).sort((a, b) => a.row - b.row)[0];
    if (!unit) return;
    this.busy = true;
    this.player.hold = true;
    this._face(slot.face);
    const act = this.animation.act;
    const item = slot.item;
    const w = unit.world;
    const reach = { x: w.x, y: w.y + 0.08, z: w.z, w: 0 };
    act.reach = reach;
    if (this.bag) this._putBagAway();
    // Low shelves: she crouches (knees and back) instead of over-stretching.
    const crouch = clamp((1.05 - w.y) / 0.75, 0, 1);
    // ...and steps in a little toward it (more for low shelves), then back.
    const p0 = { x: this.player.position.x, z: this.player.position.z };
    const lean = 0.12 + 0.18 * crouch;
    const sx = Math.sin(slot.face), sz = Math.cos(slot.face);
    let mesh = null;
    const basketPos = new Vector3();
    this.anims.push({ t: 0, d: 1.05, step: (k) => {
      const inOut = k < 0.5 ? ease(k / 0.38) : 1 - ease((k - 0.5) / 0.4);
      act.crouch = crouch * inOut;
      this.player.position.x = p0.x + sx * lean * inOut;
      this.player.position.z = p0.z + sz * lean * inOut;
      if (k < 0.38) reach.w = ease(k / 0.38);                    // reach out
      else if (!mesh) {
        // Grab: the product leaves the shelf and sits in her palm.
        room.goods.setVisible(unit, false);
        mesh = productMesh(this.scene, item);
        mesh.scaling.setAll(0.9);
        this._hold(mesh, 'palm');
        act.holdR = 1;
        this._click();
      } else if (k < 0.78) {
        // Bring it to the basket at her left side.
        this._basketWorld(basketPos);
        const m = ease((k - 0.38) / 0.4);
        reach.x = lerp(w.x, basketPos.x, m); reach.y = lerp(w.y + 0.08, basketPos.y + 0.2, m); reach.z = lerp(w.z, basketPos.z, m);
      } else {
        if (this.held?.mesh === mesh) { this.held = null; this._intoBasket(mesh); }
        act.holdR = 0;
        reach.w = 1 - ease((k - 0.78) / 0.27);
      }
    }, done: () => {
      act.reach = null;
      act.crouch = 0;
      this.basket.push({ id: item, unit, mesh, slot });
      if (WEARABLE.has(ITEMS[item].kind)) this._tryOn();
      this.player.hold = false;
      this.busy = false;
    } });
  }

  /** Put an item from the basket back where it came from. */
  putBack(index) {
    const e = this.basket[index];
    if (!e || this.busy) return;
    this.basket.splice(index, 1);
    e.mesh.dispose();
    this.inside?.room.goods.setVisible(e.unit, true);
    this._layoutBasket();
    if (WEARABLE.has(ITEMS[e.id].kind)) this._tryOn();
  }

  _tryOn() {
    const pending = {};
    for (const e of this.basket) { const it = ITEMS[e.id]; if (WEARABLE.has(it.kind)) pending[it.kind] = e.id; }
    this.shops.previewOutfit(Object.keys(pending).length ? pending : null);
  }

  _total() { return this.shops.priceOf(this.basket.map((e) => e.id).filter((id) => !(this.shops.owned.has(id) && WEARABLE.has(ITEMS[id].kind)))); }

  /** At the register: basket on the counter, scan, pay, bag, bow. */
  _checkout() {
    const room = this.inside.room, c = room.counter;
    const ids = this.basket.map((e) => e.id);
    const total = this._total();
    if ((this.state.coins || 0) < total) {
      this._toast(`${total} ◈ — you have ${this.state.coins || 0}`, 'Put something back from your basket');
      if (room.staff) room.staff.bow = 0;
      return;
    }
    this.busy = true;
    this.player.hold = true;
    this._face(Math.atan2(c.register.x - (this.player.position.x - room.origin.x), c.register.z - (this.player.position.z - room.origin.z)));
    const O = room.origin;
    const counterTop = new Vector3(O.x + c.drop.x - 0.55, c.drop.y + 0.01, O.z + c.drop.z - 0.05);
    const scanner = new Vector3(O.x + c.drop.x, c.drop.y + 0.06, O.z + c.drop.z);
    const bagSpot = new Vector3(O.x + c.bag.x, c.bag.y, O.z + c.bag.z);
    const act = this.animation.act;
    // 1. Basket goes on the counter.
    const basket = this._basketGroup();
    const from = worldPos(basket, new Vector3());
    basket.setParent(null);
    this._basketDown = true;
    act.reach = { x: from.x, y: from.y + 0.25, z: from.z, w: 0 };
    const seq = [];
    seq.push({ d: 0.6, step: (k) => {
      act.reach.w = Math.sin(k * Math.PI);
      act.reach.x = lerp(from.x, counterTop.x, ease(k)); act.reach.y = lerp(from.y + 0.25, counterTop.y + 0.3, ease(k)); act.reach.z = lerp(from.z, counterTop.z, ease(k));
      Vector3.LerpToRef(from, counterTop, ease(k), basket.position);
    } });
    // 2. Scan each item: basket → scanner (beep) → bag.
    const bag = this._makeBag();
    bag.position.copyFrom(bagSpot);
    bag.rotation.set(0, 0, 0);
    bag.scaling.setAll(0.001);
    seq.push({ d: 0.25, step: (k) => bag.scaling.setAll(Math.max(0.001, ease(k))) });
    for (const e of this.basket) {
      const start = new Vector3();
      seq.push({ d: 0.42, step: (k, dt, first) => {
        if (first) { worldPos(e.mesh, start); e.mesh.setParent(null); }
        Vector3.LerpToRef(start, scanner, ease(k), e.mesh.position);
        e.mesh.position.y += Math.sin(k * Math.PI) * 0.12;
      }, done: () => this._beep() });
      seq.push({ d: 0.3, step: (k) => {
        Vector3.LerpToRef(scanner, bagSpot, ease(k), e.mesh.position);
        e.mesh.position.y += Math.sin(k * Math.PI) * 0.15 + 0.1 * k;
        e.mesh.scaling.setAll(0.9 * (1 - ease(k) * 0.7));
      }, done: () => e.mesh.dispose() });
    }
    // 3. Pay, bow, and she takes the bag.
    seq.push({ d: 0.2, done: () => {
      const r = this.shops.buyMany(ids, this.inside.spot.name);
      if (r.ok) {
        for (const e of this.basket) room.goods.setVisible(e.unit, false);
        this._cash();
        if (room.staff) room.staff.bow = 1.2;
        this._toast(`Paid ${total} ◈`, room.kind === 'cafe' ? 'Arigatou! Find a seat to enjoy it' : 'Arigatou gozaimashita!');
        this.shops.previewOutfit(null);
        this.basket = [];
      }
      this._stowBasket();
      this._basketDown = false;
    } });
    seq.push({ d: 0.7, step: (k) => {
      act.reach.w = k < 0.5 ? ease(k / 0.5) : 1;
      act.reach.x = bagSpot.x; act.reach.y = bagSpot.y + 0.32; act.reach.z = bagSpot.z;
      if (k >= 0.5 && !this.bag) {
        // Takes the bag by its handles; it hangs from her hand from now on.
        this._hold(bag, 'hang');
        this.bag = bag;
        this._bagFree = true;
        act.holdR = 1;
      }
    } });
    // The hand drifts from the counter to her side (bag-holding pose).
    seq.push({ d: 0.55, step: (k) => { this._bagFree = false; act.reach.w = 1 - ease(k); }, done: () => { act.reach = null; } });
    this._sequence(seq, () => { this.player.hold = false; this.busy = false; });
  }

  /** Sit on a chair / stool / the salon chair. */
  _sit(seat) {
    const room = this.inside.room, O = room.origin;
    this.busy = true;
    this.player.hold = true;
    const act = this.animation.act;
    const start = { x: this.player.position.x, z: this.player.position.z };
    // Back onto the seat: slightly behind its centre so her thighs rest on it.
    const sx = O.x + seat.x - Math.sin(seat.yaw) * 0.08, sz = O.z + seat.z - Math.cos(seat.yaw) * 0.08;
    const y0 = this.player.position.y;
    this.anims.push({ t: 0, d: 0.7, step: (k) => {
      const m = ease(k);
      this.player.position.x = lerp(start.x, sx, m);
      this.player.position.z = lerp(start.z, sz, m);
      this.player.yaw = seat.yaw;
      this.player.visualY = y0 + (seat.seatH - 0.46) * m;
      act.sit = m;
    }, done: () => {
      this.seated = seat;
      this.busy = false;
      this._renderSeat();
    } });
    if (this.bag) this._putBagAway();
  }

  _standUp(instant = false) {
    if (!this.seated) return;
    const seat = this.seated, room = this.inside?.room;
    this.seated = null;
    this.seatPanel.classList.add('hidden');
    const act = this.animation.act;
    if (instant || !room) { act.sit = 0; act.eat = 0; this.player.hold = false; return; }
    this.busy = true;
    const O = room.origin;
    const from = { x: this.player.position.x, z: this.player.position.z };
    const to = { x: O.x + seat.stand.x, z: O.z + seat.stand.z };
    this.anims.push({ t: 0, d: 0.6, step: (k) => {
      const m = ease(k);
      act.sit = 1 - m;
      this.player.position.x = lerp(from.x, to.x, m);
      this.player.position.z = lerp(from.z, to.z, m);
      this.player.visualY = (seat.seatH - 0.46) * (1 - m);
    }, done: () => { act.sit = 0; this.player.hold = false; this.busy = false; } });
  }

  /** Seated: eat or drink something from the Bag (hand to mouth, bites). */
  _eat(id) {
    if (!this.seated || this.busy || !(this.shops.inventory[id] > 0)) return;
    this.busy = true;
    const act = this.animation.act;
    const mesh = productMesh(this.scene, id);
    mesh.scaling.setAll(0.9);
    this._hold(mesh, 'palm');
    act.holdR = 1;
    const bites = 3;
    this.anims.push({ t: 0, d: 3.6, step: (k) => {
      // Up to the mouth, a bite, down a little; three times.
      const ph = (k * bites) % 1;
      act.eat = k < 0.08 ? ease(k / 0.08) : k > 0.92 ? 1 - ease((k - 0.92) / 0.08) : 0.75 + 0.25 * Math.sin(ph * Math.PI);
      const left = 1 - Math.floor(k * bites) / bites;
      mesh.scaling.setAll(0.9 * Math.max(0.25, left));
      if (ph > 0.45 && ph < 0.5 && !this._bit) { this._bit = true; this._click(); this.animation.celebrate(); }
      if (ph > 0.6) this._bit = false;
    }, done: () => {
      if (this.held?.mesh === mesh) this.held = null;
      mesh.dispose();
      act.eat = 0; act.holdR = 0;
      this.shops.use(id);
      this.busy = false;
      this._renderSeat();
    } });
  }

  /** Salon: the stylist steps behind her, works, and the colour changes. */
  _dye(id) {
    const room = this.inside.room, seat = this.seated;
    const it = ITEMS[id];
    if (!seat || this.busy || !it) return;
    const owned = this.shops.owned.has(id);
    if (!owned && (this.state.coins || 0) < it.price) { this._toast(`${it.price} ◈ — you have ${this.state.coins || 0}`, 'Earn coins from favors, fragments and new districts'); return; }
    this.busy = true;
    this.seatPanel.classList.add('hidden');
    const s = room.staff;
    const home = room.staffHome;
    if (s) {
      room.staffBusy = true;
      s.root.position.set(seat.x, 0, seat.z - 0.62);
      s.root.rotation.y = 0;
    }
    this.anims.push({ t: 0, d: 3.2, step: (k) => {
      if (s) {
        animateResident(s, this.time, { look: Math.sin(this.time * 2) * 0.3, gender: 'f' });
        // Hands up at her hair, working.
        const w = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (k > 0.9 ? (1 - k) * 10 : 1);
        const wave = Math.sin(this.time * 9) * 0.15;
        s.bones.leftUpperArm?.rotationQuaternion.multiplyInPlace(eulerXYZ(-1.1 * w - wave, 0, -0.5 * w));
        s.bones.rightUpperArm?.rotationQuaternion.multiplyInPlace(eulerXYZ(-1.1 * w + wave, 0, 0.5 * w));
      }
      if (k > 0.55 && !this._dyed) {
        this._dyed = true;
        if (!owned) this.shops.buyMany([id], this.inside.spot.name);
        this.shops.wear(id);
        this._sparkle();
      }
    }, done: () => {
      this._dyed = false;
      if (s) { room.staffBusy = false; s.root.position.set(home.x, 0, home.z); s.root.rotation.y = home.yaw; s.bow = 1.2; }
      this.animation.celebrate();
      this._toast(`${it.name}`, owned ? 'Back to a favourite' : `Paid ${it.price} ◈ — it suits you!`);
      this.busy = false;
      this._renderSeat();
    } });
  }

  /** A polite bow (additive over the resident's idle pose). */
  _bow(s, dt) {
    s.bow = Math.max(0, s.bow - dt);
    const k = Math.sin((1 - s.bow / 1.2) * Math.PI);
    const q = eulerXYZ(0.55 * k, 0, 0);
    s.bones.spine?.rotationQuaternion.multiplyInPlace(q);
    s.bones.chest?.rotationQuaternion.multiplyInPlace(q);
  }

  /** A resident's right arm raised toward something (handing over). */
  _offer(s, k) {
    s.bones.rightUpperArm?.rotationQuaternion.multiplyInPlace(eulerXYZ(-1.0 * k, 0, -0.35 * k));
    s.bones.rightLowerArm?.rotationQuaternion.multiplyInPlace(eulerXYZ(0, -0.4 * k, 0));
  }

  // ------------------------------------------------------------ street actions
  /**
   * Vending machine: pay, press the button (coin clink, beep), the can drops
   * (clunk), she crouches to take it from the slot; it goes into her Bag.
   */
  vend(spot, id) {
    if (this.busy || !spot.machine) return false;
    const r = this.shops.buy(id);
    if (!r.ok) { this._toast(r.reason || 'Not enough coins'); return false; }
    this.busy = true;
    this.player.hold = true;
    const p = this.player.position, m = spot.machine;
    const yaw = Math.atan2(m.x - p.x, m.z - p.z);
    this._face(yaw);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const front = { x: m.x - fx * 0.38, z: m.z - fz * 0.38 };
    const act = this.animation.act;
    const reach = act.reach = { x: front.x + Math.cos(yaw) * -0.15, y: 1.15, z: front.z - Math.sin(yaw) * -0.15, w: 0 };
    let can = null;
    this._sequence([
      { d: 0.45, step: (k) => { reach.w = ease(k); }, done: () => this._tone([1800, 2400], { dur: 0.05, type: 'triangle', gain: 0.05, gap: 0.04 }) },   // coin
      { d: 0.25, done: () => this._beep() },                                                                                                   // button
      { d: 0.35, step: (k) => { reach.w = 1 - ease(k); }, done: () => this._clunk() },                                                         // can drops
      { d: 0.6, step: (k) => {
        reach.x = front.x; reach.z = front.z; reach.y = 0.32;
        reach.w = ease(k); act.crouch = ease(k);
      }, done: () => {
        can = productMesh(this.scene, id); can.scaling.setAll(0.9);
        this._hold(can, 'palm'); act.holdR = 1; this._click();
      } },
      { d: 0.65, step: (k) => {
        act.crouch = 1 - ease(k);
        reach.x = lerp(front.x, p.x + fx * 0.3, ease(k)); reach.z = lerp(front.z, p.z + fz * 0.3, ease(k)); reach.y = lerp(0.32, 1.1, ease(k));
      } },
      { d: 0.35, step: (k) => { can.scaling.setAll(0.9 * (1 - ease(k))); reach.w = 1 - ease(k); } },
    ], () => {
      if (this.held?.mesh === can) this.held = null;
      can?.dispose();
      act.reach = null; act.crouch = 0; act.holdR = 0;
      this.player.hold = false; this.busy = false;
      this._toast(`${ITEMS[id].icon} ${ITEMS[id].name}`, 'In your Bag — drink it any time');
    });
    return true;
  }

  /** Market stall: the vendor puts it on the counter, she takes it. */
  stallBuy(spot, id) {
    const v = this.vendors[spot.name];
    if (this.busy || !v) return false;
    const r = this.shops.buy(id);
    if (!r.ok) { this._toast(r.reason || 'Not enough coins'); return false; }
    this.busy = true;
    this.player.hold = true;
    const st = v.stall, fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    const shelf = new Vector3(st.x - fx * 0.4, 1.3, st.z - fz * 0.4);
    const top = new Vector3(st.x + fx * 1.15, 1.2, st.z + fz * 1.15);   // counter front edge
    const p = this.player.position;
    this._face(Math.atan2(top.x - p.x, top.z - p.z));
    const item = productMesh(this.scene, id); item.scaling.setAll(0.9);
    item.position.copyFrom(shelf);
    const act = this.animation.act;
    v.r.busy = true;
    this._sequence([
      // The vendor hands it over onto the counter.
      { d: 0.8, step: (k) => {
        animateResident(v.r, this.time, { look: 0, gender: 'f' });
        this._offer(v.r, Math.sin(k * Math.PI));
        Vector3.LerpToRef(shelf, top, ease(k), item.position);
        item.position.y += Math.sin(k * Math.PI) * 0.15;
      } },
      // She reaches over and takes it.
      { d: 0.5, step: (k, dt, first) => {
        if (first) act.reach = { x: top.x, y: top.y + 0.06, z: top.z, w: 0 };
        animateResident(v.r, this.time, { look: 0, gender: 'f' });
        act.reach.w = ease(k);
      }, done: () => { this._hold(item, 'palm'); act.holdR = 1; this._click(); v.r.bow = 1.2; } },
      { d: 0.6, step: (k) => {
        act.reach.x = lerp(top.x, p.x + Math.sin(this.player.yaw) * 0.3, ease(k));
        act.reach.z = lerp(top.z, p.z + Math.cos(this.player.yaw) * 0.3, ease(k));
        act.reach.y = lerp(top.y + 0.06, 1.05, ease(k));
      } },
      { d: 0.35, step: (k) => { item.scaling.setAll(0.9 * (1 - ease(k))); act.reach.w = 1 - ease(k); } },
    ], () => {
      if (this.held?.mesh === item) this.held = null;
      item.dispose();
      act.reach = null; act.holdR = 0;
      v.r.busy = false;
      this.player.hold = false; this.busy = false;
      const it = ITEMS[id];
      this._toast(`${it.icon} ${it.name}`, WEARABLE.has(it.kind) ? 'Looking good!' : it.kind === 'read' ? 'Read it from your Bag' : 'In your Bag');
    });
    return true;
  }

  /** Showroom desk: the salesperson hands the keys across. */
  _buyKeys(id) {
    const room = this.inside.room, it = ITEMS[id];
    if (this.busy || !it) return;
    const r = this.shops.buyMany([id], this.inside.spot.name);
    if (!r.ok) { this._toast(`${it.price} ◈ — you have ${this.state.coins || 0}`, 'Earn coins from favors, fragments and new districts'); return; }
    this.busy = true;
    this.seatPanel.classList.add('hidden');
    const s = room.staff, O = room.origin, c = room.counter;
    const from = new Vector3(O.x + c.cashier.x, 1.0, O.z + c.cashier.z - 0.45);
    const mid = new Vector3(O.x + c.cashier.x, 0.98, O.z + c.register.z - 0.1);
    const keys = this._keysNode;
    keys.position.copyFrom(from);
    keys.rotation.set(0, 0, 0);
    keys.setEnabled(true);
    const act = this.animation.act;
    if (s) room.staffBusy = true;
    this._sequence([
      { d: 0.8, step: (k) => {
        if (s) { animateResident(s, this.time, { look: 0, gender: 'f' }); this._offer(s, Math.sin(k * Math.PI)); }
        Vector3.LerpToRef(from, mid, ease(k), keys.position); keys.position.y += Math.sin(k * Math.PI) * 0.1;
        keys.rotation.y += 0.1;
      }, done: () => this._tone([880, 1320], { dur: 0.06, type: 'triangle', gain: 0.06 }) },
      { d: 0.55, step: (k, dt, first) => {
        if (first) act.reach = { x: mid.x, y: mid.y + 0.05, z: mid.z, w: 0 };
        act.reach.w = ease(k);
      }, done: () => { this._hold(keys, 'palm'); act.holdR = 1; this._click(); } },
      { d: 0.7, step: (k) => {
        act.reach.y = lerp(mid.y + 0.05, 1.05, ease(k));
        act.reach.z = lerp(mid.z, this.player.position.z + 0.3, ease(k));
      } },
      { d: 1.0, step: (k) => { if (k > 0.6) act.reach.w = 1 - ease((k - 0.6) / 0.4); } },
    ], () => {
      if (this.held?.mesh === keys) this.held = null;
      keys.setEnabled(false);
      act.reach = null; act.holdR = 0;
      if (s) { room.staffBusy = false; s.bow = 1.2; }
      this.busy = false;
      this.animation.celebrate();
      this._unlock = this.vehicles?.vehicles.find((v) => v.showroom === it.vehicle) || null;
      this._toast(`🔑 ${it.name.replace('Showroom ', '')}`, 'Yours! It’s waiting on the lot outside');
      this._renderSeat();
    });
  }

  /** The car she just bought: hazards flash twice with a chirp. */
  _chirp(v) {
    if (!v) return;
    const lights = this.carLights;
    const car = lights?.cars?.get(v) || lights?._setup?.(v);
    if (car) car.hazard = 1.3;
    this._tone([1568, 1568], { dur: 0.08, type: 'square', gain: 0.05, gap: 0.08 });
  }

  _clunk() { this._tone([140, 95], { dur: 0.09, type: 'sine', gain: 0.18, gap: 0 }); }

  _sequence(steps, done) {
    const run = (i) => {
      if (i >= steps.length) { done?.(); return; }
      const s = steps[i];
      let first = true;
      this.anims.push({ t: 0, d: s.d, step: (k, dt) => { s.step?.(k, dt, first); first = false; }, done: () => { s.done?.(); run(i + 1); } });
    };
    run(0);
  }

  _face(yaw) {
    this.player.yaw = yaw;
    this.player._sync?.();
  }

  _hand(name) { return this.character.bone(name) || this.character.root; }

  /** Something in her right hand, kept at the palm (upright) every frame. */
  _hold(node, mode = 'palm') {
    node.setParent(null);
    if (mode === 'hang') this.heldBag = { mesh: node }; else this.held = { mesh: node };
    this._placeHeld();
  }

  _placeHeld() {
    if (!this.held && !this.heldBag) return;
    const hand = this.character.bone('rightHand'), mid = this.character.bone('rightMiddleProximal');
    if (!hand) return;
    const H = worldPos(hand, _a), M = mid ? worldPos(mid, _b) : _b.copyFrom(H);
    const palm = Vector3.LerpToRef(H, M, 0.75, _c);
    const yaw = this.player.yaw;
    if (this.held) {
      const m = this.held.mesh, bb = m.getBoundingInfo?.().boundingBox;
      const half = bb ? (bb.maximum.y + bb.minimum.y) / 2 * m.scaling.y : 0;
      m.position.set(palm.x, palm.y - half, palm.z);   // centred in the palm
      m.rotation.set(0, yaw, 0);
    }
    if (this.heldBag) {
      const m = this.heldBag.mesh;
      m.position.set(palm.x, palm.y - 0.36, palm.z);   // handles in her hand
      m.rotation.set(0, yaw + Math.PI / 2, 0);
    }
  }

  /** The paid bag is put away (sitting down, shopping again, leaving). */
  _putBagAway(instant = false) {
    const bag = this.heldBag?.mesh || this.bag;
    this.heldBag = null; this.bag = null;
    if (!bag) return;
    if (instant) { bag.setEnabled(false); return; }
    // The bag is reused: a new checkout may take it back before this ends.
    this.anims.push({ t: 0, d: 0.3, step: (k) => { if (!this.bag) bag.scaling.setAll(Math.max(0.001, 1 - ease(k))); }, done: () => { if (!this.bag) bag.setEnabled(false); } });
  }

  // ------------------------------------------------------------ props
  /** The basket, the shop's paper bag, the car keys and the sparkle: made once, reused. */
  _props() {
    const scene = this.scene;
    const mat = (name, hex, { metallic = 0, roughness = 0.5 } = {}) => {
      const m = new PBRMaterial(`shop:${name}`, scene);
      m.albedoColor = linear(hex); m.metallic = metallic; m.roughness = roughness; m.environmentIntensity = 0.35;
      return m;
    };
    const mesh = (name, parts, material, parent) => {
      const vd = parts.map(([v, x, y, z]) => { v.uvs = null; return v.transform(Matrix.Translation(x, y, z)); });   // untextured: boxes and rings merge
      const m = new Mesh(name, scene);
      vd[0].merge(vd.slice(1), true).applyToMesh(m);
      m.material = material; m.parent = parent; m.isPickable = false; m.receiveShadows = true;
      return m;
    };
    const box = (w, h, d) => VertexData.CreateBox({ width: w, height: h, depth: d });
    // Basket: hangs from her left hand (the act layer holds that hand out at
    // her side), turned lengthwise along her walk so it clears her leg.
    const basket = new TransformNode('shop:basket', scene);
    mesh('shop:basketBody', [
      [box(0.4, 0.015, 0.28), 0, -0.27, 0],                             // bottom
      [box(0.4, 0.17, 0.012), 0, -0.19, 0.14], [box(0.4, 0.17, 0.012), 0, -0.19, -0.14],
      [box(0.012, 0.17, 0.28), 0.2, -0.19, 0], [box(0.012, 0.17, 0.28), -0.2, -0.19, 0],
    ], mat('basket', '#d94242'), basket);
    mesh('shop:basketHandle', [[torus(0.13, 0.008, 6, 16, Math.PI), 0, -0.1, 0]], mat('handle', '#9aa3a8', { metallic: 0.6, roughness: 0.3 }), basket);
    basket.setEnabled(false);
    this._basketNode = basket;
    // Paper bag in the shop's colour (set per checkout).
    const bag = new TransformNode('shop:bag', scene);
    this._paper = mat('paper', '#f2ede4', { roughness: 0.8 });
    mesh('shop:bagBody', [[box(0.3, 0.32, 0.14), 0, 0.16, 0],
      ...[-0.07, 0.07].map((x) => [torus(0.05, 0.006, 6, 12, Math.PI), x, 0.32, 0])], this._paper, bag);
    mesh('shop:bagBand', [[box(0.31, 0.06, 0.145), 0, 0.2, 0]], mat('bagBand', '#ffffff', { roughness: 0.8 }), bag);
    bag.setEnabled(false);
    this._bagNode = bag;
    // Car keys: ring, key and a red fob.
    const keys = new TransformNode('shop:keys', scene);
    mesh('shop:keyRing', [[torus(0.022, 0.003, 6, 16), 0, 0.06, 0], [box(0.012, 0.055, 0.004), 0, 0.025, 0]], mat('keys', '#c9ced6', { metallic: 0.8, roughness: 0.25 }), keys);
    mesh('shop:keyFob', [[box(0.03, 0.045, 0.012), 0.025, 0.035, 0]], mat('fob', '#c84a4a', { roughness: 0.4 }), keys);
    keys.scaling.setAll(1.6);
    keys.setEnabled(false);
    this._keysNode = keys;
    // Sparkle: fourteen little diamonds (instances of one, one draw).
    const spark = new Mesh('shop:sparkle', scene);
    VertexData.CreatePolyhedron({ type: 1, size: 0.025 }).applyToMesh(spark);
    const sm = new StandardMaterial('shop:sparkle', scene);
    sm.disableLighting = true;
    sm.emissiveColor = Color3.FromHexString('#fff4c2');
    spark.material = sm;
    spark.isPickable = false;
    spark.isVisible = false;
    this._sparkleMesh = spark;
    this._sparkles = Array.from({ length: 14 }, (_, i) => { const s = spark.createInstance(`shop:sparkle${i}`); s.setEnabled(false); return s; });
  }

  _makeBag() {
    this._paper.albedoColor = linear(this.inside?.def?.color || '#f2ede4');
    this._bagNode.setEnabled(true);
    return this._bagNode;
  }

  // ------------------------------------------------------------ basket
  /** The basket on her left arm (taken from the stack when she first picks something). */
  _basketGroup() {
    const g = this._basketNode;
    if (!g.isEnabled(false)) {
      g.parent = this.character.root;
      g.position.set(BASKET_HAND[0] + 0.02, BASKET_HAND[1] - 0.02, BASKET_HAND[2]);
      g.rotationQuaternion = null;
      g.rotation.set(0, Math.PI / 2, 0);
      g.setEnabled(true);
    }
    return g;
  }

  _basketWorld(out) { return worldPos(this._basketGroup(), out); }

  _intoBasket(mesh) {
    mesh.setParent(this._basketGroup());
    this._layoutBasket(mesh);
  }

  _layoutBasket(extra) {
    if (!this._basketNode.isEnabled(false)) return;
    const meshes = [...this.basket.map((e) => e.mesh), ...(extra ? [extra] : [])];
    meshes.forEach((m, i) => {
      m.position.set(-0.12 + (i % 3) * 0.12, -0.26 + Math.floor(i / 6) * 0.05, -0.07 + (Math.floor(i / 3) % 2) * 0.14);
      m.rotationQuaternion = null;
      m.rotation.set(0, (i * 0.7) % 1, 0);
      m.scaling.setAll(0.75);
    });
  }

  /** The basket goes back on the stack (empty, off her arm). */
  _stowBasket() {
    this._basketNode.parent = null;
    this._basketNode.setEnabled(false);
  }

  _dropBasket() {
    for (const e of this.basket) { e.mesh.dispose(); this.inside?.room.goods.setVisible(e.unit, true); }
    this.basket = [];
    this._stowBasket();
    this._basketDown = false;
  }

  // ------------------------------------------------------------ sounds
  _tone(freqs, { dur = 0.12, type = 'sine', gain = 0.12, gap = 0 } = {}) {
    const ctx = this.audio?.ctx;
    if (!ctx || this.audio.muted) return;
    let t = ctx.currentTime;
    for (const f of freqs) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.audio.master || ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + gap;
    }
  }
  /** The convenience-store door chime. */
  _chime() { this._tone([659, 523, 392, 523, 587, 784], { dur: 0.22, type: 'triangle', gain: 0.1, gap: 0.02 }); }
  _beep() { this._tone([1760], { dur: 0.09, type: 'square', gain: 0.05 }); }
  _click() { this._tone([520, 780], { dur: 0.05, type: 'triangle', gain: 0.06 }); }
  _cash() { this._tone([1318, 1568, 2093], { dur: 0.1, type: 'triangle', gain: 0.07 }); }

  _sparkle() {
    const head = worldPos(this._hand('head'), _a);
    const mat = this._sparkleMesh.material;
    this._sparkles.forEach((m, i) => {
      const a = (i / 14) * Math.PI * 2;
      m.position.set(head.x + Math.cos(a) * 0.25, head.y + 0.1 + (i % 3) * 0.06, head.z + Math.sin(a) * 0.25);
      m.setEnabled(true);
    });
    mat.alpha = 1;
    this.anims.push({ t: 0, d: 1.2, step: (k) => { mat.alpha = 1 - k; this._sparkles.forEach((m, i) => { m.position.y += 0.004; m.rotation.y += 0.1 + i * 0.01; }); },
      done: () => { for (const m of this._sparkles) m.setEnabled(false); } });
  }

  // ------------------------------------------------------------ UI
  _buildDom() {
    const root = document.getElementById('ui');
    root.insertAdjacentHTML('beforeend', `
      <button class="mission-action interior-action hidden" type="button"><kbd class="only-mouse">F</kbd><span class="mission-action-icon" aria-hidden="true">✋</span><span class="mission-action-label"></span></button>
      <div class="interior-hint hidden"></div>
      <aside class="basket-panel hidden"><div class="basket-head"><b>🧺 Basket</b><span class="basket-total"></span></div><div class="basket-items"></div><small>Pay at the register · ✕ puts it back</small></aside>
      <aside class="seat-panel hidden"><b class="seat-title"></b><div class="seat-options"></div><button class="pill seat-up" type="button">Stand up</button></aside>`);
    this.prompt = root.querySelector('.interior-action');
    this.hint = root.querySelector('.interior-hint');
    this.basketPanel = root.querySelector('.basket-panel');
    this.seatPanel = root.querySelector('.seat-panel');
    for (const el of [this.prompt, this.basketPanel, this.seatPanel]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.prompt.addEventListener('click', (e) => { e.stopPropagation(); this.interact(); });
    this.basketPanel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-put]');
      if (b) this.putBack(+b.dataset.put);
    });
    this.seatPanel.addEventListener('click', (e) => {
      if (e.target.closest('.seat-up')) { this._standUp(); return; }
      const b = e.target.closest('[data-eat],[data-read],[data-dye],[data-keys]');
      if (!b) return;
      if (b.dataset.keys) this._buyKeys(b.dataset.keys);
      else if (b.dataset.eat) this._eat(b.dataset.eat);
      else if (b.dataset.read) this.shops.read(b.dataset.read);
      else if (b.dataset.dye) this._dye(b.dataset.dye);
    });
  }

  _setPrompt(label) {
    if (label === this._label) return;
    this._label = label;
    this.prompt.classList.toggle('hidden', !label);
    if (label) this.prompt.querySelector('.mission-action-label').textContent = label;
    this.hint.classList.toggle('hidden', !this.inside);
  }

  _renderBasket() {
    const key = this.inside ? this.basket.map((e) => e.id).join(',') + '|' + this.state.coins : '';
    if (key === this._basketKey) return;
    this._basketKey = key;
    const show = !!this.inside && this.basket.length > 0;
    this.basketPanel.classList.toggle('hidden', !show);
    if (!show) return;
    this.basketPanel.querySelector('.basket-total').textContent = `${this._total()} ◈ · you have ${this.state.coins || 0}`;
    this.basketPanel.querySelector('.basket-items').innerHTML = this.basket.map((e, i) => {
      const it = ITEMS[e.id];
      return `<div class="basket-item"><span>${it.icon}</span><b>${it.name}</b><i>${it.price} ◈</i><button class="put" data-put="${i}" aria-label="Put back">✕</button></div>`;
    }).join('');
  }

  _renderSeat() {
    const seat = this.seated;
    if (!seat) { this.seatPanel.classList.add('hidden'); return; }
    const inv = this.shops.inventory;
    let title, options = '';
    if (seat.desk) {
      title = 'Hikari Motors · sign for the keys';
      options = Object.keys(ITEMS).filter((id) => ITEMS[id].kind === 'vehicle').map((id) => {
        const it = ITEMS[id], owned = this.shops.owned.has(id);
        return `<button class="pill ${owned ? 'on' : ''}" data-keys="${id}" ${owned ? 'disabled' : ''}>${it.icon} ${it.name.replace('Showroom ', '')}${owned ? ' · yours' : ` · ${it.price} ◈`}</button>`;
      }).join('');
    } else if (seat.salon) {
      title = 'Hair colour';
      options = Object.keys(ITEMS).filter((id) => ITEMS[id].kind === 'hair').map((id) => {
        const it = ITEMS[id], on = this.shops.outfit.hair === id, owned = this.shops.owned.has(id);
        return `<button class="pill ${on ? 'on' : ''}" data-dye="${id}" ${on ? 'disabled' : ''}><i class="swatch" style="background:${it.color || '#6b4a35'}"></i>${it.name}${owned ? '' : ` · ${it.price} ◈`}</button>`;
      }).join('');
    } else if (seat.read) {
      title = 'Read';
      const reads = Object.keys(ITEMS).filter((id) => ITEMS[id].kind === 'read' && this.shops.owned.has(id));
      options = reads.length ? reads.map((id) => `<button class="pill" data-read="${id}">${ITEMS[id].icon} ${ITEMS[id].name}</button>`).join('') : '<p class="muted">Buy a magazine or a book first.</p>';
    } else {
      title = 'Enjoy';
      const food = Object.keys(inv).filter((id) => inv[id] > 0 && ITEMS[id]?.boost);
      options = food.length ? food.map((id) => `<button class="pill" data-eat="${id}">${ITEMS[id].icon} ${ITEMS[id].kind === 'drink' ? 'Drink' : 'Eat'} ${ITEMS[id].name}${inv[id] > 1 ? ` ×${inv[id]}` : ''}</button>`).join('') : '<p class="muted">Buy something at the counter first.</p>';
    }
    this.seatPanel.querySelector('.seat-title').textContent = title;
    this.seatPanel.querySelector('.seat-options').innerHTML = options;
    this.seatPanel.classList.remove('hidden');
  }

  _toast(t, s) { this.ui.toast(t, s); }

  _events() {
    addEventListener('keydown', (e) => {
      if (!this.inside || e.repeat) return;
      if (e.code === 'KeyF' && this._label) { e.stopImmediatePropagation(); e.preventDefault(); this.interact(); }
      else if (e.code === 'KeyF' && this.seated) { e.stopImmediatePropagation(); e.preventDefault(); this._standUp(); }
    }, { capture: true });
    this.state.on('phase', ({ phase }) => { if (phase !== Phase.PLAYING && this.inside) this.leave(true); });
    this.state.on('game:reset', () => this.leave(true));
  }
}
