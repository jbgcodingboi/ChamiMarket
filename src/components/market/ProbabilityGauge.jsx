import { flashClass, usePriceFlash } from '../../hooks/usePriceFlash.js'
import { formatProbability } from '../../utils/format.js'

/** Semi-circular gauge showing the Yes probability (price x 100). */
export default function ProbabilityGauge({ value, label = 'chance' }) {
  const flash = usePriceFlash(value)
  const r = 20
  const circumference = Math.PI * r
  const filled = Math.max(0, Math.min(1, value)) * circumference
  const color = value >= 0.5 ? 'var(--color-yes)' : 'var(--color-no)'
  return (
    <div className={`relative flex w-14 shrink-0 flex-col items-center rounded-md ${flashClass(flash)}`}>
      <svg viewBox="0 0 48 28" className="w-12" aria-hidden="true">
        <path d="M4 24a20 20 0 0 1 40 0" fill="none" stroke="var(--color-surface-3)" strokeWidth="4" strokeLinecap="round" />
        <path
          d="M4 24a20 20 0 0 1 40 0"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <span className="-mt-3 text-sm font-bold tabular">{formatProbability(value)}</span>
      <span className="text-[10px] text-muted">{label}</span>
    </div>
  )
}
