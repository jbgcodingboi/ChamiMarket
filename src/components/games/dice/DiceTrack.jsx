import { useEffect, useRef, useState } from 'react'
import { clampTarget, formatRoll, MAX_TARGET, MIN_TARGET } from '../../../games/dice.js'
import { easeOutCubic, reducedMotion } from '../limbo/fx.js'
import { WinPop } from '../limbo/GameFx.jsx'

/** Animates a number from its last value to `value` over `ms`, for the sliding roll. */
function useRolling(value, ms) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (value === null) return undefined
    const start = from.current ?? 5000
    from.current = value
    if (!(ms > 0) || reducedMotion() || start === value) {
      setShown(value)
      return undefined
    }
    const t0 = performance.now()
    let raf
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms)
      setShown(Math.round(start + (value - start) * easeOutCubic(p)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return value === null ? null : shown
}

/** The big roll number above the track, sliding along with the marker. */
export function DiceReadout({ roll, rollKey, revealed, win, ms, pop, over, target, chance }) {
  const shown = useRolling(roll, ms)
  const settled = roll !== null && revealed
  const tone = settled ? (win ? 'text-yes' : 'text-no') : 'text-fg'
  return (
    <div className="relative flex flex-col items-center pt-1 text-center">
      <div className="absolute -top-1 right-0 flex h-8 items-center sm:top-1">
        <WinPop pop={pop} />
      </div>
      <p key={rollKey} className={`font-mono text-5xl leading-none font-black tracking-tight tabular transition-colors duration-150 sm:text-6xl ${tone} ${settled ? 'fx-pop' : ''}`}>
        {shown === null ? '–.––' : formatRoll(shown)}
      </p>
      <p className="mt-2 text-xs text-muted tabular sm:text-sm">
        {settled ? <span className={`font-semibold ${win ? 'text-yes' : 'text-no'}`}>{win ? 'Win' : 'Miss'} · </span> : null}
        Roll {over ? 'over' : 'under'} <span className="font-semibold text-fg">{target.toFixed(2)}</span> · {chance}% chance
      </p>
    </div>
  )
}

const STEP_KEYS = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }

/**
 * The 0 to 100 track: red loses, green wins, the handle sets the target and
 * the marker slides to the roll. The marker stays neutral while it slides and
 * takes the result's color when the roll is revealed.
 */
export default function DiceTrack({ target, over, onTarget, roll, rollKey, revealed, win, disabled, ms }) {
  const shown = useRolling(roll, ms)
  const pct = (v) => `${v}%`
  const settled = roll !== null && revealed
  const markerTone = settled ? (win ? 'bg-yes text-black shadow-[0_0_24px_rgb(47_191_113/0.55)]' : 'bg-no text-black shadow-[0_0_24px_rgb(245_112_60/0.5)]') : 'bg-white text-black'
  const arrowTone = settled ? (win ? 'border-t-yes' : 'border-t-no') : 'border-t-white'

  // Arrow keys move the target by 1 (Shift for 0.1), Page keys by 10, Home/End to the ends.
  const onKeyDown = (e) => {
    let next = null
    if (e.key in STEP_KEYS) next = target + STEP_KEYS[e.key] * (e.shiftKey ? 0.1 : 1)
    else if (e.key === 'Home') next = MIN_TARGET
    else if (e.key === 'End') next = MAX_TARGET
    if (next === null) return
    e.preventDefault()
    onTarget(clampTarget(next))
  }

  return (
    <div className="dice-track px-1 pt-16 pb-2 sm:px-2">
      <div className="relative h-3.5">
        <div className={`absolute inset-0 flex overflow-hidden rounded-full ring-1 ring-black/40 ${settled ? 'dice-track-lit' : ''}`} data-win={settled ? String(Boolean(win)) : undefined} data-over={String(over)}>
          <div className={`dice-zone ${over ? 'dice-zone-lose bg-no' : 'dice-zone-win bg-yes'}`} style={{ width: pct(target) }} />
          <div className={`dice-zone flex-1 ${over ? 'dice-zone-win bg-yes' : 'dice-zone-lose bg-no'}`} />
        </div>
        {shown !== null && (
          <>
            {/* The chip stays inside the track near the ends; the arrow under it points at the exact roll. */}
            <div
              key={rollKey}
              className={`dice-marker-chip pointer-events-none absolute -top-14 z-10 flex h-10 w-[4.5rem] items-center justify-center rounded-xl font-mono text-sm font-black tabular transition-[background-color,box-shadow] duration-150 ${markerTone} ${settled ? 'fx-pop' : ''}`}
              style={{ left: `clamp(-0.25rem, calc(${shown / 100}% - 2.25rem), calc(100% - 4.25rem))` }}
            >
              {formatRoll(shown)}
            </div>
            <div className="dice-marker pointer-events-none absolute -top-4 z-10 -translate-x-1/2" style={{ left: pct(shown / 100) }} aria-hidden="true">
              <div className={`size-0 border-x-8 border-t-8 border-x-transparent transition-colors duration-150 ${arrowTone}`} />
            </div>
          </>
        )}
        <input
          type="range"
          min={MIN_TARGET}
          max={MAX_TARGET}
          step="0.01"
          value={target}
          disabled={disabled}
          onChange={(e) => onTarget(clampTarget(Number(e.target.value)))}
          onKeyDown={onKeyDown}
          aria-label={`Target: roll ${over ? 'over' : 'under'}`}
          aria-valuetext={`Roll ${over ? 'over' : 'under'} ${target.toFixed(2)}`}
          className="dice-range absolute inset-x-0 -top-2 h-7 w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>
      <div className="relative mt-3 h-4 text-xs text-muted tabular" aria-hidden="true">
        {[0, 25, 50, 75, 100].map((n) => (
          <span key={n} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: pct(n) }}>
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}
