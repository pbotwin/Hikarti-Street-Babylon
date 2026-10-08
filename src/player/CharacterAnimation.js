import { Vector3, Quaternion } from '@babylonjs/core';
import { MathUtils } from './math.js';

/**
 * Procedural animation for the heroine.
 *
 * Every motion — idle, walk, run, jump, fall, land, turn — is synthesised
 * each frame on the VRM's *normalized* humanoid bones (HumanoidRig, Vrm.js), then layered by
 * smoothly-blended weights. Because the cycle is driven by actual ground
 * speed (phase advances by distance travelled), feet don't skate, and
 * transitions are continuous by construction.
 *
 * Normalized rig conventions (character faces +Z, her left is +X):
 *   upperLeg.x  < 0  swings leg forward      lowerLeg.x > 0  bends knee
 *   upperArm.z       lowers arm (left -, right +); upperArm.x < 0 swings forward
 *   lowerArm.y       bends elbow (left -, right +)
 *   spine.x     > 0  leans forward           foot.x > 0      points toe down
 */
const BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'rightShoulder',
  'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot',
];
const IDX = Object.fromEntries(BONES.map((b, i) => [b, i]));
const N = BONES.length;

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const SEGMENTS = ['Proximal', 'Intermediate', 'Distal'];

const TAU = Math.PI * 2;

/** Periodic Catmull-Rom curve through [t, value] keys (t in [0,1)). */
function loopCurve(keys) {
  const n = keys.length;
  return (u) => {
    u = ((u % 1) + 1) % 1;
    let i = n - 1;
    for (let k = 0; k < n; k++) if (keys[k][0] <= u) i = k;
    const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
    const t1 = k1[0], t2 = k2[0] <= t1 ? k2[0] + 1 : k2[0];
    const f = (u < t1 ? u + 1 - t1 : u - t1) / (t2 - t1);
    const m1 = (k2[1] - k0[1]) * 0.5, m2 = (k3[1] - k1[1]) * 0.5;
    const f2 = f * f, f3 = f2 * f;
    return (2 * f3 - 3 * f2 + 1) * k1[1] + (f3 - 2 * f2 + f) * m1 + (-2 * f3 + 3 * f2) * k2[1] + (f3 - f2) * m2;
  };
}

// Run cycle keys for one leg; t = 0 is foot contact. Thigh: negative = forward.
const RUN = {
  thigh: loopCurve([[0, -0.42], [0.14, -0.05], [0.32, 0.42], [0.48, 0.3], [0.66, -0.55], [0.84, -0.85], [0.95, -0.6]]),
  knee: loopCurve([[0, 0.3], [0.13, 0.62], [0.3, 0.28], [0.47, 1.45], [0.62, 1.95], [0.8, 1.2], [0.93, 0.5]]),
  foot: loopCurve([[0, -0.12], [0.14, 0.0], [0.3, 0.55], [0.48, 0.55], [0.7, 0.1], [0.9, -0.15]]),
  // Arm swing (upperArm.x): negative = forward. Peaks align with the opposite knee drive.
  arm: loopCurve([[0, 0.05], [0.25, 0.55], [0.5, 0.05], [0.75, -0.75]]),
};

/** Non-looping smoothstep interpolation through [t, value] keys. */
export function keyed(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (u <= t1) {
      const [t0, v0] = keys[i - 1];
      const f = (u - t0) / (t1 - t0);
      return v0 + (v1 - v0) * f * f * (3 - 2 * f);
    }
  }
  return keys[keys.length - 1][1];
}

// Mantle onto a roof, keyed on climb progress u (0..1); left side, the
// right mirrors y/z. Phases match the controller's foot path:
//   crouch 0-0.12 · hop 0.12-0.24 · hang 0.24-0.42 · pull 0.42-0.66 ·
//   knee over + press 0.66-0.84 · stand 0.84-1.
// While the hands hold the edge the arms are solved by IK, so these arm
// keys only set the reach before the grab and the release afterwards.
const CLIMB = {
  armX: [[0, 0.05], [0.12, 0.45], [0.22, -1.1], [0.84, -0.75], [0.92, -0.35], [1, 0.05]],
  armY: [[0, 0.12], [0.12, 0.1], [0.22, -1.0], [0.84, -0.35], [0.92, -0.1], [1, 0.12]],
  armZ: [[0, -1.2], [0.12, -1.15], [0.22, 0.55], [0.84, -0.95], [0.92, -1.15], [1, -1.2]],
  elbow: [[0, -0.3], [0.12, -0.2], [0.22, -0.15], [0.84, -0.7], [0.92, -0.45], [1, -0.32]],
  // Lead leg (left) brings its knee onto the roof; trail leg follows.
  leadThigh: [[0, -0.1], [0.12, -0.75], [0.2, 0.05], [0.32, -0.6], [0.42, -0.55], [0.62, -1.45], [0.76, -1.25], [0.88, -0.75], [1, -0.1]],
  leadKnee: [[0, 0.2], [0.12, 1.3], [0.2, 0.15], [0.32, 1.15], [0.42, 1.1], [0.62, 2.2], [0.76, 1.95], [0.88, 1.2], [1, 0.2]],
  trailThigh: [[0, 0.02], [0.12, -0.7], [0.2, 0.1], [0.32, -0.45], [0.42, -0.35], [0.62, 0.05], [0.76, -0.95], [0.88, -0.7], [1, 0.02]],
  trailKnee: [[0, 0.05], [0.12, 1.2], [0.2, 0.1], [0.32, 1.0], [0.42, 0.9], [0.62, 0.85], [0.76, 2.0], [0.88, 1.15], [1, 0.05]],
  leadFoot: [[0, -0.08], [0.12, -0.5], [0.2, 0.5], [0.32, -0.3], [0.62, 0.2], [0.76, -0.1], [0.88, -0.35], [1, -0.08]],
  trailFoot: [[0, -0.02], [0.12, -0.45], [0.2, 0.55], [0.32, -0.25], [0.62, 0.4], [0.76, 0.3], [0.88, -0.3], [1, -0.02]],
  spine: [[0, 0.03], [0.12, 0.35], [0.2, -0.05], [0.32, -0.08], [0.42, 0.0], [0.62, 0.35], [0.76, 0.62], [0.88, 0.35], [1, 0.03]],
  head: [[0, 0.05], [0.12, -0.25], [0.24, -0.45], [0.42, -0.35], [0.62, -0.2], [0.76, -0.15], [0.88, 0.05], [1, 0.05]],
  hipY: [[0, 0], [0.12, -0.17], [0.2, 0.02], [0.42, 0], [0.76, -0.12], [0.88, -0.2], [1, 0]],
};

const _v1 = new Vector3(), _v2 = new Vector3(), _v3 = new Vector3();
const _v4 = new Vector3(), _v5 = new Vector3(), _v6 = new Vector3();
const _v7 = new Vector3(), _v8 = new Vector3(), _v9 = new Vector3();
const _v10 = new Vector3();
const _q1 = new Quaternion(), _q2 = new Quaternion(), _q3 = new Quaternion(), _qI = new Quaternion();

