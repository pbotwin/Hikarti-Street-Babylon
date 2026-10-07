import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';

/**
 * VRM 1.0 spring bones (VRMC_springBone): hair and cloth secondary motion,
 * the same verlet integration three-vrm runs (stiffness back to the rest
 * direction, drag, gravity, sphere / capsule colliders), so the original's
 * tuning carries over unchanged.
 *
 * Tails live in a "center" space (a matrix the owner moves, see Character):
 * motion of that space is not felt by the springs.
 *
 * Along a chain each joint's world transform is carried down from the joint
 * above (characters are unscaled), not recomputed by the scene graph:
 * Babylon's general world-matrix update, twice per joint, was most of the
 * cost.
 */
const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3(), _v4 = new Vector3(), _v5 = new Vector3();
const _q1 = new Quaternion(), _q2 = new Quaternion(), _q3 = new Quaternion();
const _m = new Matrix();

export class SpringBones {
  /**
   * @param {object} ext VRMC_springBone extension JSON
   * @param {(index:number) => import('@babylonjs/core').TransformNode} nodeOf glTF node index → node
   */
  constructor(ext, nodeOf) {
    this.center = Matrix.Identity();
    this._centerInv = Matrix.Identity();
    this.colliders = (ext.colliders || []).map((c) => {
      const s = c.shape.sphere || c.shape.capsule;
      return {
        node: nodeOf(c.node), radius: s.radius,
        offset: Vector3.FromArray(s.offset || [0, 0, 0]),
        tail: c.shape.capsule ? Vector3.FromArray(c.shape.capsule.tail) : null,
        w0: new Vector3(), w1: new Vector3(),
      };
    }).filter((c) => c.node);
    const groups = (ext.colliderGroups || []).map((g) => g.colliders.map((i) => this.colliders[i]).filter(Boolean));
    this.joints = [];
    for (const spring of ext.springs || []) {
      const cols = [...new Set((spring.colliderGroups || []).flatMap((g) => groups[g] || []))];
      for (let i = 0; i < spring.joints.length - 1; i++) {
        const j = spring.joints[i], node = nodeOf(j.node), child = nodeOf(spring.joints[i + 1].node);
        if (!node || !child) continue;
        this.joints.push({
          node, child, colliders: cols,
          settings: {
            stiffness: j.stiffness ?? 1, dragForce: j.dragForce ?? 0.4, gravityPower: j.gravityPower ?? 0,
            gravityDir: Vector3.FromArray(j.gravityDir || [0, -1, 0]), hitRadius: j.hitRadius ?? 0,
          },
          restRot: (node.rotationQuaternion || Quaternion.FromEulerVector(node.rotation)).clone(),
          axis: child.position.clone().normalize(),
          length: 0, tail: new Vector3(), prevTail: new Vector3(),
          // The joint above in the same chain, and this joint's world transform.
          up: null, world: new Matrix(), worldQ: new Quaternion(),
        });
      }
    }
    for (const j of this.joints) j.up = this.joints.find((o) => o.node === j.node.parent) || null;
    for (const j of this.joints) if (!j.node.rotationQuaternion) j.node.rotationQuaternion = j.restRot.clone();
    // Every joint, in chain order; `joints` are the ones simulated.
    this._all = this.joints;
  }

  /** Remove joints (their bones stay at rest). */
  deleteJoints(test) {
    this._all = this._all.filter((j) => !test(j));
    this.joints = this.joints.filter((j) => !test(j));
  }

  /**
   * Stop simulating the joints `test` picks (e.g. a hidden shirt's hem:
   * their bones rest), or start again from rest.
   */
  setPaused(test, paused) {
    this.center.invertToRef(this._centerInv);
    for (const j of this._all) {
      if (!test(j) || !!j.paused === paused) continue;
      j.paused = paused;
      if (paused) j.node.rotationQuaternion.copyFrom(j.restRot);
      else this._rest(j);
    }
    this.joints = this._all.filter((j) => !j.paused);
  }

  /** Extra collider on `node`: a sphere at local `offset`, or a capsule to `tail`. */
  addCollider(node, radius, offset, tail = null) {
    const c = { node, radius, offset, tail, w0: new Vector3(), w1: new Vector3() };
    this.colliders.push(c);
    return c;
  }

