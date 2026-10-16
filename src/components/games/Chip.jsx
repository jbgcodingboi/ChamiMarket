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

/** A casino chip. Pass `amount` to show a stack total instead of a face value. */
export function Chip({ value, amount, size = 40, className = '' }) {
  const [fill, edge, text] = colorsFor(amount ?? value)
  const label = amount !== undefined ? (amount >= 1000 ? formatCompactCurrency(amount).replace('$', '') : String(Math.round(amount))) : short(value)
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill={fill} stroke="rgb(0 0 0 / 0.35)" strokeWidth="1" />
      <circle cx="20" cy="20" r="15.5" fill="none" stroke={edge} strokeWidth="3.5" strokeDasharray="5 4.4" />
      <circle cx="20" cy="20" r="11" fill={fill} stroke="rgb(255 255 255 / 0.35)" strokeWidth="1" />
      <text x="20" y="24" textAnchor="middle" fontSize={label.length > 3 ? 8 : 10} fontWeight="700" fill={text}>
        {label}
      </text>
    </svg>
  )
}

/** Chip denomination picker. */
export function ChipSelector({ value, onChange, max }) {
  return (
    <div role="radiogroup" aria-label="Chip value" className="flex flex-wrap gap-2">
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
            className={`rounded-full transition disabled:opacity-30 ${selected ? '-translate-y-1 ring-2 ring-warn ring-offset-2 ring-offset-surface' : 'hover:-translate-y-0.5'}`}
          >
            <Chip value={v} size={44} />
          </button>
        )
      })}
    </div>
  )
}
