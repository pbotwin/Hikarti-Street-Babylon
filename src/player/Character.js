import { loadVrm } from './Vrm.js';

/**
 * The heroine: her VRM (toon-shaded, outlined), humanoid rig and expressions.
 * Same surface as the original Character: root, bone(name), update(dt).
 */
export class Character {
  static async load(scene, url) {
    return new Character(await loadVrm(scene, url));
  }

  constructor(vrm) {
    this.vrm = vrm;
    this.root = vrm.root;
    this.rig = vrm.rig;
    this.meshes = vrm.meshes;
    this.hairRigid = false;
  }

  /** The (raw) bone transform node: attach held things here. */
  bone(name) { return this.vrm.bones[name] || null; }

  setExpression(name, w) { this.vrm.setExpression?.(name, w); }

  resetSecondaryMotion() { this.springs?.reset(); }

  update(dt) { this.springs?.update(dt); }
}
