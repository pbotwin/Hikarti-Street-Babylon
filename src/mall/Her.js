import { Vector3 } from '@babylonjs/core';
import { BAG_HAND } from '../player/CharacterAnimation.js';
import { Grip, worldPos } from './Grip.js';
import { ease, lerp, wrap } from './Timeline.js';

/**
 * The heroine as the mall's scripted moments use her: freezing her for an
 * animation (her legs still step and turn as she is moved: act.step),
 * moving her, her right hand reaching for a world point (CharacterAnimation's
 * act layer: reach, holdR, crouch, bag) and holding things (Grip: what she
 * handles moves only with her hand).
 */
const _a = new Vector3();
const _route = [];
// Her walking pace in scripted steps (m/s on average: ~1.85 at most, about
// her walk) and how fast she turns on the spot (~400°/s, a pivot on one
// foot). At 1.1 m/s, eased to 1.65 at most, and 200°/s a product taken into
// the cart took 6-9 s, a 3-item checkout 40 s.
const PACE = 1.4, TURN = 7;
// Her body's half width for the way being clear (a corner may brush her sleeve).
const BODY = 0.1;

export class Her extends Grip {
  constructor({ player, animation, character, world }) {
    super();
    Object.assign(this, { player, animation, character });
    // The mall's walk graph: her scripted walks go round shelves, not through them.
    this.nav = world?.nav || null;
    this.reach = { x: 0, y: 0, z: 0, w: 0 };      // reused act.reach
  }

  get act() { return this.animation.act; }
  get x() { return this.player.position.x; }
  get z() { return this.player.position.z; }
  get yaw() { return this.player.yaw; }

  /** An animation owns her (no stick, no physics; her feet step as she is moved) or lets her go. */
  freeze(on) {
    this.player.hold = on;
    this.player.velocity.set(0, 0, 0);
    this.act.step = on;
  }

  /** Stand her at (x, z) facing yaw (during a scripted moment). */
  place(x, z, yaw = this.player.yaw) {
    this.player.position.x = x;
    this.player.position.z = z;
    this.player.yaw = yaw;
    this.player._sync();
  }

  /**
   * A Timeline step walking her (her feet stepping: freeze) to the pose `to()`
   * gives when it starts ({ x, z, yaw, via? }: via, points to pass on the
   * way, round a cart); `each(m, dt)` runs every frame with how far along
   * she is (her hands while she goes). A leg of the way with a fixture in it
   * (a shelf between her and her cart, a table before a rack) follows the
   * walk graph round it instead.
   */
  goTo(to, each = null) {
    const path = [];
    let goal = null, yaw0 = 0, len = 0, t = 0, d = Infinity;
    return {
      until: () => t >= d,
      step: (k, dt, first) => {
        if (first) {
          goal = to();
          yaw0 = this.yaw;
          path.length = 0;
          path.push({ x: this.x, z: this.z, s: 0 });
          const add = (x, z) => {
            const q = path[path.length - 1];
            path.push({ x, z, s: q.s + Math.hypot(x - q.x, z - q.z) });
          };
          for (const p of [...(goal.via || []), goal]) {
            const q = path[path.length - 1];
            if (this.nav && !this.nav.clear(q.x, q.z, p.x, p.z, BODY)) {
              this.nav.path(q.x, q.z, p.x, p.z, _route);
              for (let i = 0; i < _route.count; i++) add(_route[i].x, _route[i].z);
            } else add(p.x, p.z);
          }
          len = path[path.length - 1].s;
          t = 0;
          d = Math.max(0.2, len / PACE + (path.length > 2 ? 0.1 : 0), Math.abs(wrap(goal.yaw - yaw0)) / TURN);
        }
        t += dt;
        const m = stride(t / d), at = m * len;
        let i = 1;
        while (i < path.length - 1 && path[i].s < at) i++;
        const a = path[i - 1], b = path[i], u = b.s > a.s ? (at - a.s) / (b.s - a.s) : 1;
        let yaw = lerpAngle(yaw0, goal.yaw, m);
        if (path.length > 2) {
          // Round corners she faces where she goes (turning smoothly), then to the goal's facing.
          const head = lerpAngle(Math.atan2(b.x - a.x, b.z - a.z), goal.yaw, ease((m - 0.7) / 0.3));
          yaw = m >= 1 ? goal.yaw : lerpAngle(this.yaw, head, 1 - Math.exp(-12 * dt));
        }
        this.place(lerp(a.x, b.x, u), lerp(a.z, b.z, u), yaw);
        each?.(m, dt);
      },
    };
  }

