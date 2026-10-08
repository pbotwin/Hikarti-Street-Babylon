/**
 * The audio's generated sample data: white and brown noise, the reverb's
 * impulse response and one engine cycle. ~1.2 million samples in all, which
 * took 150 ms of one frame at CPU 4× when made on the main thread at the first
 * tap (more on phones); made by audioSamplesWorker.js instead, with this as
 * the main-thread fallback. Plain arrays, so they can be transferred.
 */
export const ENGINE_BASE = 32;      // firings per second in the engine loop at playback rate 1

export function makeAudioSamples(sr) {
  return {
    noise: noise(sr * 3),
    // Separate brown noises: one shared loop made the hum, traffic and train rumble move together.
    brown: [noise(sr * 4, true), noise(sr * 4, true), noise(sr * 4, true)],
    impulse: [impulse(sr * 2.8, 2.2), impulse(sr * 2.8, 2.2)],
    engine: engineCycle(sr),
  };
}

function noise(len, brown = false) {
  const d = new Float32Array(len);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return d;
}

function impulse(len, decay) {
  const d = new Float32Array(len);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  return d;
}

/**
 * One engine cycle as a loop: firing pulses at ENGINE_BASE Hz, each a short
 * combustion thump (two damped resonances + a little noise) with per-pulse
 * variation, so the loop sounds like an engine instead of a synth tone.
 */
function engineCycle(sr) {
  const pulses = 16;                    // 16 firings per loop, irregular
  const len = Math.round(sr * pulses / ENGINE_BASE);
  const d = new Float32Array(len);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < pulses; k++) {
    const t0 = Math.round((k + (rnd() - 0.5) * 0.08) * sr / ENGINE_BASE);
    const amp = 0.75 + rnd() * 0.35;
    const f1 = 95 + rnd() * 20, f2 = 210 + rnd() * 50, f3 = 520 + rnd() * 120;
    const dur = Math.round(sr * 0.055);
    for (let n = 0; n < dur; n++) {
      const i = (t0 + n + len) % len, t = n / sr;
      const env = Math.exp(-t * 55) * (1 - Math.exp(-t * 900));
      d[i] += amp * env * (Math.sin(2 * Math.PI * f1 * t) * 0.9 + Math.sin(2 * Math.PI * f2 * t) * 0.45
        + Math.sin(2 * Math.PI * f3 * t) * 0.12 + (rnd() - 0.5) * 0.35 * Math.exp(-t * 160));
    }
  }
  // Normalise.
  let m = 0;
  for (let i = 0; i < len; i++) m = Math.max(m, Math.abs(d[i]));
  for (let i = 0; i < len; i++) d[i] /= m || 1;
  return d;
}
