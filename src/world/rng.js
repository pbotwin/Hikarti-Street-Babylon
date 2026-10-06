/** Deterministic PRNG so the city looks the same every run. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.range = (lo, hi) => lo + rnd() * (hi - lo);
  rnd.int = (lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  return rnd;
}
