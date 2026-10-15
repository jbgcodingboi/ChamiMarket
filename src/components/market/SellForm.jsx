import { useId, useRef, useState } from 'react'
import { useAccountStore } from '../../store/accountStore.js'
import { marketPrice } from '../../store/prices.js'
import { toast } from '../../store/toastStore.js'
import { formatCents, formatCurrency, formatShares, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import { roundShares } from '../../utils/math.js'
import { avgPrice } from '../../utils/portfolio.js'
import { previewSell } from '../../utils/trading.js'

const sanitizeShares = (v) => {
  const cleaned = v.replace(/[^\d.]/g, '')
  const [int, ...rest] = cleaned.split('.')
  return rest.length ? `${int.slice(0, 12)}.${rest.join('').slice(0, 4)}` : int.slice(0, 12)
}

/** Sell part or all of a position at the current market price. */
export default function SellForm({ market, position, defaultPercent = 0, onDone }) {
  const sell = useAccountStore((s) => s.sell)
  const ids = useId()
  const initial = defaultPercent ? String(roundShares((position.shares * defaultPercent) / 100)) : ''
  const [sharesText, setSharesText] = useState(initial)
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)

  const price = market ? marketPrice(market, position.side) : null
  const shares = Number(sharesText)
  const preview = previewSell({ position, shares, price })
  const percent = position.shares > 0 && shares > 0 ? Math.min(100, (shares / position.shares) * 100) : 0
  const showError = sharesText !== '' && !preview.valid

  const setPercent = (pct) => {
    if (pct >= 100) setSharesText(String(position.shares))
    else setSharesText(pct > 0 ? String(roundShares((position.shares * pct) / 100)) : '')
  }

  const submit = (e) => {
    e.preventDefault()
    if (submitting.current || !preview.valid) return
    submitting.current = true
    setBusy(true)
    try {
      const { preview: done } = sell({ marketId: position.marketId, side: position.side, shares: preview.shares })
      toast({
        tone: 'success',
        title: `Sold ${formatShares(done.shares)} ${market?.labels[position.side] ?? position.side} shares`,
        description: `Proceeds ${formatCurrency(done.proceeds)} · Realized ${formatSignedCurrency(done.realizedPnl)}`,
      })
      setSharesText('')
      onDone?.()
    } catch (err) {
      toast({ tone: 'error', title: 'Sale failed', description: err.message })
    } finally {
      setTimeout(() => {
        submitting.current = false
        setBusy(false)
      }, 300)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">You own</span>
        <span className="font-semibold tabular">
          {formatShares(position.shares)} shares @ {formatCents(avgPrice(position))}
        </span>
      </div>

      <div>
        <label htmlFor={`${ids}-shares`} className="mb-1.5 block text-sm font-medium">
          Shares to sell
        </label>
        <input
          id={`${ids}-shares`}
          inputMode="decimal"
          autoComplete="off"
          value={sharesText}
          onChange={(e) => setSharesText(sanitizeShares(e.target.value))}
          placeholder="0"
          aria-invalid={showError}
          aria-describedby={showError ? `${ids}-err` : undefined}
          className="input text-lg font-semibold tabular"
        />
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(percent)}
          onChange={(e) => setPercent(Number(e.target.value))}
          aria-label="Percent of position to sell"
          aria-valuetext={`${Math.round(percent)} percent`}
          className="mt-3 w-full accent-primary-500"
        />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setPercent(pct)}
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                Math.round(percent) === pct ? 'border-primary-400 bg-primary-500/20 text-fg' : 'border-line text-muted hover:bg-surface-3'
              }`}
            >
              {pct === 100 ? 'Max' : `${pct}%`}
            </button>
          ))}
        </div>
        {showError && (
          <p id={`${ids}-err`} className="mt-2 text-sm text-no" role="alert">
            {preview.error}
          </p>
        )}
      </div>

      <dl className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Price per share</dt>
          <dd className="tabular">{price !== null ? formatCents(price) : 'Unavailable'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Estimated proceeds</dt>
          <dd className="font-semibold tabular">{formatCurrency(preview.proceeds)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Realized PnL</dt>
          <dd className={`font-semibold tabular ${pnlTone(preview.realizedPnl)}`}>
            {formatSignedCurrency(preview.realizedPnl)}
          </dd>
        </div>
      </dl>

      <button type="submit" disabled={!preview.valid || busy} className="btn btn-primary w-full py-3 text-base">
        {preview.isFull && preview.valid ? 'Cash out full position' : 'Sell shares'}
      </button>
    </form>
  )
}
