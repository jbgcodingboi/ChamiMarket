import { useEffect, useRef } from 'react'

/**
 * Runs callback every intervalMs while the tab is visible. Polling stops
 * entirely when document.visibilityState is "hidden" and, on return, runs
 * immediately only if a full interval has passed.
 */
export function usePolling(callback, intervalMs, { enabled = true, immediate = false } = {}) {
  const saved = useRef(callback)
  useEffect(() => {
    saved.current = callback
  })

  useEffect(() => {
    if (!enabled) return undefined
    let timer = null
    let lastRun = 0
    const run = () => {
      lastRun = Date.now()
      saved.current()
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(tick, intervalMs)
    }
    function tick() {
      if (document.visibilityState !== 'visible') return
      run()
      schedule()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastRun >= intervalMs) run()
        schedule()
      } else {
        clearTimeout(timer)
      }
    }
    if (immediate && document.visibilityState === 'visible') run()
    else lastRun = Date.now()
    if (document.visibilityState === 'visible') schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, intervalMs, immediate])
}
