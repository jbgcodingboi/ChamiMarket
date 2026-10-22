/**
 * Chicken Cross sound design, built from the shared tone helper (which
 * honours the mute switch). Hops rise in pitch lane by lane to build tension.
 */
import { sounds, tone } from '../sound.js'

export const chickenSounds = {
  /** Round started: a little double cluck. */
  start: () => {
    tone(760, { dur: 0.05, type: 'square', slide: 520, gain: 0.03 })
    tone(820, { at: 0.08, dur: 0.06, type: 'square', slide: 560, gain: 0.03 })
  },
  /** Hop onto lane `lane`: a springy rise, higher the further it gets, and a soft landing. */
  hop: (lane = 1) => {
    const lift = Math.min(lane, 24) * 14
    tone(400 + lift, { dur: 0.13, type: 'triangle', slide: 780 + lift * 1.6, gain: 0.09 })
    tone(150, { at: 0.13, dur: 0.05, type: 'sine', gain: 0.08 })
  },
  /** A car brakes hard right next to the chicken. */
  nearMiss: () => {
    tone(1500, { dur: 0.2, type: 'sawtooth', slide: 1150, gain: 0.012 })
    tone(700, { at: 0.02, dur: 0.22, type: 'triangle', slide: 260, gain: 0.03 })
  },
  /** Horn, then the hit. */
  squash: () => {
    tone(392, { dur: 0.12, type: 'square', gain: 0.035 })
    tone(330, { at: 0.04, dur: 0.12, type: 'square', gain: 0.03 })
    setTimeout(() => {
      sounds.squash()
      tone(90, { dur: 0.35, type: 'sine', slide: 40, gain: 0.16 })
    }, 120)
  },
  /** Cash out: a bright arpeggio that grows with the multiplier. */
  cashout: (mult = 1) => {
    const notes = mult >= 10 ? [659, 784, 988, 1319, 1568] : mult >= 3 ? [659, 784, 988, 1319] : [659, 880, 1109]
    notes.forEach((f, i) => tone(f, { at: i * 0.065, dur: 0.2, type: 'triangle', gain: 0.075 }))
  },
}
