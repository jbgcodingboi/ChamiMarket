/**
 * Roulette sound effects, built from the shared synth note (which already
 * respects the mute switch). Everything is short and quiet on purpose.
 */
import { tone } from '../sound.js'

export const rouletteSounds = {
  /** A chip set down on the felt. */
  chip: () => {
    tone(2300, { dur: 0.025, type: 'square', gain: 0.025 })
    tone(3400, { at: 0.012, dur: 0.03, type: 'triangle', gain: 0.03 })
  },
  /** Chips swept off the table. */
  sweep: () => {
    tone(1400, { dur: 0.12, type: 'triangle', slide: 500, gain: 0.03 })
  },
  /** The croupier launches the ball. */
  launch: () => {
    tone(160, { dur: 0.6, type: 'triangle', slide: 420, gain: 0.05 })
    tone(1900, { at: 0.04, dur: 0.05, type: 'square', gain: 0.02 })
  },
  /** The ball skipping over a pocket fret; `level` 0-1 fades it as the ball slows. */
  tick: (level = 1) => {
    tone(2600 + Math.random() * 500, { dur: 0.016, type: 'square', gain: 0.012 + 0.018 * level })
  },
  /** The ball hitting a fret or deflector hard. */
  clack: () => {
    tone(1100, { dur: 0.035, type: 'triangle', gain: 0.06 })
    tone(260, { dur: 0.06, type: 'sine', gain: 0.05 })
  },
  /** The ball comes to rest in its pocket. */
  settle: () => {
    tone(880, { dur: 0.05, type: 'triangle', gain: 0.05 })
    tone(660, { at: 0.06, dur: 0.08, type: 'triangle', gain: 0.04 })
  },
  win: (big = false) => {
    const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [587, 740, 880, 1175]
    notes.forEach((f, i) => tone(f, { at: 0.05 + i * 0.075, dur: 0.22, type: 'triangle', gain: 0.07 }))
    if (big) [1047, 1319, 1568].forEach((f) => tone(f, { at: 0.55, dur: 0.6, type: 'sine', gain: 0.045 }))
  },
  /** Some money back, but less than was staked. */
  partial: () => {
    tone(660, { at: 0.05, dur: 0.14, type: 'triangle', gain: 0.05 })
    tone(587, { at: 0.17, dur: 0.18, type: 'triangle', gain: 0.04 })
  },
  lose: () => {
    tone(220, { at: 0.05, dur: 0.32, type: 'sine', slide: 130, gain: 0.07 })
  },
}
