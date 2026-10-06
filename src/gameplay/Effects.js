import { MeshBuilder } from '@babylonjs/core';
import { Footsteps } from './Footsteps.js';
import { glowTexture, basicMaterial } from './FxKit.js';

/**
 * Character feedback effects:
 *  - a soft contact shadow under the heroine: a light occlusion under the
 *    shoes while standing (grounds her on every surface), growing into a
 *    clear landing marker while airborne (a platformer staple)
 *  - surface-aware footstep, take-off and landing reactions (Footsteps)
 */
export class Effects {
  constructor(scene, state, collision) {
    this.collision = collision;
    this.footsteps = new Footsteps(scene, state, collision);

    const mat = basicMaterial(scene, 'contact-shadow', { color: '#1a1420', map: glowTexture(scene), opacity: 0, depthWrite: false });
    mat.zOffset = -6;
    mat.zOffsetUnits = -6;
    this.blob = MeshBuilder.CreateGround('contact-shadow', { width: 1, height: 1 }, scene);
    this.blob.material = mat;
    this.blob.isPickable = false;
    this.blob.alphaIndex = 2;
    mat.forceCompilation(this.blob);

    state.on('player:jump', ({ position, speed }) => this.footsteps.takeoff(position, speed));
    state.on('player:land', ({ position, impact }) => this.footsteps.land(position, impact));
  }

  update(dt, player) {
    this.footsteps.update(dt, player);
    const p = player.position;
    // Highest surface under the feet.
    const g = this.collision.groundHeight(p.x, p.z, 0.2, p.y + 0.01, 0);
    const h = Math.max(0, p.y - g);
    // Standing: a faint, tight occlusion under the shoes (no dark halo).
    const target = player.grounded ? 0.22 : Math.min(0.55, Math.max(0.2, 0.55 - h * 0.08));
    const m = this.blob.material;
    m.alpha += (target - m.alpha) * (1 - Math.exp(-14 * dt));
    this.blob.setEnabled(m.alpha > 0.01 && !player.ride);
    const s = player.grounded ? 0.62 : 0.75 + Math.min(h, 4) * 0.08;
    this.blob.scaling.x += (s - this.blob.scaling.x) * (1 - Math.exp(-14 * dt));
    this.blob.scaling.z = this.blob.scaling.x;
    this.blob.position.set(p.x, g + 0.012, p.z);
  }
}
