import { Vector3 } from '@babylonjs/core';
import { keyed } from '../player/CharacterAnimation.js';
import { MathUtils } from '../player/math.js';
import { worldPosition, syncWorld } from './VehicleKit.js';

const clamp = MathUtils.clamp;
// Holding a bar: it sits under the palm, inside the curled fingers, this far
// along the hand from the wrist and this far below the wrist's axis.
const GRIP_ALONG = 0.06, GRIP_BELOW = 0.026;
// Fingers point forward and this much down across the bar.
const GRIP_PITCH = 25 * Math.PI / 180;
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

/**
 * Getting on / off a rigged two-wheeler (BikeModel markers):
 *
 *  on   stand on the left facing the bike → left hand on the left grip,
 *       right hand reaches across to the right grip → lift the bike off its
 *       stand (stand folds up) → swing the right leg over the seat while
 *       stepping in → sit → right foot to its peg / board / pedal; the left
 *       foot stays on the ground until she moves off.
 *  off  stop with the left foot down → stand up, right leg back over →
 *       step out to the left → put the bike back on its stand → let go.
 *
 * Riding: hands on the grips as the bars turn, feet on the pegs / board /
 * pedals (pedals turn with the crank), left foot down whenever stopped.
 */
export class BikeRide {
  constructor(sys) {
    this.sys = sys;
    this._v = new Vector3();
    // Pose output and keyframe lookup at the current time, reused every frame.
    this._out = { pos: this._v, yaw: 0 };
    this._t = 0;
    this._key = (keys) => keyed(keys, this._t);
    this._w = new Vector3();
    this._gl = new Vector3();
    this._gr = new Vector3();
    this._d = new Vector3();
    this._up = new Vector3();
    this._a = new Vector3();
    this._g = new Vector3();
  }

  plan(v, side, start, startYaw) {
    const mk = v.rig.markers, hipH = this.sys.hipH;
    this.v = v;
    // side +1: get on from the left (usual), -1: from the right (mirrored).
    const sd = side < 0 ? -1 : 1;
    this.side = sd;
    const st = mk.stand_L.position;
    const seat = mk.seat_D.position;
    const S0 = new Vector3(sd * st.x, 0, st.z);
    // Astride the bike but standing (before sitting): just left of the seat.
    const astride = new Vector3(0.0, 0.0, seat.z - 0.04);
    const seated = new Vector3(seat.x, seat.y - hipH, seat.z);
    const face = -sd * Math.PI / 2;             // facing the bike from that side
    const s0 = start || S0;
    let y0 = startYaw ?? face;
    y0 = face + wrap(y0 - face);
    const P = (t, p) => [t, p];
    const path = (pairs) => ({ x: pairs.map(([t, p]) => [t, p.x]), y: pairs.map(([t, p]) => [t, p.y]), z: pairs.map(([t, p]) => [t, p.z]) });
    const kick = v.cfg.style === 'bicycle' ? 0.55 : 0.75;
    this.enter = {
      dur: 2.15,
      pos: path([P(0, s0), P(0.3, S0), P(0.95, S0), P(1.45, astride), P(1.75, seated)]),
      yaw: [[0, y0], [0.3, face], [0.95, face], [1.45, 0]],
      sit: [[0, 0], [1.15, 0], [1.75, 1]],
      // Leg over: high knee swing while she steps across.
      stepOver: [[0.9, 0], [1.2, kick], [1.5, 0]],
      lean: [[0.3, 0], [0.55, 0.35], [0.95, 0.2], [1.4, 0.05], [1.8, 0]],
      // Near hand on its grip from beside the bike; the far grip is out of
      // reach until she is astride.
      handL: [[0.15, 0], [0.45, 1]],
      handR: [[1.25, 0], [1.55, 1]],
      // Bike: off its stand, lifted upright.
      parked: [[0, 1], [0.7, 1], [1.0, 0]],
      feetR: [[1.55, 0], [1.95, 1]],
      walk: [[0, 1], [0.28, 1], [0.32, 0]],
    };
    this.exit = {
      dur: 2.0,
      pos: path([P(0, seated), P(0.35, seated), P(0.75, astride), P(1.25, S0)]),
      yaw: [[0, 0], [0.75, 0], [1.25, face]],
      sit: [[0, 1], [0.7, 0]],
      stepOver: [[0.55, 0], [0.9, kick], [1.2, 0]],
      lean: [[0, 0], [0.4, 0.1], [0.9, 0.3], [1.3, 0.2], [1.8, 0]],
      handL: [[0, 1], [1.55, 1], [1.85, 0]],
      // Far hand lets go while she is still astride.
      handR: [[0, 1], [0.55, 1], [0.8, 0]],
      parked: [[0, 0], [1.3, 0], [1.6, 1]],
      feetR: [[0, 1], [0.3, 0]],
      walk: [[1.3, 0]],
      exitPos: S0, exitYaw: face,
    };
    this.sway = 0;
  }

