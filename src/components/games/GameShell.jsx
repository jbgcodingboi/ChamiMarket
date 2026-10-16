import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { flashClass, usePriceFlash } from '../../hooks/usePriceFlash.js'
import { useNow } from '../../hooks/useNow.js'
import { useAccountStore } from '../../store/accountStore.js'
import { flush, runGames, useChips, useGames } from '../../store/gameStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { formatCurrency, formatRelativeTime, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import EmptyState from '../ui/EmptyState.jsx'
import GameFeed from './GameFeed.jsx'
import { ChevronLeftIcon, DiceIcon } from '../ui/Icons.jsx'

/** Cash available to bet, which is the same cash the portfolio trades with. */
export function BalanceCard() {
  const cash = useChips()
  const user = useAccountStore((s) => s.user)
  const runNet = useAccountStore((s) => runGames(s.portfolio).net)
  const flash = usePriceFlash(cash)
  if (!user) return null
  return (
    <section className="card p-4" aria-labelledby="chips-heading">
      <h2 id="chips-heading" className="text-sm text-muted">
        Available funds
      </h2>
      <p className={`mt-1 rounded-md text-3xl font-bold tabular ${flashClass(flash)}`} aria-live="polite">
        {formatCurrency(cash)}
      </p>
      <p className="mt-1 text-xs text-subtle">Your portfolio cash. Wins and losses here count toward your net worth and leaderboard rank.</p>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
        <span className="text-muted">Games this run</span>
        <span className={`font-semibold tabular ${pnlTone(runNet)}`}>{formatSignedCurrency(runNet)}</span>
      </div>
      <Link to="/portfolio" className="btn btn-ghost mt-3 w-full">
        View portfolio
      </Link>
    </section>
  )
}

/** Shown to guests in place of a game: betting uses portfolio cash, which needs an account. */
export function LoginToPlay() {
  const openAuth = useUiStore((s) => s.openAuth)
  return (
    <EmptyState
      icon={DiceIcon}
      title="Log in to play"
      action={
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => openAuth('login', 'Log in to play with your portfolio cash')}>
            Log in
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openAuth('signup')}>
            Sign up free
          </button>
        </div>
      }
    >
      Games bet with your play-money portfolio cash, the same balance you trade with. New accounts start with $100,000.00.
    </EmptyState>
  )
}

function GameStats({ game }) {
  const stats = useGames((g) => g.stats[game])
  const history = useGames((g) => g.history)
  const now = useNow(30000)
  const recent = history.filter((h) => h.game === game).slice(0, 10)
  return (
    <section className="card p-4" aria-labelledby={`${game}-history`}>
      <h2 id={`${game}-history`} className="text-sm font-semibold">
        Your results
      </h2>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 p-2">
          <dt className="text-[11px] text-muted">Rounds</dt>
          <dd className="font-semibold tabular">{stats?.rounds ?? 0}</dd>
        </div>
        <div className="rounded-lg bg-surface-2 p-2">
          <dt className="text-[11px] text-muted">Wagered</dt>
          <dd className="font-semibold tabular">{formatCurrency(stats?.wagered ?? 0).replace('.00', '')}</dd>
        </div>
        <div className="rounded-lg bg-surface-2 p-2">
          <dt className="text-[11px] text-muted">Net</dt>
          <dd className={`font-semibold tabular ${pnlTone(stats?.net ?? 0)}`}>{formatSignedCurrency(stats?.net ?? 0).replace('.00', '')}</dd>
        </div>
      </dl>
      {recent.length ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {recent.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate">{h.detail}</span>
                <span className="text-xs text-subtle">
                  Bet {formatCurrency(h.staked)} · {formatRelativeTime(h.ts, now)}
                </span>
              </span>
              <span className={`shrink-0 font-semibold tabular ${pnlTone(h.net)}`}>{formatSignedCurrency(h.net)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No rounds yet. Results show up here.</p>
      )}
    </section>
  )
}

/** Layout for a game page: title, the game, and a side column with funds and history. */
export default function GameShell({ game, title, subtitle, children, rules }) {
  const user = useAccountStore((s) => s.user)
  // Pays out anything still animating when the player leaves the page.
  useEffect(() => () => flush(game), [game])
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link to="/games" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeftIcon /> All games
      </Link>
      <div className="mt-3">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      {user ? (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            {children}
            {rules && (
              <details className="card p-4 text-sm text-muted">
                <summary className="cursor-pointer font-semibold text-fg">Rules and payouts</summary>
                <div className="mt-3 space-y-2 leading-relaxed">{rules}</div>
              </details>
            )}
          </div>
          <aside className="space-y-4" aria-label="Funds and history">
            <BalanceCard />
            <GameStats game={game} />
            <GameFeed />
          </aside>
        </div>
      ) : (
        <div className="mx-auto mt-8 max-w-xl">
          <LoginToPlay />
        </div>
      )}
    </div>
  )
}
