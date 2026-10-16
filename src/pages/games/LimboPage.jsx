import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AutoSettings } from '../../components/games/AutoBet.jsx'
import BetAmount from '../../components/games/BetAmount.jsx'
import FairnessButton from '../../components/games/FairnessPanel.jsx'
import GameShell from '../../components/games/GameShell.jsx'
import ModeTabs from '../../components/games/ModeTabs.jsx'
import SoundToggle from '../../components/games/SoundToggle.jsx'
import { DEFAULT_AUTO, useAutoBet } from '../../components/games/useAutoBet.js'
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js'
import { clampTarget, formatMult, MAX_RESULT, MIN_TARGET, multiplierAt, RTP, targetForChance, winChance } from '../../games/limbo.js'
import { sounds } from '../../games/sound.js'
import { crashApi, limboDetail, playLimbo } from '../../services/games/limbo.js'
import { useAccountStore } from '../../store/accountStore.js'
import { finish, holdServerPortfolio, place, useChips } from '../../store/gameStore.js'
import { toast } from '../../store/toastStore.js'
import { formatCurrency } from '../../utils/format.js'
import { roundMoney } from '../../utils/math.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const cash = () => useAccountStore.getState().portfolio?.cash ?? 0

function Rules({ crash }) {
  return (
    <>
      {crash ? (
        <p>
          Place a bet and the multiplier starts climbing from 1.00×. Cash out whenever you like to win your bet times the multiplier at that moment. If it
          crashes first, the bet is lost. Set an auto cash-out to bank a win the moment the multiplier reaches it.
        </p>
      ) : (
        <p>
          Pick a target multiplier, then bet. Each round draws a result from 1.00× up to {MAX_RESULT.toLocaleString('en-US')}×. If the result reaches your
          target you win your bet times the target; if not, the bet is lost. The higher the target, the lower the chance.
        </p>
      )}
      <p>
        Both modes use the same draw: the chance of reaching any multiplier x is {RTP}% ÷ x, so every target or cash-out returns {RTP}% over the long run (a 1%
        house edge). A 2× target wins 49.5% of the time, a 10× target 9.9%.
      </p>
      <p>Every result is provably fair: it comes from your seeds, and the Fairness panel recomputes past rounds.</p>
    </>
  )
}

