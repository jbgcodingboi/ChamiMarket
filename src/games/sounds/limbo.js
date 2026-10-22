/** Limbo and Crash sounds, built from the shared tone helper (which respects the mute switch). */
import { sounds, tone } from '../sound.js'

let lastTick = 0

export const limboSounds = {
  /** A rising tick while the Limbo number counts up (progress 0 to 1). */
  tick(progress) {
    const now = performance.now()
    if (now - lastTick < 55) return
    lastTick = now
    tone(500 + progress * 900, { dur: 0.03, type: 'square', gain: 0.015 })
  },
  win(mult) {
    const big = mult >= 10
    const notes = big ? [523, 659, 784, 1047, 1319] : [659, 988, 1319]
    notes.forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.18, type: 'triangle', gain: big ? 0.07 : 0.06 }))
  },
  lose: () => tone(300, { dur: 0.18, type: 'sine', slide: 150, gain: 0.05 }),

  // Crash ------------------------------------------------------------------
  launch() {
    tone(180, { dur: 0.35, type: 'sawtooth', slide: 520, gain: 0.04 })
    tone(360, { at: 0.05, dur: 0.3, type: 'triangle', slide: 900, gain: 0.03 })
  },
  /** A ping each time the climb passes a milestone (2×, 3×, 5×, 10×, …); higher milestones ring higher. */
  milestone(index) {
    const f = 660 * 2 ** (Math.min(index, 14) / 6)
    tone(f, { dur: 0.12, type: 'triangle', gain: 0.045 })
    tone(f * 1.5, { at: 0.05, dur: 0.12, type: 'triangle', gain: 0.03 })
  },
  crash: () => sounds.boom(),
  cashout(mult) {
    const notes = [784, 988, 1175, 1568]
    notes.forEach((f, i) => tone(f, { at: i * 0.055, dur: 0.2, type: 'triangle', gain: 0.07 }))
    if (mult >= 5) tone(2093, { at: 0.24, dur: 0.35, type: 'sine', gain: 0.05 })
  },
}
