import { useMemo, useState } from 'react'
import { ChipSelector } from '../../components/games/Chip.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import RouletteTable from '../../components/games/roulette/RouletteTable.jsx'
import RouletteWheel from '../../components/games/roulette/RouletteWheel.jsx'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { colorOf, ODDS, spin, totalReturn } from '../../games/roulette.js'
import { useGameStore } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { readJSON, writeJSON } from '../../utils/storage.js'
import { formatCurrency, formatSignedCurrency } from '../../utils/format.js'

const RECENT_KEY = 'games:roulette:recent'
const isRecent = (v) => Array.isArray(v) && v.every((n) => Number.isInteger(n) && n >= 0 && n <= 36)
const DOT = { red: 'bg-[#b3202a]', black: 'bg-[#18181b] ring-1 ring-white/20', green: 'bg-[#138a43]' }
const colorName = (n) => ({ red: 'Red', black: 'Black', green: 'Green' })[colorOf(n)]

/** Groups a list of chip placements into one bet per spot. */
function combine(stack) {
  const bets = {}
  for (const { bet, amount } of stack) {
    const prev = bets[bet.key]
    bets[bet.key] = { ...bet, amount: roundMoney((prev?.amount ?? 0) + amount) }
  }
  return bets
}

const PAYOUTS = [
  ['Straight up (one number)', ODDS.straight],
  ['Split (two numbers)', ODDS.split],
  ['Street (three in a row)', ODDS.street],
  ['Corner (four numbers)', ODDS.corner],
  ['Six line (two streets)', ODDS.sixline],
  ['Dozen or column', ODDS.dozen],
  ['Red/Black, Odd/Even, 1-18/19-36', ODDS.red],
]

