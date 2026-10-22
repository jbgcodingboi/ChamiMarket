/** Plinko sounds, built from the shared tone helper (which respects the mute switch). */
import { tone } from '../sound.js'

let lastPeg = 0

export const plinkoSounds = {
  /** A soft tick when a ball hits a pin; throttled so a 25-ball drop stays quiet. */
  peg(row = 0) {
    const now = performance.now()
    if (now - lastPeg < 45) return
    lastPeg = now
    tone(1500 + row * 35, { dur: 0.025, type: 'triangle', gain: 0.012 })
  },
  drop: () => tone(520, { dur: 0.08, type: 'triangle', slide: 300, gain: 0.04 }),
  /** Landing in a bucket: dull below 1×, a chime above, a short fanfare for the edges. */
  land(mult) {
    if (mult < 1) tone(180, { dur: 0.12, type: 'sine', slide: 140, gain: 0.05 })
    else if (mult < 2) tone(660, { dur: 0.1, type: 'triangle', gain: 0.05 })
    else if (mult < 10) {
      tone(784, { dur: 0.12, type: 'triangle', gain: 0.06 })
      tone(1175, { at: 0.06, dur: 0.16, type: 'triangle', gain: 0.05 })
    } else {
      const notes = [523, 659, 784, 1047, 1319]
      notes.forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.22, type: 'triangle', gain: 0.07 }))
    }
  },
}