/** Rotate a bone (in world space) so its `from` direction points along `to`, by weight w. */
function _rotateTowards(node, from, to, w) {
  Quaternion.FromUnitVectorsToRef(from.normalize(), to.normalize(), _q1);
  if (w < 1) Quaternion.SlerpToRef(_qI, _q1, w, _q1);
  // world' = q · parentWorld · local  ⇒  local' = parentWorld⁻¹ · q · parentWorld · local
  const pw = node.parent.absoluteRotationQuaternion;
  pw.conjugateToRef(_q3).multiplyToRef(_q1, _q2).multiplyToRef(pw, _q1);
  _q1.multiplyToRef(node.rotationQuaternion, node.rotationQuaternion);
}

/** World position of a node (its world matrix must be current). */
const worldPos = (node, out) => out.copyFrom(node.getAbsolutePosition());

// Seated / riding base poses (see _buildRide). Thigh -π/2 is horizontal.
const RIDE = {
  // Car seat: slightly reclined, thighs level, shins down to the pedals.
  car: { hips: -0.14, spine: 0.08, chest: 0.03, neck: 0.04, head: 0.1, thigh: -1.38, spread: 0.07, knee: 1.35, foot: -0.15,
    armX: -0.75, armY: 1.05, armZ: 0.25 },
  // Sport-ish motorcycle: lean forward, knees hugging the tank, feet back on pegs.
  moto: { hips: 0.22, spine: 0.22, chest: 0.08, neck: -0.1, head: -0.35, thigh: -1.42, spread: 0.24, knee: 1.95, foot: 0.2,
    armX: -1.0, armY: 0.55, armZ: 0.45 },
  // Step-through scooter: upright, feet forward on the floorboard.
  scooter: { hips: 0.02, spine: 0.2, chest: 0.06, neck: 0.0, head: 0.02, thigh: -1.35, spread: 0.12, knee: 1.25, foot: -0.05,
    armX: -0.95, armY: 0.6, armZ: 0.35 },
  // Chair / stool (shops, cafés): upright, thighs level, shins straight down,
  // hands resting in the lap (arms are posed by the act layer).
  chair: { hips: -0.02, spine: 0.04, chest: 0.02, neck: 0.02, head: 0.06, thigh: -1.5, spread: 0.1, knee: 1.5, foot: 0.0,
    armX: -0.55, armY: 0.35, armZ: 0.95, hipY: -0.43 },
  // City bicycle: a little forward, legs on the pedals (IK).
  bicycle: { hips: 0.26, spine: 0.3, chest: 0.08, neck: -0.05, head: -0.25, thigh: -1.1, spread: 0.06, knee: 1.3, foot: 0.1,
    armX: -1.05, armY: 0.5, armZ: 0.4 },
};

const damp = (a, b, lambda, dt) => MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt));
// Root-space hand positions for a basket (left) and a shopping bag (right).
// +x is her left. The things hang from these points (InteriorSystem).
export const BASKET_HAND = [0.3, 0.84, 0.1];
export const BAG_HAND = [-0.3, 0.82, 0.04];
// Finger curl that closes the hand around a ~3 cm bar.
const GRIP_CURL = 1.2;
const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

/** A pose: Euler angles for each bone plus a hips translation. */
class Pose {
  constructor() { this.r = new Float32Array(N * 3); this.hip = new Float32Array(3); }
  clear() { this.r.fill(0); this.hip.fill(0); return this; }
  set(bone, x = 0, y = 0, z = 0) {
    const i = IDX[bone] * 3;
    this.r[i] = x; this.r[i + 1] = y; this.r[i + 2] = z;
  }
  add(bone, x = 0, y = 0, z = 0) {
    const i = IDX[bone] * 3;
    this.r[i] += x; this.r[i + 1] += y; this.r[i + 2] += z;
  }
  /** this += other * w */
  accumulate(other, w) {
    if (w <= 0) return;
    for (let i = 0; i < this.r.length; i++) this.r[i] += other.r[i] * w;
    for (let i = 0; i < 3; i++) this.hip[i] += other.hip[i] * w;
  }
}

export class CharacterAnimation {
  constructor(character) {
    this.character = character;
    this.rig = character.rig;
    // Raw bone nodes: the pose goes through the rig (normalized → raw); IK
    // and attachments work on them in world space.
    this.nodes = BONES.map((b) => character.bone(b));
    // Ancestors of the hips below her root, refreshed (top-down) before IK.
    this.chain = [];
    for (let n = this.nodes[IDX.hips]?.parent; n && n !== character.root; n = n.parent) this.chain.unshift(n);
    // Hips in her root space at rest (loaded at the origin, unrotated).
    this._refresh();
    this.hipsRest = this.nodes[IDX.hips].getAbsolutePosition().subtract(character.root.position);

    this.fingerNodes = [];
    for (const side of ['left', 'right']) {
      for (const f of FINGERS) for (const s of SEGMENTS) {
        const name = `${side}${f}${s}`;
        if (character.bone(name)) this.fingerNodes.push({ name, side, seg: s });
      }
      for (const seg of ['Metacarpal', 'Proximal', 'Distal']) {
        const name = `${side}Thumb${seg}`;
        if (character.bone(name)) this.fingerNodes.push({ name, side, seg: 'Thumb' + seg });
      }
    }

    this.idle = new Pose();
    this.loco = new Pose();
    this.runPose = new Pose();
    this.air = new Pose();
    this.climbPose = new Pose();
    this.ridePose = new Pose();
    this.out = new Pose();

    // Layer weights (smoothed every frame).
    this.wLoco = 0;
    this.wRun = 0;
    this.wAir = 0;
    this.wClimb = 0;
    this.wRide = 0;
    this.climbU = 0;
    this.phase = 0;
    this.time = 0;
    this.landImpact = 0;    // spring-driven crouch on landing
    this.landVel = 0;
    this.lean = 0;          // roll into turns
    this.turnShuffle = 0;   // in-place turning step
    this.turnPhase = 0;
    this.vyAir = 0;
    this.headYaw = 0;
    this.headPitch = 0;
    this.lookTimer = 2;
    this.lookTarget = { yaw: 0, pitch: 0 };

    this.blinkTimer = 2.5;
    this.blinkT = -1;
    this.joy = 0;           // "happy" expression after collecting
    // Shop actions, driven each frame by InteriorSystem (all weights 0..1):
    //   carry: left hand holds a basket at her side (IK)
    //   reach: { x, y, z, w } right hand to a world point (taking a product, paying)
    //   holdR: right fingers close (holding something)
    //   sit:   sitting on a chair / stool
    //   eat:   right hand to the mouth
    //   crouch: knees and back bend to reach a low shelf (0..1 a squat;
    //          on to 2 she bends over further, toward the floor)
    //   bag:   right hand holds a shopping bag out at her side (IK)
    //   hands: { wl, wr, l: [x, y, z], r: [x, y, z] } both hands to world
    //          points, fingers closed (a cart handle, clothes on hangers);
    //          takes over from the basket / reach / bag when set
    //   step:  she is moved by a scripted action (held, no physics): her
    //          legs walk and shuffle with how her root moves instead of
    //          sliding across the floor
    this.act = { carry: 0, reach: null, holdR: 0, sit: 0, eat: 0, crouch: 0, bag: 0, hands: null, step: false };
    this._was = { x: 0, z: 0, yaw: 0 };   // her root at the last update (act.step)
    this.actPose = new Pose();
  }

