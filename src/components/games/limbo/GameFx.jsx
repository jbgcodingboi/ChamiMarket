/**
 * Shared win/loss effects for Limbo, Crash, Dice and Plinko: the result
 * history strip, a confetti burst for big wins and the floating win amount.
 * Styles live in pages/games/limbo.css.
 */
import { useMemo } from 'react'
import '../../../pages/games/limbo.css'
import { reducedMotion } from './fx.js'

/** One line of recent results, newest first; older ones fade out at the right edge instead of wrapping. */
export function HistoryStrip({ items, label = 'Recent results', empty = 'Results show up here.' }) {
  return (
    <ol className="fx-strip flex h-8 min-w-0 flex-1 items-center gap-1.5 overflow-hidden" aria-label={label}>
      {items.length ? (
        items.map((r, i) => (
          <li
            key={r.key}
            title={r.title}
            className={`shrink-0 rounded-md px-2 py-1 font-mono text-xs leading-4 font-bold tabular ${i === 0 ? 'fx-chip-in' : ''} ${r.className ?? ''}`}
            style={r.style}
          >
            {r.text}
          </li>
        ))
      ) : (
        <li className="text-xs text-subtle">{empty}</li>
      )}
    </ol>
  )
}

const COLORS = ['#f5b82e', '#2fbf71', '#f08a92', '#ededf0', '#5ad19a', '#ffd76a']

// A tiny seeded generator, so a burst renders the same pieces on every render.
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A burst of confetti over the nearest positioned parent. Pass a new `burst`
 * number to fire it; `x`/`y` place the origin (percent). Skipped with reduced motion.
 */
export function Confetti({ burst, x = 50, y = 45, count = 34 }) {
  const pieces = useMemo(() => {
    if (!burst) return []
    const rand = seeded(burst)
    return Array.from({ length: count }, (_, i) => {
      const angle = rand() * Math.PI - Math.PI
      const speed = 90 + rand() * 170
      return {
        i,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed * 0.9,
        fall: 110 + rand() * 120,
        r: (rand() - 0.5) * 900,
        w: 5 + rand() * 5,
        d: rand() * 90,
        c: COLORS[i % COLORS.length],
      }
    })
  }, [burst, count])
  if (!pieces.length || reducedMotion()) return null
  return (
    <div key={burst} className="fx-confetti-layer" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.i}
          className="fx-confetti"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: p.w,
            height: p.w * 0.45,
            background: p.c,
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--fall': `${p.dy + p.fall}px`,
            '--r': `${p.r}deg`,
            animationDelay: `${p.d}ms`,
          }}
        />
      ))}
    </div>
  )
}

/** The amount won, floating up over the result. `pop` is { id, text, tone } or null. */
export function WinPop({ pop, className = '' }) {
  if (!pop) return null
  return (
    <span key={pop.id} className={`fx-float pointer-events-none inline-block rounded-full px-3 py-1 text-sm font-bold tabular shadow-lg ${pop.tone === 'loss' ? 'bg-no-soft text-no' : 'bg-yes text-black'} ${className}`} aria-hidden="true">
      {pop.text}
    </span>
  )
}
