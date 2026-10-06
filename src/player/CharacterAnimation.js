import { MathUtils } from './math.js';

/**
 * Procedural animation for the heroine, ported from the original game's
 * CharacterAnimation: idle, walk, run, jump, fall, landing, turning — each
 * synthesised per frame on the normalized humanoid (HumanoidRig) and layered
 * by smoothly blended weights. The cycle advances by distance travelled, so
 * feet don't skate.
 *
 * Normalized rig conventions (she faces +Z, her left is +X):
 *   upperLeg.x  < 0  swings leg forward      lowerLeg.x > 0  bends knee
 *   upperArm.z       lowers arm (left -, right +); upperArm.x < 0 swings forward
 *   lowerArm.y       bends elbow (left -, right +)
 *   spine.x     > 0  leans forward           foot.x > 0      points toe down
 */
const THREE = { MathUtils };
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
  arm: loopCurve([[0, 0.05], [0.25, 0.55], [0.5, 0.05], [0.75, -0.75]]),
};
const damp = (a, b, lambda, dt) => MathUtils.lerp(a, b, 1 - Math.exp(-lambda * dt));
const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

class Pose {
  constructor() { this.r = new Float32Array(N * 3); this.hip = new Float32Array(3); }
  clear() { this.r.fill(0); this.hip.fill(0); return this; }
  set(bone, x = 0, y = 0, z = 0) { const i = IDX[bone] * 3; this.r[i] = x; this.r[i + 1] = y; this.r[i + 2] = z; }
  add(bone, x = 0, y = 0, z = 0) { const i = IDX[bone] * 3; this.r[i] += x; this.r[i + 1] += y; this.r[i + 2] += z; }
  accumulate(other, w) {
    if (w <= 0) return;
    for (let i = 0; i < this.r.length; i++) this.r[i] += other.r[i] * w;
    for (let i = 0; i < 3; i++) this.hip[i] += other.hip[i] * w;
  }
}

export class CharacterAnimation {
  constructor(character) {
    this.character = character;
    const vrm = character.vrm;
    this.vrm = vrm;
    this.rig = vrm.rig;
    this.idle = new Pose(); this.loco = new Pose(); this.runPose = new Pose(); this.air = new Pose(); this.out = new Pose();
    this.wLoco = 0; this.wRun = 0; this.wAir = 0;
    this.phase = 0; this.time = 0;
    this.landImpact = 0; this.landVel = 0; this.lean = 0;
    this.turnShuffle = 0; this.turnPhase = 0; this.vyAir = 0;
    this.headYaw = 0; this.headPitch = 0; this.lookTimer = 2; this.lookTarget = { yaw: 0, pitch: 0 };
    this.blinkTimer = 2.5; this.blinkT = -1; this.joy = 0;
    this.fingerBones = [];
    for (const side of ['left', 'right']) {
      for (const f of FINGERS) for (const sg of SEGMENTS) if (this.rig.nodes[side + f + sg]) this.fingerBones.push({ name: side + f + sg, side, seg: sg });
      for (const sg of ['Metacarpal', 'Proximal', 'Distal']) if (this.rig.nodes[side + 'Thumb' + sg]) this.fingerBones.push({ name: side + 'Thumb' + sg, side, seg: 'Thumb' + sg });
    }
  }

  land(strength) { this.landVel -= 3.2 * (0.35 + strength); }
  celebrate() { this.joy = 1.6; }
  takeoff() { this.takeoffT = 0.16; this.windupT = 0; this.leapSide = this.phase < 0.5 ? 1 : -1; }
  windup(d) { this.windupT = d; this.windupD = d; }