  /** Bring the skeleton's world matrices up to date (top-down) for IK. */
  _refresh() {
    this.character.root.computeWorldMatrix(true);
    for (const n of this.chain) n.computeWorldMatrix(true);
    for (const n of this.nodes) n?.computeWorldMatrix(true);
  }

  /** Called on landing; strength 0..1 from fall speed. */
  land(strength) {
    this.landVel -= 3.2 * (0.35 + strength);
  }

  celebrate() { this.joy = 1.6; }

  /** Jump start: a quick leg extension / arm swing burst layered on top. */
  takeoff() { this.takeoffT = 0.16; this.windupT = 0; this.leapSide = this.phase < 0.5 ? 1 : -1; }

  /** Climb start: drop any jump/landing additives so the mantle pose reads cleanly. */
  climb() { this.windupT = 0; this.takeoffT = 0; this.landImpact = 0; this.landVel = 0; }

  /** Crouch before liftoff (duration in seconds). */
  windup(d) { this.windupT = d; this.windupD = d; }

  /**
   * @param {number} dt
   * @param {{speed:number, runBlend:number, grounded:boolean, vy:number, turnRate:number}} s
   */
  update(dt, s) {
    this.time += dt;
    const t = this.time;

    // Moved by an action: speed and turn from her root's motion since the
    // last frame (capped: a placement is not a sprint).
    const root = this.character.root, was = this._was;
    let speed = s.speed, turnRate = s.turnRate;
    if (this.act.step && dt > 0) {
      speed = Math.max(speed, Math.min(1.4, Math.hypot(root.position.x - was.x, root.position.z - was.z) / dt));
      turnRate ||= MathUtils.clamp(Math.atan2(Math.sin(root.rotation.y - was.yaw), Math.cos(root.rotation.y - was.yaw)) / dt, -6, 6);
    }
    was.x = root.position.x; was.z = root.position.z; was.yaw = root.rotation.y;

    // ---- Layer weights -------------------------------------------------
    const moving = smooth01(speed / 1.2);
    this.wLoco = damp(this.wLoco, s.grounded ? moving : 0, speed > 0.1 ? 10 : 7, dt);
    this.wRun = damp(this.wRun, s.runBlend, 6, dt);
    this.wAir = damp(this.wAir, s.grounded ? 0 : 1, s.grounded ? 16 : 12, dt);
    this.vyAir = damp(this.vyAir, s.vy, 10, dt);
    // Running jumps become a stretched leap; standing jumps tuck.
    this.leap = damp(this.leap || 0, smooth01(((s.airSpeed || 0) - 1.8) / 2.5) * 0.35, 8, dt);
    this.takeoffT = Math.max(0, (this.takeoffT || 0) - dt);

    // Stride length grows with speed: phase advances by distance, so the
    // feet plant instead of sliding.
    // Real cadence: ~1.9 steps/s walking, ~3 steps/s running.
    const cycleLen = MathUtils.lerp(1.7, 3.5, this.wRun);
    if (s.grounded) this.phase = (this.phase + (Math.max(speed, 0.6 * moving) * dt) / cycleLen) % 1;
    // In the air the stride keeps cycling (slower), so a moving jump keeps
    // its legs and arms going instead of freezing in one pose.
    else this.phase = (this.phase + ((s.airSpeed || 0) * 0.6 * dt) / cycleLen) % 1;
    if (this.debugPhase != null) this.phase = this.debugPhase; // dev/test hook

    // Landing spring (critically-ish damped).
    const k = 120, c = 14;
    this.landVel += (-k * this.landImpact - c * this.landVel) * dt;
    this.landImpact += this.landVel * dt;

    // Lean into turns while moving.
    const leanTarget = MathUtils.clamp(-turnRate * speed * 0.035, -0.22, 0.22);
    this.lean = damp(this.lean, leanTarget, 6, dt);

    // Turning on the spot: shuffle feet.
    const turnInPlace = Math.abs(turnRate) > 1.2 && speed < 0.6 && s.grounded ? 1 : 0;
    this.turnShuffle = damp(this.turnShuffle, turnInPlace, 10, dt);
    this.turnPhase += Math.abs(turnRate) * dt * 0.9;

    this._buildIdle(t);
    this._buildLoco(this.phase);
    this._buildAir(this.vyAir);

    // ---- Blend ----------------------------------------------------------
    const out = this.out.clear();
    const wAir = this.wAir;
    const wLoco = this.wLoco * (1 - wAir);
    const wIdle = Math.max(0, 1 - wLoco - wAir);
    out.accumulate(this.idle, wIdle);
    out.accumulate(this.loco, wLoco);
    // Moving jumps: blend the (still cycling) run/walk stride into the air
    // pose, with knees lifted — the body keeps moving through the air.
    const mAir = smooth01(((s.airSpeed || 0) - 1.0) / 2.5) * 0.6;
    out.accumulate(this.air, wAir * (1 - mAir));
    out.accumulate(this.loco, wAir * mAir);
    if (mAir > 0.01) {
      const k = wAir * mAir;
      out.add('leftUpperLeg', -0.3 * k, 0, 0); out.add('rightUpperLeg', -0.3 * k, 0, 0);
      out.add('leftLowerLeg', 0.4 * k, 0, 0); out.add('rightLowerLeg', 0.4 * k, 0, 0);
      out.hip[1] -= this.loco.hip[1] * k; // no stride bob while airborne
    }

    // Climb overrides everything else; fades quickly in and out.
    const climbing = s.climb != null;
    if (climbing) this.climbU = s.climb;
    this.wClimb = damp(this.wClimb, climbing ? 1 : 0, climbing ? 30 : 12, dt);
    if (this.wClimb > 0.001) {
      this._buildClimb(this.climbU);
      const w = this.wClimb, a = out.r, b = this.climbPose.r;
      for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * w;
      for (let i = 0; i < 3; i++) out.hip[i] += (this.climbPose.hip[i] - out.hip[i]) * w;
    }

    // Riding / sitting in a vehicle: the ride system drives the blend weight
    // (sit) along its own enter / exit curves, so no extra smoothing here.
    const ride = s.ride;
    if (ride) this.lastRide = ride;
    this.wRide = ride ? ride.sit : damp(this.wRide, 0, 14, dt);
    if (this.wRide > 0.001 && this.lastRide) {
      this._buildRide(this.lastRide);
      const w = this.wRide, a = out.r, b = this.ridePose.r;
      for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * w;
      for (let i = 0; i < 3; i++) out.hip[i] += (this.ridePose.hip[i] - out.hip[i]) * w;
    }

    // Sitting on a chair (shops): the seated pose, blended like riding.
    const act = this.act;
    if (act.sit > 0.001) {
      this._buildRide({ style: 'chair', handsUp: 1 });
      const w = act.sit, a = out.r, b = this.ridePose.r;
      for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * w;
      for (let i = 0; i < 3; i++) out.hip[i] += (this.ridePose.hip[i] - out.hip[i]) * w;
    }

    // Shops: crouching to a low shelf (hips drop, knees bend, back leans in).
    if (act.crouch > 0.001) {
      // Legs and hips blend to an exact squat (not added to the idle's weight
      // shift, which left one foot floating): thigh / shin angles match the
      // hip drop for ~0.4 m bones, so both feet stay flat on the floor; the
      // back leans in over the shelf.
      const c = Math.min(1, act.crouch), over = Math.max(0, act.crouch - 1);
      const toward = (bone, x, y, z) => {
        const i = IDX[bone] * 3, r = out.r;
        r[i] += (x - r[i]) * c; r[i + 1] += (y - r[i + 1]) * c; r[i + 2] += (z - r[i + 2]) * c;
      };
      toward('hips', 0, 0, 0);
      toward('leftUpperLeg', -1.25, 0.04, 0.08); toward('rightUpperLeg', -1.25, -0.04, -0.08);
      toward('leftLowerLeg', 2.0, 0, 0); toward('rightLowerLeg', 2.0, 0, 0);
      toward('leftFoot', -0.75, 0, 0); toward('rightFoot', -0.75, 0, 0);
      out.hip[1] += (-0.37 - out.hip[1]) * c;
      out.add('spine', 0.55 * c + 0.9 * over, 0, 0); out.add('chest', 0.25 * c + 0.6 * over, 0, 0); out.add('head', -0.35 * c - 0.4 * over, 0, 0);
    }

    // Additive: anticipation crouch (knees bend, hips drop, arms swing back).
    if (this.windupT > 0) {
      this.windupT = Math.max(0, this.windupT - dt);
      const k = smooth01(1 - this.windupT / (this.windupD || 0.08));
      out.hip[1] -= k * 0.1;
      out.add('leftUpperLeg', -k * 0.4, 0, 0); out.add('rightUpperLeg', -k * 0.4, 0, 0);
      out.add('leftLowerLeg', k * 0.8, 0, 0); out.add('rightLowerLeg', k * 0.8, 0, 0);
      out.add('leftFoot', -k * 0.4, 0, 0); out.add('rightFoot', -k * 0.4, 0, 0);
      out.add('spine', k * 0.25, 0, 0);
      out.add('leftUpperArm', k * 0.5, 0, 0); out.add('rightUpperArm', k * 0.5, 0, 0);
    }

    // Additive: takeoff push (legs straighten, toes point, arms swing up).
    if (this.takeoffT > 0) {
      const k = Math.sin((this.takeoffT / 0.16) * Math.PI) * 0.9;
      out.add('leftLowerLeg', -k * 0.4, 0, 0); out.add('rightLowerLeg', -k * 0.4, 0, 0);
      out.add('leftFoot', k * 0.5, 0, 0); out.add('rightFoot', k * 0.5, 0, 0);
      out.add('leftUpperArm', -k * 0.5, 0, k * 0.25); out.add('rightUpperArm', -k * 0.5, 0, -k * 0.25);
      out.add('spine', -k * 0.12, 0, 0);
      out.hip[1] += k * 0.03;
    }

    // Additive: landing crouch.
    const li = Math.max(0, this.landImpact);
    if (li > 0.001) {
      out.hip[1] -= li * 0.22;
      out.add('leftUpperLeg', -li * 0.9, 0, 0); out.add('rightUpperLeg', -li * 0.9, 0, 0);
      out.add('leftLowerLeg', li * 1.7, 0, 0); out.add('rightLowerLeg', li * 1.7, 0, 0);
      out.add('leftFoot', -li * 0.8, 0, 0); out.add('rightFoot', -li * 0.8, 0, 0);
      out.add('spine', li * 0.35, 0, 0); out.add('head', -li * 0.25, 0, 0);
      out.add('leftUpperArm', 0, 0, li * 0.4); out.add('rightUpperArm', 0, 0, -li * 0.4);
    }

    // Additive: turn shuffle (small alternating steps).
    if (this.turnShuffle > 0.01) {
      const a = Math.sin(this.turnPhase * TAU) * this.turnShuffle;
      const lift = (v) => Math.max(0, v);
      out.add('leftUpperLeg', -lift(a) * 0.35, 0, 0); out.add('leftLowerLeg', lift(a) * 0.7, 0, 0);
      out.add('rightUpperLeg', -lift(-a) * 0.35, 0, 0); out.add('rightLowerLeg', lift(-a) * 0.7, 0, 0);
      out.hip[1] -= 0.015 * this.turnShuffle;
    }

    // Additive: banking lean, applied through the hips so the whole body tilts.
    out.add('hips', 0, 0, this.lean);
    out.add('head', 0, 0, -this.lean * 0.6);

    this._headLook(dt, out, wIdle);
    this._apply(out);
    // Ground foot IK: only while standing / walking on the ground.
    const footIK = s.footGround && s.grounded && !climbing && !ride && this.wClimb < 0.01 && this.wRide < 0.01 && act.sit < 0.01;
    this.wFootIK = damp(this.wFootIK || 0, footIK ? 1 : 0, footIK ? 8 : 20, dt);
    if (this.wFootIK > 0.001 && s.footGround) this._footIK(dt, s);
    if (climbing && s.climbIK && s.climbIK.w > 0.001) this._limbIK('Arm', s.climbIK);
    if (ride?.hands && (ride.hands.wl > 0.001 || ride.hands.wr > 0.001)) this._limbIK('Arm', ride.hands);
    if (ride?.feet && (ride.feet.wl > 0.001 || ride.feet.wr > 0.001)) this._limbIK('Leg', ride.feet);
    this._actIK();
    // Hands on the bars / wheel close around them as the hand IK takes hold.
    const grip = ride?.hands;
    const held = act.hands;
    this._fingers(wLoco * this.wRun + wAir * 0.5, Math.max(grip ? grip.wl : 0, act.carry, held ? held.wl : 0), Math.max(grip ? grip.wr : 0, act.holdR, held ? held.wr : 0));
    this._face(dt);
  }

