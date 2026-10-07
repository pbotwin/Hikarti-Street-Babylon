import { Color3, Vector3 } from '@babylonjs/core';
import { ToonPlugin } from '../player/Vrm.js';

/**
 * Store lighting for the walk-in shops and Hikari Mall: the ceiling panels
 * as a near-vertical key light (shadows straight down under shelves and
 * tables), the room's own photo as reflections and bounce light (once
 * taken), and no ink outlines or light rays: inside is meant to look like a
 * real room. The sunset rig is restored on the way out.
 *
 * The shops switch at once (behind their fade to white); the mall, walked
 * into in view, fades between the two (`fadeTo`, `update`): switched at
 * once, the whole picture jumped from orange to white at the door. The
 * sun's direction and the environment photo can't be blended, so the fade
 * passes through a fill-lit middle: the old key light and photo fade out
 * while the sky/ground fill carries the light, they are swapped there, and
 * the new ones fade in. Shadows fade with their light instead of swinging
 * across the floor. Every step only sets uniforms: no shader is built
 * during the fade, and nothing is allocated per frame.
 */
// Indoor rig (the original's shop lights), in linear colours like Graphics' sunset rig.
const SHOP_DIR = new Vector3(0.12, 0.97, 0.2).normalize();
const SHOP_SUN = Color3.FromHexString('#fff4e8').toLinearSpace();
const SHOP_SKY = Color3.FromHexString('#f6f7ff').toLinearSpace();
const SHOP_GROUND = Color3.FromHexString('#d9d1c4').toLinearSpace();
// With the photo, the fill is split between the hemisphere light and the
// photo's bounce light; without one (before it is taken) the hemisphere
// light carries it all.
const SHOP = { lit: { sun: 1.9, hemi: 0.55, env: 0.85 }, unlit: { sun: 2.2, hemi: 1.5, env: 0 } };
// The toon bands don't sample the room photo (the bounce light the dimmer
// sky fill leaves to it), so her fill stays at the shop's full value: with
// the dimmed one her hair went near-black inside.
const SHOP_TOON_FILL = 1.5;
// Fill at the fade's middle, where neither key light nor photo shines:
// screen brightness there measured between the two rigs' (s_door.mjs).
const MID_HEMI = 3.6;
// Fade length (s): long enough to read as the eye adapting, short enough
// that the doorway never lingers in the flat middle.
const FADE = 0.8;

export class IndoorLight {
  /** `level` scales the shop rig's light (a big, white-walled store needs less than a small shop). */
  constructor(gfx, character, { level = 1 } = {}) {
    this.gfx = gfx;
    this.character = character;
    this.level = level;
    this.saved = null;     // the outdoor rig while indoors (or fading)
    this.mix = 0;          // 0 outdoor … 1 indoor
    this._target = 0;
    this._env = null;      // the room's photo
    this._drawn = null;    // () → meshes that draw now (they re-read a swapped environment)
  }

  get on() { return !!this.saved; }

  /**
   * Shop light at once: `env` is the room's photo (cube texture), or null
   * before it is taken; `meshes` is what draws inside.
   */
  enter(env, meshes) {
    this._save();
    this._env = env;
    this._target = 1;
    this._apply(1, () => meshes);
  }

  /** The outdoor rig at once; `meshes` drew inside (they re-read the sky). */
  leave(meshes) {
    if (!this.saved) return;
    this._target = 0;
    this._apply(0, () => meshes);
  }

  /**
   * Start fading in (`inside`) or out; turning back midway reverses from
   * where it is. `drawn()` lists what draws when the photo is swapped.
   */
  fadeTo(inside, env, drawn) {
    if (inside) { this._save(); this._env = env; }
    this._drawn = drawn;
    this._target = inside ? 1 : 0;
  }

  /** Per frame while a fade may run (the mall). */
  update(dt) {
    if (!this.saved || this.mix === this._target) return;
    const step = dt / FADE;
    this._apply(this._target > this.mix ? Math.min(this._target, this.mix + step) : Math.max(this._target, this.mix - step), this._drawn);
  }

