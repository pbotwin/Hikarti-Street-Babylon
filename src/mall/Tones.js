/**
 * Little synthesized sounds for the mall (till beeps, the door alarm, a
 * hanger's click), on the game's audio graph: a few oscillator notes, made
 * when played and stopped right after (Web Audio frees them).
 */
export function tone(audio, freqs, { dur = 0.12, type = 'sine', gain = 0.12, gap = 0 } = {}) {
  const ctx = audio?.ctx;
  if (!ctx || audio.muted) return;
  let t = ctx.currentTime;
  for (const f of freqs) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audio.sfx || audio.master || ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
    t += dur + gap;
  }
}

/** The security gate's soft alarm: unpaid goods at a shop's way out. */
export function alarm(audio) {
  tone(audio, [988, 784, 988, 784], { dur: 0.16, type: 'triangle', gain: 0.07, gap: 0.04 });
}