  /** Shop hands: basket on the left arm, right hand reaching or eating. */
  _actIK() {
    const act = this.act;
    const wr = Math.max(act.reach?.w || 0, act.eat, act.bag);
    const held = act.hands;
    if (act.carry < 0.001 && wr < 0.001 && !(held && (held.wl > 0.001 || held.wr > 0.001))) return;
    this._refresh();
    const m = this.character.root.getWorldMatrix();
    if (held) {
      // Both hands to given points; elbows down and back, each to its side.
      const t = this._holdT || (this._holdT = [0, 0, 0, 0, 0, 0]);
      t[0] = held.l[0]; t[1] = held.l[1]; t[2] = held.l[2]; t[3] = held.r[0]; t[4] = held.r[1]; t[5] = held.r[2];
      const side = Vector3.TransformNormalFromFloatsToRef(1, 0, 0, m, _v4).normalize();
      const back = Vector3.TransformNormalFromFloatsToRef(0, 0, -1, m, _v5).normalize();
      this._limbIK('Arm', { wl: held.wl, wr: held.wr, hands: t, pole: [back.x * 0.35, -1, back.z * 0.35], side: [side.x, side.y, side.z], spread: 0.6, palm: false });
      return;
    }
    const t = this._actT || (this._actT = [0, 0, 0, 0, 0, 0]);
    // Basket: hand out from her left hip (clear of the leg), elbow bent.
    const l = Vector3.TransformCoordinatesFromFloatsToRef(BASKET_HAND[0], BASKET_HAND[1], BASKET_HAND[2], m, _v1);
    t[0] = l.x; t[1] = l.y; t[2] = l.z;
    if (act.eat > 0.001 && !(act.reach?.w > act.eat)) {
      // Food to the mouth: just in front of the chin.
      const head = worldPos(this.nodes[IDX.head], _v2);
      const fwd = Vector3.TransformNormalFromFloatsToRef(0, 0, 1, m, _v3).normalize();
      t[3] = head.x + fwd.x * 0.14; t[4] = head.y - 0.07; t[5] = head.z + fwd.z * 0.14;
    } else if (act.reach && act.reach.w >= act.bag) {
      t[3] = act.reach.x; t[4] = act.reach.y; t[5] = act.reach.z;
    } else {
      // Shopping bag held out at her right side.
      const r = Vector3.TransformCoordinatesFromFloatsToRef(BAG_HAND[0], BAG_HAND[1], BAG_HAND[2], m, _v2);
      t[3] = r.x; t[4] = r.y; t[5] = r.z;
    }
    const side = Vector3.TransformNormalFromFloatsToRef(1, 0, 0, m, _v4).normalize();
    const back = Vector3.TransformNormalFromFloatsToRef(0, 0, -1, m, _v5).normalize();
    // Elbows down and a little back, each toward its own side.
    this._limbIK('Arm', {
      wl: act.carry, wr: wr, hands: t, pole: [back.x * 0.35, -1, back.z * 0.35], side: [side.x, side.y, side.z], spread: 0.6, palm: false,
    });
  }

