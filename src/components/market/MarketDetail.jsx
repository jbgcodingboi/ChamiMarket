import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES } from '../../config.js'
import { flashClass, usePriceFlash } from '../../hooks/usePriceFlash.js'
import { useResolution } from '../../store/resolutionStore.js'
import { formatCents, formatCompactCurrency, formatDate, formatProbability } from '../../utils/format.js'
import { ChevronLeftIcon } from '../ui/Icons.jsx'
import Tabs from '../ui/Tabs.jsx'
import MarketAvatar from './MarketAvatar.jsx'
import MobileTradeBar from './MobileTradeBar.jsx'
import OrderBook from './OrderBook.jsx'
import OutcomeBadge from './OutcomeBadge.jsx'
import PositionSummary from './PositionSummary.jsx'
import PriceChart from './PriceChart.jsx'
import ResolveMarket from './ResolveMarket.jsx'
import TradePanel from './TradePanel.jsx'

const categoryLabel = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]))

function OutcomeRow({ market, side, active, onSelect }) {
  const price = side === 'yes' ? market.yesPrice : market.noPrice
  const flash = usePriceFlash(price)
  const yes = side === 'yes'
  return (
    <button
      type="button"
      onClick={() => onSelect(side)}
      aria-pressed={active}
      className={`flex items-center justify-between gap-3 rounded-xl border-2 p-3 text-left transition ${flashClass(flash)} ${
        active ? (yes ? 'border-yes' : 'border-no') : 'border-line hover:border-line-strong'
      }`}
    >
      <span className="min-w-0">
        <span className={`block truncate font-semibold ${yes ? 'text-yes' : 'text-no'}`}>{market.labels[side]}</span>
        <span className="text-xs text-muted">{formatProbability(price)} chance</span>
      </span>
      <span className="text-lg font-bold tabular">{formatCents(price)}</span>
    </button>
  )
}

export default function MarketDetail({ market, side, onSideChange }) {
  const [tab, setTab] = useState('book')
  const resolution = useResolution(market.id)
  const locked = Boolean(resolution) || market.closed

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-28 lg:pb-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeftIcon /> All markets
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <header className="flex items-start gap-4">
            <MarketAvatar market={market} size="size-14" />
            <div className="min-w-0">
              <p className="text-xs text-muted">
                {categoryLabel[market.category]} · {formatCompactCurrency(market.volume)} Vol. · Ends{' '}
                {formatDate(market.endDate)}
                {market.source === 'mock' && <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5">Demo market</span>}
              </p>
              <h1 className="mt-1 text-xl leading-tight font-bold text-balance sm:text-2xl">{market.title}</h1>
              {resolution && (
                <div className="mt-2">
                  <OutcomeBadge outcome={resolution.outcome} labels={market.labels} />
                </div>
              )}
            </div>
          </header>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Outcome">
            <OutcomeRow market={market} side="yes" active={side === 'yes'} onSelect={onSideChange} />
            <OutcomeRow market={market} side="no" active={side === 'no'} onSelect={onSideChange} />
          </div>

          <PriceChart market={market} side={side} />
          <PositionSummary market={market} />

          <section className="card p-4">
            <Tabs
              tabs={[
                { id: 'book', label: 'Order Book' },
                { id: 'rules', label: 'Rules' },
              ]}
              value={tab}
              onChange={setTab}
              label="Market details"
            />
            <div className="mt-4" role="tabpanel">
              {tab === 'book' ? (
                <OrderBook market={market} side={side} onSideChange={onSideChange} disabled={locked} />
              ) : (
                <div className="space-y-3 text-sm leading-relaxed text-muted">
                  {market.eventTitle && <p className="font-medium text-fg">{market.eventTitle}</p>}
                  <p className="whitespace-pre-line">{market.description || 'No rules were provided for this market.'}</p>
                  <p className="text-xs text-subtle">
                    Ends {formatDate(market.endDate)}. On RedBook Markets, resolution is simulated: winning shares
                    pay $1.00 in play money and losing shares pay $0.00.
                  </p>
                </div>
              )}
            </div>
          </section>

          <ResolveMarket market={market} />
        </div>

        <aside className="hidden lg:block" aria-label="Trade">
          <div className="sticky top-24">
            <TradePanel market={market} side={side} onSideChange={onSideChange} />
          </div>
        </aside>
      </div>
      <MobileTradeBar market={market} side={side} onSideChange={onSideChange} />
    </div>
  )
}
