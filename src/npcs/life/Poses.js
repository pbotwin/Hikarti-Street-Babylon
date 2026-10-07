import { Quaternion, Vector3 } from '@babylonjs/core';
import { eulerToRef } from '../NPCModels.js';

/**
 * Activity poses for residents (VRoid VRM bodies from NPCModels), layered
 * over the walk / idle base pose with a weight.
 *
 * The VRoid bases have different raw bone axes, so poses are written in the
 * character's own frame (x = her left, y = up, z = forward) and converted to
 * each bone at runtime:
 *   bend(bone, pitch, yaw, roll)  turn a bone about the body's axes
 *                                 (pitch + = lean / look forward-down,
 *                                  yaw + = turn to her left)
 *   arm(side, upper, fore)        point the upper arm and forearm along the
 *                                 given directions (written for the left
 *                                 arm, mirrored for the right)
 * Legs (sitting, crouching) use the leg Euler convention shared with
 * NPCModels.animateResident (thigh +X forward, shin −X bends the knee).
 *
 * Babylon computes world matrices on demand, so every world-space read first
 * brings the chain from the resident's root down to that bone up to date;
 * only the links that changed since (or under a changed parent) are redone.
 */

const _q = new Quaternion(), _pq = new Quaternion(), _cq = new Quaternion(), _dq = new Quaternion(), _aq = new Quaternion(), _iq = new Quaternion();
const _v = new Vector3(), _w = new Vector3(), _a = new Vector3(), _d = new Vector3();
const _rootQ = new Quaternion(), _rootInv = new Quaternion();
const AX = { pitch: new Vector3(1, 0, 0), yaw: new Vector3(0, 1, 0), roll: new Vector3(0, 0, 1) };

let R = null; // resident being posed
// Pose-pass clock: a node's world matrix is current while it was computed
// after its parent's and after its own last change (_poseT / _poseChanged).
// Recomputing the whole chain on every read was most of the residents' cost.
let clock = 0;

/** Bring `n`'s world matrix up to date (and its chain up to the resident root). */
function sync(n) {
  const parentT = n === R.root ? 0 : syncTime(n.parent);
  if (!(n._poseT > parentT && n._poseT > (n._poseChanged || 0))) {
    n.computeWorldMatrix(true);
    n._poseT = ++clock;
  }
  return n;
}

function syncTime(n) { return sync(n)._poseT; }

function begin(r) {
  R = r;
  // The resident's own parents moved this frame: bring them up to date too
  // (and so invalidate every bone computed in an earlier pass).
  const up = (n) => { if (n.parent) up(n.parent); n.computeWorldMatrix(true); };
  up(r.root);
  r.root._poseT = ++clock;
  _rootQ.copyFrom(r.root.absoluteRotationQuaternion);
  Quaternion.InverseToRef(_rootQ, _rootInv);
}

function blendTo(n, target, k) {
  if (k >= 1) n.rotationQuaternion.copyFrom(target);
  else Quaternion.SlerpToRef(n.rotationQuaternion, target, k, n.rotationQuaternion);
  n._poseChanged = ++clock;
}

/** Leg-style Euler on top of the rest pose. */
function setE(bone, x, y, z, k) {
  const n = R.bones[bone];
  if (!n || k <= 0) return;
  R.rest[bone].multiplyToRef(eulerToRef(x, y, z, 'XYZ', _q), _q);
  blendTo(n, _q, k);
}

/** World rotation of `n`'s parent (its chain synced first). */
function parentQ(n) {
  return _pq.copyFrom(sync(n.parent).absoluteRotationQuaternion);
}

/** Prepend a turn about a body axis to _q. */
function turn(axis, angle) {
  axis.applyRotationQuaternionToRef(_rootQ, _a);
  Quaternion.RotationAxisToRef(_a, angle, _aq);
  _aq.multiplyToRef(_q, _q);
}

/** Rotate a bone about the body's pitch / yaw / roll axes (radians), on top of its current pose. */
function bend(bone, pitch, yaw, roll, k) {
  const n = R.bones[bone];
  if (!n || k <= 0) return;
  parentQ(n).multiplyToRef(n.rotationQuaternion, _cq);   // current world rotation
  _q.copyFromFloats(0, 0, 0, 1);
  if (yaw) turn(AX.yaw, yaw);
  if (pitch) turn(AX.pitch, pitch);
  if (roll) turn(AX.roll, roll);
  _q.multiplyInPlace(_cq);
  Quaternion.InverseToRef(_pq, _iq).multiplyToRef(_q, _q);   // back to local
  blendTo(n, _q, k);
}