  // ---------------------------------------------------------------------
  _buildIdle(t) {
    const p = this.idle.clear();
    const br = Math.sin(t * 1.9);           // breathing
    const sway = Math.sin(t * 0.55);        // slow weight shift
    // Relaxed contrapposto: weight on the right leg, left knee soft.
    p.hip[0] = -0.018 + sway * 0.01;
    p.hip[1] = -0.012 + br * 0.003;
    p.set('hips', 0, 0.06 + sway * 0.02, -0.035);
    p.set('spine', 0.02 + br * 0.008, -0.03, 0.035);
    p.set('chest', 0.01 + br * 0.012, -0.02, 0.01);
    p.set('upperChest', br * 0.01, 0, 0);
    p.set('neck', 0.04, 0.02, 0.01);
    p.set('head', 0.06, 0.05, 0.05 + sway * 0.015);
    p.set('leftShoulder', 0, 0, -0.04 - br * 0.01);
    p.set('rightShoulder', 0, 0, 0.04 + br * 0.01);
    // Arms hang naturally slightly away from the body, elbows soft.
    p.set('leftUpperArm', 0.05, 0.12, -1.2 + br * 0.015);
    p.set('rightUpperArm', 0.0, -0.18, 1.17 - br * 0.015);
    p.set('leftLowerArm', 0, -0.32, 0);
    p.set('rightLowerArm', 0, 0.42, 0);
    p.set('leftHand', 0.0, 0.1, -0.12);
    p.set('rightHand', 0.0, -0.18, 0.18);
    p.set('leftUpperLeg', -0.1, 0.12, 0.06);
    p.set('rightUpperLeg', 0.02, -0.04, -0.035);
    p.set('leftLowerLeg', 0.2, 0, 0);
    p.set('rightLowerLeg', 0.02, 0, 0);
    p.set('leftFoot', -0.08, 0.15, -0.06);
    p.set('rightFoot', -0.02, -0.06, 0.035);
  }

  _buildLoco(phase) {
    // Walk and run are separate, purpose-built cycles blended by wRun. Both
    // share one phase so feet stay in sync during the transition.
    this._buildWalk(this.loco, phase);
    if (this.wRun > 0.001) {
      this._buildRun(this.runPose, phase);
      const r = this.wRun, a = this.loco.r, b = this.runPose.r;
      for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * r;
      for (let i = 0; i < 3; i++) this.loco.hip[i] += (this.runPose.hip[i] - this.loco.hip[i]) * r;
    }
  }

  /** Relaxed walk: left foot contacts at phase 0.25, right at 0.75. */
  _buildWalk(p, phase) {
    p.clear();
    const a = phase * TAU;
    const s = Math.sin(a), c = Math.cos(a);
    p.set('leftUpperLeg', -0.42 * s - 0.08 * Math.max(0, c), 0, 0.03);
    p.set('rightUpperLeg', 0.42 * s - 0.08 * Math.max(0, -c), 0, -0.03);
    p.set('leftLowerLeg', 0.75 * Math.pow(Math.max(0, c), 1.3) + 0.12, 0, 0);
    p.set('rightLowerLeg', 0.75 * Math.pow(Math.max(0, -c), 1.3) + 0.12, 0, 0);
    p.set('leftFoot', -0.25 * s, 0, 0);
    p.set('rightFoot', 0.25 * s, 0, 0);
    p.set('leftUpperArm', 0.32 * s, 0.05, -1.22);
    p.set('rightUpperArm', -0.32 * s, -0.05, 1.22);
    p.set('leftLowerArm', 0, -0.35 - 0.15 * Math.max(0, -s), 0);
    p.set('rightLowerArm', 0, 0.35 + 0.15 * Math.max(0, s), 0);
    p.set('leftHand', 0, 0, -0.15);
    p.set('rightHand', 0, 0, 0.15);
    p.set('hips', 0, 0.12 * s, 0.03 * s);
    p.set('spine', 0.06, -0.07 * s, 0);
    p.set('chest', 0.02, -0.06 * s, 0);
    p.set('neck', -0.03, 0, 0);
    p.set('head', -0.02, 0.036 * s, 0);
    p.set('leftShoulder', 0, 0, -0.03); p.set('rightShoulder', 0, 0, 0.03);
    p.hip[1] = 0.022 * (c * c - 0.5) * 2 - 0.015;
    p.hip[0] = 0.012 * s;
  }