  /** Right wrist toward a world point with weight w (0 = at rest). */
  reachTo(x, y, z, w) {
    const r = this.reach;
    r.x = x; r.y = y; r.z = z; r.w = w;
    this.act.reach = w > 0.001 ? r : null;
  }

  aim(x, y, z, w) { this.reachTo(x, y, z, w); }

  /**
   * How much she crouches for her palm to reach (x, y, z) from where she
   * stands: low (crouchFor), or far: past ~0.4 m from her right shoulder
   * her back bends in (measured: 0.55 m out needs 0.6, 0.65 m all of it),
   * less for what is high (crouching lowers her shoulder: 1 m up takes all
   * of it, 1.4 m only half).
   */
  crouchTo(x, y, z) {
    const sx = this.x - Math.cos(this.yaw) * 0.14, sz = this.z + Math.sin(this.yaw) * 0.14;
    const lean = Math.min((Math.hypot(x - sx, z - sz) - 0.4) * 4, 2.2 - 1.2 * y, 1);
    return Math.max(Her.crouchFor(y), lean, 0);
  }

  /**
   * How much to crouch for her palm to reach height y (low shelves, the
   * bottom of the cart, the floor): a squat down to 0.55 m, then bending
   * over, down to ~0.12 m (measured, reaching 0.3-0.45 m in front of her).
   */
  static crouchFor(y) { return Math.min(1, Math.max(0, (0.95 - y) / 0.4)) + Math.min(1, Math.max(0, (0.55 - y) / 0.43)); }

  /** Where her right wrist is when she carries something at her side (act.bag), world. */
  side(out) {
    return Vector3.TransformCoordinatesFromFloatsToRef(BAG_HAND[0], BAG_HAND[1], BAG_HAND[2], this.character.root.getWorldMatrix(), out);
  }

  /**
   * The reach takes over from wherever her hand is now (at rest, or at her
   * side carrying): no jump when an action starts.
   */
  reachFromHand() {
    this._hand();
    const W = this._wrist;
    this.reachTo(W.x, W.y, W.z, 1);
    this.act.bag = 0;
  }

  /** Arms back to her own (nothing held, nothing reached for). */
  rest() {
    const act = this.act;
    act.reach = null; act.hands = null; act.holdR = 0; act.crouch = 0; act.bag = 0; act.step = false;
    this.held = null;
  }

  /** Her hand closes on a thing (Grip.hold), fingers curled round it. */
  hold(thing, x, y, z, yaw, rx = 0) {
    this.act.holdR = 1;
    return super.hold(thing, x, y, z, yaw, rx);
  }

  letGo() {
    this.act.holdR = 0;
    return super.letGo();
  }

  /** Her right wrist and palm as posed now (world). */
  _hand() {
    const hand = this.character.bone('rightHand'), mid = this.character.bone('rightMiddleProximal');
    if (!hand) { this._wrist.copyFrom(this.player.position); this._palm.copyFrom(this._wrist); return; }
    // One pass down the chain to the finger: the wrist above it is current after it.
    const M = mid ? worldPos(mid, _a) : worldPos(hand, _a), W = this._wrist.copyFrom(hand.getAbsolutePosition());
    Vector3.LerpToRef(W, M, 0.75, this._palm);
  }
}

/**
 * How far along a walk she is at time share u: speeding up over the first
 * quarter, an even pace, slowing over the last (her top speed only a third
 * above the average; a smoothstep's is half above, so more foot slide).
 */
function stride(u) {
  const a = 0.25, k = 1 / (2 * a * (1 - a));
  u = Math.min(1, Math.max(0, u));
  if (u < a) return u * u * k;
  if (u > 1 - a) return 1 - (1 - u) * (1 - u) * k;
  return (u - a / 2) / (1 - a);
}

/** Angle from a to b by t, the short way round (her turns). */
export function lerpAngle(a, b, t) {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}
