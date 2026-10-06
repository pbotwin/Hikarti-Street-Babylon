import { SceneLoader, Color3, Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { loadVrm } from './Vrm.js';
import { SpringBones } from './SpringBones.js';

/**
 * The heroine: her VRM (toon-shaded, outlined), humanoid rig, expressions and
 * hair / shirt spring bones. Same surface as the original Character: root,
 * bone(name), hairWind, hairRigid, resetSecondaryMotion(), update(dt).
 */
export class Character {
  static async load(scene, url) {
    const [vrm, parts] = await Promise.all([
      loadVrm(scene, url),
      // Outfit pieces modelled in Blender from kpd/ch.png (optional).
      SceneLoader.ImportMeshAsync('', './models/props/', 'heroine_parts.glb', scene).catch(() => null),
    ]);
    const c = new Character(vrm);
    if (parts) c._dress(parts);
    return c;
  }

  constructor(vrm) {
    this.vrm = vrm;
    this.root = vrm.root;
    this.rig = vrm.rig;
    this.meshes = vrm.meshes;
    // While riding, the hair space moves rigidly with her (and the vehicle),
    // so speed and cornering don't fling the hair; set by the VehicleSystem.
    this.hairRigid = false;
    // Wind for open vehicles (set per frame by the ride).
    this.hairWind = new Vector3();
    this._lastRoot = new Vector3();
    this._lastRootQ = new Quaternion();
    const ext = vrm.json.extensions?.VRMC_springBone;
    if (ext) this._springs(ext);
  }

  /**
   * Fit the Blender outfit to the rig: chunky sneakers + socks on the feet
   * (replacing the sample's flats). Parts are authored in rest-pose space, so
   * they are attached while the rig is at rest.
   */
  _dress(parts) {
    const targets = { shoe_L: this.bone('leftFoot'), shoe_R: this.bone('rightFoot') };
    this.root.computeWorldMatrix(true);
    for (const n of Object.values(this.vrm.bones)) n.computeWorldMatrix(true);
    const top = parts.meshes[0];
    for (const obj of top.getChildren()) {
      const bone = targets[obj.name];
      if (!bone) { obj.dispose(); continue; }
      for (const m of [obj, ...obj.getChildMeshes()]) {
        if (!m.getTotalVertices?.()) continue;
        const mat = m.material;
        if (mat) {
          // A flat toon material in the model's own shading style.
          mat.albedoTexture = null;
          mat.metallic = 0; mat.roughness = 1; mat.environmentIntensity = 0.35; mat.specularIntensity = 0;
          mat.backFaceCulling = false;
          const toon = mat.pluginManager?.getPlugin('Toon');
          if (toon) {
            // Shade ≈ colour × 0.6, tinted a little toward plum (as the original).
            toon.shade = new Color3(0.6, 0.53, 0.6).toLinearSpace();
            toon.isEnabled = true;
          }
        }
        m.receiveShadows = true;
        m.alwaysSelectAsActiveMesh = true;
        m.renderOutline = true;
        m.outlineColor = Color3.FromHexString('#3a2a33');
        m.outlineWidth = 0.0035;
        this.meshes.push(m);
      }
      obj.setParent(bone);
    }
    top.dispose(false, false);
    // Hide the sample's own flat shoes under the new sneakers.
    for (const m of this.meshes) {
      const mats = m.material?.subMaterials || [m.material];
      if (mats.some((x) => x && /Shoes/.test(x.name)) && mats.length === 1) m.isVisible = false;
    }
  }

  /**
   * Spring bones tuned like the original: the sample's sleeve springs were
   * authored for its T-pose and flare out like wings once the arms are
   * lowered, so they go. The shirt hem stays, stiff and damped like cloth
   * (it follows her at once instead of trailing on a bike); the hair gets
   * weight and calm (it had no gravity and little damping, so running and
   * jumping flung it upward).
   */
  _springs(ext) {
    const sb = this.springs = new SpringBones(ext, this.vrm.nodeOf);
    sb.deleteJoints((j) => /Tops.*Arm/i.test(j.node.name));
    for (const j of sb.joints) {
      const st = j.settings;
      if (/Tops/i.test(j.node.name)) {
        st.stiffness = Math.max(st.stiffness, 4);
        st.dragForce = Math.max(st.dragForce, 0.95);
        st.gravityPower = 0.1;
      } else {
        st.stiffness = Math.max(st.stiffness * 1.6, 0.9);
        st.dragForce = Math.max(st.dragForce, 0.6);
        st.gravityPower = Math.max(st.gravityPower, 0.55);
      }
      st.gravityDir.set(0, -1, 0);
      // Strands with some thickness never pass through her body or shirt.
      st.hitRadius = Math.max(st.hitRadius, 0.022);
    }
    this._bodyColliders();
    sb.reset();
  }

  /**
   * The sample's colliders stop at the chest, but the hair reaches the lower
   * back: add the back, hips, bottom, thighs and bigger shoulders, placed
   * from the rest pose in world space (raw bone axes vary between models).
   */
  _bodyColliders() {
    this.root.computeWorldMatrix(true);
    for (const n of Object.values(this.vrm.bones)) n.computeWorldMatrix(true);
    const sb = this.springs, colliders = [], inv = new Matrix();
    const wp = (n) => this.bone(n)?.getAbsolutePosition().clone();
    const add = (bone, radius, [a, b]) => {
      const node = this.bone(bone);
      if (!node) return;
      node.getWorldMatrix().invertToRef(inv);
      colliders.push(sb.addCollider(node, radius, Vector3.TransformCoordinates(a, inv), b ? Vector3.TransformCoordinates(b, inv) : null));
    };
    const back = new Vector3(0, 0, -1); // she faces +Z
    const hips = wp('hips'), spine = wp('spine'), chest = wp('upperChest') || wp('chest'), neck = wp('neck');
    if (hips) {
      add('hips', 0.12, [hips.add(back.scale(0.02))]);
      // Bottom: below and behind the hip joint.
      add('hips', 0.105, [hips.add(new Vector3(0, -0.11, -0.045))]);
    }
    if (spine && chest) add('spine', 0.11, [spine.add(back.scale(0.025)), chest.add(back.scale(0.03))]);
    if (chest && neck) {
      // Upper back / shoulder blades as a wide capsule across the chest.
      add(this.bone('upperChest') ? 'upperChest' : 'chest', 0.085, [chest.add(new Vector3(0.07, 0.02, -0.035)), chest.add(new Vector3(-0.07, 0.02, -0.035))]);
    }
    for (const side of ['left', 'right']) {
      const ul = wp(side + 'UpperLeg'), ll = wp(side + 'LowerLeg'), ft = wp(side + 'Foot');
      if (ul && ll) add(side + 'UpperLeg', 0.075, [ul, ll]);
      if (ll && ft) add(side + 'LowerLeg', 0.05, [ll, ft]);
      const ua = wp(side + 'UpperArm'), la = wp(side + 'LowerArm'), sh = wp(side + 'Shoulder');
      if (ua && la) add(side + 'UpperArm', 0.058, [ua, la]);
      if (sh && ua) add(side + 'Shoulder', 0.06, [sh, ua]);
    }
    for (const j of sb.joints) j.colliders.push(...colliders);
  }

  /** The (raw) bone transform node: attach held things here. */
  bone(name) { return this.vrm.bones[name] || null; }

  setExpression(name, w) { this.vrm.setExpression(name, w); }

  _rootRotation(out) {
    return this.root.rotationQuaternion ? out.copyFrom(this.root.rotationQuaternion) : Quaternion.FromEulerVectorToRef(this.root.rotation, out);
  }

  /** Call after teleporting so hair/cloth springs don't whip across the map. */
  resetSecondaryMotion() {
    if (!this.springs) return;
    this.root.computeWorldMatrix(true);
    Matrix.ComposeToRef(ONE, QI, this.root.position, this.springs.center);
    this._lastRoot.copyFrom(this.root.position);
    this._rootRotation(this._lastRootQ);
    this.springs.reset();
  }

  /**
   * Spring bones sub-stepped at ≤1/60 s so secondary motion stays stable on
   * slow frames. Hair simulates in a "hair space" that carries all of the
   * body's vertical motion and most of its horizontal motion (HAIR_CARRY):
   * without it the sudden stop on landing whipped the hair up like spikes;
   * carrying only half of the running speed streamed it out like a flag.
   */
  update(dt) {
    const sb = this.springs;
    if (!sb) return;
    const r = this.root.position, hs = sb.center, q = this._rootRotation(_q);
    if (this.hairRigid) {
      // Carry the hair space with her full motion (translation + turning),
      // kept continuous: H ← H · last⁻¹ · now (Babylon's row-vector order).
      Matrix.ComposeToRef(ONE, this._lastRootQ, this._lastRoot, _mLast).invert();
      Matrix.ComposeToRef(ONE, q, r, _mNow);
      _mLast.multiplyToRef(_mNow, _mD);
      hs.multiplyToRef(_mD, _mH);
      hs.copyFrom(_mH);
    } else {
      // On foot: all of the vertical, most of the horizontal motion.
      const m = hs.m;
      hs.setTranslationFromFloats(m[12] + (r.x - this._lastRoot.x) * HAIR_CARRY, m[13] + r.y - this._lastRoot.y, m[14] + (r.z - this._lastRoot.z) * HAIR_CARRY);
      // Ease any rotation picked up while riding back to upright.
      hs.decompose(_s, _q2, _p);
      if (Math.abs(_q2.w) < 0.99999) {
        Quaternion.SlerpToRef(_q2, QI, Math.min(1, dt * 1.5), _q2);
        Matrix.ComposeToRef(ONE, _q2, _p, hs);
      }
    }
    this._lastRoot.copyFrom(r);
    this._lastRootQ.copyFrom(q);
    // Open vehicles: a breeze that grows with speed blows the hair back.
    const w = this.hairWind;
    _g.set(w.x, -1 + w.y, w.z).normalize();
    for (const j of sb.joints) j.settings.gravityDir.copyFrom(_g);
    const steps = Math.min(4, Math.max(1, Math.ceil(dt * 60 - 0.01)));
    for (let i = 0; i < steps; i++) sb.update(dt / steps);
  }
}

// Share of her horizontal motion the hair space follows on foot (see update).
const HAIR_CARRY = 0.85;
const ONE = Vector3.One();
const QI = Quaternion.Identity();
const _q = new Quaternion(), _q2 = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _g = new Vector3();
const _mLast = new Matrix(), _mNow = new Matrix(), _mD = new Matrix(), _mH = new Matrix();