/** Point `bone` (towards `child`) along `dir` given in the character frame. */
function aim(bone, child, dir, k) {
  const n = R.bones[bone], c = R.bones[child];
  if (!n || !c || k <= 0) return;
  sync(n);
  sync(c).getAbsolutePosition().subtractToRef(n.getAbsolutePosition(), _v).normalize();
  dir.normalizeToRef(_d).applyRotationQuaternionToRef(_rootQ, _d);
  Quaternion.FromUnitVectorsToRef(_v, _d, _dq);
  parentQ(n).multiplyToRef(n.rotationQuaternion, _q);
  _dq.multiplyToRef(_q, _q);
  Quaternion.InverseToRef(_pq, _iq).multiplyToRef(_q, _q);
  blendTo(n, _q, k);
}

const _u = new Vector3(), _f = new Vector3();
function arm(side, upper, fore, k) {
  const m = side === 'left' ? 1 : -1;
  if (upper) aim(side + 'UpperArm', side + 'LowerArm', _u.set(upper[0] * m, upper[1], upper[2]), k);
  if (fore) aim(side + 'LowerArm', side + 'Hand', _f.set(fore[0] * m, fore[1], fore[2]), k);
}

/**
 * Two-bone arm IK: place the hand at world point `target`, elbow bending
 * down and out to the arm's side.
 */
