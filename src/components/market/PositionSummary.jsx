import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAccountStore } from '../../store/accountStore.js'
import { marketPrice } from '../../store/prices.js'
import { hasEnded } from '../../utils/curation.js'
import { formatCents, formatCurrency, formatPercent, formatShares, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import { avgPrice, positionValue, unrealizedPnl } from '../../utils/portfolio.js'
import SellModal from '../portfolio/SellModal.jsx'
import SideBadge from '../portfolio/SideBadge.jsx'

/** The signed-in user's open positions in this market. */
export default function PositionSummary({ market }) {
  const positions = useAccountStore(
    useShallow((s) => Object.values(s.portfolio?.positions ?? {}).filter((p) => p.marketId === market.id)),
  )
  const [selling, setSelling] = useState(null)
  if (!positions.length) return null

  return (
    <section className="card p-4" aria-labelledby="your-position">
      <h2 id="your-position" className="font-semibold">
        Your position
      </h2>
      <ul className="mt-3 space-y-2">
        {positions.map((p) => {
          const price = marketPrice(market, p.side)
          const pnl = unrealizedPnl(p, price)
          return (
            <li key={p.side} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-surface-2 p-3 text-sm">
              <SideBadge side={p.side} label={market.labels[p.side]} />
              <div>
                <p className="text-xs text-muted">Shares</p>
                <p className="font-semibold tabular">{formatShares(p.shares)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Avg / Now</p>
                <p className="tabular">
                  {formatCents(avgPrice(p))} → {formatCents(price)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Value</p>
                <p className="font-semibold tabular">{formatCurrency(positionValue(p, price))}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Unrealized PnL</p>
                <p className={`font-semibold tabular ${pnlTone(pnl)}`}>
                  {formatSignedCurrency(pnl)}{' '}
                  <span className="font-normal">
                    ({formatPercent(p.costBasis ? (pnl / p.costBasis) * 100 : 0, { signed: true, decimals: 1 })})
                  </span>
                </p>
              </div>
              {market.closed || hasEnded(market) ? (
                <span className="ml-auto text-xs text-muted">Awaiting result</span>
              ) : (
                <button type="button" className="btn btn-ghost ml-auto px-3 py-1.5" onClick={() => setSelling(p)}>
                  Sell
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <SellModal position={selling} onClose={() => setSelling(null)} />
    </section>
  )
}