  /** Put every tail at rest (after a teleport). */
  reset() {
    this.center.invertToRef(this._centerInv);
    for (const j of this.joints) this._rest(j);
  }

  _rest(j) {
    j.node.rotationQuaternion.copyFrom(j.restRot);
    j.node.computeWorldMatrix(true);
    j.child.computeWorldMatrix(true);
    const head = j.node.getAbsolutePosition(), tail = j.child.getAbsolutePosition();
    j.length = Vector3.Distance(head, tail);
    Vector3.TransformCoordinatesToRef(tail, this._centerInv, j.tail);
    j.prevTail.copyFrom(j.tail);
  }

  update(dt) {
    if (dt <= 0) return;
    this.center.invertToRef(this._centerInv);
    const cs = this.colliders, js = this.joints;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], m = c.node.computeWorldMatrix(true);
      Vector3.TransformCoordinatesToRef(c.offset, m, c.w0);
      if (c.tail) Vector3.TransformCoordinatesToRef(c.tail, m, c.w1);
    }
    for (let k = 0; k < js.length; k++) {
      const j = js[k], st = j.settings, node = j.node;
      // The parent's world transform: the joint above, or the animated body.
      let parentWorld, parentQ;
      if (j.up) { parentWorld = j.up.world; parentQ = j.up.worldQ; } else {
        parentWorld = node.parent.computeWorldMatrix(true);
        parentQ = Quaternion.FromRotationMatrixToRef(parentWorld, j.worldQ);
      }
      const head = Vector3.TransformCoordinatesToRef(node.position, parentWorld, _v1);
      // Rest world rotation: parent world × rest local.
      parentQ.multiplyToRef(j.restRot, _q1);

      // Verlet in center space: inertia (minus drag), stiffness toward the
      // rest direction, gravity.
      const tailW = Vector3.TransformCoordinatesToRef(j.tail, this.center, _v2);
      const prevW = Vector3.TransformCoordinatesToRef(j.prevTail, this.center, _v3);
      const next = _v4.copyFrom(tailW).addInPlace(tailW.subtractToRef(prevW, _v5).scaleInPlace(1 - st.dragForce));
      j.axis.rotateByQuaternionToRef(_q1, _v5).scaleInPlace(st.stiffness * dt);
      next.addInPlace(_v5);
      next.addInPlace(st.gravityDir.scaleToRef(st.gravityPower * dt, _v5));
      this._constrain(next, head, j.length);

      for (let i = 0; i < j.colliders.length; i++) this._collide(j.colliders[i], next, head, j.length, st.hitRadius);

      j.prevTail.copyFrom(j.tail);
      Vector3.TransformCoordinatesToRef(next, this._centerInv, j.tail);

      // Turn the bone so its child points at the new tail.
      _q1.conjugateToRef(_q2);
      next.subtractToRef(head, _v5).rotateByQuaternionToRef(_q2, _v5).normalize();
      Quaternion.FromUnitVectorsToRef(j.axis, _v5, _q3);
      j.restRot.multiplyToRef(_q3, node.rotationQuaternion);
      // This joint's world transform, for the one below it.
      parentQ.multiplyToRef(node.rotationQuaternion, j.worldQ);
      Matrix.ComposeToRef(node.scaling, node.rotationQuaternion, node.position, _m).multiplyToRef(parentWorld, j.world);
    }
  }

  /** Keep the tail at bone length from the head. */
  _constrain(tail, head, length) {
    tail.subtractInPlace(head);
    const l = tail.length();
    if (l > 1e-6) tail.scaleInPlace(length / l);
    tail.addInPlace(head);
  }

  _collide(c, tail, head, length, hitRadius) {
    // Closest point on the collider (sphere centre, or along the capsule).
    let p = c.w0;
    if (c.tail) {
      const ab = c.w1.subtractToRef(c.w0, _v5), t = Vector3.Dot(tail.subtractToRef(c.w0, _v3), ab) / Math.max(1e-8, ab.lengthSquared());
      p = _v3.copyFrom(c.w0).addInPlace(ab.scaleInPlace(Math.min(1, Math.max(0, t))));
    }
    const d = tail.subtractToRef(p, _v5), dist = d.length(), r = c.radius + hitRadius;
    if (dist >= r || dist < 1e-8) return;
    tail.copyFrom(p).addInPlace(d.scaleInPlace(r / dist));
    this._constrain(tail, head, length);
  }
}

