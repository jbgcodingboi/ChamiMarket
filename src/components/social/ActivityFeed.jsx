import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useNow } from '../../hooks/useNow.js'
import { useUiStore } from '../../store/uiStore.js'
import { BACKEND_ENABLED } from '../../services/backend/config.js'
import { formatCurrency, formatPrice, formatRelativeTime, formatSharesShort } from '../../utils/format.js'
import { ActivityIcon, PanelIcon } from '../ui/Icons.jsx'
import SimTag from './SimTag.jsx'
import { useFeedEntries } from './useFeedEntries.js'
import { GAME_NAME } from '../../games/names.js'


function GameLine({ entry }) {
  const won = entry.net > 0
  return (
    <p className="leading-snug">
      <span className="font-semibold">{entry.user}</span>{' '}
      <span className="text-muted">{won ? 'won' : entry.net < 0 ? 'lost' : 'broke even'}</span>{' '}
      {entry.net !== 0 && <span className={`font-semibold tabular ${won ? 'text-yes' : 'text-no'}`}>{formatCurrency(Math.abs(entry.net))}</span>}{' '}
      <span className="text-muted">at</span>{' '}
      <Link to={`/games/${entry.game}`} className="text-primary-300 hover:underline">
        {GAME_NAME[entry.game] ?? entry.game}
      </Link>
      {entry.detail && <span className="text-muted"> ({entry.detail})</span>}
    </p>
  )
}

const FeedItem = memo(function FeedItem({ entry, now }) {
  const yes = entry.side === 'yes'
  if (entry.action === 'game') {
    return (
      <li className="animate-feed-in border-b border-line px-4 py-3 text-sm last:border-0">
        <GameLine entry={entry} />
        <p className="mt-1 text-xs text-subtle">{formatRelativeTime(entry.ts, now)}</p>
      </li>
    )
  }
  return (
    <li className="animate-feed-in border-b border-line px-4 py-3 text-sm last:border-0">
      <p className="leading-snug">
        <span className="font-semibold">{entry.user}</span>{' '}
        <span className="text-muted">{entry.action === 'buy' ? 'bought' : 'sold'}</span>{' '}
        <span className="tabular">{formatSharesShort(entry.shares)}</span> shares of{' '}
        <span className={`font-semibold ${yes ? 'text-yes' : 'text-no'}`}>{entry.sideLabel ?? (yes ? 'Yes' : 'No')}</span>{' '}
        <span className="text-muted">at</span> <span className="tabular">{formatPrice(entry.price)}</span>{' '}
        <span className="text-muted">on</span>{' '}
        <Link to={`/market/${encodeURIComponent(entry.marketId)}`} className="text-primary-300 hover:underline">
          {entry.marketTitle}
        </Link>
      </p>
      <p className="mt-1 flex items-center gap-2 text-xs text-subtle">
        {formatRelativeTime(entry.ts, now)}
        {entry.sim && <SimTag />}
      </p>
    </li>
  )
})

/** Desktop sidebar of recent paper trades across the platform. */
export default function ActivityFeed() {
  const entries = useFeedEntries(25)
  const collapsed = useUiStore((s) => s.feedCollapsed)
  const toggle = useUiStore((s) => s.toggleFeed)
  const now = useNow(15000)

  return (
    <section className="card overflow-hidden" aria-labelledby="feed-heading">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id="feed-heading" className="flex items-center gap-2 text-sm font-semibold">
          <ActivityIcon className="size-4 text-primary-300" /> Live activity
        </h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="feed-list"
          className="rounded-md p-1 text-muted hover:bg-surface-3 hover:text-fg"
          aria-label={collapsed ? 'Expand activity feed' : 'Collapse activity feed'}
        >
          <PanelIcon />
        </button>
      </div>
      {!collapsed && (
        <>
          {entries.length ? (
            <ul id="feed-list" className="max-h-[calc(100vh-14rem)] overflow-y-auto scrollbar-thin" aria-live="off">
              {entries.map((e) => (
                <FeedItem key={e.id} entry={e} now={now} />
              ))}
            </ul>
          ) : (
            <p id="feed-list" className="px-4 py-8 text-center text-sm text-muted">
              Waiting for the first trades…
            </p>
          )}
          <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-subtle">
            {BACKEND_ENABLED ? (
              'Paper trades and game results from every player, live.'
            ) : (
              <>
                Entries tagged <SimTag /> are simulated by demo traders. Others are paper trades made on this device.
              </>
            )}
          </p>
        </>
      )}
    </section>
  )
}
