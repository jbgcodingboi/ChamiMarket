import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDateTime, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import EmptyState from '../ui/EmptyState.jsx'
import { DiceIcon } from '../ui/Icons.jsx'
import { GAME_NAME } from '../../games/names.js'

const PAGE = 50

/** Rounds played in Games, paid from and into the portfolio's cash. */
export default function GameHistory({ history }) {
  const [limit, setLimit] = useState(PAGE)
  if (!history.length) {
    return (
      <EmptyState
        icon={DiceIcon}
        title="No game rounds yet"
        action={
          <Link to="/games" className="btn btn-primary">
            Go to Games
          </Link>
        }
      >
        Roulette, Blackjack and Plinko bet with your portfolio cash. Every round you play is listed here.
      </EmptyState>
    )
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Game rounds</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="px-4 py-3 font-medium">Time</th>
            <th scope="col" className="px-2 py-3 font-medium">Game</th>
            <th scope="col" className="px-2 py-3 font-medium">Result</th>
            <th scope="col" className="px-2 py-3 text-right font-medium">Bet</th>
            <th scope="col" className="px-2 py-3 text-right font-medium">Paid out</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Net</th>
          </tr>
        </thead>
        <tbody>
          {history.slice(0, limit).map((h) => (
            <tr key={h.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDateTime(h.ts)}</td>
              <td className="px-2 py-3 font-medium">
                <Link to={`/games/${h.game}`} className="hover:underline">
                  {GAME_NAME[h.game] ?? h.game}
                </Link>
              </td>
              <td className="px-2 py-3 text-muted">{h.detail}</td>
              <td className="px-2 py-3 text-right tabular">{formatCurrency(h.staked)}</td>
              <td className="px-2 py-3 text-right tabular">{formatCurrency(h.returned)}</td>
              <td className={`px-4 py-3 text-right font-semibold tabular ${pnlTone(h.net)}`}>{formatSignedCurrency(h.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {history.length > limit && (
        <div className="border-t border-line p-3 text-center">
          <button type="button" className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Show more
          </button>
        </div>
      )}
    </div>
  )
}