function Rules() {
  return (
    <>
      <p>
        European roulette: a single zero and 37 pockets, so every number has a 1 in 37 chance. Place chips, then spin. A winning bet returns your stake
        plus the odds below. Even-money bets lose on zero. The house edge is 2.7% on every bet.
      </p>
      <p>
        Click a number for a straight bet. Click the line between two numbers for a split, the corner where four meet for a corner bet, the bottom edge of
        a column for a street, and the bottom corner between two columns for a six line.
      </p>
      <table className="w-full text-left">
        <tbody>
          {PAYOUTS.map(([label, odds]) => (
            <tr key={label} className="border-t border-line">
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-right font-semibold text-fg tabular">{odds}:1</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export default function RoulettePage() {
  useDocumentTitle('Roulette')
  const balance = useGameStore((s) => s.wallet.balance)
  const place = useGameStore((s) => s.place)
  const finish = useGameStore((s) => s.finish)
  const [chip, setChip] = useState(25)
  const [stack, setStack] = useState([])
  const [lastStack, setLastStack] = useState([])
  const [round, setRound] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [recent, setRecent] = useState(() => readJSON(RECENT_KEY, isRecent, []))

  const bets = useMemo(() => combine(stack), [stack])
  const total = roundMoney(stack.reduce((a, s) => a + s.amount, 0))
  const spinning = Boolean(round && !round.done)
  const room = roundMoney(balance - total)

  const placeChip = (bet) => {
    if (spinning) return
    if (chip > room) {
      toast({ tone: 'error', title: 'Not enough chips', description: `You have ${formatCurrency(room)} left to bet.` })
      return
    }
    setOutcome(null)
    setStack((s) => [...s, { bet, amount: chip }])
  }

  const rebet = () => {
    const sum = lastStack.reduce((a, s) => a + s.amount, 0)
    if (sum > balance) return toast({ tone: 'error', title: 'Not enough chips to rebet' })
    setOutcome(null)
    setStack(lastStack)
  }

  const doubleUp = () => {
    if (total * 2 > balance) return toast({ tone: 'error', title: 'Not enough chips to double' })
    setStack((s) => [...s, ...s])
  }

  const startSpin = () => {
    if (!total || spinning) return
    const result = spin()
    const list = Object.values(bets)
    const returned = roundMoney(totalReturn(list, result))
    const id = place({
      game: 'roulette',
      staked: total,
      returned,
      detail: `${result} ${colorName(result)} · ${list.length} bet${list.length === 1 ? '' : 's'}`,
    })
    if (!id) return toast({ tone: 'error', title: 'Not enough chips' })
    setOutcome(null)
    setRound({ key: (round?.key ?? 0) + 1, result, id, staked: total, returned, done: false })
  }

  const onSpinDone = () => {
    if (!round || round.done) return
    finish(round.id)
    const next = [round.result, ...recent].slice(0, 14)
    setRecent(next)
    writeJSON(RECENT_KEY, next)
    setOutcome({ result: round.result, staked: round.staked, returned: round.returned })
    setRound({ ...round, done: true })
    setLastStack(stack)
    setStack([])
  }

  const net = outcome ? roundMoney(outcome.returned - outcome.staked) : 0

  return (
    <GameShell game="roulette" title="Roulette" subtitle="European single-zero wheel. 35:1 straight up, 1:1 on red or black." rules={<Rules />}>
      <section className="card overflow-hidden" aria-label="Wheel">
        <div className="grid items-center gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
          <RouletteWheel result={round?.result ?? null} spinKey={round?.key ?? 0} onDone={onSpinDone} />
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-2 p-4 text-center" aria-live="polite">
              {spinning ? (
                <p className="py-3 text-sm text-muted">No more bets. Spinning…</p>
              ) : outcome ? (
                <>
                  <span className={`mx-auto flex size-14 items-center justify-center rounded-full text-2xl font-bold text-white ${DOT[colorOf(outcome.result)]}`}>
                    {outcome.result}
                  </span>
                  <p className="mt-2 text-sm font-semibold">
                    {outcome.result} {colorName(outcome.result)}
                  </p>
                  <p className={`mt-1 text-lg font-bold tabular ${net > 0 ? 'text-yes' : net < 0 ? 'text-no' : 'text-muted'}`}>
                    {outcome.returned > 0 ? `Won ${formatCurrency(outcome.returned)}` : 'No win'}
                  </p>
                  <p className="text-xs text-subtle">Net {formatSignedCurrency(net)}</p>
                </>
              ) : (
                <p className="py-3 text-sm text-muted">Place your chips on the table, then spin.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Last numbers</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recent.length ? (
                  recent.map((n, i) => (
                    <span key={`${i}-${n}`} className={`flex size-7 items-center justify-center rounded-full text-xs font-bold text-white ${DOT[colorOf(n)]} ${i === 0 ? 'animate-chip-pop' : ''}`}>
                      {n}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-subtle">None yet</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-4" aria-label="Betting table">
        <RouletteTable bets={bets} onPlace={placeChip} disabled={spinning} winning={outcome?.result ?? null} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ChipSelector value={chip} onChange={setChip} />
          <div className="text-right">
            <p className="text-xs text-muted">Total bet</p>
            <p className="text-xl font-bold tabular">{formatCurrency(total)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" disabled={spinning || !stack.length} onClick={() => setStack((s) => s.slice(0, -1))}>
            Undo
          </button>
          <button type="button" className="btn btn-ghost" disabled={spinning || !stack.length} onClick={() => setStack([])}>
            Clear
          </button>
          <button type="button" className="btn btn-ghost" disabled={spinning || !stack.length} onClick={doubleUp}>
            Double
          </button>
          <button type="button" className="btn btn-ghost" disabled={spinning || stack.length > 0 || !lastStack.length} onClick={rebet}>
            Rebet
          </button>
          <button type="button" className="btn btn-primary ml-auto min-w-32 px-6" disabled={spinning || !total} onClick={startSpin}>
            {spinning ? 'Spinning…' : 'Spin'}
          </button>
        </div>
      </section>
    </GameShell>
  )
}
