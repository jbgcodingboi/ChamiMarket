import { useEffect, useRef, useState } from 'react'
import BetAmount from '../../components/games/BetAmount.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import { useSpaceToPlay } from '../../components/games/limbo/fx.js'
import { Confetti, HistoryStrip, WinPop } from '../../components/games/limbo/GameFx.jsx'
import { bucketColor, multLabel } from '../../components/games/plinko/colors.js'
import PlinkoBoard from '../../components/games/plinko/PlinkoBoard.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { bucketOf, bucketProbability, dropPath, expectedReturn, MULTIPLIERS, RISKS, ROW_OPTIONS } from '../../games/plinko.js'
import { plinkoSounds } from '../../games/sounds/plinko.js'
import { playPlinko } from '../../services/backend/api.js'
import { BACKEND_ENABLED } from '../../services/backend/config.js'
import { finish, holdServerPortfolio, place, useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { formatCurrency, formatSignedCurrency, pnlTone } from '../../utils/format.js'
import './plinko.css'

const AUTO_OPTIONS = [1, 5, 10, 25]
const AUTO_GAP_MS = 240
const RISK_LABEL = { low: 'Low', medium: 'Medium', high: 'High' }
/** Landing in a bucket at or above this pays out with confetti. */
const BIG_WIN = 10

function Segmented({ label, options, value, onChange, disabled, format = String }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-1.5 grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            disabled={disabled}
            onClick={() => onChange(o)}
            className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${o === value ? 'bg-surface-3 text-fg shadow' : 'text-muted hover:text-fg'}`}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  )
}

function Rules({ rows, risk }) {
  const table = MULTIPLIERS[rows][risk]
  return (
    <>
      <p>
        Each ball bounces off a pin on every row, going left or right with equal chance, and lands in one of {rows + 1} buckets. Edge buckets are rare and pay
        the most; the middle ones are common and pay less. Higher risk spreads the payouts out: bigger edges, smaller middles.
      </p>
      <p>
        Every setting returns about {(expectedReturn(rows, risk) * 100).toFixed(1)}% of what you bet over the long run. Chances for {rows} rows, {RISK_LABEL[risk].toLowerCase()} risk:
      </p>
      <div className="grid grid-cols-3 gap-1 text-xs sm:grid-cols-5">
        {table.map((m, k) =>
          k <= rows / 2 ? (
            <div key={k} className="rounded-md bg-surface-2 px-2 py-1">
              <span className="font-semibold text-fg tabular">{m}×</span>{' '}
              <span className="tabular">{(bucketProbability(rows, k) * 2 * (k === rows / 2 ? 0.5 : 1) * 100).toPrecision(2)}%</span>
            </div>
          ) : null,
        )}
      </div>
      <p className="text-xs">Each pair of matching edge buckets is counted together.</p>
      <p className="text-xs">Tip: press Space to drop when you are not typing in a box.</p>
    </>
  )
}

export default function PlinkoPage() {
  useDocumentTitle('Plinko')
  const balance = useChips()
  const board = useRef(null)
  const auto = useRef(null)
  const queued = useRef([])
  const [betText, setBetText] = useState('10')
  const bet = roundMoney(Number(betText) || 0)
  const [rows, setRows] = useState(16)
  const [risk, setRisk] = useState('medium')
  const [count, setCount] = useState(1)
  const [inFlight, setInFlight] = useState(0)
  const [results, setResults] = useState([])
  const [dropping, setDropping] = useState(false)
  const [batch, setBatch] = useState(null)
  const [pop, setPop] = useState(null)
  const [burst, setBurst] = useState({ n: 0, x: 50 })
  const multipliers = MULTIPLIERS[rows][risk]
  const locked = inFlight > 0 || dropping

  useEffect(() => () => clearInterval(auto.current), [])

  /** Drops one ball: a fresh random path, or one the server already played (backend mode). */
  const dropOne = (played) => {
    const path = played?.path ?? dropPath(rows)
    const bucket = bucketOf(path)
    const mult = multipliers[bucket]
    const returned = played ? roundMoney(Number(played.returned)) : roundMoney(bet * mult)
    const id = place({ game: 'plinko', staked: bet, returned, detail: `${mult}× · ${rows} rows, ${RISK_LABEL[risk].toLowerCase()} risk` })
    if (!id) return false
    setInFlight((n) => n + 1)
    plinkoSounds.drop()
    board.current?.drop({ id, path })
    return true
  }

  /** Backend mode: the server plays every ball at once; they are then dropped here one by one. */
  const startRemote = async () => {
    setDropping(true)
    let res
    try {
      res = await playPlinko({ amount: bet, rows, risk, balls: count })
    } catch (err) {
      setDropping(false)
      return toast({ tone: 'error', title: 'Drop not accepted', description: err.message })
    }
    const queue = [...res.balls]
    queued.current = queue
    const next = () => {
      const ball = queue.shift()
      if (ball) dropOne(ball)
      if (!queue.length) {
        clearInterval(auto.current)
        setDropping(false)
      }
    }
    next()
    holdServerPortfolio(res.portfolio)
    if (queue.length) auto.current = setInterval(next, AUTO_GAP_MS)
  }

  const start = () => {
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    if (bet > balance) return toast({ tone: 'error', title: 'Not enough chips', description: `Your balance is ${formatCurrency(balance)}.` })
    // A new drop starts a new tally once the last one has fully landed.
    setBatch((b) => (b && !locked ? null : b))
    if (BACKEND_ENABLED) {
      if (bet * count > balance) return toast({ tone: 'error', title: 'Not enough chips', description: `${count} balls need ${formatCurrency(bet * count)}.` })
      return startRemote()
    }
    if (!dropOne()) return
    if (count === 1) return
    let left = count - 1
    setDropping(true)
    auto.current = setInterval(() => {
      if (!left || !dropOne()) {
        clearInterval(auto.current)
        setDropping(false)
        if (left) toast({ tone: 'info', title: 'Out of chips', description: `Stopped with ${left} ball${left === 1 ? '' : 's'} left.` })
        return
      }
      left -= 1
      if (!left) {
        clearInterval(auto.current)
        setDropping(false)
      }
    }, AUTO_GAP_MS)
  }

  const stop = () => {
    clearInterval(auto.current)
    setDropping(false)
    // Backend mode: the server already played the rest, so drop them all now.
    const rest = queued.current.splice(0)
    for (const ball of rest) dropOne(ball)
  }

  const onLand = (id, bucket) => {
    const entry = finish(id)
    setInFlight((n) => Math.max(0, n - 1))
    const mult = multipliers[bucket]
    plinkoSounds.land(mult)
    if (!entry) return
    setResults((r) => [{ id: entry.id, mult, bucket, rows }, ...r].slice(0, 24))
    setBatch((b) => ({ balls: (b?.balls ?? 0) + 1, net: roundMoney((b?.net ?? 0) + entry.net), best: Math.max(b?.best ?? 0, mult) }))
    if (mult > 1) setPop({ id: entry.id, text: `${multLabel(mult)}× · +${formatCurrency(roundMoney(entry.net))}` })
    if (mult >= BIG_WIN) setBurst((b) => ({ n: b.n + 1, x: 50 + ((bucket - rows / 2) / (rows + 1.7)) * 100 }))
  }

  useSpaceToPlay(() => {
    if (dropping) stop()
    else if (bet >= 0.1 && bet <= balance) start()
  })

  const history = results.map((r) => {
    const c = bucketColor(r.bucket, r.rows)
    return { key: r.id, text: `${multLabel(r.mult)}×`, style: { background: c.fill, color: c.text } }
  })
  const lastResult = results[0]

  const mainButton = dropping ? (
    <button type="button" className="btn btn-ghost w-full py-3 text-base" onClick={stop}>
      Stop
    </button>
  ) : (
    <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={start} disabled={!(bet > 0) || bet > balance}>
      {count === 1 ? 'Drop ball' : `Drop ${count} balls`}
    </button>
  )

  return (
    <GameShell game="plinko" title="Plinko" subtitle="Drop a ball through the pins. Pick your rows and risk level." rules={<Rules rows={rows} risk={risk} />}>
      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <section className="card order-2 flex flex-col gap-4 p-4 md:order-1" aria-label="Plinko controls">
          <BetAmount label="Bet per ball" value={betText} onChange={setBetText} balance={balance} disabled={dropping} />
          <Segmented label="Risk" options={RISKS} value={risk} onChange={setRisk} disabled={locked} format={(r) => RISK_LABEL[r]} />
          <Segmented label="Rows" options={ROW_OPTIONS} value={rows} onChange={setRows} disabled={locked} />
          <Segmented label="Balls" options={AUTO_OPTIONS} value={count} onChange={setCount} disabled={dropping} />
          <div className="max-md:order-first">{mainButton}</div>
          <p className="text-xs text-subtle">
            {count > 1 ? `Total ${formatCurrency(bet * count)}. ` : ''}
            {locked ? 'Rows and risk unlock when every ball has landed.' : `Top prize: ${multLabel(multipliers[0])}× your bet.`}
          </p>
        </section>

        <section className="card order-1 min-w-0 overflow-hidden p-3 sm:p-4 md:order-2" aria-label="Plinko board">
          <div className="flex items-center justify-between gap-3 px-1">
            <HistoryStrip items={history} empty="Results show up here." />
            <div className="pdl-tools shrink-0">
              <SoundToggle />
            </div>
          </div>
          <div className="plinko-stage relative mt-3 rounded-xl px-1 pt-3 pb-2">
            <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
              <WinPop pop={pop} />
            </div>
            <PlinkoBoard ref={board} rows={rows} multipliers={multipliers} onLand={onLand} onPeg={plinkoSounds.peg} />
            <Confetti burst={burst.n} x={burst.x} y={88} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-surface-2 px-2 py-1.5">
              <dt className="text-[11px] text-muted">Last ball</dt>
              <dd className="font-semibold tabular">{lastResult ? `${multLabel(lastResult.mult)}×` : '–'}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 px-2 py-1.5">
              <dt className="text-[11px] text-muted">{inFlight ? `In play · ${inFlight}` : 'This drop'}</dt>
              <dd className={`font-semibold tabular ${pnlTone(batch?.net ?? 0)}`}>{batch ? formatSignedCurrency(batch.net) : '–'}</dd>
            </div>
            <div className="rounded-lg bg-surface-2 px-2 py-1.5">
              <dt className="text-[11px] text-muted">Best</dt>
              <dd className="font-semibold tabular">{batch ? `${multLabel(batch.best)}×` : '–'}</dd>
            </div>
          </dl>
          <p className="sr-only" aria-live="polite">
            {lastResult ? `Ball landed on ${lastResult.mult}×.` : ''}
          </p>
        </section>
      </div>
    </GameShell>
  )
}
