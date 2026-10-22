/**
 * Small hooks shared by Mines and Chicken Cross: a reduced-motion check, a
 * media query, an eased count-up for multipliers, and page hotkeys.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useGames } from '../../../store/gameStore.js'

/**
 * The last rounds of `game` from the round log, newest first, as
 * { id, win, mult }. `holdFrom` hides rounds newer than that entry id while
 * the screen is still animating them (null hides all, undefined hides none).
 */
export function useRecentRounds(game, holdFrom, limit = 16) {
  const history = useGames((g) => g.history)
  return useMemo(() => {
    let list = history.filter((h) => h.game === game)
    if (holdFrom !== undefined) {
      const at = holdFrom === null ? -1 : list.findIndex((h) => h.id === holdFrom)
      list = at < 0 ? [] : list.slice(at)
    }
    return list.slice(0, limit).map((h) => {
      const quoted = /\(([\d.,]+)×\)/.exec(h.detail ?? '')
      const ratio = h.staked > 0 ? Math.floor((h.returned / h.staked) * 100 + 1e-6) / 100 : 0
      return { id: h.id, win: h.returned > 0, mult: quoted ? Number(quoted[1].replace(/,/g, '')) : ratio }
    })
  }, [history, game, holdFrom, limit])
}

/** The id of the newest logged round of `game` right now (null if none), for holding back the next one. */
export const latestRoundId = (portfolio, game) => portfolio?.games?.history?.find((h) => h.game === game)?.id ?? null

const mql = (query) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null)

export function useMediaQuery(query) {
  return useSyncExternalStore(
    (cb) => {
      const m = mql(query)
      m?.addEventListener?.('change', cb)
      return () => m?.removeEventListener?.('change', cb)
    },
    () => mql(query)?.matches ?? false,
    () => false,
  )
}

export const prefersReducedMotion = () => mql('(prefers-reduced-motion: reduce)')?.matches ?? false

/** Eases the shown number towards `value` (cubic ease-out). Jumps straight there with reduced motion. */
export function useCountUp(value, ms = 420) {
  const [shown, setShown] = useState(value)
  const current = useRef(value)
  useEffect(() => {
    const from = current.current
    const t0 = performance.now()
    const instant = prefersReducedMotion() || from === value || !Number.isFinite(from)
    let raf = requestAnimationFrame(function tick(t) {
      const k = instant ? 1 : Math.min(1, (t - t0) / ms)
      const v = k >= 1 ? value : from + (value - from) * (1 - (1 - k) ** 3)
      current.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}

/** "1.47×", "1,250×" for big ones. */
export function formatMult(m) {
  const n = Number(m) || 0
  return `${n >= 1000 ? Math.floor(n).toLocaleString('en-US') : n.toFixed(2)}×`
}

const TYPING ='input, select, textarea, [contenteditable="true"]'
const CONTROL = 'button, a[href], summary, [role="radio"], [role="tab"], [role="slider"]'

/**
 * Page-level shortcuts, e.g. { ' ': bet, c: cashout }. Ignored while typing in
 * a field, for Space/Enter while an enabled control has focus (its own
 * activation wins), with modifier keys, key repeat, or while a dialog is open.
 */
export function useHotkeys(map, enabled = true) {
  const ref = useRef(map)
  useEffect(() => {
    ref.current = map
  })
  useEffect(() => {
    if (!enabled) return undefined
    const onKey = (e) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest(TYPING)) return
      const control = target?.closest(CONTROL)
      if ((e.key === ' ' || e.key === 'Enter') && control && !control.disabled) return
      if (document.querySelector('[aria-modal="true"]')) return
      const fn = ref.current[e.key.length === 1 ? e.key.toLowerCase() : e.key]
      if (!fn) return
      e.preventDefault()
      fn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
