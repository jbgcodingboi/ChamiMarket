import { useId } from 'react'
import { roundMoney } from '../../utils/math.js'

/** Bet input with half, double and max shortcuts. `value` is the text being typed. */
export default function BetAmount({ value, onChange, balance, disabled, label = 'Bet amount' }) {
  const id = useId()
  const amount = Number(value) || 0
  const set = (v) => onChange(String(Math.max(0, roundMoney(v))))
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="mt-1.5 flex gap-1">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">$</span>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min="0.1"
            step="1"
            className="input pl-6 tabular"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <button type="button" className="btn btn-ghost px-2.5" disabled={disabled} onClick={() => set(amount / 2)}>
          ½
        </button>
        <button type="button" className="btn btn-ghost px-2.5" disabled={disabled} onClick={() => set(Math.min(amount * 2, balance))}>
          2×
        </button>
        <button type="button" className="btn btn-ghost px-2" disabled={disabled} onClick={() => set(Math.floor(balance * 100) / 100)}>
          Max
        </button>
      </div>
    </div>
  )
}