  /**
   * Keyframed run (one leg's curve, the other leg offset half a cycle).
   * Contact with a bent knee under the body → push-off → heel folds up high →
   * knee drives forward → leg extends to land. Arms pump at ~90° with fists,
   * torso leans forward, body peaks during the flight phase.
   */
  _buildRun(p, phase) {
    p.clear();
    // Align with the walk: left contact at phase 0.25.
    const t = (phase - 0.25 + 1) % 1;
    const tR = (t + 0.5) % 1;
    for (const [side, u, sg] of [['left', t, 1], ['right', tR, -1]]) {
      p.set(`${side}UpperLeg`, RUN.thigh(u), 0, 0.04 * sg);
      p.set(`${side}LowerLeg`, RUN.knee(u), 0, 0);
      p.set(`${side}Foot`, RUN.foot(u), 0, 0);
    }
    // Arms: left arm forward when the right knee drives (opposite leg).
    const armL = RUN.arm(tR), armR = RUN.arm(t);
    p.set('leftUpperArm', armL + 0.12, -0.18, -1.33);
    p.set('rightUpperArm', armR + 0.12, 0.18, 1.33);
    // Elbows ~75°; a bit more bend on the forward swing, opened behind.
    p.set('leftLowerArm', 0, -(1.3 - armL * 0.4), 0);
    p.set('rightLowerArm', 0, 1.3 - armR * 0.4, 0);
    p.set('leftHand', -0.15, 0.2, -0.1);
    p.set('rightHand', -0.15, -0.2, 0.1);

    // Torso: lean, counter-rotation of shoulders against hips.
    const twist = Math.sin((t - 0.6) * TAU);
    p.set('hips', 0.05, 0.07 * twist, 0.015 * twist);
    // Keep knees tracking straight ahead despite the hip twist (seen from behind).
    p.add('leftUpperLeg', 0, -0.07 * twist, 0);
    p.add('rightUpperLeg', 0, -0.07 * twist, 0);
    p.set('spine', 0.2, -0.1 * twist, 0);
    p.set('chest', 0.06, -0.1 * twist, 0);
    p.set('upperChest', 0, -0.04 * twist, 0);
    p.set('neck', -0.08, 0.04 * twist, 0);
    p.set('head', -0.14, 0.06 * twist, 0);
    p.set('leftShoulder', 0, 0.05, -0.02); p.set('rightShoulder', 0, -0.05, 0.02);
    // Lowest at mid-stance (t≈0.12 / 0.62), highest in flight (t≈0.4 / 0.9).
    p.hip[1] = -0.075 + 0.04 * Math.cos((t - 0.4) * 2 * TAU);
  }

  _buildAir(vy) {
    const p = this.air.clear();
    const L = MathUtils.lerp;
    // Three phases blended by vertical speed, like a real vertical jump:
    //  rise  – pushed off: legs long, toes pointed, arms swung up/forward
    //  apex  – knees gently tucked, arms opening for balance
    //  fall  – legs extend down to meet the ground, arms out a little
    const rise = smooth01((vy - 1) / 5);
    const fall = smooth01((-vy - 1) / 6);
    const apex = Math.max(0, 1 - rise - fall);
    const W = (r, a, f) => r * rise + a * apex + f * fall;
    // Keep the "up" weight for the running-leap blend below.
    const up = smooth01((vy + 1) / 6);
    p.set('hips', W(-0.02, -0.06, 0.02), 0, 0);
    p.set('spine', W(-0.04, 0.1, 0.08), 0, 0);
    p.set('chest', W(-0.04, 0.02, 0.02), 0, 0);
    p.set('neck', -0.03, 0, 0);
    p.set('head', W(-0.06, -0.06, 0.02), 0, 0);
    p.set('leftUpperLeg', W(-0.12, -0.5, -0.28), 0, 0.06);
    p.set('rightUpperLeg', W(-0.04, -0.4, -0.2), 0, -0.06);
    p.set('leftLowerLeg', W(0.2, 0.75, 0.32), 0, 0);
    p.set('rightLowerLeg', W(0.14, 0.65, 0.28), 0, 0);
    p.set('leftFoot', W(0.5, 0.3, 0.05), 0, 0);
    p.set('rightFoot', W(0.55, 0.35, 0.1), 0, 0);
    p.set('leftUpperArm', W(-0.95, -0.4, -0.15), 0.1, W(-0.95, -0.85, -0.75));
    p.set('rightUpperArm', W(-0.9, -0.35, -0.1), -0.1, W(0.95, 0.85, 0.75));
    p.set('leftLowerArm', 0, W(-0.5, -0.45, -0.3), 0);
    p.set('rightLowerArm', 0, W(0.5, 0.45, 0.3), 0);
    p.set('leftHand', 0, 0, -0.15);
    p.set('rightHand', 0, 0, 0.15);
    // Gentle secondary motion so the pose never looks frozen.
    const t = this.time;
    const sw = Math.sin(t * 6.5), sw2 = Math.sin(t * 4.1 + 1.3);
    p.add('leftUpperLeg', sw * 0.09, 0, 0); p.add('rightUpperLeg', -sw * 0.09, 0, 0);
    p.add('leftLowerLeg', Math.max(0, sw) * 0.12, 0, 0); p.add('rightLowerLeg', Math.max(0, -sw) * 0.12, 0, 0);
    p.add('leftUpperArm', sw2 * 0.12, 0, sw2 * 0.08); p.add('rightUpperArm', -sw2 * 0.12, 0, sw2 * 0.08);
    p.add('spine', sw2 * 0.03, 0, 0);
    p.hip[1] = 0;
    void L;

    // Running leap: split stride, opposite arm forward, torso forward.
    // Legs draw back together as she comes down to land.
    const k = (this.leap || 0) * (0.55 + 0.45 * up);
    if (k > 0.001) {
      const sd = this.leapSide || 1;           // which leg leads
      const lead = sd > 0 ? 'left' : 'right', trail = sd > 0 ? 'right' : 'left';
      const leadArm = sd > 0 ? 'right' : 'left', trailArm = sd > 0 ? 'left' : 'right';
      const reach = L(0.5, 0.75, up);          // lead knee extends toward landing as she falls
      const mix = (bone, x, y, z) => {
        const i = BONES.indexOf(bone) * 3;
        p.r[i] += (x - p.r[i]) * k; p.r[i + 1] += (y - p.r[i + 1]) * k; p.r[i + 2] += (z - p.r[i + 2]) * k;
      };
      mix(`${lead}UpperLeg`, -0.75, 0, 0.04 * sd);
      mix(`${lead}LowerLeg`, reach, 0, 0);
      mix(`${lead}Foot`, -0.05, 0, 0);
      mix(`${trail}UpperLeg`, 0.35, 0, -0.04 * sd);
      mix(`${trail}LowerLeg`, 1.1, 0, 0);
      mix(`${trail}Foot`, 0.45, 0, 0);
      // Left-arm z/y rotations are mirrored relative to the right arm.
      const m = (arm) => (arm === 'left' ? -1 : 1);
      mix(`${leadArm}UpperArm`, -0.6, -0.15 * m(leadArm), 1.15 * m(leadArm));
      mix(`${leadArm}LowerArm`, 0, 1.2 * m(leadArm), 0);
      mix(`${trailArm}UpperArm`, 0.4, 0, 1.1 * m(trailArm));
      mix(`${trailArm}LowerArm`, 0, 0.9 * m(trailArm), 0);
      mix('spine', 0.18, 0, 0);
      mix('chest', 0.06, 0, 0);
      mix('head', -0.12, 0, 0);
      mix('hips', 0.05, 0.12 * sd, 0);
    }
  }

