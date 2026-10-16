import { useEffect, useRef, useState } from 'react'
import GameShell from '../../components/games/GameShell.jsx'
import PlinkoBoard from '../../components/games/plinko/PlinkoBoard.jsx'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { bucketOf, bucketProbability, dropPath, expectedReturn, MULTIPLIERS, RISKS, ROW_OPTIONS } from '../../games/plinko.js'
import { useGameStore } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { roundMoney } from '../../utils/math.js'
import { formatCurrency } from '../../utils/format.js'

const AUTO_OPTIONS = [1, 5, 10, 25]
const AUTO_GAP_MS = 240
const RISK_LABEL = { low: 'Low', medium: 'Medium', high: 'High' }

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
    </>
  )
}

export default function PlinkoPage() {
  useDocumentTitle('Plinko')
  const balance = useGameStore((s) => s.wallet.balance)
  const place = useGameStore((s) => s.place)
  const finish = useGameStore((s) => s.finish)
  const board = useRef(null)
  const auto = useRef(null)
  const [betText, setBetText] = useState('10')
  const bet = roundMoney(Number(betText) || 0)
  const [rows, setRows] = useState(16)
  const [risk, setRisk] = useState('medium')
  const [count, setCount] = useState(1)
  const [inFlight, setInFlight] = useState(0)
  const [results, setResults] = useState([])
  const [dropping, setDropping] = useState(false)
  const multipliers = MULTIPLIERS[rows][risk]
  const locked = inFlight > 0 || dropping

  useEffect(() => () => clearInterval(auto.current), [])

  const dropOne = () => {
    const path = dropPath(rows)
    const bucket = bucketOf(path)
    const mult = multipliers[bucket]
    const id = place({ game: 'plinko', staked: bet, returned: roundMoney(bet * mult), detail: `${mult}× · ${rows} rows, ${RISK_LABEL[risk].toLowerCase()} risk` })
    if (!id) return false
    setInFlight((n) => n + 1)
    board.current?.drop({ id, path })
    return true
  }

  const start = () => {
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    if (bet > balance) return toast({ tone: 'error', title: 'Not enough chips', description: `Your balance is ${formatCurrency(balance)}.` })
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
  }

  const onLand = (id, bucket) => {
    const entry = finish(id)
    setInFlight((n) => Math.max(0, n - 1))
    if (entry) setResults((r) => [{ id: entry.id, mult: multipliers[bucket], net: entry.net }, ...r].slice(0, 12))
  }

  const setBetSafe = (v) => setBetText(String(Math.max(0, roundMoney(v))))

  return (
    <GameShell game="plinko" title="Plinko" subtitle="Drop a ball through the pins. Pick your rows and risk level." rules={<Rules rows={rows} risk={risk} />}>
      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <section className="card order-2 space-y-4 p-4 md:order-1" aria-label="Plinko controls">
          <div>
            <label htmlFor="plinko-bet" className="text-xs font-medium text-muted">
              Bet per ball
            </label>
            <div className="mt-1.5 flex gap-1">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">$</span>
                <input
                  id="plinko-bet"
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  step="1"
                  className="input pl-6 tabular"
                  value={betText}
                  onChange={(e) => setBetText(e.target.value)}
                />
              </div>
              <button type="button" className="btn btn-ghost px-2.5" onClick={() => setBetSafe(bet / 2)}>
                ½
              </button>
              <button type="button" className="btn btn-ghost px-2.5" onClick={() => setBetSafe(Math.min(bet * 2, balance))}>
                2×
              </button>
            </div>
          </div>
          <Segmented label="Risk" options={RISKS} value={risk} onChange={setRisk} disabled={locked} format={(r) => RISK_LABEL[r]} />
          <Segmented label="Rows" options={ROW_OPTIONS} value={rows} onChange={setRows} disabled={locked} />
          <Segmented label="Balls" options={AUTO_OPTIONS} value={count} onChange={setCount} disabled={dropping} />
          {dropping ? (
            <button type="button" className="btn btn-ghost w-full" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={start} disabled={!(bet > 0) || bet > balance}>
              {count === 1 ? 'Drop ball' : `Drop ${count} balls`}
            </button>
          )}
          <p className="text-xs text-subtle">
            {count > 1 ? `Total ${formatCurrency(bet * count)}. ` : ''}
            {locked ? 'Rows and risk unlock when every ball has landed.' : `Top prize: ${multipliers[0]}× your bet.`}
          </p>
        </section>

        <section className="card order-1 overflow-hidden p-3 md:order-2" aria-label="Plinko board">
          <div className="rounded-xl bg-[radial-gradient(ellipse_at_top,rgb(141_25_26/0.35),transparent_70%)] px-1 pt-2 pb-1">
            <PlinkoBoard ref={board} rows={rows} multipliers={multipliers} onLand={onLand} />
          </div>
          <div className="mt-3 flex min-h-8 flex-wrap items-center gap-1.5" aria-live="polite" aria-label="Recent results">
            {results.length ? (
              results.map((r, i) => (
                <span
                  key={r.id}
                  className={`rounded-md px-2 py-1 text-xs font-bold tabular ${i === 0 ? 'animate-chip-pop' : ''} ${
                    r.mult >= 2 ? 'bg-warn text-black' : r.mult >= 1 ? 'bg-yes-soft text-yes' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {r.mult}×
                </span>
              ))
            ) : (
              <span className="text-xs text-subtle">Results show up here.</span>
            )}
          </div>
        </section>
      </div>
    </GameShell>
  )
}
