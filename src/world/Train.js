import { SceneLoader, TransformNode } from '@babylonjs/core';

/**
 * The commuter train on the north overpass (Props.js buildOverpass): four
 * cars glide across every 36 s, alternating direction, and are hidden the
 * rest of the cycle. Other systems (residents, audio) read ctx.trainX: the
 * train's x while it is on the bridge, null otherwise.
 */
export class Train {
  /** @param at {y, z} of the train's centre line (city.json) */
  constructor(scene, ctx, at) {
    this.scene = scene;
    this.ctx = ctx;
    this.root = new TransformNode('train', scene);
    this.root.position.set(-200, at.y, at.z);
    this.root.setEnabled(false);
    this.t = 12;
    this.meshes = [];
  }

  async load(graphics) {
    const result = await SceneLoader.ImportMeshAsync('', './world/', 'train.opt.glb', this.scene);
    for (const m of result.meshes) {
      if (!m.parent) m.parent = this.root;
      if (!m.getTotalVertices()) continue;
      m.isPickable = false;
      m.receiveShadows = true;
      m.material?.freeze();
      this.meshes.push(m);
    }
    graphics.addCasters(this.meshes);
    return this;
  }

  update(dt) {
    this.t += dt;
    const cycle = 36;
    const k = (this.t % cycle) / 9;   // passes during the first 9 s of each cycle
    const visible = k < 1;
    if (this.root.isEnabled() !== visible) this.root.setEnabled(visible);
    const dir = Math.floor(this.t / cycle) % 2 ? -1 : 1;   // alternate directions
    if (visible) this.root.position.x = dir * (-140 + k * 280) - 30;
    this.ctx.trainX = visible ? this.root.position.x : null;
  }

  dispose() {
    this.root.dispose(false, true);
    this.meshes.length = 0;
  }
}
