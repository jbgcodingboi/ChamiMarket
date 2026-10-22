/**
 * Blackjack sound effects, built from the shared synth note (which already
 * respects the mute switch).
 */
import { tone } from '../sound.js'

export const blackjackSounds = {
  /** A card sliding out of the shoe and landing; `at` delays it in seconds. */
  card: (at = 0) => {
    tone(2400, { at, dur: 0.07, type: 'sawtooth', slide: 600, gain: 0.012 })
    tone(170, { at: at + 0.05, dur: 0.06, type: 'sine', gain: 0.06 })
  },
  /** The dealer turning a card over. */
  flip: () => {
    tone(900, { dur: 0.06, type: 'triangle', slide: 1800, gain: 0.035 })
    tone(200, { at: 0.05, dur: 0.05, type: 'sine', gain: 0.05 })
  },
  chip: () => {
    tone(2300, { dur: 0.025, type: 'square', gain: 0.025 })
    tone(3400, { at: 0.012, dur: 0.03, type: 'triangle', gain: 0.03 })
  },
  win: () => [587, 740, 880, 1175].forEach((f, i) => tone(f, { at: i * 0.075, dur: 0.2, type: 'triangle', gain: 0.07 })),
  blackjack: () => {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.22, type: 'triangle', gain: 0.07 }))
    ;[784, 1047, 1319].forEach((f) => tone(f, { at: 0.42, dur: 0.7, type: 'sine', gain: 0.04 }))
  },
  push: () => {
    tone(660, { dur: 0.12, type: 'triangle', gain: 0.05 })
    tone(660, { at: 0.14, dur: 0.12, type: 'triangle', gain: 0.04 })
  },
  lose: () => tone(230, { dur: 0.34, type: 'sine', slide: 120, gain: 0.07 }),
  bust: () => {
    tone(320, { dur: 0.18, type: 'square', slide: 160, gain: 0.035 })
    tone(140, { at: 0.1, dur: 0.3, type: 'sine', slide: 80, gain: 0.06 })
  },
}
