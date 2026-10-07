/**
 * Scripted animation steps for the mall's actions (taking a garment, a
 * fitting room, a checkout): each step runs `step(k, dt, first)` with k going
 * 0 → 1 over `d` seconds (or, with `until`, waits until that returns true:
 * a walk, the mirror's mist), then `done()`, then the next step. Steps are plain
 * objects made when an action starts; nothing is allocated per frame.
 */
export class Timeline {
  constructor() { this.queue = []; this.t = 0; }

  get running() { return this.queue.length > 0; }

  /** Queue steps after whatever is running; `then` runs after the last one. */
  play(steps, then = null) {
    for (const s of steps) { s.first = true; this.queue.push(s); }
    if (then) this.queue.push({ d: 0, done: then, first: true });
  }

  update(dt) {
    while (this.queue.length) {
      const s = this.queue[0];
      this.t += dt;
      const k = s.until ? (s.until() ? 1 : 0) : s.d > 0 ? Math.min(1, this.t / s.d) : 1;
      s.step?.(k, dt, s.first);
      s.first = false;
      if (k < 1) return;
      this.queue.shift();
      this.t = 0;
      dt = 0;
      s.done?.();
    }
  }

  clear() { this.queue.length = 0; this.t = 0; }
}

export const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** An angle brought into −π…π (shortest turn). */
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