  update(dt, s) {
    this.time += dt;
    const t = this.time;
    const moving = smooth01(s.speed / 1.2);
    this.wLoco = damp(this.wLoco, s.grounded ? moving : 0, s.speed > 0.1 ? 10 : 7, dt);
    this.wRun = damp(this.wRun, s.runBlend, 6, dt);
    this.wAir = damp(this.wAir, s.grounded ? 0 : 1, s.grounded ? 16 : 12, dt);
    this.vyAir = damp(this.vyAir, s.vy, 10, dt);
    this.leap = damp(this.leap || 0, smooth01(((s.airSpeed || 0) - 1.8) / 2.5) * 0.35, 8, dt);
    this.takeoffT = Math.max(0, (this.takeoffT || 0) - dt);
    const cycleLen = MathUtils.lerp(1.7, 3.5, this.wRun);
    if (s.grounded) this.phase = (this.phase + (Math.max(s.speed, 0.6 * moving) * dt) / cycleLen) % 1;
    else this.phase = (this.phase + ((s.airSpeed || 0) * 0.6 * dt) / cycleLen) % 1;
    const k = 120, c = 14;
    this.landVel += (-k * this.landImpact - c * this.landVel) * dt;
    this.landImpact += this.landVel * dt;
    const leanTarget = MathUtils.clamp(-s.turnRate * s.speed * 0.035, -0.22, 0.22);
    this.lean = damp(this.lean, leanTarget, 6, dt);
    const turnInPlace = Math.abs(s.turnRate) > 1.2 && s.speed < 0.6 && s.grounded ? 1 : 0;
    this.turnShuffle = damp(this.turnShuffle, turnInPlace, 10, dt);
    this.turnPhase += Math.abs(s.turnRate) * dt * 0.9;

    this._buildIdle(t);
    this._buildLoco(this.phase);
    this._buildAir(this.vyAir);

    const out = this.out.clear();
    const wAir = this.wAir;
    const wLoco = this.wLoco * (1 - wAir);
    const wIdle = Math.max(0, 1 - wLoco - wAir);
    out.accumulate(this.idle, wIdle);
    out.accumulate(this.loco, wLoco);
    const mAir = smooth01(((s.airSpeed || 0) - 1.0) / 2.5) * 0.6;
    out.accumulate(this.air, wAir * (1 - mAir));
    out.accumulate(this.loco, wAir * mAir);
    if (mAir > 0.01) {
      const kk = wAir * mAir;
      out.add('leftUpperLeg', -0.3 * kk, 0, 0); out.add('rightUpperLeg', -0.3 * kk, 0, 0);
      out.add('leftLowerLeg', 0.4 * kk, 0, 0); out.add('rightLowerLeg', 0.4 * kk, 0, 0);
      out.hip[1] -= this.loco.hip[1] * kk;
    }
    if (this.windupT > 0) {
      this.windupT = Math.max(0, this.windupT - dt);
      const w = smooth01(1 - this.windupT / (this.windupD || 0.08));
      out.hip[1] -= w * 0.1;
      out.add('leftUpperLeg', -w * 0.4, 0, 0); out.add('rightUpperLeg', -w * 0.4, 0, 0);
      out.add('leftLowerLeg', w * 0.8, 0, 0); out.add('rightLowerLeg', w * 0.8, 0, 0);
      out.add('leftFoot', -w * 0.4, 0, 0); out.add('rightFoot', -w * 0.4, 0, 0);
      out.add('spine', w * 0.25, 0, 0);
      out.add('leftUpperArm', w * 0.5, 0, 0); out.add('rightUpperArm', w * 0.5, 0, 0);
    }
    if (this.takeoffT > 0) {
      const w = Math.sin((this.takeoffT / 0.16) * Math.PI) * 0.9;
      out.add('leftLowerLeg', -w * 0.4, 0, 0); out.add('rightLowerLeg', -w * 0.4, 0, 0);
      out.add('leftFoot', w * 0.5, 0, 0); out.add('rightFoot', w * 0.5, 0, 0);
      out.add('leftUpperArm', -w * 0.5, 0, w * 0.25); out.add('rightUpperArm', -w * 0.5, 0, -w * 0.25);
      out.add('spine', -w * 0.12, 0, 0);
      out.hip[1] += w * 0.03;
    }
    const li = Math.max(0, this.landImpact);
    if (li > 0.001) {
      out.hip[1] -= li * 0.22;
      out.add('leftUpperLeg', -li * 0.9, 0, 0); out.add('rightUpperLeg', -li * 0.9, 0, 0);
      out.add('leftLowerLeg', li * 1.7, 0, 0); out.add('rightLowerLeg', li * 1.7, 0, 0);
      out.add('leftFoot', -li * 0.8, 0, 0); out.add('rightFoot', -li * 0.8, 0, 0);
      out.add('spine', li * 0.35, 0, 0); out.add('head', -li * 0.25, 0, 0);
      out.add('leftUpperArm', 0, 0, li * 0.4); out.add('rightUpperArm', 0, 0, -li * 0.4);
    }
    if (this.turnShuffle > 0.01) {
      const a = Math.sin(this.turnPhase * TAU) * this.turnShuffle;
      const lift = (v) => Math.max(0, v);
      out.add('leftUpperLeg', -lift(a) * 0.35, 0, 0); out.add('leftLowerLeg', lift(a) * 0.7, 0, 0);
      out.add('rightUpperLeg', -lift(-a) * 0.35, 0, 0); out.add('rightLowerLeg', lift(-a) * 0.7, 0, 0);
      out.hip[1] -= 0.015 * this.turnShuffle;
    }
    out.add('hips', 0, 0, this.lean);
    out.add('head', 0, 0, -this.lean * 0.6);
    this._headLook(dt, out, wIdle);
    this._apply(out);
    this._fingers(wLoco * this.wRun + wAir * 0.5);
    this._face(dt);
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
    const L = THREE.MathUtils.lerp;
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

  /** Relaxed curl at rest, a loose fist when running / jumping. */
  _fingers(tight) {
    const curl = 0.32 + tight * 0.55;
    for (const f of this.fingerBones) {
      const sgn = f.side === 'left' ? -1 : 1;
      if (f.seg.startsWith('Thumb')) { this.rig.setEuler(f.name, 0, -sgn * (f.seg === 'ThumbMetacarpal' ? 0.6 : 0.5) * curl, 0); continue; }
      const kk = f.seg === 'Proximal' ? 0.8 : f.seg === 'Intermediate' ? 1.15 : 0.8;
      this.rig.setEuler(f.name, 0, 0, sgn * curl * kk);
    }
  }

  /** Natural blinking with occasional double blinks; happy face after a find. */
  _face(dt) {
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
    this.vrm.setExpression('blink', Math.max(0, Math.min(1, blink)) * (1 - happy));
    this.vrm.setExpression('happy', happy * 0.9);
    this.vrm.setExpression('relaxed', 0.25 * (1 - happy));
  }
}
