import { useNow } from '../../hooks/useNow.js'
import { useMarketStore } from '../../store/marketStore.js'
import { formatRelativeTime } from '../../utils/format.js'

const STATES = {
  live: { label: 'Live odds', short: 'Live', dot: 'bg-yes', text: 'text-muted' },
  stale: { label: 'Reconnecting', short: 'Reconnecting', dot: 'bg-warn', text: 'text-warn' },
  cached: { label: 'Cached odds', short: 'Cached', dot: 'bg-warn', text: 'text-warn' },
  snapshot: { label: 'Delayed odds', short: 'Delayed', dot: 'bg-warn', text: 'text-warn' },
  mock: { label: 'Offline demo data', short: 'Demo data', dot: 'bg-subtle', text: 'text-muted' },
  loading: { label: 'Connecting', short: 'Connecting', dot: 'bg-subtle animate-pulse', text: 'text-muted' },
}

export default function DataSourceIndicator({ compact = false }) {
  const source = useMarketStore((s) => s.source)
  const stale = useMarketStore((s) => s.stale)
  const lastUpdated = useMarketStore((s) => s.lastUpdated)
  const now = useNow(10000)
  const key = !source ? 'loading' : source === 'live' && stale ? 'stale' : source
  const state = STATES[key]
  const title =
    key === 'mock'
      ? 'Live market data is unreachable, so bundled demo markets are shown. Trading works the same.'
      : key === 'snapshot'
        ? `This browser can't reach the live API, so odds come from the site's scheduled update (${formatRelativeTime(lastUpdated, now)}).`
        : lastUpdated
          ? `Prices updated ${formatRelativeTime(lastUpdated, now)}`
        : 'Fetching live market data'
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${state.text}`}
      title={title}
      role="status"
      aria-label={state.label}
    >
      <span className={`size-1.5 rounded-full ${state.dot}`} aria-hidden="true" />
      {compact ? state.short : state.label}
    </span>
  )
}