const _s = new Vector3(), _el = new Vector3(), _ha = new Vector3(), _t = new Vector3(), _pole = new Vector3(), _ew = new Vector3(), _l = new Vector3();
function reach(side, target, k) {
  const up = R.bones[side + 'UpperArm'], lo = R.bones[side + 'LowerArm'], hand = R.bones[side + 'Hand'];
  if (!up || !lo || !hand || k <= 0) return;
  _s.copyFrom(sync(up).getAbsolutePosition());
  _el.copyFrom(sync(lo).getAbsolutePosition());
  _ha.copyFrom(sync(hand).getAbsolutePosition());
  const a = Vector3.Distance(_s, _el), b = Vector3.Distance(_el, _ha);
  target.subtractToRef(_s, _t);
  const d = Math.min(Math.max(_t.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3);
  _t.normalize();
  // Pole: down and out to this side (character frame), made perpendicular.
  _pole.set(side === 'left' ? 0.6 : -0.6, -1, -0.2).applyRotationQuaternionToRef(_rootQ, _pole);
  _t.scaleAndAddToRef(-Vector3.Dot(_pole, _t), _pole);
  _pole.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _ew.copyFrom(_s);
  _t.scaleAndAddToRef(a * cosA, _ew);
  _pole.scaleAndAddToRef(a * sinA, _ew);
  // Point the upper arm at the elbow, then the forearm at the target.
  _ew.subtractToRef(_s, _l).applyRotationQuaternionToRef(_rootInv, _l);
  aim(side + 'UpperArm', side + 'LowerArm', _l.normalize(), k);
  _el.copyFrom(sync(lo).getAbsolutePosition());
  target.subtractToRef(_el, _l).applyRotationQuaternionToRef(_rootInv, _l);
  aim(side + 'LowerArm', side + 'Hand', _l.normalize(), k);
}

const SIDES = ['left', 'right'], PEDALS = [['left', 0], ['right', Math.PI]];
const sit = (k) => {
  for (const s of SIDES) {
    setE(s + 'UpperLeg', 1.5, 0, 0, k);
    setE(s + 'LowerLeg', -1.45, 0, 0, k);
    setE(s + 'Foot', 0.05, 0, 0, k);
  }
};
// Hands resting on the thighs.
const restHand = (side, k) => arm(side, [0.25, -0.75, 0.6], [-0.1, -0.3, 1], k);
const restHands = (k) => { restHand('left', k); restHand('right', k); };
const look = (pitch, yaw, k) => { bend('neck', pitch * 0.4, yaw * 0.4, 0, k); bend('head', pitch * 0.6, yaw * 0.6, 0, k); };

export const POSES = {
  sit(t, k) { sit(k); restHands(k); look(0.05 + Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.23) * 0.4, k); },
  doze(t, k) { sit(k); restHands(k); bend('spine', 0.18, 0, 0, k); look(0.55, 0.1, k); },
  drink(t, k, seated) {
    if (seated) { sit(k); restHand('left', k); }
    // Sip every ~5 s: lift to the mouth, tip the head back, lower to the chest.
    const c = (t % 5) / 5, sip = c < 0.35 ? Math.sin(c / 0.35 * Math.PI) : 0;
    arm('right', [0.2, -0.9 + sip * 0.3, 0.3 + sip * 0.25], [-0.55, 0.55 + sip * 0.45, 0.6 - sip * 0.35], k);
    look(-0.05 - sip * 0.3, 0, k);
  },
  phone(t, k, seated) {
    if (seated) { sit(k); restHand('left', k); }
    arm('right', [0.15, -0.95, 0.25], [-0.45, 0.4, 0.8], k);
    look(0.45 + Math.sin(t * 3.1) * 0.02, -0.15, k);
  },
  read(t, k, seated) {
    if (seated) sit(k);
    const turn = (t % 12) > 11.3 ? Math.sin(((t % 12) - 11.3) / 0.7 * Math.PI) : 0;
    arm('left', [0.15, -0.95, 0.25], [-0.35, 0.3, 0.9], k);
    arm('right', [0.15, -0.95, 0.25 + turn * 0.2], [-0.35 - turn * 0.3, 0.3, 0.9], k);
    look(0.45, Math.sin(t * 0.8) * 0.06, k);
  },
  talk(t, k, seated) {
    if (seated) { sit(k); restHands(k); }
    const g = Math.max(0, Math.sin(t * 1.7));
    arm('right', [0.2, -0.9, 0.25 + g * 0.3], [-0.2 + g * 0.3, 0.1 + g * 0.5, 0.9], k);
    const laugh = Math.max(0, Math.sin(t * 0.35) - 0.85) * 4;
    look(Math.sin(t * 2.3) * 0.07 - laugh * 0.2, Math.sin(t * 0.5) * 0.12, k);
    bend('spine', -laugh * 0.08, 0, 0, k);
  },
  listen(t, k, seated) {
    if (seated) { sit(k); restHands(k); }
    look(Math.max(0, Math.sin(t * 1.3)) * 0.14, 0, k);
  },
  wave(t, k) {
    arm('right', [0.8, 0.5, 0.3], [0.15 + Math.sin(t * 9) * 0.35, 1, 0.15], k);
    look(-0.05, 0, k);
  },
  bow(t, k) {
    const b = Math.sin(Math.min(1, t / 2.2) * Math.PI);
    bend('spine', 0.55 * b, 0, 0, k); bend('chest', 0.15 * b, 0, 0, k); look(0.2 * b, 0, k);
  },
  pray(t, k) {
    // Two bows, two claps, hands together in prayer, one more bow.
    let bow = 0, clap = 0;
    if (t < 2.4) bow = Math.sin(t / 2.4 * Math.PI);
    else if (t < 3.6) clap = Math.abs(Math.sin((t - 2.4) / 0.6 * Math.PI));
    else if (t > 9) bow = Math.sin(Math.min(1, (t - 9) / 1.8) * Math.PI);
    const tog = t > 2.3 && t < 9.2 ? 1 : 0;
    bend('spine', 0.5 * bow + 0.06 * tog, 0, 0, k);
    look(0.15 * bow + 0.3 * tog, 0, k);
    if (tog) {
      const open = clap * 0.12;
      arm('left', [0.25, -0.75, 0.6], [-0.75 + open, 0.55, 0.4], k);
      arm('right', [0.25, -0.75, 0.6], [-0.75 + open, 0.55, 0.4], k);
    }
  },
  crouch(t, k) {
    for (const s of SIDES) {
      setE(s + 'UpperLeg', 1.9, 0, s === 'left' ? 0.25 : -0.25, k);
      setE(s + 'LowerLeg', -2.3, 0, 0, k);
      setE(s + 'Foot', 0.4, 0, 0, k);
    }
    bend('spine', 0.35, 0, 0, k);
    arm('right', [0.1, -0.55, 0.85], [0.05, -0.75 + Math.sin(t * 1.6) * 0.2, 0.65], k);
    arm('left', [0.35, -0.75, 0.55], [0, -0.6, 0.8], k);
    look(0.5, 0, k);
  },
  photo(t, k) {
    const check = (t % 6) > 4.5 ? 1 : 0;
    arm('left', [0.35, -0.55, 0.75], [-0.6, 0.65 - check * 0.6, 0.45], k);
    arm('right', [0.35, -0.55, 0.75], [-0.6, 0.65 - check * 0.6, 0.45], k);
    look(0.02 + check * 0.35, 0, k);
  },
  stretch(t, k) {
    const s = Math.sin(Math.min(1, t / 3) * Math.PI);
    arm('left', [0.25, 0.2 + s * 0.8, 0.05], [0.1, 1, 0], k * s);
    arm('right', [0.25, 0.2 + s * 0.8, 0.05], [0.1, 1, 0], k * s);
    bend('spine', -0.15 * s, 0, 0, k); look(-0.3 * s, 0, k);
  },
  watch(t, k, seated) {
    if (seated) { sit(k); restHands(k); }
    const w = (t % 8) < 2 ? 1 : 0;
    if (w) arm('left', [0.15, -0.9, 0.35], [-0.6, 0.35, 0.7], k);
    look(0.35 * w, w ? -0.25 : Math.sin(t * 0.3) * 0.7, k);
  },
  browse(t, k) {
    bend('spine', 0.25, 0, 0, k);
    look(0.4, Math.sin(t * 0.5) * 0.3, k);
    const reach = Math.max(0, Math.sin(t * 0.7));
    arm('right', [0.1, -0.85 + reach * 0.4, 0.35 + reach * 0.5], [0, -0.4, 1], k);
  },
  press(t, k) {
    const p = Math.sin(Math.min(1, t / 1.2) * Math.PI);
    arm('right', [0.1, -0.85 + p * 0.75, 0.3 + p * 0.65], [0.05, -0.1 + p * 0.2, 1], k);
    look(0.15, 0, k);
  },
  wipe(t, k) {
    bend('spine', 0.35, 0, 0, k);
    arm('right', [0.1 + Math.cos(t * 4) * 0.2, -0.6, 0.75], [Math.sin(t * 4) * 0.3, -0.7, 0.6], k);
    arm('left', [0.3, -0.7, 0.6], [0.1, -0.7, 0.7], k);
    look(0.4, 0, k);
  },
  look(t, k) { look(-0.12 + Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.35) * 0.6, k); },
  point(t, k) { arm('right', [0.35, 0.15, 0.95], [0.3, 0.15, 0.95], k); look(-0.1, 0.25, k); },
  carry(t, k) { arm('right', [0.22, -1, 0.05], [0.1, -1, 0.05], k); },
  // Riding: seated, hands forward on the bars; pedalling on a bicycle.
  ride(t, k, seated, opts) {
    const style = opts?.style;
    const pedal = style === 'bicycle' ? t * 5 : 0;
    for (const [s, ph] of PEDALS) {
      const c = Math.sin(pedal + ph);
      const thigh = style === 'bicycle' ? 1.05 + c * 0.3 : style === 'scooter' ? 1.35 : 1.45;
      const knee = style === 'bicycle' ? -1.0 - c * 0.45 : style === 'scooter' ? -1.25 : -1.9;
      setE(s + 'UpperLeg', thigh, 0, s === 'left' ? 0.12 : -0.12, k);
      setE(s + 'LowerLeg', knee, 0, 0, k);
    }
    bend('spine', style === 'moto' ? 0.3 : style === 'bicycle' ? 0.22 : 0.08, 0, 0, k);
    // Hands on the grips (world points from the bike's markers).
    if (opts?.gripL) { reach('left', opts.gripL, k); reach('right', opts.gripR, k); }
    else { arm('left', [0.25, -0.6, 0.75], [0.1, -0.35, 1], k); arm('right', [0.25, -0.6, 0.75], [0.1, -0.35, 1], k); }
    look(style === 'moto' ? -0.25 : -0.1, 0, k);
  },
};

/** Apply activity `act` at weight k (seated: legs folded on a seat). */
export function applyAct(r, act, t, k, seated, style) {
  const f = POSES[act];
  if (!f || k <= 0.001) return;
  begin(r);
  f(t, k, seated, style);
}