  _save() {
    if (this.saved) return;
    const L = this.gfx, scene = L.scene;
    this.saved = {
      dir: L.sunDir.clone(), color: L.sun.diffuse.clone(), i: L.sun.intensity,
      sky: L.hemi.diffuse.clone(), ground: L.hemi.groundColor.clone(), hi: L.hemi.intensity,
      toonSun: ToonPlugin.sun.clone(), toonAmb: ToonPlugin.ambient.clone(),
      rays: L.raysAllowed, env: scene.environmentTexture, envI: scene.environmentIntensity, ink: L.ink,
      outlined: this.character.meshes.filter((m) => m.renderOutline).map((m) => [m, m.outlineWidth]),
    };
    this.mix = 0;
  }

  /**
   * The rig at `mix`: the first half fades the sun and the sky photo out,
   * the second fades the shop's key light and photo in; colours, fill, ink
   * and her outlines blend across the whole fade (eased: it starts and ends
   * gently).
   */
  _apply(mix, drawn) {
    const s = this.saved, L = this.gfx, scene = L.scene;
    const was = this.mix;
    this.mix = mix;
    if (mix === 0) { this._restore(drawn); return; }
    const shop = this._env ? SHOP.lit : SHOP.unlit;
    const k = mix * mix * (3 - 2 * mix);
    const inner = k >= 0.5;
    if (was === 0 || inner !== (was * was * (3 - 2 * was) >= 0.5)) {
      this._aim(inner ? SHOP_DIR : s.dir);
      L.sun.diffuse.copyFrom(inner ? SHOP_SUN : s.color);
      L.raysAllowed = inner ? false : s.rays;
    }
    // The half's photo (also a room's new one, taken while lit). No photo
    // yet: the sky's stays, unlit (it would light the room orange).
    const env = inner ? this._env : s.env;
    if (env && scene.environmentTexture !== env) L.setEnvironment(env, drawn());
    // The key light and the photo of the current half, faded toward the middle.
    const key = inner ? 2 * k - 1 : 1 - 2 * k;
    const lv = this.level;
    L.sun.intensity = key * (inner ? shop.sun * lv : s.i);
    scene.environmentIntensity = key * (inner ? shop.env * lv : s.envI);
    L.hemi.intensity = MID_HEMI + ((inner ? shop.hemi * lv : s.hi) - MID_HEMI) * key;
    Color3.LerpToRef(s.sky, SHOP_SKY, k, L.hemi.diffuse);
    Color3.LerpToRef(s.ground, SHOP_GROUND, k, L.hemi.groundColor);
    L.ink = s.ink * (1 - k);
    for (const [m, w] of s.outlined) { m.outlineWidth = w * (1 - k); m.renderOutline = k < 1; }
    // Her toon bands take the same light (as Graphics derives them from its rig).
    ToonPlugin.sun.copyFrom(L.sun.diffuse).scaleInPlace(L.sun.intensity / Math.PI);
    ToonPlugin.ambient.copyFrom(L.hemi.diffuse).addInPlace(L.hemi.groundColor)
      .scaleInPlace(0.5 * (s.hi + (SHOP_TOON_FILL * lv - s.hi) * k) / Math.PI);
  }

  /** Exactly the saved outdoor rig again; what `drawn()` lists re-reads the sky. */
  _restore(drawn) {
    const s = this.saved, L = this.gfx;
    this._aim(s.dir);
    L.sun.diffuse.copyFrom(s.color); L.sun.intensity = s.i;
    ToonPlugin.sun.copyFrom(s.toonSun); ToonPlugin.ambient.copyFrom(s.toonAmb);
    L.hemi.diffuse.copyFrom(s.sky); L.hemi.groundColor.copyFrom(s.ground); L.hemi.intensity = s.hi;
    if (L.scene.environmentTexture !== s.env) L.setEnvironment(s.env, drawn());
    L.scene.environmentIntensity = s.envI;
    for (const [m, w] of s.outlined) { m.outlineWidth = w; m.renderOutline = true; }
    L.ink = s.ink;
    L.raysAllowed = s.rays;
    this.saved = null;
    this._drawn = null;
  }

  /** Turn the sun (her toon bands share the vector); it shines along -sunDir from far out along it (shadow frustum). */
  _aim(dir) {
    const L = this.gfx;
    L.sunDir.copyFrom(dir);
    L.sunDir.scaleToRef(-1, L.sun.direction);
    L.sunDir.scaleToRef(120, L.sun.position);
  }
}
