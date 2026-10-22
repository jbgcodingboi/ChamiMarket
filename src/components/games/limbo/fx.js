/**
 * Small presentation helpers shared by the Limbo, Crash, Dice and Plinko
 * pages: a reduced-motion check, a frame tween and the Space-to-play key.
 */
import { useEffect, useRef } from 'react'

export const reducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/**
 * Calls `onFrame(progress)` every frame for `ms` milliseconds and resolves at
 * the end. It skips straight to the end with reduced motion or in a hidden tab
 * (where frames pause), and a timer makes sure it always finishes, so an
 * autobet never stalls on an animation.
 */
export function tween(ms, onFrame) {
  return new Promise((resolve) => {
    let done = false
    const end = () => {
      if (done) return
      done = true
      onFrame(1)
      resolve()
    }
    if (!(ms > 0) || reducedMotion() || document.hidden) return end()
    const t0 = performance.now()
    const step = (now) => {
      if (done) return
      const p = Math.min(1, (now - t0) / ms)
      if (p >= 1) return end()
      onFrame(p)
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
    setTimeout(end, ms + 150)
    return undefined
  })
}

export const easeOutCubic = (p) => 1 - (1 - p) ** 3

const INTERACTIVE = 'input, textarea, select, button, a[href], summary, [contenteditable="true"], [role="slider"], [role="radio"], [role="tab"], [role="menuitem"]'

/**
 * Space runs the game's main action (bet, drop, cash out) unless the player
 * is typing, a control has focus (Space already presses it) or a dialog is open.
 */
export function useSpaceToPlay(action, enabled = true) {
  const ref = useRef(action)
  useEffect(() => {
    ref.current = action
  })
  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      ref.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
