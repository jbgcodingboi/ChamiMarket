import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMarket, useMarketStore } from '../../store/marketStore.js'
import { getOutcomePrice } from '../../store/prices.js'
import { formatCents, formatCurrency, formatPercent, formatShares, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import { avgPrice, positionValue, unrealizedPnl } from '../../utils/portfolio.js'
import { BriefcaseIcon } from '../ui/Icons.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import SellModal from './SellModal.jsx'
import SideBadge from './SideBadge.jsx'

function rowData(p) {
  const market = getMarket(p.marketId)
  const live = getOutcomePrice(p.marketId, p.side)
  const price = live ?? avgPrice(p)
  const pnl = unrealizedPnl(p, price)
  return {
    p,
    market,
    price,
    value: positionValue(p, price),
    pnl,
    pnlPct: p.costBasis ? (pnl / p.costBasis) * 100 : 0,
    label: market?.labels[p.side],
  }
}

function PositionManager({ positions }) {
  useMarketStore((s) => s.tick)
  const [selling, setSelling] = useState(null)

  if (!positions.length) {
    return (
      <EmptyState
        icon={BriefcaseIcon}
        title="No open positions"
        action={
          <Link to="/" className="btn btn-primary">
            Browse markets
          </Link>
        }
      >
        Buy Yes or No shares in any market and they will show up here with live value and PnL.
      </EmptyState>
    )
  }

  const rows = positions.map(rowData).sort((a, b) => b.value - a.value)
  const sellButton = (r) => (
    <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setSelling(r.p)}>
      Sell / Cash Out
    </button>
  )

  return (
    <>
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-sm">
          <caption className="sr-only">Open positions</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="px-4 py-3 font-medium">Market</th>
              <th scope="col" className="px-2 py-3 font-medium">Side</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Shares</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Avg price</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Current</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Value</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Unrealized PnL</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.p.marketId}:${r.p.side}`} className="border-b border-line last:border-0 hover:bg-surface-2">
                <td className="max-w-[280px] px-4 py-3">
                  <Link to={`/market/${encodeURIComponent(r.p.marketId)}`} className="line-clamp-2 font-medium hover:text-primary-300">
                    {r.p.marketTitle}
                  </Link>
                </td>
                <td className="px-2 py-3"><SideBadge side={r.p.side} label={r.label} /></td>
                <td className="px-2 py-3 text-right tabular">{formatShares(r.p.shares)}</td>
                <td className="px-2 py-3 text-right tabular">{formatCents(avgPrice(r.p))}</td>
                <td className="px-2 py-3 text-right tabular">{formatCents(r.price)}</td>
                <td className="px-2 py-3 text-right font-semibold tabular">{formatCurrency(r.value)}</td>
                <td className={`px-2 py-3 text-right tabular ${pnlTone(r.pnl)}`}>
                  {formatSignedCurrency(r.pnl)}
                  <span className="block text-xs">{formatPercent(r.pnlPct, { signed: true, decimals: 1 })}</span>
                </td>
                <td className="px-4 py-3 text-right">{sellButton(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={`${r.p.marketId}:${r.p.side}`} className="card space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <Link to={`/market/${encodeURIComponent(r.p.marketId)}`} className="font-medium hover:text-primary-300">
                {r.p.marketTitle}
              </Link>
              <SideBadge side={r.p.side} label={r.label} />
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-muted">Shares</dt><dd className="tabular">{formatShares(r.p.shares)}</dd></div>
              <div><dt className="text-xs text-muted">Avg → Now</dt><dd className="tabular">{formatCents(avgPrice(r.p))} → {formatCents(r.price)}</dd></div>
              <div><dt className="text-xs text-muted">Value</dt><dd className="font-semibold tabular">{formatCurrency(r.value)}</dd></div>
            </dl>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-semibold tabular ${pnlTone(r.pnl)}`}>
                {formatSignedCurrency(r.pnl)} ({formatPercent(r.pnlPct, { signed: true, decimals: 1 })})
              </span>
              {sellButton(r)}
            </div>
          </li>
        ))}
      </ul>
      <SellModal position={selling} onClose={() => setSelling(null)} />
    </>
  )
}

export default memo(PositionManager)
