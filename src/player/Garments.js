import { SceneLoader, Color3, PBRMaterial, SubMesh, VertexBuffer } from '@babylonjs/core';
import { Dye } from './Dye.js';

/**
 * What she wears, per part (top / bottom / shoes): her own VRM pieces
 * recoloured (tee, shorts, the Blender sneakers), or a garment modelled in
 * Blender around her rest pose (tools/blender/garments.py → garments.glb:
 * hoodie, sweatshirt, blouse, jeans, skirt) in the item's colour, shown in
 * place of the piece it replaces.
 *
 * The garments are skinned to her armature: each is bound to her own
 * skeleton (bone indices remapped by name), so it costs only its skinning
 * and draw; no second skeleton is posed. Toon-shaded and outlined like her
 * clothes; one material per garment (its colour), the fabric detail in its
 * vertex colours. Her skin under a garment isn't drawn (SkinCover).
 */
export const BASE_GARMENT = { top: 'tee', bottom: 'shorts', shoes: 'sneakers' };
const MODELLED = { top: ['hoodie', 'sweatshirt', 'blouse'], bottom: ['jeans', 'skirt'], shoes: [] };

export class Garments {
  /** Load the modelled garments (once per character). */
  static load(scene) {
    return SceneLoader.ImportMeshAsync('', './models/props/', 'garments.glb', scene);
  }

  /**
   * @param {object} character her Character (meshes, so far her VRM and sneakers)
   * @param {object} asset garments.glb as loaded (Garments.load)
   * @param {{ shade: string, outline: Color3, outlineWidth: number }} look her clothes' toon shade tone and ink
   */
  constructor(character, asset, look) {
    const meshes = character.meshes;
    const byMaterial = (re) => meshes.filter((m) => re.test(m.material?.name || ''));
    // Her VRM pieces, and how each is dyed (as the boutique always did:
    // prints on the tee stay white; the sneakers' black uppers and soles
    // take the colour, their white midsoles and laces stay).
    this.base = {
      top: { meshes: byMaterial(/^Tops_01_CLOTH/), whites: true },
      bottom: { meshes: byMaterial(/^Bottoms_01_CLOTH/), whites: false },
      shoes: { meshes: [], dyes: [...new Set(byMaterial(/^shoeBlack$/).map((m) => m.material))].map((m) => new Dye(m, { shade: 'keep' })) },
    };
    for (const part of ['top', 'bottom']) {
      const b = this.base[part];
      b.dyes = [...new Set(b.meshes.map((m) => m.material))].map((m) => new Dye(m, { whites: b.whites }));
    }

    const body = this.base.top.meshes[0];
    const skeleton = body.skeleton;
    const ownIndex = new Map(skeleton.bones.map((b) => [b.name, b.getIndex()]));
    const shade = Color3.FromHexString(look.shade).toLinearSpace();
    const placeholders = new Set();
    this.models = {};
    // Her other pieces each garment covers (they'd poke out of it).
    this.covered = new Map();
    const covers = [];
    for (const mesh of asset.meshes) {
      const name = mesh.name.replace(/^garment_/, '');
      if (!mesh.skeleton || name === mesh.name) continue;
      // The garment's joints → her skeleton's bones, by name.
      const remap = [];
      for (const b of mesh.skeleton.bones) remap[b.getIndex()] = ownIndex.get(b.name) ?? 0;
      const idx = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind, false, true);
      for (let i = 0; i < idx.length; i++) idx[i] = remap[idx[i]];
      mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, idx, false);
      mesh.skeleton = skeleton;
      // Same space as her body's vertices: same parent and placement.
      mesh.parent = body.parent;
      mesh.position.copyFrom(body.position);
      mesh.rotationQuaternion = body.rotationQuaternion?.clone() || null;
      mesh.rotation.copyFrom(body.rotation);
      mesh.scaling.copyFrom(body.scaling);
      placeholders.add(mesh.material);
      mesh.material = garmentMaterial(mesh.getScene(), name, shade);
      // Its vertex colours are fabric shading, not transparency.
      mesh.hasVertexAlpha = false;
      mesh.receiveShadows = true;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.renderOutline = true;
      mesh.outlineColor = look.outline;
      mesh.outlineWidth = look.outlineWidth;
      mesh.isVisible = false;
      this.models[name] = mesh;
      meshes.push(mesh);
      const extras = mesh.metadata?.gltf?.extras || {};
      covers.push({ name, bottom: MODELLED.bottom.includes(name), boxes: extras.hides || [] });
      this.covered.set(name, meshes.filter((m) => (extras.covers || []).includes(m.material?.name)));
    }
    // What the file brought besides the meshes: its copy of the armature
    // and its placeholder material.
    for (const s of asset.skeletons) s.dispose();
    for (const t of asset.transformNodes) t.dispose();
    for (const m of placeholders) m?.dispose();
    asset.meshes[0].dispose();

    this.skin = new SkinCover(byMaterial(/^Body_00_SKIN/)[0], covers);
    this.worn = { ...BASE_GARMENT };
  }

  /**
   * Wear `garment` (default: her own piece) on `part` in colour `hex` (null:
   * the piece's own colour). Resolves once it shows (a textured piece's
   * re-toned copy is made off-thread).
   */
  set(part, garment, hex) {
    garment ||= BASE_GARMENT[part];
    this.worn[part] = garment;
    const base = this.base[part], own = garment === BASE_GARMENT[part];
    for (const m of base.meshes) m.isVisible = own;
    for (const name of MODELLED[part]) this.models[name].isVisible = name === garment;
    const worn = Object.values(this.worn);
    this.skin.show(worn);
    for (const list of this.covered.values()) {
      for (const m of list) m.isVisible = !worn.some((g) => this.covered.get(g)?.includes(m));
    }
    if (own) return Promise.all(base.dyes.map((d) => d.apply(hex)));
    Color3.FromHexString(hex || '#ffffff').toLinearSpaceToRef(this.models[garment].material.albedoColor);
    return Promise.resolve();
  }

  dispose() {
    for (const m of Object.values(this.models)) {
      m.material.dispose();
      m.dispose();
    }
    this.models = {};
  }
}

