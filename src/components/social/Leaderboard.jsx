import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLeaderboard } from '../../hooks/useLeaderboard.js'
import { BACKEND_ENABLED } from '../../services/backend/config.js'
import { useAccountStore } from '../../store/accountStore.js'
import { useUiStore } from '../../store/uiStore.js'
import { formatCurrency, formatPercent, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import Tabs from '../ui/Tabs.jsx'
import SimTag from './SimTag.jsx'
import { GAME_NAME } from '../../games/names.js'

const medal = ['text-warn', 'text-fg/80', 'text-[#c98b5a]']
const DASH = <span className="text-subtle">—</span>

const signed = (v) => (v === null || v === undefined ? DASH : <span className={pnlTone(v)}>{formatSignedCurrency(v)}</span>)
const count = (v) => v.toLocaleString('en-US')

/**
 * The three boards. Each ranks by its `score` (ties broken by net worth) and
 * shows its own columns; the first column is the one it ranks by.
 */
const BOARDS = {
  overall: {
    label: 'Overall',
    caption: 'Ranked by net worth: cash plus open positions, counting everything won or lost in markets and games this run.',
    score: (r) => r.netWorth,
    yours: (r) => formatCurrency(r.netWorth),
    yoursLabel: 'Net worth',
    columns: [
      { label: 'Net worth', cell: (r) => formatCurrency(r.netWorth) },
      {
        label: 'Total PnL',
        cell: (r) => (
          <span className={pnlTone(r.pnl)}>
            {formatSignedCurrency(r.pnl)} <span className="text-xs opacity-75">({formatPercent(r.pnlPct, { signed: true, decimals: 1 })})</span>
          </span>
        ),
      },
      { label: 'From markets', cell: (r) => signed(r.marketPnl) },
      { label: 'From games', cell: (r) => (r.games.rounds ? signed(r.games.net) : DASH) },
    ],
  },
  markets: {
    label: 'Markets',
    caption: 'Ranked by trading profit this run: sells, settlements and open positions at current prices, leaving out games.',
    score: (r) => r.marketPnl,
    yours: (r) => formatSignedCurrency(r.marketPnl),
    yoursLabel: 'Markets PnL',
    columns: [
      { label: 'Markets PnL', cell: (r) => signed(r.marketPnl) },
      { label: 'Realized', cell: (r) => signed(r.realized) },
      { label: 'Unrealized', cell: (r) => signed(r.unrealized) },
      { label: 'Win rate', cell: (r) => (r.winRate === null ? DASH : `${r.winRate.toFixed(0)}%`) },
      { label: 'Trades', cell: (r) => count(r.trades), muted: true },
    ],
  },
  games: {
    label: 'Games',
    caption: 'Ranked by net winnings from games this run. Only players with at least one round are listed.',
    score: (r) => r.games.net,
    include: (r) => r.games.rounds > 0,
    yours: (r) => formatSignedCurrency(r.games.net),
    yoursLabel: 'Games net',
    columns: [
      { label: 'Games net', cell: (r) => signed(r.games.net) },
      { label: 'Rounds', cell: (r) => count(r.games.rounds), muted: true },
      { label: 'Wagered', cell: (r) => formatCurrency(r.games.wagered) },
      { label: 'Biggest win', cell: (r) => (r.games.best > 0 ? <span className="text-yes">{formatSignedCurrency(r.games.best)}</span> : DASH) },
      { label: 'Favorite', cell: (r) => (r.games.favorite ? GAME_NAME[r.games.favorite] : DASH), muted: true, left: true },
    ],
  },
}

const TABS = Object.entries(BOARDS).map(([id, b]) => ({ id, label: b.label }))

/** Leaderboards for net worth, market trading and games across local accounts and simulated pros. */
export default function Leaderboard() {
  const all = useLeaderboard()
  const user = useAccountStore((s) => s.user)
  const openAuth = useUiStore((s) => s.openAuth)
  const [params, setParams] = useSearchParams()
  const boardId = Object.hasOwn(BOARDS, params.get('board') ?? '') ? params.get('board') : 'overall'
  const board = BOARDS[boardId]

  const rows = useMemo(
    () =>
      all
        .filter(board.include ?? (() => true))
        .sort((a, b) => board.score(b) - board.score(a) || b.netWorth - a.netWorth)
        .map((r, i) => ({ ...r, rank: i + 1 })),
    [all, board],
  )
  const mine = user ? rows.find((r) => r.id === user.id) : null
  const selectBoard = (id) => setParams(id === 'overall' ? {} : { board: id }, { replace: true })

  return (
    <div className="space-y-4">
      <Tabs tabs={TABS} value={boardId} onChange={selectBoard} label="Leaderboards" />
      <p className="text-sm text-muted">{board.caption}</p>

      {mine ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-primary-400/60 p-4">
          <p className="text-sm text-muted">
            Your {board.label.toLowerCase()} rank
            <span className="ml-2 text-2xl font-bold text-fg tabular">#{mine.rank}</span>
            <span className="ml-1">of {rows.length}</span>
          </p>
          <p className="text-sm text-muted">
            {board.yoursLabel} <span className={`ml-1 font-semibold tabular ${boardId === 'overall' ? 'text-fg' : pnlTone(board.score(mine))}`}>{board.yours(mine)}</span>
          </p>
        </div>
      ) : user && boardId === 'games' ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted">
          Play a round of any game to join the Games board.
          <Link to="/games" className="btn btn-primary">
            Go to Games
          </Link>
        </div>
      ) : !user ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted">
          Sign up to get $100,000 in play money and see where you rank.
          <button type="button" className="btn btn-primary" onClick={() => openAuth('signup')}>
            Sign up
          </button>
        </div>
      ) : null}

      <div className="card overflow-x-auto" role="tabpanel" aria-label={`${board.label} leaderboard`}>
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">
            {board.label} leaderboard. {board.caption}
          </caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="w-16 px-4 py-3 font-medium">
                Rank
              </th>
              <th scope="col" className="px-2 py-3 font-medium">
                Trader
              </th>
              {board.columns.map((c, i) => (
                <th
                  key={c.label}
                  scope="col"
                  className={`py-3 font-medium ${c.left ? 'text-left' : 'text-right'} ${i === board.columns.length - 1 ? 'px-4' : 'px-2'} ${i === 0 ? 'text-fg' : ''}`}
                >
                  {c.label}
                </th>
              ))}
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
                  {board.columns.map((c, i) => (
                    <td
                      key={c.label}
                      className={`py-3 tabular ${c.left ? 'text-left' : 'text-right'} ${i === board.columns.length - 1 ? 'px-4' : 'px-2'} ${i === 0 ? 'font-semibold' : ''} ${c.muted ? 'text-muted' : ''}`}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              )
            })}
            {!rows.length && (
              <tr>
                <td colSpan={board.columns.length + 2} className="px-4 py-10 text-center text-muted">
                  Nobody has played yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-subtle">
        {BACKEND_ENABLED ? (
          <>
            Every player is valued at current prices, and every figure counts the current run since sign-up or the last reset. Trades, games and payouts are
            all checked on the server. Traders tagged <SimTag /> are simulated filler while the site is new, and one drops off for every real player who joins.
          </>
        ) : (
          <>
            Local accounts are valued at current prices, and every figure counts the current run since signup or the last
            reset. Traders tagged <SimTag /> are simulated demo players: their portfolios move with market prices plus a
            small random drift, and their game results are generated.
          </>
        )}
      </p>
    </div>
  )
}
