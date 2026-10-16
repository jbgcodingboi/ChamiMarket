import { useId, useRef, useState } from 'react'
import { useAccountStore } from '../../store/accountStore.js'
import { marketPrice } from '../../store/prices.js'
import { useNow } from '../../hooks/useNow.js'
import { useResolution } from '../../store/resolutionStore.js'
import { toast } from '../../store/toastStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { hasEnded } from '../../utils/curation.js'
import { formatCents, formatCurrency, formatPercent, formatShares, formatSignedCurrency } from '../../utils/format.js'
import { roundMoney } from '../../utils/math.js'
import { positionKey } from '../../utils/portfolio.js'
import { isTradablePrice, previewBuy } from '../../utils/trading.js'
import Tabs from '../ui/Tabs.jsx'
import OutcomeBadge from './OutcomeBadge.jsx'
import SellForm from './SellForm.jsx'

const QUICK = [10, 100, 1000]

const sanitizeAmount = (v) => {
  const cleaned = v.replace(/[^\d.]/g, '')
  const [int, ...rest] = cleaned.split('.')
  const whole = int.replace(/^0+(?=\d)/, '').slice(0, 10)
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole
}

function OutcomeToggle({ market, side, onSideChange }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choose outcome">
      {['yes', 'no'].map((s) => {
        const active = s === side
        const yes = s === 'yes'
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            onClick={() => onSideChange(s)}
            className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
              active
                ? yes
                  ? 'border-yes bg-yes text-white'
                  : 'border-no bg-no text-white'
                : yes
                  ? 'border-transparent bg-yes-soft text-yes hover:border-yes/50'
                  : 'border-transparent bg-no-soft text-no hover:border-no/50'
            }`}
          >
            <span className="truncate">{market.labels[s]}</span>
            <span className="tabular">{formatCents(marketPrice(market, s))}</span>
          </button>
        )
      })}
    </div>
  )
}

function BuyForm({ market, side, onDone }) {
  const user = useAccountStore((s) => s.user)
  const cash = useAccountStore((s) => s.portfolio?.cash ?? 0)
  const buy = useAccountStore((s) => s.buy)
  const openAuth = useUiStore((s) => s.openAuth)
  const [amountText, setAmountText] = useState('')
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const ids = useId()

  const price = marketPrice(market, side)
  const amount = Number(amountText)
  const preview = previewBuy({ amount, price, cash: user ? cash : Number.MAX_SAFE_INTEGER })
  const showError = (amountText !== '' || !isTradablePrice(price)) && !preview.valid

  const add = (v) => setAmountText((prev) => String(roundMoney((Number(prev) || 0) + v)))
  const max = () => setAmountText(String(Math.floor(cash * 100) / 100))

  const submit = async (e) => {
    e.preventDefault()
    if (!user) {
      openAuth('login', 'Log in to trade')
      return
    }
    if (submitting.current || !preview.valid) return
    submitting.current = true
    setBusy(true)
    try {
      const entry = await buy({ marketId: market.id, side, amount: preview.amount })
      toast({
        tone: 'success',
        title: `Bought ${formatShares(entry.shares)} ${market.labels[side]} shares`,
        description: `${formatCurrency(entry.amount)} at ${formatCents(entry.price)} per share`,
      })
      setAmountText('')
      onDone?.()
    } catch (err) {
      toast({ tone: 'error', title: 'Order rejected', description: err.message })
    } finally {
      setTimeout(() => {
        submitting.current = false
        setBusy(false)
      }, 300)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor={`${ids}-amount`} className="text-sm font-medium">
            Amount
          </label>
          {user && <span className="text-xs text-muted tabular">Cash {formatCurrency(cash)}</span>}
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg font-semibold text-muted">$</span>
          <input
            id={`${ids}-amount`}
            inputMode="decimal"
            autoComplete="off"
            value={amountText}
            onChange={(e) => setAmountText(sanitizeAmount(e.target.value))}
            placeholder="0"
            aria-invalid={showError}
            aria-describedby={showError ? `${ids}-err` : undefined}
            className="input pl-7 text-right text-2xl font-bold tabular"
          />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {QUICK.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => add(v)}
              className="rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-3 hover:text-fg"
            >
              +${v.toLocaleString('en-US')}
            </button>
          ))}
          <button
            type="button"
            onClick={max}
            disabled={!user || cash <= 0}
            className="rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-3 hover:text-fg disabled:opacity-40"
          >
            Max
          </button>
        </div>
        {showError && (
          <p id={`${ids}-err`} className="mt-2 text-sm text-no" role="alert">
            {preview.error}
          </p>
        )}
      </div>

      <dl className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Shares</dt>
          <dd className="font-semibold tabular">{formatShares(preview.shares)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Average price</dt>
          <dd className="tabular">{formatCents(preview.avgPrice)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Payout if {market.labels[side]} wins</dt>
          <dd className="font-semibold text-yes tabular">{formatCurrency(preview.payout)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Potential profit</dt>
          <dd className="tabular">
            {formatSignedCurrency(preview.profit)}
            <span className="ml-1.5 text-muted">({formatPercent(preview.roi, { signed: true, decimals: 1 })} ROI)</span>
          </dd>
        </div>
      </dl>

      {user ? (
        <button type="submit" disabled={!preview.valid || busy} className="btn btn-primary w-full py-3 text-base">
          Buy {market.labels[side]}
        </button>
      ) : (
        <button type="submit" className="btn btn-primary w-full py-3 text-base">
          Log in to trade
        </button>
      )}
      <p className="text-center text-xs text-subtle">Instant market order at the current price. Play money only.</p>
    </form>
  )
}

/** Buy and sell ticket for one market. Guests see it but are asked to log in. */
export default function TradePanel({ market, side, onSideChange, onDone }) {
  const [mode, setMode] = useState('buy')
  const resolution = useResolution(market.id)
  const user = useAccountStore((s) => s.user)
  const position = useAccountStore((s) => s.portfolio?.positions[positionKey(market.id, side)] ?? null)
  const now = useNow(30000)

  if (market.acceptingOrders === false && !resolution && !market.closed) {
    return (
      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">Trading paused</h2>
        <p className="text-sm text-muted">This market is not accepting orders right now. Check back soon.</p>
      </div>
    )
  }

  if (!resolution && !market.closed && hasEnded(market, now)) {
    return (
      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">Trading closed</h2>
        <p className="text-sm text-muted">
          This event has ended. Positions settle automatically as soon as the official result is in.
        </p>
      </div>
    )
  }

  if (resolution || market.closed) {
    return (
      <div className="card space-y-3 p-4">
        <h2 className="font-semibold">Trading closed</h2>
        {resolution ? (
          <OutcomeBadge outcome={resolution.outcome} labels={market.labels} />
        ) : (
          <p className="text-sm text-muted">This market has closed and is awaiting a final result.</p>
        )}
        <p className="text-sm text-muted">Positions in resolved markets are settled automatically.</p>
      </div>
    )
  }

  return (
    <div className="card space-y-4 p-4">
      <Tabs
        tabs={[
          { id: 'buy', label: 'Buy' },
          { id: 'sell', label: 'Sell' },
        ]}
        value={mode}
        onChange={setMode}
        label="Order type"
      />
      <OutcomeToggle market={market} side={side} onSideChange={onSideChange} />
      {mode === 'buy' ? (
        <BuyForm market={market} side={side} onDone={onDone} />
      ) : !user ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">Log in to see and sell your positions.</p>
      ) : position ? (
        <SellForm key={`${market.id}:${side}`} market={market} position={position} onDone={onDone} />
      ) : (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">
          You don't hold any {market.labels[side]} shares in this market.
        </p>
      )}
    </div>
  )
}