/** A garment's own toon material: her clothes' shade tone and crisp band. */
function garmentMaterial(scene, name, shade) {
  const m = new PBRMaterial(`garment:${name}`, scene);
  m.metallic = 0;
  m.roughness = 1;
  m.environmentIntensity = 0.35;
  m.specularIntensity = 0;
  const toon = m.pluginManager.getPlugin('Toon');
  toon.shade.copyFrom(shade);
  toon.params[0] = 0.02;
  toon.params[1] = 0.92;
  toon.isEnabled = true;
  return m;
}

/**
 * Her skin under the garments she wears isn't drawn. Its triangles are
 * regrouped (once, at load) by which garments cover them (each garment's
 * `hides` boxes, rest pose, all three corners inside), and the skin draws
 * only the uncovered groups as contiguous index ranges. Covered skin could
 * otherwise poke through in a deep bend, and its ink outline, whose depth is
 * written pulled toward the camera, showed through tight jeans as streaks.
 *
 * Group order: skin only bottoms cover, then skin nothing covers, then skin
 * only tops cover (the less covered first), so any outfit draws in one or
 * two ranges.
 */
class SkinCover {
  constructor(skin, covers) {
    this.skin = skin;
    this.bits = new Map(covers.map((c, i) => [c.name, 1 << i]));
    const bottoms = covers.reduce((m, c) => (c.bottom ? m | this.bits.get(c.name) : m), 0);
    const pos = skin.getVerticesData(VertexBuffer.PositionKind);
    const idx = skin.getIndices();
    const inside = (v, b) => {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      for (let k = 0; k < b.length; k += 6) {
        if (x >= b[k] && y >= b[k + 1] && z >= b[k + 2] && x <= b[k + 3] && y <= b[k + 4] && z <= b[k + 5]) return true;
      }
      return false;
    };
    const groups = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      let mask = 0;
      for (const c of covers) {
        if (inside(idx[t], c.boxes) && inside(idx[t + 1], c.boxes) && inside(idx[t + 2], c.boxes)) mask |= this.bits.get(c.name);
      }
      if (!groups.has(mask)) groups.set(mask, []);
      groups.get(mask).push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const count = (m) => { let n = 0; for (; m; m &= m - 1) n++; return n; };
    const key = (m) => (m === 0 ? 0 : m & bottoms ? -count(m) : count(m));
    const order = [...groups.keys()].sort((a, b) => key(a) - key(b));
    const sorted = new Uint32Array(idx.length);
    this.runs = [];
    let at = 0;
    for (const mask of order) {
      const tris = groups.get(mask);
      sorted.set(tris, at);
      this.runs.push({ mask, start: at, count: tris.length });
      at += tris.length;
    }
    skin.setIndices(sorted);
    this._subs = new Map();
    this._hidden = -1;
  }

  /** Draw the skin that none of the worn garments (names) covers. */
  show(worn) {
    let hidden = 0;
    for (const name of worn) hidden |= this.bits.get(name) || 0;
    if (hidden === this._hidden) return;
    this._hidden = hidden;
    const subs = [];
    let start = -1, end = 0;
    for (const r of this.runs) {
      if (r.mask & hidden) continue;
      if (r.start !== end || start < 0) {
        if (start >= 0) subs.push(this._sub(start, end - start));
        start = r.start;
      }
      end = r.start + r.count;
    }
    if (start >= 0) subs.push(this._sub(start, end - start));
    this.skin.subMeshes = subs;
  }

  /** A submesh drawing indices [start, start + count), kept for reuse. */
  _sub(start, count) {
    const k = `${start}:${count}`;
    let s = this._subs.get(k);
    if (!s) {
      const m = this.skin;
      s = new SubMesh(0, 0, m.getTotalVertices(), start, count, m, m, false, false);
      // Culled like the whole of her (the parts move away from their rest
      // place as she poses).
      s.setBoundingInfo(m.getBoundingInfo());
      this._subs.set(k, s);
    }
    return s;
  }
}
