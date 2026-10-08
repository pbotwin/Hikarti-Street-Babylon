import { alarm, tone } from './Tones.js';

/**
 * The supermarket's little sounds (on the mall's tone helper): the scanner
 * beep, a product's soft click as she takes it, the drop into the cart, the
 * till, the card reader, a cart knocking into something, the boot lid,
 * the alarm at the way out.
 */
export function shopSounds(audio) {
  return {
    beep: () => tone(audio, [2093], { dur: 0.08, type: 'square', gain: 0.045 }),
    click: () => tone(audio, [520, 780], { dur: 0.05, type: 'triangle', gain: 0.05 }),
    drop: () => tone(audio, [180, 120], { dur: 0.06, type: 'triangle', gain: 0.07 }),
    till: () => tone(audio, [1318, 1568, 2093], { dur: 0.1, type: 'triangle', gain: 0.06 }),
    card: () => tone(audio, [1760, 1760], { dur: 0.07, gain: 0.05, gap: 0.05 }),
    rattle: (k = 1) => tone(audio, [95, 140, 110], { dur: 0.04, type: 'square', gain: 0.03 * k, gap: 0.01 }),
    lid: () => tone(audio, [70, 55], { dur: 0.12, gain: 0.2 }),
    alarm: () => alarm(audio),
  };
}
