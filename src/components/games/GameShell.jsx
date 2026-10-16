import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { flashClass, usePriceFlash } from '../../hooks/usePriceFlash.js'
import { useNow } from '../../hooks/useNow.js'
import { REFILL_BELOW, STARTING_CHIPS, useGameStore } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { formatCurrency, formatRelativeTime, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import { ChevronLeftIcon } from '../ui/Icons.jsx'
import { useWalletSync } from './useWalletSync.js'

export function BalanceCard() {
  const wallet = useGameStore((s) => s.wallet)
  const refill = useGameStore((s) => s.refill)
  const flash = usePriceFlash(wallet.balance)
  return (
    <section className="card p-4" aria-labelledby="chips-heading">
      <h2 id="chips-heading" className="text-sm text-muted">
        Chip balance
      </h2>
      <p className={`mt-1 rounded-md text-3xl font-bold tabular ${flashClass(flash)}`} aria-live="polite">
        {formatCurrency(wallet.balance)}
      </p>
      <p className="mt-1 text-xs text-subtle">Play money for Games only, separate from your trading cash.</p>
      <button
        type="button"
        className="btn btn-ghost mt-3 w-full"
        disabled={wallet.balance >= REFILL_BELOW}
        onClick={() => refill() && toast({ tone: 'success', title: 'Chips refilled', description: `Your balance is back to ${formatCurrency(STARTING_CHIPS)}.` })}
        title={wallet.balance >= REFILL_BELOW ? `Refill unlocks below ${formatCurrency(REFILL_BELOW)}` : undefined}
      >
        Refill to {formatCurrency(STARTING_CHIPS)}
      </button>
      {wallet.refills > 0 && <p className="mt-2 text-center text-xs text-subtle">Refills used: {wallet.refills}</p>}
    </section>
  )
}

function GameStats({ game }) {
  const stats = useGameStore((s) => s.wallet.stats[game])
  const history = useGameStore((s) => s.wallet.history)
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

/** Layout for a game page: title, the game, and a side column with balance and history. */
export default function GameShell({ game, title, subtitle, children, rules }) {
  useWalletSync()
  // Pays out anything still animating when the player leaves the page.
  useEffect(() => () => useGameStore.getState().flush(game), [game])
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link to="/games" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeftIcon /> All games
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
      </div>
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
        <aside className="space-y-4" aria-label="Chips and history">
          <BalanceCard />
          <GameStats game={game} />
        </aside>
      </div>
    </div>
  )
}
