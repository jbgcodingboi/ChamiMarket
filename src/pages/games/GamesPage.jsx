import { Link } from 'react-router-dom'
import { BalanceCard, LoginToPlay } from '../../components/games/GameShell.jsx'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { useNow } from '../../hooks/useNow.js'
import { useAccountStore } from '../../store/accountStore.js'
import { useGames } from '../../store/gameStore.js'
import { formatCurrency, formatRelativeTime, formatSignedCurrency, pnlTone } from '../../utils/format.js'

function RouletteArt() {
  return (
    <svg viewBox="-50 -50 100 100" className="size-24 transition duration-700 group-hover:rotate-90" aria-hidden="true">
      <circle r="48" fill="#5b3a1e" />
      {Array.from({ length: 37 }, (_, i) => {
        const a = ((i * 360) / 37) * (Math.PI / 180)
        const b = (((i + 1) * 360) / 37) * (Math.PI / 180)
        const p = (r, t) => `${(r * Math.sin(t)).toFixed(2)} ${(-r * Math.cos(t)).toFixed(2)}`
        return <path key={i} d={`M${p(42, a)}A42 42 0 0 1 ${p(42, b)}L${p(28, b)}A28 28 0 0 0 ${p(28, a)}Z`} fill={i === 0 ? '#138a43' : i % 2 ? '#b3202a' : '#18181b'} />
      })}
      <circle r="28" fill="#3a210e" />
      <circle r="12" fill="#c9962f" />
      <circle cx="0" cy="-35" r="3.2" fill="#fff" />
    </svg>
  )
}

function BlackjackArt() {
  return (
    <div className="relative h-24 w-28" aria-hidden="true">
      <div className="absolute top-2 left-4 flex h-20 w-14 -rotate-12 flex-col justify-between rounded-lg bg-[#fdfbf7] p-1.5 text-[#1c1917] shadow-lg transition group-hover:-rotate-[18deg]">
        <span className="text-sm leading-none font-bold">A♠</span>
        <span className="self-center text-2xl">♠</span>
      </div>
      <div className="absolute top-1 left-11 flex h-20 w-14 rotate-6 flex-col justify-between rounded-lg bg-[#fdfbf7] p-1.5 text-[#c0262d] shadow-lg transition group-hover:rotate-12">
        <span className="text-sm leading-none font-bold">K♥</span>
        <span className="self-center text-2xl">♥</span>
      </div>
    </div>
  )
}

function PlinkoArt() {
  const pins = []
  for (let r = 0; r < 5; r++) for (let j = 0; j < r + 3; j++) pins.push([50 + (j - (r + 2) / 2) * 13, 16 + r * 13])
  return (
    <svg viewBox="0 0 100 100" className="size-24" aria-hidden="true">
      {pins.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#ededf0" opacity="0.85" />
      ))}
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <rect key={k} x={50 + (k - 2.5) * 13 - 5.5} y="82" width="11" height="9" rx="2" fill={`hsl(${48 - Math.abs(k - 2.5) * 19} 88% 52%)`} />
      ))}
      <circle cx="50" cy="6" r="4" fill="#f5b82e" className="transition duration-700 group-hover:translate-y-[64px]" />
    </svg>
  )
}

const GAMES = [
  {
    to: '/games/roulette',
    id: 'roulette',
    title: 'Roulette',
    blurb: 'European single-zero wheel. Bet numbers, splits, corners, dozens or red and black.',
    facts: ['35:1 straight up', '1:1 red/black', '2.7% house edge'],
    Art: RouletteArt,
  },
  {
    to: '/games/blackjack',
    id: 'blackjack',
    title: 'Blackjack',
    blurb: 'Six-deck shoe with doubling, splitting and insurance. Beat the dealer to 21.',
    facts: ['3:2 blackjack', 'Dealer stands on soft 17', 'Insurance 2:1'],
    Art: BlackjackArt,
  },
  {
    to: '/games/plinko',
    id: 'plinko',
    title: 'Plinko',
    blurb: 'Drop balls through a pin board. Choose 8, 12 or 16 rows and low, medium or high risk.',
    facts: ['Up to 1,000×', 'Three risk levels', 'About 99% return'],
    Art: PlinkoArt,
  },
]

const GAME_NAME = { roulette: 'Roulette', blackjack: 'Blackjack', plinko: 'Plinko' }

function RecentRounds() {
  const history = useGames((g) => g.history)
  const now = useNow(30000)
  const recent = history.slice(0, 8)
  return (
    <section className="card p-4" aria-labelledby="recent-rounds">
      <h2 id="recent-rounds" className="text-sm font-semibold">
        Recent rounds
      </h2>
      {recent.length ? (
        <ul className="mt-2 divide-y divide-line text-sm">
          {recent.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{GAME_NAME[h.game] ?? h.game}</span>
                <span className="block truncate text-xs text-subtle">
                  {h.detail} · {formatRelativeTime(h.ts, now)}
                </span>
              </span>
              <span className={`shrink-0 font-semibold tabular ${pnlTone(h.net)}`}>{formatSignedCurrency(h.net)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Nothing yet. Pick a game to start.</p>
      )}
    </section>
  )
}

export default function GamesPage() {
  useDocumentTitle('Games')
  const user = useAccountStore((s) => s.user)
  const stats = useGames((g) => g.stats)
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Games</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Casino games played with your portfolio cash. Every win and loss moves your net worth and leaderboard rank, just like a trade. Play money
        only.
      </p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {GAMES.map(({ to, id, title, blurb, facts, Art }) => {
            const s = stats[id]
            return (
              <Link
                key={to}
                to={to}
                className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-line-strong focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <div className="felt flex h-36 items-center justify-center">
                  <Art />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="text-lg font-semibold">{title}</h2>
                  <p className="mt-1 flex-1 text-sm text-muted">{blurb}</p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {facts.map((f) => (
                      <li key={f} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-subtle">{s ? `${s.rounds} round${s.rounds === 1 ? '' : 's'} · ${formatCurrency(s.wagered)} wagered` : 'Not played yet'}</span>
                    <span className="font-semibold text-primary-300 group-hover:underline">Play</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
        <aside className="space-y-4" aria-label="Chips">
          {user ? (
            <>
              <BalanceCard />
              <RecentRounds />
            </>
          ) : (
            <LoginToPlay />
          )}
        </aside>
      </div>
    </div>
  )
}