function GameSwitch({ crash }) {
  const item = (to, label, on) => (
    <Link
      to={to}
      aria-current={on ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${on ? 'bg-surface-3 text-fg shadow' : 'text-muted hover:text-fg'}`}
    >
      {label}
    </Link>
  )
  return (
    <nav aria-label="Game" className="inline-flex gap-1 rounded-xl bg-surface-2 p-1">
      {item('/games/limbo', 'Limbo', !crash)}
      {item('/games/crash', 'Crash', crash)}
    </nav>
  )
}

function Recent({ items }) {
  return (
    <div className="flex min-h-8 flex-wrap gap-1.5" aria-label="Recent results">
      {items.map((r, i) => (
        <span key={r.key} className={`rounded-md px-2 py-1 font-mono text-xs font-bold ${i === 0 ? 'animate-chip-pop' : ''} ${r.win ? 'bg-yes text-black' : 'bg-surface-3 text-muted'}`}>
          {formatMult(r.value)}
        </span>
      ))}
    </div>
  )
}

// Limbo ---------------------------------------------------------------------------

function LimboGame() {
  const balance = useChips()
  const [betText, setBetText] = useState('10')
  const [target, setTarget] = useState(2)
  const [targetText, setTargetText] = useState(null)
  const [chanceText, setChanceText] = useState(null)
  const [mode, setMode] = useState('manual')
  const [auto, setAuto] = useState(DEFAULT_AUTO)
  const [shown, setShown] = useState(null)
  const [last, setLast] = useState(null)
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const runner = useAutoBet()
  const busyRef = useRef(false)
  const bet = roundMoney(Number(betText) || 0)
  const locked = busy || runner.running

  /** Counts the number up to the result, then pays. */
  const playOnce = async (amount, quick) => {
    if (!(amount >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
    if (amount > cash() + 1e-9) throw new Error(`Your balance is ${formatCurrency(cash())}.`)
    const res = await playLimbo({ amount, target })
    const id = place({ game: 'limbo', staked: amount, returned: res.payout, detail: limboDetail(res) })
    if (res.portfolio) holdServerPortfolio(res.portfolio)
    if (!id && !res.portfolio) throw new Error('Not enough chips.')
    setLast(null)
    const steps = quick ? 6 : 14
    for (let i = 1; i <= steps; i++) {
      // Ease out from 1.00× towards the result.
      const p = 1 - (1 - i / steps) ** 3
      setShown(Math.max(1, Math.floor((1 + (res.result - 1) * p) * 100) / 100))
      await sleep(quick ? 12 : 22)
    }
    setShown(res.result)
    setLast(res)
    setRecent((r) => [{ value: res.result, win: res.win, key: `${res.nonce}-${Date.now()}` }, ...r].slice(0, 12))
    if (res.win) sounds.gem()
    else sounds.click()
    if (id) finish(id)
    return { net: roundMoney(res.payout - amount) }
  }

  const betManual = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await playOnce(bet, false)
    } catch (err) {
      toast({ tone: 'error', title: 'Bet not placed', description: err.message })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const startAuto = () => {
    if (!(bet >= 0.1)) return toast({ tone: 'error', title: 'Enter a bet of at least $0.10' })
    runner.start({ settings: auto, baseBet: bet, play: (amount) => playOnce(amount, true), balance: cash, gapMs: 120 })
  }

  const chance = winChance(target)
  return (
    <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
      <section className="card order-2 space-y-4 p-4 md:order-1" aria-label="Limbo controls">
        <ModeTabs value={mode} onChange={setMode} disabled={runner.running} />
        <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={locked} />
        <div>
          <p className="text-xs font-medium text-muted">Profit on win</p>
          <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 font-semibold text-yes tabular">{formatCurrency(roundMoney(bet * target - bet))}</p>
        </div>
        {mode === 'manual' ? (
          <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={betManual} disabled={locked || !(bet >= 0.1) || bet > balance}>
            {busy ? 'Drawing…' : 'Bet'}
          </button>
        ) : (
          <AutoSettings settings={auto} onChange={setAuto} disabled={runner.running} stats={runner.stats} running={runner.running}>
            {runner.running ? (
              <button type="button" className="btn btn-ghost w-full py-3" onClick={runner.stop}>
                Stop autobet
              </button>
            ) : (
              <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={startAuto} disabled={!(bet >= 0.1) || bet > balance}>
                Start autobet
              </button>
            )}
          </AutoSettings>
        )}
      </section>

      <section className="card order-1 space-y-5 p-4 sm:p-6 md:order-2" aria-label="Limbo">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <GameSwitch crash={false} />
          <div className="flex shrink-0 gap-2">
            <FairnessButton game="limbo" />
            <SoundToggle />
          </div>
        </div>
        <Recent items={recent} />
        <div className="felt flex h-56 flex-col items-center justify-center rounded-2xl sm:h-64" aria-live="polite">
          <p
            className={`font-mono text-6xl font-black tabular transition-colors sm:text-7xl ${last ? (last.win ? 'text-yes' : 'text-no') : 'text-fg'}`}
            aria-label={last ? `Result ${formatMult(last.result)}, ${last.win ? 'win' : 'loss'}` : undefined}
          >
            {formatMult(shown ?? 1)}
          </p>
          <p className="mt-2 text-sm text-white/70">Target {formatMult(target)}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted">Target multiplier</span>
            <div className="relative mt-1.5">
              <input
                type="number"
                min={MIN_TARGET}
                max={MAX_RESULT}
                step="0.01"
                className="input pr-7 tabular"
                value={targetText ?? target}
                disabled={locked}
                onChange={(e) => setTargetText(e.target.value)}
                onBlur={() => {
                  if (targetText !== null && Number(targetText) > 0) setTarget(clampTarget(targetText))
                  setTargetText(null)
                }}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">×</span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted">Win chance</span>
            <div className="relative mt-1.5">
              <input
                type="number"
                min="0.0001"
                max="98.0198"
                step="0.01"
                className="input pr-7 tabular"
                value={chanceText ?? chance}
                disabled={locked}
                onChange={(e) => setChanceText(e.target.value)}
                onBlur={() => {
                  const c = Number(chanceText)
                  if (c > 0) setTarget(targetForChance(Math.min(98.0198, c)))
                  setChanceText(null)
                }}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>
            </div>
          </label>
        </div>
      </section>
    </div>
  )
}

// Crash ---------------------------------------------------------------------------

const W = 600
const H = 300

/** The rising curve: time across, multiplier up, both axes stretching as it climbs. */
function CrashChart({ elapsed, mult, phase, result }) {
  const tMax = Math.max(8000, elapsed * 1.15)
  const mMax = Math.max(2, mult * 1.15)
  const x = (t) => 40 + (t / tMax) * (W - 60)
  const y = (m) => H - 30 - ((m - 1) / (mMax - 1)) * (H - 60)
  const points = []
  for (let i = 0; i <= 60; i++) {
    const t = (elapsed * i) / 60
    points.push(`${x(t).toFixed(1)},${y(Math.min(mult, Math.exp(0.00006 * t))).toFixed(1)}`)
  }
  const crashed = phase === 'done' && !result?.win
  const cashed = phase === 'done' && result?.win
  const ticks = [1, 1 + (mMax - 1) / 3, 1 + (2 * (mMax - 1)) / 3, mMax]
  return (
    <div className="felt relative overflow-hidden rounded-2xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Multiplier ${formatMult(mult)}`}>
        {ticks.map((m) => (
          <g key={m}>
            <line x1="40" x2={W - 20} y1={y(m)} y2={y(m)} stroke="rgba(255,255,255,0.08)" />
            <text x="34" y={y(m) + 4} textAnchor="end" fontSize="11" fill="rgba(255,255,255,0.45)">
              {m.toFixed(m < 10 ? 1 : 0)}×
            </text>
          </g>
        ))}
        {elapsed > 0 && (
          <>
            <polygon points={`${x(0)},${y(1)} ${points.join(' ')} ${x(elapsed)},${y(1)}`} fill={crashed ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'} />
            <polyline points={points.join(' ')} fill="none" stroke={crashed ? '#ef4444' : '#22c55e'} strokeWidth="4" strokeLinecap="round" />
            <circle cx={x(elapsed)} cy={y(mult)} r="7" fill={crashed ? '#ef4444' : '#fbbf24'} />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-live="polite">
        <p className={`font-mono text-5xl font-black tabular sm:text-6xl ${crashed ? 'text-no' : cashed ? 'text-yes' : 'text-white'}`}>{formatMult(mult)}</p>
        {crashed && <p className="mt-1 text-sm font-semibold text-no">Crashed</p>}
        {cashed && (
          <p className="mt-1 text-sm font-semibold text-yes">
            Cashed out at {formatMult(result.cashout)} · crashed at {formatMult(result.crash)}
          </p>
        )}
        {phase === 'idle' && <p className="mt-1 text-sm text-white/70">Place a bet to launch</p>}
      </div>
    </div>
  )
}

function CrashGame() {
  const balance = useChips()
  const [betText, setBetText] = useState('10')
  const [autoText, setAutoText] = useState('')
  const [round, setRound] = useState({ phase: 'idle' })
  const [elapsed, setElapsed] = useState(0)
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const sync = useRef({ elapsed: 0, at: 0 })
  const phase = useRef('idle')
  const bet = roundMoney(Number(betText) || 0)
  const autoAt = Number(autoText) >= MIN_TARGET ? clampTarget(autoText) : null
  const playing = round.phase === 'playing'

  const take = (r) => {
    sync.current = { elapsed: r.elapsed ?? 0, at: performance.now() }
    if (r.phase === 'done' && phase.current === 'playing') {
      if (r.result.win) sounds.win()
      else sounds.lose()
      setRecent((list) => [{ value: r.result.crash, win: r.result.win, key: `${r.nonce}-${Date.now()}` }, ...list].slice(0, 12))
    }
    phase.current = r.phase
    setRound(r)
    if (r.phase === 'done') setElapsed(Math.max(0, r.elapsed ?? 0))
  }

  // Picks up a round left running (after a reload, say).
  useEffect(() => {
    crashApi.state().then(take, () => {})
  }, [])

  // While a round runs: draw the curve every frame, ask the server about every 300 ms.
  useEffect(() => {
    if (!playing) return undefined
    let raf
    const frame = () => {
      setElapsed(sync.current.elapsed + (performance.now() - sync.current.at))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    let running = true
    const poll = async () => {
      while (running) {
        await sleep(300)
        if (!running) break
        try {
          const r = await crashApi.state()
          if (running) take(r)
          if (r.phase !== 'playing') break
        } catch {
          // Try again on the next tick.
        }
      }
    }
    poll()
    return () => {
      running = false
      cancelAnimationFrame(raf)
    }
  }, [playing])

  const launch = async () => {
    setBusy(true)
    try {
      if (!(bet >= 0.1)) throw new Error('Enter a bet of at least $0.10.')
      if (bet > cash() + 1e-9) throw new Error(`Your balance is ${formatCurrency(cash())}.`)
      const r = await crashApi.start({ amount: bet, auto: autoAt })
      sounds.click()
      setElapsed(0)
      take(r)
    } catch (err) {
      toast({ tone: 'error', title: 'Bet not placed', description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const cashout = async () => {
    setBusy(true)
    try {
      take(await crashApi.cashout())
    } catch (err) {
      toast({ tone: 'error', title: 'Cash-out failed', description: err.message })
    } finally {
      setBusy(false)
    }
  }

  const done = round.phase === 'done'
  const mult = done ? (round.result.win ? round.result.cashout : round.result.crash) : playing ? Math.min(multiplierAt(elapsed), round.auto ?? Infinity) : 1
  return (
    <div className="grid gap-4 md:grid-cols-[17rem_minmax(0,1fr)]">
      <section className="card order-2 space-y-4 p-4 md:order-1" aria-label="Crash controls">
        <BetAmount value={betText} onChange={setBetText} balance={balance} disabled={playing || busy} />
        <label className="block">
          <span className="text-xs font-medium text-muted">Auto cash-out (optional)</span>
          <div className="relative mt-1.5">
            <input
              type="number"
              min={MIN_TARGET}
              max={MAX_RESULT}
              step="0.01"
              placeholder="Off"
              className="input pr-7 tabular"
              value={autoText}
              disabled={playing || busy}
              onChange={(e) => setAutoText(e.target.value)}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">×</span>
          </div>
        </label>
        {playing ? (
          <button type="button" className="btn w-full bg-yes py-3 text-base font-bold text-black hover:brightness-110" onClick={cashout} disabled={busy}>
            Cash out {formatCurrency(roundMoney(round.bet * Math.max(1, mult)))}
          </button>
        ) : (
          <button type="button" className="btn btn-primary w-full py-3 text-base" onClick={launch} disabled={busy || !(bet >= 0.1) || bet > balance}>
            {busy ? 'Launching…' : 'Bet'}
          </button>
        )}
        <p className="text-xs leading-relaxed text-subtle">
          {autoAt ? `Cashes out on its own at ${formatMult(autoAt)}, a ${winChance(autoAt)}% chance.` : 'Cash out by hand before it crashes.'}
        </p>
      </section>

      <section className="card order-1 space-y-5 p-4 sm:p-6 md:order-2" aria-label="Crash">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <GameSwitch crash />
          <div className="flex shrink-0 gap-2">
            <FairnessButton game="crash" />
            <SoundToggle />
          </div>
        </div>
        <Recent items={recent} />
        <CrashChart elapsed={done ? elapsed : playing ? elapsed : 0} mult={mult} phase={round.phase} result={round.result} />
      </section>
    </div>
  )
}

export default function LimboPage({ crash = false }) {
  useDocumentTitle(crash ? 'Crash' : 'Limbo')
  return (
    <GameShell
      game={crash ? 'crash' : 'limbo'}
      title={crash ? 'Crash' : 'Limbo'}
      subtitle={crash ? 'Watch the multiplier climb and cash out before it crashes.' : 'Pick a target multiplier and hope the draw reaches it.'}
      rules={<Rules crash={crash} />}
    >
      {crash ? <CrashGame /> : <LimboGame />}
    </GameShell>
  )
}
