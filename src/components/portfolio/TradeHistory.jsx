import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMarket } from '../../store/marketStore.js'
import { formatCents, formatCurrency, formatDateTime, formatShares, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import { ActivityIcon, RefreshIcon } from '../ui/Icons.jsx'
import EmptyState from '../ui/EmptyState.jsx'
import Tabs from '../ui/Tabs.jsx'
import SideBadge from './SideBadge.jsx'

const FILTERS = [
  { id: 'all', label: 'All activity' },
  { id: 'closed', label: 'Closed & settled' },
]

const TYPE_LABEL = { buy: 'Buy', sell: 'Sell', settlement: 'Settlement', reset: 'Reset' }
const PAGE = 50

export default function TradeHistory({ history }) {
  const [filter, setFilter] = useState('all')
  const [limit, setLimit] = useState(PAGE)
  const rows = useMemo(
    () => (filter === 'closed' ? history.filter((e) => e.type === 'sell' || e.type === 'settlement') : history),
    [history, filter],
  )

  return (
    <div className="space-y-3">
      <Tabs tabs={FILTERS} value={filter} onChange={setFilter} label="History filter" size="sm" />
      {!rows.length ? (
        <EmptyState icon={ActivityIcon} title={filter === 'closed' ? 'No closed trades yet' : 'No trades yet'}>
          Your buys, sells, settlements and resets will be listed here.
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Trade history</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th scope="col" className="px-4 py-3 font-medium">Time</th>
                <th scope="col" className="px-2 py-3 font-medium">Market</th>
                <th scope="col" className="px-2 py-3 font-medium">Side</th>
                <th scope="col" className="px-2 py-3 font-medium">Type</th>
                <th scope="col" className="px-2 py-3 text-right font-medium">Shares</th>
                <th scope="col" className="px-2 py-3 text-right font-medium">Price</th>
                <th scope="col" className="px-2 py-3 text-right font-medium">Amount</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Realized PnL</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((e) =>
                e.type === 'reset' ? (
                  <tr key={e.id} className="border-b border-line bg-primary-500/10">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(e.ts)}</td>
                    <td colSpan={7} className="px-2 py-3">
                      <span className="inline-flex items-center gap-2 font-medium text-primary-200">
                        <RefreshIcon className="size-4" /> Account reset (run {e.run} ended)
                      </span>
                      <span className="ml-2 text-muted">{e.note}</span>
                    </td>
                  </tr>
                ) : (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(e.ts)}</td>
                    <td className="max-w-[260px] px-2 py-3">
                      <Link to={`/market/${encodeURIComponent(e.marketId)}`} className="line-clamp-1 hover:text-primary-300">
                        {e.marketTitle}
                      </Link>
                    </td>
                    <td className="px-2 py-3"><SideBadge side={e.side} label={getMarket(e.marketId)?.labels[e.side]} /></td>
                    <td className="px-2 py-3">
                      {TYPE_LABEL[e.type]}
                      {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                    </td>
                    <td className="px-2 py-3 text-right tabular">{formatShares(e.shares)}</td>
                    <td className="px-2 py-3 text-right tabular">{formatCents(e.price)}</td>
                    <td className="px-2 py-3 text-right tabular">
                      {e.type === 'buy' ? '-' : '+'}
                      {formatCurrency(e.amount)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular ${e.realizedPnl === null ? 'text-subtle' : pnlTone(e.realizedPnl)}`}>
                      {e.realizedPnl === null ? '·' : formatSignedCurrency(e.realizedPnl)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          {rows.length > limit && (
            <div className="border-t border-line p-3 text-center">
              <button type="button" className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({rows.length - limit} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
