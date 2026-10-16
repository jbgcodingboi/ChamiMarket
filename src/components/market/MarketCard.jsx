import { memo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CATEGORIES } from '../../config.js'
import { flashClass, usePriceFlash } from '../../hooks/usePriceFlash.js'
import { useResolution } from '../../store/resolutionStore.js'
import { formatCents, formatCompactCurrency, formatDate, formatProbability } from '../../utils/format.js'
import MarketAvatar from './MarketAvatar.jsx'
import OutcomeBadge from './OutcomeBadge.jsx'
import ProbabilityGauge from './ProbabilityGauge.jsx'

const categoryLabel = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]))

function QuickButton({ side, label, price, onClick, disabled }) {
  const flash = usePriceFlash(price)
  const yes = side === 'yes'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Buy ${label}, ${formatProbability(price)} chance, ${formatCents(price)} per share`}
      className={`relative z-10 flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${flashClass(flash)} ${
        yes ? 'bg-yes-soft text-yes hover:bg-yes hover:text-white' : 'bg-no-soft text-no hover:bg-no hover:text-white'
      } disabled:pointer-events-none disabled:opacity-40`}
    >
      <span className="truncate">{label}</span>
      <span className="tabular">{formatProbability(price)}</span>
    </button>
  )
}

function MarketCard({ market }) {
  const navigate = useNavigate()
  const resolution = useResolution(market.id)
  const go = (side) => navigate(`/market/${encodeURIComponent(market.id)}?side=${side}`)
  const isBinary = market.labels.yes === 'Yes' && market.labels.no === 'No'
  const titleFlash = usePriceFlash(market.yesPrice)

  return (
    <article className="card group relative flex flex-col gap-3 p-4 transition hover:border-line-strong hover:bg-surface-2">
      <div className="flex items-start gap-3">
        <MarketAvatar market={market} />
        <h3 className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">
          <Link
            to={`/market/${encodeURIComponent(market.id)}`}
            className="line-clamp-2 rounded after:absolute after:inset-0 after:rounded-[0.875rem] after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-primary-300"
          >
            {market.title}
          </Link>
        </h3>
        {isBinary ? (
          <ProbabilityGauge value={market.yesPrice} />
        ) : (
          <span className={`rounded-md px-1 text-sm font-bold tabular ${flashClass(titleFlash)}`}>
            {Math.round(market.yesPrice * 100)}%
          </span>
        )}
      </div>

      {resolution ? (
        <div className="mt-auto">
          <OutcomeBadge outcome={resolution.outcome} labels={market.labels} />
        </div>
      ) : (
        <div className="mt-auto grid grid-cols-2 gap-2">
          <QuickButton side="yes" label={market.labels.yes} price={market.yesPrice} onClick={() => go('yes')} />
          <QuickButton side="no" label={market.labels.no} price={market.noPrice} onClick={() => go('no')} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="tabular">{market.source === 'house' ? 'House odds' : `${formatCompactCurrency(market.volume)} Vol.`}</span>
        <span className="truncate">
          {categoryLabel[market.category]} · {market.source === 'house' ? 'Starts' : 'Ends'} {formatDate(market.endDate)}
        </span>
      </div>
    </article>
  )
}

export default memo(MarketCard)
