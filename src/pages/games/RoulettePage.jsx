import { useEffect, useMemo, useRef, useState } from 'react'
import { ChipBurst, ChipSelector } from '../../components/games/Chip.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import RouletteTable from '../../components/games/roulette/RouletteTable.jsx'
import RouletteWheel from '../../components/games/roulette/RouletteWheel.jsx'
import { kbdClass, useHotkeys } from '../../components/games/roulette/useHotkeys.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { colorOf, ODDS, spin, totalReturn } from '../../games/roulette.js'
import { rouletteSounds } from '../../games/sounds/roulette.js'
import { playRoulette } from '../../services/backend/api.js'
import { BACKEND_ENABLED } from '../../services/backend/config.js'
import { finish, holdServerPortfolio, place, useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { readJSON, writeJSON } from '../../utils/storage.js'
import { formatCurrency, formatSignedCurrency } from '../../utils/format.js'
import './roulette.css'

const RECENT_KEY = 'games:roulette:recent'
const QUICK_KEY = 'games:roulette:quick'
const HISTORY = 20
const CHIPS = [1, 5, 25, 100, 500, 1000]
const isRecent = (v) => Array.isArray(v) && v.every((n) => Number.isInteger(n) && n >= 0 && n <= 36)
const DOT = { red: 'bg-[#b3202a]', black: 'bg-[#18181b] ring-1 ring-white/25', green: 'bg-[#138a43]' }
const colorName = (n) => ({ red: 'Red', black: 'Black', green: 'Green' })[colorOf(n)]
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Groups a list of chip placements into one bet per spot. */
function combine(stack) {
  const bets = {}
  for (const { bet, amount } of stack) {
    const prev = bets[bet.key]
    bets[bet.key] = { ...bet, amount: roundMoney((prev?.amount ?? 0) + amount) }
  }
  return bets
}

/** Short description of a number: "17 Black · Odd · 1-18". */
function describe(n) {
  if (n === 0) return 'Zero'
  return `${colorName(n)} · ${n % 2 ? 'Odd' : 'Even'} · ${n <= 18 ? '1-18' : '19-36'}`
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
      <p>
        Keyboard: <kbd>Space</kbd> spins, <kbd>Backspace</kbd> takes back the last chip, <kbd>D</kbd> doubles, <kbd>R</kbd> repeats the last bets and{' '}
        <kbd>1</kbd>-<kbd>6</kbd> pick a chip.
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

/** The result card next to the wheel. */
function Result({ spinning, outcome }) {
  if (spinning)
    return (
      <div className="flex min-h-24 flex-col items-center justify-center rounded-xl bg-surface-2 p-4 text-center sm:min-h-36">
        <p className="text-xs font-semibold tracking-[0.2em] text-warn uppercase">No more bets</p>
        <p className="rt-dots mt-1 text-sm text-muted">Ball in play</p>
      </div>
    )
  if (!outcome)
    return (
      <div className="flex min-h-24 flex-col items-center justify-center rounded-xl bg-surface-2 p-4 text-center sm:min-h-36">
        <p className="text-sm text-muted">Place your chips on the table, then spin.</p>
      </div>
    )
  const net = roundMoney(outcome.returned - outcome.staked)
  return (
    <div className={`flex min-h-24 items-center gap-4 rounded-xl bg-surface-2 p-4 animate-scale-in sm:min-h-36 sm:flex-col sm:gap-2 sm:text-center ${net > 0 ? 'rt-result-win' : ''}`}>
      <span className={`flex size-14 shrink-0 items-center justify-center rounded-full text-2xl font-extrabold text-white tabular shadow-lg ${DOT[colorOf(outcome.result)]}`}>
        {outcome.result}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{describe(outcome.result)}</p>
        {net > 0 ? (
          <p className="text-2xl font-extrabold text-yes tabular">+{formatCurrency(net)}</p>
        ) : outcome.returned > 0 ? (
          <p className="text-lg font-bold text-fg tabular">{formatCurrency(outcome.returned)} back</p>
        ) : (
          <p className="text-lg font-bold text-no">No win</p>
        )}
        <p className="text-xs text-subtle tabular">
          Bet {formatCurrency(outcome.staked)}
          {net <= 0 && ` · Net ${formatSignedCurrency(net)}`}
          {net > 0 && ` · Paid ${formatCurrency(outcome.returned)}`}
        </p>
      </div>
    </div>
  )
}

/** The last numbers, newest first, with a red/black/zero split. */
function History({ recent, spinCount }) {
  const counts = recent.reduce((acc, n) => ({ ...acc, [colorOf(n)]: acc[colorOf(n)] + 1 }), { red: 0, black: 0, green: 0 })
  const total = recent.length || 1
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted">Last numbers</p>
        {recent.length > 0 && (
          <p className="text-[11px] text-subtle tabular">
            <span className="text-[#f26d75]">{counts.red} red</span> · {counts.black} black · <span className="text-yes">{counts.green} zero</span>
          </p>
        )}
      </div>
      {recent.length > 0 && (
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
          <span className="bg-[#b3202a] transition-[width] duration-500" style={{ width: `${(counts.red / total) * 100}%` }} />
          <span className="bg-[#3a3a42] transition-[width] duration-500" style={{ width: `${(counts.black / total) * 100}%` }} />
          <span className="bg-[#138a43] transition-[width] duration-500" style={{ width: `${(counts.green / total) * 100}%` }} />
        </div>
      )}
      <ol className="mt-2 flex flex-wrap gap-1.5" aria-label="Last numbers, newest first">
        {recent.length ? (
          recent.map((n, i) => (
            <li
              key={`${spinCount - i}`}
              className={`flex size-7 items-center justify-center rounded-full text-xs font-bold text-white tabular ${DOT[colorOf(n)]} ${
                i === 0 ? 'rt-history-new size-8 text-sm ring-2 ring-warn' : ''
              }`}
            >
              {n}
            </li>
          ))
        ) : (
          <li className="text-xs text-subtle">None yet</li>
        )}
      </ol>
    </div>
  )
}

export default function RoulettePage() {
  useDocumentTitle('Roulette')
  const balance = useChips()
  const [chip, setChip] = useState(25)
  const [stack, setStack] = useState([])
  const [lastStack, setLastStack] = useState([])
  const [round, setRound] = useState(null)
  const [outcome, setOutcome] = useState(null)
  // After a spin the table keeps the bets that were played (winners lit, losers faded) until the next chip goes down.
  const [settledBets, setSettledBets] = useState(null)
  const [recent, setRecent] = useState(() => readJSON(RECENT_KEY, isRecent, []))
  const [spinCount, setSpinCount] = useState(0)
  const [asking, setAsking] = useState(false)
  const [quick, setQuick] = useState(() => readJSON(QUICK_KEY, (v) => typeof v === 'boolean', false))
  const [burst, setBurst] = useState(null)
  const wheelBox = useRef(null)

  const bets = useMemo(() => combine(stack), [stack])
  const total = roundMoney(stack.reduce((a, s) => a + s.amount, 0))
  const spinning = Boolean(round && !round.done)
  const locked = spinning || asking
  const room = roundMoney(balance - total)
  const showSettled = !stack.length && settledBets !== null && !locked

  const placeChip = (bet) => {
    if (locked) return
    if (chip > room) {
      toast({ tone: 'error', title: 'Not enough chips', description: `You have ${formatCurrency(room)} left to bet.` })
      return
    }
    rouletteSounds.chip()
    setSettledBets(null)
    setStack((s) => [...s, { bet, amount: chip }])
  }

  const undo = () => {
    if (locked || !stack.length) return
    rouletteSounds.sweep()
    setStack((s) => s.slice(0, -1))
  }

  const clear = () => {
    if (locked || !stack.length) return
    rouletteSounds.sweep()
    setStack([])
  }

  const rebet = () => {
    if (locked || stack.length || !lastStack.length) return
    const sum = lastStack.reduce((a, s) => a + s.amount, 0)
    if (sum > balance) return toast({ tone: 'error', title: 'Not enough chips to rebet' })
    rouletteSounds.chip()
    setSettledBets(null)
    setStack(lastStack)
  }

  const doubleUp = () => {
    if (locked || !stack.length) return
    if (total * 2 > balance) return toast({ tone: 'error', title: 'Not enough chips to double' })
    rouletteSounds.chip()
    setStack((s) => [...s, ...s])
  }

  // On phones the wheel sits above the table, so bring it into view once the ball is launched.
  const liveSpin = spinning ? round.key : 0
  useEffect(() => {
    if (!liveSpin) return undefined
    const frame = requestAnimationFrame(() => {
      const box = wheelBox.current?.getBoundingClientRect()
      const header = Math.max(0, document.querySelector('header')?.getBoundingClientRect().bottom ?? 72)
      if (box && (box.top < header || box.bottom > window.innerHeight)) {
        window.scrollBy({ top: box.top - header - 8, behavior: reducedMotion() ? 'auto' : 'smooth' })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [liveSpin])

  const startSpin = async () => {
    if (!total || locked) return
    const list = Object.values(bets)
    const played = stack
    let result
    let returned
    let server = null
    if (BACKEND_ENABLED) {
      // The server spins the wheel and pays out; the wheel here just shows the result.
      setAsking(true)
      try {
        server = await playRoulette(list.map((b) => ({ key: b.key, amount: b.amount })))
      } catch (err) {
        return toast({ tone: 'error', title: 'Spin not accepted', description: err.message })
      } finally {
        setAsking(false)
      }
      result = server.result
      returned = roundMoney(Number(server.returned))
    } else {
      result = spin()
      returned = roundMoney(totalReturn(list, result))
    }
    const id = place({
      game: 'roulette',
      staked: total,
      returned,
      detail: `${result} ${colorName(result)} · ${list.length} bet${list.length === 1 ? '' : 's'}`,
    })
    // The server has already played and paid a spin, so take its portfolio and show the spin either way.
    if (server) holdServerPortfolio(server.portfolio)
    if (!id && !server) return toast({ tone: 'error', title: 'Not enough chips' })
    setOutcome(null)
    setSettledBets(null)
    setRound({ key: (round?.key ?? 0) + 1, result, id, staked: total, returned, played, done: false })
  }

  const onSpinDone = () => {
    if (!round || round.done) return
    finish(round.id)
    const next = [round.result, ...recent].slice(0, HISTORY)
    setRecent(next)
    setSpinCount((c) => c + 1)
    writeJSON(RECENT_KEY, next)
    setOutcome({ result: round.result, staked: round.staked, returned: round.returned, key: round.key })
    setRound({ ...round, done: true })
    setSettledBets(combine(round.played))
    setLastStack(round.played)
    setStack([])
    const net = round.returned - round.staked
    if (net > 0) {
      rouletteSounds.win(net >= round.staked * 10)
      if (net >= round.staked) setBurst({ key: round.key, big: net >= round.staked * 10 })
    } else if (round.returned > 0) rouletteSounds.partial()
    else rouletteSounds.lose()
  }

  const toggleQuick = () => {
    setQuick((q) => {
      writeJSON(QUICK_KEY, !q)
      return !q
    })
  }

  useHotkeys({
    ' ': () => startSpin(),
    backspace: undo,
    d: doubleUp,
    r: rebet,
    ...Object.fromEntries(CHIPS.map((v, i) => [String(i + 1), () => setChip(v)])),
  })

  const net = outcome ? roundMoney(outcome.returned - outcome.staked) : 0
  const tableBets = showSettled ? settledBets : bets
  const announce = spinning
    ? 'No more bets. Spinning.'
    : outcome
      ? `${outcome.result} ${colorName(outcome.result)}. ${net > 0 ? `You win ${formatCurrency(net)}.` : outcome.returned > 0 ? `${formatCurrency(outcome.returned)} back.` : 'No win.'}`
      : ''

  return (
    <GameShell game="roulette" title="Roulette" subtitle="European single-zero wheel. 35:1 straight up, 1:1 on red or black." rules={<Rules />}>
      <section className="card relative overflow-hidden" aria-label="Wheel">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgb(232_177_58/0.07),transparent_60%)]" aria-hidden="true" />
        <div className="relative grid items-center gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_16rem] sm:gap-6 sm:p-6">
          <div ref={wheelBox} className="relative mx-auto w-full max-w-[16.5rem] sm:max-w-[23rem]">
            <RouletteWheel
              result={round?.result ?? null}
              spinKey={round?.key ?? 0}
              onDone={onSpinDone}
              settled={Boolean(round?.done)}
              quick={quick}
              className="drop-shadow-[0_18px_30px_rgb(0_0_0/0.6)]"
            />
            {outcome && net > 0 && (
              <span key={outcome.key} className="rt-float pointer-events-none absolute top-[72%] left-1/2 text-2xl font-extrabold whitespace-nowrap text-yes tabular sm:text-3xl" aria-hidden="true">
                +{formatCurrency(net)}
              </span>
            )}
            <ChipBurst burst={burst} />
          </div>
          <div className="space-y-4">
            <Result spinning={spinning} outcome={outcome} />
            <p className="sr-only" aria-live="polite">
              {announce}
            </p>
            <History recent={recent} spinCount={spinCount} />
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-3 sm:p-4" aria-label="Betting table">
        <RouletteTable bets={tableBets} onPlace={placeChip} disabled={locked} winning={showSettled ? (outcome?.result ?? null) : null} settled={showSettled} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <ChipSelector value={chip} onChange={setChip} />
          <div className="ml-auto text-right">
            <p className="text-xs text-muted">Total bet</p>
            <p key={total} className={`text-xl font-bold tabular ${total ? 'animate-chip-pop' : 'text-subtle'}`}>
              {formatCurrency(total)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-ghost px-3 sm:px-4" disabled={locked || !stack.length} onClick={undo}>
            Undo
          </button>
          <button type="button" className="btn btn-ghost px-3 sm:px-4" disabled={locked || !stack.length} onClick={clear}>
            Clear
          </button>
          <button type="button" className="btn btn-ghost px-3 sm:px-4" disabled={locked || !stack.length} onClick={doubleUp}>
            Double
          </button>
          <button type="button" className="btn btn-ghost px-3 sm:px-4" disabled={locked || stack.length > 0 || !lastStack.length} onClick={rebet}>
            Rebet
          </button>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted select-none">
            <input type="checkbox" role="switch" checked={quick} onChange={toggleQuick} className="peer sr-only" />
            <span
              className="relative h-5 w-9 rounded-full bg-surface-3 ring-1 ring-line transition peer-checked:bg-primary-500 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-300 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4"
              aria-hidden="true"
            />
            Quick spin
          </label>
          <button
            type="button"
            className="btn btn-primary h-12 w-full px-8 text-base shadow-[0_8px_24px_-8px_rgb(181_42_44/0.8)] sm:w-auto sm:min-w-40"
            disabled={locked || !total}
            onClick={startSpin}
          >
            {locked ? 'Spinning…' : total ? `Spin ${formatCurrency(total)}` : 'Spin'}
            {!locked && <kbd className={kbdClass}>Space</kbd>}
          </button>
        </div>
      </section>
    </GameShell>
  )
}
