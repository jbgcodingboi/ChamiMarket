import { create } from 'zustand'

/** One shared clock for countdowns, so cards don't each run their own timer. */
export const useClock = create(() => ({ now: Date.now() }))

let timer = null
export function startClock(intervalMs = 15000) {
  if (timer) return
  timer = setInterval(() => useClock.setState({ now: Date.now() }), intervalMs)
}
