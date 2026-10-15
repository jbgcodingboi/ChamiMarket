import { useCallback, useEffect, useMemo, useState } from 'react'
import { ORDER_BOOK_POLL_MS } from '../../config.js'
import { usePolling } from '../../hooks/usePolling.js'
import { fetchOrderBook } from '../../services/clob.js'
import { syntheticOrderBook } from '../../services/synthetic.js'
import { formatCents, formatCompactCurrency, formatSharesShort } from '../../utils/format.js'
import Tabs from '../ui/Tabs.jsx'

const LEVELS = 8

function withTotals(levels) {
  let running = 0
  return levels.slice(0, LEVELS).map((l) => {
    running += l.price * l.size
    return { ...l, total: running }
  })
}

function Row({ level, max, tone }) {
  const pct = max ? (level.total / max) * 100 : 0
  return (
    <tr className="relative text-sm">
      <td className="relative py-1 pl-3">
        <span
          className={`absolute inset-y-0.5 left-0 rounded-r ${tone === 'ask' ? 'bg-no-soft' : 'bg-yes-soft'}`}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
        <span className={`relative font-medium tabular ${tone === 'ask' ? 'text-no' : 'text-yes'}`}>
          {formatCents(level.price)}
        </span>
      </td>
      <td className="relative py-1 text-right tabular">{formatSharesShort(level.size)}</td>
      <td className="relative py-1 pr-3 text-right text-muted tabular">{formatCompactCurrency(level.total)}</td>
    </tr>
  )
}

export default function OrderBook({ market, side, onSideChange, disabled }) {
  const tokenId = market.tokenIds?.[side === 'yes' ? 0 : 1] ?? null
  const price = side === 'yes' ? market.yesPrice : market.noPrice
  const [live, setLive] = useState({ tokenId: null, book: null })

  const load = useCallback(() => {
    if (!tokenId) return
    fetchOrderBook(tokenId)
      .then((book) => setLive({ tokenId, book }))
      .catch(() => setLive((prev) => (prev.tokenId === tokenId ? prev : { tokenId, book: null })))
  }, [tokenId])

  useEffect(load, [load])
  usePolling(load, ORDER_BOOK_POLL_MS, { enabled: Boolean(tokenId) && !disabled })

  const synthetic = useMemo(() => syntheticOrderBook(`${market.id}:${side}`, price), [market.id, side, price])
  const book = live.tokenId === tokenId && live.book ? live.book : synthetic
  const asks = withTotals(book.asks)
  const bids = withTotals(book.bids)
  const max = Math.max(asks[asks.length - 1]?.total ?? 0, bids[bids.length - 1]?.total ?? 0)
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          tabs={[
            { id: 'yes', label: `Trade ${market.labels.yes}` },
            { id: 'no', label: `Trade ${market.labels.no}` },
          ]}
          value={side}
          onChange={onSideChange}
          label="Order book outcome"
          size="sm"
        />
        {book.synthetic && (
          <span className="text-xs text-subtle" title="Live depth is unavailable, so a simulated book around the current price is shown.">
            Simulated depth
          </span>
        )}
      </div>
      <table className="mt-3 w-full">
        <caption className="sr-only">Order book for {market.labels[side]}</caption>
        <thead>
          <tr className="text-xs text-subtle uppercase">
            <th scope="col" className="pb-2 pl-3 text-left font-medium">Price</th>
            <th scope="col" className="pb-2 text-right font-medium">Shares</th>
            <th scope="col" className="pr-3 pb-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {[...asks].reverse().map((l) => (
            <Row key={`a${l.price}`} level={l} max={max} tone="ask" />
          ))}
          <tr>
            <td colSpan={3} className="border-y border-line py-1.5 pl-3 text-xs text-muted">
              Last {formatCents(price)}
              {spread !== null && <span className="ml-3">Spread {formatCents(spread)}</span>}
            </td>
          </tr>
          {bids.map((l) => (
            <Row key={`b${l.price}`} level={l} max={max} tone="bid" />
          ))}
        </tbody>
      </table>
      {!asks.length && !bids.length && <p className="py-6 text-center text-sm text-muted">No resting orders.</p>}
    </div>
  )
}
