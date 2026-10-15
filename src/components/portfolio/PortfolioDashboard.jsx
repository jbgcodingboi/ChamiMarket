import { flashClass, usePriceFlash } from '../../hooks/usePriceFlash.js'
import { formatCurrency, formatPercent, formatSignedCurrency, pnlTone } from '../../utils/format.js'

function Metric({ label, value, sub, tone = '', big = false, hint }) {
  const flash = usePriceFlash(value)
  return (
    <div className={`card p-4 ${big ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
      <p className="text-sm text-muted" title={hint}>
        {label}
      </p>
      <p className={`mt-1 rounded-md font-bold tabular ${big ? 'text-3xl' : 'text-2xl'} ${tone} ${flashClass(flash)}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-sm tabular ${tone || 'text-muted'}`}>{sub}</p>}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular">{value}</dd>
    </div>
  )
}

/** Headline account metrics. Every value updates live as prices change. */
export default function PortfolioDashboard({ metrics, resetsUsed }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          big
          label="Net worth"
          hint="Available cash plus the current value of every open position"
          value={formatCurrency(metrics.netWorth)}
          sub={`${formatSignedCurrency(metrics.totalPnl)} (${formatPercent(metrics.totalPnlPct, { signed: true })}) this run`}
        />
        <Metric label="Available funds" hint="Uninvested play-money cash" value={formatCurrency(metrics.cash)} sub="Cash balance" />
        <Metric
          label="Unrealized PnL"
          hint="Sum of (current price - average buy price) x shares over open positions"
          value={formatSignedCurrency(metrics.unrealizedPnl)}
          sub={formatPercent(metrics.unrealizedPct, { signed: true })}
          tone={pnlTone(metrics.unrealizedPnl)}
        />
        <Metric
          label="Realized PnL"
          hint="Locked-in profit or loss from sales and settlements this run"
          value={formatSignedCurrency(metrics.realizedPnl)}
          sub="From sells and settlements"
          tone={pnlTone(metrics.realizedPnl)}
        />
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total invested (cost basis)" value={formatCurrency(metrics.invested)} />
        <Stat label="Open positions" value={metrics.openPositions} />
        <Stat
          label="Win rate"
          value={metrics.winRate === null ? 'No closed trades' : `${metrics.winRate.toFixed(0)}% of ${metrics.closedTrades}`}
        />
        <Stat label="Resets used" value={resetsUsed} />
      </dl>
    </div>
  )
}
