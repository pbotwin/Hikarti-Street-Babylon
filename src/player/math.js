/** Small scalar helpers (the subset of three.js MathUtils the game logic uses). */
export const MathUtils = {
  lerp: (a, b, t) => a + (b - a) * t,
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  smoothstep: (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
};