  _buildClimb(u) {
    const p = this.climbPose.clear();
    const k = (name) => keyed(CLIMB[name], u);
    p.set('leftUpperArm', k('armX'), k('armY'), k('armZ'));
    p.set('rightUpperArm', k('armX'), -k('armY'), -k('armZ'));
    p.set('leftLowerArm', 0, k('elbow'), 0);
    p.set('rightLowerArm', 0, -k('elbow'), 0);
    p.set('leftUpperLeg', k('leadThigh'), 0.05, 0.08);
    p.set('leftLowerLeg', k('leadKnee'), 0, 0);
    p.set('rightUpperLeg', k('trailThigh'), -0.05, -0.08);
    p.set('rightLowerLeg', k('trailKnee'), 0, 0);
    p.set('leftFoot', k('leadFoot'), 0, 0);
    p.set('rightFoot', k('trailFoot'), 0, 0);
    p.set('spine', k('spine'), 0, 0);
    p.set('chest', k('spine') * 0.35, 0, 0);
    p.set('neck', k('head') * 0.3, 0, 0);
    p.set('head', k('head') * 0.7, 0, 0);
    p.hip[1] = k('hipY');
  }

  /**
   * Seated / riding pose (relative to the vehicle the root is attached to).
   * r.style: car | moto | scooter | bicycle. r.handsUp 0..1 lifts the arms
   * from her sides toward the wheel / bars (IK then pins the hands);
   * r.stepOver 0..1 swings the right leg over a bike seat.
   */
  _buildRide(r) {
    const p = this.ridePose.clear();
    const st = RIDE[r.style] || RIDE.car;
    const L = MathUtils.lerp;
    p.set('hips', st.hips, 0, 0);
    p.set('spine', st.spine + (r.lean || 0), 0, r.leanSide || 0);
    p.set('chest', st.chest, 0, 0);
    p.set('neck', st.neck, (r.look || 0) * 0.4, 0);
    p.set('head', st.head, (r.look || 0) * 0.6, 0);
    p.set('leftUpperLeg', st.thigh, 0.05, st.spread);
    p.set('rightUpperLeg', st.thigh, -0.05, -st.spread);
    p.set('leftLowerLeg', st.knee, 0, 0);
    p.set('rightLowerLeg', st.knee, 0, 0);
    p.set('leftFoot', st.foot, 0, 0);
    p.set('rightFoot', st.foot, 0, 0);
    // Arms: relaxed at her sides → reaching forward for the wheel / bars.
    const h = r.handsUp ?? 1;
    p.set('leftUpperArm', L(0.05, st.armX, h), L(0.12, -st.armY, h), L(-1.2, -st.armZ, h));
    p.set('rightUpperArm', L(0.0, st.armX, h), L(-0.18, st.armY, h), L(1.17, st.armZ, h));
    p.set('leftLowerArm', 0, L(-0.32, -0.5, h), 0);
    p.set('rightLowerArm', 0, L(0.42, 0.5, h), 0);
    p.set('leftShoulder', 0, 0, -0.04);
    p.set('rightShoulder', 0, 0, 0.04);
    // Mounting a bike: right leg swings up and back over the seat.
    const k = r.stepOver || 0;
    if (k > 0.001) {
      // Swinging leg goes up, out and back over the seat; the other bends a little.
      const [sw, st, m] = r.stepLeft ? ['left', 'right', -1] : ['right', 'left', 1];
      p.add(sw + 'UpperLeg', 0.55 * k, 0, -1.15 * k * m);
      p.add(sw + 'LowerLeg', 0.9 * k, 0, 0);
      p.add(sw + 'Foot', 0.4 * k, 0, 0);
      p.add(st + 'UpperLeg', 0.15 * k, 0, 0);
      p.add('spine', 0.25 * k, 0, 0.08 * k * m);
    }
    // Getting into a car: lift one knee, then the other, over the sill.
    for (const [side, w] of [['right', r.legR || 0], ['left', r.legL || 0]]) {
      if (w < 0.001) continue;
      p.add(side + 'UpperLeg', -0.75 * w, 0, (side === 'left' ? 0.12 : -0.12) * w);
      p.add(side + 'LowerLeg', 0.55 * w, 0, 0);
      p.add(side + 'Foot', 0.3 * w, 0, 0);
    }
    // Body reacting to the car: lean out of corners, pitch with braking /
    // accelerating; the head counters a little and lags.
    if (r.swayX || r.swayZ) {
      p.add('spine', (r.swayZ || 0) * 0.8, 0, r.swayX || 0);
      p.add('chest', (r.swayZ || 0) * 0.4, 0, (r.swayX || 0) * 0.5);
      p.add('head', -(r.swayZ || 0) * 0.5, 0, -(r.swayX || 0) * 0.6);
    }
    p.hip[1] = st.hipY || 0;
  }

  /**
   * Two-bone IK pinning hands (kind 'Arm') or feet ('Leg') to world-space
   * targets, on the posed bones, blended per side.
   * @param {{w?:number, wl?:number, wr?:number, hands:number[], pole:number[], side:number[], spread?:number, palm?:boolean, reach?:number}} ik
   *   hands = [lx,ly,lz, rx,ry,rz]; pole = preferred elbow/knee direction;
   *   side = her left in world space (each limb's pole leans to its own side);
   *   reach = how far in front of the wrist the target sits (a bar held in the
   *   palm), so the wrist stops short of it instead of landing on it;
   *   handDir = [lx,ly,lz, rx,ry,rz] world direction for each hand's fingers
   *   (holding a bar: across it), instead of the default palms-down twist
   */
  _limbIK(kind, ik) {
    this._refresh();
    const names = kind === 'Arm' ? ['UpperArm', 'LowerArm', 'Hand'] : ['UpperLeg', 'LowerLeg', 'Foot'];
    const spread = ik.spread ?? 0.8;
    for (const [side, o, s] of [['left', 0, 1], ['right', 3, -1]]) {
      const w = (s > 0 ? ik.wl : ik.wr) ?? ik.w;
      if (!(w > 0.001)) continue;
      const up = this.nodes[IDX[side + names[0]]], lo = this.nodes[IDX[side + names[1]]], end = this.nodes[IDX[side + names[2]]];
      if (!up || !lo || !end) continue;
      const S = worldPos(up, _v1), E = worldPos(lo, _v2), Hd = worldPos(end, _v3);
      const a = Vector3.Distance(S, E), b = Vector3.Distance(E, Hd);
      const T = _v4.set(ik.hands[o], ik.hands[o + 1], ik.hands[o + 2]);
      const dir = T.subtractToRef(S, _v5);
      const d = MathUtils.clamp(dir.length() - (ik.reach || 0), Math.abs(a - b) + 1e-3, a + b - 1e-3);
      dir.normalize();
      const n = _v6.set(ik.pole[0] + ik.side[0] * s * spread, ik.pole[1] + ik.side[1] * s * spread, ik.pole[2] + ik.side[2] * s * spread);
      n.subtractInPlace(dir.scaleToRef(Vector3.Dot(n, dir), _v10)).normalize();
      const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const Ew = _v7.copyFrom(S).addInPlace(dir.scaleToRef(a * cosA, _v10)).addInPlace(n.scaleToRef(a * sinA, _v9));
      _rotateTowards(up, E.subtractToRef(S, _v8), Ew.subtractToRef(S, _v9), w);
      up.computeWorldMatrix(true); lo.computeWorldMatrix(true); end.computeWorldMatrix(true);
      const E2 = worldPos(lo, _v2), H2 = worldPos(end, _v3);
      const Tw = T.copyFrom(S).addInPlace(dir.scaleToRef(d, _v10));
      _rotateTowards(lo, H2.subtractToRef(E2, _v8), Tw.subtractToRef(E2, _v9), w);
      lo.computeWorldMatrix(true);
      if (kind === 'Arm' && ik.handDir) {
        // Fingers along the given direction (the middle finger's base marks it).
        this.rig.setEuler(side + 'Hand', 0, 0, 0);
        end.computeWorldMatrix(true);
        const tip = this.character.bone(side + 'MiddleProximal');
        if (tip) {
          tip.computeWorldMatrix(true);
          const from = worldPos(tip, _v9).subtractToRef(worldPos(end, _v10), _v8);
          _rotateTowards(end, from, _v9.set(ik.handDir[o], ik.handDir[o + 1], ik.handDir[o + 2]), w);
        }
      } else if (kind === 'Arm' && ik.palm !== false) {
        // Palms down on a roof edge / gripping a wheel.
        this.rig.setEuler(side + 'Hand', 0, 0, -0.45 * s * w);
      }
      end.computeWorldMatrix(true);
    }
  }

