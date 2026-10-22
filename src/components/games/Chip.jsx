import { useEffect, useRef } from 'react'
import { formatCompactCurrency } from '../../utils/format.js'

const CHIP_VALUES = [1, 5, 25, 100, 500, 1000]

const CHIP_COLORS = {
  1: ['#e7e5e4', '#78716c', '#1c1917'],
  5: ['#c0262d', '#fca5a5', '#fff'],
  25: ['#15803d', '#86efac', '#fff'],
  100: ['#1c1917', '#a8a29e', '#fff'],
  500: ['#6d28d9', '#c4b5fd', '#fff'],
  1000: ['#d4a017', '#fde68a', '#1c1917'],
}

const colorsFor = (value) => {
  const tier = [...CHIP_VALUES].reverse().find((v) => value >= v) ?? 1
  return CHIP_COLORS[tier]
}

const short = (v) => (v >= 1000 ? `${v / 1000}K` : String(v))
const SPOTS = [0, 45, 90, 135, 180, 225, 270, 315]

/** A casino chip. Pass `amount` to show a stack total instead of a face value. */
export function Chip({ value, amount, size = 40, className = '' }) {
  const [fill, edge, text] = colorsFor(amount ?? value)
  const label =
    amount !== undefined ? (amount >= 1000 ? formatCompactCurrency(amount).replace('$', '') : String(Math.round(amount * 100) / 100)) : short(value)
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill={fill} stroke="rgb(0 0 0 / 0.4)" strokeWidth="1" />
      {SPOTS.map((a) => (
        <rect key={a} x="17.6" y="1.6" width="4.8" height="6" rx="1" fill={edge} transform={`rotate(${a} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="12.6" fill="none" stroke="rgb(255 255 255 / 0.5)" strokeWidth="0.8" strokeDasharray="2 1.6" />
      <circle cx="20" cy="20" r="11.4" fill={fill} stroke="rgb(0 0 0 / 0.25)" strokeWidth="0.6" />
      <ellipse cx="20" cy="12" rx="13" ry="7" fill="rgb(255 255 255 / 0.13)" />
      <text x="20" y="24" textAnchor="middle" fontSize={label.length > 4 ? 7 : label.length > 3 ? 8 : 10} fontWeight="800" fill={text}>
        {label}
      </text>
    </svg>
  )
}

/** Chip denomination picker (pick one, then click the table to place it). */
export function ChipSelector({ value, onChange, max }) {
  return (
    <div role="radiogroup" aria-label="Chip value" className="flex flex-wrap gap-1.5 sm:gap-2">
      {CHIP_VALUES.map((v) => {
        const selected = v === value
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`$${v} chip`}
            disabled={max !== undefined && v > max}
            onClick={() => onChange(v)}
            className={`rounded-full transition duration-150 disabled:opacity-30 ${
              selected ? '-translate-y-1 shadow-[0_6px_14px_rgb(0_0_0/0.5)] ring-2 ring-warn ring-offset-2 ring-offset-surface' : 'opacity-80 hover:-translate-y-0.5 hover:opacity-100'
            }`}
          >
            <Chip value={v} size={44} />
          </button>
        )
      })}
    </div>
  )
}

/** A row of chips that each add their value to a bet when clicked. */
export function ChipRack({ onAdd, max, disabled = false }) {
  return (
    <div role="group" aria-label="Add chips to your bet" className="flex flex-wrap gap-1.5 sm:gap-2">
      {CHIP_VALUES.map((v) => (
        <button
          key={v}
          type="button"
          aria-label={`Add $${v}`}
          disabled={disabled || (max !== undefined && v > max)}
          onClick={() => onAdd(v)}
          className="rounded-full transition duration-150 hover:-translate-y-1 hover:shadow-[0_6px_14px_rgb(0_0_0/0.5)] active:translate-y-0 active:scale-95 disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:shadow-none"
        >
          <Chip value={v} size={44} />
        </button>
      ))}
    </div>
  )
}

/** Splits an amount into chip denominations, biggest first. */
function chipsFor(amount, limit = 6) {
  const out = []
  let left = Math.round(amount * 100) / 100
  for (const v of [...CHIP_VALUES].reverse()) {
    while (left >= v && out.length < 40) {
      out.push(v)
      left = Math.round((left - v) * 100) / 100
    }
  }
  if (!out.length && amount > 0) out.push(1)
  return out.slice(0, limit)
}

/** A small stack of chips adding up to `amount`, with the total on the top chip. */
export function ChipStack({ amount, size = 36, step = 4, limit = 6 }) {
  const chips = chipsFor(amount, limit)
  if (!chips.length) return null
  return (
    <span className="relative inline-block" style={{ width: size, height: size + (chips.length - 1) * step }} aria-hidden="true">
      {chips.map((v, i) => (
        <span key={i} className="absolute left-0 drop-shadow-[0_2px_2px_rgb(0_0_0/0.45)]" style={{ bottom: i * step }}>
          {i === chips.length - 1 ? <Chip amount={amount} size={size} /> : <Chip value={v} size={size} />}
        </span>
      ))}
    </span>
  )
}

const BURST_COLORS = ['#f5b82e', '#fde68a', '#2fbf71', '#ffffff', '#d93a45', '#86efac']

/**
 * A short burst of confetti from the middle of its (positioned) parent.
 * Fires whenever `burst.key` changes; `burst.big` throws more. Skipped for
 * people who prefer reduced motion.
 */
export function ChipBurst({ burst }) {
  const ref = useRef(null)
  const key = burst?.key
  const big = Boolean(burst?.big)
  useEffect(() => {
    const host = ref.current
    if (!key || !host || typeof host.animate !== 'function') return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const count = big ? 64 : 26
    const spread = big ? 1 : 0.65
    const nodes = []
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span')
      const w = 5 + Math.random() * 6
      el.style.cssText = `position:absolute;left:50%;top:45%;width:${w}px;height:${w * (0.4 + Math.random() * 0.8)}px;border-radius:${Math.random() < 0.3 ? '50%' : '2px'};background:${BURST_COLORS[i % BURST_COLORS.length]};will-change:transform,opacity;`
      host.appendChild(el)
      nodes.push(el)
      const angle = Math.random() * Math.PI * 2
      const dist = (90 + Math.random() * 190) * spread
      const dx = Math.cos(angle) * dist
      const dy = Math.sin(angle) * dist * 0.7 - 60 * spread
      const spin = (Math.random() - 0.5) * 900
      el.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 140}px)) scale(0.9) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 1100 + Math.random() * 700, easing: 'cubic-bezier(0.15, 0.7, 0.4, 1)', delay: Math.random() * 120, fill: 'forwards' },
      ).onfinish = () => el.remove()
    }
    return () => nodes.forEach((n) => n.remove())
  }, [key, big])
  return <div ref={ref} className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true" />
}
