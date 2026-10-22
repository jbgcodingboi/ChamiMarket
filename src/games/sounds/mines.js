/**
 * Mines sound design, built from the shared tone helper (which honours the
 * mute switch). Gems climb a pentatonic scale so a long streak sounds tense.
 */
import { sounds, tone } from '../sound.js'

const PENTATONIC = [0, 2, 4, 7, 9]
const semis = (n) => PENTATONIC[n % 5] + 12 * Math.floor(n / 5)

export const minesSounds = {
  /** Bet placed: a short two-blip "arm". */
  start: () => {
    tone(330, { dur: 0.05, type: 'square', gain: 0.03 })
    tone(495, { at: 0.05, dur: 0.07, type: 'square', gain: 0.03 })
  },
  /** The nth gem of the round (1-based): each one a step higher. */
  gem: (n) => {
    const f = 620 * 2 ** (Math.min(semis(Math.max(0, n - 1)), 26) / 12)
    tone(f, { dur: 0.08, type: 'triangle', gain: 0.08 })
    tone(f * 1.5, { at: 0.045, dur: 0.16, type: 'sine', gain: 0.055 })
    tone(f * 3, { at: 0.09, dur: 0.12, type: 'sine', gain: 0.018 })
  },
  /** A mine: the shared boom plus a deep sub drop and a crack on top. */
  boom: () => {
    sounds.boom()
    tone(1100, { dur: 0.06, type: 'square', slide: 180, gain: 0.035 })
    tone(85, { dur: 0.7, type: 'sine', slide: 28, gain: 0.2 })
  },
  /** Cash out: a coin chime that grows with the multiplier. */
  cashout: (mult = 1) => {
    const notes = mult >= 10 ? [784, 988, 1175, 1568, 1976] : mult >= 3 ? [784, 988, 1175, 1568] : [784, 1047, 1319]
    notes.forEach((f, i) => {
      tone(f, { at: i * 0.06, dur: 0.22, type: 'triangle', gain: 0.07 })
      tone(f * 2, { at: i * 0.06 + 0.02, dur: 0.12, type: 'sine', gain: 0.02 })
    })
  },
  /** Soft tick while the rest of the board turns over. */
  reveal: () => tone(1500, { dur: 0.025, type: 'square', gain: 0.012 }),
  /** A tile toggled in auto mode. */
  pick: (on) => tone(on ? 880 : 620, { dur: 0.04, type: 'triangle', gain: 0.045 }),
}
