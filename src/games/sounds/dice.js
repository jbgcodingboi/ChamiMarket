/** Dice sounds, built from the shared tone helper (which respects the mute switch). */
import { tone } from '../sound.js'

export const diceSounds = {
  /** A quick rattle while the roll slides along the track. */
  roll(quick) {
    const n = quick ? 2 : 5
    for (let i = 0; i < n; i++) tone(900 + Math.random() * 500, { at: i * 0.055, dur: 0.03, type: 'square', gain: 0.018 })
  },
  win(mult) {
    tone(880, { dur: 0.1, type: 'triangle', gain: 0.07 })
    tone(mult >= 5 ? 1568 : 1320, { at: 0.07, dur: 0.16, type: 'triangle', gain: 0.06 })
    if (mult >= 5) tone(2093, { at: 0.15, dur: 0.22, type: 'triangle', gain: 0.05 })
  },
  lose: () => tone(260, { dur: 0.14, type: 'sine', slide: 170, gain: 0.05 }),
}
