import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { GAME_NAME } from '../../games/names.js'
import { useNow } from '../../hooks/useNow.js'
import { BACKEND_ENABLED } from '../../services/backend/config.js'
import { useFeedStore } from '../../store/feedStore.js'
import { formatCurrency, formatRelativeTime } from '../../utils/format.js'

function GameLine({ entry, now }) {
  const won = entry.net > 0
  return (
    <li className="animate-feed-in py-2 text-sm">
      <p className="leading-snug">
        <span className="font-semibold">{entry.user}</span>{' '}
        <span className="text-muted">{won ? 'won' : entry.net < 0 ? 'lost' : 'broke even'}</span>{' '}
        {entry.net !== 0 && <span className={`font-semibold tabular ${won ? 'text-yes' : 'text-no'}`}>{formatCurrency(Math.abs(entry.net))}</span>}{' '}
        <span className="text-muted">at</span>{' '}
        <Link to={`/games/${entry.game}`} className="text-primary-300 hover:underline">
          {GAME_NAME[entry.game] ?? entry.game}
        </Link>
      </p>
      <p className="mt-0.5 truncate text-xs text-subtle">
        {entry.detail ? `${entry.detail} · ` : ''}
        {formatRelativeTime(entry.ts, now)}
      </p>
    </li>
  )
}

/** Real game results from every player (never simulated ones), newest first. Backend mode only, since local mode has no other players. */
export default function GameFeed() {
  const games = useFeedStore((s) => s.games)
  const now = useNow(15000)
  // New rounds arrive over realtime; this catches up if that connection drops.
  useEffect(() => {
    if (!BACKEND_ENABLED) return undefined
    const t = setInterval(() => document.visibilityState === 'visible' && useFeedStore.getState().refresh(), 20000)
    return () => clearInterval(t)
  }, [])
  if (!BACKEND_ENABLED) return null
  return (
    <section className="card p-4" aria-labelledby="game-feed">
      <h2 id="game-feed" className="text-sm font-semibold">
        Live games
      </h2>
      {games.length ? (
        <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto scrollbar-thin" aria-live="off">
          {games.slice(0, 20).map((e) => (
            <GameLine key={e.id} entry={e} now={now} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">No rounds yet. Results from every player show up here as they happen.</p>
      )}
    </section>
  )
}