  pose(tl, t, dt, r) {
    const v = this.v, mk = v.rig.markers, k = this._key, out = this._out;
    const seat = mk.seat_D.position;
    this._t = t;
    if (tl) { this._v.set(k(tl.pos.x), k(tl.pos.y), k(tl.pos.z)); out.yaw = k(tl.yaw); }
    else { this._v.set(seat.x, seat.y - this.sys.hipH, seat.z); out.yaw = 0; }
    r.style = v.cfg.style;
    r.sit = tl ? k(tl.sit) : 1;
    r.stepOver = tl ? k(tl.stepOver) : 0;
    // From the right it's the left leg that swings over.
    r.stepLeft = this.side < 0;
    r.legR = r.legL = 0;
    r.leanSide = 0;
    r.lean = (tl ? k(tl.lean) : 0) + (tl ? 0 : clamp(-v.ax * 0.012, -0.08, 0.08));
    r.handsUp = 1;
    // Lean the head into turns a little, look where she steers.
    r.look = tl ? 0 : clamp(v.steer * 1.2, -0.5, 0.5);
    this.sway = damp(this.sway, tl ? 0 : clamp(v.lean * 0.25, -0.2, 0.2), 6, dt);
    r.swayX = -this.sway;
    r.swayZ = 0;
    this.handL = tl ? k(tl.handL) : 1;
    this.handR = tl ? k(tl.handR) : 1;
    this.feetR = tl ? k(tl.feetR) : 1;
    v.parked = tl ? k(tl.parked) : 0;
    return out;
  }

  ik(r) {
    const v = this.v, mk = v.rig.markers;
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const fwd = [s, 0, c], left = [c, 0, -s];
    const H = (this._H ||= { wl: 0, wr: 0, hands: [0, 0, 0, 0, 0, 0], handDir: [0, 0, 0, 0, 0, 0], pole: [0, -1, 0], side: [0, 0, 0], spread: 1.0 });
    const F = (this._F ||= { wl: 0, wr: 0, hands: [0, 0, 0, 0, 0, 0], pole: [0, 0.3, 0], side: [0, 0, 0], spread: 0.35, palm: false });
    H.side[0] = left[0]; H.side[2] = left[2];
    F.side[0] = left[0]; F.side[2] = left[2];
    const p = this._w;
    // Hands around the grips: fingers across the bar (it turns with the
    // steering), wrists behind and above it so the bar lies in the fist.
    const gl = worldPosition(mk.grip_L, this._gl);
    const gr = worldPosition(mk.grip_R, this._gr);
    const bar = gl.subtractToRef(gr, p).normalize();
    const d = this._d.set(fwd[0] * Math.cos(GRIP_PITCH), -Math.sin(GRIP_PITCH), fwd[2] * Math.cos(GRIP_PITCH));
    const along = Vector3.Dot(d, bar);
    d.set(d.x - bar.x * along, d.y - bar.y * along, d.z - bar.z * along).normalize();
    const up = Vector3.CrossToRef(d, bar, this._up).normalize();
    if (up.y < 0) up.scaleInPlace(-1);
    inFist(gl, d, up); inFist(gr, d, up);
    H.hands[0] = gl.x; H.hands[1] = gl.y; H.hands[2] = gl.z;
    H.hands[3] = gr.x; H.hands[4] = gr.y; H.hands[5] = gr.z;
    for (let i = 0; i < 6; i += 3) { H.handDir[i] = d.x; H.handDir[i + 1] = d.y; H.handDir[i + 2] = d.z; }
    // The near hand grabs first.
    H.wl = this.side < 0 ? this.handR : this.handL; H.wr = this.side < 0 ? this.handL : this.handR;
    // Elbows bent down and out, a little back.
    H.pole[0] = -fwd[0] * 0.5; H.pole[1] = -0.8; H.pole[2] = -fwd[2] * 0.5;

    // Feet: pedals (turning with the crank) or pegs / board.
    const bicycle = !!mk.pedal_L;
    const fl = bicycle ? mk.pedal_L : mk.foot_L, fr = bicycle ? mk.pedal_R : mk.foot_R;
    worldPosition(fr, p); F.hands[3] = p.x; F.hands[4] = p.y + 0.03; F.hands[5] = p.z;
    // Left foot: on its rest while rolling, on the ground when stopped.
    const A = worldPosition(fl, this._a);
    A.y += 0.03;
    const G = Vector3.TransformCoordinatesToRef(mk.ground_L.position, syncWorld(v.root), this._g);
    G.y = v.y + 0.06;
    const fd = v.footDown;
    F.hands[0] = A.x + (G.x - A.x) * fd; F.hands[1] = A.y + (G.y - A.y) * fd; F.hands[2] = A.z + (G.z - A.z) * fd;
    F.pole[0] = fwd[0]; F.pole[1] = 0.35; F.pole[2] = fwd[2];
    // While standing beside / astride the bike the legs are free (walk cycle);
    // they lock on once she is seated.
    const sat = clamp(r.sit * 1.25, 0, 1);
    F.wl = sat;
    const free = 1 - clamp(r.stepOver * 2, 0, 1);
    F.wr = Math.min(sat, this.feetR) * (this.side < 0 ? 1 : free);
    if (this.side < 0) F.wl *= free;
    r.hands = H;
    r.feet = F;
  }

  controls(dt) {
    const v = this.v, rig = v.rig, inp = this.sys.input;
    if (rig.steer) rig.steer.rotation.y = v.steer;
    // Foot down whenever she isn't rolling forward / pulling away.
    const going = v.vF > 0.9 || (this.sys.phase === 'drive' && inp.move.y > 0.15);
    v.footDown = damp(v.footDown, this.sys.phase === 'drive' && going ? 0 : 1, 7, dt);
  }
}

/** Wrist position for a grip g: back along the fingers d, up off the bar. */
function inFist(g, d, up) {
  g.set(g.x - d.x * GRIP_ALONG + up.x * GRIP_BELOW, g.y - d.y * GRIP_ALONG + up.y * GRIP_BELOW, g.z - d.z * GRIP_ALONG + up.z * GRIP_BELOW);
}

function wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