  /**
   * Foot IK: each foot is fitted to the floor under it.
   * The animation is authored for flat ground at the root height. Where the
   * floor under a foot differs (kerb edges, the sandpit frame, a car roof's
   * edge), that foot's ankle is moved by the difference, the pelvis drops
   * when a foot has to reach lower (no stretched legs), and the knee is
   * re-solved with two-bone IK bending forward. Offsets are clamped (no
   * extreme poses) and smoothed per foot (no snapping). On flat ground the
   * offsets are ~0 and the authored animation is untouched.
   */
  _footIK(dt, s) {
    const root = this.character.root;
    this._refresh();
    const rootY = s.rootY ?? root.position.y;
    const off = this._footOff || (this._footOff = [0, 0]);
    const targets = this._footT || (this._footT = new Float32Array(6));
    const feet = [this.nodes[IDX.leftFoot], this.nodes[IDX.rightFoot]];
    const pos = this._footPos || (this._footPos = [new Vector3(), new Vector3()]);
    for (let i = 0; i < 2; i++) {
      if (!feet[i]) return;
      worldPos(feet[i], pos[i]);
      // Probe a little ahead of the ankle (mid-foot) for the floor height.
      const fy = s.footGround(pos[i].x, pos[i].z);
      const want = MathUtils.clamp(fy - rootY, -0.22, 0.28);
      off[i] = damp(off[i], want, 18, dt);
    }
    const w = this.wFootIK;
    // Pelvis: drop by the lower foot's deficit so that leg can still reach.
    const drop = Math.min(0, off[0], off[1]) * w;
    if (drop < -0.002) {
      // Down, in the hips' parent frame.
      const hips = this.nodes[IDX.hips];
      hips.position.addInPlace(_v1.set(0, drop / (root.scaling.y || 1), 0).applyRotationQuaternionInPlace(this.rig.Pinv.hips));
      this._refresh();
      worldPos(feet[0], pos[0]); worldPos(feet[1], pos[1]);
    }
    const wl = w * smooth01(Math.abs(off[0] - drop) / 0.03), wr = w * smooth01(Math.abs(off[1] - drop) / 0.03);
    if (wl < 0.001 && wr < 0.001) return;
    targets[0] = pos[0].x; targets[1] = pos[0].y + off[0] - drop; targets[2] = pos[0].z;
    targets[3] = pos[1].x; targets[4] = pos[1].y + off[1] - drop; targets[5] = pos[1].z;
    const fx = Math.sin(root.rotation.y), fz = Math.cos(root.rotation.y);
    this._limbIK('Leg', {
      hands: targets, wl, wr,
      pole: [fx, 0, fz],                 // knees bend forward
      side: [fz, 0, -fx], spread: 0.08,  // and very slightly outward
    });
  }

  _headLook(dt, out, wIdle) {
    // Occasional glances around while idle — makes her feel alive.
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = 2.5 + Math.random() * 4;
      const glance = Math.random() < 0.6;
      this.lookTarget.yaw = glance ? (Math.random() - 0.5) * 1.1 : 0;
      this.lookTarget.pitch = glance ? (Math.random() - 0.6) * 0.25 : 0;
    }
    this.headYaw = damp(this.headYaw, this.lookTarget.yaw * wIdle, 3, dt);
    this.headPitch = damp(this.headPitch, this.lookTarget.pitch * wIdle, 3, dt);
    out.add('neck', this.headPitch * 0.4, this.headYaw * 0.4, 0);
    out.add('head', this.headPitch * 0.6, this.headYaw * 0.6, 0);
  }

  _apply(pose) {
    const r = pose.r;
    for (let i = 0; i < N; i++) this.rig.setEuler(BONES[i], r[i * 3], r[i * 3 + 1], r[i * 3 + 2]);
    this.rig.setHips(pose.hip[0], pose.hip[1], pose.hip[2]);
  }

  /**
   * Relaxed curl at rest, tighter loose fist when running/jumping, closed
   * around a grip (0..1 per hand) when holding handlebars or a wheel.
   */
  _fingers(tight, gripL = 0, gripR = 0) {
    const relaxed = 0.32 + tight * 0.55;
    for (const f of this.fingerNodes) {
      // Palm faces -Y in the rest pose: curl is -Z on the left, +Z on the right.
      const sgn = f.side === 'left' ? -1 : 1;
      const curl = MathUtils.lerp(relaxed, GRIP_CURL, f.side === 'left' ? gripL : gripR);
      if (f.seg.startsWith('Thumb')) {
        // Fold the thumb in across the curled fingers.
        const k = f.seg === 'ThumbMetacarpal' ? 0.6 : 0.5;
        this.rig.setEuler(f.name, 0, -sgn * k * curl, 0);
        continue;
      }
      const k = f.seg === 'Proximal' ? 0.8 : f.seg === 'Intermediate' ? 1.15 : 0.8;
      // Fingers extend along ±X; curling toward the palm is rotation about Z.
      this.rig.setEuler(f.name, 0, 0, sgn * curl * k);
    }
  }

  _face(dt) {
    const c = this.character;
    // Natural blinking with occasional double blinks.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkTimer = Math.random() < 0.2 ? 0.25 : 2 + Math.random() * 3.5;
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const d = 0.16;
      blink = this.blinkT < d / 2 ? this.blinkT / (d / 2) : 1 - (this.blinkT - d / 2) / (d / 2);
      if (this.blinkT >= d) { this.blinkT = -1; blink = 0; }
    }
    this.joy = Math.max(0, this.joy - dt);
    const happy = smooth01(this.joy);
    c.setExpression('blink', Math.max(0, Math.min(1, blink)) * (1 - happy));
    c.setExpression('happy', happy * 0.9);
    c.setExpression('relaxed', 0.25 * (1 - happy));
  }
}
