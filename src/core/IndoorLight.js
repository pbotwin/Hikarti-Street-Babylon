import { Color3 } from '@babylonjs/core';
import { ToonPlugin } from '../player/Vrm.js';

/**
 * Store lighting, switched on at the door and the sunset rig restored on the
 * way out (the walk-in shops, Hikari Mall): the ceiling panels as a
 * near-vertical key light (shadows straight down under shelves and tables),
 * the room's own photo as reflections and bounce light (once taken), and no
 * ink outlines or light rays: inside is meant to look like a real room.
 */
export class IndoorLight {
  constructor(gfx, character) {
    this.gfx = gfx;
    this.character = character;
    this.saved = null;     // the outdoor rig while indoors
  }

  get on() { return !!this.saved; }

  /**
   * Light for a room: `env` is its photo (cube texture), or null before it
   * is taken; `meshes` is what draws inside (they re-read the environment).
   */
  enter(env, meshes) {
    const L = this.gfx, scene = L.scene;
    if (!this.saved) {
      this.saved = {
        dir: L.sunDir.clone(), color: L.sun.diffuse, spec: L.sun.specular, i: L.sun.intensity, sky: L.hemi.diffuse, ground: L.hemi.groundColor, hi: L.hemi.intensity,
        toonSun: ToonPlugin.sun.clone(), toonAmb: ToonPlugin.ambient.clone(),
        rays: L.raysAllowed, env: scene.environmentTexture, envI: scene.environmentIntensity, ink: L.ink,
        outlined: this.character.meshes.filter((m) => m.renderOutline),
      };
    }
    L.sunDir.set(0.12, 0.97, 0.2).normalize();
    // The original's shop rig, in linear colours like Graphics' sunset rig.
    L.sun.diffuse = Color3.FromHexString('#fff4e8').toLinearSpace();
    L.hemi.diffuse = Color3.FromHexString('#f6f7ff').toLinearSpace(); L.hemi.groundColor = Color3.FromHexString('#d9d1c4').toLinearSpace();
    // Without a reflection map yet, the hemisphere light carries the fill.
    L.sun.intensity = env ? 1.9 : 2.2;
    L.hemi.intensity = env ? 0.55 : 1.5;
    L.sun.specular = L.sun.diffuse;
    // Her toon bands take the shop light too (as Graphics derives them from its rig).
    ToonPlugin.sun.copyFrom(L.sun.diffuse).scaleInPlace(L.sun.intensity / Math.PI);
    // The toon bands don't sample the room photo (the bounce light the dimmer
    // sky fill leaves to it), so her fill stays at the shop's full value:
    // with the dimmed one her hair went near-black inside.
    ToonPlugin.ambient.copyFrom(L.hemi.diffuse).addInPlace(L.hemi.groundColor).scaleInPlace(0.5 * 1.5 / Math.PI);
    // No photo yet: no reflections (the sky's would light the room orange).
    if (env) L.setEnvironment(env, meshes);
    scene.environmentIntensity = env ? 0.85 : 0;
    for (const m of this.saved.outlined) m.renderOutline = false;
    L.ink = 0;
    L.raysAllowed = false;
    this._aim();
  }

  /** Back to the outdoor rig; `meshes` drew inside (they re-read the sky). */
  leave(meshes) {
    const s = this.saved, L = this.gfx;
    if (!s) return;
    L.sunDir.copyFrom(s.dir); L.sun.diffuse = s.color; L.sun.specular = s.spec; L.sun.intensity = s.i;
    ToonPlugin.sun.copyFrom(s.toonSun); ToonPlugin.ambient.copyFrom(s.toonAmb);
    L.hemi.diffuse = s.sky; L.hemi.groundColor = s.ground; L.hemi.intensity = s.hi;
    L.setEnvironment(s.env, meshes); L.scene.environmentIntensity = s.envI;
    for (const m of s.outlined) m.renderOutline = true;
    L.ink = s.ink;
    L.raysAllowed = s.rays;
    this.saved = null;
    this._aim();
  }

  /** The light shines along -sunDir, from far out along it (shadow frustum). */
  _aim() {
    const L = this.gfx;
    L.sunDir.scaleToRef(-1, L.sun.direction);
    L.sunDir.scaleToRef(120, L.sun.position);
  }
}
