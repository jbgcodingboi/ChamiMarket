import { useLeaderboard } from '../../hooks/useLeaderboard.js'
import { useAccountStore } from '../../store/accountStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { formatCurrency, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import SimTag from './SimTag.jsx'

const medal = ['text-warn', 'text-fg/80', 'text-[#c98b5a]']

/** Global ranking by net worth across local accounts and simulated pros. */
export default function Leaderboard() {
  const rows = useLeaderboard()
  const user = useAccountStore((s) => s.user)
  const openAuth = useUiStore((s) => s.openAuth)
  const mine = user ? rows.find((r) => r.id === user.id) : null

  return (
    <div className="space-y-4">
      {mine ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-primary-400/60 p-4">
          <p className="text-sm text-muted">
            Your rank
            <span className="ml-2 text-2xl font-bold text-fg tabular">#{mine.rank}</span>
            <span className="ml-1">of {rows.length}</span>
          </p>
          <p className="text-sm text-muted">
            Net worth <span className="ml-1 font-semibold text-fg tabular">{formatCurrency(mine.netWorth)}</span>
          </p>
        </div>
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted">
          Sign up to get $100,000 in play money and see where you rank.
          <button type="button" className="btn btn-primary" onClick={() => openAuth('signup')}>
            Sign up
          </button>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Leaderboard ranked by net worth</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="w-16 px-4 py-3 font-medium">Rank</th>
              <th scope="col" className="px-2 py-3 font-medium">Trader</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Net worth</th>
              <th scope="col" className="px-2 py-3 text-right font-medium">Total PnL</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Trades</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isMe = r.id === user?.id
              return (
                <tr
                  key={r.id}
                  aria-current={isMe ? 'true' : undefined}
                  className={`border-b border-line last:border-0 ${isMe ? 'bg-primary-500/15' : 'hover:bg-surface-2'}`}
                >
                  <td className={`px-4 py-3 font-bold tabular ${medal[r.rank - 1] ?? 'text-muted'}`}>{r.rank}</td>
                  <td className="px-2 py-3">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      {isMe && <span className="rounded bg-primary-500 px-1.5 py-px text-[10px] font-bold text-white uppercase">You</span>}
                      {r.sim && <SimTag />}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right font-semibold tabular">{formatCurrency(r.netWorth)}</td>
                  <td className={`px-2 py-3 text-right tabular ${pnlTone(r.pnl)}`}>{formatSignedCurrency(r.pnl)}</td>
                  <td className="px-4 py-3 text-right text-muted tabular">{r.trades.toLocaleString('en-US')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-subtle">
        Local accounts are valued at current prices. Traders tagged <SimTag /> are simulated demo portfolios whose
        value moves with market prices plus a small random drift. Total PnL for local accounts counts the current
        run since signup or the last reset.
      </p>
    </div>
  )
}
