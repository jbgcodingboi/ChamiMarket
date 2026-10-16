/**
 * Small synthesized game sounds (Web Audio, no files). Muted state is a
 * per-browser preference. Browsers only allow audio after a tap or click,
 * which every sound here follows.
 */
import { create } from 'zustand'

const KEY = 'chami:sound'
const readMuted = () => {
  try {
    return localStorage.getItem(KEY) === 'off'
  } catch {
    return false
  }
}

export const useSoundStore = create((set) => ({
  muted: readMuted(),
  toggle: () =>
    set((s) => {
      try {
        localStorage.setItem(KEY, s.muted ? 'on' : 'off')
      } catch {
        // Preference just won't persist.
      }
      return { muted: !s.muted }
    }),
}))

let ctx = null
function audio() {
  if (useSoundStore.getState().muted || typeof window === 'undefined') return null
  const Ctx = window.AudioContext ?? window.webkitAudioContext
  if (!Ctx) return null
  ctx ??= new Ctx()
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.12, slide = null } = {}) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + at
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise(dur = 0.25, gain = 0.2) {
  const a = audio()
  if (!a) return
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2
  const src = a.createBufferSource()
  const g = a.createGain()
  g.gain.value = gain
  src.buffer = buf
  src.connect(g).connect(a.destination)
  src.start()
}

export const sounds = {
  click: () => tone(660, { dur: 0.05, type: 'square', gain: 0.04 }),
  hop: () => tone(420, { dur: 0.14, type: 'triangle', slide: 820, gain: 0.1 }),
  gem: () => {
    tone(880, { dur: 0.1, type: 'triangle', gain: 0.08 })
    tone(1320, { at: 0.07, dur: 0.14, type: 'triangle', gain: 0.07 })
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.18, type: 'triangle', gain: 0.08 })),
  lose: () => tone(240, { dur: 0.3, type: 'sawtooth', slide: 90, gain: 0.06 }),
  boom: () => {
    noise(0.45, 0.25)
    tone(120, { dur: 0.4, type: 'sawtooth', slide: 40, gain: 0.1 })
  },
  squash: () => {
    noise(0.2, 0.18)
    tone(300, { dur: 0.25, type: 'square', slide: 70, gain: 0.07 })
  },
}
