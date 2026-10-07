import { Constants, ReflectionProbe, TransformNode } from '@babylonjs/core';
import { HDRFiltering } from '@babylonjs/core/Materials/Textures/Filtering/hdrFiltering.js';
import { CubeMapToSphericalPolynomialTools } from '@babylonjs/core/Misc/HighDynamicRange/cubemapToSphericalPolynomial.js';
import { MallMaterials, SiteBuilder } from './MallKit.js';
import { MallSigns } from './MallSigns.js';
import { MallDoors } from './MallDoors.js';
import { buildBuilding } from './MallBuilding.js';
import { buildConcourse } from './MallConcourse.js';
import { buildStorefronts } from './MallStorefronts.js';
import { buildMarket } from './MallMarket.js';
import { buildBoutique } from './MallBoutique.js';
import { buildLot } from './MallLot.js';
import { planLayout, siteTransform } from './MallPlan.js';
import { IndoorLight } from '../core/IndoorLight.js';

/**
 * Hikari Mall, the place (MALL.md "world"): builds the site from the plan
 * (MallPlan) behind the loading veil — lot, building, supermarket and
 * clothing store fixtures, collisions — and publishes `layout` for the
 * other modules. While a trip runs it moves the doors and fades the
 * lighting inside the entrance: the game's sunset outside, the store rig
 * inside (IndoorLight, as in the walk-in shops) with a photo of the store,
 * taken once at load, as its reflections and bounce light.
 *
 * Anyone who should open the automatic doors (shoppers) is added to
 * `walkers` (objects with a world `position`).
 */
// The site's centre: just west of the sleeping city (its meshes end at
// x ≈ -480, its colliders at -132), as near the world origin as that
// allows. At (2600, 2600) the GPU's float32 vertex transforms lost ~0.25 mm
// per coordinate, which the 0.2 m near plane turns into centimetres of depth
// error at 30–45 m: signs, posters and screens 1–2 cm off their walls
// flickered when the camera moved 1 mm (2,100 px in one view; none here).
// Clear of the audio's park and garden zones too.
const ORIGIN = { x: -650, z: -200 };
// How far inside the building's edge (m) the store light fades in, and back out.
const IN_AT = 2.5, OUT_AT = 0.8;

export class MallWorld {
  constructor(ctx) {
    this.ctx = ctx;
    this.walkers = [];
    this._people = [];
    this._inside = false;
    // What draws now re-reads the environment when it is swapped: the mall, the trip's people and things, her.
    this._drawn = () => this.ctx.scene.meshes.filter((mesh) => mesh.isEnabled());
  }

  async init() {
    const { scene, collision, graphics, vehicles } = this.ctx;
    this.layout = planLayout(ORIGIN);
    // The site frame: half a turn about the origin (see MallPlan).
    const root = this.root = new TransformNode('mall', scene);
    root.position.set(ORIGIN.x, 0, ORIGIN.z);
    root.rotation.y = Math.PI;
    root.computeWorldMatrix(true);
    root.freezeWorldMatrix();

    this.mats = new MallMaterials(scene);
    this.signs = new MallSigns(scene);
    const site = this.site = new SiteBuilder(scene, root, siteTransform(ORIGIN), collision);
    buildBuilding(site, this.mats, this.signs);
    const concourse = buildConcourse(site, this.mats, this.signs);
    buildStorefronts(site, this.mats, this.signs);
    const coolers = buildMarket(site, this.mats, this.signs);
    this.curtains = buildBoutique(site, this.mats, this.signs);
    this.lot = await buildLot(site, this.mats, this.signs, vehicles, concourse.trees);
    const { meshes, casters } = site.build();
    this.doors = new MallDoors(scene, root, this.mats, ORIGIN);
    this.doors.build(coolers);
    this.meshes = [...meshes, ...this.lot.meshes, ...this.doors.meshes, ...this.curtains.meshes];
    this.casters = [...casters, ...this.lot.casters];
    graphics.addCasters(this.casters);

    // The shops' rig at 80%: at full strength the mall's white walls,
    // floors and ceiling read washed out (mean screen brightness 161–167 in
    // the market and fashion store, against ~150 in the sunset lot).
    this.indoor = new IndoorLight(graphics, this.ctx.character, { level: 0.8 });
    await this._capture();
  }

  /**
   * The store's photo (a cube map from the middle of the supermarket, lit
   * by the store rig): its reflections on the polished floors and its
   * bounce light while she is inside. Made like the sky's (Graphics), so
   * swapping one for the other at the door builds no new shaders.
   */
  async _capture() {
    const { scene, engine, graphics } = this.ctx;
    await scene.whenReadyAsync();
    const probe = this.probe = new ReflectionProbe('mall:store', 128, scene, true, true, true);
    probe._invertYAxis = true;
    scene.removeReflectionProbe(probe);           // drawn once, by hand
    const g = this.layout.grocery.zone;
    probe.position.set((g.x0 + g.x1) / 2, 2.2, (g.z0 + g.z1) / 2);
    probe.renderList.push(...this.meshes);
    const darkness = graphics.shadows.darkness;
    this.indoor.enter(null, []);
    // Lit by the store lights alone: the shadow square is wherever she was.
    graphics.shadows.darkness = 1;
    scene.incrementRenderId();
    probe.cubeTexture.render();
    graphics.shadows.darkness = darkness;
    this.indoor.leave([]);
    probe.renderList.length = 0;
    const tex = probe.cubeTexture;
    await new HDRFiltering(engine, { hdrScale: 1, quality: Constants.TEXTURE_FILTERING_QUALITY_HIGH }).prefilter(tex);
    // Its bounce light (spherical harmonics) read back now: left to the first
    // use, the whole store skipped a frame at the door while it was computed.
    tex.sphericalPolynomial = await CubeMapToSphericalPolynomialTools.ConvertCubeMapTextureToSphericalPolynomial(tex);
  }

  update(dt) {
    const p = this.ctx.player.position;
    const people = this._people;
    people.length = 0;
    people.push(p);
    for (const w of this.walkers) people.push(w.position);
    this.doors.update(dt, people);
    this.lot.cars.update(this.ctx.camera.position, ORIGIN);
    this._light(p, dt);
  }

  /**
   * Store lighting while she is inside the building, faded in and out
   * (IndoorLight). It turns a few metres in, not at the doors: the low sun
   * shines into the entrance portals, so they are still in daylight, and by
   * then the camera behind her is inside too. The
   * different marks in and out keep it from turning back and forth while
   * she stands near one.
   */
  _light(p, dt) {
    const b = this.layout.building;
    const depth = Math.min(p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z);
    const inside = depth > (this._inside ? OUT_AT : IN_AT);
    if (inside !== this._inside) {
      this._inside = inside;
      this.indoor.fadeTo(inside, this.probe.cubeTexture, this._drawn);
    }
    this.indoor.update(dt);
  }

  prompt() { return null; }

  get busy() { return false; }

  dispose() {
    const { graphics, collision, scene } = this.ctx;
    if (this.indoor.on) {
      const mine = new Set(this.meshes);
      this.indoor.leave(scene.meshes.filter((m) => m.isEnabled() && !mine.has(m)));
    }
    graphics.removeCasters(this.casters);
    for (const m of this.meshes) m.dispose();
    this.lot.dispose();
    for (const n of this.curtains.nodes) n.dispose();
    this.root.dispose();
    this.mats.dispose();
    this.signs.dispose();
    this.probe.dispose();
    collision.removeBoxes(this.site.boxes);
    this.walkers.length = 0;
  }
}
